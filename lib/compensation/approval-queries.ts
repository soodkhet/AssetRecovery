import { assertPeriodOpenAt } from '@/lib/accounting/period-guard'
import { emitAudit } from '@/lib/audit/audit'
import { hasCapability } from '@/lib/auth/permission'
import type { RequestMeta } from '@/lib/auth/request-meta'
import type { SessionUser } from '@/lib/auth/types'
import {
  appendApprovalHistory,
  approversInCurrentRound,
  approverStampFor,
  assertActorCanApproveStep,
  buildRejectExpenseUpdate,
  expenseStatusForPendingStep,
  parseApprovalHistory,
  type ApprovalHistoryEntry,
} from '@/lib/compensation/approval'
import type {
  CompensationApprovalDto,
  CompensationApprovalListQuery,
  CompensationApproveInput,
  CompensationRejectInput,
} from '@/lib/compensation/approval-types'
import { assertRejectReason, canExpenseAction, nextExpenseStatus, ExpenseStateError } from '@/lib/field/expense-status'
import {
  advanceApprovalStep,
  assertApprovalStepInOrder,
  assertNoDuplicateApprover,
  resolveApprovalFlow,
  type ApprovalMatrixCandidate,
} from '@/lib/finance/approval-flow-resolver'
import { FinanceError } from '@/lib/finance/errors'
import { calculateWhtForPayee } from '@/lib/finance/wht-calc'
import { Prisma } from '@/lib/generated/prisma/client'
import type { ExpenseStatus } from '@/lib/generated/prisma/enums'
import { prisma } from '@/lib/prisma'
import { SettingsError } from '@/lib/settings/errors'
import type { WhtBasis } from '@/lib/settings/tax-profile'
import { tryCreateRevenue } from '@/lib/warehouse/revenue-service'
import type { WarehouseTxClient } from '@/lib/warehouse/asset-hook'

/**
 * สายอนุมัติค่าตอบแทน — ชั้น DB (ไฟล์ 16 · `27` §6.5)
 *
 * ### กติกาที่ห้ามหลุด
 * - **ทุกก้าวอยู่ใน `$transaction` เดียว**: อัปเดตสถานะ + `approval_history` + audit (+ Revenue gate
 *   เมื่อผ่านครบขั้น) — ล้มข้อใดข้อหนึ่ง rollback ทั้งหมด
 * - **ตีกลับ = กลับขั้น 1 เสมอ** ไม่ resume (`16` §9) — ประกอบค่าที่ `buildRejectExpenseUpdate()` ที่เดียว
 * - **`reject_expense` ≠ `reject_evidence`** (`16` §6.2 · `41` §10.1): ที่นี่แตะแค่ `expense.status`
 *   **ไม่แตะ `assignment_status` ของเคส** — การตีกลับหลักฐานปิดงานเป็นสิทธิ์ของเจ้าหน้าที่อนุมัติเคส
 * - **เงื่อนไข Revenue ไม่ถูกเขียนซ้ำ**: ผ่านครบขั้นแล้วเรียก `tryCreateRevenue()` (Phase 2.13) ซึ่ง
 *   เรียก `evaluateRevenueTrigger()` ต่อให้เอง (`19` §6.1 · DEC-006/D6)
 *
 * ### สาย snapshot (`13` §6.2 → `expenses.approval_matrix_id`)
 * สายอนุมัติถูก **snapshot ลงรายการตอนอนุมัติขั้นแรก** แล้วใช้ชุดเดิมจนจบ (รวมถึงหลังตีกลับ) —
 * เปลี่ยน Approval Matrix กลางภายหลังจึงไม่ย้อนไปเปลี่ยนสายของรายการที่เดินอยู่ (`92` §7.1)
 * รายการที่ยังไม่มี snapshot แสดงสายแบบ **คาดการณ์** จาก matrix ปัจจุบัน (`flowIsProjected = true`)
 */

