import { netAfterAdjustments } from '@/lib/adjustments/adjustment'
import { caseStatusLabel } from '@/lib/cases/status-display'
import { bangkokBusinessDate } from '@/lib/field/expense-queries'
import type { ArAgingRow } from '@/lib/finance/ar-calc'
import type { AdjustmentStatus, AdjustmentType, AdvanceStatus } from '@/lib/generated/prisma/enums'
import { prisma } from '@/lib/prisma'
import { ReportError } from '@/lib/reports/errors'
import {
  buildAdvanceOverdueReport,
  type AdvanceOverdueEntry,
} from '@/lib/reports/finance/advance-overdue-report'
import { buildArAgingReport, type ArAgingCompanyEntry } from '@/lib/reports/finance/ar-aging-report'
import {
  buildCompensationReport,
  COMPENSATION_GROUP_BYS,
  type CompensationGroupBy,
  type CompensationItemEntry,
} from '@/lib/reports/finance/compensation-report'
import {
  buildGrossProfitDrilldown,
  buildGrossProfitSummary,
  type GrossProfitCaseRow,
} from '@/lib/reports/finance/gross-profit-report'
import {
  buildRevenueSummary,
  REVENUE_GROUP_BYS,
  type RevenueGroupBy,
  type RevenueSummaryEntry,
} from '@/lib/reports/finance/revenue-summary-report'
import type { ReportData } from '@/lib/reports/payload'
import { resolveReportPeriod, toIsoDateOnly } from '@/lib/reports/period'
import { PROFIT_DIMENSIONS, summarizeProfitability, type ProfitDimension } from '@/lib/reports/profitability'
import { loadProfitEntries } from '@/lib/reports/queries'
import { previousReportRange, type ReportRange } from '@/lib/reports/range'
import type { ReportContext, ReportProvider } from '@/lib/reports/providers'
import { getFinancePolicy } from '@/lib/settings/queries/finance-policy'

/**
 * ตัวคำนวณของ **รายงานหมวด F (F1–F5)** — ชั้น DB ของ `96` §6-F
 *
 * ### กติกาที่ห้ามหลุด (ทั้งไฟล์)
 * - **อ่านอย่างเดียว** (`96` §1/§15) — ไม่มี mutation ⇒ ไม่มี audit · ห้ามเพิ่มฟังก์ชันเขียนที่นี่
 * - กรอง `organization_id` ทุก query เสมอ (multi-tenant — Rule 02) และถ้า `ctx.teamIds !== null`
 *   ต้องกรองทีมด้วย · **รายการทีมว่าง = ผลลัพธ์ว่าง ห้ามตีความว่า "ทุกทีม"** (`96` §10)
 * - **ยอดทุกก้อนต้องผ่าน `netAfterAdjustments()`** (`20` §9) ยกเว้นรายการที่ตัว record เป็น
 *   snapshot อยู่แล้วและ adjustment ผูกที่ระดับอื่น (F4 — ดูหมายเหตุในตัวรายงาน)
 * - **สูตรทั้งหมดอยู่ในโมดูล pure** (`lib/finance/*` + `lib/reports/finance/*-report.ts`)
 *   ไฟล์นี้ทำแค่ "ดึงข้อมูล → ส่งเข้าโมดูล pure" ห้ามคำนวณเงินตรงนี้
 * - แคช/สิทธิ์/ช่วงเวลา จัดการโดย `runReport()` แล้ว — provider ห้ามแตะ (6.1)
 */

// ── ตัวช่วยร่วม ──────────────────────────────────────────────────────────────

/**
 * ค่าพารามิเตอร์ที่รับได้ — ค่าที่ไม่รู้จักตกกลับค่าเริ่มต้น (ไฟล์ 21 §11 · 14 §11 กำหนดว่ารายงาน
 * เป็น read-only view "ไม่มี validation" ⇒ ไม่มี error code สำหรับพารามิเตอร์เพี้ยนใน `24`)
 */
