import type { NextRequest } from 'next/server'
import { apiSuccess } from '@/lib/api/envelope'
import { readJsonBody, toModuleErrorResponse, validationErrorResponse, withApiPermission } from '@/lib/api/http'
import { getRequestMeta } from '@/lib/auth/request-meta'
import { BILLING_READ_CAPABILITIES, createBillingBatch, listBillingBatches, MANAGE_BILLING } from '@/lib/revenue/queries'
import { billingBatchCreateSchema, billingBatchListQuerySchema } from '@/lib/revenue/schemas'

/**
 * รอบวางบิล (`19` §14 · `27` §6.7) — `GET`/`POST /api/billing-batches`
 *
 * อ่าน = การเงิน/บัญชี/ผู้บริหาร + Company User (บริษัทตัวเอง) · สร้าง = การเงินเท่านั้น (`19` §12)
 * สร้างแล้วระบบดึง Revenue ที่ `ready_for_billing` ของบริษัทนั้นในงวดมารวมให้เอง (`19` §9.1)
 */
export const GET = withApiPermission(
  'view',
  BILLING_READ_CAPABILITIES,
  toModuleErrorResponse,
  async (request: NextRequest, _context: unknown, user) => {
    const parsed = billingBatchListQuerySchema.safeParse(Object.fromEntries(new URL(request.url).searchParams))
    if (!parsed.success) return validationErrorResponse(parsed.error)
    return apiSuccess(await listBillingBatches(user, parsed.data))
  },
)

export const POST = withApiPermission(
  'manage',
  MANAGE_BILLING,
  toModuleErrorResponse,
  async (request: NextRequest, _context: unknown, user) => {
    const parsed = billingBatchCreateSchema.safeParse(await readJsonBody(request))
    if (!parsed.success) return validationErrorResponse(parsed.error)

    const created = await createBillingBatch(
      { actor: user, meta: getRequestMeta(request), reason: parsed.data.reason },
      parsed.data,
    )
    return apiSuccess(created, { status: 201 })
  },
)
