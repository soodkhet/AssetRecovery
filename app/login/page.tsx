import type { Metadata } from 'next'
import { LoginForm } from '@/components/auth/login-form'
import { AUTH_ERROR_CODES, type AuthErrorCode } from '@/lib/auth/errors'

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
  const next = typeof params.next === 'string' && params.next.startsWith('/') ? params.next : undefined

  return <LoginForm reason={parseReason(params.reason)} nextPath={next} />
}
