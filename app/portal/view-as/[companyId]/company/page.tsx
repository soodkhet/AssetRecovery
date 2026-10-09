import type { Metadata } from 'next'
import { PortalCompanyProfile } from '@/components/portal/portal-company-profile'
import { requirePortalViewAsPage } from '@/lib/portal/view-as-page'

export const metadata: Metadata = { title: 'ข้อมูลบริษัท' }

/** `/portal/view-as/<companyId>/company` — ข้อมูลบริษัทในโหมดดูแทน (มติ U59) */
export default async function PortalViewAsCompanyPage({ params }: { params: Promise<{ companyId: string }> }) {
  await requirePortalViewAsPage((await params).companyId)
  return <PortalCompanyProfile />
}
