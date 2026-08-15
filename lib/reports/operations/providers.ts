import { getAssignmentPolicy } from '@/lib/assignments/policy-queries'
import { caseStatusLabel } from '@/lib/cases/status-display'
import { endOfBangkokDay, startOfBangkokDay } from '@/lib/format/datetime'
import type { AssignmentStatus, CaseStatus } from '@/lib/generated/prisma/enums'
import { prisma } from '@/lib/prisma'
import { pickParam } from '@/lib/reports/finance/providers'
import type { ReportData } from '@/lib/reports/payload'
import { resolveReportPeriod, toIsoDateOnly } from '@/lib/reports/period'
import type { ReportContext, ReportProvider } from '@/lib/reports/providers'
import { elapsedHours } from '@/lib/reports/operations/sla'
import { buildSlaBreachReport, type SlaBreachCaseEntry } from '@/lib/reports/operations/sla-breach-report'
import {
  SUCCESS_RATE_DIMENSIONS,
  buildSuccessRateReport,
  type CaseOutcomeValue,
  type SuccessRateCaseEntry,
  type SuccessRateDimension,
} from '@/lib/reports/operations/success-rate-report'
import {
  buildTeamPerformanceReport,
  type TeamPerformanceEntry,
} from '@/lib/reports/operations/team-performance-report'
import {
  buildWarehouseSummaryReport,
  type WarehouseCompanyEntry,
} from '@/lib/reports/operations/warehouse-summary-report'
import { buildWorkloadReport, type WorkloadEntry } from '@/lib/reports/operations/workload-report'
import { previousReportRange, type ReportRange } from '@/lib/reports/range'

/**
 * ตัวคำนวณของ **รายงานหมวด O (O1–O5)** — ชั้น DB ของ `96` §6-O
 *
 * ### กติกาที่ห้ามหลุด (ทั้งไฟล์)
 * - **อ่านอย่างเดียว** (`96` §1/§15) — ไม่มี mutation ⇒ ไม่มี audit
 * - กรอง `organization_id` ทุก query เสมอ และถ้า `ctx.teamIds !== null` ต้องกรองทีมด้วย
 *   **รายการทีมว่าง = ผลลัพธ์ว่าง ห้ามตีความว่า "ทุกทีม"** (`96` §10/§14 — ผู้จัดการเห็นเฉพาะทีมตัวเอง)
 * - **สูตร/การจัดกลุ่มทั้งหมดอยู่ในโมดูล pure** (`lib/reports/operations/*-report.ts`)
 *   ไฟล์นี้ทำแค่ "ดึงข้อมูล → ส่งเข้าโมดูล pure"
 * - **เกณฑ์ SLA อ่านจากค่าตั้งองค์กร** (`getAssignmentPolicy()` → `sla_alert_hours` · D18) ห้าม hardcode
 * - ขอบเขตเวลาของคอลัมน์ `TIMESTAMPTZ` ต้องแปลงเป็น **ขอบวันไทย** เสมอ (`startOfBangkokDay` /
 *   `endOfBangkokDay`) — ใช้ค่า date-only ตรง ๆ จะกินเวลาผิดไป 7 ชั่วโมงทุกครั้ง
 * - แคช (รายชั่วโมงทั้งหมวด — `96` §8) / สิทธิ์ / ช่วงเวลา จัดการโดย `runReport()` แล้ว
 */

// ── ตัวช่วยร่วม ──────────────────────────────────────────────────────────────

/** ขอบเวลาจริงของช่วงรายงาน สำหรับคอลัมน์ `TIMESTAMPTZ` (วันไทยเต็มวันทั้งสองฝั่ง) */
function instantRange(range: ReportRange): { gte: Date; lte: Date } {
  return { gte: startOfBangkokDay(range.startDate), lte: endOfBangkokDay(range.endDate) }
}

/** ตัวกรองทีมของเคส — `null` = ทุกทีม · `[]` = ไม่เห็นอะไรเลย (ต้องยังคงกรองด้วย `in: []`) */
function caseTeamFilter(teamIds: readonly string[] | null): { assignedTeamId?: { in: string[] } } {
  return teamIds === null ? {} : { assignedTeamId: { in: [...teamIds] } }
}

