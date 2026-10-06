import { loadSessionUser } from '@/lib/auth/session'
import type { SessionUser } from '@/lib/auth/types'
import { finishPayoutPostCompletion, type PayoutPostCompletionResult } from '@/lib/payout/post-completion'
import { prisma } from '@/lib/prisma'

/**
 * ตัวกวาดขั้นหลังรอบจ่าย `completed` (มติ PO 07/10/2569 U134 · แนวเดียวกับ outbox — DEC-015)
 *
 * รอบ `completed` ที่ `post_completion_synced_at IS NULL` เกินเวลาผ่อนผัน = ขั้นหลัง commit ล้ม/ถูกตัดกลางคัน
 * ⇒ ตั้งงาน `payout_completion_repair` **หนึ่งงานต่อรอบจ่าย** (คีย์กันซ้ำ `payout_completion_repair:<batchId>`)
 * แล้วรันทันที · ล้ม = งานเข้าบันได retry/dead letter ของตัวรันงานกลาง ⇒ เห็นใน Job Log ตามรอยได้ครบ
 *
 * กันซ้ำสองชั้น: (ก) คีย์ของงาน ⇒ ตัวกวาดสองตัวพร้อมกันได้งานเดียว และ claim งานด้วย conditional update
 * (ข) ตัว sync กันซ้ำด้วย unique เดิม (`expense_records.payout_batch_item_id` / ใบ 50 ทวิ active ต่อรายการ)
 */

/** ผ่อนผันให้คำขอที่กำลังทำขั้นหลังอยู่จริงทำให้จบเองก่อน — กัน Job Log รกด้วยงานที่ไม่จำเป็น */
export const PAYOUT_COMPLETION_GRACE_MS = 5 * 60 * 1000

/** จำนวนรอบจ่ายสูงสุดต่อรอบกวาด — กันรอบ cron กินเวลาเกิน */
const SWEEP_LIMIT = 20

export const PAYOUT_COMPLETION_REPAIR_JOB = 'payout_completion_repair' as const

export function payoutCompletionRepairKey(batchId: string): string {
  return `${PAYOUT_COMPLETION_REPAIR_JOB}:${batchId}`
}

export interface PayoutCompletionSweepResult {
  /** รอบจ่ายที่ค้างและถึงเวลากวาด */
  pending: number
  /** งานที่ตั้งใหม่รอบนี้ */
  enqueued: number
  /** ตั้งไปแล้วก่อนหน้า (รอ retry ตามรอบ / dead letter รอ Superadmin) */
  existing: number
  /** งานที่รันรอบนี้แล้วสำเร็จ */
  completed: number
  /** งานที่รันรอบนี้แล้วล้ม (เข้าคิว retry หรือ dead letter) */
  failed: number
}

export async function runPayoutCompletionSweep(
  options: { now?: Date; organizationId?: string } = {},
): Promise<PayoutCompletionSweepResult> {
  const now = options.now ?? new Date()
  const result: PayoutCompletionSweepResult = { pending: 0, enqueued: 0, existing: 0, completed: 0, failed: 0 }

  const stuck = await prisma.payoutBatch.findMany({
    where: {
      status: 'completed',
      postCompletionSyncedAt: null,
      deletedAt: null,
      updatedAt: { lte: new Date(now.getTime() - PAYOUT_COMPLETION_GRACE_MS) },
      ...(options.organizationId === undefined ? {} : { organizationId: options.organizationId }),
    },
    orderBy: { updatedAt: 'asc' },
    take: SWEEP_LIMIT,
    select: { id: true, organizationId: true, name: true },
  })
  result.pending = stuck.length
  if (stuck.length === 0) return result

  // import ตอนใช้ — ตัวรันงานกลาง import ทะเบียน handler ซึ่ง import ไฟล์นี้ (กัน import วน)
  const { enqueueJob, runJobById } = await import('@/lib/jobs/engine')

  for (const batch of stuck) {
    const { job, duplicate } = await enqueueJob({
      organizationId: batch.organizationId,
      jobType: PAYOUT_COMPLETION_REPAIR_JOB,
      idempotencyKey: payoutCompletionRepairKey(batch.id),
      payload: { batchId: batch.id, source: 'sweeper' },
      reason: `ตัวกวาดพบรอบจ่าย "${batch.name}" จ่ายสำเร็จแล้วแต่บันทึกจ่าย/หนังสือรับรองหัก ณ ที่จ่ายยังไม่ครบ — ตั้งงานทำต่อ`,
    })
    if (duplicate) {
      // งานเดิมอยู่ในบันได retry ⇒ ตัวรันงานกลางหยิบเองเมื่อถึงคิว · dead letter ⇒ Superadmin สั่งใหม่จาก Job Log
      result.existing += 1
      continue
    }
    result.enqueued += 1
    const outcome = await runJobById(job.id, now)
    if (outcome === 'completed') result.completed += 1
    else if (outcome !== 'skipped') result.failed += 1
  }

  return result
}

