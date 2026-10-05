import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { NextRequest } from 'next/server'
import type { SessionUser } from '@/lib/auth/types'
import type { SellerBranchDto } from '@/lib/settings/types'

/**
 * เทสต์ระดับ route ของสาขาผู้ขาย (มติ PO U82 · ม.86/4) — ใช้ `requirePermission()` ตัวจริง (mock แค่ session)
 *  · แก้ได้เฉพาะ `manage_invoice_numbering` (ล็อก Superadmin) · role อื่นแม้ดูได้ก็ PATCH ไม่ได้ (403)
 *  · `reason` บังคับ · รหัสต้องเป็นตัวเลข 5 หลัก ไม่ผ่าน = 400 และไม่แตะชั้นข้อมูล
 * การเขียน DB + audit + snapshot บนใบกำกับ อยู่ใน `lib/sales/sales.db.test.ts`
 */

const requireSessionMock = vi.hoisted(() => vi.fn())
vi.mock('@/lib/auth/session', () => ({ requireSession: requireSessionMock }))

const queriesMock = vi.hoisted(() => ({
  getSellerBranch: vi.fn(),
  updateSellerBranch: vi.fn(),
}))
vi.mock('@/lib/settings/queries/seller-branch', () => queriesMock)

const route = await import('@/app/api/settings/seller-branch/route')

function sessionUser(overrides: Partial<SessionUser>): SessionUser {
  return {
    id: 'user-1',
    organizationId: 'org-1',
    supabaseUid: 'uid-1',
    email: 'user@example.com',
    fullName: 'ผู้ทดสอบ',
    status: 'active',
    roleId: 'role-1',
    roleName: 'บัญชี',
    roleGroup: 'system',
    isSuperadmin: false,
    teamId: null,
    companyId: null,
    capabilities: {},
    scope: { kind: 'global', teamIds: [], companyId: null, userId: 'user-1' },
    loginAt: new Date().toISOString(),
    ...overrides,
  }
}

const SUPERADMIN = sessionUser({ id: 'sa-1', roleName: 'Superadmin', isSuperadmin: true })
/** ดูข้อมูลหลัก + แก้ค่าตั้งทั่วไปได้ แต่ไม่มี `manage_invoice_numbering` */
const ACCOUNTING = sessionUser({
  id: 'acc-1',
  capabilities: { view_master_data: 'view', manage_settings: 'manage' },
})

const DTO: SellerBranchDto = {
  name: 'บริษัท ใจดี โมบาย จำกัด',
  taxId: '0105560123456',
  vatRegistered: true,
  branchCode: '00001',
  branchLabel: 'สาขาที่ 00001',
}

function request(method: string, body?: unknown): NextRequest {
  const url = 'http://localhost/api/settings/seller-branch'
  const base = new Request(url, {
    method,
    headers: { 'content-type': 'application/json' },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  }) as unknown as NextRequest
  return Object.assign(base, { nextUrl: new URL(url) }) as NextRequest
}

interface Envelope {
  data?: unknown
  error?: { code: string; fields?: Record<string, string> } | null
}

beforeEach(() => {
  requireSessionMock.mockReset()
  queriesMock.getSellerBranch.mockReset()
  queriesMock.updateSellerBranch.mockReset()
})

describe('มติ PO U82 — สาขาผู้ขาย: สิทธิ์ + validation', () => {
  it('Superadmin แก้ได้ — ส่งรหัส + เหตุผล + ผู้กระทำ ลงชั้นข้อมูล', async () => {
    requireSessionMock.mockResolvedValue(SUPERADMIN)
    queriesMock.updateSellerBranch.mockResolvedValue(DTO)

    const response = await route.PATCH(request('PATCH', { branchCode: ' 00001 ', reason: 'เปิดสาขาใหม่ออกใบกำกับ' }), undefined)

    expect(response.status).toBe(200)
    expect(((await response.json()) as Envelope).data).toEqual(DTO)
    const [context, branchCode] = queriesMock.updateSellerBranch.mock.calls[0] as [
      { actor: SessionUser; reason: string },
      string,
    ]
    expect(context.actor.id).toBe(SUPERADMIN.id)
    expect(context.reason).toBe('เปิดสาขาใหม่ออกใบกำกับ')
    expect(branchCode).toBe('00001')
  })

  it('บัญชีที่ไม่มี manage_invoice_numbering ⇒ 403 · ไม่แตะชั้นข้อมูล', async () => {
    requireSessionMock.mockResolvedValue(ACCOUNTING)
    const response = await route.PATCH(request('PATCH', { branchCode: '00001', reason: 'ทดสอบสิทธิ์' }), undefined)
    expect(response.status).toBe(403)
    expect(queriesMock.updateSellerBranch).not.toHaveBeenCalled()
  })

  it('ดูได้ด้วย view_master_data', async () => {
    requireSessionMock.mockResolvedValue(ACCOUNTING)
    queriesMock.getSellerBranch.mockResolvedValue(DTO)
    const response = await route.GET(request('GET'), undefined)
    expect(response.status).toBe(200)
    expect(((await response.json()) as Envelope).data).toEqual(DTO)
  })

  it.each([
    [{ branchCode: '1', reason: 'เหตุผลครบถ้วน' }, 'branchCode'],
    [{ branchCode: '0000A', reason: 'เหตุผลครบถ้วน' }, 'branchCode'],
    [{ reason: 'เหตุผลครบถ้วน' }, 'branchCode'],
    [{ branchCode: '00001' }, 'reason'],
  ])('body %j ⇒ 400 (%s)', async (body, field) => {
    requireSessionMock.mockResolvedValue(SUPERADMIN)
    const response = await route.PATCH(request('PATCH', body), undefined)
    expect(response.status).toBe(400)
    const envelope = (await response.json()) as Envelope
    expect(Object.keys(envelope.error?.fields ?? {})).toContain(field)
    expect(queriesMock.updateSellerBranch).not.toHaveBeenCalled()
  })
})
