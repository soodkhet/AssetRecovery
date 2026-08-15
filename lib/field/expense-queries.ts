import { emitAudit } from '@/lib/audit/audit'
import type { RequestMeta } from '@/lib/auth/request-meta'
import type { SessionUser } from '@/lib/auth/types'
import { buildRejectExpenseUpdate, parseApprovalHistory } from '@/lib/compensation/approval'
import { assertCanRejectExpense } from '@/lib/compensation/approval-queries'
import { resolvePlanVersionAt } from '@/lib/compensation/plan'
import { kmHundredthsToDecimalString } from '@/lib/field/distance'
import {
  distinctFieldDays,
  planCaseExpenses,
  type CaseExpensePlan,
  type CompensationSnapshotValues,
} from '@/lib/field/expense-calc'
import {
  ACTIVE_EXPENSE_STATUSES,
  assertRejectReason,
  ExpenseStateError,
  nextExpenseStatus,
} from '@/lib/field/expense-status'
import { assertHotelClaimFields, assertSharedAgentInTeam } from '@/lib/field/hotel-claim'
import type {
  FieldExpenseListQuery,
  HotelClaimInput,
  IncomeSummaryQuery,
  RejectExpenseInput,
  ResubmitExpenseInput,
} from '@/lib/field/schemas'
import type {
  FieldExpenseDto,
  FieldExpenseListDto,
  FieldIncomeSummaryDto,
} from '@/lib/field/types'
import { toBangkokParts } from '@/lib/format/datetime'
import { Prisma } from '@/lib/generated/prisma/client'
import type { CaseOutcome } from '@/lib/generated/prisma/enums'
import { prisma } from '@/lib/prisma'

/**
 * รายการเบิกของงานภาคสนาม (`41` §6.6 · §7.9 · §7.10 · §10.1) — ชั้น DB
 * สูตรเงินทั้งหมดอยู่ที่ `expense-calc.ts` (pure ตาม `22`) · state machine ที่ `expense-status.ts`
 *
 * กติกาที่บังคับที่นี่:
 * - ทุก mutation อยู่ใน `$transaction` เดียวกับ `emitAudit()` (Rule 03)
 * - รายการ "ผูกกับเคส" ระบบสร้างเองเท่านั้น — ไม่มี endpoint ให้พนักงานสร้าง/แก้ยอดเอง (`41` §11)
 * - เจ้าของรายการเท่านั้นที่ resubmit ได้ (`41` §10.1) · ผู้อนุมัติจ่ายเท่านั้นที่ reject ได้
 */

export interface ExpenseMutationContext {
  actor: SessionUser
  meta: RequestMeta
}

/** ชนิด tx ของ client ที่ต่อ extension แล้ว */
export type ExpenseTxClient = Omit<typeof prisma, '$connect' | '$disconnect' | '$on' | '$transaction' | '$extends'>

/** วันที่เชิงธุรกิจ (เวลาไทย) ของ instant หนึ่ง → เที่ยงคืน UTC สำหรับคอลัมน์ `DATE` (Rule 01 · E7) */
export function bangkokBusinessDate(at: Date): Date {
  const parts = toBangkokParts(at)
  if (parts === null) throw new RangeError('เวลาที่ส่งมาไม่ถูกต้อง')
  return new Date(Date.UTC(parts.year, parts.month - 1, parts.day))
}

/**
 * payee ของพนักงาน — 1 คน 1 โปรไฟล์ (UNIQUE `organization_id, user_id`)
 * ยังไม่มีก็สร้างโครงเปล่าให้ (ข้อมูลธนาคาร/ภาษีเป็นงานของ Phase 3.2 — `18`)
 * รายการเบิกต้องผูก payee เสมอตาม `02` Group E จึงรอไม่ได้
 */
