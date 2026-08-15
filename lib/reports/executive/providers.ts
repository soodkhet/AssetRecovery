import { arOutstandingSatang } from '@/lib/finance/ar-calc'
import { endOfBangkokDay, startOfBangkokDay } from '@/lib/format/datetime'
import type { CaseStatus } from '@/lib/generated/prisma/enums'
import { prisma } from '@/lib/prisma'
import {
  buildCompanyScorecardReport,
  type CompanyScorecardEntry,
} from '@/lib/reports/executive/company-scorecard-report'
import {
  buildKpiSummaryReport,
  lastMonthlyPeriods,
  TREND_MONTHS,
  type ExecutiveMonthEntry,
  type ExecutiveTotals,
  type MonthlyPeriod,
} from '@/lib/reports/executive/kpi-summary-report'
import {
  buildTeamScorecardReport,
  UNASSIGNED_TEAM_KEY,
  UNASSIGNED_TEAM_LABEL,
  type TeamScorecardEntry,
} from '@/lib/reports/executive/team-scorecard-report'
import { loadArAgingCompanies } from '@/lib/reports/finance/providers'
import { elapsedHours } from '@/lib/reports/operations/sla'
import type { ReportData } from '@/lib/reports/payload'
import { loadProfitEntries } from '@/lib/reports/queries'
import { summarizeProfitability } from '@/lib/reports/profitability'
import type { ReportContext, ReportProvider } from '@/lib/reports/providers'
import { previousReportRange } from '@/lib/reports/range'

/**
 * ตัวคำนวณของ **Executive Dashboard (E1–E3)** — ชั้น DB ของ `96` §6-E
 *
 * ### กติกาที่ห้ามหลุด (ทั้งไฟล์)
 * - **อ่านอย่างเดียว** (`96` §1/§15) — ไม่มี mutation ⇒ ไม่มี audit
 * - กรอง `organization_id` ทุก query เสมอ (multi-tenant — Rule 02) · หมวด E เปิดให้เฉพาะ
 *   บริหาร/Superadmin (`96` §10 · ยามอยู่ที่ `lib/reports/access.ts`) ซึ่ง `reportTeamScope()`
 *   คืน `null` เสมอ — แต่ยังส่ง `ctx.teamIds` ต่อให้ตัวโหลดทุกตัวเป็นยามท้ายทาง
 *   (**รายการทีมว่าง = ผลลัพธ์ว่าง ห้ามตีความว่า "ทุกทีม"**)
 * - **ยอดเงินทุกก้อนมาจากตัวโหลด/สูตรที่มีอยู่แล้ว ห้ามคิดใหม่**:
 *   รายได้–ต้นทุนตรงใช้ `loadProfitEntries()` + `summarizeProfitability()` (ชุดเดียวกับแท็บกำไร
 *   ของไฟล์ 21 และ F1) · ลูกหนี้ใช้ `loadArAgingCompanies()` + `arOutstandingSatang()` (ชุดเดียวกับ F3)
 *   · % สำเร็จ/TAT ใช้โมดูล pure ของหมวด O
 * - ขอบเขตเวลาของคอลัมน์ `TIMESTAMPTZ` (`cases.created_at` / `closed_at`) ต้องแปลงเป็น
 *   **ขอบวันไทย** เสมอ — ใช้ date-only ตรง ๆ จะเพี้ยน 7 ชั่วโมงทั้งสองฝั่ง (กับดัก 6.3)
 * - แคช: ทั้งหมวดเป็น **daily** (`96` §8) — `runReport()` จัดการให้แล้ว provider ห้ามแตะ
 */

// ── ตัวช่วยร่วม ──────────────────────────────────────────────────────────────

interface DateWindow {
  startDate: Date
  endDate: Date
}

/** ขอบเวลาจริงของช่วง สำหรับคอลัมน์ `TIMESTAMPTZ` (วันไทยเต็มวันทั้งสองฝั่ง) */
function instantRange(window: DateWindow): { gte: Date; lte: Date } {
  return { gte: startOfBangkokDay(window.startDate), lte: endOfBangkokDay(window.endDate) }
}

/** ผลของเคสจากสถานะ (`02` §3 `case_status`) — สถานะอื่นทั้งหมดคือ "ยังไม่ปิด" */
function isSuccess(status: CaseStatus): boolean {
  return status === 'closed_success'
}

function isFail(status: CaseStatus): boolean {
  return status === 'closed_fail'
}

