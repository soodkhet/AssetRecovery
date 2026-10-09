import { netAfterAdjustments } from '@/lib/adjustments/adjustment'
import { sumSatang } from '@/lib/finance/satang'
import { caseStatusLabel } from '@/lib/cases/status-display'
import { endOfBangkokDay, startOfBangkokDay } from '@/lib/format/datetime'
import { bangkokBusinessDate } from '@/lib/field/expense-queries'
import type {
  AdjustmentStatus,
  AdjustmentType,
  BillingBatchStatus,
} from '@/lib/generated/prisma/enums'
import { prisma } from '@/lib/prisma'
import { LEGACY_WHT_POLICY } from '@/lib/settings/wht-policy'
import { ReportError } from '@/lib/reports/errors'
import {
  ADVANCE_AGING_GROUP_BYS,
  ADVANCE_AGING_STATUSES,
  buildAdvanceAgingReport,
  type AdvanceAgingEntry,
  type AdvanceAgingGroupBy,
} from '@/lib/reports/finance/advance-aging-report'
import { buildArAgingReport } from '@/lib/reports/finance/ar-aging-report'
import { loadArAgingCompanies } from '@/lib/reports/finance/ar-source'
import {
  batchAdjustmentShareInRange,
  batchAdjustmentSharesByRevenue,
  type BatchLevelAdjustment,
  type BatchRevenueMember,
} from '@/lib/reports/finance/batch-adjustments'
import {
  buildCompensationReport,
  isReceiptExpense,
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
  type RevenueSummaryFailCase,
} from '@/lib/reports/finance/revenue-summary-report'
import {
  buildRevenueReconciliation,
  type RevenueReconciliationInput,
} from '@/lib/reports/finance/revenue-reconciliation'
import type { ReportData } from '@/lib/reports/payload'
import { resolveReportPeriod, toIsoDateOnly } from '@/lib/reports/period'
import { PROFIT_DIMENSIONS, summarizeProfitability, type ProfitDimension } from '@/lib/reports/profitability'
import { loadProfitEntries } from '@/lib/reports/queries'
import { previousReportRange, type ReportRange } from '@/lib/reports/range'
import type { ReportContext, ReportProvider } from '@/lib/reports/provider-types'
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

/**
 * ตัวกรองเพิ่มของรายงานที่ scope เฉพาะ**บริษัทไฟแนนซ์เดียว** (พอร์ทัล `97` §6.5 · มติ O43 D9)
 * — ใช้ query/สูตรชุดเดียวกับรายงานภายใน (ไม่ทำสูตรซ้ำ) แค่จำกัดแถว
 */
export interface CompanyReportFilter {
  /** เฉพาะบริษัทนี้ */
  companyId?: string
  /** เฉพาะรายได้ที่อยู่ในรอบวางบิลสถานะเหล่านี้ (พอร์ทัล = `sent` ขึ้นไป — draft ห้ามรั่ว) */
  billingStatuses?: readonly BillingBatchStatus[]
  /**
   * แทนยอด "หลังรายการปรับปรุง" ด้วยยอดที่ผู้เรียกกำหนดต่อ `revenue.id` — พอร์ทัลใช้ยอดตามเอกสาร
   * (ใบกำกับ/ใบลดหนี้ — มติ PO 05/10/2569 U14) · ไม่ระบุ = ยอดหลัง Adjustment ตามรายงานภายใน (`22` §6.12)
   * · revenue ที่ไม่มีคีย์ใน Map ⇒ 0
   */
  revenueAmounts?: (
    rows: readonly { id: string; billingBatchId: string | null; grossSatang: number }[],
  ) => Promise<ReadonlyMap<string, number>>
}

