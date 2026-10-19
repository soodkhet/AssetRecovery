import { replacementAgentProblemText } from '@/lib/assignments/assignment'
import { lockReplacementAgent, swapAssignment, type AssignmentTxClient } from '@/lib/assignments/queries'
import { emitAudit } from '@/lib/audit/audit'
import { reassignmentTimeoutCancelledMessage, reassignmentTimeoutMessage } from '@/lib/notifications/messages'
import { teamLeadIds } from '@/lib/notifications/recipients'
import { drainNotificationOutboxSafely, enqueueNotificationOutbox, type OutboxDrainResult } from '@/lib/notifications/outbox'
import { outboxMessageEntries } from '@/lib/notifications/outbox-core'
import { prisma } from '@/lib/prisma'
import { jobTraceTag } from '@/lib/audit/system-text'

/**
 * Job `reassign_timeout` (`40` §8 · §16 · `91` §6.1) — คำขอที่ไม่มีใครตอบจนเลย `expires_at`
 * ระบบมอบหมายให้พนักงานคนใหม่ที่ผู้จัดการเลือกไว้อัตโนมัติ (`resolution = timeout_auto`)
 *
 * กติกา (`91` §17 — ทุก job ต้อง idempotent):
 * - เลือกคำขอด้วยเงื่อนไข `status = waiting_consent AND expires_at <= now` แล้ว **claim ด้วย conditional
 *   update** ก่อนทำงานจริง — แพ้การแข่งกับ `respondReassignment()` (คนตอบมาพอดี) = ข้ามคำขอนั้นไปเงียบ ๆ
 *   ไม่ใช่ error (ผลลัพธ์ที่ถูกต้องแล้วคือคำตอบของพนักงาน)
 * - รันซ้ำกี่รอบก็ได้ผลเท่าเดิม: คำขอที่ resolve แล้วจะไม่ถูกเลือกซ้ำ
 * - actor = ระบบ (`actor_id = NULL`) ⇒ `reason` ต้องระบุ job id (`90` §13)
 * - **ผู้รับใช้ไม่ได้แล้ว** (ถูกระงับ/ลบ/ย้ายทีม/ไม่ใช่พนักงานติดตามทรัพย์ระหว่างรอ — mytester7 FX1 · มติ D7-08):
 *   ไม่โอน เคสคงอยู่กับคนเดิม · ปิดคำขอเป็น `declined` (`resolved_by = NULL` = ระบบปิด ไม่ใช่พนักงานปฏิเสธ)
 *   พร้อมเหตุผลใน `decline_reason` + audit · แจ้งผู้ขอ/ผู้จัดการทีม/คนเดิม · คำขอที่ปิดแล้วไม่ถูกเลือกซ้ำ ⇒ ไม่ล้มซ้ำ
 * - ผู้ขอ (`requested_by`) ได้แจ้งเตือนเฉพาะเมื่อยังเป็นหัวหน้า/ผู้จัดการ (active) ของทีมเคส — คนที่ถูกระงับ/ย้ายออกไม่ได้
 *   (mytester7 FX review M1) · อ่านผู้รับใน transaction เดียวกัน
 * - คำขอแต่ละรายการล้มแยกกัน (try/catch ต่อรายการ) — รายการเดียวล้มไม่ลากทั้งรอบ · นับใน `failed` + `failures`
 *
 * ตัว scheduler (Vercel Cron/QStash) + ตาราง `jobs` เป็นงานของ Phase 5.3 — ที่นี่คือ handler ล้วน ๆ
 */

export const REASSIGN_TIMEOUT_JOB_TYPE = 'reassign_timeout'

export interface ReassignTimeoutOptions {
  /** เวลาอ้างอิง (เทสต์ส่งเวลาปลอมเข้ามาได้ — production ปล่อยว่าง) */
  now?: Date
  /** จำกัดจำนวนคำขอต่อรอบ กันรอบเดียวกินยาว */
  limit?: number
  /** id ของ job ที่สั่งรัน — ลง `reason` ของ audit เพื่อ trace กลับได้ (`90` §13) */
  jobId?: string
  /** จำกัดเฉพาะองค์กรเดียว (ไม่ระบุ = ทุกองค์กร) */
  organizationId?: string
}

