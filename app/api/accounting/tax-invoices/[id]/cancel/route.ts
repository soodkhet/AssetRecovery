import type { NextRequest } from 'next/server'
import { apiSuccess } from '@/lib/api/envelope'
import { readJsonBody, toModuleErrorResponse, validationErrorResponse, withApiPermission } from '@/lib/api/http'
import { getRequestMeta } from '@/lib/auth/request-meta'
import { cancelTaxInvoice } from '@/lib/sales/queries'
import { MANAGE_TAX_INVOICE } from '@/lib/sales/sales'
import { taxInvoiceCancelSchema } from '@/lib/sales/schemas'

type RouteContext = { params: Promise<{ id: string }> }

/**
 * `PATCH /api/accounting/tax-invoices/:id/cancel` (`31` §14) — `active → cancelled`
 *
 * เหตุผลบังคับเสมอ (`CANCEL_REQUIRES_REASON`) · ยกเลิกแล้ว**ห้ามลบ ห้าม reverse** (`02` §13)
 * และเลขที่เดิมไม่ถูกนำกลับมาใช้ — ใบใหม่ได้เลขถัดไป (`31` §9.1)
 */
export const PATCH = withApiPermission<RouteContext>(
  'manage',
  MANAGE_TAX_INVOICE,
  toModuleErrorResponse,
  async (request: NextRequest, context, user) => {
    const { id } = await context.params
    const parsed = taxInvoiceCancelSchema.safeParse(await readJsonBody(request))
    if (!parsed.success) return validationErrorResponse(parsed.error)

    return apiSuccess(await cancelTaxInvoice({ actor: user, meta: getRequestMeta(request) }, id, parsed.data))
  },
)
