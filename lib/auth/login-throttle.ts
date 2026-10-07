/**
 * จำกัดการเดารหัสผ่าน — preship audit PS-009 + รอบ 2 (R2-002/R2-003/R2-020)
 *
 * sign in ของ Supabase ถูกเรียกจาก server ⇒ rate limit ฝั่ง Supabase เห็นแค่ IP ของ server (กันรายคนไม่ได้
 * และถ้าโดนก็ล็อกทุกคนพร้อมกัน) จึงนับเองจาก audit ที่ล้มเหลวด้วย `INVALID_CREDENTIALS`
 * (ลงทุกครั้งอยู่แล้วตาม `05` §13 — ไม่ต้องมีตารางใหม่) ย้อนหลัง {@link LOGIN_THROTTLE_WINDOW_MS}
 *
 * นับต่อ "บัญชี" ไม่ใช่ข้อความที่พิมพ์ ({@link loginThrottleKey}) — อีเมลกับ username ของคนเดียวกันใช้เพดานร่วม
 * - บัญชี + IP: ผิดครบ {@link LOGIN_MAX_FAILURES_PER_ACCOUNT_IP} ⇒ พักเฉพาะ IP นั้น — คนนอกล็อกเจ้าของบัญชีที่อยู่คนละที่ไม่ได้
 * - บัญชี (ทุก IP): ผิดครบ {@link LOGIN_MAX_FAILURES_PER_ACCOUNT} ⇒ พักบัญชี (กันไล่เดาแบบกระจาย IP)
 * - IP (ทุกบัญชี): ผิดครบ {@link LOGIN_MAX_FAILURES_PER_IP} ⇒ พัก IP (ไล่เดาหลายบัญชีจากที่เดียว)
 * ผู้ดูแลตั้งรหัสใหม่ให้ / เจ้าของเปลี่ยนรหัสเอง = เริ่มนับรายบัญชีใหม่ (ทางปลดล็อกโดยไม่ต้องรอ)
 * ครั้งที่ถูกพักลง audit ด้วย code `LOGIN_RATE_LIMITED` ซึ่ง**ไม่นับ**เป็นครั้งที่ผิด
 */

export const LOGIN_THROTTLE_WINDOW_MS = 15 * 60 * 1000
export const LOGIN_MAX_FAILURES_PER_ACCOUNT_IP = 5
export const LOGIN_MAX_FAILURES_PER_ACCOUNT = 50
export const LOGIN_MAX_FAILURES_PER_IP = 30

/** identifier ที่หน้าตาไม่ใช่อีเมล/username ลง audit เป็นค่านี้ — ใช้นับรายบัญชีไม่ได้ (ทุกคนใช้ค่าเดียวกัน) */
export const UNAUDITABLE_IDENTIFIER = '<invalid>'

/**
 * กุญแจนับครั้งที่ผิด — บัญชีที่มีจริงใช้ user id (อีเมล/username ของคนเดียวกันนับร่วม)
 * บัญชีที่ไม่มีใช้ identifier ที่พิมพ์ (ผู้โจมตีเห็นพฤติกรรมเดียวกัน ไม่ leak ว่ามีบัญชีไหม) · `null` = นับไม่ได้
 */
export function loginThrottleKey(accountId: string | null, auditableIdentifier: string): string | null {
  if (accountId !== null) return `user:${accountId}`
  if (auditableIdentifier === UNAUDITABLE_IDENTIFIER) return null
  return `identifier:${auditableIdentifier.toLowerCase()}`
}

export function isLoginThrottled({
  accountIpFailures,
  accountFailures,
  ipFailures,
}: {
  /** ผิดของบัญชีนี้จาก IP นี้ — `null` = นับไม่ได้ (ไม่มีกุญแจบัญชี หรือไม่รู้ IP) */
  accountIpFailures: number | null
  /** ผิดของบัญชีนี้จากทุก IP — `null` = ไม่มีกุญแจบัญชี */
  accountFailures: number | null
  /** ผิดจาก IP นี้ทุกบัญชี — `null` = ไม่รู้ IP (dev / proxy ไม่ส่งมา) */
  ipFailures: number | null
}): boolean {
  if (accountIpFailures !== null && accountIpFailures >= LOGIN_MAX_FAILURES_PER_ACCOUNT_IP) return true
  // ไม่รู้ IP ⇒ แยกที่มาไม่ได้ ใช้เพดานเข้มของบัญชีแทน (พฤติกรรมเดิม)
  const accountLimit = accountIpFailures === null && ipFailures === null ? LOGIN_MAX_FAILURES_PER_ACCOUNT_IP : LOGIN_MAX_FAILURES_PER_ACCOUNT
  if (accountFailures !== null && accountFailures >= accountLimit) return true
  if (ipFailures !== null && ipFailures >= LOGIN_MAX_FAILURES_PER_IP) return true
  return false
}
