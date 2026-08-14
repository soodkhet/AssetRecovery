import type { NextRequest } from 'next/server'
import { readJsonBody, validationErrorResponse, withEndpoint } from '@/lib/api/http'
import { getRequestMeta } from '@/lib/auth/request-meta'
import { FIELD_CAPABILITY } from '@/lib/field/permissions'
import { closeFieldCase } from '@/lib/field/queries'
import { closeCaseSchema } from '@/lib/field/schemas'
import type { FieldActionResultDto } from '@/lib/field/types'

type RouteContext = { params: Promise<{ id: string }> }

/**
 * `POST /api/field/cases/:id/close` (`41` §8 `submit_close_case`)
 *
 * หลักฐานบังคับตาม outcome (`41` §12) ตรวจที่ `assertCloseEvidence()` — error ที่ผู้ใช้เห็นจึงเป็น
 * `CLOSE_*` ตามสเปค ไม่ใช่ `REQUIRED_MISSING` ของ Zod · การสร้างรายการเบิกอัตโนมัติอยู่ Phase 2.9
 */
export const POST = withEndpoint<RouteContext, FieldActionResultDto>({
  endpoint: 'field.closeCase',
  action: 'manage',
  resource: FIELD_CAPABILITY,
  handler: async (request: NextRequest, context, user) => {
    const { id } = await context.params
    const parsed = closeCaseSchema.safeParse(await readJsonBody(request))
    if (!parsed.success) return validationErrorResponse(parsed.error)

    const data = await closeFieldCase(user, id, parsed.data, { actor: user, meta: getRequestMeta(request) })
    return { data }
  },
})
