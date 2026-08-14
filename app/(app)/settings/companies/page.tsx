import { CompaniesManager } from '@/components/finance-companies/companies-manager'
import { requireMenuPage } from '@/lib/nav/menu-guard'

/**
 * ตั้งค่าทั่วไป → บริษัทไฟแนนซ์ (`10` §8 — การ์ด ไม่ใช่ตาราง · `06` §9)
 * route guard เป็นชั้น UX — ข้อมูลจริงมาจาก `/api/finance-companies` ที่ตรวจ `requirePermission()` เอง
 */
export default async function SettingsCompaniesPage() {
  await requireMenuPage('settings.companies')
  return <CompaniesManager />
}
