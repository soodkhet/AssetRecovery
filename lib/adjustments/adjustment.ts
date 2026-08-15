import { hasCapability, type CapabilityHolder } from '@/lib/auth/permission'
import { AdjustmentError } from '@/lib/adjustments/errors'
import {
  adjustmentApprovalPolicyFor,
  EXECUTIVE_ROLE,
  FINANCE_ROLE,
} from '@/lib/finance/adjustment-approval-policy'
import { FinanceError } from '@/lib/finance/errors'
import { assertSatang } from '@/lib/finance/satang'
import { toBangkokParts } from '@/lib/format/datetime'
import { BUDDHIST_YEAR_OFFSET } from '@/lib/constants'
import type { AccountingPeriodStatus, AdjustmentStatus, AdjustmentType } from '@/lib/generated/prisma/enums'

/**
 * กติกาของรายการปรับปรุง (ไฟล์ 20) — **pure ล้วน ไม่มี I/O** ใช้ร่วม FE/BE
 *
 * ### สิ่งที่ **ไม่ได้** อยู่ที่นี่ (ห้ามเขียนซ้ำ)
 * - ระดับผู้อนุมัติตามสถานะรอบ → `lib/finance/adjustment-approval-policy.ts` (3.1 · `20` §6.2)
 * - นโยบาย Period Lock → `lib/settings/period-lock.ts` (1.10 · `13` §6.11)
 * - "รายได้ใบนี้ยังแก้ตรงได้ไหม" → `assertRevenueAmountEditable()` (3.6 · `19` §10)
 *
 * ### หลักการที่ห้ามหลุด (`20` §6.1)
 * Adjustment **ไม่แก้ของเดิม** — เก็บ `amount_satang` เป็นค่าบวกเสมอ ทิศทางอยู่ที่
 * `adjustment_type` แล้วให้รายงานเอาไปบวก/ลบตอนแสดงผล (`signedAdjustmentSatang()`)
 */

export const ADJUSTMENT_TARGET_TYPES = ['revenue', 'expense', 'billing_batch', 'payout_batch'] as const
export type AdjustmentTargetType = (typeof ADJUSTMENT_TARGET_TYPES)[number]

export const ADJUSTMENT_TARGET_LABEL: Readonly<Record<AdjustmentTargetType, string>> = {
  revenue: 'รายได้ (Revenue)',
  expense: 'ค่าใช้จ่าย (Expense/Claim)',
  billing_batch: 'รอบวางบิล (Billing Batch)',
  payout_batch: 'รอบจ่ายเงิน (Payout Batch)',
}

export const ADJUSTMENT_TYPE_LABEL: Readonly<Record<AdjustmentType, string>> = {
  increase: 'เพิ่มยอด',
  decrease: 'ลดยอด',
}

// ── capability (`25` §7.4 · `02` §12) ───────────────────────────────────────

export const CREATE_ADJUSTMENT = 'create_adjustment'
export const APPROVE_ADJUSTMENT = 'approve_adjustment'
/** 🔒 1 ใน 9 รายการที่ล็อกไว้กับผู้บริหาร (`lib/roles/capability-locks.ts`) */
export const APPROVE_ADJUSTMENT_LOCKED = 'approve_adjustment_locked'

/** ประตูชั้นแรกของ endpoint อ่าน — ใครที่มีส่วนในสาย Adjustment เห็นรายการได้ */
export const ADJUSTMENT_READ_CAPABILITIES = [
  CREATE_ADJUSTMENT,
  APPROVE_ADJUSTMENT,
  APPROVE_ADJUSTMENT_LOCKED,
] as const

/**
 * capability ที่ผู้อนุมัติต้องถือ **จริง ๆ** ตามสถานะรอบที่ snapshot ไว้ (`25` §7.4)
 * — รอบ `locked` ใช้ capability คนละตัวที่ล็อกไว้กับผู้บริหารเท่านั้น
 */
export function approvalCapabilityFor(periodStatus: AccountingPeriodStatus | null): string {
  return periodStatus === 'locked' ? APPROVE_ADJUSTMENT_LOCKED : APPROVE_ADJUSTMENT
}

/**
 * `20` §10/§12 · §16 — ผู้อนุมัติต้องถือ capability **ของระดับนั้นโดยเฉพาะ**
 * (ถือ `approve_adjustment` ไม่ได้แปลว่าอนุมัติรายการของรอบ `locked` แทนผู้บริหารได้)
 *
 * ⚠️ code ที่ผู้ใช้ได้คือ **`INSUFFICIENT_APPROVAL_LEVEL`** ตาม `20` §11/§16 + `24` §6.7
 *    ("อนุมัติ Adjustment ของรายการ locked โดยไม่ใช่ Executive") ไม่ใช่ `PERMISSION_DENIED` ทั่วไป
 */
