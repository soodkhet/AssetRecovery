import { apiSuccess } from '@/lib/api/envelope'
import { validationErrorResponse } from '@/lib/api/http'
import { portalRevenueSummaryQuerySchema } from '@/lib/portal/finance-schemas'
import { withPortal } from '@/lib/portal/guard'
import { getPortalRevenueSummary } from '@/lib/portal/queries/finance'

/**
 * `GET /api/portal/reports/revenue-summary?months=6` — สรุปยอดเรียกเก็บรายเดือนของบริษัทตัวเอง
 * (`97` §6.5/§17 · มติ O43 D9) · คำนวณสดทุกครั้ง · นับเฉพาะรายได้ในรอบวางบิล `sent` ขึ้นไป
 */
export const GET = withPortal('finance', {}, async (request, _context, portal) => {
  const months = new URL(request.url).searchParams.get('months')
  const parsed = portalRevenueSummaryQuerySchema.safeParse(months === null || months === '' ? {} : { months })
  if (!parsed.success) return validationErrorResponse(parsed.error)
  return apiSuccess(await getPortalRevenueSummary(portal, { months: parsed.data.months }))
})
