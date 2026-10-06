import { MainDashboard } from '@/components/dashboard/main-dashboard'
import { PageHeader } from '@/components/ui/card'
import { requireInternalSessionPage } from '@/lib/auth/page-guard'

/**
 * แดชบอร์ดหลัก — เมนูแรกของ Top Nav (Phase 6.6 · มติ PO 2026-08-16: ตาม mockup `dashboard.html`
 * ปรับเข้าข้อมูล/ฟีเจอร์ที่มีจริง — จุดเบี่ยงบันทึกไว้ที่ `docs/PROGRESS_ARCHIVE.md`)
 *
 * ทางเข้าหลัง login ไม่เปลี่ยน (`resolveLandingPath()`): บริษัทไฟแนนซ์ → พอร์ทัล · พนักงานภาคสนาม → Field Tracker
 * · role อื่นมาที่หน้านี้ — widget ทุกตัวกรองตามสิทธิ์ที่ `GET /api/dashboard` + endpoint ต้นทางของมันเอง (DEC-002)
 */
export default async function DashboardPage() {
  const user = await requireInternalSessionPage()

  return (
    <>
      <PageHeader title="แดชบอร์ด" description={`สวัสดี ${user.fullName} — งานที่รอคุณและภาพรวมประจำวัน`} />
      <MainDashboard />
    </>
  )
}
