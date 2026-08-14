import { emitAudit } from '@/lib/audit/audit'
import { AuthError } from '@/lib/auth/errors'
import type { RequestMeta } from '@/lib/auth/request-meta'
import { isWithinScope } from '@/lib/auth/scope'
import { invalidateSessionCache } from '@/lib/auth/session-cache'
import { assertNotLastSuperadmin } from '@/lib/auth/superadmin-guard'
import { countActiveSuperadmins } from '@/lib/auth/superadmin-queries'
import { SUPERADMIN_ROLE_NAME } from '@/lib/auth/constants'
import type { SessionUser } from '@/lib/auth/types'
import { FinanceCompanyError } from '@/lib/finance-companies/errors'
import type { Prisma, UserStatus } from '@/lib/generated/prisma/client'
import type { RoleGroup } from '@/lib/generated/prisma/enums'
import { prisma } from '@/lib/prisma'
import { TeamError } from '@/lib/teams/errors'
import { ACTIVE_CASE_STATUSES } from '@/lib/teams/team'
import { UserError } from '@/lib/users/errors'
import { buildInviteRedirectUrl, inviteWarning } from '@/lib/users/invite'
import { inviteUser, resendInvite, syncAuthEmail } from '@/lib/users/provisioning'
import type { UserListQuery } from '@/lib/users/schemas'
import type { UserDto } from '@/lib/users/types'
import {
  assertScopeConsistent,
  assertUserDeletable,
  assertUserStatusTransition,
  normalizeUserValues,
  toUserAuditPayload,
  type UserValues,
} from '@/lib/users/user'

/**
 * ชั้นข้อมูลของโมดูลผู้ใช้งาน (ไฟล์ 08) — **แยกจาก pure logic** (`lib/users/user.ts`)
 *
 * ทุก query กรองด้วย `organization_id` เสมอ (`02` §2) · ทุก mutation อยู่ใน `$transaction`
 * เดียวกับ `emitAudit()` พร้อม `reason` (ผู้ใช้ = สิทธิ์การเข้าถึงข้อมูล — `90` §13)
 *
 * ⚠️ ทุกครั้งที่ role/สถานะ/ทีม/บริษัทเปลี่ยน ต้อง `invalidateSessionCache()` ของ user นั้น
 * ไม่งั้น session เดิมยังถือสิทธิ์เก่าได้อีกไม่เกิน 5 นาที (`lib/auth/session-cache.ts`)
 *
 * **Provisioning (มติ PO ปิด D1)**: สร้างผู้ใช้ = เชิญทางอีเมลด้วย `inviteUserByEmail` แล้วเก็บ
 * `supabase_uid` ที่ได้ลงในธุรกรรมเดียวกับการสร้าง · ถ้าเชิญไม่สำเร็จ **ไม่ล้มทั้งงาน** —
 * บันทึกผู้ใช้ไว้โดย `supabase_uid = null` แล้วส่งคำเชิญซ้ำผ่าน `POST /api/users/:id/invite` ได้
 */

const activeAssignmentWhere = {
  case: { status: { in: [...ACTIVE_CASE_STATUSES] }, deletedAt: null },
}

const userSelect = {
  id: true,
  email: true,
  fullName: true,
  phone: true,
  employeeCode: true,
  roleId: true,
  teamId: true,
  companyId: true,
  status: true,
  supabaseUid: true,
  lastLoginAt: true,
  updatedAt: true,
  role: { select: { name: true, roleGroup: true } },
  team: { select: { name: true } },
  company: { select: { name: true } },
  _count: { select: { assignmentsAsAgent: { where: activeAssignmentWhere } } },
} as const

type UserRow = Prisma.UserGetPayload<{ select: typeof userSelect }>

