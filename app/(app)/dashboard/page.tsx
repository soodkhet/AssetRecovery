import type { Metadata } from 'next'
import { MainDashboard } from '@/components/dashboard/main-dashboard'
import { InlineAlert } from '@/components/ui'
import { PageHeader } from '@/components/ui/card'
import { menuDeniedMessage } from '@/lib/nav/denied-notice'
import { requireInternalSessionPage } from '@/lib/auth/page-guard'

export const metadata: Metadata = { title: 'แดชบอร์ด' }

/**
 * แดชบอร์ดหลัก — เมนูแรกของ Top Nav (Phase 6.6 · มติ PO 2026-08-16: ตาม mockup `dashboard.html`
 * ปรับเข้าข้อมูล/ฟีเจอร์ที่มีจริง — จุดเบี่ยงบันทึกไว้ที่ `docs/PROGRESS_ARCHIVE.md`)
 *
 * ทางเข้าหลัง login ไม่เปลี่ยน (`resolveLandingPath()`): บริษัทไฟแนนซ์ → พอร์ทัล · พนักงานภาคสนาม → Field Tracker
 * · role อื่นมาที่หน้านี้ — widget ทุกตัวกรองตามสิทธิ์ที่ `GET /api/dashboard` + endpoint ต้นทางของมันเอง (DEC-002)
 */
export default async function DashboardPage({ searchParams }: { searchParams: Promise<{ denied?: string | string[] }> }) {
  const user = await requireInternalSessionPage()
  // staging E-072 — เด้งมาจากเมนูที่ไม่มีสิทธิ์ ⇒ บอกเหตุผล (เดิมเด้งเงียบ)
  const deniedMessage = menuDeniedMessage((await searchParams).denied)

  return (
    <>
      <PageHeader title="แดชบอร์ด" description={`สวัสดี ${user.fullName} — งานที่รอคุณและภาพรวมประจำวัน`} />
      {deniedMessage !== null && (
        <div className="mb-4">
          <InlineAlert tone="warning" title="ไม่มีสิทธิ์เปิดเมนูนี้">
            {deniedMessage}
          </InlineAlert>
        </div>
      )}
      <MainDashboard />
    </>
  )
}
