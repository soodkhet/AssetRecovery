import type { NextRequest } from 'next/server'
import { MANAGE_ACCOUNTING_PERIOD, UNLOCK_PERIOD } from '@/lib/accounting/period'
import { unlockPeriod } from '@/lib/accounting/queries'
import { periodReasonSchema } from '@/lib/accounting/schemas'
import { apiSuccess } from '@/lib/api/envelope'
import { readJsonBody, toModuleErrorResponse, validationErrorResponse, withApiPermission } from '@/lib/api/http'
import { getRequestMeta } from '@/lib/auth/request-meta'

type RouteContext = { params: Promise<{ id: string }> }

/**
 * `PATCH /api/accounting/periods/:id/unlock` (`30` §14) — `locked → sent_to_accountant`
 *
 * ⚠️ **สิทธิ์ 2 ชั้น**: ชั้นแรกที่นี่ปล่อยสายบัญชี/ผู้บริหารเข้ามา ชั้นที่สองใน service ตรวจ
 *    `unlock_period` จริง แล้วโยน `UNLOCK_REQUIRES_EXECUTIVE` (403) ตามที่ `30` §11/§16 ระบุ
 *    — ไม่ใช่ `PERMISSION_DENIED` เพราะสเปคล็อก code ไว้ตรงตัว · `reason` บังคับ + audit แยกชัด
 */
export const PATCH = withApiPermission<RouteContext>(
  'manage',
  [MANAGE_ACCOUNTING_PERIOD, UNLOCK_PERIOD],
  toModuleErrorResponse,
  async (request: NextRequest, context, user) => {
    const { id } = await context.params
    const parsed = periodReasonSchema.safeParse(await readJsonBody(request))
    if (!parsed.success) return validationErrorResponse(parsed.error)

    return apiSuccess(await unlockPeriod({ actor: user, meta: getRequestMeta(request) }, id, parsed.data))
  },
)
