import { RolesManager } from '@/components/roles/roles-manager'
import { requireMenuPage } from '@/lib/nav/menu-guard'

/**
 * ตั้งค่าทั่วไป → สิทธิ์การใช้งาน (`07` §8 · `06` §9)
 * route guard เป็นชั้น UX — ข้อมูลจริงมาจาก `/api/roles` ที่ตรวจ `requirePermission()` เองทุกครั้ง
 */
export default async function SettingsRolesPage() {
  await requireMenuPage('settings.roles')
  return <RolesManager />
}
