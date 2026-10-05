import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { NextRequest } from 'next/server'
import type { SessionUser } from '@/lib/auth/types'

/**
 * มติ PO 05/10/2569 U40/U41 — สิทธิ์ที่ API layer (DEC-002) + validation ของ route ใหม่
 *
 * - 50 ทวิ ลูกค้า: ธุรการ/การเงิน/บัญชี (manage) จัดการได้ · บริหาร (view) ดูได้แต่บันทึกไม่ได้ · ไม่มีสิทธิ์ = 403
 * - เงินรับรอตรวจสอบ: เฉพาะ `manage_bank_reconciliation` ระดับ manage (การเงิน view = 403)
 * - เหตุผลขาด ⇒ `MATCH_NOTE_REQUIRED` · หลักฐาน/ไฟล์ขาด ⇒ `REQUIRED_MISSING` — service ต้องไม่ถูกเรียก
 * - ปลายทางอัปโหลด `customer_wht`/`bank_refund`: ไม่มีสิทธิ์ = 403 · มีสิทธิ์ ⇒ path ประกอบโดย server
 */

const requireSessionMock = vi.hoisted(() => vi.fn())
vi.mock('@/lib/auth/session', () => ({ requireSession: requireSessionMock }))

const customerWhtQueries = vi.hoisted(() => ({
  listCustomerWht: vi.fn(async () => ({ items: [], summary: {}, byCompany: [] })),
  receiveCustomerWht: vi.fn(async () => ({ certificate: { id: 'x' }, warnings: [] })),
  assertCustomerWhtInScope: vi.fn(async () => undefined),
}))
vi.mock('@/lib/customer-wht/queries', () => customerWhtQueries)

const bankQueries = vi.hoisted(() => ({
  MANAGE_BANK_RECONCILIATION: 'manage_bank_reconciliation',
  moveToSuspense: vi.fn(async () => ({ id: 'tx' })),
  refundSuspense: vi.fn(async () => ({ id: 'tx' })),
  assertBankTransactionInScope: vi.fn(async () => undefined),
}))
vi.mock('@/lib/bank-recon/queries', () => bankQueries)

const storageMock = vi.hoisted(() => ({
  SIGNED_DOWNLOAD_TTL_SECONDS: 300,
  downloadUploadedFile: vi.fn(),
  createSignedUpload: vi.fn(async (path: string) => ({ path, token: `token:${path}` })),
  createSignedDownloadUrl: vi.fn(async (path: string) => `https://storage.test/signed/${path}`),
}))
vi.mock('@/lib/uploads/storage', () => storageMock)

const { GET: listRoute } = await import('@/app/api/accounting/customer-wht-certificates/route')
const { PATCH: receiveRoute } = await import('@/app/api/accounting/customer-wht-certificates/[id]/receive/route')
const { PATCH: suspenseRoute } = await import('@/app/api/bank-reconciliation/transactions/[id]/suspense/route')
const { PATCH: refundRoute } = await import('@/app/api/bank-reconciliation/transactions/[id]/refund/route')
const { POST: uploadUrlRoute } = await import('@/app/api/storage/upload-url/route')

const ID = '00000000-0000-4000-8000-0000000040d1'

function userWith(capabilities: Record<string, 'view' | 'manage'>): SessionUser {
  return {
    id: '00000000-0000-4000-8000-0000000040d9',
    organizationId: 'org-1',
    supabaseUid: 'uid-1',
    email: 'u@example.com',
    fullName: 'ผู้ใช้ ทดสอบ',
    status: 'active',
    roleId: 'role-1',
    roleName: 'ทดสอบ',
    roleGroup: 'system',
    isSuperadmin: false,
    teamId: null,
    companyId: null,
    capabilities,
    scope: { kind: 'global', teamIds: [], companyId: null, userId: '00000000-0000-4000-8000-0000000040d9' },
    loginAt: new Date().toISOString(),
  }
}

const ADMIN_OFFICE = userWith({ manage_customer_wht: 'manage', record_admin_data: 'manage' })
const EXECUTIVE = userWith({ manage_customer_wht: 'view' })
const ACCOUNTANT = userWith({ manage_customer_wht: 'manage', manage_bank_reconciliation: 'manage' })
const FINANCE_VIEW_BANK = userWith({ manage_customer_wht: 'manage', manage_bank_reconciliation: 'view' })
const CASE_APPROVER = userWith({ approve_case: 'manage' })

function request(method: string, url: string, body?: unknown): NextRequest {
  const base = new Request(url, {
    method,
    headers: { 'content-type': 'application/json' },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  }) as unknown as NextRequest
  return Object.assign(base, { nextUrl: new URL(url) }) as NextRequest
}

