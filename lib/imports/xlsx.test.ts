import { read, utils, write, type CellObject, type WorkSheet } from 'xlsx'
import { describe, expect, it } from 'vitest'
import {
  CASE_IMPORT_TEMPLATE_COLUMNS,
  CASE_IMPORT_TEMPLATE_XLSX_FILE_NAME,
  MAX_CASE_IMPORT_ROWS,
  parseCsv,
  planImport,
} from '@/lib/cases/import'
import { buildStatementImportTemplate, parseStatementCsv, SUPPORTED_STATEMENT_COLUMNS } from '@/lib/bank-recon/statement'
import { looksLikeScientificNotation, xlsxTemplateFileName } from '@/lib/imports/template'
import {
  buildImportTemplateXlsx,
  IMPORT_TEMPLATE_DATA_SHEET,
  IMPORT_TEMPLATE_DOC_SHEET,
  IMPORT_TEMPLATE_TEXT_ROWS,
  ImportFileError,
  matrixToCsv,
  readXlsxMatrix,
  xlsxToCsv,
} from '@/lib/imports/xlsx'

/**
 * แม่แบบ .xlsx + นำเข้า .xlsx (มติผู้ใช้ 04/10/2569)
 * แม่แบบ .xlsx → อ่านกลับ → parser เดิมของแต่ละจุดผ่าน 100% · ตัวเลขยาวไม่เพี้ยน · เลขยกกำลัง → error แถว
 */

const COMPANY_ID = '11111111-1111-4111-8111-111111111111'

