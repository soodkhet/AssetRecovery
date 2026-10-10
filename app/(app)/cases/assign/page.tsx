import type { Metadata } from 'next'
import { AssignmentsManager } from '@/components/assignments/assignments-manager'
import { ASSIGNMENT_STATE_FILTERS } from '@/lib/assignments/schemas'
import { canPerformAssignmentAction } from '@/lib/assignments/policy'
import { getAssignmentPolicy } from '@/lib/assignments/policy-queries'
import { isTeamVisibleCaseStatus } from '@/lib/cases/team-visibility'
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
  searchParams: Promise<{ status?: string; view?: string; caseStatus?: string }>
}) {
  const user = await requireMenuPage('cases.assign')
  const policy = await getAssignmentPolicy(user.organizationId)
  const canAct = canPerformAssignmentAction({ roleName: user.roleName, roleGroup: user.roleGroup }, policy)

  // ลิงก์จากคิวแดชบอร์ด (`?status=ready_to_assign`) เปิดมาที่ตัวกรองเดียวกับที่คิวนับ (มติ PO O72(4))
  const { status, view, caseStatus } = await searchParams
  const initialStatus = ASSIGNMENT_STATE_FILTERS.find((state) => state === status) ?? 'all'
  // staging E-005 — `?view=team` เปิดแท็บ "เคสทั้งหมดของทีม" (+ `caseStatus` จากแถวกระดานเคสบนแดชบอร์ด)
  return (
    <AssignmentsManager
      canAct={canAct}
      initialStatus={initialStatus}
      initialView={view === 'team' ? 'team' : 'list'}
      initialTeamStatus={isTeamVisibleCaseStatus(caseStatus) ? caseStatus : 'all'}
    />
  )
}
