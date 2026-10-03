import type { NextRequest } from 'next/server'
import { apiSuccess } from '@/lib/api/envelope'
import {
  bodyStringField,
  readJsonBody,
  toModuleErrorResponse,
  validationErrorResponse,
  withApiPermission,
} from '@/lib/api/http'
import { assertAdvanceRejectionReason } from '@/lib/advances/advance'
import { APPROVE_ADVANCE, rejectAdvance } from '@/lib/advances/queries'
import { advanceRejectSchema } from '@/lib/advances/schemas'
import { getRequestMeta } from '@/lib/auth/request-meta'

type RouteContext = { params: Promise<{ id: string }> }

/**
 * `PATCH /api/advances/:id/reject` (`15` §14) — ต้องมี `rejection_reason` เสมอ
 * (`24` §6.4 `REJECTION_REASON_REQUIRED` · Rule 04) · terminal ไม่มีทางกลับ
 */
export const PATCH = withApiPermission<RouteContext>(
  'manage',
  APPROVE_ADVANCE,
  toModuleErrorResponse,
  async (request: NextRequest, context, user) => {
    const { id } = await context.params
    const body = await readJsonBody(request)
    const parsed = advanceRejectSchema.safeParse(body)
    if (!parsed.success) {
      // ไม่มี/สั้นเกิน ⇒ `REJECTION_REASON_REQUIRED` (`15` §11 · `24`) ไม่ใช่ `REQUIRED_MISSING` (UAT R6-D)
      assertAdvanceRejectionReason(bodyStringField(body, 'rejectionReason'))
      return validationErrorResponse(parsed.error)
    }

    return apiSuccess(await rejectAdvance({ actor: user, meta: getRequestMeta(request) }, id, parsed.data))
  },
)
