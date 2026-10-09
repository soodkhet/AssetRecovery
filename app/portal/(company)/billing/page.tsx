import type { Metadata } from 'next'
import { PortalBillingBatches } from '@/components/portal/billing-batches'
import { canAccess } from '@/lib/portal/access'
import { requirePortalPage } from '@/lib/portal/page-guard'

export const metadata: Metadata = { title: 'รอบวางบิล / ยอดค้างชำระ' }

/** `/portal/billing` — รอบวางบิล/ยอดค้างชำระ (`97` §6.2 · หมวด `portal_finance`) · อ่านอย่างเดียว */
export default async function PortalBillingPage() {
  const user = await requirePortalPage('finance')
  // ลิงก์ใบแจ้งหนี้ PDF แสดงเฉพาะผู้มี `portal_download` (ชั้น UX — API ตรวจซ้ำ · มติ U95)
  return <PortalBillingBatches canDownload={canAccess('finance', user.capabilities, { download: true })} />
}
