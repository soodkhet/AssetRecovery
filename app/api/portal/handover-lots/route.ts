import type { NextRequest } from 'next/server'
import { apiSuccess } from '@/lib/api/envelope'
import { toModuleErrorResponse, validationErrorResponse } from '@/lib/api/http'
import { withPortal } from '@/lib/portal/guard'
import { listPortalLots, portalLotListQuerySchema } from '@/lib/portal/queries/handover'

/**
 * `GET /api/portal/handover-lots` (`97` §6.4 · §17) — ล็อตส่งมอบของบริษัทผู้เรียก
 * · สิทธิ์ `portal_handover` · กรอง `?status=` (รหัสสถานะของพอร์ทัล คั่นจุลภาค) `?dateFrom=&dateTo=` (YYYY-MM-DD)
 *   `?search=` (เลขล็อต/เลขใบส่งมอบ) · แบ่งหน้า `?page=&limit=`
 * ⚠️ namespace พอร์ทัล = GET เท่านั้น (`97` §11) — ห้าม export method อื่นจากไฟล์นี้ (ESLint + test บังคับ)
 */
export const GET = withPortal('handover', {}, async (request: NextRequest, _context, portal) => {
  const parsed = portalLotListQuerySchema.safeParse(Object.fromEntries(request.nextUrl.searchParams))
  if (!parsed.success) return validationErrorResponse(parsed.error)
  try {
    return apiSuccess(await listPortalLots(portal, parsed.data))
  } catch (error) {
    return toModuleErrorResponse(error)
  }
})
