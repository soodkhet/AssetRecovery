import { ServiceFeeTemplatesManager } from '@/components/service-fee/service-fee-templates-manager'
import { requireMenuPage } from '@/lib/nav/menu-guard'

/**
 * ตั้งค่าทั่วไป → เทมเพลตค่าบริการ (`12` §8 · `06` §9 · DEC-008 แสดงเป็นการ์ด)
 * route guard เป็นชั้น UX — ข้อมูลจริงมาจาก `/api/service-fee-templates` ที่ตรวจ `requirePermission()` เอง
 */
export default async function SettingsServiceFeePage() {
  await requireMenuPage('settings.service-fee')
  return <ServiceFeeTemplatesManager />
}
