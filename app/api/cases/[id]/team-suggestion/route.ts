import type { NextRequest } from 'next/server'
import { withEndpoint } from '@/lib/api/http'
import { CASE_READ_CAPABILITIES } from '@/lib/cases/permissions'
import { getCaseTeamSuggestion } from '@/lib/cases/status-queries'
import type { CaseTeamSuggestionDto } from '@/lib/cases/types'

type RouteContext = { params: Promise<{ id: string }> }

/**
 * `GET /api/cases/:id/team-suggestion` (`38` §7.4 · §17.1) — จับคู่จาก **จังหวัดของที่อยู่ปัจจุบัน** ตัวเดียว
 * ไม่มีทีมตรง → `noMatch: true` (ไม่ใช่ error เพราะหน้าจอต้องแสดงสถานะนี้ได้ — block จริงตอน `accept`)
 */
export const GET = withEndpoint<RouteContext, CaseTeamSuggestionDto>({
  endpoint: 'case.teamSuggestion',
  action: 'view',
  resource: CASE_READ_CAPABILITIES,
  handler: async (_request: NextRequest, context, user) => {
    const { id } = await context.params
    return { data: await getCaseTeamSuggestion(user, id) }
  },
})
