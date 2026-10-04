import type { NextRequest } from 'next/server'
import { toModuleErrorResponse } from '@/lib/api/http'
import { findReportByPath } from '@/lib/reports/catalog'
import { ReportError } from '@/lib/reports/errors'
import { GET as getReport } from '@/app/api/reports/[reportId]/route'

type AliasContext = { params: Promise<{ reportId: string }> }

/**
 * path ชื่อพ้องรายหมวดของ `96` §9 (`/api/reports/finance/advance-overdue` ฯลฯ) — ส่งต่อให้
 * `GET /api/reports/:reportId` ตัวเดียวกัน ⇒ ยามสิทธิ์/แคช/payload เป็นมาตรฐานเดียว
 *
 * เดิม catalog ประกาศ path เหล่านี้แต่ไม่มี route จริง ⇒ 404 (UAT BUG-115)
 */
export function categoryAliasGet(segment: string) {
  return async (request: NextRequest, context: AliasContext): Promise<Response> => {
    const { reportId: slug } = await context.params
    const report = findReportByPath(segment, slug)
    if (report === null) {
      return toModuleErrorResponse(new ReportError('REPORT_NOT_FOUND', { detail: `report=${segment}/${slug}` }))
    }
    return getReport(request, { params: Promise.resolve({ reportId: report.id }) })
  }
}
