import { Prisma } from '@/lib/generated/prisma/client'
import type { CaseOutcome, ExpenseStatus, ServiceFeeModel } from '@/lib/generated/prisma/enums'
import {
  evaluateRevenueTrigger,
  type ExpenseGateState,
  type LotGateState,
  type RevenueBlockReason,
} from '@/lib/finance/revenue-trigger-rules'
import { buildRevenueRow } from '@/lib/revenue/revenue-builder'
import { toBangkokDateOnly } from '@/lib/revenue/revenue'
import type { WarehouseTxClient } from '@/lib/warehouse/asset-hook'

/**
 * `RevenueService.tryCreateRevenue()` — step 4 ของการยืนยันส่งมอบ (`44` §11 · `19` §6.1)
 * และเป็นจุดเดียวกับที่ขั้นอนุมัติค่าตอบแทนเรียกเมื่อ expense เข้าสู่ `approved` (`16` §9 · 3.2)
 *
 * ### สัญญาของฟังก์ชัน (Phase 2.13 วางไว้ — 3.6 เสียบของจริงโดย**ไม่แก้เทสต์เดิม**)
 * `eligibleCaseIds` = ชุดที่ต้องถูกสร้างจริง "ไม่ขาดไม่เกิน" ⇒ `revenueIdsCreated.length` เท่ากันเสมอ
 * เคสที่ผ่านเกตแล้วแต่ยัง **คิดยอดไม่ได้** (ไม่มีฐานคำนวณ) ไม่นับเป็น eligible แต่ลง `skipped`
 * ด้วยเหตุผล `missing_basis` เพื่อให้การเงินตามแก้ได้ — ห้ามเดายอดเป็น 0 (`22` §6.5–6.7)
 *
 * ### กติกาที่ห้ามหลุด
 * - เงื่อนไข "เกิด/ไม่เกิด" อยู่ที่ `lib/finance/revenue-trigger-rules.ts` **ที่เดียว** — ที่นี่แค่แปลง
 *   ข้อมูลจาก DB เป็น input ของตัวนั้น (ห้ามเขียนเงื่อนไขซ้ำ)
 * - **ยอดเงินคิดที่ `buildRevenueRow()` เท่านั้น** (`22` §6.5–6.8) — ห้าม hardcode สูตร/อัตรา VAT ที่นี่
 * - **idempotent ต่อ (เคส, รอบติดตาม)** — เคสที่มี Revenue ของรอบนั้นแล้วถูกข้ามเสมอ (B3 `02` §8)
 *   `02` §8 ไม่มี unique index คู่นี้ ⇒ กันซ้ำด้วยการอ่านก่อนเขียน**ในทรานแซกชันเดียวกัน** ซึ่งปลอดภัย
 *   เพราะทุกเส้นทางที่เรียกได้ล็อกแถวต้นทางไว้ก่อนแล้ว (UPDATE ล็อต/expense มาก่อนในทรานแซกชันเดียวกัน)
 *   — เหตุผลเดียวกับ `ensureAssetForClosedCase()` (`lib/warehouse/asset-hook.ts`)
 * - ต้องถูกเรียก **ภายใน** `$transaction` ของ lot confirm เท่านั้น (ต้องเห็นผลของ step 1–2)
 * - ไม่มีอัตรา VAT ครอบ `revenue_date` ⇒ `VAT_RATE_NOT_FOUND` **หลุดออกไปทั้งทรานแซกชัน** (ตั้งใจ)
 *   ปล่อยผ่านเงียบ ๆ = รายได้หาย · ผู้ใช้แก้เองได้ด้วยการตั้งอัตราที่ `13` §6.5 แล้วยืนยันล็อตใหม่
 */

/** สถานะ expense ที่ยัง "มีชีวิต" — `superseded`/`rejected` ไม่นับเป็นเงื่อนไขค้างของเคส (`41` §10.1) */
const INACTIVE_EXPENSE_STATUSES: readonly ExpenseStatus[] = ['superseded', 'rejected']

