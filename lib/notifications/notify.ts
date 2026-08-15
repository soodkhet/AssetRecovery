import { after } from 'next/server'
import { notificationDedupeId } from '@/lib/notifications/dedupe'
import type { NotificationEventCode } from '@/lib/notifications/events'
import { sendPushToUsers, type PushPayload } from '@/lib/notifications/push'
import { prisma } from '@/lib/prisma'

/**
 * แจ้งเตือนผู้ใช้ (`41` §15 · `90` §6.3) — **in-app เสมอ + push ถ้ามี**
 *
 * ลำดับที่บังคับ: เขียนแถว `notifications` ให้สำเร็จก่อน (fallback หลักที่ผู้ใช้เห็นตอนเปิดแอป)
 * แล้วค่อยยิง push แบบ best-effort — push ล้มเหลวห้ามทำให้ flow ธุรกิจล้มตาม
 *
 * ⚠️ เรียก **หลัง** `$transaction` commit แล้วเท่านั้น (ตัวนี้มี I/O ภายนอก)
 * ⚠️ `eventCode` ต้องอยู่ในแค็ตตาล็อก `lib/notifications/events.ts` (`90` §6.3) — TypeScript บังคับให้
 */

export interface NotifyInput {
  organizationId: string
  /** ผู้รับ — ซ้ำได้ ระบบ dedupe ให้ */
  userIds: readonly string[]
  eventCode: NotificationEventCode
  title: string
  body?: string | null
  linkPath?: string | null
  /**
   * กุญแจของ "เหตุการณ์" สำหรับกันแจ้งซ้ำ (idempotent — PLAN §5.1)
   * เช่น `lot-<id>` / `payout-<id>` / `case-<id>-r2` · ไม่ส่ง = แจ้งใหม่ทุกครั้งที่เรียก
   *
   * ส่งแล้ว: เรียกซ้ำกี่ครั้งก็ได้แถวเดียวต่อผู้รับหนึ่งคน (กันที่ PRIMARY KEY ระดับ DB)
   */
  dedupeKey?: string | null
}

export interface NotifyResult {
  created: number
  /** ถูกกันเพราะเคยแจ้งเหตุการณ์เดียวกันไปแล้ว (มีค่าเมื่อส่ง `dedupeKey`) */
  skipped: number
  pushed: number
}

export async function notifyUsers(input: NotifyInput): Promise<NotifyResult> {
  const userIds = [...new Set(input.userIds)].filter((id) => id !== '')
  if (userIds.length === 0) return { created: 0, skipped: 0, pushed: 0 }

  const row = (userId: string) => ({
    organizationId: input.organizationId,
    userId,
    eventCode: input.eventCode,
    title: input.title,
    body: input.body ?? null,
    linkPath: input.linkPath ?? null,
  })

  const dedupeKey = input.dedupeKey ?? null
  let recipients = userIds
  let created = 0

  if (dedupeKey === null) {
    created = (await prisma.notification.createMany({ data: userIds.map((userId) => row(userId)) })).count
  } else {
    const idOf = (userId: string) =>
      notificationDedupeId({
        organizationId: input.organizationId,
        userId,
        eventCode: input.eventCode,
        dedupeKey,
      })

    const ids = new Map(userIds.map((userId) => [userId, idOf(userId)]))
    const existing = new Set(
      (
        await prisma.notification.findMany({
          where: { id: { in: [...ids.values()] } },
          select: { id: true },
        })
      ).map((found) => found.id),
    )

    // ผู้รับที่ "ยังไม่เคยได้" เท่านั้นที่ได้ push — ถ้ามีเรซจริง ๆ อย่างมากคือ push ซ้ำหนึ่งครั้ง
    // แต่แถวใน DB ไม่มีทางซ้ำ เพราะ id ชนกันที่ PRIMARY KEY (`skipDuplicates`)
    recipients = userIds.filter((userId) => !existing.has(ids.get(userId) ?? ''))
    if (recipients.length > 0) {
      created = (
        await prisma.notification.createMany({
          data: recipients.map((userId) => ({ id: ids.get(userId), ...row(userId) })),
          skipDuplicates: true,
        })
      ).count
    }
  }

  const payload: PushPayload = {
    title: input.title,
    body: input.body ?? null,
    linkPath: input.linkPath ?? null,
    eventCode: input.eventCode,
  }
  const pushed = recipients.length === 0 ? 0 : await sendPushToUsers(recipients, payload, input.organizationId)

  return { created, skipped: userIds.length - recipients.length, pushed }
}

function runNotify(input: NotifyInput): Promise<void> {
  return notifyUsers(input).then(
    () => undefined,
    (error: unknown) => {
      console.error('[notify] ส่งการแจ้งเตือนไม่สำเร็จ', { eventCode: input.eventCode, error })
    },
  )
}

/**
 * เวอร์ชัน "ยิงแล้วลืม" สำหรับจุดที่ไม่อยากให้การแจ้งเตือนถ่วง response
 * (ยังคง log ไว้ที่ server ถ้าล้ม — ไม่โยนต่อ)
 *
 * ⚠️ ต้องผูกกับ lifecycle ของ request ผ่าน `after()` ของ Next — hosting คือ Vercel (DEC-001)
 * ซึ่ง **freeze instance ทันทีที่ส่ง response** ⇒ promise ลอย ๆ ที่ยังทำงานไม่เสร็จถูกตัดกลางคัน
 * แถวแจ้งเตือนหายเงียบโดยไม่มี log · `after()` เรียกได้เฉพาะใน request scope ⇒ นอก scope
 * (job/สคริปต์/เทสต์) ถอยไปใช้ promise ลอยแบบเดิมซึ่งปลอดภัยในบริบทที่ process ไม่ถูก freeze
 */
export function notifyUsersDetached(input: NotifyInput): void {
  try {
    after(() => runNotify(input))
  } catch {
    void runNotify(input)
  }
}
