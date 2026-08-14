import { emitAudit } from '@/lib/audit/audit'
import { AuthError } from '@/lib/auth/errors'
import type { RequestMeta } from '@/lib/auth/request-meta'
import { isWithinScope } from '@/lib/auth/scope'
import type { SessionUser } from '@/lib/auth/types'
import { Prisma } from '@/lib/generated/prisma/client'
import { prisma } from '@/lib/prisma'
import { TeamError } from '@/lib/teams/errors'
import {
  ACTIVE_CASE_STATUSES,
  assertProvincesKnown,
  assertSupervisorAvailable,
  assertTeamDeactivatable,
  assertTeamMembersEligible,
  diffManagers,
  normalizeTeamValues,
  toTeamAuditPayload,
  TEAM_ROLE_GROUPS,
  type TeamValues,
} from '@/lib/teams/team'
import type { TeamListQuery } from '@/lib/teams/schemas'
import type { EligibleMemberDto, TeamDto, TeamMemberRefDto } from '@/lib/teams/types'

/**
 * ชั้นข้อมูลของโมดูลทีม (ไฟล์ 09) — **แยกจาก pure logic** (`lib/teams/team.ts`)
 *
 * ทุก query กรองด้วย `organization_id` เสมอ (`02` §2) · ทุก mutation อยู่ใน `$transaction`
 * เดียวกับ `emitAudit()` พร้อม `reason` (ทีม = ผูกแผนค่าตอบแทน + คุม scope การเห็นข้อมูล)
 *
 * `team_managers` เป็น junction ไม่มี common columns (`02` §2.4) — ประวัติการเพิ่ม/ถอดผู้จัดการ
 * จึงอยู่ใน audit ของ `teams` เท่านั้น (field `manager_ids` ใน before/after)
 */

/**
 * เงื่อนไข "เคสที่ยังไม่จบ" ของทีม — แยกออกมาเป็นตัวแปรธรรมดา (ไม่ `as const`) เพราะ
 * Prisma ไม่รับ `readonly` array ใน `in` filter · ใช้ร่วมทั้งตัวนับบนตารางและยามตอนปิดทีม
 */
const activeCaseWhere = { status: { in: [...ACTIVE_CASE_STATUSES] }, deletedAt: null }

const teamSelect = {
  id: true,
  name: true,
  side: true,
  status: true,
  provinces: true,
  compensationPlanId: true,
  updatedAt: true,
  compensationPlan: { select: { name: true, side: true } },
  supervisor: { select: { id: true, fullName: true, role: { select: { name: true } } } },
  managers: {
    select: { user: { select: { id: true, fullName: true, role: { select: { name: true } } } } },
  },
  _count: {
    select: {
      members: { where: { deletedAt: null } },
      casesAssigned: { where: activeCaseWhere },
    },
  },
} as const

type TeamRow = Prisma.TeamGetPayload<{ select: typeof teamSelect }>

function toMemberRef(user: { id: string; fullName: string; role: { name: string } }): TeamMemberRefDto {
  return { id: user.id, fullName: user.fullName, roleName: user.role.name }
}

function toDto(row: TeamRow): TeamDto {
  return {
    id: row.id,
    name: row.name,
    side: row.side,
    status: row.status,
    provinces: row.provinces,
    compensationPlanId: row.compensationPlanId ?? '',
    compensationPlanName: row.compensationPlan?.name ?? null,
    compensationPlanSide: row.compensationPlan?.side ?? null,
    supervisor: row.supervisor === null ? null : toMemberRef(row.supervisor),
    managers: row.managers.map((link) => toMemberRef(link.user)),
    memberCount: row._count.members,
    activeCaseCount: row._count.casesAssigned,
    updatedAt: row.updatedAt.toISOString(),
  }
}

function toValues(dto: TeamDto): TeamValues {
  return {
    name: dto.name,
    side: dto.side,
    compensationPlanId: dto.compensationPlanId,
    supervisorId: dto.supervisor?.id ?? null,
    managerIds: dto.managers.map((manager) => manager.id),
    provinces: dto.provinces,
    status: dto.status,
  }
}

