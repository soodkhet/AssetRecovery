import { ModuleError, type ErrorMessage } from '@/lib/api/errors'

/**
 * Error code หมวดรับเคส (ไฟล์ 38 §12) — SSOT อยู่ที่ `docs/38-case-submission.md` §12
 * (+ `24` §6.1 สำหรับ code กลางที่โมดูลอื่นใช้ร่วม เช่น `SUSPENDED_COMPANY_NEW_CASE`)
 *
 * ⚠️ Rule 04: ห้ามตั้ง code ใหม่ที่นี่โดยไม่เพิ่มลง `38` §12 + `lib/api/error-catalog.ts` ในคอมมิตเดียวกัน
 * code ที่เติมเข้า `38` §12 พร้อมงาน Phase 2.2: `CASE_NOT_FOUND`, `CASE_PRODUCT_PHOTO_LIMIT`
 * code ที่เติมเข้า `38` §12 พร้อมงาน Phase 2.3: `CASE_INVALID_STATUS_TRANSITION`, `CASE_STATUS_REASON_REQUIRED`
 * code ที่เติมเข้า `38` §12 ตามมติ PO 04/10/2569 (เอกสารชุดเดียว): `CASE_DOCUMENT_MODE_CONFLICT`, `CASE_BUNDLE_CONFIRMATION_REQUIRED`
 * code ที่เติมเข้า `38` §12 ตามมติ PO 04/10/2569 (v3.4 ลบเอกสาร): `CASE_DOCUMENT_NOT_FOUND`, `CASE_DOCUMENT_DELETE_NOT_ALLOWED`
 *
 * **pure ล้วน** — ห้าม import อะไรที่แตะ Prisma (ฟอร์มฝั่ง client เรียกตัว assert ชุดเดียวกัน)
 */

