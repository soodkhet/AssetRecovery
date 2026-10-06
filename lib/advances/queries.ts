import { assertPeriodOpenAt } from '@/lib/accounting/period-guard'
import {
  ADVANCE_EXCESS_CLAIM_TYPE,
  advanceCreateAccess,
  advanceExcessClaimNote,
  APPROVE_ADVANCE,
  advanceReturnState,
  assertAdvanceRejectionReason,
  assertCanChangeReturnMethod,
  assertNoUnclearedAdvance,
  assertSeparateReturnAllowed,
  assertSettleNotInPendingPayout,
  isAdvancePaidOut,
  assertWithinAdvanceMax,
  type AdvancePayoutBatchRef,
  isAdvanceOverdue,
  nextAdvanceStatus,
  resolveApprovedSatang,
  resolveSettleReturnMethod,
  UNCLEARED_ADVANCE_STATUSES,
} from '@/lib/advances/advance'
import { AdvanceError } from '@/lib/advances/errors'
import type {
  AdvanceCreateInput,
  AdvanceApproveInput,
  AdvanceListQuery,
  AdvanceRejectInput,
  AdvanceReturnMethodChangeInput,
  AdvanceSeparateReturnInput,
  AdvanceSettleInput,
} from '@/lib/advances/schemas'
import type { AdvanceDto, AdvanceReturnDto, AdvanceSettleResult } from '@/lib/advances/types'
import { emitAudit } from '@/lib/audit/audit'
import { AuthError } from '@/lib/auth/errors'
import { hasCapability } from '@/lib/auth/permission'
import type { RequestMeta } from '@/lib/auth/request-meta'
import type { SessionUser } from '@/lib/auth/types'
import { bangkokBusinessDate, ensureAgentPayeeId, type ExpenseTxClient } from '@/lib/field/expense-queries'
import { insertManualClaim } from '@/lib/claims/queries'
import { advanceSettlement } from '@/lib/finance/advance-calc'
import { advanceReturnOutstandingSatang } from '@/lib/finance/advance-offset-calc'
import { Prisma } from '@/lib/generated/prisma/client'
import type { AdvanceStatus } from '@/lib/generated/prisma/enums'
import { notifyAdvanceAwaitingApproval, notifyExpensesAwaitingApproval } from '@/lib/notifications/approval-queue'
import { captureLetterheadSnapshot } from '@/lib/organization/letterhead'
import { prisma } from '@/lib/prisma'
import { getFinancePolicy } from '@/lib/settings/queries/finance-policy'
import { issueSubstituteReceipt, substituteReceiptRefOf, substituteReceiptsRelationSelect } from '@/lib/substitute-receipts/queries'
import { advanceReturnFileRule, expenseReceiptRule } from '@/lib/uploads/rules'
import { verifyUploadedFile } from '@/lib/uploads/verify'

/**
 * เงินทดรองจ่าย — ชั้น DB (ไฟล์ 15 · `27` §6.4)
 *
 * ### กติกาที่ห้ามหลุด
 * - **ห้ามเบิกซ้อน 2 ชั้น** (`15` §9.2): pre-check ในทรานแซกชัน + partial unique
 *   `uniq_active_advance_per_payee` ระดับ DB เป็นด่านสุดท้าย (P2002 → `ADVANCE_PENDING_SETTLEMENT`)
 * - **ยอดคืนเป็น generated column** — ห้ามเขียน `returnSatang` ลง DB (Prisma ยอมให้ใส่แล้วไปตายที่ DB)
 * - **สูตร/ยามยอดใช้จริง** มาจาก `lib/finance/advance-calc.ts` (3.1) เท่านั้น ห้ามคำนวณซ้ำที่นี่
 * - ทุก mutation อยู่ใน `$transaction` เดียวกับ `emitAudit()` (`advances` = ตารางหมวด `money`)
 * - **scope ระดับแถว**: ผู้ถือ `manage:approve_advance` (การเงิน) เห็นทุกราย · ที่เหลือเห็นเฉพาะของตัวเอง
 *   — แยก scope ออกจาก filter ของผู้เรียกด้วย `AND` เสมอ (กับดัก commit `f188619`)
 */

export { APPROVE_ADVANCE, REQUEST_ADVANCE } from '@/lib/advances/advance'

const TARGET = 'advances'

export interface AdvanceMutationContext {
  actor: SessionUser
  meta: RequestMeta
}

