import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { SessionUser } from '@/lib/auth/types'

/**
 * `GET /api/revenues/unbilled-counts` (mytester7 review) — ฟอร์มสร้างรอบวางบิลนับรายได้รอวางบิลของบริษัทที่ระงับ
 * ด้วยคำขอเดียว · สิทธิ์เดียวกับ `GET /api/revenues` · ไม่ระบุบริษัท/รหัสผิดรูปแบบ = 400
 */

const requireSessionMock = vi.hoisted(() => vi.fn())
vi.mock('@/lib/auth/session', () => ({ requireSession: requireSessionMock }))

const countMock = vi.hoisted(() => vi.fn())
vi.mock('@/lib/revenue/queries', async () => ({
  ...(await vi.importActual<typeof import('@/lib/revenue/queries')>('@/lib/revenue/queries')),
  countUnbilledRevenuesByCompany: countMock,
}))

const { GET } = await import('@/app/api/revenues/unbilled-counts/route')

const A = '00000000-0000-4000-8000-00000000c0a1'
const B = '00000000-0000-4000-8000-00000000c0a2'

function sessionUser(capabilities: Record<string, 'view' | 'manage'>): SessionUser {
  return {
    id: 'user-1',
    organizationId: 'org-1',
    supabaseUid: 'uid-1',
    email: 'user@example.com',
    fullName: 'ทดสอบ',
    status: 'active',
    roleId: 'role-1',
    roleName: 'การเงิน',
    roleGroup: 'system',
    isSuperadmin: false,
    teamId: null,
    companyId: null,
    capabilities,
    scope: { kind: 'global', teamIds: [], companyId: null, userId: 'user-1' },
    loginAt: new Date().toISOString(),
  }
}

async function call(query: string): Promise<{ status: number; body: { data?: unknown; error: { code: string } | null } }> {
  const response = await GET(new Request(`http://localhost/api/revenues/unbilled-counts${query}`) as never, undefined as never)
  return { status: response.status, body: await response.json() }
}

beforeEach(() => {
  requireSessionMock.mockReset()
  countMock.mockReset()
  countMock.mockResolvedValue([{ companyId: A, count: 2 }])
})

describe('GET /api/revenues/unbilled-counts', () => {
  it('ไม่มีสิทธิ์อ่านรายได้ = 403 · ไม่แตะ service', async () => {
    requireSessionMock.mockResolvedValue(sessionUser({ assign_case: 'manage' }))
    expect((await call(`?companyIds=${A}`)).status).toBe(403)
    expect(countMock).not.toHaveBeenCalled()
  })

  it('การเงิน ⇒ 200 · รหัสบริษัทซ้ำ/ช่องว่างถูกตัดก่อนส่งให้ service', async () => {
    const finance = sessionUser({ manage_billing: 'view' })
    requireSessionMock.mockResolvedValue(finance)
    const { status, body } = await call(`?companyIds=${A},${B},${A},`)
    expect(status).toBe(200)
    expect(body.data).toEqual([{ companyId: A, count: 2 }])
    expect(countMock).toHaveBeenCalledWith(finance, [A, B])
  })

  it('ไม่ระบุบริษัท / รหัสผิดรูปแบบ ⇒ 400', async () => {
    requireSessionMock.mockResolvedValue(sessionUser({ manage_billing: 'view' }))
    expect((await call('')).status).toBe(400)
    expect((await call('?companyIds=not-a-uuid')).status).toBe(400)
    expect(countMock).not.toHaveBeenCalled()
  })
})
