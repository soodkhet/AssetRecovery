import { AccountingError } from '@/lib/accounting/errors'
import { periodKeyOf, type PeriodKey } from '@/lib/adjustments/adjustment'
import { BUDDHIST_YEAR_OFFSET } from '@/lib/constants'
import { MONTH_NAMES_TH } from '@/lib/field/calendar'
import { fmtDate, startOfBangkokDay } from '@/lib/format/datetime'
import { fmtCount, fmtSatangSymbol } from '@/lib/format/money'
import type { AccountingPeriodStatus } from '@/lib/generated/prisma/enums'
import { isDirectEditRejected, periodLockPolicyFor } from '@/lib/settings/period-lock'

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

/** action ของรอบบัญชี → สถานะต้นทางที่ยอมให้สั่งได้เพียงสถานะเดียว (`30` §9–§10 · `23` §6.13) */
const PERIOD_ACTION_FROM: Readonly<Record<PeriodAction, AccountingPeriodStatus>> = {
  send: 'collecting',
  lock: 'sent_to_accountant',
  unlock: 'locked',
}

export type PeriodAction = 'send' | 'lock' | 'unlock'

/**
 * ยามระดับ **action** — ตาราง from→to อย่างเดียวไม่พอ เพราะ `sent_to_accountant` มีทางเข้า 2 ทาง
 * (`collecting` = ส่งตามปกติ · `locked` = ปลดล็อกโดยผู้บริหาร) ⇒ ถ้าเช็คแค่ transition จะเปิดช่อง 2 ทาง:
 * - บัญชียิง `send` ใส่รอบที่ `locked` = ปลดล็อกได้เองโดยไม่ผ่าน `UNLOCK_REQUIRES_EXECUTIVE` (`30` §10)
 * - ผู้บริหารยิง `unlock` ใส่รอบที่ `collecting` = ส่งบัญชีโดย**ข้าม Readiness Check** ทั้ง 3 เงื่อนไข
 *
 * `24` §6.7 ระบุ `PERIOD_INVALID_STATUS` ไว้ตรงตัวสำหรับ "ปลดล็อกรอบที่ยังไม่ `locked`"
 */
export function assertPeriodActionStatus(action: PeriodAction, from: AccountingPeriodStatus): void {
  const expected = PERIOD_ACTION_FROM[action]
  if (from !== expected) {
    throw new AccountingError('PERIOD_INVALID_STATUS', { detail: `action=${action} ต้องอยู่ที่ ${expected} (ปัจจุบัน ${from})` })
  }
}

// ── ส่ง/ล็อกได้เมื่องวดสิ้นเดือนแล้วเท่านั้น (มติ PO U51 · `30` §6.2a) ───────────────

/**
 * instant แรกที่งวดเดือน M ส่งสำนักงานบัญชี/ล็อกได้ = **00:00 น. วันที่ 1 ของเดือนถัดไป เวลาไทย**
 * (งวด ต.ค. 2569 → 01/11/2569 00:00 น. = `2026-10-31T17:00:00Z`)
 * ใช้ `startOfBangkokDay()` กลาง — ห้ามคำนวณ offset เองซ้ำ
 */
export function periodCloseAvailableFrom(key: PeriodKey): Date {
  const next = nextPeriodKey(key)
  return startOfBangkokDay(new Date(Date.UTC(periodYearCe(next), next.month - 1, 1)))
}

/** งวดนี้สิ้นเดือนแล้วหรือยัง ณ `now` (inclusive ที่ 00:00 น. วันที่ 1 ของเดือนถัดไป) */
export function isPeriodEnded(key: PeriodKey, now: Date): boolean {
  return now.getTime() >= periodCloseAvailableFrom(key).getTime()
}

/** ข้อความที่ผู้ใช้เห็นเมื่อยังส่ง/ล็อกไม่ได้ — วันที่ พ.ศ. ผ่าน `fmtDate()` กลาง */
export function periodCloseAvailableHint(key: PeriodKey): string {
  return `ส่ง/ล็อกได้ตั้งแต่ ${fmtDate(periodCloseAvailableFrom(key))}`
}

