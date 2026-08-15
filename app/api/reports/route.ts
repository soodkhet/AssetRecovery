import { apiSuccess } from '@/lib/api/envelope'
import { withAuthErrors } from '@/lib/auth/require-permission'
import { requireSession } from '@/lib/auth/session'
import { canViewReport } from '@/lib/reports/access'
import { REPORT_CATEGORY_LABEL, REPORT_DEFINITIONS } from '@/lib/reports/catalog'
import { hasReportProvider } from '@/lib/reports/providers'

/**
 * `GET /api/reports` — ทะเบียนรายงานที่ **ผู้เรียกคนนี้** เปิดดูได้ (`96` §6/§10)
 *
 * ไม่ผูก capability ตัวเดียวโดยตั้งใจ: สิทธิ์ของเมนูรายงานเป็นราย **หมวด** (F/O/A/E) ตาม `96` §10
 * ⇒ ยามอยู่ที่ `canViewReport()` และรายการที่คืนถูกกรองแล้ว — ผู้ใช้ที่ไม่มีสิทธิ์หมวดไหน
 * ไม่เห็นแม้แต่ชื่อรายงานของหมวดนั้น (ไม่ leak ว่ามีรายงานอะไรอยู่)
 */
export const GET = withAuthErrors(async () => {
  const user = await requireSession()

  const reports = REPORT_DEFINITIONS.filter((report) => canViewReport(user, report)).map((report) => ({
    code: report.code,
    id: report.id,
    title: report.title,
    category: report.category,
    categoryLabel: REPORT_CATEGORY_LABEL[report.category],
    cacheMode: report.cacheMode,
    /** ยังไม่มีตัวคำนวณ = ยังเปิดใช้งานไม่ได้ (6.2–6.5 ทยอยเปิด) */
    available: hasReportProvider(report.id),
  }))

  return apiSuccess({ reports })
})
