import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { ChangePasswordForm } from '@/components/auth/change-password-form'
import { LOGIN_PATH } from '@/lib/auth/constants'
import { isAuthError } from '@/lib/auth/errors'
import { getSessionUser } from '@/lib/auth/session'

export const metadata: Metadata = {
  title: 'เปลี่ยนรหัสผ่าน',
}

/**
 * เปลี่ยนรหัสผ่านของตัวเอง (มติ PO 03/10/2569) — ปลายทางบังคับเมื่อ `must_change_password`
 * ⚠️ ห้ามใช้ `requireSessionPage()` ที่นี่ — ตัวนั้น redirect มาหน้านี้เองเมื่อธงเปิด (วนไม่จบ)
 */
export default async function ChangePasswordPage() {
  let user = null
  try {
    user = await getSessionUser()
  } catch (error) {
    if (!isAuthError(error)) throw error
    redirect(`${LOGIN_PATH}?reason=${error.code}`)
  }
  if (user === null) redirect(LOGIN_PATH)

  return <ChangePasswordForm forced={user.mustChangePassword === true} displayName={user.fullName} />
}
