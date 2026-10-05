import { assertPeriodOpenAt } from '@/lib/accounting/period-guard'
import { emitAudit } from '@/lib/audit/audit'
import type { RequestMeta } from '@/lib/auth/request-meta'
import type { SessionUser } from '@/lib/auth/types'
import { buildRejectExpenseUpdate, parseApprovalHistory } from '@/lib/compensation/approval'
import { assertCanRejectExpense } from '@/lib/compensation/approval-queries'
import { resolvePlanVersionAt } from '@/lib/compensation/plan'
import { kmHundredthsToDecimalString } from '@/lib/field/distance'
import {
  planCaseExpenses,
  type CaseExpensePlan,
  type CompensationSnapshotValues,
} from '@/lib/field/expense-calc'
import {
  ACTIVE_EXPENSE_STATUSES,
  assertRejectReason,
  ExpenseStateError,
  isFieldDayExpenseHoldable,
  nextExpenseStatus,
} from '@/lib/field/expense-status'
import { assertHotelClaimFields, assertSharedAgentInTeam } from '@/lib/field/hotel-claim'
import { FIELD_PENDING_EXPENSE_STATUSES, pendingExpenseSatang } from '@/lib/field/expense-ui'
import { pairSupersededExpenses } from '@/lib/field/supersede-pairing'
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
import { sumSatang } from '@/lib/finance/satang'
import { toBangkokParts } from '@/lib/format/datetime'
import { Prisma } from '@/lib/generated/prisma/client'
import type { CaseOutcome, ExpenseStatus, ExpenseType } from '@/lib/generated/prisma/enums'
import { notifyExpensesAwaitingApproval } from '@/lib/notifications/approval-queue'
import { prisma } from '@/lib/prisma'
import { expenseReceiptRule } from '@/lib/uploads/rules'
import { verifyUploadedFile } from '@/lib/uploads/verify'

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
  return toPlanSnapshot(picked)
}

const planSnapshotSelect = {
  id: true,
  version: true,
  fuelMode: true,
  fuelRatePerKmSatang: true,
  fuelMaxPerCaseSatang: true,
  fuelDailyFlatSatang: true,
  allowanceSatang: true,
  commissionSatang: true,
  noSuccessFeeSatang: true,
} as const

function toPlanSnapshot(row: Prisma.CompensationPlanGetPayload<{ select: typeof planSnapshotSelect }>): PlanSnapshot {
  return {
    planId: row.id,
    version: row.version,
    fuelMode: row.fuelMode,
    fuelRatePerKmSatang: row.fuelRatePerKmSatang,
    fuelMaxPerCaseSatang: row.fuelMaxPerCaseSatang,
    fuelDailyFlatSatang: row.fuelDailyFlatSatang,
    allowanceSatang: row.allowanceSatang,
    commissionSatang: row.commissionSatang,
    noSuccessFeeSatang: row.noSuccessFeeSatang,
  }
}

export interface RoundPricing {
  /** แผน (เวอร์ชัน) ที่ใช้คิดเงินของรอบติดตามนี้ — `null` = ไม่มีฐานคำนวณ (ทีมไม่ผูกแผน) */
  plan: PlanSnapshot | null
  /** วันปิดงาน **ครั้งแรก** ของรอบนี้ (`case_evidences.submitted_at` แรกสุด) — `null` = ยังไม่เคยปิด */
  pricedAt: Date | null
}

/**
 * ฐานราคาของรอบติดตามที่**เคยปิดงานไปแล้ว** — มติ PO 03/10/2569 (UAT Q7 · BUG-052 · `41` §10.1):
 * resubmit / งานคำนวณน้ำมันย้อนหลัง ต้องคิดด้วย **แผน (เวอร์ชัน) + วันที่ของการปิดงานครั้งแรก**
 * ไม่ใช่ ณ ตอนที่สร้างรายการใหม่ (`92` §7.1 — snapshot เมื่อเกิด)
 *
 * 1. รอบนี้เคยมีรายการเบิกจากแผน (รวม `superseded`) ⇒ ใช้ **แผนเวอร์ชันเดียวกับรายการแรกสุดเป๊ะ**
 *    (กันกรณีแก้แผนวันเดียวกับวันปิด — effective date ยังครอบทั้งสองเวอร์ชัน)
 * 2. ไม่เคยมี (ยอด 0 ทั้งชุด) ⇒ resolve แผนของทีม ณ วันปิดงานครั้งแรก
 */
