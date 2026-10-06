import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { NextRequest } from 'next/server'
import type { SessionUser } from '@/lib/auth/types'

/**
 * UAT R6-D — ตีกลับ/ปฏิเสธโดยไม่มีเหตุผลต้องได้ code เฉพาะตามทะเบียน `24` ไม่ใช่ `REQUIRED_MISSING`
 *  · ตีกลับรายการเบิก (`/api/compensation|claims/:id/reject`, `/api/field/expenses/:id/reject`) ⇒ `REJECT_REASON_REQUIRED`
 *  · ปฏิเสธเงินทดรอง (`/api/advances/:id/reject`) ⇒ `REJECTION_REASON_REQUIRED`
 * เดิม Zod ปัดเป็น `REQUIRED_MISSING` ก่อนถึงยามของโมดูล · service ต้องไม่ถูกเรียกเลย
 */

const requireSessionMock = vi.hoisted(() => vi.fn())
vi.mock('@/lib/auth/session', () => ({ requireSession: requireSessionMock }))

const rejectCompensationExpense = vi.hoisted(() => vi.fn())
const rejectExpensePermanently = vi.hoisted(() => vi.fn())
vi.mock('@/lib/compensation/approval-queries', () => ({ rejectCompensationExpense, rejectExpensePermanently }))

const rejectFieldExpense = vi.hoisted(() => vi.fn())
vi.mock('@/lib/field/expense-queries', () => ({ rejectFieldExpense }))

const rejectAdvance = vi.hoisted(() => vi.fn())
vi.mock('@/lib/advances/queries', () => ({ rejectAdvance, APPROVE_ADVANCE: 'approve_advance' }))

const { PATCH: rejectCompensation } = await import('@/app/api/compensation/[id]/reject/route')
const { PATCH: rejectClaim } = await import('@/app/api/claims/[id]/reject/route')
const { PATCH: rejectClaimPermanent } = await import('@/app/api/claims/[id]/reject-permanent/route')
const { POST: rejectField } = await import('@/app/api/field/expenses/[id]/reject/route')
const { PATCH: rejectAdvanceRoute } = await import('@/app/api/advances/[id]/reject/route')

const ID = '00000000-0000-4000-8000-000000000a01'

const FINANCE: SessionUser = {
  id: 'user-1',
  organizationId: 'org-1',
  supabaseUid: 'uid-1',
  email: 'finance@example.com',
  fullName: 'การเงิน ทดสอบ',
  status: 'active',
  roleId: 'role-1',
  roleName: 'การเงิน',
  roleGroup: 'system',
  isSuperadmin: false,
  teamId: null,
  companyId: null,
  capabilities: { approve_expense_finance: 'manage', approve_advance: 'manage' },
  scope: { kind: 'global', teamIds: [], companyId: null, userId: 'user-1' },
  loginAt: new Date().toISOString(),
}

function request(method: string, body: unknown): NextRequest {
  const url = `http://localhost/api/x/${ID}/reject`
  const base = new Request(url, {
    method,
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  }) as unknown as NextRequest
  return Object.assign(base, { nextUrl: new URL(url) }) as NextRequest
}

const params = { params: Promise.resolve({ id: ID }) }

async function codeOf(response: Response): Promise<{ status: number; code: string }> {
  const json = (await response.json()) as { error?: { code?: string } }
  return { status: response.status, code: json.error?.code ?? '' }
}

beforeEach(() => {
  vi.clearAllMocks()
  requireSessionMock.mockResolvedValue(FINANCE)
})

describe('UAT R6-D — ตีกลับรายการเบิกไม่มีเหตุผล ⇒ REJECT_REASON_REQUIRED', () => {
  const routes = [
    ['PATCH /api/compensation/:id/reject', 'PATCH', rejectCompensation],
    ['PATCH /api/claims/:id/reject', 'PATCH', rejectClaim],
    // มติ PO U117 ข้อ 3 — ปฏิเสธถาวรใบเบิกค่าที่พัก ใช้ code เดียวกัน
    ['PATCH /api/claims/:id/reject-permanent', 'PATCH', rejectClaimPermanent],
    ['POST /api/field/expenses/:id/reject', 'POST', rejectField],
  ] as const

  for (const [name, method, handler] of routes) {
    it(`${name} — ไม่ส่ง reason / ว่าง / สั้นกว่า 5 ตัวอักษร`, async () => {
      for (const body of [{}, { reason: '' }, { reason: '   ' }, { reason: 'abc' }]) {
        const result = await codeOf(await handler(request(method, body), params))
        expect(result.code).toBe('REJECT_REASON_REQUIRED')
        expect(result.status).toBeGreaterThanOrEqual(400)
        expect(result.status).toBeLessThan(500)
      }
      expect(rejectCompensationExpense).not.toHaveBeenCalled()
      expect(rejectExpensePermanently).not.toHaveBeenCalled()
      expect(rejectFieldExpense).not.toHaveBeenCalled()
    })
  }
})

describe('มติ PO U117 ข้อ 3 — PATCH /api/claims/:id/reject-permanent', () => {
  it('ไม่มี capability ของสายอนุมัติ ⇒ 403 และไม่เรียก service', async () => {
    requireSessionMock.mockResolvedValue({ ...FINANCE, capabilities: { approve_advance: 'manage', perform_field_work: 'manage' } })
    const response = await rejectClaimPermanent(request('PATCH', { reason: 'ไม่ได้ค้างคืนจริง' }), params)
    expect(response.status).toBe(403)
    expect(rejectExpensePermanently).not.toHaveBeenCalled()
  })

  it('ผู้อนุมัติ + เหตุผลครบ ⇒ เรียก service ด้วยเหตุผลที่ส่งมา', async () => {
    rejectExpensePermanently.mockResolvedValue({ expense: { id: ID, status: 'rejected' }, events: ['expense.rejected'] })
    const response = await rejectClaimPermanent(request('PATCH', { reason: 'ไม่ได้ค้างคืนจริง' }), params)
    expect(response.status).toBe(200)
    expect(rejectExpensePermanently).toHaveBeenCalledWith(expect.objectContaining({ actor: FINANCE }), ID, {
      reason: 'ไม่ได้ค้างคืนจริง',
    })
  })
})

describe('UAT R6-D — ปฏิเสธเงินทดรองไม่มีเหตุผล ⇒ REJECTION_REASON_REQUIRED', () => {
  it('PATCH /api/advances/:id/reject — ไม่ส่ง / ว่าง / สั้นเกิน', async () => {
    for (const body of [{}, { rejectionReason: '' }, { rejectionReason: 'no' }]) {
      const result = await codeOf(await rejectAdvanceRoute(request('PATCH', body), params))
      expect(result.code).toBe('REJECTION_REASON_REQUIRED')
      expect(result.status).toBeLessThan(500)
    }
    expect(rejectAdvance).not.toHaveBeenCalled()
  })

  it('เหตุผลยาวเกินยังเป็น field error ทั่วไป (REQUIRED_MISSING + fields) ไม่ใช่เหตุผลหาย', async () => {
    const result = await codeOf(await rejectAdvanceRoute(request('PATCH', { rejectionReason: 'ก'.repeat(501) }), params))
    expect(result.code).toBe('REQUIRED_MISSING')
  })
})
