import type { CapabilityAccessLevel, RoleGroup } from '@/lib/generated/prisma/enums'
import { emitAudit } from '@/lib/audit/audit'
import type { RequestMeta } from '@/lib/auth/request-meta'
import { clearSessionCache } from '@/lib/auth/session-cache'
import type { SessionUser } from '@/lib/auth/types'
import { RoleError } from '@/lib/roles/errors'
import type { PermissionChange } from '@/lib/roles/guards'
import { countGrantedLevels, type CapabilityInfo, type MatrixLevel } from '@/lib/roles/matrix'
import type { RoleDetail, RoleListItem } from '@/lib/roles/types'
import { prisma } from '@/lib/prisma'

/**
 * ชั้นข้อมูลของโมดูล Roles & Permissions — **แยกจาก pure logic** (`lib/roles/guards.ts`, `matrix.ts`)
 * ตามกับดักที่บันทึกไว้ใน REUSE_INDEX: ไฟล์ที่ import `lib/prisma` เทสต์ไม่ได้ถ้าไม่มี DB
 *
 * ทุก query กรองด้วย `organization_id` เสมอ (multi-tenant filter — `02` §2) และทุก mutation
 * ผ่าน `emitAudit()` พร้อม `reason` เพราะ `roles`/`role_capabilities` อยู่หมวด **สิทธิ์** (`90` §13)
 */

export type { RoleDetail, RoleListItem } from '@/lib/roles/types'

const roleSelect = {
  id: true,
  name: true,
  roleGroup: true,
  isSeed: true,
  isEditable: true,
  _count: { select: { users: { where: { deletedAt: null } } } },
} as const

export async function listCapabilities(): Promise<CapabilityInfo[]> {
  const rows = await prisma.capability.findMany({
    select: { code: true, label: true, module: true, functionalGroup: true, description: true },
    orderBy: [{ functionalGroup: 'asc' }, { code: 'asc' }],
  })
  return rows
}

/** รายการ role ทั้งหมดขององค์กร พร้อมจำนวนผู้ใช้และจำนวนสิทธิ์ (`07` §8) */
export async function listRoles(organizationId: string): Promise<RoleListItem[]> {
  const [roles, capabilities] = await Promise.all([
    prisma.role.findMany({
      where: { organizationId, deletedAt: null },
      select: {
        ...roleSelect,
        capabilities: { select: { accessLevel: true, capability: { select: { code: true } } } },
      },
      orderBy: [{ roleGroup: 'asc' }, { isSeed: 'desc' }, { name: 'asc' }],
    }),
    listCapabilities(),
  ])

  return roles.map((role) => {
    const assignments: Record<string, CapabilityAccessLevel> = {}
    for (const row of role.capabilities) {
      assignments[row.capability.code] = row.accessLevel
    }
    return {
      id: role.id,
      name: role.name,
      roleGroup: role.roleGroup,
      isSeed: role.isSeed,
      isEditable: role.isEditable,
      userCount: role._count.users,
      grants: countGrantedLevels(role, capabilities, assignments),
    }
  })
}

export async function getRole(organizationId: string, roleId: string): Promise<RoleDetail> {
  const role = await prisma.role.findFirst({
    where: { id: roleId, organizationId, deletedAt: null },
    select: roleSelect,
  })
  if (!role) throw new RoleError('ROLE_NOT_FOUND', `role=${roleId}`)

  const { _count, ...rest } = role
  return { ...rest, userCount: _count.users }
}

/** capability code → ระดับสิทธิ์ของ role นี้ (ไม่มี key = ไม่มีสิทธิ์) */
export async function getRoleAssignments(roleId: string): Promise<Record<string, CapabilityAccessLevel>> {
  const rows = await prisma.roleCapability.findMany({
    where: { roleId },
    select: { accessLevel: true, capability: { select: { code: true } } },
  })

  const assignments: Record<string, CapabilityAccessLevel> = {}
  for (const row of rows) {
    assignments[row.capability.code] = row.accessLevel
  }
  return assignments
}

export async function countRoleUsers(roleId: string): Promise<number> {
  return prisma.user.count({ where: { roleId, deletedAt: null } })
}

interface MutationContext {
  actor: SessionUser
  meta: RequestMeta
  reason: string
}

/**
 * บันทึกการเปลี่ยนสิทธิ์ของ role — ทั้งชุดอยู่ใน `$transaction` เดียวกับ audit
 * `none` = ลบ record (DEC-009: ไม่มี record = ไม่มีสิทธิ์) · ระดับอื่น = upsert
 *
 * ⚠️ หลังสำเร็จต้องล้าง session cache **ทั้งหมด** เพราะสิทธิ์เปลี่ยนระดับ role กระทบผู้ใช้ทุกคนในบทบาทนั้น
 */
