import type { NextRequest } from 'next/server'
import { withEndpoint } from '@/lib/api/http'
import { FIELD_CAPABILITY } from '@/lib/field/permissions'
import { listNotifications, type NotificationListDto } from '@/lib/notifications/queries'

/**
 * `GET /api/field/notifications` (`41` §15)
 * fallback หลักของการแจ้งเตือน — ผู้ใช้เห็นรายการที่ต้องรู้เสมอตอนเปิดแอป แม้ push จะหลุด
 * เห็นเฉพาะของตัวเองเท่านั้น (กรอง `user_id` ในชั้น service)
 */
export const GET = withEndpoint<unknown, NotificationListDto>({
  endpoint: 'field.notificationList',
  action: 'view',
  resource: FIELD_CAPABILITY,
  handler: async (_request: NextRequest, _context, user) => {
    const data = await listNotifications(user)
    return { data }
  },
})