export async function loadRevenueEntries(
  organizationId: string,
  groupBy: RevenueGroupBy,
  range: { startDate: Date; endDate: Date },
  teamIds: readonly string[] | null,
  filter: CompanyReportFilter = {},
): Promise<RevenueSummaryEntry[]> {
  const rows = await prisma.revenue.findMany({
    where: {
      organizationId,
      deletedAt: null,
      revenueDate: { gte: range.startDate, lte: range.endDate },
      ...(teamIds === null ? {} : { case: { assignedTeamId: { in: [...teamIds] } } }),
      ...(filter.companyId === undefined ? {} : { companyId: filter.companyId }),
      ...(filter.billingStatuses === undefined
        ? {}
        : { billingBatch: { deletedAt: null, status: { in: [...filter.billingStatuses] } } }),
    },
    select: {
      id: true,
      caseId: true,
      companyId: true,
      billingBatchId: true,
      grossSatang: true,
      revenueDate: true,
      company: { select: { name: true } },
      case: { select: { status: true } },
    },
  })

  if (filter.revenueAmounts !== undefined) {
    const amounts = rows.length === 0 ? new Map<string, number>() : await filter.revenueAmounts(rows)
    return rows.map((row) => ({
      ...revenueGroupOf(groupBy, { revenueDate: row.revenueDate, companyId: row.companyId, companyName: row.company.name }),
      caseId: row.caseId,
      caseStatus: row.case.status,
      revenueSatang: amounts.get(row.id) ?? 0,
    }))
  }

  const batchIds = [...new Set(rows.map((row) => row.billingBatchId).filter((id): id is string => id !== null))]
  const [adjustments, batchLevel] = await Promise.all([
    rows.length === 0
      ? []
      : prisma.adjustment.findMany({
          where: {
            organizationId,
            status: 'approved',
            revenueId: { in: rows.map((row) => row.id) },
          },
          select: { revenueId: true, adjustmentType: true, amountSatang: true },
        }),
    loadBatchLevelAdjustments(organizationId, batchIds),
  ])
  const index = indexBy(adjustments.map((row) => ({ ...row, targetId: row.revenueId })))
  // U69 — Adjustment ระดับรอบวางบิลกระจายลงรายได้ในรอบตามสัดส่วนยอดเคส
  const batchShares = batchAdjustmentSharesByRevenue(batchLevel.members, batchLevel.adjustments)

  return rows.map((row) => ({
    ...revenueGroupOf(groupBy, {
      revenueDate: row.revenueDate,
      companyId: row.companyId,
      companyName: row.company.name,
    }),
    caseId: row.caseId,
    caseStatus: row.case.status,
    // `22` §6.12 — ยอดก่อน VAT หลังรายการปรับปรุงที่อนุมัติแล้ว (ระดับรายได้ + ส่วนแบ่งระดับรอบวางบิล — U69)
    revenueSatang: netOf(row.grossSatang, index, row.id) + (batchShares.get(row.id) ?? 0),
  }))
}

/**
 * Adjustment ที่อนุมัติแล้วซึ่งผูก**รอบวางบิล** (ไม่ผูกรายได้ใบใด) ของรอบที่ระบุ + รายได้ทุกใบของรอบเหล่านั้น
 * (ฐานการกระจายตามสัดส่วน — มติ PO U69) · ใช้ร่วมกันระหว่าง F2 กับบรรทัดกระทบยอด U44 ⇒ ยอดชุดเดียวกัน
 * · รายได้โหลดเฉพาะรอบที่มี Adjustment ระดับรอบจริง (ส่วนใหญ่ไม่มี ⇒ query เดียวจบ)
 */
async function loadBatchLevelAdjustments(
  organizationId: string,
  batchIds: readonly string[],
): Promise<{
  adjustments: (BatchLevelAdjustment & { hasActiveNote: boolean })[]
  members: BatchRevenueMember[]
}> {
  if (batchIds.length === 0) return { adjustments: [], members: [] }
  const rows = await prisma.adjustment.findMany({
    where: { organizationId, status: 'approved', revenueId: null, billingBatchId: { in: [...batchIds] } },
    select: {
      billingBatchId: true,
      adjustmentType: true,
      amountSatang: true,
      creditNotes: { where: { status: 'active' }, select: { id: true } },
    },
    orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
  })
  const adjustments = rows.flatMap((row) =>
    row.billingBatchId === null
      ? []
      : [
          {
            billingBatchId: row.billingBatchId,
            adjustmentType: row.adjustmentType,
            amountSatang: row.amountSatang,
            hasActiveNote: row.creditNotes.length > 0,
          },
        ],
  )
  if (adjustments.length === 0) return { adjustments, members: [] }
  const members = await prisma.revenue.findMany({
    where: {
      organizationId,
      deletedAt: null,
      billingBatchId: { in: [...new Set(adjustments.map((row) => row.billingBatchId))] },
    },
    select: { id: true, billingBatchId: true, grossSatang: true },
  })
  return { adjustments, members }
}

