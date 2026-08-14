import type { NextRequest } from 'next/server'
import { readJsonBody, validationErrorResponse, withApiPermission } from '@/lib/api/http'
import { getRequestMeta } from '@/lib/auth/request-meta'
import { toCompensationErrorResponse } from '@/lib/compensation/errors'
import {
  getCompensationPlan,
  setCompensationPlanActive,
  updateCompensationPlan,
} from '@/lib/compensation/queries'
import {
  compensationPlanActivationSchema,
  compensationPlanUpdateSchema,
} from '@/lib/compensation/schemas'

type RouteContext = { params: Promise<{ id: string }> }

/** `GET /api/compensation-plans/:id` — เวอร์ชันเดียว (เปิดดูเวอร์ชันเก่าได้ด้วย) */
export const GET = withApiPermission<RouteContext>(
  'view',
  'view_master_data',
  toCompensationErrorResponse,
  async (_request: NextRequest, context, user) => {
    const { id } = await context.params
    return Response.json({ data: await getCompensationPlan(user.organizationId, id) })
  },
)

/**
 * `PATCH /api/compensation-plans/:id` (`11` §14) — **สร้างเวอร์ชันใหม่ ไม่ overwrite ของเดิม** (`11` §10)
 * ทีมที่ผูกอยู่ถูกย้ายมาชี้เวอร์ชันใหม่ · ค่าใช้จ่ายที่ snapshot ไว้แล้วยังอ้างเวอร์ชันเก่า (`92` §7.1)
 * สิทธิ์: `manage:manage_compensation_plans` (`11` §12) · `reason` บังคับ (หมวดเงิน — `90` §13)
 */
export const PATCH = withApiPermission<RouteContext>(
  'manage',
  'manage_compensation_plans',
  toCompensationErrorResponse,
  async (request: NextRequest, context, user) => {
    const { id } = await context.params
    const parsed = compensationPlanUpdateSchema.safeParse(await readJsonBody(request))
    if (!parsed.success) return validationErrorResponse(parsed.error)

    const current = await getCompensationPlan(user.organizationId, id)
    const { reason, ...values } = parsed.data

    const plan = await updateCompensationPlan(
      { actor: user, meta: getRequestMeta(request), reason },
      current,
      values,
    )

    return Response.json({ data: plan })
  },
)

/**
 * `DELETE /api/compensation-plans/:id` — ปิด/เปิดใช้งานแผน (soft delete ตาม `02` §2.4)
 * แผนที่มีทีมผูกอยู่ปิดไม่ได้ → `PLAN_IN_USE` · ส่ง `{ isActive: true }` เพื่อเปิดใช้งานกลับ
 */
export const DELETE = withApiPermission<RouteContext>(
  'manage',
  'manage_compensation_plans',
  toCompensationErrorResponse,
  async (request: NextRequest, context, user) => {
    const { id } = await context.params
    const parsed = compensationPlanActivationSchema.safeParse(await readJsonBody(request))
    if (!parsed.success) return validationErrorResponse(parsed.error)

    const current = await getCompensationPlan(user.organizationId, id)
    const plan = await setCompensationPlanActive(
      { actor: user, meta: getRequestMeta(request), reason: parsed.data.reason },
      current,
      parsed.data.isActive,
    )

    return Response.json({ data: plan })
  },
)
