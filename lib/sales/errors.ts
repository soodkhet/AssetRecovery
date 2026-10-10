import { ModuleError, type ErrorMessage } from '@/lib/api/errors'

/**
 * Error code หมวดบัญชีขายและเงินรับ (ไฟล์ 31) — SSOT อยู่ที่ `docs/24` §6.8
 * ⚠️ ห้ามตั้ง code ใหม่ที่นี่โดยไม่เพิ่มลงไฟล์ 24 ใน commit เดียวกัน (Rule 04)
 *
 * code ที่ไฟล์ 24 มีอยู่ก่อนแล้ว: `TAX_INVOICE_FIELD_MISSING` / `INVOICE_NUMBER_GAP` /
 * `CANCEL_REQUIRES_REASON` (§6.8 · `31` §11)
 * ที่เติมเข้า `24` พร้อม commit นี้ (v4.8): `SALES_RECORD_NOT_FOUND`, `TAX_INVOICE_NOT_FOUND`,
 * `TAX_INVOICE_INVALID_STATUS`, `TAX_INVOICE_ALREADY_ISSUED`
 *
 * `PERIOD_LOCKED_DIRECT_EDIT` **ไม่อยู่ที่นี่** — เป็นของ `SettingsError` ที่ `assertPeriodOpenAt()`
 * โยนให้เอง · `BILLING_BATCH_*` เป็นของโมดูลต้นทาง (19) ใช้ซ้ำไม่ประกาศใหม่
 */

export const SALES_ERROR_CODES = [
  'SALES_RECORD_NOT_FOUND',
  'TAX_INVOICE_NOT_FOUND',
  'TAX_INVOICE_INVALID_STATUS',
  'TAX_INVOICE_ALREADY_ISSUED',
  'TAX_INVOICE_FIELD_MISSING',
  'INVOICE_NUMBER_GAP',
  'CANCEL_REQUIRES_REASON',
  // ใบลดหนี้ที่สำนักงานบัญชีออก (มติ PO 05/10/2569 U14 — `24` §6.8 v4.23)
  'CREDIT_NOTE_NOT_FOUND',
  'CREDIT_NOTE_INVALID_STATUS',
  'CREDIT_NOTE_NUMBER_DUPLICATE',
  'CREDIT_NOTE_EXCEEDS_INVOICE',
  'CREDIT_NOTE_VAT_MISMATCH',
  'CREDIT_NOTE_DATE_BEFORE_INVOICE',
  'CREDIT_NOTE_ADJUSTMENT_MISMATCH',
  // ใบลดหนี้เกินยอดค้างของรอบวางบิล (มติ PO 07/10/2569 U171 — `24` §6.8 v4.46)
  'CREDIT_NOTE_EXCEEDS_OUTSTANDING',
  // ปิดป้าย "รอใบลดหนี้" ไม่ได้ — ยังออกใบลดหนี้ในระบบได้/ไม่ได้รอใบลดหนี้ (staging E-016 — `24` §6.8 v4.52)
  'CREDIT_NOTE_WAIVE_NOT_ALLOWED',
  // ยกเลิกใบกำกับที่ยังมีใบลดหนี้/ใบเพิ่มหนี้ active (มติ PO 05/10/2569 U18 — `24` §6.8 v4.24)
  'TAX_INVOICE_HAS_ACTIVE_NOTES',
  // ใบเสร็จรับเงิน/ใบกำกับภาษีตอนรับเงิน (มติ PO 06/10/2569 U95 + U96 #3/#7 — `24` §6.8 v4.31)
  'TAX_INVOICE_NO_VAT_COMPANY',
  'TAX_INVOICE_DATE_IN_FUTURE',
  'TAX_INVOICE_DATE_OUT_OF_SEQUENCE',
  'TAX_INVOICE_NOTHING_TO_INVOICE',
  'CASH_RECEIPT_NOT_FOUND',
  'CASH_RECEIPT_HAS_TAX_INVOICE',
] as const

