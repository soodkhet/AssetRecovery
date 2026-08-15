import { MONTH_NAMES_TH } from '@/lib/field/calendar'
import { toBangkokParts } from '@/lib/format/datetime'

/**
 * ช่วงเวลาของรายงาน (`21` §8 — "เลือกช่วงเวลา (เดือน/ไตรมาส/ปี) ได้") — **pure ล้วน ไม่มี I/O**
 *
 * ### กติกา
 * - คิดขอบเขตด้วย **ปฏิทินไทย** (Asia/Bangkok) เสมอ แล้วคืนเป็น date-only (เที่ยงคืน UTC)
 *   ให้เทียบกับคอลัมน์ `DATE` (`revenues.revenue_date` / `expenses.expense_date`) ได้ตรง
 *   — แนวเดียวกับ `toBangkokDateOnly()` ของ `lib/revenue/revenue.ts`
 * - ป้ายช่วงเวลาเป็น **พ.ศ. เสมอ** (Rule 01) — เดือนใช้ชื่อไทยชุดเดียวกับรอบวางบิล (`19` §7.2)
 * - `endDate` **รวมวันสุดท้าย** (inclusive) — ผู้เรียกใช้ `lte` ไม่ใช่ `lt`
 */

export const REPORT_PERIOD_TYPES = ['month', 'quarter', 'year'] as const
export type ReportPeriodType = (typeof REPORT_PERIOD_TYPES)[number]

export const REPORT_PERIOD_LABEL: Readonly<Record<ReportPeriodType, string>> = {
  month: 'รายเดือน',
  quarter: 'รายไตรมาส',
  year: 'รายปี',
}

const BUDDHIST_YEAR_OFFSET = 543

export interface ReportPeriodRange {
  type: ReportPeriodType
  /** วันแรกของช่วง (date-only, เที่ยงคืน UTC) */
  startDate: Date
  /** วันสุดท้ายของช่วง — **รวม** วันนี้ด้วย */
  endDate: Date
  /** ป้ายที่ผู้ใช้เห็น — พ.ศ. เสมอ เช่น "สิงหาคม 2569" / "ไตรมาส 3/2569" / "ปี 2569" */
  label: string
}

function utcDate(year: number, month: number, day: number): Date {
  return new Date(Date.UTC(year, month - 1, day))
}

/** วันสุดท้ายของเดือน (เลือกวันที่ 0 ของเดือนถัดไป) */
function lastDayOf(year: number, month: number): Date {
  return new Date(Date.UTC(year, month, 0))
}

/**
 * ช่วงเวลาของรายงานจากวันอ้างอิง — เดือน/ไตรมาส/ปี **ที่วันอ้างอิงตกอยู่** (ตามปฏิทินไทย)
 *
 * ⚠️ `reference` คือ instant (`new Date()`) — แปลงเป็นวันไทยก่อนเสมอ ไม่งั้นช่วง 00:00–07:00
 * ตามเวลาไทยจะตกไปเดือนก่อนหน้า
 */
export function resolveReportPeriod(type: ReportPeriodType, reference: Date): ReportPeriodRange {
  const parts = toBangkokParts(reference)
  if (parts === null) throw new RangeError('resolveReportPeriod: วันอ้างอิงไม่ถูกต้อง')
  const { year, month } = parts
  const yearBe = year + BUDDHIST_YEAR_OFFSET

  if (type === 'month') {
    const name = MONTH_NAMES_TH[month - 1]
    if (name === undefined) throw new RangeError('resolveReportPeriod: เดือนไม่ถูกต้อง')
    return { type, startDate: utcDate(year, month, 1), endDate: lastDayOf(year, month), label: `${name} ${yearBe}` }
  }

  if (type === 'quarter') {
    const quarter = Math.floor((month - 1) / 3) + 1
    const firstMonth = (quarter - 1) * 3 + 1
    return {
      type,
      startDate: utcDate(year, firstMonth, 1),
      endDate: lastDayOf(year, firstMonth + 2),
      label: `ไตรมาส ${quarter}/${yearBe}`,
    }
  }

  return { type, startDate: utcDate(year, 1, 1), endDate: lastDayOf(year, 12), label: `ปี ${yearBe}` }
}

/** คีย์ช่วงเวลาแบบคงที่ (ISO date-only ของขอบล่าง+ขอบบน) — ใช้ประกอบคีย์แคชและ query string */
export function reportPeriodKey(range: ReportPeriodRange): string {
  return `${range.type}:${toIsoDateOnly(range.startDate)}..${toIsoDateOnly(range.endDate)}`
}

/** `Date` (date-only) → `YYYY-MM-DD` (ค.ศ.) — สำหรับ API/คีย์ภายในเท่านั้น ห้ามใช้แสดงผล (Rule 01) */
export function toIsoDateOnly(date: Date): string {
  return date.toISOString().slice(0, 10)
}
