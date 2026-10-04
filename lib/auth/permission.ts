import type { CapabilityAccessLevel, RoleGroup } from '@/lib/generated/prisma/enums'
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

/** capability ของพอร์ทัลบริษัทไฟแนนซ์ขึ้นต้นด้วย `portal_` ทุกตัว (`97` §3.3 · `lib/portal/access.ts`) */
export const PORTAL_CAPABILITY_PREFIX = 'portal_'

export function isPortalCapability(code: string): boolean {
  return code.startsWith(PORTAL_CAPABILITY_PREFIX)
}

/**
 * ผู้ใช้กลุ่มบริษัทไฟแนนซ์ = ใช้พอร์ทัลทางเดียว (มติ PO 05/10/2569 U6/O43 D2 · `06` v2.6 §7.2 · `97` §11)
 * ⇒ หน้า/API ภายในทั้งหมดปฏิเสธ แม้ role จะถูกผูก capability ภายในไว้ (เช่น `view_own_company_data` เดิม)
 * Superadmin ไม่นับ (อยู่กลุ่ม `system` เสมอ — กันไว้ซ้ำ)
 */
export function isPortalOnlyUser(user: { roleGroup: RoleGroup; isSuperadmin: boolean }): boolean {
  return !user.isSuperadmin && user.roleGroup === 'finance_company'
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
 * ตรวจสิทธิ์ครบชุด: สถานะบัญชี → อายุ session → ต้องเปลี่ยนรหัสผ่าน → ผู้ใช้บริษัท (พอร์ทัลเท่านั้น) → capability → scope ย่อย
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
  // ผู้ดูแลตั้ง/รีเซ็ตรหัสให้ → ใช้ endpoint ที่ต้องมีสิทธิ์ไม่ได้จนกว่าจะเปลี่ยนรหัสเอง (มติ PO 03/10/2569)
  if (user.mustChangePassword === true) return 'PASSWORD_CHANGE_REQUIRED'
  // ผู้ใช้บริษัทไฟแนนซ์เข้าได้เฉพาะ capability พอร์ทัล — route ภายในทุกตัว 403 (มติ O43 D2)
  if (isPortalOnlyUser(user) && !isPortalCapability(resource)) return 'PERMISSION_DENIED'
  if (!hasCapability(user, action, resource)) return 'PERMISSION_DENIED'
  // scope ย่อย ("ทีมตัวเอง"/"own"/"company") บังคับเพิ่มจาก access_level — `25` §16.1
  if (!isWithinScope(user.scope, target)) return 'PERMISSION_DENIED'
  return null
}
