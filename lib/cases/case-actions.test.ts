import { describe, expect, it } from 'vitest'
import {
  CASE_ACTION_CONFIRM,
  caseActionSuccessTitle,
  caseDetailDescription,
  caseDetailMode,
  caseModalActions,
  caseReasonFieldLabel,
  caseRowActions,
  caseRowOpensReview,
  recycleHistoryLine,
  showsReasonBox,
} from '@/lib/cases/case-actions'

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

describe('confirmRequired — action ที่ย้อนกลับไม่ได้ต้องยืนยัน (preship R3-013)', () => {
  it('ไม่รับเคส ต้องยืนยัน · ขอข้อมูลเพิ่ม/รับเคส ไม่ต้อง', () => {
    const buttons = caseModalActions('pending_review', () => true)
    expect(buttons.find((b) => b.action === 'reject')?.confirmRequired).toBe(true)
    expect(buttons.find((b) => b.action === 'request_more_info')?.confirmRequired).toBe(false)
    expect(buttons.find((b) => b.action === 'accept')?.confirmRequired).toBe(false)
  })
})

describe('caseRowOpensReview (staging E-025)', () => {
  it('ปุ่ม "พิจารณา" เฉพาะผู้ตัดสินได้ — ธุรการ/ผู้ไม่มีสิทธิ์เห็น "ดูรายละเอียด"', () => {
    expect(caseRowOpensReview('pending_review', approver)).toBe(true)
    expect(caseRowOpensReview('pending_recycle_review', approver)).toBe(true)
    expect(caseRowOpensReview('pending_review', admin)).toBe(false)
    expect(caseRowOpensReview('pending_review', nobody)).toBe(false)
  })
  it('สถานะที่ไม่ใช่การรอตัดสินใจ ⇒ ดูรายละเอียดเสมอ', () => {
    expect(caseRowOpensReview('closed_fail', approver)).toBe(false)
    expect(caseRowOpensReview('draft', approver)).toBe(false)
  })
})

describe('ข้อความรีไซเกิล/คำบรรยาย/ยืนยัน (staging E-032/E-033/E-034)', () => {
  it('toast สำเร็จเป็นภาษาผู้ใช้ ไม่ต่อคำบนปุ่ม', () => {
    expect(caseActionSuccessTitle('create_recycle_request')).toBe('ส่งคำขอรีไซเกิลแล้ว')
    expect(caseActionSuccessTitle('reject')).toBe('บันทึกไม่รับเคสแล้ว')
  })

  it('ประวัติรีไซเกิล — คำขอที่ยังรอแสดงรอบปัจจุบัน → ถัดไป + สถานะไทย', () => {
    expect(recycleHistoryLine({ previousRound: null, newRound: null, status: 'pending' }, 1)).toBe('รอบ 1 → 2 · รออนุมัติ')
    expect(recycleHistoryLine({ previousRound: 1, newRound: 2, status: 'approved' }, 2)).toBe('รอบ 1 → 2 · อนุมัติแล้ว')
    expect(recycleHistoryLine({ previousRound: null, newRound: null, status: 'rejected' }, 1)).toBe('รอบ 1 · ไม่อนุมัติ')
  })

  it('โหมดอ่านอย่างเดียวที่ตีกลับหลักฐานได้ ⇒ คำบรรยายไม่บอกว่าแก้ไม่ได้อย่างเดียว', () => {
    expect(caseDetailDescription('readonly', { canRejectEvidence: true })).toContain('ตีกลับ')
    expect(caseDetailDescription('readonly')).toContain('แก้ไขจากหน้านี้ไม่ได้')
  })

  it('อนุมัติรีไซเกิลต้องยืนยัน · ป้ายช่องหมายเหตุบอกว่าใช้ตอนอนุมัติได้', () => {
    const buttons = caseModalActions('pending_recycle_review', () => true)
    expect(buttons.find((b) => b.action === 'approve_recycle')?.confirmRequired).toBe(true)
    expect(CASE_ACTION_CONFIRM.approve_recycle?.danger).toBe(false)
    expect(caseReasonFieldLabel('recycle_review')).toContain('อนุมัติ')
  })
})
