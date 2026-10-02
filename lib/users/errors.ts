import { ModuleError, type ErrorMessage } from '@/lib/api/errors'

/**
 * Error code หมวดผู้ใช้งาน (ไฟล์ 08) — SSOT อยู่ที่ `docs/24-finance-validation-rules.md` §6.1
 * ⚠️ ห้ามตั้ง code ใหม่ที่นี่โดยไม่เพิ่มลงไฟล์ 24 ใน commit เดียวกัน (Rule 04)
 *
 * `08` §11 เขียน code ไว้กว้าง (`DUPLICATE_RECORD`/`INVALID_STATUS`) ซึ่งไม่มีใน dictionary กลาง
 * จึงระบุให้ตรงกับสิ่งที่ implementation ใช้จริงเหมือนที่ Phase 1.7/1.8 ทำกับไฟล์ 11/12/09/10
 * ส่วน `USER_HAS_HISTORY` เป็นชื่อที่ `08` §11 ระบุตรงตัวอยู่แล้ว
 */

export const USER_ERROR_CODES = [
  'USER_NOT_FOUND',
  'DUPLICATE_USER_EMAIL',
  'DUPLICATE_USERNAME',
  'DUPLICATE_USER_PHONE',
  'USER_HAS_HISTORY',
  'INVALID_USER_STATUS_TRANSITION',
  'INVALID_USER_SCOPE',
  'ROLE_NOT_FOUND',
  'AUTH_ACCOUNT_SYNC_FAILED',
] as const

export type UserErrorCode = (typeof USER_ERROR_CODES)[number]

/** 400 = ผิดกติกาข้อมูล/สถานะ · 404 = ไม่พบเป้าหมาย (ไม่ leak ว่ามี record นี้ในองค์กรอื่นไหม) */
const HTTP_STATUS: Record<UserErrorCode, number> = {
  USER_NOT_FOUND: 404,
  DUPLICATE_USER_EMAIL: 400,
  DUPLICATE_USERNAME: 400,
  DUPLICATE_USER_PHONE: 400,
  USER_HAS_HISTORY: 400,
  INVALID_USER_STATUS_TRANSITION: 400,
  INVALID_USER_SCOPE: 400,
  ROLE_NOT_FOUND: 404,
  // 502 = ปลายทางภายนอก (Supabase Auth) ไม่ตอบ/ปฏิเสธ ไม่ใช่ข้อมูลของผู้เรียกผิด
  AUTH_ACCOUNT_SYNC_FAILED: 502,
}

const MESSAGES: Record<UserErrorCode, ErrorMessage> = {
  USER_NOT_FOUND: {
    title: 'ไม่พบผู้ใช้งาน',
    message: 'ไม่พบผู้ใช้งานที่ระบุ หรือบัญชีนี้ถูกลบไปแล้ว',
  },
  DUPLICATE_USER_EMAIL: {
    title: 'อีเมลซ้ำ',
    message: 'มีผู้ใช้งานที่ใช้อีเมลนี้อยู่แล้วในองค์กร — อีเมลต้องไม่ซ้ำเพราะใช้เข้าสู่ระบบได้',
  },
  DUPLICATE_USERNAME: {
    title: 'ชื่อผู้ใช้ซ้ำ',
    message: 'มีผู้ใช้งานที่ใช้ชื่อผู้ใช้ (username) นี้อยู่แล้วในองค์กร — กรุณาตั้งชื่ออื่น',
  },
  DUPLICATE_USER_PHONE: {
    title: 'เบอร์โทรซ้ำ',
    message: 'มีผู้ใช้งานที่ใช้เบอร์โทรนี้อยู่แล้วในองค์กร (`08` §10)',
  },
  USER_HAS_HISTORY: {
    title: 'ลบผู้ใช้ที่มีประวัติการทำงานไม่ได้',
    message:
      'บัญชีนี้มีข้อมูลผูกอยู่ในระบบแล้ว (เคส/งานภาคสนาม/รายการเงิน หรือทีมที่ดูแลอยู่) — ใช้ "ระงับการใช้งาน" แทนการลบเสมอ เพื่อให้ประวัติยังอยู่ครบ (`08` §10)',
  },
  INVALID_USER_STATUS_TRANSITION: {
    title: 'เปลี่ยนสถานะไม่ได้',
    message: 'สถานะปลายทางไม่ถูกต้องตาม lifecycle ของผู้ใช้งาน (active ⇄ suspended → deleted — `08` §7.2)',
  },
  INVALID_USER_SCOPE: {
    title: 'ข้อมูลสังกัดไม่ครบ',
    message:
      'ผู้ใช้กลุ่ม Inhouse/Outsource ต้องระบุทีม และผู้ใช้กลุ่มบริษัทไฟแนนซ์ต้องระบุบริษัท — กลุ่มระบบ (System) ไม่ผูกทั้งสองอย่าง (`08` §7.1)',
  },
  ROLE_NOT_FOUND: {
    title: 'ไม่พบบทบาท',
    message: 'ไม่พบบทบาท (role) ที่เลือก หรือบทบาทนั้นถูกลบไปแล้ว',
  },
  AUTH_ACCOUNT_SYNC_FAILED: {
    title: 'บันทึกบัญชีเข้าสู่ระบบไม่สำเร็จ',
    message:
      'ระบบยืนยันตัวตน (Supabase Auth) ปฏิเสธหรือไม่ตอบ — ตรวจรหัสผ่านให้ตรงนโยบายของ Supabase project แล้วลองใหม่',
  },
}

export function userErrorStatus(code: UserErrorCode): number {
  return HTTP_STATUS[code]
}

export function userErrorMessage(code: UserErrorCode): ErrorMessage {
  return MESSAGES[code]
}

export class UserError extends ModuleError<UserErrorCode> {
  constructor(code: UserErrorCode, options?: { detail?: string; context?: Record<string, unknown> }) {
    super(code, MESSAGES[code], HTTP_STATUS[code], options)
    this.name = 'UserError'
  }
}

export function isUserError(error: unknown): error is UserError {
  return error instanceof UserError
}
