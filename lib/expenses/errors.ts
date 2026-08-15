import { ModuleError, type ErrorMessage } from '@/lib/api/errors'

/**
 * Error code หมวดบัญชีค่าใช้จ่าย (ไฟล์ 32) — SSOT อยู่ที่ `docs/24` §6.8
 * ⚠️ ห้ามตั้ง code ใหม่ที่นี่โดยไม่เพิ่มลงไฟล์ 24 ใน commit เดียวกัน (Rule 04)
 *
 * code ที่ไฟล์ 24 มีอยู่ก่อนแล้ว: `EDIT_AMOUNT_DIRECTLY` / `COST_CENTER_AUTO_EDIT` (§6.8 · `32` §11)
 * ที่เติมเข้า `24` พร้อม commit นี้ (v4.9): `EXPENSE_RECORD_NOT_FOUND` — `32` §11 ระบุไว้แค่ 2 code
 * ซึ่งไม่ครอบคลุมกรณี 404 ของตัวรายการเอง · ศูนย์ต้นทุนที่อ้างไม่เจอใช้ `COST_CENTER_NOT_FOUND`
 * ของโมดูลต้นทาง (`lib/settings/errors.ts` · `13`) **ไม่ประกาศซ้ำที่นี่**
 *
 * `PERIOD_LOCKED_DIRECT_EDIT` **ไม่อยู่ที่นี่** — เป็นของ `SettingsError` ที่ `assertPeriodOpenAt()`
 * โยนให้เอง (`13` §6.11)
 */

export const EXPENSE_RECORD_ERROR_CODES = [
  'EXPENSE_RECORD_NOT_FOUND',
  'EDIT_AMOUNT_DIRECTLY',
  'COST_CENTER_AUTO_EDIT',
] as const

export type ExpenseRecordErrorCode = (typeof EXPENSE_RECORD_ERROR_CODES)[number]

const HTTP_STATUS: Record<ExpenseRecordErrorCode, number> = {
  EXPENSE_RECORD_NOT_FOUND: 404,
  EDIT_AMOUNT_DIRECTLY: 400,
  COST_CENTER_AUTO_EDIT: 400,
}

const MESSAGES: Record<ExpenseRecordErrorCode, ErrorMessage> = {
  EXPENSE_RECORD_NOT_FOUND: {
    title: 'ไม่พบรายการค่าใช้จ่าย',
    message: 'ไม่พบรายการค่าใช้จ่ายนี้ หรือคุณไม่มีสิทธิ์เข้าถึงรายการนี้',
  },
  EDIT_AMOUNT_DIRECTLY: {
    title: 'แก้ยอดเงินที่นี่ไม่ได้',
    message:
      'ยอด Gross/WHT/Net เป็นข้อมูล snapshot จากรอบจ่ายเงินจริง (ไฟล์ 17) แก้ตรงไม่ได้ — ถ้ายอดผิดต้องสร้าง Adjustment (ไฟล์ 20)',
  },
  COST_CENTER_AUTO_EDIT: {
    title: 'รายการนี้ map ศูนย์ต้นทุนอัตโนมัติ',
    message: 'รายการที่ map แบบอัตโนมัติแก้ที่นี่ไม่ได้ — ต้องไปแก้ที่ทีมของผู้รับเงินต้นทาง (`32` §6.2)',
  },
}

export function expenseRecordErrorStatus(code: ExpenseRecordErrorCode): number {
  return HTTP_STATUS[code]
}

export function expenseRecordErrorMessage(code: ExpenseRecordErrorCode): ErrorMessage {
  return MESSAGES[code]
}

export class ExpenseRecordError extends ModuleError<ExpenseRecordErrorCode> {
  constructor(code: ExpenseRecordErrorCode, options?: { detail?: string; context?: Record<string, unknown> }) {
    super(code, MESSAGES[code], HTTP_STATUS[code], options)
    this.name = 'ExpenseRecordError'
  }
}

export function isExpenseRecordError(error: unknown): error is ExpenseRecordError {
  return error instanceof ExpenseRecordError
}
