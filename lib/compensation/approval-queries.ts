import { PERMANENT_REJECT_EXPENSE_TYPE_SET } from '@/lib/compensation/approval-ui'
import { assertPeriodOpenAt } from '@/lib/accounting/period-guard'
import { emitAudit } from '@/lib/audit/audit'
import { hasCapability, type CapabilityHolder } from '@/lib/auth/permission'
import type { RequestMeta } from '@/lib/auth/request-meta'
import { fmtSatang } from '@/lib/format/money'
import { fmtDate } from '@/lib/format/datetime'
import { hotelNightsCapText, receiptInCompanyNameText } from '@/lib/field/hotel-claim'
import type { SessionUser } from '@/lib/auth/types'
import {
  appendApprovalHistory,
  approversInCurrentRound,
  approverStampFor,
  assertActorCanApproveStep,
  buildRejectExpenseUpdate,
  canActOnApprovalStep,
  canPermanentlyRejectStep,
  permanentRejectStep,
  isApprovalItemVisibleTo,
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
import { approvalWhtPreview, type ApprovalWhtPreview } from '@/lib/compensation/approval-wht'
import { resolvePayoutSide } from '@/lib/payout/payout'
import { resolveWhtPolicyForPayout } from '@/lib/settings/queries/wht-policy'
import type { WhtPolicyValues } from '@/lib/settings/wht-policy'
import type { PayeeTaxProfileValues } from '@/lib/finance/wht-calc'
import { loadTaxProfileDefaults } from '@/lib/settings/queries/tax-profile-defaults'
import {
  TAX_PROFILE_DEFAULT_SLOTS,
  emptyTaxProfileDefaults,
  pickTaxProfileDefault,
  type TaxProfileDefaults,
} from '@/lib/settings/tax-profile-defaults'
import { Prisma } from '@/lib/generated/prisma/client'
import type { ExpenseStatus } from '@/lib/generated/prisma/enums'
import { notifyExpensesAwaitingApproval } from '@/lib/notifications/approval-queue'
import { dispatchNotification } from '@/lib/notifications/dispatch'
import { expenseApprovedMessage, expenseRejectedMessage } from '@/lib/notifications/messages'
import { prisma } from '@/lib/prisma'
import {
  assertExpenseSubstituteReceiptSigned,
  substituteReceiptRefOf,
  substituteReceiptsRelationSelect,
} from '@/lib/substitute-receipts/queries'
import { SettingsError } from '@/lib/settings/errors'
import type { WhtBasis } from '@/lib/settings/tax-profile'
import { autoApproveCaseEvidence } from '@/lib/field/evidence-approval'
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
  hotelNights: true,
  receiptInCompanyName: true,
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
      hotelMaxPerNightSatang: true,
    },
  },
  approvalMatrix: {
    select: { id: true, condition: true, approvalFlow: true, enforceSegregationOfDuties: true },
  },
  payee: {
    select: {
      id: true,
      /** ผู้ใช้เจ้าของ Payee — ปลายทางของการแจ้งเตือนผลอนุมัติ/ตีกลับ (`90` §6.3 แถว 6) */
      userId: true,
      isVerified: true,
      user: {
        select: { fullName: true, team: { select: { side: true } }, role: { select: { roleGroup: true } } },
      },
      taxProfile: { select: { whtPct: true, whtBasis: true, whtMinThresholdSatang: true } },
      // BUG-176 — ปัจจัย WHT ชุดเดียวกับตอนสร้างรอบจ่าย (ประเภทเงินได้ · อัตรา 40(2) · เงื่อนไขการหัก)
      wht402Pct: true,
      whtCondition: true,
      payeeType: true,
    },
  },
  /** BUG-176 — รายการเข้ารอบจ่ายแล้ว ⇒ แสดงยอดที่บันทึกในรอบ (คัดตัวที่ตรง `payoutBatchItemId`) */
  payoutBatchItemId: true,
  payoutItems: {
    select: { id: true, whtSatang: true, netSatang: true, whtPctSnapshot: true, whtCondition: true },
  },
  case: { select: { id: true, caseRef: true, debtorName: true } },
  assignment: { select: { teamId: true, agent: { select: { fullName: true } } } },
  /** snapshot การกระจายรายวัน — ฐานคิด "อัตรา/วัน ÷ จำนวนเคส (วันที่)" ของแถวรายวัน (มติ PO U1 · BUG-095) */
  fieldDaySettlement: {
    select: { fieldDate: true, caseCount: true, fuelTotalSatang: true, allowanceTotalSatang: true },
  },
  /** มติ PO U103 — ป้าย "ใบรับรองแทนใบเสร็จ CRT-…" บนคิวอนุมัติ */
  substituteReceipts: substituteReceiptsRelationSelect,
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

