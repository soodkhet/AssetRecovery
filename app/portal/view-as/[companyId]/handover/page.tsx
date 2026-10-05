import { Suspense } from 'react'
import { PortalHandover } from '@/components/portal/handover-page'
import { LoadingState } from '@/components/ui'
import { requirePortalViewAsPage } from '@/lib/portal/view-as-page'

/** `/portal/view-as/<companyId>/handover` — ใบส่งมอบของบริษัทในโหมดดูแทน (มติ U59) · ดาวน์โหลดได้ (ลง audit) */
export default async function PortalViewAsHandoverPage({ params }: { params: Promise<{ companyId: string }> }) {
  await requirePortalViewAsPage((await params).companyId)
  return (
    <Suspense fallback={<LoadingState />}>
      <PortalHandover canDownload />
    </Suspense>
  )
}
