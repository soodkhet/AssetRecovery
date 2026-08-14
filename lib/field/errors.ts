import { ModuleError, type ErrorMessage } from '@/lib/api/errors'

/**
 * Error code หมวดภาคสนาม (ไฟล์ 41 §12) — SSOT อยู่ที่ `docs/41-field-tracker-mobile.md` §12
 *
 * ⚠️ Rule 04: ห้ามตั้ง code ใหม่ที่นี่โดยไม่เพิ่มลง `41` §12 + `lib/api/error-catalog.ts` ในคอมมิตเดียวกัน
 *
 * code ที่ **ไม่** ประกาศซ้ำที่นี่ (ใช้ของโมดูลเดิม):
 * - `ASSIGNMENT_NOT_FOUND` / `ASSIGNMENT_INVALID_STATUS` / `CASE_NOT_FOUND` → `AssignmentError` (`40` §12)
 * - `REASSIGNMENT_ALREADY_TIMED_OUT` / `DECLINE_REASON_REQUIRED` → `AssignmentError` (flow เดียวกับไฟล์ 40)
 * - `PERMISSION_DENIED` → `AuthError`
 *
 * **pure ล้วน** — ห้าม import อะไรที่แตะ Prisma (ฟอร์มฝั่ง client เรียกตัว assert ชุดเดียวกับ API)
 */

export const FIELD_ERROR_CODES = [
  'CLOSE_OUTCOME_REQUIRED',
  'CLOSE_CHECKIN_REQUIRED',
  'CLOSE_TRAVEL_ORIGIN_REQUIRED',
  'CLOSE_PHOTO_REQUIRED',
  'CLOSE_VIDEO_REQUIRED',
  'CLOSE_PRODUCT_PHOTO_REQUIRED',
  'CHECKIN_GPS_PERMISSION_DENIED',
  'CLOSE_NO_EVIDENCE_REVISION',
  'HOTEL_CLAIM_FIELD_REQUIRED',
  'HOTEL_CLAIM_INVALID_SHARED_AGENT',
  'REQUIRED_MISSING',
] as const

export type FieldErrorCode = (typeof FIELD_ERROR_CODES)[number]

const HTTP_STATUS: Record<FieldErrorCode, number> = {
  CLOSE_OUTCOME_REQUIRED: 400,
  CLOSE_CHECKIN_REQUIRED: 400,
  CLOSE_TRAVEL_ORIGIN_REQUIRED: 400,
  CLOSE_PHOTO_REQUIRED: 400,
  CLOSE_VIDEO_REQUIRED: 400,
  CLOSE_PRODUCT_PHOTO_REQUIRED: 400,
  CHECKIN_GPS_PERMISSION_DENIED: 400,
  CLOSE_NO_EVIDENCE_REVISION: 400,
  HOTEL_CLAIM_FIELD_REQUIRED: 400,
  HOTEL_CLAIM_INVALID_SHARED_AGENT: 400,
  REQUIRED_MISSING: 400,
}

const MESSAGES: Record<FieldErrorCode, ErrorMessage> = {
  CLOSE_OUTCOME_REQUIRED: {
    title: 'ยังไม่ได้เลือกผลการติดตาม',
    message: 'ต้องเลือก "สำเร็จ" หรือ "ไม่สำเร็จ" ก่อนยืนยันปิดงาน (`41` §12)',
  },
  CLOSE_CHECKIN_REQUIRED: {
    title: 'ยังไม่มีจุดเช็คอิน',
    message: 'ต้องเช็คอินอย่างน้อย 1 จุดก่อนปิดงาน — พิกัดต้องมาจาก GPS ของอุปกรณ์จริง (`41` §12)',
  },
  CLOSE_TRAVEL_ORIGIN_REQUIRED: {
    title: 'ยังไม่มีจุดเริ่มเดินทาง',
    message: 'ทีมที่คิดค่าน้ำมันแบบ PER_KM ต้องมีจุดเริ่มเดินทาง — เปิดสิทธิ์ตำแหน่งแล้วกด "เริ่มงาน" ใหม่ (`41` §12)',
  },
  CLOSE_PHOTO_REQUIRED: {
    title: 'ยังไม่มีรูปถ่าย',
    message: 'ต้องแนบรูปถ่ายอย่างน้อย 1 รูปก่อนปิดงาน (`41` §12)',
  },
  CLOSE_VIDEO_REQUIRED: {
    title: 'ยังไม่มีวิดีโอ',
    message: 'ต้องแนบวิดีโออย่างน้อย 1 คลิปก่อนปิดงาน (`41` §12)',
  },
  CLOSE_PRODUCT_PHOTO_REQUIRED: {
    title: 'ยังไม่มีรูปสินค้ายืนยัน',
    message: 'เคสที่ปิดแบบสำเร็จต้องมีรูปสินค้ายืนยันอย่างน้อย 1 รูป (`41` §12)',
  },
  CHECKIN_GPS_PERMISSION_DENIED: {
    title: 'ไม่ได้รับพิกัดจากอุปกรณ์',
    message: 'เช็คอินต้องใช้พิกัด GPS จริงของอุปกรณ์ — เปิดสิทธิ์ตำแหน่งแล้วลองใหม่ (`41` §11/§12)',
  },
  CLOSE_NO_EVIDENCE_REVISION: {
    title: 'ยังไม่ได้แก้ไขหลักฐาน',
    message: 'ต้องแก้ไขรูป/วิดีโอ/เสียง/รูปสินค้าอย่างน้อย 1 รายการก่อนส่งกลับให้ตรวจอีกครั้ง (`41` §8)',
  },
  HOTEL_CLAIM_FIELD_REQUIRED: {
    title: 'ข้อมูลเบิกที่พักไม่ครบ',
    message: 'ต้องกรอกวันที่เข้าพัก จำนวนเงิน และแนบใบเสร็จให้ครบทั้ง 3 อย่าง (`41` §12)',
  },
  HOTEL_CLAIM_INVALID_SHARED_AGENT: {
    title: 'ผู้พักร่วมไม่ถูกต้อง',
    message: 'เลือกผู้พักร่วมได้เฉพาะพนักงานในทีมเดียวกันเท่านั้น (`41` §11/§12)',
  },
  REQUIRED_MISSING: {
    title: 'ข้อมูลไม่ครบ',
    message: 'ข้อมูลที่ส่งมาไม่ครบตามที่ระบบต้องการ',
  },
}

export function fieldErrorStatus(code: FieldErrorCode): number {
  return HTTP_STATUS[code]
}

export function fieldErrorMessage(code: FieldErrorCode): ErrorMessage {
  return MESSAGES[code]
}

export class FieldError extends ModuleError<FieldErrorCode> {
  constructor(code: FieldErrorCode, options?: { detail?: string; context?: Record<string, unknown> }) {
    super(code, MESSAGES[code], HTTP_STATUS[code], options)
    this.name = 'FieldError'
  }
}
