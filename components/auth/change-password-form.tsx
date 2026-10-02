'use client'

import { useRouter } from 'next/navigation'
import { useState, type FormEvent } from 'react'
import { LogoutButton } from '@/components/auth/logout-button'
import { changePasswordSchema, PASSWORD_MIN_LENGTH } from '@/lib/auth/schemas'

/**
 * หน้าเปลี่ยนรหัสผ่านของตัวเอง (มติ PO 03/10/2569) — บังคับเข้าหลังผู้ดูแลตั้ง/รีเซ็ตรหัสให้
 * โครงหน้า/คลาสแบบเดียวกับ `<SetPasswordForm>` (mockup `reference/login.html` — การ์ดกลางจอ)
 * ตั้งรหัสผ่าน `POST /api/auth/change-password` ฝั่ง server (ล้างธง + audit) แล้วไปหน้าแรกตาม role
 */

interface FormError {
  title: string
  message: string
}

export function ChangePasswordForm({ forced, displayName }: { forced: boolean; displayName: string }) {
  const router = useRouter()
  const [currentPassword, setCurrentPassword] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<FormError | null>(null)

  async function handleSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault()
    setError(null)

    const parsed = changePasswordSchema.safeParse({ currentPassword, password, confirmPassword })
    if (!parsed.success) {
      const first = parsed.error.issues[0]
      setError({ title: 'รหัสผ่านไม่ผ่านเงื่อนไข', message: first?.message ?? 'กรุณาตรวจสอบรหัสผ่าน' })
      return
    }

    setSaving(true)
    try {
      const response = await fetch('/api/auth/change-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(parsed.data),
      })
      const body: unknown = await response.json().catch(() => null)
      if (!response.ok) {
        setError(extractError(body))
        return
      }
      router.replace(extractRedirect(body) ?? '/')
      router.refresh()
    } catch {
      setError({ title: 'เชื่อมต่อไม่สำเร็จ', message: 'กรุณาตรวจสอบอินเทอร์เน็ตแล้วลองใหม่' })
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
          <p className="mt-1 text-sm text-slate-500">{displayName}</p>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="mb-1 text-base font-bold text-slate-900">
            {forced ? 'ตั้งรหัสผ่านใหม่ก่อนเริ่มใช้งาน' : 'เปลี่ยนรหัสผ่าน'}
          </h2>
          <p className="mb-5 text-xs text-slate-500">
            {forced ? 'ผู้ดูแลระบบตั้งรหัสผ่านชั่วคราวให้บัญชีนี้ — กรุณาตั้งรหัสผ่านของคุณเอง · ' : ''}
            รหัสผ่านต้องยาวอย่างน้อย {PASSWORD_MIN_LENGTH} ตัวอักษร และมีทั้งตัวอักษรและตัวเลข
          </p>

          {error && (
            <div role="alert" className="mb-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2.5 text-xs text-red-700">
              <div className="font-semibold">{error.title}</div>
              <div className="mt-0.5 text-red-600">{error.message}</div>
            </div>
          )}

          <form onSubmit={(event) => void handleSubmit(event)} className="space-y-4">
            <div>
              <label htmlFor="current-password" className="mb-1 block text-xs font-bold text-slate-700">
                {forced ? 'รหัสผ่านชั่วคราว (ที่ผู้ดูแลแจ้ง)' : 'รหัสผ่านปัจจุบัน'}
              </label>
              <input
                id="current-password"
                type={showPassword ? 'text' : 'password'}
                autoComplete="current-password"
                required
                disabled={saving}
                value={currentPassword}
                onChange={(event) => setCurrentPassword(event.target.value)}
                placeholder="••••••••"
                className="focus-ring w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
              />
            </div>

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
              {saving ? 'กำลังบันทึก…' : 'บันทึกรหัสผ่านใหม่'}
            </button>
          </form>

          <div className="mt-4 flex justify-center">
            <LogoutButton />
          </div>
        </div>
      </div>
    </div>
  )
}

function extractRedirect(body: unknown): string | null {
  if (typeof body !== 'object' || body === null || !('data' in body)) return null
  const data = (body as { data: unknown }).data
  if (typeof data !== 'object' || data === null || !('redirectTo' in data)) return null
  const redirectTo = (data as { redirectTo: unknown }).redirectTo
  return typeof redirectTo === 'string' ? redirectTo : null
}

function extractError(body: unknown): FormError {
  if (typeof body === 'object' && body !== null && 'error' in body) {
    const error = (body as { error: unknown }).error
    if (typeof error === 'object' && error !== null) {
      const { title, message } = error as { title?: unknown; message?: unknown }
      if (typeof title === 'string' && typeof message === 'string') return { title, message }
    }
  }
  return { title: 'เปลี่ยนรหัสผ่านไม่สำเร็จ', message: 'กรุณาลองใหม่อีกครั้ง' }
}
