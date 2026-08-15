import {
  adjustmentTargetColumns,
  adjustmentTargetOf,
  approverRolesOf,
  assertActorCanApproveAdjustment,
  assertAdjustmentActionable,
  assertAdjustmentReason,
  assertRejectionReason,
  parsePeriodStatusSnapshot,
  periodKeyOf,
  signedAdjustmentSatang,
  type AdjustmentTargetType,
  type PeriodKey,
} from '@/lib/adjustments/adjustment'
import { AdjustmentError } from '@/lib/adjustments/errors'
import type {
  AdjustmentApproveInput,
  AdjustmentCreateInput,
  AdjustmentListQuery,
  AdjustmentRejectInput,
  AdjustmentTargetQuery,
} from '@/lib/adjustments/schemas'
import type { AdjustmentDto, AdjustmentTargetDto } from '@/lib/adjustments/types'
import { emitAudit } from '@/lib/audit/audit'
import type { RequestMeta } from '@/lib/auth/request-meta'
import type { SessionUser } from '@/lib/auth/types'
import {
  adjustmentApprovalPolicyFor,
  assertApprovalLevelSufficient,
  missingApproverRoles,
  requiresSeparateAuditEntry,
} from '@/lib/finance/adjustment-approval-policy'
import type { Prisma } from '@/lib/generated/prisma/client'
import type { AccountingPeriodStatus, AdjustmentStatus } from '@/lib/generated/prisma/enums'
import { prisma } from '@/lib/prisma'
import { isRevenueError } from '@/lib/revenue/errors'
import { assertRevenueAmountEditable } from '@/lib/revenue/queries'
import { parseBillingPeriodLabel } from '@/lib/revenue/revenue'
import { isDirectEditBlocked } from '@/lib/settings/period-lock'
import { toDateOnlyIso, toIso } from '@/lib/settings/queries/shared'

/**
 * รายการปรับปรุง (ไฟล์ 20) — ชั้น DB (`27` §6.8)
 *
 * ### กติกาที่ห้ามหลุด
 * - **Adjustment ไม่แตะ source record เลย** (`20` §6.1) — ที่นี่จึงมีแต่ INSERT/UPDATE บนตาราง
 *   `adjustments` เท่านั้น ยอดสุทธิของรายการต้นทางเป็นเรื่องของรายงาน (`netAfterAdjustments()`)
 * - **`period_status_at_target` snapshot ตอนสร้าง** (`92` §7.1) แล้วใช้ตัดสินระดับอนุมัติตลอดอายุ
 *   รายการ — รอบถูกปิดเพิ่มระหว่างรออนุมัติไม่ย้อนไปเปลี่ยนระดับที่ต้องใช้
 * - **ระดับอนุมัติมาจาก `adjustmentApprovalPolicyFor()` (3.1) เท่านั้น** ห้ามเขียนตาราง
 *   collecting/sent/locked ซ้ำที่นี่
 * - **บทบาทที่อนุมัติไปแล้วอ่านจาก `audit_logs`** — `02` §8 มีคอลัมน์ผู้อนุมัติช่องเดียว
 *   (`approved_by`) ส่วนรอบ `sent_to_accountant` ต้องอนุมัติ 2 บทบาท ⇒ ใช้ audit log ที่
 *   immutable + append-only เป็นทะเบียนผู้อนุมัติ (ไม่เพิ่มคอลัมน์นอก `02`)
 */

const TARGET = 'adjustments'

export interface AdjustmentMutationContext {
  actor: SessionUser
  meta: RequestMeta
}

// ── งวดบัญชีของรายการต้นทาง ─────────────────────────────────────────────────

/** `null` = ยังไม่มีงวดบัญชีของเดือนนั้น ⇒ นโยบายถือเป็น `collecting` (`13` §6.11) */
async function periodStatusAt(organizationId: string, key: PeriodKey): Promise<AccountingPeriodStatus | null> {
  const row = await prisma.accountingPeriod.findFirst({
    where: { organizationId, yearBe: key.yearBe, month: key.month },
    select: { status: true },
  })
  return row?.status ?? null
}

