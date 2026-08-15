import { z } from 'zod'

/**
 * Zod schema ชุดเดียวใช้ร่วม FE/BE ของศูนย์แจ้งเตือน (`90` §14 · Rule 04)
 * — ไฟล์นี้ pure ล้วน (ไม่มี Prisma/`next/*`) หน้าจอ import ได้โดยไม่ลาก server เข้า bundle
 */

/** เพดานรายการต่อครั้ง — กระดิ่งขอแค่ 5–10 หน้ารายการเต็มขอได้ถึงเพดานนี้ */
export const NOTIFICATION_LIST_MAX = 100

export const notificationFilterSchema = z.enum(['all', 'unread'])
export type NotificationFilter = z.infer<typeof notificationFilterSchema>

export const notificationListQuerySchema = z.object({
  filter: notificationFilterSchema.default('all'),
  limit: z.coerce.number().int().min(1).max(NOTIFICATION_LIST_MAX).optional(),
})
export type NotificationListQuery = z.infer<typeof notificationListQuerySchema>
