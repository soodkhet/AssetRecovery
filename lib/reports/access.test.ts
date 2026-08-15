import { describe, expect, it } from 'vitest'
import { AuthError } from '@/lib/auth/errors'
import { resolveScope } from '@/lib/auth/scope'
import type { SessionUser } from '@/lib/auth/types'
import {
  assertReportAccess,
  canViewReportCategory,
  isExecutiveViewer,
  reportTeamScope,
  visibleReports,
} from '@/lib/reports/access'
import { REPORT_DEFINITIONS, findReport, type ReportCategory } from '@/lib/reports/catalog'
import { DEFAULT_ROLE_CAPABILITIES } from '@/lib/roles/default-matrix'
import {
  ACCOUNTING_ROLE_NAME,
  EXECUTIVE_ROLE_NAME,
  FINANCE_ROLE_NAME,
  TEAM_MANAGER_ROLE_NAME,
} from '@/lib/auth/constants'
import type { CapabilityAccessLevel, RoleGroup } from '@/lib/generated/prisma/enums'

/**
 * ยามสิทธิ์ของเมนูรายงาน (`96` §10 + §14) — ประกอบ capability ของแต่ละ role **จาก default matrix จริง**
 * (ไม่ hardcode ชุด capability ในเทสต์ ไม่งั้นเทสต์จะผ่านทั้งที่ matrix จริงเปลี่ยนไปแล้ว)
 */

function capabilitiesOf(roleName: string, roleGroup: RoleGroup): Record<string, CapabilityAccessLevel> {
  const entries = DEFAULT_ROLE_CAPABILITIES.filter(
    (assignment) => assignment.role.name === roleName && assignment.role.roleGroup === roleGroup,
  ).map((assignment) => [assignment.capabilityCode, assignment.level] as const)
  return Object.fromEntries(entries)
}

function userOf(options: {
  roleName: string
  roleGroup: RoleGroup
  isSuperadmin?: boolean
  managedTeamIds?: readonly string[]
}): SessionUser {
  const roleGroup = options.roleGroup
  return {
    id: `user-${options.roleName}`,
    organizationId: 'org-1',
    supabaseUid: 'uid',
    email: 'user@example.com',
    fullName: options.roleName,
    status: 'active',
    roleId: 'role',
    roleName: options.roleName,
    roleGroup,
    isSuperadmin: options.isSuperadmin ?? false,
    teamId: null,
    companyId: null,
    capabilities: options.isSuperadmin === true ? {} : capabilitiesOf(options.roleName, roleGroup),
    scope: resolveScope({
      userId: `user-${options.roleName}`,
      roleGroup,
      roleName: options.roleName,
      teamId: null,
      companyId: null,
      managedTeamIds: options.managedTeamIds ?? [],
      supervisedTeamIds: [],
    }),
    loginAt: new Date().toISOString(),
  }
}

const finance = userOf({ roleName: FINANCE_ROLE_NAME, roleGroup: 'system' })
const accounting = userOf({ roleName: ACCOUNTING_ROLE_NAME, roleGroup: 'system' })
const executive = userOf({ roleName: EXECUTIVE_ROLE_NAME, roleGroup: 'system' })
const superadmin = userOf({ roleName: 'Superadmin', roleGroup: 'system', isSuperadmin: true })
const manager = userOf({
  roleName: TEAM_MANAGER_ROLE_NAME,
  roleGroup: 'inhouse',
  managedTeamIds: ['team-a', 'team-b'],
})

/** ตาราง `96` §10 ตัวต่อตัว */
const MATRIX: ReadonlyArray<[string, SessionUser, Readonly<Record<ReportCategory, boolean>>]> = [
  ['การเงิน', finance, { F: true, O: false, A: false, E: false }],
  ['บัญชี', accounting, { F: false, O: false, A: true, E: false }],
  ['ผู้จัดการทีม', manager, { F: false, O: true, A: false, E: false }],
  ['บริหาร', executive, { F: true, O: true, A: true, E: true }],
  ['Superadmin', superadmin, { F: true, O: true, A: true, E: true }],
]