const advanceSelect = {
  id: true,
  advanceNumber: true,
  payeeId: true,
  requestedSatang: true,
  approvedSatang: true,
  usedSatang: true,
  returnSatang: true,
  status: true,
  purpose: true,
  dueClearDate: true,
  approvedAt: true,
  clearedAt: true,
  rejectionReason: true,
  returnMethod: true,
  payoutBatchItemId: true,
  // มติ PO U74 — รอบจ่ายที่จ่ายเงินทดรองนี้ (ชี้ด้วย `payout_batch_item_id` · แถวของรอบที่ยกเลิกแล้วไม่ถูกชี้)
  payoutItems: { select: { id: true, payoutBatch: { select: { id: true, name: true, status: true } } } },
  createdAt: true,
  returns: {
    select: {
      id: true,
      returnNumber: true,
      channel: true,
      amountSatang: true,
      payoutBatchId: true,
      receivedDate: true,
      evidenceFilePath: true,
      note: true,
      reversedAt: true,
      reversalReason: true,
      createdAt: true,
      payoutBatch: { select: { name: true } },
      createdByUser: { select: { fullName: true } },
    },
    orderBy: { createdAt: 'desc' },
  },
  payee: {
    select: {
      id: true,
      userId: true,
      user: { select: { fullName: true, team: { select: { name: true } } } },
    },
  },
  approvedByUser: { select: { fullName: true } },
  createdByUser: { select: { fullName: true } },
  /** มติ PO U103 — ใบรับรองแทนใบเสร็จตอนเคลียร์ยอด (ถ้ามี) */
  substituteReceipts: substituteReceiptsRelationSelect,
} as const

type AdvanceRow = Prisma.AdvanceGetPayload<{ select: typeof advanceSelect }>
type AdvanceReturnRow = AdvanceRow['returns'][number]

/** รอบจ่ายปัจจุบันของเงินทดรอง (มติ PO U74) — แถวที่ `payout_batch_item_id` ชี้ · ไม่มี = `null` */
function payoutBatchOf(row: Pick<AdvanceRow, 'payoutBatchItemId' | 'payoutItems'>): AdvancePayoutBatchRef | null {
  if (row.payoutBatchItemId === null) return null
  const item = row.payoutItems.find((entry) => entry.id === row.payoutBatchItemId)
  return item === undefined ? null : { ...item.payoutBatch }
}

/** มติ PO U83 — เคยอยู่ในรอบจ่ายที่ `completed` (จ่ายจริงแล้ว) หรือไม่ — ดูทุกแถวในรอบจ่ายของเงินทดรองนี้ */
function paidOutOf(row: Pick<AdvanceRow, 'payoutItems'>): boolean {
  return isAdvancePaidOut(row.payoutItems.map((item) => item.payoutBatch))
}

/** ยอดคืนค้าง (`22` §6.14) — นับเฉพาะแถวที่ยังไม่กลับรายการ */
function returnOutstandingOf(row: Pick<AdvanceRow, 'returnSatang' | 'returns'>): {
  collected: number
  outstanding: number
} {
  const active = row.returns.filter((entry) => entry.reversedAt === null).map((entry) => entry.amountSatang)
  const outstanding = advanceReturnOutstandingSatang({ returnSatang: row.returnSatang, collectedSatang: active })
  return { collected: row.returnSatang - outstanding, outstanding }
}

function toReturnDto(row: AdvanceReturnRow): AdvanceReturnDto {
  return {
    id: row.id,
    returnNumber: row.returnNumber,
    channel: row.channel,
    amountSatang: row.amountSatang,
    payoutBatchId: row.payoutBatchId,
    payoutBatchName: row.payoutBatch?.name ?? null,
    receivedDate: row.receivedDate?.toISOString().slice(0, 10) ?? null,
    evidenceFilePath: row.evidenceFilePath,
    note: row.note,
    reversedAt: row.reversedAt?.toISOString() ?? null,
    reversalReason: row.reversalReason,
    createdAt: row.createdAt.toISOString(),
    createdByName: row.createdByUser.fullName,
  }
}

function toDto(row: AdvanceRow, now: Date): AdvanceDto {
  const settlement = advanceSettlement({
    requestedSatang: row.requestedSatang,
    approvedSatang: row.approvedSatang,
    usedSatang: row.usedSatang,
  })
  const returned = returnOutstandingOf(row)
  return {
    id: row.id,
    payeeId: row.payeeId,
    payeeName: row.payee.user.fullName,
    teamName: row.payee.user.team?.name ?? null,
    requestedSatang: row.requestedSatang,
    approvedSatang: row.approvedSatang,
    usedSatang: row.usedSatang,
    returnSatang: row.returnSatang,
    excessSatang: settlement.excessSatang,
    status: row.status,
    purpose: row.purpose,
    dueClearDate: row.dueClearDate.toISOString().slice(0, 10),
    isPastDue:
      UNCLEARED_ADVANCE_STATUSES.includes(row.status) && isAdvanceOverdue(row.dueClearDate, now),
    approvedByName: row.approvedByUser?.fullName ?? null,
    approvedAt: row.approvedAt?.toISOString() ?? null,
    clearedAt: row.clearedAt?.toISOString() ?? null,
    rejectionReason: row.rejectionReason,
    createdAt: row.createdAt.toISOString(),
    requesterName: row.createdByUser.fullName,
    ref: row.advanceNumber,
    returnMethod: row.returnMethod,
    returnCollectedSatang: returned.collected,
    returnOutstandingSatang: returned.outstanding,
    returnState: advanceReturnState({
      returnSatang: row.returnSatang,
      outstandingSatang: returned.outstanding,
      method: row.returnMethod,
    }),
    returns: row.returns.map(toReturnDto),
    payoutBatch: payoutBatchOf(row),
    paidOut: paidOutOf(row),
    substituteReceipt: substituteReceiptRefOf(row.substituteReceipts),
  }
}

