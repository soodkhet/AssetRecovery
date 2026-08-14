import { ModuleError, type ErrorMessage, toModuleErrorResponse } from '@/lib/api/http'

/**
 * Error code หมวดเทมเพลตค่าบริการ (ไฟล์ 12) — SSOT อยู่ที่ `docs/24-finance-validation-rules.md` §6.1
 * ⚠️ ห้ามตั้ง code ใหม่ที่นี่โดยไม่เพิ่มลงไฟล์ 24 ใน commit เดียวกัน (Rule 04)
 */

export const SERVICE_FEE_ERROR_CODES = [
  'TEMPLATE_NOT_FOUND',
  'DUPLICATE_TEMPLATE_NAME',
  'VERSION_NOT_CURRENT',
  'TEMPLATE_IN_USE',
  'INVALID_RATE_RANGE',
] as const

export type ServiceFeeErrorCode = (typeof SERVICE_FEE_ERROR_CODES)[number]

const HTTP_STATUS: Record<ServiceFeeErrorCode, number> = {
  TEMPLATE_NOT_FOUND: 404,
  DUPLICATE_TEMPLATE_NAME: 400,
  VERSION_NOT_CURRENT: 400,
  TEMPLATE_IN_USE: 400,
  INVALID_RATE_RANGE: 400,
}

const MESSAGES: Record<ServiceFeeErrorCode, ErrorMessage> = {
  TEMPLATE_NOT_FOUND: {
    title: 'ไม่พบเทมเพลตค่าบริการ',
    message: 'ไม่พบเทมเพลตค่าบริการที่ระบุ หรือถูกปิดใช้งานไปแล้ว',
  },
  DUPLICATE_TEMPLATE_NAME: {
    title: 'ชื่อเทมเพลตซ้ำ',
    message: 'มีเทมเพลตค่าบริการชื่อนี้อยู่แล้วในองค์กร — ใช้ชื่ออื่นหรือแก้ไขเทมเพลตเดิมเพื่อสร้างเวอร์ชันใหม่',
  },
  VERSION_NOT_CURRENT: {
    title: 'แก้ไขเวอร์ชันย้อนหลังไม่ได้',
    message: 'แก้ไขได้เฉพาะเวอร์ชันปัจจุบันเท่านั้น — เวอร์ชันเก่าเก็บไว้เป็นประวัติ (ไฟล์ 12 §9)',
  },
  TEMPLATE_IN_USE: {
    title: 'ปิดใช้งานเทมเพลตที่มีบริษัทผูกอยู่ไม่ได้',
    message: 'ย้ายบริษัทไฟแนนซ์ทั้งหมดไปผูกเทมเพลตอื่นก่อน จึงจะปิดใช้งานเทมเพลตนี้ได้ (ไฟล์ 12 §10)',
  },
  INVALID_RATE_RANGE: {
    title: 'อัตราค่าความสำเร็จไม่ถูกต้อง',
    message: 'อัตราค่าความสำเร็จ (rate) ต้องอยู่ระหว่าง 0-100 เปอร์เซ็นต์',
  },
}

export function serviceFeeErrorStatus(code: ServiceFeeErrorCode): number {
  return HTTP_STATUS[code]
}

export function serviceFeeErrorMessage(code: ServiceFeeErrorCode): ErrorMessage {
  return MESSAGES[code]
}

export class ServiceFeeError extends ModuleError<ServiceFeeErrorCode> {
  constructor(
    code: ServiceFeeErrorCode,
    options?: { detail?: string; context?: Record<string, unknown> },
  ) {
    super(code, MESSAGES[code], HTTP_STATUS[code], options)
    this.name = 'ServiceFeeError'
  }
}

export function isServiceFeeError(error: unknown): error is ServiceFeeError {
  return error instanceof ServiceFeeError
}

export const toServiceFeeErrorResponse = toModuleErrorResponse
