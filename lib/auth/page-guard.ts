import { redirect } from 'next/navigation'
import { LOGIN_PATH } from '@/lib/auth/constants'
import { isAuthError } from '@/lib/auth/errors'
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
  return user
}
