import { ModulePlaceholder } from '@/components/shell/module-placeholder'
import { requireMenuPage } from '@/lib/nav/menu-guard'

/** การตั้งค่า — ตั้งค่าทั่วไป + ตั้งค่าบัญชี/การเงิน 13 แท็บ (ไฟล์ 13) · หน้าจริงเริ่ม Phase 1.11 */
export default async function SettingsPage() {
  await requireMenuPage('settings')
  return (
    <ModulePlaceholder
      menuId="settings"
      note="ตั้งค่าทั่วไป (roles/teams/companies/users/compensation/servicefee/system/auditlog) + ตั้งค่าบัญชี-การเงิน 13 แท็บ ตามไฟล์ 13 — เริ่มลงมือใน Phase 1.6"
    />
  )
}