export interface ApprovalMutationContext {
  actor: SessionUser
  meta: RequestMeta
}

const TARGET = 'expenses'

const expenseSelect = {
  id: true,
  organizationId: true,
  caseId: true,
  assignmentId: true,
  payeeId: true,
  expenseType: true,
  grossSatang: true,
  expenseDate: true,
  distanceKm: true,
  status: true,
  approvalStepCurrent: true,
  approvalStepTotal: true,
  approvalHistory: true,
  approvalMatrixId: true,
  rejectionReason: true,
  calculationSource: true,
  createdAt: true,
  compPlan: {
    select: {
      id: true,
      name: true,
      whtPct: true,
      fuelMode: true,
      fuelRatePerKmSatang: true,
      fuelDailyFlatSatang: true,
      allowanceSatang: true,
    },
  },
  approvalMatrix: {
    select: { id: true, condition: true, approvalFlow: true, enforceSegregationOfDuties: true },
  },
  payee: {
    select: {
      id: true,
      isVerified: true,
      user: { select: { fullName: true } },
      taxProfile: { select: { whtPct: true, whtBasis: true, whtMinThresholdSatang: true } },
    },
  },
  case: { select: { id: true, caseRef: true, debtorName: true } },
  assignment: { select: { teamId: true, agent: { select: { fullName: true } } } },
} as const

type ExpenseRow = Prisma.ExpenseGetPayload<{ select: typeof expenseSelect }>

/** สถานะที่อยู่ในคิวอนุมัติจริง (`23` §6.3) — คลังยังไม่ปล่อยก็ยังไม่ถึงตาการเงิน */
const PIPELINE_STATUSES: readonly ExpenseStatus[] = [
  'pending_approval',
  'pending_finance_approval',
  'needs_revision',
  'approved',
]

// ── สายอนุมัติของรายการหนึ่ง ────────────────────────────────────────────────

interface ResolvedFlow {
  matrixId: string
  steps: readonly string[]
  totalSteps: number
  enforceSegregationOfDuties: boolean
  /** true = ยังไม่ถูก snapshot ลงรายการ (ตัวเลขขั้นเป็นการคาดการณ์) */
  projected: boolean
}

async function loadMatrixCandidates(organizationId: string): Promise<ApprovalMatrixCandidate[]> {
  const rows = await prisma.approvalMatrix.findMany({
    where: { organizationId, deletedAt: null },
    select: { id: true, condition: true, conditionThresholdSatang: true, approvalFlow: true, enforceSegregationOfDuties: true },
  })
  return rows.map((row) => ({
    id: row.id,
    condition: row.condition,
    conditionThresholdSatang: row.conditionThresholdSatang,
    approvalFlow: row.approvalFlow,
    enforceSegregationOfDuties: row.enforceSegregationOfDuties,
  }))
}

/** สาย snapshot ของรายการ (ถ้ามี) — ไม่มีก็คาดการณ์จาก matrix ปัจจุบันตามยอดของรายการนั้น */
function flowOf(row: ExpenseRow, candidates: readonly ApprovalMatrixCandidate[]): ResolvedFlow {
  if (row.approvalMatrix !== null) {
    return {
      matrixId: row.approvalMatrix.id,
      steps: row.approvalMatrix.approvalFlow,
      totalSteps: row.approvalStepTotal,
      enforceSegregationOfDuties: row.approvalMatrix.enforceSegregationOfDuties,
      projected: false,
    }
  }
  const resolved = resolveApprovalFlow(row.grossSatang, candidates)
  return {
    matrixId: resolved.matrixId,
    steps: resolved.steps.map((step) => step.role),
    totalSteps: resolved.totalSteps,
    enforceSegregationOfDuties: resolved.enforceSegregationOfDuties,
    projected: true,
  }
}