export function assertActorCanApproveAdjustment(
  actor: CapabilityHolder & { id: string },
  periodStatus: AccountingPeriodStatus | null,
): void {
  const capability = approvalCapabilityFor(periodStatus)
  if (!hasCapability(actor, 'manage', capability)) {
    throw new FinanceError('INSUFFICIENT_APPROVAL_LEVEL', {
      detail: `period_status=${periodStatus ?? 'collecting'} capability=${capability} actor=${actor.id}`,
      context: { requiredCapability: capability, periodStatus },
    })
  }
}

/**
 * บทบาทที่ผู้กดครั้งนี้ "นับให้" ในสายอนุมัติ — Superadmin นับครบทุกบทบาทที่ระดับนั้นต้องใช้
 * (DEC-009: Superadmin = manage ทุกอย่างโดยนิยาม ไม่มี record ใน `role_capabilities`)
 */
export function approverRolesOf(
  actor: { roleName: string; isSuperadmin: boolean },
  periodStatus: AccountingPeriodStatus | null,
): string[] {
  if (!actor.isSuperadmin) return [actor.roleName.trim()]
  return [...adjustmentApprovalPolicyFor(periodStatus).requiredRoles]
}

/** บทบาทของ Adjustment มีแค่ 2 ตัวตาม `20` §6.2 — ชื่อชุดเดียวกับ seed (`07` §5) */
export const ADJUSTMENT_APPROVER_ROLES = [FINANCE_ROLE, EXECUTIVE_ROLE] as const

// ── Polymorphic target (DEC-004 — separate FK + CHECK exactly-one) ──────────

export interface AdjustmentTargetColumns {
  revenueId: string | null
  expenseId: string | null
  billingBatchId: string | null
  payoutBatchId: string | null
}

const EMPTY_TARGET: AdjustmentTargetColumns = {
  revenueId: null,
  expenseId: null,
  billingBatchId: null,
  payoutBatchId: null,
}

/**
 * แปลง (ชนิดเป้าหมาย, id) → คอลัมน์ FK 4 ช่องที่มีค่าเดียว — **จุดเดียวของระบบ**
 * ที่ประกอบ target ของ `adjustments` (CHECK `adjustments_one_target` ระดับ DB คุมซ้ำอีกชั้น)
 */
export function adjustmentTargetColumns(
  targetType: AdjustmentTargetType,
  targetId: string,
): AdjustmentTargetColumns {
  switch (targetType) {
    case 'revenue':
      return { ...EMPTY_TARGET, revenueId: targetId }
    case 'expense':
      return { ...EMPTY_TARGET, expenseId: targetId }
    case 'billing_batch':
      return { ...EMPTY_TARGET, billingBatchId: targetId }
    case 'payout_batch':
      return { ...EMPTY_TARGET, payoutBatchId: targetId }
  }
}

/** อ่านกลับจากแถวในฐานข้อมูล — มากกว่า/น้อยกว่า 1 ช่อง = ข้อมูลผิดรูป (CHECK ควรกันไว้แล้ว) */
export function adjustmentTargetOf(row: AdjustmentTargetColumns): {
  targetType: AdjustmentTargetType
  targetId: string
} {
  const found = ([
    ['revenue', row.revenueId],
    ['expense', row.expenseId],
    ['billing_batch', row.billingBatchId],
    ['payout_batch', row.payoutBatchId],
  ] as const).filter(([, id]) => id !== null)

  if (found.length !== 1) {
    throw new RangeError(`adjustments: ต้องมีเป้าหมายเดียวเท่านั้น (พบ ${found.length} — DEC-004)`)
  }
  const [targetType, targetId] = found[0] as [AdjustmentTargetType, string]
  return { targetType, targetId }
}

// ── ยอดเงิน (`20` §7.1 — amount บวกเสมอ) ────────────────────────────────────

/** ทิศทางที่มีผลต่อยอดต้นทาง — `increase` = `+amount` · `decrease` = `−amount` */
export function signedAdjustmentSatang(type: AdjustmentType, amountSatang: number): number {
  assertSatang(amountSatang, 'ยอดปรับปรุง')
  if (amountSatang <= 0) throw new RangeError(`ยอดปรับปรุงต้องเป็นค่าบวกเสมอ (ได้ ${amountSatang})`)
  return type === 'increase' ? amountSatang : -amountSatang
}

