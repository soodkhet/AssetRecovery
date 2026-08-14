import type { NextRequest } from 'next/server'
import { readJsonBody, validationErrorResponse, withEndpoint } from '@/lib/api/http'
import { getRequestMeta } from '@/lib/auth/request-meta'
import { FIELD_CAPABILITY } from '@/lib/field/permissions'
import { recordCheckin } from '@/lib/field/queries'
import { checkinSchema } from '@/lib/field/schemas'
import type { FieldCheckinResultDto } from '@/lib/field/types'

type RouteContext = { params: Promise<{ id: string }> }

/**
 * `POST /api/field/cases/:id/checkin` (`41` §8 `add_checkin`)
 *
 * ⚠️ พิกัดต้องมาจาก **Geolocation API ของอุปกรณ์** เท่านั้น (`41` §11) — ระบบไม่มีช่องกรอกพิกัดมือ
 * เช็คอินเป็น insert-only เพิ่มได้หลายจุด และ **แก้/ลบไม่ได้ตลอดไป** (หลักฐานปิดงาน)
 */
export const POST = withEndpoint<RouteContext, FieldCheckinResultDto>({
  endpoint: 'field.checkin',
  action: 'manage',
  resource: FIELD_CAPABILITY,
  handler: async (request: NextRequest, context, user) => {
    const { id } = await context.params
    const parsed = checkinSchema.safeParse(await readJsonBody(request))
    if (!parsed.success) return validationErrorResponse(parsed.error)

    const data = await recordCheckin(user, id, parsed.data, { actor: user, meta: getRequestMeta(request) })
    return { data }
  },
})