/**
 * ยามก่อน `send`/`lock` — ยังไม่สิ้นเดือน ⇒ `PERIOD_NOT_ENDED` (มติ PO U51)
 * ใช้กับทั้งสอง action เพราะรอบที่ถูกส่งก่อนมีมตินี้ (ข้อมูลเก่า) ก็ต้องล็อกไม่ได้จนกว่าจะสิ้นเดือนเช่นกัน
 */
export function assertPeriodEnded(key: PeriodKey, now: Date): void {
  if (isPeriodEnded(key, now)) return
  const availableFrom = periodCloseAvailableFrom(key)
  throw new AccountingError('PERIOD_NOT_ENDED', {
    detail: `period=${key.yearBe}-${key.month} now=${now.toISOString()} availableFrom=${availableFrom.toISOString()}`,
    message: `งวด ${periodLabelOf(key)} ยังไม่สิ้นเดือน — ${periodCloseAvailableHint(key)}`,
    context: { availableFrom: availableFrom.toISOString() },
  })
}

/** ป้ายสถานะรอบ — ข้อความเดียวกับตารางนโยบาย `13` §6.11 (ห้ามตั้งชุดใหม่) */
export function periodStatusLabel(status: AccountingPeriodStatus): string {
  return periodLockPolicyFor(status).statusLabel
}

// ── ปุ่มบนแถวรอบบัญชี (`30` §8) ──────────────────────────────────────────────

/** สิทธิ์ที่หน้าจอถืออยู่ — มาจาก `usePermission()` ฝั่ง FE / จาก session ฝั่ง BE */
export interface PeriodCapabilityFlags {
  /** `manage:manage_accounting_period` (สายบัญชี) */
  canManagePeriod: boolean
  /** `manage:unlock_period` (ผู้บริหาร — 🔒 "✅ only") */
  canUnlockPeriod: boolean
  /** `manage:export_accounting_pack` (ไฟล์ 37) */
  canExportPack: boolean
}

export interface PeriodActions {
  canSend: boolean
  canLock: boolean
  canUnlock: boolean
  canExport: boolean
  /**
   * ปุ่มส่ง/ล็อกยังแสดง แต่กดไม่ได้เพราะงวดยังไม่สิ้นเดือน (มติ PO U51) — `null` = กดได้
   * ข้อความเช่น "ส่ง/ล็อกได้ตั้งแต่ 01/11/2569"
   */
  closeBlockedHint: string | null
}

/** เวลาของงวดที่ server คำนวณให้ (`AccountingPeriodDto.periodEnded`) */
export interface PeriodTiming {
  key: PeriodKey
  periodEnded: boolean
}

/**
 * สถานะ + สิทธิ์ → ปุ่มที่ขึ้นบนแถว — **หน้าจอห้าม `if` สถานะเอง** (แนวเดียวกับแท็บกระทบยอด 4.2)
 *
 * - ส่งสำนักงานบัญชี = บัญชีเท่านั้น และต้องอยู่ `collecting` (`30` §9 — readiness ตรวจซ้ำที่ API)
 * - ล็อกงวด = "บัญชี/Executive ยืนยันปิดงวด" (`30` §9) ⇒ ผ่านได้ทั้งสองสาย เท่ากับ route `/lock`
 * - ปลดล็อก = **ผู้บริหารเท่านั้น** (`30` §10) — API ตรวจซ้ำแล้วโยน `UNLOCK_REQUIRES_EXECUTIVE`
 */
export function periodActionsFor(
  status: AccountingPeriodStatus,
  caps: PeriodCapabilityFlags,
  timing?: PeriodTiming,
): PeriodActions {
  const canSend = caps.canManagePeriod && canTransitionPeriod(status, 'sent_to_accountant') && status === 'collecting'
  const canLock = (caps.canManagePeriod || caps.canUnlockPeriod) && canTransitionPeriod(status, 'locked')
  const blocked = timing !== undefined && !timing.periodEnded && (canSend || canLock)
  return {
    canSend,
    canLock,
    canUnlock: caps.canUnlockPeriod && status === 'locked',
    canExport: caps.canExportPack,
    closeBlockedHint: blocked ? periodCloseAvailableHint(timing.key) : null,
  }
}

