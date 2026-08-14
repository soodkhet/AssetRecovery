'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'
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

  return (
    <button
      type="button"
      onClick={handleLogout}
      disabled={loading}
      className="focus-ring rounded-lg bg-slate-900 px-3 py-2 text-xs font-semibold text-white hover:bg-slate-800 disabled:opacity-50"
    >
      {loading ? 'กำลังออกจากระบบ...' : 'ออกจากระบบ'}
    </button>
  )
}