export async function resolveRoundPricing(
  client: ExpenseTxClient,
  params: { organizationId: string; assignmentId: string; teamPlanId: string | null },
): Promise<RoundPricing> {
  const [firstEvidence, firstExpense] = await Promise.all([
    client.caseEvidence.findFirst({
      where: { organizationId: params.organizationId, assignmentId: params.assignmentId },
      orderBy: { submittedAt: 'asc' },
      select: { submittedAt: true },
    }),
    client.expense.findFirst({
      where: {
        organizationId: params.organizationId,
        assignmentId: params.assignmentId,
        calculationSource: 'compensation_plan',
        compPlanId: { not: null },
        deletedAt: null,
      },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      select: { compPlan: { select: planSnapshotSelect } },
    }),
  ])
  const pricedAt = firstEvidence?.submittedAt ?? null

  if (firstExpense?.compPlan != null) return { plan: toPlanSnapshot(firstExpense.compPlan), pricedAt }
  if (params.teamPlanId === null || pricedAt === null) return { plan: null, pricedAt }
  return {
    plan: await resolvePlanSnapshot(client, {
      organizationId: params.organizationId,
      planId: params.teamPlanId,
      onDate: pricedAt,
    }),
    pricedAt,
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
  closedAt: Date
  actor: SessionUser
  meta: RequestMeta
}

export interface GenerateCaseExpensesResult extends CaseExpensePlan {
  expenseIds: string[]
}

/**
 * สร้างรายการเบิก fuel `PER_KM` + commission/no_success_fee อัตโนมัติตอนปิดงาน
 * (`41` §6.6 · §8 · `22` §6.4 — มติ PO 03/10/2569 UAT Q2) · fuel เหมาจ่าย/allowance **ไม่สร้างที่นี่แล้ว**
 * (มติ PO UAT Q21 — job `daily_field_allowance` สร้างหลังจบวัน ดู `lib/field/daily-allowance-job.ts`)
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

/** รายการเบิกรอบเดิมที่เพิ่งถูก mark `superseded` — ค่าที่ต้องใช้ลง audit หลังรู้ใบใหม่ที่มาแทน */
export interface SupersededExpense {
  id: string
  previousStatus: ExpenseStatus
  status: ExpenseStatus
  expenseType: ExpenseType
  grossSatang: number
}

/**
 * `41` §10.1 — รายการเบิกของรอบเดิม mark `superseded` ก่อนสร้างชุดใหม่
 * คืนรายการที่ถูกแทนที่ (ว่าง = รอบนั้นไม่เคยมีรายการเบิก เช่น ยอด 0 ตาม D10)
 *
 * **ยังไม่ลง audit ที่นี่** — audit ของใบเดิมต้องมี `supersededByExpenseId` ซึ่งรู้หลังสร้างชุดใหม่แล้วเท่านั้น
 * ผู้เรียกต้องเรียก `linkSupersededExpenses()` ต่อใน transaction เดียวกันเสมอ (UAT BUG-097)
 */
export async function supersedeCaseExpenses(
  tx: ExpenseTxClient,
  params: { organizationId: string; assignmentId: string; actorId: string },
): Promise<SupersededExpense[]> {
  const rows = await tx.expense.findMany({
    where: {
      organizationId: params.organizationId,
      assignmentId: params.assignmentId,
      status: { in: [...ACTIVE_EXPENSE_STATUSES] },
      // ยามชั้นสอง (Final Test ด่าน 1) — รายการที่เข้ารอบจ่ายแล้วห้ามกลายเป็น `superseded`
      // ไม่งั้น `payout_batch_items` จะชี้ไปที่รายการที่ถูกแทนที่ ขณะชุดใหม่ยอดเดียวกันรอเข้ารอบจ่ายอีก
      // = จ่ายซ้ำ · ชั้นแรกคือยาม `EVIDENCE_REJECT_AFTER_FINAL` ที่ `rejectFieldEvidence()`
      payoutBatchItemId: null,
      // แถวรายวัน (มติ PO UAT Q21) = ต้นทุนวันลงพื้นที่ที่เกิดจริงแล้ว ไม่ผูกกับการส่งหลักฐานใหม่ (`41` §10.1)
      fieldDaySettlementId: null,
      deletedAt: null,
    },
    select: { id: true, status: true, expenseType: true, grossSatang: true },
  })

  const superseded: SupersededExpense[] = []
  for (const row of rows) {
    const nextStatus = nextExpenseStatus(row.status, 'supersede')
    await tx.expense.update({
      where: { id: row.id },
      data: { status: nextStatus, updatedBy: params.actorId },
    })
    superseded.push({
      id: row.id,
      previousStatus: row.status,
      status: nextStatus,
      expenseType: row.expenseType,
      grossSatang: row.grossSatang,
    })
  }
  return superseded
}

export interface FieldDayHoldResult {
  /** แถวรายวันที่ย้ายไปรอคลังแล้ว */
  heldIds: string[]
  /** แถวรายวันของเคสที่ไม่ได้ย้าย เพราะมีผู้อนุมัติไปแล้ว/ตีกลับ/เข้ารอบจ่าย — รอมติ PO (ลง audit ของการปิดงาน) */
  notHeld: { id: string; status: ExpenseStatus }[]
}

/**
 * BUG-092 — เคสเพิ่งเข้า `closed_success` ⇒ แถวรายวันของเคส (job `daily_field_allowance` / เบิกย้อนหลัง U50)
 * ที่ถูกสร้างตอนเคสยังเปิดเป็น `pending_approval` ต้องกลับไปรอคลังยืนยันเหมือนรายการอื่นของเคส
 * (`41` §6.6 กฎ "สถานะสำเร็จต้องรอคลังก่อน" · `44` §11) — ปลดอีกครั้งพร้อมกันตอนล็อต confirmed (Step 2)
 *
 * - เรียก**ในทรานแซกชันเดียวกับการปิดงาน หลัง `cases` ถูกอัปเดตแล้ว** — job รายวันล็อกแถว `cases` แบบ FOR SHARE
 *   ก่อนอ่านผลเคส ⇒ ฝั่งใดได้ล็อกก่อน อีกฝั่งเห็นผลที่ commit แล้ว (ไม่มีแถวหลุดเป็น `pending_approval`)
 * - ย้ายเฉพาะแถวที่ `isFieldDayExpenseHoldable()` (ยังไม่มีใครอนุมัติ/ไม่อยู่ในรอบจ่าย) · ไม่สร้าง/ไม่ลบแถว
 *   (ยอด/จำนวนแถวเท่าเดิม — ไม่ซ้ำไม่หาย) · ยาม optimistic ด้วย `updateMany where status/step` เดิม
 * - audit `status_change` ต่อแถว (reason ระบุเหตุ)
 */
export async function holdFieldDayExpensesForWarehouse(
  tx: ExpenseTxClient,
  params: { organizationId: string; caseId: string; actor: SessionUser; meta: RequestMeta },
): Promise<FieldDayHoldResult> {
  const rows = await tx.expense.findMany({
    where: {
      organizationId: params.organizationId,
      caseId: params.caseId,
      fieldDaySettlementId: { not: null },
      status: { in: ['pending_approval', 'pending_finance_approval', 'needs_revision', 'approved'] },
      deletedAt: null,
    },
    orderBy: [{ expenseDate: 'asc' }, { id: 'asc' }],
    select: {
      id: true,
      status: true,
      fieldDaySettlementId: true,
      approvalStepCurrent: true,
      managerApprovedAt: true,
      financeApprovedAt: true,
      executiveApprovedAt: true,
      payoutBatchItemId: true,
    },
  })

  const result: FieldDayHoldResult = { heldIds: [], notHeld: [] }
  for (const row of rows) {
    if (!isFieldDayExpenseHoldable(row)) {
      result.notHeld.push({ id: row.id, status: row.status })
      continue
    }
    const nextStatus = nextExpenseStatus(row.status, 'hold_for_warehouse')
    const claimed = await tx.expense.updateMany({
      where: { id: row.id, status: row.status, approvalStepCurrent: row.approvalStepCurrent, payoutBatchItemId: null },
      data: { status: nextStatus, updatedBy: params.actor.id },
    })
    if (claimed.count === 0) {
      result.notHeld.push({ id: row.id, status: row.status })
      continue
    }
    result.heldIds.push(row.id)
    await emitAudit(
      {
        organizationId: params.organizationId,
        actorId: params.actor.id,
        actorRole: params.actor.roleName,
        action: 'status_change',
        targetType: 'expenses',
        targetId: row.id,
        before: { status: row.status },
        after: { status: nextStatus, caseId: params.caseId, fieldDaySettlementId: row.fieldDaySettlementId },
        reason: 'เคสปิดงานสำเร็จ — รายการค่าน้ำมันเหมาจ่าย/เบี้ยเลี้ยงรายวันของเคสต้องรอคลังยืนยันรับเครื่องก่อนเข้าคิวอนุมัติ',
        ipAddress: params.meta.ipAddress,
        userAgent: params.meta.userAgent,
        diffOnly: false,
      },
      tx,
    )
  }
  return result
}

/**
 * ผูกรายการเก่า → รายการใหม่ที่มาแทน (`41` §10.1 — ไล่ประวัติย้อนหลังได้) + ลง audit ของใบเดิม
 * จับคู่ **ชนิดเดียวกัน** ผ่าน `pairSupersededExpenses()` (UAT BUG-051 — เดิมผูกทุกแถวกับแถวใหม่แถวแรก)
 * audit ของใบเดิมเก็บ `supersededByExpenseId` ใน after (null = ไม่มีใบใหม่ชนิดเดียวกันมาแทน) — UAT BUG-097
 */
export async function linkSupersededExpenses(
  tx: ExpenseTxClient,
  params: {
    organizationId: string
    superseded: readonly SupersededExpense[]
    replacementIds: readonly string[]
    actor: SessionUser
    meta: RequestMeta
    reason: string
  },
): Promise<void> {
  if (params.superseded.length === 0) return
  const supersededIds = params.superseded.map((row) => row.id)
  const rows =
    params.replacementIds.length === 0
      ? []
      : await tx.expense.findMany({
          where: { id: { in: [...supersededIds, ...params.replacementIds] } },
          select: { id: true, expenseType: true, expenseDate: true },
        })
  const toCandidate = (row: (typeof rows)[number]) => ({
    id: row.id,
    expenseType: row.expenseType,
    expenseDate: row.expenseDate.toISOString(),
  })
  const supersededSet = new Set(supersededIds)
  const pairs = pairSupersededExpenses(
    rows.filter((row) => supersededSet.has(row.id)).map(toCandidate),
    rows.filter((row) => !supersededSet.has(row.id)).map(toCandidate),
  )
  const replacementOf = new Map(pairs.map((pair) => [pair.supersededId, pair.replacementId]))
  for (const pair of pairs) {
    await tx.expense.update({
      where: { id: pair.supersededId },
      data: { supersededByExpenseId: pair.replacementId, updatedBy: params.actor.id },
    })
  }

  for (const row of params.superseded) {
    await emitAudit(
      {
        organizationId: params.organizationId,
        actorId: params.actor.id,
        actorRole: params.actor.roleName,
        action: 'status_change',
        targetType: 'expenses',
        targetId: row.id,
        before: { status: row.previousStatus, supersededByExpenseId: null },
        after: {
          status: row.status,
          expenseType: row.expenseType,
          grossSatang: row.grossSatang,
          supersededByExpenseId: replacementOf.get(row.id) ?? null,
          events: [],
        },
        reason: params.reason,
        ipAddress: params.meta.ipAddress,
        userAgent: params.meta.userAgent,
        diffOnly: false,
      },
      tx,
    )
  }
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
  resubmitNote: true,
  receiptFileUrl: true,
  receiptFileHash: true,
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
    resubmitNote: row.resubmitNote,
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
    return {
      type: query.type,
      items: [],
      pendingSatang: 0,
      approvedSatang: 0,
      pendingAllTabsSatang: 0,
      pendingFieldDates: [],
    }
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
  const pendingSatang = pendingExpenseSatang(items)
  const approvedSatang = items
    .filter((item) => item.status === 'approved')
    .reduce((sum, item) => sum + item.grossSatang, 0)

  const [pendingFieldDates, pendingAllTabsSatang] = await Promise.all([
    query.type === 'caseBound' ? pendingFieldDatesOf(user) : Promise.resolve([]),
    pendingAllTabsSatangOf(user.organizationId, payeeId),
  ])

  return { type: query.type, items, pendingSatang, approvedSatang, pendingAllTabsSatang, pendingFieldDates }
}

/**
 * ยอด "รอดำเนินการ" รวม**ทุกแท็บ** ของผู้เรียก (มติ PO 05/10/2569 U27 · UAT BUG-101) — คำนวณที่ DB เป็น satang
 * ไม่ขึ้นกับแท็บที่เปิดอยู่และไม่ถูกจำกัดจำนวนแถวของรายการ · ครอบคลุมทั้งรายการผูกเคส, เบิกแยก และ
 * คำขอเบิกส่วนเกินเงินทดรองของตัวเอง (`case_id` = NULL) เพราะทั้งหมดเป็นรายการเบิกของ payee เดียวกัน
 */
async function pendingAllTabsSatangOf(organizationId: string, payeeId: string): Promise<number> {
  const result = await prisma.expense.aggregate({
    where: {
      organizationId,
      payeeId,
      deletedAt: null,
      status: { in: [...FIELD_PENDING_EXPENSE_STATUSES] },
    },
    _sum: { grossSatang: true },
  })
  return result._sum.grossSatang ?? 0
}

/**
 * วันลงพื้นที่ของพนักงานที่ยังไม่ถูก settle รายวัน (มติ PO UAT Q21) — ล่าสุดก่อน · จำกัด 31 วัน
 * อ่านอย่างเดียว ไม่เดายอด: ยอดจริงเกิดเมื่อ job `daily_field_allowance` สร้างแถวแล้วเท่านั้น
 */
async function pendingFieldDatesOf(user: SessionUser): Promise<string[]> {
  const rows = await prisma.$queryRaw<{ fieldDate: Date }[]>`
    SELECT DISTINCT (ci.checked_in_at AT TIME ZONE 'Asia/Bangkok')::date AS "fieldDate"
      FROM check_ins ci
      JOIN case_assignments a ON a.id = ci.assignment_id
     WHERE ci.organization_id = ${user.organizationId}::uuid
       AND a.agent_id = ${user.id}::uuid
       AND NOT EXISTS (
             SELECT 1 FROM field_day_settlements s
              WHERE s.organization_id = ci.organization_id
                AND s.agent_id = a.agent_id
                AND s.field_date = (ci.checked_in_at AT TIME ZONE 'Asia/Bangkok')::date
           )
     ORDER BY 1 DESC
     LIMIT 31
  `
  return rows.map((row) => row.fieldDate.toISOString().slice(0, 10))
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

  // Period Lock (`13` §6.11 · Phase 4.1) — ค่าที่พักกรอกวันที่เองได้ ⇒ ย้อนเข้างวดที่ปิดแล้วไม่ได้
  await assertPeriodOpenAt({
    organizationId: user.organizationId,
    at: input.expenseDate,
    targetType: 'expenses',
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

  // ขยายมติ PO Q13 ถึงใบเสร็จ (UAT BUG-072) — server ดาวน์โหลดมาตรวจเอง (prefix ของผู้เบิก · มีจริง ·
  // magic bytes รูป/PDF · ขนาด) แล้วเก็บ SHA-256 ที่คำนวณเอง · นอก `$transaction` (I/O เครือข่าย)
  const receipt = await verifyUploadedFile(input.receiptFileUrl, expenseReceiptRule(user.id))

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
        receiptFileHash: receipt.sha256,
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
          receiptFileUrl: input.receiptFileUrl,
          receiptFileHash: receipt.sha256,
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

  // มติ PO U29 — ค่าที่พักเข้าคิวอนุมัติทันที ⇒ แจ้งผู้อนุมัติขั้น 1 (ทีมของผู้เบิก — มติ R6-B)
  notifyExpensesAwaitingApproval(user.organizationId, [created.id])
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
  await assertPeriodOpenAt({
    organizationId: user.organizationId,
    at: current.expenseDate,
    targetType: 'expenses',
    targetId: expenseId,
  })

  // รายการที่ระบบคำนวณให้ (fuel/allowance) แก้ยอดเองไม่ได้ — แก้ได้เฉพาะรายการที่มาจากใบเสร็จ
  const editable = current.assignmentId === null
  // แนบใบเสร็จใหม่ → ตรวจฝั่ง server แบบเดียวกับตอนเบิก (UAT BUG-072) · path เดิมที่เคยตรวจแล้วไม่ดาวน์โหลดซ้ำ
  const newReceiptPath = editable && input.receiptFileUrl !== undefined ? input.receiptFileUrl : null
  const receiptHash =
    newReceiptPath === null
      ? null
      : newReceiptPath === current.receiptFileUrl && current.receiptFileHash !== null
        ? current.receiptFileHash
        : (await verifyUploadedFile(newReceiptPath, expenseReceiptRule(user.id))).sha256
  const updated = await prisma.$transaction(async (tx) => {
    const row = await tx.expense.update({
      where: { id: expenseId },
      data: {
        status: nextStatus,
        ...(editable && input.amountSatang !== undefined ? { grossSatang: input.amountSatang } : {}),
        ...(newReceiptPath !== null ? { receiptFileUrl: newReceiptPath, receiptFileHash: receiptHash } : {}),
        // ข้อความชี้แจงเก็บแยก — ห้ามเขียนทับ `revision_note` (หมายเหตุตอนเบิก · UAT BUG-098 · `02` v4.13)
        ...(input.note !== undefined ? { resubmitNote: input.note } : {}),
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
        // เก็บหมายเหตุทั้งสองฟิลด์ทั้ง before/after — ส่งใหม่หลายรอบก็ไล่ข้อความชี้แจงทุกครั้งได้จาก audit (UAT BUG-098)
        before: {
          status: current.status,
          grossSatang: current.grossSatang,
          receiptFileUrl: current.receiptFileUrl,
          rejectionReason: current.rejectionReason,
          note: current.revisionNote,
          resubmitNote: current.resubmitNote,
        },
        after: {
          status: nextStatus,
          grossSatang: row.grossSatang,
          receiptFileUrl: row.receiptFileUrl,
          receiptFileHash: row.receiptFileHash,
          note: row.revisionNote,
          resubmitNote: row.resubmitNote,
          events: ['expense.resubmitted'],
        },
        reason: input.note ?? 'แก้ไขเอกสารตามที่ผู้อนุมัติจ่ายตีกลับ',
        ipAddress: context.meta.ipAddress,
        userAgent: context.meta.userAgent,
        diffOnly: false,
      },
      tx as ExpenseTxClient,
    )

    return row
  })

  // มติ PO U29 — ส่งกลับหลังแก้ = เริ่มขั้น 1 ใหม่ (`16` §9) ⇒ แจ้งผู้อนุมัติขั้น 1 อีกรอบ (คีย์ใหม่ตาม history)
  notifyExpensesAwaitingApproval(user.organizationId, [updated.id])
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

  await assertPeriodOpenAt({
    organizationId: user.organizationId,
    at: current.expenseDate,
    targetType: 'expenses',
    targetId: expenseId,
  })

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
 * สรุปรายได้ของพนักงาน — ค่าคอมมิชชั่น/เบี้ยเสี่ยงอ่านจาก **รายการเบิกจริง** (`commission` /
 * `no_success_fee`) ที่ระบบสร้างตอนปิดงาน (มติ PO 03/10/2569 UAT Q2 · BUG-054) — ยอดจึงเป็น
 * ตัวเดียวกับที่เข้าอนุมัติ/รอบจ่ายจริง ไม่ใช่อ่านจากแผนตรง (`92` §7.1 — snapshot เมื่อเกิด)
 *
 * เคส `reassigned_away` ไม่นับ (ไม่ใช่ผลการปิดงาน — `41` §10) · รายการที่ `superseded`/ลบแล้วไม่นับ
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
      case: { select: { caseRef: true, debtorName: true } },
      expenses: {
        where: {
          deletedAt: null,
          status: { in: [...ACTIVE_EXPENSE_STATUSES] },
          expenseType: { in: ['commission', 'no_success_fee'] },
        },
        select: { grossSatang: true },
      },
    },
  })

  // ⚠️ **ห้าม fallback ไปแผนของทีม** — งานที่ไม่มีรายการเบิกคอม/เบี้ยเสี่ยง active (แผนตั้งยอด 0
  // หรือทีมไม่ผูกแผน) แปลว่าไม่มีค่าตอบแทนส่วนนี้บันทึกไว้จริง ⇒ แสดง 0 ไม่ใช่เดาจากแผนสด
  const items = assignments.map((row) => {
    const success = row.status === 'closed_success'
    return {
      caseId: row.caseId,
      caseRef: row.case.caseRef,
      debtorName: row.case.debtorName,
      outcome: (success ? 'closed_success' : 'closed_fail') as CaseOutcome,
      closedAt: row.completedAt?.toISOString() ?? null,
      amountSatang: sumSatang(
        row.expenses.map((expense) => expense.grossSatang),
        'ค่าตอบแทนต่อเคส',
      ),
    }
  })

  const successItems = items.filter((item) => item.outcome === 'closed_success')
  const failItems = items.filter((item) => item.outcome === 'closed_fail')

  return {
    month: query.month ?? null,
    successCount: successItems.length,
    failCount: failItems.length,
    commissionSatang: sumSatang(successItems.map((item) => item.amountSatang), 'ค่าคอมมิชชั่นรวม'),
    noSuccessFeeSatang: sumSatang(failItems.map((item) => item.amountSatang), 'เบี้ยเสี่ยงรวม'),
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
