import { withEndpoint } from '@/lib/api/http'
import { listTeamAgents } from '@/lib/assignments/agent-queries'
import { ASSIGNMENT_READ_CAPABILITIES } from '@/lib/assignments/permissions'
import type { TeamAgentsResultDto } from '@/lib/assignments/types'

/**
 * `GET /api/teams/:team_id/agents` (`40` §17.1 · `45` §6.2)
 * รายชื่อพนักงานในทีม + ข้อมูลประกอบการตัดสินใจ (`active_case_count`, `success_rate`, `covered_provinces`)
 *
 * ⚠️ โฟลเดอร์ใช้ `[id]` ตามพารามิเตอร์เดิมของ `/api/teams/[id]` (Next.js ห้ามตั้งชื่อ dynamic segment
 * ต่างกันในระดับเดียวกัน) — URL ที่ได้ตรงกับ contract `/api/teams/:team_id/agents` ทุกประการ
 *
 * สิทธิ์ดูข้อมูลชุดนี้ไม่ผูกกับ `supervisor_can_assign_*` (`40` §13 — read scope แยกจากการกระทำ)
 */
type RouteContext = { params: Promise<{ id: string }> }

export const GET = withEndpoint<RouteContext, TeamAgentsResultDto>({
  endpoint: 'assignment.teamAgents',
  action: 'view',
  resource: ASSIGNMENT_READ_CAPABILITIES,
  handler: async (_request, context, user) => {
    const { id } = await context.params
    return { data: await listTeamAgents(user, id) }
  },
})