interface CaseOutcomeRow {
  caseId: string
  createdAt: Date
  status: CaseStatus
  companyId: string
  companyName: string
  teamId: string | null
  teamName: string | null
}

/**
 * เคสที่ **รับเข้าระบบ** ในช่วงที่กำหนด (ฐานเดียวกับ O1 — เคสที่ยังไม่ปิดอยู่ในตัวตั้ง
 * แต่ไม่เข้าตัวหารของ % สำเร็จ)
 */
async function loadCaseOutcomes(
  organizationId: string,
  window: DateWindow,
  teamIds: readonly string[] | null,
): Promise<CaseOutcomeRow[]> {
  const rows = await prisma.case.findMany({
    where: {
      organizationId,
      deletedAt: null,
      createdAt: instantRange(window),
      ...(teamIds === null ? {} : { assignedTeamId: { in: [...teamIds] } }),
    },
    select: {
      id: true,
      createdAt: true,
      status: true,
      companyId: true,
      company: { select: { name: true } },
      assignedTeamId: true,
      assignedTeam: { select: { name: true } },
    },
  })

  return rows.map((row) => ({
    caseId: row.id,
    createdAt: row.createdAt,
    status: row.status,
    companyId: row.companyId,
    companyName: row.company.name,
    teamId: row.assignedTeamId,
    teamName: row.assignedTeam?.name ?? null,
  }))
}

function countOutcomes(rows: readonly CaseOutcomeRow[]): { caseCount: number; successCount: number; failCount: number } {
  return {
    caseCount: rows.length,
    successCount: rows.filter((row) => isSuccess(row.status)).length,
    failCount: rows.filter((row) => isFail(row.status)).length,
  }
}

/** ยอดรายได้/ต้นทุนตรงรวมของช่วงหนึ่ง — ผ่านตัวโหลดเดียวกับ F1 เสมอ */
async function loadTotals(
  organizationId: string,
  window: DateWindow,
  teamIds: readonly string[] | null,
): Promise<{ revenueSatang: number; directCostSatang: number }> {
  const entries = await loadProfitEntries(organizationId, 'company', window, { teamIds })
  const { total } = summarizeProfitability(entries.revenues, entries.costs)
  return { revenueSatang: total.revenueSatang, directCostSatang: total.directCostSatang }
}

/** ยอดลูกหนี้ค้างรับแยกตามบริษัท (`22` §6.11) — บิลที่ปิดยอดแล้วไม่เข้ายอด */
async function loadArByCompany(organizationId: string): Promise<Map<string, number>> {
  const companies = await loadArAgingCompanies(organizationId)
  const byCompany = new Map<string, number>()
  for (const company of companies) {
    const outstanding = company.batches.reduce(
      (sum, batch) => sum + Math.max(0, arOutstandingSatang(batch)),
      0,
    )
    if (outstanding > 0) byCompany.set(company.companyId, outstanding)
  }
  return byCompany
}

// ── E1 — KPI ภาพรวม (`96` §6-E1) ────────────────────────────────────────────

const kpiSummaryProvider: ReportProvider = async (ctx: ReportContext): Promise<ReportData> => {
  const organizationId = ctx.user.organizationId
  const teamIds = ctx.teamIds
  const months = lastMonthlyPeriods(ctx.range.endDate, TREND_MONTHS)
  const trendWindow: DateWindow = {
    startDate: months[0]?.startDate ?? ctx.range.startDate,
    endDate: months.at(-1)?.endDate ?? ctx.range.endDate,
  }
  const previousRange = previousReportRange(ctx.range)

  const [monthlyAmounts, trendCases, currentAmounts, currentCases, previousAmounts, previousCases, arByCompany] =
    await Promise.all([
      // เดือนละครั้งด้วยตัวโหลดเดียวกับ F1 — ยอมจ่ายจำนวน query เพื่อให้ตัวเลขทุกเมนูตรงกันเสมอ
      // (รายงานหมวด E แคชรายวันอยู่แล้ว — `96` §8)
      Promise.all(months.map((month) => loadTotals(organizationId, month, teamIds))),
      loadCaseOutcomes(organizationId, trendWindow, teamIds),
      loadTotals(organizationId, ctx.range, teamIds),
      loadCaseOutcomes(organizationId, ctx.range, teamIds),
      loadTotals(organizationId, previousRange, teamIds),
      loadCaseOutcomes(organizationId, previousRange, teamIds),
      loadArByCompany(organizationId),
    ])

  const monthEntries: ExecutiveMonthEntry[] = months.map((month, index) => ({
    monthKey: month.key,
    monthLabel: month.label,
    revenueSatang: monthlyAmounts[index]?.revenueSatang ?? 0,
    directCostSatang: monthlyAmounts[index]?.directCostSatang ?? 0,
    ...countOutcomes(casesOfMonth(trendCases, month)),
  }))

  const current: ExecutiveTotals = { ...currentAmounts, ...countOutcomes(currentCases) }
  const previous: ExecutiveTotals = { ...previousAmounts, ...countOutcomes(previousCases) }
  const arOutstandingSatangTotal = [...arByCompany.values()].reduce((sum, value) => sum + value, 0)

  return buildKpiSummaryReport({
    months: monthEntries,
    current,
    previous,
    arOutstandingSatang: arOutstandingSatangTotal,
    arCompanyCount: arByCompany.size,
    rangeLabel: ctx.range.label,
    trendLabel: `${months[0]?.label ?? ctx.range.label} – ${months.at(-1)?.label ?? ctx.range.label}`,
  })
}

