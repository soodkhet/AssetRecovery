import type { NextRequest } from 'next/server'
import { APPROVE_ADJUSTMENT, APPROVE_ADJUSTMENT_LOCKED } from '@/lib/adjustments/adjustment'
import { rejectAdjustment } from '@/lib/adjustments/queries'
import { adjustmentRejectSchema } from '@/lib/adjustments/schemas'
import { apiSuccess } from '@/lib/api/envelope'
import { readJsonBody, toModuleErrorResponse, validationErrorResponse, withApiPermission } from '@/lib/api/http'
import { getRequestMeta } from '@/lib/auth/request-meta'

type RouteContext = { params: Promise<{ id: string }> }

/**
 * `PATCH /api/adjustments/:id/reject` (`20` §14 v2.1) — terminal ตาม `23` §6.9
 *
 * ระดับสิทธิ์เดียวกับ approve · `rejection_reason` บังคับ (`REJECTION_REASON_REQUIRED`)
 */
export const PATCH = withApiPermission<RouteContext>(
  'manage',
  [APPROVE_ADJUSTMENT, APPROVE_ADJUSTMENT_LOCKED],
  toModuleErrorResponse,
  async (request: NextRequest, context, user) => {
    const { id } = await context.params
    const parsed = adjustmentRejectSchema.safeParse(await readJsonBody(request))
    if (!parsed.success) return validationErrorResponse(parsed.error)

    return apiSuccess(await rejectAdjustment({ actor: user, meta: getRequestMeta(request) }, id, parsed.data))
  },
)