export interface TryCreateRevenueInput {
  organizationId: string
  caseIds: readonly string[]
  actorId: string
}

/**
 * `missing_basis` = ผ่านเกตแล้วแต่เคสยังไม่มีฐานคำนวณ (เช่น `basis = asset_value` แต่ไม่ได้กรอก
 * มูลค่าทรัพย์) ⇒ ยังสร้าง Revenue ไม่ได้ ต้องให้คนกรอกก่อน (`22` §6.5–6.7 — ห้ามเดาเป็น 0)
 */
export type RevenueSkipReason = RevenueBlockReason | 'already_created' | 'missing_basis'

export interface RevenueSkip {
  caseId: string
  reason: RevenueSkipReason
}

export interface TryCreateRevenueResult {
  /** id ของ Revenue ที่เพิ่งสร้างในการเรียกครั้งนี้ (เรียกซ้ำ = ว่าง เพราะ idempotent) */
  revenueIdsCreated: readonly string[]
  /** เคสที่ผ่านเกตครบทั้ง 3 เงื่อนไข **และคิดยอดได้** (`19` §6.1) — คู่กับ `revenueIdsCreated` เสมอ */
  eligibleCaseIds: readonly string[]
  /** เคสที่ยังไม่เกิดรายได้ + เหตุผล — ลง audit ของ `lot.confirmed` ให้ตามสอบได้ว่าติดด่านไหน */
  skipped: readonly RevenueSkip[]
}

/** ผลการสร้างรายได้ของเคสหนึ่ง — ลง audit `lot.confirmed` ให้ตรวจย้อนได้ว่าเคสไหนเกิด/ข้ามเพราะอะไร (UAT BUG-104) */
export type CaseRevenueOutcome =
  | { caseId: string; result: 'created'; revenueId: string }
  | { caseId: string; result: 'skipped'; reason: RevenueSkipReason }

/**
 * แปลงผล `tryCreateRevenue()` เป็นรายการต่อเคสตามลำดับ `caseIds` — ไม่ประเมินเกตใหม่ (อ่านผลที่คืนมาเท่านั้น)
 * เคสที่ไม่อยู่ทั้งสองชุด (ไม่ควรเกิด) ลงเป็น `no_snapshot` เพื่อไม่ให้หายจาก audit แบบเงียบ ๆ
 */
