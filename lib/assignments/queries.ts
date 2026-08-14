import { emitAudit } from '@/lib/audit/audit'
import { AuthError } from '@/lib/auth/errors'
import type { RequestMeta } from '@/lib/auth/request-meta'
import { isWithinScope } from '@/lib/auth/scope'
import type { SessionUser } from '@/lib/auth/types'
import {
  ACTIVE_ASSIGNMENT_STATUSES,
  assertAcceptable,
  assertAgentInCaseTeam,
  assertAssignable,
  assertDeclineReason,
  assertReassignReason,
  assertRespondable,
  assignmentStateOf,
  reassignBranchOf,
  reassignmentExpiresAt,
  reassignOutcome,
  type AssignmentState,
} from '@/lib/assignments/assignment'
import { AssignmentError } from '@/lib/assignments/errors'
import { canPerformAssignmentAction } from '@/lib/assignments/policy'
import { getAssignmentPolicy } from '@/lib/assignments/policy-queries'
import type {
  AssignCaseInput,
  AssignmentListQuery,
  ReassignCaseInput,
  RespondReassignmentInput,
} from '@/lib/assignments/schemas'
import type {
  AssignmentActionResultDto,
  AssignmentListItemDto,
  AssignmentListResultDto,
  AssignmentTeamOptionDto,
  PendingReassignmentDto,
} from '@/lib/assignments/types'
import { caseScopeWhere } from '@/lib/cases/queries'
import { Prisma } from '@/lib/generated/prisma/client'
import { prisma } from '@/lib/prisma'

/**
 * ชั้นข้อมูลของโมดูลมอบหมายงาน (ไฟล์ 40) — pure logic อยู่ที่ `lib/assignments/assignment.ts`
 *
 * กติกาที่บังคับที่นี่:
 * - ทุก query กรองด้วย `organization_id` + `caseScopeWhere()` เสมอ (Rule 03 — ห้าม query เคสตรง)
 * - ทุก mutation อยู่ใน `$transaction` เดียวกับ `emitAudit()`
 * - **reassign 2 สาขาห้ามสลับกัน** (`40` §9) — สาขาไหนใช้เมื่อไหร่ตัดสินที่ `reassignBranchOf()` ที่เดียว
 * - จุดที่แข่งกับ timeout job ใช้ **conditional update** (`updateMany` + `where status`) เป็นตัวตัดสิน
 *   ไม่ใช่การอ่านค่ามาเช็คแล้วเขียน (อ่าน-แล้ว-เขียน จะให้ผลซ้อนกันเมื่อ job รันพอดี)
 */

export interface AssignmentMutationContext {
  actor: SessionUser
  meta: RequestMeta
}

/** ชนิด tx ของ client ที่ต่อ extension แล้ว (กับดัก `Prisma.TransactionClient` — REUSE_INDEX 14/08) */
export type AssignmentTxClient = Omit<
  typeof prisma,
  '$connect' | '$disconnect' | '$on' | '$transaction' | '$extends'
>

// ── select / mapper ─────────────────────────────────────────────────────────

const assignmentSelect = {
  id: true,
  agentId: true,
  teamId: true,
  status: true,
  acceptedAt: true,
  createdAt: true,
  createdBy: true,
  trackingRound: true,
  agent: { select: { fullName: true } },
  createdByUser: { select: { fullName: true } },
} as const

const pendingSelect = {
  id: true,
  requestedBy: true,
  requestedAt: true,
  newAgentId: true,
  reason: true,
  expiresAt: true,
  status: true,
  fromAgentId: true,
  assignmentId: true,
  declineReason: true,
  newAgent: { select: { fullName: true } },
  requestedByUser: { select: { fullName: true } },
} as const

type AssignmentRow = Prisma.CaseAssignmentGetPayload<{ select: typeof assignmentSelect }>
type PendingRow = Prisma.PendingReassignmentGetPayload<{ select: typeof pendingSelect }>

function toPendingDto(row: PendingRow | null | undefined): PendingReassignmentDto | null {
  if (!row || row.status !== 'waiting_consent') return null
  return {
    id: row.id,
    requestedBy: row.requestedBy,
    requestedByName: row.requestedByUser.fullName,
    requestedAt: row.requestedAt.toISOString(),
    newAgentId: row.newAgentId,
    newAgentName: row.newAgent.fullName,
    reason: row.reason,
    expiresAt: row.expiresAt.toISOString(),
    status: 'waiting_consent',
  }
}

