import { BUDDHIST_YEAR_OFFSET } from '@/lib/constants'
import { MONTH_NAMES_TH } from '@/lib/field/calendar'
import { toBangkokParts } from '@/lib/format/datetime'
import { settledSatang } from '@/lib/finance/ar-calc'
import { sumSatang } from '@/lib/finance/satang'
import type { BillingBatchStatus } from '@/lib/generated/prisma/enums'
import { RevenueError } from '@/lib/revenue/errors'

/**
 * กติกาของรายได้/รอบวางบิล (ไฟล์ 19) — **pure ล้วน ไม่มี I/O** ใช้ร่วม FE/BE
 *
 * ### สิ่งที่ **ไม่ได้** อยู่ที่นี่ (ห้ามเขียนซ้ำ)
 * - "Revenue เกิดเมื่อไหร่" → `lib/finance/revenue-trigger-rules.ts` (บ้านเดียว · `19` §6.1)
 * - ยอดค่าบริการก่อน VAT → `lib/finance/service-fee-calc.ts` (`22` §6.5–6.7)
 * - VAT + snapshot อัตรา → `lib/finance/vat-calc.ts` (`22` §6.8)
 * - ยอดค้างรับ/AR Aging → `lib/finance/ar-calc.ts` (`22` §6.11)
 * - วันครบกำหนดชำระ → `resolveDueDate()` ที่ `lib/settings/cycles.ts` (A5)
 */

/** capability ของทั้งโมดูล (`25` §7 "จัดการ Billing Batch") — การเงิน manage · บัญชี/ผู้บริหาร view */
export const MANAGE_BILLING = 'manage_billing'

/**
 * แปลง instant (`TIMESTAMPTZ`) เป็น **วันตามปฏิทินไทย** ในรูป date-only (เที่ยงคืน UTC)
 * — ค่าที่ได้ลงคอลัมน์ `DATE` (`revenues.revenue_date`) ได้ตรง และส่งเข้า `resolveVatRateAt()`
 *   ซึ่งเทียบด้วยปฏิทิน UTC ได้พอดี (เคสปิดตอน 2 ทุ่มไทย = วันเดียวกับที่ผู้ใช้เห็นบนหน้าจอ)
 */
export function toBangkokDateOnly(instant: Date): Date {
  const parts = toBangkokParts(instant)
  if (parts === null) throw new RangeError('toBangkokDateOnly: วันที่ไม่ถูกต้อง')
  return new Date(Date.UTC(parts.year, parts.month - 1, parts.day))
}

/**
 * ชื่อรอบวางบิลตาม `19` §7.2 (`period` = "มิถุนายน 2569") — เดือน**ไทย** + ปี **พ.ศ.** เสมอ (Rule 01)
 * ค่านี้เป็นป้ายงวดของรอบ (= เดือนของวันตัดรอบ) — **ไม่ใช่กุญแจไม่ซ้ำอีกต่อไป** (มติ PO U86 · BUG-155):
 * 1 บริษัทมีหลายรอบในเดือนเดียวกันได้ ⇒ อ้างรอบด้วย `batch_number` (U76) เสมอ
 */
export function billingPeriodLabel(cutoffDate: Date): string {
  const month = MONTH_NAMES_TH[cutoffDate.getUTCMonth()]
  if (month === undefined) throw new RangeError('billingPeriodLabel: เดือนไม่ถูกต้อง')
  return `${month} ${cutoffDate.getUTCFullYear() + BUDDHIST_YEAR_OFFSET}`
}

/**
 * อ่าน `period` ("มิถุนายน 2569") กลับเป็นงวด — ใช้ตอนต้องรู้ว่ารอบวางบิลอยู่งวดบัญชีไหน
 * (ไฟล์ 20 snapshot `period_status_at_target`) · รูปแบบอื่น ⇒ `null` ให้ผู้เรียกตัดสินใจต่อ
 *
 * ⚠️ ปีในป้ายเป็น **พ.ศ.** เสมอ (Rule 01) — คืนค่าเป็น `yearBe` ตรงกับ `accounting_periods.year_be`
 */
export function parseBillingPeriodLabel(period: string): { yearBe: number; month: number } | null {
  const [monthName, yearText] = period.trim().split(/\s+/)
  if (monthName === undefined || yearText === undefined) return null
  const index = MONTH_NAMES_TH.findIndex((name) => name === monthName)
  const yearBe = Number.parseInt(yearText, 10)
  if (index < 0 || !Number.isInteger(yearBe)) return null
  return { yearBe, month: index + 1 }
}

