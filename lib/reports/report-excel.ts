import { utils, write } from 'xlsx'
import {
  reconciliationSheetRows,
  reportSheetColumnWidths,
  reportSheetHeaderBlock,
  reportSheetKpiRows,
  reportSheetName,
  reportSheetNoteRows,
  reportSheetRows,
} from '@/lib/reports/export'
import { sheetNumberFormat, type ReportPayload } from '@/lib/reports/payload'

/**
 * Excel ของเมนูรายงาน (SheetJS ตาม `96` §15) — โครงเดียวกับ `lib/warehouse/handover-excel.ts` (2.13)
 * ⚠️ ตรรกะการจัดค่าทั้งหมดอยู่ใน `lib/reports/export.ts` (pure + เทสต์ได้) — ไฟล์นี้แค่ประกอบ workbook
 */
export function buildReportWorkbook(payload: ReportPayload, generatedAt: Date): Uint8Array {
  // หัวชีต + การ์ด KPI (J-05) อยู่เหนือหัวตาราง — ทั้งสองส่วนเป็น "ส่วนหัว" ของตำแหน่งแถวข้อมูล
  const headerBlock = [...reportSheetHeaderBlock(payload, generatedAt), ...reportSheetKpiRows(payload)]
  const dataRows = reportSheetRows(payload)
  const reconciliationRows = reconciliationSheetRows(payload)
  const sheet = utils.aoa_to_sheet([
    ...headerBlock,
    payload.columns.map((column) => column.header),
    ...dataRows,
    ...reconciliationRows,
    ...reportSheetNoteRows(payload),
  ])

  // ค่า KPI คอลัมน์ที่ 2 — รูปแบบตัวเลขตามชนิดของการ์ด (เงิน/% /จำนวน)
  const firstKpiRow = headerBlock.length - payload.kpis.length - 1
  payload.kpis.forEach((kpi, offset) => {
    const format = sheetNumberFormat(kpi.type)
    const cell = sheet[utils.encode_cell({ r: firstKpiRow + offset, c: 1 })] as { t?: string; z?: string } | undefined
    if (format !== null && cell !== undefined && cell.t === 'n') cell.z = format
  })

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