function toActionResult(
  caseId: string,
  assignment: AssignmentRow | null,
  pending: PendingRow | null,
  events: readonly string[],
): AssignmentActionResultDto {
  return {
    caseId,
    assignmentId: assignment?.id ?? null,
    state: assignmentStateOf(assignment),
    agentId: assignment?.agentId ?? null,
    acceptedAt: assignment?.acceptedAt?.toISOString() ?? null,
    pendingReassignment: toPendingDto(pending),
    events,
  }
}

// ── โหลดข้อมูลประกอบ ────────────────────────────────────────────────────────

const caseSelect = {
  id: true,
  caseRef: true,
  trackingRound: true,
  status: true,
  companyId: true,
  assignedTeamId: true,
  debtorName: true,
  addrProvince: true,
  assetDescription: true,
  debtAmountSatang: true,
} as const

type CaseRow = Prisma.CaseGetPayload<{ select: typeof caseSelect }>

/** เคสในขอบเขตของผู้ใช้เท่านั้น (ผู้จัดการ = ทีมที่ดูแล · หัวหน้า = ทีมตน · พนักงาน = เคสที่ตัวเองถือ) */
async function loadCaseInScope(user: SessionUser, caseId: string): Promise<CaseRow> {
  const row = await prisma.case.findFirst({
    where: { id: caseId, organizationId: user.organizationId, deletedAt: null, ...caseScopeWhere(user) },
    select: caseSelect,
  })
  if (row === null) throw new AssignmentError('CASE_NOT_FOUND')
  return row
}

/** assignment ที่ยังใช้งานอยู่ของรอบติดตามปัจจุบัน (`40` §11 — 1 เคส : 1 พนักงาน) */
async function loadActiveAssignment(caseId: string, trackingRound: number): Promise<AssignmentRow | null> {
  return await prisma.caseAssignment.findFirst({
    where: { caseId, trackingRound, status: { in: [...ACTIVE_ASSIGNMENT_STATUSES] } },
    orderBy: { createdAt: 'desc' },
    select: assignmentSelect,
  })
}

async function loadLatestPending(caseId: string): Promise<PendingRow | null> {
  return await prisma.pendingReassignment.findFirst({
    where: { caseId },
    orderBy: { requestedAt: 'desc' },
    select: pendingSelect,
  })
}

/**
 * ยามสิทธิ์ของ action (`40` §6.4/§13) — capability ตรวจไปแล้วที่ `withEndpoint()`
 * ที่เหลือคือ settings ต่อ Role Group ซึ่งคุมเฉพาะหัวหน้าทีม
 */
async function assertCanAct(user: SessionUser): Promise<void> {
  const policy = await getAssignmentPolicy(user.organizationId)
  if (!canPerformAssignmentAction(user, policy)) {
    throw new AuthError('PERMISSION_DENIED', `supervisor_can_assign_${user.roleGroup}=false`)
  }
}

/** พนักงานที่เลือกต้องเป็นสมาชิก **ทีมของเคส** (`40` §11) — ไม่พบ/ต่างทีม = ตอบ code เดียวกันไม่ leak */
async function loadAgentInCaseTeam(organizationId: string, agentId: string, caseTeamId: string | null) {
  const agent = await prisma.user.findFirst({
    where: { id: agentId, organizationId, deletedAt: null, status: 'active' },
    select: { id: true, fullName: true, teamId: true },
  })
  if (agent === null) {
    throw new AssignmentError('ASSIGNMENT_TEAM_MISMATCH', { detail: `ไม่พบพนักงาน ${agentId}` })
  }
  assertAgentInCaseTeam(agent.teamId, caseTeamId)
  return agent
}

/** เคสต้องถูกอนุมัติแล้ว (`40` §16 — `case.approved` คือจุดเริ่มของ `ready_to_assign`) */
function assertCaseAssignable(row: CaseRow): void {
  if (row.status !== 'approved' && row.status !== 'active') {
    throw new AssignmentError('ASSIGNMENT_INVALID_STATUS', { context: { caseStatus: row.status } })
  }
}

// ── GET /api/assignments (`40` §17.1 · §7.2) ────────────────────────────────

