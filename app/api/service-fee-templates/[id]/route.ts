import type { NextRequest } from 'next/server'
import { readJsonBody, validationErrorResponse, withApiPermission } from '@/lib/api/http'
import { getRequestMeta } from '@/lib/auth/request-meta'
import { toServiceFeeErrorResponse } from '@/lib/service-fee/errors'
import {
  getServiceFeeTemplate,
  setServiceFeeTemplateActive,
  updateServiceFeeTemplate,
} from '@/lib/service-fee/queries'
import {
  serviceFeeTemplateActivationSchema,
  serviceFeeTemplateUpdateSchema,
} from '@/lib/service-fee/schemas'

type RouteContext = { params: Promise<{ id: string }> }

/** `GET /api/service-fee-templates/:id` — เวอร์ชันเดียว (เปิดดูเวอร์ชันเก่าได้ด้วย) */
export const GET = withApiPermission<RouteContext>(
  'view',
  'view_master_data',
  toServiceFeeErrorResponse,
  async (_request: NextRequest, context, user) => {
    const { id } = await context.params
    return Response.json({ data: await getServiceFeeTemplate(user.organizationId, id) })
  },
)

/**
 * `PATCH /api/service-fee-templates/:id` (`12` §14) — **สร้างเวอร์ชันใหม่ ไม่ overwrite ของเดิม** (`12` §9)
 * บริษัทที่ผูกอยู่ถูกย้ายมาชี้เวอร์ชันใหม่ ⇒ เคสที่ยังไม่ approved เห็นค่าใหม่ทันที
 * สิทธิ์: `manage:manage_service_fees` = Superadmin เท่านั้น · `reason` บังคับ (`12` §13)
 */
export const PATCH = withApiPermission<RouteContext>(
  'manage',
  'manage_service_fees',
  toServiceFeeErrorResponse,
  async (request: NextRequest, context, user) => {
    const { id } = await context.params
    const parsed = serviceFeeTemplateUpdateSchema.safeParse(await readJsonBody(request))
    if (!parsed.success) return validationErrorResponse(parsed.error)

    const current = await getServiceFeeTemplate(user.organizationId, id)
    const { reason, ...values } = parsed.data

    const template = await updateServiceFeeTemplate(
      { actor: user, meta: getRequestMeta(request), reason },
      current,
      values,
    )

    return Response.json({ data: template })
  },
)

/**
 * `DELETE /api/service-fee-templates/:id` — ปิด/เปิดใช้งานเทมเพลต (soft delete ตาม `02` §2.4)
 * เทมเพลตที่มีบริษัทผูกอยู่ปิดไม่ได้ → `TEMPLATE_IN_USE` พร้อมรายชื่อบริษัท (`12` §10/§11)
 */
export const DELETE = withApiPermission<RouteContext>(
  'manage',
  'manage_service_fees',
  toServiceFeeErrorResponse,
  async (request: NextRequest, context, user) => {
    const { id } = await context.params
    const parsed = serviceFeeTemplateActivationSchema.safeParse(await readJsonBody(request))
    if (!parsed.success) return validationErrorResponse(parsed.error)

    const current = await getServiceFeeTemplate(user.organizationId, id)
    const template = await setServiceFeeTemplateActive(
      { actor: user, meta: getRequestMeta(request), reason: parsed.data.reason },
      current,
      parsed.data.isActive,
    )

    return Response.json({ data: template })
  },
)
