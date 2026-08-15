import { z } from 'zod'
import { dateOnlySchema } from '@/lib/api/validation'
import { REPORT_EXPORT_FORMATS } from '@/lib/reports/export'
import { REPORT_PERIOD_TYPES } from '@/lib/reports/period'
import { PROFIT_DIMENSIONS } from '@/lib/reports/profitability'
import { REPORT_RANGE_PRESETS } from '@/lib/reports/range'

/**
 * Zod schema ชุดเดียวใช้ร่วม FE/BE ของรายงานกำไร (21) และแดชบอร์ด (14) — Rule 13
 *
 * ทั้งสอง endpoint เป็น **GET อ่านอย่างเดียว** (`21` §11 · `14` §11 "ไม่มี validation")
 * ⇒ ที่นี่ตรวจแค่รูปร่างของ query string ไม่มีกติกาธุรกิจ
 */

const booleanFlag = z
  .preprocess((value) => (value === 'true' ? true : value === 'false' || value === undefined ? false : value), z.boolean())
  .default(false)

export const profitabilityQuerySchema = z.object({
  dimension: z.enum(PROFIT_DIMENSIONS).default('company'),
  period: z.enum(REPORT_PERIOD_TYPES).default('month'),
  /** วันอ้างอิงของช่วงเวลา — ไม่ระบุ = วันนี้ (ตามปฏิทินไทย) */
  asOf: dateOnlySchema('วันที่ดูรายงาน').optional(),
  /** ปุ่ม "รีเฟรชตอนนี้" (`21` §17) — ข้ามแคชรายวันแล้วคำนวณสด */
  refresh: booleanFlag,
})

export const profitabilityDrilldownQuerySchema = profitabilityQuerySchema

export const dashboardKpiQuerySchema = z.object({
  asOf: dateOnlySchema('วันที่ดูรายงาน').optional(),
  refresh: booleanFlag,
})

export const exceptionListQuerySchema = z.object({
  level: z.enum(['all', 'critical', 'warning', 'info']).default('all'),
  /** ค่าเริ่มต้น = เฉพาะที่ยังเปิดอยู่ (`14` §3 "Exception ที่ต้องจัดการ") */
  status: z.enum(['all', 'open', 'resolved', 'authorized']).default('open'),
})

/**
 * เมนูรายงาน (ไฟล์ 96) — query ของ `GET /api/reports/:id` และ body ของปุ่ม Export
 *
 * `preset` + `from`/`to` เป็นรูปร่างเดียวกับ DateRangePicker (`96` §11) · ความถูกต้องเชิงธุรกิจ
 * (เช่น custom ต้องมีทั้งสองวันและห้ามกลับหัว) ตรวจที่ `resolveReportRange()` ซึ่งโยน
 * `REPORT_DATE_INVALID` — ไม่ทำซ้ำที่นี่เพื่อให้มีที่เดียวที่ตัดสิน
 */
export const reportRangeQuerySchema = z.object({
  preset: z.enum(REPORT_RANGE_PRESETS).default('this_month'),
  from: dateOnlySchema('วันเริ่มต้น').optional(),
  to: dateOnlySchema('วันสิ้นสุด').optional(),
  refresh: booleanFlag,
})

export const reportExportBodySchema = z.object({
  format: z.enum(REPORT_EXPORT_FORMATS),
  preset: z.enum(REPORT_RANGE_PRESETS).default('this_month'),
  from: dateOnlySchema('วันเริ่มต้น').optional(),
  to: dateOnlySchema('วันสิ้นสุด').optional(),
  /** พารามิเตอร์เฉพาะรายงาน (เช่น `dimension`) — ส่งต่อให้ provider ตรง ๆ */
  params: z.record(z.string(), z.string()).optional(),
})

export type ProfitabilityQuery = z.infer<typeof profitabilityQuerySchema>
export type DashboardKpiQuery = z.infer<typeof dashboardKpiQuerySchema>
export type ExceptionListQuery = z.infer<typeof exceptionListQuerySchema>
export type ReportRangeQuery = z.infer<typeof reportRangeQuerySchema>
export type ReportExportBody = z.infer<typeof reportExportBodySchema>
