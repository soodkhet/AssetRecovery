import type { NextRequest } from 'next/server'
import { MANAGE_ACCOUNTING_PERIOD, UNLOCK_PERIOD } from '@/lib/accounting/period'
import { lockPeriod } from '@/lib/accounting/queries'
import { periodReasonSchema } from '@/lib/accounting/schemas'
import { apiSuccess } from '@/lib/api/envelope'
import { readJsonBody, toModuleErrorResponse, validationErrorResponse, withApiPermission } from '@/lib/api/http'
import { getRequestMeta } from '@/lib/auth/request-meta'

type RouteContext = { params: Promise<{ id: string }> }

/**
 * `PATCH /api/accounting/periods/:id/lock` (`30` §14) — `sent_to_accountant → locked`
 *
 * `30` §9 ระบุว่า "บัญชี/Executive ยืนยันปิดงวด" ⇒ ผ่านได้ทั้งผู้ถือ `manage_accounting_period`
 * และผู้บริหาร (`unlock_period`) — ส่วน**ปลดล็อก**ยังเป็นของผู้บริหารเท่านั้น (§10)
 */
export const PATCH = withApiPermission<RouteContext>(
  'manage',
  [MANAGE_ACCOUNTING_PERIOD, UNLOCK_PERIOD],
  toModuleErrorResponse,
  async (request: NextRequest, context, user) => {
    const { id } = await context.params
    const parsed = periodReasonSchema.safeParse(await readJsonBody(request))
    if (!parsed.success) return validationErrorResponse(parsed.error)

    return apiSuccess(await lockPeriod({ actor: user, meta: getRequestMeta(request) }, id, parsed.data))
  },
)
