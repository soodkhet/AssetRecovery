import type { Metadata } from 'next'
import { LoginForm } from '@/components/auth/login-form'
import { loginReasonMessage } from '@/lib/auth/errors'
import { safeNextPath } from '@/lib/auth/next-path'

export const metadata: Metadata = {
  title: 'เข้าสู่ระบบ',
}

/** หน้า Login (`05` §6.1) — UI ตาม mockup `reference/login.html` */
export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const params = await searchParams
  // ตรวจว่าเป็น path ภายในเว็บนี้จริง (`//host` ผ่าน `startsWith('/')` ได้ — preship R7-006)
  const next = safeNextPath(params.next) ?? undefined

  const reason = loginReasonMessage(typeof params.reason === 'string' ? params.reason : undefined) ?? undefined
  return <LoginForm reason={reason} nextPath={next} />
}
