import { apiSuccess } from '@/lib/api/envelope'
import { validationErrorResponse } from '@/lib/api/http'
import { withPortal } from '@/lib/portal/guard'
import { listPortalCases, portalCaseListQuerySchema } from '@/lib/portal/queries/cases'

/**
 * `GET /api/portal/cases` (`97` §6.1/§17) — เคสของบริษัทตัวเอง · query `status` (รหัสสถานะฝั่งบริษัท) /
 * `search` (เลขสัญญา/ชื่อลูกหนี้) / `page` / `limit` · แถวผ่าน serializer whitelist เท่านั้น
 */
export const GET = withPortal('cases', {}, async (request, _context, portal) => {
  const parsed = portalCaseListQuerySchema.safeParse(Object.fromEntries(request.nextUrl.searchParams))
  if (!parsed.success) return validationErrorResponse(parsed.error)
  return apiSuccess(await listPortalCases(portal, parsed.data))
})
