import { read, utils, write, type CellObject, type WorkSheet } from 'xlsx'
import { buildCsv } from '@/lib/exports/csv'
import {
  IMPORT_REQUIREMENT_LABEL,
  templateExampleRows,
  type ImportTemplateColumn,
} from '@/lib/imports/template'

/**
 * แม่แบบนำเข้า **.xlsx** + ตัวอ่านไฟล์ .xlsx ของจุดนำเข้า (มติผู้ใช้ 04/10/2569) — SheetJS ตาม `96` §15
 * (แพ็กเกจจาก cdn.sheetjs.com — DEC-013) · ใช้ร่วม FE/BE แต่หน้าจอควร `import()` แบบ dynamic
 * เพื่อไม่ให้ SheetJS ติดไปกับ bundle แรกของหน้า
 *
 * เหตุผล: แม่แบบ CSV ที่ผู้ใช้แก้ใน Excel ทำเลข 0 นำหน้าหาย (เบอร์โทร) และเปลี่ยน IMEI 15 หลักเป็น `3.5E+14`
 * ⇒ แม่แบบ .xlsx ตั้ง **ทุกเซลล์ของแผ่นข้อมูลเป็นข้อความ** (`t:'s'` + รูปแบบ `@`) ล่วงหน้า 1,000 แถว
 *   (SheetJS รุ่นชุมชนเขียนสไตล์ระดับคอลัมน์/ตัวหนา/ตรึงแถวไม่ได้ จึงตั้งรูปแบบรายเซลล์แทน)
 *   ทุกคอลัมน์เป็นข้อความ — รวมวันที่และยอดเงิน เพราะ Excel จะแปลง `01/10/2569` เป็นวันที่ตามเครื่องได้
 * ⇒ ตอนนำเข้า แปลง .xlsx เป็น **ข้อความ CSV** แล้วส่งเข้า parser CSV เดิมของแต่ละจุด (ทางเดียว 100%)
 *
 * ความปลอดภัย: อ่านเฉพาะแผ่นแรก · ไม่อ่านสูตร (`cellFormula:false` — ใช้ค่าที่ Excel คำนวณเก็บไว้ ไม่ประมวลผลเอง)
 * · ไม่อ่านมาโคร (`bookVBA:false`) · รับเฉพาะไฟล์ zip (.xlsx) ไม่ให้ SheetJS เดารูปแบบอื่น (HTML/SYLK ฯลฯ)
 */

/** แผ่นข้อมูลของแม่แบบ — ชื่อแผ่นแรก (ตัวอ่านอ่านแผ่นแรกเสมอ ไม่อิงชื่อ) */
export const IMPORT_TEMPLATE_DATA_SHEET = 'ข้อมูล'
export const IMPORT_TEMPLATE_DOC_SHEET = 'คำอธิบาย'

/** จำนวนแถวข้อมูลที่ตั้งรูปแบบ "ข้อความ" ไว้ล่วงหน้า = เพดานการนำเข้าเคสต่อครั้ง */
export const IMPORT_TEMPLATE_TEXT_ROWS = 1000

/** ขนาดไฟล์ .xlsx สูงสุดที่ยอมอ่าน (กันไฟล์ใหญ่ผิดปกติกินหน่วยความจำ browser) */
export const MAX_IMPORT_XLSX_BYTES = 5 * 1024 * 1024

export const XLSX_MIME_TYPE = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'

/** error ของการอ่านไฟล์นำเข้า — `message` เป็นภาษาไทยพร้อมแสดงผู้ใช้ */
export class ImportFileError extends Error {}

function textCell(value: string): CellObject {
  return { t: 's', v: value, z: '@' }
}

/** คอลัมน์ (ชุดเดียวกับแม่แบบ CSV) → ไฟล์ .xlsx: แผ่น "ข้อมูล" (หัวคอลัมน์ + ตัวอย่าง) + แผ่น "คำอธิบาย" */
export function buildImportTemplateXlsx(
  columns: readonly ImportTemplateColumn[],
  textRows: number = IMPORT_TEMPLATE_TEXT_ROWS,
): Uint8Array {
  const examples = templateExampleRows(columns)
  const lastRow = Math.max(textRows, examples.length)
  const data: WorkSheet = {}
  columns.forEach((column, c) => {
    data[utils.encode_cell({ r: 0, c })] = textCell(column.header)
    for (let r = 1; r <= lastRow; r += 1) {
      data[utils.encode_cell({ r, c })] = textCell(examples[r - 1]?.[c] ?? '')
    }
  })
  data['!ref'] = utils.encode_range({ s: { r: 0, c: 0 }, e: { r: lastRow, c: Math.max(columns.length - 1, 0) } })
  data['!cols'] = columns.map((column) => ({
    wch: Math.min(40, Math.max(12, column.header.length + 4, ...column.examples.map((example) => example.length + 2))),
  }))

  const docs = utils.aoa_to_sheet([
    ['หัวคอลัมน์', 'จำเป็น', 'รูปแบบ'],
    ...columns.map((column) => [column.header, IMPORT_REQUIREMENT_LABEL[column.requirement], column.format]),
    [],
    ['หมายเหตุ', '', 'แผ่น "ข้อมูล" ตั้งทุกเซลล์เป็นข้อความไว้แล้ว — พิมพ์หรือวางแบบ "ค่าเท่านั้น" เพื่อให้เลข 0 นำหน้าและ IMEI ไม่เพี้ยน'],
    ['', '', 'แถวตัวอย่างเป็นข้อมูลสมมติ ลบแล้วกรอกข้อมูลจริงแทน · ระบบอ่านเฉพาะแผ่นแรก'],
  ])
  docs['!cols'] = [{ wch: 24 }, { wch: 18 }, { wch: 70 }]

  const workbook = utils.book_new()
  utils.book_append_sheet(workbook, data, IMPORT_TEMPLATE_DATA_SHEET)
  utils.book_append_sheet(workbook, docs, IMPORT_TEMPLATE_DOC_SHEET)
  return new Uint8Array(write(workbook, { type: 'array', bookType: 'xlsx', compression: true }) as ArrayBuffer)
}

