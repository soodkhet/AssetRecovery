import { describe, expect, it } from 'vitest'
import { caseDetailMode, caseModalActions, caseRowActions, showsReasonBox } from '@/lib/cases/case-actions'

/** `38` §7.5 — 4 โหมดของ Case Detail/Review Modal + ปุ่มต่อโหมด */

const approver = (capability: string): boolean => capability === 'approve_case'
const admin = (capability: string): boolean => capability === 'record_admin_data'
const nobody = (): boolean => false

describe('caseDetailMode', () => {
  it.each([
    ['pending_review', 'review'],
    ['closed_fail', 'recycle_request'],
    ['pending_recycle_review', 'recycle_review'],
    ['draft', 'readonly'],
    ['approved', 'readonly'],
    ['rejected', 'readonly'],
    ['need_info', 'readonly'],
    ['closed_success', 'readonly'],
  ])('สถานะ %s → โหมด %s', (status, mode) => {
    expect(caseDetailMode(status)).toBe(mode)
  })
})

describe('caseModalActions', () => {
  it('pending_review = 3 ปุ่มตามลำดับ §7.5 (สำหรับเจ้าหน้าที่อนุมัติเคส)', () => {
    expect(caseModalActions('pending_review', approver).map((button) => button.action)).toEqual([
      'reject',
      'request_more_info',
      'accept',
    ])
    expect(caseModalActions('pending_review', approver)[2]?.label).toBe('รับเคส & ยืนยันทีม')
  })

  it('closed_fail = ปุ่มขอรีไซเกิลปุ่มเดียว และบังคับหมายเหตุ', () => {
    const buttons = caseModalActions('closed_fail', approver)
    expect(buttons).toHaveLength(1)
    expect(buttons[0]).toMatchObject({ action: 'create_recycle_request', reasonRequired: true })
  })

  it('pending_recycle_review = 2 ปุ่ม (ไม่อนุมัติ / อนุมัติรีไซเกิล)', () => {
    expect(caseModalActions('pending_recycle_review', approver).map((button) => button.action)).toEqual([
      'reject_recycle',
      'approve_recycle',
    ])
  })

  it('สถานะอื่นไม่มีปุ่ม action เลย (อ่านอย่างเดียว)', () => {
    for (const status of ['draft', 'approved', 'rejected', 'need_info', 'closed_success']) {
      expect(caseModalActions(status, approver)).toEqual([])
    }
  })

  it('ไม่มี capability `approve_case` = ไม่เห็นปุ่มพิจารณาเลย (ธุรการ)', () => {
    expect(caseModalActions('pending_review', admin)).toEqual([])
    expect(caseModalActions('pending_review', nobody)).toEqual([])
  })
})

describe('caseRowActions', () => {
  it('draft = ส่งตรวจสอบ (ธุรการทำได้)', () => {
    expect(caseRowActions('draft', admin).map((button) => button.action)).toEqual(['review'])
  })

  it('need_info = กลับไปแก้ไขเป็นร่าง', () => {
    expect(caseRowActions('need_info', admin).map((button) => button.action)).toEqual(['return_to_draft'])
  })

  it('ไม่มีปุ่มพิจารณา/รีไซเกิลหลุดมาอยู่บนแถว (อยู่บน modal เท่านั้น)', () => {
    expect(caseRowActions('pending_review', approver)).toEqual([])
    expect(caseRowActions('closed_fail', approver)).toEqual([])
  })
})

describe('showsReasonBox', () => {
  it('แสดงช่องเหตุผลเฉพาะโหมดที่มี action บังคับเหตุผล', () => {
    expect(showsReasonBox('pending_review')).toBe(true)
    expect(showsReasonBox('closed_fail')).toBe(true)
    expect(showsReasonBox('pending_recycle_review')).toBe(true)
    expect(showsReasonBox('approved')).toBe(false)
  })
})