export function canApproveAdvance(user: SessionUser): boolean {
  return hasCapability(user, 'manage', APPROVE_ADVANCE)
}

/** มติ PO U153/U160 — ขอเงินทดรองแทนผู้อื่น = การเงิน (`manage:approve_advance`) หรือ Superadmin */
export function canCreateAdvanceForOthers(user: SessionUser): boolean {
  return advanceCreateAccess((capability) => hasCapability(user, 'manage', capability)).onBehalf
}

/** ขอเงินทดรองให้ตัวเอง = `manage:request_advance` เท่านั้น (สิทธิ์เดิม · มติ PO U160 ไม่ขยายส่วนนี้) */
export function canCreateAdvanceForSelf(user: SessionUser): boolean {
  return advanceCreateAccess((capability) => hasCapability(user, 'manage', capability)).self
}

/** scope ระดับแถว — ผู้อนุมัติเห็นทั้งองค์กร · ผู้ขอเห็นเฉพาะ payee ของตัวเอง (`15` §12) */
function scopeFilter(user: SessionUser): Prisma.AdvanceWhereInput {
  if (user.isSuperadmin || canApproveAdvance(user)) return {}
  return { payee: { userId: user.id } }
}

const STATUS_FILTER: Readonly<Record<AdvanceListQuery['status'], readonly AdvanceStatus[] | null>> = {
  all: null,
  pending_approval: ['pending_approval'],
  approved: ['approved'],
  overdue: ['overdue'],
  cleared: ['cleared'],
  rejected: ['rejected'],
  uncleared: UNCLEARED_ADVANCE_STATUSES,
  // มติ U30 — คัดยอดค้างจริงต่อหลังคำนวณ (ยอดค้างอนุมานจากสมุดย่อย `advance_returns`)
  return_outstanding: ['cleared'],
}

export async function listAdvances(
  user: SessionUser,
  query: AdvanceListQuery,
  now: Date = new Date(),
): Promise<AdvanceDto[]> {
  const statuses = STATUS_FILTER[query.status]
  const rows = await prisma.advance.findMany({
    where: {
      AND: [
        { organizationId: user.organizationId, deletedAt: null },
        scopeFilter(user),
        statuses === null ? {} : { status: { in: [...statuses] } },
        query.payeeId === undefined ? {} : { payeeId: query.payeeId },
        query.status === 'return_outstanding' ? { returnMethod: { not: null } } : {},
      ],
    },
    select: advanceSelect,
    orderBy: [{ createdAt: 'desc' }],
    take: 300,
  })
  const dtos = rows.map((row) => toDto(row, now))
  return query.status === 'return_outstanding' ? dtos.filter((dto) => dto.returnOutstandingSatang > 0) : dtos
}

/** ยามของ upload/download หลักฐานรับคืน — เงินทดรองต้องอยู่ใน org + scope ของผู้เรียก (ไม่ leak) */
export async function assertAdvanceInScope(user: SessionUser, advanceId: string): Promise<void> {
  await findAdvance(user, advanceId)
}

async function findAdvance(user: SessionUser, advanceId: string): Promise<AdvanceRow> {
  const row = await prisma.advance.findFirst({
    where: { AND: [{ id: advanceId, organizationId: user.organizationId, deletedAt: null }, scopeFilter(user)] },
    select: advanceSelect,
  })
  if (row === null) throw new AdvanceError('ADVANCE_NOT_FOUND', { detail: `advance=${advanceId}` })
  return row
}

// ── POST /api/advances (`15` §14) ───────────────────────────────────────────

/**
 * ขอเบิกเงินทดรอง — ผู้ขอทั่วไปผูกกับ payee ของตัวเองเสมอ (`15` §12 own scope)
 * ผู้ถือสิทธิ์อนุมัติ (การเงิน) ระบุ `payeeId` เพื่อบันทึกแทนผู้อื่นได้
 */