export function pickParam<T extends string>(
  value: string | undefined,
  options: readonly T[],
  fallback: T,
): T {
  return options.includes(value as T) ? (value as T) : fallback
}

/** วันที่ใช้อ้างอิงของรายงานแบบ "ณ วันใดวันหนึ่ง" — ไม่เกินวันนี้ตามปฏิทินไทย */
export function reportAsOfDate(range: ReportRange, now: Date): Date {
  const today = bangkokBusinessDate(now)
  return range.endDate.getTime() < today.getTime() ? range.endDate : today
}

interface AdjustmentRow {
  adjustmentType: AdjustmentType
  amountSatang: number
  status: AdjustmentStatus
}

/** ยอดสุทธิหลังรายการปรับปรุงที่อนุมัติแล้ว (`20` §9) */
function netOf(baseSatang: number, index: Map<string, AdjustmentRow[]>, targetId: string): number {
  return netAfterAdjustments(baseSatang, index.get(targetId) ?? [])
}

/**
 * จัดรายการปรับปรุงเข้ากับ record ต้นทาง — ผู้เรียก query ด้วย `status: 'approved'` มาแล้ว
 * (ยังคง `status` ไว้ในโครงสร้างเพราะ `netAfterAdjustments()` กรองซ้ำอีกชั้นเป็นยามท้ายทาง)
 */
function indexBy(
  rows: readonly { targetId: string | null; adjustmentType: AdjustmentType; amountSatang: number }[],
): Map<string, AdjustmentRow[]> {
  const index = new Map<string, AdjustmentRow[]>()
  for (const row of rows) {
    if (row.targetId === null) continue
    const entry: AdjustmentRow = {
      adjustmentType: row.adjustmentType,
      amountSatang: row.amountSatang,
      status: 'approved',
    }
    const list = index.get(row.targetId)
    if (list === undefined) index.set(row.targetId, [entry])
    else list.push(entry)
  }
  return index
}

// ── F1 — กำไรขั้นต้น (`96` §6-F1) ───────────────────────────────────────────

async function loadDrilldownCases(
  organizationId: string,
  caseIds: readonly string[],
): Promise<Map<string, { caseRef: string; status: string; companyName: string; teamName: string | null }>> {
  if (caseIds.length === 0) return new Map()
  const rows = await prisma.case.findMany({
    where: { organizationId, id: { in: [...caseIds] } },
    select: {
      id: true,
      caseRef: true,
      status: true,
      company: { select: { name: true } },
      assignedTeam: { select: { name: true } },
    },
  })
  return new Map(
    rows.map((row) => [
      row.id,
      {
        caseRef: row.caseRef,
        status: row.status,
        companyName: row.company.name,
        teamName: row.assignedTeam?.name ?? null,
      },
    ]),
  )
}

