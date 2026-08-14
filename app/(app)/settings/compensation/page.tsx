import { CompensationPlansManager } from '@/components/compensation/compensation-plans-manager'
import { requireMenuPage } from '@/lib/nav/menu-guard'

/**
 * ตั้งค่าทั่วไป → แผนค่าตอบแทน (`11` §8 · `06` §9)
 * route guard เป็นชั้น UX — ข้อมูลจริงมาจาก `/api/compensation-plans` ที่ตรวจ `requirePermission()` เอง
 */
export default async function SettingsCompensationPage() {
  await requireMenuPage('settings.compensation')
  return <CompensationPlansManager />
}
