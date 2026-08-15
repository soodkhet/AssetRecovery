import { fmtCount, fmtRatioPct, fmtSatang } from '@/lib/format/money'
import { fmtDate, fmtDateTime } from '@/lib/format/datetime'
import type { ReportCacheMode, ReportCategory } from '@/lib/reports/catalog'
import type { MoMComparison } from '@/lib/reports/kpi'

/**
 * สัญญากลางของ "ผลลัพธ์รายงานหนึ่งตัว" — **หัวใจของข้อกำหนด `96` §13 "Export ทุกรายงาน export
 * ได้ถูกต้องตรงกับ UI"**
 *
 * หน้าจอกับไฟล์ export อ่าน `columns` + `rows` **ชุดเดียวกัน** ⇒ ตรงกันโดยโครงสร้าง ไม่ใช่โดยวินัย
 * ของคนเขียนโค้ด (รายงานใหม่ใน 6.2–6.5 ต้องคืน payload รูปนี้เท่านั้น ห้ามทำตารางเฉพาะกิจในหน้า)
 *
 * ### กติกาของค่าในเซลล์
 * - เงินเป็น **satang จำนวนเต็ม** เสมอ (Rule 01) + `type: 'money'` — ตัวแปลงหน่วยอยู่ที่ชั้นแสดงผล
 * - วันที่เป็น ISO (`YYYY-MM-DD` หรือ ISO UTC เต็ม) + `type: 'date' | 'datetime'` — แปลงเป็น **พ.ศ.**
 *   ที่ชั้นแสดงผล/ไฟล์ export เท่านั้น
 * - `null` = ไม่มีค่า (แสดง `—`) — ห้ามส่ง 0 แทน "ไม่มีข้อมูล"
 */

export type ReportColumnType = 'text' | 'money' | 'number' | 'percent' | 'date' | 'datetime'

export interface ReportColumn {
  readonly key: string
  readonly header: string
  readonly type: ReportColumnType
  /** ความกว้างคอลัมน์ใน Excel (จำนวนตัวอักษร) — ไม่ระบุ = ใช้ค่าตามชนิด */
  readonly width?: number
  /** เกณฑ์ไฮไลต์ของแถว (เช่น AR เกิน 90 วัน) — ชั้นแสดงผลเป็นคนเลือกสี */
  readonly tone?: 'default' | 'warning' | 'danger'
}

export type ReportCellValue = string | number | null

export type ReportRow = Readonly<Record<string, ReportCellValue>>

/**
 * คีย์เทคนิคของแถว (id ของมิติ) — **ไม่ใช่คอลัมน์**
 *
 * ทั้งตารางบนจอ ไฟล์ Excel และ PDF วนจาก `columns` เท่านั้น ⇒ ค่าที่ใส่ในช่องนี้จึงไม่โผล่ให้ผู้ใช้เห็น
 * แต่ตัวกรอง "ดูรายละเอียดของ…" ฝั่งจอหยิบไปใช้เป็นค่าของ `<select>` ได้โดยไม่ต้องเดาจากชื่อที่แสดง
 * (ชื่อซ้ำกันได้ · id ซ้ำไม่ได้) — ห้ามประกาศคีย์เทคนิคชื่ออื่นเพิ่มในรายงานแต่ละตัว
 */
export const ROW_KEY = '__key'

export interface ReportKpi {
  readonly key: string
  readonly label: string
  readonly value: ReportCellValue
  readonly type: ReportColumnType
  /** ข้อความใต้ตัวเลข */
  readonly hint?: string
  /** เทียบกับงวดก่อน (`96` §11) — ไม่มี = ไม่แสดง badge */
  readonly mom?: MoMComparison
  /** ค่าที่มากขึ้น "ดี" หรือไม่ — ใช้เลือกสี badge (ค่าเริ่มต้น: ดี) */
  readonly higherIsBetter?: boolean
}

/** สิ่งที่ provider ของแต่ละรายงาน (6.2–6.5) ต้องคืน */
export interface ReportData {
  readonly columns: readonly ReportColumn[]
  readonly rows: readonly ReportRow[]
  readonly kpis?: readonly ReportKpi[]
  /** แถวรวมท้ายตาราง (ถ้ามี) — ต้องใช้ `key` ชุดเดียวกับ `columns` */
  readonly totalRow?: ReportRow | null
  /** ข้อความกำกับใต้ตาราง เช่นเงื่อนไขการนับ */
  readonly note?: string
}

