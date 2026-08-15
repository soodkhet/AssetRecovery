import type { NextRequest } from 'next/server'
import { apiSuccess } from '@/lib/api/envelope'
import { toModuleErrorResponse, validationErrorResponse, withApiPermission } from '@/lib/api/http'
import { getDashboardKpi, REPORT_READ_CAPABILITIES } from '@/lib/reports/queries'
import { dashboardKpiQuerySchema } from '@/lib/reports/schemas'

/**
 * `GET /api/finance/dashboard-kpi` (`14` §14 · `27` §6.9) — KPI 4 ตัวของหน้าแรกโมดูลการเงิน
 *
 * read-only (`14` §10/§13 — ไม่มี audit) · สิทธิ์ = การเงิน/บัญชี/ผู้บริหาร (`25` §7.6)
 */
export const GET = withApiPermission(
  'view',
  REPORT_READ_CAPABILITIES,
  toModuleErrorResponse,
  async (request: NextRequest, _context: unknown, user) => {
    const parsed = dashboardKpiQuerySchema.safeParse(Object.fromEntries(new URL(request.url).searchParams))
    if (!parsed.success) return validationErrorResponse(parsed.error)
    return apiSuccess(await getDashboardKpi(user, parsed.data))
  },
)
