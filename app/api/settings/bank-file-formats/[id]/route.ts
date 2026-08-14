import type { NextRequest } from 'next/server'
import { readJsonBody, toModuleErrorResponse, validationErrorResponse, withApiPermission } from '@/lib/api/http'
import { getRequestMeta } from '@/lib/auth/request-meta'
import {
  deleteBankFileFormat,
  getBankFileFormat,
  updateBankFileFormat,
} from '@/lib/settings/queries/bank-file-formats'
import { bankFileFormatDeleteSchema, bankFileFormatUpdateSchema } from '@/lib/settings/schemas'

type RouteContext = { params: Promise<{ id: string }> }

/**
 * `GET/PATCH/DELETE /api/settings/bank-file-formats/:id` (`13` §6.8)
 * แก้ mapping/ชนิดไฟล์/encoding = `test_status` กลับไป `pending` อัตโนมัติ (`13` §8)
 */
export const GET = withApiPermission<RouteContext>(
  'view',
  'view_master_data',
  toModuleErrorResponse,
  async (_request: NextRequest, context, user) => {
    const { id } = await context.params
    return Response.json({ data: await getBankFileFormat(user.organizationId, id) })
  },
)

export const PATCH = withApiPermission<RouteContext>(
  'manage',
  'manage_settings',
  toModuleErrorResponse,
  async (request: NextRequest, context, user) => {
    const { id } = await context.params
    const parsed = bankFileFormatUpdateSchema.safeParse(await readJsonBody(request))
    if (!parsed.success) return validationErrorResponse(parsed.error)

    const current = await getBankFileFormat(user.organizationId, id)
    const { reason, ...values } = parsed.data
    const format = await updateBankFileFormat({ actor: user, meta: getRequestMeta(request), reason }, current, values)
    return Response.json({ data: format })
  },
)

export const DELETE = withApiPermission<RouteContext>(
  'manage',
  'manage_settings',
  toModuleErrorResponse,
  async (request: NextRequest, context, user) => {
    const { id } = await context.params
    const parsed = bankFileFormatDeleteSchema.safeParse(await readJsonBody(request))
    if (!parsed.success) return validationErrorResponse(parsed.error)

    const current = await getBankFileFormat(user.organizationId, id)
    const format = await deleteBankFileFormat(
      { actor: user, meta: getRequestMeta(request), reason: parsed.data.reason },
      current,
    )
    return Response.json({ data: format })
  },
)
