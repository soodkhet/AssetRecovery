import type { Prisma } from '@/lib/generated/prisma/client'
import { notifyExpensesAwaitingApprovalAwaited } from '@/lib/notifications/approval-queue'
import { dispatchNotificationAwaited } from '@/lib/notifications/dispatch'
import {
  OUTBOX_CLAIM_LEASE_MS,
  outboxErrorText,
  outboxFailureOutcome,
  outboxPayloadSchema,
  type OutboxEntry,
  type OutboxPayload,
} from '@/lib/notifications/outbox-core'
import { prisma } from '@/lib/prisma'

/**
 * คิวแจ้งเตือนของ job (Transactional Outbox — DEC-015 · มติ PO 06/10/2569 U120)
 *
 * ปัญหาที่แก้: job เดิมเปลี่ยนสถานะใน `$transaction` แล้วค่อยเขียนแจ้งเตือน **หลัง** commit — ขั้นแจ้งเตือนล้ม
 * = สถานะเปลี่ยนไปแล้ว รอบหน้าไม่หยิบซ้ำ ⇒ แจ้งเตือนหายถาวร (at-most-once)
 *
 * วิธีใช้ (สองจังหวะ):
 *  1. `enqueueNotificationOutbox(tx, …)` **ใน `$transaction` เดียวกับการเปลี่ยนสถานะ** — rollback = ไม่มีแถว
 *  2. `drainNotificationOutbox()` ท้าย job + ทุกรอบ cron (`runSweeperJobs()`) — ส่งแล้วมาร์ค `sent` ·
 *     ล้ม = เก็บ `last_error` + นับ `attempts` แล้วรอ backoff · ครบเพดาน = `failed` · **ไม่โยน error ออกไป**
 *
 * กันส่งซ้ำสองชั้น: (ก) claim แถวด้วย conditional update + lease ⇒ ตัวส่งสองตัวพร้อมกันได้แถวละตัวเดียว
 * (ข) แถว `notifications` ใช้ id แบบ deterministic จาก `dedupeKey` (`dedupe.ts`) ⇒ ตัวส่งตายหลังเขียนแจ้งเตือน
 * แต่ก่อนมาร์ค `sent` แล้วรอบหน้าส่งซ้ำ ก็ยังได้แถวเดียว
 */

/** ส่วนของ client ที่การเข้าคิวต้องใช้ — รับ `tx` ของ `$transaction` ได้ทุกโมดูล */
export interface OutboxWriter {
  notificationOutbox: {
    createMany(args: { data: Prisma.NotificationOutboxCreateManyInput[]; skipDuplicates?: boolean }): Prisma.PrismaPromise<Prisma.BatchPayload>
  }
}

export interface OutboxSource {
  /** job_type ที่เข้าคิว เช่น `advance_overdue` */
  jobType: string
  /** id ของ job ที่สั่งรัน (ถ้ามี) — ตามรอยกลับได้ */
  jobRef?: string | null
}

/**
 * เขียนแถวคิวใน transaction ของผู้เรียก · กุญแจซ้ำ (job รันซ้ำ) = ข้ามเงียบ ๆ · คืนจำนวนแถวที่เพิ่มจริง
 */
export async function enqueueNotificationOutbox(
  tx: OutboxWriter,
  entries: readonly OutboxEntry[],
  source: OutboxSource,
  availableAt: Date = new Date(),
): Promise<number> {
  if (entries.length === 0) return 0
  const result = await tx.notificationOutbox.createMany({
    data: entries.map((entry) => ({
      organizationId: entry.organizationId,
      dedupeKey: entry.dedupeKey,
      payload: entry.payload,
      availableAt,
      sourceJobType: source.jobType,
      sourceJobRef: source.jobRef ?? null,
    })),
    skipDuplicates: true,
  })
  return result.count
}

/** ตัวส่งจริงของ payload แต่ละชนิด — คืนจำนวนแถว `notifications` ที่สร้างใหม่ */
async function deliver(organizationId: string, payload: OutboxPayload): Promise<number> {
  switch (payload.kind) {
    case 'message':
      return dispatchNotificationAwaited(
        { organizationId, userIds: [payload.userId] },
        {
          eventCode: payload.eventCode,
          title: payload.title,
          body: payload.body,
          linkPath: payload.linkPath,
          dedupeKey: payload.dedupeKey,
        },
      )
    case 'expense_approval_queue':
      return notifyExpensesAwaitingApprovalAwaited(organizationId, payload.expenseIds)
  }
}

export interface OutboxDrainOptions {
  /** เวลาอ้างอิง (เทสต์ส่งเวลาปลอมได้) — production ปล่อยว่าง */
  now?: Date
  organizationId?: string
  limit?: number
}