/**
 * scope ระดับแถว (Rule 03 · `09` §12) — ผู้จัดการ/หัวหน้าทีมเห็นเฉพาะทีมตัวเองตาม `team_managers`
 * `global` (Superadmin/บริหาร/การเงิน/บัญชี) เห็นทุกทีม · `company`/`self` ไม่มีสิทธิ์เมนูนี้อยู่แล้ว
 */
function teamScopeFilter(user: SessionUser): { id?: { in: string[] } } {
  if (user.scope.kind !== 'team') return {}
  return { id: { in: [...user.scope.teamIds] } }
}

/** ทีมที่อยู่นอก scope ตอบ 403 — ไม่ใช่ 404 (ผู้ใช้รู้อยู่แล้วว่ามีทีมอื่นในองค์กร) */
function assertTeamInScope(user: SessionUser, teamId: string): void {
  if (!isWithinScope(user.scope, { teamId })) {
    throw new AuthError('PERMISSION_DENIED', `team=${teamId} user=${user.id}`)
  }
}

export async function listTeams(user: SessionUser, query: TeamListQuery): Promise<TeamDto[]> {
  const organizationId = user.organizationId
  const rows = await prisma.team.findMany({
    where: {
      organizationId,
      deletedAt: null,
      ...teamScopeFilter(user),
      side: query.side,
      status: query.status === 'all' ? undefined : query.status,
      provinces: query.province === undefined ? undefined : { has: query.province },
      ...(query.search === undefined
        ? {}
        : {
            OR: [
              { name: { contains: query.search, mode: 'insensitive' } },
              { managers: { some: { user: { fullName: { contains: query.search, mode: 'insensitive' } } } } },
            ],
          }),
    },
    select: teamSelect,
    orderBy: [{ side: 'asc' }, { name: 'asc' }],
  })
  return rows.map(toDto)
}

export async function getTeam(user: SessionUser, teamId: string): Promise<TeamDto> {
  const row = await prisma.team.findFirst({
    where: { id: teamId, organizationId: user.organizationId, deletedAt: null },
    select: teamSelect,
  })
  if (!row) throw new TeamError('TEAM_NOT_FOUND', { detail: `team=${teamId}` })
  assertTeamInScope(user, row.id)
  return toDto(row)
}

/**
 * ผู้ใช้ที่ตั้งเป็นผู้จัดการ/หัวหน้าทีมได้ (`09` §7.1) — active + role group inhouse/outsource
 * แนบทีมที่เป็นหัวหน้าอยู่แล้วมาด้วย เพื่อให้ฟอร์มเตือนก่อนกด (API ยังปฏิเสธซ้ำเสมอ)
 */
export async function listEligibleMembers(organizationId: string): Promise<EligibleMemberDto[]> {
  const rows = await prisma.user.findMany({
    where: {
      organizationId,
      deletedAt: null,
      status: 'active',
      role: { roleGroup: { in: [...TEAM_ROLE_GROUPS] } },
    },
    select: {
      id: true,
      fullName: true,
      role: { select: { name: true, roleGroup: true } },
      supervisedTeams: {
        where: { deletedAt: null },
        select: { id: true, name: true },
        take: 1,
      },
    },
    orderBy: { fullName: 'asc' },
  })

  return rows.map((row) => {
    const supervised = row.supervisedTeams[0] ?? null
    return {
      id: row.id,
      fullName: row.fullName,
      roleName: row.role.name,
      roleGroup: row.role.roleGroup === 'outsource' ? 'outsource' : 'inhouse',
      supervisedTeamId: supervised?.id ?? null,
      supervisedTeamName: supervised?.name ?? null,
    }
  })
}

interface MutationContext {
  actor: SessionUser
  meta: RequestMeta
  reason: string
}

async function assertNameAvailable(organizationId: string, name: string, exceptTeamId?: string): Promise<void> {
  const duplicate = await prisma.team.findFirst({
    where: { organizationId, name, deletedAt: null, id: exceptTeamId === undefined ? undefined : { not: exceptTeamId } },
    select: { id: true },
  })
  if (duplicate) throw new TeamError('DUPLICATE_TEAM_NAME', { detail: `name=${name}` })
}

