import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { NextRequest } from 'next/server'
import { AuthError } from '@/lib/auth/errors'
import { resolveScope } from '@/lib/auth/scope'
import { FIELD_AGENT_ROLE_NAME } from '@/lib/auth/constants'
import type { SessionUser } from '@/lib/auth/types'

const requireSessionMock = vi.hoisted(() => vi.fn())
vi.mock('@/lib/auth/session', () => ({ requireSession: requireSessionMock }))

const { requirePermission, withPermission } = await import('@/lib/auth/require-permission')

function sessionUser(overrides: Partial<SessionUser> = {}): SessionUser {
  const base: SessionUser = {
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
    capabilities: { manage_payout_batch: 'manage' },
    scope: resolveScope({
      userId: 'user-1',
      roleGroup: 'system',
      roleName: 'การเงิน',
      teamId: null,
      companyId: null,
      managedTeamIds: [],
      supervisedTeamIds: [],
    }),
    loginAt: new Date().toISOString(),
  }
  return { ...base, ...overrides }
}

const request = {} as NextRequest

describe('requirePermission — จุดบังคับสิทธิ์ที่ API layer (DEC-002)', () => {
  beforeEach(() => {
    requireSessionMock.mockReset()
  })

  it('มีสิทธิ์ = คืน session ให้ handler ใช้ต่อ', async () => {
    requireSessionMock.mockResolvedValue(sessionUser())
    await expect(requirePermission('manage', 'manage_payout_batch')).resolves.toMatchObject({ id: 'user-1' })
  })

  it('ไม่มีสิทธิ์ = โยน PERMISSION_DENIED', async () => {
    requireSessionMock.mockResolvedValue(sessionUser())
    await expect(requirePermission('manage', 'manage_roles')).rejects.toBeInstanceOf(AuthError)
  })

  it('ยังไม่ได้ login = โยน UNAUTHENTICATED ต่อจาก requireSession', async () => {
    requireSessionMock.mockRejectedValue(new AuthError('UNAUTHENTICATED'))
    await expect(requirePermission('view', 'manage_payout_batch')).rejects.toMatchObject({
      code: 'UNAUTHENTICATED',
    })
  })
})

describe('withPermission — เรียก endpoint ตรงโดยไม่มีสิทธิ์ต้องได้ 403 ไม่ใช่ข้อมูล', () => {
  beforeEach(() => {
    requireSessionMock.mockReset()
  })

  const handler = withPermission('manage', 'manage_roles', () => Response.json({ data: { secret: true } }))

  it('การเงินเรียก endpoint ของ manage_roles → 403 + code PERMISSION_DENIED (ไม่ leak ข้อมูล)', async () => {
    requireSessionMock.mockResolvedValue(sessionUser())
    const response = await handler(request, undefined)
    expect(response.status).toBe(403)
    const body = (await response.json()) as { error: { code: string }; data?: unknown }
    expect(body.error.code).toBe('PERMISSION_DENIED')
    expect(body.data).toBeUndefined()
  })

  it('Field Agent (scope self) เรียก endpoint เดียวกัน → 403', async () => {
    requireSessionMock.mockResolvedValue(
      sessionUser({
        roleGroup: 'inhouse',
        roleName: FIELD_AGENT_ROLE_NAME,
        capabilities: { perform_field_work: 'manage' },
      }),
    )
    const response = await handler(request, undefined)
    expect(response.status).toBe(403)
  })

  it('ยังไม่ได้ login → 401', async () => {
    requireSessionMock.mockRejectedValue(new AuthError('UNAUTHENTICATED'))
    const response = await handler(request, undefined)
    expect(response.status).toBe(401)
  })

  it('บัญชีถูกระงับ → 403 ACCOUNT_INACTIVE', async () => {
    requireSessionMock.mockResolvedValue(sessionUser({ status: 'suspended', isSuperadmin: true }))
    const response = await handler(request, undefined)
    expect(response.status).toBe(403)
    const body = (await response.json()) as { error: { code: string } }
    expect(body.error.code).toBe('ACCOUNT_INACTIVE')
  })

  it('Superadmin ผ่านทุก capability', async () => {
    requireSessionMock.mockResolvedValue(sessionUser({ isSuperadmin: true, capabilities: {} }))
    const response = await handler(request, undefined)
    expect(response.status).toBe(200)
  })

  it('error ที่ไม่ใช่ AuthError ต้องไม่ถูกกลืนเป็น 401/403', async () => {
    requireSessionMock.mockRejectedValue(new Error('DB ล่ม'))
    await expect(handler(request, undefined)).rejects.toThrowError('DB ล่ม')
  })
})