export interface OutboxDrainResult {
  /** แถวที่ถึงคิวในรอบนี้ */
  due: number
  /** ส่งสำเร็จ → `sent` */
  sent: number
  /** ล้มแต่ยังไม่ครบเพดาน → รอ backoff */
  retried: number
  /** ล้มครบเพดาน / payload ผิดรูป → `failed` */
  failed: number
  /** ตัวส่งอื่นจองไปก่อน — ไม่ใช่ error */
  skipped: number
  /** แถว `notifications` ที่สร้างใหม่จริง */
  notificationsCreated: number
}

/**
 * ส่งแถวที่ถึงคิว — **ไม่โยน error** (error ของแต่ละแถวเก็บลง `last_error`) ⇒ เรียกท้าย job ได้โดยไม่ทำให้ job ล้ม
 */
export async function drainNotificationOutbox(options: OutboxDrainOptions = {}): Promise<OutboxDrainResult> {
  const now = options.now ?? new Date()
  const result: OutboxDrainResult = { due: 0, sent: 0, retried: 0, failed: 0, skipped: 0, notificationsCreated: 0 }

  const due = await prisma.notificationOutbox.findMany({
    where: {
      status: 'pending',
      availableAt: { lte: now },
      ...(options.organizationId === undefined ? {} : { organizationId: options.organizationId }),
    },
    orderBy: [{ availableAt: 'asc' }, { createdAt: 'asc' }],
    take: options.limit ?? 200,
    select: { id: true, organizationId: true, payload: true, attempts: true, maxAttempts: true },
  })
  result.due = due.length

  for (const row of due) {
    // จอง: เลื่อน available_at ออกไปหนึ่ง lease + นับครั้ง — ตัวส่งอื่นที่อ่านแถวเดียวกันมาจะจองไม่ติด
    const claimed = await prisma.notificationOutbox.updateMany({
      where: { id: row.id, status: 'pending', availableAt: { lte: now } },
      data: { attempts: { increment: 1 }, availableAt: new Date(now.getTime() + OUTBOX_CLAIM_LEASE_MS) },
    })
    if (claimed.count === 0) {
      result.skipped += 1
      continue
    }
    const attempt = row.attempts + 1

    const parsed = outboxPayloadSchema.safeParse(row.payload)
    if (!parsed.success) {
      // payload ผิดรูป = ลองกี่รอบก็ไม่ผ่าน ⇒ เลิกทันที (เก็บสาเหตุไว้ให้ไล่ดู)
      await markOutcome(row.id, { status: 'failed', lastError: `payload ไม่ถูกต้อง: ${parsed.error.message}` })
      result.failed += 1
      continue
    }

    try {
      const created = await deliver(row.organizationId, parsed.data)
      await markOutcome(row.id, { status: 'sent', sentAt: now, lastError: null })
      result.sent += 1
      result.notificationsCreated += created
    } catch (error) {
      const lastError = outboxErrorText(error)
      const outcome = outboxFailureOutcome(attempt, row.maxAttempts, now)
      console.error('[notification_outbox] ส่งแจ้งเตือนไม่สำเร็จ', { outboxId: row.id, attempt, error })
      if (outcome.status === 'failed') {
        await markOutcome(row.id, { status: 'failed', lastError })
        result.failed += 1
      } else {
        await markOutcome(row.id, { availableAt: outcome.availableAt, lastError })
        result.retried += 1
      }
    }
  }

  return result
}

/**
 * บันทึกผลของแถวที่ตัวเองจองไว้ · เขียนผลไม่ติด (DB สะดุด) = log แล้วปล่อย — lease หมดแล้วแถวกลับมาให้รอบหน้า
 * (ถ้าแจ้งเตือนถูกเขียนไปแล้ว รอบหน้าก็ได้แถวเดิมเพราะ dedupe)
 */
async function markOutcome(id: string, data: Prisma.NotificationOutboxUpdateManyMutationInput): Promise<void> {
  try {
    await prisma.notificationOutbox.updateMany({ where: { id, status: 'pending' }, data })
  } catch (error) {
    console.error('[notification_outbox] บันทึกผลการส่งไม่สำเร็จ', { outboxId: id, error })
  }
}

/**
 * เรียกท้าย job — ห่อซ้ำอีกชั้นให้ error ระดับ query ตอนหาแถว (DB หลุด) ไม่พา job ที่ commit แล้วล้มตาม
 * (แถวยังอยู่ในคิว รอบ cron ถัดไปส่งให้)
 */
export async function drainNotificationOutboxSafely(
  options: OutboxDrainOptions = {},
  label = 'job',
): Promise<OutboxDrainResult | null> {
  try {
    return await drainNotificationOutbox(options)
  } catch (error) {
    console.error(`[notification_outbox] ส่งคิวแจ้งเตือนท้าย ${label} ไม่สำเร็จ — รอบ cron ถัดไปจะส่งให้`, { error })
    return null
  }
}