/** ทุกทีมต้องผูกแผนค่าตอบแทนที่ยังใช้งานอยู่และเป็นเวอร์ชันปัจจุบัน (`09` §7 · `11` §10) */
async function assertPlanUsable(organizationId: string, planId: string): Promise<void> {
  const plan = await prisma.compensationPlan.findFirst({
    where: { id: planId, organizationId, deletedAt: null, isCurrent: true },
    select: { id: true },
  })
  if (!plan) throw new TeamError('PLAN_NOT_FOUND', { detail: `plan=${planId}` })
}

/** ตรวจผู้จัดการ/หัวหน้าทีมทีเดียวทั้งชุด แล้วส่งต่อให้ยาม pure ตัดสิน */
async function assertPeopleUsable(
  organizationId: string,
  values: TeamValues,
  currentTeamId: string | null,
): Promise<void> {
  const ids = [...values.managerIds]
  if (values.supervisorId !== null) ids.push(values.supervisorId)
  if (ids.length === 0) return

  const candidates = await prisma.user.findMany({
    where: { id: { in: ids }, organizationId, deletedAt: null },
    select: {
      id: true,
      status: true,
      role: { select: { roleGroup: true } },
      supervisedTeams: { where: { deletedAt: null }, select: { id: true }, take: 1 },
    },
  })

  assertTeamMembersEligible(
    ids,
    candidates.map((candidate) => ({
      id: candidate.id,
      status: candidate.status,
      roleGroup: candidate.role.roleGroup,
      supervisedTeamId: candidate.supervisedTeams[0]?.id ?? null,
    })),
  )

  if (values.supervisorId !== null) {
    const supervisor = candidates.find((candidate) => candidate.id === values.supervisorId)
    assertSupervisorAvailable(values.supervisorId, supervisor?.supervisedTeams[0]?.id ?? null, currentTeamId)
  }
}

/** จำนวนเคสที่ยังไม่จบของทีม (`09` §10 · D7) — ใช้ทั้งตอนปิดทีมและตอนลบทีม */
export async function countActiveCases(organizationId: string, teamId: string): Promise<number> {
  return prisma.case.count({
    where: {
      organizationId,
      deletedAt: null,
      assignedTeamId: teamId,
      status: { in: [...ACTIVE_CASE_STATUSES] },
    },
  })
}

export async function createTeam(context: MutationContext, input: TeamValues): Promise<TeamDto> {
  const organizationId = context.actor.organizationId
  const values = normalizeTeamValues(input)

  assertProvincesKnown(values.provinces)
  await assertNameAvailable(organizationId, values.name)
  await assertPlanUsable(organizationId, values.compensationPlanId)
  await assertPeopleUsable(organizationId, values, null)

  const created = await prisma.$transaction(async (tx) => {
    const team = await tx.team.create({
      data: {
        organizationId,
        name: values.name,
        side: values.side,
        compensationPlanId: values.compensationPlanId,
        supervisorId: values.supervisorId,
        provinces: values.provinces,
        status: values.status,
        createdBy: context.actor.id,
        managers: { create: values.managerIds.map((userId) => ({ userId })) },
      },
      select: teamSelect,
    })

    await emitAudit(
      {
        organizationId,
        actorId: context.actor.id,
        actorRole: context.actor.roleName,
        action: 'create',
        targetType: 'teams',
        targetId: team.id,
        after: toTeamAuditPayload(values),
        reason: context.reason,
        ipAddress: context.meta.ipAddress,
        userAgent: context.meta.userAgent,
      },
      tx,
    )

    return team
  })

  return toDto(created)
}

