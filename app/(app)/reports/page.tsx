import { PageHeader } from '@/components/ui'
import { ReportCatalogList, type ReportCatalogItem } from '@/components/reports/report-catalog-list'
import { requireMenuPage } from '@/lib/nav/menu-guard'
import { requireSession } from '@/lib/auth/session'
import { canViewReport } from '@/lib/reports/access'
import { REPORT_CATEGORY_LABEL, REPORT_DEFINITIONS } from '@/lib/reports/catalog'
import { hasReportProvider } from '@/lib/reports/providers'

/**
 * รายงาน (ไฟล์ 96) — หน้ารวม 17 รายงาน 4 หมวด
 *
 * กรองด้วยสิทธิ์รายหมวด (`96` §10) ตั้งแต่ฝั่ง server ⇒ ไม่ส่งชื่อรายงานที่ไม่มีสิทธิ์ลงไปที่ browser
 * (ยามจริงยังอยู่ที่ API ทุก endpoint — หน้านี้เป็น UX ตาม DEC-002)
 */
export default async function ReportsPage() {
  await requireMenuPage('reports')
  const user = await requireSession()

  const reports: ReportCatalogItem[] = REPORT_DEFINITIONS.filter((report) => canViewReport(user, report)).map(
    (report) => ({
      code: report.code,
      id: report.id,
      title: report.title,
      category: report.category,
      categoryLabel: REPORT_CATEGORY_LABEL[report.category],
      cacheMode: report.cacheMode,
      available: hasReportProvider(report.id),
    }),
  )

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        title="รายงาน"
        description="ภาพรวมธุรกิจ 4 หมวด — การเงิน / งานติดตามทรัพย์ / บัญชี / ผู้บริหาร (อ่านอย่างเดียว)"
      />
      <ReportCatalogList reports={reports} />
    </div>
  )
}
