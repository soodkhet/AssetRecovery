import { describe, expect, it } from 'vitest'
import { caseDecisionEventOf } from '@/lib/cases/status-queries'
import { caseEventsFor } from '@/lib/cases/state-machine'

/**
 * ผู้ส่งเคสต้องได้แจ้งเตือน **ใบเดียว** ต่อการกดหนึ่งครั้ง (`90` §6.3 แถว 1–2)
 * — `approve_recycle` ยิงทั้ง `case.recycle_approved` และ `case.approved` จาก `caseEventsFor()`
 */

describe('caseDecisionEventOf()', () => {
  it('รีไซเกิลชนะ approved เสมอ (ข้อความเฉพาะเจาะจงกว่า)', () => {
    expect(caseDecisionEventOf(caseEventsFor('approve_recycle'))).toBe('case.recycle_approved')
  })

  it('เลือกตรงตัวสำหรับ accept/reject/request_more_info', () => {
    expect(caseDecisionEventOf(caseEventsFor('accept'))).toBe('case.approved')
    expect(caseDecisionEventOf(caseEventsFor('reject'))).toBe('case.rejected')
    expect(caseDecisionEventOf(caseEventsFor('request_more_info'))).toBe('case.need_info_requested')
  })

  it('action ที่ไม่ใช่การตัดสินเคส = ไม่แจ้งใคร', () => {
    expect(caseDecisionEventOf(caseEventsFor('review'))).toBeNull()
    expect(caseDecisionEventOf(caseEventsFor('create_recycle_request'))).toBeNull()
    expect(caseDecisionEventOf([])).toBeNull()
  })
})
