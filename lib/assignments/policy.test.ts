import { describe, expect, it } from 'vitest'
import {
  canPerformAssignmentAction,
  DEFAULT_ASSIGNMENT_POLICY,
  supervisorCanAssign,
  type AssignmentPolicy,
} from '@/lib/assignments/policy'
import {
  SUPERADMIN_ROLE_NAME,
  TEAM_MANAGER_ROLE_NAME,
  TEAM_SUPERVISOR_ROLE_NAME,
} from '@/lib/auth/constants'

const CLOSED: AssignmentPolicy = {
  ...DEFAULT_ASSIGNMENT_POLICY,
  supervisorCanAssignInhouse: false,
  supervisorCanAssignOutsource: false,
  supervisorCanAssignSystem: false,
}

describe('assignment policy (`40` §6.4 · §11)', () => {
  it('ค่า default: timeout 3 ชั่วโมง + หัวหน้าทุกกลุ่มทำได้', () => {
    expect(DEFAULT_ASSIGNMENT_POLICY.reassignTimeoutHours).toBe(3)
    expect(DEFAULT_ASSIGNMENT_POLICY.supervisorCanAssignSystem).toBe(true)
    expect(DEFAULT_ASSIGNMENT_POLICY.supervisorCanAssignInhouse).toBe(true)
    expect(DEFAULT_ASSIGNMENT_POLICY.supervisorCanAssignOutsource).toBe(true)
    expect(DEFAULT_ASSIGNMENT_POLICY.acceptDeadlineHours).toBeNull()
  })

  it('ค่าตั้งแยกต่อ Role Group ไม่ใช่ค่าเดียวคุมทั้งระบบ', () => {
    const onlyInhouse: AssignmentPolicy = { ...CLOSED, supervisorCanAssignInhouse: true }
    expect(supervisorCanAssign(onlyInhouse, 'inhouse')).toBe(true)
    expect(supervisorCanAssign(onlyInhouse, 'outsource')).toBe(false)
    expect(supervisorCanAssign(onlyInhouse, 'system')).toBe(false)
    // ผู้ใช้ฝั่งบริษัทไฟแนนซ์ไม่มีบทบาทมอบหมายงานเลย (`40` §13)
    expect(supervisorCanAssign(DEFAULT_ASSIGNMENT_POLICY, 'finance_company')).toBe(false)
  })

  it('settings คุมเฉพาะหัวหน้าทีม — ผู้จัดการ/Superadmin ไม่ถูกคุม', () => {
    expect(
      canPerformAssignmentAction({ roleName: TEAM_MANAGER_ROLE_NAME, roleGroup: 'inhouse' }, CLOSED),
    ).toBe(true)
    expect(canPerformAssignmentAction({ roleName: SUPERADMIN_ROLE_NAME, roleGroup: 'system' }, CLOSED)).toBe(true)
    expect(
      canPerformAssignmentAction({ roleName: TEAM_SUPERVISOR_ROLE_NAME, roleGroup: 'inhouse' }, CLOSED),
    ).toBe(false)
    expect(
      canPerformAssignmentAction(
        { roleName: TEAM_SUPERVISOR_ROLE_NAME, roleGroup: 'inhouse' },
        DEFAULT_ASSIGNMENT_POLICY,
      ),
    ).toBe(true)
  })
})
