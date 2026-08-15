import { utils, write } from 'xlsx'
import {
  reportSheetColumnWidths,
  reportSheetHeaderBlock,
  reportSheetName,
  reportSheetRows,
} from '@/lib/reports/export'
import type { ReportPayload } from '@/lib/reports/payload'

/**
 * Excel ของเมนูรายงาน (SheetJS ตาม `96` §15) — โครงเดียวกับ `lib/warehouse/handover-excel.ts` (2.13)
 * ⚠️ ตรรกะการจัดค่าทั้งหมดอยู่ใน `lib/reports/export.ts` (pure + เทสต์ได้) — ไฟล์นี้แค่ประกอบ workbook
 */
export function buildReportWorkbook(payload: ReportPayload, generatedAt: Date): Uint8Array {
  const sheet = utils.aoa_to_sheet([
    ...reportSheetHeaderBlock(payload, generatedAt),
    payload.columns.map((column) => column.header),
    ...reportSheetRows(payload),
  ])
  sheet['!cols'] = reportSheetColumnWidths(payload).map((width) => ({ wch: width }))

  const workbook = utils.book_new()
  utils.book_append_sheet(workbook, sheet, reportSheetName(payload))
  return new Uint8Array(write(workbook, { type: 'buffer', bookType: 'xlsx' }) as Buffer)
}
