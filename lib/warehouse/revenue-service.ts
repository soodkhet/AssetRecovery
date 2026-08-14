import type { CaseOutcome, ExpenseStatus, ServiceFeeModel } from '@/lib/generated/prisma/enums'
import {
  evaluateRevenueTrigger,
  type ExpenseGateState,
  type LotGateState,
  type RevenueBlockReason,
} from '@/lib/finance/revenue-trigger-rules'
import type { WarehouseTxClient } from '@/lib/warehouse/asset-hook'

/**
 * `RevenueService.tryCreateRevenue()` — step 4 ของการยืนยันส่งมอบ (`44` §11 · `19` §6.1)
 *
 * ### สถานะของไฟล์นี้: **stub ตามแผน** (`01_PLAN.md` §2.13)
 * รอบนี้ทำหน้าที่ "ตัดสินว่าเคสไหนถึงเวลาเกิดรายได้แล้ว" ให้ครบและ **idempotent** — แต่ยัง
 * **ไม่สร้างแถว `revenues`** เพราะยอดเงิน (gross/VAT/fee model) เป็นสูตรของ `22` §6.5–6.8 ที่
 * Phase 3.1/3.6 เป็นเจ้าของ · Phase 3.6 เสียบตัวจริงเข้าที่นี่แล้วต้องผ่าน **เทสต์ชุดเดิม**
 * (`revenue-service.test.ts`) โดยไม่แก้สัญญา: `eligibleCaseIds` คือชุดที่ต้องถูกสร้างจริง
 *
 * ### กติกาที่ห้ามหลุด
 * - เงื่อนไข "เกิด/ไม่เกิด" อยู่ที่ `lib/finance/revenue-trigger-rules.ts` **ที่เดียว** — ที่นี่แค่แปลง
 *   ข้อมูลจาก DB เป็น input ของตัวนั้น (ห้ามเขียนเงื่อนไขซ้ำ)
 * - **idempotent ต่อ (เคส, รอบติดตาม)** — เคสที่มี Revenue ของรอบนั้นแล้วถูกข้ามเสมอ (B3 `02` §8)
 * - ต้องถูกเรียก **ภายใน** `$transaction` ของ lot confirm เท่านั้น (ต้องเห็นผลของ step 1–2)
 */

/** สถานะ expense ที่ยัง "มีชีวิต" — `superseded`/`rejected` ไม่นับเป็นเงื่อนไขค้างของเคส (`41` §10.1) */
const INACTIVE_EXPENSE_STATUSES: readonly ExpenseStatus[] = ['superseded', 'rejected']

export interface TryCreateRevenueInput {
  organizationId: string
  caseIds: readonly string[]
  actorId: string
}

export type RevenueSkipReason = RevenueBlockReason | 'already_created'

export interface RevenueSkip {
  caseId: string
  reason: RevenueSkipReason
}

export interface TryCreateRevenueResult {
  /** Phase 2.13 = ว่างเสมอ (stub ยังไม่สร้างแถว) · Phase 3.6 = id ของ Revenue ที่เพิ่งสร้าง */
  revenueIdsCreated: readonly string[]
  /** เคสที่ผ่านเกตครบทั้ง 3 เงื่อนไขแล้ว (`19` §6.1) */
  eligibleCaseIds: readonly string[]
  /** เคสที่ยังไม่เกิดรายได้ + เหตุผล — ลง audit ของ `lot.confirmed` ให้ตามสอบได้ว่าติดด่านไหน */
  skipped: readonly RevenueSkip[]
}

/** ข้อมูลของเคสหนึ่งเท่าที่เกตต้องรู้ — แยกออกมาให้เทสต์ป้อนตรงได้โดยไม่ต้องมี DB */
export interface CaseRevenueSnapshot {
  caseId: string
  model: ServiceFeeModel | null
  chargeOnFail: boolean | null
  outcome: CaseOutcome | null
  hasExpense: boolean
  expenseState: ExpenseGateState
  lotState: LotGateState
  /** มี Revenue ของ **รอบติดตามปัจจุบัน** อยู่แล้วหรือยัง (ตัวกันซ้ำ) */
  hasRevenue: boolean
}

/** **pure** — ตัดสินทีละเคสจาก snapshot (เทสต์ยิงตรงที่ตัวนี้) */
export function evaluateCaseRevenueGates(snapshots: readonly CaseRevenueSnapshot[]): {
  eligibleCaseIds: string[]
  skipped: RevenueSkip[]
} {
  const eligibleCaseIds: string[] = []
  const skipped: RevenueSkip[] = []

  for (const snapshot of snapshots) {
    if (snapshot.hasRevenue) {
      skipped.push({ caseId: snapshot.caseId, reason: 'already_created' })
      continue
    }
    const decision = evaluateRevenueTrigger({
      model: snapshot.model,
      chargeOnFail: snapshot.chargeOnFail,
      outcome: snapshot.outcome,
      hasExpense: snapshot.hasExpense,
      expenseState: snapshot.expenseState,
      lotState: snapshot.lotState,
    })
    if (decision.shouldCreate) eligibleCaseIds.push(snapshot.caseId)
    else skipped.push({ caseId: snapshot.caseId, reason: decision.blockedBy ?? 'no_outcome' })
  }

  return { eligibleCaseIds, skipped }
}

