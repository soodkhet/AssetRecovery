import { utils, write } from 'xlsx'
import { checklistSheet, CHECKLIST_SHEET_NAME, type ChecklistExportRow } from '@/lib/exports/pack'

/**
 * `08_Document_Checklist.xlsx` ของ Accounting Pack (ไฟล์ 37 §6.1 · ข้อมูลจากไฟล์ 34) — SheetJS ตาม `96` §15
 *
 * ⚠️ `xlsx` ติดตั้งจาก **CDN ของ SheetJS** ไม่ใช่ npm (ดูหัว `lib/warehouse/handover-excel.ts`)
 * ⚠️ ไฟล์นี้เป็น **ผลลัพธ์อย่างเดียว** — เนื้อแถวและตัวนับสรุปมาจาก `checklistSheet()` ที่ pure และมีเทสต์
 */

/** ความกว้างคอลัมน์ (ตัวอักษร) — เปิดแล้วอ่านได้เลยโดยไม่ต้องลากขยาย */
const COLUMN_WIDTHS = [14, 22, 14, 10, 52, 24]

export function buildChecklistWorkbook(input: {
  periodLabel: string
  generatedByName: string
  generatedAt: Date
  rows: readonly ChecklistExportRow[]
}): Uint8Array {
  const sheet = utils.aoa_to_sheet(checklistSheet(input))
  sheet['!cols'] = COLUMN_WIDTHS.map((width) => ({ wch: width }))

  const workbook = utils.book_new()
  utils.book_append_sheet(workbook, sheet, CHECKLIST_SHEET_NAME)
  return new Uint8Array(write(workbook, { type: 'buffer', bookType: 'xlsx' }) as Buffer)
}