function toDto(row: UserRow): UserDto {
  return {
    id: row.id,
    email: row.email,
    fullName: row.fullName,
    phone: row.phone,
    employeeCode: row.employeeCode,
    roleId: row.roleId,
    roleName: row.role.name,
    roleGroup: row.role.roleGroup,
    teamId: row.teamId,
    teamName: row.team?.name ?? null,
    companyId: row.companyId,
    companyName: row.company?.name ?? null,
    status: row.status,
    isProvisioned: row.supabaseUid !== null,
    lastLoginAt: row.lastLoginAt?.toISOString() ?? null,
    activeCaseCount: row._count.assignmentsAsAgent,
    updatedAt: row.updatedAt.toISOString(),
  }
}

function toValues(dto: UserDto): UserValues {
  return {
    roleId: dto.roleId,
    email: dto.email,
    fullName: dto.fullName,
    phone: dto.phone,
    employeeCode: dto.employeeCode,
    teamId: dto.teamId,
    companyId: dto.companyId,
  }
}

/**
 * scope ระดับแถว (Rule 03 · `08` §12) — ผู้จัดการเห็นเฉพาะผู้ใช้ในทีมที่ตนดูแล ·
 * company user เห็นเฉพาะคนในบริษัทตัวเอง · Field Agent (`self`) เห็นเฉพาะตัวเอง
 */
function userScopeFilter(user: SessionUser): Prisma.UserWhereInput {
  switch (user.scope.kind) {
    case 'global':
      return {}
    case 'team':
      return { OR: [{ teamId: { in: [...user.scope.teamIds] } }, { id: user.id }] }
    case 'company':
      return { companyId: user.scope.companyId ?? '00000000-0000-0000-0000-000000000000' }
    case 'self':
      return { id: user.id }
  }
}

/** แถวนอก scope ตอบ 403 ไม่ใช่ 404 (ผู้เรียกรู้อยู่แล้วว่ามีผู้ใช้คนอื่นในองค์กร) */
function assertUserInScope(actor: SessionUser, target: { id: string; teamId: string | null; companyId: string | null }): void {
  if (target.id === actor.id) return
  if (!isWithinScope(actor.scope, { teamId: target.teamId, companyId: target.companyId, userId: target.id })) {
    throw new AuthError('PERMISSION_DENIED', `target=${target.id} user=${actor.id}`)
  }
}

export async function listUsers(user: SessionUser, query: UserListQuery): Promise<UserDto[]> {
  const rows = await prisma.user.findMany({
    where: {
      organizationId: user.organizationId,
      deletedAt: null,
      ...userScopeFilter(user),
      status: query.status === 'all' ? { in: ['active', 'suspended'] } : query.status,
      roleId: query.roleId,
      teamId: query.teamId,
      companyId: query.companyId,
      role: query.roleGroup === undefined ? undefined : { roleGroup: { in: query.roleGroup } },
      ...(query.search === undefined
        ? {}
        : {
            OR: [
              { fullName: { contains: query.search, mode: 'insensitive' } },
              { email: { contains: query.search, mode: 'insensitive' } },
              { phone: { contains: query.search.replace(/[\s-]/g, '') } },
            ],
          }),
    },
    select: userSelect,
    orderBy: [{ status: 'asc' }, { fullName: 'asc' }],
  })
  return rows.map(toDto)
}

export async function getUser(user: SessionUser, userId: string): Promise<UserDto> {
  const row = await prisma.user.findFirst({
    where: { id: userId, organizationId: user.organizationId, deletedAt: null },
    select: userSelect,
  })
  if (!row) throw new UserError('USER_NOT_FOUND', { detail: `user=${userId}` })
  assertUserInScope(user, { id: row.id, teamId: row.teamId, companyId: row.companyId })
  return toDto(row)
}

interface MutationContext {
  actor: SessionUser
  meta: RequestMeta
  reason: string
  /** origin ของ request — ใช้ประกอบลิงก์ตั้งรหัสผ่านในอีเมลคำเชิญ (`lib/users/invite.ts`) */
  origin?: string
}

