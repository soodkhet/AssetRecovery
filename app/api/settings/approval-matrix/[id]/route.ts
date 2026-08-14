import type { NextRequest } from 'next/server'
import { readJsonBody, toModuleErrorResponse, validationErrorResponse, withApiPermission } from '@/lib/api/http'
import { getRequestMeta } from '@/lib/auth/request-meta'
import {
  deleteApprovalMatrix,
  getApprovalMatrix,
  updateApprovalMatrix,
} from '@/lib/settings/queries/approval-matrix'
import { approvalMatrixDeleteSchema, approvalMatrixUpdateSchema } from '@/lib/settings/schemas'

type RouteContext = { params: Promise<{ id: string }> }

/** `GET/PATCH/DELETE /api/settings/approval-matrix/:id` (`13` §6.2) */
export const GET = withApiPermission<RouteContext>(
  'view',
  'view_master_data',
  toModuleErrorResponse,
  async (_request: NextRequest, context, user) => {
    const { id } = await context.params
    return Response.json({ data: await getApprovalMatrix(user.organizationId, id) })
  },
)

export const PATCH = withApiPermission<RouteContext>(
  'manage',
  'manage_settings',
  toModuleErrorResponse,
  async (request: NextRequest, context, user) => {
    const { id } = await context.params
    const parsed = approvalMatrixUpdateSchema.safeParse(await readJsonBody(request))
    if (!parsed.success) return validationErrorResponse(parsed.error)

    const current = await getApprovalMatrix(user.organizationId, id)
    const { reason, ...values } = parsed.data
    const matrix = await updateApprovalMatrix({ actor: user, meta: getRequestMeta(request), reason }, current, values)
    return Response.json({ data: matrix })
  },
)

export const DELETE = withApiPermission<RouteContext>(
  'manage',
  'manage_settings',
  toModuleErrorResponse,
  async (request: NextRequest, context, user) => {
    const { id } = await context.params
    const parsed = approvalMatrixDeleteSchema.safeParse(await readJsonBody(request))
    if (!parsed.success) return validationErrorResponse(parsed.error)

    const current = await getApprovalMatrix(user.organizationId, id)
    const matrix = await deleteApprovalMatrix(
      { actor: user, meta: getRequestMeta(request), reason: parsed.data.reason },
      current,
    )
    return Response.json({ data: matrix })
  },
)
