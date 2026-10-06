import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { NextRequest } from 'next/server'
import type { SessionUser } from '@/lib/auth/types'

/**
 * มติ PO 07/10/2569 U137 — "คู่ที่เสนอ" (จับคู่ทางกลับ): สิทธิ์ที่ API layer (DEC-002)
 *
 * - ดูคู่ที่เสนอ = `manage_bank_reconciliation` ระดับ view ขึ้นไป · ไม่มีสิทธิ์ = 403 (service ไม่ถูกเรียก)
 * - ยืนยันคู่ = endpoint จับคู่มือเดิม (manage) — view = 403 · `fromProposal` ถูกส่งต่อถึง service
 */

const requireSessionMock = vi.hoisted(() => vi.fn())
vi.mock('@/lib/auth/session', () => ({ requireSession: requireSessionMock }))

const bankQueries = vi.hoisted(() => ({
  MANAGE_BANK_RECONCILIATION: 'manage_bank_reconciliation',
  listMatchProposals: vi.fn(async () => []),
  matchBankTransaction: vi.fn(async () => ({ result: null })),
}))
vi.mock('@/lib/bank-recon/queries', () => bankQueries)

const { GET: proposalsRoute } = await import('@/app/api/bank-reconciliation/match-proposals/route')
const { PATCH: matchRoute } = await import('@/app/api/bank-reconciliation/transactions/[id]/match/route')

const ID = '00000000-0000-4000-8000-0000000137d1'
const TARGET = '00000000-0000-4000-8000-0000000137d2'

function userWith(capabilities: Record<string, 'view' | 'manage'>): SessionUser {
  return {
    id: '00000000-0000-4000-8000-0000000137d9',
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
    scope: { kind: 'global', teamIds: [], companyId: null, userId: '00000000-0000-4000-8000-0000000137d9' },
    loginAt: new Date().toISOString(),
  }
}

const ACCOUNTANT = userWith({ manage_bank_reconciliation: 'manage' })
const FINANCE_VIEW = userWith({ manage_bank_reconciliation: 'view' })
const NO_ACCESS = userWith({ approve_case: 'manage' })

function request(method: string, url: string, body?: unknown): NextRequest {
  const base = new Request(url, {
    method,
    headers: { 'content-type': 'application/json' },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  }) as unknown as NextRequest
  return Object.assign(base, { nextUrl: new URL(url) }) as NextRequest
}

const params = { params: Promise.resolve({ id: ID }) }
const LIST_URL = 'http://localhost/api/bank-reconciliation/match-proposals'
const MATCH_BODY = { targetKind: 'payout', targetId: TARGET, matchNote: null, fromProposal: true }

beforeEach(() => {
  vi.clearAllMocks()
})

describe('U137 — /api/bank-reconciliation/match-proposals', () => {
  it('ไม่มีสิทธิ์กระทบยอด ⇒ 403 · service ไม่ถูกเรียก', async () => {
    requireSessionMock.mockResolvedValue(NO_ACCESS)
    expect((await proposalsRoute(request('GET', LIST_URL), {})).status).toBe(403)
    expect(bankQueries.listMatchProposals).not.toHaveBeenCalled()
  })

  it('view ดูคู่ที่เสนอได้ แต่ยืนยันไม่ได้ (403)', async () => {
    requireSessionMock.mockResolvedValue(FINANCE_VIEW)
    expect((await proposalsRoute(request('GET', LIST_URL), {})).status).toBe(200)
    expect(bankQueries.listMatchProposals).toHaveBeenCalledWith(FINANCE_VIEW)
    expect((await matchRoute(request('PATCH', `http://localhost/x/${ID}/match`, MATCH_BODY), params)).status).toBe(403)
    expect(bankQueries.matchBankTransaction).not.toHaveBeenCalled()
  })

  it('manage ยืนยันคู่ที่เสนอได้ — `fromProposal` ถึง service', async () => {
    requireSessionMock.mockResolvedValue(ACCOUNTANT)
    expect((await matchRoute(request('PATCH', `http://localhost/x/${ID}/match`, MATCH_BODY), params)).status).toBe(200)
    const call = bankQueries.matchBankTransaction.mock.calls[0] as unknown as [unknown, string, { fromProposal?: boolean }]
    expect(call[1]).toBe(ID)
    expect(call[2].fromProposal).toBe(true)
  })
})