/**
 * เหมือน `flowOf()` แต่คืน `null` เมื่อยังตั้งค่าสายอนุมัติไม่ครอบยอดนี้
 *
 * ใช้กับ **การตีกลับ** เท่านั้น: การอนุมัติต้องมีสายจริงเสมอ (matrix คือสิ่งที่บอกว่าใครต้องอนุมัติ)
 * แต่การตีกลับเป็นวาล์วนิรภัย — ถ้าบล็อกเพราะตั้งค่ายังไม่ครบ รายการที่เอกสารผิดจะค้างคิวโดยไม่มี
 * ทางออก · สิทธิ์ยังถูกตรวจที่ API layer (ต้องถือ capability ผู้อนุมัติสักขั้น) เสมอ
 */
function flowOrNull(row: ExpenseRow, candidates: readonly ApprovalMatrixCandidate[]): ResolvedFlow | null {
  try {
    return flowOf(row, candidates)
  } catch (error) {
    if (error instanceof SettingsError && error.code === 'APPROVAL_MATRIX_NOT_FOUND') return null
    throw error
  }
}

/** สายที่ snapshot ไว้แล้วแต่ยาวไม่เท่า `approval_step_total` = ข้อมูลเพี้ยน ⇒ ต้องดัง ไม่ใช่เดา */
function stepRoleOf(flow: ResolvedFlow, step: number): string {
  const role = flow.steps[step - 1]
  if (role === undefined) {
    throw new FinanceError('APPROVAL_STEP_OUT_OF_ORDER', {
      detail: `flow=${flow.matrixId} step=${step} steps=${flow.steps.length}`,
    })
  }
  return role
}

// ── สรุปฐานคิดเป็นข้อความ (`16` §8) ─────────────────────────────────────────

const satangToBaht = (value: number): string =>
  (value / 100).toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

/**
 * ข้อความสรุป "สูตร/ฐานคิด" ที่ตารางแสดง (`16` §8 — เช่น "128.50 กม. × 3.50 บาท/กม.")
 * — อ่านจาก **snapshot ของรายการ** เท่านั้น ไม่ย้อนไปคำนวณจากแผนปัจจุบัน (`92` §7.1)
 */
export function describeExpenseBasis(row: {
  expenseType: ExpenseRow['expenseType']
  grossSatang: number
  distanceKm: Prisma.Decimal | null
  compPlan: {
    fuelRatePerKmSatang: number | null
    fuelDailyFlatSatang: number | null
    allowanceSatang: number | null
  } | null
}): string {
  if (row.expenseType === 'fuel') {
    if (row.distanceKm !== null && row.compPlan?.fuelRatePerKmSatang != null) {
      return `${row.distanceKm.toFixed(2)} กม. × ${satangToBaht(row.compPlan.fuelRatePerKmSatang)} บาท/กม.`
    }
    if (row.compPlan?.fuelDailyFlatSatang != null) {
      return `เหมาจ่ายรายวัน ${satangToBaht(row.compPlan.fuelDailyFlatSatang)} บาท/วัน`
    }
  }
  if (row.expenseType === 'allowance' && row.compPlan?.allowanceSatang) {
    const days = Math.round(row.grossSatang / row.compPlan.allowanceSatang)
    return `${days} วัน × ${satangToBaht(row.compPlan.allowanceSatang)} บาท/วัน`
  }
  return `${satangToBaht(row.grossSatang)} บาท`
}

// ── DTO ─────────────────────────────────────────────────────────────────────