export async function createAdvance(
  context: AdvanceMutationContext,
  input: AdvanceCreateInput,
  now: Date = new Date(),
): Promise<AdvanceDto> {
  const user = context.actor
  const policy = await getFinancePolicy(user.organizationId)
  assertWithinAdvanceMax(input.requestedSatang, policy.advanceMaxAmountPerRequestSatang)

  // Period Lock (`13` §6.11 · Phase 4.1) — เงินทดรองเป็นเงินที่ออกในงวดปัจจุบัน
  // งวดที่ปิดแล้วห้ามมีรายการเงินเพิ่มโดยตรง (`30` · `20`)
  await assertPeriodOpenAt({ organizationId: user.organizationId, at: now, targetType: 'advances' })

  // มติ PO U153 — ขอแทนผู้อื่นได้เฉพาะผู้ถือสิทธิ์อนุมัติเงินทดรอง (การเงิน) · ผู้อื่นส่ง payeeId มา = ปฏิเสธ (403)
  // (เดิมเงียบแล้วผูกกับตัวเอง — ผู้ใช้ไม่รู้ว่ารายการไม่ได้ไปที่ผู้รับที่เลือก)
  // มติ PO U160 — endpoint รับทั้ง `manage:request_advance` และ `manage:approve_advance` ⇒ แยกตรวจตามกรณีที่นี่
  // ขอให้ตัวเอง (ไม่ส่งผู้รับ) ยังต้องถือ `manage:request_advance` เหมือนเดิม
  if (input.payeeId === null && !canCreateAdvanceForSelf(user)) {
    throw new AuthError('PERMISSION_DENIED', `ขอเงินทดรองให้ตัวเองต้องมีสิทธิ์ขอเงินทดรอง user=${user.id}`)
  }
  if (input.payeeId !== null && !canCreateAdvanceForOthers(user)) {
    throw new AuthError('PERMISSION_DENIED', `ขอเงินทดรองแทนผู้อื่นต้องมีสิทธิ์อนุมัติเงินทดรอง user=${user.id}`)
  }

  const created = await prisma.$transaction(async (tx) => {
    let payeeId: string
    if (input.payeeId !== null) {
      const payee = await assertPayeeInOrganization(tx as ExpenseTxClient, user.organizationId, input.payeeId)
      if (payee.userId === user.id && !canCreateAdvanceForSelf(user)) {
        // เลือกผู้รับเป็นตัวเอง = ขอให้ตัวเอง (ไม่ใช่ขอแทน) — สิทธิ์ขอแทนใช้กับกรณีนี้ไม่ได้ (มติ PO U160)
        throw new AuthError('PERMISSION_DENIED', `ขอเงินทดรองให้ตัวเองต้องมีสิทธิ์ขอเงินทดรอง user=${user.id}`)
      }
      payeeId = payee.id
    } else {
      payeeId = await ensureAgentPayeeId(tx as ExpenseTxClient, {
        organizationId: user.organizationId,
        userId: user.id,
        actorId: user.id,
      })
    }

    // ชั้นที่ 1 — ตอบผู้ใช้ด้วยข้อความที่บอกได้ว่าติดรายการไหน (ชั้นที่ 2 คือ partial unique ของ DB)
    const uncleared = await tx.advance.findFirst({
      where: {
        organizationId: user.organizationId,
        payeeId,
        status: { in: [...UNCLEARED_ADVANCE_STATUSES] },
        deletedAt: null,
      },
      select: { id: true, status: true },
    })
    assertNoUnclearedAdvance(uncleared)

    const row = await tx.advance.create({
      data: {
        organizationId: user.organizationId,
        payeeId,
        requestedSatang: input.requestedSatang,
        purpose: input.purpose,
        dueClearDate: input.dueClearDate,
        status: 'pending_approval',
        createdBy: user.id,
      },
      select: advanceSelect,
    })

    await emitAudit(
      {
        organizationId: user.organizationId,
        actorId: user.id,
        actorRole: user.roleName,
        action: 'create',
        targetType: TARGET,
        targetId: row.id,
        after: {
          payee_id: payeeId,
          // มติ PO U153 — บันทึกแทนผู้อื่น: ผู้รับ (เจ้าของ payee) แยกจากผู้บันทึก (`actor_id`)
          recorded_by: user.id,
          on_behalf_of_user_id: row.payee.userId !== user.id ? row.payee.userId : null,
          requested_satang: row.requestedSatang,
          purpose: row.purpose,
          due_clear_date: row.dueClearDate.toISOString().slice(0, 10),
          status: row.status,
        },
        reason: null,
        ipAddress: context.meta.ipAddress,
        userAgent: context.meta.userAgent,
        diffOnly: false,
      },
      tx,
    )

    return row
  }).catch(rethrowDuplicateAdvance)

  // มติ PO U29 — คำขอใหม่เข้าคิวอนุมัติ ⇒ แจ้งผู้ถือสิทธิ์อนุมัติเงินทดรองทันที (หลัง commit)
  notifyAdvanceAwaitingApproval(user.organizationId, created.id)
  return toDto(created, now)
}

/** ด่านสุดท้ายของ "ห้ามเบิกซ้อน" — partial unique ของ DB ชนะการแข่งกันของสองคำขอพร้อมกัน */
function rethrowDuplicateAdvance(error: unknown): never {
  if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
    throw new AdvanceError('ADVANCE_PENDING_SETTLEMENT', { detail: 'uniq_active_advance_per_payee' })
  }
  throw error
}

async function assertPayeeInOrganization(
  tx: ExpenseTxClient,
  organizationId: string,
  payeeId: string,
): Promise<{ id: string; userId: string | null }> {
  const payee = await tx.payeeProfile.findFirst({
    where: { id: payeeId, organizationId, deletedAt: null },
    select: { id: true, userId: true },
  })
  if (payee === null) throw new AdvanceError('ADVANCE_NOT_FOUND', { detail: `payee=${payeeId}` })
  return payee
}

// ── PATCH /api/advances/:id/approve · /reject · /settle ─────────────────────

