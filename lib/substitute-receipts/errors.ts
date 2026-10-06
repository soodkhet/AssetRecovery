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
  // มติ PO 06/10/2569 U107 — ยกเลิกใบ: ยกเลิกซ้ำ/รายการที่ผูกอนุมัติจ่ายแล้ว · เหตุผลบังคับ (code ร่วม) · ออกใบใหม่แทน
  'SUBSTITUTE_RECEIPT_NOT_CANCELLABLE',
  'CANCEL_REQUIRES_REASON',
  'SUBSTITUTE_RECEIPT_REISSUE_NOT_ALLOWED',
] as const

export type SubstituteReceiptErrorCode = (typeof SUBSTITUTE_RECEIPT_ERROR_CODES)[number]

const HTTP_STATUS: Record<SubstituteReceiptErrorCode, number> = {
  SUBSTITUTE_RECEIPT_EXCEEDS_LIMIT: 400,
  SUBSTITUTE_RECEIPT_NOT_SIGNED: 400,
  // ไม่พบ/นอก scope = 404 เสมอ (ไม่ leak ว่ามีใบนี้)
  SUBSTITUTE_RECEIPT_NOT_FOUND: 404,
  SUBSTITUTE_RECEIPT_ALREADY_SIGNED: 400,
  SUBSTITUTE_RECEIPT_NOT_CANCELLABLE: 400,
  CANCEL_REQUIRES_REASON: 400,
  SUBSTITUTE_RECEIPT_REISSUE_NOT_ALLOWED: 400,
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
  SUBSTITUTE_RECEIPT_NOT_CANCELLABLE: {
    title: 'ยกเลิกใบรับรองแทนใบเสร็จไม่ได้',
    message: 'ใบนี้ถูกยกเลิกไปแล้ว หรือผูกกับรายการเบิกที่อนุมัติจ่ายแล้ว — แก้ไขผ่านรายการปรับปรุง',
  },
  CANCEL_REQUIRES_REASON: {
    title: 'ต้องระบุเหตุผลการยกเลิก',
    message: 'การยกเลิกใบรับรองแทนใบเสร็จกระทบหลักฐานรายจ่าย — กรอกเหตุผลอย่างน้อย 5 ตัวอักษรก่อนยืนยัน',
  },
  SUBSTITUTE_RECEIPT_REISSUE_NOT_ALLOWED: {
    title: 'ออกใบรับรองแทนใบเสร็จใหม่ไม่ได้',
    message: 'ออกใบใหม่แทนได้เฉพาะใบที่ยกเลิกแล้ว และรายการนั้นยังไม่มีใบที่ใช้งานอยู่ — ตรวจสอบยอดรวมของใบใหม่ด้วย',
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
