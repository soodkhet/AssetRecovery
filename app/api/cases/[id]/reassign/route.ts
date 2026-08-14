import type { NextRequest } from 'next/server'
import { readJsonBody, validationErrorResponse, withEndpoint } from '@/lib/api/http'
import { getRequestMeta } from '@/lib/auth/request-meta'
import { ASSIGNMENT_MANAGE_CAPABILITY } from '@/lib/assignments/permissions'
import { reassignCase } from '@/lib/assignments/queries'
import { reassignCaseSchema } from '@/lib/assignments/schemas'
import type { AssignmentActionResultDto } from '@/lib/assignments/types'

/**
 * `POST /api/cases/:id/reassign` (`40` §8/§9 · `45` §6.2)
 *
 * **2 สาขาห้ามสลับกัน**: เคสที่ยัง `assigned` เปลี่ยนทันที · เคสที่ `accepted` แล้วสร้างคำขอรอความยินยอม
 * (`pending_reassignment` — เคสยังเป็นของคนเดิม ทำงานต่อได้ตามปกติ) · `reason` บังคับทั้งสองสาขา
 */
type RouteContext = { params: Promise<{ id: string }> }

export const POST = withEndpoint<RouteContext, AssignmentActionResultDto>({
  endpoint: 'assignment.reassign',
  action: 'manage',
  resource: ASSIGNMENT_MANAGE_CAPABILITY,
  handler: async (request: NextRequest, context, user) => {
    const { id } = await context.params
    const parsed = reassignCaseSchema.safeParse(await readJsonBody(request))
    if (!parsed.success) return validationErrorResponse(parsed.error)

    const data = await reassignCase(user, id, parsed.data, { actor: user, meta: getRequestMeta(request) })
    return { data }
  },
})