export async function approveAdvance(
  context: AdvanceMutationContext,
  advanceId: string,
  input: AdvanceApproveInput,
  now: Date = new Date(),
): Promise<AdvanceDto> {
  const user = context.actor
  const current = await findAdvance(user, advanceId)
  const status = nextAdvanceStatus(current.status, 'approve')
  const approvedSatang = resolveApprovedSatang(current.requestedSatang, input.approvedSatang)
  const at = new Date()
  await assertPeriodOpenAt({
    organizationId: user.organizationId,
    at: now,
    targetType: 'advances',
    targetId: advanceId,
  })

  const updated = await prisma.$transaction(async (tx) => {
    // ยึดแถวด้วยสถานะเดิม (compare-and-set) — อนุมัติ/ปฏิเสธใบเดียวกันพร้อมกันต้องสำเร็จได้คำขอเดียว (Final Test ด่าน 6)
    const claimed = await tx.advance.updateMany({
      where: { id: advanceId, organizationId: user.organizationId, status: current.status, deletedAt: null },
      data: {
        status,
        approvedSatang,
        approvedBy: user.id,
        approvedAt: at,
        updatedBy: user.id,
        // มติ PO U130 — หัวกระดาษใบเบิกเงินทดรอง ณ ตอนอนุมัติ (ใบพิมพ์ได้ตั้งแต่อนุมัติ)
        ...(status === 'approved' ? { letterheadSnapshot: await captureLetterheadSnapshot(tx, user.organizationId) } : {}),
      },
    })
    if (claimed.count !== 1) {
      throw new AdvanceError('ADVANCE_INVALID_STATUS', { detail: `advance=${advanceId} ถูกเปลี่ยนสถานะไปแล้ว` })
    }
    const row = await tx.advance.findUniqueOrThrow({ where: { id: advanceId }, select: advanceSelect })

    await emitAudit(
      {
        organizationId: user.organizationId,
        actorId: user.id,
        actorRole: user.roleName,
        action: 'approve',
        targetType: TARGET,
        targetId: advanceId,
        before: { status: current.status, approved_satang: current.approvedSatang },
        after: { status, approved_satang: approvedSatang, requested_satang: current.requestedSatang },
        reason: input.note,
        ipAddress: context.meta.ipAddress,
        userAgent: context.meta.userAgent,
        diffOnly: false,
      },
      tx,
    )

    return row
    // ห้ามเบิกซ้อนถูกกันไว้ตอน**สร้าง**ก็จริง แต่ยังมี `pending_approval` หลายใบต่อคนได้โดยตั้งใจ
    // (ยามตอนสร้างดูเฉพาะ `approved`/`overdue`) ⇒ อนุมัติใบที่สองของคนเดิมคือจังหวะที่ชน
    // `uniq_active_advance_per_payee` จริง ต้องตอบ `ADVANCE_PENDING_SETTLEMENT` (400) เหมือน
    // ตอนสร้าง ไม่ใช่ Prisma error ดิบ 500 (`15` §6.2 · `24` §6.4)
  }).catch(rethrowDuplicateAdvance)

  return toDto(updated, now)
}

export async function rejectAdvance(
  context: AdvanceMutationContext,
  advanceId: string,
  input: AdvanceRejectInput,
  now: Date = new Date(),
): Promise<AdvanceDto> {
  const user = context.actor
  const reason = assertAdvanceRejectionReason(input.rejectionReason)
  const current = await findAdvance(user, advanceId)
  const status = nextAdvanceStatus(current.status, 'reject')
  await assertPeriodOpenAt({
    organizationId: user.organizationId,
    at: now,
    targetType: 'advances',
    targetId: advanceId,
  })

  const updated = await prisma.$transaction(async (tx) => {
    // compare-and-set เหมือนอนุมัติ — คำขอที่แพ้ได้ ADVANCE_INVALID_STATUS ไม่ทับผลของอีกคน (Final Test ด่าน 6)
    const claimed = await tx.advance.updateMany({
      where: { id: advanceId, organizationId: user.organizationId, status: current.status, deletedAt: null },
      data: { status, rejectionReason: reason, updatedBy: user.id },
    })
    if (claimed.count !== 1) {
      throw new AdvanceError('ADVANCE_INVALID_STATUS', { detail: `advance=${advanceId} ถูกเปลี่ยนสถานะไปแล้ว` })
    }
    const row = await tx.advance.findUniqueOrThrow({ where: { id: advanceId }, select: advanceSelect })

    await emitAudit(
      {
        organizationId: user.organizationId,
        actorId: user.id,
        actorRole: user.roleName,
        action: 'reject',
        targetType: TARGET,
        targetId: advanceId,
        before: { status: current.status },
        after: { status, rejection_reason: reason },
        reason,
        ipAddress: context.meta.ipAddress,
        userAgent: context.meta.userAgent,
        diffOnly: false,
      },
      tx,
    )

    return row
  })

  return toDto(updated, now)
}

