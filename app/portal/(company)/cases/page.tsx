import type { Metadata } from 'next'
import { Suspense } from 'react'
import { PortalCasesList } from '@/components/portal/cases-list'
import { Card, LoadingState } from '@/components/ui'
import { canAccess } from '@/lib/portal/access'
import { requirePortalPage } from '@/lib/portal/page-guard'

export const metadata: Metadata = { title: 'เคสของเรา' }

/**
 * `/portal/cases` — เคสของบริษัท (`97` §6.1 · หมวด `portal_cases`) · อ่านอย่างเดียว
 *
 * `canViewPhotos` = หมวดเคส + `portal_download` (มติ O46) — เป็น UX เท่านั้น (ไม่มีสิทธิ์ = ไม่ยิง request รูป)
 * route รูปตรวจสิทธิ์เองทุกครั้ง (DEC-002)
 */
export default async function PortalCasesPage() {
  const user = await requirePortalPage('cases')
  const canViewPhotos = canAccess('cases', user.capabilities, { download: true })
  return (
    // `useSearchParams()` ของรายการต้องอยู่ใต้ Suspense
    <Suspense
      fallback={
        <Card padded={false}>
          <LoadingState />
        </Card>
      }
    >
      <PortalCasesList canViewPhotos={canViewPhotos} />
    </Suspense>
  )
}