/** เคสที่ตกอยู่ในเดือนนั้น — เทียบด้วยขอบวันไทยของเดือน (ค่าที่โหลดมาเป็น instant จริง) */
function casesOfMonth(rows: readonly CaseOutcomeRow[], month: MonthlyPeriod): CaseOutcomeRow[] {
  const window = instantRange(month)
  return rows.filter(
    (row) => row.createdAt.getTime() >= window.gte.getTime() && row.createdAt.getTime() <= window.lte.getTime(),
  )
}

// ── E2 — Scorecard รายบริษัทไฟแนนซ์ (`96` §6-E2) ────────────────────────────

const companyScorecardProvider: ReportProvider = async (ctx: ReportContext): Promise<ReportData> => {
  const organizationId = ctx.user.organizationId
  const teamIds = ctx.teamIds
  const previousRange = previousReportRange(ctx.range)

  const [entries, previousEntries, cases, arByCompany, companies] = await Promise.all([
    loadProfitEntries(organizationId, 'company', ctx.range, { teamIds }),
    loadProfitEntries(organizationId, 'company', previousRange, { teamIds }),
    loadCaseOutcomes(organizationId, ctx.range, teamIds),
    loadArByCompany(organizationId),
    prisma.financeCompany.findMany({
      where: { organizationId, deletedAt: null },
      select: { id: true, name: true },
    }),
  ])

  const summary = summarizeProfitability(entries.revenues, entries.costs)
  const previousSummary = summarizeProfitability(previousEntries.revenues, previousEntries.costs)
  const previousRevenue = new Map(previousSummary.rows.map((row) => [row.key, row.revenueSatang]))

  const byCompany = new Map<string, CompanyScorecardEntry>(
    companies.map((company) => [
      company.id,
      {
        companyId: company.id,
        companyName: company.name,
        caseCount: 0,
        successCount: 0,
        failCount: 0,
        revenueSatang: 0,
        directCostSatang: 0,
        previousRevenueSatang: 0,
        arOutstandingSatang: 0,
      },
    ]),
  )

  for (const row of cases) {
    const entry = byCompany.get(row.companyId)
    if (entry === undefined) continue
    entry.caseCount += 1
    if (isSuccess(row.status)) entry.successCount += 1
    if (isFail(row.status)) entry.failCount += 1
  }

  for (const row of summary.rows) {
    const entry = byCompany.get(row.key)
    if (entry === undefined) continue
    entry.revenueSatang = row.revenueSatang
    entry.directCostSatang = row.directCostSatang
  }

  for (const [companyId, revenueSatang] of previousRevenue) {
    const entry = byCompany.get(companyId)
    if (entry === undefined) continue
    entry.previousRevenueSatang = revenueSatang
  }

  for (const [companyId, outstanding] of arByCompany) {
    const entry = byCompany.get(companyId)
    if (entry === undefined) continue
    entry.arOutstandingSatang = outstanding
  }

  return buildCompanyScorecardReport({ companies: [...byCompany.values()], rangeLabel: ctx.range.label })
}

// ── E3 — Scorecard รายทีม (`96` §6-E3) ──────────────────────────────────────

const CLOSED_CASE_STATUSES: readonly CaseStatus[] = ['closed_success', 'closed_fail']

