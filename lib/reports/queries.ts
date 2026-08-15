import { netAfterAdjustments } from '@/lib/adjustments/adjustment'
import type { SessionUser } from '@/lib/auth/types'
import { arOutstandingSatang } from '@/lib/finance/ar-calc'
import { sumSatang } from '@/lib/finance/satang'
import type { AdjustmentStatus, AdjustmentType, ExceptionLevel } from '@/lib/generated/prisma/enums'
import { prisma } from '@/lib/prisma'
import { withDailyCache } from '@/lib/reports/cache'
import {
  DASHBOARD_KPI_META,
  compareExceptionLevel,
  countExceptionLevels,
  exceptionLinkOf,
  exceptionModuleLabel,
} from '@/lib/reports/dashboard'
import {
  reportPeriodKey,
  resolveReportPeriod,
  toIsoDateOnly,
  type ReportPeriodRange,
} from '@/lib/reports/period'
import {
  DIRECT_COST_EXPENSE_TYPES,
  countCasesWithCostOnly,
  summarizeCostBreakdown,
  summarizeProfitability,
  type DirectCostExpenseType,
  type ProfitCostEntry,
  type ProfitDimension,
  type ProfitRevenueEntry,
} from '@/lib/reports/profitability'
import type { DashboardKpiQuery, ExceptionListQuery, ProfitabilityQuery } from '@/lib/reports/schemas'
import type {
  DashboardKpiDto,
  DashboardKpiReportDto,
  ExceptionListDto,
  ProfitabilityDrilldownDto,
  ProfitabilityReportDto,
} from '@/lib/reports/types'
import { ReportError } from '@/lib/reports/errors'

/**
 * รายงานกำไร (ไฟล์ 21) + แดชบอร์ดการเงิน (ไฟล์ 14) — ชั้น DB (`27` §6.9)
 *
 * ### กติกาที่ห้ามหลุด
 * - **อ่านอย่างเดียวทั้งไฟล์** (`21` §10 · `14` §10) — ไม่มี mutation ⇒ ไม่มี audit (`21` §13)
 *   ห้ามเพิ่มฟังก์ชันเขียนข้อมูลลงไฟล์นี้เด็ดขาด
 * - **ยอดของทุกรายการต้องผ่าน `netAfterAdjustments()`** (`20` §9) — ยอดสุทธิของ record ต้นทาง
 *   คือ "ยอดเดิม + adjustment ที่ `approved`" ห้ามอ่านยอดดิบจาก record ตรง ๆ
 * - **Direct Cost = 4 ชนิดของ `22` §6.12 และต้องผูกเคส** — รายการเบิกที่ไม่มี `case_id`
 *   (manual claim / ค่าที่พัก) ผูกกับมิติบริษัท/ทีมไม่ได้ ⇒ อยู่นอกรายงาน (`21` §4)
 * - **สถานะที่ถือว่า "เกิดจริง"**: expense = `approved` เท่านั้น (`superseded` คือรายการที่ถูกแทน
 *   ไปแล้วตาม `41` §10.1 — นับซ้ำไม่ได้) · revenue = ทุกใบที่มีอยู่ (เกิดจาก gate `19` §6.1 แล้ว)
 * - แคชรายวัน + ปุ่มรีเฟรช (`21` §17) เก็บ **entry ดิบ** ไม่ใช่ DTO ⇒ ตารางกับ drill-down
 *   มาจากชุดข้อมูลเดียวกันเสมอ ตัวเลขขัดกันไม่ได้ (`21` §15)
 */

/** `25` §7.6 — ดู Dashboard / Profitability Report = การเงิน + บัญชี + ผู้บริหาร (read-only) */
export const REPORT_READ_CAPABILITIES = ['view_finance_dashboard'] as const

// ── ตัวช่วยเรื่อง adjustment (`20` §9) ───────────────────────────────────────

interface AdjustmentRow {
  adjustmentType: AdjustmentType
  amountSatang: number
  status: AdjustmentStatus
}

type AdjustmentIndex = Map<string, AdjustmentRow[]>

