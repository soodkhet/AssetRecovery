import type { NextRequest } from 'next/server'
import { apiSuccess } from '@/lib/api/envelope'
import { toModuleErrorResponse, validationErrorResponse } from '@/lib/api/http'
import { requireSession } from '@/lib/auth/session'
import { findReport } from '@/lib/reports/catalog'
import { ReportError } from '@/lib/reports/errors'
import { resolveReportRange } from '@/lib/reports/range'
import { reportRangeQuerySchema } from '@/lib/reports/schemas'
import { runReport } from '@/lib/reports/run'

type RouteContext = { params: Promise<{ reportId: string }> }

/**
 * `GET /api/reports/:reportId` (`96` §9) — ผลลัพธ์ของรายงานหนึ่งตัว
 *
 * เป็นทางเข้าเดียวของทุกรายงานในเมนู (`96` §6) — path เฉพาะรายหมวดใน §9 เป็นชื่อพ้องของ
 * `:reportId` ตัวเดียวกัน ⇒ ยาม/แคช/รูปแบบ payload ไม่มีทางแตกเป็นคนละมาตรฐานรายรายงาน
 *
 * สิทธิ์: ราย **หมวด** ตาม `96` §10 (`assertReportAccess()` ใน `runReport()`) —
 * การเงินเรียกหมวด E ได้ 403 เสมอ (`96` §14)
 */
export const GET = async (request: NextRequest, context: RouteContext): Promise<Response> => {
  try {
    const user = await requireSession()
    const { reportId } = await context.params
    const report = findReport(reportId)
    if (report === null) throw new ReportError('REPORT_NOT_FOUND', { detail: `report=${reportId}` })

    const parsed = reportRangeQuerySchema.safeParse(Object.fromEntries(new URL(request.url).searchParams))
    if (!parsed.success) return validationErrorResponse(parsed.error)

    const { preset, from, to, refresh } = parsed.data
    const range = resolveReportRange(
      { preset, ...(from === undefined ? {} : { from }), ...(to === undefined ? {} : { to }) },
      new Date(),
    )

    // พารามิเตอร์เฉพาะรายงาน (เช่น `dimension`) ส่งต่อให้ provider — ตัวที่เป็นของ framework ถูกตัดออก
    const params = Object.fromEntries(
      [...new URL(request.url).searchParams.entries()].filter(
        ([key]) => !['preset', 'from', 'to', 'refresh'].includes(key),
      ),
    )

    return apiSuccess(await runReport(user, report, { range, refresh, params }))
  } catch (error) {
    return toModuleErrorResponse(error)
  }
}
