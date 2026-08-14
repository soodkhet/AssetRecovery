import type { NextRequest } from 'next/server'
import { readJsonBody, toModuleErrorResponse, validationErrorResponse, withApiPermission } from '@/lib/api/http'
import { getRequestMeta } from '@/lib/auth/request-meta'
import { getTeam, setTeamManager } from '@/lib/teams/queries'
import { teamManagerSchema } from '@/lib/teams/schemas'

type RouteContext = { params: Promise<{ id: string }> }

/**
 * `POST /api/teams/:id/managers` (`09` §14) — เพิ่มผู้จัดการ 1 คนเข้าทีม (insert `team_managers`)
 * **ผู้จัดการ 1 คนดูแลได้หลายทีม** (N:N) ต่างจากหัวหน้าทีมที่สังกัดได้ทีมเดียว (`09` §7.1)
 */
export const POST = withApiPermission<RouteContext>(
  'manage',
  'manage_teams',
  toModuleErrorResponse,
  async (request: NextRequest, context, user) => {
    const { id } = await context.params
    const parsed = teamManagerSchema.safeParse(await readJsonBody(request))
    if (!parsed.success) return validationErrorResponse(parsed.error)

    const current = await getTeam(user, id)
    const team = await setTeamManager(
      { actor: user, meta: getRequestMeta(request), reason: parsed.data.reason },
      current,
      parsed.data.userId,
      true,
    )

    return Response.json({ data: team })
  },
)
