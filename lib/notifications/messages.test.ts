import { describe, expect, it } from 'vitest'
import { NOTIFICATION_ONLY_EVENTS, isNotificationEvent, type NotificationEventCode } from '@/lib/notifications/events'
import {
  accountantQuestionMessage,
  advanceOverdueMessage,
  assetIntakeRejectedMessage,
  caseClosedFailMessage,
  caseClosedSuccessMessage,
  caseDecisionMessage,
  clip,
  exceptionCreatedMessage,
  expenseApprovedMessage,
  expenseRejectedMessage,
  lotConfirmedMessage,
  payoutBatchCompletedMessage,
  periodSentToAccountantMessage,
  reassignmentRequestedMessage,
  reassignmentTimeoutMessage,
  whtFilingDueMessage,
  type NotificationMessage,
} from '@/lib/notifications/messages'

/**
 * ข้อความแจ้งเตือนของ Phase 5.2 — สิ่งที่เทสต์ชุดนี้ล็อกไว้:
 * 1. ทุกข้อความใช้ code ที่อยู่ในแค็ตตาล็อก (`90` §6.3) และ **ไม่ใช่** ตัวที่ยัง emit ไม่ได้
 * 2. วันที่บนข้อความเป็น **พ.ศ.** เสมอ (Rule 01) — ค.ศ. บนหน้าจอ = bug
 * 3. เหตุการณ์ที่ผู้เรียกเป็น job/consumer ต้องมี `dedupeKey` เสมอ ไม่งั้นรันซ้ำ = แจ้งซ้ำ
 */

const ALL: readonly NotificationMessage[] = [
  caseDecisionMessage('case.approved', { caseId: 'c1', caseRef: 'CASE-26-0001', reason: 'ครบเอกสาร' }),
  reassignmentRequestedMessage({ caseRef: 'CASE-26-0002', reason: 'ลาป่วย', expiresAt: new Date('2026-08-20T10:00:00Z') }),
  reassignmentTimeoutMessage({ caseRef: 'CASE-26-0003', pendingReassignmentId: 'p1' }),
  caseClosedSuccessMessage({ caseRef: 'CASE-26-0004', agentName: 'สมชาย' }),
  caseClosedFailMessage({ caseRef: 'CASE-26-0005', agentName: null }),
  assetIntakeRejectedMessage({ caseRef: 'CASE-26-0006', reason: 'IMEI ไม่ตรง' }),
  lotConfirmedMessage({ lotId: 'l1', lotNumber: 'LOT-2569-001', companyName: 'สยามไฟแนนซ์', assetCount: 3, revenueCount: 2 }),
  expenseApprovedMessage({ grossSatang: 125050, caseRef: 'CASE-26-0007' }),
  expenseRejectedMessage({ grossSatang: 50000, reason: 'ใบเสร็จไม่ชัด' }),
  payoutBatchCompletedMessage({ batchId: 'b1', batchName: 'รอบจ่าย Outsource', netSatang: 9900000, source: 'manual' }),
  advanceOverdueMessage({ advanceId: 'a1', dueClearDate: new Date('2026-08-10T00:00:00Z') }, 'payee'),
  exceptionCreatedMessage({ title: 'ใบกำกับหาย', periodLabel: 'สิงหาคม 2569' }),
  whtFilingDueMessage({
    summaryId: 's1',
    periodLabel: 'สิงหาคม 2569',
    filingDueDate: new Date('2026-09-15T00:00:00Z'),
    daysLeft: 5,
  }),
  accountantQuestionMessage({ periodLabel: 'สิงหาคม 2569', questionText: 'ค่าน้ำมันเดือนนี้ต่างจากเดือนก่อนมาก' }),
  periodSentToAccountantMessage({ periodId: 'pd1', periodLabel: 'สิงหาคม 2569' }),
]

describe('ข้อความแจ้งเตือนทุกตัว', () => {
  it('ใช้ event code ที่อยู่ในแค็ตตาล็อก และเป็นตัวที่โมดูล emit ได้จริง', () => {
    const blocked = new Set<NotificationEventCode>(NOTIFICATION_ONLY_EVENTS)
    for (const message of ALL) {
      expect(isNotificationEvent(message.eventCode), message.eventCode).toBe(true)
      expect(blocked.has(message.eventCode), `${message.eventCode} ยัง emit ไม่ได้`).toBe(false)
    }
  })

  it('มีหัวข้อเสมอ และลิงก์เป็น path ภายในแอปเท่านั้น (กัน open redirect)', () => {
    for (const message of ALL) {
      expect(message.title.length).toBeGreaterThan(0)
      expect(message.linkPath?.startsWith('/'), message.eventCode).toBe(true)
      expect(message.linkPath?.startsWith('//')).toBe(false)
    }
  })

  it('ไม่มีปี ค.ศ. หลุดลงข้อความ — วันที่ต้องเป็น พ.ศ. (Rule 01)', () => {
    for (const message of ALL) {
      expect(`${message.title} ${message.body ?? ''}`).not.toMatch(/\b20\d{2}\b/)
    }
  })

  it('เหตุการณ์ฝั่ง job/consumer มี dedupeKey ครบ (รันซ้ำต้องไม่แจ้งซ้ำ)', () => {
    const mustDedupe = new Set([
      'assignment.reassignment_timeout_resolved',
      'lot.confirmed',
      'payout_batch.completed',
      'advance.overdue',
      'wht.filing_due_reminder',
      'period.sent_to_accountant',
    ])
    for (const message of ALL) {
      if (!mustDedupe.has(message.eventCode)) continue
      expect(message.dedupeKey, message.eventCode).toBeTruthy()
      // คีย์ต้องคำนวณซ้ำได้ ⇒ ห้ามมีเวลาปัจจุบัน/ค่าสุ่มปนเข้าไป
      expect(message.dedupeKey).not.toMatch(/\d{13}/)
    }
  })
})