export async function ensureAgentPayeeId(tx: ExpenseTxClient, params: {
  organizationId: string
  userId: string
  actorId: string
}): Promise<string> {
  const existing = await tx.payeeProfile.findFirst({
    where: { organizationId: params.organizationId, userId: params.userId },
    select: { id: true },
  })
  if (existing !== null) return existing.id

  const created = await tx.payeeProfile.create({
    data: {
      organizationId: params.organizationId,
      userId: params.userId,
      payeeType: 'individual',
      createdBy: params.actorId,
    },
    select: { id: true },
  })
  return created.id
}

export interface PlanSnapshot extends CompensationSnapshotValues {
  planId: string
  version: number
  commissionSatang: number
  noSuccessFeeSatang: number
}

/**
 * แผนค่าตอบแทนที่มีผล ณ วันปิดงาน (`92` §7.1) — **ห้ามอ่านเวอร์ชันปัจจุบันมาคำนวณย้อนหลัง**
 * แผนชุดเดียวกัน = แถวที่ `name` เดียวกันหลายเวอร์ชัน (`11` §14) จึง resolve จากทั้งตระกูล
 */
export async function resolvePlanSnapshot(
  client: ExpenseTxClient,
  params: { organizationId: string; planId: string; onDate: Date },
): Promise<PlanSnapshot | null> {
  const current = await client.compensationPlan.findFirst({
    where: { id: params.planId, organizationId: params.organizationId },
    select: { id: true, name: true },
  })
  if (current === null) return null

  const versions = await client.compensationPlan.findMany({
    where: { organizationId: params.organizationId, name: current.name, deletedAt: null },
    select: {
      id: true,
      name: true,
      side: true,
      version: true,
      effectiveFrom: true,
      effectiveTo: true,
      isCurrent: true,
      fuelMode: true,
      fuelRatePerKmSatang: true,
      fuelMaxPerCaseSatang: true,
      fuelDailyFlatSatang: true,
      allowanceSatang: true,
      commissionSatang: true,
      noSuccessFeeSatang: true,
      hotelMaxPerNightSatang: true,
      hotelReceiptRequired: true,
      whtPct: true,
    },
  })

  const onDate = params.onDate.toISOString().slice(0, 10)
  const resolved = resolvePlanVersionAt(
    versions.map((row) => ({
      ...row,
      whtPct: row.whtPct.toNumber(),
      effectiveFrom: row.effectiveFrom.toISOString().slice(0, 10),
      effectiveTo: row.effectiveTo === null ? null : row.effectiveTo.toISOString().slice(0, 10),
    })),
    onDate,
  )
  // ไม่มีเวอร์ชันที่ครอบวันนั้น (แผนเพิ่งเริ่มมีผลวันหลัง) → ใช้แถวที่ทีมผูกอยู่ตามเดิม
  const picked = resolved ?? versions.find((row) => row.id === params.planId) ?? null
  if (picked === null) return null

  return {
    planId: picked.id,
    version: picked.version,
    fuelMode: picked.fuelMode,
    fuelRatePerKmSatang: picked.fuelRatePerKmSatang,
    fuelMaxPerCaseSatang: picked.fuelMaxPerCaseSatang,
    fuelDailyFlatSatang: picked.fuelDailyFlatSatang,
    allowanceSatang: picked.allowanceSatang,
    commissionSatang: picked.commissionSatang,
    noSuccessFeeSatang: picked.noSuccessFeeSatang,
  }
}

export interface GenerateCaseExpensesParams {
  organizationId: string
  caseId: string
  assignmentId: string
  agentId: string
  outcome: CaseOutcome
  plan: PlanSnapshot | null
  /** ระยะทางที่คำนวณได้ก่อนเข้า transaction — `null` = คำนวณไม่ได้ (D10) */
  distanceKmHundredths: number | null
  checkedInAts: readonly Date[]
  closedAt: Date
  actor: SessionUser
  meta: RequestMeta
}

export interface GenerateCaseExpensesResult extends CaseExpensePlan {
  expenseIds: string[]
}

