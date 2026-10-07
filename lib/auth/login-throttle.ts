/**
 * จำกัดการเดารหัสผ่าน — preship audit PS-009
 *
 * sign in ของ Supabase ถูกเรียกจาก server ⇒ rate limit ฝั่ง Supabase เห็นแค่ IP ของ server (กันรายคนไม่ได้
 * และถ้าโดนก็ล็อกทุกคนพร้อมกัน) จึงนับเองจาก audit `login` ที่ล้มเหลวด้วย `INVALID_CREDENTIALS`
 * (ลงทุกครั้งอยู่แล้วตาม `05` §13 — ไม่ต้องมีตารางใหม่) ย้อนหลัง {@link LOGIN_THROTTLE_WINDOW_MS}
 * - ต่อบัญชี (identifier ที่ลง audit): ผิดครบ {@link LOGIN_MAX_FAILURES_PER_IDENTIFIER} ครั้ง ⇒ พักจนพ้นช่วงเวลา
 * - ต่อ IP: ผิดครบ {@link LOGIN_MAX_FAILURES_PER_IP} ครั้ง (ไล่เดาหลายบัญชีจากที่เดียว)
 * ครั้งที่ถูกพักเองลง audit ด้วย code `LOGIN_RATE_LIMITED` ซึ่ง**ไม่นับ**เป็นครั้งที่ผิด ⇒ พ้น 15 นาทีนับจากครั้งที่ผิดจริงล่าสุดก็เข้าได้
 */

export const LOGIN_THROTTLE_WINDOW_MS = 15 * 60 * 1000
export const LOGIN_MAX_FAILURES_PER_IDENTIFIER = 5
export const LOGIN_MAX_FAILURES_PER_IP = 30

/** identifier ที่หน้าตาไม่ใช่อีเมล/username ลง audit เป็นค่านี้ — ใช้นับรายบัญชีไม่ได้ (ทุกคนใช้ค่าเดียวกัน) */
export const UNAUDITABLE_IDENTIFIER = '<invalid>'

export function isLoginThrottled({
  identifierFailures,
  ipFailures,
}: {
  /** `null` = นับรายบัญชีไม่ได้ (identifier ไม่ถูกรูปแบบ) */
  identifierFailures: number | null
  /** `null` = ไม่รู้ IP (dev / proxy ไม่ส่งมา) */
  ipFailures: number | null
}): boolean {
  if (identifierFailures !== null && identifierFailures >= LOGIN_MAX_FAILURES_PER_IDENTIFIER) return true
  if (ipFailures !== null && ipFailures >= LOGIN_MAX_FAILURES_PER_IP) return true
  return false
}