const grossProfitProvider: ReportProvider = async (ctx: ReportContext): Promise<ReportData> => {
  const dimension = pickParam<ProfitDimension>(ctx.params['dimension'], PROFIT_DIMENSIONS, 'company')
  const dimensionId = ctx.params['dimensionId'] ?? ''
  const scope = { teamIds: ctx.teamIds }

  const entries = await loadProfitEntries(ctx.user.organizationId, dimension, ctx.range, scope)
  const summary = summarizeProfitability(entries.revenues, entries.costs)

  if (dimensionId === '') {
    const previous = await loadProfitEntries(
      ctx.user.organizationId,
      dimension,
      previousReportRange(ctx.range),
      scope,
    )
    return buildGrossProfitSummary({
      dimension,
      summary,
      previousTotal: summarizeProfitability(previous.revenues, previous.costs).total,
    })
  }

  // ── drill-down รายเคสของมิติเดียว ──
  const row = summary.rows.find((item) => item.key === dimensionId)
  if (row === undefined) {
    throw new ReportError(dimension === 'company' ? 'COMPANY_NOT_FOUND' : 'TEAM_NOT_FOUND', {
      detail: `dimension=${dimension} id=${dimensionId}`,
    })
  }

  const inDimension = <T extends { key: string | null }>(item: T): boolean =>
    (item.key ?? '__unassigned__') === dimensionId

  const byCase = new Map<string, { revenueSatang: number; directCostSatang: number }>()
  const bucketOf = (caseId: string) => {
    const existing = byCase.get(caseId)
    if (existing !== undefined) return existing
    const created = { revenueSatang: 0, directCostSatang: 0 }
    byCase.set(caseId, created)
    return created
  }
  for (const revenue of entries.revenues.filter(inDimension)) {
    bucketOf(revenue.caseId).revenueSatang += revenue.revenueSatang
  }
  for (const cost of entries.costs.filter(inDimension)) {
    if (cost.caseId === null) continue
    bucketOf(cost.caseId).directCostSatang += cost.grossSatang
  }

  const meta = await loadDrilldownCases(ctx.user.organizationId, [...byCase.keys()])
  const cases: GrossProfitCaseRow[] = [...byCase.entries()]
    .map(([caseId, amounts]) => ({
      caseId,
      caseRef: meta.get(caseId)?.caseRef ?? null,
      companyName: meta.get(caseId)?.companyName ?? null,
      teamName: meta.get(caseId)?.teamName ?? null,
      status: meta.get(caseId)?.status ?? null,
      ...amounts,
    }))
    .sort(
      (a, b) =>
        b.revenueSatang - b.directCostSatang - (a.revenueSatang - a.directCostSatang) ||
        (a.caseRef ?? '').localeCompare(b.caseRef ?? ''),
    )

  return buildGrossProfitDrilldown({ dimension, dimensionLabel: row.label, cases, statusLabel: caseStatusLabel })
}

// ── F2 — สรุปรายได้ (`96` §6-F2) ────────────────────────────────────────────

/** คีย์/ป้ายของกลุ่ม — เดือน/ไตรมาสใช้ปฏิทินไทย + ป้าย พ.ศ. จาก `resolveReportPeriod()` (3.8) */
function revenueGroupOf(
  groupBy: RevenueGroupBy,
  row: { revenueDate: Date; companyId: string; companyName: string },
): Pick<RevenueSummaryEntry, 'groupKey' | 'groupLabel' | 'groupSort'> {
  if (groupBy === 'company') {
    return { groupKey: row.companyId, groupLabel: row.companyName, groupSort: row.companyName }
  }
  const period = resolveReportPeriod(groupBy === 'month' ? 'month' : 'quarter', row.revenueDate)
  const sort = toIsoDateOnly(period.startDate)
  return { groupKey: sort, groupLabel: period.label, groupSort: sort }
}

async function loadRevenueEntries(
  organizationId: string,
  groupBy: RevenueGroupBy,
  range: { startDate: Date; endDate: Date },
  teamIds: readonly string[] | null,
): Promise<RevenueSummaryEntry[]> {
  const rows = await prisma.revenue.findMany({
    where: {
      organizationId,
      deletedAt: null,
      revenueDate: { gte: range.startDate, lte: range.endDate },
      ...(teamIds === null ? {} : { case: { assignedTeamId: { in: [...teamIds] } } }),
    },
    select: {
      id: true,
      caseId: true,
      companyId: true,
      grossSatang: true,
      revenueDate: true,
      company: { select: { name: true } },
      case: { select: { status: true } },
    },
  })

  const adjustments =
    rows.length === 0
      ? []
      : await prisma.adjustment.findMany({
          where: {
            organizationId,
            status: 'approved',
            revenueId: { in: rows.map((row) => row.id) },
          },
          select: { revenueId: true, adjustmentType: true, amountSatang: true },
        })
  const index = indexBy(adjustments.map((row) => ({ ...row, targetId: row.revenueId })))

  return rows.map((row) => ({
    ...revenueGroupOf(groupBy, {
      revenueDate: row.revenueDate,
      companyId: row.companyId,
      companyName: row.company.name,
    }),
    caseId: row.caseId,
    caseStatus: row.case.status,
    // `22` §6.12 — ยอดก่อน VAT หลังรายการปรับปรุงที่อนุมัติแล้ว
    revenueSatang: netOf(row.grossSatang, index, row.id),
  }))
}

