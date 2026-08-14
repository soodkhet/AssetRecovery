import { ModuleError, type ErrorMessage } from '@/lib/api/errors'

/**
 * Error code หมวดผู้รับเงิน (ไฟล์ 18) — SSOT อยู่ที่ `docs/24-finance-validation-rules.md` §6.5
 * ⚠️ ห้ามตั้ง code ใหม่ที่นี่โดยไม่เพิ่มลงไฟล์ 24 ใน commit เดียวกัน (Rule 04)
 *
 * `BANK_ACCOUNT_NAME_MISMATCH` (`18` §11) **ไม่อยู่ในรายการนี้โดยตั้งใจ** — เป็น code หมวด "เตือน
 * ไม่ block" 1 ใน 5 ตัวของระบบ (Rule 04) จึงเดินทางไปกับ `warning` ของ envelope ไม่ใช่ throw
 */

export const PAYEE_ERROR_CODES = [
  'PAYEE_NOT_FOUND',
  'PAYEE_ALREADY_EXISTS',
  'PAYEE_ID_DOCUMENT_REQUIRED',
  'REQUIRED_MISSING',
  'INVALID_TAX_ID_FORMAT',
] as const

export type PayeeErrorCode = (typeof PAYEE_ERROR_CODES)[number]

/** 404 = ไม่พบเป้าหมาย (ไม่ leak ว่ามี record นี้ในองค์กร/scope อื่นไหม) · 400 = ผิดกติกาข้อมูล */
const HTTP_STATUS: Record<PayeeErrorCode, number> = {
  PAYEE_NOT_FOUND: 404,
  PAYEE_ALREADY_EXISTS: 400,
  PAYEE_ID_DOCUMENT_REQUIRED: 400,
  REQUIRED_MISSING: 400,
  INVALID_TAX_ID_FORMAT: 400,
}

const MESSAGES: Record<PayeeErrorCode, ErrorMessage> = {
  PAYEE_NOT_FOUND: {
    title: 'ไม่พบผู้รับเงิน',
    message: 'ไม่พบข้อมูลผู้รับเงินที่ระบุ หรือคุณไม่มีสิทธิ์ดูข้อมูลรายนี้',
  },
  PAYEE_ALREADY_EXISTS: {
    title: 'ผู้ใช้รายนี้มีข้อมูลผู้รับเงินแล้ว',
    message: 'ผู้ใช้ 1 คนมีข้อมูลผู้รับเงินได้ 1 ชุดเท่านั้น (ไฟล์ 18 §6.1) — แก้ไขชุดเดิมแทนการสร้างใหม่',
  },
  PAYEE_ID_DOCUMENT_REQUIRED: {
    title: 'ต้องแนบเอกสารยืนยันตัวตนก่อน',
    message: 'องค์กรตั้งค่าให้ต้องแนบเอกสารยืนยันตัวตน (สำเนาบัตรประชาชน/หนังสือรับรองบริษัท) ก่อนยืนยันผู้รับเงิน',
  },
  REQUIRED_MISSING: {
    title: 'ข้อมูลไม่ครบ',
    message: 'ยืนยันผู้รับเงินได้ต่อเมื่อข้อมูลภาษีและบัญชีธนาคารครบถ้วนแล้ว (ไฟล์ 18 §9)',
  },
  INVALID_TAX_ID_FORMAT: {
    title: 'เลขประจำตัวผู้เสียภาษีไม่ถูกต้อง',
    message: 'เลขบัตรประชาชน/เลขทะเบียนนิติบุคคลต้องเป็นตัวเลข 13 หลัก',
  },
}

export function payeeErrorStatus(code: PayeeErrorCode): number {
  return HTTP_STATUS[code]
}

export function payeeErrorMessage(code: PayeeErrorCode): ErrorMessage {
  return MESSAGES[code]
}

export class PayeeError extends ModuleError<PayeeErrorCode> {
  constructor(code: PayeeErrorCode, options?: { detail?: string; context?: Record<string, unknown> }) {
    super(code, MESSAGES[code], HTTP_STATUS[code], options)
    this.name = 'PayeeError'
  }
}

export function isPayeeError(error: unknown): error is PayeeError {
  return error instanceof PayeeError
}
