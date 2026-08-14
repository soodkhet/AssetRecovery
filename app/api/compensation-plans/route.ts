import type { NextRequest } from 'next/server'
import { readJsonBody, validationErrorResponse, withApiPermission } from '@/lib/api/http'
import { getRequestMeta } from '@/lib/auth/request-meta'
import { toCompensationErrorResponse } from '@/lib/compensation/errors'
import { createCompensationPlan, listCompensationPlans } from '@/lib/compensation/queries'
import {
  compensationPlanCreateSchema,
  compensationPlanListQuerySchema,
} from '@/lib/compensation/schemas'

/**
 * `GET /api/compensation-plans` (`11` §14) — เวอร์ชันปัจจุบันของทุกแผน + filter `side`/`status`
 * สิทธิ์: `view:view_master_data` — บัญชี/ผู้จัดการทีมดูได้อย่างเดียว (`11` §12 · `25` §7.1)
 */
export const GET = withApiPermission(
  'view',
  'view_master_data',
  toCompensationErrorResponse,
  async (request: NextRequest, _context, user) => {
    const url = new URL(request.url)
    const parsed = compensationPlanListQuerySchema.safeParse({
      side: url.searchParams.get('side') ?? undefined,
      status: url.searchParams.get('status') ?? undefined,
    })
    if (!parsed.success) return validationErrorResponse(parsed.error)

    return Response.json({ data: await listCompensationPlans(user.organizationId, parsed.data) })
  },
)

/**
 * `POST /api/compensation-plans` — สร้างแผนใหม่ (เวอร์ชัน 1) · ต้องเลือก fuel_mode 1 ใน 2 (`11` §7.1)
 * สิทธิ์: `manage:manage_compensation_plans` = Superadmin/บริหาร/การเงิน (`11` §12)
 */
export const POST = withApiPermission(
  'manage',
  'manage_compensation_plans',
  toCompensationErrorResponse,
  async (request: NextRequest, _context, user) => {
    const parsed = compensationPlanCreateSchema.safeParse(await readJsonBody(request))
    if (!parsed.success) return validationErrorResponse(parsed.error)

    const { reason, ...values } = parsed.data
    const plan = await createCompensationPlan(
      { actor: user, meta: getRequestMeta(request), reason },
      values,
    )

    return Response.json({ data: plan }, { status: 201 })
  },
)
