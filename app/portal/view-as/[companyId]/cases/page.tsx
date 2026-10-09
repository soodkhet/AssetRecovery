import type { Metadata } from 'next'
import { Suspense } from 'react'
import { PortalCasesList } from '@/components/portal/cases-list'
import { Card, LoadingState } from '@/components/ui'
import { requirePortalViewAsPage } from '@/lib/portal/view-as-page'

export const metadata: Metadata = { title: 'เคสของเรา' }

/** `/portal/view-as/<companyId>/cases` — เคสของบริษัทในโหมดดูแทน (มติ U59) · เห็นรูปเหมือนผู้จัดการบริษัท */
export default async function PortalViewAsCasesPage({ params }: { params: Promise<{ companyId: string }> }) {
  await requirePortalViewAsPage((await params).companyId)
  return (
    <Suspense
      fallback={
        <Card padded={false}>
          <LoadingState />
        </Card>
      }
    >
      <PortalCasesList canViewPhotos />
    </Suspense>
  )
}
