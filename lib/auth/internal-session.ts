import { AuthError } from '@/lib/auth/errors'
import { isPortalOnlyUser } from '@/lib/auth/permission'
import { requireSession } from '@/lib/auth/session'
import type { SessionUser } from '@/lib/auth/types'

/**
 * session ของ **ระบบภายใน** — เหมือน `requireSession()` แต่ผู้ใช้กลุ่มบริษัทไฟแนนซ์ได้ 403 `PERMISSION_DENIED`
 * (มติ PO 05/10/2569 U6/O43 D2 — ใช้พอร์ทัลทางเดียว) · ใช้กับ endpoint ภายในที่ไม่ผูก capability
 * (เมนู/แจ้งเตือน/รายงาน) — endpoint ที่ผ่าน `requirePermission()` ถูกตัดที่ `checkPermission()` อยู่แล้ว
 */
export async function requireInternalSession(now: Date = new Date()): Promise<SessionUser> {
  const user = await requireSession(now)
  if (isPortalOnlyUser(user)) throw new AuthError('PERMISSION_DENIED', `internal endpoint: portal-only user=${user.id}`)
  return user
}