/**
 * `20` §9 — "ยอดสุทธิของรายการต้นทาง = ยอดเดิม + Adjustment (แสดงผลรวมในรายงาน ไม่ใช่เขียนทับ)"
 * นับเฉพาะรายการที่ `approved` แล้วเท่านั้น (รออนุมัติ/ถูกปฏิเสธไม่มีผลต่อยอด)
 */
export function netAfterAdjustments(
  baseSatang: number,
  adjustments: readonly { adjustmentType: AdjustmentType; amountSatang: number; status: AdjustmentStatus }[],
): number {
  assertSatang(baseSatang, 'ยอดตั้งต้น')
  return adjustments
    .filter((row) => row.status === 'approved')
    .reduce((total, row) => total + signedAdjustmentSatang(row.adjustmentType, row.amountSatang), baseSatang)
}

// ── State machine (`23` §6.9) ───────────────────────────────────────────────

export const ADJUSTMENT_TRANSITIONS: Readonly<Record<AdjustmentStatus, readonly AdjustmentStatus[]>> = {
  pending_approval: ['approved', 'rejected'],
  approved: [],
  rejected: [],
}

export function canTransitionAdjustment(from: AdjustmentStatus, to: AdjustmentStatus): boolean {
  return ADJUSTMENT_TRANSITIONS[from].includes(to)
}

/** อนุมัติ/ปฏิเสธได้จาก `pending_approval` เท่านั้น — สองคนกดพร้อมกัน คนที่สองต้องโดนปฏิเสธ */
export function assertAdjustmentActionable(from: AdjustmentStatus, to: AdjustmentStatus): void {
  if (!canTransitionAdjustment(from, to)) {
    throw new AdjustmentError('ADJUSTMENT_INVALID_STATUS', { detail: `status=${from} → ${to}` })
  }
}

// ── Validation (`20` §11) ───────────────────────────────────────────────────

/** ความยาวขั้นต่ำเดียวกับ `reasonSchema` กลาง (`lib/api/validation.ts`) */
export const ADJUSTMENT_REASON_MIN = 5

/** §11 `REASON_REQUIRED` — "ห้ามสร้าง Adjustment โดยไม่ระบุ `reason`" (§10 ไม่มีข้อยกเว้น) */
export function assertAdjustmentReason(reason: string): string {
  const trimmed = reason.trim()
  if (trimmed.length < ADJUSTMENT_REASON_MIN) {
    throw new AdjustmentError('REASON_REQUIRED', { detail: `length=${trimmed.length}` })
  }
  return trimmed
}

/** §11 `REJECTION_REASON_REQUIRED` — ปฏิเสธเป็น terminal ต้องอธิบายเสมอ (`20` v2.1) */
export function assertRejectionReason(reason: string): string {
  const trimmed = reason.trim()
  if (trimmed.length < ADJUSTMENT_REASON_MIN) {
    throw new AdjustmentError('REJECTION_REASON_REQUIRED', { detail: `length=${trimmed.length}` })
  }
  return trimmed
}

// ── งวดบัญชีของรายการต้นทาง (`20` §7.1 `period_status_at_target`) ───────────

export interface PeriodKey {
  /** ปี **พ.ศ.** ตรงกับ `accounting_periods.year_be` */
  yearBe: number
  /** 1–12 */
  month: number
}

/** งวดบัญชีของ instant/วันที่ — ยึด **ปฏิทินไทย** เสมอ (Rule 01) */
export function periodKeyOf(date: Date): PeriodKey {
  const parts = toBangkokParts(date)
  if (parts === null) throw new RangeError('periodKeyOf: วันที่ไม่ถูกต้อง')
  return { yearBe: parts.year + BUDDHIST_YEAR_OFFSET, month: parts.month }
}

const PERIOD_STATUSES: readonly AccountingPeriodStatus[] = ['collecting', 'sent_to_accountant', 'locked']

/**
 * อ่าน snapshot ที่เก็บเป็น `TEXT` (`02` §8) กลับเป็น enum — ค่าที่ไม่รู้จัก/ว่าง ⇒ `null`
 * (`null` = ยังไม่มีงวดบัญชีของเดือนนั้น ซึ่งนโยบายถือเป็น `collecting` — `13` §6.11)
 */
export function parsePeriodStatusSnapshot(value: string | null): AccountingPeriodStatus | null {
  if (value === null) return null
  const found = PERIOD_STATUSES.find((status) => status === value)
  return found ?? null
}