/**
 * แสดงเงินในข้อความ "ฐานคิด" — ใช้ util กลางตัวเดียวกับทั้งระบบ (Rule 01)
 * ห้ามหาร 100 เองที่นี่: `fmtSatang()` หารแบบ integer-only + `assertSatang()` ดักค่าที่ไม่ใช่ satang ให้ด้วย
 */
const satangToBaht = (value: number): string => fmtSatang(value)

/**
 * ข้อความสรุป "สูตร/ฐานคิด" ที่ตารางแสดง (`16` §8 — เช่น "128.50 กม. × 3.50 บาท/กม.")
 * — อ่านจาก **snapshot ของรายการ** เท่านั้น ไม่ย้อนไปคำนวณจากแผนปัจจุบัน (`92` §7.1)
 */
export function describeExpenseBasis(row: {
  expenseType: ExpenseRow['expenseType']
  grossSatang: number
  distanceKm: Prisma.Decimal | null
  /** จำนวนคืนของใบเบิกค่าที่พัก (มติ PO O50) — ไม่ส่ง = 1 */
  hotelNights?: number
  /** ใบเสร็จค่าที่พักออกในนามบริษัท (มติ PO U96 #14) — ไม่ส่ง = ไม่แสดงป้าย */
  receiptInCompanyName?: boolean
  compPlan: {
    fuelRatePerKmSatang: number | null
    fuelDailyFlatSatang: number | null
    allowanceSatang: number | null
    /** เพดานค่าที่พักต่อคืนที่ snapshot ตอนเบิก (มติ PO U89) — ไม่ส่ง/`null` = ไม่จำกัด */
    hotelMaxPerNightSatang?: number | null
  } | null
  /** แถวรายวัน (ผูก `field_day_settlement_id`) — ใช้ snapshot ของวันนั้น ไม่ใช่แผนปัจจุบัน */
  fieldDaySettlement?: {
    fieldDate: Date
    caseCount: number
    fuelTotalSatang: number
    allowanceTotalSatang: number
  } | null
}): string {
  // มติ PO U1 (BUG-095): แถวรายวันแสดง "อัตรา/วัน ÷ จำนวนเคสของวันนั้น (วันที่) = ยอด"
  const settlement = row.fieldDaySettlement
  if (settlement && (row.expenseType === 'fuel' || row.expenseType === 'allowance')) {
    const dailySatang = row.expenseType === 'fuel' ? settlement.fuelTotalSatang : settlement.allowanceTotalSatang
    return `${satangToBaht(dailySatang)} บาท/วัน ÷ ${settlement.caseCount} เคส (${fmtDate(settlement.fieldDate)}) = ${satangToBaht(row.grossSatang)}`
  }
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
  if (row.expenseType === 'hotel') {
    // มติ PO O50 — "2 คืน · เพดาน ฿1,600.00" (เพดาน = อัตรา/คืน × จำนวนคืนจาก snapshot แผนของใบเบิก)
    const nights = row.hotelNights ?? 1
    const maxPerNight = row.compPlan?.hotelMaxPerNightSatang ?? null
    // มติ PO U96 #14 — ผู้อนุมัติเห็นว่าใบเสร็จออกในนามบริษัทหรือไม่ (ประกอบการพิจารณาเท่านั้น)
    const receiptLabel =
      row.receiptInCompanyName === undefined ? '' : ` · ${receiptInCompanyNameText(row.receiptInCompanyName)}`
    if (maxPerNight !== null || nights > 1) {
      return `${satangToBaht(row.grossSatang)} บาท (${hotelNightsCapText(nights, maxPerNight)})${receiptLabel}`
    }
    return `${satangToBaht(row.grossSatang)} บาท${receiptLabel}`
  }
  return `${satangToBaht(row.grossSatang)} บาท`
}

