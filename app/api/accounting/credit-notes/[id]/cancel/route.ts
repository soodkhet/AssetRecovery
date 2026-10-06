import type { NextRequest } from 'next/server'
import { apiSuccess } from '@/lib/api/envelope'
import {
  bodyStringField,
  readJsonBody,
  toModuleErrorResponse,
  validationErrorResponse,
  withApiPermission,
} from '@/lib/api/http'
import { getRequestMeta } from '@/lib/auth/request-meta'
import { cancelCreditNote } from '@/lib/credit-notes/queries'
import { requireCreditNoteCancelReason } from '@/lib/credit-notes/credit-note'
import { creditNoteCancelSchema } from '@/lib/credit-notes/schemas'
import { MANAGE_TAX_INVOICE } from '@/lib/sales/sales'

type RouteContext = { params: Promise<{ id: string }> }

/**
 * `PATCH /api/accounting/credit-notes/:id/cancel` — `active → cancelled`
 * เหตุผลบังคับ (`CANCEL_REQUIRES_REASON`) · ห้ามลบ ห้าม reverse · งวดของวันที่ออกต้องยังไม่ล็อก
 */
export const PATCH = withApiPermission<RouteContext>(
  'manage',
  MANAGE_TAX_INVOICE,
  toModuleErrorResponse,
  async (request: NextRequest, context, user) => {
    const { id } = await context.params
    const body = await readJsonBody(request)
    // ไม่มีเหตุผล/ว่าง/ช่องว่างล้วน ⇒ `CANCEL_REQUIRES_REASON` (`24` §6.8) ไม่ใช่ `REQUIRED_MISSING` (UAT BUG-161)
    requireCreditNoteCancelReason(bodyStringField(body, 'reason'))
    const parsed = creditNoteCancelSchema.safeParse(body)
    if (!parsed.success) return validationErrorResponse(parsed.error)
    return apiSuccess(await cancelCreditNote({ actor: user, meta: getRequestMeta(request) }, id, parsed.data))
  },
)
