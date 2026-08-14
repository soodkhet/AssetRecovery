import { withEndpoint } from '@/lib/api/http'
import { listAgentCases } from '@/lib/assignments/agent-queries'
import { ASSIGNMENT_READ_CAPABILITIES } from '@/lib/assignments/permissions'
import type { AgentCasesResultDto } from '@/lib/assignments/types'

/**
 * `GET /api/teams/:team_id/agents/:agent_id/cases` (`40` §17.1 · `45` §6.2)
 * เคสที่พนักงานคนนี้ถือครองอยู่ — ใช้ทั้ง toggle ใน agent picker และการ์ดของ Kanban (`40` §7.3/§7.5)
 */
type RouteContext = { params: Promise<{ id: string; agent_id: string }> }

export const GET = withEndpoint<RouteContext, AgentCasesResultDto>({
  endpoint: 'assignment.agentCases',
  action: 'view',
  resource: ASSIGNMENT_READ_CAPABILITIES,
  handler: async (_request, context, user) => {
    const { id, agent_id: agentId } = await context.params
    return { data: await listAgentCases(user, id, agentId) }
  },
})
