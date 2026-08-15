import { AccountingError } from '@/lib/accounting/errors'
import { periodKeyOf, type PeriodKey } from '@/lib/adjustments/adjustment'
import { BUDDHIST_YEAR_OFFSET } from '@/lib/constants'
import { MONTH_NAMES_TH } from '@/lib/field/calendar'
import type { AccountingPeriodStatus } from '@/lib/generated/prisma/enums'
import { periodLockPolicyFor } from '@/lib/settings/period-lock'

/**
 * กติกาของรอบบัญชี (ไฟล์ 30) — **pure ล้วน ไม่มี I/O** ใช้ร่วม FE/BE
 *
 * ### สิ่งที่ **ไม่ได้** อยู่ที่นี่ (ห้ามเขียนซ้ำ)
 * - นโยบายว่าสถานะไหนแก้ตรงได้แค่ไหน + interceptor → `lib/settings/period-lock.ts` (`13` §6.11)
 * - ระดับอนุมัติ Adjustment ตามสถานะรอบ → `lib/finance/adjustment-approval-policy.ts` (3.1)
 * - งวดบัญชีของ instant (`periodKeyOf`) → `lib/adjustments/adjustment.ts` (3.7)
 *
 * ### กติกาที่ห้ามหลุด
 * - `critical_count`/`warning_count` เป็น **derived** นับสดจากตาราง `exceptions` (`30` §7.1)
 *   — ห้ามสร้างคอลัมน์ใน `accounting_periods`
 * - Readiness Check **ห้าม force ข้าม** (`30` §10) ⇒ ไม่มีพารามิเตอร์ `force` ที่ไหนในโมดูลนี้
 */

/** capability (`25` §7.4) — บัญชี manage รอบบัญชี */
export const MANAGE_ACCOUNTING_PERIOD = 'manage_accounting_period'
/** 🔒 ล็อกกับผู้บริหาร (`25` §7.4 "✅ only") */
export const UNLOCK_PERIOD = 'unlock_period'

/** ผู้ที่เห็นรอบบัญชีได้ — บัญชี/การเงิน/ผู้บริหาร (`30` §12 "ดูภาพรวมทั้งหมด") */
export const PERIOD_READ_CAPABILITIES = [MANAGE_ACCOUNTING_PERIOD, UNLOCK_PERIOD] as const

export type { PeriodKey }
export { periodKeyOf }

// ── ป้ายชื่อรอบ (`30` §7.1 — "มิถุนายน 2569") ────────────────────────────────

/** ป้ายรอบบัญชี = เดือน**ไทย** + ปี **พ.ศ.** เสมอ (Rule 01) — รูปแบบเดียวกับ `billing_batches.period` */
export function periodLabelOf(key: PeriodKey): string {
  const name = MONTH_NAMES_TH[key.month - 1]
  if (name === undefined) throw new RangeError(`periodLabelOf: เดือนไม่ถูกต้อง (${key.month})`)
  return `${name} ${key.yearBe}`
}

/** งวดถัดไปตามปฏิทิน — ใช้ไล่สร้างรอบที่ยังไม่มีตั้งแต่เดือนแรกที่มีข้อมูลจนถึงเดือนปัจจุบัน */
export function nextPeriodKey(key: PeriodKey): PeriodKey {
  return key.month === 12 ? { yearBe: key.yearBe + 1, month: 1 } : { yearBe: key.yearBe, month: key.month + 1 }
}

/** ลำดับเวลาของงวด (ใช้เรียง/เทียบ) — ค่ามากกว่า = ใหม่กว่า */
export function periodOrdinal(key: PeriodKey): number {
  return key.yearBe * 12 + (key.month - 1)
}

/** ปี ค.ศ. ของงวด — ใช้คำนวณขอบเขตวันที่ของเดือนตามปฏิทินไทย */
export function periodYearCe(key: PeriodKey): number {
  return key.yearBe - BUDDHIST_YEAR_OFFSET
}

// ── State machine (`23` §6.13) ──────────────────────────────────────────────

/**
 * `collecting → sent_to_accountant` (ผ่าน Readiness Check) · `sent_to_accountant → locked` ·
 * `locked → sent_to_accountant` (ปลดล็อกชั่วคราว — ผู้บริหารเท่านั้น **ไม่กลับไป `collecting`** `30` §9)
 */
export const PERIOD_TRANSITIONS: Readonly<Record<AccountingPeriodStatus, readonly AccountingPeriodStatus[]>> = {
  collecting: ['sent_to_accountant'],
  sent_to_accountant: ['locked'],
  locked: ['sent_to_accountant'],
}

export function canTransitionPeriod(from: AccountingPeriodStatus, to: AccountingPeriodStatus): boolean {
  return PERIOD_TRANSITIONS[from].includes(to)
}

export function assertPeriodTransition(from: AccountingPeriodStatus, to: AccountingPeriodStatus): void {
  if (!canTransitionPeriod(from, to)) {
    throw new AccountingError('PERIOD_INVALID_STATUS', { detail: `status=${from} → ${to}` })
  }
}

/** ปลดล็อกรอบ `locked` ได้เฉพาะผู้บริหาร (`30` §10 · `13` §6.11 · `25` §7.4) */
export function assertUnlockAllowed(canUnlock: boolean): void {
  if (!canUnlock) throw new AccountingError('UNLOCK_REQUIRES_EXECUTIVE')
}

/** ป้ายสถานะรอบ — ข้อความเดียวกับตารางนโยบาย `13` §6.11 (ห้ามตั้งชุดใหม่) */
export function periodStatusLabel(status: AccountingPeriodStatus): string {
  return periodLockPolicyFor(status).statusLabel
}

