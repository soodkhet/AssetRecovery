import {
  assertAdvanceRejectionReason,
  assertNoUnclearedAdvance,
  assertWithinAdvanceMax,
  isAdvanceOverdue,
  nextAdvanceStatus,
  resolveApprovedSatang,
  UNCLEARED_ADVANCE_STATUSES,
} from '@/lib/advances/advance'
import { AdvanceError } from '@/lib/advances/errors'
import type { AdvanceCreateInput, AdvanceApproveInput, AdvanceListQuery, AdvanceRejectInput, AdvanceSettleInput } from '@/lib/advances/schemas'
import type { AdvanceDto } from '@/lib/advances/types'
import { emitAudit } from '@/lib/audit/audit'
import { hasCapability } from '@/lib/auth/permission'
import type { RequestMeta } from '@/lib/auth/request-meta'
import type { SessionUser } from '@/lib/auth/types'
import { ensureAgentPayeeId, type ExpenseTxClient } from '@/lib/field/expense-queries'
import { advanceSettlement, assertSettlementAllowed } from '@/lib/finance/advance-calc'
import { Prisma } from '@/lib/generated/prisma/client'
import type { AdvanceStatus } from '@/lib/generated/prisma/enums'
import { prisma } from '@/lib/prisma'
import { getFinancePolicy } from '@/lib/settings/queries/finance-policy'

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

export const REQUEST_ADVANCE = 'request_advance'
export const APPROVE_ADVANCE = 'approve_advance'

const TARGET = 'advances'

export interface AdvanceMutationContext {
  actor: SessionUser
  meta: RequestMeta
}

const advanceSelect = {
  id: true,
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
  createdAt: true,
  payee: {
    select: {
      id: true,
      userId: true,
      user: { select: { fullName: true, team: { select: { name: true } } } },
    },
  },
  approvedByUser: { select: { fullName: true } },
  createdByUser: { select: { fullName: true } },
} as const

type AdvanceRow = Prisma.AdvanceGetPayload<{ select: typeof advanceSelect }>

function toDto(row: AdvanceRow, now: Date): AdvanceDto {
  const settlement = advanceSettlement({
    requestedSatang: row.requestedSatang,
    approvedSatang: row.approvedSatang,
    usedSatang: row.usedSatang,
  })
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
  }
}

export function canApproveAdvance(user: SessionUser): boolean {
  return hasCapability(user, 'manage', APPROVE_ADVANCE)
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
      ],
    },
    select: advanceSelect,
    orderBy: [{ createdAt: 'desc' }],
    take: 300,
  })
  return rows.map((row) => toDto(row, now))
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

  const created = await prisma.$transaction(async (tx) => {
    const payeeId =
      input.payeeId !== null && (user.isSuperadmin || canApproveAdvance(user))
        ? await assertPayeeInOrganization(tx as ExpenseTxClient, user.organizationId, input.payeeId)
        : await ensureAgentPayeeId(tx as ExpenseTxClient, {
            organizationId: user.organizationId,
            userId: user.id,
            actorId: user.id,
          })

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
): Promise<string> {
  const payee = await tx.payeeProfile.findFirst({
    where: { id: payeeId, organizationId, deletedAt: null },
    select: { id: true },
  })
  if (payee === null) throw new AdvanceError('ADVANCE_NOT_FOUND', { detail: `payee=${payeeId}` })
  return payee.id
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

  const updated = await prisma.$transaction(async (tx) => {
    const row = await tx.advance.update({
      where: { id: advanceId },
      data: { status, approvedSatang, approvedBy: user.id, approvedAt: at, updatedBy: user.id },
      select: advanceSelect,
    })

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
  })

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

  const updated = await prisma.$transaction(async (tx) => {
    const row = await tx.advance.update({
      where: { id: advanceId },
      data: { status, rejectionReason: reason, updatedBy: user.id },
      select: advanceSelect,
    })

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
 * `assertSettlementAllowed()` (3.1) เทียบกับ **ยอดที่ขอ** ตาม `24` §6.4 (`USED_EXCEEDS_REQUEST_NO_TOPUP`)
 *
 * เจ้าของคำขอกรอกยอดใช้จริงได้เอง (`15` §12) — scope บังคับที่ `findAdvance()`
 */
export async function settleAdvance(
  context: AdvanceMutationContext,
  advanceId: string,
  input: AdvanceSettleInput,
  now: Date = new Date(),
): Promise<AdvanceDto> {
  const user = context.actor
  const current = await findAdvance(user, advanceId)
  const status = nextAdvanceStatus(current.status, 'settle')
  assertSettlementAllowed({ requestedSatang: current.requestedSatang, usedSatang: input.usedSatang })
  const preview = advanceSettlement({
    requestedSatang: current.requestedSatang,
    approvedSatang: current.approvedSatang,
    usedSatang: input.usedSatang,
  })
  const at = new Date()

  const updated = await prisma.$transaction(async (tx) => {
    const row = await tx.advance.update({
      where: { id: advanceId },
      // ⚠️ ห้ามส่ง `returnSatang` — เป็น generated column ของ DB (`02` §5)
      data: { status, usedSatang: input.usedSatang, clearedAt: at, updatedBy: user.id },
      select: advanceSelect,
    })

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
          excess_satang: preview.excessSatang,
          // `15` §13 — ใบเสร็จอ้างอิงเก็บใน audit (ตาราง `advances` ไม่มีคอลัมน์เก็บไฟล์)
          receipt_file_url: input.receiptFileUrl,
        },
        reason: input.note,
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
