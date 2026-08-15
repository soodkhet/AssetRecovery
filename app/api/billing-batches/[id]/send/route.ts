import type { NextRequest } from 'next/server'
import { apiSuccess } from '@/lib/api/envelope'
import { readJsonBody, toModuleErrorResponse, validationErrorResponse, withApiPermission } from '@/lib/api/http'
import { getRequestMeta } from '@/lib/auth/request-meta'
import { MANAGE_BILLING, sendBillingBatch } from '@/lib/revenue/queries'
import { billingBatchSendSchema } from '@/lib/revenue/schemas'

type RouteContext = { params: Promise<{ id: string }> }

/**
 * `PATCH /api/billing-batches/:id/send` (`19` §14 · `23` §6.8 `draft → sent`)
 *
 * หลังส่งแล้วยอดในรอบแก้ตรงไม่ได้อีก (`EDIT_BILLED_REVENUE`) ⇒ เป็นจุดตัดที่ต้องมี `reason`
 * และกดซ้ำต้องไม่ทับ `sent_at` เดิม (`BILLING_BATCH_INVALID_STATUS`)
 */
export const PATCH = withApiPermission<RouteContext>(
  'manage',
  MANAGE_BILLING,
  toModuleErrorResponse,
  async (request: NextRequest, context, user) => {
    const { id } = await context.params
    const parsed = billingBatchSendSchema.safeParse(await readJsonBody(request))
    if (!parsed.success) return validationErrorResponse(parsed.error)

    return apiSuccess(
      await sendBillingBatch({ actor: user, meta: getRequestMeta(request), reason: parsed.data.reason }, id, parsed.data),
    )
  },
)
