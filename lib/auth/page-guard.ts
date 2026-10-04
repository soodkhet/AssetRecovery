import { redirect } from 'next/navigation'
import { CHANGE_PASSWORD_PATH, CLIENT_PORTAL_PATH, LOGIN_PATH } from '@/lib/auth/constants'
import { isAuthError } from '@/lib/auth/errors'
import { isPortalOnlyUser } from '@/lib/auth/permission'
import { getSessionUser } from '@/lib/auth/session'
import type { SessionUser } from '@/lib/auth/types'

/**
 * Route guard ของหน้า server component — ไม่มี session/หมดอายุ/ถูกระงับ → เด้งไปหน้า login พร้อมเหตุผล
 * ⚠️ เป็นชั้น UX เท่านั้น — ข้อมูลจริงยังต้องผ่าน `requirePermission()` ที่ API layer ทุกครั้ง (DEC-002)
 */
export async function requireSessionPage(): Promise<SessionUser> {
  let user: SessionUser | null = null
  let reason: string | null = null

  try {
    user = await getSessionUser()
  } catch (error) {
    if (!isAuthError(error)) throw error
    reason = error.code
  }

  if (reason !== null) redirect(`${LOGIN_PATH}?reason=${reason}`)
  if (user === null) redirect(LOGIN_PATH)
  // ผู้ดูแลตั้ง/รีเซ็ตรหัสให้ → ต้องเปลี่ยนรหัสเองก่อนเข้าหน้าอื่น (API บังคับซ้ำที่ `checkPermission`)
  if (user.mustChangePassword === true) redirect(CHANGE_PASSWORD_PATH)
  return user
}

/**
 * Route guard ของหน้า **ระบบภายใน** (route group `(app)`, `/field`) — ผู้ใช้กลุ่มบริษัทไฟแนนซ์เด้งไป `/portal`
 * (มติ PO 05/10/2569 U6/O43 D2 · `06` v2.6 §7.2 — ใช้พอร์ทัลทางเดียว) · ชั้น UX เช่นเดียวกับ `requireSessionPage()`
 */
export async function requireInternalSessionPage(): Promise<SessionUser> {
  const user = await requireSessionPage()
  if (isPortalOnlyUser(user)) redirect(CLIENT_PORTAL_PATH)
  return user
}
