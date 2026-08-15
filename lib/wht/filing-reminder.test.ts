import { describe, expect, it } from 'vitest'
import { whtFilingDueMessage, whtFilingReminderStage } from '@/lib/notifications/messages'
import { daysUntilFilingDue, WHT_FILING_REMINDER_DAYS_BEFORE } from '@/lib/wht/filing-reminder-job'

/**
 * นับวันถึงกำหนดนำส่ง ภ.ง.ด. (`33` §6.2/§8) — ต้องนับบน **ปฏิทินไทย** ไม่ใช่ชั่วโมงดิบ
 * ไม่งั้นการรัน job ตอนเย็นของไทย (= เช้าวัน UTC เดียวกัน) จะได้ตัวเลขคลาดไปหนึ่งวัน
 */

describe('daysUntilFilingDue()', () => {
  const due = new Date('2026-09-15T00:00:00Z')

  it('นับจากเที่ยงคืนไทยของวันนี้ — เวลาในวันไม่ทำให้ตัวเลขเปลี่ยน', () => {
    // 10/09 เวลาไทย 07:00 กับ 23:00 คือวันเดียวกัน ⇒ เหลือ 5 วันเท่ากัน
    expect(daysUntilFilingDue(due, new Date('2026-09-10T00:00:00Z'))).toBe(5)
    expect(daysUntilFilingDue(due, new Date('2026-09-10T16:00:00Z'))).toBe(5)
  })

  it('วันครบกำหนดพอดี = 0 · เลยกำหนดแล้วติดลบ', () => {
    expect(daysUntilFilingDue(due, new Date('2026-09-15T02:00:00Z'))).toBe(0)
    expect(daysUntilFilingDue(due, new Date('2026-09-17T02:00:00Z'))).toBe(-2)
  })

  it('ข้ามเดือน/ข้ามปีนับถูก', () => {
    expect(daysUntilFilingDue(new Date('2027-01-15T00:00:00Z'), new Date('2026-12-31T05:00:00Z'))).toBe(15)
  })

  it('ค่าเริ่มต้นการเตือนล่วงหน้า = 5 วันตามตัวอย่างของ `33` §8', () => {
    expect(WHT_FILING_REMINDER_DAYS_BEFORE).toBe(5)
  })
})

/**
 * คีย์กันซ้ำต้องเปลี่ยนตามวัน ไม่งั้น job รายวันเตือน **ครั้งเดียวตลอดชีพของงวด**
 * แล้วข้อความ "ครบกำหนดวันนี้"/"เลยกำหนด" ไม่มีวันถึงผู้ใช้ (`33` §6.2 — พลาดกำหนดมีโทษปรับ)
 */
describe('ขั้นของการเตือนยื่น ภ.ง.ด. (dedupe key)', () => {
  const due = new Date('2026-09-15T00:00:00Z')
  const keyAt = (at: string): string =>
    whtFilingDueMessage({
      summaryId: 'sum-1',
      periodLabel: '09/2569',
      filingDueDate: due,
      daysLeft: daysUntilFilingDue(due, new Date(at)),
    }).dedupeKey ?? ''

  it('รันซ้ำหลายรอบในวันเดียวกัน = คีย์เดิม (ได้แถวเดียว)', () => {
    expect(keyAt('2026-09-10T01:00:00Z')).toBe(keyAt('2026-09-10T16:00:00Z'))
  })

  it('วันถัดไป = คีย์ใหม่ (ได้เตือนอีกใบ)', () => {
    expect(keyAt('2026-09-11T01:00:00Z')).not.toBe(keyAt('2026-09-10T01:00:00Z'))
  })

  it('วันครบกำหนดมีคีย์ของตัวเอง แยกจากช่วงนับถอยหลัง', () => {
    expect(whtFilingReminderStage(0)).toBe('d0')
    expect(whtFilingReminderStage(1)).toBe('d1')
    expect(whtFilingReminderStage(5)).toBe('d5')
  })

  it('เลยกำหนดแล้วเตือนสัปดาห์ละครั้ง — ไม่รบกวนทุกวันแต่ไม่เงียบหาย', () => {
    expect(whtFilingReminderStage(-1)).toBe('overdue-w1')
    expect(whtFilingReminderStage(-7)).toBe('overdue-w1')
    expect(whtFilingReminderStage(-8)).toBe('overdue-w2')
    expect(whtFilingReminderStage(-14)).toBe('overdue-w2')
    expect(whtFilingReminderStage(-15)).toBe('overdue-w3')
  })

  it('คีย์ผูกกับงวด — คนละงวดไม่กลืนกันแม้อยู่ขั้นเดียวกัน', () => {
    const other = whtFilingDueMessage({
      summaryId: 'sum-2',
      periodLabel: '09/2569',
      filingDueDate: due,
      daysLeft: 5,
    }).dedupeKey
    expect(other).not.toBe(keyAt('2026-09-10T01:00:00Z'))
  })
})