const params = { params: Promise.resolve({ id: ID }) }

async function read(response: Response): Promise<{ status: number; code: string; data: unknown }> {
  const json = (await response.json()) as { error?: { code?: string }; data?: unknown }
  return { status: response.status, code: json.error?.code ?? '', data: json.data }
}

const RECEIVE_BODY = {
  certificateNumber: 'สฟ-2569/0451',
  certificateDate: '2026-08-10',
  whtSatang: 11190,
  filePath: `customer-wht/${ID}/scan.pdf`,
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('U40 — /api/accounting/customer-wht-certificates', () => {
  it('ไม่มีสิทธิ์ ⇒ 403 · service ไม่ถูกเรียก', async () => {
    requireSessionMock.mockResolvedValue(CASE_APPROVER)
    expect((await read(await listRoute(request('GET', 'http://localhost/api/accounting/customer-wht-certificates'), {}))).status).toBe(403)
    expect((await read(await receiveRoute(request('PATCH', `http://localhost/x/${ID}/receive`, RECEIVE_BODY), params))).status).toBe(403)
    expect(customerWhtQueries.listCustomerWht).not.toHaveBeenCalled()
    expect(customerWhtQueries.receiveCustomerWht).not.toHaveBeenCalled()
  })

  it('ธุรการ (manage) ดู + บันทึกรับหนังสือได้ · วันที่แปลงเป็น Date ก่อนถึง service', async () => {
    requireSessionMock.mockResolvedValue(ADMIN_OFFICE)
    const list = await read(
      await listRoute(request('GET', 'http://localhost/api/accounting/customer-wht-certificates?status=pending&age=over_90'), {}),
    )
    expect(list.status).toBe(200)
    expect(customerWhtQueries.listCustomerWht).toHaveBeenCalledWith(ADMIN_OFFICE, {
      status: 'pending',
      age: 'over_90',
      limit: 200,
    })

    const received = await read(await receiveRoute(request('PATCH', `http://localhost/x/${ID}/receive`, RECEIVE_BODY), params))
    expect(received.status).toBe(200)
    const call = customerWhtQueries.receiveCustomerWht.mock.calls[0] as unknown as [unknown, string, { certificateDate: Date }]
    expect(call[1]).toBe(ID)
    expect(call[2].certificateDate).toEqual(new Date('2026-08-10T00:00:00Z'))
  })

  it('บริหาร (view) ดูได้ แต่บันทึกไม่ได้ (403)', async () => {
    requireSessionMock.mockResolvedValue(EXECUTIVE)
    expect((await read(await listRoute(request('GET', 'http://localhost/api/accounting/customer-wht-certificates'), {}))).status).toBe(200)
    expect((await read(await receiveRoute(request('PATCH', `http://localhost/x/${ID}/receive`, RECEIVE_BODY), params))).status).toBe(403)
  })

  it('ไม่แนบไฟล์ / ยอดเป็นทศนิยมบาท / ตัวกรองผิด ⇒ 400 REQUIRED_MISSING', async () => {
    requireSessionMock.mockResolvedValue(ACCOUNTANT)
    for (const body of [
      { ...RECEIVE_BODY, filePath: undefined },
      { ...RECEIVE_BODY, whtSatang: 111.9 },
      { ...RECEIVE_BODY, certificateDate: '10/08/2569' },
    ]) {
      const result = await read(await receiveRoute(request('PATCH', `http://localhost/x/${ID}/receive`, body), params))
      expect(result).toMatchObject({ status: 400, code: 'REQUIRED_MISSING' })
    }
    const bad = await read(await listRoute(request('GET', 'http://localhost/api/accounting/customer-wht-certificates?age=forever'), {}))
    expect(bad.status).toBe(400)
    expect(customerWhtQueries.receiveCustomerWht).not.toHaveBeenCalled()
  })
})

describe('U41 — /api/bank-reconciliation/transactions/:id/suspense · /refund', () => {
  it('การเงิน (กระทบยอดแค่ view) ⇒ 403 ทั้งสอง route', async () => {
    requireSessionMock.mockResolvedValue(FINANCE_VIEW_BANK)
    expect((await read(await suspenseRoute(request('PATCH', `http://localhost/x/${ID}/suspense`, { reason: 'x' }), params))).status).toBe(403)
    expect((await read(await refundRoute(request('PATCH', `http://localhost/x/${ID}/refund`, { reason: 'x' }), params))).status).toBe(403)
    expect(bankQueries.moveToSuspense).not.toHaveBeenCalled()
    expect(bankQueries.refundSuspense).not.toHaveBeenCalled()
  })

  it('ไม่มีเหตุผล ⇒ MATCH_NOTE_REQUIRED · คืนเงินไม่มีหลักฐาน/วันที่ ⇒ REQUIRED_MISSING', async () => {
    requireSessionMock.mockResolvedValue(ACCOUNTANT)
    for (const body of [{}, { reason: '' }, { reason: '   ' }]) {
      expect(await read(await suspenseRoute(request('PATCH', `http://localhost/x/${ID}/suspense`, body), params))).toMatchObject({
        status: 400,
        code: 'MATCH_NOTE_REQUIRED',
      })
      expect(await read(await refundRoute(request('PATCH', `http://localhost/x/${ID}/refund`, body), params))).toMatchObject({
        status: 400,
        code: 'MATCH_NOTE_REQUIRED',
      })
    }
    expect(
      await read(
        await refundRoute(request('PATCH', `http://localhost/x/${ID}/refund`, { reason: 'คืน', refundDate: '2026-08-22' }), params),
      ),
    ).toMatchObject({ status: 400, code: 'REQUIRED_MISSING' })
    expect(bankQueries.moveToSuspense).not.toHaveBeenCalled()
    expect(bankQueries.refundSuspense).not.toHaveBeenCalled()
  })

  it('บัญชี (manage) ⇒ เรียก service พร้อมข้อมูลที่ผ่าน schema', async () => {
    requireSessionMock.mockResolvedValue(ACCOUNTANT)
    expect((await read(await suspenseRoute(request('PATCH', `http://localhost/x/${ID}/suspense`, { reason: ' ไม่ทราบที่มา ' }), params))).status).toBe(200)
    expect(bankQueries.moveToSuspense).toHaveBeenCalledWith(expect.anything(), ID, { reason: 'ไม่ทราบที่มา' })

    const refund = await read(
      await refundRoute(
        request('PATCH', `http://localhost/x/${ID}/refund`, {
          reason: 'คืนตามคำขอ',
          refundDate: '2026-08-22',
          filePath: `bank-transactions/${ID}/refund/slip.pdf`,
        }),
        params,
      ),
    )
    expect(refund.status).toBe(200)
    expect(bankQueries.refundSuspense).toHaveBeenCalledWith(expect.anything(), ID, {
      reason: 'คืนตามคำขอ',
      refundDate: new Date('2026-08-22T00:00:00Z'),
      filePath: `bank-transactions/${ID}/refund/slip.pdf`,
    })
  })
})

describe('U40/U41 — โทเคนอัปโหลดไฟล์ (server ประกอบ path)', () => {
  const upload = (target: unknown) =>
    uploadUrlRoute(request('POST', 'http://localhost/api/storage/upload-url', { target, fileName: 'scan.pdf', sizeBytes: 1000 }))

  it('สแกน 50 ทวิ: ธุรการได้ path ใต้ customer-wht/<id>/ · ไม่มีสิทธิ์ = 403', async () => {
    requireSessionMock.mockResolvedValue(ADMIN_OFFICE)
    const ok = await read(await upload({ kind: 'customer_wht', certificateId: ID }))
    expect(ok.status).toBe(200)
    expect((ok.data as { path: string }).path).toMatch(new RegExp(`^customer-wht/${ID}/[^/]+\\.pdf$`))
    expect(customerWhtQueries.assertCustomerWhtInScope).toHaveBeenCalledWith(ADMIN_OFFICE, ID, { requirePending: true })

    requireSessionMock.mockResolvedValue(EXECUTIVE)
    expect((await read(await upload({ kind: 'customer_wht', certificateId: ID }))).status).toBe(403)
  })

  it('หลักฐานคืนเงิน: บัญชีได้ path ใต้ bank-transactions/<id>/refund/ · การเงิน (view) = 403', async () => {
    requireSessionMock.mockResolvedValue(ACCOUNTANT)
    const ok = await read(await upload({ kind: 'bank_refund', transactionId: ID }))
    expect(ok.status).toBe(200)
    expect((ok.data as { path: string }).path).toMatch(new RegExp(`^bank-transactions/${ID}/refund/[^/]+\\.pdf$`))
    expect(bankQueries.assertBankTransactionInScope).toHaveBeenCalledWith(ACCOUNTANT, ID, { requireSuspense: true })

    requireSessionMock.mockResolvedValue(FINANCE_VIEW_BANK)
    expect((await read(await upload({ kind: 'bank_refund', transactionId: ID }))).status).toBe(403)
  })
})
