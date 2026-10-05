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
    title: 'รายการขายนี้ออกใบกำกับภาษีแล้ว',
    message:
      'รายการขายนี้มีใบกำกับภาษีที่ใช้งานอยู่แล้ว — ต้องยกเลิกใบเดิมพร้อมเหตุผลก่อนจึงออกใบใหม่ได้',
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
    message: 'มีใบลดหนี้เลขที่นี้ที่ใช้งานอยู่แล้ว — ตรวจเลขที่ตามเอกสารของสำนักงานบัญชีอีกครั้ง',
  },
  CREDIT_NOTE_EXCEEDS_INVOICE: {
    title: 'ยอดใบลดหนี้เกินยอดใบกำกับภาษี',
    message: 'ยอดใบลดหนี้รวมทุกใบของใบกำกับนี้ต้องไม่เกินยอดของใบกำกับภาษีที่อ้างถึง',
  },
  CREDIT_NOTE_VAT_MISMATCH: {
    title: 'ภาษีมูลค่าเพิ่มของใบลดหนี้ไม่สอดคล้อง',
    message:
      'ภาษีที่ลดต้องเท่ากับมูลค่าที่ลดคูณอัตราภาษีของใบกำกับเดิม (คลาดได้ไม่เกิน 1 สตางค์) — ตรวจยอดตามเอกสารอีกครั้ง',
  },
  CREDIT_NOTE_DATE_BEFORE_INVOICE: {
    title: 'วันที่ใบลดหนี้ก่อนวันที่ใบกำกับภาษี',
    message: 'ใบลดหนี้ต้องออกในวันเดียวกันหรือหลังวันที่ของใบกำกับภาษีที่อ้างถึง',
  },
  CREDIT_NOTE_ADJUSTMENT_MISMATCH: {
    title: 'รายการปรับปรุงที่อ้างถึงใช้กับใบลดหนี้นี้ไม่ได้',
    message:
      'รายการปรับปรุงต้องเป็นการลดยอดที่อนุมัติแล้ว ของรอบวางบิลเดียวกับใบกำกับภาษี และยังไม่มีใบลดหนี้อื่นอ้างถึง',
  },
}

export function salesErrorStatus(code: SalesErrorCode): number {
  return HTTP_STATUS[code]
}

export function salesErrorMessage(code: SalesErrorCode): ErrorMessage {
  return MESSAGES[code]
}

export class SalesError extends ModuleError<SalesErrorCode> {
  constructor(code: SalesErrorCode, options?: { detail?: string; context?: Record<string, unknown> }) {
    super(code, MESSAGES[code], HTTP_STATUS[code], options)
    this.name = 'SalesError'
  }
}

export function isSalesError(error: unknown): error is SalesError {
  return error instanceof SalesError
}
