import { DEFAULT_ASSIGNMENT_POLICY, type AssignmentPolicy } from '@/lib/assignments/policy'
import { prisma } from '@/lib/prisma'

/**
 * ค่าตั้งของการมอบหมายงานต่อองค์กร (`40` §6.4) — ชั้น DB
 * ยังไม่มีองค์กรไหนตั้งค่า = ใช้ค่า default ของสเปค (ไม่บังคับให้ seed ก่อนใช้งาน)
 *
 * หน้าจอตั้งค่า (Superadmin) ยังไม่มี endpoint ใน `45` — งานของ Settings รอบถัดไป
 */
export async function getAssignmentPolicy(organizationId: string): Promise<AssignmentPolicy> {
  const row = await prisma.assignmentPolicySettings.findUnique({
    where: { organizationId },
    select: {
      reassignTimeoutHours: true,
      supervisorCanAssignSystem: true,
      supervisorCanAssignInhouse: true,
      supervisorCanAssignOutsource: true,
      acceptDeadlineHours: true,
      slaAlertHours: true,
    },
  })
  return row === null ? DEFAULT_ASSIGNMENT_POLICY : row
}
