import type { Metadata } from 'next'
import { LoginForm } from '@/components/auth/login-form'
import { AUTH_ERROR_CODES, type AuthErrorCode } from '@/lib/auth/errors'
import { safeNextPath } from '@/lib/auth/next-path'

export const metadata: Metadata = {
  title: 'เข้าสู่ระบบ — AssetRecovery',
}

function parseReason(value: string | string[] | undefined): AuthErrorCode | undefined {
  if (typeof value !== 'string') return undefined
  return (AUTH_ERROR_CODES as readonly string[]).includes(value) ? (value as AuthErrorCode) : undefined
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

  return <LoginForm reason={parseReason(params.reason)} nextPath={next} />
}
