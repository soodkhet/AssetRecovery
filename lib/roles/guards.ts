import type { CapabilityAccessLevel } from '@/lib/generated/prisma/enums'
import { AuthError } from '@/lib/auth/errors'
import { capabilityLockOwner } from '@/lib/roles/capability-locks'
import { RoleError } from '@/lib/roles/errors'
import { isSuperadminRole, type MatrixLevel, type MatrixRoleInput } from '@/lib/roles/matrix'

/**
 * ยามของโมดูล Roles & Permissions — **pure ทั้งไฟล์** (ห้าม import อะไรที่แตะ DB)
 * ตัวนับที่ต้องใช้จาก DB (จำนวน user ในบทบาท / จำนวน Superadmin ที่ active) ให้ caller ส่งเข้ามา
 *
 * กติกาต้นทาง: `07` §10 (seed role ลบ/เปลี่ยนชื่อไม่ได้ · ต้องมี Superadmin ≥ 1 เสมอ),
 * `07` §9 (แก้สิทธิ์ได้เฉพาะ role ที่ `editable = true`), `25` §16.1 (รายการ "✅ only" ล็อก)
 */

export interface RoleGuardInput extends MatrixRoleInput {
  isSeed: boolean
}

/** เปลี่ยนชื่อ seed role ไม่ได้ทุกกรณี — ชื่อถูกอ้างอิงข้ามไฟล์ทั้งระบบ (`07` §10) */
export function assertRoleRenamable(role: RoleGuardInput, nextName: string): void {
  if (role.isSeed && nextName.trim() !== role.name) {
    throw new RoleError('SEED_ROLE_RENAME', `role=${role.name}`)
  }
}

export interface RoleDeleteCheck {
  role: RoleGuardInput
  /** จำนวน user ที่ยังผูกกับบทบาทนี้ (ไม่รวมที่ soft delete แล้ว) */
  userCount: number
  /** จำนวน Superadmin ที่ยัง active ทั้งองค์กร — ใช้เฉพาะตอนเป้าหมายคือบทบาท Superadmin */
  activeSuperadminCount: number
}

/**
 * ลบบทบาทได้หรือไม่ — เรียงจากรุนแรงที่สุดไปน้อยที่สุด:
 * 1. ลบบทบาท Superadmin ทั้งที่ยังมีคนใช้อยู่ = lockout ทั้งระบบ (`LAST_SUPERADMIN_REMOVAL`, `07` §11)
 * 2. seed role ลบไม่ได้ (`SEED_ROLE_DELETE`)
 * 3. บทบาทที่ยังมีผู้ใช้ผูกอยู่ลบไม่ได้ (`ROLE_IN_USE` — 1 user ต้องมี role เสมอ, `07` §10)
 */
export function assertRoleDeletable(check: RoleDeleteCheck): void {
  if (isSuperadminRole(check.role) && check.activeSuperadminCount > 0) {
    throw new AuthError('LAST_SUPERADMIN_REMOVAL', `delete role=${check.role.name}`)
  }
  if (check.role.isSeed) {
    throw new RoleError('SEED_ROLE_DELETE', `role=${check.role.name}`)
  }
  if (check.userCount > 0) {
    throw new RoleError('ROLE_IN_USE', `role=${check.role.name} users=${check.userCount}`)
  }
}

/**
 * แก้ permission ของบทบาทนี้ได้หรือไม่
 * - Superadmin = `manage` ทุกรายการโดยนิยาม **ไม่เก็บ record** จึงไม่มีอะไรให้แก้ (DEC-009)
 * - บทบาทที่ `is_editable = false` สิทธิ์ถูกกำหนดตายตามสเปค (`07` §7.1/§9)
 */
export function assertRolePermissionsEditable(role: MatrixRoleInput): void {
  if (isSuperadminRole(role)) {
    throw new RoleError('ROLE_NOT_EDITABLE', 'superadmin implicit manage')
  }
  if (!role.isEditable) {
    throw new RoleError('ROLE_NOT_EDITABLE', `role=${role.name}`)
  }
}

/** capability ที่ติด "✅ only" มอบให้บทบาทอื่นไม่ได้ และเปลี่ยนระดับของเจ้าของก็ไม่ได้ (`25` §16.1) */
export function assertCapabilityAssignable(code: string): void {
  const owner = capabilityLockOwner(code)
  if (owner !== null) {
    throw new RoleError('CAPABILITY_LOCKED', `capability=${code} owner=${owner}`)
  }
}

export interface PermissionEntry {
  capabilityCode: string
  level: MatrixLevel
}

export interface PermissionChange {
  code: string
  from: MatrixLevel
  to: MatrixLevel
}

export interface PermissionPlan {
  changes: readonly PermissionChange[]
  /** เฉพาะรายการที่เปลี่ยนจริง — ใช้เป็น before/after ของ audit (`90` §13) */
  before: Readonly<Record<string, MatrixLevel>>
  after: Readonly<Record<string, MatrixLevel>>
}

/**
 * ตรวจ + สรุปรายการที่จะเปลี่ยนจริง (ส่งค่าเดิมซ้ำมาถือว่าไม่เปลี่ยน = idempotent)
 * โยน `CAPABILITY_NOT_FOUND` เมื่อ code ไม่มีในระบบ · `CAPABILITY_LOCKED` เมื่อพยายามแก้รายการที่ล็อก
 */
export function planPermissionChanges(
  role: MatrixRoleInput,
  current: Readonly<Record<string, CapabilityAccessLevel>>,
  entries: readonly PermissionEntry[],
  knownCodes: ReadonlySet<string>,
): PermissionPlan {
  assertRolePermissionsEditable(role)

  const changes: PermissionChange[] = []
  const before: Record<string, MatrixLevel> = {}
  const after: Record<string, MatrixLevel> = {}

  for (const entry of entries) {
    if (!knownCodes.has(entry.capabilityCode)) {
      throw new RoleError('CAPABILITY_NOT_FOUND', `capability=${entry.capabilityCode}`)
    }

    const from: MatrixLevel = current[entry.capabilityCode] ?? 'none'
    if (from === entry.level) continue

    assertCapabilityAssignable(entry.capabilityCode)

    changes.push({ code: entry.capabilityCode, from, to: entry.level })
    before[entry.capabilityCode] = from
    after[entry.capabilityCode] = entry.level
  }

  return { changes, before, after }
}
