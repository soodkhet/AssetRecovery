import { nextAdvanceStatus } from '@/lib/advances/advance'
import { emitAudit } from '@/lib/audit/audit'
import { bangkokBusinessDate } from '@/lib/field/expense-queries'
import { dispatchNotificationAwaited, payeeUserIds, usersWithCapability } from '@/lib/notifications/dispatch'
import { advanceOverdueMessage } from '@/lib/notifications/messages'
import { prisma } from '@/lib/prisma'

/**
 * Job `advance_overdue` (`15` §9.1/§10/§13 · `91` — ทุก job ต้อง idempotent)
 *
 * มาร์ค Advance ที่ **เลย `due_clear_date` ตามปฏิทินไทย** แล้วยังไม่เคลียร์ ให้เป็น `overdue`
 * — เป็น**ทางเดียว**ที่สถานะนี้เกิดได้ ไม่มี endpoint/ปุ่มให้ผู้ใช้กด (`15` §10)
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
  limit?: number
}

export interface AdvanceOverdueJobResult {
  /** จำนวนรายการที่ job นี้เปลี่ยนสถานะจริง (รันซ้ำรอบสอง = 0) */
  marked: number
  /** เจอว่าเข้าเกณฑ์แต่มีตัวอื่นเปลี่ยนไปก่อนแล้ว */
  skipped: number
}

export async function runAdvanceOverdueJob(
  options: AdvanceOverdueJobOptions = {},
): Promise<AdvanceOverdueJobResult> {
  const now = options.now ?? new Date()
  const jobId = options.jobId ?? ADVANCE_OVERDUE_JOB_TYPE
  // เที่ยงคืน UTC ของ "วันนี้" ตามเวลาไทย ⇒ `dueClearDate < today` = เลยกำหนดแล้วจริง (Rule 01)
  const today = bangkokBusinessDate(now)
  const result: AdvanceOverdueJobResult = { marked: 0, skipped: 0 }

  const due = await prisma.advance.findMany({
    where: {
      status: 'approved',
      deletedAt: null,
      dueClearDate: { lt: today },
      ...(options.organizationId === undefined ? {} : { organizationId: options.organizationId }),
    },
    orderBy: { dueClearDate: 'asc' },
    take: options.limit ?? 200,
    select: { id: true, organizationId: true, payeeId: true, dueClearDate: true },
  })

  for (const advance of due) {
    // `23` §6.4 — ยืนยันเส้นทาง approved → overdue ผ่าน state machine เดียวกับที่ endpoint ใช้
    const status = nextAdvanceStatus('approved', 'mark_overdue')

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
          reason: `[job:${jobId}] เลยกำหนดเคลียร์ยอดแล้วยังไม่เคลียร์ — มาร์คเป็น overdue อัตโนมัติ (\`15\` §9.1)`,
          diffOnly: false,
        },
        tx,
      )
      return true
    })

    if (changed) {
      result.marked += 1
      // `90` §6.3 (mockup `notifications.html`) — ผู้ยืมต้องรีบเคลียร์ · การเงินต้องตาม
      // `dedupeKey` ผูกกับรายการ ⇒ job รันทุกวันก็แจ้งครั้งเดียวต่อคน
      const message = (audience: 'payee' | 'finance') =>
        advanceOverdueMessage({ advanceId: advance.id, dueClearDate: advance.dueClearDate }, audience)

      const [payeeIds, financeIds] = await Promise.all([
        payeeUserIds(advance.organizationId, [advance.payeeId]),
        usersWithCapability(advance.organizationId, 'approve_advance'),
      ])
      await dispatchNotificationAwaited({ organizationId: advance.organizationId, userIds: payeeIds }, message('payee'))
      await dispatchNotificationAwaited(
        { organizationId: advance.organizationId, userIds: financeIds },
        message('finance'),
      )
    } else {
      result.skipped += 1
    }
  }

  return result
}
