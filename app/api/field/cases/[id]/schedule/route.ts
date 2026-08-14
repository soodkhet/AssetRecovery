import type { NextRequest } from 'next/server'
import { readJsonBody, validationErrorResponse, withEndpoint } from '@/lib/api/http'
import { getRequestMeta } from '@/lib/auth/request-meta'
import { FIELD_CAPABILITY } from '@/lib/field/permissions'
import { scheduleFieldCase } from '@/lib/field/queries'
import { scheduleCaseSchema } from '@/lib/field/schemas'
import type { FieldActionResultDto } from '@/lib/field/types'

type RouteContext = { params: Promise<{ id: string }> }

/**
 * `POST /api/field/cases/:id/schedule` (`41` §8 `schedule_case`) — จัดวันลงพื้นที่
 * ลำดับของวันนั้นต่อท้ายเสมอ (`nextScheduleOrder`) — สลับทีหลังด้วย `PATCH /api/field/cases/reorder`
 */
export const POST = withEndpoint<RouteContext, FieldActionResultDto>({
  endpoint: 'field.scheduleCase',
  action: 'manage',
  resource: FIELD_CAPABILITY,
  handler: async (request: NextRequest, context, user) => {
    const { id } = await context.params
    const parsed = scheduleCaseSchema.safeParse(await readJsonBody(request))
    if (!parsed.success) return validationErrorResponse(parsed.error)

    const data = await scheduleFieldCase(user, id, parsed.data, { actor: user, meta: getRequestMeta(request) })
    return { data }
  },
})
