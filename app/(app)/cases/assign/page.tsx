import type { Metadata } from 'next'
import { AssignmentsManager } from '@/components/assignments/assignments-manager'
import { parseAssignmentListParams } from '@/components/assignments/assignment-list-params'
import { canPerformAssignmentAction } from '@/lib/assignments/policy'
import { getAssignmentPolicy } from '@/lib/assignments/policy-queries'
import { requireMenuPage } from '@/lib/nav/menu-guard'

export const metadata: Metadata = { title: 'มอบหมายงาน' }

/**
 * จัดการเคส → มอบหมายงาน (`40` §5/§7 · `06` §7.1.1)
 *
 * `canAct` มาจาก settings ต่อ Role Group (`40` §6.4) — **หัวหน้าทีมที่ถูกปิดสิทธิ์จะไม่เห็นปุ่ม
 * assign/reassign เลย (hide ไม่ใช่ disabled — §7.2)** แต่ยังเห็นตาราง Kanban และรายละเอียดได้ตามปกติ
 * เป็นชั้น UX เท่านั้น — endpoint ตรวจ `canPerformAssignmentAction()` ซ้ำทุกครั้ง (DEC-002)
 */
export default async function CaseAssignPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const user = await requireMenuPage('cases.assign')
  const policy = await getAssignmentPolicy(user.organizationId)
  const canAct = canPerformAssignmentAction({ roleName: user.roleName, roleGroup: user.roleGroup }, policy)

  // ตัวกรอง/หน้า/มุมมองอยู่ใน URL (mytester7 S7-AG6-04) — ลิงก์จากคิวแดชบอร์ด (`?status=ready_to_assign` มติ PO O72(4))
  // · `?view=team` (+ `caseStatus`) เปิดแท็บ "เคสทั้งหมดของทีม" (staging E-005) อ่านด้วยตัวแปลงเดียวกับ component
  const params = await searchParams
  const initialParams = parseAssignmentListParams((key) => {
    const value = params[key]
    return Array.isArray(value) ? value[0] : value
  })
  return <AssignmentsManager canAct={canAct} initialParams={initialParams} />
}
