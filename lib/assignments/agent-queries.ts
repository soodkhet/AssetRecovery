import { FIELD_AGENT_ROLE_NAME } from '@/lib/auth/constants'
import type { SessionUser } from '@/lib/auth/types'
import { ACTIVE_ASSIGNMENT_STATUSES, assignmentStateOf } from '@/lib/assignments/assignment'
import { AssignmentError } from '@/lib/assignments/errors'
import { assertTeamInScope } from '@/lib/assignments/queries'
import type { KanbanQuery } from '@/lib/assignments/schemas'
import { successRate, toDecisionSupport } from '@/lib/assignments/success-rate'
import type {
  AgentCaseDto,
  AgentCasesResultDto,
  KanbanBoardDto,
  TeamAgentsResultDto,
} from '@/lib/assignments/types'
import type { Prisma } from '@/lib/generated/prisma/client'
import type { AssignmentStatus } from '@/lib/generated/prisma/enums'
import { prisma } from '@/lib/prisma'

/**
 * ข้อมูลประกอบการตัดสินใจของพนักงาน + Kanban (`40` §6.2 · §7.5 · §17.1) — ชั้น DB
 *
 * - `success_rate` คำนวณจาก **service กลาง** `successRate()` เท่านั้น (Report ในอนาคตเรียกซ้ำได้ — `40` §6.2)
 * - นับ "เคส" ไม่ใช่ "แถว assignment": เคสที่ถูก reassign หลายรอบต้องนับครั้งเดียว
 * - สิทธิ์ดูข้อมูลชุดนี้ **ไม่ผูกกับ settings ของ §6.4** (หัวหน้าดูได้เสมอ) แต่ยังผูก scope ของทีมอยู่
 */

const CLOSED_CASE_STATUSES = ['closed_success', 'closed_fail'] as const

/** สถานะ assignment ที่ถือว่ายังถือเคสอยู่ — ต้องเป็น array **mutable** เพราะถูกใช้ใน select ที่ `as const` */
const HELD_STATUSES: AssignmentStatus[] = [...ACTIVE_ASSIGNMENT_STATUSES]

async function loadTeamInScope(user: SessionUser, teamId: string) {
  assertTeamInScope(user, teamId)
  const team = await prisma.team.findFirst({
    where: { id: teamId, organizationId: user.organizationId, deletedAt: null },
    select: { id: true, name: true, side: true, provinces: true },
  })
  if (team === null) throw new AssignmentError('TEAM_NOT_FOUND', { context: { teamId } })
  return team
}

/** พนักงานติดตามทรัพย์ที่ active ในทีมนี้ (`40` §11 — ตัวเลือกของหน้ามอบหมายมาจากทีมของเคสเท่านั้น) */
async function loadTeamAgents(organizationId: string, teamId: string) {
  return await prisma.user.findMany({
    where: {
      organizationId,
      teamId,
      deletedAt: null,
      status: 'active',
      role: { name: FIELD_AGENT_ROLE_NAME },
    },
    orderBy: { fullName: 'asc' },
    select: { id: true, fullName: true, phone: true, status: true },
  })
}

/**
 * ตัวนับของ `40` §6.2 ต่อพนักงาน 1 คน — นับระดับ **เคส** ด้วย `assignments.some()`
 * (ทีมหนึ่งมีพนักงานหลักสิบคน จึงยิงเป็นชุดต่อคนได้ · ถ้าทีมโตกว่านี้ค่อยย้ายไป materialized view)
 */
