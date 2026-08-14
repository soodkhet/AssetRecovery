import { z } from 'zod'
import type { NextRequest } from 'next/server'
import { readJsonBody, validationErrorResponse, withEndpoint } from '@/lib/api/http'
import { getRequestMeta } from '@/lib/auth/request-meta'
import { FIELD_CAPABILITY } from '@/lib/field/permissions'
import { pushSubscribeSchema } from '@/lib/field/schemas'
import { removePushSubscription, savePushSubscription, type PushSubscriptionDto } from '@/lib/notifications/queries'

const unsubscribeSchema = z.object({ endpoint: z.string().trim().min(1).max(1000) })

/**
 * `POST /api/field/push/subscribe` (`41` §15) — ลงทะเบียนอุปกรณ์รับ Web Push
 * subscribe ซ้ำจากเครื่องเดิม = upsert ตาม `endpoint` (ไม่เกิดแถวซ้ำ · คืนชีพแถวที่เคยยกเลิก)
 */
export const POST = withEndpoint<unknown, PushSubscriptionDto>({
  endpoint: 'field.pushSubscribe',
  action: 'view',
  resource: FIELD_CAPABILITY,
  handler: async (request: NextRequest, _context, user) => {
    const parsed = pushSubscribeSchema.safeParse(await readJsonBody(request))
    if (!parsed.success) return validationErrorResponse(parsed.error)

    const meta = getRequestMeta(request)
    const data = await savePushSubscription(user, parsed.data, { actor: user, meta }, meta.userAgent ?? null)
    return { data, status: 201 }
  },
})

/** `DELETE /api/field/push/subscribe` (`41` §15) — ยกเลิกเฉพาะอุปกรณ์นั้นของผู้เรียกเอง */
export const DELETE = withEndpoint<unknown, { removed: number }>({
  endpoint: 'field.pushUnsubscribe',
  action: 'view',
  resource: FIELD_CAPABILITY,
  handler: async (request: NextRequest, _context, user) => {
    const parsed = unsubscribeSchema.safeParse(await readJsonBody(request))
    if (!parsed.success) return validationErrorResponse(parsed.error)

    const data = await removePushSubscription(user, parsed.data.endpoint, {
      actor: user,
      meta: getRequestMeta(request),
    })
    return { data }
  },
})