export interface ReassignTimeoutResult {
  /** คำขอที่ถึงกำหนดในรอบนี้ */
  due: number
  /** เปลี่ยนผู้รับผิดชอบอัตโนมัติสำเร็จ */
  resolved: number
  /** ถูกพนักงานตอบมาก่อนพอดี (แพ้การแข่ง) — ไม่ใช่ error */
  skipped: number
  /** ปิดคำขอโดยไม่โอนเพราะผู้รับใช้ไม่ได้แล้ว (mytester7 FX1) — ไม่นับใน `resolved`/`caseIds` */
  cancelled: number
  /** คำขอที่ทำไม่สำเร็จในรอบนี้ (transaction ของรายการนั้น rollback · ยังเป็น `waiting_consent` รอบถัดไปลองใหม่) */
  failed: number
  failures: { pendingReassignmentId: string; caseId: string; message: string }[]
  caseIds: string[]
  /** ผลการส่งคิวแจ้งเตือนท้ายรอบ (DEC-015) — `null` = ส่งไม่สำเร็จ รอบ cron ถัดไปส่งให้ */
  notifications: OutboxDrainResult | null
}

export async function resolveExpiredReassignments(
  options: ReassignTimeoutOptions = {},
): Promise<ReassignTimeoutResult> {
  const now = options.now ?? new Date()
  const jobId = options.jobId ?? 'reassign_timeout'
  const due = await prisma.pendingReassignment.findMany({
    where: {
      status: 'waiting_consent',
      expiresAt: { lte: now },
      ...(options.organizationId ? { organizationId: options.organizationId } : {}),
    },
    orderBy: { expiresAt: 'asc' },
    take: options.limit ?? 100,
    select: {
      id: true,
      organizationId: true,
      caseId: true,
      assignmentId: true,
      fromAgentId: true,
      newAgentId: true,
      requestedAt: true,
      reason: true,
      requestedBy: true,
      case: { select: { caseRef: true, assignedTeamId: true, trackingRound: true } },
    },
  })

  const result: ReassignTimeoutResult = {
    due: due.length,
    resolved: 0,
    skipped: 0,
    cancelled: 0,
    failed: 0,
    failures: [],
    caseIds: [],
    notifications: null,
  }

  for (const pending of due) {
    let changed: 'resolved' | 'cancelled' | 'skipped'
    try {
      changed = await prisma.$transaction(async (tx) => {
        const claimed = await tx.pendingReassignment.updateMany({
          where: { id: pending.id, status: 'waiting_consent' },
          data: { status: 'timeout_auto', resolvedAt: now, resolvedBy: null },
        })
        // พนักงานตอบมาก่อนในเสี้ยววินาทีเดียวกัน — คำตอบของคนชนะ job เสมอ
        if (claimed.count === 0) return 'skipped' as const

        const swapTarget = {
          organizationId: pending.organizationId,
          assignmentId: pending.assignmentId,
          toAgentId: pending.newAgentId,
          teamId: pending.case.assignedTeamId,
        }
        // mytester7 FX1 — ตรวจผู้รับใต้ล็อกแถว (ตัวเดียวกับใน `swapAssignment`) ก่อนโอน: ใช้ไม่ได้ ⇒ ปิดคำขอ ไม่โอน
        const problem = await lockReplacementAgent(tx as AssignmentTxClient, swapTarget)
        if (problem !== null) {
          const declineReason = replacementAgentProblemText(problem)
          await tx.pendingReassignment.update({
            where: { id: pending.id },
            data: { status: 'declined', declineReason, resolvedAt: now, resolvedBy: null },
          })
          await emitAudit(
            {
              organizationId: pending.organizationId,
              actorId: null,
              actorRole: null,
              action: 'reject',
              targetType: 'pending_reassignments',
              targetId: pending.id,
              before: { status: 'waiting_consent' },
              after: {
                status: 'declined',
                declineReason,
                newAgentId: pending.newAgentId,
                events: ['assignment.reassignment_timeout_resolved'],
              },
              reason: `${declineReason} ${jobTraceTag(jobId)}`,
              ipAddress: null,
              userAgent: null,
              diffOnly: false,
            },
            tx as AssignmentTxClient,
          )
          const cancelNotice = { caseRef: pending.case.caseRef, pendingReassignmentId: pending.id, declineReason }
          // ผู้ขอที่ยังเป็นหัวหน้า/ผู้จัดการ active ของทีมเคสอยู่ในชุดนี้แล้ว — ผู้ขอที่หลุดจากทีม/ถูกระงับไม่ได้รับ
          const managers = (await teamLeadIds(pending.organizationId, pending.case.assignedTeamId, tx)).filter(
            (userId) => userId !== pending.fromAgentId,
          )
          await enqueueNotificationOutbox(
            tx,
            [
              ...outboxMessageEntries(
                pending.organizationId,
                managers,
                reassignmentTimeoutCancelledMessage(cancelNotice, 'requester'),
              ),
              ...outboxMessageEntries(
                pending.organizationId,
                [pending.fromAgentId],
                reassignmentTimeoutCancelledMessage(cancelNotice, 'previous_agent'),
              ),
            ],
            { jobType: REASSIGN_TIMEOUT_JOB_TYPE, jobRef: options.jobId ?? null },
          )
          return 'cancelled' as const
        }

        await swapAssignment(tx as AssignmentTxClient, {
          organizationId: pending.organizationId,
          caseId: pending.caseId,
          assignmentId: pending.assignmentId,
          fromAgentId: pending.fromAgentId,
          toAgentId: pending.newAgentId,
          teamId: pending.case.assignedTeamId,
          trackingRound: pending.case.trackingRound,
          reason: pending.reason,
          requestedAt: pending.requestedAt,
          resolvedAt: now,
          resolution: 'timeout_auto',
          actorId: null,
          actorRole: null,
          requestedBy: pending.requestedBy,
          pendingReassignmentId: pending.id,
          events: ['assignment.reassignment_timeout_resolved'],
          auditReason: `หมดเวลารอความยินยอม — ${pending.reason} ${jobTraceTag(jobId)}`,
        })

        // ทั้งสามคนต้องรู้ผลที่ job ตัดสินให้: คนเดิม คนใหม่ และผู้จัดการที่ขอ (`90` §6.3 แถว 3)
        // เข้าคิว **ในทรานแซกชันเดียวกับการเปลี่ยนผู้รับผิดชอบ** (DEC-015 · มติ PO U120) — ส่งไม่สำเร็จไม่หายอีกต่อไป
        // ข้อความ/ลิงก์แยกตามผู้รับ (UAT BUG-059): คนใหม่ได้งาน → หน้างานรอรับ · คนเดิมเสียงาน → แท็บปิดแล้ว ·
        // ผู้ขอ → หน้ามอบหมาย (พนักงานเปิด `/cases/assign` ไม่ได้) · `dedupeKey` ทำให้รันซ้ำไม่แจ้งซ้ำ
        const notice = { caseRef: pending.case.caseRef, pendingReassignmentId: pending.id }
        const leads = await teamLeadIds(pending.organizationId, pending.case.assignedTeamId, tx)
        const audiences: [string, 'new_agent' | 'previous_agent' | 'requester'][] = [
          [pending.newAgentId, 'new_agent'],
          [pending.fromAgentId, 'previous_agent'],
          ...(leads.includes(pending.requestedBy) ? [[pending.requestedBy, 'requester'] as [string, 'requester']] : []),
        ]
        await enqueueNotificationOutbox(
          tx,
          audiences.flatMap(([userId, audience]) =>
            outboxMessageEntries(pending.organizationId, [userId], reassignmentTimeoutMessage(notice, audience)),
          ),
          { jobType: REASSIGN_TIMEOUT_JOB_TYPE, jobRef: options.jobId ?? null },
        )
        return 'resolved' as const
      })
    } catch (error) {
      result.failed += 1
      result.failures.push({
        pendingReassignmentId: pending.id,
        caseId: pending.caseId,
        message: error instanceof Error ? error.message : String(error),
      })
      continue
    }

    if (changed === 'resolved') {
      result.resolved += 1
      result.caseIds.push(pending.caseId)
    } else if (changed === 'cancelled') {
      result.cancelled += 1
    } else {
      result.skipped += 1
    }
  }

  // ส่งคิวแจ้งเตือนท้ายรอบ — ล้มไม่ทำให้ job ล้ม (แถวค้างในคิว รอบ cron ถัดไปส่งให้)
  if (result.resolved > 0 || result.cancelled > 0) {
    result.notifications = await drainNotificationOutboxSafely(
      options.organizationId === undefined ? {} : { organizationId: options.organizationId },
      REASSIGN_TIMEOUT_JOB_TYPE,
    )
  }
  return result
}
