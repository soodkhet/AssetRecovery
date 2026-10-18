import { pickPage, pickParam, pickUuid } from '@/components/ui/url-state'
import { ASSIGNMENT_STATE_FILTERS } from '@/lib/assignments/schemas'
import { TEAM_VISIBLE_CASE_STATUSES, type TeamCaseFilters } from '@/lib/cases/team-visibility'

/**
 * ตัวกรอง/หน้า/มุมมองของหน้ามอบหมายงาน ผูกกับ URL (mytester7 S7-AG6-04 — แนวเดียวกับหน้ารับเคส preship PS-013/R6-004)
 * ใช้ทั้ง page (server `searchParams`) และ component (URL จริงของ browser ตอน Back) ด้วยกติกาเดียวกัน ⇒ hydrate ไม่ mismatch
 *
 * key: `view` (`team`/`kanban` · รายการ = ไม่ใส่) · รายการ: `status` `team` `search` `page` ·
 * เคสทั้งหมดของทีม: `caseStatus` `search` `page` — `search`/`page` เป็นของมุมมองที่เปิดอยู่เท่านั้น
 * (เปลี่ยนมุมมองล้าง URL ก่อน — `clearUrlParamsExcept`)
 */

export const ASSIGNMENT_VIEWS = ['list', 'kanban', 'team'] as const
export type AssignmentView = (typeof ASSIGNMENT_VIEWS)[number]

export interface AssignmentListFilters {
  search: string
  /** `all` หรือค่าใน `ASSIGNMENT_STATE_FILTERS` */
  status: string
  /** `all` หรือ id ทีม */
  team: string
}

export const EMPTY_ASSIGNMENT_FILTERS: AssignmentListFilters = { search: '', status: 'all', team: 'all' }

export interface AssignmentListParams {
  view: AssignmentView
  filters: AssignmentListFilters
  page: number
  teamFilters: TeamCaseFilters
  teamPage: number
}

export function parseAssignmentListParams(get: (key: string) => string | null | undefined): AssignmentListParams {
  const value = (key: string) => get(key) ?? undefined
  const view = pickParam(value('view'), ASSIGNMENT_VIEWS, 'list')
  const search = (value('search') ?? '').slice(0, 100)
  const page = pickPage(value('page'))
  return {
    view,
    filters: {
      search: view === 'list' ? search : '',
      status: pickParam<(typeof ASSIGNMENT_STATE_FILTERS)[number] | 'all'>(
        value('status'),
        ASSIGNMENT_STATE_FILTERS,
        'all',
      ),
      team: pickUuid(value('team')) ?? 'all',
    },
    page: view === 'list' ? page : 1,
    teamFilters: {
      search: view === 'team' ? search : '',
      status: pickParam<TeamCaseFilters['status']>(value('caseStatus'), TEAM_VISIBLE_CASE_STATUSES, 'all'),
    },
    teamPage: view === 'team' ? page : 1,
  }
}

/** ค่าที่เขียนลง URL ของมุมมองรายการ — ค่าเริ่มต้นไม่ใส่ (URL สั้น) */
export function assignmentListUrlParams(
  filters: AssignmentListFilters,
  page: number,
): Record<string, string | number | null> {
  return {
    view: null,
    search: filters.search.trim(),
    status: filters.status === 'all' ? null : filters.status,
    team: filters.team === 'all' ? null : filters.team,
    page: page === 1 ? null : page,
  }
}

/** ค่าที่เขียนลง URL ของมุมมอง "เคสทั้งหมดของทีม" */
export function teamCasesUrlParams(filters: TeamCaseFilters, page: number): Record<string, string | number | null> {
  return {
    view: 'team',
    search: filters.search.trim(),
    caseStatus: filters.status === 'all' ? null : filters.status,
    page: page === 1 ? null : page,
  }
}

export function sameAssignmentListFilters(a: AssignmentListFilters, b: AssignmentListFilters): boolean {
  return a.search.trim() === b.search.trim() && a.status === b.status && a.team === b.team
}
