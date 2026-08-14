'use client'

import { useEffect, useState, type FormEvent } from 'react'
import { setPasswordSchema } from '@/lib/auth/schemas'
import { createSupabaseBrowserClient } from '@/lib/supabase/client'

/**
 * หน้าตั้งรหัสผ่านครั้งแรก — ปลายทางของลิงก์ในอีเมลคำเชิญ (มติ PO ปิด D1 · `lib/users/invite.ts`)
 * โครงหน้า/คลาสยึดแบบเดียวกับ mockup `reference/login.html` (การ์ดกลางจอ + ข้อความ error สีแดง)
 *
 * ลำดับ: ยืนยันตัวตนจากลิงก์ → ตั้งรหัสผ่านผ่าน Supabase (`updateUser`) → **ออกจากระบบ** แล้วให้
 * เข้าสู่ระบบใหม่ตามปกติ เพื่อให้ผ่านด่านของเราเองครบ (ตรวจสถานะ + audit login + landing ตาม role)
 *
 * ลิงก์ของ Supabase มาได้ 3 แบบตามเวอร์ชัน template: `?token_hash=&type=` (ปัจจุบัน) ·
 * `?code=` (PKCE) · `#access_token=` (แบบเดิม — `detectSessionInUrl` จัดการให้เอง)
 */

type Phase = 'verifying' | 'ready' | 'invalid' | 'done'

interface FormError {
  title: string
  message: string
}

const LINK_INVALID: FormError = {
  title: 'ลิงก์ใช้ไม่ได้หรือหมดอายุแล้ว',
  message: 'ลิงก์ตั้งรหัสผ่านมีอายุจำกัดและใช้ได้ครั้งเดียว — ติดต่อผู้ดูแลระบบให้ส่งคำเชิญอีกครั้ง',
}

export function SetPasswordForm() {
  const [phase, setPhase] = useState<Phase>('verifying')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<FormError | null>(null)

  useEffect(() => {
    let cancelled = false
    void (async () => {
      const result = await establishSession()
      if (cancelled) return
      setPhase(result ? 'ready' : 'invalid')
      setError(result ? null : LINK_INVALID)
    })()
    return () => {
      cancelled = true
    }
  }, [])

  async function handleSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault()
    setError(null)

    const parsed = setPasswordSchema.safeParse({ password, confirmPassword })
    if (!parsed.success) {
      const first = parsed.error.issues[0]
      setError({ title: 'รหัสผ่านไม่ผ่านเงื่อนไข', message: first?.message ?? 'กรุณาตรวจสอบรหัสผ่าน' })
      return
    }

    setSaving(true)
    try {
      const supabase = createSupabaseBrowserClient()
      const { error: updateError } = await supabase.auth.updateUser({ password: parsed.data.password })
      if (updateError) {
        setError({ title: 'ตั้งรหัสผ่านไม่สำเร็จ', message: updateError.message })
        return
      }

      // ล้าง session ของลิงก์เชิญทิ้ง แล้วให้เข้าสู่ระบบใหม่ผ่าน `/api/auth/login` (`05` §6.1)
      await supabase.auth.signOut()
      setPhase('done')
    } finally {
      setSaving(false)
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
          <p className="mt-1 text-sm text-slate-500">ตั้งรหัสผ่านสำหรับเข้าใช้งานครั้งแรก</p>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
          {phase === 'done' ? (
            <>
              <h2 className="mb-1 text-base font-bold text-slate-900">ตั้งรหัสผ่านเรียบร้อย</h2>
              <p className="mb-5 text-xs text-slate-500">
                เข้าสู่ระบบด้วยอีเมลของคุณและรหัสผ่านที่เพิ่งตั้งไว้ได้เลย
              </p>
              <a
                href="/login"
                className="focus-ring flex w-full items-center justify-center rounded-lg bg-slate-900 px-3 py-2.5 text-sm font-semibold text-white hover:bg-slate-800"
              >
                ไปหน้าเข้าสู่ระบบ
              </a>
            </>
          ) : (
            <>
              <h2 className="mb-1 text-base font-bold text-slate-900">ตั้งรหัสผ่าน</h2>
              <p className="mb-5 text-xs text-slate-500">
                รหัสผ่านต้องยาวอย่างน้อย 8 ตัวอักษร และมีทั้งตัวอักษรและตัวเลข
              </p>

              {error && (
                <div
                  role="alert"
                  className="mb-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2.5 text-xs text-red-700"
                >
                  <div className="font-semibold">{error.title}</div>
                  <div className="mt-0.5 text-red-600">{error.message}</div>
                </div>
              )}

              {phase === 'verifying' && <p className="text-xs text-slate-500">กำลังตรวจสอบลิงก์…</p>}

              {phase === 'invalid' && (
                <a
                  href="/login"
                  className="focus-ring flex w-full items-center justify-center rounded-lg border border-slate-300 px-3 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50"
                >
                  กลับหน้าเข้าสู่ระบบ
                </a>
              )}

              {phase === 'ready' && (
                <form onSubmit={(event) => void handleSubmit(event)} className="space-y-4">
                  <div>
                    <label htmlFor="new-password" className="mb-1 block text-xs font-bold text-slate-700">
                      รหัสผ่านใหม่
                    </label>
                    <div className="relative">
                      <input
                        id="new-password"
                        type={showPassword ? 'text' : 'password'}
                        autoComplete="new-password"
                        required
                        disabled={saving}
                        value={password}
                        onChange={(event) => setPassword(event.target.value)}
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

                  <div>
                    <label htmlFor="confirm-password" className="mb-1 block text-xs font-bold text-slate-700">
                      ยืนยันรหัสผ่าน
                    </label>
                    <input
                      id="confirm-password"
                      type={showPassword ? 'text' : 'password'}
                      autoComplete="new-password"
                      required
                      disabled={saving}
                      value={confirmPassword}
                      onChange={(event) => setConfirmPassword(event.target.value)}
                      placeholder="••••••••"
                      className="focus-ring w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                    />
                  </div>

                  <button
                    type="submit"
                    disabled={saving}
                    className="focus-ring flex w-full items-center justify-center rounded-lg bg-slate-900 px-3 py-2.5 text-sm font-semibold text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {saving ? 'กำลังบันทึก…' : 'ตั้งรหัสผ่าน'}
                  </button>
                </form>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  )
}

/** ยืนยันตัวตนจากพารามิเตอร์ในลิงก์ — คืน `true` เมื่อได้ session ที่ตั้งรหัสผ่านต่อได้ */
async function establishSession(): Promise<boolean> {
  const supabase = createSupabaseBrowserClient()
  const url = new URL(window.location.href)
  const tokenHash = url.searchParams.get('token_hash')
  const code = url.searchParams.get('code')

  if (tokenHash !== null) {
    const type = url.searchParams.get('type') === 'recovery' ? 'recovery' : 'invite'
    const { error } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type })
    if (error) return false
  } else if (code !== null) {
    const { error } = await supabase.auth.exchangeCodeForSession(code)
    if (error) return false
  }

  const { data } = await supabase.auth.getSession()
  return data.session !== null
}