/**
 * เคลียร์ยอด (`15` §9.1) — ยอดคืนถูกคำนวณโดย **DB (generated column)** ไม่ใช่โค้ดนี้
 *
 * **มติ PO 03/10/2569 (UAT Q3, BUG-011)**: ใช้เกินยอดอนุมัติ ⇒ **บันทึกได้ ไม่บล็อก** ยอดคืน = 0
 * และสร้าง **คำขอเบิกส่วนเกินอัตโนมัติ** ในทรานแซกชันเดียวกัน (`22` §6.13 · `15` §9.1):
 * - เป็น Manual Claim (`expense_type = manual`, ไม่ผูกเคส) ของ **payee เดียวกับเงินทดรอง** ⇒ WHT ใช้
 *   Tax Profile ของ payee ตามกติกา Payee ชนะ Plan (`18` §6.3)
 * - snapshot แผนค่าตอบแทนของทีมผู้รับเงินไว้เป็น fallback อัตรา WHT — payee ที่ยังไม่มี Tax Profile
 *   จะไม่ทำให้การสร้างรอบจ่ายล้มทั้งรอบ (หนี้ #3: ไม่มีทั้ง Tax Profile และแผน)
 * - ยอดเท่ากับ `excessSatang` ของ `advanceSettlement()` (3.1) — ไม่คำนวณซ้ำที่นี่
 *
 * เจ้าของคำขอกรอกยอดใช้จริงได้เอง (`15` §12) — scope บังคับที่ `findAdvance()`
 * กันเคลียร์ซ้ำพร้อมกัน (ซึ่งจะสร้างคำขอเบิกส่วนเกินซ้ำ) ด้วย `updateMany` ที่ผูกสถานะเดิม
 */
export async function settleAdvance(
  context: AdvanceMutationContext,
  advanceId: string,
  input: AdvanceSettleInput,
  now: Date = new Date(),
): Promise<AdvanceSettleResult> {
  const user = context.actor
  const current = await findAdvance(user, advanceId)
  const status = nextAdvanceStatus(current.status, 'settle')
  await assertPeriodOpenAt({
    organizationId: user.organizationId,
    at: now,
    targetType: 'advances',
    targetId: advanceId,
  })
  const preview = advanceSettlement({
    requestedSatang: current.requestedSatang,
    approvedSatang: current.approvedSatang,
    usedSatang: input.usedSatang,
  })
  const at = new Date()
  // มติ PO U143 — ใบเสร็จต้องเป็นไฟล์ที่อัปโหลดผ่าน server แล้ว: ตรวจไฟล์ (prefix ของผู้เคลียร์ · มีจริง · magic bytes ·
  // ขนาด) + SHA-256 ของ server · นอก `$transaction` (I/O เครือข่าย)
  const receiptFileUrl = input.receiptFileUrl ?? null
  const receipt = receiptFileUrl === null ? null : await verifyUploadedFile(receiptFileUrl, expenseReceiptRule(user.id))
  // มติ PO U30 — มียอดคืน ⇒ ผู้เคลียร์เลือกวิธีคืน (ค่าเริ่มต้นหักกลบในรอบจ่ายถัดไป) · ไม่มียอดคืน ⇒ NULL
  const returnMethod = resolveSettleReturnMethod(preview.returnSatang, input.returnMethod)

  const { row: updated, excessClaimId } = await prisma.$transaction(async (tx) => {
    // มติ PO U74 — ล็อกแถวก่อนอ่านรอบจ่ายที่ชี้อยู่ ⇒ การสร้าง/ยกเลิกรอบจ่ายที่แตะแถวนี้ต้องรอ
    // (สร้างรอบ: ยึด `payout_batch_item_id` ด้วย `updateMany` ที่ผูกสถานะ approved|overdue ⇒ หลังเคลียร์แล้วยึดไม่ได้)
    const locked = await lockAdvanceForReturn(tx as ExpenseTxClient, user.organizationId, advanceId)
    // มติ PO U83 — ต้องเคยอยู่ในรอบจ่ายที่ completed (เงินออกจริงแล้ว) ก่อนเคลียร์ได้
    assertSettleNotInPendingPayout(advanceId, payoutBatchOf(locked), paidOutOf(locked))

    const claimed = await tx.advance.updateMany({
      where: { id: advanceId, organizationId: user.organizationId, status: current.status, deletedAt: null },
      // ⚠️ ห้ามส่ง `returnSatang` — เป็น generated column ของ DB (`02` §5)
      data: { status, usedSatang: input.usedSatang, clearedAt: at, returnMethod, updatedBy: user.id },
    })
    if (claimed.count !== 1) {
      throw new AdvanceError('ADVANCE_INVALID_STATUS', { detail: `advance=${advanceId} ถูกเปลี่ยนสถานะไปแล้ว` })
    }
    // มติ PO U103 — รายจ่ายที่ไม่มีใบเสร็จ ⇒ ออกใบรับรองแทนใบเสร็จ (CRT) ผูกเงินทดรองนี้ในทรานแซกชันเดียวกัน
    const substituteLines = input.substituteReceipt?.lines ?? null
    const substitute =
      substituteLines === null
        ? null
        : await issueSubstituteReceipt(tx as ExpenseTxClient, context, {
            organizationId: user.organizationId,
            payeeId: current.payeeId,
            link: { kind: 'advance', advanceId },
            lines: substituteLines,
            at,
          })

    const row = await tx.advance.findUniqueOrThrow({ where: { id: advanceId }, select: advanceSelect })

    const excessClaim = preview.needsExtraClaim
      ? await insertManualClaim(tx as ExpenseTxClient, context, {
          payeeId: current.payeeId,
          claimType: ADVANCE_EXCESS_CLAIM_TYPE,
          grossSatang: preview.excessSatang,
          expenseDate: bangkokBusinessDate(at),
          receiptFileUrl,
          receiptFileHash: receipt?.sha256 ?? null,
          note: advanceExcessClaimNote({
            purpose: current.purpose,
            approvedSatang: current.approvedSatang ?? 0,
            usedSatang: input.usedSatang,
          }),
          ...(await resolveTeamPlanSnapshot(tx as ExpenseTxClient, current.payeeId)),
        })
      : null

    await emitAudit(
      {
        organizationId: user.organizationId,
        actorId: user.id,
        actorRole: user.roleName,
        action: 'status_change',
        targetType: TARGET,
        targetId: advanceId,
        before: { status: current.status, used_satang: current.usedSatang, return_satang: current.returnSatang },
        after: {
          status,
          used_satang: row.usedSatang,
          return_satang: row.returnSatang,
          return_method: returnMethod,
          excess_satang: preview.excessSatang,
          excess_claim_id: excessClaim?.id ?? null,
          // `15` §13 — ใบเสร็จอ้างอิงเก็บใน audit (ตาราง `advances` ไม่มีคอลัมน์เก็บไฟล์)
          receipt_file_url: receiptFileUrl,
          receipt_file_hash: receipt?.sha256 ?? null,
          substitute_receipt_number: substitute?.receiptNumber ?? null,
          substitute_receipt_total_satang: substitute?.totalSatang ?? null,
        },
        reason: input.note,
        ipAddress: context.meta.ipAddress,
        userAgent: context.meta.userAgent,
        diffOnly: false,
      },
      tx,
    )

    return { row, excessClaimId: excessClaim?.id ?? null }
  })

  // มติ PO U29 — คำขอเบิกส่วนเกินเข้าคิวอนุมัติค่าตอบแทน ⇒ แจ้งผู้อนุมัติขั้น 1
  if (excessClaimId !== null) notifyExpensesAwaitingApproval(user.organizationId, [excessClaimId])
  return { ...toDto(updated, now), excessClaimId }
}

