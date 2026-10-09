import type { Metadata } from 'next'
import { PortalCompanyProfile } from '@/components/portal/portal-company-profile'
import { requirePortalPage } from '@/lib/portal/page-guard'

export const metadata: Metadata = { title: 'ข้อมูลบริษัท' }

/** `/portal/company` — ข้อมูลบริษัท ดูอย่างเดียว (`97` §6.6 · หมวด `portal_profile`) */
export default async function PortalCompanyPage() {
  await requirePortalPage('profile')
  return <PortalCompanyProfile />
}
