import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { NextRequest } from 'next/server'
import type { SessionUser } from '@/lib/auth/types'
import { AdvanceError } from '@/lib/advances/errors'
import { SubstituteReceiptError } from '@/lib/substitute-receipts/errors'

/**
 * สิทธิ์ของ endpoint เอกสารเงินทดรอง + ใบรับรองแทนใบเสร็จ (มติ PO U100/U103)
 * - ไม่มี capability ฝั่งเบิก/อนุมัติเลย → 403 (ไม่ถึงชั้นข้อมูล)
 * - มี capability แต่ไม่ใช่เจ้าของ/การเงิน → ชั้นข้อมูลตอบไม่พบ → **404** (ไม่ leak)
 * - เจ้าของ/การเงิน → ได้ PDF + ลง audit export
 */

const requireSessionMock = vi.hoisted(() => vi.fn())
vi.mock('@/lib/auth/session', () => ({ requireSession: requireSessionMock }))

const auditMock = vi.hoisted(() => ({ emitDocumentExportAudit: vi.fn() }))
vi.mock('@/lib/audit/audit', () => auditMock)
vi.mock('@/lib/organization/letterhead', async () => (await import('@/tests/helpers/letterhead')).fakeLetterheadModule())

const receiptQueries = vi.hoisted(() => ({
  getSubstituteReceiptSource: vi.fn(),
  toSubstituteReceiptDocSource: vi.fn(),
  attachSignedSubstituteReceipt: vi.fn(),
  cancelSubstituteReceipt: vi.fn(),
  reissueSubstituteReceipt: vi.fn(),
  SUBSTITUTE_RECEIPT_CAPABILITIES: [
    'perform_field_work',
    'request_advance',
    'approve_advance',
    'approve_expense_manager',
    'approve_expense_finance',
    'approve_expense_executive',
  ],
}))
vi.mock('@/lib/substitute-receipts/queries', () => receiptQueries)

const advanceDocQueries = vi.hoisted(() => ({ getAdvanceRequestDocSource: vi.fn(), getAdvanceReturnDocSource: vi.fn() }))
vi.mock('@/lib/advances/doc-queries', () => advanceDocQueries)
vi.mock('@/lib/advances/queries', () => ({ APPROVE_ADVANCE: 'approve_advance', REQUEST_ADVANCE: 'request_advance' }))

const { GET: getCrtPdf } = await import('@/app/api/substitute-receipts/[id]/pdf/route')
const { POST: postSigned } = await import('@/app/api/substitute-receipts/[id]/signed/route')
const { POST: postCancel } = await import('@/app/api/substitute-receipts/[id]/cancel/route')
const { POST: postReissue } = await import('@/app/api/substitute-receipts/[id]/reissue/route')
const { GET: getAdvancePdf } = await import('@/app/api/advances/[id]/pdf/route')

const ID = '00000000-0000-4000-8000-0000000c7a01'
const params = { params: Promise.resolve({ id: ID }) }

function userOf(capabilities: SessionUser['capabilities']): SessionUser {
  return {
    id: 'user-1',
    organizationId: 'org-1',
    supabaseUid: 'uid-1',
    email: 'u@example.com',
    fullName: 'ผู้ใช้',
    status: 'active',
    roleId: 'role-1',
    roleName: 'ทดสอบ',
    roleGroup: 'system',
    isSuperadmin: false,
    teamId: null,
    companyId: null,
    capabilities,
    scope: { kind: 'global', teamIds: [], companyId: null, userId: 'user-1' },
    loginAt: new Date().toISOString(),
  }
}

function request(method: string, body?: unknown): NextRequest {
  const base = new Request(`http://localhost/api/x/${ID}`, {
    method,
    headers: { 'content-type': 'application/json' },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  }) as unknown as NextRequest
  return Object.assign(base, { nextUrl: new URL(base.url) }) as NextRequest
}

