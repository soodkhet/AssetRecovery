import { describe, expect, it } from 'vitest'
import { isReportableCaseStatus, reportableCaseStatusWhere } from '@/lib/reports/case-scope'

describe('ขอบเขตเคสของรายงาน (มติชั่วคราว M7 J-07)', () => {
  it('ไม่นับร่าง/ไม่รับเคส · นับสถานะที่รับเข้าระบบแล้วทั้งหมด', () => {
    expect(isReportableCaseStatus('draft')).toBe(false)
    expect(isReportableCaseStatus('rejected')).toBe(false)
    for (const status of ['pending_review', 'need_info', 'approved', 'active', 'pending_recycle_review', 'closed_success', 'closed_fail'] as const) {
      expect(isReportableCaseStatus(status)).toBe(true)
    }
    expect(reportableCaseStatusWhere()).toEqual({ status: { notIn: ['draft', 'rejected'] } })
  })
})
