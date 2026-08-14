import type { NextRequest } from 'next/server'
import { readJsonBody, validationErrorResponse, withEndpoint } from '@/lib/api/http'
import { getRequestMeta } from '@/lib/auth/request-meta'
import { ASSIGNMENT_AGENT_CAPABILITY } from '@/lib/assignments/permissions'
import { respondReassignment } from '@/lib/assignments/queries'
import { respondReassignmentSchema } from '@/lib/assignments/schemas'
import type { AssignmentActionResultDto } from '@/lib/assignments/types'

/**
 * `POST /api/cases/:id/reassignment/respond` (`40` §8 · §12 · `45` §6.2)
 *
 * ตอบได้เฉพาะพนักงานที่ถือเคสอยู่จริง (`PERMISSION_DENIED` ถ้าไม่ใช่) · ไม่ยินยอมต้องมี `declineReason`
 * · ตอบหลัง `expires_at` = `REASSIGNMENT_ALREADY_TIMED_OUT` (job เปลี่ยนให้อัตโนมัติไปแล้ว)
 */
type RouteContext = { params: Promise<{ id: string }> }

export const POST = withEndpoint<RouteContext, AssignmentActionResultDto>({
  endpoint: 'assignment.respondReassignment',
  action: 'manage',
  resource: ASSIGNMENT_AGENT_CAPABILITY,
  handler: async (request: NextRequest, context, user) => {
    const { id } = await context.params
    const parsed = respondReassignmentSchema.safeParse(await readJsonBody(request))
    if (!parsed.success) return validationErrorResponse(parsed.error)

    const data = await respondReassignment(user, id, parsed.data, { actor: user, meta: getRequestMeta(request) })
    return { data }
  },
})