/** ผลของเคสจากสถานะ (`02` §3 `case_status`) — สถานะอื่นทั้งหมดคือ "ยังไม่ปิด" */
function outcomeOf(status: CaseStatus): CaseOutcomeValue {
  if (status === 'closed_success') return 'closed_success'
  if (status === 'closed_fail') return 'closed_fail'
  return null
}

// ── O1 — อัตราความสำเร็จ (`96` §6-O1) ────────────────────────────────────────

interface CaseRow {
  id: string
  status: CaseStatus
  createdAt: Date
  companyId: string
  company: { name: string }
  assignedTeamId: string | null
  assignedTeam: { name: string } | null
}

/** คีย์/ป้ายของกลุ่ม — รายเดือนใช้ปฏิทินไทย + ป้าย พ.ศ. จาก `resolveReportPeriod()` (3.8) */
function successRateGroupOf(
  dimension: SuccessRateDimension,
  row: CaseRow,
): Pick<SuccessRateCaseEntry, 'groupKey' | 'groupLabel' | 'groupSort'> {
  if (dimension === 'company') {
    return { groupKey: row.companyId, groupLabel: row.company.name, groupSort: row.company.name }
  }
  if (dimension === 'team') {
    return {
      groupKey: row.assignedTeamId ?? '__unassigned__',
      groupLabel: row.assignedTeam?.name ?? 'ยังไม่ระบุทีม',
      groupSort: row.assignedTeam?.name ?? 'ยังไม่ระบุทีม',
    }
  }
  const period = resolveReportPeriod('month', row.createdAt)
  const sort = toIsoDateOnly(period.startDate)
  return { groupKey: sort, groupLabel: period.label, groupSort: sort }
}

async function loadSuccessRateEntries(
  organizationId: string,
  dimension: SuccessRateDimension,
  range: ReportRange,
  teamIds: readonly string[] | null,
): Promise<SuccessRateCaseEntry[]> {
  const rows = await prisma.case.findMany({
    where: {
      organizationId,
      deletedAt: null,
      // ขอบเขต = เคสที่ **รับเข้าระบบ** ในช่วงที่เลือก ⇒ เคสที่ยังไม่ปิดก็อยู่ในตัวตั้ง
      // (ตัวหารของ % สำเร็จ ตัดเคส open ออกในโมดูล pure — `96` §13/§14)
      createdAt: instantRange(range),
      ...caseTeamFilter(teamIds),
    },
    select: {
      id: true,
      status: true,
      createdAt: true,
      companyId: true,
      company: { select: { name: true } },
      assignedTeamId: true,
      assignedTeam: { select: { name: true } },
    },
  })

  return rows.map((row) => ({
    ...successRateGroupOf(dimension, row),
    caseId: row.id,
    outcome: outcomeOf(row.status),
  }))
}

const successRateProvider: ReportProvider = async (ctx: ReportContext): Promise<ReportData> => {
  const dimension = pickParam<SuccessRateDimension>(ctx.params['dimension'], SUCCESS_RATE_DIMENSIONS, 'team')
  const [entries, previousEntries] = await Promise.all([
    loadSuccessRateEntries(ctx.user.organizationId, dimension, ctx.range, ctx.teamIds),
    loadSuccessRateEntries(ctx.user.organizationId, dimension, previousReportRange(ctx.range), ctx.teamIds),
  ])
  return buildSuccessRateReport({ dimension, entries, previousEntries })
}

// ── O2 — ประสิทธิภาพทีม / SLA (`96` §6-O2) ──────────────────────────────────

