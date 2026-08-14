import type { NextRequest } from 'next/server'
import { readJsonBody, toModuleErrorResponse, validationErrorResponse, withApiPermission } from '@/lib/api/http'
import { getRequestMeta } from '@/lib/auth/request-meta'
import { deleteCostCenter, getCostCenter, updateCostCenter } from '@/lib/settings/queries/cost-centers'
import { costCenterDeleteSchema, costCenterUpdateSchema } from '@/lib/settings/schemas'

type RouteContext = { params: Promise<{ id: string }> }

/** `GET/PATCH/DELETE /api/settings/cost-centers/:id` (`13` §6.6) — `code` แก้ไม่ได้ตลอดอายุ */
export const GET = withApiPermission<RouteContext>(
  'view',
  'view_master_data',
  toModuleErrorResponse,
  async (_request: NextRequest, context, user) => {
    const { id } = await context.params
    return Response.json({ data: await getCostCenter(user.organizationId, id) })
  },
)

export const PATCH = withApiPermission<RouteContext>(
  'manage',
  'manage_settings',
  toModuleErrorResponse,
  async (request: NextRequest, context, user) => {
    const { id } = await context.params
    const parsed = costCenterUpdateSchema.safeParse(await readJsonBody(request))
    if (!parsed.success) return validationErrorResponse(parsed.error)

    const current = await getCostCenter(user.organizationId, id)
    const { reason, ...values } = parsed.data
    const costCenter = await updateCostCenter({ actor: user, meta: getRequestMeta(request), reason }, current, values)
    return Response.json({ data: costCenter })
  },
)

/** ศูนย์ต้นทุนที่มีรายการค่าใช้จ่ายผูกอยู่ลบไม่ได้ → `COST_CENTER_IN_USE` */
export const DELETE = withApiPermission<RouteContext>(
  'manage',
  'manage_settings',
  toModuleErrorResponse,
  async (request: NextRequest, context, user) => {
    const { id } = await context.params
    const parsed = costCenterDeleteSchema.safeParse(await readJsonBody(request))
    if (!parsed.success) return validationErrorResponse(parsed.error)

    const current = await getCostCenter(user.organizationId, id)
    const costCenter = await deleteCostCenter(
      { actor: user, meta: getRequestMeta(request), reason: parsed.data.reason },
      current,
    )
    return Response.json({ data: costCenter })
  },
)
