import type { CaseStatus } from '@/lib/generated/prisma/enums'

/**
 * สถานะเคสที่มุมมองทีมเห็นได้ = หลังผ่านการอนุมัติแล้วเท่านั้น (UAT Q11 · BUG-023 · `38` §13)
 * — **pure** ใช้ร่วม server (`caseScopeWhere`) กับหน้าจอ "เคสทั้งหมดของทีม" (staging E-005)
 */
export const TEAM_VISIBLE_CASE_STATUSES = [
  'approved',
  'active',
  'closed_success',
  'closed_fail',
  'pending_recycle_review',
] as const satisfies readonly CaseStatus[]

export type TeamVisibleCaseStatus = (typeof TEAM_VISIBLE_CASE_STATUSES)[number]

export interface TeamCaseFilters {
  search: string
  /** `all` = ทุกสถานะที่ทีมเห็น */
  status: TeamVisibleCaseStatus | 'all'
}

/**
 * path ของ `GET /api/cases` สำหรับแท็บ "เคสทั้งหมดของทีม" (อ่านอย่างเดียว) — scope ทีมกรองที่ server เสมอ
 * (`caseScopeWhere`) หน้าจอส่งแค่ตัวกรองของผู้ใช้
 */
export function teamCasesListPath(filters: TeamCaseFilters, page: number, limit: number): string {
  const query = new URLSearchParams({ page: String(page), limit: String(limit) })
  if (filters.status !== 'all') query.set('status', filters.status)
  const search = filters.search.trim()
  if (search !== '') query.set('search', search)
  return `/api/cases?${query.toString()}`
}

export function isTeamVisibleCaseStatus(value: string | null | undefined): value is TeamVisibleCaseStatus {
  return TEAM_VISIBLE_CASE_STATUSES.some((status) => status === value)
}