// ── DTO ─────────────────────────────────────────────────────────────────────

/** ค่าตั้ง WHT + Tax Profile ค่าเริ่มต้นตามประเภทผู้รับ (มติ PO U121) ที่มีผล ณ ตอนนี้ — ชุดเดียวกับที่รอบจ่ายใช้ */
interface ApprovalWhtSettings {
  policy: WhtPolicyValues
  typeDefaults: TaxProfileDefaults<PayeeTaxProfileValues>
}

/** ตัวเดียวกับที่รอบจ่ายใช้ (`resolveWhtPolicyForPayout()` + `loadTaxProfileDefaults()`) */
async function currentWhtPolicy(organizationId: string): Promise<ApprovalWhtSettings> {
  const [policy, defaults] = await Promise.all([
    resolveWhtPolicyForPayout(organizationId, new Date()),
    loadTaxProfileDefaults(organizationId),
  ])
  const typeDefaults = emptyTaxProfileDefaults<PayeeTaxProfileValues>()
  for (const slot of TAX_PROFILE_DEFAULT_SLOTS) typeDefaults[slot] = defaults.profiles[slot]?.values ?? null
  return { policy: policy.values, typeDefaults }
}

function whtOf(row: ExpenseRow, settings: ApprovalWhtSettings): ApprovalWhtPreview {
  const payoutItem =
    row.payoutBatchItemId === null ? undefined : row.payoutItems.find((item) => item.id === row.payoutBatchItemId)
  const side = resolvePayoutSide({
    teamSide: row.payee.user.team?.side ?? null,
    roleGroup: row.payee.user.role.roleGroup,
  })
  return approvalWhtPreview({
    grossSatang: row.grossSatang,
    expenseType: row.expenseType,
    planWhtPct: row.compPlan?.whtPct.toNumber() ?? null,
    payee: {
      taxProfile:
        row.payee.taxProfile === null
          ? null
          : {
              whtPct: row.payee.taxProfile.whtPct.toNumber(),
              whtBasis: row.payee.taxProfile.whtBasis as WhtBasis,
              whtMinThresholdSatang: row.payee.taxProfile.whtMinThresholdSatang,
            },
      wht402Pct: row.payee.wht402Pct === null ? null : row.payee.wht402Pct.toNumber(),
      whtCondition: row.payee.whtCondition,
      payeeType: row.payee.payeeType,
      side,
      typeDefaultTaxProfile: pickTaxProfileDefault(settings.typeDefaults, side, row.payee.payeeType),
    },
    policy: settings.policy,
    payoutItem:
      payoutItem === undefined
        ? null
        : {
            whtSatang: payoutItem.whtSatang,
            netSatang: payoutItem.netSatang,
            whtPctSnapshot: payoutItem.whtPctSnapshot === null ? null : payoutItem.whtPctSnapshot.toNumber(),
            whtCondition: payoutItem.whtCondition,
          },
  })
}

