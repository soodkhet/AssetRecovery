import type { NextRequest } from 'next/server'
import { z } from 'zod'
import { readJsonBody, toModuleErrorResponse, validationErrorResponse, withApiPermission } from '@/lib/api/http'
import { getRequestMeta } from '@/lib/auth/request-meta'
import { createCostCenter, listCostCenters } from '@/lib/settings/queries/cost-centers'
import { costCenterCreateSchema } from '@/lib/settings/schemas'

/**
 * ศูนย์ต้นทุน (`13` §6.6 · §13) — `GET`/`POST /api/settings/cost-centers`
 * `code` เป็น running number อัตโนมัติ (`CC-001`) — ไม่รับจาก body (`13` §6.6)
 */

const listQuerySchema = z.object({ status: z.enum(['active', 'inactive', 'all']).default('active') })

export const GET = withApiPermission(
  'view',
  'view_master_data',
  toModuleErrorResponse,
  async (request: NextRequest, _context: unknown, user) => {
    const parsed = listQuerySchema.safeParse(Object.fromEntries(new URL(request.url).searchParams))
    if (!parsed.success) return validationErrorResponse(parsed.error)
    return Response.json({ data: await listCostCenters(user.organizationId, parsed.data.status) })
  },
)

export const POST = withApiPermission(
  'manage',
  'manage_settings',
  toModuleErrorResponse,
  async (request: NextRequest, _context: unknown, user) => {
    const parsed = costCenterCreateSchema.safeParse(await readJsonBody(request))
    if (!parsed.success) return validationErrorResponse(parsed.error)

    const { reason, ...values } = parsed.data
    const costCenter = await createCostCenter({ actor: user, meta: getRequestMeta(request), reason }, values)
    return Response.json({ data: costCenter }, { status: 201 })
  },
)
