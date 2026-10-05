import { PortalOverview } from '@/components/portal/portal-overview'
import { PORTAL_SECTIONS } from '@/lib/portal/access'
import { requirePortalViewAsPage } from '@/lib/portal/view-as-page'

/** `/portal/view-as/<companyId>` — ภาพรวมของบริษัทในโหมดดูแทน (มติ U59) · เหมือน `/portal` ของผู้จัดการบริษัท */
export default async function PortalViewAsOverviewPage({ params }: { params: Promise<{ companyId: string }> }) {
  const { company } = await requirePortalViewAsPage((await params).companyId)
  return <PortalOverview companyName={company.name} sections={PORTAL_SECTIONS} />
}