/**
 * ช่วง `revenue_date` ที่รอบวางบิลใหม่ดึงเข้า (มติ PO U86 · BUG-155) — **ไม่มีขอบล่าง**:
 * รายได้ที่ยังไม่เคยวางบิลทั้งหมดของบริษัทที่ `revenue_date ≤ วันตัดรอบ` (รวมที่ค้างจากเดือนก่อน)
 * เดิมเริ่มที่ต้นเดือนของวันตัดรอบ ⇒ รายได้เดือนก่อนที่เกิดหลังสร้างรอบของเดือนนั้นแล้วค้างถาวร
 */
export function billableRevenueDateFilter(cutoffDate: Date): { lte: Date } {
  return { lte: cutoffDate }
}

/** รายได้ใบนี้ถูกดึงเข้ารอบวางบิลที่ตัดรอบวันที่ `cutoffDate` ได้ไหม — กติกาเดียวกับ query ของ `createBillingBatch()` */
export function isRevenueBillableAt(
  revenue: { status: string; billingBatchId: string | null; revenueDate: Date; deletedAt?: Date | null },
  cutoffDate: Date,
): boolean {
  return (
    (revenue.deletedAt ?? null) === null &&
    revenue.status === 'ready_for_billing' &&
    revenue.billingBatchId === null &&
    revenue.revenueDate.getTime() <= billableRevenueDateFilter(cutoffDate).lte.getTime()
  )
}

/**
 * ห้ามมีรอบวางบิล**ร่าง**ซ้อนกัน 2 รอบของบริษัทเดียวกัน (มติ U86 — `19` §6.2 v2.5)
 * รอบใหม่ดึงรายได้ค้างทั้งหมดถึงวันตัดรอบ ⇒ ถ้ามีรอบร่างค้างอยู่ ให้ส่งบิลหรือลบรอบร่างนั้นก่อน
 * (ลบรอบร่าง = รายได้กลับเป็นรอวางบิล แล้วสร้างรอบใหม่ที่รวมทุกใบ) — ข้อความบอกเลขรอบที่ค้างตรง ๆ
 */
export function assertNoOpenDraftBatch(
  draft: { id: string; batchNumber: string; period: string } | null,
  companyName: string,
): void {
  if (draft === null) return
  throw new RevenueError('BILLING_BATCH_INVALID_STATUS', {
    detail: `company=${companyName} draft=${draft.id} (${draft.batchNumber} ${draft.period})`,
    context: { existingBatchId: draft.id, existingBatchNumber: draft.batchNumber, period: draft.period },
    message: {
      title: 'มีรอบวางบิลร่างค้างอยู่',
      message: `${companyName} มีรอบวางบิล ${draft.batchNumber} (${draft.period}) ที่ยังเป็นฉบับร่าง — ส่งบิลหรือลบรอบร่างนั้นก่อนจึงจะสร้างรอบใหม่ได้`,
    },
  })
}

// ── State machine (`23` §6.8) ───────────────────────────────────────────────

/**
 * `draft → sent → partially_paid → paid` (จ่ายครบทีเดียวข้าม `partially_paid` ได้)
 * · มติ O75 — `paid → partially_paid` เมื่อออกใบเพิ่มหนี้ (หรือยกเลิกใบลดหนี้) จนยอดตามเอกสารค้าง > 0
 */
export const BILLING_BATCH_TRANSITIONS: Readonly<Record<BillingBatchStatus, readonly BillingBatchStatus[]>> = {
  draft: ['sent'],
  sent: ['partially_paid', 'paid'],
  partially_paid: ['paid'],
  paid: ['partially_paid'],
}

export function canTransitionBillingBatch(from: BillingBatchStatus, to: BillingBatchStatus): boolean {
  return BILLING_BATCH_TRANSITIONS[from].includes(to)
}

/** ส่งบิลได้จาก `draft` เท่านั้น — กดซ้ำหลังส่งแล้วต้องไม่เปลี่ยน `sent_at` เดิม (`19` §9.1) */
export function assertBillingBatchSendable(status: BillingBatchStatus): void {
  if (!canTransitionBillingBatch(status, 'sent')) {
    throw new RevenueError('BILLING_BATCH_INVALID_STATUS', { detail: `status=${status} → sent` })
  }
}

/** `19` §10 — "ห้ามลบ Billing Batch ที่ `status != draft`" (ของที่ส่งออกไปแล้วต้องใช้ Adjustment) */
export function assertBillingBatchDeletable(status: BillingBatchStatus): void {
  if (status !== 'draft') {
    throw new RevenueError('BILLING_BATCH_INVALID_STATUS', { detail: `ลบไม่ได้ที่สถานะ ${status}` })
  }
}

