import { fmtDate, fmtDateTime, fmtTime } from '@/lib/format/datetime'
import {
  columnWidth,
  formatCellForSheet,
  formatCellText,
  type ReportPayload,
} from '@/lib/reports/payload'

/**
 * Export engine ของเมนูรายงาน (`96` §11 "ทุกรายงานมีปุ่ม Export Excel และ Export PDF" · E13)
 * — **pure ล้วน** (ตัวเขียนไฟล์จริงอยู่ `report-excel.ts` / `components/pdf/report-doc.tsx`)
 *
 * ### กติกาจาก E13 (`docs/02_OPEN_DECISIONS.md`)
 * - **≤ 5,000 แถว = ทำสด** · เกินกว่านั้น = งานเบื้องหลัง `report_export` (`91` §6.1)
 * - ชื่อไฟล์ `{code}_{ชื่อ}_{วันที่ พ.ศ.}_{เวลา}.{ext}`
 * - Excel เก็บวันที่เป็น **ข้อความ พ.ศ.** (Excel ไม่มีปฏิทินพุทธ — เก็บเป็น date จริงจะกลายเป็น ค.ศ.)
 * - PDF ฝังฟอนต์ Noto Sans Thai (`components/pdf/thai-font.ts`)
 *
 * ### "export ตรงกับ UI ทุกแถว" (`96` §13)
 * ทั้งสองรูปแบบรับ `ReportPayload` **ตัวเดียวกับที่หน้าจอเรนเดอร์** ⇒ ไม่มีทางที่ไฟล์กับจอจะคนละชุด
 * (ห้ามให้ route export ไป query ข้อมูลเองซ้ำเด็ดขาด — นั่นคือจุดที่ตัวเลขจะเริ่มไม่ตรงกัน)
 */

export const REPORT_EXPORT_FORMATS = ['xlsx', 'pdf'] as const
export type ReportExportFormat = (typeof REPORT_EXPORT_FORMATS)[number]

/** จำนวนแถวสูงสุดที่ยอมให้สร้างไฟล์สดในคำขอเดียว (E13) */
export const REPORT_EXPORT_SYNC_ROW_LIMIT = 5000

export const REPORT_EXPORT_CONTENT_TYPE: Readonly<Record<ReportExportFormat, string>> = {
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  pdf: 'application/pdf',
}

/** เกิน 5,000 แถว ⇒ ต้องไปทำเป็นงานเบื้องหลัง (E13) */
export function shouldRunExportInBackground(rowCount: number): boolean {
  return rowCount > REPORT_EXPORT_SYNC_ROW_LIMIT
}

/** ตัวอักษรที่ระบบไฟล์/HTTP header ไม่ชอบ — แทนด้วย `-` (ตัวอักษรไทยเก็บไว้ทั้งหมด) */
function safeSegment(value: string): string {
  return value
    .replace(/[\\/:*?"<>|]/g, '-')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
}

/**
 * ชื่อไฟล์ตาม E13 — วันที่/เวลาเป็น **เวลาไทย + พ.ศ.** เสมอ (Rule 01)
 * เช่น `F2_สรุปรายได้_15-08-2569_14-30.xlsx`
 */
export function reportExportFileName(options: {
  code: string
  title: string
  at: Date
  format: ReportExportFormat
}): string {
  const date = fmtDate(options.at).replace(/\//g, '-')
  const time = fmtTime(options.at).replace(/:/g, '-')
  return `${safeSegment(options.code)}_${safeSegment(options.title)}_${date}_${time}.${options.format}`
}

/** หัวชีตเหนือตาราง — เปิดไฟล์แล้วต้องรู้ทันทีว่าเป็นรายงานอะไร ช่วงไหน คิดเมื่อไร (แนวเดียวกับ 2.13) */
export function reportSheetHeaderBlock(payload: ReportPayload, generatedAt: Date): string[][] {
  return [
    [`${payload.report.code} — ${payload.report.title}`],
    ['ช่วงเวลา', payload.range.label],
    ['ข้อมูล ณ', fmtDateTime(payload.cache.computedAt)],
    ['ออกรายงานเมื่อ', fmtDateTime(generatedAt)],
    [],
  ]
}

/** แถวข้อมูลของชีต (ไม่รวมหัวชีต/หัวคอลัมน์) — ค่าเงินเป็นตัวเลขบาท ผู้ใช้ `SUM` ได้ */
export function reportSheetRows(payload: ReportPayload): (string | number)[][] {
  const rows = payload.rows.map((row) =>
    payload.columns.map((column) => formatCellForSheet(row[column.key] ?? null, column.type)),
  )
  if (payload.totalRow !== null) {
    rows.push(payload.columns.map((column) => formatCellForSheet(payload.totalRow?.[column.key] ?? null, column.type)))
  }
  return rows
}

export function reportSheetColumnWidths(payload: ReportPayload): number[] {
  return payload.columns.map((column) => columnWidth(column))
}

/** ชื่อชีต — Excel จำกัด 31 ตัวอักษรและห้ามอักขระบางตัว */
export function reportSheetName(payload: ReportPayload): string {
  return safeSegment(`${payload.report.code}-${payload.report.title}`).slice(0, 31)
}

/** แถวข้อความสำหรับ PDF (ทุกช่องเป็นข้อความที่ผู้ใช้อ่านได้ — เงินเป็นบาท วันที่เป็น พ.ศ.) */
export function reportTextRows(payload: ReportPayload): string[][] {
  const rows = payload.rows.map((row) =>
    payload.columns.map((column) => formatCellText(row[column.key] ?? null, column.type)),
  )
  if (payload.totalRow !== null) {
    rows.push(payload.columns.map((column) => formatCellText(payload.totalRow?.[column.key] ?? null, column.type)))
  }
  return rows
}
