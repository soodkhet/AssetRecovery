import type { NextRequest } from 'next/server'
import { apiSuccess } from '@/lib/api/envelope'
import { readJsonBody, toModuleErrorResponse, validationErrorResponse, withApiPermission } from '@/lib/api/http'
import { APPROVE_ADVANCE, changeAdvanceReturnMethod } from '@/lib/advances/queries'
import { advanceReturnMethodChangeSchema } from '@/lib/advances/schemas'
import { getRequestMeta } from '@/lib/auth/request-meta'

type RouteContext = { params: Promise<{ id: string }> }

/**
 * `PATCH /api/advances/:id/return-method` (มติ PO 05/10/2569 UAT U30 · `15` §9.3 · `27` §6.4)
 * การเงินเปลี่ยนวิธีคืนยอด (หักกลบในรอบจ่าย ⇄ รับคืนแยก) — ต้องมีเหตุผล · ทำได้เมื่อยังมียอดค้าง
 * (ยอดที่ถูกหักในรอบจ่ายที่สร้างแล้วไม่ใช่ยอดค้าง)
 */
export const PATCH = withApiPermission<RouteContext>(
  'manage',
  APPROVE_ADVANCE,
  toModuleErrorResponse,
  async (request: NextRequest, context, user) => {
    const { id } = await context.params
    const parsed = advanceReturnMethodChangeSchema.safeParse(await readJsonBody(request))
    if (!parsed.success) return validationErrorResponse(parsed.error)

    return apiSuccess(await changeAdvanceReturnMethod({ actor: user, meta: getRequestMeta(request) }, id, parsed.data))
  },
)
