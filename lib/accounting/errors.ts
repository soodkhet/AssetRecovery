import { ModuleError, type ErrorMessage } from '@/lib/api/errors'

/**
 * Error code หมวดปิดงวดบัญชี + Exception (ไฟล์ 30 · 34) — SSOT อยู่ที่
 * `docs/24-finance-validation-rules.md` §6.7/§6.8
 * ⚠️ ห้ามตั้ง code ใหม่ที่นี่โดยไม่เพิ่มลงไฟล์ 24 ใน commit เดียวกัน (Rule 04)
 *
 * code ที่ไฟล์ 24 มีอยู่ก่อนแล้ว: `NOT_READY_CRITICAL_OPEN` / `NOT_READY_RECONCILE_INCOMPLETE` /
 * `NOT_READY_BILLING_REVENUE_MISMATCH` / `UNLOCK_REQUIRES_EXECUTIVE` (§6.7) ·
 * `EXPORT_BLOCKED_CRITICAL` / `AUTHORIZED_EXCEPTION_REASON_REQUIRED` (§6.8)
 * ที่เติมเข้า `24` พร้อม commit นี้ (v4.5): `PERIOD_NOT_FOUND`, `PERIOD_INVALID_STATUS`,
 * `EXCEPTION_NOT_FOUND`, `EXCEPTION_INVALID_STATUS` — กรณี 404 และ transition ที่ `23`
 * §6.12/§6.13 ไม่รองรับ ซึ่งไฟล์ 30/34 ไม่ได้ระบุ code ไว้
 *
 * `PERIOD_LOCKED_DIRECT_EDIT` **ไม่อยู่ที่นี่โดยตั้งใจ** — เป็นของ `SettingsError`
 * (`lib/settings/errors.ts` · `13` §6.11) ที่ `assertPeriodEditable()` โยนให้เอง ห้าม declare ซ้ำ
 */

export const ACCOUNTING_ERROR_CODES = [
  // §6.7 ปิดงวด (ไฟล์ 30)
  'PERIOD_NOT_FOUND',
  'PERIOD_INVALID_STATUS',
  'NOT_READY_CRITICAL_OPEN',
  'NOT_READY_RECONCILE_INCOMPLETE',
  'NOT_READY_BILLING_REVENUE_MISMATCH',
  'UNLOCK_REQUIRES_EXECUTIVE',
  // §6.8 Exception (ไฟล์ 34)
  'EXCEPTION_NOT_FOUND',
  'EXCEPTION_INVALID_STATUS',
  'AUTHORIZED_EXCEPTION_REASON_REQUIRED',
  'EXPORT_BLOCKED_CRITICAL',
  // §6.8 ข้อซักถามจากสำนักงานบัญชี (ไฟล์ 36)
  'ACCOUNTANT_QUESTION_NOT_FOUND',
  'ACCOUNTANT_QUESTION_ALREADY_ANSWERED',
] as const

export type AccountingErrorCode = (typeof ACCOUNTING_ERROR_CODES)[number]

/** 404 = ไม่พบ (ไม่ leak ข้ามองค์กร) · 403 = สิทธิ์ไม่ถึง · 400 = ผิดกติกาข้อมูล/สถานะ */
const HTTP_STATUS: Record<AccountingErrorCode, number> = {
  PERIOD_NOT_FOUND: 404,
  PERIOD_INVALID_STATUS: 400,
  NOT_READY_CRITICAL_OPEN: 400,
  NOT_READY_RECONCILE_INCOMPLETE: 400,
  NOT_READY_BILLING_REVENUE_MISMATCH: 400,
  UNLOCK_REQUIRES_EXECUTIVE: 403,
  EXCEPTION_NOT_FOUND: 404,
  EXCEPTION_INVALID_STATUS: 400,
  AUTHORIZED_EXCEPTION_REASON_REQUIRED: 400,
  EXPORT_BLOCKED_CRITICAL: 400,
  ACCOUNTANT_QUESTION_NOT_FOUND: 404,
  ACCOUNTANT_QUESTION_ALREADY_ANSWERED: 400,
}