// ── Readiness Check 3 เงื่อนไข (`30` §6.2) ───────────────────────────────────

export type ReadinessCheckKey = 'period_ended' | 'billing_revenue_sync' | 'bank_reconcile' | 'no_critical_exception'

export interface ReadinessCheck {
  key: ReadinessCheckKey
  label: string
  passed: boolean
  /** รายละเอียดที่ผู้ใช้อ่านแล้วรู้ว่าต้องไปแก้อะไร (`30` §8 — checklist ใน Modal) */
  detail: string
}

/**
 * ตัวตอบ "งวดของวันที่นี้ปิดแล้วหรือยัง" สำหรับติดไปกับ DTO ของเอกสารที่ยกเลิกได้ (UAT BUG-169)
 * — `true` = งวดอยู่สถานะที่**ปฏิเสธการแก้ที่กระทบยอด** (`sent_to_accountant`/`locked`) ⇒ หน้าจอปิดปุ่ม
 * "ยกเลิก" แล้วบอกให้ทำผ่าน Adjustment · กติกาเดียวกับยาม `assertPeriodOpenAt()` (นโยบายกลาง
 * `isDirectEditRejected`) — UI เป็นแค่ UX, API ยังตรวจซ้ำทุกครั้ง (DEC-002)
 * · ไม่มีรอบของเดือนนั้น = ยังเก็บข้อมูลอยู่ ⇒ `false`
 */
export type PeriodClosedLookup = (at: Date) => boolean

export function buildPeriodClosedLookup(
  rows: readonly { yearBe: number; month: number; status: AccountingPeriodStatus }[],
): PeriodClosedLookup {
  const closed = new Set(
    rows.filter((row) => isDirectEditRejected(row.status, true)).map((row) => `${row.yearBe}-${row.month}`),
  )
  return (at) => {
    const key = periodKeyOf(at)
    return closed.has(`${key.yearBe}-${key.month}`)
  }
}

/** tooltip ของปุ่ม "ยกเลิก" เมื่อเอกสารอยู่ในงวดที่ปิดแล้ว (UAT BUG-169) */
export const PERIOD_CLOSED_CANCEL_HINT = 'งวดปิดแล้ว ต้องทำผ่าน Adjustment'

/** ใช้กับ DTO ที่คืนจาก mutation ซึ่งเพิ่งผ่านยามงวดมาแล้ว (งวดเปิดอยู่แน่นอน) */
export const PERIOD_ASSUMED_OPEN: PeriodClosedLookup = () => false

/**
 * คำอธิบายหัว Modal ตรวจความพร้อม — จำนวนข้อ**นับจากรายการที่ตรวจจริง** (UAT BUG-163: เคยเขียนตายตัว
 * "3 ข้อ" ขณะที่ checklist มี 4 รายการ) · ยังไม่มีผลตรวจ (`null`) ⇒ ไม่ระบุจำนวน
 */
export function readinessDescription(checkCount: number | null): string {
  const tail = 'ตรวจสดทุกครั้งที่เปิดหน้าต่างนี้ ไม่มีทางลัดข้าม'
  return checkCount === null ? tail : `เงื่อนไข ${checkCount} ข้อ — ${tail}`
}

/**
 * ยอดที่ไม่ตรงกันจริงระหว่างรอบวางบิลกับรายได้ที่อยู่ในรอบ (`19` — เงื่อนไขที่ 3) · **บล็อก**
 * มติ PO U87 (06/10/2569): รายได้ที่ยังไม่วางบิล**ไม่ใช่** mismatch อีกต่อไป — ย้ายไปเป็นคำเตือน
 * "รายได้ค้างรับ" (`UnbilledRevenueSummary`) เพราะรายได้ทางบัญชีรับรู้ตามเกณฑ์คงค้างในเดือนส่งมอบ
 */
