import { z } from 'zod'
import type { NextRequest } from 'next/server'
import { readJsonBody, validationErrorResponse, withEndpoint } from '@/lib/api/http'
import { FIELD_CAPABILITY } from '@/lib/field/permissions'
import { markNotificationsRead } from '@/lib/notifications/queries'

const markReadSchema = z.object({
  /** ไม่ส่ง = อ่านทั้งหมดของตัวเอง (E11 — เปิด dropdown ไม่ auto-mark หน้าจอเป็นคนสั่ง) */
  ids: z.array(z.uuid()).max(200).optional(),
})

/**
 * `POST /api/field/notifications/read` (`41` §15 · E11)
 *
 * ⚠️ ตั้งแต่ Phase 5.1 หน้าจอใช้ `PATCH /api/notifications/:id/read` + `/read-all` (`90` §14) แทน —
 * endpoint นี้คงไว้ตามสัญญา `45` §6.3 (service เดียวกัน ผลลัพธ์เดียวกัน)
 */
export const POST = withEndpoint<unknown, { updated: number }>({
  endpoint: 'field.notificationRead',
  action: 'view',
  resource: FIELD_CAPABILITY,
  handler: async (request: NextRequest, _context, user) => {
    const parsed = markReadSchema.safeParse(await readJsonBody(request))
    if (!parsed.success) return validationErrorResponse(parsed.error)

    const data = await markNotificationsRead(user, parsed.data.ids)
    return { data }
  },
})