// ── รายการต้นทาง (`20` §7.1 · §8) ───────────────────────────────────────────

interface RawTarget {
  targetRef: string
  targetLabel: string
  currentSatang: number
  /** วันที่ที่ใช้หางวดบัญชีของรายการนี้ */
  targetDate: Date
  /** กติกาเฉพาะโมดูลที่ห้ามแก้ยอดตรงแล้ว (นอกเหนือจาก Period Lock) */
  moduleDirectEditBlocked: boolean
}

/**
 * รายได้: ยามที่ตัดสินว่ายังแก้ยอดตรงได้ไหมคือ `assertRevenueAmountEditable()` ของ 3.6
 * (`19` §10) — **ห้ามเช็คสถานะรอบวางบิลเองที่นี่** · `EDIT_BILLED_REVENUE` ที่มันโยนออกมา
 * ไม่ใช่ error ของ flow นี้ แต่คือ "ต้องใช้ Adjustment" ซึ่งคือสิ่งที่ผู้ใช้กำลังทำอยู่พอดี
 */
async function revenueTarget(user: SessionUser, targetId: string): Promise<RawTarget> {
  const row = await prisma.revenue.findFirst({
    where: { id: targetId, organizationId: user.organizationId, deletedAt: null },
    select: {
      revenueDate: true,
      totalSatang: true,
      trackingRound: true,
      case: { select: { caseRef: true } },
      company: { select: { name: true } },
    },
  })
  if (row === null) throw new AdjustmentError('ADJUSTMENT_TARGET_NOT_FOUND', { detail: `revenue=${targetId}` })

  let moduleDirectEditBlocked = false
  try {
    await assertRevenueAmountEditable(user, targetId)
  } catch (error) {
    if (!isRevenueError(error) || error.code !== 'EDIT_BILLED_REVENUE') throw error
    moduleDirectEditBlocked = true
  }

  return {
    targetRef: row.case.caseRef,
    targetLabel: `${row.company.name} · รายได้ ${toDateOnlyIso(row.revenueDate)} (รอบติดตามที่ ${row.trackingRound})`,
    currentSatang: row.totalSatang,
    targetDate: row.revenueDate,
    moduleDirectEditBlocked,
  }
}

async function expenseTarget(user: SessionUser, targetId: string): Promise<RawTarget> {
  const row = await prisma.expense.findFirst({
    where: { id: targetId, organizationId: user.organizationId, deletedAt: null },
    select: {
      expenseType: true,
      expenseDate: true,
      grossSatang: true,
      status: true,
      case: { select: { caseRef: true } },
      payee: { select: { user: { select: { fullName: true } } } },
    },
  })
  if (row === null) throw new AdjustmentError('ADJUSTMENT_TARGET_NOT_FOUND', { detail: `expense=${targetId}` })

  return {
    targetRef: row.case?.caseRef ?? targetId.slice(0, 8),
    targetLabel: `${row.payee.user.fullName} · ${row.expenseType} (${row.status})`,
    currentSatang: row.grossSatang,
    targetDate: row.expenseDate,
    moduleDirectEditBlocked: false,
  }
}

async function billingBatchTarget(user: SessionUser, targetId: string): Promise<RawTarget> {
  const row = await prisma.billingBatch.findFirst({
    where: { id: targetId, organizationId: user.organizationId, deletedAt: null },
    select: { period: true, totalSatang: true, dueDate: true, company: { select: { name: true } } },
  })
  if (row === null) throw new AdjustmentError('ADJUSTMENT_TARGET_NOT_FOUND', { detail: `billing_batch=${targetId}` })

  // งวดของรอบวางบิลคือ `period` ("มิถุนายน 2569") ไม่ใช่วันครบกำหนด (อาจข้ามเดือน)
  const key = parseBillingPeriodLabel(row.period)
  const targetDate =
    key === null ? row.dueDate : new Date(Date.UTC(key.yearBe - 543, key.month - 1, 1))

  return {
    targetRef: row.period,
    targetLabel: `${row.company.name} · รอบวางบิล ${row.period}`,
    currentSatang: row.totalSatang,
    targetDate,
    moduleDirectEditBlocked: false,
  }
}

