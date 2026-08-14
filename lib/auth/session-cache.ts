import { SESSION_CACHE_TTL_MS } from '@/lib/auth/constants'
import type { SessionUser } from '@/lib/auth/types'

/**
 * Cache role+scope ระดับ instance — `01` §6.1 / `05` §17 กำหนดว่าห้าม query DB ทุก request
 *
 * ⚠️ ไม่ใช่ security boundary: การตรวจสิทธิ์จริงยังทำที่ `requirePermission()` ทุกครั้ง
 * ⚠️ เป็น cache ต่อ instance (Vercel serverless มีหลาย instance) — จึงต้องมี TTL สั้น
 *    และต้องเรียก `invalidateSessionCache()` ทุกครั้งที่ role/สถานะ/ทีม/บริษัทของผู้ใช้เปลี่ยน
 */
interface CacheEntry {
  value: SessionUser
  expiresAt: number
}

const cache = new Map<string, CacheEntry>()

export function getCachedSession(supabaseUid: string, now: number = Date.now()): SessionUser | null {
  const entry = cache.get(supabaseUid)
  if (!entry) return null
  if (entry.expiresAt <= now) {
    cache.delete(supabaseUid)
    return null
  }
  return entry.value
}

export function setCachedSession(
  supabaseUid: string,
  value: SessionUser,
  now: number = Date.now(),
  ttlMs: number = SESSION_CACHE_TTL_MS,
): void {
  cache.set(supabaseUid, { value, expiresAt: now + ttlMs })
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
