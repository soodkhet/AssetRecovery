import type { NextRequest } from 'next/server'
import { apiSuccess } from '@/lib/api/envelope'
import { toModuleErrorResponse } from '@/lib/api/http'
import { withPortal } from '@/lib/portal/guard'
import { getPortalLotDetail } from '@/lib/portal/queries/handover'

type RouteContext = { params: Promise<{ id: string }> }

/**
 * `GET /api/portal/handover-lots/:id` (`97` §6.4 · §17 · มติ O43 D6) — รายละเอียดล็อต + รายการทรัพย์ (ไม่มี IMEI — O44)
 * · สิทธิ์ `portal_handover` · id สุ่ม/ของบริษัทอื่น → 403 `PERMISSION_DENIED` + audit `access_denied` (D3/D4)
 * ⚠️ namespace พอร์ทัล = GET เท่านั้น (`97` §11)
 */
export const GET = withPortal<RouteContext>('handover', {}, async (request: NextRequest, context, portal) => {
  const { id } = await context.params
  try {
    return apiSuccess(await getPortalLotDetail(portal, id, request))
  } catch (error) {
    return toModuleErrorResponse(error)
  }
})