function toDto(row: ExpenseRow, flow: ResolvedFlow): CompensationApprovalDto {
  const pendingStep = row.status === 'approved' ? null : row.approvalStepCurrent
  const pendingStepRole = pendingStep === null ? null : (flow.steps[pendingStep - 1] ?? null)

  // `22` §6.9 · `18` §6.3 — **Payee ชนะ Plan** โดยตัวคำนวณกลาง ห้ามประกอบกฎ priority เองที่นี่
  const wht = calculateWhtForPayee({
    grossSatang: row.grossSatang,
    source: {
      payeeTaxProfile:
        row.payee.taxProfile === null
          ? null
          : {
              whtPct: row.payee.taxProfile.whtPct.toNumber(),
              whtBasis: row.payee.taxProfile.whtBasis as WhtBasis,
              whtMinThresholdSatang: row.payee.taxProfile.whtMinThresholdSatang,
            },
      planWhtPct: row.compPlan?.whtPct.toNumber() ?? null,
    },
  })

  return {
    id: row.id,
    caseId: row.caseId,
    caseRef: row.case?.caseRef ?? null,
    debtorName: row.case?.debtorName ?? null,
    agentName: row.assignment?.agent.fullName ?? null,
    payeeId: row.payeeId,
    payeeName: row.payee.user.fullName,
    payeeVerified: row.payee.isVerified,
    expenseType: row.expenseType,
    expenseDate: row.expenseDate.toISOString().slice(0, 10),
    distanceKm: row.distanceKm?.toFixed(2) ?? null,
    calculationSource: row.calculationSource,
    basisText: describeExpenseBasis(row),
    grossSatang: row.grossSatang,
    whtSatang: wht.whtSatang,
    netSatang: wht.netSatang,
    whtPctUsed: wht.whtPctUsed,
    whtRateSource: wht.rate.source,
    whtWarning: wht.rate.warning ?? null,
    status: row.status,
    approvalStepCurrent: row.approvalStepCurrent,
    approvalStepTotal: flow.totalSteps,
    pendingStepRole,
    approvalHistory: parseApprovalHistory(row.approvalHistory),
    rejectReason: row.rejectionReason,
    createdAt: row.createdAt.toISOString(),
  }
}

// ── GET /api/compensation (`16` §14) ────────────────────────────────────────

/**
 * `16` §10 — ผู้อนุมัติขั้น Manager เห็นเฉพาะทีมที่ตนดูแล (`team_managers` → `user.scope.teamIds`)
 * · ผู้ถือสิทธิ์ขั้นการเงิน/บริหารเห็นทั้งองค์กร · scope แยกจาก filter ของผู้เรียกด้วย `AND` เสมอ
 */
function scopeFilter(user: SessionUser): Prisma.ExpenseWhereInput {
  if (user.isSuperadmin) return {}
  if (
    hasCapability(user, 'view', 'approve_expense_finance') ||
    hasCapability(user, 'view', 'approve_expense_executive')
  ) {
    return {}
  }
  return { assignment: { teamId: { in: [...user.scope.teamIds] } } }
}

const STATUS_FILTER: Readonly<Record<CompensationApprovalListQuery['status'], readonly ExpenseStatus[]>> = {
  pending_approval: ['pending_approval'],
  pending_finance_approval: ['pending_finance_approval'],
  needs_revision: ['needs_revision'],
  approved: ['approved'],
  all: PIPELINE_STATUSES,
}

export async function listCompensationApprovals(
  user: SessionUser,
  query: CompensationApprovalListQuery,
): Promise<CompensationApprovalDto[]> {
  const rows = await prisma.expense.findMany({
    where: {
      AND: [
        {
          organizationId: user.organizationId,
          deletedAt: null,
          status: { in: [...STATUS_FILTER[query.status]] },
        },
        scopeFilter(user),
        query.caseId === undefined ? {} : { caseId: query.caseId },
        query.payeeId === undefined ? {} : { payeeId: query.payeeId },
      ],
    },
    select: expenseSelect,
    orderBy: [{ expenseDate: 'desc' }, { createdAt: 'desc' }],
    take: 300,
  })
  if (rows.length === 0) return []

  const candidates = await loadMatrixCandidates(user.organizationId)
  return rows.map((row) => toDto(row, flowOf(row, candidates)))
}

// ── PATCH /api/compensation/:id/approve · /reject ────────────────────────────

