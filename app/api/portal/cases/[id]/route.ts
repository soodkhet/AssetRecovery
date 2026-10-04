import { apiSuccess } from '@/lib/api/envelope'
import { requirePortalRow, withPortal } from '@/lib/portal/guard'
import { findPortalCaseDetail } from '@/lib/portal/queries/cases'

type RouteContext = { params: Promise<{ id: string }> }

/**
 * `GET /api/portal/cases/:id` (`97` §6.1 + ค่าบริการ v4.1 §6.6 · §17) — id สุ่ม/ข้ามบริษัท → 403
 * `PERMISSION_DENIED` แบบเดียวกัน + audit `access_denied` (D3/D4)
 */
export const GET = withPortal<RouteContext>('cases', {}, async (request, context, portal) => {
  const { id } = await context.params
  const row = await findPortalCaseDetail(portal, id)
  const owned = await requirePortalRow(portal, row, { type: 'cases', id }, { request })
  if (owned.dto === null) throw new Error('portal case detail: owned row without dto')
  return apiSuccess(owned.dto)
})