/**
 * สร้างรายการเบิก fuel/allowance อัตโนมัติตอนปิดงาน (`41` §6.6 · §8)
 * **จุดเดียวของระบบ** ที่สร้างรายการกลุ่ม "ผูกกับเคส" — ใช้ทั้ง `submit_close_case`
 * และ `resubmit_close_case` (§10.1 บอกให้สร้าง "ตามกฎปกติ" ⇒ ต้องเป็นทางเดียวกันเป๊ะ)
 *
 * ต้องเรียก **ภายใน** `$transaction` ของการปิดงาน — รายการเบิกกับสถานะเคสต้องเกิด/ล้มพร้อมกัน
 */
export async function generateCaseExpenses(
  tx: ExpenseTxClient,
  params: GenerateCaseExpensesParams,
): Promise<GenerateCaseExpensesResult> {
  if (params.plan === null) {
    // ทีมไม่มีแผนค่าตอบแทนผูกไว้ = ไม่มีฐานคำนวณ ⇒ ไม่มีรายการเบิก (เคสไม่มี expense — DEC-006/D6)
    return { drafts: [], fuelDistancePending: false, expenseIds: [] }
  }

  const plan = params.plan
  const planned = planCaseExpenses({
    outcome: params.outcome,
    plan,
    distanceKmHundredths: params.distanceKmHundredths,
    fieldDays: distinctFieldDays(params.checkedInAts),
  })

  const expenseDate = bangkokBusinessDate(params.closedAt)
  const payeeId = await ensureAgentPayeeId(tx, {
    organizationId: params.organizationId,
    userId: params.agentId,
    actorId: params.actor.id,
  })

  const expenseIds: string[] = []
  for (const draft of planned.drafts) {
    const created = await tx.expense.create({
      data: {
        organizationId: params.organizationId,
        caseId: params.caseId,
        assignmentId: params.assignmentId,
        payeeId,
        expenseType: draft.expenseType,
        grossSatang: draft.grossSatang,
        expenseDate,
        distanceKm:
          draft.distanceKmHundredths === null
            ? null
            : new Prisma.Decimal(kmHundredthsToDecimalString(draft.distanceKmHundredths)),
        calculationSource: 'compensation_plan',
        compPlanId: plan.planId,
        compPlanVersion: plan.version,
        status: draft.status,
        createdBy: params.actor.id,
      },
      select: { id: true },
    })
    expenseIds.push(created.id)

    await emitAudit(
      {
        organizationId: params.organizationId,
        actorId: params.actor.id,
        actorRole: params.actor.roleName,
        action: 'create',
        targetType: 'expenses',
        targetId: created.id,
        after: {
          caseId: params.caseId,
          assignmentId: params.assignmentId,
          expenseType: draft.expenseType,
          grossSatang: draft.grossSatang,
          distanceKm: draft.distanceKmHundredths === null ? null : kmHundredthsToDecimalString(draft.distanceKmHundredths),
          status: draft.status,
          compPlanId: plan.planId,
          compPlanVersion: plan.version,
          events: ['expense.case_bound_created'],
        },
        ipAddress: params.meta.ipAddress,
        userAgent: params.meta.userAgent,
        diffOnly: false,
      },
      tx,
    )
  }

  if (planned.fuelDistancePending) {
    await enqueueFuelDistanceJob(tx, {
      organizationId: params.organizationId,
      caseId: params.caseId,
      assignmentId: params.assignmentId,
    })
  }

  return { ...planned, expenseIds }
}

export const FUEL_DISTANCE_JOB_TYPE = 'fuel_distance_retry'

/**
 * ตั้งงานคำนวณระยะทางย้อนหลัง (มติ PO 14/08/2569 — D10)
 * idempotent: มีงานของ assignment เดิมค้างอยู่แล้วไม่สร้างซ้ำ
 */