export function revenueOutcomeByCase(
  caseIds: readonly string[],
  result: TryCreateRevenueResult,
): CaseRevenueOutcome[] {
  const createdByCase = new Map(
    result.eligibleCaseIds.flatMap((caseId, index) => {
      const revenueId = result.revenueIdsCreated[index]
      return revenueId === undefined ? [] : [[caseId, revenueId] as const]
    }),
  )
  const skippedByCase = new Map(result.skipped.map((skip) => [skip.caseId, skip.reason]))
  return [...new Set(caseIds)].map((caseId): CaseRevenueOutcome => {
    const revenueId = createdByCase.get(caseId)
    if (revenueId !== undefined) return { caseId, result: 'created', revenueId }
    return { caseId, result: 'skipped', reason: skippedByCase.get(caseId) ?? 'no_snapshot' }
  })
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
  /** ทุกวันที่ลงพื้นที่ของเคสถูก settle รายการรายวันแล้ว (มติ PO UAT Q21) — ไม่ระบุ = ถือว่าครบ */
  fieldDaysSettled?: boolean
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
      ...(snapshot.fieldDaysSettled === undefined ? {} : { fieldDaysSettled: snapshot.fieldDaysSettled }),
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
  now: Date = new Date(),
): Promise<TryCreateRevenueResult> {
  // เรียง id ให้ทุกทรานแซกชันล็อกตามลำดับเดียวกัน (ล็อตหลายเคส vs อนุมัติทีละเคส ⇒ ไม่ deadlock)
  const caseIds = [...new Set(input.caseIds)].sort()
  if (caseIds.length === 0) return { revenueIdsCreated: [], eligibleCaseIds: [], skipped: [] }

  // UAT R6-E — ล็อกแถวเคส **ก่อน** อ่านสถานะเกต: อนุมัติรายการเบิกตัวสุดท้ายของเคสพร้อมกัน 2 ตัว
  // (หรือยืนยันล็อตชนการอนุมัติตัวสุดท้าย) ใน READ COMMITTED เดิมต่างฝ่ายเห็นอีกตัวยังไม่ approved
  // ⇒ ไม่มีใครสร้างรายได้ และไม่มี job เก็บตก · ล็อกแล้วคนที่สองรอจนคนแรก commit จากนั้นคำสั่งถัดไป
  // ของมันเห็นผลของคนแรกเสมอ ⇒ คนที่ปิดเกตครบเป็นคนสร้าง (ผู้เรียกต้องเขียนสถานะของตัวเองก่อนเรียก)
  await tx.$queryRaw`
    SELECT id::text FROM cases
     WHERE organization_id = ${input.organizationId}::uuid
       AND id = ANY(${caseIds}::uuid[])
     ORDER BY id
       FOR UPDATE
  `

  const [cases, expenses, assets, revenues, unsettledDays] = await Promise.all([
    tx.case.findMany({
      where: { id: { in: caseIds }, organizationId: input.organizationId },
      select: {
        id: true,
        companyId: true,
        trackingRound: true,
        outcome: true,
        closedAt: true,
        serviceFeeModelSnapshot: true,
        serviceFeeBaseSatang: true,
        serviceFeeRatePct: true,
        serviceFeeBasisSnapshot: true,
        serviceFeeChargeOnFail: true,
        debtAmountSatang: true,
        assetValueSatang: true,
        company: { select: { vatMode: true } },
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
    // มติ PO 03/10/2569 (UAT Q21): วันลงพื้นที่ (พนักงาน × วันไทยของเช็คอิน) ที่ยังไม่ถูก settle
    // รายการรายวัน — อ่าน**หลัง**ล็อกแถวเคส จึงเห็นการ settle ที่ commit ก่อนหน้าเสมอ
    tx.$queryRaw<{ caseId: string }[]>`
      SELECT DISTINCT ci.case_id::text AS "caseId"
        FROM check_ins ci
        JOIN case_assignments a ON a.id = ci.assignment_id
       WHERE ci.organization_id = ${input.organizationId}::uuid
         AND ci.case_id = ANY(${caseIds}::uuid[])
         AND NOT EXISTS (
               SELECT 1 FROM field_day_settlements s
                WHERE s.organization_id = ci.organization_id
                  AND s.agent_id = a.agent_id
                  AND s.field_date = (ci.checked_in_at AT TIME ZONE 'Asia/Bangkok')::date
             )
    `,
  ])

  const expensesByCase = groupBy(expenses, (row) => row.caseId)
  const assetsByCase = groupBy(assets, (row) => row.caseId)
  const revenueRounds = new Set(revenues.map((row) => `${row.caseId}#${row.trackingRound}`))
  const unsettledCaseIds = new Set(unsettledDays.map((row) => row.caseId))

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
      fieldDaysSettled: !unsettledCaseIds.has(row.id),
      hasRevenue: revenueRounds.has(`${row.id}#${row.trackingRound}`),
    }
  })

  const gates = evaluateCaseRevenueGates(snapshots)
  const skipped: RevenueSkip[] = [...gates.skipped]
  if (gates.eligibleCaseIds.length === 0) return { revenueIdsCreated: [], eligibleCaseIds: [], skipped }

  // อ่านอัตรา VAT ทั้งประวัติครั้งเดียวต่อการเรียก แล้วให้ `buildRevenueRow()` เลือกช่วงตาม
  // `revenue_date` ของแต่ละเคสเอง (เคสในล็อตเดียวกันปิดคนละวันได้ → คนละอัตราได้)
  const vatPeriods = await tx.vatRateHistory.findMany({
    where: { organizationId: input.organizationId },
    select: { id: true, ratePct: true, effectiveFrom: true, effectiveTo: true },
  })
  const vatRatePeriods = vatPeriods.map((row) => ({
    id: row.id,
    ratePct: row.ratePct.toNumber(),
    effectiveFrom: row.effectiveFrom,
    effectiveTo: row.effectiveTo,
  }))

  const casesById = new Map(cases.map((row) => [row.id, row]))
  const eligibleCaseIds: string[] = []
  const revenueIdsCreated: string[] = []

  for (const caseId of gates.eligibleCaseIds) {
    const row = casesById.get(caseId)
    // เกตผ่านแล้วแปลว่ามี `model`/`outcome` เสมอ — เช็คซ้ำเพื่อความปลอดภัยของ type ไม่ใช่กติกาใหม่
    if (row === undefined || row.serviceFeeModelSnapshot === null || row.outcome === null) continue

    // `revenue_date` = วันปิดงานของเคส (`19` §7.1) ตามปฏิทินไทย — เคสที่ปิดผ่าน job เก่ายังไม่มี
    // `closed_at` ก็ใช้เวลาที่รายได้เกิดแทน (ไม่ปล่อยให้ล้มทั้งล็อตเพราะข้อมูลเก่าไม่ครบ)
    const revenueDate = toBangkokDateOnly(row.closedAt ?? now)

    const built = buildRevenueRow({
      snapshot: {
        model: row.serviceFeeModelSnapshot,
        baseSatang: row.serviceFeeBaseSatang ?? 0,
        ratePct: row.serviceFeeRatePct === null ? 0 : row.serviceFeeRatePct.toNumber(),
        basis: row.serviceFeeBasisSnapshot,
        chargeOnFail: row.serviceFeeChargeOnFail ?? false,
      },
      outcome: row.outcome,
      basisValues: { debtAmountSatang: row.debtAmountSatang, assetValueSatang: row.assetValueSatang },
      vatMode: row.company.vatMode,
      revenueDate,
      vatRatePeriods,
    })

    if (!built.ok) {
      skipped.push({ caseId, reason: built.reason })
      continue
    }

    // ยามชั้น DB (`uniq_revenues_active_case_round`) — ชนแถวที่มีอยู่แล้ว = idempotent ไม่ใช่ error
    // ใช้ ON CONFLICT DO NOTHING (`skipDuplicates`) แทนการจับ P2002: error ในทรานแซกชันของ Postgres
    // ทำให้ทั้งทรานแซกชัน abort (อนุมัติ/ยืนยันล็อตที่ห่ออยู่จะล้มตาม) ⇒ ชนแล้วคืนแถวเดิมเป็น `already_created`
    const inserted = await tx.revenue.createManyAndReturn({
      skipDuplicates: true,
      data: {
        organizationId: input.organizationId,
        caseId,
        companyId: row.companyId,
        trackingRound: row.trackingRound,
        grossSatang: built.values.grossSatang,
        vatSatang: built.values.vatSatang,
        vatRatePctUsed: new Prisma.Decimal(built.values.vatRatePctUsed.toFixed(2)),
        totalSatang: built.values.totalSatang,
        feeModelSnapshot: built.values.feeModelSnapshot,
        vatModeSnapshot: built.values.vatModeSnapshot,
        status: 'ready_for_billing',
        revenueDate,
        createdBy: input.actorId,
      },
      select: { id: true },
    })
    const created = inserted[0]
    if (created === undefined) {
      skipped.push({ caseId, reason: 'already_created' })
      continue
    }

    eligibleCaseIds.push(caseId)
    revenueIdsCreated.push(created.id)
  }

  return { revenueIdsCreated, eligibleCaseIds, skipped }
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
