import type { NextRequest } from 'next/server'
import { apiSuccess } from '@/lib/api/envelope'
import { readJsonBody, toModuleErrorResponse, validationErrorResponse, withApiPermission } from '@/lib/api/http'
import { getRequestMeta } from '@/lib/auth/request-meta'
import { completePayoutBatch, MANAGE_PAYOUT_BATCH } from '@/lib/payout/queries'
import { payoutCompleteSchema } from '@/lib/payout/schemas'

type RouteContext = { params: Promise<{ id: string }> }

/**
 * `PATCH /api/payout-batches/:id/complete` (`17` §14 · `23` §6.6)
 * ยืนยันจ่ายสำเร็จด้วยมือ — ทางหลักคือ sync จาก Bank Reconciliation (ไฟล์ 35 · Phase 4.2)
 * ต้องมี `reason` เสมอ เพราะเป็นการรับผิดทางการเงินของผู้กด (`17` §13)
 */
export const PATCH = withApiPermission<RouteContext>(
  'manage',
  MANAGE_PAYOUT_BATCH,
  toModuleErrorResponse,
  async (request: NextRequest, context, user) => {
    const { id } = await context.params
    const parsed = payoutCompleteSchema.safeParse(await readJsonBody(request))
    if (!parsed.success) return validationErrorResponse(parsed.error)

    return apiSuccess(await completePayoutBatch({ actor: user, meta: getRequestMeta(request) }, id, parsed.data))
  },
)
