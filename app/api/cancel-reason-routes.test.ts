import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { NextRequest } from 'next/server'
import type { SessionUser } from '@/lib/auth/types'

/**
 * UAT R7cv3-B03 — ยกเลิก/ปิดรายการโดยไม่มีเหตุผลต้องได้ code เฉพาะตามทะเบียน `24` ไม่ใช่ `REQUIRED_MISSING`
 *  · ยกเลิกหนังสือรับรอง 50 ทวิ (`/api/accounting/wht-certificates/:id/cancel`) ⇒ `WHT_CANCEL_REQUIRES_REASON`
 *  · ปิดรายการธนาคารโดยไม่จับคู่ (`/api/bank-reconciliation/transactions/:id/resolve-unmatched`) ⇒ `MATCH_NOTE_REQUIRED`
 * service ต้องไม่ถูกเรียกเลย
 */

const requireSessionMock = vi.hoisted(() => vi.fn())
vi.mock('@/lib/auth/session', () => ({ requireSession: requireSessionMock }))

const cancelWhtCertificate = vi.hoisted(() => vi.fn())
vi.mock('@/lib/wht/queries', () => ({ cancelWhtCertificate }))

const resolveUnmatchedTransaction = vi.hoisted(() => vi.fn())
vi.mock('@/lib/bank-recon/queries', () => ({
  resolveUnmatchedTransaction,
  MANAGE_BANK_RECONCILIATION: 'manage_bank_reconciliation',
}))

const { PATCH: cancelWht } = await import('@/app/api/accounting/wht-certificates/[id]/cancel/route')
const { PATCH: resolveUnmatched } = await import(
  '@/app/api/bank-reconciliation/transactions/[id]/resolve-unmatched/route'
)

const ID = '00000000-0000-4000-8000-000000000b01'

const ACCOUNTANT: SessionUser = {
  id: 'user-1',
  organizationId: 'org-1',
  supabaseUid: 'uid-1',
  email: 'account@example.com',
  fullName: 'บัญชี ทดสอบ',
  status: 'active',
  roleId: 'role-1',
  roleName: 'บัญชี',
  roleGroup: 'system',
  isSuperadmin: false,
  teamId: null,
  companyId: null,
  capabilities: { manage_wht: 'manage', manage_bank_reconciliation: 'manage' },
  scope: { kind: 'global', teamIds: [], companyId: null, userId: 'user-1' },
  loginAt: new Date().toISOString(),
}

function request(body: unknown): NextRequest {
  const url = `http://localhost/api/x/${ID}/action`
  const base = new Request(url, {
    method: 'PATCH',
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
  requireSessionMock.mockResolvedValue(ACCOUNTANT)
})

describe('UAT R7cv3-B03 — เหตุผลบังคับได้ code เฉพาะ', () => {
  it('ยกเลิก 50 ทวิ ไม่ส่ง/ว่าง ⇒ WHT_CANCEL_REQUIRES_REASON', async () => {
    for (const body of [{}, { reason: '' }, { reason: '   ' }, { reissue: true }]) {
      const result = await codeOf(await cancelWht(request(body), params))
      expect(result.code).toBe('WHT_CANCEL_REQUIRES_REASON')
      expect(result.status).toBe(400)
    }
    expect(cancelWhtCertificate).not.toHaveBeenCalled()
  })

  it('ปิดรายการธนาคารโดยไม่จับคู่ ไม่ส่ง/ว่าง ⇒ MATCH_NOTE_REQUIRED', async () => {
    for (const body of [{}, { matchNote: '' }, { matchNote: '  ' }]) {
      const result = await codeOf(await resolveUnmatched(request(body), params))
      expect(result.code).toBe('MATCH_NOTE_REQUIRED')
      expect(result.status).toBe(400)
    }
    expect(resolveUnmatchedTransaction).not.toHaveBeenCalled()
  })

  it('เหตุผลยาวเกินยังเป็น field error ทั่วไป (REQUIRED_MISSING)', async () => {
    const wht = await codeOf(await cancelWht(request({ reason: 'ก'.repeat(1001) }), params))
    expect(wht.code).toBe('REQUIRED_MISSING')
    const bank = await codeOf(await resolveUnmatched(request({ matchNote: 'ก'.repeat(1001) }), params))
    expect(bank.code).toBe('REQUIRED_MISSING')
  })
})