function toDto(
  row: ExpenseRow,
  flow: ResolvedFlow,
  viewer: CapabilityHolder,
  policy: ApprovalWhtSettings,
): CompensationApprovalDto {
  const pendingStep = row.status === 'approved' ? null : row.approvalStepCurrent
  const pendingStepRole = pendingStep === null ? null : (flow.steps[pendingStep - 1] ?? null)

  // `22` §6.9 · `18` §6.3 — **Payee ชนะ Plan** + ฐาน/ประเภทเงินได้/เงื่อนไขการหัก ผ่านตัวคำนวณเดียวกับรอบจ่าย (BUG-176)
  const wht = whtOf(row, policy)

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
    receiptInCompanyName: row.expenseType === 'hotel' ? row.receiptInCompanyName : null,
    grossSatang: row.grossSatang,
    whtSatang: wht.whtSatang,
    netSatang: wht.netSatang,
    whtPctUsed: wht.whtPctUsed,
    whtRateSource: wht.whtRateSource,
    whtWarning: wht.whtWarning,
    whtPayerBorne: wht.whtPayerBorne,
    whtFromPayout: wht.whtFromPayout,
    status: row.status,
    approvalStepCurrent: row.approvalStepCurrent,
    approvalStepTotal: flow.totalSteps,
    pendingStepRole,
    approvalHistory: parseApprovalHistory(row.approvalHistory),
    viewerCanAct: canActOnApprovalStep(viewer, {
      status: row.status,
      approvalStepCurrent: row.approvalStepCurrent,
      steps: flow.steps,
    }),
    viewerCanRejectPermanently:
      PERMANENT_REJECT_EXPENSE_TYPE_SET.has(row.expenseType) &&
      canPermanentlyRejectStep(viewer, {
        status: row.status,
        approvalStepCurrent: row.approvalStepCurrent,
        steps: flow.steps,
        history: parseApprovalHistory(row.approvalHistory),
      }),
    rejectReason: row.rejectionReason,
    substituteReceipt: substituteReceiptRefOf(row.substituteReceipts),
    createdAt: row.createdAt.toISOString(),
  }
}

// ── GET /api/compensation (`16` §14) ────────────────────────────────────────

/**
 * `16` §10 — ผู้อนุมัติขั้น Manager เห็นเฉพาะทีมที่ตนดูแล (`team_managers` → `user.scope.teamIds`)
 * · ผู้ถือสิทธิ์ขั้นการเงิน/บริหารเห็นทั้งองค์กร · scope แยกจาก filter ของผู้เรียกด้วย `AND` เสมอ
 *
 * ทีมของรายการ:
 * - รายการผูกงาน (`assignment_id` ไม่ว่าง) = ทีมของงานนั้น (`case_assignments.team_id`)
 * - รายการ **ไม่ผูกงาน** (ค่าที่พัก / Manual Claim / เบิกส่วนเกินจากเงินทดรอง) = **ทีมของพนักงานผู้เบิก**
 *   (`payee → user → team_id`) — มติ PO 03/10/2569 (UAT R6-B) · เดิมกรองด้วย `assignment.teamId`
 *   อย่างเดียว ⇒ รายการไม่ผูกเคสหลุดจากทุกคิวขั้น 1 (ผู้จัดการไม่เห็น/กดได้ `EXPENSE_NOT_FOUND`)
 * - ⚠️ ใช้ทีมของผู้เบิก **เฉพาะเมื่อไม่มีงาน** — รายการผูกงานยังยึดทีมของงานเสมอ (พนักงานย้ายทีม
 *   ภายหลังไม่ทำให้ผู้จัดการทีมใหม่เห็นค่าตอบแทนของงานเก่า)
 */
