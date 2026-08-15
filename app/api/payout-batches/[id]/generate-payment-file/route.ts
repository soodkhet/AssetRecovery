import type { NextRequest } from 'next/server'
import { apiSuccess } from '@/lib/api/envelope'
import { readJsonBody, toModuleErrorResponse, validationErrorResponse, withApiPermission } from '@/lib/api/http'
import { getRequestMeta } from '@/lib/auth/request-meta'
import { generatePaymentFile, GENERATE_PAYMENT_FILE } from '@/lib/payout/queries'
import { paymentFileGenerateSchema } from '@/lib/payout/schemas'

type RouteContext = { params: Promise<{ id: string }> }

/**
 * `POST /api/payout-batches/:id/generate-payment-file` (`17` §14 · `27` §6.6)
 *
 * สิทธิ์แยกจาก "จัดการรอบจ่าย" — `generate_payment_file` คือจุดที่เงินออกจริง (`17` §12)
 * รอบที่เคยสร้างไฟล์แล้วจะได้ `warning: DUPLICATE_PAYMENT_FILE` + `generated: false` ก่อนเสมอ
 * ต้องส่ง `confirmDuplicate: true` มาอีกรอบจึงสร้างไฟล์ใหม่ (`17` §6.3 — เตือน ไม่ reject)
 */
export const POST = withApiPermission<RouteContext>(
  'manage',
  GENERATE_PAYMENT_FILE,
  toModuleErrorResponse,
  async (request: NextRequest, context, user) => {
    const { id } = await context.params
    const parsed = paymentFileGenerateSchema.safeParse(await readJsonBody(request))
    if (!parsed.success) return validationErrorResponse(parsed.error)

    const outcome = await generatePaymentFile({ actor: user, meta: getRequestMeta(request) }, id, parsed.data)
    return apiSuccess(outcome.result, { warning: outcome.warning })
  },
)
