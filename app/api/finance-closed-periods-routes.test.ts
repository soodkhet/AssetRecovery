import { beforeEach, describe, expect, it, vi } from 'vitest'
import { AuthError } from '@/lib/auth/errors'
import type { SessionUser } from '@/lib/auth/types'

/**
 * เทสต์ระดับ route ของ `GET /api/finance/closed-periods` (preship R7-009 · P11)
 *
 * ไม่ล็อกอิน = 401 · ไม่มีสิทธิ์สร้างรอบวางบิล/รอบจ่าย = 403 (ไม่แตะ DB) · คืนเฉพาะงวดที่สร้างเอกสารใหม่ไม่ได้
 * (`locked` + `sent_to_accountant`) ขององค์กรผู้เรียก · อ่านอย่างเดียว (ไม่สร้างงวด)
 */

const requireSessionMock = vi.hoisted(() => vi.fn())
vi.mock('@/lib/auth/session', () => ({ requireSession: requireSessionMock }))

const prismaMock = vi.hoisted(() => ({
  accountingPeriod: { findMany: vi.fn(), create: vi.fn(), upsert: vi.fn() },
}))
vi.mock('@/lib/prisma', () => ({ prisma: prismaMock }))

const { GET } = await import('@/app/api/finance/closed-periods/route')

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

async function call(): Promise<{ status: number; body: { data?: { closedPeriods: unknown[] }; error: { code: string } | null } }> {
  const response = await GET(new Request('http://localhost/api/finance/closed-periods') as never, undefined as never)
  return { status: response.status, body: await response.json() }
}

beforeEach(() => {
  requireSessionMock.mockReset()
  prismaMock.accountingPeriod.findMany.mockReset()
  prismaMock.accountingPeriod.findMany.mockResolvedValue([
    { yearBe: 2569, month: 8, status: 'locked' },
    { yearBe: 2569, month: 9, status: 'sent_to_accountant' },
    { yearBe: 2569, month: 10, status: 'collecting' },
  ])
})

describe('GET /api/finance/closed-periods', () => {
  it('ไม่ล็อกอิน = 401 · ไม่แตะ DB', async () => {
    requireSessionMock.mockRejectedValue(new AuthError('UNAUTHENTICATED'))
    expect((await call()).status).toBe(401)
    expect(prismaMock.accountingPeriod.findMany).not.toHaveBeenCalled()
  })

  it('ไม่มีสิทธิ์สร้างรอบวางบิล/รอบจ่าย (เช่น พนักงานภาคสนาม) = 403 · ไม่แตะ DB', async () => {
    requireSessionMock.mockResolvedValue(sessionUser('พนักงานภาคสนาม', { request_advance: 'manage' }))
    const { status, body } = await call()
    expect(status).toBe(403)
    expect(body.error?.code).toBe('PERMISSION_DENIED')
    expect(prismaMock.accountingPeriod.findMany).not.toHaveBeenCalled()
  })

  it.each([
    ['manage_billing', { manage_billing: 'manage' }],
    ['manage_payout_batch', { manage_payout_batch: 'manage' }],
  ] as const)('ผู้ถือ %s ⇒ งวด locked + sent_to_accountant ขององค์กรตัวเอง · ไม่สร้างงวดใหม่', async (_name, capabilities) => {
    requireSessionMock.mockResolvedValue(sessionUser('การเงิน', capabilities))
    const { status, body } = await call()
    expect(status).toBe(200)
    expect(body.data?.closedPeriods).toEqual([
      { yearBe: 2569, month: 8 },
      { yearBe: 2569, month: 9 },
    ])
    expect(prismaMock.accountingPeriod.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { organizationId: 'org-1' } }),
    )
    expect(prismaMock.accountingPeriod.create).not.toHaveBeenCalled()
    expect(prismaMock.accountingPeriod.upsert).not.toHaveBeenCalled()
  })
})
