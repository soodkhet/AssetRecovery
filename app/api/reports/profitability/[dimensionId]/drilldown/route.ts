import type { NextRequest } from 'next/server'
import { apiSuccess } from '@/lib/api/envelope'
import { toModuleErrorResponse, validationErrorResponse, withApiPermission } from '@/lib/api/http'
import { getProfitabilityDrilldown, REPORT_READ_CAPABILITIES } from '@/lib/reports/queries'
import { profitabilityDrilldownQuerySchema } from '@/lib/reports/schemas'

type RouteContext = { params: Promise<{ dimensionId: string }> }

/**
 * `GET /api/reports/profitability/:dimension_id/drilldown` (`21` §14 · `27` §6.9)
 *
 * รายละเอียดต้นทุนของมิติเดียว — ใช้ชุดข้อมูล (แคช) เดียวกับตารางสรุป ⇒ ยอดตรงกันเสมอ (`21` §15)
 */
export const GET = withApiPermission<RouteContext>(
  'view',
  REPORT_READ_CAPABILITIES,
  toModuleErrorResponse,
  async (request: NextRequest, context, user) => {
    const { dimensionId } = await context.params
    const parsed = profitabilityDrilldownQuerySchema.safeParse(
      Object.fromEntries(new URL(request.url).searchParams),
    )
    if (!parsed.success) return validationErrorResponse(parsed.error)
    return apiSuccess(await getProfitabilityDrilldown(user, dimensionId, parsed.data))
  },
)
