import { ModuleError, type ErrorMessage } from '@/lib/api/errors'

/**
 * Error code หมวดรายการปรับปรุง (ไฟล์ 20) — SSOT อยู่ที่ `docs/24-finance-validation-rules.md` §6.7
 * ⚠️ ห้ามตั้ง code ใหม่ที่นี่โดยไม่เพิ่มลงไฟล์ 24 ใน commit เดียวกัน (Rule 04)
 *
 * `INSUFFICIENT_APPROVAL_LEVEL` **ไม่อยู่ในรายการนี้โดยตั้งใจ** — เป็นของ `FinanceError`
 * (`lib/finance/errors.ts` · 3.1) ที่ `assertApprovalLevelSufficient()` โยนให้เอง ห้าม declare ซ้ำ
 * `PERMISSION_DENIED` (ถือ capability ไม่ตรงระดับ) อยู่ที่ `AdjustmentPermissionError`
 */

export const ADJUSTMENT_ERROR_CODES = [
  'REASON_REQUIRED',
  'REJECTION_REASON_REQUIRED',
  'ADJUSTMENT_NOT_FOUND',
  'ADJUSTMENT_INVALID_STATUS',
  'ADJUSTMENT_TARGET_NOT_FOUND',
] as const

export type AdjustmentErrorCode = (typeof ADJUSTMENT_ERROR_CODES)[number]

/** 404 = ไม่พบเป้าหมาย (ไม่ leak ว่ามีอยู่จริงใน scope อื่น) · 400 = ผิดกติกาข้อมูล/สถานะ */
const HTTP_STATUS: Record<AdjustmentErrorCode, number> = {
  REASON_REQUIRED: 400,
  REJECTION_REASON_REQUIRED: 400,
  ADJUSTMENT_NOT_FOUND: 404,
  ADJUSTMENT_INVALID_STATUS: 400,
  ADJUSTMENT_TARGET_NOT_FOUND: 404,
}

const MESSAGES: Record<AdjustmentErrorCode, ErrorMessage> = {
  REASON_REQUIRED: {
    title: 'ต้องระบุเหตุผล',
    message: 'รายการปรับปรุงต้องกรอกเหตุผลเสมอไม่มีข้อยกเว้น (`20` §10)',
  },
  REJECTION_REASON_REQUIRED: {
    title: 'ต้องระบุเหตุผลที่ปฏิเสธ',
    message: 'การปฏิเสธรายการปรับปรุงเป็นสถานะสุดท้าย ต้องอธิบายเหตุผลไว้ในระบบ (`20` §11)',
  },
  ADJUSTMENT_NOT_FOUND: {
    title: 'ไม่พบรายการปรับปรุง',
    message: 'ไม่พบรายการปรับปรุงนี้ หรือคุณไม่มีสิทธิ์ดูรายการนี้',
  },
  ADJUSTMENT_INVALID_STATUS: {
    title: 'สถานะรายการปรับปรุงไม่ถูกต้อง',
    message: 'รายการนี้ถูกอนุมัติหรือปฏิเสธไปแล้ว — สถานะปัจจุบันทำรายการนี้ไม่ได้ (`23` §6.9)',
  },
  ADJUSTMENT_TARGET_NOT_FOUND: {
    title: 'ไม่พบรายการต้นทาง',
    message: 'ไม่พบรายการต้นทางที่จะปรับปรุง หรือคุณไม่มีสิทธิ์เข้าถึงรายการนั้น',
  },
}

export function adjustmentErrorStatus(code: AdjustmentErrorCode): number {
  return HTTP_STATUS[code]
}

export function adjustmentErrorMessage(code: AdjustmentErrorCode): ErrorMessage {
  return MESSAGES[code]
}

export class AdjustmentError extends ModuleError<AdjustmentErrorCode> {
  constructor(code: AdjustmentErrorCode, options?: { detail?: string; context?: Record<string, unknown> }) {
    super(code, MESSAGES[code], HTTP_STATUS[code], options)
    this.name = 'AdjustmentError'
  }
}

export function isAdjustmentError(error: unknown): error is AdjustmentError {
  return error instanceof AdjustmentError
}
