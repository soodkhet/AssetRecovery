import {
  ACCOUNTING_ROLE_NAME,
  ADMIN_OFFICE_ROLE_NAME,
  CASE_APPROVER_ROLE_NAME,
  EXECUTIVE_ROLE_NAME,
  FIELD_AGENT_ROLE_NAME,
  FINANCE_ROLE_NAME,
  SUPERADMIN_ROLE_NAME,
  TEAM_MANAGER_ROLE_NAME,
  TEAM_SUPERVISOR_ROLE_NAME,
} from '@/lib/auth/constants'
import type { ScopeKind, SessionUser } from '@/lib/auth/types'
import type { CapabilityAccessLevel, RoleGroup } from '@/lib/generated/prisma/enums'
import { DEFAULT_ROLE_CAPABILITIES } from '@/lib/roles/default-matrix'

/**
 * ผู้ใช้ทดสอบของแดชบอร์ดหลัก — capability มาจาก **matrix ค่าเริ่มต้นจริง** (`DEFAULT_ROLE_CAPABILITIES`)
 * ไม่เขียนสิทธิ์มือ ⇒ เทสต์เปลี่ยนตามเมื่อ PO ปรับ matrix (ไม่หลอกตัวเองด้วยสิทธิ์ที่ไม่มีจริง)
 */

export const TEAM_A = '00000000-0000-4000-8000-00000000a001'

function capabilitiesOf(roleName: string, roleGroup: RoleGroup): Record<string, CapabilityAccessLevel> {
  const result: Record<string, CapabilityAccessLevel> = {}
  for (const assignment of DEFAULT_ROLE_CAPABILITIES) {
    if (assignment.role.name === roleName && assignment.role.roleGroup === roleGroup) {
      result[assignment.capabilityCode] = assignment.level
    }
  }
  return result
}

export function roleUser(
  roleName: string,
  roleGroup: RoleGroup,
  scopeKind: ScopeKind,
  overrides: Partial<SessionUser> = {},
): SessionUser {
  const isSuperadmin = roleName === SUPERADMIN_ROLE_NAME
  return {
    id: 'user-1',
    organizationId: 'org-1',
    supabaseUid: 'uid-1',
    email: 'user@example.com',
    fullName: 'ผู้ใช้ ทดสอบ',
    status: 'active',
    roleId: 'role-1',
    roleName,
    roleGroup,
    isSuperadmin,
    teamId: scopeKind === 'team' ? TEAM_A : null,
    companyId: null,
    capabilities: isSuperadmin ? {} : capabilitiesOf(roleName, roleGroup),
    scope: {
      kind: scopeKind,
      teamIds: scopeKind === 'team' ? [TEAM_A] : [],
      companyId: null,
      userId: 'user-1',
    },
    loginAt: new Date().toISOString(),
    ...overrides,
  }
}

export const ROLE_USERS = {
  superadmin: () => roleUser(SUPERADMIN_ROLE_NAME, 'system', 'global'),
  executive: () => roleUser(EXECUTIVE_ROLE_NAME, 'system', 'global'),
  finance: () => roleUser(FINANCE_ROLE_NAME, 'system', 'global'),
  accounting: () => roleUser(ACCOUNTING_ROLE_NAME, 'system', 'global'),
  caseApprover: () => roleUser(CASE_APPROVER_ROLE_NAME, 'system', 'global'),
  adminOffice: () => roleUser(ADMIN_OFFICE_ROLE_NAME, 'system', 'global'),
  manager: () => roleUser(TEAM_MANAGER_ROLE_NAME, 'inhouse', 'team'),
  supervisor: () => roleUser(TEAM_SUPERVISOR_ROLE_NAME, 'inhouse', 'team'),
  fieldAgent: () => roleUser(FIELD_AGENT_ROLE_NAME, 'inhouse', 'self'),
} as const
