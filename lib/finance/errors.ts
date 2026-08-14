import { ModuleError, type ErrorMessage } from '@/lib/api/errors'

/**
 * Error code หมวดสูตรการเงิน (ไฟล์ 15/16/20 ที่ถูกใช้จาก pure module ของ `22`)
 * — SSOT อยู่ที่ `docs/24-finance-validation-rules.md` §6.4/§6.7 ทุกตัว
 *
 * ⚠️ ห้ามตั้ง code ใหม่ที่นี่โดยไม่เพิ่มลงไฟล์ 24 ใน commit เดียวกัน (Rule 04)
 *
 * code ที่โมดูลอื่นเป็นเจ้าของอยู่แล้วและสูตรใน `lib/finance/*` เรียกใช้ซ้ำ **ห้าม declare ที่นี่**:
 * `VAT_RATE_NOT_FOUND` · `INVALID_WHT_RATE` · `APPROVAL_MATRIX_NOT_FOUND` (ทั้งหมดอยู่ `SettingsError`)
 */

export const FINANCE_ERROR_CODES = [
  // §6.4 เงินทดรองจ่าย (ไฟล์ 15)
  'USED_EXCEEDS_REQUEST_NO_TOPUP',
  // §6.4 ขั้นอนุมัติค่าตอบแทน (ไฟล์ 16)
  'APPROVAL_STEP_OUT_OF_ORDER',
  'SEGREGATION_OF_DUTIES_VIOLATION',
  // §6.7 รายการปรับปรุง (ไฟล์ 20)
  'INSUFFICIENT_APPROVAL_LEVEL',
] as const

export type FinanceErrorCode = (typeof FINANCE_ERROR_CODES)[number]

/** 400 = ผิดกติกาข้อมูล/สถานะ · 403 = สิทธิ์/ระดับผู้อนุมัติไม่พอ (ไม่ใช่ข้อมูลผิด) — ตรงกับ `lib/api/error-catalog.ts` */
const HTTP_STATUS: Record<FinanceErrorCode, number> = {
  USED_EXCEEDS_REQUEST_NO_TOPUP: 400,
  APPROVAL_STEP_OUT_OF_ORDER: 400,
  SEGREGATION_OF_DUTIES_VIOLATION: 403,
  INSUFFICIENT_APPROVAL_LEVEL: 403,
}

const MESSAGES: Record<FinanceErrorCode, ErrorMessage> = {
  USED_EXCEEDS_REQUEST_NO_TOPUP: {
    title: 'ยอดใช้จริงเกินยอดที่ขอเบิก',
    message:
      'ยอดใช้จริงมากกว่ายอดที่ขอเบิก — ระบบไม่เพิ่มยอดทดรองย้อนหลัง ให้สร้างรายการเบิกใหม่สำหรับส่วนที่เกินแยกต่างหาก (`15` §11)',
  },
  APPROVAL_STEP_OUT_OF_ORDER: {
    title: 'อนุมัติข้ามขั้น',
    message: 'รายการนี้ยังไม่ถึงขั้นอนุมัติของคุณ — ต้องผ่านขั้นก่อนหน้าให้ครบก่อน (`16` §9)',
  },
  SEGREGATION_OF_DUTIES_VIOLATION: {
    title: 'ผู้อนุมัติซ้ำคนเดิม',
    message: 'สายอนุมัตินี้บังคับแยกหน้าที่ — ผู้อนุมัติคนเดียวกันอนุมัติซ้ำสองขั้นในรายการเดียวกันไม่ได้ (`13` §6.2 · `16` §10)',
  },
  INSUFFICIENT_APPROVAL_LEVEL: {
    title: 'ระดับผู้อนุมัติไม่พอ',
    message: 'รายการต้นทางอยู่ในรอบบัญชีที่ต้องใช้ผู้อนุมัติระดับสูงกว่านี้ — ดูระดับที่ต้องใช้ตามนโยบายล็อกรอบ (`20` §6.2)',
  },
}

export function financeErrorStatus(code: FinanceErrorCode): number {
  return HTTP_STATUS[code]
}

export function financeErrorMessage(code: FinanceErrorCode): ErrorMessage {
  return MESSAGES[code]
}

export class FinanceError extends ModuleError<FinanceErrorCode> {
  constructor(code: FinanceErrorCode, options?: { detail?: string; context?: Record<string, unknown> }) {
    super(code, MESSAGES[code], HTTP_STATUS[code], options)
    this.name = 'FinanceError'
  }
}

export function isFinanceError(error: unknown): error is FinanceError {
  return error instanceof FinanceError
}