export async function enqueueFuelDistanceJob(
  tx: ExpenseTxClient,
  params: { organizationId: string; caseId: string; assignmentId: string },
): Promise<void> {
  const existing = await tx.job.findFirst({
    where: {
      jobType: FUEL_DISTANCE_JOB_TYPE,
      status: { in: ['pending', 'running'] },
      payload: { path: ['assignmentId'], equals: params.assignmentId },
    },
    select: { id: true },
  })
  if (existing !== null) return

  await tx.job.create({
    data: {
      organizationId: params.organizationId,
      jobType: FUEL_DISTANCE_JOB_TYPE,
      status: 'pending',
      payload: { caseId: params.caseId, assignmentId: params.assignmentId },
    },
  })
}

/**
 * `41` §10.1 — รายการเบิกของรอบเดิม mark `superseded` ก่อนสร้างชุดใหม่
 * คืนจำนวนรายการที่ถูกแทนที่ (0 = รอบนั้นไม่เคยมีรายการเบิก เช่น ยอด 0 ตาม D10)
 */
export async function supersedeCaseExpenses(
  tx: ExpenseTxClient,
  params: { organizationId: string; assignmentId: string; actor: SessionUser; meta: RequestMeta; reason: string },
): Promise<string[]> {
  const rows = await tx.expense.findMany({
    where: {
      organizationId: params.organizationId,
      assignmentId: params.assignmentId,
      status: { in: [...ACTIVE_EXPENSE_STATUSES] },
      deletedAt: null,
    },
    select: { id: true, status: true, expenseType: true, grossSatang: true },
  })

  for (const row of rows) {
    const nextStatus = nextExpenseStatus(row.status, 'supersede')
    await tx.expense.update({
      where: { id: row.id },
      data: { status: nextStatus, updatedBy: params.actor.id },
    })

    await emitAudit(
      {
        organizationId: params.organizationId,
        actorId: params.actor.id,
        actorRole: params.actor.roleName,
        action: 'status_change',
        targetType: 'expenses',
        targetId: row.id,
        before: { status: row.status },
        after: { status: nextStatus, expenseType: row.expenseType, grossSatang: row.grossSatang, events: [] },
        reason: params.reason,
        ipAddress: params.meta.ipAddress,
        userAgent: params.meta.userAgent,
        diffOnly: false,
      },
      tx,
    )
  }

  return rows.map((row) => row.id)
}

/** ผูกรายการเก่า → รายการใหม่ที่มาแทน (`41` §10.1 — ไล่ประวัติย้อนหลังได้) */
export async function linkSupersededExpenses(
  tx: ExpenseTxClient,
  params: { supersededIds: readonly string[]; replacementIds: readonly string[]; actorId: string },
): Promise<void> {
  const replacement = params.replacementIds[0]
  if (replacement === undefined || params.supersededIds.length === 0) return
  await tx.expense.updateMany({
    where: { id: { in: [...params.supersededIds] } },
    data: { supersededByExpenseId: replacement, updatedBy: params.actorId },
  })
}

// ── GET /api/field/expenses (`41` §7.9) ─────────────────────────────────────

const expenseSelect = {
  id: true,
  caseId: true,
  assignmentId: true,
  expenseType: true,
  grossSatang: true,
  distanceKm: true,
  expenseDate: true,
  status: true,
  rejectionReason: true,
  revisionNote: true,
  receiptFileUrl: true,
  sharedWithUserId: true,
  createdAt: true,
  case: { select: { caseRef: true, debtorName: true } },
  sharedWithUser: { select: { fullName: true } },
} as const

type ExpenseRow = Prisma.ExpenseGetPayload<{ select: typeof expenseSelect }>

function toExpenseDto(row: ExpenseRow, matchedCaseIds: string[] = []): FieldExpenseDto {
  return {
    id: row.id,
    caseId: row.caseId,
    caseRef: row.case?.caseRef ?? null,
    debtorName: row.case?.debtorName ?? null,
    expenseType: row.expenseType,
    grossSatang: row.grossSatang,
    distanceKm: row.distanceKm === null ? null : row.distanceKm.toString(),
    expenseDate: row.expenseDate.toISOString().slice(0, 10),
    status: row.status,
    rejectReason: row.rejectionReason,
    note: row.revisionNote,
    receiptFileUrl: row.receiptFileUrl,
    sharedWithUserId: row.sharedWithUserId,
    sharedWithName: row.sharedWithUser?.fullName ?? null,
    matchedCaseIds,
    createdAt: row.createdAt.toISOString(),
  }
}