describe('Permission Matrix ของรายงาน (`96` §10)', () => {
  it.each(MATRIX)('%s เห็นหมวดตามตารางเป๊ะ', (_label, user, expected) => {
    for (const [category, allowed] of Object.entries(expected)) {
      expect(canViewReportCategory(user, category as ReportCategory), category).toBe(allowed)
    }
  })

  it('`96` §14 — การเงินเรียกรายงาน Executive (E1) ต้องถูกปฏิเสธ 403', () => {
    const e1 = findReport('kpi-summary')
    expect(e1?.code).toBe('E1')
    expect(() => assertReportAccess(finance, e1!)).toThrow(AuthError)
    try {
      assertReportAccess(finance, e1!)
    } catch (error) {
      expect((error as AuthError).code).toBe('PERMISSION_DENIED')
      expect((error as AuthError).status).toBe(403)
    }
  })

  it('บัญชีเรียกรายงานการเงิน (F1) และการเงินเรียกรายงานบัญชี (A1) ต่างถูกปฏิเสธ', () => {
    expect(() => assertReportAccess(accounting, findReport('gross-profit')!)).toThrow(AuthError)
    expect(() => assertReportAccess(finance, findReport('wht-summary')!)).toThrow(AuthError)
  })

  it('ผู้บริหาร/Superadmin ผ่านทุกหมวด ส่วน role อื่นไม่ถือว่าเป็นผู้บริหาร', () => {
    expect(isExecutiveViewer(executive)).toBe(true)
    expect(isExecutiveViewer(superadmin)).toBe(true)
    expect(isExecutiveViewer(finance)).toBe(false)
    expect(isExecutiveViewer(accounting)).toBe(false)
    expect(isExecutiveViewer(manager)).toBe(false)
    for (const report of REPORT_DEFINITIONS) {
      expect(() => assertReportAccess(executive, report), report.code).not.toThrow()
      expect(() => assertReportAccess(superadmin, report), report.code).not.toThrow()
    }
  })

  it('รายการรายงานที่เห็นถูกกรองตามหมวด (ไม่ leak ชื่อรายงานของหมวดที่ไม่มีสิทธิ์)', () => {
    expect(visibleReports(finance, REPORT_DEFINITIONS).map((r) => r.code)).toEqual(['F1', 'F2', 'F3', 'F4', 'F5'])
    expect(visibleReports(accounting, REPORT_DEFINITIONS).map((r) => r.code)).toEqual(['A1', 'A2', 'A3', 'A4'])
    expect(visibleReports(manager, REPORT_DEFINITIONS).map((r) => r.code)).toEqual(['O1', 'O2', 'O3', 'O4', 'O5'])
    expect(visibleReports(executive, REPORT_DEFINITIONS)).toHaveLength(17)
  })
})

describe('Scope ระดับแถวของหมวด O (`96` §14 "Manager เห็นเฉพาะทีมตัวเอง")', () => {
  it('ผู้จัดการถูกจำกัดเฉพาะทีมที่ดูแล · ผู้บริหาร/Superadmin เห็นทุกทีม', () => {
    expect(reportTeamScope(manager)).toEqual(['team-a', 'team-b'])
    expect(reportTeamScope(executive)).toBeNull()
    expect(reportTeamScope(superadmin)).toBeNull()
  })

  it('ผู้จัดการที่ไม่ได้ดูแลทีมไหนเลยได้รายการว่าง (ไม่ใช่ "ทุกทีม")', () => {
    const orphan = userOf({ roleName: TEAM_MANAGER_ROLE_NAME, roleGroup: 'outsource', managedTeamIds: [] })
    expect(reportTeamScope(orphan)).toEqual([])
  })
})
