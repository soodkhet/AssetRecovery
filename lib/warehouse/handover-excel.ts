import { utils, write } from 'xlsx'
import type { HandoverDocModel } from '@/lib/warehouse/handover-doc'
import { EMPTY_DOC_VALUE } from '@/lib/warehouse/handover-doc'

/**
 * Export Excel ต่อล็อต (`44` §6.4 — "รายการเครื่องทั้งหมดในล็อต") — SheetJS ตาม `96` §15
 *
 * ⚠️ ติดตั้งจาก **CDN ของ SheetJS** (`https://cdn.sheetjs.com/xlsx-0.20.3/xlsx-0.20.3.tgz`)
 *    ไม่ใช่ `xlsx` บน npm ซึ่งค้างที่ 0.18.5 และมีช่องโหว่ที่แก้แล้วในรุ่นหลัง (ผู้ขายย้ายออกจาก npm)
 * ⚠️ ไฟล์นี้เป็น **ผลลัพธ์อย่างเดียว** — ยอดเงิน/สูตรใด ๆ ห้ามคำนวณที่นี่ (เอกสารส่งมอบไม่มีเงิน)
 */

/** หัวคอลัมน์ — ลำดับเดียวกับตารางในใบส่งมอบ PDF เพื่อให้สองเอกสารอ่านคู่กันได้ */
export const HANDOVER_SHEET_HEADERS = [
  '#',
  'เลขสัญญา',
  'ชื่อลูกหนี้',
  'อุปกรณ์',
  'IMEI / Serial (ตามสัญญา)',
  'IMEI / Serial (ตรวจจริง เมื่อไม่ตรง)',
  'สภาพ',
  'หมายเหตุสภาพ',
] as const

export const HANDOVER_SHEET_NAME = 'รายการเครื่องในล็อต'

/** แถวข้อมูลของชีต (ยังไม่ผูกกับ SheetJS — เทสต์ยิงตรงที่ตัวนี้ได้) */
export function handoverSheetRows(doc: HandoverDocModel): string[][] {
  return doc.rows.map((row) => [
    String(row.no),
    row.caseRef,
    row.debtorName,
    row.deviceDesc,
    row.identifier,
    row.identifierActual ?? EMPTY_DOC_VALUE,
    row.condition,
    row.conditionNote ?? EMPTY_DOC_VALUE,
  ])
}

/** ส่วนหัวของชีต — ข้อมูลล็อตย่อ ๆ เหนือตาราง (คนเปิดไฟล์ต้องรู้ว่าเป็นล็อตไหนโดยไม่ต้องเปิดระบบ) */
export function handoverSheetHeaderBlock(doc: HandoverDocModel): string[][] {
  return [
    [doc.title],
    ['เลขที่ใบส่งมอบ', doc.docRef, 'เลขล็อต', doc.lotNumber],
    ['ผู้ส่งมอบ', doc.issuer.name, 'ผู้รับมอบ', doc.recipient.name],
    ['รูปแบบการส่งมอบ', doc.typeLabel, 'วันที่', doc.issuedAtLabel],
    ['จำนวนเครื่อง', String(doc.totalCount)],
    [],
  ]
}

/** ความกว้างคอลัมน์ (ตัวอักษร) — ตั้งไว้ให้เปิดแล้วอ่านได้เลยโดยไม่ต้องลากขยาย */
const COLUMN_WIDTHS = [4, 18, 24, 26, 24, 24, 14, 30]

export function buildHandoverWorkbook(doc: HandoverDocModel): Buffer {
  const sheet = utils.aoa_to_sheet([
    ...handoverSheetHeaderBlock(doc),
    [...HANDOVER_SHEET_HEADERS],
    ...handoverSheetRows(doc),
  ])
  sheet['!cols'] = COLUMN_WIDTHS.map((width) => ({ wch: width }))

  const workbook = utils.book_new()
  utils.book_append_sheet(workbook, sheet, HANDOVER_SHEET_NAME)
  return write(workbook, { type: 'buffer', bookType: 'xlsx' }) as Buffer
}
