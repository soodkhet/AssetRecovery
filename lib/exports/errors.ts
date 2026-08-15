import { ModuleError, type ErrorMessage } from '@/lib/api/errors'

/**
 * Error code หมวด Accounting Pack Export (ไฟล์ 37) — SSOT อยู่ที่
 * `docs/24-finance-validation-rules.md` §6.8
 * ⚠️ ห้ามตั้ง code ใหม่ที่นี่โดยไม่เพิ่มลงไฟล์ 24 ใน commit เดียวกัน (Rule 04)
 *
 * `EXPORT_BLOCKED_CRITICAL` **ไม่อยู่ที่นี่โดยตั้งใจ** — เป็นของ `AccountingError`
 * (`lib/accounting/errors.ts` · ยาม `assertExportNotBlocked()` ของ 4.1) ห้าม declare ซ้ำ
 *
 * ที่เติมเข้า `24` §6.8 พร้อม commit นี้ (v4.6): `EXPORT_RECORD_NOT_FOUND`,
 * `EXPORT_INVALID_STATUS`, `EXPORT_PAYEE_TAX_ID_MISSING` — ไฟล์ 37 §11 ระบุไว้แค่ code เดียว
 * แต่ endpoint mark-sent/accept (§14) และกติกา `payee_tax_id` 13 หลัก (§6.1 · DEC-006/D10)
 * ต้องมี code ของตัวเอง ไม่งั้นจะกลายเป็น 500 ที่คนแก้ตามไม่ได้
 */

export const EXPORT_ERROR_CODES = [
  'EXPORT_RECORD_NOT_FOUND',
  'EXPORT_INVALID_STATUS',
  'EXPORT_PAYEE_TAX_ID_MISSING',
] as const

export type ExportErrorCode = (typeof EXPORT_ERROR_CODES)[number]

const HTTP_STATUS: Record<ExportErrorCode, number> = {
  EXPORT_RECORD_NOT_FOUND: 404,
  EXPORT_INVALID_STATUS: 400,
  EXPORT_PAYEE_TAX_ID_MISSING: 400,
}

const MESSAGES: Record<ExportErrorCode, ErrorMessage> = {
  EXPORT_RECORD_NOT_FOUND: {
    title: 'ไม่พบรายการส่งมอบ',
    message: 'ไม่พบประวัติการส่งมอบชุดนี้ หรือคุณไม่มีสิทธิ์เข้าถึงรายการนี้',
  },
  EXPORT_INVALID_STATUS: {
    title: 'สถานะการส่งมอบไม่ถูกต้อง',
    message: 'สถานะปัจจุบันทำรายการนี้ไม่ได้ — ลำดับคือ สร้างไฟล์ → ส่งสำนักงานบัญชี → ตอบรับ (`37` §9)',
  },
  EXPORT_PAYEE_TAX_ID_MISSING: {
    title: 'เลขประจำตัวผู้เสียภาษีของผู้รับเงินไม่ครบ',
    message:
      'ไฟล์ 05_WHT_Data.csv ต้องมีเลขประจำตัวผู้เสียภาษี 13 หลักทุกแถว — แก้โปรไฟล์ผู้รับเงินให้ครบก่อนส่งข้อมูลบัญชี',
  },
}

export function exportErrorStatus(code: ExportErrorCode): number {
  return HTTP_STATUS[code]
}

export function exportErrorMessage(code: ExportErrorCode): ErrorMessage {
  return MESSAGES[code]
}

export class ExportError extends ModuleError<ExportErrorCode> {
  constructor(code: ExportErrorCode, options?: { detail?: string; context?: Record<string, unknown> }) {
    super(code, MESSAGES[code], HTTP_STATUS[code], options)
    this.name = 'ExportError'
  }
}

export function isExportError(error: unknown): error is ExportError {
  return error instanceof ExportError
}
