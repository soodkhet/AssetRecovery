import { nextAdvanceStatus } from '@/lib/advances/advance'
import { emitAudit } from '@/lib/audit/audit'
import { bangkokBusinessDate } from '@/lib/field/expense-queries'
import { fmtDate } from '@/lib/format/datetime'
import { payeeUserIds, usersWithCapability } from '@/lib/notifications/dispatch'
import { advanceOverdueMessage } from '@/lib/notifications/messages'
import { drainNotificationOutboxSafely, enqueueNotificationOutbox, type OutboxDrainResult } from '@/lib/notifications/outbox'
import { outboxMessageEntries } from '@/lib/notifications/outbox-core'
import { prisma } from '@/lib/prisma'

/**
 * Job `advance_overdue` (`15` §9.1/§10/§13 · `91` — ทุก job ต้อง idempotent)
 *
 * มาร์ค Advance ที่ **เลย `due_clear_date` ตามปฏิทินไทย** แล้วยังไม่เคลียร์ ให้เป็น `overdue`
 * — เป็น**ทางเดียว**ที่สถานะนี้เกิดได้ ไม่มี endpoint/ปุ่มให้ผู้ใช้กด (`15` §10)
 *
 * **มติ PO O74 (Final ด่าน 7 · ADV-5)** — นับเฉพาะเงินทดรองที่ **จ่ายออกแล้ว** (นิยามเดียวกับ U83
 * `isAdvancePaidOut()`: เคยอยู่ในรอบจ่ายที่ `completed`) · ยังไม่เข้ารอบจ่าย / รอบยังไม่ยืนยันโอน / รอบถูกยกเลิก
 * ⇒ ยังไม่ใช่หนี้ที่ผู้ยืมต้องเคลียร์ ⇒ คง `approved` (รอจ่าย) ไม่มาร์ค ไม่แจ้งเตือน
 *
 * ### ทำไม idempotent
 * - เลือกเฉพาะ `status = 'approved'` แล้วเปลี่ยนด้วย **conditional update** (`updateMany` + `where status`)
 *   ⇒ รันซ้ำ/รันพร้อมกันสองตัว แถวเดิมถูกนับครั้งเดียว (ตัวที่แพ้ได้ `count = 0` แล้วข้ามเงียบ ๆ)
 * - ไม่มีการสร้างแถวใหม่ ⇒ ไม่มีโอกาสเกิดข้อมูลซ้ำ
 *
 * actor = ระบบ (`actor_id = NULL`) ⇒ `reason` ต้องระบุ job id ตาม `90` §13
 */

export const ADVANCE_OVERDUE_JOB_TYPE = 'advance_overdue'

export interface AdvanceOverdueJobOptions {
  organizationId?: string
  /** id ของ job runner ที่สั่ง — ลง `reason` ของ audit เพื่อ trace (`90` §13) */
  jobId?: string
  now?: Date
  /**
   * `now` เป็นวันที่จำลองจาก dev trigger (มติผู้ใช้ 04/10/2569 · UAT) — ระบุใน `reason` ของ audit
   * ว่าเป็นการจำลอง เพื่อไม่ให้สับสนกับการมาร์คตามเวลาจริง
   */
  simulated?: boolean
  limit?: number
}

export interface AdvanceOverdueJobResult {
  /** จำนวนรายการที่ job นี้เปลี่ยนสถานะจริง (รันซ้ำรอบสอง = 0) */
  marked: number
  /** เจอว่าเข้าเกณฑ์แต่มีตัวอื่นเปลี่ยนไปก่อนแล้ว */
  skipped: number
  /** ผลการส่งคิวแจ้งเตือนท้ายรอบ (DEC-015) — `null` = ส่งไม่สำเร็จ รอบ cron ถัดไปส่งให้ */
  notifications: OutboxDrainResult | null
}