/** ผลของ mutation ที่อาจมีเรื่องต้องเตือนแม้สำเร็จ (เช่น ส่งอีเมลคำเชิญไม่ผ่าน) */
export interface UserMutationResult {
  user: UserDto
  warning: { code: string; title: string; message: string } | null
}

/** role ที่เลือกต้องอยู่ในองค์กรเดียวกันและยังไม่ถูกลบ — คืน role group ไปตรวจ conditional required ต่อ */
async function loadRole(organizationId: string, roleId: string): Promise<{ name: string; roleGroup: RoleGroup }> {
  const role = await prisma.role.findFirst({
    where: { id: roleId, organizationId, deletedAt: null },
    select: { name: true, roleGroup: true },
  })
  if (!role) throw new UserError('ROLE_NOT_FOUND', { detail: `role=${roleId}` })
  return role
}

async function assertEmailAvailable(organizationId: string, email: string, exceptUserId?: string): Promise<void> {
  const duplicate = await prisma.user.findFirst({
    where: {
      organizationId,
      email,
      deletedAt: null,
      id: exceptUserId === undefined ? undefined : { not: exceptUserId },
    },
    select: { id: true },
  })
  if (duplicate) throw new UserError('DUPLICATE_USER_EMAIL', { detail: `email=${email}` })
}

async function assertPhoneAvailable(
  organizationId: string,
  phone: string | null,
  exceptUserId?: string,
): Promise<void> {
  if (phone === null) return
  const duplicate = await prisma.user.findFirst({
    where: {
      organizationId,
      phone,
      deletedAt: null,
      id: exceptUserId === undefined ? undefined : { not: exceptUserId },
    },
    select: { id: true },
  })
  if (duplicate) throw new UserError('DUPLICATE_USER_PHONE', { detail: `phone=${phone}` })
}

/** ทีม/บริษัทที่อ้างต้องมีจริงในองค์กร — ใช้ code ของโมดูลเจ้าของ (`24` §6.1) ไม่ตั้ง code ใหม่ */
async function assertReferencesExist(organizationId: string, values: UserValues): Promise<void> {
  if (values.teamId !== null) {
    const team = await prisma.team.findFirst({
      where: { id: values.teamId, organizationId, deletedAt: null },
      select: { id: true },
    })
    if (!team) throw new TeamError('TEAM_NOT_FOUND', { detail: `team=${values.teamId}` })
  }
  if (values.companyId !== null) {
    const company = await prisma.financeCompany.findFirst({
      where: { id: values.companyId, organizationId, deletedAt: null },
      select: { id: true },
    })
    if (!company) throw new FinanceCompanyError('COMPANY_NOT_FOUND', { detail: `company=${values.companyId}` })
  }
}

/**
 * ยาม lockout (`05` §10 · `07` §11) — กันทั้ง 2 ทางที่ทำให้ Superadmin ที่ active หมดไป:
 * ย้าย role ออกจาก Superadmin และเปลี่ยนสถานะเป็นไม่ active
 */
async function assertSuperadminSafety(
  organizationId: string,
  current: { roleName: string; status: UserStatus },
  next: { roleName: string; status: UserStatus },
): Promise<void> {
  const isSuperadminNow = current.roleName === SUPERADMIN_ROLE_NAME
  if (!isSuperadminNow) return

  assertNotLastSuperadmin({
    isSuperadminNow,
    isActiveNow: current.status === 'active',
    willBeSuperadmin: next.roleName === SUPERADMIN_ROLE_NAME,
    willBeActive: next.status === 'active',
    activeSuperadminCount: await countActiveSuperadmins(organizationId),
  })
}

