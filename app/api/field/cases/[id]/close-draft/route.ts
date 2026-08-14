import type { NextRequest } from 'next/server'
import { readJsonBody, validationErrorResponse, withEndpoint } from '@/lib/api/http'
import { getRequestMeta } from '@/lib/auth/request-meta'
import { FIELD_CAPABILITY } from '@/lib/field/permissions'
import { saveCloseDraft } from '@/lib/field/queries'
import { closeDraftSchema } from '@/lib/field/schemas'
import type { FieldCloseDraftResultDto } from '@/lib/field/types'

type RouteContext = { params: Promise<{ id: string }> }

/**
 * `POST /api/field/cases/:id/close-draft` (`41` §6.5 · §8 `save_close_draft`)
 *
 * draft 1:1 ต่อรอบติดตาม · autoload ตอนเปิดฟอร์มซ้ำ · **ไม่มี expiry** (`41` §11)
 * `travelOrigin` ที่ส่งมาด้วย = ตอนกด "เริ่มงาน" (auto GPS) หรือหลังลากปรับตำแหน่ง (`41` §6.4.1)
 */
export const POST = withEndpoint<RouteContext, FieldCloseDraftResultDto>({
  endpoint: 'field.closeDraft',
  action: 'manage',
  resource: FIELD_CAPABILITY,
  handler: async (request: NextRequest, context, user) => {
    const { id } = await context.params
    const parsed = closeDraftSchema.safeParse(await readJsonBody(request))
    if (!parsed.success) return validationErrorResponse(parsed.error)

    const data = await saveCloseDraft(user, id, parsed.data, { actor: user, meta: getRequestMeta(request) })
    return { data }
  },
})