const teamScorecardProvider: ReportProvider = async (ctx: ReportContext): Promise<ReportData> => {
  const organizationId = ctx.user.organizationId
  const teamIds = ctx.teamIds

  const [entries, cases, closedCases, teams, members] = await Promise.all([
    loadProfitEntries(organizationId, 'team', ctx.range, { teamIds }),
    loadCaseOutcomes(organizationId, ctx.range, teamIds),
    prisma.case.findMany({
      where: {
        organizationId,
        deletedAt: null,
        status: { in: [...CLOSED_CASE_STATUSES] },
        // TAT คิดจากเคสที่ **ปิดในช่วงที่เลือก** เท่านั้น (นิยามเดียวกับ O2)
        closedAt: instantRange(ctx.range),
        ...(teamIds === null ? {} : { assignedTeamId: { in: [...teamIds] } }),
      },
      select: { id: true, createdAt: true, closedAt: true, assignedTeamId: true },
    }),
    prisma.team.findMany({
      where: { organizationId, deletedAt: null, ...(teamIds === null ? {} : { id: { in: [...teamIds] } }) },
      select: { id: true, name: true, side: true },
    }),
    prisma.user.groupBy({
      by: ['teamId'],
      where: { organizationId, deletedAt: null, status: 'active', teamId: { not: null } },
      _count: { _all: true },
    }),
  ])

  const summary = summarizeProfitability(entries.revenues, entries.costs)
  const memberCounts = new Map(
    members.filter((row) => row.teamId !== null).map((row) => [row.teamId as string, row._count._all]),
  )

  const byTeam = new Map<string, TeamScorecardEntry & { tatHours: number[] }>(
    teams.map((team) => [
      team.id,
      {
        teamKey: team.id,
        teamName: team.name,
        side: team.side,
        memberCount: memberCounts.get(team.id) ?? 0,
        caseCount: 0,
        successCount: 0,
        failCount: 0,
        tatHours: [],
        revenueSatang: 0,
        directCostSatang: 0,
      },
    ]),
  )

  /** ทีมที่ยังไม่ระบุ — สร้างเมื่อมีข้อมูลจริงเท่านั้น (ไม่มีข้อมูล = ไม่ต้องมีแถวเปล่า) */
  const unassigned = (): TeamScorecardEntry & { tatHours: number[] } => {
    const existing = byTeam.get(UNASSIGNED_TEAM_KEY)
    if (existing !== undefined) return existing
    const created = {
      teamKey: UNASSIGNED_TEAM_KEY,
      teamName: UNASSIGNED_TEAM_LABEL,
      side: null,
      memberCount: null,
      caseCount: 0,
      successCount: 0,
      failCount: 0,
      tatHours: [] as number[],
      revenueSatang: 0,
      directCostSatang: 0,
    }
    byTeam.set(UNASSIGNED_TEAM_KEY, created)
    return created
  }

  const bucketOf = (teamId: string | null) =>
    teamId === null ? unassigned() : (byTeam.get(teamId) ?? unassigned())

  for (const row of cases) {
    const entry = bucketOf(row.teamId)
    entry.caseCount += 1
    if (isSuccess(row.status)) entry.successCount += 1
    if (isFail(row.status)) entry.failCount += 1
  }

  for (const row of closedCases) {
    if (row.closedAt === null) continue
    bucketOf(row.assignedTeamId).tatHours.push(elapsedHours(row.createdAt, row.closedAt))
  }

  for (const row of summary.rows) {
    // `summarizeProfitability()` ใช้คีย์ `__unassigned__` เดียวกันสำหรับมิติที่ไม่มีทีม
    const entry = row.key === UNASSIGNED_TEAM_KEY ? unassigned() : byTeam.get(row.key)
    if (entry === undefined) continue
    entry.revenueSatang = row.revenueSatang
    entry.directCostSatang = row.directCostSatang
  }

  return buildTeamScorecardReport({ teams: [...byTeam.values()], rangeLabel: ctx.range.label })
}

/** ทะเบียนของหมวด E — `lib/reports/providers.ts` เอาไปต่อเข้า `REPORT_PROVIDERS` */
export const EXECUTIVE_REPORT_PROVIDERS: Readonly<Record<string, ReportProvider>> = {
  'kpi-summary': kpiSummaryProvider,
  'company-scorecard': companyScorecardProvider,
  'team-scorecard': teamScorecardProvider,
}