async function findExpense(user: SessionUser, expenseId: string): Promise<ExpenseRow> {
  const row = await prisma.expense.findFirst({
    where: {
      AND: [{ id: expenseId, organizationId: user.organizationId, deletedAt: null }, scopeFilter(user)],
    },
    select: expenseSelect,
  })
  if (row === null) throw new ExpenseStateError('EXPENSE_NOT_FOUND', { detail: `expense=${expenseId}` })
  return row
}

/**
 * ยามของการ **ตีกลับรายการเบิก** ที่ใช้ร่วมทั้งสองทางเข้า — `PATCH /api/compensation/:id/reject`
 * และ `POST /api/field/expenses/:id/reject` (`41` §8) ซึ่งเขียนค่าชุดเดียวกันผ่าน
 * `buildRejectExpenseUpdate()` จึงต้องผ่านด่านเดียวกันเป๊ะ:
 *
 * 1. **scope ทีม** — Manager ตีกลับได้เฉพาะรายการของทีมตัวเอง (`25` §7.2 · `16` §10) นอก scope
 *    ต้องได้ `EXPENSE_NOT_FOUND` เหมือนไม่มีแถวนั้น (ไม่ leak)
 * 2. **capability ของขั้นที่รายการค้างอยู่** — ถือ `approve_expense_manager` ไม่ได้แปลว่าเขี่ย
 *    รายการที่ค้างขั้น Finance/Executive ได้ (`16` §12)
 *
 * ⚠️ ห้ามลบการเรียกนี้ออกจากทางเข้าใดทางหนึ่ง — ทางที่ขาดยามจะกลายเป็นประตูหลังของอีกทางทันที
 */
export async function assertCanRejectExpense(user: SessionUser, expenseId: string): Promise<void> {
  const current = await findExpense(user, expenseId)
  const flow = flowOrNull(current, await loadMatrixCandidates(user.organizationId))
  const stepRole = flow === null ? null : stepRoleOf(flow, current.approvalStepCurrent)
  if (stepRole !== null) assertActorCanApproveStep(user, stepRole)
}

export interface ApproveResult {
  expense: CompensationApprovalDto
  /** ชื่อ event ที่เกิดจริงในก้าวนี้ — ลง audit ให้ตามสอบได้ (`45` §7) */
  events: readonly string[]
  /** เคสที่ผ่านเกต Revenue ครบแล้วในก้าวนี้ (`19` §6.1) */
  revenueEligibleCaseIds: readonly string[]
}

/**
 * `16` §9 — อนุมัติขั้นปัจจุบัน 1 ขั้น
 *
 * ลำดับยาม: สถานะทำได้ไหม → สาย/ขั้น (`APPROVAL_STEP_OUT_OF_ORDER`) → capability ของขั้นนั้น →
 * แยกหน้าที่ (`SEGREGATION_OF_DUTIES_VIOLATION`) → เดินขั้น → เขียน + audit (+ Revenue gate)
 *
 * @param input.step ขั้นที่ FE คิดว่ากำลังกด — ส่งมาเพื่อกันกดซ้ำ/กดข้ามจากหน้าจอที่ค้าง
 */