export async function applyRolePermissionChanges(
  context: MutationContext,
  role: { id: string; name: string },
  changes: readonly PermissionChange[],
  before: Readonly<Record<string, MatrixLevel>>,
  after: Readonly<Record<string, MatrixLevel>>,
): Promise<void> {
  if (changes.length === 0) return

  await prisma.$transaction(async (tx) => {
    for (const change of changes) {
      const capability = await tx.capability.findUnique({
        where: { code: change.code },
        select: { id: true },
      })
      if (!capability) throw new RoleError('CAPABILITY_NOT_FOUND', `capability=${change.code}`)

      if (change.to === 'none') {
        await tx.roleCapability.deleteMany({ where: { roleId: role.id, capabilityId: capability.id } })
        continue
      }

      await tx.roleCapability.upsert({
        where: { roleId_capabilityId: { roleId: role.id, capabilityId: capability.id } },
        update: { accessLevel: change.to },
        create: { roleId: role.id, capabilityId: capability.id, accessLevel: change.to },
      })
    }

    await emitAudit(
      {
        organizationId: context.actor.organizationId,
        actorId: context.actor.id,
        actorRole: context.actor.roleName,
        action: 'update',
        targetType: 'role_capabilities',
        targetId: role.id,
        before,
        after,
        reason: context.reason,
        ipAddress: context.meta.ipAddress,
        userAgent: context.meta.userAgent,
        // before/after เป็นรายการที่คัดมาแล้วว่าเปลี่ยนจริง — ไม่ต้อง diff ซ้ำ
        diffOnly: false,
      },
      tx,
    )
  })

  clearSessionCache()
}

export async function createRole(
  context: MutationContext,
  input: { name: string; roleGroup: RoleGroup },
): Promise<RoleDetail> {
  const duplicate = await prisma.role.findFirst({
    where: {
      organizationId: context.actor.organizationId,
      name: input.name,
      roleGroup: input.roleGroup,
      deletedAt: null,
    },
    select: { id: true },
  })
  if (duplicate) throw new RoleError('DUPLICATE_ROLE_NAME', `${input.roleGroup}:${input.name}`)

  const created = await prisma.$transaction(async (tx) => {
    const role = await tx.role.create({
      data: {
        organizationId: context.actor.organizationId,
        name: input.name,
        roleGroup: input.roleGroup,
        // role ที่สร้างเองไม่ใช่ seed และเปิดให้ปรับสิทธิ์ได้เสมอ (`07` §7.1/§9)
        isSeed: false,
        isEditable: true,
      },
      select: roleSelect,
    })

    await emitAudit(
      {
        organizationId: context.actor.organizationId,
        actorId: context.actor.id,
        actorRole: context.actor.roleName,
        action: 'create',
        targetType: 'roles',
        targetId: role.id,
        after: { name: role.name, role_group: role.roleGroup, is_seed: false, is_editable: true },
        reason: context.reason,
        ipAddress: context.meta.ipAddress,
        userAgent: context.meta.userAgent,
      },
      tx,
    )

    return role
  })

  const { _count, ...rest } = created
  return { ...rest, userCount: _count.users }
}

export async function updateRole(
  context: MutationContext,
  role: RoleDetail,
  patch: { name?: string; isEditable?: boolean },
): Promise<RoleDetail> {
  const nextName = patch.name ?? role.name
  const nextEditable = patch.isEditable ?? role.isEditable

  if (nextName !== role.name) {
    const duplicate = await prisma.role.findFirst({
      where: {
        organizationId: context.actor.organizationId,
        name: nextName,
        roleGroup: role.roleGroup,
        deletedAt: null,
        NOT: { id: role.id },
      },
      select: { id: true },
    })
    if (duplicate) throw new RoleError('DUPLICATE_ROLE_NAME', `${role.roleGroup}:${nextName}`)
  }

  const updated = await prisma.$transaction(async (tx) => {
    const next = await tx.role.update({
      where: { id: role.id },
      data: { name: nextName, isEditable: nextEditable },
      select: roleSelect,
    })

    await emitAudit(
      {
        organizationId: context.actor.organizationId,
        actorId: context.actor.id,
        actorRole: context.actor.roleName,
        action: 'update',
        targetType: 'roles',
        targetId: role.id,
        before: { name: role.name, is_editable: role.isEditable },
        after: { name: nextName, is_editable: nextEditable },
        reason: context.reason,
        ipAddress: context.meta.ipAddress,
        userAgent: context.meta.userAgent,
      },
      tx,
    )

    return next
  })

  clearSessionCache()

  const { _count, ...rest } = updated
  return { ...rest, userCount: _count.users }
}

/** ลบแบบ soft delete (`02` §2.4) — ยามทั้งหมดอยู่ที่ `assertRoleDeletable()` ก่อนเรียกตัวนี้ */
export async function deleteRole(context: MutationContext, role: RoleDetail): Promise<void> {
  await prisma.$transaction(async (tx) => {
    await tx.role.update({ where: { id: role.id }, data: { deletedAt: new Date() } })

    await emitAudit(
      {
        organizationId: context.actor.organizationId,
        actorId: context.actor.id,
        actorRole: context.actor.roleName,
        action: 'delete',
        targetType: 'roles',
        targetId: role.id,
        before: { name: role.name, role_group: role.roleGroup, is_editable: role.isEditable },
        reason: context.reason,
        ipAddress: context.meta.ipAddress,
        userAgent: context.meta.userAgent,
      },
      tx,
    )
  })

  clearSessionCache()
}