async function agentCounts(organizationId: string, agentId: string) {
  const [activeCaseCount, assignedCount, successCount] = await Promise.all([
    prisma.case.count({
      where: {
        organizationId,
        deletedAt: null,
        status: { notIn: [...CLOSED_CASE_STATUSES] },
        assignments: { some: { agentId, status: { in: [...ACTIVE_ASSIGNMENT_STATUSES] } } },
      },
    }),
    prisma.case.count({ where: { organizationId, assignments: { some: { agentId } } } }),
    // "เคสที่ outcome สำเร็จ" ตามไฟล์ 43 = `cases.outcome = closed_success` (`02` §3 `case_outcome`)
    prisma.case.count({
      where: { organizationId, outcome: 'closed_success', assignments: { some: { agentId } } },
    }),
  ])
  return { activeCaseCount, assignedCount, successCount }
}

/** `GET /api/teams/:team_id/agents` (`40` §17.1) */
export async function listTeamAgents(user: SessionUser, teamId: string): Promise<TeamAgentsResultDto> {
  const team = await loadTeamInScope(user, teamId)
  const agents = await loadTeamAgents(user.organizationId, team.id)

  const rows = await Promise.all(
    agents.map(async (agent) => {
      const counts = await agentCounts(user.organizationId, agent.id)
      return {
        agentId: agent.id,
        fullName: agent.fullName,
        phone: agent.phone,
        status: agent.status,
        ...toDecisionSupport({ ...counts, coveredProvinces: team.provinces }),
      }
    }),
  )

  return { teamId: team.id, teamName: team.name, teamSide: team.side, agents: rows }
}

/**
 * ⚠️ `as const` ทำให้ array ที่เขียนตรง ๆ กลายเป็น `readonly` ซึ่ง Prisma ไม่รับ —
 * ประกาศรายการสถานะเป็นตัวแปร mutable แยกไว้ (ตัว `as const` ไม่แตะชนิดของตัวแปรที่อ้างถึง)
 */
const agentCaseSelect = {
  id: true,
  caseRef: true,
  debtorName: true,
  addrProvince: true,
  assetDescription: true,
  debtAmountSatang: true,
  trackingRound: true,
  assignments: {
    where: { status: { in: HELD_STATUSES } },
    orderBy: { createdAt: 'desc' as const },
    take: 1,
    select: { id: true, agentId: true, status: true, acceptedAt: true, createdAt: true },
  },
  // การ์ด Kanban/รายการที่ขยายต้องรู้ว่ามีคำขอเปลี่ยนผู้รับผิดชอบค้างอยู่ไหม (`40` §7.5)
  pendingReassignments: {
    where: { status: 'waiting_consent' as const },
    take: 1,
    select: { id: true },
  },
} as const

type AgentCaseRow = Prisma.CaseGetPayload<{ select: typeof agentCaseSelect }>

function toAgentCase(row: AgentCaseRow): AgentCaseDto {
  const assignment = row.assignments[0] ?? null
  return {
    caseId: row.id,
    caseRef: row.caseRef,
    debtorName: row.debtorName,
    province: row.addrProvince,
    assetDescription: row.assetDescription,
    debtAmountSatang: row.debtAmountSatang,
    state: assignmentStateOf(assignment),
    assignedAt: assignment?.createdAt.toISOString() ?? null,
    acceptedAt: assignment?.acceptedAt?.toISOString() ?? null,
    hasPendingReassignment: row.pendingReassignments.length > 0,
  }
}

function heldCasesWhere(organizationId: string, agentIds: readonly string[], filters?: KanbanQuery) {
  return {
    organizationId,
    deletedAt: null,
    status: { notIn: [...CLOSED_CASE_STATUSES] },
    assignments: {
      some: { agentId: { in: [...agentIds] }, status: { in: [...ACTIVE_ASSIGNMENT_STATUSES] } },
    },
    ...(filters?.province ? { addrProvince: filters.province } : {}),
    ...(filters?.search
      ? {
          OR: [
            { caseRef: { contains: filters.search, mode: 'insensitive' as const } },
            { debtorName: { contains: filters.search, mode: 'insensitive' as const } },
          ],
        }
      : {}),
  } satisfies Prisma.CaseWhereInput
}

