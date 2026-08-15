import { ModuleError, type ErrorMessage } from '@/lib/api/errors'

/**
 * Error code หมวดกระทบยอดธนาคาร (ไฟล์ 35) — SSOT อยู่ที่ `docs/24` §6.3
 * ⚠️ ห้ามตั้ง code ใหม่ที่นี่โดยไม่เพิ่มลงไฟล์ 24 ใน commit เดียวกัน (Rule 04)
 *
 * code ที่ไฟล์ 24 มีอยู่ก่อนแล้ว: `MATCH_NOTE_REQUIRED` / `ALREADY_MATCHED` (เตือนไม่บล็อก) /
 * `BANK_ACCOUNT_NOT_FOUND` / `BANK_FILE_FORMAT_NOT_FOUND` (§6.3)
 * ที่เติมเข้า `24` พร้อม commit นี้ (v4.7): `BANK_TRANSACTION_NOT_FOUND`,
 * `BANK_TRANSACTION_INVALID_STATUS`, `STATEMENT_FILE_INVALID`
 *
 * `PERIOD_LOCKED_DIRECT_EDIT` **ไม่อยู่ที่นี่** — เป็นของ `SettingsError` ที่ `assertPeriodOpenAt()`
 * โยนให้เอง · `BILLING_BATCH_*`/`PAYOUT_BATCH_*` เป็นของโมดูลต้นทาง (19/17) ใช้ซ้ำไม่ประกาศใหม่
 */

export const BANK_RECON_ERROR_CODES = [
  'BANK_TRANSACTION_NOT_FOUND',
  'BANK_TRANSACTION_INVALID_STATUS',
  'STATEMENT_FILE_INVALID',
  'MATCH_NOTE_REQUIRED',
  'ALREADY_MATCHED',
] as const

export type BankReconErrorCode = (typeof BANK_RECON_ERROR_CODES)[number]

/** `ALREADY_MATCHED` = เตือนไม่บล็อก (200) — เดินทางมากับ `warning` ของ envelope ไม่ใช่ error */
const HTTP_STATUS: Record<BankReconErrorCode, number> = {
  BANK_TRANSACTION_NOT_FOUND: 404,
  BANK_TRANSACTION_INVALID_STATUS: 400,
  STATEMENT_FILE_INVALID: 400,
  MATCH_NOTE_REQUIRED: 400,
  ALREADY_MATCHED: 200,
}

const MESSAGES: Record<BankReconErrorCode, ErrorMessage> = {
  BANK_TRANSACTION_NOT_FOUND: {
    title: 'ไม่พบรายการเดินบัญชี',
    message: 'ไม่พบรายการเดินบัญชีนี้ หรือคุณไม่มีสิทธิ์เข้าถึงรายการนี้',
  },
  BANK_TRANSACTION_INVALID_STATUS: {
    title: 'สถานะรายการไม่รองรับ',
    message:
      'สถานะปัจจุบันของรายการนี้ทำรายการที่ขอไม่ได้ตาม `23` §6.14 — รายการที่ปิดไปแล้ว (ไม่ต้องจับคู่) แก้ไม่ได้อีก',
  },
  STATEMENT_FILE_INVALID: {
    title: 'อ่านไฟล์ statement ไม่ได้',
    message:
      'ไฟล์ไม่ตรงกับรูปแบบที่ตั้งไว้ของบัญชีนี้ หรือไม่มีแถวรายการที่ใช้ได้เลย — ตรวจรูปแบบไฟล์ที่หน้าตั้งค่าการเงิน (`13` §6.8)',
  },
  MATCH_NOTE_REQUIRED: {
    title: 'ต้องกรอกหมายเหตุชี้แจง',
    message:
      'ยอดที่จับคู่ไม่ตรงกันเป๊ะ หรือเป็นการเปลี่ยนการจับคู่เดิม — ต้องอธิบายเหตุผลไว้เสมอ (`35` §10)',
  },
  ALREADY_MATCHED: {
    title: 'รายการนี้จับคู่ไปแล้ว',
    message: 'ยืนยันอีกครั้งเพื่อเปลี่ยนการจับคู่เดิม — ระบบจะบันทึกการเปลี่ยนแปลงลง audit log',
  },
}

export function bankReconErrorStatus(code: BankReconErrorCode): number {
  return HTTP_STATUS[code]
}

export function bankReconErrorMessage(code: BankReconErrorCode): ErrorMessage {
  return MESSAGES[code]
}

export class BankReconError extends ModuleError<BankReconErrorCode> {
  constructor(code: BankReconErrorCode, options?: { detail?: string; context?: Record<string, unknown> }) {
    super(code, MESSAGES[code], HTTP_STATUS[code], options)
    this.name = 'BankReconError'
  }
}

export function isBankReconError(error: unknown): error is BankReconError {
  return error instanceof BankReconError
}

/** `ALREADY_MATCHED` เป็น warning ของ envelope — คู่ขนานกับ `duplicatePaymentFileWarning()` ของ 3.4 */
export function alreadyMatchedWarning(previousRef: string): { code: string; title: string; message: string } {
  return {
    code: 'ALREADY_MATCHED',
    title: MESSAGES.ALREADY_MATCHED.title,
    message: `รายการนี้จับคู่กับ ${previousRef} อยู่แล้ว — ยืนยันอีกครั้งเพื่อเปลี่ยนการจับคู่ (ต้องระบุเหตุผล)`,
  }
}
