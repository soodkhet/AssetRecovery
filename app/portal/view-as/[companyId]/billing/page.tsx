import type { Metadata } from 'next'
import { PortalBillingBatches } from '@/components/portal/billing-batches'
import { requirePortalViewAsPage } from '@/lib/portal/view-as-page'

export const metadata: Metadata = { title: 'รอบวางบิล / ยอดค้างชำระ' }

/** `/portal/view-as/<companyId>/billing` — รอบวางบิลของบริษัทในโหมดดูแทน (มติ U59) */
export default async function PortalViewAsBillingPage({ params }: { params: Promise<{ companyId: string }> }) {
  await requirePortalViewAsPage((await params).companyId)
  return <PortalBillingBatches canDownload />
}
