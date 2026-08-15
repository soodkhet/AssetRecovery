import { periodOrdinal, type PeriodKey } from '@/lib/accounting/period'
import { periodKeyOf } from '@/lib/adjustments/adjustment'
import type { ReportRange } from '@/lib/reports/range'

/**
 * ช่วง **รอบบัญชี** ที่ช่วงวันที่ของรายงานพาดผ่าน — **pure ล้วน ไม่มี I/O**
 *
 * รายงานหมวด A ส่วนใหญ่ผูกกับ `accounting_periods` (คีย์ = `year_be` + `month`) ไม่ใช่คอลัมน์วันที่
 * ⇒ ต้องแปลงช่วงวันที่ของ Date Range Picker เป็นช่วงงวดก่อนเสมอ
 *
 * ### กติกาที่ห้ามหลุด
 * - ใช้ `periodKeyOf()` (ปฏิทิน**ไทย** — Rule 01) ตัวเดียวกับที่ Adjustment/Period ใช้ ห้ามคิดเดือนเอง
 * - งวดที่ **พาดผ่านแม้บางส่วน** ถือว่าอยู่ในช่วง (custom range 15/06–20/07 ⇒ ได้ทั้งมิถุนายนและกรกฎาคม)
 *   — รายงานรายงวดตัดครึ่งเดือนไม่ได้ การตัดทิ้งงวดที่พาดบางส่วนคือการทำข้อมูลหาย
 */

export interface AccountingPeriodWindow {
  readonly start: PeriodKey
  readonly end: PeriodKey
}

export function accountingPeriodWindow(range: ReportRange): AccountingPeriodWindow {
  return { start: periodKeyOf(range.startDate), end: periodKeyOf(range.endDate) }
}

/** งวดนี้อยู่ในช่วงหรือไม่ (รวมขอบทั้งสองด้าน) */
export function periodInWindow(key: PeriodKey, window: AccountingPeriodWindow): boolean {
  const ordinal = periodOrdinal(key)
  return ordinal >= periodOrdinal(window.start) && ordinal <= periodOrdinal(window.end)
}

/** เรียงงวดจากเก่าไปใหม่ (ค่าลบ = `a` เก่ากว่า) — ใช้เรียงแถวของรายงานรายงวดทุกตัว */
export function comparePeriodKeys(a: PeriodKey, b: PeriodKey): number {
  return periodOrdinal(a) - periodOrdinal(b)
}
