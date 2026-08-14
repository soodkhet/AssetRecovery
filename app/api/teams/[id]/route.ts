import type { NextRequest } from 'next/server'
import { readJsonBody, toModuleErrorResponse, validationErrorResponse, withApiPermission } from '@/lib/api/http'
import { getRequestMeta } from '@/lib/auth/request-meta'
import { deleteTeam, getTeam, updateTeam } from '@/lib/teams/queries'
import { teamDeleteSchema, teamUpdateSchema } from '@/lib/teams/schemas'

type RouteContext = { params: Promise<{ id: string }> }

/** `GET /api/teams/:id` — รายละเอียดทีมเดียว (404 แบบไม่ leak ข้ามองค์กร) */
export const GET = withApiPermission<RouteContext>(
  'view',
  'view_master_data',
  toModuleErrorResponse,
  async (_request: NextRequest, context, user) => {
    const { id } = await context.params
    return Response.json({ data: await getTeam(user, id) })
  },
)

/**
 * `PATCH /api/teams/:id` (`09` §14) — แก้ข้อมูลทีมทั้งชุด รวมผู้จัดการ (N:N) และสถานะ
 * ปิดทีมที่ยังมีเคสค้าง → `TEAM_HAS_ACTIVE_CASES` (`09` §10) · ตั้งหัวหน้าที่สังกัดทีมอื่นอยู่แล้ว
 * → `SUPERVISOR_ALREADY_ASSIGNED` (`09` §7.1)
 */
export const PATCH = withApiPermission<RouteContext>(
  'manage',
  'manage_teams',
  toModuleErrorResponse,
  async (request: NextRequest, context, user) => {
    const { id } = await context.params
    const parsed = teamUpdateSchema.safeParse(await readJsonBody(request))
    if (!parsed.success) return validationErrorResponse(parsed.error)

    const current = await getTeam(user, id)
    const { reason, ...values } = parsed.data

    const team = await updateTeam({ actor: user, meta: getRequestMeta(request), reason }, current, values)
    return Response.json({ data: team })
  },
)

/** `DELETE /api/teams/:id` — soft delete (`02` §2.4) · ทีมที่ยังมีเคสค้างลบไม่ได้ (`09` §10) */
export const DELETE = withApiPermission<RouteContext>(
  'manage',
  'manage_teams',
  toModuleErrorResponse,
  async (request: NextRequest, context, user) => {
    const { id } = await context.params
    const parsed = teamDeleteSchema.safeParse(await readJsonBody(request))
    if (!parsed.success) return validationErrorResponse(parsed.error)

    const current = await getTeam(user, id)
    await deleteTeam({ actor: user, meta: getRequestMeta(request), reason: parsed.data.reason }, current)

    return Response.json({ data: { id: current.id, deleted: true } })
  },
)
