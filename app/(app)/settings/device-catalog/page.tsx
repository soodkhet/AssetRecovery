import type { Metadata } from 'next'
import { DeviceCatalogTab } from '@/components/settings/device-catalog-tab'
import { PageHeader } from '@/components/ui'
import { requireMenuPage } from '@/lib/nav/menu-guard'

export const metadata: Metadata = { title: 'Model Phone' }

/**
 * ตั้งค่าทั่วไป → Model Phone (มติ PO U155 → U159 · mockup `settings.html` แท็บ `modelphone`)
 * route guard เป็นชั้น UX — ข้อมูลจริงมาจาก `/api/settings/device-catalog/*` ที่ตรวจ `requirePermission()` เอง
 */
export default async function SettingsDeviceCatalogPage() {
  await requireMenuPage('settings.device-catalog')
  return (
    <>
      {/* หัวหน้าเพจแบบเดียวกับหน้าตั้งค่าอื่น (เดิมมีแค่ h2 ในการ์ด — preship PS-036) */}
      <PageHeader
        title="Model Phone"
        description="แคตตาล็อกแบรนด์/รุ่นสำหรับฟอร์มรับเคส — กรอก IMEI แล้วระบบเติมยี่ห้อ/รุ่นจากฐาน TAC"
      />
      <DeviceCatalogTab />
    </>
  )
}
