import type { NextRequest } from 'next/server'
import { apiSuccess } from '@/lib/api/envelope'
import { readJsonBody, toModuleErrorResponse, validationErrorResponse, withApiPermission } from '@/lib/api/http'
import { getRequestMeta } from '@/lib/auth/request-meta'
import { cancelCreditNote } from '@/lib/credit-notes/queries'
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
    const parsed = creditNoteCancelSchema.safeParse(await readJsonBody(request))
    if (!parsed.success) return validationErrorResponse(parsed.error)
    return apiSuccess(await cancelCreditNote({ actor: user, meta: getRequestMeta(request) }, id, parsed.data))
  },
)
