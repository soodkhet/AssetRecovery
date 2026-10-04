import { PortalPlaceholder } from '@/components/portal/portal-placeholder'
import { requirePortalPage } from '@/lib/portal/page-guard'

/** `/portal/cases` — เคสของบริษัท (`97` §6.1 · หมวด `portal_cases`) · placeholder จนกว่าก้อน Portal-P8–P10 จะมาแทน */
export default async function PortalCasesPage() {
  await requirePortalPage('cases')
  return <PortalPlaceholder title="เคสของเรา" />
}
