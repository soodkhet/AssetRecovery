import { fmtDate } from '@/lib/format/datetime'
import { ReportError } from '@/lib/reports/errors'
import {
  resolveReportPeriod,
  toIsoDateOnly,
  type ReportPeriodRange,
} from '@/lib/reports/period'

/**
 * ช่วงวันที่ของรายงาน (`96` §11 — "ทุกรายงานมี Date Range Picker (preset: เดือนนี้, เดือนที่แล้ว,
 * ไตรมาสนี้, ปีนี้ + custom)") — **pure ล้วน ไม่มี I/O**
 *
 * ### กติกา
 * - ต่อยอดจาก `resolveReportPeriod()` ของ 3.8 (ปฏิทิน**ไทย** + `endDate` รวมวันสุดท้าย)
 *   — ห้ามคิดขอบเดือน/ไตรมาส/ปีขึ้นมาใหม่ที่นี่
 * - `custom` รับ `YYYY-MM-DD` (ค.ศ.) เพราะมาจาก `<input type="date">` ซึ่งเป็นข้อยกเว้นเดียว
 *   ของ Rule 01 — **ป้ายที่ผู้ใช้เห็นยังเป็น พ.ศ. เสมอ**
 * - รูปแบบผิด / ปลายทางก่อนต้นทาง ⇒ `REPORT_DATE_INVALID` (`96` §12) ห้ามเงียบแล้วสลับให้เอง
 * - `previousReportRange()` = ช่วงก่อนหน้าที่ยาวเท่ากัน — ฐานของ MoM badge (`96` §11)
 */

export const REPORT_RANGE_PRESETS = ['this_month', 'last_month', 'this_quarter', 'this_year', 'custom'] as const
export type ReportRangePreset = (typeof REPORT_RANGE_PRESETS)[number]

export const REPORT_RANGE_PRESET_LABEL: Readonly<Record<ReportRangePreset, string>> = {
  this_month: 'เดือนนี้',
  last_month: 'เดือนที่แล้ว',
  this_quarter: 'ไตรมาสนี้',
  this_year: 'ปีนี้',
  custom: 'กำหนดเอง',
}

export interface ReportRange {
  readonly preset: ReportRangePreset
  /** วันแรกของช่วง (date-only, เที่ยงคืน UTC) */
  readonly startDate: Date
  /** วันสุดท้ายของช่วง — **รวม** วันนี้ด้วย (ผู้เรียกใช้ `lte`) */
  readonly endDate: Date
  /** ป้ายที่ผู้ใช้เห็น — พ.ศ. เสมอ */
  readonly label: string
}

export interface ReportRangeInput {
  readonly preset: ReportRangePreset
  /**
   * `YYYY-MM-DD` หรือ date-only ที่ผ่าน `dateOnlySchema()` มาแล้ว — ใช้เฉพาะ preset `custom`
   * (รับสองรูปเพราะ query string เป็นข้อความ แต่ Zod ของโปรเจกต์แปลงเป็น `Date` ให้ตั้งแต่ชั้น route)
   */
  readonly from?: string | Date | null
  readonly to?: string | Date | null
}

const MS_PER_DAY = 86_400_000
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/

function fromPeriod(preset: ReportRangePreset, period: ReportPeriodRange): ReportRange {
  return { preset, startDate: period.startDate, endDate: period.endDate, label: period.label }
}

/** วันก่อนหน้าวันแรกของช่วง — ใช้เลื่อนจุดอ้างอิงไปงวดก่อนหน้าโดยไม่ต้องคิดปฏิทินเอง */
function dayBefore(date: Date): Date {
  return new Date(date.getTime() - MS_PER_DAY)
}

