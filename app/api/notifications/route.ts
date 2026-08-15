import type { NextRequest } from 'next/server'
import { apiSuccess } from '@/lib/api/envelope'
import { validationErrorResponse } from '@/lib/api/http'
import { withAuthErrors } from '@/lib/auth/require-permission'
import { requireSession } from '@/lib/auth/session'
import { listNotifications } from '@/lib/notifications/queries'
import { notificationListQuerySchema } from '@/lib/notifications/schemas'

/**
 * `GET /api/notifications` (`90` §14) — การแจ้งเตือนของ **ผู้เรียกเอง** เท่านั้น
 *
 * สิทธิ์: ต้อง login + บัญชี active + session ไม่หมดอายุ (`requireSession()` บังคับครบสามข้อ)
 * ไม่ผูกกับ capability ใด ๆ โดยตั้งใจ — `90` §12 กำหนด capability ไว้เฉพาะ "ดู audit" กับ
 * "จัดการกฎแจ้งเตือน" ไม่ใช่การอ่านกล่องของตัวเอง และทุก role ต้องเห็นกระดิ่งของตัวเองได้
 * (เหมือน `GET /api/meta/menu` / `GET /api/auth/session`) · การกรอง `user_id` อยู่ในชั้น service
 * ⇒ ไม่มีทางอ่านของคนอื่นแม้ส่ง query อะไรมาก็ตาม
 */
export const GET = withAuthErrors(async (request: NextRequest) => {
  const user = await requireSession()

  const parsed = notificationListQuerySchema.safeParse(Object.fromEntries(new URL(request.url).searchParams))
  if (!parsed.success) return validationErrorResponse(parsed.error)

  return apiSuccess(await listNotifications(user, parsed.data))
})
