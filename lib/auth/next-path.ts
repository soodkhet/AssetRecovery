import { CHANGE_PASSWORD_PATH, LOGIN_PATH } from '@/lib/auth/constants'

/**
 * `?next=` ของหน้า login — หน้าที่ผู้ใช้ตั้งใจเปิดก่อนถูกพาไป login (session หมด/เปิดลิงก์ตรง) · preship R7-006
 * รับเฉพาะ path ภายในเว็บนี้: ขึ้นต้น `/` ตัวเดียว (ไม่ใช่ `//host` หรือ `/\host` ที่ browser ตีเป็นโดเมนอื่น)
 * ไม่มีอักขระควบคุม · ไม่ใช่หน้า login เอง · ยาวไม่เกิน 2,000 ตัว — นอกนั้น `null` (ไปหน้าแรกของ role ตามปกติ)
 */
export function safeNextPath(value: unknown): string | null {
  if (typeof value !== 'string' || value.length === 0 || value.length > 2000) return null
  if (!value.startsWith('/') || value.startsWith('//') || value.startsWith('/\\')) return null
  // อักขระควบคุม (แท็บ/ขึ้นบรรทัด) browser ตัดทิ้งแล้วอาจกลายเป็น //host
  if (/[\u0000-\u001f\u007f\\]/.test(value)) return null
  const pathname = value.split(/[?#]/, 1)[0] ?? ''
  if (pathname === LOGIN_PATH || pathname.startsWith(`${LOGIN_PATH}/`)) return null
  return value
}

/**
 * ปลายทางหลัง login สำเร็จ — หน้าเดิมที่ตั้งใจเปิด (`next`) ชนะหน้าแรกของ role · ยกเว้นต้องเปลี่ยนรหัสก่อน
 * (server ส่ง `CHANGE_PASSWORD_PATH`) · สิทธิ์ของหน้าปลายทางตรวจซ้ำที่ route guard/API เสมอ
 */
export function postLoginPath(serverRedirect: string | null, nextPath: string | null): string {
  if (serverRedirect === CHANGE_PASSWORD_PATH) return serverRedirect
  return safeNextPath(nextPath) ?? serverRedirect ?? '/'
}
