import type { SessionUser } from '@/lib/auth/types'
import { caseScopeWhere } from '@/lib/cases/queries'
import { listCompensationApprovals } from '@/lib/compensation/approval-queries'
import {
  buildCaseBoard,
  buildQueueItems,
  canViewCaseBoard,
  caseBoardHref,
  canShowArOver60,
  dashboardKpiSource,
  showFieldTrackerShortcut,
  visibleDashboardQueues,
  type CaseBoardDto,
  type CaseBoardStatus,
  type DashboardOverviewDto,
  type DashboardQueueId,
} from '@/lib/dashboard/widgets'
import { endOfBangkokDay, startOfBangkokDay } from '@/lib/format/datetime'
import { prisma } from '@/lib/prisma'
import { resolveReportPeriod } from '@/lib/reports/period'
import { assetScopeWhere, lotScopeWhere } from '@/lib/warehouse/queries'

/**
 * ชั้นข้อมูลของแดชบอร์ดหลัก (Phase 6.6) — **อ่านอย่างเดียวทั้งไฟล์** (ห้ามเพิ่ม mutation)
 *
 * - นับ "จำนวนรายการค้าง" อย่างเดียว ไม่มีการรวมยอดเงิน (KPI เงินใช้ endpoint เดิม — ห้ามสูตรใหม่)
 * - scope ระดับแถวใช้ helper ตัวเดียวกับหน้าต้นทางเสมอ (`caseScopeWhere` / `assetScopeWhere` /
 *   `lotScopeWhere` / `listCompensationApprovals`) — ตัวเลขบนแดชบอร์ดต้องเท่ากับจำนวนแถวที่ผู้ใช้เห็นจริง
 *   เมื่อกดลิงก์ไปหน้านั้น
 * - query ถูกยิงเฉพาะคิวที่ `visibleDashboardQueues()` อนุญาต — คิวที่ไม่มีสิทธิ์ไม่แตะ DB เลย
 */

interface QueueCount {
  count: number
  capped?: boolean
}

/** เพดานแถวของ `listCompensationApprovals()` (ค่า `take` ในชั้นต้นทาง) — ชนเพดาน = แสดง "N+" */
const COMPENSATION_LIST_CAP = 300

function teamIdsOf(user: SessionUser): string[] | null {
  return user.scope.kind === 'team' ? [...user.scope.teamIds] : null
}

async function countCasesWithStatus(user: SessionUser, status: CaseBoardStatus | 'draft'): Promise<QueueCount> {
  const count = await prisma.case.count({
    where: { AND: [{ organizationId: user.organizationId, deletedAt: null, status }, caseScopeWhere(user)] },
  })
  return { count }
}

async function countMyCompensationStep(user: SessionUser): Promise<QueueCount> {
  const [manager, finance] = await Promise.all([
    listCompensationApprovals(user, { status: 'pending_approval' }),
    listCompensationApprovals(user, { status: 'pending_finance_approval' }),
  ])
  const actionable = [...manager, ...finance].filter((item) => item.viewerCanAct)
  return {
    count: actionable.length,
    capped: manager.length >= COMPENSATION_LIST_CAP || finance.length >= COMPENSATION_LIST_CAP,
  }
}

async function countReassignWaiting(user: SessionUser): Promise<QueueCount> {
  const teamIds = teamIdsOf(user)
  const count = await prisma.pendingReassignment.count({
    where: {
      organizationId: user.organizationId,
      status: 'waiting_consent',
      ...(teamIds === null ? {} : { case: { assignedTeamId: { in: teamIds } } }),
    },
  })
  return { count }
}

