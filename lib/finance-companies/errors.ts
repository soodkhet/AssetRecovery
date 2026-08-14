import { ModuleError, type ErrorMessage } from '@/lib/api/errors'

/**
 * Error code หมวดบริษัทไฟแนนซ์ (ไฟล์ 10) — SSOT อยู่ที่ `docs/24-finance-validation-rules.md` §6.1
 * ⚠️ ห้ามตั้ง code ใหม่ที่นี่โดยไม่เพิ่มลงไฟล์ 24 ใน commit เดียวกัน (Rule 04)
 */

export const FINANCE_COMPANY_ERROR_CODES = [
  'COMPANY_NOT_FOUND',
  'DUPLICATE_TAX_ID',
  'INVALID_TAX_ID_FORMAT',
  'SUSPEND_REASON_REQUIRED',
  'TEMPLATE_NOT_FOUND',
] as const

export type FinanceCompanyErrorCode = (typeof FINANCE_COMPANY_ERROR_CODES)[number]

/** 400 = ผิดกติกาข้อมูล/สถานะ · 404 = ไม่พบเป้าหมาย (ไม่ leak ว่ามี record นี้ในองค์กรอื่นไหม) */
const HTTP_STATUS: Record<FinanceCompanyErrorCode, number> = {
  COMPANY_NOT_FOUND: 404,
  DUPLICATE_TAX_ID: 400,
  INVALID_TAX_ID_FORMAT: 400,
  SUSPEND_REASON_REQUIRED: 400,
  TEMPLATE_NOT_FOUND: 404,
}

const MESSAGES: Record<FinanceCompanyErrorCode, ErrorMessage> = {
  COMPANY_NOT_FOUND: {
    title: 'ไม่พบบริษัทไฟแนนซ์',
    message: 'ไม่พบบริษัทไฟแนนซ์ที่ระบุ หรือบริษัทนี้ถูกลบไปแล้ว',
  },
  DUPLICATE_TAX_ID: {
    title: 'เลขประจำตัวผู้เสียภาษีซ้ำ',
    message: 'มีบริษัทที่ใช้เลขประจำตัวผู้เสียภาษีนี้อยู่แล้ว — 1 บริษัท = 1 เลขประจำตัวผู้เสียภาษี',
  },
  INVALID_TAX_ID_FORMAT: {
    title: 'รูปแบบเลขประจำตัวผู้เสียภาษีไม่ถูกต้อง',
    message: 'เลขประจำตัวผู้เสียภาษีต้องเป็นตัวเลข 13 หลัก',
  },
  SUSPEND_REASON_REQUIRED: {
    title: 'ต้องระบุเหตุผลที่ระงับ',
    message: 'การระงับบริษัทไฟแนนซ์ต้องระบุเหตุผลเสมอ (`10` §9.3)',
  },
  TEMPLATE_NOT_FOUND: {
    title: 'ไม่พบเทมเพลตค่าบริการ',
    message: 'ไม่พบเทมเพลตค่าบริการที่เลือก หรือถูกปิดใช้งานไปแล้ว — ทุกบริษัทต้องผูกเทมเพลตที่ใช้งานอยู่',
  },
}

export function financeCompanyErrorStatus(code: FinanceCompanyErrorCode): number {
  return HTTP_STATUS[code]
}

export function financeCompanyErrorMessage(code: FinanceCompanyErrorCode): ErrorMessage {
  return MESSAGES[code]
}

export class FinanceCompanyError extends ModuleError<FinanceCompanyErrorCode> {
  constructor(
    code: FinanceCompanyErrorCode,
    options?: { detail?: string; context?: Record<string, unknown> },
  ) {
    super(code, MESSAGES[code], HTTP_STATUS[code], options)
    this.name = 'FinanceCompanyError'
  }
}

export function isFinanceCompanyError(error: unknown): error is FinanceCompanyError {
  return error instanceof FinanceCompanyError
}
