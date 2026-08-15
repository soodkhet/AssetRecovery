import type { NextRequest } from 'next/server'
import { withEndpoint } from '@/lib/api/http'
import { FIELD_CAPABILITY } from '@/lib/field/permissions'
import { listNotifications, type NotificationListDto } from '@/lib/notifications/queries'

/**
 * `GET /api/field/notifications` (`41` §15)
 * fallback หลักของการแจ้งเตือน — ผู้ใช้เห็นรายการที่ต้องรู้เสมอตอนเปิดแอป แม้ push จะหลุด
 * เห็นเฉพาะของตัวเองเท่านั้น (กรอง `user_id` ในชั้น service)
 *
 * ⚠️ ตั้งแต่ Phase 5.1 หน้าจอ (กระดิ่งกลาง `components/notifications/notification-bell.tsx`) ใช้
 * `GET /api/notifications` (`90` §14) แทน — endpoint นี้คงไว้ตามสัญญา `45` §6.3 สำหรับผู้เรียกฝั่ง
 * Field โดยตรง (ข้อมูลชุดเดียวกัน service เดียวกัน)
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