async function payoutBatchTarget(user: SessionUser, targetId: string): Promise<RawTarget> {
  const row = await prisma.payoutBatch.findFirst({
    where: { id: targetId, organizationId: user.organizationId, deletedAt: null },
    select: { name: true, netSatang: true, side: true, createdAt: true },
  })
  if (row === null) throw new AdjustmentError('ADJUSTMENT_TARGET_NOT_FOUND', { detail: `payout_batch=${targetId}` })

  return {
    targetRef: row.name,
    // `02` §8 ไม่มีคอลัมน์วันตัดรอบ ⇒ งวดของรอบจ่ายยึดวันที่สร้างรอบ (ดู PROGRESS_ARCHIVE 3.4)
    targetLabel: `รอบจ่าย ${row.side} · สร้าง ${toDateOnlyIso(row.createdAt)}`,
    currentSatang: row.netSatang,
    targetDate: row.createdAt,
    moduleDirectEditBlocked: false,
  }
}

async function loadTarget(
  user: SessionUser,
  targetType: AdjustmentTargetType,
  targetId: string,
): Promise<RawTarget> {
  switch (targetType) {
    case 'revenue':
      return revenueTarget(user, targetId)
    case 'expense':
      return expenseTarget(user, targetId)
    case 'billing_batch':
      return billingBatchTarget(user, targetId)
    case 'payout_batch':
      return payoutBatchTarget(user, targetId)
  }
}

async function describeTarget(
  user: SessionUser,
  targetType: AdjustmentTargetType,
  targetId: string,
): Promise<AdjustmentTargetDto> {
  const raw = await loadTarget(user, targetType, targetId)
  const periodStatus = await periodStatusAt(user.organizationId, periodKeyOf(raw.targetDate))
  const policy = adjustmentApprovalPolicyFor(periodStatus)

  return {
    targetType,
    targetId,
    targetRef: raw.targetRef,
    targetLabel: raw.targetLabel,
    currentSatang: raw.currentSatang,
    targetDate: toDateOnlyIso(raw.targetDate),
    periodStatusAtTarget: periodStatus,
    approvalPolicyLabel: policy.label,
    requiredApproverRoles: policy.requiredRoles,
    directEditBlocked:
      raw.moduleDirectEditBlocked || (periodStatus !== null && isDirectEditBlocked(periodStatus)),
  }
}

// ── GET /api/adjustments/targets (`20` §8 — ค้นหาเป้าหมายจากเลขที่อ้างอิง) ───

const TARGET_SEARCH_LIMIT = 20

/**
 * ตัวเลือกรายการต้นทางของฟอร์มสร้าง Adjustment — คืน **สถานะรอบ + ระดับอนุมัติที่ต้องใช้**
 * มาด้วยเสมอ เพราะ `20` §8 บังคับให้ฟอร์มแสดงก่อนกดสร้าง (ฝั่งหน้าจอคำนวณเองไม่ได้)
 */
export async function listAdjustmentTargets(
  user: SessionUser,
  query: AdjustmentTargetQuery,
): Promise<AdjustmentTargetDto[]> {
  const q = query.q.trim()
  const ids = await searchTargetIds(user, query.targetType, q)
  const targets: AdjustmentTargetDto[] = []
  for (const id of ids) targets.push(await describeTarget(user, query.targetType, id))
  return targets
}

