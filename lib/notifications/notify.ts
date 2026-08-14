import { sendPushToUsers, type PushPayload } from '@/lib/notifications/push'
import { prisma } from '@/lib/prisma'

/**
 * แจ้งเตือนผู้ใช้ (`41` §15 · `90` §6.3) — **in-app เสมอ + push ถ้ามี**
 *
 * ลำดับที่บังคับ: เขียนแถว `notifications` ให้สำเร็จก่อน (fallback หลักที่ผู้ใช้เห็นตอนเปิดแอป)
 * แล้วค่อยยิง push แบบ best-effort — push ล้มเหลวห้ามทำให้ flow ธุรกิจล้มตาม
 *
 * ⚠️ เรียก **หลัง** `$transaction` commit แล้วเท่านั้น (ตัวนี้มี I/O ภายนอก)
 * ⚠️ `eventCode` ต้องเป็นชื่อในทะเบียน (`lib/api/event-names.ts`) — กฎ ESLint ตรวจให้
 */

export interface NotifyInput {
  organizationId: string
  /** ผู้รับ — ซ้ำได้ ระบบ dedupe ให้ */
  userIds: readonly string[]
  eventCode: string
  title: string
  body?: string | null
  linkPath?: string | null
}

export interface NotifyResult {
  created: number
  pushed: number
}

export async function notifyUsers(input: NotifyInput): Promise<NotifyResult> {
  const userIds = [...new Set(input.userIds)].filter((id) => id !== '')
  if (userIds.length === 0) return { created: 0, pushed: 0 }

  const created = await prisma.notification.createMany({
    data: userIds.map((userId) => ({
      organizationId: input.organizationId,
      userId,
      eventCode: input.eventCode,
      title: input.title,
      body: input.body ?? null,
      linkPath: input.linkPath ?? null,
    })),
  })

  const payload: PushPayload = {
    title: input.title,
    body: input.body ?? null,
    linkPath: input.linkPath ?? null,
    eventCode: input.eventCode,
  }
  const pushed = await sendPushToUsers(userIds, payload)

  return { created: created.count, pushed }
}

/**
 * เวอร์ชัน "ยิงแล้วลืม" สำหรับจุดที่ไม่อยากให้การแจ้งเตือนถ่วง response
 * (ยังคง log ไว้ที่ server ถ้าล้ม — ไม่โยนต่อ)
 */
export function notifyUsersDetached(input: NotifyInput): void {
  void notifyUsers(input).catch((error: unknown) => {
    console.error('[notify] ส่งการแจ้งเตือนไม่สำเร็จ', { eventCode: input.eventCode, error })
  })
}
