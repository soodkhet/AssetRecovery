import { describe, expect, it } from 'vitest'
import {
  ACCOUNTING_ROLE_NAME,
  ADMIN_OFFICE_ROLE_NAME,
  CASE_APPROVER_ROLE_NAME,
  COMPANY_ADMIN_ROLE_NAME,
  COMPANY_MANAGER_ROLE_NAME,
  COMPANY_SUPERVISOR_ROLE_NAME,
  EXECUTIVE_ROLE_NAME,
  FIELD_AGENT_ROLE_NAME,
  FINANCE_ROLE_NAME,
  TEAM_MANAGER_ROLE_NAME,
  TEAM_SUPERVISOR_ROLE_NAME,
} from '@/lib/auth/constants'
import { checkPermission, hasCapability } from '@/lib/auth/permission'
import type { SessionUser } from '@/lib/auth/types'
import { advanceCreateAccess, APPROVE_ADVANCE, REQUEST_ADVANCE } from '@/lib/advances/advance'
import type { CapabilityAccessLevel, RoleGroup } from '@/lib/generated/prisma/enums'
import { DEFAULT_ROLE_CAPABILITIES } from '@/lib/roles/default-matrix'

/**
 * UAT BUG-047 — ยามสิทธิ์ `PATCH /api/advances/:id/{approve,reject}` (`manage:approve_advance`)
 * ประกอบ capability ของแต่ละ role **จาก default matrix จริง** (ค่าที่ seed ใส่ให้ฐานใหม่)
 * `15` §5/§12: การเงิน = อนุมัติ Advance · role อื่นทั้งหมด (นอก Superadmin) ต้องโดน 403
 */

const SEED_ROLES: ReadonlyArray<readonly [string, RoleGroup]> = [
  [EXECUTIVE_ROLE_NAME, 'system'],
  [FINANCE_ROLE_NAME, 'system'],
  [ACCOUNTING_ROLE_NAME, 'system'],
  [CASE_APPROVER_ROLE_NAME, 'system'],
  [ADMIN_OFFICE_ROLE_NAME, 'system'],
  [TEAM_MANAGER_ROLE_NAME, 'inhouse'],
  [TEAM_SUPERVISOR_ROLE_NAME, 'inhouse'],
  [FIELD_AGENT_ROLE_NAME, 'inhouse'],
  [TEAM_MANAGER_ROLE_NAME, 'outsource'],
  [TEAM_SUPERVISOR_ROLE_NAME, 'outsource'],
  [FIELD_AGENT_ROLE_NAME, 'outsource'],
  [COMPANY_MANAGER_ROLE_NAME, 'finance_company'],
  [COMPANY_SUPERVISOR_ROLE_NAME, 'finance_company'],
  [COMPANY_ADMIN_ROLE_NAME, 'finance_company'],
]

function capabilitiesOf(roleName: string, roleGroup: RoleGroup): Record<string, CapabilityAccessLevel> {
  return Object.fromEntries(
    DEFAULT_ROLE_CAPABILITIES.filter(
      (assignment) => assignment.role.name === roleName && assignment.role.roleGroup === roleGroup,
    ).map((assignment) => [assignment.capabilityCode, assignment.level] as const),
  )
}

function userOf(roleName: string, roleGroup: RoleGroup): SessionUser {
  const id = `user-${roleGroup}-${roleName}`
  return {
    id,
    organizationId: 'org-1',
    supabaseUid: 'uid',
    email: 'user@example.com',
    fullName: roleName,
    status: 'active',
    roleId: 'role',
    roleName,
    roleGroup,
    isSuperadmin: false,
    teamId: null,
    companyId: null,
    capabilities: capabilitiesOf(roleName, roleGroup),
    scope: { kind: 'global', teamIds: [], companyId: null, userId: id },
    loginAt: new Date().toISOString(),
  }
}

describe('สิทธิ์อนุมัติ/ปฏิเสธเงินทดรอง (UAT BUG-047)', () => {
  it('การเงินผ่าน manage:approve_advance', () => {
    expect(checkPermission(userOf(FINANCE_ROLE_NAME, 'system'), 'manage', APPROVE_ADVANCE)).toBeNull()
  })

  it.each(SEED_ROLES.filter(([name]) => name !== FINANCE_ROLE_NAME))(
    '%s (%s) โดน PERMISSION_DENIED',
    (name, group) => {
      expect(checkPermission(userOf(name, group), 'manage', APPROVE_ADVANCE)).toBe('PERMISSION_DENIED')
    },
  )
})

/** ประตู `POST /api/advances` = any-of `manage` ของ 2 capability (มติ PO U160) */
function passesCreateGate(user: SessionUser): boolean {
  return [REQUEST_ADVANCE, APPROVE_ADVANCE].some((capability) => checkPermission(user, 'manage', capability) === null)
}

function accessOf(user: SessionUser) {
  return advanceCreateAccess((capability) => hasCapability(user, 'manage', capability))
}

describe('สิทธิ์ขอเงินทดรองให้ตัวเอง / ขอแทน (มติ PO U160)', () => {
  it('การเงิน: ผ่านประตู endpoint · ขอแทนได้ · ขอให้ตัวเองไม่ได้', () => {
    const finance = userOf(FINANCE_ROLE_NAME, 'system')
    expect(passesCreateGate(finance)).toBe(true)
    expect(accessOf(finance)).toEqual({ self: false, onBehalf: true })
  })

  it.each([
    [FIELD_AGENT_ROLE_NAME, 'inhouse'],
    [FIELD_AGENT_ROLE_NAME, 'outsource'],
  ] as const)('พนักงาน %s (%s): ขอให้ตัวเองได้ · ขอแทนไม่ได้', (name, group) => {
    const agent = userOf(name, group)
    expect(passesCreateGate(agent)).toBe(true)
    expect(accessOf(agent)).toEqual({ self: true, onBehalf: false })
  })

  it('Superadmin ได้ทั้งคู่', () => {
    const superadmin = { ...userOf(EXECUTIVE_ROLE_NAME, 'system'), isSuperadmin: true }
    expect(accessOf(superadmin)).toEqual({ self: true, onBehalf: true })
  })

  it.each(
    SEED_ROLES.filter(([name]) => name !== FINANCE_ROLE_NAME && name !== FIELD_AGENT_ROLE_NAME),
  )('%s (%s) ไม่ผ่านประตูขอเงินทดรอง (403)', (name, group) => {
    expect(passesCreateGate(userOf(name, group))).toBe(false)
  })
})