export async function createUser(context: MutationContext, input: UserValues): Promise<UserMutationResult> {
  const organizationId = context.actor.organizationId
  const values = normalizeUserValues(input)
  const role = await loadRole(organizationId, values.roleId)

  assertScopeConsistent(role.roleGroup, values)
  await assertEmailAvailable(organizationId, values.email)
  await assertPhoneAvailable(organizationId, values.phone)
  await assertReferencesExist(organizationId, values)

  // เชิญก่อนเขียน DB เพื่อให้ `supabase_uid` ลงไปในธุรกรรมเดียวกัน (audit เห็นค่าจริงตั้งแต่แถวแรก)
  // เชิญไม่สำเร็จ = ยังสร้างผู้ใช้ต่อโดย uid เป็น null แล้วเตือนให้ส่งคำเชิญซ้ำ
  const outcome =
    context.origin === undefined
      ? null
      : await inviteUser(values.email, buildInviteRedirectUrl(context.origin))

  const created = await prisma.$transaction(async (tx) => {
    const user = await tx.user.create({
      data: {
        organizationId,
        roleId: values.roleId,
        supabaseUid: outcome?.uid ?? null,
        email: values.email,
        fullName: values.fullName,
        phone: values.phone,
        employeeCode: values.employeeCode,
        teamId: values.teamId,
        companyId: values.companyId,
        status: 'active',
        createdBy: context.actor.id,
      },
      select: userSelect,
    })

    await emitAudit(
      {
        organizationId,
        actorId: context.actor.id,
        actorRole: context.actor.roleName,
        action: 'create',
        targetType: 'users',
        targetId: user.id,
        after: {
          ...toUserAuditPayload(values, { status: 'active', roleName: role.name }),
          supabase_uid: outcome?.uid ?? null,
          invite_email_sent: outcome?.emailSent ?? false,
        },
        reason: context.reason,
        ipAddress: context.meta.ipAddress,
        userAgent: context.meta.userAgent,
      },
      tx,
    )

    return user
  })

  return { user: toDto(created), warning: outcome === null ? null : inviteWarning(outcome) }
}

/**
 * ส่งคำเชิญตั้งรหัสผ่าน (ครั้งแรกหรือส่งซ้ำ — `POST /api/users/:id/invite`)
 * ผูก `supabase_uid` ที่ได้กลับเข้า record เสมอ · ล้มเหลว = `INVITE_SEND_FAILED` (ผู้ใช้กดปุ่มนี้มาเพื่อสิ่งนี้)
 */
export async function sendUserInvite(
  context: MutationContext & { origin: string },
  current: UserDto,
): Promise<UserMutationResult> {
  const organizationId = context.actor.organizationId
  if (current.status === 'deleted') {
    throw new UserError('INVALID_USER_STATUS_TRANSITION', { detail: `user=${current.id} status=deleted` })
  }

  const outcome = await resendInvite(current.email, buildInviteRedirectUrl(context.origin))

  const updated = await prisma.$transaction(async (tx) => {
    const user = await tx.user.update({
      where: { id: current.id },
      data: { supabaseUid: outcome.uid, updatedBy: context.actor.id },
      select: userSelect,
    })

    await emitAudit(
      {
        organizationId,
        actorId: context.actor.id,
        actorRole: context.actor.roleName,
        action: 'update',
        targetType: 'users',
        targetId: current.id,
        before: { supabase_uid: current.isProvisioned ? 'linked' : null },
        after: { supabase_uid: outcome.uid, invite_email_sent: outcome.emailSent },
        reason: context.reason,
        ipAddress: context.meta.ipAddress,
        userAgent: context.meta.userAgent,
        diffOnly: false,
      },
      tx,
    )

    return user
  })

  invalidateSession(updated.supabaseUid)
  return { user: toDto(updated), warning: inviteWarning(outcome) }
}