/**
 * แปลงสถานะระดับเคส (`40` §10) เป็นเงื่อนไข DB — ต้องกรองที่ DB ไม่ใช่หลัง map
 * ไม่งั้น `total`/pagination จะไม่ตรงกับรายการที่เห็น (1 เคสมี assignment ที่ยังใช้งานอยู่ได้ตัวเดียว)
 */
function assignmentStateFilter(state: AssignmentState | undefined): Prisma.CaseWhereInput {
  switch (state) {
    case undefined:
      return {}
    case 'ready_to_assign':
      return { assignments: { none: { status: { in: [...ACTIVE_ASSIGNMENT_STATUSES] } } } }
    case 'assigned':
      return { assignments: { some: { status: 'pending' } } }
    case 'accepted':
      return { assignments: { some: { status: { in: ['accepted', 'active'] } } } }
  }
}

/**
 * ทีมที่ผู้ใช้เห็นได้ในหน้ามอบหมาย (`40` §7.1) — ผู้จัดการเห็นทุกทีมที่ดูแล · หัวหน้าเห็นทีมเดียว
 * ส่งไปกับ list เพราะ `GET /api/teams` ต้องมี `view_master_data` ที่ผู้จัดการ/หัวหน้าไม่จำเป็นต้องมี (`25` §7.1)
 */
async function listScopedTeams(user: SessionUser): Promise<AssignmentTeamOptionDto[]> {
  const scope = user.scope
  if (scope.kind === 'company' || scope.kind === 'self') return []
  const rows = await prisma.team.findMany({
    where: {
      organizationId: user.organizationId,
      deletedAt: null,
      status: 'active',
      ...(scope.kind === 'team' ? { id: { in: [...scope.teamIds] } } : {}),
    },
    orderBy: [{ side: 'asc' }, { name: 'asc' }],
    select: { id: true, name: true, side: true },
  })
  return rows.map((row) => ({ teamId: row.id, teamName: row.name, teamSide: row.side }))
}

export async function listAssignments(
  user: SessionUser,
  query: AssignmentListQuery,
): Promise<AssignmentListResultDto> {
  const organizationId = user.organizationId
  const where: Prisma.CaseWhereInput = {
    organizationId,
    deletedAt: null,
    // หน้ามอบหมายทำงานกับเคสที่ผ่านการอนุมัติแล้วเท่านั้น (`40` §16)
    status: { in: ['approved', 'active'] },
    ...caseScopeWhere(user),
    ...(query.team ? { assignedTeamId: query.team } : {}),
    ...assignmentStateFilter(query.status),
    ...(query.search
      ? {
          OR: [
            { caseRef: { contains: query.search, mode: 'insensitive' } },
            { debtorName: { contains: query.search, mode: 'insensitive' } },
          ],
        }
      : {}),
  }

  const [total, rows, teams] = await Promise.all([
    prisma.case.count({ where }),
    prisma.case.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: (query.page - 1) * query.limit,
      take: query.limit,
      select: {
        ...caseSelect,
        company: { select: { name: true } },
        assignedTeam: { select: { name: true, side: true } },
        assignments: {
          where: { status: { in: [...ACTIVE_ASSIGNMENT_STATUSES] } },
          orderBy: { createdAt: 'desc' },
          take: 1,
          select: assignmentSelect,
        },
        pendingReassignments: {
          where: { status: 'waiting_consent' },
          orderBy: { requestedAt: 'desc' },
          take: 1,
          select: pendingSelect,
        },
      },
    }),
    listScopedTeams(user),
  ])

  const items: AssignmentListItemDto[] = rows.map((row) => {
    const assignment = row.assignments.find((each) => each.trackingRound === row.trackingRound) ?? null
    return {
      caseId: row.id,
      caseRef: row.caseRef,
      trackingRound: row.trackingRound,
      companyId: row.companyId,
      companyName: row.company.name,
      debtorName: row.debtorName,
      province: row.addrProvince,
      assetDescription: row.assetDescription,
      debtAmountSatang: row.debtAmountSatang,
      teamId: row.assignedTeamId,
      teamName: row.assignedTeam?.name ?? null,
      teamSide: row.assignedTeam?.side ?? null,
      state: assignmentStateOf(assignment),
      assignmentId: assignment?.id ?? null,
      agentId: assignment?.agentId ?? null,
      agentName: assignment?.agent.fullName ?? null,
      assignedAt: assignment?.createdAt.toISOString() ?? null,
      assignedBy: assignment?.createdBy ?? null,
      assignedByName: assignment?.createdByUser.fullName ?? null,
      acceptedAt: assignment?.acceptedAt?.toISOString() ?? null,
      pendingReassignment: toPendingDto(row.pendingReassignments[0]),
    }
  })

  return { items, total, page: query.page, limit: query.limit, teams }
}

