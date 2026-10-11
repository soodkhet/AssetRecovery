import { unexpectedErrorResponse } from '@/lib/api/unexpected-error'

/**
 * Error code หมวด Auth & Access Control — SSOT อยู่ที่ `docs/24-finance-validation-rules.md` §6.9
 * ⚠️ ห้ามตั้ง code ใหม่ที่นี่โดยไม่เพิ่มลงไฟล์ 24 ใน commit เดียวกัน (Rule 04)
 */

export const AUTH_ERROR_CODES = [
  'UNAUTHENTICATED',
  'SESSION_EXPIRED',
  'INVALID_CREDENTIALS',
  'ACCOUNT_INACTIVE',
  'COMPANY_SUSPENDED',
  'USER_NOT_PROVISIONED',
  'PERMISSION_DENIED',
  'LAST_SUPERADMIN_REMOVAL',
  'REQUIRED_MISSING',
  'PASSWORD_CHANGE_REQUIRED',
  // preship PS-009 — login ผิดซ้ำเกินเพดาน (`lib/auth/login-throttle.ts`)
  'LOGIN_RATE_LIMITED',
] as const

export type AuthErrorCode = (typeof AUTH_ERROR_CODES)[number]

/** HTTP status ต่อ code — 401 = ยังไม่ระบุตัวตน/หมดอายุ · 403 = ระบุตัวตนได้แต่ไม่มีสิทธิ์ · 400 = validation */
const HTTP_STATUS: Record<AuthErrorCode, number> = {
  UNAUTHENTICATED: 401,
  SESSION_EXPIRED: 401,
  INVALID_CREDENTIALS: 401,
  ACCOUNT_INACTIVE: 403,
  COMPANY_SUSPENDED: 403,
  USER_NOT_PROVISIONED: 403,
  PERMISSION_DENIED: 403,
  LAST_SUPERADMIN_REMOVAL: 400,
  REQUIRED_MISSING: 400,
  PASSWORD_CHANGE_REQUIRED: 403,
  LOGIN_RATE_LIMITED: 429,
}

/**
 * ข้อความแสดงผู้ใช้ (ไทย) — ตาม mockup `login.html`
 * ⚠️ ห้ามใส่รายละเอียดที่ leak ข้อมูลระบบ (มี user คนนี้จริงไหม / ข้อมูลของบริษัทไหน) — `25` scope ย่อย
 */
