import { toAuthErrorResponse } from '@/lib/auth/errors'

/**
 * Error code หมวด Roles & Permissions — SSOT อยู่ที่ `docs/24-finance-validation-rules.md` §6.9
 * (`SEED_ROLE_DELETE` / `SEED_ROLE_RENAME` มีต้นทางที่ `07` §11 · ที่เหลือเพิ่มลง `24` ใน commit เดียวกัน)
 * ⚠️ ห้ามตั้ง code ใหม่ที่นี่โดยไม่เพิ่มลงไฟล์ 24 (Rule 04)
 */

export const ROLE_ERROR_CODES = [
  'SEED_ROLE_DELETE',
  'SEED_ROLE_RENAME',
  'ROLE_NOT_EDITABLE',
  'CAPABILITY_LOCKED',
  'CAPABILITY_NOT_FOUND',
  'ROLE_IN_USE',
  'DUPLICATE_ROLE_NAME',
  'ROLE_NOT_FOUND',
] as const

export type RoleErrorCode = (typeof ROLE_ERROR_CODES)[number]

/** 400 = ผิดกติกาข้อมูล/สถานะ · 404 = ไม่พบเป้าหมาย (ไม่ leak ว่ามี record นี้ในองค์กรอื่นไหม) */
const HTTP_STATUS: Record<RoleErrorCode, number> = {
  SEED_ROLE_DELETE: 400,
  SEED_ROLE_RENAME: 400,
  ROLE_NOT_EDITABLE: 400,
  CAPABILITY_LOCKED: 400,
  CAPABILITY_NOT_FOUND: 400,
  ROLE_IN_USE: 400,
  DUPLICATE_ROLE_NAME: 400,
  ROLE_NOT_FOUND: 404,
}

const MESSAGES: Record<RoleErrorCode, { title: string; message: string }> = {
  SEED_ROLE_DELETE: {
    title: 'ลบ Seed Role ไม่ได้',
    message: 'บทบาทพื้นฐานของระบบ 15 ตัวลบไม่ได้ทุกกรณี (ไฟล์ 07 §10)',
  },
  SEED_ROLE_RENAME: {
    title: 'เปลี่ยนชื่อ Seed Role ไม่ได้',
    message: 'ชื่อบทบาทพื้นฐานถูกอ้างอิงทั้งระบบ จึงเปลี่ยนไม่ได้ (ไฟล์ 07 §10)',
  },
  ROLE_NOT_EDITABLE: {
    title: 'บทบาทนี้แก้สิทธิ์ไม่ได้',
    message: 'สิทธิ์ของบทบาทนี้ถูกกำหนดตายตามสเปค — แก้ได้เฉพาะบทบาทที่เปิดให้ปรับสิทธิ์',
  },
  CAPABILITY_LOCKED: {
    title: 'สิทธิ์นี้ถูกล็อกไว้',
    message: 'ความสามารถนี้เป็นของบทบาทเดียวตามไฟล์ 25 ("✅ only") มอบให้บทบาทอื่นไม่ได้',
  },
  CAPABILITY_NOT_FOUND: {
    title: 'ไม่พบความสามารถที่ระบุ',
    message: 'รหัสความสามารถ (capability) ไม่มีอยู่ในระบบ',
  },
  ROLE_IN_USE: {
    title: 'ลบบทบาทที่มีผู้ใช้อยู่ไม่ได้',
    message: 'ย้ายผู้ใช้ทั้งหมดออกจากบทบาทนี้ก่อนจึงจะลบได้',
  },
  DUPLICATE_ROLE_NAME: {
    title: 'ชื่อบทบาทซ้ำ',
    message: 'มีบทบาทชื่อนี้ในกลุ่มเดียวกันอยู่แล้ว (ชื่อซ้ำข้ามกลุ่มได้ — ไฟล์ 07 §6)',
  },
  ROLE_NOT_FOUND: {
    title: 'ไม่พบบทบาท',
    message: 'ไม่พบบทบาทที่ระบุ หรือถูกลบไปแล้ว',
  },
}

export function roleErrorStatus(code: RoleErrorCode): number {
  return HTTP_STATUS[code]
}

export function roleErrorMessage(code: RoleErrorCode): { title: string; message: string } {
  return MESSAGES[code]
}

/** error ของโมดูล Roles & Permissions — route handler แปลงเป็น response ด้วย `toRoleErrorResponse()` */
export class RoleError extends Error {
  readonly code: RoleErrorCode
  readonly status: number
  /** รายละเอียดสำหรับ log ฝั่ง server เท่านั้น — ห้ามส่งออก response */
  readonly detail?: string

  constructor(code: RoleErrorCode, detail?: string) {
    super(`${code}: ${MESSAGES[code].message}`)
    this.name = 'RoleError'
    this.code = code
    this.status = HTTP_STATUS[code]
    this.detail = detail
  }
}

export function isRoleError(error: unknown): error is RoleError {
  return error instanceof RoleError
}

/**
 * แปลง `RoleError` → Response — ถ้าไม่ใช่ ส่งต่อให้ `toAuthErrorResponse()` (ซึ่งจะ throw ต่อ
 * ถ้าไม่ใช่ `AuthError` ด้วย เพื่อไม่ให้ error จริงกลายเป็น 400/403 ปลอม)
 */
export function toRoleErrorResponse(error: unknown): Response {
  if (!isRoleError(error)) return toAuthErrorResponse(error)
  return Response.json({ error: { code: error.code, ...MESSAGES[error.code] } }, { status: error.status })
}