describe('รายละเอียดข้อความรายตัว', () => {
  it('การตัดสินเคสใช้หัวข้อตาม action และแนบเหตุผลต่อท้าย', () => {
    const rejected = caseDecisionMessage('case.rejected', { caseId: 'c1', caseRef: 'CASE-26-0010', reason: 'เอกสารไม่ครบ' })
    expect(rejected.title).toBe('เคสถูกปฏิเสธ')
    expect(rejected.body).toBe('เคส CASE-26-0010 — เอกสารไม่ครบ')
  })

  it('ไม่มีเหตุผล = ไม่มีขีดคั่นห้อยท้าย', () => {
    const approved = caseDecisionMessage('case.approved', { caseId: 'c1', caseRef: 'CASE-26-0011', reason: null })
    expect(approved.body).toBe('เคส CASE-26-0011')
  })

  it('วันครบกำหนดตอบคำขอเปลี่ยนผู้รับผิดชอบแสดงเป็น พ.ศ.', () => {
    const message = reassignmentRequestedMessage({
      caseRef: 'CASE-26-0012',
      reason: null,
      expiresAt: new Date('2026-08-20T03:00:00Z'),
    })
    expect(message.body).toContain('20/08/2569')
  })

  it('ยอดเงินแสดงจาก satang เป็นบาท (ห้ามคำนวณเองที่หน้าจอ)', () => {
    expect(expenseApprovedMessage({ grossSatang: 125050, caseRef: null }).body).toContain('฿1,250.50')
    expect(expenseApprovedMessage({ grossSatang: 125050, caseRef: null }).body).not.toContain('(เคส')
  })

  it('ล็อตที่ยังไม่เกิดรายได้บอกตรง ๆ ว่ารออนุมัติค่าตอบแทน (`19` §6.1)', () => {
    const none = lotConfirmedMessage({
      lotId: 'l2',
      lotNumber: 'LOT-2569-002',
      companyName: 'เอ',
      assetCount: 1,
      revenueCount: 0,
    })
    expect(none.body).toContain('ยังไม่เกิดรายได้')
    expect(none.dedupeKey).toBe('lot-l2')
  })

  it('เงินทดรองเลยกำหนดส่งลิงก์คนละปลายทางตามผู้รับ แต่ใช้คีย์กันซ้ำตัวเดียวกัน', () => {
    const input = { advanceId: 'a9', dueClearDate: new Date('2026-08-10T00:00:00Z') }
    expect(advanceOverdueMessage(input, 'payee').linkPath).toBe('/field/income')
    expect(advanceOverdueMessage(input, 'finance').linkPath).toBe('/finance?tab=advances')
    expect(advanceOverdueMessage(input, 'payee').dedupeKey).toBe(advanceOverdueMessage(input, 'finance').dedupeKey)
  })

  it('WHT: นับถอยหลัง/ครบกำหนดวันนี้/เลยกำหนด ใช้ข้อความคนละแบบ (`33` §6.2 มีโทษปรับ)', () => {
    const base = { summaryId: 's1', periodLabel: 'สิงหาคม 2569', filingDueDate: new Date('2026-09-15T00:00:00Z') }
    expect(whtFilingDueMessage({ ...base, daysLeft: 5 }).body).toContain('เหลือ 5 วัน')
    expect(whtFilingDueMessage({ ...base, daysLeft: 0 }).body).toContain('ครบกำหนดวันนี้')
    expect(whtFilingDueMessage({ ...base, daysLeft: -2 }).body).toContain('เลยกำหนดมาแล้ว 2 วัน')
  })
})

describe('clip()', () => {
  it('ข้อความว่าง/ช่องว่างล้วน = null', () => {
    expect(clip('   ')).toBeNull()
    expect(clip(null)).toBeNull()
  })

  it('ยาวเกินกำหนดถูกตัดพร้อมจุดไข่ปลา', () => {
    expect(clip('ก'.repeat(200))).toHaveLength(120)
    expect(clip('ก'.repeat(200))?.endsWith('…')).toBe(true)
  })
})
