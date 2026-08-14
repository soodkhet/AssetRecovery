import { describe, expect, it } from 'vitest'
import { isWithinScope, resolveScope, type ScopeInput } from '@/lib/auth/scope'
import {
  FIELD_AGENT_ROLE_NAME,
  SUPERADMIN_ROLE_NAME,
  TEAM_MANAGER_ROLE_NAME,
  TEAM_SUPERVISOR_ROLE_NAME,
} from '@/lib/auth/constants'

const USER_ID = 'user-1'
const OTHER_USER_ID = 'user-2'
const TEAM_A = 'team-a'
const TEAM_B = 'team-b'
const COMPANY_A = 'company-a'

function input(overrides: Partial<ScopeInput>): ScopeInput {
  return {
    userId: USER_ID,
    roleGroup: 'system',
    roleName: SUPERADMIN_ROLE_NAME,
    teamId: null,
    companyId: null,
    managedTeamIds: [],
    supervisedTeamIds: [],
    ...overrides,
  }
}

describe('resolveScope — 4 แบบตาม `05` §5 / `07` §6', () => {
  it('system role → global', () => {
    expect(resolveScope(input({})).kind).toBe('global')
    expect(resolveScope(input({ roleName: 'การเงิน' })).kind).toBe('global')
  })

  it('ผู้จัดการทีม (inhouse/outsource) → team ครอบทุกทีมที่ดูแลใน team_managers', () => {
    const scope = resolveScope(
      input({
        roleGroup: 'outsource',
        roleName: TEAM_MANAGER_ROLE_NAME,
        managedTeamIds: [TEAM_A, TEAM_B],
      }),
    )
    expect(scope.kind).toBe('team')
    expect([...scope.teamIds].sort()).toEqual([TEAM_A, TEAM_B])
  })

  it('หัวหน้าทีม → team เฉพาะทีมที่ตนสังกัด/เป็นหัวหน้า (ไม่ซ้ำ)', () => {
    const scope = resolveScope(
      input({
        roleGroup: 'inhouse',
        roleName: TEAM_SUPERVISOR_ROLE_NAME,
        teamId: TEAM_A,
        supervisedTeamIds: [TEAM_A],
      }),
    )
    expect(scope.kind).toBe('team')
    expect(scope.teamIds).toEqual([TEAM_A])
  })

  it('พนักงานติดตามทรัพย์ → self', () => {
    const scope = resolveScope(input({ roleGroup: 'inhouse', roleName: FIELD_AGENT_ROLE_NAME, teamId: TEAM_A }))
    expect(scope.kind).toBe('self')
    expect(scope.userId).toBe(USER_ID)
    expect(scope.teamIds).toEqual([])
  })

  it('finance_company → company ผูกกับ company_id ของผู้ใช้', () => {
    const scope = resolveScope(input({ roleGroup: 'finance_company', roleName: 'ผู้จัดการ', companyId: COMPANY_A }))
    expect(scope.kind).toBe('company')
    expect(scope.companyId).toBe(COMPANY_A)
  })
})

describe('isWithinScope', () => {
  const globalScope = resolveScope(input({}))
  const teamScope = resolveScope(
    input({ roleGroup: 'inhouse', roleName: TEAM_MANAGER_ROLE_NAME, managedTeamIds: [TEAM_A] }),
  )
  const companyScope = resolveScope(
    input({ roleGroup: 'finance_company', roleName: 'แอดมิน', companyId: COMPANY_A }),
  )
  const selfScope = resolveScope(input({ roleGroup: 'outsource', roleName: FIELD_AGENT_ROLE_NAME }))

  it('ไม่ระบุ target = ไม่ตรวจ row-level', () => {
    expect(isWithinScope(teamScope)).toBe(true)
    expect(isWithinScope(selfScope, {})).toBe(true)
    expect(isWithinScope(companyScope, { teamId: null, companyId: null, userId: null })).toBe(true)
  })

  it('global เข้าถึงได้ทุกแถว', () => {
    expect(isWithinScope(globalScope, { teamId: TEAM_B })).toBe(true)
    expect(isWithinScope(globalScope, { companyId: 'company-z' })).toBe(true)
  })

  it('team: ผ่านเฉพาะทีมที่ดูแล หรือแถวของตัวเอง', () => {
    expect(isWithinScope(teamScope, { teamId: TEAM_A })).toBe(true)
    expect(isWithinScope(teamScope, { teamId: TEAM_B })).toBe(false)
    expect(isWithinScope(teamScope, { userId: USER_ID })).toBe(true)
    expect(isWithinScope(teamScope, { userId: OTHER_USER_ID })).toBe(false)
  })

  it('company: ผ่านเฉพาะบริษัทตัวเอง (ข้ามบริษัท = ปฏิเสธ)', () => {
    expect(isWithinScope(companyScope, { companyId: COMPANY_A })).toBe(true)
    expect(isWithinScope(companyScope, { companyId: 'company-z' })).toBe(false)
    expect(isWithinScope(companyScope, { teamId: TEAM_A })).toBe(false)
  })

  it('self: ผ่านเฉพาะแถวของตัวเอง', () => {
    expect(isWithinScope(selfScope, { userId: USER_ID })).toBe(true)
    expect(isWithinScope(selfScope, { userId: OTHER_USER_ID })).toBe(false)
    expect(isWithinScope(selfScope, { teamId: TEAM_A })).toBe(false)
  })
})