export type SalesErrorCode = (typeof SALES_ERROR_CODES)[number]

/**
 * `INVOICE_NUMBER_GAP` = 500 โดยเจตนา — `24` §6.8 ระบุว่า "ไม่ควรเกิดในทางปฏิบัติ ยกเว้น race
 * condition" ⇒ ถ้าเกิดแปลว่าตัวเดินเลขเสีย ไม่ใช่ผู้ใช้กรอกผิด
 */
const HTTP_STATUS: Record<SalesErrorCode, number> = {
  SALES_RECORD_NOT_FOUND: 404,
  TAX_INVOICE_NOT_FOUND: 404,
  TAX_INVOICE_INVALID_STATUS: 400,
  TAX_INVOICE_ALREADY_ISSUED: 400,
  TAX_INVOICE_FIELD_MISSING: 400,
  INVOICE_NUMBER_GAP: 500,
  CANCEL_REQUIRES_REASON: 400,
  CREDIT_NOTE_NOT_FOUND: 404,
  CREDIT_NOTE_INVALID_STATUS: 400,
  CREDIT_NOTE_NUMBER_DUPLICATE: 409,
  CREDIT_NOTE_EXCEEDS_INVOICE: 400,
  CREDIT_NOTE_VAT_MISMATCH: 400,
  CREDIT_NOTE_DATE_BEFORE_INVOICE: 400,
  CREDIT_NOTE_ADJUSTMENT_MISMATCH: 400,
  CREDIT_NOTE_EXCEEDS_OUTSTANDING: 400,
  CREDIT_NOTE_WAIVE_NOT_ALLOWED: 400,
  TAX_INVOICE_HAS_ACTIVE_NOTES: 400,
  TAX_INVOICE_NO_VAT_COMPANY: 400,
  TAX_INVOICE_DATE_IN_FUTURE: 400,
  TAX_INVOICE_DATE_OUT_OF_SEQUENCE: 400,
  TAX_INVOICE_NOTHING_TO_INVOICE: 400,
  CASH_RECEIPT_NOT_FOUND: 404,
  CASH_RECEIPT_HAS_TAX_INVOICE: 409,
}

