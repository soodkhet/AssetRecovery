import type { NextRequest } from 'next/server'
import { APPROVE_ADJUSTMENT, APPROVE_ADJUSTMENT_LOCKED } from '@/lib/adjustments/adjustment'
import { approveAdjustment } from '@/lib/adjustments/queries'
import { adjustmentApproveSchema } from '@/lib/adjustments/schemas'
import { apiSuccess } from '@/lib/api/envelope'
import { readJsonBody, toModuleErrorResponse, validationErrorResponse, withApiPermission } from '@/lib/api/http'
import { getRequestMeta } from '@/lib/auth/request-meta'

type RouteContext = { params: Promise<{ id: string }> }

/**
 * `PATCH /api/adjustments/:id/approve` (`20` §14)
 *
 * ⚠️ **สิทธิ์ 2 ชั้น**: ชั้นแรกที่นี่ปล่อยผู้ที่อนุมัติได้ระดับใดระดับหนึ่งเข้ามา ชั้นที่สองใน
 *    service ตรวจ capability **ของระดับที่ snapshot ไว้จริง** (`approve_adjustment_locked`
 *    สำหรับรอบ `locked`) แล้วนับบทบาทที่อนุมัติครบหรือยังด้วย `assertApprovalLevelSufficient()`
 */
export const PATCH = withApiPermission<RouteContext>(
  'manage',
  [APPROVE_ADJUSTMENT, APPROVE_ADJUSTMENT_LOCKED],
  toModuleErrorResponse,
  async (request: NextRequest, context, user) => {
    const { id } = await context.params
    const parsed = adjustmentApproveSchema.safeParse((await readJsonBody(request)) ?? {})
    if (!parsed.success) return validationErrorResponse(parsed.error)

    return apiSuccess(await approveAdjustment({ actor: user, meta: getRequestMeta(request) }, id, parsed.data))
  },
)
