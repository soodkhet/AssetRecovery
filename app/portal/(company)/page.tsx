import type { Metadata } from 'next'
import { PortalOverview } from '@/components/portal/portal-overview'
import { visiblePortalSections } from '@/lib/portal/access'
import { requirePortalPage } from '@/lib/portal/page-guard'
import { findPortalCompanyName } from '@/lib/portal/queries/profile'

export const metadata: Metadata = { title: 'ภาพรวม' }

/** `/portal` — ภาพรวม (`97` §5 KPI + §6.5 แนวโน้ม 6 เดือน/อายุหนี้) · หน้าแรกของผู้ใช้บริษัทหลัง login */
export default async function PortalOverviewPage() {
  // ผู้ใช้ภายใน/Superadmin เด้งไปแดชบอร์ด · บริษัทถูกระงับเด้งไปหน้า login (มติ O43 D2/D5/D11)
  const user = await requirePortalPage()
  const companyName = (await findPortalCompanyName(user.organizationId, user.companyId)) ?? '—'
  return <PortalOverview companyName={companyName} sections={visiblePortalSections(user)} />
}
