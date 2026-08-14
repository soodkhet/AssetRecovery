import type { CapabilityAccessLevel } from '@/lib/generated/prisma/enums'
import type { AuthErrorCode } from '@/lib/auth/errors'
import { isWithinScope } from '@/lib/auth/scope'
import type { PermissionAction, ScopeTarget, SessionScope, SessionUser } from '@/lib/auth/types'
import { SESSION_MAX_AGE_MS } from '@/lib/auth/constants'

/**
 * ตรรกะสิทธิ์ทั้งหมดเป็น pure function — ทดสอบได้โดยไม่ต้องมี DB/HTTP และใช้ร่วมได้ทั้ง FE/BE
 * ⚠️ จุดบังคับจริงคือ `requirePermission()` ที่ API layer ทุก endpoint (DEC-002) — UI hide/disable เป็นแค่ UX
 */

/** ส่วนของ session ที่พอสำหรับตัดสินสิทธิ์ — ทั้ง `SessionUser` (BE) และ `ClientSession` (FE) เข้าได้ */
export interface CapabilityHolder {
  isSuperadmin: boolean
  capabilities: Readonly<Record<string, CapabilityAccessLevel>>
}

export interface ScopedCapabilityHolder extends CapabilityHolder {
  scope: SessionScope
}

/** มี capability ระดับที่ขอหรือไม่ (DEC-009: ไม่มี record = ไม่มีสิทธิ์ · view ⊂ manage) */
export function hasCapability(user: CapabilityHolder, action: PermissionAction, resource: string): boolean {
  if (user.isSuperadmin) return true

  const level = user.capabilities[resource]
  if (level === undefined) return false
  return action === 'view' ? true : level === 'manage'
}

/** capability + scope ย่อย — ใช้ซ่อน/แสดงปุ่มฝั่ง UI (`<Can>` / `usePermission()`) และเช็คซ้ำฝั่ง server */
export function canAccess(
  user: ScopedCapabilityHolder,
  action: PermissionAction,
  resource: string,
  target?: ScopeTarget,
): boolean {
  return hasCapability(user, action, resource) && isWithinScope(user.scope, target)
}

/** session หมดอายุหรือยัง — 24 ชั่วโมงนับจาก login ล่าสุด (`05` §10, §17) */
export function isSessionExpired(loginAt: string | Date | null, now: Date, maxAgeMs = SESSION_MAX_AGE_MS): boolean {
  if (loginAt === null) return true
  const loginTime = typeof loginAt === 'string' ? new Date(loginAt) : loginAt
  const elapsed = now.getTime() - loginTime.getTime()
  if (Number.isNaN(elapsed)) return true
  return elapsed >= maxAgeMs
}

/**
 * ตรวจสิทธิ์ครบชุด: สถานะบัญชี → อายุ session → capability → scope ย่อย
 * คืน `null` = ผ่าน · คืน error code = ปฏิเสธ (caller เป็นคนโยน `AuthError`)
 */
export function checkPermission(
  user: SessionUser,
  action: PermissionAction,
  resource: string,
  target?: ScopeTarget,
  now: Date = new Date(),
): AuthErrorCode | null {
  if (user.status !== 'active') return 'ACCOUNT_INACTIVE'
  if (isSessionExpired(user.loginAt, now)) return 'SESSION_EXPIRED'
  if (!hasCapability(user, action, resource)) return 'PERMISSION_DENIED'
  // scope ย่อย ("ทีมตัวเอง"/"own"/"company") บังคับเพิ่มจาก access_level — `25` §16.1
  if (!isWithinScope(user.scope, target)) return 'PERMISSION_DENIED'
  return null
}