/**
 * เคสที่**ปิดไม่สำเร็จ**ในช่วงรายงาน — ตัวหารของ % สำเร็จใน F2 (มติ PO 05/10/2569 U55/O30)
 * เคส `closed_fail` ไม่มีรายได้ ⇒ `loadRevenueEntries()` มองไม่เห็น · จัดกลุ่มด้วย**วันที่ปิดเคส (เวลาไทย)**
 * และบริษัทของเคส · ใช้ตัวกรองทีม/บริษัทชุดเดียวกับรายได้ (`billingStatuses` ไม่เกี่ยว — เคสนี้ไม่มีบิล)
 */
export async function loadRevenueFailCases(
  organizationId: string,
  groupBy: RevenueGroupBy,
  range: { startDate: Date; endDate: Date },
  teamIds: readonly string[] | null,
  filter: Pick<CompanyReportFilter, 'companyId'> = {},
): Promise<RevenueSummaryFailCase[]> {
  const rows = await prisma.case.findMany({
    where: {
      organizationId,
      deletedAt: null,
      status: 'closed_fail',
      closedAt: { gte: startOfBangkokDay(range.startDate), lte: endOfBangkokDay(range.endDate) },
      ...(teamIds === null ? {} : { assignedTeamId: { in: [...teamIds] } }),
      ...(filter.companyId === undefined ? {} : { companyId: filter.companyId }),
    },
    select: { id: true, closedAt: true, companyId: true, company: { select: { name: true } } },
  })
  return rows.flatMap((row) =>
    row.closedAt === null
      ? []
      : [
          {
            ...revenueGroupOf(groupBy, {
              revenueDate: bangkokBusinessDate(row.closedAt),
              companyId: row.companyId,
              companyName: row.company.name,
            }),
            caseId: row.id,
          },
        ],
  )
}

/**
 * ข้อมูลของบรรทัดกระทบยอด F2 ↔ ใบกำกับภาษี (มติ PO 05/10/2569 U44) — รายได้ในช่วงเดียวกับรายงาน
 * + Adjustment ที่อนุมัติแล้วของรายได้/รอบวางบิลนั้น + ใบลดหนี้/ใบเพิ่มหนี้ active ของใบกำกับในรอบเหล่านั้น
 * (สูตรอยู่ที่ `buildRevenueReconciliation()` — ที่นี่แค่ query · ไม่กรองทีม: ผู้เรียกใช้เฉพาะมุมมององค์กร)
 */
export async function loadRevenueReconciliationInput(
  organizationId: string,
  range: { startDate: Date; endDate: Date },
): Promise<Omit<RevenueReconciliationInput, 'reportTotalSatang'>> {
  const revenues = await prisma.revenue.findMany({
    where: { organizationId, deletedAt: null, revenueDate: { gte: range.startDate, lte: range.endDate } },
    select: { id: true, billingBatchId: true, grossSatang: true },
  })
  const batchIds = [
    ...new Set(revenues.map((row) => row.billingBatchId).filter((id): id is string => id !== null)),
  ]
  const invoices =
    batchIds.length === 0
      ? []
      : await prisma.taxInvoice.findMany({
          where: { organizationId, salesRecord: { billingBatchId: { in: batchIds } } },
          select: {
            status: true,
            salesRecord: { select: { billingBatchId: true } },
            creditNotes: {
              where: { status: 'active' },
              select: { noteType: true, amountBeforeVatSatang: true },
            },
          },
        })
  const invoicedBatches = new Set(
    invoices.filter((row) => row.status === 'active').map((row) => row.salesRecord.billingBatchId),
  )
  const isInvoiced = (batchId: string | null): boolean => batchId !== null && invoicedBatches.has(batchId)
  const revenueBatch = new Map(revenues.map((row) => [row.id, row.billingBatchId]))

  const [adjustments, batchLevel] = await Promise.all([
    revenues.length === 0
      ? []
      : prisma.adjustment.findMany({
          where: { organizationId, status: 'approved', revenueId: { in: revenues.map((row) => row.id) } },
          select: {
            adjustmentType: true,
            amountSatang: true,
            revenueId: true,
            billingBatchId: true,
            creditNotes: { where: { status: 'active' }, select: { id: true } },
          },
        }),
    loadBatchLevelAdjustments(organizationId, batchIds),
  ])
  // U69 — Adjustment ระดับรอบนับเฉพาะส่วนที่กระจายลงรายได้ในช่วงรายงาน (ตัวเดียวกับที่ F2 นับ) ⇒ กระทบยอดลงตัว
  const inRange = new Set(revenues.map((row) => row.id))
  const batchLevelInRange = batchLevel.adjustments.flatMap((row) => {
    const share = batchAdjustmentShareInRange(row, batchLevel.members, inRange)
    return share === 0
      ? []
      : [
          {
            adjustmentType: row.adjustmentType,
            amountSatang: share,
            invoiced: isInvoiced(row.billingBatchId),
            hasActiveNote: row.hasActiveNote,
          },
        ]
  })

  return {
    revenues: revenues.map((row) => ({ grossSatang: row.grossSatang, invoiced: isInvoiced(row.billingBatchId) })),
    adjustments: [
      ...adjustments.map((row) => ({
        adjustmentType: row.adjustmentType,
        amountSatang: row.amountSatang,
        invoiced: isInvoiced(row.revenueId === null ? row.billingBatchId : (revenueBatch.get(row.revenueId) ?? null)),
        hasActiveNote: row.creditNotes.length > 0,
      })),
      ...batchLevelInRange,
    ],
    notes: invoices.flatMap((row) => row.creditNotes),
  }
}

