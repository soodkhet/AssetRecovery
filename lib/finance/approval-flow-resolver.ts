import { FinanceError } from '@/lib/finance/errors'
import { assertNonNegativeSatang } from '@/lib/finance/satang'
import { sortApprovalMatrices } from '@/lib/settings/approval-matrix'
import { SettingsError } from '@/lib/settings/errors'

/**
 * สายการอนุมัติของรายการเบิก: Approval Matrix → รายการขั้นที่ต้องผ่าน (`16` §6.1/§9 · `13` §6.2)
 * — **pure ล้วน ไม่มี I/O**
 *
 * `13` §6.2 ดูแล "ความถูกต้องของตัวตั้งค่า" (รูปร่าง flow/เพดาน) อยู่แล้วที่ `lib/settings/approval-matrix.ts`
 * ไฟล์นี้คือส่วนที่ `13` จงใจไม่ทำ: **จับคู่รายการหนึ่ง ๆ เข้ากับสาย** แล้วบอกว่าต้องผ่านกี่ขั้น ขั้นไหนบ้าง
 *
 * กติกาการเลือกสาย (`16` §6.1): เลือกสายที่ **เพดานต่ำสุดที่ยังครอบยอดนี้ได้** (`amount <= threshold`)
 * · สายที่ `threshold = null` = สายไม่อ้างเพดาน ใช้เป็นสายสุดท้าย (กรณียอดเกินทุกเพดาน)
 * · ไม่มีสายไหนครอบเลย ⇒ `APPROVAL_MATRIX_NOT_FOUND` (ตั้งค่าไม่ครบ ห้ามเดาสายให้เอง)
 */

export interface ApprovalMatrixCandidate {
  id: string
  condition: string
  /** เพดานเงินของเงื่อนไขนี้ (สตางค์) — `null` = ไม่อ้างเพดาน */
  conditionThresholdSatang: number | null
  /** ลำดับ role ที่ต้องอนุมัติ — ลำดับมีความหมาย */
  approvalFlow: string[]
  enforceSegregationOfDuties: boolean
}

export interface ApprovalStep {
  /** เริ่มที่ 1 ตาม `expenses.approval_step_current` (`16` §7) */
  step: number
  role: string
}

export interface ResolvedApprovalFlow {
  matrixId: string
  condition: string
  steps: ApprovalStep[]
  /** = `steps.length` ⇒ ลง `approval_step_total` */
  totalSteps: number
  enforceSegregationOfDuties: boolean
}

/** `16` §6.1 — จับคู่ยอดเงินกับสายอนุมัติ แล้วกางเป็นรายการขั้น */
export function resolveApprovalFlow(
  amountSatang: number,
  matrices: readonly ApprovalMatrixCandidate[],
): ResolvedApprovalFlow {
  assertNonNegativeSatang(amountSatang, 'ยอดรายการที่ขออนุมัติ')

  const candidate = sortApprovalMatrices(matrices).find(
    (matrix) =>
      matrix.approvalFlow.length > 0 &&
      (matrix.conditionThresholdSatang === null || amountSatang <= matrix.conditionThresholdSatang),
  )

  if (candidate === undefined) {
    throw new SettingsError('APPROVAL_MATRIX_NOT_FOUND', {
      detail: `ไม่มีสายอนุมัติที่ครอบยอด ${amountSatang} สตางค์`,
      context: { amountSatang },
    })
  }

  return {
    matrixId: candidate.id,
    condition: candidate.condition,
    steps: candidate.approvalFlow.map((role, index) => ({ step: index + 1, role })),
    totalSteps: candidate.approvalFlow.length,
    enforceSegregationOfDuties: candidate.enforceSegregationOfDuties,
  }
}

export interface ApprovalProgress {
  /** ขั้นถัดไปที่รออนุมัติ — `null` เมื่อผ่านครบทุกขั้นแล้ว */
  nextStep: number | null
  /** true = ผ่านครบทุกขั้น ⇒ รายการเปลี่ยนเป็น `approved` สมบูรณ์ (`16` §9) */
  isComplete: boolean
}

/** ผ่าน 1 ขั้น → ขั้นถัดไป (หรือจบสาย) — `16` §9 */
export function advanceApprovalStep(currentStep: number, totalSteps: number): ApprovalProgress {
  assertStepShape(currentStep, totalSteps)
  const nextStep = currentStep + 1
  return nextStep > totalSteps ? { nextStep: null, isComplete: true } : { nextStep, isComplete: false }
}

/**
 * ตีกลับ = **กลับไปเริ่มขั้น 1 เสมอ** ไม่ resume จากขั้นที่ตีกลับ (`16` §9 — เผื่อการแก้ไขกระทบยอด
 * ที่ขั้นก่อนหน้าอนุมัติไปแล้ว) · Rule 04 บังคับให้มีเทสต์ข้อนี้
 */
export const APPROVAL_FIRST_STEP = 1

export function resetApprovalToFirstStep(): number {
  return APPROVAL_FIRST_STEP
}

/** `24` §6.4 `APPROVAL_STEP_OUT_OF_ORDER` — อนุมัติขั้นที่ยังไม่ถึงตา (`16` §10) */
export function assertApprovalStepInOrder(input: { requestedStep: number; currentStep: number; totalSteps: number }): void {
  assertStepShape(input.currentStep, input.totalSteps)
  if (input.requestedStep !== input.currentStep) {
    throw new FinanceError('APPROVAL_STEP_OUT_OF_ORDER', {
      detail: `requested=${input.requestedStep} current=${input.currentStep}`,
      context: { requestedStep: input.requestedStep, currentStep: input.currentStep },
    })
  }
}

/**
 * `24` §6.4 `SEGREGATION_OF_DUTIES_VIOLATION` — คนเดิมอนุมัติซ้ำสองขั้นในรายการเดียวกัน
 * บังคับเฉพาะเมื่อสายนั้นตั้ง `enforce_segregation_of_duties = true` (ค่าเริ่มต้น `false` เพื่อทีมเล็ก — `16` §10)
 */
export function assertNoDuplicateApprover(input: {
  enforceSegregationOfDuties: boolean
  approverId: string
  previousApproverIds: readonly string[]
}): void {
  if (!input.enforceSegregationOfDuties) return
  if (!input.previousApproverIds.includes(input.approverId)) return
  throw new FinanceError('SEGREGATION_OF_DUTIES_VIOLATION', {
    detail: `approver=${input.approverId}`,
  })
}

function assertStepShape(currentStep: number, totalSteps: number): void {
  if (!Number.isInteger(currentStep) || !Number.isInteger(totalSteps)) {
    throw new RangeError('ขั้นอนุมัติต้องเป็นจำนวนเต็ม')
  }
  if (totalSteps < 1) throw new RangeError('สายอนุมัติต้องมีอย่างน้อย 1 ขั้น')
  if (currentStep < APPROVAL_FIRST_STEP || currentStep > totalSteps) {
    throw new RangeError(`ขั้นอนุมัติปัจจุบันต้องอยู่ระหว่าง 1-${totalSteps} (ได้ ${currentStep})`)
  }
}