function indexAdjustments(
  rows: readonly (AdjustmentRow & { targetId: string | null })[],
): AdjustmentIndex {
  const index: AdjustmentIndex = new Map()
  for (const row of rows) {
    if (row.targetId === null) continue
    const list = index.get(row.targetId)
    if (list === undefined) index.set(row.targetId, [row])
    else list.push(row)
  }
  return index
}

const NO_ADJUSTMENTS: readonly AdjustmentRow[] = []

/** ยอดสุทธิของ record ต้นทาง — จุดเดียวที่รายงานนี้อ่านยอดเงิน (`20` §9) */
function netOf(baseSatang: number, index: AdjustmentIndex, targetId: string): number {
  return netAfterAdjustments(baseSatang, index.get(targetId) ?? NO_ADJUSTMENTS)
}

// ── ข้อมูลดิบของรายงานกำไร ──────────────────────────────────────────────────

interface ProfitEntries {
  revenues: readonly ProfitRevenueEntry[]
  costs: readonly ProfitCostEntry[]
}

/** ช่วงวันที่ของการดึงข้อมูล — รับได้ทั้ง `ReportPeriodRange` (3.8) และ `ReportRange` ของเมนูรายงาน (6.x) */
export interface ProfitEntryRange {
  startDate: Date
  endDate: Date
}

export interface ProfitEntryScope {
  /** ทีมที่ผู้เรียกเห็นได้ — `null` = ทุกทีม · **รายการว่าง = ผลลัพธ์ว่าง** (`96` §10) */
  teamIds?: readonly string[] | null
}

/**
 * ดึงรายได้ + ต้นทุนตรงของช่วงเวลา แล้วผูกมิติ (บริษัท/ทีม) ให้เรียบร้อย
 *
 * ⚠️ เคส `closed_fail` **ไม่ถูกกรองทิ้ง** — ต้นทุนของมันเข้ารายงานเสมอแม้ไม่มีรายได้คู่กัน
 * (`21` §6.1) ⇒ query ฝั่งต้นทุนจึงเริ่มจาก `expenses` ไม่ใช่จาก `revenues`
 *
 * ใช้ร่วมกันระหว่างแท็บกำไรของไฟล์ 21 (3.8) และรายงาน F1 ของเมนูรายงาน (6.2)
 * — **ห้ามเขียน query ชุดที่สองขึ้นมาใหม่** ไม่งั้นตัวเลขสองหน้าจอมีสิทธิ์ไม่ตรงกัน
 */
