import { onUniqueViolation } from '@/lib/api/unique-violation'
import { emitAudit } from '@/lib/audit/audit'
import { AuthError } from '@/lib/auth/errors'
import { authEmailFor } from '@/lib/auth/login-identifier'
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
import {
  prepareUserPayment,
  writeUserPaymentInTx,
  type PreparedUserPayment,
  type UserPaymentInput,
  type UserPaymentWriteResult,
} from '@/lib/payees/queries'
import { prisma } from '@/lib/prisma'
import { TeamError } from '@/lib/teams/errors'
import { ACTIVE_CASE_STATUSES } from '@/lib/teams/team'
import {
  canChangeOwnRole,
  canManageAccountIn,
  canSetPasswordFor,
  mustChangeAfterAdminSet,
  canViewAccountsIn,
  hiddenAccountGroups,
} from '@/lib/users/auth-account'
import { UserError } from '@/lib/users/errors'
import {
  createAuthAccount,
  deleteAuthAccount,
  setAuthPassword,
  syncAuthEmail,
} from '@/lib/users/provisioning'
import type { UserListQuery } from '@/lib/users/schemas'
import type { UserDto } from '@/lib/users/types'
import {
  assertScopeConsistent,
  assertUserDeletable,
  assertUserStatusTransition,
  describeUserChanges,
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
 * **Provisioning (มติ PO 03/10/2569 — แทน flow เชิญของ D1)**: สร้างผู้ใช้ = สร้างบัญชี Supabase Auth
 * พร้อมรหัสผ่านที่ผู้ดูแลตั้งให้ **ก่อน** แล้วเขียน DB ในธุรกรรมเดียวกับ audit · DB ล้ม = ลบบัญชี Auth
 * ที่เพิ่งสร้างทิ้ง (ชดเชย) · ผู้ใช้ต้องเปลี่ยนรหัสเองตอน login ครั้งแรก (`must_change_password`)
 * รีเซ็ตรหัสภายหลังผ่าน `setUserPassword()` (`POST /api/users/:id/password`)
 */

const activeAssignmentWhere = {
  case: { status: { in: [...ACTIVE_CASE_STATUSES] }, deletedAt: null },
}

const userSelect = {
  id: true,
  username: true,
  email: true,
  fullName: true,
  phone: true,
  employeeCode: true,
  roleId: true,
  teamId: true,
  companyId: true,
  status: true,
  supabaseUid: true,
  mustChangePassword: true,
  lastLoginAt: true,
  updatedAt: true,
  role: { select: { name: true, roleGroup: true } },
  team: { select: { name: true } },
  company: { select: { name: true } },
  _count: { select: { assignmentsAsAgent: { where: activeAssignmentWhere } } },
  payeeProfile: { where: { deletedAt: null }, select: { id: true }, take: 1 },
} as const

type UserRow = Prisma.UserGetPayload<{ select: typeof userSelect }>

function toDto(row: UserRow): UserDto {
  return {
    id: row.id,
    username: row.username,
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
    mustChangePassword: row.mustChangePassword,
    lastLoginAt: row.lastLoginAt?.toISOString() ?? null,
    activeCaseCount: row._count.assignmentsAsAgent,
    payeeId: row.payeeProfile[0]?.id ?? null,
    updatedAt: row.updatedAt.toISOString(),
  }
}

function toValues(dto: UserDto): UserValues {
  return {
    roleId: dto.roleId,
    // แถวเก่าที่ไม่มี username ไม่มีแล้วหลัง backfill — `?? ''` กันชนิดเท่านั้น (ฟอร์มบังคับกรอก)
    username: dto.username ?? '',
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

/** แถวนอก scope ตอบ 404 เหมือนผู้ใช้ที่ไม่มีจริง — ไม่ leak ว่ามี record (มติ PO U138) */
function assertUserInScope(actor: SessionUser, target: { id: string; teamId: string | null; companyId: string | null }): void {
  if (target.id === actor.id) return
  if (!isWithinScope(actor.scope, { teamId: target.teamId, companyId: target.companyId, userId: target.id })) {
    throw new UserError('USER_NOT_FOUND', { detail: `user=${target.id} out of scope actor=${actor.id}` })
  }
}

/**
 * กรองกลุ่มบัญชีที่ผู้เรียกมองไม่เห็น (ธุรการไม่เห็นกลุ่ม system — UAT BUG-021) รวมกับตัวกรองกลุ่มจาก query
 * ตัวเองเห็นเสมอ (หน้าโปรไฟล์/ข้อมูลตัวเอง)
 */
function roleGroupFilter(user: SessionUser, requested: readonly RoleGroup[] | undefined): Prisma.UserWhereInput {
  const hidden = hiddenAccountGroups(user)
  const requestedFilter: Prisma.UserWhereInput =
    requested === undefined ? {} : { role: { roleGroup: { in: [...requested] } } }
  if (hidden.length === 0) return requestedFilter
  return {
    AND: [requestedFilter, { OR: [{ role: { roleGroup: { notIn: hidden } } }, { id: user.id }] }],
  }
}

export async function listUsers(user: SessionUser, query: UserListQuery): Promise<UserDto[]> {
  const rows = await prisma.user.findMany({
    where: {
      organizationId: user.organizationId,
      deletedAt: null,
      status: query.status === 'all' ? { in: ['active', 'suspended'] } : query.status,
      roleId: query.roleId,
      teamId: query.teamId,
      companyId: query.companyId,
      // ⚠️ ตัวกรองที่ใช้ `OR` ต้องอยู่ใน `AND` แยกก้อนเสมอ — เดิม spread ต่อกัน ทำให้ `OR` ของคำค้น
      // ทับ `OR` ของ scope ทีม (ผู้จัดการทีมค้นชื่อแล้วเห็นผู้ใช้นอกทีมทั้งองค์กร)
      AND: [
        userScopeFilter(user),
        roleGroupFilter(user, query.roleGroup),
        query.search === undefined
          ? {}
          : {
              OR: [
                { fullName: { contains: query.search, mode: 'insensitive' } },
                { username: { contains: query.search, mode: 'insensitive' } },
                { email: { contains: query.search, mode: 'insensitive' } },
                { phone: { contains: query.search.replace(/[\s-]/g, '') } },
              ],
            },
      ],
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
  // กลุ่มที่มองไม่เห็น (ธุรการ ↔ กลุ่ม system — UAT BUG-021) = 404 เหมือนแถวนอก scope (U138) · ตัวเองเห็นเสมอ
  if (row.id !== user.id && !canViewAccountsIn(user, row.role.roleGroup)) {
    throw new UserError('USER_NOT_FOUND', { detail: `user=${row.id} roleGroup=${row.role.roleGroup} hidden actor=${user.id}` })
  }
  return toDto(row)
}

interface MutationContext {
  actor: SessionUser
  meta: RequestMeta
  /** `null` ได้เฉพาะการสร้างผู้ใช้ (flow ปกติ — `lib/audit/reason-policy.ts`) */
  reason: string | null
}

/** ผลของ mutation ที่อาจมีเรื่องต้องเตือนแม้สำเร็จ (เช่น ย้ายอีเมลฝั่ง Supabase Auth ไม่ผ่าน) */
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

async function assertEmailAvailable(
  organizationId: string,
  email: string | null,
  exceptUserId?: string,
): Promise<void> {
  if (email === null) return
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

/** username ห้ามซ้ำในองค์กร (เทียบตัวพิมพ์เล็ก — เก็บตัวพิมพ์เล็กเสมอ) · DB มี partial unique index กันซ้ำอีกชั้น */
async function assertUsernameAvailable(organizationId: string, username: string, exceptUserId?: string): Promise<void> {
  const duplicate = await prisma.user.findFirst({
    where: {
      organizationId,
      username,
      deletedAt: null,
      id: exceptUserId === undefined ? undefined : { not: exceptUserId },
    },
    select: { id: true },
  })
  if (duplicate) throw new UserError('DUPLICATE_USERNAME', { detail: `username=${username}` })
}

/**
 * ชน unique ระดับ DB (คำขอที่ยิงพร้อมกันหลุด pre-check ทั้งคู่ / อีเมลตรงกับผู้ใช้ที่ถูกลบแล้ว — unique
 * `(organization_id, email)` ไม่ partial) ⇒ รัน pre-check ซ้ำเพื่อได้ code ตรงช่อง แล้ว fallback แทน 500 (UAT BUG-016)
 */
async function rethrowDuplicateUser(organizationId: string, values: UserValues, exceptUserId?: string): Promise<never> {
  await assertUsernameAvailable(organizationId, values.username, exceptUserId)
  await assertEmailAvailable(organizationId, values.email, exceptUserId)
  if (values.email !== null) {
    throw new UserError('DUPLICATE_USER_EMAIL', { detail: `email=${values.email} (unique violation)` })
  }
  throw new UserError('DUPLICATE_USERNAME', { detail: `username=${values.username} (unique violation)` })
}

/** uid ของ Supabase Auth ถูกผู้ใช้ในระบบถืออยู่แล้วหรือยัง (รวมคนที่ลบแล้ว — `supabase_uid` unique ทั้งตาราง) */
async function isAuthUidTaken(uid: string): Promise<boolean> {
  const holder = await prisma.user.findUnique({ where: { supabaseUid: uid }, select: { id: true } })
  return holder !== null
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
/** บัญชีกลุ่ม `system` จัดการได้เฉพาะ Superadmin (DEC-010 — `lib/users/auth-account.ts`) · 403 ไม่ leak */
function assertCanManageAccountIn(actor: SessionUser, roleGroup: RoleGroup, detail: string): void {
  if (!canManageAccountIn(actor, roleGroup)) {
    throw new AuthError('PERMISSION_DENIED', `${detail} roleGroup=${roleGroup} by user=${actor.id}`)
  }
}

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

/**
 * ตรวจส่วน "ข้อมูลรับเงิน" ล่วงหน้า (มติ PO U131) — บริษัทไฟแนนซ์ไม่ใช่ผู้รับเงิน (`18` §6.1) ⇒ ปฏิเสธ
 * สิทธิ์/ความถูกต้องของข้อมูลใช้ service ของผู้รับเงินตัวเดียวกับหน้า Payee
 */
async function preparePayment(
  actor: SessionUser,
  userId: string | null,
  roleGroup: RoleGroup,
  payment: UserPaymentInput | undefined,
): Promise<PreparedUserPayment | null> {
  if (payment === undefined) return null
  if (roleGroup === 'finance_company') {
    throw new AuthError('PERMISSION_DENIED', `payment section for finance_company user by user=${actor.id}`)
  }
  return prepareUserPayment(actor, userId, payment)
}

function paymentWarning(
  userWarning: UserMutationResult['warning'],
  payment: UserPaymentWriteResult | null,
): UserMutationResult['warning'] {
  if (userWarning !== null) return userWarning
  return payment?.warning ?? null
}

export async function createUser(
  context: MutationContext,
  input: UserValues,
  password: string,
  payment?: UserPaymentInput,
): Promise<UserMutationResult> {
  const organizationId = context.actor.organizationId
  const values = normalizeUserValues(input)
  const role = await loadRole(organizationId, values.roleId)

  assertCanManageAccountIn(context.actor, role.roleGroup, 'create user')
  assertScopeConsistent(role.roleGroup, values)
  await assertUsernameAvailable(organizationId, values.username)
  await assertEmailAvailable(organizationId, values.email)
  await assertPhoneAvailable(organizationId, values.phone)
  await assertReferencesExist(organizationId, values)
  const preparedPayment = await preparePayment(context.actor, null, role.roleGroup, payment)

  // id สร้างฝั่งแอป เพื่อใช้ประกอบอีเมลภายในของ Supabase Auth ได้ก่อนเขียน DB (ผู้ใช้ที่ไม่มีอีเมล)
  const userId = crypto.randomUUID()
  // ผู้ดูแลตั้งรหัสให้ = บังคับเปลี่ยนเองตอน login ครั้งแรก (มติ PO 03/10/2569)
  const mustChangePassword = mustChangeAfterAdminSet(context.actor.id, userId)
  const authUid = await createAuthAccount(authEmailFor({ id: userId, email: values.email }), password, isAuthUidTaken)

  let created: UserRow
  let paymentResult: UserPaymentWriteResult | null = null
  try {
    created = await prisma.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: {
          id: userId,
          organizationId,
          roleId: values.roleId,
          supabaseUid: authUid,
          username: values.username,
          email: values.email,
          fullName: values.fullName,
          phone: values.phone,
          employeeCode: values.employeeCode,
          teamId: values.teamId,
          companyId: values.companyId,
          status: 'active',
          mustChangePassword,
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
          // ห้ามมีรหัสผ่านใน audit — บันทึกแค่ว่าผู้ดูแลตั้งให้
          after: {
            ...toUserAuditPayload(values, { status: 'active', roleName: role.name }),
            supabase_uid: authUid,
            password_set_by_admin: true,
            must_change_password: mustChangePassword,
          },
          reason: context.reason,
          ipAddress: context.meta.ipAddress,
          userAgent: context.meta.userAgent,
        },
        tx,
      )

      // มติ PO U131 — Payee ของผู้ใช้เกิดใน transaction เดียวกัน (ล้ม = ไม่มีทั้งผู้ใช้และ Payee)
      if (preparedPayment !== null && payment !== undefined) {
        paymentResult = await writeUserPaymentInTx(
          tx,
          { actor: context.actor, meta: context.meta, reason: payment.reason },
          user.id,
          user.fullName,
          preparedPayment,
        )
        return tx.user.findUniqueOrThrow({ where: { id: user.id }, select: userSelect })
      }
      return user
    }).catch(onUniqueViolation(() => rethrowDuplicateUser(organizationId, values)))
  } catch (error) {
    await compensateAuthAccount(authUid)
    throw error
  }

  return { user: toDto(created), warning: paymentWarning(null, paymentResult) }
}

/** เขียน DB ไม่สำเร็จ → ลบบัญชี Auth ที่เพิ่งสร้างทิ้ง — best effort */
async function compensateAuthAccount(uid: string): Promise<void> {
  try {
    await deleteAuthAccount(uid)
  } catch {
    // ลบไม่สำเร็จ = เหลือบัญชี Auth กำพร้า ซึ่งครั้งหน้าสร้างด้วยอีเมลเดิมจะถูกลบแล้วสร้างใหม่เอง (`createAuthAccount`)
  }
}

/**
 * ผู้ดูแลตั้งรหัสผ่านใหม่ให้ผู้ใช้ (`POST /api/users/:id/password` — มติ PO 03/10/2569)
 *
 * - สิทธิ์ = `manage:manage_users` (ชุดเดียวกับคนที่เพิ่มผู้ใช้ได้) + scope ตรวจแล้วที่ `getUser()`
 * - ไม่ใช่ Superadmin ตั้งรหัสให้บัญชีกลุ่ม `system` ไม่ได้ (`canSetPasswordFor` — กันยึดบัญชีบริหาร/การเงิน)
 * - ผู้ใช้ที่ยังไม่มีบัญชี Auth (ค้างจาก flow เชิญเดิม) → สร้างบัญชีให้พร้อมรหัสนี้เลย
 * - ตั้งให้คนอื่น → `must_change_password = true` · ตั้งให้ตัวเอง → false
 */
export async function setUserPassword(context: MutationContext, current: UserDto, password: string): Promise<UserDto> {
  const organizationId = context.actor.organizationId
  if (!canSetPasswordFor(context.actor, current)) {
    throw new AuthError('PERMISSION_DENIED', `set password of ${current.roleGroup} user=${current.id} by user=${context.actor.id}`)
  }

  const existing = await prisma.user.findUniqueOrThrow({ where: { id: current.id }, select: { supabaseUid: true } })
  let createdAccount: string | null = null
  if (existing.supabaseUid === null) {
    createdAccount = await createAuthAccount(authEmailFor(current), password, isAuthUidTaken)
  } else {
    await setAuthPassword(existing.supabaseUid, password)
  }

  const mustChangePassword = mustChangeAfterAdminSet(context.actor.id, current.id)
  const supabaseUid = createdAccount ?? existing.supabaseUid

  let updated: UserRow
  try {
    updated = await prisma.$transaction(async (tx) => {
      const user = await tx.user.update({
        where: { id: current.id },
        data: { supabaseUid, mustChangePassword, updatedBy: context.actor.id },
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
          // ห้ามมีรหัสผ่านใน audit — บันทึกแค่ข้อเท็จจริงว่ามีการตั้งใหม่
          before: { supabase_uid: existing.supabaseUid, must_change_password: current.mustChangePassword },
          after: { supabase_uid: supabaseUid, must_change_password: mustChangePassword, password_reset_by_admin: true },
          reason: context.reason,
          ipAddress: context.meta.ipAddress,
          userAgent: context.meta.userAgent,
          diffOnly: false,
        },
        tx,
      )

      return user
    })
  } catch (error) {
    if (createdAccount !== null) await compensateAuthAccount(createdAccount)
    throw error
  }

  // session เดิมของผู้ใช้ต้องเห็นธง must_change_password ทันที ไม่รอ cache หมดอายุ
  invalidateSession(updated.supabaseUid)
  return toDto(updated)
}

export async function updateUser(
  context: Omit<MutationContext, 'reason'>,
  current: UserDto,
  input: UserValues,
  payment?: UserPaymentInput,
): Promise<UserMutationResult> {
  const organizationId = context.actor.organizationId
  const values = normalizeUserValues(input)
  const before = toValues(current)
  const role = await loadRole(organizationId, values.roleId)

  // ทั้งบัญชีเดิมและกลุ่มปลายทาง — กันย้ายผู้ใช้ที่ตัวเองตั้งรหัสไว้เข้ากลุ่ม system
  assertCanManageAccountIn(context.actor, current.roleGroup, `update user=${current.id}`)
  assertCanManageAccountIn(context.actor, role.roleGroup, `update user=${current.id}`)
  if (current.id === context.actor.id && values.roleId !== before.roleId && !canChangeOwnRole(context.actor)) {
    throw new AuthError('PERMISSION_DENIED', `change own role user=${current.id}`)
  }
  assertScopeConsistent(role.roleGroup, values)
  if (values.username !== before.username) await assertUsernameAvailable(organizationId, values.username, current.id)
  if (values.email !== before.email) await assertEmailAvailable(organizationId, values.email, current.id)
  if (values.phone !== before.phone) await assertPhoneAvailable(organizationId, values.phone, current.id)
  await assertReferencesExist(organizationId, values)
  await assertSuperadminSafety(
    organizationId,
    { roleName: current.roleName, status: current.status },
    { roleName: role.name, status: current.status },
  )
  const preparedPayment = await preparePayment(context.actor, current.id, role.roleGroup, payment)

  let paymentResult: UserPaymentWriteResult | null = null
  const updated = await prisma.$transaction(async (tx) => {
    const user = await tx.user.update({
      where: { id: current.id },
      data: {
        roleId: values.roleId,
        username: values.username,
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
        reason: describeUserChanges({ ...before, roleName: current.roleName }, { ...values, roleName: role.name }),
        ipAddress: context.meta.ipAddress,
        userAgent: context.meta.userAgent,
      },
      tx,
    )

    // มติ PO U131 — สร้าง/อัปเดต/ยืนยัน Payee ใน transaction เดียวกับผู้ใช้
    if (preparedPayment !== null && payment !== undefined) {
      paymentResult = await writeUserPaymentInTx(
        tx,
        { actor: context.actor, meta: context.meta, reason: payment.reason },
        current.id,
        user.fullName,
        preparedPayment,
      )
      return tx.user.findUniqueOrThrow({ where: { id: current.id }, select: userSelect })
    }
    return user
  }).catch(onUniqueViolation(() => rethrowDuplicateUser(organizationId, values, current.id)))

  invalidateSession(updated.supabaseUid)

  // อีเมลของบัญชี Auth = อีเมลจริง หรืออีเมลภายในเมื่อไม่มี → ย้ายตามเมื่อเปลี่ยน/เพิ่ม/ลบอีเมล
  // ล้มเหลว = เตือน ไม่ rollback ข้อมูลธุรกิจ (login ด้วย username ยังได้เพราะอ่านอีเมลจาก Auth ตรง)
  // username ไม่ผูกกับ Auth จึงเปลี่ยนได้โดยไม่ต้องแตะ Supabase
  let warning: UserMutationResult['warning'] = null
  if (values.email !== before.email && updated.supabaseUid !== null) {
    const failure = await syncAuthEmail(updated.supabaseUid, authEmailFor({ id: current.id, email: values.email }))
    if (failure !== null) {
      warning = {
        code: 'AUTH_EMAIL_NOT_SYNCED',
        title: 'บันทึกแล้ว แต่ย้ายอีเมลฝั่ง Supabase Auth ไม่สำเร็จ',
        message: `ผู้ใช้ยังเข้าสู่ระบบได้ตามปกติ (login อ่านอีเมลจาก Auth ตรง) แต่ข้อมูลฝั่ง Supabase ยังเป็นอีเมลเดิม — ลองบันทึกใหม่อีกครั้ง (${failure})`,
      }
    }
  }

  return { user: toDto(updated), warning: paymentWarning(warning, paymentResult) }
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
  assertCanManageAccountIn(context.actor, current.roleGroup, `set status user=${current.id}`)
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
  assertCanManageAccountIn(context.actor, current.roleGroup, `delete user=${current.id}`)
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
