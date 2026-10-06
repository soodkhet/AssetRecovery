import { Prisma } from '@/lib/generated/prisma/client'
import type { CaseOutcome, ExpenseStatus, ServiceFeeBasis, ServiceFeeModel, VatMode } from '@/lib/generated/prisma/enums'
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
 * - **ประเมินต่อ (เคส, รอบติดตาม)** (มติ PO O72(2) · U125) — รอบปัจจุบันจากเคส + รอบก่อนรีไซเกิลจาก snapshot
 *   ใน `recycle_requests` · รายการเบิกผูกรอบผ่าน `case_assignments.tracking_round` ⇒ รายการรอบ 1 ที่อนุมัติหลัง
 *   รีไซเกิลยังเกิดรายได้รอบ 1 และรายการรอบ 1 ที่ค้างไม่บล็อกรายได้รอบ 2
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
 * `missing_basis` = ผ่านเกตแล้วแต่เคสยังไม่มีฐานคำนวณ (มีอัตรา % แต่เคสไม่ได้กรอกยอดหนี้คงเหลือ)
 * ⇒ ยังสร้าง Revenue ไม่ได้ ต้องให้คนกรอกก่อน (`22` §6.5–6.7 — ห้ามเดาเป็น 0)
 */
export type RevenueSkipReason = RevenueBlockReason | 'already_created' | 'missing_basis'

export interface RevenueSkip {
  caseId: string
  reason: RevenueSkipReason
  /** ระบุเฉพาะรอบก่อนรีไซเกิล (มติ PO O72) — ไม่ระบุ = รอบติดตามปัจจุบันของเคส */
  trackingRound?: number
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