/**
 * แผนค่าตอบแทนของทีมผู้รับเงิน ณ ตอนเคลียร์ยอด (snapshot `92` §7.1) — fallback อัตรา WHT เท่านั้น
 * ไม่มีทีม/ไม่มีแผน ⇒ `null` (payee ที่มี Tax Profile ไม่ต้องใช้อยู่แล้ว)
 */
async function resolveTeamPlanSnapshot(
  tx: ExpenseTxClient,
  payeeId: string,
): Promise<{ compPlanId: string | null; compPlanVersion: number | null }> {
  const payee = await tx.payeeProfile.findUnique({
    where: { id: payeeId },
    select: { user: { select: { team: { select: { compensationPlan: { select: { id: true, version: true } } } } } } },
  })
  const plan = payee?.user.team?.compensationPlan ?? null
  return { compPlanId: plan?.id ?? null, compPlanVersion: plan?.version ?? null }
}

// ── ยอดคืนเงินทดรอง (มติ PO 05/10/2569 UAT U30 · BUG-109 · `15` §9.3) ─────────────

/**
 * ล็อกแถวเงินทดรองแล้วอ่านยอดค้างใหม่ในทรานแซกชัน — กันสองคำขอ (หรือคำขอ + การสร้างรอบจ่าย)
 * ตัดสินจากยอดค้างเดียวกัน (trigger ของ DB เป็นด่านสุดท้ายอีกชั้น)
 */
async function lockAdvanceForReturn(
  tx: ExpenseTxClient,
  organizationId: string,
  advanceId: string,
): Promise<AdvanceRow> {
  await tx.$queryRaw`SELECT id FROM advances WHERE id = ${advanceId}::uuid FOR UPDATE`
  const row = await tx.advance.findFirst({
    where: { id: advanceId, organizationId, deletedAt: null },
    select: advanceSelect,
  })
  if (row === null) throw new AdvanceError('ADVANCE_NOT_FOUND', { detail: `advance=${advanceId}` })
  return row
}

/**
 * `PATCH /api/advances/:id/return-method` — การเงินเปลี่ยนวิธีคืน (เหตุผล + audit)
 * ทำได้เมื่อยังมียอดค้าง — ยอดที่ถูกหักในรอบจ่ายที่สร้างแล้วไม่ใช่ยอดค้าง ⇒ "ก่อนรอบจ่ายที่จะหักถูกสร้าง"
 */
