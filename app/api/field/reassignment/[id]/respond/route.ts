import type { NextRequest } from 'next/server'
import { readJsonBody, validationErrorResponse, withEndpoint } from '@/lib/api/http'
import { getRequestMeta } from '@/lib/auth/request-meta'
import { FIELD_CAPABILITY } from '@/lib/field/permissions'
import { respondFieldReassignment } from '@/lib/field/queries'
import { respondFieldReassignmentSchema } from '@/lib/field/schemas'
import type { FieldActionResultDto } from '@/lib/field/types'

type RouteContext = { params: Promise<{ id: string }> }

/**
 * `POST /api/field/reassignment/:id/respond` (`41` §7.8 · §8)
 *
 * `:id` = `pending_reassignments.id` (ต่างจากของไฟล์ 40 ที่รับ `case_id`) — ตอบได้เฉพาะคำขอที่
 * ตัวเองเป็นผู้ถือเคสอยู่ · ไม่ยินยอมต้องมีเหตุผล (`REASSIGNMENT_DECLINE_REASON_REQUIRED`)
 * · ตอบช้าเกิน `expires_at` = `REASSIGNMENT_ALREADY_TIMED_OUT` (job resolve ไปแล้ว)
 */
export const POST = withEndpoint<RouteContext, FieldActionResultDto>({
  endpoint: 'field.respondReassignment',
  action: 'manage',
  resource: FIELD_CAPABILITY,
  handler: async (request: NextRequest, context, user) => {
    const { id } = await context.params
    const parsed = respondFieldReassignmentSchema.safeParse(await readJsonBody(request))
    if (!parsed.success) return validationErrorResponse(parsed.error)

    const data = await respondFieldReassignment(user, id, parsed.data, { actor: user, meta: getRequestMeta(request) })
    return { data }
  },
})