async function searchTargetIds(user: SessionUser, targetType: AdjustmentTargetType, q: string): Promise<string[]> {
  const organizationId = user.organizationId
  const take = TARGET_SEARCH_LIMIT

  if (targetType === 'revenue') {
    const rows = await prisma.revenue.findMany({
      where: {
        organizationId,
        deletedAt: null,
        ...(q === '' ? {} : { case: { caseRef: { contains: q, mode: 'insensitive' } } }),
      },
      select: { id: true },
      orderBy: [{ revenueDate: 'desc' }],
      take,
    })
    return rows.map((row) => row.id)
  }

  if (targetType === 'expense') {
    const rows = await prisma.expense.findMany({
      where: {
        organizationId,
        deletedAt: null,
        ...(q === '' ? {} : { case: { caseRef: { contains: q, mode: 'insensitive' } } }),
      },
      select: { id: true },
      orderBy: [{ expenseDate: 'desc' }],
      take,
    })
    return rows.map((row) => row.id)
  }

  if (targetType === 'billing_batch') {
    const rows = await prisma.billingBatch.findMany({
      where: { organizationId, deletedAt: null, ...(q === '' ? {} : { period: { contains: q } }) },
      select: { id: true },
      orderBy: [{ createdAt: 'desc' }],
      take,
    })
    return rows.map((row) => row.id)
  }

  const rows = await prisma.payoutBatch.findMany({
    where: { organizationId, deletedAt: null, ...(q === '' ? {} : { name: { contains: q } }) },
    select: { id: true },
    orderBy: [{ createdAt: 'desc' }],
    take,
  })
  return rows.map((row) => row.id)
}

// ── select / mapper ─────────────────────────────────────────────────────────

const adjustmentSelect = {
  id: true,
  adjustmentType: true,
  amountSatang: true,
  reason: true,
  status: true,
  periodStatusAtTarget: true,
  revenueId: true,
  expenseId: true,
  billingBatchId: true,
  payoutBatchId: true,
  rejectionReason: true,
  approvedAt: true,
  createdAt: true,
  revenue: { select: { case: { select: { caseRef: true } }, company: { select: { name: true } } } },
  expense: {
    select: {
      expenseType: true,
      case: { select: { caseRef: true } },
      payee: { select: { user: { select: { fullName: true } } } },
    },
  },
  billingBatch: { select: { period: true, company: { select: { name: true } } } },
  payoutBatch: { select: { name: true, side: true } },
  approvedByUser: { select: { fullName: true } },
  createdByUser: { select: { fullName: true } },
} as const

type AdjustmentRow = Prisma.AdjustmentGetPayload<{ select: typeof adjustmentSelect }>

function targetTextOf(row: AdjustmentRow, targetType: AdjustmentTargetType): { ref: string; label: string } {
  if (targetType === 'revenue' && row.revenue !== null) {
    return { ref: row.revenue.case.caseRef, label: `${row.revenue.company.name} · รายได้` }
  }
  if (targetType === 'expense' && row.expense !== null) {
    return {
      ref: row.expense.case?.caseRef ?? (row.expenseId ?? '').slice(0, 8),
      label: `${row.expense.payee.user.fullName} · ${row.expense.expenseType}`,
    }
  }
  if (targetType === 'billing_batch' && row.billingBatch !== null) {
    return { ref: row.billingBatch.period, label: `${row.billingBatch.company.name} · รอบวางบิล` }
  }
  if (targetType === 'payout_batch' && row.payoutBatch !== null) {
    return { ref: row.payoutBatch.name, label: `รอบจ่าย ${row.payoutBatch.side}` }
  }
  return { ref: '—', label: '—' }
}

function toDto(row: AdjustmentRow, approvedRoles: readonly string[]): AdjustmentDto {
  const { targetType, targetId } = adjustmentTargetOf(row)
  const periodStatus = parsePeriodStatusSnapshot(row.periodStatusAtTarget)
  const policy = adjustmentApprovalPolicyFor(periodStatus)
  const text = targetTextOf(row, targetType)

  return {
    id: row.id,
    targetType,
    targetId,
    targetRef: text.ref,
    targetLabel: text.label,
    adjustmentType: row.adjustmentType,
    amountSatang: row.amountSatang,
    signedSatang: signedAdjustmentSatang(row.adjustmentType, row.amountSatang),
    reason: row.reason,
    status: row.status,
    periodStatusAtTarget: periodStatus,
    approvalPolicyLabel: policy.label,
    requiredApproverRoles: policy.requiredRoles,
    approvedRoles,
    missingApproverRoles: row.status === 'pending_approval' ? missingApproverRoles(periodStatus, approvedRoles) : [],
    rejectionReason: row.rejectionReason,
    approvedByName: row.approvedByUser?.fullName ?? null,
    approvedAt: row.approvedAt === null ? null : toIso(row.approvedAt),
    createdAt: toIso(row.createdAt),
    createdByName: row.createdByUser.fullName,
  }
}

