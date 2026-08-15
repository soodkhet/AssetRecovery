import type { NextRequest } from 'next/server'
import { apiSuccess } from '@/lib/api/envelope'
import { toModuleErrorResponse, validationErrorResponse } from '@/lib/api/http'
import { getRequestMeta } from '@/lib/auth/request-meta'
import { requireSession } from '@/lib/auth/session'
import { attachmentHeader } from '@/lib/format/attachment'
import { findReport } from '@/lib/reports/catalog'
import { ReportError } from '@/lib/reports/errors'
import { REPORT_EXPORT_SYNC_ROW_LIMIT } from '@/lib/reports/export'
import { exportReport } from '@/lib/reports/export-service'
import { resolveReportRange } from '@/lib/reports/range'
import { reportExportBodySchema } from '@/lib/reports/schemas'

type RouteContext = { params: Promise<{ reportId: string }> }

/** ทั้ง SheetJS และ `@react-pdf/renderer` ต้องรันฝั่ง Node (ฟอนต์ไทยอ่านจากดิสก์) */
export const runtime = 'nodejs'

/**
 * `POST /api/reports/:reportId/export` (`96` §11 · E13)
 *
 * - ≤ 5,000 แถว → ส่งไฟล์กลับในคำขอเดียว (`content-disposition: attachment`)
 * - เกินกว่านั้น → ตั้งงาน `report_export` แล้วตอบ **202** พร้อม `jobId` ให้ไปดูที่หน้างานเบื้องหลัง
 *
 * ไฟล์ที่ได้มาจาก payload ชุดเดียวกับที่หน้าจอแสดง (`96` §13) — ไม่มีการ query ซ้ำในเส้นทาง export
 */
export const POST = async (request: NextRequest, context: RouteContext): Promise<Response> => {
  try {
    const user = await requireSession()
    const { reportId } = await context.params
    const report = findReport(reportId)
    if (report === null) throw new ReportError('REPORT_NOT_FOUND', { detail: `report=${reportId}` })

    const body: unknown = await request.json().catch(() => ({}))
    const parsed = reportExportBodySchema.safeParse(body)
    if (!parsed.success) return validationErrorResponse(parsed.error)

    const { preset, from, to, format, params } = parsed.data
    const range = resolveReportRange(
      { preset, ...(from === undefined ? {} : { from }), ...(to === undefined ? {} : { to }) },
      new Date(),
    )

    const outcome = await exportReport(
      { actor: user, meta: getRequestMeta(request) },
      report,
      { range, format, ...(params === undefined ? {} : { params }) },
    )

    if (outcome.mode === 'job') {
      return apiSuccess(
        {
          mode: 'job' as const,
          jobId: outcome.jobId,
          duplicate: outcome.duplicate,
          rowCount: outcome.rowCount,
          rowLimit: REPORT_EXPORT_SYNC_ROW_LIMIT,
        },
        { status: 202 },
      )
    }

    return new Response(new Uint8Array(outcome.file.bytes), {
      headers: {
        'content-type': outcome.file.contentType,
        'content-disposition': attachmentHeader(outcome.file.fileName),
        'cache-control': 'no-store',
      },
    })
  } catch (error) {
    return toModuleErrorResponse(error)
  }
}