const revenueSummaryProvider: ReportProvider = async (ctx: ReportContext): Promise<ReportData> => {
  const groupBy = pickParam<RevenueGroupBy>(ctx.params['groupBy'], REVENUE_GROUP_BYS, 'month')
  const [entries, previousEntries] = await Promise.all([
    loadRevenueEntries(ctx.user.organizationId, groupBy, ctx.range, ctx.teamIds),
    loadRevenueEntries(ctx.user.organizationId, groupBy, previousReportRange(ctx.range), ctx.teamIds),
  ])
  return buildRevenueSummary({ groupBy, entries, previousEntries })
}

// ── F3 — อายุหนี้ลูกค้า (`96` §6-F3) ────────────────────────────────────────

const arAgingProvider: ReportProvider = async (ctx: ReportContext): Promise<ReportData> => {
  const asOf = reportAsOfDate(ctx.range, ctx.now)
  const policy = await getFinancePolicy(ctx.user.organizationId)

  // ลูกหนี้การค้าเป็นยอดระดับ**บริษัทไฟแนนซ์** ไม่มีมิติทีมให้กรอง ⇒ ผู้ที่เห็นได้เฉพาะทีมตัวเอง
  // ต้องไม่เห็นยอดรวมทั้งองค์กร (`96` §10 — ห้ามตีความว่า "ทุกทีม")
  if (ctx.teamIds !== null) {
    return buildArAgingReport({ companies: [], buckets: policy.arAgingBuckets, asOf })
  }

  const rows = await prisma.billingBatch.findMany({
    where: {
      organizationId: ctx.user.organizationId,
      deletedAt: null,
      // บิลที่ยัง `draft` ยังไม่ได้ส่งให้ลูกค้า ⇒ ยังไม่ใช่ลูกหนี้การค้า (`19` §9.1)
      status: { in: ['sent', 'partially_paid', 'paid'] },
    },
    select: {
      id: true,
      companyId: true,
      dueDate: true,
      totalSatang: true,
      receivedSatang: true,
      whtWithheldByCustomerSatang: true,
      company: { select: { name: true } },
    },
  })

  const adjustments =
    rows.length === 0
      ? []
      : await prisma.adjustment.findMany({
          where: {
            organizationId: ctx.user.organizationId,
            status: 'approved',
            billingBatchId: { in: rows.map((row) => row.id) },
          },
          select: { billingBatchId: true, adjustmentType: true, amountSatang: true },
        })
  const index = indexBy(adjustments.map((row) => ({ ...row, targetId: row.billingBatchId })))

  const byCompany = new Map<string, { companyId: string; companyName: string; batches: ArAgingRow[] }>()
  for (const row of rows) {
    let entry = byCompany.get(row.companyId)
    if (entry === undefined) {
      entry = { companyId: row.companyId, companyName: row.company.name, batches: [] }
      byCompany.set(row.companyId, entry)
    }
    entry.batches.push({
      dueDate: row.dueDate,
      totalSatang: netOf(row.totalSatang, index, row.id),
      receivedSatang: row.receivedSatang,
      whtWithheldByCustomerSatang: row.whtWithheldByCustomerSatang,
    })
  }

  const companies: ArAgingCompanyEntry[] = [...byCompany.values()]
  return buildArAgingReport({ companies, buckets: policy.arAgingBuckets, asOf })
}

// ── F4 — สรุปค่าตอบแทน (`96` §6-F4) ─────────────────────────────────────────