/** ข้อความที่ผู้ใช้ "เห็น" ในเซลล์ — วันที่จริงของ Excel แปลงเป็น `YYYY-MM-DD` (ไม่ขึ้นกับ timezone เครื่อง) */
function cellText(cell: CellObject | undefined): string {
  if (cell === undefined) return ''
  if (cell.t === 'd' && cell.v instanceof Date && !Number.isNaN(cell.v.getTime())) {
    return cell.v.toISOString().slice(0, 10)
  }
  if (cell.w !== undefined) return cell.w
  return cell.v === undefined || cell.v === null ? '' : String(cell.v)
}

function isZip(bytes: Uint8Array): boolean {
  return bytes.length >= 4 && bytes[0] === 0x50 && bytes[1] === 0x4b && bytes[2] === 0x03 && bytes[3] === 0x04
}

/**
 * ไฟล์ .xlsx → ตารางข้อความ (แผ่นแรกเท่านั้น · ตัดแถวว่างทิ้ง · แถวแรกที่เหลือ = หัวคอลัมน์)
 * `maxDataRows` = เพดานแถวข้อมูล (ไม่นับหัว) — เกินแล้ว error ทั้งไฟล์ ไม่ตัดทิ้งเงียบ ๆ
 */
export function readXlsxMatrix(bytes: Uint8Array, options: { maxDataRows?: number } = {}): string[][] {
  if (bytes.byteLength > MAX_IMPORT_XLSX_BYTES) {
    throw new ImportFileError('ไฟล์ Excel ใหญ่เกินกำหนด (5 MB) — แบ่งไฟล์แล้วนำเข้าทีละส่วน')
  }
  if (!isZip(bytes)) {
    throw new ImportFileError('ไฟล์นี้ไม่ใช่ไฟล์ Excel (.xlsx) ที่ถูกต้อง — บันทึกใหม่เป็น “สมุดงาน Excel (.xlsx)” หรือ “CSV UTF-8”')
  }

  let sheet: WorkSheet | undefined
  try {
    const workbook = read(bytes, {
      type: 'array',
      sheets: 0,
      cellDates: true,
      cellFormula: false,
      cellHTML: false,
      cellStyles: false,
      bookVBA: false,
    })
    const first = workbook.SheetNames[0]
    sheet = first === undefined ? undefined : workbook.Sheets[first]
  } catch {
    throw new ImportFileError('อ่านไฟล์ Excel ไม่ได้ — ไฟล์อาจเสียหายหรือมีรหัสผ่าน ลองบันทึกใหม่เป็น .xlsx หรือ CSV UTF-8')
  }

  const ref = sheet?.['!ref']
  if (sheet === undefined || ref === undefined) return []
  const range = utils.decode_range(ref)
  const rows: string[][] = []
  for (let r = range.s.r; r <= range.e.r; r += 1) {
    const cells: string[] = []
    for (let c = range.s.c; c <= range.e.c; c += 1) {
      cells.push(cellText(sheet[utils.encode_cell({ r, c })] as CellObject | undefined))
    }
    if (cells.some((cell) => cell.trim() !== '')) rows.push(cells)
  }

  const dataRows = Math.max(rows.length - 1, 0)
  if (options.maxDataRows !== undefined && dataRows > options.maxDataRows) {
    throw new ImportFileError(
      `ไฟล์มีข้อมูล ${dataRows.toLocaleString('th-TH')} แถว เกินกำหนด ${options.maxDataRows.toLocaleString('th-TH')} แถวต่อครั้ง — แบ่งไฟล์แล้วนำเข้าทีละส่วน`,
    )
  }
  return rows
}

/** ตารางข้อความ → ข้อความ CSV (UTF-8 + BOM + CRLF) ที่ parser CSV เดิมของทุกจุดอ่านได้ */
export function matrixToCsv(rows: readonly (readonly string[])[]): string {
  const [header, ...body] = rows
  if (header === undefined) return ''
  return buildCsv(header, body)
}

/** ไฟล์ .xlsx → ข้อความ CSV สำหรับส่งเข้า parser เดิม */
export function xlsxToCsv(bytes: Uint8Array, options: { maxDataRows?: number } = {}): string {
  return matrixToCsv(readXlsxMatrix(bytes, options))
}
