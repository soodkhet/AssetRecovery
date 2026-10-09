import type { Metadata } from 'next'
import { OrganizationProfileTab } from '@/components/settings/organization-profile-tab'
import { PageHeader } from '@/components/ui'
import { requireMenuPage } from '@/lib/nav/menu-guard'

export const metadata: Metadata = { title: 'ข้อมูลองค์กร' }

/**
 * ตั้งค่าทั่วไป → ข้อมูลองค์กร (มติ PO U99 · mockup `settings.html` แท็บ `organization`)
 * route guard เป็นชั้น UX — ข้อมูลจริงมาจาก `/api/settings/organization` ที่ตรวจ `requirePermission()` เอง
 */
export default async function SettingsOrganizationPage() {
  await requireMenuPage('settings.organization')
  return (
    <>
      {/* หัวหน้าเพจ h1 แบบเดียวกับหน้าตั้งค่าอื่น (เดิมมีแค่ h2 ในการ์ด — preship R2-031) */}
      <PageHeader
        title="ข้อมูลองค์กร (Organization Profile)"
        description="ข้อมูลนี้ใช้ออกใบกำกับภาษี / ใบเสร็จรับเงิน / ใบแจ้งหนี้ฝั่งผู้ขาย และพิมพ์เป็นหัวเอกสารของ PDF ทุกใบ"
      />
      <OrganizationProfileTab />
    </>
  )
}