// ── ทะเบียนผู้อนุมัติ (อ่านจาก audit log — immutable + append-only) ──────────

type AuditReader = Pick<typeof prisma, 'auditLog'>

async function approverRolesByAdjustment(
  client: AuditReader,
  organizationId: string,
  adjustmentIds: readonly string[],
): Promise<Map<string, string[]>> {
  const result = new Map<string, string[]>()
  if (adjustmentIds.length === 0) return result

  const rows = await client.auditLog.findMany({
    where: { organizationId, targetType: TARGET, targetId: { in: [...adjustmentIds] }, action: 'approve' },
    select: { targetId: true, actorRole: true },
    orderBy: { createdAt: 'asc' },
  })

  for (const row of rows) {
    if (row.targetId === null || row.actorRole === null) continue
    const roles = result.get(row.targetId) ?? []
    if (!roles.includes(row.actorRole)) roles.push(row.actorRole)
    result.set(row.targetId, roles)
  }
  return result
}

// ── GET /api/adjustments ────────────────────────────────────────────────────

export async function listAdjustments(user: SessionUser, query: AdjustmentListQuery): Promise<AdjustmentDto[]> {
  const rows = await prisma.adjustment.findMany({
    where: {
      organizationId: user.organizationId,
      ...(query.status === 'all' ? {} : { status: query.status as AdjustmentStatus }),
      ...(query.targetType === undefined ? {} : targetTypeFilter(query.targetType)),
    },
    select: adjustmentSelect,
    orderBy: [{ createdAt: 'desc' }],
    take: 200,
  })

  const approvals = await approverRolesByAdjustment(
    prisma,
    user.organizationId,
    rows.map((row) => row.id),
  )
  return rows.map((row) => toDto(row, approvals.get(row.id) ?? []))
}

function targetTypeFilter(targetType: AdjustmentTargetType) {
  switch (targetType) {
    case 'revenue':
      return { revenueId: { not: null } }
    case 'expense':
      return { expenseId: { not: null } }
    case 'billing_batch':
      return { billingBatchId: { not: null } }
    case 'payout_batch':
      return { payoutBatchId: { not: null } }
  }
}

async function findAdjustment(user: SessionUser, adjustmentId: string): Promise<AdjustmentRow> {
  const row = await prisma.adjustment.findFirst({
    where: { id: adjustmentId, organizationId: user.organizationId },
    select: adjustmentSelect,
  })
  if (row === null) throw new AdjustmentError('ADJUSTMENT_NOT_FOUND', { detail: `adjustment=${adjustmentId}` })
  return row
}

async function getAdjustment(user: SessionUser, adjustmentId: string): Promise<AdjustmentDto> {
  const row = await findAdjustment(user, adjustmentId)
  const approvals = await approverRolesByAdjustment(prisma, user.organizationId, [row.id])
  return toDto(row, approvals.get(row.id) ?? [])
}

// ── POST /api/adjustments (`20` §9) ─────────────────────────────────────────