export async function loadProfitEntries(
  organizationId: string,
  dimension: ProfitDimension,
  range: ProfitEntryRange,
  scope: ProfitEntryScope = {},
): Promise<ProfitEntries> {
  const teamIds = scope.teamIds ?? null
  const teamWhere = teamIds === null ? {} : { assignedTeamId: { in: [...teamIds] } }

  const [revenueRows, expenseRows] = await Promise.all([
    prisma.revenue.findMany({
      where: {
        organizationId,
        deletedAt: null,
        revenueDate: { gte: range.startDate, lte: range.endDate },
        ...(teamIds === null ? {} : { case: teamWhere }),
      },
      select: {
        id: true,
        caseId: true,
        companyId: true,
        grossSatang: true,
        company: { select: { name: true } },
        case: { select: { assignedTeamId: true, assignedTeam: { select: { name: true } } } },
      },
    }),
    prisma.expense.findMany({
      where: {
        organizationId,
        deletedAt: null,
        status: 'approved',
        expenseType: { in: [...DIRECT_COST_EXPENSE_TYPES] },
        expenseDate: { gte: range.startDate, lte: range.endDate },
        // ต้นทุนที่ผูกเคสไม่ได้ = ผูกมิติไม่ได้ ⇒ อยู่นอกรายงานนี้ (`21` §4)
        caseId: { not: null },
        ...(teamIds === null ? {} : { case: teamWhere }),
      },
      select: {
        id: true,
        caseId: true,
        expenseType: true,
        grossSatang: true,
        case: {
          select: {
            companyId: true,
            assignedTeamId: true,
            company: { select: { name: true } },
            assignedTeam: { select: { name: true } },
          },
        },
      },
    }),
  ])

  const revenueIds = revenueRows.map((row) => row.id)
  const expenseIds = expenseRows.map((row) => row.id)
  const adjustmentRows =
    revenueIds.length + expenseIds.length === 0
      ? []
      : await prisma.adjustment.findMany({
          where: {
            organizationId,
            status: 'approved',
            OR: [{ revenueId: { in: revenueIds } }, { expenseId: { in: expenseIds } }],
          },
          select: { revenueId: true, expenseId: true, adjustmentType: true, amountSatang: true, status: true },
        })

  const revenueAdjustments = indexAdjustments(
    adjustmentRows.map((row) => ({ ...row, targetId: row.revenueId })),
  )
  const expenseAdjustments = indexAdjustments(
    adjustmentRows.map((row) => ({ ...row, targetId: row.expenseId })),
  )

  const revenues: ProfitRevenueEntry[] = revenueRows.map((row) => ({
    key: dimension === 'company' ? row.companyId : row.case.assignedTeamId,
    label: dimension === 'company' ? row.company.name : (row.case.assignedTeam?.name ?? null),
    // `22` §6.12 — ใช้ยอดก่อน VAT เสมอ (VAT ไม่ใช่รายได้ของบริษัท)
    revenueSatang: netOf(row.grossSatang, revenueAdjustments, row.id),
    caseId: row.caseId,
  }))

  const costs: ProfitCostEntry[] = expenseRows.map((row) => ({
    key: dimension === 'company' ? (row.case?.companyId ?? null) : (row.case?.assignedTeamId ?? null),
    label:
      dimension === 'company' ? (row.case?.company.name ?? null) : (row.case?.assignedTeam?.name ?? null),
    expenseType: row.expenseType as DirectCostExpenseType,
    grossSatang: netOf(row.grossSatang, expenseAdjustments, row.id),
    caseId: row.caseId,
  }))

  return { revenues, costs }
}

interface ResolvedEntries {
  entries: ProfitEntries
  range: ReportPeriodRange
  computedAt: Date
  fromCache: boolean
}

/** entry ดิบผ่านแคชรายวัน — คีย์ผูก `organization_id` เสมอ (multi-tenant) */
async function resolveProfitEntries(
  organizationId: string,
  query: ProfitabilityQuery,
  now: Date,
): Promise<ResolvedEntries> {
  const range = resolveReportPeriod(query.period, query.asOf ?? now)
  const key = `profit:${organizationId}:${query.dimension}:${reportPeriodKey(range)}`
  const cached = await withDailyCache(key, { refresh: query.refresh, now }, () =>
    loadProfitEntries(organizationId, query.dimension, range),
  )
  return { entries: cached.value, range, computedAt: cached.computedAt, fromCache: cached.fromCache }
}

/** `GET /api/reports/profitability` (`21` §14) — ตารางตามมิติ + KPI ยอดรวม */
export async function getProfitability(
  user: SessionUser,
  query: ProfitabilityQuery,
  now: Date = new Date(),
): Promise<ProfitabilityReportDto> {
  const { entries, range, computedAt, fromCache } = await resolveProfitEntries(user.organizationId, query, now)
  const summary = summarizeProfitability(entries.revenues, entries.costs)

  return {
    dimension: query.dimension,
    periodType: range.type,
    periodLabel: range.label,
    startDate: toIsoDateOnly(range.startDate),
    endDate: toIsoDateOnly(range.endDate),
    rows: summary.rows.map((row) => ({
      key: row.key,
      label: row.label,
      revenueSatang: row.revenueSatang,
      directCostSatang: row.directCostSatang,
      grossProfitSatang: row.grossProfitSatang,
      marginPct: row.marginPct,
      revenueCaseCount: row.revenueCaseCount,
      costCaseCount: row.costCaseCount,
    })),
    total: {
      revenueSatang: summary.total.revenueSatang,
      directCostSatang: summary.total.directCostSatang,
      grossProfitSatang: summary.total.grossProfitSatang,
      marginPct: summary.total.marginPct,
    },
    computedAt: computedAt.toISOString(),
    fromCache,
  }
}

