import type { NextRequest } from 'next/server'
import { apiSuccess } from '@/lib/api/envelope'
import { readJsonBody, toModuleErrorResponse, validationErrorResponse, withApiPermission } from '@/lib/api/http'
import { getRequestMeta } from '@/lib/auth/request-meta'
import { matchBankTransaction, MANAGE_BANK_RECONCILIATION } from '@/lib/bank-recon/queries'
import { bankMatchSchema } from '@/lib/bank-recon/schemas'

type RouteContext = { params: Promise<{ id: string }> }

/**
 * `PATCH /api/bank-reconciliation/transactions/:id/match` (`35` §14) — จับคู่ manual
 *
 * `ALREADY_MATCHED` = **เตือนไม่บล็อก** (`24` §6.3) ⇒ ครั้งแรกคืน 200 + `warning` โดยยังไม่เปลี่ยนอะไร
 * ผู้ใช้ยืนยัน (`confirmRematch`) แล้วจึงเปลี่ยนการจับคู่จริงพร้อมเหตุผลลง audit (`35` §10)
 */
export const PATCH = withApiPermission<RouteContext>(
  'manage',
  MANAGE_BANK_RECONCILIATION,
  toModuleErrorResponse,
  async (request: NextRequest, context, user) => {
    const { id } = await context.params
    const parsed = bankMatchSchema.safeParse(await readJsonBody(request))
    if (!parsed.success) return validationErrorResponse(parsed.error)

    const { result, warning } = await matchBankTransaction(
      { actor: user, meta: getRequestMeta(request) },
      id,
      parsed.data,
    )
    return apiSuccess(result, warning === undefined ? undefined : { warning })
  },
)