const MESSAGES: Record<AuthErrorCode, { title: string; message: string }> = {
  UNAUTHENTICATED: { title: 'ยังไม่ได้เข้าสู่ระบบ', message: 'กรุณาเข้าสู่ระบบก่อนใช้งาน' },
  SESSION_EXPIRED: { title: 'เซสชันหมดอายุ', message: 'เซสชันมีอายุ 24 ชั่วโมง กรุณาเข้าสู่ระบบใหม่' },
  INVALID_CREDENTIALS: { title: 'เข้าสู่ระบบไม่สำเร็จ', message: 'อีเมล/ชื่อผู้ใช้ หรือรหัสผ่านไม่ถูกต้อง' },
  ACCOUNT_INACTIVE: {
    title: 'บัญชีถูกระงับการใช้งาน',
    message: 'กรุณาติดต่อผู้ดูแลระบบ (Superadmin) เพื่อปลดล็อกบัญชี',
  },
  // มติ PO 05/10/2569 (O43 D5) — ไม่บอกเหตุผลการระงับของบริษัท
  COMPANY_SUSPENDED: {
    title: 'บริษัทถูกระงับการใช้งาน',
    message: 'บัญชีบริษัทของคุณถูกระงับการใช้งานชั่วคราว กรุณาติดต่อผู้ให้บริการ',
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
  // ใช้กับ validation ทุกชนิด (ขาด/ยาวเกิน/รูปแบบผิด) ไม่ใช่แค่ช่องว่าง — ข้อความต้องไม่ทำให้เข้าใจว่า "ยังกรอกไม่ครบ" (preship R2-025)
  REQUIRED_MISSING: { title: 'ข้อมูลไม่ครบหรือไม่ถูกต้อง', message: 'กรุณาแก้ไขข้อมูลที่กรอกแล้วลองใหม่' },
  PASSWORD_CHANGE_REQUIRED: {
    title: 'ต้องเปลี่ยนรหัสผ่านก่อนใช้งาน',
    message: 'ผู้ดูแลระบบตั้งรหัสผ่านให้บัญชีนี้ — กรุณาตั้งรหัสผ่านใหม่ของคุณเองก่อนใช้งานต่อ',
  },
  // ไม่บอกว่าบัญชีมีจริงหรือไม่ — ข้อความเดียวกันทั้งพักรายบัญชีและราย IP
  LOGIN_RATE_LIMITED: {
    title: 'ลองเข้าสู่ระบบหลายครั้งเกินไป',
    message: 'เข้าสู่ระบบไม่สำเร็จหลายครั้งติดกัน กรุณารอ 15 นาทีแล้วลองใหม่ หรือติดต่อผู้ดูแลระบบให้ตั้งรหัสผ่านใหม่',
  },
}

export function authErrorStatus(code: AuthErrorCode): number {
  return HTTP_STATUS[code]
}

export function authErrorMessage(code: AuthErrorCode): { title: string; message: string } {
  return MESSAGES[code]
}

/**
 * mytester A-07 — ผู้ใช้กลุ่มบริษัทไฟแนนซ์ที่ยังไม่ได้ผูกบริษัท (`users.company_id` ว่าง) ใช้ code เดิม
 * `USER_NOT_PROVISIONED` (บัญชียังตั้งค่าไม่ครบ) แต่ข้อความบอกตรงเหตุ — เดิมขึ้น "บริษัทถูกระงับ" ชวนเข้าใจผิด
 */
export const COMPANY_NOT_LINKED_MESSAGE: { title: string; message: string } = {
  title: 'บัญชียังไม่ได้ผูกบริษัท',
  message: 'บัญชีนี้ยังไม่ได้ผูกกับบริษัทไฟแนนซ์ กรุณาติดต่อผู้ดูแลระบบให้ผูกบริษัทก่อนเข้าใช้งาน',
}

/** ค่า `?reason=` ของหน้า login เมื่อหน้าพอร์ทัลพบว่าบัญชียังไม่ผูกบริษัท (ไม่ใช่ error code ของ API) */
export const LOGIN_REASON_COMPANY_NOT_LINKED = 'COMPANY_NOT_LINKED'

/** `?reason=` ของหน้า login → ข้อความ · ค่าที่ไม่รู้จัก = `null` (ไม่แสดงอะไร) */
export function loginReasonMessage(reason: string | undefined): { title: string; message: string } | null {
  if (reason === undefined) return null
  if (reason === LOGIN_REASON_COMPANY_NOT_LINKED) return COMPANY_NOT_LINKED_MESSAGE
  return (AUTH_ERROR_CODES as readonly string[]).includes(reason) ? MESSAGES[reason as AuthErrorCode] : null
}

/**
 * code ที่ผู้ใช้บริษัทไฟแนนซ์ถูกปฏิเสธตามสถานะบริษัท — ไม่ได้ผูกบริษัท = `USER_NOT_PROVISIONED`
 * (+ `COMPANY_NOT_LINKED_MESSAGE`) · บริษัทไม่ active/ถูกลบ = `COMPANY_SUSPENDED` · ผ่าน = `null`
 */
export function portalCompanyDenyCode(
  companyId: string | null,
  companyStatus: string | null,
): 'USER_NOT_PROVISIONED' | 'COMPANY_SUSPENDED' | null {
  if (companyId === null) return 'USER_NOT_PROVISIONED'
  return companyStatus === 'active' ? null : 'COMPANY_SUSPENDED'
}

/** error กลางของชั้น auth/permission — route handler จับแล้วแปลงเป็น response ด้วย `toAuthErrorResponse()` */
export class AuthError extends Error {
  readonly code: AuthErrorCode
  readonly status: number
  /** รายละเอียดสำหรับ log ฝั่ง server เท่านั้น — ห้ามส่งออก response */
  readonly detail?: string
  /** ข้อความแทนค่ากลางของ code (เช่น `COMPANY_NOT_LINKED_MESSAGE`) — ไม่ระบุ = ข้อความกลาง */
  readonly userMessage?: { title: string; message: string }

  constructor(code: AuthErrorCode, detail?: string, userMessage?: { title: string; message: string }) {
    super(`${code}: ${(userMessage ?? MESSAGES[code]).message}`)
    this.name = 'AuthError'
    this.code = code
    this.status = HTTP_STATUS[code]
    this.detail = detail
    this.userMessage = userMessage
  }
}

export function isAuthError(error: unknown): error is AuthError {
  return error instanceof AuthError
}

/** envelope กลาง `{ success, data, error }` เหมือน route อื่น (R2-015 — เดิมมีแค่ `{ error }`) */
export interface AuthErrorBody {
  success: false
  data: null
  error: {
    code: AuthErrorCode
    title: string
    message: string
  }
}

export function toAuthErrorBody(code: AuthErrorCode, userMessage?: { title: string; message: string }): AuthErrorBody {
  return { success: false, data: null, error: { code, ...(userMessage ?? MESSAGES[code]) } }
}

/**
 * แปลง `AuthError` → Response มาตรฐาน — error ชนิดอื่นไม่ถูกกลืนเป็น 401/403 ปลอม แต่ได้ 500 `INTERNAL_ERROR`
 * (หรือ 400 `INVALID_ID_FORMAT` เมื่อ id ใน path ไม่ใช่ UUID) ผ่าน `unexpectedErrorResponse()`
 */
export function toAuthErrorResponse(error: unknown): Response {
  // error ที่ไม่ใช่ของ auth ⇒ envelope 500/400 กลาง (เดิมโยนต่อเป็น 500 ไม่มี body — preship PS-006)
  if (!isAuthError(error)) return unexpectedErrorResponse(error)
  return Response.json(toAuthErrorBody(error.code, error.userMessage), { status: error.status })
}