/** `YYYY-MM-DD` (หรือ `Date` ที่ผ่านการตรวจแล้ว) → date-only (เที่ยงคืน UTC) · ผิดรูป ⇒ `null` */
function parseIsoDateOnly(value: string | Date): Date | null {
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) return null
    return new Date(`${toIsoDateOnly(value)}T00:00:00.000Z`)
  }
  if (!ISO_DATE.test(value)) return null
  const parsed = new Date(`${value}T00:00:00.000Z`)
  if (Number.isNaN(parsed.getTime())) return null
  // กัน `2026-02-31` ที่ JS เลื่อนวันให้เงียบ ๆ
  return toIsoDateOnly(parsed) === value ? parsed : null
}

function customLabel(startDate: Date, endDate: Date): string {
  return `${fmtDate(startDate)} – ${fmtDate(endDate)}`
}

/**
 * แปลง preset (+ วันที่ของ custom) เป็นช่วงจริง — `now` คือ instant ปัจจุบัน (แปลงเป็นวันไทยข้างใน)
 *
 * @throws {ReportError} `REPORT_DATE_INVALID` เมื่อ custom ส่งวันที่ไม่ครบ/ผิดรูปแบบ/กลับหัวกลับหาง
 */
export function resolveReportRange(input: ReportRangeInput, now: Date): ReportRange {
  switch (input.preset) {
    case 'this_month':
      return fromPeriod('this_month', resolveReportPeriod('month', now))
    case 'last_month': {
      const thisMonth = resolveReportPeriod('month', now)
      return fromPeriod('last_month', resolveReportPeriod('month', dayBefore(thisMonth.startDate)))
    }
    case 'this_quarter':
      return fromPeriod('this_quarter', resolveReportPeriod('quarter', now))
    case 'this_year':
      return fromPeriod('this_year', resolveReportPeriod('year', now))
    case 'custom': {
      const from = input.from === undefined || input.from === null ? null : parseIsoDateOnly(input.from)
      const to = input.to === undefined || input.to === null ? null : parseIsoDateOnly(input.to)
      if (from === null || to === null) {
        throw new ReportError('REPORT_DATE_INVALID', { detail: 'ช่วงวันที่กำหนดเองต้องระบุทั้งวันเริ่มและวันสิ้นสุด' })
      }
      if (from.getTime() > to.getTime()) {
        throw new ReportError('REPORT_DATE_INVALID', { detail: 'วันเริ่มต้นต้องไม่อยู่หลังวันสิ้นสุด' })
      }
      return { preset: 'custom', startDate: from, endDate: to, label: customLabel(from, to) }
    }
  }
}

/**
 * ช่วงก่อนหน้าที่ยาวเท่ากัน — ฐานเปรียบเทียบของ MoM
 * (เดือน/ไตรมาส/ปี ใช้ปฏิทินจริง · custom เลื่อนถอยหลังตามจำนวนวันเท่าเดิม)
 */
export function previousReportRange(range: ReportRange): ReportRange {
  switch (range.preset) {
    case 'this_month':
    case 'last_month':
      return fromPeriod(range.preset, resolveReportPeriod('month', dayBefore(range.startDate)))
    case 'this_quarter':
      return fromPeriod('this_quarter', resolveReportPeriod('quarter', dayBefore(range.startDate)))
    case 'this_year':
      return fromPeriod('this_year', resolveReportPeriod('year', dayBefore(range.startDate)))
    case 'custom': {
      const days = Math.round((range.endDate.getTime() - range.startDate.getTime()) / MS_PER_DAY) + 1
      const endDate = dayBefore(range.startDate)
      const startDate = new Date(endDate.getTime() - (days - 1) * MS_PER_DAY)
      return { preset: 'custom', startDate, endDate, label: customLabel(startDate, endDate) }
    }
  }
}

/** คีย์คงที่ของช่วง — ใช้ประกอบคีย์แคชและ query string (ค.ศ. — ภายในระบบเท่านั้น) */
export function reportRangeKey(range: ReportRange): string {
  return `${range.preset}:${toIsoDateOnly(range.startDate)}..${toIsoDateOnly(range.endDate)}`
}