/** สร้าง .xlsx จากตาราง — `cells` ใส่ CellObject เองได้ (จำลองเซลล์ตัวเลข/วันที่ที่ผู้ใช้พิมพ์ใน Excel) */
function workbookBytes(rows: ReadonlyArray<ReadonlyArray<string | CellObject>>, extraSheet = false): Uint8Array {
  const sheet: WorkSheet = {}
  rows.forEach((cells, r) =>
    cells.forEach((cell, c) => {
      sheet[utils.encode_cell({ r, c })] = typeof cell === 'string' ? { t: 's', v: cell } : cell
    }),
  )
  const width = Math.max(...rows.map((cells) => cells.length))
  sheet['!ref'] = utils.encode_range({ s: { r: 0, c: 0 }, e: { r: rows.length - 1, c: width - 1 } })
  const workbook = utils.book_new()
  utils.book_append_sheet(workbook, sheet, 'แผ่นแรก')
  if (extraSheet) utils.book_append_sheet(workbook, utils.aoa_to_sheet([['ห้ามอ่าน'], ['x']]), 'แผ่นสอง')
  return new Uint8Array(write(workbook, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer)
}

const caseHeaders = CASE_IMPORT_TEMPLATE_COLUMNS.map((column) => column.header)
function caseRow(overrides: Record<string, string | CellObject>): Array<string | CellObject> {
  // แถวตัวอย่างที่ 1 ของแม่แบบ (ผ่านการตรวจครบ) แล้วทับบางช่อง
  return CASE_IMPORT_TEMPLATE_COLUMNS.map((column) => overrides[column.header] ?? column.examples[0] ?? '')
}

describe('แม่แบบนำเข้า .xlsx', () => {
  it('ชื่อไฟล์ .xlsx คู่กับ .csv เดิม', () => {
    expect(CASE_IMPORT_TEMPLATE_XLSX_FILE_NAME).toBe('case-import-template.xlsx')
    expect(xlsxTemplateFileName('bank-statement-template.csv')).toBe('bank-statement-template.xlsx')
    expect(buildStatementImportTemplate(null).xlsxFileName).toBe('bank-statement-template.xlsx')
  })

  it('แผ่นแรก = ข้อมูล (ทุกเซลล์เป็นข้อความ รูปแบบ @ ล่วงหน้า 1,000 แถว) · แผ่นสอง = คำอธิบาย', () => {
    const workbook = read(buildImportTemplateXlsx(CASE_IMPORT_TEMPLATE_COLUMNS), { type: 'array', cellNF: true })
    expect(workbook.SheetNames).toEqual([IMPORT_TEMPLATE_DATA_SHEET, IMPORT_TEMPLATE_DOC_SHEET])
    const data = workbook.Sheets[IMPORT_TEMPLATE_DATA_SHEET] as WorkSheet
    const range = utils.decode_range(data['!ref'] ?? 'A1')
    expect(range.e.r).toBe(IMPORT_TEMPLATE_TEXT_ROWS)
    expect(range.e.c).toBe(CASE_IMPORT_TEMPLATE_COLUMNS.length - 1)
    for (const address of ['A1', 'A2', 'B3', utils.encode_cell({ r: IMPORT_TEMPLATE_TEXT_ROWS, c: range.e.c })]) {
      const cell = data[address] as CellObject
      expect(cell.t).toBe('s')
      expect(cell.z).toBe('@')
    }
    const docs = utils.sheet_to_json<string[]>(workbook.Sheets[IMPORT_TEMPLATE_DOC_SHEET] as WorkSheet, { header: 1 })
    expect(docs[0]).toEqual(['หัวคอลัมน์', 'จำเป็น', 'รูปแบบ'])
    expect(docs.slice(1, 1 + caseHeaders.length).map((row) => row[0])).toEqual(caseHeaders)
  })

  it('แม่แบบเคส .xlsx → อ่านกลับ → parseCsv → planImport ผ่าน 100% · IMEI/เบอร์/เลขบัตรตรงทุกหลัก', () => {
    const csv = xlsxToCsv(buildImportTemplateXlsx(CASE_IMPORT_TEMPLATE_COLUMNS), { maxDataRows: MAX_CASE_IMPORT_ROWS })
    const rows = parseCsv(csv)
    expect(rows).toHaveLength(2)
    expect(Object.keys(rows[0] ?? {})).toEqual(caseHeaders)
    const plan = planImport(rows, COMPANY_ID)
    expect(plan.errors).toEqual([])
    expect(plan.rows).toHaveLength(2)
    expect(plan.rows[0]?.input.debtorPhoneMobile).toBe('0812345678')
    expect(plan.rows[0]?.input.debtorNationalId).toBe('1234567890121')
    expect(plan.rows[0]?.input.assetImeiSerial).toBe('350000000000001')
  })

  it.each([null, 'transaction_date,amount', SUPPORTED_STATEMENT_COLUMNS.join(',')])(
    'แม่แบบ statement .xlsx (รูปแบบ %s) → อ่านกลับ → parseStatementCsv ผ่านครบ เหมือน CSV',
    (mapping) => {
      const template = buildStatementImportTemplate(mapping)
      const fromXlsx = parseStatementCsv({
        csv: xlsxToCsv(buildImportTemplateXlsx(template.templateColumns)),
        columnMapping: mapping,
      })
      const fromCsv = parseStatementCsv({ csv: template.csv, columnMapping: mapping })
      expect(fromXlsx.errors).toEqual([])
      expect(fromXlsx.rows).toEqual(fromCsv.rows)
      expect(fromXlsx.rows).toHaveLength(2)
    },
  )
})

describe('อ่านไฟล์นำเข้า .xlsx', () => {
  it('เซลล์ข้อความคงเลข 0 นำหน้า · อ่านเฉพาะแผ่นแรก · ตัดแถวว่าง', () => {
    const bytes = workbookBytes([['เบอร์มือถือ', 'IMEI'], ['0812345678', '350000000000001'], ['', ''], ['0898765432', '350000000000019']], true)
    expect(readXlsxMatrix(bytes)).toEqual([
      ['เบอร์มือถือ', 'IMEI'],
      ['0812345678', '350000000000001'],
      ['0898765432', '350000000000019'],
    ])
  })

  it('เซลล์วันที่จริงของ Excel → YYYY-MM-DD (parser statement อ่านได้) ไม่ขึ้นกับ timezone', () => {
    const bytes = workbookBytes([['วันที่', 'จำนวนเงิน'], [{ t: 'n', v: 46296, z: 'dd/mm/yyyy' }, '100.00']])
    const matrix = readXlsxMatrix(bytes)
    expect(matrix[1]?.[0]).toBe('2026-10-01')
    const parsed = parseStatementCsv({ csv: matrixToCsv(matrix), columnMapping: null })
    expect(parsed.rows[0]?.transactionDate.toISOString().slice(0, 10)).toBe('2026-10-01')
  })

  it('ใช้ค่าที่แสดง ไม่ประมวลผลสูตร · ค่าที่มีลูกน้ำ/เครื่องหมายคำพูดผ่าน CSV ได้ครบ', () => {
    const bytes = workbookBytes([
      ['ชื่อลูกหนี้', 'มูลหนี้'],
      ['สมชาย "ตัวอย่าง", จำกัด', { t: 'n', v: 1500, f: 'SUM(1000,500)' }],
    ])
    const rows = parseCsv(xlsxToCsv(bytes))
    expect(rows).toEqual([{ ชื่อลูกหนี้: 'สมชาย "ตัวอย่าง", จำกัด', มูลหนี้: '1500' }])
  })

  it('เกินเพดานแถว → error ทั้งไฟล์ (ไม่ตัดทิ้งเงียบ ๆ) · ไม่ใช่ zip → error ภาษาไทย', () => {
    const rows = [['เลขที่สัญญา'], ...Array.from({ length: 4 }, (_, index) => [`C-${index}`])]
    expect(() => readXlsxMatrix(workbookBytes(rows), { maxDataRows: 3 })).toThrow(ImportFileError)
    expect(readXlsxMatrix(workbookBytes(rows), { maxDataRows: 4 })).toHaveLength(5)
    expect(() => readXlsxMatrix(new TextEncoder().encode('a,b\r\n1,2\r\n'))).toThrow(/ไม่ใช่ไฟล์ Excel/)
  })
})

describe('ตัวเลขยาวที่ Excel แปลงเพี้ยน → error แถว (ห้ามเดาค่าคืน)', () => {
  it('ตรวจจับรูปแบบเลขยกกำลัง', () => {
    for (const value of ['3.5E+14', '3.50000E+14', '8.12E8', '1e15', '-2.1E-03']) {
      expect(looksLikeScientificNotation(value)).toBe(true)
    }
    for (const value of ['350000000000001', '0812345678', 'E12345', 'MA0000001', '3.5']) {
      expect(looksLikeScientificNotation(value)).toBe(false)
    }
  })

  it('IMEI เป็นเซลล์ตัวเลข (Excel แสดง 3.5E+14) → แถวนั้นผิดพร้อมข้อความไทย · แถวอื่นผ่าน', () => {
    const bytes = workbookBytes([
      caseHeaders,
      caseRow({ 'IMEI / Serial': { t: 'n', v: 350000000000001 } }),
      caseRow({ เลขที่สัญญา: 'HC-OK-0002' }),
    ])
    const plan = planImport(parseCsv(xlsxToCsv(bytes)), COMPANY_ID)
    expect(plan.rows.map((row) => row.rowNumber)).toEqual([3])
    expect(plan.errors).toHaveLength(1)
    expect(plan.errors[0]?.rowNumber).toBe(2)
    expect(plan.errors[0]?.fields.assetImeiSerial).toMatch(/เลขยกกำลัง.*ข้อความ/)
  })

  it('เบอร์มือถือเป็นเซลล์ตัวเลข (เลข 0 นำหน้าหาย) → แถวผิด · CSV ที่มี 3.5E+14 → แถวผิดเหมือนกัน', () => {
    const lostZero = workbookBytes([caseHeaders, caseRow({ เบอร์มือถือ: { t: 'n', v: 812345678 } })])
    const zeroPlan = planImport(parseCsv(xlsxToCsv(lostZero)), COMPANY_ID)
    expect(zeroPlan.errors[0]?.fields.debtorPhoneMobile).toMatch(/เลข 0 นำหน้า/)

    const csv = `เลขที่สัญญา,ชื่อลูกหนี้,IMEI / Serial,เบอร์มือถือ\r\nHC-1,สมชาย,3.5E+14,8.12E+08\r\n`
    const csvPlan = planImport(parseCsv(csv), COMPANY_ID)
    expect(csvPlan.errors[0]?.fields.assetImeiSerial).toMatch(/เลขยกกำลัง/)
    expect(csvPlan.errors[0]?.fields.debtorPhoneMobile).toMatch(/เลขยกกำลัง/)
  })
})
