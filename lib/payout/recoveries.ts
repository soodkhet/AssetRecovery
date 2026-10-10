import { emitAudit } from '@/lib/audit/audit'
import type { RequestMeta } from '@/lib/auth/request-meta'
import { payeeRecoveryOutstandingSatang, type OutstandingAdvanceReturn } from '@/lib/finance/advance-offset-calc'
import { Prisma } from '@/lib/generated/prisma/client'
import type { AdjustmentType } from '@/lib/generated/prisma/enums'
import { prisma } from '@/lib/prisma'

/**
 * "ยอดเรียกคืนจากผู้รับ" (staging E-014 · มติ PO 10/10/2569 · `22` §6.14 · `20` §9)
 *
 * - Adjustment **ลดยอด** ของรายการเบิกที่**จ่ายไปแล้ว** (อยู่ในรอบจ่าย `completed`) อนุมัติครบ ⇒ ผู้รับได้เงินเกิน
 *   ⇒ เกิด `payee_recoveries` 1 แถว (ยอด = ยอดลดของ Adjustment · 50 ทวิ เดิมไม่แก้ย้อนหลัง ผู้รับยังได้เครดิตภาษีส่วนนั้น)
 * - รอบจ่ายถัดไปของผู้รับหักคืนจากยอดที่เหลือ**หลังหักคืนเงินทดรอง** (FIFO ตามวันที่เกิด) · ส่วนที่หักไม่หมดยกไปรอบถัดไป
 * - รอบจ่ายถูกยกเลิก ⇒ กลับรายการ (ไม่ลบ) ยอดกลับเป็นค้าง
 *
 * ตัวจัดสรรยอดใช้ `allocatePayeeAdvanceOffset()` ตัวเดียวกับเงินทดรอง (id = recovery id) — ไม่เขียนสูตรซ้ำ
 */

type TxClient = Omit<typeof prisma, '$connect' | '$disconnect' | '$on' | '$transaction' | '$extends'>

const TARGET = 'payee_recoveries'

/** สร้างยอดเรียกคืนเมื่อ Adjustment อนุมัติครบ — เรียกใน tx เดียวกับการอนุมัติ · ไม่เข้าเงื่อนไข = `null` · idempotent ต่อ Adjustment */
export async function createRecoveryForApprovedAdjustment(
  tx: TxClient,
  input: {
    organizationId: string
    adjustmentId: string
    adjustmentType: AdjustmentType
    expenseId: string | null
    amountSatang: number
    actorId: string
    actorRole: string
    reason: string
    meta: RequestMeta
  },
): Promise<string | null> {
  if (input.adjustmentType !== 'decrease' || input.expenseId === null) return null
  const expense = await tx.expense.findFirst({
    where: { id: input.expenseId, organizationId: input.organizationId },
    select: { payoutBatchItemId: true, payee: { select: { id: true } } },
  })
  if (expense === null || expense.payoutBatchItemId === null) return null
  const item = await tx.payoutBatchItem.findUnique({
    where: { id: expense.payoutBatchItemId },
    select: { payoutBatch: { select: { status: true } } },
  })
  // ยังไม่จ่ายจริง ⇒ ไม่มีเงินเกินให้เรียกคืน (รายการที่ยังไม่โอนแก้ผ่าน Adjustment ตามเดิม)
  if (item?.payoutBatch.status !== 'completed') return null

  const existing = await tx.payeeRecovery.findUnique({ where: { adjustmentId: input.adjustmentId }, select: { id: true } })
  if (existing !== null) return existing.id

  const created = await tx.payeeRecovery.create({
    data: {
      organizationId: input.organizationId,
      payeeId: expense.payee.id,
      adjustmentId: input.adjustmentId,
      expenseId: input.expenseId,
      amountSatang: input.amountSatang,
      createdBy: input.actorId,
    },
    select: { id: true },
  })
  await emitAudit(
    {
      organizationId: input.organizationId,
      actorId: input.actorId,
      actorRole: input.actorRole,
      action: 'create',
      targetType: TARGET,
      targetId: created.id,
      before: null,
      after: {
        adjustment_id: input.adjustmentId,
        expense_id: input.expenseId,
        payee_id: expense.payee.id,
        amount_satang: input.amountSatang,
      },
      reason: input.reason,
      ipAddress: input.meta.ipAddress,
      userAgent: input.meta.userAgent,
      diffOnly: false,
    },
    tx,
  )
  return created.id
}

/**
 * ยอดเรียกคืนค้างของผู้รับ (ล็อกแถวก่อนอ่าน — รอบจ่ายสองรอบพร้อมกันหักซ้ำไม่ได้) · FIFO ตามวันที่เกิด
 * คืน `OutstandingAdvanceReturn` (id = recovery id) เพื่อส่งเข้า `allocatePayeeAdvanceOffset()`
 */
