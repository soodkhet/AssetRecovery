import { DeviceCatalogTab } from '@/components/settings/device-catalog-tab'
import { requireMenuPage } from '@/lib/nav/menu-guard'

/**
 * ตั้งค่าทั่วไป → Model Phone (มติ PO U155 → U159 · mockup `settings.html` แท็บ `modelphone`)
 * route guard เป็นชั้น UX — ข้อมูลจริงมาจาก `/api/settings/device-catalog/*` ที่ตรวจ `requirePermission()` เอง
 */
export default async function SettingsDeviceCatalogPage() {
  await requireMenuPage('settings.device-catalog')
  return <DeviceCatalogTab />
}