const MESSAGES: Record<AccountingErrorCode, ErrorMessage> = {
  PERIOD_NOT_FOUND: {
    title: 'ไม่พบรอบบัญชี',
    message: 'ไม่พบรอบบัญชีนี้ หรือคุณไม่มีสิทธิ์เข้าถึงรอบบัญชีนี้',
  },
  PERIOD_INVALID_STATUS: {
    title: 'สถานะรอบบัญชีไม่รองรับ',
    message: 'สถานะปัจจุบันของรอบบัญชีทำรายการนี้ไม่ได้ตามลำดับใน `23` §6.13',
  },
  NOT_READY_CRITICAL_OPEN: {
    title: 'ยังมีข้อยกเว้นระดับวิกฤตค้างอยู่',
    message: 'ปิดงวดไม่ได้ — ต้องแก้ไขข้อยกเว้นระดับวิกฤต (critical) ที่ยังเปิดอยู่ให้หมดก่อน หรือให้ผู้บริหารอนุมัติยกเว้น',
  },
  NOT_READY_RECONCILE_INCOMPLETE: {
    title: 'กระทบยอดธนาคารยังไม่ครบ',
    message: 'ปิดงวดไม่ได้ — ยังมีรายการเดินบัญชีที่ยังไม่จับคู่ในรอบนี้',
  },
  NOT_READY_BILLING_REVENUE_MISMATCH: {
    title: 'ยอดวางบิลยังไม่ตรงกับรายได้',
    message: 'ปิดงวดไม่ได้ — ยอดรอบวางบิลกับรายได้ของรอบนี้ยังไม่ตรงกัน',
  },
  UNLOCK_REQUIRES_EXECUTIVE: {
    title: 'ปลดล็อกรอบได้เฉพาะผู้บริหาร',
    message: 'การปลดล็อกรอบบัญชีที่ปิดแล้วต้องเป็นผู้บริหารเท่านั้น (`13` §6.11)',
  },
  EXCEPTION_NOT_FOUND: {
    title: 'ไม่พบข้อยกเว้น',
    message: 'ไม่พบรายการข้อยกเว้นนี้ หรือคุณไม่มีสิทธิ์เข้าถึงรายการนี้',
  },
  EXCEPTION_INVALID_STATUS: {
    title: 'สถานะข้อยกเว้นไม่ถูกต้อง',
    message: 'รายการนี้ถูกปิดหรืออนุมัติยกเว้นไปแล้ว — แก้ไขหรือเปลี่ยนสถานะซ้ำไม่ได้ (`23` §6.12)',
  },
  AUTHORIZED_EXCEPTION_REASON_REQUIRED: {
    title: 'ต้องระบุเหตุผลการอนุมัติยกเว้น',
    message: 'การอนุมัติยกเว้นเป็นการข้ามกฎความปลอดภัยที่ตั้งใจไว้ ต้องบันทึกเหตุผลไว้เสมอ (`34` §10)',
  },
  EXPORT_BLOCKED_CRITICAL: {
    title: 'ส่งข้อมูลบัญชีไม่ได้',
    message: 'ยังมีข้อยกเว้นระดับวิกฤต (critical) ที่เปิดอยู่ในรอบนี้ — แก้ไขให้เรียบร้อยหรือให้ผู้บริหารอนุมัติยกเว้นก่อน',
  },
  ACCOUNTANT_QUESTION_NOT_FOUND: {
    title: 'ไม่พบข้อซักถาม',
    message: 'ไม่พบข้อซักถามนี้ หรือคุณไม่มีสิทธิ์เข้าถึงรายการนี้',
  },
  ACCOUNTANT_QUESTION_ALREADY_ANSWERED: {
    title: 'ข้อซักถามนี้ตอบไปแล้ว',
    message: 'คำตอบที่บันทึกแล้วแก้ไม่ได้ เพื่อคงหลักฐานการสื่อสารกับสำนักงานบัญชี — ถ้ามีข้อมูลเพิ่มให้บันทึกเป็นข้อซักถามใหม่ (`36` §8)',
  },
}

export function accountingErrorStatus(code: AccountingErrorCode): number {
  return HTTP_STATUS[code]
}

export function accountingErrorMessage(code: AccountingErrorCode): ErrorMessage {
  return MESSAGES[code]
}

export class AccountingError extends ModuleError<AccountingErrorCode> {
  constructor(code: AccountingErrorCode, options?: { detail?: string; context?: Record<string, unknown> }) {
    super(code, MESSAGES[code], HTTP_STATUS[code], options)
    this.name = 'AccountingError'
  }
}

export function isAccountingError(error: unknown): error is AccountingError {
  return error instanceof AccountingError
}
