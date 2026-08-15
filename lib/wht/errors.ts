import { ModuleError, type ErrorMessage } from '@/lib/api/errors'

/**
 * Error code หมวดหนังสือรับรองหัก ณ ที่จ่าย (ไฟล์ 33) — SSOT อยู่ที่ `docs/24` §6.8
 * ⚠️ ห้ามตั้ง code ใหม่ที่นี่โดยไม่เพิ่มลงไฟล์ 24 ใน commit เดียวกัน (Rule 04)
 *
 * code ที่ไฟล์ 24 มีอยู่ก่อนแล้ว: `WHT_CANCEL_REQUIRES_REASON` (§6.8 · `33` §11)
 * ที่เติมเข้า `24` พร้อม commit นี้ (v4.10): `WHT_CERTIFICATE_NOT_FOUND` /
 * `WHT_CERTIFICATE_INVALID_STATUS` / `WHT_FILING_SUMMARY_NOT_FOUND` / `WHT_FILING_ALREADY_FILED`
 * — `33` §11 ระบุไว้แค่ 2 เคส (overdue + cancel reason) ซึ่งไม่ครอบคลุม 404 ของตัวเอกสารเอง
 * และการ mark-filed ซ้ำ
 *
 * `FILING_OVERDUE_WARNING` **ไม่อยู่ที่นี่** — เป็น warning ไม่ใช่ error (`24` §6.8 warn-only)
 * เดินทางไปกับ envelope ผ่าน `filingOverdueWarning()` ของ `lib/wht/wht.ts`
 */

export const WHT_ERROR_CODES = [
  'WHT_CERTIFICATE_NOT_FOUND',
  'WHT_CERTIFICATE_INVALID_STATUS',
  'WHT_CANCEL_REQUIRES_REASON',
  'WHT_FILING_SUMMARY_NOT_FOUND',
  'WHT_FILING_ALREADY_FILED',
] as const

export type WhtErrorCode = (typeof WHT_ERROR_CODES)[number]

const HTTP_STATUS: Record<WhtErrorCode, number> = {
  WHT_CERTIFICATE_NOT_FOUND: 404,
  WHT_CERTIFICATE_INVALID_STATUS: 400,
  WHT_CANCEL_REQUIRES_REASON: 400,
  WHT_FILING_SUMMARY_NOT_FOUND: 404,
  WHT_FILING_ALREADY_FILED: 400,
}

const MESSAGES: Record<WhtErrorCode, ErrorMessage> = {
  WHT_CERTIFICATE_NOT_FOUND: {
    title: 'ไม่พบหนังสือรับรอง',
    message: 'ไม่พบหนังสือรับรองหัก ณ ที่จ่ายฉบับนี้ หรือคุณไม่มีสิทธิ์เข้าถึง',
  },
  WHT_CERTIFICATE_INVALID_STATUS: {
    title: 'ยกเลิกหนังสือรับรองฉบับนี้ไม่ได้',
    message: 'ใบที่ยกเลิกแล้วเป็นสถานะสุดท้าย ห้ามลบและห้ามย้อนกลับ (`02` §13) — ถ้าต้องแก้ให้ออกใบใหม่แทน',
  },
  WHT_CANCEL_REQUIRES_REASON: {
    title: 'ต้องระบุเหตุผลการยกเลิก',
    message: 'การยกเลิกหนังสือรับรองหัก ณ ที่จ่ายต้องกรอกเหตุผลเสมอ เพื่อบันทึกไว้ในเอกสารและ audit log (`33` §11)',
  },
  WHT_FILING_SUMMARY_NOT_FOUND: {
    title: 'ไม่พบสรุปรอบนำส่ง',
    message: 'ไม่พบสรุปรอบนำส่ง ภ.ง.ด.3/53 ของงวดนี้ หรือคุณไม่มีสิทธิ์เข้าถึง',
  },
  WHT_FILING_ALREADY_FILED: {
    title: 'รอบนี้ mark ว่ายื่นแล้ว',
    message: 'สรุปรอบนำส่งนี้ถูก mark ว่ายื่นแบบแล้ว — ทำซ้ำไม่ได้ (`33` §9)',
  },
}

export function whtErrorStatus(code: WhtErrorCode): number {
  return HTTP_STATUS[code]
}

export function whtErrorMessage(code: WhtErrorCode): ErrorMessage {
  return MESSAGES[code]
}

export class WhtError extends ModuleError<WhtErrorCode> {
  constructor(code: WhtErrorCode, options?: { detail?: string; context?: Record<string, unknown> }) {
    super(code, MESSAGES[code], HTTP_STATUS[code], options)
    this.name = 'WhtError'
  }
}

export function isWhtError(error: unknown): error is WhtError {
  return error instanceof WhtError
}
