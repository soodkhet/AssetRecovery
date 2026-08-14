import { describe, expect, it } from 'vitest'
import { canAccess, checkPermission, hasCapability, isSessionExpired } from '@/lib/auth/permission'
import { resolveScope } from '@/lib/auth/scope'
import { SESSION_MAX_AGE_MS, FIELD_AGENT_ROLE_NAME, SUPERADMIN_ROLE_NAME } from '@/lib/auth/constants'
import type { SessionUser } from '@/lib/auth/types'

const NOW = new Date('2026-08-14T03:00:00.000Z')
const FRESH_LOGIN = new Date(NOW.getTime() - 60 * 60 * 1000).toISOString()

function sessionUser(overrides: Partial<SessionUser> = {}): SessionUser {
  const base: SessionUser = {
    id: 'user-1',
    organizationId: 'org-1',
    supabaseUid: 'uid-1',
    email: 'user@example.com',
    fullName: 'ผู้ใช้ทดสอบ',
    status: 'active',
    roleId: 'role-1',
    roleName: 'การเงิน',
    roleGroup: 'system',
    isSuperadmin: false,
    teamId: null,
    companyId: null,
    capabilities: { manage_payout_batch: 'manage', view_finance_dashboard: 'view' },
    scope: resolveScope({
      userId: 'user-1',
      roleGroup: 'system',
      roleName: 'การเงิน',
      teamId: null,
      companyId: null,
      managedTeamIds: [],
      supervisedTeamIds: [],
    }),
    loginAt: FRESH_LOGIN,
  }
  return { ...base, ...overrides }
}

describe('hasCapability (DEC-009 — 3 ระดับ)', () => {
  const user = sessionUser()

  it('ไม่มี record = ไม่มีสิทธิ์ทั้ง view และ manage', () => {
    expect(hasCapability(user, 'view', 'manage_roles')).toBe(false)
    expect(hasCapability(user, 'manage', 'manage_roles')).toBe(false)
  })

  it('access_level view = ดูได้ แต่สั่งการไม่ได้', () => {
    expect(hasCapability(user, 'view', 'view_finance_dashboard')).toBe(true)
    expect(hasCapability(user, 'manage', 'view_finance_dashboard')).toBe(false)
  })

  it('access_level manage = ผ่านทั้ง view และ manage', () => {
    expect(hasCapability(user, 'view', 'manage_payout_batch')).toBe(true)
    expect(hasCapability(user, 'manage', 'manage_payout_batch')).toBe(true)
  })

  it('Superadmin = manage ทุกอย่างโดยไม่มี record', () => {
    const superadmin = sessionUser({ isSuperadmin: true, roleName: SUPERADMIN_ROLE_NAME, capabilities: {} })
    expect(hasCapability(superadmin, 'manage', 'manage_roles')).toBe(true)
    expect(hasCapability(superadmin, 'manage', 'capability_ที่ยังไม่มีในระบบ')).toBe(true)
  })
})

describe('isSessionExpired — timeout 24 ชม. (`05` §10/§17)', () => {
  it('ยังไม่ครบ 24 ชม. = ใช้งานต่อได้', () => {
    expect(isSessionExpired(FRESH_LOGIN, NOW)).toBe(false)
    expect(isSessionExpired(new Date(NOW.getTime() - SESSION_MAX_AGE_MS + 1000), NOW)).toBe(false)
  })

  it('ครบ 24 ชม. พอดี/เกิน = หมดอายุ', () => {
    expect(isSessionExpired(new Date(NOW.getTime() - SESSION_MAX_AGE_MS), NOW)).toBe(true)
    expect(isSessionExpired(new Date(NOW.getTime() - SESSION_MAX_AGE_MS - 1), NOW)).toBe(true)
  })

  it('ไม่เคย login / ค่าไม่ใช่วันที่ = หมดอายุ', () => {
    expect(isSessionExpired(null, NOW)).toBe(true)
    expect(isSessionExpired('ไม่ใช่วันที่', NOW)).toBe(true)
  })
})

describe('checkPermission — ลำดับการปฏิเสธ', () => {
  it('บัญชีไม่ active ถูกปฏิเสธก่อนเช็คสิทธิ์ (`05` §10)', () => {
    const suspended = sessionUser({ status: 'suspended', isSuperadmin: true })
    expect(checkPermission(suspended, 'view', 'manage_payout_batch', undefined, NOW)).toBe('ACCOUNT_INACTIVE')
  })

  it('session หมดอายุ = SESSION_EXPIRED แม้เป็น Superadmin', () => {
    const stale = sessionUser({
      isSuperadmin: true,
      loginAt: new Date(NOW.getTime() - SESSION_MAX_AGE_MS - 1).toISOString(),
    })
    expect(checkPermission(stale, 'view', 'manage_payout_batch', undefined, NOW)).toBe('SESSION_EXPIRED')
  })

  it('ไม่มี capability = PERMISSION_DENIED', () => {
    expect(checkPermission(sessionUser(), 'manage', 'manage_roles', undefined, NOW)).toBe('PERMISSION_DENIED')
  })

  it('มี capability แต่ข้าม scope = PERMISSION_DENIED', () => {
    const agent = sessionUser({
      roleGroup: 'inhouse',
      roleName: FIELD_AGENT_ROLE_NAME,
      capabilities: { request_advance: 'manage' },
      scope: resolveScope({
        userId: 'user-1',
        roleGroup: 'inhouse',
        roleName: FIELD_AGENT_ROLE_NAME,
        teamId: 'team-a',
        companyId: null,
        managedTeamIds: [],
        supervisedTeamIds: [],
      }),
    })
    expect(checkPermission(agent, 'manage', 'request_advance', { userId: 'user-1' }, NOW)).toBeNull()
    expect(checkPermission(agent, 'manage', 'request_advance', { userId: 'user-9' }, NOW)).toBe('PERMISSION_DENIED')
  })

  it('ครบเงื่อนไข = ผ่าน', () => {
    expect(checkPermission(sessionUser(), 'manage', 'manage_payout_batch', undefined, NOW)).toBeNull()
  })
})

describe('canAccess (ใช้ร่วมฝั่ง UI)', () => {
  it('รวม capability + scope เข้าด้วยกัน', () => {
    const companyUser = sessionUser({
      roleGroup: 'finance_company',
      roleName: 'แอดมิน',
      companyId: 'company-a',
      capabilities: { view_own_company_data: 'view' },
      scope: resolveScope({
        userId: 'user-1',
        roleGroup: 'finance_company',
        roleName: 'แอดมิน',
        teamId: null,
        companyId: 'company-a',
        managedTeamIds: [],
        supervisedTeamIds: [],
      }),
    })
    expect(canAccess(companyUser, 'view', 'view_own_company_data', { companyId: 'company-a' })).toBe(true)
    expect(canAccess(companyUser, 'view', 'view_own_company_data', { companyId: 'company-b' })).toBe(false)
    expect(canAccess(companyUser, 'manage', 'view_own_company_data')).toBe(false)
  })
})