export async function lockOutstandingRecoveries(
  tx: TxClient,
  organizationId: string,
  payeeIds: readonly string[],
): Promise<Map<string, OutstandingAdvanceReturn[]>> {
  const byPayee = new Map<string, OutstandingAdvanceReturn[]>()
  if (payeeIds.length === 0) return byPayee
  const locked = await tx.$queryRaw<Array<{ id: string }>>`
    SELECT id FROM payee_recoveries
     WHERE organization_id = ${organizationId}::uuid
       AND payee_id IN (${Prisma.join(payeeIds.map((id) => Prisma.sql`${id}::uuid`))})
       AND deleted_at IS NULL
     ORDER BY created_at ASC, id ASC
     FOR UPDATE`
  if (locked.length === 0) return byPayee
  const rows = await tx.payeeRecovery.findMany({
    where: { id: { in: locked.map((row) => row.id) } },
    select: {
      id: true,
      payeeId: true,
      amountSatang: true,
      collections: { where: { reversedAt: null }, select: { amountSatang: true } },
    },
    orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
  })
  for (const row of rows) {
    const outstandingSatang = payeeRecoveryOutstandingSatang({
      amountSatang: row.amountSatang,
      collectedSatang: row.collections.map((entry) => entry.amountSatang),
    })
    if (outstandingSatang === 0) continue
    const bucket = byPayee.get(row.payeeId) ?? []
    bucket.push({ advanceId: row.id, outstandingSatang })
    byPayee.set(row.payeeId, bucket)
  }
  return byPayee
}

/** ยอดเรียกคืนค้างรวมต่อผู้รับ (อ่านอย่างเดียว — หน้าผู้รับเงิน/รายการปรับปรุง) */
export async function recoveryOutstandingByPayee(
  organizationId: string,
  payeeIds: readonly string[],
): Promise<Map<string, number>> {
  const result = new Map<string, number>()
  if (payeeIds.length === 0) return result
  const rows = await prisma.payeeRecovery.findMany({
    where: { organizationId, payeeId: { in: [...payeeIds] }, deletedAt: null },
    select: { payeeId: true, amountSatang: true, collections: { where: { reversedAt: null }, select: { amountSatang: true } } },
  })
  for (const row of rows) {
    const outstanding = payeeRecoveryOutstandingSatang({
      amountSatang: row.amountSatang,
      collectedSatang: row.collections.map((entry) => entry.amountSatang),
    })
    result.set(row.payeeId, (result.get(row.payeeId) ?? 0) + outstanding)
  }
  return result
}

/** ยอดเรียกคืน + ยอดค้าง ต่อ Adjustment (หน้ารายการปรับปรุง) */
export async function recoveriesByAdjustment(
  organizationId: string,
  adjustmentIds: readonly string[],
): Promise<Map<string, { amountSatang: number; outstandingSatang: number }>> {
  const result = new Map<string, { amountSatang: number; outstandingSatang: number }>()
  if (adjustmentIds.length === 0) return result
  const rows = await prisma.payeeRecovery.findMany({
    where: { organizationId, adjustmentId: { in: [...adjustmentIds] }, deletedAt: null },
    select: { adjustmentId: true, amountSatang: true, collections: { where: { reversedAt: null }, select: { amountSatang: true } } },
  })
  for (const row of rows) {
    result.set(row.adjustmentId, {
      amountSatang: row.amountSatang,
      outstandingSatang: payeeRecoveryOutstandingSatang({
        amountSatang: row.amountSatang,
        collectedSatang: row.collections.map((entry) => entry.amountSatang),
      }),
    })
  }
  return result
}

/**
 * กลับรายการหักคืนยอดเรียกคืนของบรรทัดในรอบจ่าย (รอบถูกยกเลิก) — ไม่ลบ ⇒ ยอดค้างกลับมา · idempotent
 * เรียกใน tx เดียวกับการยกเลิก · เหตุผลบังคับ
 */
export async function releasePayoutRecoveryOffsets(
  tx: TxClient,
  input: {
    organizationId: string
    payoutBatchItemIds: readonly string[]
    actorId: string
    actorRole: string
    reason: string
    meta: RequestMeta
    now?: Date
  },
): Promise<number> {
  const reason = input.reason.trim()
  if (reason === '') throw new Error('releasePayoutRecoveryOffsets: ต้องมีเหตุผล')
  if (input.payoutBatchItemIds.length === 0) return 0
  const at = input.now ?? new Date()
  const rows = await tx.payeeRecoveryCollection.findMany({
    where: { organizationId: input.organizationId, payoutBatchItemId: { in: [...input.payoutBatchItemIds] }, reversedAt: null },
    select: { id: true, recoveryId: true, amountSatang: true, payoutBatchId: true, payoutBatchItemId: true },
  })
  for (const row of rows) {
    await tx.payeeRecoveryCollection.update({
      where: { id: row.id },
      data: { reversedAt: at, reversedBy: input.actorId, reversalReason: reason },
    })
    await emitAudit(
      {
        organizationId: input.organizationId,
        actorId: input.actorId,
        actorRole: input.actorRole,
        action: 'update',
        targetType: 'payee_recovery_collections',
        targetId: row.id,
        before: { reversed_at: null },
        after: {
          reversed_at: at.toISOString(),
          recovery_id: row.recoveryId,
          amount_satang: row.amountSatang,
          payout_batch_id: row.payoutBatchId,
          payout_batch_item_id: row.payoutBatchItemId,
        },
        reason,
        ipAddress: input.meta.ipAddress,
        userAgent: input.meta.userAgent,
        diffOnly: false,
      },
      tx,
    )
  }
  return rows.length
}