/** payee ของผู้เรียก — ยังไม่มีโปรไฟล์ = ยังไม่เคยมีรายการเบิกเลย */
async function findOwnPayeeId(user: SessionUser): Promise<string | null> {
  const payee = await prisma.payeeProfile.findFirst({
    where: { organizationId: user.organizationId, userId: user.id },
    select: { id: true },
  })
  return payee?.id ?? null
}

export async function listFieldExpenses(
  user: SessionUser,
  query: FieldExpenseListQuery,
): Promise<FieldExpenseListDto> {
  const payeeId = await findOwnPayeeId(user)
  if (payeeId === null) {
    return { type: query.type, items: [], pendingSatang: 0, approvedSatang: 0 }
  }

  const rows = await prisma.expense.findMany({
    where: {
      organizationId: user.organizationId,
      payeeId,
      deletedAt: null,
      // แท็บ "ผูกกับเคส" = รายการที่ระบบสร้างตอนปิดงาน · "เบิกแยก" = ที่พนักงานกรอกเอง (`41` §7.9)
      ...(query.type === 'caseBound' ? { assignmentId: { not: null } } : { assignmentId: null }),
    },
    orderBy: [{ expenseDate: 'desc' }, { createdAt: 'desc' }],
    take: 200,
    select: expenseSelect,
  })

  // auto-mapping ของรายการเบิกแยก (`41` §6.6) — เคสที่ลงพื้นที่วันเดียวกับวันที่เบิก ใช้ "ตรวจสอบ" เท่านั้น
  const matchedByDate = new Map<string, string[]>()
  if (query.type === 'separate' && rows.length > 0) {
    const dates = [...new Set(rows.map((row) => row.expenseDate.toISOString().slice(0, 10)))]
    const assignments = await prisma.caseAssignment.findMany({
      where: {
        organizationId: user.organizationId,
        agentId: user.id,
        scheduledDate: { in: dates.map((date) => new Date(`${date}T00:00:00.000Z`)) },
      },
      select: { caseId: true, scheduledDate: true },
    })
    for (const row of assignments) {
      if (row.scheduledDate === null) continue
      const key = row.scheduledDate.toISOString().slice(0, 10)
      matchedByDate.set(key, [...(matchedByDate.get(key) ?? []), row.caseId])
    }
  }

  const items = rows.map((row) =>
    toExpenseDto(row, matchedByDate.get(row.expenseDate.toISOString().slice(0, 10)) ?? []),
  )

  // สรุปยอดบนหัวหน้าจอ (`41` §7.9) — superseded/rejected ไม่นับทั้งสองช่อง
  const pendingSatang = items
    .filter((item) => ['pending_warehouse_confirm', 'pending_approval', 'pending_finance_approval', 'needs_revision'].includes(item.status))
    .reduce((sum, item) => sum + item.grossSatang, 0)
  const approvedSatang = items
    .filter((item) => item.status === 'approved')
    .reduce((sum, item) => sum + item.grossSatang, 0)

  return { type: query.type, items, pendingSatang, approvedSatang }
}

// ── POST /api/field/expenses/hotel (`41` §6.6 · §7.9) ───────────────────────