export async function approveCompensationExpense(
  context: ApprovalMutationContext,
  expenseId: string,
  input: CompensationApproveInput,
): Promise<ApproveResult> {
  const user = context.actor
  const current = await findExpense(user, expenseId)

  if (!canExpenseAction(current.status, 'approve_manager') && !canExpenseAction(current.status, 'approve_finance')) {
    throw new ExpenseStateError('EXPENSE_INVALID_STATUS', {
      context: { status: current.status, action: 'approve' },
      detail: `สถานะ ${current.status} ไม่ได้อยู่ในคิวอนุมัติ`,
    })
  }

  // Period Lock (`13` §6.11 · Phase 4.1) — อนุมัติ = จุดที่เงินเข้างวด ⇒ งวดที่ปิดแล้วต้องใช้ Adjustment
  await assertPeriodOpenAt({
    organizationId: user.organizationId,
    at: current.expenseDate,
    targetType: TARGET,
    targetId: expenseId,
  })

  const flow = flowOf(current, await loadMatrixCandidates(user.organizationId))
  assertApprovalStepInOrder({
    requestedStep: input.step ?? current.approvalStepCurrent,
    currentStep: current.approvalStepCurrent,
    totalSteps: flow.totalSteps,
  })

  const stepRole = stepRoleOf(flow, current.approvalStepCurrent)
  const contract = assertActorCanApproveStep(user, stepRole)

  const history = parseApprovalHistory(current.approvalHistory)
  assertNoDuplicateApprover({
    enforceSegregationOfDuties: flow.enforceSegregationOfDuties,
    approverId: user.id,
    previousApproverIds: approversInCurrentRound(history),
  })

  const progress = advanceApprovalStep(current.approvalStepCurrent, flow.totalSteps)
  const nextStatus = expenseStatusForPendingStep(progress.nextStep)
  const at = new Date()
  const entry: ApprovalHistoryEntry = {
    step: current.approvalStepCurrent,
    approverId: user.id,
    approverRole: user.roleName,
    action: 'approve',
    timestamp: at.toISOString(),
    reason: input.note?.trim() === '' ? null : (input.note?.trim() ?? null),
  }

  const outcome = await prisma.$transaction(async (tx) => {
    const row = await tx.expense.update({
      where: { id: expenseId },
      data: {
        status: nextStatus,
        approvalStepCurrent: progress.nextStep ?? flow.totalSteps,
        approvalStepTotal: flow.totalSteps,
        approvalMatrixId: flow.matrixId,
        approvalHistory: appendApprovalHistory(history, entry) as unknown as Prisma.InputJsonValue,
        ...approverStampFor(contract.column, user.id, at),
        updatedBy: user.id,
      },
      select: expenseSelect,
    })

    // `19` §6.1 — ผ่านครบทุกขั้น = `expense.approved` ⇒ เช็คเกต Revenue ต่อ (เงื่อนไขอยู่ที่ 2.13/3.1)
    const revenue =
      progress.isComplete && row.caseId !== null
        ? await tryCreateRevenue(tx as WarehouseTxClient, {
            organizationId: user.organizationId,
            caseIds: [row.caseId],
            actorId: user.id,
          })
        : { eligibleCaseIds: [] as string[], revenueIdsCreated: [] as string[], skipped: [] }

    const events = progress.isComplete ? (['expense.approved'] as const) : ([] as const)

    await emitAudit(
      {
        organizationId: user.organizationId,
        actorId: user.id,
        actorRole: user.roleName,
        action: 'approve',
        targetType: TARGET,
        targetId: expenseId,
        before: {
          status: current.status,
          approval_step_current: current.approvalStepCurrent,
          approval_matrix_id: current.approvalMatrixId,
        },
        after: {
          status: nextStatus,
          approval_step_current: row.approvalStepCurrent,
          approval_step_total: flow.totalSteps,
          approval_matrix_id: flow.matrixId,
          step_role: stepRole,
          gross_satang: row.grossSatang,
          revenue_eligible_case_ids: revenue.eligibleCaseIds,
          revenue_ids_created: revenue.revenueIdsCreated,
          events: [...events],
        },
        // `16` §13 — บันทึกทุกขั้น · เหตุผลมีเมื่อผู้อนุมัติใส่หมายเหตุ (อนุมัติไม่บังคับเหตุผล)
        reason: entry.reason,
        ipAddress: context.meta.ipAddress,
        userAgent: context.meta.userAgent,
        diffOnly: false,
      },
      tx,
    )

    return { row, events: [...events], revenueEligibleCaseIds: revenue.eligibleCaseIds }
  })

  return {
    expense: toDto(outcome.row, { ...flow, projected: false }),
    events: outcome.events,
    revenueEligibleCaseIds: outcome.revenueEligibleCaseIds,
  }
}

