'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { FetchTimeoutError, fetchWithTimeout } from '@/lib/api/fetch-with-timeout'
import { LOGIN_PATH } from '@/lib/auth/constants'

/** ปุ่มออกจากระบบ — เรียก `POST /api/auth/logout` (invalidate session + audit) แล้วกลับหน้า login */
export function LogoutButton() {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleLogout() {
    setLoading(true)
    setError(null)
    try {
      // preship R2-017 — มี timeout · เดิม server ค้างแล้วปุ่มหมุนไม่จบ
      await fetchWithTimeout('/api/auth/logout', { method: 'POST' })
    } catch (caught) {
      // ออกจากระบบฝั่ง server ไม่สำเร็จ ⇒ session ยังใช้ได้ — ไม่พากลับหน้า login (จะเด้งกลับมาเอง) แต่บอกให้ลองใหม่
      setError(
        caught instanceof FetchTimeoutError
          ? 'ระบบตอบช้าเกินไป ออกจากระบบไม่สำเร็จ กรุณาลองใหม่'
          : 'เชื่อมต่อไม่สำเร็จ ออกจากระบบไม่สำเร็จ กรุณาตรวจสอบอินเทอร์เน็ตแล้วลองใหม่',
      )
      setLoading(false)
      return
    }
    router.replace(LOGIN_PATH)
    router.refresh()
  }

  // ปุ่มรองตาม mockup `app-shell.html` (มุมขวาบนของ header) — ไม่แย่งสายตากับเมนูหลักสีดำ
  return (
    <span className="relative inline-flex">
      <Button variant="secondary" onClick={handleLogout} loading={loading}>
        {loading ? 'กำลังออกจากระบบ...' : 'ออกจากระบบ'}
      </Button>
      {error !== null && (
        <span
          role="alert"
          className="absolute top-full right-0 z-20 mt-1 w-56 max-w-[calc(100vw-2rem)] rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700 shadow-sm"
        >
          {error}
        </span>
      )}
    </span>
  )
}