const compensationProvider: ReportProvider = async (ctx: ReportContext): Promise<ReportData> => {
  const groupBy = pickParam<CompensationGroupBy>(ctx.params['groupBy'], COMPENSATION_GROUP_BYS, 'team')
  const teamIds = ctx.teamIds

  const rows = await prisma.payoutBatchItem.findMany({
    where: {
      organizationId: ctx.user.organizationId,
      payoutBatch: { deletedAt: null },
      // รายการเงินทดรองจ่าย (A4) ไม่ใช่ค่าตอบแทน — เอาเฉพาะที่มาจากรายการเบิก
      expenseId: { not: null },
      // งวดของรายงานอิง **วันที่เกิดรายการเบิก** (คอลัมน์ `DATE` ปฏิทินไทย) ฐานเดียวกับต้นทุนตรงของ F1
      expense: {
        deletedAt: null,
        expenseDate: { gte: ctx.range.startDate, lte: ctx.range.endDate },
      },
      ...(teamIds === null ? {} : { payee: { user: { teamId: { in: [...teamIds] } } } }),
    },
    select: {
      payeeId: true,
      grossSatang: true,
      whtSatang: true,
      netSatang: true,
      expense: { select: { expenseType: true, caseId: true } },
      payee: {
        select: {
          user: {
            select: {
              fullName: true,
              teamId: true,
              team: { select: { name: true, side: true } },
            },
          },
        },
      },
    },
  })

  const items: CompensationItemEntry[] = rows.map((row) => ({
    payeeId: row.payeeId,
    payeeName: row.payee.user.fullName,
    teamId: row.payee.user.teamId,
    teamName: row.payee.user.team?.name ?? null,
    teamSide: row.payee.user.team?.side ?? null,
    expenseType: row.expense?.expenseType ?? null,
    caseId: row.expense?.caseId ?? null,
    grossSatang: row.grossSatang,
    whtSatang: row.whtSatang,
    netSatang: row.netSatang,
  }))

  return buildCompensationReport({ groupBy, items })
}

// ── F5 — เงินทดรองค้างเคลียร์ (`96` §6-F5) ──────────────────────────────────

/** สถานะที่ยังถือเงินบริษัทอยู่ — `overdue` เกิดจาก job เท่านั้น (`15` §10) จึงต้องรวม `approved` ด้วย */
const UNCLEARED_ADVANCE_STATUSES: readonly AdvanceStatus[] = ['approved', 'overdue']

const advanceOverdueProvider: ReportProvider = async (ctx: ReportContext): Promise<ReportData> => {
  const asOf = reportAsOfDate(ctx.range, ctx.now)
  const teamIds = ctx.teamIds

  const rows = await prisma.advance.findMany({
    where: {
      organizationId: ctx.user.organizationId,
      deletedAt: null,
      status: { in: [...UNCLEARED_ADVANCE_STATUSES] },
      // ครบกำหนดวันนี้ยังไม่เกินกำหนด (`96` §14) — ตัวกรองสุดท้ายอยู่ที่ `buildAdvanceOverdueReport()`
      dueClearDate: { lt: asOf },
      ...(teamIds === null ? {} : { payee: { user: { teamId: { in: [...teamIds] } } } }),
    },
    select: {
      id: true,
      status: true,
      approvedAt: true,
      dueClearDate: true,
      approvedSatang: true,
      purpose: true,
      payee: { select: { user: { select: { fullName: true, team: { select: { name: true } } } } } },
    },
  })

  const advances: AdvanceOverdueEntry[] = rows.map((row) => ({
    advanceId: row.id,
    payeeName: row.payee.user.fullName,
    teamName: row.payee.user.team?.name ?? null,
    status: row.status,
    approvedAt: row.approvedAt,
    dueClearDate: row.dueClearDate,
    approvedSatang: row.approvedSatang,
    purpose: row.purpose,
  }))

  return buildAdvanceOverdueReport({ advances, asOf })
}

/** ทะเบียนของหมวด F — `lib/reports/providers.ts` เอาไปต่อเข้า `REPORT_PROVIDERS` */
export const FINANCE_REPORT_PROVIDERS: Readonly<Record<string, ReportProvider>> = {
  'gross-profit': grossProfitProvider,
  'revenue-summary': revenueSummaryProvider,
  'ar-aging': arAgingProvider,
  compensation: compensationProvider,
  'advance-overdue': advanceOverdueProvider,
}