export async function submitHotelClaim(
  user: SessionUser,
  input: HotelClaimInput,
  context: ExpenseMutationContext,
): Promise<FieldExpenseDto> {
  assertHotelClaimFields({
    expenseDate: input.expenseDate,
    amountSatang: input.amountSatang,
    receiptFileUrl: input.receiptFileUrl,
  })

  // ผู้พักร่วมต้องเป็นคนในทีมเดียวกัน — เช็คจากทีมของผู้เบิกเอง (`41` §12)
  const teammates = await prisma.user.findMany({
    where: {
      organizationId: user.organizationId,
      teamId: { not: null },
      team: { members: { some: { id: user.id } } },
      id: { not: user.id },
      deletedAt: null,
    },
    select: { id: true },
  })
  assertSharedAgentInTeam(input.sharedWithUserId ?? null, teammates.map((row) => row.id))

  const created = await prisma.$transaction(async (tx) => {
    const payeeId = await ensureAgentPayeeId(tx as ExpenseTxClient, {
      organizationId: user.organizationId,
      userId: user.id,
      actorId: context.actor.id,
    })

    const row = await tx.expense.create({
      data: {
        organizationId: user.organizationId,
        payeeId,
        expenseType: 'hotel',
        grossSatang: input.amountSatang,
        expenseDate: input.expenseDate,
        calculationSource: 'receipt',
        // เบิกแยกไม่ผ่านขั้นคลัง — เข้าคิวอนุมัติทันที (`41` §6.6)
        status: 'pending_approval',
        sharedWithUserId: input.sharedWithUserId ?? null,
        receiptFileUrl: input.receiptFileUrl,
        revisionNote: input.note ?? null,
        createdBy: context.actor.id,
      },
      select: expenseSelect,
    })

    await emitAudit(
      {
        organizationId: user.organizationId,
        actorId: context.actor.id,
        actorRole: context.actor.roleName,
        action: 'create',
        targetType: 'expenses',
        targetId: row.id,
        after: {
          expenseType: 'hotel',
          grossSatang: input.amountSatang,
          expenseDate: input.expenseDate,
          sharedWithUserId: input.sharedWithUserId ?? null,
          status: 'pending_approval',
          events: ['expense.hotel_claim_submitted'],
        },
        ipAddress: context.meta.ipAddress,
        userAgent: context.meta.userAgent,
        diffOnly: false,
      },
      tx as ExpenseTxClient,
    )

    return row
  })

  return toExpenseDto(created)
}

// ── POST /api/field/expenses/:id/resubmit (`41` §8 resubmit_expense) ────────

/** โหลดรายการเบิกของ **ผู้เรียกเอง** — ของคนอื่น/ไม่มี = `EXPENSE_NOT_FOUND` (ไม่ leak) */
async function loadOwnExpense(user: SessionUser, expenseId: string): Promise<ExpenseRow> {
  const payeeId = await findOwnPayeeId(user)
  if (payeeId === null) throw new ExpenseStateError('EXPENSE_NOT_FOUND')

  const row = await prisma.expense.findFirst({
    where: { id: expenseId, organizationId: user.organizationId, payeeId, deletedAt: null },
    select: expenseSelect,
  })
  if (row === null) throw new ExpenseStateError('EXPENSE_NOT_FOUND')
  return row
}

export async function resubmitFieldExpense(
  user: SessionUser,
  expenseId: string,
  input: ResubmitExpenseInput,
  context: ExpenseMutationContext,
): Promise<FieldExpenseDto> {
  const current = await loadOwnExpense(user, expenseId)
  const nextStatus = nextExpenseStatus(current.status, 'resubmit_expense')

  // รายการที่ระบบคำนวณให้ (fuel/allowance) แก้ยอดเองไม่ได้ — แก้ได้เฉพาะรายการที่มาจากใบเสร็จ
  const editable = current.assignmentId === null
  const updated = await prisma.$transaction(async (tx) => {
    const row = await tx.expense.update({
      where: { id: expenseId },
      data: {
        status: nextStatus,
        ...(editable && input.amountSatang !== undefined ? { grossSatang: input.amountSatang } : {}),
        ...(editable && input.receiptFileUrl !== undefined ? { receiptFileUrl: input.receiptFileUrl } : {}),
        ...(input.note !== undefined ? { revisionNote: input.note } : {}),
        // เคลียร์เหตุผลเดิมทิ้งเมื่อส่งกลับเข้าคิวอนุมัติใหม่
        rejectionReason: null,
        updatedBy: context.actor.id,
      },
      select: expenseSelect,
    })

    await emitAudit(
      {
        organizationId: user.organizationId,
        actorId: context.actor.id,
        actorRole: context.actor.roleName,
        action: 'status_change',
        targetType: 'expenses',
        targetId: expenseId,
        before: { status: current.status, grossSatang: current.grossSatang },
        after: {
          status: nextStatus,
          grossSatang: row.grossSatang,
          receiptFileUrl: row.receiptFileUrl,
          events: ['expense.resubmitted'],
        },
        reason: input.note ?? 'แก้ไขเอกสารตามที่ผู้อนุมัติจ่ายตีกลับ (`41` §8)',
        ipAddress: context.meta.ipAddress,
        userAgent: context.meta.userAgent,
        diffOnly: false,
      },
      tx as ExpenseTxClient,
    )

    return row
  })

  return toExpenseDto(updated)
}

