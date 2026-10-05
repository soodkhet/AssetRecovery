import { Suspense } from 'react'
import { PortalHandover } from '@/components/portal/handover-page'
import { LoadingState } from '@/components/ui'
import { canAccess } from '@/lib/portal/access'
import { requirePortalPage } from '@/lib/portal/page-guard'

/**
 * `/portal/handover` — ใบส่งมอบทรัพย์ (`97` §6.4 · หมวด `portal_handover`) · อ่านอย่างเดียว
 * · ไม่มีสิทธิ์หมวด → `requirePortalPage()` เด้งกลับหน้าแรกพอร์ทัล
 * · สิทธิ์ดาวน์โหลด (`portal_download`) คำนวณที่ server ส่งเป็น prop — ใช้ซ่อนปุ่ม/รูปเท่านั้น (API ตรวจซ้ำ — DEC-002)
 */
export default async function PortalHandoverPage() {
  const user = await requirePortalPage('handover')
  const canDownload = canAccess('handover', user.capabilities, { download: true })
  return (
    // `useSearchParams()` ต้องอยู่ใต้ Suspense
    <Suspense fallback={<LoadingState />}>
      <PortalHandover canDownload={canDownload} />
    </Suspense>
  )
}