export interface RejectResult {
  expense: CompensationApprovalDto
  events: readonly string[]
}

/**
 * `16` §9 · `41` §8 `reject_expense` — ตีกลับให้ผู้เบิกแก้ไข
 *
 * ⚠️ **ไม่ใช่ `reject_evidence`** — ที่นี่แตะแค่ `expense.status` ไม่แตะสถานะงานภาคสนามของเคส
 * (`16` §6.2 · `41` §10.1 — สองสิทธิ์แยกกันเด็ดขาด)
 */
export async function rejectCompensationExpense(
  context: ApprovalMutationContext,
  expenseId: string,
  input: CompensationRejectInput,
): Promise<RejectResult> {
  const user = context.actor
  const reason = assertRejectReason(input.reason)
  const current = await findExpense(user, expenseId)
  const nextStatus = nextExpenseStatus(current.status, 'reject_expense')

  await assertPeriodOpenAt({
    organizationId: user.organizationId,
    at: current.expenseDate,
    targetType: TARGET,
    targetId: expenseId,
  })

  const flow = flowOrNull(current, await loadMatrixCandidates(user.organizationId))
  const stepRole = flow === null ? null : stepRoleOf(flow, current.approvalStepCurrent)
  if (stepRole !== null) assertActorCanApproveStep(user, stepRole)
  // (ยามชุดเดียวกันถูกห่อไว้ที่ `assertCanRejectExpense()` ให้ทางเข้าฝั่ง field เรียกใช้)

  const history = parseApprovalHistory(current.approvalHistory)
  const at = new Date()
  const update = buildRejectExpenseUpdate({
    status: nextStatus,
    history,
    rejectedStep: current.approvalStepCurrent,
    actorId: user.id,
    actorRole: user.roleName,
    reason,
    at,
  })

  const updated = await prisma.$transaction(async (tx) => {
    const row = await tx.expense.update({
      where: { id: expenseId },
      data: {
        ...update,
        approvalHistory: update.approvalHistory as unknown as Prisma.InputJsonValue,
        ...(flow === null ? {} : { approvalMatrixId: flow.matrixId, approvalStepTotal: flow.totalSteps }),
        updatedBy: user.id,
      },
      select: expenseSelect,
    })

    await emitAudit(
      {
        organizationId: user.organizationId,
        actorId: user.id,
        actorRole: user.roleName,
        action: 'reject',
        targetType: TARGET,
        targetId: expenseId,
        before: { status: current.status, approval_step_current: current.approvalStepCurrent },
        after: {
          status: nextStatus,
          // ตีกลับ = กลับขั้น 1 เสมอ ไม่ resume (`16` §9)
          approval_step_current: row.approvalStepCurrent,
          rejected_at_step: current.approvalStepCurrent,
          step_role: stepRole,
          rejection_reason: reason,
          // ไม่แตะ `assignment_status` ของเคส (`41` §10.1)
          events: [],
        },
        reason,
        ipAddress: context.meta.ipAddress,
        userAgent: context.meta.userAgent,
        diffOnly: false,
      },
      tx,
    )

    return row
  })

  return {
    expense: toDto(updated, flow ?? fallbackFlow(updated)),
    events: [],
  }
}

/** สายสำรองไว้ประกอบ DTO เมื่อยังตั้งค่าสายอนุมัติไม่ครบ — ตัวเลขขั้นมาจากคอลัมน์บนรายการล้วน ๆ */
function fallbackFlow(row: ExpenseRow): ResolvedFlow {
  return {
    matrixId: row.approvalMatrixId ?? '',
    steps: [],
    totalSteps: row.approvalStepTotal,
    enforceSegregationOfDuties: false,
    projected: true,
  }
}
