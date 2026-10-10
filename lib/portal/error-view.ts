/**
 * staging E-071 — error state ของพอร์ทัล: ปุ่ม "ลองใหม่" แสดงเฉพาะความผิดพลาดที่ลองใหม่แล้วมีโอกาสสำเร็จ
 * (เครือข่าย/หมดเวลา/ระบบขัดข้อง) · ไม่พบรายการหรือไม่มีสิทธิ์ ⇒ ข้อความกลางเดียวกัน ไม่บอกว่าเป็นกรณีไหน
 * (ไม่ให้รู้ว่ารายการของบริษัทอื่นมีอยู่จริง — `97` §12)
 */
export interface PortalErrorInput {
  title: string
  message: string
  code?: string
}

export interface PortalErrorView {
  title: string
  message: string
  retryable: boolean
}

export const PORTAL_NOT_AVAILABLE_TITLE = 'ไม่พบรายการ หรือไม่มีสิทธิ์ดู'
export const PORTAL_NOT_AVAILABLE_MESSAGE =
  'รายการนี้อาจถูกลบ ไม่ได้เป็นของบริษัทคุณ หรือบัญชีของคุณไม่มีสิทธิ์ดูหมวดนี้ — หากคิดว่าไม่ถูกต้อง กรุณาติดต่อเจ้าหน้าที่'

/** รหัสที่ลองใหม่แล้วอาจสำเร็จ — ไม่มีรหัส (เครือข่าย/หมดเวลา/502) ก็ถือว่าลองใหม่ได้ */
const RETRYABLE_CODES: ReadonlySet<string> = new Set(['INTERNAL_ERROR', 'LOGIN_RATE_LIMITED'])

function isHiddenResource(code: string): boolean {
  return code.endsWith('_NOT_FOUND') || code === 'PERMISSION_DENIED'
}

export function portalErrorView(error: PortalErrorInput): PortalErrorView {
  const code = error.code
  if (code === undefined || RETRYABLE_CODES.has(code)) {
    return { title: error.title, message: error.message, retryable: true }
  }
  if (isHiddenResource(code)) {
    return { title: PORTAL_NOT_AVAILABLE_TITLE, message: PORTAL_NOT_AVAILABLE_MESSAGE, retryable: false }
  }
  return { title: error.title, message: error.message, retryable: false }
}
