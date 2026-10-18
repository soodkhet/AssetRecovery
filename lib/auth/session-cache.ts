import { SESSION_CACHE_TTL_MS } from '@/lib/auth/constants'
import { isSessionExpired } from '@/lib/auth/permission'
import type { AuthzVersion, SessionUser } from '@/lib/auth/types'

/**
 * Cache role+scope ระดับ instance — `01` §6.1 / `05` §17 กำหนดว่าห้าม query DB ทุก request
 *
 * ⚠️ ไม่ใช่ security boundary: การตรวจสิทธิ์จริงยังทำที่ `requirePermission()` ทุกครั้ง
 * ⚠️ เป็น cache ต่อ instance (Vercel serverless มีหลาย instance) — `invalidateSessionCache()` ล้างได้แค่ instance ที่รับคำขอ
 *    ⇒ มติ D7-02 (mytester7 S7-AG7-05): ก่อนใช้ค่าใน cache ทุกครั้ง `lib/auth/session.ts` เทียบ `authzVersion`
 *    กับฐานด้วย query เดียว (`isAuthzVersionCurrent`) — ระงับ/ถอดสิทธิ์/เปลี่ยน role-capability/ทีม/บริษัท
 *    มีผลกับคำขอถัดไปทุก instance โดยไม่มี window · TTL เป็นแค่เพดานอายุ entry ไม่ใช่กลไกความถูกต้อง
 */
interface CacheEntry {
  value: SessionUser
  expiresAt: number
}

const cache = new Map<string, CacheEntry>()

export function getCachedSession(supabaseUid: string, now: number = Date.now()): SessionUser | null {
  const entry = cache.get(supabaseUid)
  if (!entry) return null
  if (entry.expiresAt <= now || !isCacheableSession(entry.value, now)) {
    cache.delete(supabaseUid)
    return null
  }
  return entry.value
}

/**
 * session ที่ยังติดธง `must_change_password` ห้ามเสิร์ฟจาก cache — โหลดจาก DB ใหม่ทุกครั้ง (DEC-010)
 * เพราะผู้ใช้เปลี่ยนรหัสที่ instance หนึ่ง แต่ instance อื่นบน Vercel ยังถือ cache เก่าอยู่ได้ถึง 5 นาที
 * ⇒ login ใหม่แล้ววนกลับหน้าเปลี่ยนรหัสไม่จบ (เจอบน staging 03/10/2569) · สถานะนี้สั้น เปลืองแค่ไม่กี่ query
 */
export function isCacheableSession(user: SessionUser, now: number = Date.now()): boolean {
  if (user.mustChangePassword === true) return false
  // BUG-150: ห้ามเสิร์ฟผล "session หมดอายุ" จาก cache — `loginAt` ใน cache เป็น snapshot ของ `last_login_at`
  // ถ้าผู้ใช้ login ใหม่ที่ instance อื่น (Vercel) instance นี้ยังถือ loginAt เก่า ⇒ เด้ง SESSION_EXPIRED ได้ถึง TTL
  // ⇒ entry ที่ loginAt หมดอายุแล้ว = cache miss ให้โหลด `last_login_at` สดจาก DB ก่อนตัดสินทุกครั้ง
  return !isSessionExpired(user.loginAt, new Date(now))
}

export function setCachedSession(
  supabaseUid: string,
  value: SessionUser,
  now: number = Date.now(),
  ttlMs: number = SESSION_CACHE_TTL_MS,
): void {
  // ไม่ cache ผลลบ (session หมดอายุ/ต้องเปลี่ยนรหัส) — โหลดใหม่จาก DB ทุก request จนกว่าสถานะจะกลับมาปกติ
  if (!isCacheableSession(value, now)) {
    cache.delete(supabaseUid)
    return
  }
  cache.set(supabaseUid, { value, expiresAt: now + ttlMs })
}

/**
 * entry ใน cache ยังใช้ได้ไหม — ต้องมีเวอร์ชันและตรงกับเวอร์ชันล่าสุดในฐานทั้งฝั่งผู้ใช้และฝั่ง role
 * `current = null` = ไม่พบผู้ใช้ในฐานแล้ว (ถูกลบ/ถอด supabase uid) ⇒ ใช้ไม่ได้
 */
export function isAuthzVersionCurrent(cached: SessionUser, current: AuthzVersion | null): boolean {
  if (current === null || cached.authzVersion === undefined) return false
  return cached.authzVersion.user === current.user && cached.authzVersion.role === current.role
}

/** ล้าง cache ของผู้ใช้ 1 คน — เรียกเมื่อ login/logout หรือ role/สถานะเปลี่ยน */
export function invalidateSessionCache(supabaseUid: string): void {
  cache.delete(supabaseUid)
}

/** ล้างทั้งหมด — ใช้ใน test และตอนแก้ permission matrix ระดับ role (Phase 1.6) */
export function clearSessionCache(): void {
  cache.clear()
}

export function sessionCacheSize(): number {
  return cache.size
}