// ── Readiness Check 3 เงื่อนไข (`30` §6.2) ───────────────────────────────────

export type ReadinessCheckKey = 'billing_revenue_sync' | 'bank_reconcile' | 'no_critical_exception'

export interface ReadinessCheck {
  key: ReadinessCheckKey
  label: string
  passed: boolean
  /** รายละเอียดที่ผู้ใช้อ่านแล้วรู้ว่าต้องไปแก้อะไร (`30` §8 — checklist ใน Modal) */
  detail: string
}

/** ยอดที่ไม่ตรงกันระหว่างรอบวางบิลกับรายได้ (`19` — เงื่อนไขที่ 3) */
export interface BillingRevenueMismatch {
  /** `null` = รายได้ที่ยังไม่ถูกวางบิลเลยในรอบนี้ */
  billingBatchId: string | null
  companyName: string
  batchTotalSatang: number
  revenueTotalSatang: number
  reason: 'not_billed' | 'total_mismatch'
}

export interface ReadinessInput {
  /** critical ที่ยัง `open` ของรอบนี้ (`34`) */
  criticalOpen: readonly { id: string; title: string; sourceModule: string }[]
  /** warning ที่ยัง `open` — ผ่านได้แต่ต้องแสดงเตือน (`30` §6.2) */
  warningOpenCount: number
  /** รายการเดินบัญชีที่ยัง `unmatched` ของรอบนี้ (`unmatched_resolved` ถือว่าเคลียร์แล้ว — `35`) */
  unmatchedBankCount: number
  billingMismatches: readonly BillingRevenueMismatch[]
}

export interface ReadinessResult {
  ready: boolean
  checks: readonly ReadinessCheck[]
  /** เตือนแต่ไม่บล็อก (`30` §6.2 — warning ผ่านได้) */
  warnings: readonly string[]
  criticalOpen: readonly { id: string; title: string; sourceModule: string }[]
  unmatchedBankCount: number
  billingMismatches: readonly BillingRevenueMismatch[]
}

/**
 * ประเมินความพร้อมปิดงวด — **pure** เพื่อให้เทสต์ยิงครบ 3 เงื่อนไขได้โดยไม่ต้องมี DB
 * เงื่อนไขทั้ง 3 เป็น blocker เท่ากันหมด (ไม่มีข้อไหน "ข้ามได้")
 */
export function evaluateReadiness(input: ReadinessInput): ReadinessResult {
  const billingPassed = input.billingMismatches.length === 0
  const reconcilePassed = input.unmatchedBankCount === 0
  const criticalPassed = input.criticalOpen.length === 0

  const checks: ReadinessCheck[] = [
    {
      key: 'billing_revenue_sync',
      label: 'ยอดวางบิลตรงกับรายได้ของรอบ',
      passed: billingPassed,
      detail: billingPassed
        ? 'รอบวางบิลทุกใบมียอดตรงกับรายได้ที่รวมอยู่ และไม่มีรายได้ค้างวางบิล'
        : `ยังไม่ตรง ${input.billingMismatches.length} รายการ`,
    },
    {
      key: 'bank_reconcile',
      label: 'กระทบยอดธนาคารครบ 100%',
      passed: reconcilePassed,
      detail: reconcilePassed
        ? 'ไม่มีรายการเดินบัญชีค้างจับคู่ในรอบนี้'
        : `ยังมีรายการที่ไม่จับคู่ ${input.unmatchedBankCount} รายการ`,
    },
    {
      key: 'no_critical_exception',
      label: 'ไม่มีข้อยกเว้นระดับวิกฤตที่เปิดอยู่',
      passed: criticalPassed,
      detail: criticalPassed
        ? 'ไม่มีข้อยกเว้นระดับวิกฤตค้างในรอบนี้'
        : `ยังมี ${input.criticalOpen.length} รายการที่ต้องแก้หรือให้ผู้บริหารอนุมัติยกเว้น`,
    },
  ]

  const warnings =
    input.warningOpenCount > 0
      ? [`มีข้อยกเว้นระดับคำเตือน ${input.warningOpenCount} รายการ — ปิดงวดได้แต่ควรตรวจก่อน`]
      : []

  return {
    ready: checks.every((check) => check.passed),
    checks,
    warnings,
    criticalOpen: input.criticalOpen,
    unmatchedBankCount: input.unmatchedBankCount,
    billingMismatches: input.billingMismatches,
  }
}

/**
 * ยามก่อน `collecting → sent_to_accountant` — **ห้าม force ข้าม** (`30` §10)
 * ลำดับการโยน: critical ก่อน (ร้ายแรงสุด) → กระทบยอดธนาคาร → ยอดบิล/รายได้
 */
export function assertReadyToSend(result: ReadinessResult): void {
  if (result.criticalOpen.length > 0) {
    throw new AccountingError('NOT_READY_CRITICAL_OPEN', {
      detail: `critical open ${result.criticalOpen.length} รายการ`,
      context: { criticalExceptions: result.criticalOpen },
    })
  }
  if (result.unmatchedBankCount > 0) {
    throw new AccountingError('NOT_READY_RECONCILE_INCOMPLETE', {
      detail: `unmatched ${result.unmatchedBankCount} รายการ`,
      context: { unmatchedBankCount: result.unmatchedBankCount },
    })
  }
  if (result.billingMismatches.length > 0) {
    throw new AccountingError('NOT_READY_BILLING_REVENUE_MISMATCH', {
      detail: `mismatch ${result.billingMismatches.length} รายการ`,
      context: { billingMismatches: result.billingMismatches },
    })
  }
}
