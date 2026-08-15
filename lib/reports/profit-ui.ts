import { REPORT_PERIOD_TYPES, type ReportPeriodType } from '@/lib/reports/period'
import { PROFIT_DIMENSIONS, PROFIT_DIMENSION_LABEL, type ProfitDimension } from '@/lib/reports/profitability'

/**
 * กติกาการแสดงผลของแท็บ "กำไรและต้นทุน" (`21` §8 · mockup `finance.html` แท็บ `profit`)
 * — **pure ล้วน** ให้ JSX ไม่ต้องมี if ของตัวเลข (แนวเดียวกับ `lib/revenue/revenue-ui.ts`)
 *
 * ⚠️ ที่นี่ตัดสินแค่ "สีและป้าย" — ยอดเงิน/margin คำนวณที่ backend เท่านั้น (Rule 01)
 */

export const PROFIT_DIMENSION_OPTIONS = PROFIT_DIMENSIONS.map((id) => ({
  id,
  label: `แยกตาม${PROFIT_DIMENSION_LABEL[id]}`,
})) as readonly { id: ProfitDimension; label: string }[]

const PERIOD_OPTION_LABEL: Readonly<Record<ReportPeriodType, string>> = {
  month: 'เดือนนี้',
  quarter: 'ไตรมาสนี้',
  year: 'ปีนี้',
}

export const PROFIT_PERIOD_OPTIONS = REPORT_PERIOD_TYPES.map((id) => ({
  id,
  label: PERIOD_OPTION_LABEL[id],
})) as readonly { id: ReportPeriodType; label: string }[]

/** เกณฑ์สีของ Margin ตาม mockup — ≥40% เขียว · ≥25% ส้ม · ต่ำกว่านั้นแดง · `null` = เทา (N/A) */
export function marginToneClass(marginPct: number | null): string {
  if (marginPct === null) return 'text-slate-400'
  if (marginPct >= 40) return 'text-emerald-700'
  if (marginPct >= 25) return 'text-amber-700'
  return 'text-red-600'
}

/** กำไรติดลบ (ขาดทุนขั้นต้น) ต้องเห็นชัดว่าเป็นตัวปัญหา ไม่ใช่สีเขียวเหมือนกำไรปกติ */
export function grossProfitToneClass(grossProfitSatang: number): string {
  return grossProfitSatang < 0 ? 'text-red-600' : 'text-emerald-700'
}

/** ป้ายบอกที่มาของตัวเลข — แคชรายวันหรือคำนวณสด (`21` §17) */
export function freshnessLabel(fromCache: boolean): string {
  return fromCache ? 'ข้อมูลจากแคชรายวัน' : 'คำนวณสดเมื่อสักครู่'
}
