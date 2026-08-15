import type { NextRequest } from 'next/server'
import { apiSuccess } from '@/lib/api/envelope'
import { readJsonBody, toModuleErrorResponse, validationErrorResponse, withApiPermission } from '@/lib/api/http'
import { getRequestMeta } from '@/lib/auth/request-meta'
import {
  BILLING_READ_CAPABILITIES,
  deleteBillingBatch,
  getBillingBatch,
  MANAGE_BILLING,
} from '@/lib/revenue/queries'
import { billingBatchDeleteSchema } from '@/lib/revenue/schemas'

type RouteContext = { params: Promise<{ id: string }> }

/**
 * `GET`/`DELETE /api/billing-batches/:id` (`27` §6.7 v3.3)
 *
 * `GET` = รายละเอียดรอบ + รายการรายได้ในรอบ (ปุ่ม "เอกสาร" ของ `19` §8)
 * `DELETE` = ลบรอบที่ยัง `draft` เท่านั้น (`19` §10) — Revenue ในรอบถูกปล่อยกลับเป็น
 * `ready_for_billing` ครบทุกใบ · กระทบเงิน ⇒ `reason` บังคับ (`90` §13)
 */
export const GET = withApiPermission<RouteContext>(
  'view',
  BILLING_READ_CAPABILITIES,
  toModuleErrorResponse,
  async (_request: NextRequest, context, user) => {
    const { id } = await context.params
    return apiSuccess(await getBillingBatch(user, id))
  },
)

export const DELETE = withApiPermission<RouteContext>(
  'manage',
  MANAGE_BILLING,
  toModuleErrorResponse,
  async (request: NextRequest, context, user) => {
    const { id } = await context.params
    const parsed = billingBatchDeleteSchema.safeParse(await readJsonBody(request))
    if (!parsed.success) return validationErrorResponse(parsed.error)

    return apiSuccess(
      await deleteBillingBatch({ actor: user, meta: getRequestMeta(request), reason: parsed.data.reason }, id, parsed.data),
    )
  },
)
