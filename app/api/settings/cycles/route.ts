import type { NextRequest } from 'next/server'
import { readJsonBody, toModuleErrorResponse, validationErrorResponse, withApiPermission } from '@/lib/api/http'
import { getRequestMeta } from '@/lib/auth/request-meta'
import { createCycle, listCycles } from '@/lib/settings/queries/cycles'
import { cycleCreateSchema, cycleListQuerySchema } from '@/lib/settings/schemas'

/**
 * รอบบิล/รอบจ่าย (`13` §6.1 · §13) — `GET`/`POST /api/settings/cycles`
 *
 * สิทธิ์ (`13` §11 · `25` §7.1): อ่าน = `view:view_master_data` (การเงิน/บัญชี/บริหาร/ธุรการ) ·
 * แก้ = `manage:manage_settings` = **Superadmin เท่านั้น** (ไม่มี role อื่นถือ capability นี้)
 */

export const GET = withApiPermission(
  'view',
  'view_master_data',
  toModuleErrorResponse,
  async (request: NextRequest, _context: unknown, user) => {
    const parsed = cycleListQuerySchema.safeParse(Object.fromEntries(new URL(request.url).searchParams))
    if (!parsed.success) return validationErrorResponse(parsed.error)
    return Response.json({ data: await listCycles(user.organizationId, parsed.data) })
  },
)

export const POST = withApiPermission(
  'manage',
  'manage_settings',
  toModuleErrorResponse,
  async (request: NextRequest, _context: unknown, user) => {
    const parsed = cycleCreateSchema.safeParse(await readJsonBody(request))
    if (!parsed.success) return validationErrorResponse(parsed.error)

    const { reason, ...values } = parsed.data
    const cycle = await createCycle({ actor: user, meta: getRequestMeta(request), reason }, values)
    return Response.json({ data: cycle }, { status: 201 })
  },
)
