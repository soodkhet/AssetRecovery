'use client'

import { useRouter } from 'next/navigation'
import { useState, type FormEvent } from 'react'
import { authErrorMessage, type AuthErrorCode } from '@/lib/auth/errors'
import { loginSchema } from '@/lib/auth/schemas'

/**
 * ฟอร์มเข้าสู่ระบบ — โครงหน้า/คลาส Tailwind ตาม mockup `reference/login.html`
 * business logic ทั้งหมดอยู่ฝั่ง server (`POST /api/auth/login`) — ที่นี่แค่ validate เบื้องต้นด้วย
 * Zod schema ตัวเดียวกับ backend แล้วแสดงผลลัพธ์
 */

interface LoginError {
  title: string
  message: string
}

export function LoginForm({ reason, nextPath }: { reason?: AuthErrorCode; nextPath?: string }) {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<LoginError | null>(reason ? authErrorMessage(reason) : null)
  const [shake, setShake] = useState(false)

  function fail(next: LoginError) {
    setError(next)
    setShake(true)
    setLoading(false)
    window.setTimeout(() => setShake(false), 400)
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError(null)
    setLoading(true)

    const parsed = loginSchema.safeParse({ email, password })
    if (!parsed.success) {
      const first = parsed.error.issues[0]
      fail({ title: 'ข้อมูลไม่ครบ', message: first?.message ?? 'กรุณากรอกข้อมูลให้ครบถ้วน' })
      return
    }

    try {
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(parsed.data),
      })
      const body: unknown = await response.json()

      if (!response.ok) {
        const code = extractErrorCode(body)
        fail(authErrorMessage(code))
        return
      }

      const redirectTo = extractRedirect(body) ?? nextPath ?? '/'
      router.replace(redirectTo)
      router.refresh()
    } catch {
      fail({ title: 'เชื่อมต่อไม่สำเร็จ', message: 'กรุณาตรวจสอบการเชื่อมต่อแล้วลองใหม่อีกครั้ง' })
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <div className="fade-in w-full max-w-md">
        <div className="mb-8 text-center">
          <div className="mb-4 inline-flex h-14 w-14 items-center justify-center rounded-2xl bg-slate-900 text-xl font-extrabold text-white">
            AR
          </div>
          <h1 className="text-xl font-bold text-slate-900">AssetRecovery</h1>
          <p className="mt-1 text-sm text-slate-500">ระบบบริหารงานติดตามและจัดเก็บทรัพย์</p>
        </div>

        <div
          className={`rounded-xl border border-slate-200 bg-white p-6 shadow-sm ${shake ? 'shake' : ''}`}
        >
          <h2 className="mb-1 text-base font-bold text-slate-900">เข้าสู่ระบบ</h2>
          <p className="mb-5 text-xs text-slate-500">กรอกอีเมลและรหัสผ่านของบัญชีที่ได้รับสิทธิ์</p>

          {error && (
            <div
              role="alert"
              className="mb-4 flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2.5 text-xs text-red-700"
            >
              <svg
                className="mt-0.5 h-4 w-4 flex-shrink-0"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
                aria-hidden="true"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z"
                />
              </svg>
              <div>
                <div className="font-semibold">{error.title}</div>
                <div className="mt-0.5 text-red-600">{error.message}</div>
              </div>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label htmlFor="email" className="mb-1 block text-xs font-bold text-slate-700">
                อีเมล
              </label>
              <input
                id="email"
                type="email"
                autoComplete="username"
                required
                disabled={loading}
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="name@company.co.th"
                className="focus-ring w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
              />
            </div>

            <div>
              <label htmlFor="password" className="mb-1 block text-xs font-bold text-slate-700">
                รหัสผ่าน
              </label>
              <div className="relative">
                <input
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="current-password"
                  required
                  disabled={loading}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="focus-ring w-full rounded-lg border border-slate-300 px-3 py-2 pr-16 text-sm"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((value) => !value)}
                  className="absolute top-1/2 right-2 -translate-y-1/2 rounded px-1.5 py-1 text-[11px] font-semibold text-slate-500 hover:text-slate-800"
                >
                  {showPassword ? 'ซ่อน' : 'แสดง'}
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="focus-ring flex w-full items-center justify-center gap-2 rounded-lg bg-slate-900 px-3 py-2.5 text-sm font-semibold text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {loading ? (
                <>
                  <svg className="h-4 w-4 animate-spin" fill="none" viewBox="0 0 24 24" aria-hidden="true">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth={4} />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
                  </svg>
                  กำลังตรวจสอบ...
                </>
              ) : (
                'เข้าสู่ระบบ'
              )}
            </button>
          </form>
        </div>

        <p className="mt-6 text-center text-[11px] text-slate-400">
          เซสชันมีอายุ 24 ชั่วโมง — หลังหมดอายุระบบจะให้เข้าสู่ระบบใหม่
        </p>
      </div>
    </div>
  )
}

function extractErrorCode(body: unknown): AuthErrorCode {
  if (typeof body === 'object' && body !== null && 'error' in body) {
    const error = (body as { error: unknown }).error
    if (typeof error === 'object' && error !== null && 'code' in error) {
      const code = (error as { code: unknown }).code
      if (typeof code === 'string') return code as AuthErrorCode
    }
  }
  return 'INVALID_CREDENTIALS'
}

function extractRedirect(body: unknown): string | null {
  if (typeof body === 'object' && body !== null && 'data' in body) {
    const data = (body as { data: unknown }).data
    if (typeof data === 'object' && data !== null && 'redirectTo' in data) {
      const redirectTo = (data as { redirectTo: unknown }).redirectTo
      if (typeof redirectTo === 'string') return redirectTo
    }
  }
  return null
}
