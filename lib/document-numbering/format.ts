import type { DocumentNumberType } from '@/lib/generated/prisma/enums'
import { buddhistYear } from '@/lib/format/datetime'

/**
 * เลขที่เอกสาร (มติ PO 06/10/2569 U102 · `13` §6.12) — **pure ล้วน ใช้ร่วม FE/BE**
 *
 * รูปแบบ: ส่วนประกอบคั่นด้วย `-` ที่ระบบใส่ให้ — `{คำนำหน้า}-{ปี พ.ศ.}-{ลำดับ}` (รวมปี) หรือ `{คำนำหน้า}-{ลำดับ}`
 * · คำนำหน้าว่างได้ (`2569-0001` / `0001`) · ลำดับเติม 0 ให้ครบจำนวนหลัก เกินแล้วยาวขึ้นเอง **ไม่ตัดหลัก**
 * · ปีในเลขเป็น **พ.ศ.** ตามเวลาไทยของวันที่เอกสาร (Rule 01)
 *
 * ⚠️ ตัวเดินเลขจริงคือ SQL `next_document_number()` (migration `20261006190000_document_number_series`)
 *    ไฟล์นี้ต้องให้ผลตรงกับ SQL ทุกกรณี (`format_document_number` / `ensure_document_number_series`) —
 *    `lib/document-numbering/document-numbering.db.test.ts` เทียบสองทางไว้
 */

export const DOCUMENT_NUMBER_TYPES = [
  'tax_invoice',
  'billing_batch',
  'handover_lot',
  'delivery_note',
  'payment_voucher',
  'wht_certificate',
  'advance',
  'advance_return',
  'substitute_receipt',
] as const satisfies readonly DocumentNumberType[]

export const MIN_DIGITS = 3
export const MAX_DIGITS = 8
export const MAX_PREFIX_LENGTH = 10
/** A–Z/0–9 คั่นด้วย `-` ได้ (ไม่ขึ้นต้น/ลงท้าย/ซ้อนขีด) หรือว่าง — ตรงกับ CHECK ใน DB */
export const PREFIX_PATTERN = /^([A-Z0-9]+(-[A-Z0-9]+)*)?$/

export const DOCUMENT_NUMBER_LABEL: Readonly<Record<DocumentNumberType, string>> = {
  tax_invoice: 'ใบเสร็จรับเงิน/ใบกำกับภาษี',
  billing_batch: 'ใบแจ้งหนี้/ใบวางบิล',
  handover_lot: 'เลขล็อตส่งมอบ',
  delivery_note: 'ใบส่งมอบ',
  payment_voucher: 'ใบสำคัญจ่าย',
  wht_certificate: 'หนังสือรับรองการหักภาษี ณ ที่จ่าย',
  advance: 'ใบเบิกเงินทดรอง',
  advance_return: 'ใบรับคืนเงินทดรอง',
  substitute_receipt: 'ใบรับรองแทนใบเสร็จรับเงิน',
}

/** ออกเลขเมื่อไร — คำอธิบายบนหน้าตั้งค่า */
export const DOCUMENT_NUMBER_ISSUED_WHEN: Readonly<Record<DocumentNumberType, string>> = {
  tax_invoice: 'ออกเอกสารภาษี',
  billing_batch: 'สร้างรอบวางบิล',
  handover_lot: 'สร้างล็อตส่งมอบ',
  delivery_note: 'สร้างล็อตส่งมอบ',
  payment_voucher: 'สร้างไฟล์โอนครั้งแรก (1 ใบต่อผู้รับเงินต่อรอบ)',
  wht_certificate: 'ออกหนังสือรับรอง',
  advance: 'ยื่นขอเบิกเงินทดรอง',
  advance_return: 'บันทึกรับคืนแยกหรือหักกลบในรอบจ่าย',
  substitute_receipt: 'ออกใบรับรองแทนใบเสร็จ',
}

/**
 * เอกสารภาษี — **ล็อกรูปแบบหลังออกฉบับแรก** (กฎหมายบังคับความต่อเนื่องของเลข · `NUMBERING_FORMAT_LOCKED`)
 * และห้ามตั้งเลขถัดไปเอง (`NUMBERING_SEQ_NOT_EDITABLE`)
 */
export const TAX_DOCUMENT_TYPES: readonly DocumentNumberType[] = ['tax_invoice', 'wht_certificate']

export function isTaxDocumentType(docType: DocumentNumberType): boolean {
  return TAX_DOCUMENT_TYPES.includes(docType)
}

export interface DocumentNumberFormat {
  prefix: string
  includeYear: boolean
  digits: number
  resetYearly: boolean
}

export interface DocumentNumberState extends DocumentNumberFormat {
  /** ลำดับล่าสุดที่ออกแล้ว (0 = ยังไม่เคยออก) */
  currentSeq: number
  /** ปี พ.ศ. ของ `currentSeq` */
  currentYear: number | null
}

