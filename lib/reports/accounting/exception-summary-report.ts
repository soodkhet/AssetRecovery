import {
  summarizeExceptionCounts,
  type ExceptionCountInput,
  type ExceptionSummary,
} from '@/lib/accounting/exception'
import { ROW_KEY, type ReportColumn, type ReportData, type ReportRow } from '@/lib/reports/payload'
import { comparePeriodKeys } from '@/lib/reports/accounting/period-window'

/**
 * **A4 — Exception Summary รายงวด** (`96` §6-A4) — ชั้น **pure ล้วน ไม่มี I/O**
 *
 * ### กติกาที่ห้ามหลุด
 * - **`authorized` ห้ามนับปนกับ `resolved`** (`34` §6.3 มาตรการกันหายเงียบข้อ 1) ⇒ มีคอลัมน์ของตัวเอง
 *   — "ผ่านแบบมีข้อยกเว้น" คือปัญหาที่ **ยังไม่ถูกแก้** แต่ผู้บริหารรับความเสี่ยงไว้ ต่างจาก "แก้ไขแล้ว"
 * - ตัวนับทั้งหมดมาจาก `summarizeExceptionCounts()` ของ 4.1 ตัวเดียวกับหน้าบัญชี ⇒ ตัวเลขสองที่ตรงกัน
 *   เสมอ (ห้ามนับเองในรายงาน)
 * - `critical` ที่ยัง `open` = ตัวที่บล็อกการปิดงวด/ส่งออก (`34` §11 · `37`) ⇒ ต้องเด่นเป็น KPI
 * - 3 คอลัมน์แรกเป็นยอดแยกตาม**ระดับ** (ทุกสถานะรวมกัน) · 3 คอลัมน์หลังแยกตาม**สถานะ** (ทุกระดับ
 *   รวมกัน) ⇒ ผลรวมของสองฝั่งเท่ากันเสมอ — เขียนไว้ในหมายเหตุกันคนอ่านเข้าใจผิดว่าบวกกันได้ทั้งแถว
 */

/** 1 แถว = 1 รอบบัญชี พร้อมยอดข้อยกเว้นที่นับมาจาก `groupBy(level, status)` */
export interface ExceptionPeriodEntry {
  periodId: string
  periodLabel: string
  yearBe: number
  month: number
  counts: readonly ExceptionCountInput[]
}

const COLUMNS: readonly ReportColumn[] = [
  { key: 'period', header: 'รอบบัญชี', type: 'text', width: 22 },
  { key: 'critical', header: 'Critical', type: 'number', tone: 'danger' },
  { key: 'warning', header: 'Warning', type: 'number', tone: 'warning' },
  { key: 'info', header: 'Info', type: 'number' },
  { key: 'resolved', header: 'แก้ไขแล้ว', type: 'number' },
  { key: 'authorized', header: 'ผ่านแบบมีข้อยกเว้น', type: 'number', width: 20 },
  { key: 'open', header: 'ยังเปิดอยู่', type: 'number', tone: 'danger' },
]

export function buildExceptionSummaryReport(input: { periods: readonly ExceptionPeriodEntry[] }): ReportData {
  // งวดใหม่อยู่บนสุด — ปัญหาของงวดล่าสุดคือสิ่งที่ต้องเคลียร์ก่อนปิดงวด
  const sorted = [...input.periods].sort((a, b) => comparePeriodKeys(b, a))
  const summaries = sorted.map((period) => ({ period, summary: summarizeExceptionCounts(period.counts) }))

  /** `ExceptionSummary` มีตัวนับระดับ critical/warning ให้แล้ว — info คิดจาก 3 สถานะ (ไม่มี field ตรง) */
  const infoOf = (summary: ExceptionSummary): number =>
    summary.open.info + summary.authorized.info + summary.resolved.info

  const rows: ReportRow[] = summaries.map(({ period, summary }) => ({
    [ROW_KEY]: period.periodId,
    period: period.periodLabel,
    critical: summary.criticalCount,
    warning: summary.warningCount,
    info: infoOf(summary),
    resolved: summary.resolved.total,
    authorized: summary.authorized.total,
    open: summary.open.total,
  }))

  const sumOf = (pick: (summary: ExceptionSummary) => number): number =>
    summaries.reduce((total, item) => total + pick(item.summary), 0)
  const critical = sumOf((summary) => summary.criticalCount)
  const warning = sumOf((summary) => summary.warningCount)
  const info = sumOf(infoOf)
  const resolved = sumOf((summary) => summary.resolved.total)
  const authorized = sumOf((summary) => summary.authorized.total)
  const open = sumOf((summary) => summary.open.total)
  const blockingCritical = sumOf((summary) => summary.blockingCritical)

  return {
    columns: COLUMNS,
    rows,
    kpis: [
      {
        key: 'blockingCritical',
        label: 'Critical ที่ยังเปิดอยู่',
        value: blockingCritical,
        type: 'number',
        hint: blockingCritical === 0 ? 'ไม่มีตัวบล็อกการส่งออก' : 'บล็อกการปิดงวด/ส่งออกชุดข้อมูลบัญชี',
        higherIsBetter: false,
      },
      { key: 'open', label: 'ยังเปิดอยู่ทั้งหมด', value: open, type: 'number', higherIsBetter: false },
      {
        key: 'authorized',
        label: 'ผ่านแบบมีข้อยกเว้น',
        value: authorized,
        type: 'number',
        hint: 'ยังไม่ได้แก้ต้นทาง — ผู้บริหารรับความเสี่ยงเฉพาะงวดนั้น',
        higherIsBetter: false,
      },
      { key: 'resolved', label: 'แก้ไขแล้ว', value: resolved, type: 'number' },
    ],
    totalRow:
      rows.length === 0
        ? null
        : { period: 'รวมทั้งหมด', critical, warning, info, resolved, authorized, open },
    note:
      'Critical/Warning/Info คือยอดแยกตามระดับ (รวมทุกสถานะ) ส่วน แก้ไขแล้ว/ผ่านแบบมีข้อยกเว้น/ยังเปิดอยู่ คือยอดแยกตามสถานะ (รวมทุกระดับ) — ผลรวมของสองฝั่งเท่ากันเสมอ · ' +
      '"ผ่านแบบมีข้อยกเว้น" ไม่ถูกนับรวมกับ "แก้ไขแล้ว" เพราะต้นเหตุยังไม่ถูกแก้ (ไฟล์ 34) · ' +
      'Critical ที่ยังเปิดอยู่จะบล็อกการปิดงวดและการส่งออกชุดข้อมูลบัญชี',
  }
}