  const [cases, recycles, expenses, assets, revenues, unsettledDays] = await Promise.all([
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
        company: { select: { vatMode: true } },
      },
    }),
    // มติ PO O72(2) (BUG-SF2) — ข้อมูลของรอบก่อนรีไซเกิล (เคสถูกล้าง outcome/snapshot ตอนขึ้นรอบใหม่)
    tx.recycleRequest.findMany({
      where: {
        caseId: { in: caseIds },
        organizationId: input.organizationId,
        status: 'approved',
        previousRound: { not: null },
        prevOutcome: { not: null },
      },
      select: {
        caseId: true,
        previousRound: true,
        prevOutcome: true,
        prevClosedAt: true,
        prevServiceFeeModel: true,
        prevServiceFeeBaseSatang: true,
        prevServiceFeeRatePct: true,
        prevServiceFeeBasis: true,
        prevServiceFeeChargeOnFail: true,
        prevDebtAmountSatang: true,
      },
    }),
    tx.expense.findMany({
      where: { caseId: { in: caseIds }, deletedAt: null },
      select: { caseId: true, status: true, assignment: { select: { trackingRound: true } } },
    }),
    tx.asset.findMany({
      where: { caseId: { in: caseIds }, deletedAt: null },
      select: { caseId: true, lot: { select: { status: true, confirmedAt: true } } },
    }),
    tx.revenue.findMany({
      where: { caseId: { in: caseIds }, deletedAt: null },
      select: { caseId: true, trackingRound: true },
    }),
    // มติ PO 03/10/2569 (UAT Q21): วันลงพื้นที่ (พนักงาน × วันไทยของเช็คอิน) ที่ยังไม่ถูก settle
    // รายการรายวัน — อ่าน**หลัง**ล็อกแถวเคส จึงเห็นการ settle ที่ commit ก่อนหน้าเสมอ · แยกตามรอบติดตาม (O72)
    tx.$queryRaw<{ caseId: string; trackingRound: number }[]>`
      SELECT DISTINCT ci.case_id::text AS "caseId", a.tracking_round AS "trackingRound"
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

  const assetsByCase = groupBy(assets, (row) => row.caseId)
  const revenueRounds = new Set(revenues.map((row) => roundKey(row.caseId, row.trackingRound)))
  const unsettledRounds = new Set(unsettledDays.map((row) => roundKey(row.caseId, Number(row.trackingRound))))
  const currentRoundOf = new Map(cases.map((row) => [row.id, row.trackingRound]))
  // รายการเบิกผูกรอบผ่านการมอบหมาย (`case_assignments.tracking_round`) — รายการที่ไม่ผูกการมอบหมาย = รอบปัจจุบัน
  const expensesByRound = groupBy(expenses, (row) =>
    roundKey(row.caseId ?? '', row.assignment?.trackingRound ?? currentRoundOf.get(row.caseId ?? '') ?? 1),
  )

  // ── ฐานของแต่ละ (เคส, รอบ) — รอบปัจจุบันจากตัวเคส · รอบก่อนรีไซเกิลจาก snapshot ใน `recycle_requests` ──
  const bases: RoundBasis[] = []
  for (const row of cases) {
    bases.push({
      caseId: row.id,
      companyId: row.companyId,
      vatMode: row.company.vatMode,
      trackingRound: row.trackingRound,
      isCurrentRound: true,
      model: row.serviceFeeModelSnapshot,
      baseSatang: row.serviceFeeBaseSatang,
      ratePct: row.serviceFeeRatePct === null ? null : row.serviceFeeRatePct.toNumber(),
      basis: row.serviceFeeBasisSnapshot,
      chargeOnFail: row.serviceFeeChargeOnFail,
      outcome: row.outcome,
      closedAt: row.closedAt,
      debtAmountSatang: row.debtAmountSatang,
    })
  }
  const casesById = new Map(cases.map((row) => [row.id, row]))
  for (const recycle of recycles) {
    const owner = casesById.get(recycle.caseId)
    if (owner === undefined || recycle.previousRound === null || recycle.previousRound >= owner.trackingRound) continue
    bases.push({
      caseId: recycle.caseId,
      companyId: owner.companyId,
      vatMode: owner.company.vatMode,
      trackingRound: recycle.previousRound,
      isCurrentRound: false,
      model: recycle.prevServiceFeeModel,
      baseSatang: recycle.prevServiceFeeBaseSatang,
      ratePct: recycle.prevServiceFeeRatePct === null ? null : recycle.prevServiceFeeRatePct.toNumber(),
      basis: recycle.prevServiceFeeBasis,
      chargeOnFail: recycle.prevServiceFeeChargeOnFail,
      outcome: recycle.prevOutcome,
      closedAt: recycle.prevClosedAt,
      debtAmountSatang: recycle.prevDebtAmountSatang,
    })
  }

  const skipped: RevenueSkip[] = []
  const eligible: RoundBasis[] = []
  for (const basis of bases) {
    const key = roundKey(basis.caseId, basis.trackingRound)
    const statuses = (expensesByRound.get(key) ?? []).map((expense) => expense.status)
    // เครื่องเกิดเฉพาะ `closed_success` ซึ่งเป็นสถานะจบ (รีไซเกิลได้จาก `closed_fail` เท่านั้น) ⇒ เป็นของรอบปัจจุบัน
    const lotStatuses = basis.isCurrentRound
      ? (assetsByCase.get(basis.caseId) ?? []).map((asset) => asset.lot?.status ?? null)
      : []
    const gates = evaluateCaseRevenueGates([
      {
        caseId: basis.caseId,
        model: basis.model,
        chargeOnFail: basis.chargeOnFail,
        outcome: basis.outcome,
        ...expenseGateOf(statuses),
        lotState: lotGateOf(lotStatuses),
        fieldDaysSettled: !unsettledRounds.has(key),
        hasRevenue: revenueRounds.has(key),
      },
    ])
    if (gates.eligibleCaseIds.length > 0) eligible.push(basis)
    // รอบก่อนรีไซเกิล: ไม่ลงเหตุผลซ้ำทุกครั้ง (audit ยึดรอบปัจจุบัน) — ยกเว้นเกตที่ผู้ใช้ตามแก้ได้
    for (const skip of gates.skipped) {
      if (basis.isCurrentRound) skipped.push(skip)
      else if (skip.reason === 'expense_not_approved' || skip.reason === 'field_days_not_settled') {
        skipped.push({ ...skip, trackingRound: basis.trackingRound })
      }
    }
  }
  if (eligible.length === 0) return { revenueIdsCreated: [], eligibleCaseIds: [], skipped }

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

  const eligibleCaseIds: string[] = []
  const revenueIdsCreated: string[] = []

  for (const basis of eligible) {
    const caseId = basis.caseId
    // เกตผ่านแล้วแปลว่ามี `model`/`outcome` เสมอ — เช็คซ้ำเพื่อความปลอดภัยของ type ไม่ใช่กติกาใหม่
    if (basis.model === null || basis.outcome === null) continue
    const roundTag = basis.isCurrentRound ? {} : { trackingRound: basis.trackingRound }

    const revenueDate = revenueDateOf({
      outcome: basis.outcome,
      lotConfirmedAts: basis.isCurrentRound
        ? (assetsByCase.get(caseId) ?? []).map((asset) => asset.lot?.confirmedAt ?? null)
        : [],
      closedAt: basis.closedAt,
      now,
    })

    const built = buildRevenueRow({
      snapshot: {
        model: basis.model,
        baseSatang: basis.baseSatang ?? 0,
        ratePct: basis.ratePct ?? 0,
        basis: basis.basis,
        chargeOnFail: basis.chargeOnFail ?? false,
      },
      outcome: basis.outcome,
      basisValues: { debtAmountSatang: basis.debtAmountSatang },
      vatMode: basis.vatMode,
      revenueDate,
      vatRatePeriods,
    })

    if (!built.ok) {
      skipped.push({ caseId, reason: built.reason, ...roundTag })
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
        companyId: basis.companyId,
        trackingRound: basis.trackingRound,
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
      skipped.push({ caseId, reason: 'already_created', ...roundTag })
      continue
    }

    eligibleCaseIds.push(caseId)
    revenueIdsCreated.push(created.id)
  }

  return { revenueIdsCreated, eligibleCaseIds, skipped }
}

/** ฐานคิดรายได้ของ (เคส, รอบติดตาม) หนึ่ง — รอบปัจจุบันจากเคส · รอบก่อนรีไซเกิลจาก `recycle_requests` (O72) */
interface RoundBasis {
  caseId: string
  companyId: string
  vatMode: VatMode
  trackingRound: number
  isCurrentRound: boolean
  model: ServiceFeeModel | null
  baseSatang: number | null
  ratePct: number | null
  basis: ServiceFeeBasis | null
  chargeOnFail: boolean | null
  outcome: CaseOutcome | null
  closedAt: Date | null
  debtAmountSatang: number | null
}

function roundKey(caseId: string, trackingRound: number): string {
  return `${caseId}#${trackingRound}`
}