export async function createAdjustment(
  context: AdjustmentMutationContext,
  input: AdjustmentCreateInput,
): Promise<AdjustmentDto> {
  const user = context.actor
  const reason = assertAdjustmentReason(input.reason)
  const target = await describeTarget(user, input.targetType, input.targetId)

  const created = await prisma.$transaction(async (tx) => {
    const row = await tx.adjustment.create({
      data: {
        organizationId: user.organizationId,
        adjustmentType: input.adjustmentType,
        amountSatang: input.amountSatang,
        reason,
        status: 'pending_approval',
        // snapshot ณ ตอนสร้าง (`20` §7.1 · `92` §7.1) — ห้ามอ่านสถานะรอบสดตอนอนุมัติ
        periodStatusAtTarget: target.periodStatusAtTarget,
        ...adjustmentTargetColumns(input.targetType, input.targetId),
        createdBy: user.id,
      },
      select: { id: true },
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
          target_type: input.targetType,
          target_id: input.targetId,
          target_ref: target.targetRef,
          adjustment_type: input.adjustmentType,
          amount_satang: input.amountSatang,
          signed_satang: signedAdjustmentSatang(input.adjustmentType, input.amountSatang),
          target_current_satang: target.currentSatang,
          period_status_at_target: target.periodStatusAtTarget,
          required_approver_roles: [...target.requiredApproverRoles],
          status: 'pending_approval',
        },
        reason,
        ipAddress: context.meta.ipAddress,
        userAgent: context.meta.userAgent,
        diffOnly: false,
      },
      tx,
    )

    return row.id
  })

  return getAdjustment(user, created)
}

// ── PATCH /api/adjustments/:id/approve (`20` §14) ───────────────────────────

/**
 * อนุมัติ 1 ครั้ง = 1 บทบาท — รอบ `sent_to_accountant` ต้องครบ **การเงิน + บริหาร**
 * จึงเปลี่ยนสถานะเป็น `approved` (`20` §6.2) · ครบไม่ครบตัดสินด้วย
 * `assertApprovalLevelSufficient()` (3.1) ไม่ใช่ if ที่นี่
 */
export async function approveAdjustment(
  context: AdjustmentMutationContext,
  adjustmentId: string,
  input: AdjustmentApproveInput,
  now: Date = new Date(),
): Promise<AdjustmentDto> {
  const user = context.actor
  const row = await findAdjustment(user, adjustmentId)
  assertAdjustmentActionable(row.status, 'approved')

  const periodStatus = parsePeriodStatusSnapshot(row.periodStatusAtTarget)
  // capability ของ "ระดับนั้นโดยเฉพาะ" — รอบ locked ใช้ `approve_adjustment_locked` เท่านั้น
  assertActorCanApproveAdjustment(user, periodStatus)

  const note = input.note.trim() === '' ? null : input.note.trim()

  await prisma.$transaction(async (tx) => {
    const previous = (await approverRolesByAdjustment(tx, user.organizationId, [adjustmentId])).get(adjustmentId) ?? []
    const stampedRoles = approverRolesOf(user, periodStatus)
    const roles = [...previous, ...stampedRoles.filter((role) => !previous.includes(role))]

    // บทบาทนี้อนุมัติไปแล้ว และยังขาดบทบาทอื่นอยู่ ⇒ ไม่ใช่คิวของคนนี้ (`20` §6.2)
    if (roles.length === previous.length) {
      const missing = missingApproverRoles(periodStatus, previous)
      throw new AdjustmentError('ADJUSTMENT_INVALID_STATUS', {
        detail: `บทบาท "${user.roleName}" อนุมัติรายการนี้ไปแล้ว — ยังรอ: ${missing.join(', ')}`,
        context: { missingRoles: missing },
      })
    }

    const missing = missingApproverRoles(periodStatus, roles)
    const complete = missing.length === 0
    // ครบระดับแล้วเท่านั้นจึงเปลี่ยนสถานะ — ยามซ้ำของ 3.1 กันกรณีตารางนโยบายเปลี่ยนภายหลัง
    if (complete) assertApprovalLevelSufficient({ periodStatus, approverRoles: roles })

    if (complete) {
      const claimed = await tx.adjustment.updateMany({
        where: { id: adjustmentId, status: 'pending_approval' },
        data: { status: 'approved', approvedBy: user.id, approvedAt: now, updatedBy: user.id },
      })
      if (claimed.count === 0) {
        throw new AdjustmentError('ADJUSTMENT_INVALID_STATUS', { detail: 'รายการนี้ถูกดำเนินการไปแล้วโดยผู้ใช้อื่น' })
      }
    } else {
      await tx.adjustment.updateMany({
        where: { id: adjustmentId, status: 'pending_approval' },
        data: { updatedBy: user.id },
      })
    }

    await emitAudit(
      {
        organizationId: user.organizationId,
        actorId: user.id,
        actorRole: user.roleName,
        action: 'approve',
        targetType: TARGET,
        targetId: adjustmentId,
        before: { status: row.status, approved_roles: previous },
        after: {
          status: complete ? 'approved' : 'pending_approval',
          period_status_at_target: periodStatus,
          approved_roles: roles,
          missing_approver_roles: missing,
          amount_satang: row.amountSatang,
          signed_satang: signedAdjustmentSatang(row.adjustmentType, row.amountSatang),
        },
        reason: note ?? row.reason,
        ipAddress: context.meta.ipAddress,
        userAgent: context.meta.userAgent,
        diffOnly: false,
      },
      tx,
    )

    // `20` §6.2 แถว `locked` — "Executive + บันทึก audit log แยกชัดเจน"
    if (complete && requiresSeparateAuditEntry(periodStatus)) {
      await emitAudit(
        {
          organizationId: user.organizationId,
          actorId: user.id,
          actorRole: user.roleName,
          action: 'unlock',
          targetType: TARGET,
          targetId: adjustmentId,
          after: {
            locked_period_adjustment: true,
            period_status_at_target: periodStatus,
            approver_roles: roles,
            amount_satang: row.amountSatang,
          },
          reason: `อนุมัติรายการปรับปรุงของรอบบัญชีที่ปิดแล้ว — ${note ?? row.reason}`,
          ipAddress: context.meta.ipAddress,
          userAgent: context.meta.userAgent,
          diffOnly: false,
        },
        tx,
      )
    }
  })

  return getAdjustment(user, adjustmentId)
}

