import type { NextRequest } from 'next/server'
import { z } from 'zod'
import { readJsonBody, toModuleErrorResponse, validationErrorResponse, withApiPermission } from '@/lib/api/http'
import { getRequestMeta } from '@/lib/auth/request-meta'
import { createApprovalMatrix, listApprovalMatrices } from '@/lib/settings/queries/approval-matrix'
import { approvalMatrixCreateSchema } from '@/lib/settings/schemas'

/**
 * สายการอนุมัติ (`13` §6.2 · §13) — `GET`/`POST /api/settings/approval-matrix`
 * เพดานเงินรับเป็น **satang** เสมอ (Rule 01) · แก้ = `manage:manage_settings` (Superadmin)
 */

const listQuerySchema = z.object({ status: z.enum(['active', 'inactive', 'all']).default('active') })

export const GET = withApiPermission(
  'view',
  'view_master_data',
  toModuleErrorResponse,
  async (request: NextRequest, _context: unknown, user) => {
    const parsed = listQuerySchema.safeParse(Object.fromEntries(new URL(request.url).searchParams))
    if (!parsed.success) return validationErrorResponse(parsed.error)
    return Response.json({ data: await listApprovalMatrices(user.organizationId, parsed.data.status) })
  },
)

export const POST = withApiPermission(
  'manage',
  'manage_settings',
  toModuleErrorResponse,
  async (request: NextRequest, _context: unknown, user) => {
    const parsed = approvalMatrixCreateSchema.safeParse(await readJsonBody(request))
    if (!parsed.success) return validationErrorResponse(parsed.error)

    const { reason, ...values } = parsed.data
    const matrix = await createApprovalMatrix({ actor: user, meta: getRequestMeta(request), reason }, values)
    return Response.json({ data: matrix }, { status: 201 })
  },
)
