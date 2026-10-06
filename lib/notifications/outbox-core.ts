import { createHash, randomUUID } from 'node:crypto'
import { z } from 'zod'
import { NOTIFICATION_EVENT_CODES, type NotificationEventCode } from '@/lib/notifications/events'
import type { NotificationMessage } from '@/lib/notifications/messages'

/**
 * แกน pure ของคิวแจ้งเตือน (DEC-015 · มติ PO U120) — รูปแบบ payload · กุญแจกันซ้ำ · จังหวะ retry
 *
 * แยกจาก `outbox.ts` (ตัวที่แตะ DB) เพื่อเทสต์แบบไม่ต้องมี DB และให้ schema ของ payload มีที่เดียว
 */

/** ส่งไม่สำเร็จครบเท่านี้ครั้ง = `failed` (ค่า default ของคอลัมน์ `max_attempts`) */
export const OUTBOX_DEFAULT_MAX_ATTEMPTS = 8

/** เวลาที่แถวถูก "จอง" ระหว่างกำลังส่ง — ตัวส่งตายกลางทาง แถวกลับมาให้รอบถัดไปหยิบเองเมื่อพ้นเวลานี้ */
export const OUTBOX_CLAIM_LEASE_MS = 5 * 60 * 1000

const MINUTE_MS = 60 * 1000
/** เพดาน backoff — cron รันทุก 10 นาที รอนานกว่าชั่วโมงไม่ได้ช่วยอะไร */
const MAX_RETRY_DELAY_MS = 60 * MINUTE_MS

const eventCodeSchema = z.enum(NOTIFICATION_EVENT_CODES as [NotificationEventCode, ...NotificationEventCode[]])

/** แจ้งเตือนสำเร็จรูป 1 ผู้รับ (ผู้รับ/ข้อความรู้ตั้งแต่ตอนเข้าคิว) */
const messagePayloadSchema = z.object({
  kind: z.literal('message'),
  userId: z.uuid(),
  eventCode: eventCodeSchema,
  title: z.string().min(1),
  body: z.string().nullable(),
  linkPath: z.string().nullable(),
  /** กุญแจกันซ้ำของแถว `notifications` — มีเสมอ ⇒ ส่งซ้ำกี่รอบก็ได้แถวเดียว */
  dedupeKey: z.string().min(1),
})

/**
 * แจ้งผู้อนุมัติของรายการเบิกที่เพิ่งเข้าคิว (มติ PO U29) — ผู้รับต้องหาจากข้อมูลที่ **commit แล้ว**
 * (ขั้น/สายอนุมัติของรายการ) ⇒ เก็บแค่ id แล้วให้ตัวส่ง resolve ตอนส่ง
 */
const expenseApprovalPayloadSchema = z.object({
  kind: z.literal('expense_approval_queue'),
  expenseIds: z.array(z.uuid()).min(1),
})

export const outboxPayloadSchema = z.discriminatedUnion('kind', [messagePayloadSchema, expenseApprovalPayloadSchema])

export type OutboxPayload = z.infer<typeof outboxPayloadSchema>
export type OutboxMessagePayload = z.infer<typeof messagePayloadSchema>

/** แถวที่จะเขียนลงคิว (ยังไม่ผูกกับ job — ผู้เรียกเติม source ตอนเขียน) */
export interface OutboxEntry {
  organizationId: string
  dedupeKey: string
  payload: OutboxPayload
}

/**
 * แตกข้อความหนึ่งชิ้นเป็นแถวคิว **หนึ่งแถวต่อผู้รับ** — ผู้รับแต่ละคน retry แยกกันได้
 * (คนหนึ่งล้มไม่ทำให้อีกคนได้ซ้ำ) · ข้อความที่ไม่มี `dedupeKey` ได้กุญแจสุ่มประจำแถว
 * ⇒ ตัวส่ง retry แล้วยังไม่แจ้งซ้ำ แต่การเข้าคิวแต่ละครั้งนับเป็นเหตุการณ์ใหม่ (ตรงกับความหมายเดิม)
 */
export function outboxMessageEntries(
  organizationId: string,
  userIds: readonly string[],
  message: NotificationMessage,
): OutboxEntry[] {
  const recipients = [...new Set(userIds)].filter((id) => id !== '')
  return recipients.map((userId) => {
    const notificationKey = message.dedupeKey ?? `outbox-${randomUUID()}`
    return {
      organizationId,
      dedupeKey: ['message', message.eventCode, userId, notificationKey].join('|'),
      payload: {
        kind: 'message',
        userId,
        eventCode: message.eventCode,
        title: message.title,
        body: message.body,
        linkPath: message.linkPath,
        dedupeKey: notificationKey,
      },
    }
  })
}

/** แถวคิว "แจ้งผู้อนุมัติของรายการเบิกชุดนี้" — ไม่มีรายการ = ไม่มีแถว */
export function outboxExpenseApprovalEntries(organizationId: string, expenseIds: readonly string[]): OutboxEntry[] {
  const ids = [...new Set(expenseIds)].sort()
  if (ids.length === 0) return []
  const digest = createHash('sha256').update(ids.join(',')).digest('hex').slice(0, 40)
  return [
    {
      organizationId,
      dedupeKey: `expense_approval_queue|${digest}`,
      payload: { kind: 'expense_approval_queue', expenseIds: ids },
    },
  ]
}

/**
 * รอก่อนลองใหม่หลังส่งไม่สำเร็จครั้งที่ `attempt` (นับจาก 1): 1, 2, 4, 8 … นาที เพดาน 60 นาที
 */
export function outboxRetryDelayMs(attempt: number): number {
  const exponent = Math.max(0, Math.floor(attempt) - 1)
  return Math.min(MINUTE_MS * 2 ** Math.min(exponent, 16), MAX_RETRY_DELAY_MS)
}

/** ผลของการส่งไม่สำเร็จ: ครบเพดาน = `failed` (เลิกลอง) · ยังไม่ครบ = รอ backoff แล้วลองใหม่ */
export function outboxFailureOutcome(
  attempt: number,
  maxAttempts: number,
  now: Date,
): { status: 'failed' } | { status: 'pending'; availableAt: Date } {
  if (attempt >= maxAttempts) return { status: 'failed' }
  return { status: 'pending', availableAt: new Date(now.getTime() + outboxRetryDelayMs(attempt)) }
}

/** ข้อความ error ที่เก็บลง `last_error` — ตัดยาวกันแถวบวม */
export function outboxErrorText(error: unknown): string {
  const text = error instanceof Error ? `${error.name}: ${error.message}` : String(error)
  return text.length > 1000 ? `${text.slice(0, 1000)}…` : text
}
