import { utils, write } from 'xlsx'
import {
  reconciliationSheetRows,
  reportSheetColumnWidths,
  reportSheetHeaderBlock,
  reportSheetName,
  reportSheetRows,
} from '@/lib/reports/export'
import { sheetNumberFormat, type ReportPayload } from '@/lib/reports/payload'

/**
 * Excel ของเมนูรายงาน (SheetJS ตาม `96` §15) — โครงเดียวกับ `lib/warehouse/handover-excel.ts` (2.13)
 * ⚠️ ตรรกะการจัดค่าทั้งหมดอยู่ใน `lib/reports/export.ts` (pure + เทสต์ได้) — ไฟล์นี้แค่ประกอบ workbook
 */
export function buildReportWorkbook(payload: ReportPayload, generatedAt: Date): Uint8Array {
  const headerBlock = reportSheetHeaderBlock(payload, generatedAt)
  const dataRows = reportSheetRows(payload)
  const reconciliationRows = reconciliationSheetRows(payload)
  const sheet = utils.aoa_to_sheet([
    ...headerBlock,
    payload.columns.map((column) => column.header),
    ...dataRows,
    ...reconciliationRows,
  ])

  // ใส่รูปแบบตัวเลขรายคอลัมน์ (เงิน 2 ทศนิยม · % 2 ทศนิยม · วัน 1 ทศนิยม) — BUG-134
  const firstDataRow = headerBlock.length + 1
  payload.columns.forEach((column, columnIndex) => {
    const format = sheetNumberFormat(column.type)
    if (format === null) return
    dataRows.forEach((_row, rowOffset) => {
      const cell = sheet[utils.encode_cell({ r: firstDataRow + rowOffset, c: columnIndex })] as
        | { t?: string; z?: string }
        | undefined
      if (cell !== undefined && cell.t === 'n') cell.z = format
    })
  })
  // บรรทัดกระทบยอด (U44) — คอลัมน์ที่ 2 เป็นเงินบาท
  const firstReconciliationRow = firstDataRow + dataRows.length
  const moneyFormat = sheetNumberFormat('money')
  reconciliationRows.forEach((_row, rowOffset) => {
    const cell = sheet[utils.encode_cell({ r: firstReconciliationRow + rowOffset, c: 1 })] as
      | { t?: string; z?: string }
      | undefined
    if (cell !== undefined && cell.t === 'n' && moneyFormat !== null) cell.z = moneyFormat
  })
  sheet['!cols'] = reportSheetColumnWidths(payload).map((width) => ({ wch: width }))

  const workbook = utils.book_new()
  utils.book_append_sheet(workbook, sheet, reportSheetName(payload))
  return new Uint8Array(write(workbook, { type: 'buffer', bookType: 'xlsx' }) as Buffer)
}
