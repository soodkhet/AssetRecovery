import { describe, expect, it } from 'vitest'
import {
  assignmentListUrlParams,
  parseAssignmentListParams,
  teamCasesUrlParams,
} from '@/components/assignments/assignment-list-params'
import { mergeSearchParams } from '@/components/ui/url-state'

const TEAM_ID = '11111111-1111-4111-8111-111111111111'

function parse(query: string) {
  const params = new URLSearchParams(query)
  return parseAssignmentListParams((key) => params.get(key))
}

/** mytester7 S7-AG6-04 — หน้ามอบหมายงานเก็บตัวกรอง/คำค้น/หน้าใน URL แบบหน้ารับเคส */
describe('parseAssignmentListParams', () => {
  it('มุมมองรายการ: สถานะ/ทีม/คำค้น/หน้า จาก URL', () => {
    expect(parse(`status=assigned&search=MTJ&team=${TEAM_ID}&page=2`)).toMatchObject({
      view: 'list',
      filters: { search: 'MTJ', status: 'assigned', team: TEAM_ID },
      page: 2,
      teamPage: 1,
    })
  })

  it('ค่านอกชุด = ค่าเริ่มต้น (ไม่ส่งต่อให้ API แล้วตาราง error)', () => {
    expect(parse('status=bogus&team=not-a-uuid&page=-3&view=weird')).toMatchObject({
      view: 'list',
      filters: { search: '', status: 'all', team: 'all' },
      page: 1,
    })
  })

  it('มุมมองเคสทั้งหมดของทีม: search/page เป็นของแท็บทีม ไม่ปนกับรายการ', () => {
    const parsed = parse('view=team&caseStatus=closed_success&search=MTJ&page=3')
    expect(parsed.view).toBe('team')
    expect(parsed.teamFilters).toEqual({ search: 'MTJ', status: 'closed_success' })
    expect(parsed.teamPage).toBe(3)
    expect(parsed.filters.search).toBe('')
    expect(parsed.page).toBe(1)
  })

  it('เขียนลง URL แล้วอ่านกลับได้ค่าเดิม (refresh แล้วไม่หาย) · ค่าเริ่มต้นไม่ใส่', () => {
    const filters = { search: ' MTJ ', status: 'assigned', team: 'all' }
    const query = mergeSearchParams('', assignmentListUrlParams(filters, 2))
    expect(query).toBe('search=MTJ&status=assigned&page=2')
    expect(parse(query)).toMatchObject({ filters: { search: 'MTJ', status: 'assigned', team: 'all' }, page: 2 })
    expect(mergeSearchParams('', assignmentListUrlParams({ search: '', status: 'all', team: 'all' }, 1))).toBe('')

    const teamQuery = mergeSearchParams('', teamCasesUrlParams({ search: 'MTJ', status: 'all' }, 1))
    expect(teamQuery).toBe('view=team&search=MTJ')
    expect(parse(teamQuery).teamFilters).toEqual({ search: 'MTJ', status: 'all' })
  })
})