const CRT_ROW = { receiptNumber: 'CRT-2569-0001', status: 'pending_signature' }
const CRT_SOURCE = {
  receiptNumber: 'CRT-2569-0001',
  issueDate: new Date('2026-10-06T00:00:00Z'),
  totalSatang: 7_000,
  lines: [{ lineDate: new Date('2026-10-03T00:00:00Z'), description: 'ค่าผ่านทางพิเศษ', amountSatang: 7_000, note: null }],
  payee: {
    fullName: 'สมชาย',
    nameTitle: null,
    phone: null,
    nationalId: null,
    addressDetail: null,
    addressSubdistrict: null,
    addressDistrict: null,
    addressProvince: null,
    addressPostalCode: null,
  },
  teamName: null,
  reference: { label: 'อ้างอิงเงินทดรอง', value: 'ADV-2569-0001' },
}

beforeEach(() => {
  requireSessionMock.mockReset()
  auditMock.emitDocumentExportAudit.mockReset().mockResolvedValue(undefined)
  receiptQueries.getSubstituteReceiptSource.mockReset().mockResolvedValue(CRT_ROW)
  receiptQueries.toSubstituteReceiptDocSource.mockReset().mockReturnValue(CRT_SOURCE)
  receiptQueries.attachSignedSubstituteReceipt.mockReset().mockResolvedValue({ id: ID, status: 'signed' })
  receiptQueries.cancelSubstituteReceipt.mockReset().mockResolvedValue({ id: ID, status: 'cancelled' })
  receiptQueries.reissueSubstituteReceipt.mockReset().mockResolvedValue({ id: 'new-id', status: 'pending_signature' })
  advanceDocQueries.getAdvanceRequestDocSource.mockReset()
})

describe('ไม่มี capability ฝั่งเบิก/อนุมัติ → 403', () => {
  it('ใบรับรอง PDF · อัปโหลดฉบับเซ็น · ใบเบิก PDF', async () => {
    requireSessionMock.mockResolvedValue(userOf({ view_reports: 'view' }))
    expect((await getCrtPdf(request('GET'), params)).status).toBe(403)
    expect((await postSigned(request('POST', { signedFilePath: 'a' }), params)).status).toBe(403)
    expect((await getAdvancePdf(request('GET'), params)).status).toBe(403)
    expect(receiptQueries.getSubstituteReceiptSource).not.toHaveBeenCalled()
  })
})

describe('มี capability แต่นอก scope → 404 (ไม่ leak)', () => {
  it('ใบรับรอง/ใบเบิก ของคนอื่น', async () => {
    requireSessionMock.mockResolvedValue(userOf({ perform_field_work: 'manage', request_advance: 'manage' }))
    receiptQueries.getSubstituteReceiptSource.mockRejectedValue(new SubstituteReceiptError('SUBSTITUTE_RECEIPT_NOT_FOUND'))
    receiptQueries.attachSignedSubstituteReceipt.mockRejectedValue(new SubstituteReceiptError('SUBSTITUTE_RECEIPT_NOT_FOUND'))
    advanceDocQueries.getAdvanceRequestDocSource.mockRejectedValue(new AdvanceError('ADVANCE_NOT_FOUND'))
    expect((await getCrtPdf(request('GET'), params)).status).toBe(404)
    expect((await postSigned(request('POST', { signedFilePath: 'a' }), params)).status).toBe(404)
    expect((await getAdvancePdf(request('GET'), params)).status).toBe(404)
    expect(auditMock.emitDocumentExportAudit).not.toHaveBeenCalled()
  })
})

describe('เจ้าของ/การเงิน', () => {
  it('ได้ PDF ใบรับรอง + audit export', async () => {
    requireSessionMock.mockResolvedValue(userOf({ perform_field_work: 'manage' }))
    const response = await getCrtPdf(request('GET'), params)
    expect(response.status).toBe(200)
    expect(response.headers.get('content-type')).toBe('application/pdf')
    expect(auditMock.emitDocumentExportAudit).toHaveBeenCalledWith(
      expect.objectContaining({ document: 'substitute_receipt_pdf', targetId: ID }),
    )
  }, 30_000)

  it('อัปโหลดฉบับเซ็น: ไม่มี path → 400 ไม่ถึงชั้นข้อมูล · มี path → 200', async () => {
    requireSessionMock.mockResolvedValue(userOf({ approve_advance: 'manage' }))
    expect((await postSigned(request('POST', { signedFilePath: '' }), params)).status).toBe(400)
    expect(receiptQueries.attachSignedSubstituteReceipt).not.toHaveBeenCalled()
    expect((await postSigned(request('POST', { signedFilePath: `substitute-receipts/${ID}/signed/a.pdf` }), params)).status).toBe(200)
  })

  it('ใบเบิกที่ยังไม่อนุมัติ → 400 ADVANCE_INVALID_STATUS', async () => {
    requireSessionMock.mockResolvedValue(userOf({ approve_advance: 'manage' }))
    advanceDocQueries.getAdvanceRequestDocSource.mockResolvedValue({ status: 'pending_approval', advanceNumber: 'ADV-2569-0001' })
    const response = await getAdvancePdf(request('GET'), params)
    expect(response.status).toBe(400)
    expect(((await response.json()) as { error: { code: string } }).error.code).toBe('ADVANCE_INVALID_STATUS')
  })
})