// ── POST /api/field/expenses/:id/reject (`41` §8 reject_expense) ────────────

/**
 * ตีกลับรายการเบิก — **ผู้อนุมัติจ่าย (บัญชี/การเงิน ไฟล์ 16/17) เท่านั้น**
 * ห้ามสลับกับ `reject_evidence` ซึ่งแตะ `assignment_status` ทั้งเคส (`41` §10.1)
 *
 * ⚠️ ค่าที่เขียนลงแถวมาจาก `buildRejectExpenseUpdate()` (Phase 3.2) ที่เดียวกับ
 * `PATCH /api/compensation/:id/reject` — กฎ "ตีกลับแล้วกลับขั้น 1 เสมอ" (`16` §9) จึงใช้กับ
 * ทั้งสองทางเข้าเหมือนกัน ไม่มีทางลัดที่ทำให้รายการค้างอยู่กลางสายอนุมัติ
 */
export async function rejectFieldExpense(
  user: SessionUser,
  expenseId: string,
  input: RejectExpenseInput,
  context: ExpenseMutationContext,
): Promise<FieldExpenseDto> {
  const reason = assertRejectReason(input.reason)

  // ยามเดียวกับ `PATCH /api/compensation/:id/reject` — scope ทีม + capability ของขั้นที่ค้างอยู่
  // (`16` §10/§12 · `25` §7.2) ถ้าไม่เรียก ทางเข้านี้จะกลายเป็นประตูหลังของสายอนุมัติทั้งเส้น
  await assertCanRejectExpense(user, expenseId)

  const current = await prisma.expense.findFirst({
    where: { id: expenseId, organizationId: user.organizationId, deletedAt: null },
    select: { ...expenseSelect, approvalStepCurrent: true, approvalHistory: true },
  })
  if (current === null) throw new ExpenseStateError('EXPENSE_NOT_FOUND')

  const nextStatus = nextExpenseStatus(current.status, 'reject_expense')
  const update = buildRejectExpenseUpdate({
    status: nextStatus,
    history: parseApprovalHistory(current.approvalHistory),
    rejectedStep: current.approvalStepCurrent,
    actorId: context.actor.id,
    actorRole: context.actor.roleName,
    reason,
    at: new Date(),
  })

  const updated = await prisma.$transaction(async (tx) => {
    const row = await tx.expense.update({
      where: { id: expenseId },
      data: {
        ...update,
        approvalHistory: update.approvalHistory as unknown as Prisma.InputJsonValue,
        updatedBy: context.actor.id,
      },
      select: expenseSelect,
    })

    await emitAudit(
      {
        organizationId: user.organizationId,
        actorId: context.actor.id,
        actorRole: context.actor.roleName,
        action: 'reject',
        targetType: 'expenses',
        targetId: expenseId,
        before: { status: current.status, approval_step_current: current.approvalStepCurrent },
        // ไม่แตะ assignment_status ของเคสเลย (`41` §10.1 · §20)
        after: {
          status: nextStatus,
          rejectReason: reason,
          approval_step_current: update.approvalStepCurrent,
          rejected_at_step: current.approvalStepCurrent,
          events: [],
        },
        reason,
        ipAddress: context.meta.ipAddress,
        userAgent: context.meta.userAgent,
        diffOnly: false,
      },
      tx as ExpenseTxClient,
    )

    return row
  })

  return toExpenseDto(updated)
}

