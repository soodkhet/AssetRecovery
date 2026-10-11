import type { NextRequest } from 'next/server'
import { apiSuccess } from '@/lib/api/envelope'
import { readJsonBody, toModuleErrorResponse, validationErrorResponse, withApiPermission } from '@/lib/api/http'
import { APPROVE_ADVANCE, approveAdvance } from '@/lib/advances/queries'
import { advanceApproveSchema } from '@/lib/advances/schemas'
import { getRequestMeta } from '@/lib/auth/request-meta'

type RouteContext = { params: Promise<{ id: string }> }

/**
 * `PATCH /api/advances/:id/approve` (`15` §14 · `23` §6.4)
 * อนุมัติ = ยืนยันยอด (เงินโอนในรอบจ่ายถัดไป — มติ PO U83) ⇒ `approved` รวมความหมาย "รอจ่าย/รอเคลียร์ยอด" ในตัว (`15` §17)
 */
export const PATCH = withApiPermission<RouteContext>(
  'manage',
  APPROVE_ADVANCE,
  toModuleErrorResponse,
  async (request: NextRequest, context, user) => {
    const { id } = await context.params
    const parsed = advanceApproveSchema.safeParse((await readJsonBody(request)) ?? {})
    if (!parsed.success) return validationErrorResponse(parsed.error)

    return apiSuccess(await approveAdvance({ actor: user, meta: getRequestMeta(request) }, id, parsed.data))
  },
)
