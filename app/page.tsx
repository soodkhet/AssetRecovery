import { redirect } from 'next/navigation'
import { LOGIN_PATH } from '@/lib/auth/constants'
import { isAuthError } from '@/lib/auth/errors'
import { resolveLandingPath } from '@/lib/auth/landing'
import { getSessionUser } from '@/lib/auth/session'

/**
 * หน้าแรก `/` — ส่งต่อไปยังปลายทางตาม role (`05` §6.1 · `resolveLandingPath()`)
 * ยังไม่ได้ login / session ใช้ไม่ได้ → หน้า Login พร้อมเหตุผล
 */
export default async function HomePage() {
  let target = LOGIN_PATH

  try {
    const user = await getSessionUser()
    if (user !== null) target = resolveLandingPath(user.roleGroup, user.roleName)
  } catch (error) {
    if (!isAuthError(error)) throw error
    target = `${LOGIN_PATH}?reason=${error.code}`
  }

  redirect(target)
}
