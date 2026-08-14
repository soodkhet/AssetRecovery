import { TeamsManager } from '@/components/teams/teams-manager'
import { requireMenuPage } from '@/lib/nav/menu-guard'

/**
 * ตั้งค่าทั่วไป → ทีมติดตามทรัพย์ (`09` §8 · `06` §9)
 * route guard เป็นชั้น UX — ข้อมูลจริงมาจาก `/api/teams` ที่ตรวจ `requirePermission()` เอง
 */
export default async function SettingsTeamsPage() {
  await requireMenuPage('settings.teams')
  return <TeamsManager />
}
