'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { LOGIN_PATH } from '@/lib/auth/constants'

/** ปุ่มออกจากระบบ — เรียก `POST /api/auth/logout` (invalidate session + audit) แล้วกลับหน้า login */
export function LogoutButton() {
  const router = useRouter()
  const [loading, setLoading] = useState(false)

  async function handleLogout() {
    setLoading(true)
    try {
      await fetch('/api/auth/logout', { method: 'POST' })
    } finally {
      router.replace(LOGIN_PATH)
      router.refresh()
    }
  }

  // ปุ่มรองตาม mockup `app-shell.html` (มุมขวาบนของ header) — ไม่แย่งสายตากับเมนูหลักสีดำ
  return (
    <Button variant="secondary" onClick={handleLogout} loading={loading}>
      {loading ? 'กำลังออกจากระบบ...' : 'ออกจากระบบ'}
    </Button>
  )
}
