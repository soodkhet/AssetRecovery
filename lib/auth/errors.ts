/**
 * Error code หมวด Auth & Access Control — SSOT อยู่ที่ `docs/24-finance-validation-rules.md` §6.9
 * ⚠️ ห้ามตั้ง code ใหม่ที่นี่โดยไม่เพิ่มลงไฟล์ 24 ใน commit เดียวกัน (Rule 04)
 */

export const AUTH_ERROR_CODES = [
  'UNAUTHENTICATED',
  'SESSION_EXPIRED',
  'INVALID_CREDENTIALS',
  'ACCOUNT_INACTIVE',
  'USER_NOT_PROVISIONED',
  'PERMISSION_DENIED',
  'LAST_SUPERADMIN_REMOVAL',
  'REQUIRED_MISSING',
] as const

export type AuthErrorCode = (typeof AUTH_ERROR_CODES)[number]

/** HTTP status ต่อ code — 401 = ยังไม่ระบุตัวตน/หมดอายุ · 403 = ระบุตัวตนได้แต่ไม่มีสิทธิ์ · 400 = validation */
const HTTP_STATUS: Record<AuthErrorCode, number> = {
  UNAUTHENTICATED: 401,
  SESSION_EXPIRED: 401,
  INVALID_CREDENTIALS: 401,
  ACCOUNT_INACTIVE: 403,
  USER_NOT_PROVISIONED: 403,
  PERMISSION_DENIED: 403,
  LAST_SUPERADMIN_REMOVAL: 400,
  REQUIRED_MISSING: 400,
}

/**
 * ข้อความแสดงผู้ใช้ (ไทย) — ตาม mockup `login.html`
 * ⚠️ ห้ามใส่รายละเอียดที่ leak ข้อมูลระบบ (มี user คนนี้จริงไหม / ข้อมูลของบริษัทไหน) — `25` scope ย่อย
 */
const MESSAGES: Record<AuthErrorCode, { title: string; message: string }> = {
  UNAUTHENTICATED: { title: 'ยังไม่ได้เข้าสู่ระบบ', message: 'กรุณาเข้าสู่ระบบก่อนใช้งาน' },
  SESSION_EXPIRED: { title: 'เซสชันหมดอายุ', message: 'เซสชันมีอายุ 24 ชั่วโมง กรุณาเข้าสู่ระบบใหม่' },
  INVALID_CREDENTIALS: { title: 'เข้าสู่ระบบไม่สำเร็จ', message: 'อีเมลหรือรหัสผ่านไม่ถูกต้อง' },
  ACCOUNT_INACTIVE: {
    title: 'บัญชีถูกระงับการใช้งาน',
    message: 'กรุณาติดต่อผู้ดูแลระบบ (Superadmin) เพื่อปลดล็อกบัญชี',
  },
  USER_NOT_PROVISIONED: {
    title: 'บัญชียังไม่ถูกผูกกับระบบ',
    message: 'กรุณาติดต่อผู้ดูแลระบบ (Superadmin) เพื่อเปิดสิทธิ์ใช้งาน',
  },
  PERMISSION_DENIED: { title: 'ไม่มีสิทธิ์ใช้งาน', message: 'บัญชีนี้ไม่มีสิทธิ์ทำรายการที่ร้องขอ' },
  LAST_SUPERADMIN_REMOVAL: {
    title: 'ถอด Superadmin คนสุดท้ายไม่ได้',
    message: 'ระบบต้องมี Superadmin ที่ใช้งานได้อย่างน้อย 1 คนเสมอ',
  },
  REQUIRED_MISSING: { title: 'ข้อมูลไม่ครบ', message: 'กรุณากรอกข้อมูลที่จำเป็นให้ครบถ้วน' },
}

export function authErrorStatus(code: AuthErrorCode): number {
  return HTTP_STATUS[code]
}

export function authErrorMessage(code: AuthErrorCode): { title: string; message: string } {
  return MESSAGES[code]
}

/** error กลางของชั้น auth/permission — route handler จับแล้วแปลงเป็น response ด้วย `toAuthErrorResponse()` */
export class AuthError extends Error {
  readonly code: AuthErrorCode
  readonly status: number
  /** รายละเอียดสำหรับ log ฝั่ง server เท่านั้น — ห้ามส่งออก response */
  readonly detail?: string

  constructor(code: AuthErrorCode, detail?: string) {
    super(`${code}: ${MESSAGES[code].message}`)
    this.name = 'AuthError'
    this.code = code
    this.status = HTTP_STATUS[code]
    this.detail = detail
  }
}

export function isAuthError(error: unknown): error is AuthError {
  return error instanceof AuthError
}

export interface AuthErrorBody {
  error: {
    code: AuthErrorCode
    title: string
    message: string
  }
}

export function toAuthErrorBody(code: AuthErrorCode): AuthErrorBody {
  return { error: { code, ...MESSAGES[code] } }
}

/**
 * แปลง `AuthError` → Response มาตรฐาน — error ชนิดอื่น throw ต่อ (ต้องกลายเป็น 500 ไม่ใช่ 401/403 ปลอม)
 * TODO(Phase 2.1): ย้ายไปใช้ response envelope กลางของไฟล์ `45` เมื่อ API Contract Infra พร้อม
 */
export function toAuthErrorResponse(error: unknown): Response {
  if (!isAuthError(error)) throw error
  return Response.json(toAuthErrorBody(error.code), { status: error.status })
}