/**
 * `GET /api/reports/profitability/:dimension_id/drilldown` (`21` §14) — รายละเอียดของมิติเดียว
 *
 * ใช้ชุดข้อมูลเดียวกับตารางสรุป ⇒ ยอดตรงกันเสมอตาม `21` §15
 */
export async function getProfitabilityDrilldown(
  user: SessionUser,
  dimensionId: string,
  query: ProfitabilityQuery,
  now: Date = new Date(),
): Promise<ProfitabilityDrilldownDto> {
  const { entries, range } = await resolveProfitEntries(user.organizationId, query, now)
  const summary = summarizeProfitability(entries.revenues, entries.costs)
  const row = summary.rows.find((item) => item.key === dimensionId)
  if (row === undefined) {
    throw new ReportError(query.dimension === 'company' ? 'COMPANY_NOT_FOUND' : 'TEAM_NOT_FOUND', {
      detail: `dimension=${query.dimension} id=${dimensionId}`,
    })
  }

  const inDimension = <T extends { key: string | null }>(item: T): boolean => (item.key ?? '__unassigned__') === dimensionId
  const revenues = entries.revenues.filter(inDimension)
  const costs = entries.costs.filter(inDimension)

  return {
    dimension: query.dimension,
    dimensionId,
    dimensionLabel: row.label,
    periodLabel: range.label,
    revenueSatang: row.revenueSatang,
    directCostSatang: row.directCostSatang,
    grossProfitSatang: row.grossProfitSatang,
    marginPct: row.marginPct,
    revenueCaseCount: row.revenueCaseCount,
    costCaseCount: row.costCaseCount,
    costBreakdown: summarizeCostBreakdown(costs),
    lossMaking: countCasesWithCostOnly(revenues, costs),
  }
}

// ── แดชบอร์ด (`14` §6.1) ────────────────────────────────────────────────────

/**
 * Claim ที่ยังอยู่ในสายอนุมัติ (`14` §6.1 "status != approved/rejected")
 * — `superseded` ถูกแทนที่ไปแล้ว (`41` §10.1) นับเป็นเงินรออนุมัติไม่ได้
 */
const PENDING_CLAIM_STATUSES = [
  'pending_warehouse_confirm',
  'pending_approval',
  'pending_finance_approval',
  'needs_revision',
] as const