const revenueSummaryProvider: ReportProvider = async (ctx: ReportContext): Promise<ReportData> => {
  const groupBy = pickParam<RevenueGroupBy>(ctx.params['groupBy'], REVENUE_GROUP_BYS, 'month')
  const [entries, previousEntries, failCases, reconciliationInput] = await Promise.all([
    loadRevenueEntries(ctx.user.organizationId, groupBy, ctx.range, ctx.teamIds),
    loadRevenueEntries(ctx.user.organizationId, groupBy, previousReportRange(ctx.range), ctx.teamIds),
    loadRevenueFailCases(ctx.user.organizationId, groupBy, ctx.range, ctx.teamIds),
    // U44 — กระทบยอดกับเอกสารภาษีเป็นมุมมองระดับองค์กร (เอกสารออกต่อรอบวางบิล ไม่ใช่ต่อทีม) ⇒ ผู้ที่เห็นเฉพาะทีมไม่ได้บรรทัดนี้
    ctx.teamIds === null ? loadRevenueReconciliationInput(ctx.user.organizationId, ctx.range) : Promise.resolve(null),
  ])
  const summary = buildRevenueSummary({ groupBy, entries, previousEntries, failCases })
  if (reconciliationInput === null) return summary
  const reportTotalSatang = sumSatang(entries.map((entry) => entry.revenueSatang), 'รายได้รวม')
  return {
    ...summary,
    reconciliation: buildRevenueReconciliation({ ...reconciliationInput, reportTotalSatang }),
  }
}

// ── F3 — อายุหนี้ลูกค้า (`96` §6-F3) ────────────────────────────────────────

// `loadArAgingCompanies()` ย้ายไป `./ar-source` (O74 — แดชบอร์ด KPI ใช้ร่วมโดยไม่เกิด import วน)
export { loadArAgingCompanies } from '@/lib/reports/finance/ar-source'

const arAgingProvider: ReportProvider = async (ctx: ReportContext): Promise<ReportData> => {
  const asOf = reportAsOfDate(ctx.range, ctx.now)
  const policy = await getFinancePolicy(ctx.user.organizationId)

  // ลูกหนี้การค้าเป็นยอดระดับ**บริษัทไฟแนนซ์** ไม่มีมิติทีมให้กรอง ⇒ ผู้ที่เห็นได้เฉพาะทีมตัวเอง
  // ต้องไม่เห็นยอดรวมทั้งองค์กร (`96` §10 — ห้ามตีความว่า "ทุกทีม")
  if (ctx.teamIds !== null) {
    return buildArAgingReport({ companies: [], buckets: policy.arAgingBuckets, asOf })
  }

  const companies = await loadArAgingCompanies(ctx.user.organizationId)
  return buildArAgingReport({ companies, buckets: policy.arAgingBuckets, asOf })
}

// ── F4 — สรุปค่าตอบแทน (`96` §6-F4) ─────────────────────────────────────────