function scopeFilter(user: SessionUser): Prisma.ExpenseWhereInput {
  if (user.isSuperadmin) return {}
  if (
    hasCapability(user, 'view', 'approve_expense_finance') ||
    hasCapability(user, 'view', 'approve_expense_executive')
  ) {
    return {}
  }
  const teamIds = [...user.scope.teamIds]
  return {
    OR: [
      { assignment: { teamId: { in: teamIds } } },
      { assignmentId: null, payee: { user: { teamId: { in: teamIds } } } },
    ],
  }
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

  const [candidates, policy] = await Promise.all([
    loadMatrixCandidates(user.organizationId),
    currentWhtPolicy(user.organizationId),
  ])
  // `16` §10 — ผู้อนุมัติขั้น N เห็นเฉพาะรายการที่ถึงขั้นของตน (UAT R6-7) · กรองหลังรู้สายของแต่ละรายการ
  // (สาย snapshot/คาดการณ์ต่างกันรายแถว จึงกรองใน SQL ตรง ๆ ไม่ได้)
  return rows.flatMap((row) => {
    const flow = flowOf(row, candidates)
    const visible = isApprovalItemVisibleTo(user, {
      status: row.status,
      approvalStepCurrent: row.approvalStepCurrent,
      steps: flow.steps,
    })
    return visible ? [toDto(row, flow, user, policy)] : []
  })
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
    // มติ PO U103 — ใบเบิกที่ใช้ใบรับรองแทนใบเสร็จต้องอัปโหลดฉบับเซ็นแล้วก่อนอนุมัติ (ทุกขั้น)
    await assertExpenseSubstituteReceiptSigned(tx, expenseId)

    // ยาม optimistic (Final Test ด่าน 6) — สถานะถูกอ่าน **นอก** transaction จึงต้องยืนยันอีกครั้ง
    // ตอนเขียน ไม่งั้นคนที่กดทีหลังทับผลของคนแรก (เช่น "ปฏิเสธ" ถูกพลิกกลับเป็น "อนุมัติ"
    // แล้ว `tryCreateRevenue()` ยิงต่อ · หรือประทับตราผู้อนุมัติของคนแรกหายไป)
    const claimed = await tx.expense.updateMany({
      where: { id: expenseId, status: current.status, approvalStepCurrent: current.approvalStepCurrent },
      data: { updatedBy: user.id },
    })
    if (claimed.count === 0) {
      throw new ExpenseStateError('EXPENSE_INVALID_STATUS', {
        detail: `expense=${expenseId} ถูกเปลี่ยนสถานะโดยผู้ใช้อื่นระหว่างทาง`,
      })
    }

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

    // หลักฐานปิดงานของเคสไม่สำเร็จผ่านอัตโนมัติเมื่อค่าตอบแทนอนุมัติครบขั้น (มติ PO 03/10/2569 — UAT Q14)
    // ฟังก์ชันเช็ค outcome เอง — เคสสำเร็จไม่ผ่านที่นี่ (รอคลังรับเข้า)
    const evidenceApprovedId =
      progress.isComplete && row.caseId !== null
        ? await autoApproveCaseEvidence(tx as WarehouseTxClient, {
            organizationId: user.organizationId,
            caseId: row.caseId,
            trigger: 'expense_approved',
            actorId: user.id,
            actorRole: user.roleName,
          })
        : null

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
          evidence_approved_id: evidenceApprovedId,
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

  // มติ PO U29 — ผ่านขั้นกลาง ⇒ แจ้งผู้อนุมัติขั้นถัดไปทันที (ผู้อนุมัติขั้นนี้ถูกตัดออกถ้าบังคับแบ่งแยกหน้าที่)
  if (!progress.isComplete) notifyExpensesAwaitingApproval(user.organizationId, [expenseId])

  // `90` §6.3 แถว 6 — แจ้งผู้รับเงินเมื่อผ่าน**ครบทุกขั้น**เท่านั้น (ขั้นกลางไม่ใช่ผลลัพธ์ของเขา)
  if (progress.isComplete) {
    dispatchNotification(
      { organizationId: user.organizationId, userIds: [outcome.row.payee.userId] },
      expenseApprovedMessage({
        grossSatang: outcome.row.grossSatang,
        caseRef: outcome.row.case?.caseRef ?? null,
      }),
    )
  }

  return {
    expense: toDto(outcome.row, { ...flow, projected: false }, user, await currentWhtPolicy(user.organizationId)),
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
  return rejectExpenseWith(context, expenseId, input, 'reject_expense')
}

/**
 * `PATCH /api/claims/:id/reject-permanent` (มติ PO U117 ข้อ 3) — `reject_permanent` ของ `23` §6.3
 * (`pending_approval → rejected` terminal · ผู้เบิกส่งใหม่ไม่ได้) · เหตุผลบังคับ · ยามสิทธิ์/scope/ขั้นชุดเดียวกับการตีกลับ
 * · เฉพาะใบเบิกค่าที่พัก · ใบรับรองแทนใบเสร็จที่ผูกอยู่ไม่นับเพดานต่อเดือนอีก (กติกา `rejected` ไม่นับ — O68)
 */
export async function rejectExpensePermanently(
  context: ApprovalMutationContext,
  expenseId: string,
  input: CompensationRejectInput,
): Promise<RejectResult> {
  return rejectExpenseWith(context, expenseId, input, 'reject_permanent')
}

async function rejectExpenseWith(
  context: ApprovalMutationContext,
  expenseId: string,
  input: CompensationRejectInput,
  action: 'reject_expense' | 'reject_permanent',
): Promise<RejectResult> {
  const user = context.actor
  const reason = assertRejectReason(input.reason)
  const current = await findExpense(user, expenseId)
  if (action === 'reject_permanent' && !PERMANENT_REJECT_EXPENSE_TYPE_SET.has(current.expenseType)) {
    throw new ExpenseStateError('EXPENSE_INVALID_STATUS', {
      context: { status: current.status, action, expenseType: current.expenseType },
      detail: `expense=${expenseId} reject_permanent ทำได้เฉพาะใบเบิกค่าที่พัก`,
    })
  }
  const nextStatus = nextExpenseStatus(current.status, action)

  await assertPeriodOpenAt({
    organizationId: user.organizationId,
    at: current.expenseDate,
    targetType: TARGET,
    targetId: expenseId,
  })

  const flow = flowOrNull(current, await loadMatrixCandidates(user.organizationId))
  const history = parseApprovalHistory(current.approvalHistory)
  // U118 — ปฏิเสธถาวรใบที่ "ต้องแก้ไข" ใช้สิทธิ์ของขั้นที่ตีกลับมา · สถานะอื่น = ขั้นที่รออยู่ (เหมือนตีกลับ)
  const guardStep =
    action === 'reject_permanent'
      ? permanentRejectStep({ status: current.status, approvalStepCurrent: current.approvalStepCurrent, history })
      : current.approvalStepCurrent
  const stepRole = flow === null ? null : stepRoleOf(flow, guardStep)
  if (stepRole !== null) assertActorCanApproveStep(user, stepRole)
  // (ยามชุดเดียวกันถูกห่อไว้ที่ `assertCanRejectExpense()` ให้ทางเข้าฝั่ง field เรียกใช้)

  const at = new Date()
  const update = buildRejectExpenseUpdate({
    status: nextStatus,
    history,
    rejectedStep: guardStep,
    actorId: user.id,
    actorRole: user.roleName,
    reason,
    at,
  })

  const updated = await prisma.$transaction(async (tx) => {
    // ยาม optimistic (Final Test ด่าน 6) — สถานะถูกอ่าน **นอก** transaction จึงต้องยืนยันอีกครั้ง
    // ตอนเขียน ไม่งั้นคนที่กดทีหลังทับผลของคนแรก (เช่น "ปฏิเสธ" ถูกพลิกกลับเป็น "อนุมัติ"
    // แล้ว `tryCreateRevenue()` ยิงต่อ · หรือประทับตราผู้อนุมัติของคนแรกหายไป)
    const claimed = await tx.expense.updateMany({
      where: { id: expenseId, status: current.status, approvalStepCurrent: current.approvalStepCurrent },
      data: { updatedBy: user.id },
    })
    if (claimed.count === 0) {
      throw new ExpenseStateError('EXPENSE_INVALID_STATUS', {
        detail: `expense=${expenseId} ถูกเปลี่ยนสถานะโดยผู้ใช้อื่นระหว่างทาง`,
      })
    }

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
          rejected_at_step: guardStep,
          step_role: stepRole,
          rejection_reason: reason,
          ...(action === 'reject_permanent' ? { permanent: true } : {}),
          // ไม่แตะ `assignment_status` ของเคส (`41` §10.1)
          events: ['expense.rejected'],
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

  // `90` §6.3 แถว 6 — ตีกลับแล้วผู้เบิกต้องแก้เอง ⇒ ต้องรู้ทันทีพร้อมเหตุผล
  dispatchNotification(
    { organizationId: user.organizationId, userIds: [updated.payee.userId] },
    expenseRejectedMessage({
      grossSatang: updated.grossSatang,
      reason,
      caseBound: updated.assignmentId !== null,
      permanent: action === 'reject_permanent',
    }),
  )

  return {
    expense: toDto(updated, flow ?? fallbackFlow(updated), user, await currentWhtPolicy(user.organizationId)),
    events: ['expense.rejected'],
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
