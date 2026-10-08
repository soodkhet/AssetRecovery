/**
 * session หมดอายุระหว่างใช้งาน (API ตอบ 401 `UNAUTHENTICATED`) — preship R8-009
 *
 * `callApi` ประกาศ event นี้ แล้ว `<SessionExpiredDialog>` ใน shell ทุกตัวพาผู้ใช้ไปเข้าสู่ระบบ
 * (เดิมได้แค่ toast "ยังไม่ได้เข้าสู่ระบบ" ไม่มีทางไปหน้า login · ฟอร์มที่กรอกค้างหาย) · pure + ฝั่ง browser เท่านั้น
 */
export const SESSION_EXPIRED_EVENT = 'ar:session-expired'

export function announceSessionExpired(): void {
  if (typeof window !== 'undefined') window.dispatchEvent(new Event(SESSION_EXPIRED_EVENT))
}

/** URL หน้า login ที่พากลับมาหน้าปัจจุบัน (path + query) หลังเข้าสู่ระบบ — ใช้กับ `?next=` (กรองซ้ำที่หน้า login) */
export function loginUrlFor(pathname: string, search: string): string {
  const next = `${pathname}${search}`
  return next === '/' ? '/login' : `/login?next=${encodeURIComponent(next)}`
}