// ── POST /api/cases/:id/assign (`40` §8) ────────────────────────────────────

export async function assignCase(
  user: SessionUser,
  caseId: string,
  input: AssignCaseInput,
  context: AssignmentMutationContext,
): Promise<AssignmentActionResultDto> {
  await assertCanAct(user)
  const row = await loadCaseInScope(user, caseId)
  assertCaseAssignable(row)

  const current = await loadActiveAssignment(row.id, row.trackingRound)
  assertAssignable(assignmentStateOf(current))

  const agent = await loadAgentInCaseTeam(user.organizationId, input.agentId, row.assignedTeamId)
  const teamId = row.assignedTeamId as string

  const created = await prisma.$transaction(async (tx) => {
    const assignment = await tx.caseAssignment.create({
      data: {
        organizationId: user.organizationId,
        caseId: row.id,
        agentId: agent.id,
        teamId,
        trackingRound: row.trackingRound,
        status: 'pending',
        createdBy: context.actor.id,
      },
      select: assignmentSelect,
    })

    await emitAudit(
      {
        organizationId: user.organizationId,
        actorId: context.actor.id,
        actorRole: context.actor.roleName,
        action: 'create',
        targetType: 'case_assignments',
        targetId: assignment.id,
        after: {
          caseId: row.id,
          caseRef: row.caseRef,
          agentId: agent.id,
          teamId,
          status: 'pending',
          trackingRound: row.trackingRound,
          events: ['assignment.created'],
        },
        ipAddress: context.meta.ipAddress,
        userAgent: context.meta.userAgent,
        diffOnly: false,
      },
      tx as AssignmentTxClient,
    )

    return assignment
  })

  return toActionResult(row.id, created, null, ['assignment.created'])
}

// ── POST /api/cases/:id/reassign (`40` §8/§9 — 2 สาขา) ──────────────────────

