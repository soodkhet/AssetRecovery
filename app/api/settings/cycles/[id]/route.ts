import type { NextRequest } from 'next/server'
import { readJsonBody, toModuleErrorResponse, validationErrorResponse, withApiPermission } from '@/lib/api/http'
import { getRequestMeta } from '@/lib/auth/request-meta'
import { deleteCycle, getCycle, updateCycle } from '@/lib/settings/queries/cycles'
import { cycleDeleteSchema, cycleUpdateSchema } from '@/lib/settings/schemas'

type RouteContext = { params: Promise<{ id: string }> }

/** `GET/PATCH/DELETE /api/settings/cycles/:id` (`13` §6.1) — `reason` บังคับทุก mutation (`90` §13) */
export const GET = withApiPermission<RouteContext>(
  'view',
  'view_master_data',
  toModuleErrorResponse,
  async (_request: NextRequest, context, user) => {
    const { id } = await context.params
    return Response.json({ data: await getCycle(user.organizationId, id) })
  },
)

export const PATCH = withApiPermission<RouteContext>(
  'manage',
  'manage_settings',
  toModuleErrorResponse,
  async (request: NextRequest, context, user) => {
    const { id } = await context.params
    const parsed = cycleUpdateSchema.safeParse(await readJsonBody(request))
    if (!parsed.success) return validationErrorResponse(parsed.error)

    const current = await getCycle(user.organizationId, id)
    const { reason, ...values } = parsed.data
    const cycle = await updateCycle({ actor: user, meta: getRequestMeta(request), reason }, current, values)
    return Response.json({ data: cycle })
  },
)

/** ปิดใช้งาน = soft delete (`02` §2.4) — เอกสารเก่ายังอ้างชื่อรอบได้ */
export const DELETE = withApiPermission<RouteContext>(
  'manage',
  'manage_settings',
  toModuleErrorResponse,
  async (request: NextRequest, context, user) => {
    const { id } = await context.params
    const parsed = cycleDeleteSchema.safeParse(await readJsonBody(request))
    if (!parsed.success) return validationErrorResponse(parsed.error)

    const current = await getCycle(user.organizationId, id)
    const cycle = await deleteCycle({ actor: user, meta: getRequestMeta(request), reason: parsed.data.reason }, current)
    return Response.json({ data: cycle })
  },
)
