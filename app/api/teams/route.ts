import type { NextRequest } from 'next/server'
import { readJsonBody, toModuleErrorResponse, validationErrorResponse, withApiPermission } from '@/lib/api/http'
import { getRequestMeta } from '@/lib/auth/request-meta'
import { createTeam, listTeams } from '@/lib/teams/queries'
import { teamCreateSchema, teamListQuerySchema } from '@/lib/teams/schemas'

/**
 * `GET /api/teams` (`09` §14) — รายการทีม + filter `side`/`status`/`province`/`search`
 * สิทธิ์: `view:view_master_data` — การเงิน/บัญชีดูได้เพื่ออ้างอิงในรายงาน (`09` §12 · `25` §7.1)
 */
export const GET = withApiPermission(
  'view',
  'view_master_data',
  toModuleErrorResponse,
  async (request: NextRequest, _context, user) => {
    const url = new URL(request.url)
    const parsed = teamListQuerySchema.safeParse({
      side: url.searchParams.get('side') ?? undefined,
      status: url.searchParams.get('status') ?? undefined,
      province: url.searchParams.get('province') ?? undefined,
      search: url.searchParams.get('search') ?? undefined,
    })
    if (!parsed.success) return validationErrorResponse(parsed.error)

    return Response.json({ data: await listTeams(user, parsed.data) })
  },
)

/**
 * `POST /api/teams` — สร้างทีมใหม่ · **ต้องผูก `compensation_plan_id` เสมอ** (`09` §7)
 * สิทธิ์: `manage:manage_teams` (`09` §12) · `reason` บังคับ (ทีมกระทบเงิน/สิทธิ์ — `90` §13)
 */
export const POST = withApiPermission(
  'manage',
  'manage_teams',
  toModuleErrorResponse,
  async (request: NextRequest, _context, user) => {
    const parsed = teamCreateSchema.safeParse(await readJsonBody(request))
    if (!parsed.success) return validationErrorResponse(parsed.error)

    const { reason, ...values } = parsed.data
    const team = await createTeam({ actor: user, meta: getRequestMeta(request), reason }, values)

    return Response.json({ data: team }, { status: 201 })
  },
)