export async function runAdvanceOverdueJob(
  options: AdvanceOverdueJobOptions = {},
): Promise<AdvanceOverdueJobResult> {
  const now = options.now ?? new Date()
  const jobId = options.jobId ?? ADVANCE_OVERDUE_JOB_TYPE
  // เที่ยงคืน UTC ของ "วันนี้" ตามเวลาไทย ⇒ `dueClearDate < today` = เลยกำหนดแล้วจริง (Rule 01)
  const today = bangkokBusinessDate(now)
  const result: AdvanceOverdueJobResult = { marked: 0, skipped: 0, notifications: null }
  const simulatedTag = options.simulated === true ? ` [จำลองวันที่ ${fmtDate(now)}]` : ''

  const due = await prisma.advance.findMany({
    where: {
      status: 'approved',
      deletedAt: null,
      dueClearDate: { lt: today },
      // O74 — จ่ายออกแล้วเท่านั้น (U83: เคยอยู่ในรอบจ่ายที่ completed — ตัวเดียวกับ `isAdvancePaidOut()`)
      payoutItems: { some: { payoutBatch: { status: 'completed' } } },
      ...(options.organizationId === undefined ? {} : { organizationId: options.organizationId }),
    },
    orderBy: { dueClearDate: 'asc' },
    take: options.limit ?? 200,
    select: { id: true, organizationId: true, payeeId: true, dueClearDate: true },
  })

  for (const advance of due) {
    // `23` §6.4 — ยืนยันเส้นทาง approved → overdue ผ่าน state machine เดียวกับที่ endpoint ใช้
    const status = nextAdvanceStatus('approved', 'mark_overdue')

    // `90` §6.3 (mockup `notifications.html`) — ผู้ยืมต้องรีบเคลียร์ · การเงินต้องตาม
    // หาผู้รับก่อนเปิดทรานแซกชัน (อ่านอย่างเดียว) แล้วเข้าคิว **ในทรานแซกชันเดียวกับการมาร์ค overdue**
    // (DEC-015 · มติ PO U120) · `dedupeKey` ผูกกับรายการ ⇒ job รันทุกวันก็แจ้งครั้งเดียวต่อคน
    const message = (audience: 'payee' | 'finance') =>
      advanceOverdueMessage({ advanceId: advance.id, dueClearDate: advance.dueClearDate }, audience)
    const [payeeIds, financeIds] = await Promise.all([
      payeeUserIds(advance.organizationId, [advance.payeeId]),
      usersWithCapability(advance.organizationId, 'approve_advance'),
    ])

    const changed = await prisma.$transaction(async (tx) => {
      const claimed = await tx.advance.updateMany({
        where: { id: advance.id, status: 'approved' },
        data: { status },
      })
      if (claimed.count === 0) return false

      await emitAudit(
        {
          organizationId: advance.organizationId,
          // actor = ระบบ (`90` §13) ⇒ ต้องระบุ job id ใน reason
          actorId: null,
          actorRole: null,
          action: 'status_change',
          targetType: 'advances',
          targetId: advance.id,
          before: { status: 'approved' },
          after: {
            status,
            due_clear_date: advance.dueClearDate.toISOString().slice(0, 10),
            payee_id: advance.payeeId,
            auto_marked: true,
          },
          reason: `[job:${jobId}]${simulatedTag} เลยกำหนดเคลียร์ยอดแล้วยังไม่เคลียร์ — มาร์คเป็น overdue อัตโนมัติ`,
          diffOnly: false,
        },
        tx,
      )

      await enqueueNotificationOutbox(
        tx,
        [
          ...outboxMessageEntries(advance.organizationId, payeeIds, message('payee')),
          ...outboxMessageEntries(advance.organizationId, financeIds, message('finance')),
        ],
        { jobType: ADVANCE_OVERDUE_JOB_TYPE, jobRef: options.jobId ?? null },
      )
      return true
    })

    if (changed) {
      result.marked += 1
    } else {
      result.skipped += 1
    }
  }

  // ส่งคิวแจ้งเตือนท้ายรอบ (เวลาจริงเสมอ — แม้ `now` เป็นวันจำลอง) · ล้มไม่ทำให้ job ล้ม
  if (result.marked > 0) {
    result.notifications = await drainNotificationOutboxSafely(
      options.organizationId === undefined ? {} : { organizationId: options.organizationId },
      ADVANCE_OVERDUE_JOB_TYPE,
    )
  }
  return result
}