/**
 * ผู้กระทำของงานทำต่อ = **ผู้ยืนยันรอบจ่ายสำเร็จ** (`updated_by` ตอนเปลี่ยนเป็น `completed`) — บันทึกจ่าย/ใบ 50 ทวิ
 * ที่เกิดภายหลังผูกกับคนเดียวกับเส้นทางปกติ · หาไม่ได้ (บัญชีถูกปิด/ไม่ผูก login) ⇒ ผู้สร้างรอบ ·
 * ไม่ได้ทั้งคู่ = ล้ม (Job Log แสดงเหตุผล) — ไม่สวมสิทธิ์ระบบเอง (DEC-002)
 */
async function repairActorOf(batch: { updatedBy: string | null; createdBy: string }): Promise<SessionUser> {
  const candidates = [batch.updatedBy, batch.createdBy].filter((id): id is string => id !== null)
  for (const userId of candidates) {
    const user = await prisma.user.findUnique({ where: { id: userId }, select: { supabaseUid: true } })
    if (user?.supabaseUid == null) continue
    const actor = await loadSessionUser(user.supabaseUid)
    if (actor !== null) return actor
  }
  throw new Error('หาผู้ยืนยันรอบจ่าย/ผู้สร้างรอบที่ยังใช้งานได้ไม่พบ — ทำต่อแทนไม่ได้ (ให้ผู้ดูแลระบบตรวจ)')
}

export interface PayoutCompletionRepairResult extends PayoutPostCompletionResult {
  batchId: string
  /** `true` = รอบนี้ครบไปแล้วก่อนงานจะรัน (ไม่ต้องทำอะไร) */
  alreadyDone: boolean
}

/**
 * handler ของงาน `payout_completion_repair` — ทำต่อเฉพาะสิ่งที่ยัง**ไม่เคยเกิด** (`missingOnly`):
 * ใบ 50 ทวิ ที่ถูกยกเลิกโดยคนแล้วจะไม่ถูกออกใบแทนให้เอง
 */
export async function runPayoutCompletionRepair(input: {
  jobId: string
  organizationId: string | null
  batchId: string
}): Promise<PayoutCompletionRepairResult> {
  const batch = await prisma.payoutBatch.findFirst({
    where: {
      id: input.batchId,
      deletedAt: null,
      ...(input.organizationId === null ? {} : { organizationId: input.organizationId }),
    },
    select: { id: true, status: true, postCompletionSyncedAt: true, updatedBy: true, createdBy: true },
  })
  if (batch === null) throw new Error(`ไม่พบรอบจ่าย ${input.batchId}`)
  if (batch.status !== 'completed') throw new Error(`รอบจ่าย ${input.batchId} ไม่ได้อยู่ในสถานะจ่ายสำเร็จ`)
  if (batch.postCompletionSyncedAt !== null) {
    return { batchId: batch.id, alreadyDone: true, expenseRecordCount: 0, marked: false }
  }

  const actor = await repairActorOf(batch)
  const outcome = await finishPayoutPostCompletion(
    { actor, meta: { ipAddress: null, userAgent: null } },
    batch.id,
    { missingOnly: true, traceNote: ` (ทำต่อโดยงานเบื้องหลัง job id ${input.jobId})` },
  )
  return { batchId: batch.id, alreadyDone: false, ...outcome }
}