const compensationProvider: ReportProvider = async (ctx: ReportContext): Promise<ReportData> => {
  const groupBy = pickParam<CompensationGroupBy>(ctx.params['groupBy'], COMPENSATION_GROUP_BYS, 'team')
  const teamIds = ctx.teamIds

  const rows = await prisma.payoutBatchItem.findMany({
    where: {
      organizationId: ctx.user.organizationId,
      // มติ PO U67 — รอบที่ยกเลิกไม่นับ (รายการกลับไปรอจ่ายแล้วจะถูกนับจากรอบใหม่ครั้งเดียว)
      payoutBatch: { deletedAt: null, status: { not: 'cancelled' } },
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
      // snapshot เงื่อนไขการหัก (U105) — แยกภาษีที่บริษัทออกให้ออกจากค่าตอบแทน (มติ PO U109)
      whtCondition: true,
      // snapshot ค่าตั้งฐาน WHT ของรอบ (U3/U8) — ใช้จำแนก "ค่าใช้จ่ายตามใบเสร็จ" (มติ PO U53)
      payoutBatch: { select: { whtBaseExpenseTypes: true, whtCertificateMode: true } },
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
    // รอบที่สร้างก่อนมีค่าตั้ง (snapshot NULL) ⇒ ทุกชนิดอยู่ในฐาน = พฤติกรรมเดิม (Rule 08 ห้ามใช้ค่าตั้งปัจจุบันตีความ)
    receiptExpense: isReceiptExpense(
      {
        baseExpenseTypes:
          row.payoutBatch.whtCertificateMode === null
            ? LEGACY_WHT_POLICY.baseExpenseTypes
            : row.payoutBatch.whtBaseExpenseTypes,
      },
      row.expense?.expenseType ?? null,
    ),
    whtCondition: row.whtCondition,
    grossSatang: row.grossSatang,
    whtSatang: row.whtSatang,
    netSatang: row.netSatang,
  }))

  return buildCompensationReport({ groupBy, items })
}

// ── F5 — อายุเงินทดรองคงค้าง (`96` §6-F5 · มติ PO U96 #18) ──────────────────

const advanceAgingProvider: ReportProvider = async (ctx: ReportContext): Promise<ReportData> => {
  const asOf = reportAsOfDate(ctx.range, ctx.now)
  const teamIds = ctx.teamIds
  const groupBy = pickParam<AdvanceAgingGroupBy>(ctx.params['groupBy'], ADVANCE_AGING_GROUP_BYS, 'advance')

  // ดึงกว้าง (ยังไม่เคลียร์ทุกใบ + เคลียร์แล้วที่ยอดคืนอาจยังไม่ปิด) — ตัวตัดสินว่ามียอดคงค้างจริงคือ
  // `buildAdvanceAgingReport()` (ยอดคืนค้าง `22` §6.14) · จ่าย/อนุมัติหลังวันดูรายงานไม่นับ
  const rows = await prisma.advance.findMany({
    where: {
      organizationId: ctx.user.organizationId,
      deletedAt: null,
      status: { in: [...ADVANCE_AGING_STATUSES] },
      returnSatang: { gt: 0 },
      ...(teamIds === null ? {} : { payee: { user: { teamId: { in: [...teamIds] } } } }),
    },
    select: {
      id: true,
      advanceNumber: true,
      payeeId: true,
      status: true,
      approvedAt: true,
      dueClearDate: true,
      approvedSatang: true,
      usedSatang: true,
      returnSatang: true,
      returns: { where: { reversedAt: null }, select: { amountSatang: true } },
      payoutItems: {
        select: { payoutBatch: { select: { status: true, paymentFileGeneratedAt: true, updatedAt: true } } },
      },
      payee: { select: { user: { select: { fullName: true, team: { select: { name: true } } } } } },
    },
  })

  const advances: AdvanceAgingEntry[] = rows.map((row) => ({
    advanceId: row.id,
    advanceNumber: row.advanceNumber,
    payeeId: row.payeeId,
    payeeName: row.payee.user.fullName,
    teamName: row.payee.user.team?.name ?? null,
    status: row.status,
    approvedAt: row.approvedAt,
    dueClearDate: row.dueClearDate,
    approvedSatang: row.approvedSatang,
    usedSatang: row.usedSatang,
    returnSatang: row.returnSatang,
    collectedSatang: row.returns.map((entry) => entry.amountSatang),
    payoutBatches: row.payoutItems.map((item) => item.payoutBatch),
  }))

  return buildAdvanceAgingReport({ advances, asOf, groupBy })
}

/** ทะเบียนของหมวด F — `lib/reports/providers.ts` เอาไปต่อเข้า `REPORT_PROVIDERS` */
export const FINANCE_REPORT_PROVIDERS: Readonly<Record<string, ReportProvider>> = {
  'gross-profit': grossProfitProvider,
  'revenue-summary': revenueSummaryProvider,
  'ar-aging': arAgingProvider,
  compensation: compensationProvider,
  'advance-overdue': advanceAgingProvider,
}
