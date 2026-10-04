import { PortalBillingBatches } from '@/components/portal/billing-batches'
import { requirePortalPage } from '@/lib/portal/page-guard'

/** `/portal/billing` — รอบวางบิล/ยอดค้างชำระ (`97` §6.2 · หมวด `portal_finance`) · อ่านอย่างเดียว */
export default async function PortalBillingPage() {
  await requirePortalPage('finance')
  return <PortalBillingBatches />
}