export async function reassignCase(
  user: SessionUser,
  caseId: string,
  input: ReassignCaseInput,
  context: AssignmentMutationContext,
): Promise<AssignmentActionResultDto> {
  await assertCanAct(user)
  const reason = assertReassignReason(input.reason)
  const row = await loadCaseInScope(user, caseId)

  const current = await loadActiveAssignment(row.id, row.trackingRound)
  const branch = reassignBranchOf(assignmentStateOf(current))
  const assignment = current as AssignmentRow

  if (assignment.agentId === input.agentId) {
    throw new AssignmentError('ASSIGNMENT_INVALID_STATUS', { detail: 'พนักงานคนใหม่เป็นคนเดิม' })
  }
  const agent = await loadAgentInCaseTeam(user.organizationId, input.agentId, row.assignedTeamId)

  if (branch === 'immediate') {
    // ยังไม่กดรับ = เปลี่ยนทันที ไม่ต้องขอความยินยอม (`40` §8) — ลง history ทันที (resolution โดยปริยาย)
    const now = new Date()
    const next = await prisma.$transaction(async (tx) => {
      const outcome = reassignOutcome()
      await tx.caseAssignment.update({
        where: { id: assignment.id },
        data: { status: outcome.previousStatus, reassignReason: reason, updatedBy: context.actor.id },
      })
      const replacement = await tx.caseAssignment.create({
        data: {
          organizationId: user.organizationId,
          caseId: row.id,
          agentId: agent.id,
          teamId: assignment.teamId,
          trackingRound: row.trackingRound,
          status: outcome.nextStatus,
          acceptedAt: outcome.acceptedAt,
          reassignedFrom: assignment.id,
          reassignReason: reason,
          createdBy: context.actor.id,
        },
        select: assignmentSelect,
      })
      await tx.reassignmentHistory.create({
        data: {
          organizationId: user.organizationId,
          caseId: row.id,
          pendingReassignmentId: null,
          fromAgentId: assignment.agentId,
          toAgentId: agent.id,
          reassignedBy: context.actor.id,
          requestedAt: now,
          resolvedAt: now,
          resolution: 'consented',
          reason,
          wasAcceptedBeforeReassign: false,
          createdBy: context.actor.id,
        },
      })
      await emitAudit(
        {
          organizationId: user.organizationId,
          actorId: context.actor.id,
          actorRole: context.actor.roleName,
          action: 'update',
          targetType: 'case_assignments',
          targetId: assignment.id,
          before: { agentId: assignment.agentId, status: assignment.status, acceptedAt: assignment.acceptedAt },
          after: {
            agentId: agent.id,
            status: outcome.nextStatus,
            acceptedAt: null,
            newAssignmentId: replacement.id,
            events: ['assignment.reassigned'],
          },
          reason,
          ipAddress: context.meta.ipAddress,
          userAgent: context.meta.userAgent,
          diffOnly: false,
        },
        tx as AssignmentTxClient,
      )
      return replacement
    })

    return toActionResult(row.id, next, null, ['assignment.reassigned'])
  }

  // กดรับแล้ว = สร้างคำขอรอความยินยอม เคสยังเป็นของคนเดิม ทำงานต่อได้ตามปกติ (`40` §11)
  const requestedAt = new Date()
  const policy = await getAssignmentPolicy(user.organizationId)
  const expiresAt = reassignmentExpiresAt(requestedAt, policy.reassignTimeoutHours)

  try {
    const pending = await prisma.$transaction(async (tx) => {
      const created = await tx.pendingReassignment.create({
        data: {
          organizationId: user.organizationId,
          caseId: row.id,
          assignmentId: assignment.id,
          fromAgentId: assignment.agentId,
          newAgentId: agent.id,
          requestedBy: context.actor.id,
          requestedAt,
          expiresAt,
          reason,
          status: 'waiting_consent',
          createdBy: context.actor.id,
        },
        select: pendingSelect,
      })
      await emitAudit(
        {
          organizationId: user.organizationId,
          actorId: context.actor.id,
          actorRole: context.actor.roleName,
          action: 'create',
          targetType: 'pending_reassignments',
          targetId: created.id,
          after: {
            caseId: row.id,
            caseRef: row.caseRef,
            fromAgentId: assignment.agentId,
            newAgentId: agent.id,
            expiresAt,
            events: ['assignment.reassignment_requested'],
          },
          reason,
          ipAddress: context.meta.ipAddress,
          userAgent: context.meta.userAgent,
          diffOnly: false,
        },
        tx as AssignmentTxClient,
      )
      return created
    })

    return toActionResult(row.id, assignment, pending, ['assignment.reassignment_requested'])
  } catch (error) {
    // ชนกับคำขอที่ค้างอยู่ (partial unique) — ตัวจริงของ `REASSIGNMENT_ALREADY_PENDING` อยู่ที่ DB
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      throw new AssignmentError('REASSIGNMENT_ALREADY_PENDING', { context: { caseId: row.id } })
    }
    throw error
  }
}

// ── POST /api/cases/:id/reassignment/respond (`40` §8/§12) ──────────────────