const MESSAGES: Record<SalesErrorCode, ErrorMessage> = {
  SALES_RECORD_NOT_FOUND: {
    title: 'ไม่พบรายการขาย',
    message: 'ไม่พบรายการขายนี้ หรือคุณไม่มีสิทธิ์เข้าถึงรายการนี้',
  },
  TAX_INVOICE_NOT_FOUND: {
    title: 'ไม่พบใบกำกับภาษี',
    message: 'ไม่พบใบกำกับภาษีนี้ หรือคุณไม่มีสิทธิ์เข้าถึงเอกสารนี้',
  },
  TAX_INVOICE_INVALID_STATUS: {
    title: 'สถานะใบกำกับภาษีไม่รองรับ',
    message:
      'ใบกำกับภาษีที่ยกเลิกไปแล้วยกเลิกซ้ำไม่ได้ และย้อนกลับเป็นใช้งานไม่ได้ (ยกเลิกแล้วเป็นสถานะสุดท้าย)',
  },
  TAX_INVOICE_ALREADY_ISSUED: {
    title: 'ออกเอกสารนี้ไปแล้ว',
    message:
      'เงินรับ/รายการขายนี้มีใบเสร็จรับเงิน/ใบกำกับภาษีที่ใช้งานอยู่แล้ว — ต้องยกเลิกใบเดิมพร้อมเหตุผลก่อนจึงออกใบใหม่ได้',
  },
  TAX_INVOICE_FIELD_MISSING: {
    title: 'ข้อมูลบนใบกำกับภาษีไม่ครบตามกฎหมาย',
    message:
      'ใบกำกับภาษีแบบเต็มรูปต้องมีข้อมูลผู้ขาย/ผู้ซื้อ/รายการ/ยอดครบทุกช่อง — เติมข้อมูลที่ขาดในหน้าตั้งค่าองค์กรหรือข้อมูลบริษัทไฟแนนซ์ก่อนออกเอกสาร',
  },
  INVOICE_NUMBER_GAP: {
    title: 'เลขที่ใบกำกับภาษีไม่ต่อเนื่อง',
    message: 'ระบบเดินเลขที่ใบกำกับภาษีผิดพลาด — ยกเลิกรายการนี้แล้วแจ้งผู้ดูแลระบบ ห้ามออกเอกสารต่อ',
  },
  CANCEL_REQUIRES_REASON: {
    title: 'ต้องระบุเหตุผลที่ยกเลิก',
    message: 'การยกเลิกใบกำกับภาษีหรือใบลดหนี้ต้องระบุเหตุผลเสมอ เพื่อเก็บไว้ในหลักฐานทางบัญชี',
  },
  CREDIT_NOTE_NOT_FOUND: {
    title: 'ไม่พบใบลดหนี้',
    message: 'ไม่พบใบลดหนี้นี้ หรือคุณไม่มีสิทธิ์เข้าถึงเอกสารนี้',
  },
  CREDIT_NOTE_INVALID_STATUS: {
    title: 'สถานะใบลดหนี้ไม่รองรับ',
    message: 'ใบลดหนี้ที่ยกเลิกไปแล้วยกเลิกซ้ำไม่ได้ และย้อนกลับเป็นใช้งานไม่ได้',
  },
  CREDIT_NOTE_NUMBER_DUPLICATE: {
    title: 'เลขที่ใบลดหนี้ซ้ำ',
    message: 'มีเอกสารชนิดเดียวกันเลขที่นี้ที่ใช้งานอยู่แล้ว — ตรวจเลขที่ตามเอกสารของสำนักงานบัญชีอีกครั้ง',
  },
  CREDIT_NOTE_EXCEEDS_INVOICE: {
    title: 'ยอดใบลดหนี้เกินยอดใบกำกับภาษี',
    message: 'ยอดใบลดหนี้รวมทุกใบของใบกำกับนี้ต้องไม่เกินยอดของใบกำกับภาษีที่อ้างถึง',
  },
  CREDIT_NOTE_VAT_MISMATCH: {
    title: 'ภาษีมูลค่าเพิ่มของเอกสารไม่สอดคล้อง',
    message:
      'ภาษีต้องเท่ากับมูลค่าก่อนภาษีคูณอัตราภาษีของใบกำกับเดิม (คลาดได้ไม่เกิน 1 สตางค์) — ตรวจยอดตามเอกสารอีกครั้ง',
  },
  CREDIT_NOTE_DATE_BEFORE_INVOICE: {
    title: 'วันที่เอกสารก่อนวันที่ใบกำกับภาษี',
    message: 'ใบลดหนี้/ใบเพิ่มหนี้ต้องออกในวันเดียวกันหรือหลังวันที่ของใบกำกับภาษีที่อ้างถึง',
  },
  CREDIT_NOTE_ADJUSTMENT_MISMATCH: {
    title: 'รายการปรับปรุงที่อ้างถึงใช้กับเอกสารนี้ไม่ได้',
    message:
      'รายการปรับปรุงต้องอนุมัติแล้ว เป็นชนิดที่ตรงกับเอกสาร (ใบลดหนี้ = ลดยอด · ใบเพิ่มหนี้ = เพิ่มยอด) ของรอบวางบิลเดียวกับใบกำกับภาษี และยังไม่มีเอกสารอื่นอ้างถึง',
  },
  CREDIT_NOTE_EXCEEDS_OUTSTANDING: {
    title: 'ยอดใบลดหนี้เกินยอดค้างชำระ',
    message:
      'ใบลดหนี้ต้องไม่เกินยอดค้างชำระของรอบวางบิล ณ ตอนบันทึก — ถ้าลูกค้าชำระเกินและต้องคืนเงิน ขอให้สำนักงานบัญชีจัดการคืนเงินนอกระบบ',
  },
  CREDIT_NOTE_WAIVE_NOT_ALLOWED: {
    title: 'ปิดป้ายรอใบลดหนี้ไม่ได้',
    message:
      'ปิดป้าย "จัดการนอกระบบ" ได้เฉพาะรายการลดยอดที่รอใบลดหนี้ของบิลที่ชำระครบแล้ว — ถ้ายังมียอดค้าง ให้บันทึกใบลดหนี้ตามปกติ',
  },
  TAX_INVOICE_HAS_ACTIVE_NOTES: {
    title: 'ยกเลิกใบกำกับภาษีไม่ได้',
    message: 'ใบกำกับภาษีนี้ยังมีใบลดหนี้หรือใบเพิ่มหนี้ที่ใช้งานอยู่ — ต้องยกเลิกเอกสารเหล่านั้นก่อน',
  },
  TAX_INVOICE_NO_VAT_COMPANY: {
    title: 'ออกใบเสร็จรับเงิน/ใบกำกับภาษีไม่ได้',
    message: 'บริษัทนี้ตั้งเป็นไม่มี VAT — ต้องยืนยันกับนักบัญชีก่อน',
  },
  TAX_INVOICE_DATE_IN_FUTURE: {
    title: 'วันที่เอกสารล่วงหน้า',
    message: 'วันที่ของใบเสร็จรับเงิน/ใบกำกับภาษีต้องไม่เกินวันนี้',
  },
  TAX_INVOICE_DATE_OUT_OF_SEQUENCE: {
    title: 'วันที่เอกสารไม่เรียงตามเลขที่',
    message:
      'วันที่ของเอกสารต้องไม่ก่อนวันที่ของเอกสารเลขที่ก่อนหน้า — ออกเอกสารตามลำดับวันที่รับเงิน หรือเลือกวันที่เอกสารให้ไม่ก่อนใบล่าสุด',
  },
  TAX_INVOICE_NOTHING_TO_INVOICE: {
    title: 'ไม่มียอดให้ออกเอกสาร',
    message: 'รอบวางบิลนี้ออกใบกำกับภาษีครบยอดแล้ว หรือเงินรับนี้ไม่มียอด — ไม่ต้องออกใบเสร็จรับเงิน/ใบกำกับภาษีเพิ่ม',
  },
  CASH_RECEIPT_NOT_FOUND: {
    title: 'ไม่พบเงินรับ',
    message: 'ไม่พบเงินรับนี้ หรือคุณไม่มีสิทธิ์เข้าถึงรายการนี้',
  },
  CASH_RECEIPT_HAS_TAX_INVOICE: {
    title: 'เงินรับนี้ออกใบเสร็จรับเงิน/ใบกำกับภาษีแล้ว',
    message:
      'เปลี่ยนการจับคู่ไม่ได้เพราะเงินรับเดิมมีใบเสร็จรับเงิน/ใบกำกับภาษีที่ใช้งานอยู่ — ยกเลิกเอกสารนั้นพร้อมเหตุผลก่อน',
  },
}

export function salesErrorStatus(code: SalesErrorCode): number {
  return HTTP_STATUS[code]
}

export function salesErrorMessage(code: SalesErrorCode): ErrorMessage {
  return MESSAGES[code]
}

export class SalesError extends ModuleError<SalesErrorCode> {
  /** `message` = ข้อความไทยเฉพาะกรณี (เช่น บอกเลขเอกสารที่ต้องยกเลิกก่อน) แทนข้อความกลางของ code */
  constructor(
    code: SalesErrorCode,
    options?: { detail?: string; context?: Record<string, unknown>; message?: string },
  ) {
    const base = MESSAGES[code]
    super(code, options?.message === undefined ? base : { ...base, message: options.message }, HTTP_STATUS[code], options)
    this.name = 'SalesError'
  }
}

export function isSalesError(error: unknown): error is SalesError {
  return error instanceof SalesError
}
