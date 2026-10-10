import { beforeEach, describe, expect, it, vi } from 'vitest'
import { AuthError } from '@/lib/auth/errors'
import type { SessionUser } from '@/lib/auth/types'

/**
 * เทสต์ระดับ route ของ `GET /api/finance/revenue-pending` (staging E-008)
 * ไม่ล็อกอิน = 401 · ไม่มีสิทธิ์อ่านรายได้ = 403 (ไม่แตะ service) · การเงินอ่านได้ (อ่านอย่างเดียว)
 */

const requireSessionMock = vi.hoisted(() => vi.fn())
vi.mock('@/lib/auth/session', () => ({ requireSession: requireSessionMock }))

const pendingMock = vi.hoisted(() => ({ listRevenuePendingCases: vi.fn() }))
vi.mock('@/lib/revenue/pending-queries', () => pendingMock)

const { GET } = await import('@/app/api/finance/revenue-pending/route')

function sessionUser(roleName: string, capabilities: Record<string, 'view' | 'manage'>): SessionUser {
  return {
    id: 'user-1',
    organizationId: 'org-1',
    supabaseUid: 'uid-1',
    email: 'user@example.com',
    fullName: `${roleName} ทดสอบ`,
    status: 'active',
    roleId: 'role-1',
    roleName,
    roleGroup: 'system',
    isSuperadmin: false,
    teamId: null,
    companyId: null,
    capabilities,
    scope: { kind: 'global', teamIds: [], companyId: null, userId: 'user-1' },
    loginAt: new Date().toISOString(),
  }
}

async function call(): Promise<{ status: number; body: { data?: unknown[]; error: { code: string } | null } }> {
  const response = await GET(new Request('http://localhost/api/finance/revenue-pending') as never, undefined as never)
  return { status: response.status, body: await response.json() }
}

beforeEach(() => {
  requireSessionMock.mockReset()
  pendingMock.listRevenuePendingCases.mockReset()
  pendingMock.listRevenuePendingCases.mockResolvedValue([])
})

describe('GET /api/finance/revenue-pending', () => {
  it('ไม่ล็อกอิน = 401', async () => {
    requireSessionMock.mockRejectedValue(new AuthError('UNAUTHENTICATED'))
    expect((await call()).status).toBe(401)
    expect(pendingMock.listRevenuePendingCases).not.toHaveBeenCalled()
  })

  it('ไม่มีสิทธิ์อ่านรายได้ (เช่น ผู้จัดการทีม) = 403 · ไม่แตะ service', async () => {
    requireSessionMock.mockResolvedValue(sessionUser('ผู้จัดการ', { assign_case: 'manage' }))
    const { status, body } = await call()
    expect(status).toBe(403)
    expect(body.error?.code).toBe('PERMISSION_DENIED')
    expect(pendingMock.listRevenuePendingCases).not.toHaveBeenCalled()
  })

  it('การเงิน (manage_billing view) ⇒ 200 พร้อมรายการ', async () => {
    const finance = sessionUser('การเงิน', { manage_billing: 'view' })
    requireSessionMock.mockResolvedValue(finance)
    const { status, body } = await call()
    expect(status).toBe(200)
    expect(body.data).toEqual([])
    expect(pendingMock.listRevenuePendingCases).toHaveBeenCalledWith(finance)
  })
})
