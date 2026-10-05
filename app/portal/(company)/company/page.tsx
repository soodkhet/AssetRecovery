import { PortalCompanyProfile } from '@/components/portal/portal-company-profile'
import { requirePortalPage } from '@/lib/portal/page-guard'

/** `/portal/company` — ข้อมูลบริษัท ดูอย่างเดียว (`97` §6.6 · หมวด `portal_profile`) */
export default async function PortalCompanyPage() {
  await requirePortalPage('profile')
  return <PortalCompanyProfile />
}