export const CASE_ERROR_CODES = [
  'CASE_NOT_FOUND',
  'CASE_REF_DUPLICATE',
  'CASE_DOCUMENT_INCOMPLETE',
  'CASE_PRODUCT_PHOTO_LIMIT',
  'CASE_DOCUMENT_MODE_CONFLICT',
  'CASE_BUNDLE_CONFIRMATION_REQUIRED',
  'CASE_DOCUMENT_NOT_FOUND',
  'CASE_DOCUMENT_DELETE_NOT_ALLOWED',
  'CASE_INVALID_NATIONAL_ID',
  'CASE_INVALID_PHONE_FORMAT',
  'CASE_LOCKED_AFTER_APPROVAL',
  'CASE_INVALID_STATUS_TRANSITION',
  'CASE_STATUS_REASON_REQUIRED',
  'CASE_NO_TEAM_MATCH',
  'CASE_RECYCLE_INVALID_STATUS',
  'CASE_RECYCLE_NOTE_REQUIRED',
  'CASE_RECYCLE_REJECT_REASON_REQUIRED',
  'API_VALIDATION_FAILED',
  'REQUIRED_MISSING',
  'TEMPLATE_NOT_FOUND',
  'TEAM_NOT_FOUND',
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
  CASE_DOCUMENT_MODE_CONFLICT: 400,
  CASE_BUNDLE_CONFIRMATION_REQUIRED: 400,
  CASE_DOCUMENT_NOT_FOUND: 404,
  CASE_DOCUMENT_DELETE_NOT_ALLOWED: 400,
  CASE_INVALID_NATIONAL_ID: 400,
  CASE_INVALID_PHONE_FORMAT: 400,
  CASE_LOCKED_AFTER_APPROVAL: 400,
  CASE_INVALID_STATUS_TRANSITION: 400,
  CASE_STATUS_REASON_REQUIRED: 400,
  CASE_NO_TEAM_MATCH: 400,
  CASE_RECYCLE_INVALID_STATUS: 400,
  CASE_RECYCLE_NOTE_REQUIRED: 400,
  CASE_RECYCLE_REJECT_REASON_REQUIRED: 400,
  API_VALIDATION_FAILED: 400,
  REQUIRED_MISSING: 400,
  TEMPLATE_NOT_FOUND: 404,
  TEAM_NOT_FOUND: 404,
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
    message: 'บริษัทไฟแนนซ์นี้มีเคสที่ใช้เลขที่สัญญานี้อยู่แล้ว — เปิดเคสเดิมเพื่อตรวจสอบ',
  },
  CASE_DOCUMENT_INCOMPLETE: {
    title: 'เอกสารแนบยังไม่ครบ',
    message:
      'ต้องมีสัญญา, บัตรประชาชน/passport และรูปสินค้าอย่างน้อย 1 รูป (หรือติ๊กว่ารูปสินค้ารวมอยู่ในไฟล์สัญญาแล้ว · หรือแนบเอกสารชุดเดียวแบบสแกนรวมเล่ม) ก่อนส่งให้พิจารณา',
  },
  CASE_PRODUCT_PHOTO_LIMIT: {
    title: 'รูปสินค้าเกินจำนวนที่รับได้',
    message: 'อัปโหลดรูปสินค้าได้สูงสุด 8 รูปต่อเคส',
  },
  CASE_DOCUMENT_MODE_CONFLICT: {
    title: 'แนบเอกสารปนสองแบบไม่ได้',
    message:
      'เคสนี้แนบเอกสารอีกแบบไว้แล้ว — เอกสารชุดเดียว (สแกนรวมเล่ม) ใช้ร่วมกับไฟล์สัญญา/บัตรประชาชนแบบแยกประเภทไม่ได้ (ลบไฟล์แบบเดิมออกให้หมดก่อนจึงสลับได้)',
  },
  CASE_BUNDLE_CONFIRMATION_REQUIRED: {
    title: 'ต้องยืนยันเอกสารชุดก่อนรับเคส',
    message: 'เคสนี้ใช้เอกสารชุดเดียว — ตรวจไฟล์แล้วติ๊กยืนยันว่าในชุดมีสัญญาและบัตรประชาชน/Passport ครบ ก่อนรับเคส',
  },
  CASE_DOCUMENT_NOT_FOUND: {
    title: 'ไม่พบเอกสาร',
    message: 'ไม่พบเอกสารที่ระบุในเคสนี้ หรือเอกสารถูกลบไปแล้ว — รีเฟรชหน้าแล้วลองใหม่',
  },
  CASE_DOCUMENT_DELETE_NOT_ALLOWED: {
    title: 'ลบเอกสารไม่ได้แล้ว',
    message: 'ลบเอกสารได้เฉพาะเคสสถานะ ร่าง / ขอข้อมูลเพิ่ม (ก่อนส่งตรวจ) เท่านั้น — เคสที่ส่งตรวจหรืออนุมัติแล้วต้องเก็บเอกสารไว้ตามเดิม',
  },
  CASE_INVALID_NATIONAL_ID: {
    title: 'เลขบัตรประชาชนไม่ถูกต้อง',
    message: 'เลขบัตรประชาชนต้องเป็นตัวเลข 13 หลักพอดี',
  },
  CASE_INVALID_PHONE_FORMAT: {
    title: 'รูปแบบเบอร์โทรไม่ถูกต้อง',
    message: 'เบอร์มือถือต้องเป็นตัวเลข 10 หลัก · เบอร์ที่ทำงานต้องเป็นตัวเลข 9-10 หลัก',
  },
  CASE_LOCKED_AFTER_APPROVAL: {
    title: 'แก้ไขเคสนี้ไม่ได้แล้ว',
    message: 'แก้ไขได้เฉพาะเคสสถานะ ร่าง / รอพิจารณา / รอข้อมูลเพิ่ม เท่านั้น',
  },
  CASE_INVALID_STATUS_TRANSITION: {
    title: 'เปลี่ยนสถานะแบบนี้ไม่ได้',
    message: 'สถานะปัจจุบันของเคสไม่รองรับการกระทำนี้ — ตรวจสอบสถานะล่าสุดแล้วลองใหม่',
  },
  CASE_STATUS_REASON_REQUIRED: {
    title: 'ต้องระบุเหตุผล',
    message: 'การไม่รับเคส ขอข้อมูลเพิ่ม และการเปลี่ยนทีมที่ระบบเสนอ ต้องระบุเหตุผลเสมอ',
  },
  CASE_NO_TEAM_MATCH: {
    title: 'ไม่มีทีมดูแลจังหวัดนี้',
    message: 'จังหวัดของที่อยู่ปัจจุบันไม่ตรงกับทีมใดเลย — เลือกทีมเองพร้อมระบุเหตุผล',
  },
  CASE_RECYCLE_INVALID_STATUS: {
    title: 'รีไซเกิลเคสนี้ไม่ได้',
    message: 'ขอรีไซเกิลได้เฉพาะเคสที่ปิดงานด้วยผลไม่สำเร็จ (`closed_fail`) เท่านั้น',
  },
  CASE_RECYCLE_NOTE_REQUIRED: {
    title: 'ต้องระบุหมายเหตุ',
    message: 'ต้องระบุหมายเหตุอ้างอิงการติดต่อจากไฟแนนซ์ทุกครั้งที่ขอรีไซเกิล',
  },
  CASE_RECYCLE_REJECT_REASON_REQUIRED: {
    title: 'ต้องระบุเหตุผล',
    message: 'การไม่อนุมัติคำขอรีไซเกิลต้องระบุเหตุผลเสมอ',
  },
  API_VALIDATION_FAILED: {
    title: 'ข้อมูลนำเข้าไม่ถูกต้อง',
    message: 'ข้อมูลในแถวนี้ไม่ตรงกับรูปแบบที่ระบบรับ — แก้ไขแล้วนำเข้าใหม่เฉพาะแถวที่ผิด',
  },
  REQUIRED_MISSING: {
    title: 'ข้อมูลยังไม่ครบ',
    message: 'ต้องกรอกข้อมูลที่จำเป็นให้ครบก่อนส่งให้พิจารณา',
  },
  TEMPLATE_NOT_FOUND: {
    title: 'บริษัทไฟแนนซ์ยังไม่ได้ผูกเทมเพลตค่าบริการ',
    message: 'ต้องผูกเทมเพลตค่าบริการกับบริษัทไฟแนนซ์ก่อน จึงจะรับเคสได้',
  },
  TEAM_NOT_FOUND: {
    title: 'ไม่พบทีมที่เลือก',
    message: 'ทีมที่เลือกไม่มีอยู่จริงหรือถูกปิดใช้งานแล้ว',
  },
  SUSPENDED_COMPANY_NEW_CASE: {
    title: 'บริษัทไฟแนนซ์ถูกระงับ',
    message: 'บริษัทไฟแนนซ์นี้ถูกระงับการใช้งาน — รับเคสใหม่ไม่ได้',
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