describe('มติ PO U107 — ยกเลิก / ออกใบใหม่แทน', () => {
  const LINES = { lines: [{ lineDate: '2026-10-03', description: 'ค่าผ่านทางพิเศษ', amountSatang: 7_000, note: null }] }

  it('ไม่มี capability ฝั่งเบิก/อนุมัติ → 403 ไม่ถึงชั้นข้อมูล', async () => {
    requireSessionMock.mockResolvedValue(userOf({ view_reports: 'view' }))
    expect((await postCancel(request('POST', { reason: 'กรอกผิดวัน' }), params)).status).toBe(403)
    expect((await postReissue(request('POST', LINES), params)).status).toBe(403)
    expect(receiptQueries.cancelSubstituteReceipt).not.toHaveBeenCalled()
    expect(receiptQueries.reissueSubstituteReceipt).not.toHaveBeenCalled()
  })

  it('นอก scope → 404 · เหตุผลขาด → 400 CANCEL_REQUIRES_REASON · อนุมัติจ่ายแล้ว → 400 NOT_CANCELLABLE', async () => {
    requireSessionMock.mockResolvedValue(userOf({ approve_expense_manager: 'manage' }))
    receiptQueries.cancelSubstituteReceipt.mockRejectedValueOnce(new SubstituteReceiptError('SUBSTITUTE_RECEIPT_NOT_FOUND'))
    expect((await postCancel(request('POST', { reason: 'ขอยกเลิก' }), params)).status).toBe(404)

    receiptQueries.cancelSubstituteReceipt.mockRejectedValueOnce(new SubstituteReceiptError('CANCEL_REQUIRES_REASON'))
    const missing = await postCancel(request('POST', {}), params)
    expect(missing.status).toBe(400)
    expect(((await missing.json()) as { error: { code: string } }).error.code).toBe('CANCEL_REQUIRES_REASON')

    receiptQueries.cancelSubstituteReceipt.mockRejectedValueOnce(
      new SubstituteReceiptError('SUBSTITUTE_RECEIPT_NOT_CANCELLABLE'),
    )
    const paid = await postCancel(request('POST', { reason: 'ขอยกเลิกหลังจ่าย' }), params)
    expect(paid.status).toBe(400)
    expect(((await paid.json()) as { error: { code: string } }).error.code).toBe('SUBSTITUTE_RECEIPT_NOT_CANCELLABLE')
  })

  it('เจ้าของยกเลิกได้ → 200 · ออกใบใหม่: รายการว่าง → 400 ไม่ถึงชั้นข้อมูล · ครบ → 201', async () => {
    requireSessionMock.mockResolvedValue(userOf({ perform_field_work: 'manage' }))
    const cancelled = await postCancel(request('POST', { reason: 'กรอกผิดวัน' }), params)
    expect(cancelled.status).toBe(200)
    expect(receiptQueries.cancelSubstituteReceipt).toHaveBeenCalledWith(expect.anything(), ID, { reason: 'กรอกผิดวัน' })

    expect((await postReissue(request('POST', { lines: [] }), params)).status).toBe(400)
    expect(receiptQueries.reissueSubstituteReceipt).not.toHaveBeenCalled()
    expect((await postReissue(request('POST', LINES), params)).status).toBe(201)
    expect(receiptQueries.reissueSubstituteReceipt).toHaveBeenCalledTimes(1)
  })
})
