import { ModuleError, type ErrorMessage } from '@/lib/api/errors'

/**
 * Error code หมวดรอบจ่ายเงิน (ไฟล์ 17) — SSOT อยู่ที่ `docs/24-finance-validation-rules.md` §6.5
 * ⚠️ ห้ามตั้ง code ใหม่ที่นี่โดยไม่เพิ่มลงไฟล์ 24 ใน commit เดียวกัน (Rule 04)
 *
 * `DUPLICATE_PAYMENT_FILE` **ไม่อยู่ในรายการนี้โดยตั้งใจ** — เป็น "เตือน ไม่ block" (`17` §11)
 * จึงออกทาง `warning` ของ envelope ไม่ใช่ throw (ดู `duplicatePaymentFileWarning()` ใน `payout.ts`)
 * `BANK_FILE_NOT_TESTED` เป็นของ `SettingsError` (`assertBankFileUsable()` ของ 1.10) ห้าม declare ซ้ำ
 */

export const PAYOUT_ERROR_CODES = [
  'UNVERIFIED_PAYEE_IN_PAYOUT',
  'MIXED_SIDE_BATCH',
  'PAYOUT_BATCH_NOT_FOUND',
  'PAYOUT_BATCH_INVALID_STATUS',
  'NO_ITEMS_TO_PAY',
  'PAYMENT_FILE_NOT_GENERATED',
] as const

export type PayoutErrorCode = (typeof PAYOUT_ERROR_CODES)[number]

/** 404 = ไม่พบเป้าหมาย (ไม่ leak ว่ามีอยู่จริงใน scope อื่น) · 400 = ผิดกติกาข้อมูล/สถานะ */
const HTTP_STATUS: Record<PayoutErrorCode, number> = {
  UNVERIFIED_PAYEE_IN_PAYOUT: 400,
  MIXED_SIDE_BATCH: 400,
  PAYOUT_BATCH_NOT_FOUND: 404,
  PAYOUT_BATCH_INVALID_STATUS: 400,
  NO_ITEMS_TO_PAY: 400,
  PAYMENT_FILE_NOT_GENERATED: 404,
}

const MESSAGES: Record<PayoutErrorCode, ErrorMessage> = {
  UNVERIFIED_PAYEE_IN_PAYOUT: {
    title: 'มีผู้รับเงินที่ยังไม่ยืนยัน',
    message:
      'รอบจ่ายนี้มีรายการของผู้รับเงินที่ยังไม่ผ่านการยืนยันข้อมูลธนาคาร/ภาษี — ต้องยืนยันให้ครบก่อนสร้างรอบจ่าย (`18` §10)',
  },
  MIXED_SIDE_BATCH: {
    title: 'รวมสองฝั่งในรอบเดียวไม่ได้',
    message: 'รอบจ่ายเงิน 1 รอบต้องเป็น Inhouse หรือ Outsource อย่างเดียวเท่านั้น (`17` §6.1)',
  },
  PAYOUT_BATCH_NOT_FOUND: {
    title: 'ไม่พบรอบจ่ายเงิน',
    message: 'ไม่พบรอบจ่ายเงินนี้ หรือคุณไม่มีสิทธิ์ดูรายการนี้',
  },
  PAYOUT_BATCH_INVALID_STATUS: {
    title: 'สถานะรอบจ่ายไม่ถูกต้อง',
    message: 'สถานะปัจจุบันของรอบจ่ายเงินทำรายการนี้ไม่ได้ (`23` §6.6)',
  },
  NO_ITEMS_TO_PAY: {
    title: 'ไม่มีรายการที่ต้องจ่าย',
    message: 'ไม่มีรายการที่อนุมัติแล้วและยังไม่ถูกจ่ายภายในวันตัดรอบที่เลือก',
  },
  PAYMENT_FILE_NOT_GENERATED: {
    title: 'ยังไม่มีไฟล์โอนเงิน',
    message: 'รอบจ่ายนี้ยังไม่ได้สร้างไฟล์โอนเงิน — กด "สร้างไฟล์โอน" ก่อน',
  },
}

export function payoutErrorStatus(code: PayoutErrorCode): number {
  return HTTP_STATUS[code]
}

export function payoutErrorMessage(code: PayoutErrorCode): ErrorMessage {
  return MESSAGES[code]
}

export class PayoutError extends ModuleError<PayoutErrorCode> {
  constructor(code: PayoutErrorCode, options?: { detail?: string; context?: Record<string, unknown> }) {
    super(code, MESSAGES[code], HTTP_STATUS[code], options)
    this.name = 'PayoutError'
  }
}

export function isPayoutError(error: unknown): error is PayoutError {
  return error instanceof PayoutError
}
