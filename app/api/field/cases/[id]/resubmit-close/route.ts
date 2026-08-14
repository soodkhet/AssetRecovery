import type { NextRequest } from 'next/server'
import { readJsonBody, validationErrorResponse, withEndpoint } from '@/lib/api/http'
import { getRequestMeta } from '@/lib/auth/request-meta'
import { FIELD_CAPABILITY } from '@/lib/field/permissions'
import { resubmitCloseCase } from '@/lib/field/queries'
import { resubmitCloseSchema } from '@/lib/field/schemas'
import type { FieldActionResultDto } from '@/lib/field/types'

type RouteContext = { params: Promise<{ id: string }> }

/**
 * `POST /api/field/cases/:id/resubmit-close` (`41` §8 `resubmit_close_case`)
 *
 * เจ้าของเคสเท่านั้น (บังคับที่ `loadOwnAssignment()` ในชั้น service) · แก้ได้เฉพาะสื่อ —
 * outcome/เช็คอินล็อกตามรอบแรก และรายการเบิกรอบเดิมถูก `superseded` แล้วสร้างใหม่ (`41` §10.1)
 */
export const POST = withEndpoint<RouteContext, FieldActionResultDto>({
  endpoint: 'field.resubmitClose',
  action: 'manage',
  resource: FIELD_CAPABILITY,
  handler: async (request: NextRequest, context, user) => {
    const { id } = await context.params
    const parsed = resubmitCloseSchema.safeParse(await readJsonBody(request))
    if (!parsed.success) return validationErrorResponse(parsed.error)

    const data = await resubmitCloseCase(user, id, parsed.data, { actor: user, meta: getRequestMeta(request) })
    return { data }
  },
})
