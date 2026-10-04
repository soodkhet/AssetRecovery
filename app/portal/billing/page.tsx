import { PortalPlaceholder } from '@/components/portal/portal-placeholder'
import { requirePortalPage } from '@/lib/portal/page-guard'

/** `/portal/billing` — รอบวางบิล/ยอดค้างชำระ (`97` §6.2 · หมวด `portal_finance`) · placeholder จนกว่าก้อน Portal-P8–P10 จะมาแทน */
export default async function PortalBillingPage() {
  await requirePortalPage('finance')
  return <PortalPlaceholder title="รอบวางบิล / ยอดค้างชำระ" />
}
