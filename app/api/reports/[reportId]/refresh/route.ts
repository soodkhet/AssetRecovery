import { apiSuccess } from '@/lib/api/envelope'
import { toModuleErrorResponse } from '@/lib/api/http'
import { requireSession } from '@/lib/auth/session'
import { assertReportAccess } from '@/lib/reports/access'
import { requestReportRefresh } from '@/lib/reports/cache'
import { findReport } from '@/lib/reports/catalog'
import { ReportError } from '@/lib/reports/errors'
import { reportCacheKeyPrefix } from '@/lib/reports/run'

type RouteContext = { params: Promise<{ reportId: string }> }

/**
 * `POST /api/reports/:reportId/refresh` — ปุ่ม "รีเฟรชตอนนี้" (`96` §8/§12)
 *
 * ล้างแคชของรายงานนี้ **เฉพาะองค์กรผู้เรียก** (prefix ขึ้นต้นด้วย `organization_id`) แล้วให้คำขอ
 * GET ครั้งถัดไปคำนวณสด · ติด cooldown 5 นาทีต่อรายงาน (E14) — ยังอยู่ใน cooldown ตอบ 200
 * พร้อม `allowed: false` + เวลาที่กดได้อีกครั้ง (ไม่ใช่ error: ผู้ใช้ยังได้ข้อมูลที่แคชไว้ตามปกติ)
 *
 * **ไม่มี audit** โดยตั้งใจ — เป็นการอ่านอย่างเดียว (`21` §13) ไม่มีข้อมูลใดถูกสร้าง/แก้/ลบ
 * (ค่าที่คำนวณใหม่เท่ากับค่าเดิมเสมอถ้าข้อมูลต้นทางไม่เปลี่ยน)
 */
export const POST = async (_request: Request, context: RouteContext): Promise<Response> => {
  try {
    const user = await requireSession()
    const { reportId } = await context.params
    const report = findReport(reportId)
    if (report === null) throw new ReportError('REPORT_NOT_FOUND', { detail: `report=${reportId}` })
    assertReportAccess(user, report)

    const outcome = requestReportRefresh(reportCacheKeyPrefix(user, report), new Date())
    return apiSuccess({
      reportId: report.id,
      allowed: outcome.allowed,
      invalidated: outcome.invalidated,
      availableAt: outcome.availableAt.toISOString(),
    })
  } catch (error) {
    return toModuleErrorResponse(error)
  }
}