const teamPerformanceProvider: ReportProvider = async (ctx: ReportContext): Promise<ReportData> => {
  const [rows, policy] = await Promise.all([
    prisma.case.findMany({
      where: {
        organizationId: ctx.user.organizationId,
        deletedAt: null,
        status: { in: ['closed_success', 'closed_fail'] },
        // เฉพาะเคสที่ **ปิดในช่วงที่เลือก** — TAT ต้องมีวันปิดจริงจึงคำนวณได้
        closedAt: instantRange(ctx.range),
        ...caseTeamFilter(ctx.teamIds),
      },
      select: {
        id: true,
        createdAt: true,
        closedAt: true,
        assignedTeamId: true,
        assignedTeam: { select: { name: true } },
      },
    }),
    getAssignmentPolicy(ctx.user.organizationId),
  ])

  const entries: TeamPerformanceEntry[] = rows
    // `closedAt` เป็น nullable ที่ชั้น DB — สถานะปิดแล้วต้องมีค่าเสมอ แต่กันแถวเพี้ยนไว้ไม่ให้ TAT ติดลบ
    .filter((row): row is (typeof rows)[number] & { closedAt: Date } => row.closedAt !== null)
    .map((row) => ({
      teamId: row.assignedTeamId,
      teamName: row.assignedTeam?.name ?? null,
      caseId: row.id,
      tatHours: elapsedHours(row.createdAt, row.closedAt),
    }))

  return buildTeamPerformanceReport({ entries, slaAlertHours: policy.slaAlertHours })
}

// ── O3 — ปริมาณงานรายพนักงาน (`96` §6-O3) ───────────────────────────────────

/** งานที่ถูกโอนออกไปแล้วไม่ใช่ภาระของคนเดิม (`40` §6.3) — สถานะอื่นคือ "ยังค้างอยู่" */
const WORKLOAD_EXCLUDED_STATUSES: readonly AssignmentStatus[] = ['reassigned_away']

function workloadResultOf(status: AssignmentStatus): WorkloadEntry['result'] {
  if (status === 'closed_success') return 'closed_success'
  if (status === 'closed_fail') return 'closed_fail'
  return 'open'
}

async function loadWorkloadEntries(
  organizationId: string,
  range: ReportRange,
  teamIds: readonly string[] | null,
): Promise<WorkloadEntry[]> {
  const rows = await prisma.caseAssignment.findMany({
    where: {
      organizationId,
      createdAt: instantRange(range),
      status: { notIn: [...WORKLOAD_EXCLUDED_STATUSES] },
      ...(teamIds === null ? {} : { teamId: { in: [...teamIds] } }),
    },
    select: {
      caseId: true,
      status: true,
      agentId: true,
      agent: { select: { fullName: true } },
      team: { select: { name: true } },
    },
  })

  return rows.map((row) => ({
    agentId: row.agentId,
    agentName: row.agent.fullName,
    teamName: row.team.name,
    caseId: row.caseId,
    result: workloadResultOf(row.status),
  }))
}

const workloadProvider: ReportProvider = async (ctx: ReportContext): Promise<ReportData> => {
  const [entries, previousEntries] = await Promise.all([
    loadWorkloadEntries(ctx.user.organizationId, ctx.range, ctx.teamIds),
    loadWorkloadEntries(ctx.user.organizationId, previousReportRange(ctx.range), ctx.teamIds),
  ])
  return buildWorkloadReport({ entries, previousEntries })
}

// ── O4 — เคสค้างเกิน SLA (`96` §6-O4) ───────────────────────────────────────

/**
 * สถานะที่ถือว่า "ยังค้างอยู่ในระบบ" — นาฬิกา SLA เริ่มตั้งแต่รับเคสเข้าระบบ (`96` §6-O4)
 * ⇒ เคสที่ยังไม่ผ่านการตรวจก็ถือว่าค้างเช่นกัน · `draft` (ยังไม่ส่ง) และ `rejected` (จบแล้ว) ไม่นับ
 */
const OPEN_CASE_STATUSES: readonly CaseStatus[] = [
  'pending_review',
  'need_info',
  'approved',
  'active',
  'pending_recycle_review',
]