// ── PATCH /api/adjustments/:id/reject (`20` §14 v2.1) ───────────────────────

export async function rejectAdjustment(
  context: AdjustmentMutationContext,
  adjustmentId: string,
  input: AdjustmentRejectInput,
): Promise<AdjustmentDto> {
  const user = context.actor
  const rejectionReason = assertRejectionReason(input.rejectionReason)
  const row = await findAdjustment(user, adjustmentId)
  assertAdjustmentActionable(row.status, 'rejected')

  const periodStatus = parsePeriodStatusSnapshot(row.periodStatusAtTarget)
  // ระดับสิทธิ์เดียวกับ approve (`20` §14) — คนที่อนุมัติไม่ได้ก็ปฏิเสธแทนไม่ได้
  assertActorCanApproveAdjustment(user, periodStatus)

  await prisma.$transaction(async (tx) => {
    const claimed = await tx.adjustment.updateMany({
      where: { id: adjustmentId, status: 'pending_approval' },
      data: { status: 'rejected', rejectionReason, updatedBy: user.id },
    })
    if (claimed.count === 0) {
      throw new AdjustmentError('ADJUSTMENT_INVALID_STATUS', { detail: 'รายการนี้ถูกดำเนินการไปแล้วโดยผู้ใช้อื่น' })
    }

    await emitAudit(
      {
        organizationId: user.organizationId,
        actorId: user.id,
        actorRole: user.roleName,
        action: 'reject',
        targetType: TARGET,
        targetId: adjustmentId,
        before: { status: row.status },
        after: {
          status: 'rejected',
          period_status_at_target: periodStatus,
          rejection_reason: rejectionReason,
          amount_satang: row.amountSatang,
        },
        reason: rejectionReason,
        ipAddress: context.meta.ipAddress,
        userAgent: context.meta.userAgent,
        diffOnly: false,
      },
      tx,
    )
  })

  return getAdjustment(user, adjustmentId)
}