/**
 * **pure** — วันรับรู้รายได้ (มติ PO O72(1) · A7/U39 · `19` §7.1)
 * - เคสผ่านคลัง (`closed_success`) = **วันยืนยันล็อตส่งมอบ** ตามปฏิทินไทย (TFRS 15 — โอนการควบคุมเมื่อส่งมอบ)
 *   ไม่ใช่วันปิดงาน · หลายเครื่องในเคส = ล็อตที่ยืนยันล่าสุด (เกตรอครบทุกเครื่องอยู่แล้ว)
 * - เคสไม่ผ่านคลัง (`closed_fail` + คิดเงินกรณีไม่สำเร็จ) = วันปิดงานของรอบนั้น
 * - ไม่มีวันที่ (ข้อมูลเก่า) = เวลาที่รายได้เกิด — ไม่ปล่อยให้ล้มทั้งทรานแซกชัน
 */
export function revenueDateOf(input: {
  outcome: CaseOutcome
  lotConfirmedAts: readonly (Date | null)[]
  closedAt: Date | null
  now: Date
}): Date {
  if (input.outcome === 'closed_success') {
    const confirmed = input.lotConfirmedAts.filter((value): value is Date => value !== null)
    const latest = confirmed.reduce<Date | null>(
      (max, value) => (max === null || value.getTime() > max.getTime() ? value : max),
      null,
    )
    return toBangkokDateOnly(latest ?? input.now)
  }
  return toBangkokDateOnly(input.closedAt ?? input.now)
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