export async function respondReassignment(
  user: SessionUser,
  caseId: string,
  input: RespondReassignmentInput,
  context: AssignmentMutationContext,
): Promise<AssignmentActionResultDto> {
  const row = await loadCaseInScope(user, caseId)
  const pending = await loadLatestPending(row.id)
  if (pending === null) throw new AssignmentError('ASSIGNMENT_NOT_FOUND')

  if (pending.status === 'consented' || pending.status === 'declined') {
    throw new AssignmentError('ASSIGNMENT_INVALID_STATUS', { context: { status: pending.status } })
  }
  // `timeout_auto` และคำขอที่เลยเวลาแล้วตกที่ `REASSIGNMENT_ALREADY_TIMED_OUT` ตัวเดียวกัน (`40` §12)
  assertRespondable(
    { fromAgentId: pending.fromAgentId, expiresAt: pending.expiresAt, resolved: pending.status !== 'waiting_consent' },
    user.id,
    new Date(),
  )
  const declineReason = assertDeclineReason(input)

  const resolvedAt = new Date()
  const result = await prisma.$transaction(async (tx) => {
    // conditional update = ตัวตัดสินการแข่งกับ timeout job (แพ้ = job resolve ไปก่อนแล้ว)
    const claimed = await tx.pendingReassignment.updateMany({
      where: { id: pending.id, status: 'waiting_consent' },
      data: {
        status: input.decision === 'consent' ? 'consented' : 'declined',
        declineReason,
        resolvedAt,
        resolvedBy: context.actor.id,
        updatedBy: context.actor.id,
      },
    })
    if (claimed.count === 0) throw new AssignmentError('REASSIGNMENT_ALREADY_TIMED_OUT')

    if (input.decision === 'decline') {
      await emitAudit(
        {
          organizationId: user.organizationId,
          actorId: context.actor.id,
          actorRole: context.actor.roleName,
          action: 'reject',
          targetType: 'pending_reassignments',
          targetId: pending.id,
          before: { status: 'waiting_consent' },
          after: { status: 'declined', events: ['assignment.reassignment_declined'] },
          reason: declineReason,
          ipAddress: context.meta.ipAddress,
          userAgent: context.meta.userAgent,
          diffOnly: false,
        },
        tx as AssignmentTxClient,
      )
      // ไม่ยินยอม = ไม่มีอะไรเปลี่ยน เคสยังเป็นของคนเดิม (`40` §8)
      return null
    }

    const replacement = await swapAssignment(tx as AssignmentTxClient, {
      organizationId: user.organizationId,
      caseId: row.id,
      assignmentId: pending.assignmentId,
      fromAgentId: pending.fromAgentId,
      toAgentId: pending.newAgentId,
      teamId: row.assignedTeamId,
      trackingRound: row.trackingRound,
      reason: pending.reason,
      requestedAt: pending.requestedAt,
      resolvedAt,
      resolution: 'consented',
      actorId: context.actor.id,
      actorRole: context.actor.roleName,
      pendingReassignmentId: pending.id,
      events: ['assignment.reassignment_consented'],
      meta: context.meta,
    })
    return replacement
  })

  const events =
    input.decision === 'consent' ? ['assignment.reassignment_consented'] : ['assignment.reassignment_declined']
  if (result === null) {
    const current = await loadActiveAssignment(row.id, row.trackingRound)
    return toActionResult(row.id, current, null, events)
  }
  return toActionResult(row.id, result, null, events)
}

// ── POST /api/cases/:id/accept (`40` §8) ────────────────────────────────────

export async function acceptAssignment(
  user: SessionUser,
  caseId: string,
  context: AssignmentMutationContext,
): Promise<AssignmentActionResultDto> {
  const row = await loadCaseInScope(user, caseId)
  const current = await loadActiveAssignment(row.id, row.trackingRound)
  if (current === null) throw new AssignmentError('ASSIGNMENT_NOT_FOUND')
  assertAcceptable(current, user.id)

  const acceptedAt = new Date()
  const updated = await prisma.$transaction(async (tx) => {
    const claimed = await tx.caseAssignment.updateMany({
      where: { id: current.id, status: 'pending' },
      data: { status: 'accepted', acceptedAt, updatedBy: context.actor.id },
    })
    // กดรับซ้ำ/ถูก reassign ไปแล้วระหว่างทาง — สถานะเปลี่ยนไปแล้วต้องไม่เขียนทับเงียบ ๆ
    if (claimed.count === 0) throw new AssignmentError('ASSIGNMENT_INVALID_STATUS')

    await emitAudit(
      {
        organizationId: user.organizationId,
        actorId: context.actor.id,
        actorRole: context.actor.roleName,
        action: 'status_change',
        targetType: 'case_assignments',
        targetId: current.id,
        before: { status: current.status, acceptedAt: null },
        after: { status: 'accepted', acceptedAt, events: ['assignment.accepted'] },
        ipAddress: context.meta.ipAddress,
        userAgent: context.meta.userAgent,
        diffOnly: false,
      },
      tx as AssignmentTxClient,
    )

    return await tx.caseAssignment.findUniqueOrThrow({ where: { id: current.id }, select: assignmentSelect })
  })

  return toActionResult(row.id, updated, null, ['assignment.accepted'])
}

