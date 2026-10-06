import { OrganizationProfileTab } from '@/components/settings/organization-profile-tab'
import { requireMenuPage } from '@/lib/nav/menu-guard'

/**
 * ตั้งค่าทั่วไป → ข้อมูลองค์กร (มติ PO U99 · mockup `settings.html` แท็บ `organization`)
 * route guard เป็นชั้น UX — ข้อมูลจริงมาจาก `/api/settings/organization` ที่ตรวจ `requirePermission()` เอง
 */
export default async function SettingsOrganizationPage() {
  await requireMenuPage('settings.organization')
  return <OrganizationProfileTab />
}
