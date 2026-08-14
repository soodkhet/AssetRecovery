import type { RoleGroup } from '@/lib/generated/prisma/enums'
import { SUPERADMIN_ROLE_NAME, TEAM_SUPERVISOR_ROLE_NAME } from '@/lib/auth/constants'

/**
 * ค่าตั้งระดับองค์กรของการมอบหมายงาน (`40` §6.4 · §11) + ยามสิทธิ์ของหัวหน้าทีม — **pure ล้วน**
 *
 * §6.4 ย้ำว่าค่านี้คุมเฉพาะ **การกระทำ** (assign/reassign) เท่านั้น — ไม่คุมการมองเห็น:
 * หัวหน้าเห็นเมนู ตาราง Kanban agent picker และประวัติได้เสมอไม่ว่าค่าจะเป็นอย่างไร
 * (หน้าจอ 2.7 ต้อง **ซ่อน** ปุ่ม ไม่ใช่ disable — `40` §20 · Rule 05)
 */

export interface AssignmentPolicy {
  /** เวลารอความยินยอมก่อน auto-resolve (`40` §11 — default 3 ชั่วโมง) */
  reassignTimeoutHours: number
  supervisorCanAssignSystem: boolean
  supervisorCanAssignInhouse: boolean
  supervisorCanAssignOutsource: boolean
  /** NULL = ไม่จำกัดเวลากดรับงานครั้งแรก (`40` §11 — ยังไม่บังคับใช้ในรอบนี้) */
  acceptDeadlineHours: number | null
}

/** ค่าตั้งต้นเมื่อองค์กรยังไม่เคยตั้งค่า (`40` §6.4 — default = เปิดให้หัวหน้าทำได้ทุกกลุ่ม) */
export const DEFAULT_ASSIGNMENT_POLICY: AssignmentPolicy = {
  reassignTimeoutHours: 3,
  supervisorCanAssignSystem: true,
  supervisorCanAssignInhouse: true,
  supervisorCanAssignOutsource: true,
  acceptDeadlineHours: null,
}

export function supervisorCanAssign(policy: AssignmentPolicy, roleGroup: RoleGroup): boolean {
  switch (roleGroup) {
    case 'system':
      return policy.supervisorCanAssignSystem
    case 'inhouse':
      return policy.supervisorCanAssignInhouse
    case 'outsource':
      return policy.supervisorCanAssignOutsource
    case 'finance_company':
      // ลูกค้าไม่มีบทบาทมอบหมายงานเลย (`40` §13) — ไม่ต้องมีค่าตั้งแยก
      return false
  }
}

export interface AssignmentActor {
  roleName: string
  roleGroup: RoleGroup
}

/**
 * ผู้ใช้คนนี้ทำ assign/reassign ได้หรือไม่ (นอกเหนือจาก capability ที่ตรวจไปแล้วที่ API layer)
 * — เฉพาะ **หัวหน้าทีม** เท่านั้นที่ถูกคุมด้วย settings ต่อ Role Group (`40` §6.4/§13)
 */
export function canPerformAssignmentAction(actor: AssignmentActor, policy: AssignmentPolicy): boolean {
  if (actor.roleName === SUPERADMIN_ROLE_NAME) return true
  if (actor.roleName !== TEAM_SUPERVISOR_ROLE_NAME) return true
  return supervisorCanAssign(policy, actor.roleGroup)
}
