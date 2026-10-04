import { PortalPlaceholder } from '@/components/portal/portal-placeholder'
import { requirePortalPage } from '@/lib/portal/page-guard'

/** `/portal/handover` — ใบส่งมอบทรัพย์ (`97` §6.4 · หมวด `portal_handover`) · placeholder จนกว่าก้อน Portal-P8–P10 จะมาแทน */
export default async function PortalHandoverPage() {
  await requirePortalPage('handover')
  return <PortalPlaceholder title="ใบส่งมอบทรัพย์" />
}
