import type { NextRequest } from 'next/server'
import { apiSuccess } from '@/lib/api/envelope'
import { readJsonBody, toModuleErrorResponse, validationErrorResponse, withApiPermission } from '@/lib/api/http'
import { APPROVE_ADVANCE, REQUEST_ADVANCE, settleAdvance } from '@/lib/advances/queries'
import { advanceSettleSchema } from '@/lib/advances/schemas'
import { getRequestMeta } from '@/lib/auth/request-meta'

type RouteContext = { params: Promise<{ id: string }> }

/**
 * `PATCH /api/advances/:id/settle` (`15` §9.1/§12) — เคลียร์ยอด → `cleared` (terminal)
 *
 * ทำได้ทั้งจากสถานะ `approved` และ `overdue` · **เจ้าของคำขอกรอกยอดใช้จริงเองได้**
 * (`15` §12) ส่วนการเงินทำแทนได้ด้วยสิทธิ์อนุมัติ — scope ระดับแถวบังคับในชั้นข้อมูล
 * · `used > requested` ⇒ `USED_EXCEEDS_REQUEST_NO_TOPUP` (ยอดคืนห้ามติดลบ — Rule 01)
 */
export const PATCH = withApiPermission<RouteContext>(
  'manage',
  [REQUEST_ADVANCE, APPROVE_ADVANCE],
  toModuleErrorResponse,
  async (request: NextRequest, context, user) => {
    const { id } = await context.params
    const parsed = advanceSettleSchema.safeParse(await readJsonBody(request))
    if (!parsed.success) return validationErrorResponse(parsed.error)

    return apiSuccess(await settleAdvance({ actor: user, meta: getRequestMeta(request) }, id, parsed.data))
  },
)