/** ค่าเริ่มต้นต่อชนิด = รูปแบบที่ระบบใช้อยู่ก่อนมติ U102 (+ RAV/CRT/PV ใหม่ `<คำนำหน้า>-<พ.ศ.>-NNNN`) */
export const DOCUMENT_NUMBER_DEFAULTS: Readonly<Record<DocumentNumberType, DocumentNumberFormat>> = {
  tax_invoice: { prefix: 'INV', includeYear: false, digits: 4, resetYearly: false },
  billing_batch: { prefix: 'BL', includeYear: true, digits: 3, resetYearly: true },
  handover_lot: { prefix: 'LOT', includeYear: true, digits: 3, resetYearly: true },
  delivery_note: { prefix: 'DLV', includeYear: true, digits: 3, resetYearly: true },
  payment_voucher: { prefix: 'PV', includeYear: true, digits: 4, resetYearly: true },
  wht_certificate: { prefix: 'WHT', includeYear: true, digits: 3, resetYearly: true },
  advance: { prefix: 'ADV', includeYear: true, digits: 4, resetYearly: true },
  advance_return: { prefix: 'RAV', includeYear: true, digits: 4, resetYearly: true },
  substitute_receipt: { prefix: 'CRT', includeYear: true, digits: 4, resetYearly: true },
}

/** ปี พ.ศ. ตามเวลาไทยของวันที่เอกสาร (Rule 01 — ห้ามใช้ ค.ศ. บนเลขเอกสาร) */
export function documentYear(at: Date): number {
  const year = buddhistYear(at)
  if (year === null) throw new Error('documentYear: วันที่เอกสารไม่ถูกต้อง')
  return year
}

/** ส่วนหน้าของเลขก่อนลำดับ — `INV-2569-` / `INV-` / `2569-` / `''` (ตรงกับ SQL `document_number_head`) */
export function documentNumberHead(format: Pick<DocumentNumberFormat, 'prefix' | 'includeYear'>, beYear: number): string {
  const parts = [format.prefix.trim()].filter((part) => part.length > 0)
  if (format.includeYear) parts.push(String(beYear))
  return parts.length === 0 ? '' : `${parts.join('-')}-`
}

/** ประกอบเลขเอกสารจากลำดับ + ปี พ.ศ. */
export function formatDocumentNumber(format: DocumentNumberFormat, sequence: number, beYear: number): string {
  if (!Number.isInteger(sequence) || sequence < 1) {
    throw new RangeError(`formatDocumentNumber: ลำดับต้องเป็นจำนวนเต็มบวก (ได้รับ ${sequence})`)
  }
  if (!Number.isInteger(beYear) || beYear < 2500 || beYear > 2999) {
    throw new RangeError(`formatDocumentNumber: ปีต้องเป็น พ.ศ. (ได้รับ ${beYear})`)
  }
  return `${documentNumberHead(format, beYear)}${String(sequence).padStart(format.digits, '0')}`
}

/**
 * ลำดับล่าสุดที่ "นับต่อ" ได้ ณ ปีของวันที่ — รีเซ็ตรายปีแล้วปีไม่ตรงตัวนับ = เริ่มนับใหม่ (0)
 * (SQL ใช้เลขสูงสุดที่มีจริงของปีนั้นแทน 0 — ปกติคือ 0 เช่นกัน)
 */
export function effectiveLastSequence(state: DocumentNumberState, beYear: number): number {
  if (state.resetYearly && state.currentYear !== beYear) return 0
  return state.currentSeq
}

/** ลำดับถัดไปที่ควรได้ ณ วันที่เอกสาร */
export function nextDocumentSequence(state: DocumentNumberState, at: Date): number {
  return effectiveLastSequence(state, documentYear(at)) + 1
}

/** ตัวอย่างเลขถัดไป — แสดงสดบนหน้าตั้งค่า */
export function previewNextDocumentNumber(state: DocumentNumberState, at: Date): string {
  const beYear = documentYear(at)
  return formatDocumentNumber(state, effectiveLastSequence(state, beYear) + 1, beYear)
}

/** รูปแบบเลขแบบอ่านง่าย — `INV-{พ.ศ.}-0001` / `INV-0001` */
export function describeDocumentNumberPattern(format: DocumentNumberFormat): string {
  const parts = [format.prefix.trim()].filter((part) => part.length > 0)
  if (format.includeYear) parts.push('{พ.ศ.}')
  parts.push('N'.repeat(format.digits))
  return parts.join('-')
}

export function sameDocumentNumberFormat(a: DocumentNumberFormat, b: DocumentNumberFormat): boolean {
  return (
    a.prefix === b.prefix && a.includeYear === b.includeYear && a.digits === b.digits && a.resetYearly === b.resetYearly
  )
}
