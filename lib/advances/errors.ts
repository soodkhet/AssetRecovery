import { ModuleError, type ErrorMessage } from '@/lib/api/errors'

/**
 * Error code หมวดเงินทดรองจ่าย (ไฟล์ 15) — SSOT อยู่ที่ `docs/24-finance-validation-rules.md` §6.4
 * ⚠️ ห้ามตั้ง code ใหม่ที่นี่โดยไม่เพิ่มลงไฟล์ 24 ใน commit เดียวกัน (Rule 04)
 *
 * `USED_EXCEEDS_REQUEST_NO_TOPUP` **ไม่อยู่ในรายการนี้โดยตั้งใจ** — เป็นของ `FinanceError`
 * (`lib/finance/errors.ts`) ที่ `assertSettlementAllowed()` ของ Phase 3.1 โยนอยู่แล้ว ห้าม declare ซ้ำ
 */

export const ADVANCE_ERROR_CODES = [
  'ADVANCE_PENDING_SETTLEMENT',
  'ADVANCE_EXCEEDS_MAX',
  'ADVANCE_NOT_FOUND',
  'ADVANCE_INVALID_STATUS',
  'REJECTION_REASON_REQUIRED',
] as const

export type AdvanceErrorCode = (typeof ADVANCE_ERROR_CODES)[number]

/** 404 = ไม่พบเป้าหมาย (ไม่ leak ว่ามี record นี้ใน scope อื่นไหม) · 400 = ผิดกติกาข้อมูล/สถานะ */
const HTTP_STATUS: Record<AdvanceErrorCode, number> = {
  ADVANCE_PENDING_SETTLEMENT: 400,
  ADVANCE_EXCEEDS_MAX: 400,
  ADVANCE_NOT_FOUND: 404,
  ADVANCE_INVALID_STATUS: 400,
  REJECTION_REASON_REQUIRED: 400,
}

const MESSAGES: Record<AdvanceErrorCode, ErrorMessage> = {
  ADVANCE_PENDING_SETTLEMENT: {
    title: 'มีเงินทดรองค้างอยู่',
    message: 'ต้องเคลียร์ยอดเงินทดรองรอบเดิมให้เสร็จก่อน จึงขอเบิกรอบใหม่ได้ (`15` §9.2)',
  },
  ADVANCE_EXCEEDS_MAX: {
    title: 'ยอดขอเบิกเกินเพดาน',
    message: 'ยอดที่ขอเบิกเกินเพดานเงินทดรองต่อครั้งที่องค์กรตั้งไว้ (`13` §6.2.1)',
  },
  ADVANCE_NOT_FOUND: {
    title: 'ไม่พบคำขอเงินทดรอง',
    message: 'ไม่พบคำขอเงินทดรองนี้ หรือคุณไม่มีสิทธิ์ดูรายการนี้',
  },
  ADVANCE_INVALID_STATUS: {
    title: 'สถานะคำขอไม่ถูกต้อง',
    message: 'สถานะปัจจุบันของคำขอเงินทดรองทำรายการนี้ไม่ได้ (`23` §6.4)',
  },
  REJECTION_REASON_REQUIRED: {
    title: 'ต้องระบุเหตุผล',
    message: 'การปฏิเสธคำขอเงินทดรองต้องระบุเหตุผลให้ผู้ขอเสมอ (`15` §11)',
  },
}

export function advanceErrorStatus(code: AdvanceErrorCode): number {
  return HTTP_STATUS[code]
}

export function advanceErrorMessage(code: AdvanceErrorCode): ErrorMessage {
  return MESSAGES[code]
}

export class AdvanceError extends ModuleError<AdvanceErrorCode> {
  constructor(code: AdvanceErrorCode, options?: { detail?: string; context?: Record<string, unknown> }) {
    super(code, MESSAGES[code], HTTP_STATUS[code], options)
    this.name = 'AdvanceError'
  }
}

export function isAdvanceError(error: unknown): error is AdvanceError {
  return error instanceof AdvanceError
}
