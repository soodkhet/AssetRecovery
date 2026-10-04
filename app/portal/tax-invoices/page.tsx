import { PortalPlaceholder } from '@/components/portal/portal-placeholder'
import { requirePortalPage } from '@/lib/portal/page-guard'

/** `/portal/tax-invoices` — ใบกำกับภาษี (`97` §6.3 · หมวด `portal_finance`) · placeholder จนกว่าก้อน Portal-P8–P10 จะมาแทน */
export default async function PortalTaxInvoicesPage() {
  await requirePortalPage('finance')
  return <PortalPlaceholder title="ใบกำกับภาษี" />
}
