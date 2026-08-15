import { ModuleError, type ErrorMessage } from '@/lib/api/errors'

/**
 * Error code หมวดรายได้/วางบิล (ไฟล์ 19) — SSOT อยู่ที่ `docs/24-finance-validation-rules.md` §6.6
 * ⚠️ ห้ามตั้ง code ใหม่ที่นี่โดยไม่เพิ่มลงไฟล์ 24 ใน commit เดียวกัน (Rule 04)
 *
 * `VAT_RATE_NOT_FOUND` **ไม่อยู่ในรายการนี้โดยตั้งใจ** — เป็นของ `SettingsError` (`13` §6.5 · 1.10)
 * ทุกจุดที่คิด VAT เรียก `calculateVatForRevenue()` ซึ่งโยนตัวนั้นให้เอง ห้าม declare ซ้ำ
 */

export const REVENUE_ERROR_CODES = [
  'NO_REVENUE_TO_BILL',
  'EDIT_BILLED_REVENUE',
  'BILLING_BATCH_NOT_FOUND',
  'BILLING_BATCH_INVALID_STATUS',
] as const

export type RevenueErrorCode = (typeof REVENUE_ERROR_CODES)[number]

/** 404 = ไม่พบเป้าหมาย (ไม่ leak ว่ามีอยู่จริงใน scope อื่น) · 400 = ผิดกติกาข้อมูล/สถานะ */
const HTTP_STATUS: Record<RevenueErrorCode, number> = {
  NO_REVENUE_TO_BILL: 400,
  EDIT_BILLED_REVENUE: 400,
  BILLING_BATCH_NOT_FOUND: 404,
  BILLING_BATCH_INVALID_STATUS: 400,
}

const MESSAGES: Record<RevenueErrorCode, ErrorMessage> = {
  NO_REVENUE_TO_BILL: {
    title: 'ไม่มีรายได้ให้วางบิล',
    message: 'ไม่มีรายการรายได้ที่รอวางบิลของบริษัทนี้ภายในรอบที่เลือก (`19` §11)',
  },
  EDIT_BILLED_REVENUE: {
    title: 'แก้รายได้ที่วางบิลแล้วไม่ได้',
    message:
      'รายการรายได้นี้ถูกรวมเข้ารอบวางบิลที่ส่งออกไปแล้ว — ต้องแก้ผ่านรายการปรับปรุง (Adjustment) เท่านั้น (`19` §10)',
  },
  BILLING_BATCH_NOT_FOUND: {
    title: 'ไม่พบรอบวางบิล',
    message: 'ไม่พบรอบวางบิลนี้ หรือคุณไม่มีสิทธิ์ดูรายการนี้',
  },
  BILLING_BATCH_INVALID_STATUS: {
    title: 'สถานะรอบวางบิลไม่ถูกต้อง',
    message: 'สถานะปัจจุบันของรอบวางบิลทำรายการนี้ไม่ได้ (`23` §6.8)',
  },
}

export function revenueErrorStatus(code: RevenueErrorCode): number {
  return HTTP_STATUS[code]
}

export function revenueErrorMessage(code: RevenueErrorCode): ErrorMessage {
  return MESSAGES[code]
}

export class RevenueError extends ModuleError<RevenueErrorCode> {
  constructor(code: RevenueErrorCode, options?: { detail?: string; context?: Record<string, unknown> }) {
    super(code, MESSAGES[code], HTTP_STATUS[code], options)
    this.name = 'RevenueError'
  }
}

export function isRevenueError(error: unknown): error is RevenueError {
  return error instanceof RevenueError
}
