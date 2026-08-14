import type { CapabilityAccessLevel } from '@/lib/generated/prisma/enums'
import { prisma } from '@/lib/prisma'
import { RoleError } from '@/lib/roles/errors'
import { planPermissionChanges } from '@/lib/roles/guards'
import {
  FUNCTIONAL_GROUP_LABEL,
  FUNCTIONAL_GROUP_ORDER,
  buildMatrixRow,
  type CapabilityInfo,
} from '@/lib/roles/matrix'
import { applyRolePermissionChanges, listCapabilities } from '@/lib/roles/queries'
import type { SettingsMutationContext } from '@/lib/settings/queries/shared'
import type { FunctionalPermissionUpdateInput } from '@/lib/settings/schemas'
import type {
  FunctionalMatrixDto,
  FunctionalMatrixRowDto,
  FunctionalMatrixSectionDto,
} from '@/lib/settings/types'

/**
 * Functional Permission Matrix (`13` §6.10) — grid **37 รายการ × ทุก role** ในหน้าเดียว
 *
 * ต่างจาก `GET/PATCH /api/roles/:id/permissions` (ไฟล์ 07) ที่เป็น matrix ของ role **ตัวเดียว**:
 * แท็บนี้เป็นมุมมองข้าม role ตามที่ `13` §6.10 กำหนด แต่ **ใช้ตัวบังคับกติกาชุดเดียวกัน** คือ
 * `planPermissionChanges()` + `applyRolePermissionChanges()` (Phase 1.6) เพื่อให้ 9 รายการที่ล็อก
 * ("✅ only" — มติ PO 14/08/2569) และ role ที่ `is_editable = false` ถูกปฏิเสธเหมือนกันทุกทาง
 *
 * Superadmin ไม่อยู่ใน grid (manage ทุกอย่างโดยนิยาม ไม่เก็บ record — DEC-009)
 */

/** เฉพาะ capability ที่มี `functional_group` = 37 รายการของ `13` §6.10 (ที่เหลืออยู่แท็บสิทธิ์ของ `07`) */
function isFunctionalCapability(capability: CapabilityInfo): capability is CapabilityInfo & {
  functionalGroup: NonNullable<CapabilityInfo['functionalGroup']>
} {
  return capability.functionalGroup !== null
}

interface RoleRow {
  id: string
  name: string
  roleGroup: string
  isEditable: boolean
  assignments: Record<string, CapabilityAccessLevel>
}

async function loadRoles(organizationId: string): Promise<RoleRow[]> {
  const roles = await prisma.role.findMany({
    where: { organizationId, deletedAt: null },
    select: {
      id: true,
      name: true,
      roleGroup: true,
      isEditable: true,
      capabilities: { select: { accessLevel: true, capability: { select: { code: true } } } },
    },
    orderBy: [{ roleGroup: 'asc' }, { isSeed: 'desc' }, { name: 'asc' }],
  })

  return roles.map((role) => {
    const assignments: Record<string, CapabilityAccessLevel> = {}
    for (const row of role.capabilities) assignments[row.capability.code] = row.accessLevel
    return { id: role.id, name: role.name, roleGroup: role.roleGroup, isEditable: role.isEditable, assignments }
  })
}

export async function getFunctionalMatrix(organizationId: string): Promise<FunctionalMatrixDto> {
  const [capabilities, roles] = await Promise.all([listCapabilities(), loadRoles(organizationId)])
  const functional = capabilities.filter(isFunctionalCapability)

  const sections: FunctionalMatrixSectionDto[] = FUNCTIONAL_GROUP_ORDER.map((group) => ({
    id: group,
    label: FUNCTIONAL_GROUP_LABEL[group],
    rows: functional
      .filter((capability) => capability.functionalGroup === group)
      .map((capability): FunctionalMatrixRowDto => {
        const levels: Record<string, FunctionalMatrixRowDto['levels'][string]> = {}
        const editable: Record<string, boolean> = {}
        let locked = false
        let lockOwner: string | null = null

        for (const role of roles) {
          const row = buildMatrixRow(role, capability, role.assignments)
          levels[role.id] = row.level
          editable[role.id] = row.editable
          locked = row.locked
          lockOwner = row.lockOwner
        }

        return {
          code: capability.code,
          label: capability.label,
          module: capability.module,
          description: capability.description,
          locked,
          lockOwner,
          levels,
          editable,
        }
      }),
  })).filter((section) => section.rows.length > 0)

  return {
    roles: roles.map((role) => ({
      id: role.id,
      name: role.name,
      roleGroup: role.roleGroup,
      isEditable: role.isEditable,
    })),
    sections,
  }
}

/**
 * บันทึกการเปลี่ยนสิทธิ์หลาย role ในครั้งเดียว — จัดกลุ่มตาม role แล้วเดินผ่านตัวบังคับของไฟล์ 07
 * (`planPermissionChanges` โยน `ROLE_NOT_EDITABLE`/`CAPABILITY_LOCKED`/`CAPABILITY_NOT_FOUND` ให้เอง)
 *
 * ⚠️ แต่ละ role commit เป็น transaction ของตัวเอง (ตามของเดิมใน Phase 1.6) — ถ้า role หลัง ๆ ถูก
 * ปฏิเสธ ของที่ผ่านไปแล้วจะไม่ถูก rollback ⇒ **ตรวจกติกาทุกรายการให้ครบก่อนเริ่มเขียน**
 */
export async function applyFunctionalMatrixChanges(
  context: SettingsMutationContext,
  input: FunctionalPermissionUpdateInput,
): Promise<{ changed: number }> {
  const organizationId = context.actor.organizationId
  const [capabilities, roles] = await Promise.all([listCapabilities(), loadRoles(organizationId)])
  const knownCodes = new Set(capabilities.map((capability) => capability.code))
  const roleById = new Map(roles.map((role) => [role.id, role]))

  const byRole = new Map<string, FunctionalPermissionUpdateInput['entries']>()
  for (const entry of input.entries) {
    byRole.set(entry.roleId, [...(byRole.get(entry.roleId) ?? []), entry])
  }

  // ขั้นที่ 1 — วางแผน+ตรวจกติกาทุก role ให้ครบก่อน (ไม่เขียนอะไรเลย)
  const plans = [...byRole.entries()].map(([roleId, entries]) => {
    const role = roleById.get(roleId)
    // ไม่ leak ว่า role นี้มีในองค์กรอื่นไหม — ใช้ code เดียวกับโมดูล role (`24` §6.9)
    if (!role) throw new RoleError('ROLE_NOT_FOUND', `role=${roleId}`)
    return { role, plan: planPermissionChanges(role, role.assignments, entries, knownCodes) }
  })

  // ขั้นที่ 2 — เขียนจริง
  let changed = 0
  for (const { role, plan } of plans) {
    if (plan.changes.length === 0) continue
    await applyRolePermissionChanges(context, role, plan.changes, plan.before, plan.after)
    changed += plan.changes.length
  }

  return { changed }
}
