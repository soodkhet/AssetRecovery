import { describe, expect, it } from 'vitest'
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