const slaBreachProvider: ReportProvider = async (ctx: ReportContext): Promise<ReportData> => {
  const policy = await getAssignmentPolicy(ctx.user.organizationId)

  const rows = await prisma.case.findMany({
    where: {
      organizationId: ctx.user.organizationId,
      deletedAt: null,
      status: { in: [...OPEN_CASE_STATUSES] },
      // เคสที่ค้างอยู่ ณ ตอนนี้ — ไม่จำกัดด้วยช่วงเวลาที่เลือก เพราะเคสที่ค้างข้ามงวดคือของจริง
      // ที่รายงานนี้ต้องเตือน (`96` §6-O4 ไม่มีพารามิเตอร์ `period`)
      ...caseTeamFilter(ctx.teamIds),
    },
    select: {
      id: true,
      caseRef: true,
      status: true,
      createdAt: true,
      projectedRevenueSatang: true,
      company: { select: { name: true } },
      assignedTeam: { select: { name: true } },
      assignments: {
        where: { status: { notIn: [...WORKLOAD_EXCLUDED_STATUSES] } },
        orderBy: { createdAt: 'desc' },
        take: 1,
        select: { agent: { select: { fullName: true } } },
      },
    },
  })

  const cases: SlaBreachCaseEntry[] = rows.map((row) => ({
    caseId: row.id,
    caseRef: row.caseRef,
    companyName: row.company.name,
    agentName: row.assignments[0]?.agent.fullName ?? null,
    teamName: row.assignedTeam?.name ?? null,
    receivedAt: row.createdAt,
    statusLabel: caseStatusLabel(row.status),
    projectedRevenueSatang: row.projectedRevenueSatang,
  }))

  return buildSlaBreachReport({ cases, slaAlertHours: policy.slaAlertHours, asOf: ctx.now })
}

// ── O5 — สรุปคลังสินค้า (`96` §6-O5) ────────────────────────────────────────

const warehouseSummaryProvider: ReportProvider = async (ctx: ReportContext): Promise<ReportData> => {
  const organizationId = ctx.user.organizationId
  // เครื่องผูกกับเคส ⇒ ผู้ที่เห็นเฉพาะทีมตัวเองกรองผ่านทีมของเคสได้จริง (ต่างจาก F3 ที่เป็นยอดระดับบริษัท)
  const scope = ctx.teamIds === null ? {} : { case: { assignedTeamId: { in: [...ctx.teamIds] } } }

  const [stock, handedOver, companies] = await Promise.all([
    // ยอดคงเหลือ ณ ปัจจุบัน — ไม่ผูกกับช่วงเวลา (สถานะเครื่องเป็นค่าปัจจุบันเสมอ)
    prisma.asset.groupBy({
      by: ['companyId', 'assetStatus'],
      where: {
        organizationId,
        deletedAt: null,
        assetStatus: { in: ['pending_intake', 'in_custody', 'handover_pending'] },
        ...scope,
      },
      _count: { _all: true },
    }),
    // ส่งมอบแล้ว = อยู่ในล็อตที่ **ยืนยันส่งมอบ** ภายในช่วงที่เลือก (`44` §11)
    prisma.asset.groupBy({
      by: ['companyId'],
      where: {
        organizationId,
        deletedAt: null,
        assetStatus: 'handed_over',
        lot: { status: 'confirmed', confirmedAt: instantRange(ctx.range) },
        ...scope,
      },
      _count: { _all: true },
    }),
    prisma.financeCompany.findMany({
      where: { organizationId, deletedAt: null },
      select: { id: true, name: true },
    }),
  ])

  const byCompany = new Map<string, WarehouseCompanyEntry>(
    companies.map((company) => [
      company.id,
      {
        companyId: company.id,
        companyName: company.name,
        pendingIntake: 0,
        inCustody: 0,
        handoverPending: 0,
        handedOverInRange: 0,
      },
    ]),
  )

  for (const group of stock) {
    const entry = byCompany.get(group.companyId)
    if (entry === undefined) continue
    if (group.assetStatus === 'pending_intake') entry.pendingIntake += group._count._all
    if (group.assetStatus === 'in_custody') entry.inCustody += group._count._all
    if (group.assetStatus === 'handover_pending') entry.handoverPending += group._count._all
  }
  for (const group of handedOver) {
    const entry = byCompany.get(group.companyId)
    if (entry === undefined) continue
    entry.handedOverInRange += group._count._all
  }

  return buildWarehouseSummaryReport({ companies: [...byCompany.values()], rangeLabel: ctx.range.label })
}

/** ทะเบียนของหมวด O — `lib/reports/providers.ts` เอาไปต่อเข้า `REPORT_PROVIDERS` */
export const OPERATIONS_REPORT_PROVIDERS: Readonly<Record<string, ReportProvider>> = {
  'success-rate': successRateProvider,
  'team-performance': teamPerformanceProvider,
  workload: workloadProvider,
  'sla-breach': slaBreachProvider,
  'warehouse-summary': warehouseSummaryProvider,
}