export async function updateTeam(
  context: MutationContext,
  current: TeamDto,
  input: TeamValues,
): Promise<TeamDto> {
  const organizationId = context.actor.organizationId
  const values = normalizeTeamValues(input)
  const before = toValues(current)

  assertProvincesKnown(values.provinces)
  if (values.name !== current.name) await assertNameAvailable(organizationId, values.name, current.id)
  if (values.compensationPlanId !== current.compensationPlanId) {
    await assertPlanUsable(organizationId, values.compensationPlanId)
  }
  await assertPeopleUsable(organizationId, values, current.id)

  // ปิดทีม = ต้องไม่มีเคสค้าง (`09` §10) — เปิดทีมกลับทำได้เสมอ
  if (before.status === 'active' && values.status === 'inactive') {
    assertTeamDeactivatable(await countActiveCases(organizationId, current.id))
  }

  const managers = diffManagers(before.managerIds, values.managerIds)

  const updated = await prisma.$transaction(async (tx) => {
    const team = await tx.team.update({
      where: { id: current.id },
      data: {
        name: values.name,
        side: values.side,
        compensationPlanId: values.compensationPlanId,
        supervisorId: values.supervisorId,
        provinces: values.provinces,
        status: values.status,
        updatedBy: context.actor.id,
      },
      select: teamSelect,
    })

    if (managers.removed.length > 0) {
      await tx.teamManager.deleteMany({ where: { teamId: current.id, userId: { in: managers.removed } } })
    }
    if (managers.added.length > 0) {
      await tx.teamManager.createMany({
        data: managers.added.map((userId) => ({ teamId: current.id, userId })),
        skipDuplicates: true,
      })
    }

    await emitAudit(
      {
        organizationId,
        actorId: context.actor.id,
        actorRole: context.actor.roleName,
        action: 'update',
        targetType: 'teams',
        targetId: current.id,
        before: toTeamAuditPayload(before),
        after: toTeamAuditPayload(values),
        reason: context.reason,
        ipAddress: context.meta.ipAddress,
        userAgent: context.meta.userAgent,
      },
      tx,
    )

    return team
  })

  return toDto(updated)
}

/** เพิ่ม/ถอดผู้จัดการรายคน (`09` §14) — ใช้ path เดียวกับ PATCH แต่แตะเฉพาะ `team_managers` */
export async function setTeamManager(
  context: MutationContext,
  current: TeamDto,
  userId: string,
  attach: boolean,
): Promise<TeamDto> {
  const organizationId = context.actor.organizationId
  const before = toValues(current)
  const nextManagerIds = attach
    ? [...before.managerIds, userId]
    : before.managerIds.filter((id) => id !== userId)

  if (attach) {
    await assertPeopleUsable(organizationId, { ...before, managerIds: [userId], supervisorId: null }, current.id)
  }

  const managers = diffManagers(before.managerIds, nextManagerIds)
  if (managers.added.length === 0 && managers.removed.length === 0) return current

  const updated = await prisma.$transaction(async (tx) => {
    if (attach) {
      await tx.teamManager.createMany({ data: [{ teamId: current.id, userId }], skipDuplicates: true })
    } else {
      await tx.teamManager.deleteMany({ where: { teamId: current.id, userId } })
    }

    await tx.team.update({ where: { id: current.id }, data: { updatedBy: context.actor.id } })

    await emitAudit(
      {
        organizationId,
        actorId: context.actor.id,
        actorRole: context.actor.roleName,
        action: 'update',
        targetType: 'teams',
        targetId: current.id,
        before: { manager_ids: before.managerIds },
        after: { manager_ids: nextManagerIds },
        reason: context.reason,
        ipAddress: context.meta.ipAddress,
        userAgent: context.meta.userAgent,
        diffOnly: false,
      },
      tx,
    )

    return tx.team.findFirstOrThrow({ where: { id: current.id }, select: teamSelect })
  })

  return toDto(updated)
}

/** ลบทีม = soft delete (`02` §2.4) — ทีมที่ยังมีเคสค้างลบไม่ได้เหมือนกับการปิดทีม (`09` §10) */
export async function deleteTeam(context: MutationContext, current: TeamDto): Promise<void> {
  const organizationId = context.actor.organizationId
  assertTeamDeactivatable(await countActiveCases(organizationId, current.id))

  await prisma.$transaction(async (tx) => {
    await tx.team.update({
      where: { id: current.id },
      data: { deletedAt: new Date(), status: 'inactive', updatedBy: context.actor.id },
    })

    await emitAudit(
      {
        organizationId,
        actorId: context.actor.id,
        actorRole: context.actor.roleName,
        action: 'delete',
        targetType: 'teams',
        targetId: current.id,
        before: toTeamAuditPayload(toValues(current)),
        reason: context.reason,
        ipAddress: context.meta.ipAddress,
        userAgent: context.meta.userAgent,
        diffOnly: false,
      },
      tx,
    )
  })
}