export interface BillingRevenueMismatch {
  billingBatchId: string
  batchNumber: string
  companyName: string
  batchTotalSatang: number
  revenueTotalSatang: number
  reason: 'total_mismatch'
}

/**
 * มติ PO U87 — รายได้ที่ `revenue_date` อยู่ในงวด (หรือก่อน) แต่ยังไม่อยู่ในรอบวางบิลที่ส่งลูกค้าแล้ว
 * (ยังไม่ผูกรอบ หรืออยู่ในรอบร่าง) · **เตือน ไม่บล็อก** — สำนักงานบัญชีบันทึกรายได้ค้างรับจาก `14_Unbilled_Revenue.csv`
 */
export interface UnbilledRevenueSummary {
  count: number
  totalSatang: number
  /** ในจำนวนนี้ อยู่ในรอบวางบิลร่างกี่รายการ (ที่เหลือ = ยังไม่ผูกรอบ) */
  inDraftCount: number
  byCompany: readonly { companyName: string; count: number; totalSatang: number }[]
}

/** BUG-160 — รอบวางบิลร่างที่ยังไม่ส่งลูกค้า (มีรายได้ของงวดนี้หรือก่อนหน้า) · **เตือน ไม่บล็อก** */
export interface DraftBillingBatchSummary {
  count: number
  totalSatang: number
  batchNumbers: readonly string[]
}

export interface ReadinessInput {
  /** critical ที่ยัง `open` ของรอบนี้ (`34`) */
  criticalOpen: readonly { id: string; title: string; sourceModule: string }[]
  /** warning ที่ยัง `open` — ผ่านได้แต่ต้องแสดงเตือน (`30` §6.2) */
  warningOpenCount: number
  /** รายการเดินบัญชีที่ยัง `unmatched` ของรอบนี้ (`unmatched_resolved` ถือว่าเคลียร์แล้ว — `35`) */
  unmatchedBankCount: number
  billingMismatches: readonly BillingRevenueMismatch[]
  /**
   * งวดสิ้นเดือนแล้วหรือยัง (มติ PO U51) — ไม่ส่ง = ไม่ตรวจข้อนี้ (เทสต์ pure เดิม)
   * service ส่งมาเสมอ ⇒ checklist บนหน้าจอมีข้อนี้เป็นข้อแรก
   */
  periodEnd?: { key: PeriodKey; now: Date }
  /**
   * มติ PO U41 — เงินรับรอตรวจสอบที่ยังคงค้าง (รายการก่อนสิ้นงวด) · **เตือน ไม่บล็อก**
   * (`30`/`34` ไม่ได้กำหนดให้เป็น blocker — ตัดสินแล้วว่าเป็นหนี้สินรอตรวจสอบ ไม่ใช่รายการค้างจับคู่)
   */
  suspenseOutstanding?: { count: number; amountSatang: number }
  /** มติ PO U40 — 50 ทวิ จากลูกค้าที่ยังรอหนังสือ (รับเงินก่อนสิ้นงวด) · **เตือน ไม่บล็อก** */
  pendingCustomerWht?: { count: number; withheldSatang: number }
  /** มติ PO U95 #6 — รับเงินแล้วแต่ยังไม่ออกใบเสร็จรับเงิน/ใบกำกับภาษี (รับก่อนสิ้นงวด) · **เตือน ไม่บล็อก** */
  receiptsAwaitingTaxInvoice?: { count: number; amountSatang: number }
  /** มติ PO U87 — รายได้ค้างรับ (ยังไม่วางบิล) · **เตือน ไม่บล็อก** */
  unbilledRevenue?: UnbilledRevenueSummary
  /** BUG-160 — รอบวางบิลร่างค้าง · **เตือน ไม่บล็อก** */
  draftBillingBatches?: DraftBillingBatchSummary
}