export async function changeAdvanceReturnMethod(
  context: AdvanceMutationContext,
  advanceId: string,
  input: AdvanceReturnMethodChangeInput,
  now: Date = new Date(),
): Promise<AdvanceDto> {
  const user = context.actor
  if (!user.isSuperadmin && !canApproveAdvance(user)) {
    throw new AdvanceError('ADVANCE_NOT_FOUND', { detail: `advance=${advanceId} (ไม่ใช่ผู้ถือสิทธิ์การเงิน)` })
  }
  await findAdvance(user, advanceId)

  const updated = await prisma.$transaction(async (tx) => {
    const current = await lockAdvanceForReturn(tx as ExpenseTxClient, user.organizationId, advanceId)
    const { outstanding } = returnOutstandingOf(current)
    assertCanChangeReturnMethod({
      status: current.status,
      current: current.returnMethod,
      target: input.returnMethod,
      outstandingSatang: outstanding,
    })

    const row = await tx.advance.update({
      where: { id: advanceId },
      data: { returnMethod: input.returnMethod, updatedBy: user.id },
      select: advanceSelect,
    })

    await emitAudit(
      {
        organizationId: user.organizationId,
        actorId: user.id,
        actorRole: user.roleName,
        action: 'update',
        targetType: TARGET,
        targetId: advanceId,
        before: { return_method: current.returnMethod, return_outstanding_satang: outstanding },
        after: { return_method: input.returnMethod, return_outstanding_satang: outstanding },
        reason: input.reason,
        ipAddress: context.meta.ipAddress,
        userAgent: context.meta.userAgent,
        diffOnly: false,
      },
      tx,
    )
    return row
  })

  return toDto(updated, now)
}

/**
 * `POST /api/advances/:id/returns` — การเงินบันทึกรับคืนแยก (เงินสด/โอน + วันที่ + ยอด + หลักฐาน)
 * ยอดครบ ⇒ ยอดคืนปิด (`returnState = closed`) · ยอดไม่ครบ ⇒ ยังค้างส่วนที่เหลือ (วิธีคืนยังเป็นรับคืนแยก)
 * ไฟล์ตรวจฝั่ง server ก่อนเข้าทรานแซกชัน (กลไกอัปโหลดเดิม — `verifyUploadedFile()`)
 */
export async function recordAdvanceSeparateReturn(
  context: AdvanceMutationContext,
  advanceId: string,
  input: AdvanceSeparateReturnInput,
  now: Date = new Date(),
): Promise<AdvanceDto> {
  const user = context.actor
  if (!user.isSuperadmin && !canApproveAdvance(user)) {
    throw new AdvanceError('ADVANCE_NOT_FOUND', { detail: `advance=${advanceId} (ไม่ใช่ผู้ถือสิทธิ์การเงิน)` })
  }
  const before = await findAdvance(user, advanceId)
  // ตรวจก่อนอัปโหลด/เปิดทรานแซกชันเพื่อให้ผู้ใช้ได้ข้อความที่ถูกเหตุ (ตรวจซ้ำในทรานแซกชันอีกชั้น)
  assertSeparateReturnAllowed({
    status: before.status,
    method: before.returnMethod,
    outstandingSatang: returnOutstandingOf(before).outstanding,
    amountSatang: input.amountSatang,
  })
  // เงินเข้ามาในวันที่รับจริง ⇒ งวดของวันนั้นต้องยังเปิด (Period Lock — `30`/`20`)
  await assertPeriodOpenAt({
    organizationId: user.organizationId,
    at: input.receivedDate,
    targetType: 'advances',
    targetId: advanceId,
  })
  const verified = await verifyUploadedFile(input.evidenceFilePath, advanceReturnFileRule(advanceId))

  const updated = await prisma.$transaction(async (tx) => {
    const current = await lockAdvanceForReturn(tx as ExpenseTxClient, user.organizationId, advanceId)
    const { outstanding } = returnOutstandingOf(current)
    assertSeparateReturnAllowed({
      status: current.status,
      method: current.returnMethod,
      outstandingSatang: outstanding,
      amountSatang: input.amountSatang,
    })

    const created = await tx.advanceReturn.create({
      data: {
        organizationId: user.organizationId,
        advanceId,
        payeeId: current.payeeId,
        channel: input.channel,
        amountSatang: input.amountSatang,
        receivedDate: input.receivedDate,
        evidenceFilePath: input.evidenceFilePath,
        evidenceFileSha256: verified.sha256,
        note: input.note,
        createdBy: user.id,
        // มติ PO U130 — หัวกระดาษใบรับคืนเงินทดรอง ณ ตอนบันทึก
        letterheadSnapshot: await captureLetterheadSnapshot(tx, user.organizationId),
      },
      select: { id: true },
    })

    await emitAudit(
      {
        organizationId: user.organizationId,
        actorId: user.id,
        actorRole: user.roleName,
        action: 'create',
        targetType: 'advance_returns',
        targetId: created.id,
        after: {
          advance_id: advanceId,
          channel: input.channel,
          amount_satang: input.amountSatang,
          received_date: input.receivedDate.toISOString().slice(0, 10),
          evidence_file_path: input.evidenceFilePath,
          evidence_file_sha256: verified.sha256,
          return_outstanding_before_satang: outstanding,
          return_outstanding_after_satang: outstanding - input.amountSatang,
        },
        reason: input.note,
        ipAddress: context.meta.ipAddress,
        userAgent: context.meta.userAgent,
        diffOnly: false,
      },
      tx,
    )

    return tx.advance.findUniqueOrThrow({ where: { id: advanceId }, select: advanceSelect })
  })

  return toDto(updated, now)
}
