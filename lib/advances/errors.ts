import { ModuleError, type ErrorMessage } from '@/lib/api/errors'

/**
 * Error code หมวดเงินทดรองจ่าย (ไฟล์ 15) — SSOT อยู่ที่ `docs/24-finance-validation-rules.md` §6.4
 * ⚠️ ห้ามตั้ง code ใหม่ที่นี่โดยไม่เพิ่มลงไฟล์ 24 ใน commit เดียวกัน (Rule 04)
 *
 * (`USED_EXCEEDS_REQUEST_NO_TOPUP` ถูกยกเลิกจาก `24` แล้ว — มติ PO 03/10/2569 UAT Q3: ใช้เกินยอด
 * เคลียร์ได้ + สร้างคำขอเบิกส่วนเกินอัตโนมัติ ไม่มีการปฏิเสธอีก)
 */

export const ADVANCE_ERROR_CODES = [
  'ADVANCE_PENDING_SETTLEMENT',
  'ADVANCE_EXCEEDS_MAX',
  'ADVANCE_NOT_FOUND',
  'ADVANCE_INVALID_STATUS',
  'REJECTION_REASON_REQUIRED',
  // มติ PO 05/10/2569 (UAT U30) — รับคืนแยกเกินยอดคืนค้าง
  'ADVANCE_RETURN_EXCEEDS_OUTSTANDING',
  // มติ PO 05/10/2569 (UAT U74) — เคลียร์ยอดขณะเงินทดรองอยู่ในรอบจ่ายที่ยังไม่โอนจริง
  'ADVANCE_IN_PENDING_PAYOUT',
  // staging E-012 (มติ PO 10/10/2569) — ตีกลับการเคลียร์ไม่ได้ (มีรับคืน/หักกลบแล้ว · ตรวจแล้ว · มีใบใหม่ค้าง ฯลฯ)
  'ADVANCE_CLEAR_NOT_REOPENABLE',
] as const

export type AdvanceErrorCode = (typeof ADVANCE_ERROR_CODES)[number]

/** 404 = ไม่พบเป้าหมาย (ไม่ leak ว่ามี record นี้ใน scope อื่นไหม) · 400 = ผิดกติกาข้อมูล/สถานะ */
const HTTP_STATUS: Record<AdvanceErrorCode, number> = {
  ADVANCE_PENDING_SETTLEMENT: 400,
  ADVANCE_EXCEEDS_MAX: 400,
  ADVANCE_NOT_FOUND: 404,
  ADVANCE_INVALID_STATUS: 400,
  REJECTION_REASON_REQUIRED: 400,
  ADVANCE_RETURN_EXCEEDS_OUTSTANDING: 400,
  ADVANCE_IN_PENDING_PAYOUT: 400,
  ADVANCE_CLEAR_NOT_REOPENABLE: 400,
}

const MESSAGES: Record<AdvanceErrorCode, ErrorMessage> = {
  ADVANCE_PENDING_SETTLEMENT: {
    title: 'มีเงินทดรองค้างอยู่',
    message: 'ต้องเคลียร์ยอดเงินทดรองรอบเดิมให้เสร็จก่อน จึงขอเบิกรอบใหม่ได้',
  },
  ADVANCE_EXCEEDS_MAX: {
    title: 'ยอดขอเบิกเกินเพดาน',
    message: 'ยอดที่ขอเบิกเกินเพดานเงินทดรองต่อครั้งที่องค์กรตั้งไว้',
  },
  ADVANCE_NOT_FOUND: {
    title: 'ไม่พบคำขอเงินทดรอง',
    message: 'ไม่พบคำขอเงินทดรองนี้ หรือคุณไม่มีสิทธิ์ดูรายการนี้',
  },
  ADVANCE_INVALID_STATUS: {
    title: 'สถานะคำขอไม่ถูกต้อง',
    message: 'สถานะปัจจุบันของคำขอเงินทดรองทำรายการนี้ไม่ได้',
  },
  REJECTION_REASON_REQUIRED: {
    title: 'ต้องระบุเหตุผล',
    message: 'การปฏิเสธคำขอเงินทดรองต้องระบุเหตุผลให้ผู้ขอเสมอ',
  },
  ADVANCE_RETURN_EXCEEDS_OUTSTANDING: {
    title: 'ยอดรับคืนเกินยอดค้าง',
    message: 'ยอดเงินที่รับคืนต้องไม่เกินยอดคืนเงินทดรองที่ยังค้างอยู่',
  },
  ADVANCE_IN_PENDING_PAYOUT: {
    title: 'เงินทดรองยังอยู่ในรอบจ่ายที่ยังไม่โอน',
    message: 'เคลียร์ยอดได้หลังรอบจ่ายที่จ่ายเงินทดรองนี้ยืนยันโอนเงินสำเร็จแล้ว',
  },
  ADVANCE_CLEAR_NOT_REOPENABLE: {
    title: 'ตีกลับการเคลียร์ยอดไม่ได้',
    message: 'การเคลียร์นี้มีรายการต่อเนื่องแล้ว — จัดการรายการนั้นก่อน หรือใช้รายการปรับปรุงแทน',
  },
}

export function advanceErrorStatus(code: AdvanceErrorCode): number {
  return HTTP_STATUS[code]
}

export function advanceErrorMessage(code: AdvanceErrorCode): ErrorMessage {
  return MESSAGES[code]
}

export class AdvanceError extends ModuleError<AdvanceErrorCode> {
  /** `message` = ข้อความไทยเฉพาะกรณี (เช่น บอกชื่อรอบจ่ายที่ต้องรอ) แทนข้อความกลางของ code */
  constructor(
    code: AdvanceErrorCode,
    options?: { detail?: string; context?: Record<string, unknown>; message?: string },
  ) {
    const base = MESSAGES[code]
    super(code, options?.message === undefined ? base : { ...base, message: options.message }, HTTP_STATUS[code], options)
    this.name = 'AdvanceError'
  }
}

export function isAdvanceError(error: unknown): error is AdvanceError {
  return error instanceof AdvanceError
}
