import type { NextRequest } from 'next/server'
import { readJsonBody, toModuleErrorResponse, validationErrorResponse, withApiPermission } from '@/lib/api/http'
import { getRequestMeta } from '@/lib/auth/request-meta'
import { getTeam, setTeamManager } from '@/lib/teams/queries'
import { teamDeleteSchema } from '@/lib/teams/schemas'

type RouteContext = { params: Promise<{ id: string; userId: string }> }

/**
 * `DELETE /api/teams/:id/managers/:userId` (`09` §14) — ถอดผู้จัดการออกจากทีม
 * `reason` บังคับเหมือนทุก mutation ของทีม (`90` §13) — ส่งมาใน body
 */
export const DELETE = withApiPermission<RouteContext>(
  'manage',
  'manage_teams',
  toModuleErrorResponse,
  async (request: NextRequest, context, user) => {
    const { id, userId } = await context.params
    const parsed = teamDeleteSchema.safeParse(await readJsonBody(request))
    if (!parsed.success) return validationErrorResponse(parsed.error)

    const current = await getTeam(user, id)
    const team = await setTeamManager(
      { actor: user, meta: getRequestMeta(request), reason: parsed.data.reason },
      current,
      userId,
      false,
    )

    return Response.json({ data: team })
  },
)
