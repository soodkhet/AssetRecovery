import { describe, expect, it } from 'vitest'
import { isTeamVisibleCaseStatus, teamCasesListPath, TEAM_VISIBLE_CASE_STATUSES } from '@/lib/cases/team-visibility'
import { caseListQuerySchema } from '@/lib/cases/schemas'

describe('แท็บ "เคสทั้งหมดของทีม" (staging E-005)', () => {
  it('รวมเคสที่ปิดแล้ว (สำเร็จ/ไม่สำเร็จ) และรอพิจารณารีไซเคิล', () => {
    expect(TEAM_VISIBLE_CASE_STATUSES).toEqual([
      'approved',
      'active',
      'closed_success',
      'closed_fail',
      'pending_recycle_review',
    ])
  })

  it('path ส่งเฉพาะตัวกรองที่เลือก และค่าผ่าน schema ของ GET /api/cases', () => {
    expect(teamCasesListPath({ search: '', status: 'all' }, 1, 20)).toBe('/api/cases?page=1&limit=20')
    const path = teamCasesListPath({ search: '  E2E-06 ', status: 'closed_success' }, 2, 20)
    expect(path).toBe('/api/cases?page=2&limit=20&status=closed_success&search=E2E-06')
    const query = Object.fromEntries(new URL(path, 'http://localhost').searchParams)
    expect(caseListQuerySchema.safeParse(query).success).toBe(true)
  })

  it('ค่า status จาก URL ที่ไม่ใช่สถานะของทีม ⇒ ไม่รับ', () => {
    expect(isTeamVisibleCaseStatus('closed_fail')).toBe(true)
    expect(isTeamVisibleCaseStatus('draft')).toBe(false)
    expect(isTeamVisibleCaseStatus(undefined)).toBe(false)
  })
})