export interface ReadinessResult {
  ready: boolean
  checks: readonly ReadinessCheck[]
  /** เตือนแต่ไม่บล็อก (`30` §6.2 — warning ผ่านได้) */
  warnings: readonly string[]
  criticalOpen: readonly { id: string; title: string; sourceModule: string }[]
  unmatchedBankCount: number
  billingMismatches: readonly BillingRevenueMismatch[]
  /** รายได้ค้างรับ (มติ U87) — ไม่มี = 0 รายการ */
  unbilledRevenue: UnbilledRevenueSummary
  /** รอบวางบิลร่างค้าง (BUG-160) — ไม่มี = 0 รอบ */
  draftBillingBatches: DraftBillingBatchSummary
}

const NO_UNBILLED: UnbilledRevenueSummary = { count: 0, totalSatang: 0, inDraftCount: 0, byCompany: [] }
const NO_DRAFT_BATCHES: DraftBillingBatchSummary = { count: 0, totalSatang: 0, batchNumbers: [] }
/** แสดงเลขรอบร่างในคำเตือนไม่เกินเท่านี้ (ที่เหลือบอกเป็นจำนวน) */
const DRAFT_BATCH_NUMBERS_SHOWN = 5

/** ข้อความเตือนรายได้ค้างรับ (มติ PO U87) */
export function unbilledRevenueWarning(summary: UnbilledRevenueSummary): string | null {
  if (summary.count === 0) return null
  const draftNote = summary.inDraftCount > 0 ? ` (อยู่ในรอบวางบิลร่าง ${fmtCount(summary.inDraftCount)} รายการ)` : ''
  return (
    `มีรายได้ค้างรับยังไม่วางบิล ${fmtCount(summary.count)} รายการ ${fmtSatangSymbol(summary.totalSatang)}${draftNote} — ` +
    'ส่งให้สำนักงานบัญชีบันทึกรายได้ค้างรับ (รายละเอียดอยู่ใน 14_Unbilled_Revenue.csv ของชุดเอกสารบัญชี) · ปิดงวดได้'
  )
}

/** ข้อความเตือนรอบวางบิลร่างค้าง (BUG-160) */
export function draftBillingBatchWarning(summary: DraftBillingBatchSummary): string | null {
  if (summary.count === 0) return null
  const shown = summary.batchNumbers.slice(0, DRAFT_BATCH_NUMBERS_SHOWN)
  const more = summary.batchNumbers.length - shown.length
  const numbers = shown.length === 0 ? '' : ` (${shown.join(', ')}${more > 0 ? ` และอีก ${fmtCount(more)} รอบ` : ''})`
  return (
    `มีรอบวางบิลร่างที่ยังไม่ส่งลูกค้า ${fmtCount(summary.count)} รอบ${numbers} รวม ${fmtSatangSymbol(summary.totalSatang)} — ` +
    'ปิดงวดได้ แต่ควรส่งลูกค้าหรือลบรอบร่างให้เรียบร้อยก่อน'
  )
}

/**
 * ประเมินความพร้อมปิดงวด — **pure** เพื่อให้เทสต์ยิงครบ 3 เงื่อนไขได้โดยไม่ต้องมี DB
 * เงื่อนไขทั้ง 3 เป็น blocker เท่ากันหมด (ไม่มีข้อไหน "ข้ามได้")
 */
