import type { NextRequest } from 'next/server'
import { MANAGE_ACCOUNTING_PERIOD } from '@/lib/accounting/period'
import { sendPeriod } from '@/lib/accounting/queries'
import { periodReasonSchema } from '@/lib/accounting/schemas'
import { apiSuccess } from '@/lib/api/envelope'
import { readJsonBody, toModuleErrorResponse, validationErrorResponse, withApiPermission } from '@/lib/api/http'
import { getRequestMeta } from '@/lib/auth/request-meta'

type RouteContext = { params: Promise<{ id: string }> }

/**
 * `PATCH /api/accounting/periods/:id/send` (`30` §14) — `collecting → sent_to_accountant`
 *
 * ⚠️ ผ่าน Readiness Check 3 เงื่อนไขเสมอ **ไม่มีทางลัด/ไม่มี force** (`30` §10) ⇒ ไม่ผ่านจะได้
 *    `NOT_READY_CRITICAL_OPEN` / `NOT_READY_RECONCILE_INCOMPLETE` / `NOT_READY_BILLING_REVENUE_MISMATCH`
 */
export const PATCH = withApiPermission<RouteContext>(
  'manage',
  MANAGE_ACCOUNTING_PERIOD,
  toModuleErrorResponse,
  async (request: NextRequest, context, user) => {
    const { id } = await context.params
    const parsed = periodReasonSchema.safeParse(await readJsonBody(request))
    if (!parsed.success) return validationErrorResponse(parsed.error)

    return apiSuccess(await sendPeriod({ actor: user, meta: getRequestMeta(request) }, id, parsed.data))
  },
)