// ── ตัวสลับผู้รับผิดชอบ (ใช้ร่วมกับ timeout job) ─────────────────────────────

export interface SwapAssignmentInput {
  organizationId: string
  caseId: string
  assignmentId: string
  fromAgentId: string
  toAgentId: string
  teamId: string | null
  trackingRound: number
  reason: string
  requestedAt: Date
  resolvedAt: Date
  resolution: 'consented' | 'timeout_auto'
  /** NULL = ระบบ (timeout job) — `reason` ต้องมี job id ตาม `90` §13 */
  actorId: string | null
  actorRole: string | null
  pendingReassignmentId: string
  events: readonly string[]
  meta?: RequestMeta
  /** เหตุผลที่ลง audit (job ใส่ job id เพิ่ม) — ไม่ระบุ = ใช้ `reason` ของคำขอ */
  auditReason?: string
}

/**
 * ปิด assignment เดิม → เปิด assignment ใหม่ (`pending`, `accepted_at = null`) → ลง history
 * **ต้องเรียกใน `$transaction` เดียวกับ audit เสมอ** — ใช้ทั้งฝั่ง consent และ timeout job
 * เพื่อให้ผลลัพธ์ของ 2 ทางเหมือนกันเป๊ะ (`40` §11)
 */
export async function swapAssignment(
  tx: AssignmentTxClient,
  input: SwapAssignmentInput,
): Promise<Prisma.CaseAssignmentGetPayload<{ select: typeof assignmentSelect }>> {
  const outcome = reassignOutcome()
  const previous = await tx.caseAssignment.findUniqueOrThrow({
    where: { id: input.assignmentId },
    select: assignmentSelect,
  })

  await tx.caseAssignment.update({
    where: { id: input.assignmentId },
    data: { status: outcome.previousStatus, reassignReason: input.reason, updatedBy: input.actorId },
  })

  const replacement = await tx.caseAssignment.create({
    data: {
      organizationId: input.organizationId,
      caseId: input.caseId,
      agentId: input.toAgentId,
      teamId: input.teamId ?? previous.teamId,
      trackingRound: input.trackingRound,
      status: outcome.nextStatus,
      acceptedAt: outcome.acceptedAt,
      reassignedFrom: input.assignmentId,
      reassignReason: input.reason,
      createdBy: input.actorId ?? previous.createdBy,
    },
    select: assignmentSelect,
  })

  await tx.reassignmentHistory.create({
    data: {
      organizationId: input.organizationId,
      caseId: input.caseId,
      pendingReassignmentId: input.pendingReassignmentId,
      fromAgentId: input.fromAgentId,
      toAgentId: input.toAgentId,
      reassignedBy: input.actorId ?? previous.createdBy,
      requestedAt: input.requestedAt,
      resolvedAt: input.resolvedAt,
      resolution: input.resolution,
      reason: input.reason,
      // สาขานี้ใช้เฉพาะเคสที่พนักงานกดรับแล้ว (สาขา immediate ลง history เองที่ `reassignCase`)
      wasAcceptedBeforeReassign: true,
      createdBy: input.actorId ?? previous.createdBy,
    },
  })

  await emitAudit(
    {
      organizationId: input.organizationId,
      actorId: input.actorId,
      actorRole: input.actorRole,
      action: 'update',
      targetType: 'case_assignments',
      targetId: input.assignmentId,
      before: { agentId: input.fromAgentId, status: previous.status, acceptedAt: previous.acceptedAt },
      after: {
        agentId: input.toAgentId,
        status: outcome.nextStatus,
        acceptedAt: null,
        newAssignmentId: replacement.id,
        resolution: input.resolution,
        events: input.events,
      },
      reason: input.auditReason ?? input.reason,
      ipAddress: input.meta?.ipAddress ?? null,
      userAgent: input.meta?.userAgent ?? null,
      diffOnly: false,
    },
    tx,
  )

  return replacement
}

// ── scope ระดับแถวของ endpoint ที่อ้างทีมตรง (`40` §20 — หัวหน้าข้ามทีมไม่ได้) ──

export function assertTeamInScope(user: SessionUser, teamId: string): void {
  if (!isWithinScope(user.scope, { teamId })) {
    throw new AuthError('PERMISSION_DENIED', `team=${teamId} user=${user.id}`)
  }
}

export type { AssignmentState }
