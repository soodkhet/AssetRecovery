import type { NextRequest } from 'next/server'
import { validationErrorResponse, withEndpoint } from '@/lib/api/http'
import { getTeamKanban } from '@/lib/assignments/agent-queries'
import { ASSIGNMENT_READ_CAPABILITIES } from '@/lib/assignments/permissions'
import { kanbanQuerySchema } from '@/lib/assignments/schemas'
import type { KanbanBoardDto } from '@/lib/assignments/types'

/**
 * `GET /api/teams/:team_id/kanban` (`40` §7.5 · §17.1 · `45` §6.2)
 * 1 คอลัมน์ = 1 พนักงาน · filter ทำที่ระดับการ์ด — **คอลัมน์ว่างยังต้องแสดง** (`40` §20)
 */
type RouteContext = { params: Promise<{ id: string }> }

export const GET = withEndpoint<RouteContext, KanbanBoardDto>({
  endpoint: 'assignment.teamKanban',
  action: 'view',
  resource: ASSIGNMENT_READ_CAPABILITIES,
  handler: async (request: NextRequest, context, user) => {
    const { id } = await context.params
    const parsed = kanbanQuerySchema.safeParse(Object.fromEntries(new URL(request.url).searchParams.entries()))
    if (!parsed.success) return validationErrorResponse(parsed.error)
    return { data: await getTeamKanban(user, id, parsed.data) }
  },
})