/**
 * `19` §10/§11 `EDIT_BILLED_REVENUE` — แก้ยอดรายได้ได้เฉพาะตอนที่ยังไม่ผูกรอบ หรือรอบยัง `draft`
 * @param batchStatus สถานะรอบที่รายได้ผูกอยู่ — `null` = ยังไม่ถูกรวมเข้ารอบใด
 */
export function assertRevenueEditable(batchStatus: BillingBatchStatus | null): void {
  if (batchStatus !== null && batchStatus !== 'draft') {
    throw new RevenueError('EDIT_BILLED_REVENUE', { detail: `batch_status=${batchStatus}` })
  }
}

/** `19` §11 `NO_REVENUE_TO_BILL` — กดสร้างรอบวางบิลแต่ไม่มีรายได้ที่ `ready_for_billing` ในรอบนั้น */
export function assertHasRevenueToBill(count: number, detail: string): void {
  if (count === 0) throw new RevenueError('NO_REVENUE_TO_BILL', { detail })
}

// ── ยอดรวมของรอบ ───────────────────────────────────────────────────────────

export interface RevenueAmounts {
  grossSatang: number
  vatSatang: number
  totalSatang: number
}

export interface BillingBatchTotals {
  grossSatang: number
  vatSatang: number
  /** ยอดเรียกเก็บของรอบ = ผลรวม `total_satang` ของทุก Revenue ในรอบ (`19` §7.2) */
  totalSatang: number
  revenueCount: number
}

/** รวมยอดของรอบวางบิลจากรายได้ที่ถูกดึงเข้ารอบ — ห้ามบวกเองที่ชั้น DB */
export function summarizeBillingBatch(revenues: readonly RevenueAmounts[]): BillingBatchTotals {
  return {
    grossSatang: sumSatang(
      revenues.map((row) => row.grossSatang),
      'ยอดรายได้ก่อน VAT ของรอบ',
    ),
    vatSatang: sumSatang(
      revenues.map((row) => row.vatSatang),
      'VAT ของรอบ',
    ),
    totalSatang: sumSatang(
      revenues.map((row) => row.totalSatang),
      'ยอดเรียกเก็บของรอบ',
    ),
    revenueCount: revenues.length,
  }
}

/**
 * สถานะของรอบหลังรับชำระ (`19` §9.2) — **จุดเสียบของไฟล์ 35** (Phase 4.2) ไม่ใช่การกรอกมือ
 *
 * รับครบ/เกิน ⇒ `paid` · รับบางส่วน ⇒ `partially_paid` · ยังไม่รับ ⇒ คงสถานะเดิม
 * · มติ PO U144: ขาดไม่เกินเพดาน ⇒ ส่วนต่างตัดเป็นค่าธรรมเนียมธนาคาร (ส่งมาใน `bankFeeWrittenOffSatang`) ⇒ `paid`
 * ⚠️ WHT ที่ลูกค้าหักจากเรา (A1) ถือว่า "รับครบแล้ว" ด้วย — เงินส่วนนั้นไปเป็นเครดิตภาษี ไม่ใช่หนี้ค้าง
 */
export function resolveBillingStatusAfterReceipt(input: {
  current: BillingBatchStatus
  totalSatang: number
  receivedSatang: number
  whtWithheldByCustomerSatang: number
  /** มติ PO U144 — ส่วนต่างที่ตัดเป็นค่าธรรมเนียมธนาคาร (`resolveBankFeeWriteOff()`) นับเป็นชำระแล้ว */
  bankFeeWrittenOffSatang: number
}): BillingBatchStatus {
  const settled = settledSatang(input)
  if (settled <= 0) return input.current
  if (settled >= input.totalSatang) return 'paid'
  return input.current === 'draft' ? input.current : 'partially_paid'
}

/**
 * มติ O75 — สถานะของรอบหลัง**เอกสารเปลี่ยนยอด** (บันทึก/ยกเลิกใบลดหนี้-ใบเพิ่มหนี้) — `totalSatang` = **ยอดตามเอกสาร**
 * · `paid` แต่ค้าง > 0 ⇒ `partially_paid` · `partially_paid` ที่ชำระครบแล้วตามเอกสาร ⇒ `paid` · อื่น ๆ คงเดิม
 * (`draft`/`sent` ยังไม่มีเงินเข้า ⇒ ไม่แตะ)
 */
export function resolveBillingStatusAfterDocumentChange(input: {
  current: BillingBatchStatus
  totalSatang: number
  receivedSatang: number
  whtWithheldByCustomerSatang: number
  bankFeeWrittenOffSatang: number
}): BillingBatchStatus {
  const outstanding = input.totalSatang - settledSatang(input)
  if (input.current === 'paid' && outstanding > 0) return 'partially_paid'
  if (input.current === 'partially_paid' && outstanding <= 0) return 'paid'
  return input.current
}
