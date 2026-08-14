import { ModuleError, type ErrorMessage } from '@/lib/api/errors'

/**
 * Error code หมวดรับเคส (ไฟล์ 38 §12) — SSOT อยู่ที่ `docs/38-case-submission.md` §12
 * (+ `24` §6.1 สำหรับ code กลางที่โมดูลอื่นใช้ร่วม เช่น `SUSPENDED_COMPANY_NEW_CASE`)
 *
 * ⚠️ Rule 04: ห้ามตั้ง code ใหม่ที่นี่โดยไม่เพิ่มลง `38` §12 + `lib/api/error-catalog.ts` ในคอมมิตเดียวกัน
 * code ที่เติมเข้า `38` §12 พร้อมงาน Phase 2.2: `CASE_NOT_FOUND`, `CASE_PRODUCT_PHOTO_LIMIT`
 *
 * **pure ล้วน** — ห้าม import อะไรที่แตะ Prisma (ฟอร์มฝั่ง client เรียกตัว assert ชุดเดียวกัน)
 */

export const CASE_ERROR_CODES = [
  'CASE_NOT_FOUND',
  'CASE_REF_DUPLICATE',
  'CASE_DOCUMENT_INCOMPLETE',
  'CASE_PRODUCT_PHOTO_LIMIT',
  'CASE_INVALID_NATIONAL_ID',
  'CASE_INVALID_PHONE_FORMAT',
  'CASE_LOCKED_AFTER_APPROVAL',
  'SUSPENDED_COMPANY_NEW_CASE',
  'COMPANY_NOT_FOUND',
] as const

export type CaseErrorCode = (typeof CASE_ERROR_CODES)[number]

/** 404 = ไม่พบเป้าหมาย (ไม่ leak ว่ามี record นี้ในองค์กร/บริษัทอื่นไหม) · 400 = ผิดกติกาข้อมูล */
const HTTP_STATUS: Record<CaseErrorCode, number> = {
  CASE_NOT_FOUND: 404,
  CASE_REF_DUPLICATE: 400,
  CASE_DOCUMENT_INCOMPLETE: 400,
  CASE_PRODUCT_PHOTO_LIMIT: 400,
  CASE_INVALID_NATIONAL_ID: 400,
  CASE_INVALID_PHONE_FORMAT: 400,
  CASE_LOCKED_AFTER_APPROVAL: 400,
  SUSPENDED_COMPANY_NEW_CASE: 400,
  COMPANY_NOT_FOUND: 404,
}

const MESSAGES: Record<CaseErrorCode, ErrorMessage> = {
  CASE_NOT_FOUND: {
    title: 'ไม่พบเคส',
    message: 'ไม่พบเคสที่ระบุ หรือเคสนี้ถูกลบไปแล้ว',
  },
  CASE_REF_DUPLICATE: {
    title: 'เลขที่สัญญาซ้ำ',
    message: 'บริษัทไฟแนนซ์นี้มีเคสที่ใช้เลขที่สัญญานี้อยู่แล้ว — เปิดเคสเดิมเพื่อตรวจสอบ (`38` §11)',
  },
  CASE_DOCUMENT_INCOMPLETE: {
    title: 'เอกสารแนบยังไม่ครบ',
    message: 'ต้องมีสัญญา, บัตรประชาชน/passport และรูปสินค้าอย่างน้อย 1 รูป ก่อนส่งให้พิจารณา (`38` §6.3)',
  },
  CASE_PRODUCT_PHOTO_LIMIT: {
    title: 'รูปสินค้าเกินจำนวนที่รับได้',
    message: 'อัปโหลดรูปสินค้าได้สูงสุด 8 รูปต่อเคส (`38` §6.3.1)',
  },
  CASE_INVALID_NATIONAL_ID: {
    title: 'เลขบัตรประชาชนไม่ถูกต้อง',
    message: 'เลขบัตรประชาชนต้องเป็นตัวเลข 13 หลักพอดี (`38` §6.1.1)',
  },
  CASE_INVALID_PHONE_FORMAT: {
    title: 'รูปแบบเบอร์โทรไม่ถูกต้อง',
    message: 'เบอร์มือถือต้องเป็นตัวเลข 10 หลัก · เบอร์ที่ทำงานต้องเป็นตัวเลข 9-10 หลัก (`38` §12)',
  },
  CASE_LOCKED_AFTER_APPROVAL: {
    title: 'แก้ไขเคสนี้ไม่ได้แล้ว',
    message: 'แก้ไขได้เฉพาะเคสสถานะ ร่าง / รอพิจารณา / รอข้อมูลเพิ่ม เท่านั้น (`38` §8)',
  },
  SUSPENDED_COMPANY_NEW_CASE: {
    title: 'บริษัทไฟแนนซ์ถูกระงับ',
    message: 'บริษัทไฟแนนซ์นี้ถูกระงับการใช้งาน — รับเคสใหม่ไม่ได้ (`10` §7)',
  },
  COMPANY_NOT_FOUND: {
    title: 'ไม่พบบริษัทไฟแนนซ์',
    message: 'ไม่พบบริษัทไฟแนนซ์ที่ระบุ หรือถูกลบไปแล้ว',
  },
}

export function caseErrorStatus(code: CaseErrorCode): number {
  return HTTP_STATUS[code]
}

export function caseErrorMessage(code: CaseErrorCode): ErrorMessage {
  return MESSAGES[code]
}

export class CaseError extends ModuleError<CaseErrorCode> {
  constructor(code: CaseErrorCode, options?: { detail?: string; context?: Record<string, unknown> }) {
    super(code, MESSAGES[code], HTTP_STATUS[code], options)
    this.name = 'CaseError'
  }
}
