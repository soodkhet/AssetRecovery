import { ModuleError, type ErrorMessage } from '@/lib/api/errors'

/**
 * Error code หมวดแผนค่าตอบแทน (ไฟล์ 11) — SSOT อยู่ที่ `docs/24-finance-validation-rules.md` §6.1
 * ⚠️ ห้ามตั้ง code ใหม่ที่นี่โดยไม่เพิ่มลงไฟล์ 24 ใน commit เดียวกัน (Rule 04)
 */

export const COMPENSATION_ERROR_CODES = [
  'PLAN_NOT_FOUND',
  'DUPLICATE_TEMPLATE_NAME',
  'VERSION_NOT_CURRENT',
  'PLAN_IN_USE',
] as const

export type CompensationErrorCode = (typeof COMPENSATION_ERROR_CODES)[number]

/** 400 = ผิดกติกาข้อมูล/สถานะ · 404 = ไม่พบเป้าหมาย (ไม่ leak ว่ามี record นี้ในองค์กรอื่นไหม) */
const HTTP_STATUS: Record<CompensationErrorCode, number> = {
  PLAN_NOT_FOUND: 404,
  DUPLICATE_TEMPLATE_NAME: 400,
  VERSION_NOT_CURRENT: 400,
  PLAN_IN_USE: 400,
}

const MESSAGES: Record<CompensationErrorCode, ErrorMessage> = {
  PLAN_NOT_FOUND: {
    title: 'ไม่พบแผนค่าตอบแทน',
    message: 'ไม่พบแผนค่าตอบแทนที่ระบุ หรือถูกปิดใช้งานไปแล้ว',
  },
  DUPLICATE_TEMPLATE_NAME: {
    title: 'ชื่อแผนค่าตอบแทนซ้ำ',
    message: 'มีแผนค่าตอบแทนชื่อนี้อยู่แล้วในองค์กร — ใช้ชื่ออื่นหรือแก้ไขแผนเดิมเพื่อสร้างเวอร์ชันใหม่',
  },
  VERSION_NOT_CURRENT: {
    title: 'แก้ไขเวอร์ชันย้อนหลังไม่ได้',
    message: 'แก้ไขได้เฉพาะเวอร์ชันปัจจุบันเท่านั้น — เวอร์ชันเก่าเก็บไว้เป็นประวัติ (ไฟล์ 11 §10)',
  },
  PLAN_IN_USE: {
    title: 'ปิดใช้งานแผนที่มีทีมผูกอยู่ไม่ได้',
    message: 'ย้ายทีมทั้งหมดไปผูกแผนค่าตอบแทนอื่นก่อน จึงจะปิดใช้งานแผนนี้ได้',
  },
}

export function compensationErrorStatus(code: CompensationErrorCode): number {
  return HTTP_STATUS[code]
}

export function compensationErrorMessage(code: CompensationErrorCode): ErrorMessage {
  return MESSAGES[code]
}

export class CompensationError extends ModuleError<CompensationErrorCode> {
  constructor(
    code: CompensationErrorCode,
    options?: { detail?: string; context?: Record<string, unknown> },
  ) {
    super(code, MESSAGES[code], HTTP_STATUS[code], options)
    this.name = 'CompensationError'
  }
}

export function isCompensationError(error: unknown): error is CompensationError {
  return error instanceof CompensationError
}

