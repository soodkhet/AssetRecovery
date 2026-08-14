import { swapAssignment, type AssignmentTxClient } from '@/lib/assignments/queries'
import { prisma } from '@/lib/prisma'

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
  caseIds: string[]
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
      case: { select: { assignedTeamId: true, trackingRound: true } },
    },
  })

  const result: ReassignTimeoutResult = { due: due.length, resolved: 0, skipped: 0, caseIds: [] }

  for (const pending of due) {
    const changed = await prisma.$transaction(async (tx) => {
      const claimed = await tx.pendingReassignment.updateMany({
        where: { id: pending.id, status: 'waiting_consent' },
        data: { status: 'timeout_auto', resolvedAt: now, resolvedBy: null },
      })
      // พนักงานตอบมาก่อนในเสี้ยววินาทีเดียวกัน — คำตอบของคนชนะ job เสมอ
      if (claimed.count === 0) return false

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
        pendingReassignmentId: pending.id,
        events: ['assignment.reassignment_timeout_resolved'],
        auditReason: `[job:${jobId}] หมดเวลารอความยินยอมตาม \`40\` §11 — ${pending.reason}`,
      })
      return true
    })

    if (changed) {
      result.resolved += 1
      result.caseIds.push(pending.caseId)
    } else {
      result.skipped += 1
    }
  }

  return result
}
