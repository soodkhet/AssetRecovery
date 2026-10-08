/**
 * session หมดอายุระหว่างใช้งาน (API ตอบ 401 `UNAUTHENTICATED`) — preship R8-009
 *
 * `callApi` ประกาศ event นี้ แล้ว `<SessionExpiredDialog>` ใน shell ทุกตัวพาผู้ใช้ไปเข้าสู่ระบบ
 * (เดิมได้แค่ toast "ยังไม่ได้เข้าสู่ระบบ" ไม่มีทางไปหน้า login · ฟอร์มที่กรอกค้างหาย) · pure + ฝั่ง browser เท่านั้น
 */
export const SESSION_EXPIRED_EVENT = 'ar:session-expired'

/**
 * 401 ที่แปลว่าผู้ใช้ต้องเข้าสู่ระบบใหม่ — ไม่มี session (`UNAUTHENTICATED`) และ session ครบ 24 ชม. (`SESSION_EXPIRED`
 * — กรณีที่เกิดจริงบ่อยที่สุด: เปิดแท็บค้างข้ามวัน) · เดิมรับแค่ตัวแรก กล่องจึงไม่เปิดตอนหมดอายุจริง (preship R9-003)
 * `INVALID_CREDENTIALS` เป็นของหน้า login เท่านั้น (ไม่ผ่าน `callApi`) ไม่นับ
 */
const SESSION_LOST_CODES: ReadonlySet<string> = new Set(['UNAUTHENTICATED', 'SESSION_EXPIRED'])

export function isSessionLost(status: number, code: string): boolean {
  return status === 401 && SESSION_LOST_CODES.has(code)
}

export function announceSessionExpired(): void {
  if (typeof window !== 'undefined') window.dispatchEvent(new Event(SESSION_EXPIRED_EVENT))
}

/** URL หน้า login ที่พากลับมาหน้าปัจจุบัน (path + query) หลังเข้าสู่ระบบ — ใช้กับ `?next=` (กรองซ้ำที่หน้า login) */
export function loginUrlFor(pathname: string, search: string): string {
  const next = `${pathname}${search}`
  return next === '/' ? '/login' : `/login?next=${encodeURIComponent(next)}`
}

/**
 * สำหรับคำขอที่ไม่ผ่าน `callApi` (ดาวน์โหลดไฟล์ด้วย `fetchWithTimeout` — ใบส่งมอบ/ใบกำกับในพอร์ทัล · export รายงาน ·
 * ตัวอย่างเอกสาร) — 401 ของ session ⇒ เปิดกล่องเซสชันหมดอายุเหมือนคำขอ API อื่น (preship R9-014)
 * อ่าน body จากสำเนา (`clone`) ⇒ ผู้เรียกยังอ่าน response เดิมได้ตามปกติ
 */
export async function noticeSessionLost(response: Response): Promise<void> {
  if (response.status !== 401) return
  const body: unknown = await response
    .clone()
    .json()
    .catch(() => null)
  const error = typeof body === 'object' && body !== null && 'error' in body ? (body as { error: unknown }).error : null
  const code = typeof error === 'object' && error !== null && 'code' in error ? (error as { code: unknown }).code : null
  if (typeof code === 'string' && isSessionLost(response.status, code)) announceSessionExpired()
}
