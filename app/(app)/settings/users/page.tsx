import type { Metadata } from 'next'
import { UsersManager } from '@/components/users/users-manager'
import { requireMenuPage } from '@/lib/nav/menu-guard'

export const metadata: Metadata = { title: 'ผู้ใช้งาน' }

/**
 * ตั้งค่าทั่วไป → ผู้ใช้งาน (`08` §8 · `06` §9)
 * route guard เป็นชั้น UX — ข้อมูลจริงมาจาก `/api/users` ที่ตรวจ `requirePermission()` เอง
 */
export default async function SettingsUsersPage() {
  await requireMenuPage('settings.users')
  return <UsersManager />
}
