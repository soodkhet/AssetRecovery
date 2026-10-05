import type { NextRequest } from 'next/server'
import { readJsonBody, toModuleErrorResponse, validationErrorResponse, withApiPermission } from '@/lib/api/http'
import { getRequestMeta } from '@/lib/auth/request-meta'
import { deleteHoliday, getHoliday } from '@/lib/settings/queries/holidays'
import { holidayDeleteSchema } from '@/lib/settings/schemas'

type RouteContext = { params: Promise<{ id: string }> }

/**
 * `DELETE /api/settings/holidays/:id` (มติ PO 06/10/2569 UAT U93 · `13` §6.15) — soft delete + เหตุผล
 * ลบแล้วกำหนดยื่น ภ.ง.ด. ของรอบที่ยังไม่ยื่นกลับไปคิดใหม่ (วันที่เคยเลื่อนเพราะวันหยุดนี้กลับเป็นวันเดิม)
 */
export const DELETE = withApiPermission<RouteContext>(
  'manage',
  'manage_holidays',
  toModuleErrorResponse,
  async (request: NextRequest, context, user) => {
    const { id } = await context.params
    const parsed = holidayDeleteSchema.safeParse(await readJsonBody(request))
    if (!parsed.success) return validationErrorResponse(parsed.error)

    const current = await getHoliday(user.organizationId, id)
    const result = await deleteHoliday({ actor: user, meta: getRequestMeta(request), reason: parsed.data.reason }, current)
    return Response.json({ data: result })
  },
)