/** `GET /api/teams/:team_id/agents/:agent_id/cases` (`40` §17.1 — toggle ใน agent picker) */
export async function listAgentCases(
  user: SessionUser,
  teamId: string,
  agentId: string,
): Promise<AgentCasesResultDto> {
  const team = await loadTeamInScope(user, teamId)
  const agent = await prisma.user.findFirst({
    where: { id: agentId, organizationId: user.organizationId, teamId: team.id, deletedAt: null },
    select: { id: true },
  })
  // พนักงานนอกทีมนี้ = ไม่ให้ข้ามทีมมาส่อง (`40` §11)
  if (agent === null) throw new AssignmentError('ASSIGNMENT_TEAM_MISMATCH', { context: { teamId, agentId } })

  const rows = await prisma.case.findMany({
    where: heldCasesWhere(user.organizationId, [agent.id]),
    orderBy: { createdAt: 'desc' },
    select: agentCaseSelect,
  })

  return { teamId: team.id, agentId: agent.id, cases: rows.map(toAgentCase) }
}

/**
 * `GET /api/teams/:team_id/kanban` (`40` §7.5 · §20)
 * filter ทำที่ระดับ **การ์ด** — คอลัมน์ของพนักงานที่ไม่เหลือการ์ดต้องยังแสดงอยู่ ห้ามซ่อนคอลัมน์
 */
export async function getTeamKanban(
  user: SessionUser,
  teamId: string,
  query: KanbanQuery,
): Promise<KanbanBoardDto> {
  const team = await loadTeamInScope(user, teamId)
  const agents = await loadTeamAgents(user.organizationId, team.id)
  const agentIds = agents.map((agent) => agent.id)

  const rows =
    agentIds.length === 0
      ? []
      : await prisma.case.findMany({
          where: heldCasesWhere(user.organizationId, agentIds, query),
          orderBy: { createdAt: 'desc' },
          select: agentCaseSelect,
        })

  const byAgent = new Map<string, AgentCaseDto[]>(agentIds.map((id) => [id, []]))
  for (const row of rows) {
    const holder = row.assignments[0]
    if (!holder) continue
    byAgent.get(holder.agentId)?.push(toAgentCase(row))
  }

  // ตัวเลข workload บนหัวคอลัมน์ = เคสที่ถืออยู่จริงทั้งหมด ไม่ใช่จำนวนการ์ดหลังกรอง (`40` §7.5)
  const hasFilter = query.province !== undefined || query.search !== undefined
  const heldCount = new Map<string, number>(agentIds.map((id) => [id, 0]))
  const countRows = hasFilter
    ? agentIds.length === 0
      ? []
      : await prisma.case.findMany({
          where: heldCasesWhere(user.organizationId, agentIds),
          select: {
            assignments: {
              where: { status: { in: [...ACTIVE_ASSIGNMENT_STATUSES] } },
              orderBy: { createdAt: 'desc' as const },
              take: 1,
              select: { agentId: true },
            },
          },
        })
    : rows
  for (const row of countRows) {
    const holder = row.assignments[0]
    if (!holder) continue
    heldCount.set(holder.agentId, (heldCount.get(holder.agentId) ?? 0) + 1)
  }

  // % ความสำเร็จบนหัวคอลัมน์ (`40` §7.5) — มาจาก service กลางตัวเดียวกับ agent picker
  const performance = await Promise.all(
    agentIds.map(async (agentId) => {
      const counts = await agentCounts(user.organizationId, agentId)
      return [agentId, successRate(counts)] as const
    }),
  )
  const successByAgent = new Map<string, number | null>(performance)

  return {
    teamId: team.id,
    teamName: team.name,
    teamSide: team.side,
    columns: agents.map((agent) => ({
      agentId: agent.id,
      fullName: agent.fullName,
      activeCaseCount: heldCount.get(agent.id) ?? 0,
      successRate: successByAgent.get(agent.id) ?? null,
      cases: byAgent.get(agent.id) ?? [],
    })),
  }
}
