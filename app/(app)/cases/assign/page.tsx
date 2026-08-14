import { AssignmentsManager } from '@/components/assignments/assignments-manager'
import { canPerformAssignmentAction } from '@/lib/assignments/policy'
import { getAssignmentPolicy } from '@/lib/assignments/policy-queries'
import { requireMenuPage } from '@/lib/nav/menu-guard'

/**
 * จัดการเคส → มอบหมายงาน (`40` §5/§7 · `06` §7.1.1)
 *
 * `canAct` มาจาก settings ต่อ Role Group (`40` §6.4) — **หัวหน้าทีมที่ถูกปิดสิทธิ์จะไม่เห็นปุ่ม
 * assign/reassign เลย (hide ไม่ใช่ disabled — §7.2)** แต่ยังเห็นตาราง Kanban และรายละเอียดได้ตามปกติ
 * เป็นชั้น UX เท่านั้น — endpoint ตรวจ `canPerformAssignmentAction()` ซ้ำทุกครั้ง (DEC-002)
 */
export default async function CaseAssignPage() {
  const user = await requireMenuPage('cases.assign')
  const policy = await getAssignmentPolicy(user.organizationId)
  const canAct = canPerformAssignmentAction({ roleName: user.roleName, roleGroup: user.roleGroup }, policy)

  return <AssignmentsManager canAct={canAct} />
}