// ── GET /api/field/income-summary (`41` §7.10) ──────────────────────────────

/**
 * สรุปรายได้ของพนักงาน — ค่าคอมมิชชั่น/เบี้ยเสี่ยงมาจาก **แผนที่ snapshot ไว้กับรายการเบิกของเคสนั้น**
 * (`41` §6.8 — ค่าตายตัวต่อเคสตาม `22` §6.4) ไม่ใช่แผนปัจจุบัน
 *
 * เคส `reassigned_away` ไม่นับ (ไม่ใช่ผลการปิดงาน — `41` §10)
 */
export async function getIncomeSummary(
  user: SessionUser,
  query: IncomeSummaryQuery,
): Promise<FieldIncomeSummaryDto> {
  const range = query.month === undefined ? null : monthRangeUtc(query.month)

  const assignments = await prisma.caseAssignment.findMany({
    where: {
      organizationId: user.organizationId,
      agentId: user.id,
      status: { in: ['closed_success', 'closed_fail'] },
      ...(range === null ? {} : { completedAt: { gte: range.from, lt: range.to } }),
    },
    orderBy: { completedAt: 'desc' },
    take: 500,
    select: {
      id: true,
      caseId: true,
      status: true,
      completedAt: true,
      teamId: true,
      case: { select: { caseRef: true, debtorName: true } },
      team: { select: { compensationPlanId: true } },
      expenses: {
        where: { deletedAt: null, status: { in: [...ACTIVE_EXPENSE_STATUSES] } },
        select: { compPlanId: true },
        take: 1,
      },
    },
  })

  const planIds = [
    ...new Set(
      assignments.flatMap((row) => [row.expenses[0]?.compPlanId ?? null, row.team?.compensationPlanId ?? null]),
    ),
  ].filter((id): id is string => id !== null)

  const plans = await prisma.compensationPlan.findMany({
    where: { id: { in: planIds }, organizationId: user.organizationId },
    select: { id: true, commissionSatang: true, noSuccessFeeSatang: true },
  })
  const planById = new Map(plans.map((plan) => [plan.id, plan]))

  const items = assignments.map((row) => {
    const planId = row.expenses[0]?.compPlanId ?? row.team?.compensationPlanId ?? null
    const plan = planId === null ? undefined : planById.get(planId)
    const success = row.status === 'closed_success'
    const amountSatang = success ? (plan?.commissionSatang ?? 0) : (plan?.noSuccessFeeSatang ?? 0)
    return {
      caseId: row.caseId,
      caseRef: row.case.caseRef,
      debtorName: row.case.debtorName,
      outcome: (success ? 'closed_success' : 'closed_fail') as CaseOutcome,
      closedAt: row.completedAt?.toISOString() ?? null,
      amountSatang,
    }
  })

  const successItems = items.filter((item) => item.outcome === 'closed_success')
  const failItems = items.filter((item) => item.outcome === 'closed_fail')

  return {
    month: query.month ?? null,
    successCount: successItems.length,
    failCount: failItems.length,
    commissionSatang: successItems.reduce((sum, item) => sum + item.amountSatang, 0),
    noSuccessFeeSatang: failItems.reduce((sum, item) => sum + item.amountSatang, 0),
    items,
  }
}

/** ช่วงของเดือน (เวลาไทย) เป็น instant UTC — `2026-08` = 01/08 00:00 ไทย ถึง 01/09 00:00 ไทย */
function monthRangeUtc(month: string): { from: Date; to: Date } {
  const [yearText, monthText] = month.split('-')
  const year = Number(yearText)
  const monthIndex = Number(monthText) - 1
  const from = new Date(Date.UTC(year, monthIndex, 1, -7, 0, 0))
  const to = new Date(Date.UTC(year, monthIndex + 1, 1, -7, 0, 0))
  return { from, to }
}