export interface ReportCacheInfo {
  readonly mode: ReportCacheMode
  /** ISO UTC — ชั้นแสดงผลแปลงเป็นเวลาไทย พ.ศ. */
  readonly computedAt: string
  readonly fromCache: boolean
  /** เก่าเกิน 24 ชั่วโมง (`96` §12) — UI ต้องขึ้นปุ่มรีเฟรช */
  readonly stale: boolean
  readonly expiresAt: string | null
  readonly refreshAvailableAt: string | null
  /** กดรีเฟรชแล้วแต่ยังไม่พ้น cooldown 5 นาที (E14) */
  readonly refreshThrottled: boolean
}

export interface ReportPayload {
  readonly report: {
    readonly code: string
    readonly id: string
    readonly title: string
    readonly category: ReportCategory
  }
  readonly range: {
    readonly preset: string
    /** ป้าย พ.ศ. */
    readonly label: string
    /** ค.ศ. `YYYY-MM-DD` — สำหรับส่งกลับ/ตรวจสอบเท่านั้น ห้ามแสดงตรง ๆ */
    readonly from: string
    readonly to: string
  }
  readonly columns: readonly ReportColumn[]
  readonly rows: readonly ReportRow[]
  readonly kpis: readonly ReportKpi[]
  readonly totalRow: ReportRow | null
  readonly note: string | null
  readonly cache: ReportCacheInfo
}

// ── การแปลงค่าเป็นข้อความ (ใช้ร่วมหน้าจอ / PDF / Excel) ──────────────────────

/**
 * ข้อความที่ผู้ใช้เห็น — วันที่เป็น **พ.ศ.** เสมอ (Rule 01) · เงินหารร้อยที่นี่ที่เดียว
 *
 * ค่าว่างของอัตราส่วนแสดง **"N/A"** ไม่ใช่ `—` (Rule 01: `revenue = 0` ⇒ margin คำนวณไม่ได้
 * — คนละความหมายกับ "ไม่มีข้อมูลช่องนี้")
 */
export function formatCellText(value: ReportCellValue, type: ReportColumnType): string {
  if (value === null) return type === 'percent' ? fmtRatioPct(null) : '—'
  switch (type) {
    case 'money':
      return typeof value === 'number' ? fmtSatang(value) : String(value)
    case 'number':
      return typeof value === 'number' ? fmtCount(value) : String(value)
    case 'percent':
      return typeof value === 'number' ? fmtRatioPct(value) : String(value)
    case 'date':
      return fmtDate(value)
    case 'datetime':
      return fmtDateTime(value)
    case 'text':
      return String(value)
  }
}

/**
 * ค่าที่จะเขียนลงเซลล์ Excel — ตัวเลขคงความเป็นตัวเลข (ผู้ใช้ต้อง `SUM` ได้)
 * ยกเว้น**วันที่ที่ต้องเป็นข้อความ พ.ศ.** ตาม E13 (Excel ไม่มีปฏิทินพุทธ — เก็บเป็น date จริง
 * จะกลายเป็น ค.ศ. บนหน้าจอผู้ใช้ทันที = bug `DISPLAY_CE_YEAR`)
 */
export function formatCellForSheet(value: ReportCellValue, type: ReportColumnType): string | number {
  if (value === null) return ''
  switch (type) {
    case 'money':
      // satang → บาท ด้วยจำนวนเต็มก่อนหาร (ไม่มีการปัดเศษหาย — Rule 01)
      return typeof value === 'number' ? Math.round(value) / 100 : String(value)
    case 'number':
    case 'percent':
      return typeof value === 'number' ? value : String(value)
    case 'date':
      return fmtDate(value)
    case 'datetime':
      return fmtDateTime(value)
    case 'text':
      return String(value)
  }
}

const DEFAULT_WIDTH: Readonly<Record<ReportColumnType, number>> = {
  text: 24,
  money: 16,
  number: 12,
  percent: 12,
  date: 14,
  datetime: 18,
}

export function columnWidth(column: ReportColumn): number {
  return column.width ?? DEFAULT_WIDTH[column.type]
}
