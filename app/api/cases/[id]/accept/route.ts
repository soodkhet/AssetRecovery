import type { NextRequest } from 'next/server'
import { withEndpoint } from '@/lib/api/http'
import { getRequestMeta } from '@/lib/auth/request-meta'
import { ASSIGNMENT_AGENT_CAPABILITY } from '@/lib/assignments/permissions'
import { acceptAssignment } from '@/lib/assignments/queries'
import type { AssignmentActionResultDto } from '@/lib/assignments/types'

/**
 * `POST /api/cases/:id/accept` (`40` §8 · `45` §6.2) — พนักงานกดรับงาน
 *
 * hard gate ระหว่างไฟล์ 40 กับ 41: เคสที่ยังไม่ `accepted` จะไม่ถูกดึงเข้ารอบจัดเส้นทางใด ๆ (`40` §11)
 */
type RouteContext = { params: Promise<{ id: string }> }

export const POST = withEndpoint<RouteContext, AssignmentActionResultDto>({
  endpoint: 'assignment.accept',
  action: 'manage',
  resource: ASSIGNMENT_AGENT_CAPABILITY,
  handler: async (request: NextRequest, context, user) => {
    const { id } = await context.params
    const data = await acceptAssignment(user, id, { actor: user, meta: getRequestMeta(request) })
    return { data }
  },
})
