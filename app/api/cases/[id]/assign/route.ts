import type { NextRequest } from 'next/server'
import { readJsonBody, validationErrorResponse, withEndpoint } from '@/lib/api/http'
import { getRequestMeta } from '@/lib/auth/request-meta'
import { ASSIGNMENT_MANAGE_CAPABILITY } from '@/lib/assignments/permissions'
import { assignCase } from '@/lib/assignments/queries'
import { assignCaseSchema } from '@/lib/assignments/schemas'
import type { AssignmentActionResultDto } from '@/lib/assignments/types'

/**
 * `POST /api/cases/:id/assign` (`40` §8 · §17.1 · `45` §6.2) — มอบหมายเคสให้พนักงาน 1 คน
 *
 * capability ที่ตัวห่อตรวจคือ `assign_case` — ยามที่เหลืออยู่ในชั้น service:
 * settings ต่อ Role Group (`40` §6.4), scope ของเคส, และทีมของพนักงานต้องตรงกับทีมของเคส (§11)
 */
type RouteContext = { params: Promise<{ id: string }> }

export const POST = withEndpoint<RouteContext, AssignmentActionResultDto>({
  endpoint: 'assignment.assign',
  action: 'manage',
  resource: ASSIGNMENT_MANAGE_CAPABILITY,
  handler: async (request: NextRequest, context, user) => {
    const { id } = await context.params
    const parsed = assignCaseSchema.safeParse(await readJsonBody(request))
    if (!parsed.success) return validationErrorResponse(parsed.error)

    const data = await assignCase(user, id, parsed.data, { actor: user, meta: getRequestMeta(request) })
    return { data, status: 201 }
  },
})
