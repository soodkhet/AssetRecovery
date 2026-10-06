import { ModuleError, type ErrorMessage } from '@/lib/api/errors'

/**
 * Error code หมวดใบรับรองแทนใบเสร็จรับเงิน (มติ PO U103) — SSOT อยู่ที่ `docs/24-finance-validation-rules.md` §6.4
 * ⚠️ ห้ามตั้ง code ใหม่ที่นี่โดยไม่เพิ่มลงไฟล์ 24 ใน commit เดียวกัน (Rule 04)
 */

export const SUBSTITUTE_RECEIPT_ERROR_CODES = [
  'SUBSTITUTE_RECEIPT_EXCEEDS_LIMIT',
  'SUBSTITUTE_RECEIPT_NOT_SIGNED',
  'SUBSTITUTE_RECEIPT_NOT_FOUND',
  'SUBSTITUTE_RECEIPT_ALREADY_SIGNED',
] as const

export type SubstituteReceiptErrorCode = (typeof SUBSTITUTE_RECEIPT_ERROR_CODES)[number]

const HTTP_STATUS: Record<SubstituteReceiptErrorCode, number> = {
  SUBSTITUTE_RECEIPT_EXCEEDS_LIMIT: 400,
  SUBSTITUTE_RECEIPT_NOT_SIGNED: 400,
  // ไม่พบ/นอก scope = 404 เสมอ (ไม่ leak ว่ามีใบนี้)
  SUBSTITUTE_RECEIPT_NOT_FOUND: 404,
  SUBSTITUTE_RECEIPT_ALREADY_SIGNED: 400,
}

const MESSAGES: Record<SubstituteReceiptErrorCode, ErrorMessage> = {
  SUBSTITUTE_RECEIPT_EXCEEDS_LIMIT: {
    title: 'เกินเพดานใบรับรองแทนใบเสร็จ',
    message: 'ยอดใบรับรองแทนใบเสร็จเกินเพดานที่องค์กรตั้งไว้ — รายจ่ายส่วนที่เกินต้องใช้ใบเสร็จจริง',
  },
  SUBSTITUTE_RECEIPT_NOT_SIGNED: {
    title: 'ยังไม่ได้อัปโหลดใบรับรองฉบับเซ็น',
    message: 'รายการนี้ใช้ใบรับรองแทนใบเสร็จ — ผู้เบิกต้องอัปโหลดฉบับที่เซ็นแล้วก่อนจึงอนุมัติได้',
  },
  SUBSTITUTE_RECEIPT_NOT_FOUND: {
    title: 'ไม่พบใบรับรองแทนใบเสร็จ',
    message: 'ไม่พบใบรับรองแทนใบเสร็จนี้ หรือคุณไม่มีสิทธิ์ดูรายการนี้',
  },
  SUBSTITUTE_RECEIPT_ALREADY_SIGNED: {
    title: 'อัปโหลดฉบับเซ็นแล้ว',
    message: 'ใบรับรองแทนใบเสร็จนี้อัปโหลดฉบับเซ็นแล้ว เปลี่ยนไฟล์ไม่ได้',
  },
}

export function substituteReceiptErrorStatus(code: SubstituteReceiptErrorCode): number {
  return HTTP_STATUS[code]
}

export function substituteReceiptErrorMessage(code: SubstituteReceiptErrorCode): ErrorMessage {
  return MESSAGES[code]
}

export class SubstituteReceiptError extends ModuleError<SubstituteReceiptErrorCode> {
  /** `message` = ข้อความไทยเฉพาะกรณี (เช่น บอกยอดที่เหลือของเดือน) แทนข้อความกลางของ code */
  constructor(
    code: SubstituteReceiptErrorCode,
    options?: { detail?: string; context?: Record<string, unknown>; message?: string },
  ) {
    const base = MESSAGES[code]
    super(
      code,
      options?.message === undefined ? base : { ...base, message: options.message },
      HTTP_STATUS[code],
      options,
    )
    this.name = 'SubstituteReceiptError'
  }
}
