import { notFound } from 'next/navigation'
import { Card, EmptyState, PageHeader } from '@/components/ui'
import { ReportScreen } from '@/components/reports/report-screen'
import { requireMenuPage } from '@/lib/nav/menu-guard'
import { requireSession } from '@/lib/auth/session'
import { assertReportAccess } from '@/lib/reports/access'
import { findReport } from '@/lib/reports/catalog'
import { hasReportProvider } from '@/lib/reports/providers'

type PageProps = { params: Promise<{ reportId: string }> }

/**
 * หน้ารายงานหนึ่งตัว (ไฟล์ 96) — ใช้โครงกลาง `<ReportView>` ทั้งหมด
 *
 * 6.2–6.5 ที่ต้องการตัวกรอง/กราฟเฉพาะรายงาน ให้ลงทะเบียนหน้าจอของตัวเองที่ `<ReportScreen>`
 * (ซึ่งห่อ `<ReportView>` อีกที ส่ง `filters`/`chart`) — ห้ามสร้างตาราง/ปุ่มส่งออกชุดใหม่
 */
export default async function ReportPage({ params }: PageProps) {
  await requireMenuPage('reports')
  const user = await requireSession()

  const { reportId } = await params
  const report = findReport(reportId)
  if (report === null) notFound()

  // สิทธิ์รายหมวด (`96` §10) — ไม่มีสิทธิ์ต้องไม่เห็นแม้แต่หัวเรื่องของรายงาน
  assertReportAccess(user, report)

  if (!hasReportProvider(report.id)) {
    return (
      <div className="flex flex-col gap-5">
        <PageHeader title={`${report.code} — ${report.title}`} description="ยังไม่เปิดใช้งาน" />
        <Card>
          <EmptyState
            title="รายงานนี้ยังไม่เปิดใช้งาน"
            description="โครงระบบรายงาน (ช่วงเวลา / แคช / สิทธิ์ / ส่งออก) พร้อมแล้ว — ตัวคำนวณของรายงานนี้จะเปิดในเฟสถัดไป"
          />
        </Card>
      </div>
    )
  }

  return <ReportScreen report={{ id: report.id, code: report.code, title: report.title }} />
}