export async function updateUser(
  context: MutationContext,
  current: UserDto,
  input: UserValues,
): Promise<UserMutationResult> {
  const organizationId = context.actor.organizationId
  const values = normalizeUserValues(input)
  const before = toValues(current)
  const role = await loadRole(organizationId, values.roleId)

  assertScopeConsistent(role.roleGroup, values)
  if (values.email !== before.email) await assertEmailAvailable(organizationId, values.email, current.id)
  if (values.phone !== before.phone) await assertPhoneAvailable(organizationId, values.phone, current.id)
  await assertReferencesExist(organizationId, values)
  await assertSuperadminSafety(
    organizationId,
    { roleName: current.roleName, status: current.status },
    { roleName: role.name, status: current.status },
  )

  const updated = await prisma.$transaction(async (tx) => {
    const user = await tx.user.update({
      where: { id: current.id },
      data: {
        roleId: values.roleId,
        email: values.email,
        fullName: values.fullName,
        phone: values.phone,
        employeeCode: values.employeeCode,
        teamId: values.teamId,
        companyId: values.companyId,
        updatedBy: context.actor.id,
      },
      select: userSelect,
    })

    await emitAudit(
      {
        organizationId,
        actorId: context.actor.id,
        actorRole: context.actor.roleName,
        action: 'update',
        targetType: 'users',
        targetId: current.id,
        before: toUserAuditPayload(before, { status: current.status, roleName: current.roleName }),
        after: toUserAuditPayload(values, { status: current.status, roleName: role.name }),
        reason: context.reason,
        ipAddress: context.meta.ipAddress,
        userAgent: context.meta.userAgent,
      },
      tx,
    )

    return user
  })

  invalidateSession(updated.supabaseUid)

  // อีเมล = username ตอน login → ต้องย้ายฝั่ง Supabase Auth ตามด้วย (ล้มเหลว = เตือน ไม่ rollback ข้อมูลธุรกิจ)
  let warning: UserMutationResult['warning'] = null
  if (values.email !== before.email && updated.supabaseUid !== null) {
    const failure = await syncAuthEmail(updated.supabaseUid, values.email)
    if (failure !== null) {
      warning = {
        code: 'AUTH_EMAIL_NOT_SYNCED',
        title: 'บันทึกแล้ว แต่ย้ายอีเมลฝั่ง Supabase Auth ไม่สำเร็จ',
        message: `ผู้ใช้ยังต้องเข้าสู่ระบบด้วยอีเมลเดิมไปก่อน — แก้ที่ Supabase หรือลองบันทึกใหม่อีกครั้ง (${failure})`,
      }
    }
  }

  return { user: toDto(updated), warning }
}

/**
 * ระงับ / เปิดใช้งานกลับ (`08` §14 `PATCH /:id/suspend|reactivate`) — เหตุผลบังคับเสมอ (`08` §13)
 * user ที่ `suspended` login ไม่ได้ (`05` §10) และ session ที่ค้างอยู่ถูกล้าง cache ทันที
 */
export async function setUserStatus(
  context: MutationContext,
  current: UserDto,
  nextStatus: Extract<UserStatus, 'active' | 'suspended'>,
): Promise<UserDto> {
  const organizationId = context.actor.organizationId
  assertUserStatusTransition(current.status, nextStatus)
  await assertSuperadminSafety(
    organizationId,
    { roleName: current.roleName, status: current.status },
    { roleName: current.roleName, status: nextStatus },
  )

  const updated = await prisma.$transaction(async (tx) => {
    const user = await tx.user.update({
      where: { id: current.id },
      data: { status: nextStatus, updatedBy: context.actor.id },
      select: userSelect,
    })

    await emitAudit(
      {
        organizationId,
        actorId: context.actor.id,
        actorRole: context.actor.roleName,
        action: 'update',
        targetType: 'users',
        targetId: current.id,
        before: { status: current.status },
        after: { status: nextStatus },
        reason: context.reason,
        ipAddress: context.meta.ipAddress,
        userAgent: context.meta.userAgent,
        diffOnly: false,
      },
      tx,
    )

    return user
  })

  invalidateSession(updated.supabaseUid)
  return toDto(updated)
}