export function evaluateReadiness(input: ReadinessInput): ReadinessResult {
  const billingPassed = input.billingMismatches.length === 0
  const reconcilePassed = input.unmatchedBankCount === 0
  const criticalPassed = input.criticalOpen.length === 0

  const checks: ReadinessCheck[] = []
  if (input.periodEnd !== undefined) {
    const ended = isPeriodEnded(input.periodEnd.key, input.periodEnd.now)
    checks.push({
      key: 'period_ended',
      label: 'งวดสิ้นเดือนแล้ว',
      passed: ended,
      detail: ended ? 'ผ่านวันสิ้นเดือนของงวดนี้แล้ว' : periodCloseAvailableHint(input.periodEnd.key),
    })
  }
  checks.push(
    {
      key: 'billing_revenue_sync',
      label: 'ยอดวางบิลตรงกับรายได้ของรอบ',
      passed: billingPassed,
      detail: billingPassed
        ? 'รอบวางบิลทุกใบของงวดมียอดตรงกับรายได้ที่รวมอยู่'
        : `ยอดรอบวางบิลไม่ตรงกับรายได้ในรอบ ${fmtCount(input.billingMismatches.length)} รอบ`,
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
  )

  const warnings: string[] = []
  if (input.warningOpenCount > 0) {
    warnings.push(`มีข้อยกเว้นระดับคำเตือน ${input.warningOpenCount} รายการ — ปิดงวดได้แต่ควรตรวจก่อน`)
  }
  if (input.suspenseOutstanding !== undefined && input.suspenseOutstanding.count > 0) {
    warnings.push(
      `มีเงินรับรอตรวจสอบคงค้าง ${fmtCount(input.suspenseOutstanding.count)} รายการ ` +
        `(${fmtSatangSymbol(input.suspenseOutstanding.amountSatang)}) — ยังไม่รับรู้เป็นรายได้ ปิดงวดได้แต่ควรติดตามที่มา`,
    )
  }
  if (input.pendingCustomerWht !== undefined && input.pendingCustomerWht.count > 0) {
    warnings.push(
      `ยังรอหนังสือรับรอง 50 ทวิ จากลูกค้า ${fmtCount(input.pendingCustomerWht.count)} รายการ ` +
        `(${fmtSatangSymbol(input.pendingCustomerWht.withheldSatang)}) — ปิดงวดได้ ติดตามหนังสือต่อได้ที่รายการ 50 ทวิ ลูกค้า`,
    )
  }
  if (input.receiptsAwaitingTaxInvoice !== undefined && input.receiptsAwaitingTaxInvoice.count > 0) {
    warnings.push(
      `รับเงินแล้วแต่ยังไม่ออกใบเสร็จรับเงิน/ใบกำกับภาษี ${fmtCount(input.receiptsAwaitingTaxInvoice.count)} รายการ ` +
        `(${fmtSatangSymbol(input.receiptsAwaitingTaxInvoice.amountSatang)}) — ภาษีขายเกิดในเดือนที่รับเงิน ` +
        'ออกเอกสารได้ที่แท็บเงินรับ · ปิดงวดได้',
    )
  }
  const unbilledRevenue = input.unbilledRevenue ?? NO_UNBILLED
  const draftBillingBatches = input.draftBillingBatches ?? NO_DRAFT_BATCHES
  const unbilledWarning = unbilledRevenueWarning(unbilledRevenue)
  if (unbilledWarning !== null) warnings.push(unbilledWarning)
  const draftWarning = draftBillingBatchWarning(draftBillingBatches)
  if (draftWarning !== null) warnings.push(draftWarning)

  return {
    ready: checks.every((check) => check.passed),
    checks,
    warnings,
    criticalOpen: input.criticalOpen,
    unmatchedBankCount: input.unmatchedBankCount,
    billingMismatches: input.billingMismatches,
    unbilledRevenue,
    draftBillingBatches,
  }
}

/**
 * ยามก่อน `collecting → sent_to_accountant` — **ห้าม force ข้าม** (`30` §10)
 * ลำดับการโยน: ยังไม่สิ้นเดือน (U51) → critical ก่อน (ร้ายแรงสุด) → กระทบยอดธนาคาร → ยอดบิล/รายได้
 */
export function assertReadyToSend(result: ReadinessResult): void {
  const periodEnded = result.checks.find((check) => check.key === 'period_ended')
  if (periodEnded !== undefined && !periodEnded.passed) {
    throw new AccountingError('PERIOD_NOT_ENDED', { detail: periodEnded.detail, message: `ยังไม่สิ้นเดือน — ${periodEnded.detail}` })
  }
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
      detail: `mismatch ${result.billingMismatches.length} รอบ`,
      context: { billingMismatches: result.billingMismatches },
    })
  }
}