/** `GET /api/finance/dashboard-kpi` (`14` §14) — KPI 4 ตัว + ตัวนับ exception */
export async function getDashboardKpi(
  user: SessionUser,
  query: DashboardKpiQuery,
  now: Date = new Date(),
): Promise<DashboardKpiReportDto> {
  const organizationId = user.organizationId
  const asOf = query.asOf ?? now

  const [claims, payouts, billings, exceptions, profit] = await Promise.all([
    prisma.expense.findMany({
      where: { organizationId, deletedAt: null, status: { in: [...PENDING_CLAIM_STATUSES] } },
      select: { id: true, grossSatang: true },
    }),
    prisma.payoutBatch.findMany({
      where: { organizationId, deletedAt: null, status: { not: 'completed' } },
      select: { id: true, netSatang: true },
    }),
    prisma.billingBatch.findMany({
      where: {
        organizationId,
        deletedAt: null,
        // บิลที่ยัง `draft` ยังไม่ใช่ลูกหนี้การค้า — กติกาเดียวกับ AR Aging (`19` §9.1)
        status: { in: ['sent', 'partially_paid', 'paid'] },
      },
      select: {
        id: true,
        totalSatang: true,
        receivedSatang: true,
        whtWithheldByCustomerSatang: true,
      },
    }),
    prisma.exception.findMany({
      where: { organizationId, status: 'open' },
      select: { level: true },
    }),
    getProfitability(user, { dimension: 'company', period: 'month', refresh: query.refresh, asOf }, now),
  ])

  const adjustmentRows = await prisma.adjustment.findMany({
    where: {
      organizationId,
      status: 'approved',
      OR: [
        { expenseId: { in: claims.map((row) => row.id) } },
        { payoutBatchId: { in: payouts.map((row) => row.id) } },
        { billingBatchId: { in: billings.map((row) => row.id) } },
      ],
    },
    select: {
      expenseId: true,
      payoutBatchId: true,
      billingBatchId: true,
      adjustmentType: true,
      amountSatang: true,
      status: true,
    },
  })

  const claimAdjustments = indexAdjustments(adjustmentRows.map((row) => ({ ...row, targetId: row.expenseId })))
  const payoutAdjustments = indexAdjustments(adjustmentRows.map((row) => ({ ...row, targetId: row.payoutBatchId })))
  const billingAdjustments = indexAdjustments(adjustmentRows.map((row) => ({ ...row, targetId: row.billingBatchId })))

  const pendingClaimSatang = sumSatang(
    claims.map((row) => netOf(row.grossSatang, claimAdjustments, row.id)),
    'เงินรออนุมัติ',
  )
  const pendingPayoutSatang = sumSatang(
    payouts.map((row) => netOf(row.netSatang, payoutAdjustments, row.id)),
    'เงินรอจ่าย',
  )
  const outstandingRows = billings
    .map((row) =>
      arOutstandingSatang({
        totalSatang: netOf(row.totalSatang, billingAdjustments, row.id),
        // WHT ที่ลูกค้าหักไว้ (A1) ถือว่ารับชำระแล้ว — รวมให้ที่ `settledSatang()` ที่เดียว (`19` §6.4)
        receivedSatang: row.receivedSatang,
        whtWithheldByCustomerSatang: row.whtWithheldByCustomerSatang,
      }),
    )
    .filter((value) => value > 0)
  const arOutstanding = sumSatang(outstandingRows, 'ยอดค้างรับ')

  const amounts: Readonly<Record<(typeof DASHBOARD_KPI_META)[number]['id'], { amountSatang: number; hint: string }>> = {
    pending_approval: { amountSatang: pendingClaimSatang, hint: `${claims.length} รายการ` },
    pending_payout: { amountSatang: pendingPayoutSatang, hint: `${payouts.length} รอบ` },
    ar_outstanding: { amountSatang: arOutstanding, hint: `${outstandingRows.length} รอบวางบิลค้างชำระ` },
    gross_profit: {
      amountSatang: profit.total.grossProfitSatang,
      hint: `รายได้ ${profit.rows.length} มิติ · ${profit.periodLabel}`,
    },
  }

  const kpis: DashboardKpiDto[] = DASHBOARD_KPI_META.map((meta) => ({
    ...meta,
    ...amounts[meta.id],
    ...(meta.id === 'gross_profit' ? { marginPct: profit.total.marginPct } : {}),
  }))

  return {
    periodLabel: profit.periodLabel,
    kpis,
    exceptions: countExceptionLevels(exceptions),
    computedAt: now.toISOString(),
  }
}

/** `GET /api/finance/exceptions` (`14` §14) — รายการ alert ทั้งระบบ (อ่านอย่างเดียว) */
export async function getExceptions(user: SessionUser, query: ExceptionListQuery): Promise<ExceptionListDto> {
  const rows = await prisma.exception.findMany({
    where: {
      organizationId: user.organizationId,
      ...(query.level === 'all' ? {} : { level: query.level as ExceptionLevel }),
      ...(query.status === 'all' ? {} : { status: query.status }),
    },
    select: {
      id: true,
      level: true,
      status: true,
      title: true,
      description: true,
      sourceModule: true,
      sourceRef: true,
      createdAt: true,
      period: { select: { periodLabel: true } },
    },
    orderBy: { createdAt: 'desc' },
  })

  const sorted = rows
    .map((row) => ({
      id: row.id,
      level: row.level,
      status: row.status,
      title: row.title,
      description: row.description,
      sourceModule: row.sourceModule,
      sourceModuleLabel: exceptionModuleLabel(row.sourceModule),
      sourceRef: row.sourceRef,
      periodLabel: row.period.periodLabel,
      link: exceptionLinkOf(row.sourceModule),
      createdAt: row.createdAt.toISOString(),
    }))
    // critical ขึ้นก่อนเสมอ แล้วจึงเรียงใหม่→เก่าภายในระดับเดียวกัน
    .sort((a, b) => compareExceptionLevel(a.level, b.level) || b.createdAt.localeCompare(a.createdAt))

  return { rows: sorted, counts: countExceptionLevels(rows) }
}