/**
 * ประวัติที่ทำให้ลบผู้ใช้ไม่ได้ (`08` §10) — นับเฉพาะสิ่งที่เป็น "ร่องรอยการทำงานจริง"
 * (เคส/งานภาคสนาม/หลักฐาน/สายจ่ายเงิน/คลัง) บวกกับทีมที่ผู้ใช้ยังถือตำแหน่งอยู่
 *
 * audit log **ไม่นับ** — ทุกคนที่เคย login ก็มี audit จึงจะทำให้ลบใครไม่ได้เลยทั้งระบบ
 */
export async function countUserReferences(organizationId: string, userId: string): Promise<Record<string, number>> {
  const scope = { organizationId }
  const [
    assignments,
    casesCreated,
    checkIns,
    evidences,
    payeeProfiles,
    assets,
    lots,
    supervisedTeams,
    managedTeams,
  ] = await Promise.all([
    prisma.caseAssignment.count({ where: { ...scope, agentId: userId } }),
    prisma.case.count({ where: { ...scope, createdBy: userId } }),
    prisma.checkIn.count({ where: { ...scope, createdBy: userId } }),
    prisma.caseEvidence.count({ where: { ...scope, createdBy: userId } }),
    prisma.payeeProfile.count({ where: { ...scope, userId } }),
    prisma.asset.count({ where: { ...scope, createdBy: userId } }),
    prisma.handoverLot.count({ where: { ...scope, createdBy: userId } }),
    prisma.team.count({ where: { ...scope, supervisorId: userId, deletedAt: null } }),
    prisma.teamManager.count({ where: { userId, team: { organizationId, deletedAt: null } } }),
  ])

  return {
    assignments,
    cases_created: casesCreated,
    check_ins: checkIns,
    evidences,
    payee_profiles: payeeProfiles,
    assets,
    handover_lots: lots,
    supervised_teams: supervisedTeams,
    managed_teams: managedTeams,
  }
}

/**
 * ลบผู้ใช้ = **soft delete เท่านั้น** (`08` §7.2 — `deleted_at` + `status = deleted`)
 * ผู้ใช้ที่มีประวัติถูกปฏิเสธด้วย `USER_HAS_HISTORY` ต้องใช้ระงับการใช้งานแทน (`08` §10)
 */
export async function deleteUser(context: MutationContext, current: UserDto): Promise<void> {
  const organizationId = context.actor.organizationId
  assertUserStatusTransition(current.status, 'deleted')
  await assertSuperadminSafety(
    organizationId,
    { roleName: current.roleName, status: current.status },
    { roleName: current.roleName, status: 'deleted' },
  )
  assertUserDeletable(await countUserReferences(organizationId, current.id))

  const deleted = await prisma.$transaction(async (tx) => {
    const user = await tx.user.update({
      where: { id: current.id },
      data: { status: 'deleted', deletedAt: new Date(), updatedBy: context.actor.id },
      select: { supabaseUid: true },
    })

    await emitAudit(
      {
        organizationId,
        actorId: context.actor.id,
        actorRole: context.actor.roleName,
        action: 'delete',
        targetType: 'users',
        targetId: current.id,
        before: toUserAuditPayload(toValues(current), { status: current.status, roleName: current.roleName }),
        reason: context.reason,
        ipAddress: context.meta.ipAddress,
        userAgent: context.meta.userAgent,
        diffOnly: false,
      },
      tx,
    )

    return user
  })

  invalidateSession(deleted.supabaseUid)
}

/** ล้าง session cache ของผู้ใช้ที่ถูกแก้ — ผู้ใช้ที่ยังไม่ผูก Supabase Auth ไม่มี cache ให้ล้าง */
function invalidateSession(supabaseUid: string | null): void {
  if (supabaseUid !== null) invalidateSessionCache(supabaseUid)
}