/** **pure** — ประกอบสถานะ expense ของเคสหนึ่งจากรายการที่อ่านมา (`19` §6.1 "expense approved") */
export function expenseGateOf(statuses: readonly ExpenseStatus[]): {
  hasExpense: boolean
  expenseState: ExpenseGateState
} {
  const active = statuses.filter((status) => !INACTIVE_EXPENSE_STATUSES.includes(status))
  if (active.length === 0) return { hasExpense: false, expenseState: 'not_approved' }
  const approved = active.every((status) => status === 'approved')
  return { hasExpense: true, expenseState: approved ? 'approved' : 'not_approved' }
}

/**
 * **pure** — ประกอบสถานะล็อตของเคสหนึ่ง (`44` §11)
 * เคสที่ยังไม่มีเครื่องในระบบ หรือมีเครื่องที่ยังไม่เข้าล็อต = ยังไม่ผ่านคลัง (DEC-006/D6)
 */
export function lotGateOf(lotStatuses: readonly (string | null)[]): LotGateState {
  if (lotStatuses.length === 0) return 'not_confirmed'
  return lotStatuses.every((status) => status === 'confirmed') ? 'confirmed' : 'not_confirmed'
}

/**
 * โหลดสถานะจริงของเคสในล็อตแล้วตัดสิน — เรียกจาก `confirmLot()` (step 4)
 *
 * อ่าน 4 ชุดในทรานแซกชันเดียวกับ step 1–2 จึงเห็นผลของทั้งสอง step แล้ว (asset `handed_over`
 * + expense ที่เพิ่งปลดล็อก) ตรงตามลำดับบังคับของ `44` §11
 */
export async function tryCreateRevenue(
  tx: WarehouseTxClient,
  input: TryCreateRevenueInput,
): Promise<TryCreateRevenueResult> {
  const caseIds = [...new Set(input.caseIds)]
  if (caseIds.length === 0) return { revenueIdsCreated: [], eligibleCaseIds: [], skipped: [] }

  const [cases, expenses, assets, revenues] = await Promise.all([
    tx.case.findMany({
      where: { id: { in: caseIds }, organizationId: input.organizationId },
      select: {
        id: true,
        trackingRound: true,
        outcome: true,
        serviceFeeModelSnapshot: true,
        serviceFeeChargeOnFail: true,
      },
    }),
    tx.expense.findMany({
      where: { caseId: { in: caseIds }, deletedAt: null },
      select: { caseId: true, status: true },
    }),
    tx.asset.findMany({
      where: { caseId: { in: caseIds }, deletedAt: null },
      select: { caseId: true, lot: { select: { status: true } } },
    }),
    tx.revenue.findMany({
      where: { caseId: { in: caseIds }, deletedAt: null },
      select: { caseId: true, trackingRound: true },
    }),
  ])

  const expensesByCase = groupBy(expenses, (row) => row.caseId)
  const assetsByCase = groupBy(assets, (row) => row.caseId)
  const revenueRounds = new Set(revenues.map((row) => `${row.caseId}#${row.trackingRound}`))

  const snapshots: CaseRevenueSnapshot[] = cases.map((row) => {
    const statuses = (expensesByCase.get(row.id) ?? []).map((expense) => expense.status)
    const lotStatuses = (assetsByCase.get(row.id) ?? []).map((asset) => asset.lot?.status ?? null)
    return {
      caseId: row.id,
      model: row.serviceFeeModelSnapshot,
      chargeOnFail: row.serviceFeeChargeOnFail,
      outcome: row.outcome,
      ...expenseGateOf(statuses),
      lotState: lotGateOf(lotStatuses),
      hasRevenue: revenueRounds.has(`${row.id}#${row.trackingRound}`),
    }
  })

  const { eligibleCaseIds, skipped } = evaluateCaseRevenueGates(snapshots)

  // ⬇️ Phase 3.6 เสียบการสร้าง `revenues` ตรงนี้ (คำนวณ gross/VAT ตาม `22` §6.5–6.8 + snapshot
  //    `vat_rate_pct_used`/`fee_model_snapshot`) แล้วคืน id ที่สร้างใน `revenueIdsCreated`
  //    — `input.actorId` มีไว้ให้ตัวจริงใช้เป็น `created_by` โดยไม่ต้องแก้ signature อีกรอบ
  void input.actorId

  return { revenueIdsCreated: [], eligibleCaseIds, skipped }
}

function groupBy<T, K>(rows: readonly T[], keyOf: (row: T) => K): Map<K, T[]> {
  const grouped = new Map<K, T[]>()
  for (const row of rows) {
    const key = keyOf(row)
    const bucket = grouped.get(key)
    if (bucket === undefined) grouped.set(key, [row])
    else bucket.push(row)
  }
  return grouped
}