const QUEUE_COUNTERS: Readonly<Record<DashboardQueueId, (user: SessionUser) => Promise<QueueCount>>> = {
  case_draft: (user) => countCasesWithStatus(user, 'draft'),
  case_need_info: (user) => countCasesWithStatus(user, 'need_info'),
  case_pending_review: (user) => countCasesWithStatus(user, 'pending_review'),
  case_recycle_review: (user) => countCasesWithStatus(user, 'pending_recycle_review'),
  case_awaiting_assignment: (user) => countCasesWithStatus(user, 'approved'),
  reassign_waiting: countReassignWaiting,
  compensation_my_step: countMyCompensationStep,
  advance_pending_approval: async (user) => ({
    count: await prisma.advance.count({
      where: { organizationId: user.organizationId, deletedAt: null, status: 'pending_approval' },
    }),
  }),
  advance_overdue: async (user) => ({
    count: await prisma.advance.count({
      where: { organizationId: user.organizationId, deletedAt: null, status: 'overdue' },
    }),
  }),
  payout_in_progress: async (user) => ({
    count: await prisma.payoutBatch.count({
      where: {
        organizationId: user.organizationId,
        deletedAt: null,
        status: { in: ['draft', 'checking', 'file_generated'] },
      },
    }),
  }),
  adjustment_pending: async (user) => ({
    count: await prisma.adjustment.count({
      where: { organizationId: user.organizationId, status: 'pending_approval' },
    }),
  }),
  exception_critical_open: async (user) => ({
    count: await prisma.exception.count({
      where: { organizationId: user.organizationId, level: 'critical', status: 'open' },
    }),
  }),
  bank_unmatched: async (user) => ({
    count: await prisma.bankTransaction.count({
      where: { organizationId: user.organizationId, matchStatus: 'unmatched' },
    }),
  }),
  period_awaiting_lock: async (user) => ({
    count: await prisma.accountingPeriod.count({
      where: { organizationId: user.organizationId, status: 'sent_to_accountant' },
    }),
  }),
  asset_pending_intake: async (user) => ({
    count: await prisma.asset.count({
      where: {
        AND: [
          { organizationId: user.organizationId, deletedAt: null, assetStatus: 'pending_intake' },
          assetScopeWhere(user),
        ],
      },
    }),
  }),
  lot_in_progress: async (user) => ({
    count: await prisma.handoverLot.count({
      where: {
        AND: [
          {
            organizationId: user.organizationId,
            deletedAt: null,
            status: { in: ['pending_attach', 'pending_delivery_proof'] },
          },
          lotScopeWhere(user),
        ],
      },
    }),
  }),
  // งานระดับระบบ (`organization_id` ว่าง) เห็นเฉพาะ Superadmin — แบบเดียวกับหน้า Job Log
  job_failed: async (user) => ({
    count: await prisma.job.count({
      where: {
        status: 'failed',
        OR: user.isSuperadmin
          ? [{ organizationId: user.organizationId }, { organizationId: null }]
          : [{ organizationId: user.organizationId }],
      },
    }),
  }),
}

async function loadCaseBoard(user: SessionUser, now: Date): Promise<CaseBoardDto> {
  const month = resolveReportPeriod('month', now)
  const scope = caseScopeWhere(user)
  const base = { organizationId: user.organizationId, deletedAt: null }

  const [grouped, success, fail] = await Promise.all([
    prisma.case.groupBy({
      by: ['status'],
      where: {
        AND: [base, { status: { in: ['pending_review', 'need_info', 'approved', 'active', 'pending_recycle_review'] } }, scope],
      },
      _count: { _all: true },
    }),
    ...(['closed_success', 'closed_fail'] as const).map((status) =>
      prisma.case.count({
        where: {
          AND: [
            base,
            { status, closedAt: { gte: startOfBangkokDay(month.startDate), lte: endOfBangkokDay(month.endDate) } },
            scope,
          ],
        },
      }),
    ),
  ])

  const openCounts: Partial<Record<CaseBoardStatus, number>> = {}
  for (const row of grouped) openCounts[row.status as CaseBoardStatus] = row._count._all

  return buildCaseBoard({
    openCounts,
    closedThisMonth: { success: success ?? 0, fail: fail ?? 0 },
    monthLabel: month.label,
    href: caseBoardHref(user),
  })
}

/** `GET /api/dashboard` — ภาพรวมของผู้ใช้คนนี้ (คิวงาน + กระดานเคส + แหล่ง KPI) */
export async function getDashboardOverview(user: SessionUser, now: Date = new Date()): Promise<DashboardOverviewDto> {
  const defs = visibleDashboardQueues(user)

  const [countEntries, caseBoard] = await Promise.all([
    Promise.all(defs.map(async (def) => [def.id, await QUEUE_COUNTERS[def.id](user)] as const)),
    canViewCaseBoard(user) ? loadCaseBoard(user, now) : Promise.resolve(null),
  ])

  return {
    kpiSource: dashboardKpiSource(user),
    arOver60: canShowArOver60(user),
    queues: buildQueueItems(defs, Object.fromEntries(countEntries)),
    caseBoard,
    fieldTracker: showFieldTrackerShortcut(user),
    computedAt: now.toISOString(),
  }
}
