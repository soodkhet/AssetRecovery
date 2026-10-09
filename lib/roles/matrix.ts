import type { CapabilityAccessLevel, FunctionalGroup, RoleGroup } from '@/lib/generated/prisma/enums'
import { SUPERADMIN_ROLE_NAME } from '@/lib/auth/constants'
import { capabilityLockOwner, type CapabilityLockOwner } from '@/lib/roles/capability-locks'

/**
 * ประกอบ Permission Matrix ของ role หนึ่งตัว (pure — ใช้ร่วม FE/BE)
 *
 * โมเดล 3 ระดับ (DEC-009 · `25` §16.1): ไม่มี record = `none` / `view` 👁️ / `manage` ✅
 * Superadmin = `manage` ทุกรายการ**โดยนิยาม ไม่เก็บ record** — บังคับที่ middleware
 * รายการที่ถูกล็อก ("✅ only") แก้ไม่ได้ ไม่ว่า role นั้นจะ `is_editable` หรือไม่
 */

/** ระดับสิทธิ์ที่ UI/API ใช้สื่อสาร — `none` = ไม่มี record ใน `role_capabilities` */
export const MATRIX_LEVELS = ['none', 'view', 'manage'] as const
export type MatrixLevel = (typeof MATRIX_LEVELS)[number]

/**
 * ข้อความ + ไอคอนของแต่ละระดับ — **ชุดเดียวใช้ทุกหน้าจอที่แสดง matrix**
 * (แท็บสิทธิ์ของไฟล์ 07 และแท็บ "สิทธิ์บัญชี/การเงิน" ของ `13` §6.10 ต้องพูดภาษาเดียวกัน)
 */
export const MATRIX_LEVEL_LABEL: Readonly<Record<MatrixLevel, string>> = {
  none: '— ไม่มีสิทธิ์',
  view: '👁️ ดูอย่างเดียว',
  manage: '✅ ทำได้',
}

/** กลุ่มฟังก์ชันของ Functional Permission Matrix (`13` §6.10 — 4 กลุ่ม 37 รายการ) */
export const FUNCTIONAL_GROUP_LABEL: Readonly<Record<FunctionalGroup, string>> = {
  ops: 'ปฏิบัติงาน (Operations)',
  finance: 'การเงิน (Finance)',
  accounting: 'บัญชี (Accounting)',
  admin: 'บริหาร (Management)',
}

export const FUNCTIONAL_GROUP_ORDER: readonly FunctionalGroup[] = ['ops', 'finance', 'accounting', 'admin']

/** capability ที่อยู่นอก matrix ของ `13` §6.10 (งานนอกสายการเงิน/บัญชี — `02` §12) */
export const OTHER_GROUP_ID = 'other'
export const OTHER_GROUP_LABEL = 'อื่นๆ (นอก Functional Matrix)'

/**
 * capability ของพอร์ทัลบริษัทไฟแนนซ์ (`module = 'portal'` และอยู่นอก matrix) — แยกเป็นหมวดของตัวเอง
 * ให้ Superadmin ปรับสิทธิ์ผู้ใช้บริษัทได้ชัด (มติ PO 05/10/2569 U6/O43 D1) · เป็นการจัดกลุ่มบนหน้าจอเท่านั้น
 */
export const PORTAL_GROUP_ID = 'portal'
export const PORTAL_GROUP_LABEL = 'พอร์ทัลบริษัทไฟแนนซ์ (Client Portal)'
export const PORTAL_MODULE = 'portal'

export type MatrixSectionId = FunctionalGroup | typeof PORTAL_GROUP_ID | typeof OTHER_GROUP_ID

export interface CapabilityInfo {
  code: string
  label: string
  module: string
  functionalGroup: FunctionalGroup | null
  description: string | null
}

export interface MatrixRoleInput {
  name: string
  roleGroup: RoleGroup
  isEditable: boolean
}

/**
 * role กลุ่มบริษัทไฟแนนซ์ (seed `is_editable = false`) แต่ capability หมวดพอร์ทัล `portal_*` Superadmin ปรับได้เสมอ
 * (มติ PO 05/10/2569 U6/O43 D1 · `07` §5.3 · `97` §3.3) — สิทธิ์ภายในอื่นของกลุ่มนี้ยังแก้ไม่ได้ (ผู้ใช้บริษัทไม่เข้าหน้า/API ภายใน · D2)
 */
export function isPortalCapabilityOfCompanyRole(role: MatrixRoleInput, code: string): boolean {
  return role.roleGroup === 'finance_company' && code.startsWith(`${PORTAL_MODULE}_`)
}

export interface MatrixRow extends CapabilityInfo {
  level: MatrixLevel
  /** "✅ only" — ล็อกกับ role เดียว มอบให้ role อื่นไม่ได้ */
  locked: boolean
  lockOwner: CapabilityLockOwner | null
  /** แก้แถวนี้ได้หรือไม่ (UI disable + API ปฏิเสธซ้ำเสมอ) */
  editable: boolean
}

export interface MatrixSection {
  id: MatrixSectionId
  label: string
  rows: readonly MatrixRow[]
}

export function isSuperadminRole(role: { name: string }): boolean {
  return role.name === SUPERADMIN_ROLE_NAME
}

/** ระดับสิทธิ์ปัจจุบันของ role ต่อ capability หนึ่งตัว */
export function resolveLevel(
  role: MatrixRoleInput,
  code: string,
  assignments: Readonly<Record<string, CapabilityAccessLevel>>,
): MatrixLevel {
  if (isSuperadminRole(role)) return 'manage'
  return assignments[code] ?? 'none'
}

/** แถวนี้แก้ได้ไหม — Superadmin (implicit) / role ที่ปิดแก้สิทธิ์ / capability ที่ถูกล็อก = แก้ไม่ได้ */
export function isRowEditable(role: MatrixRoleInput, code: string): boolean {
  if (isSuperadminRole(role)) return false
  if (!role.isEditable && !isPortalCapabilityOfCompanyRole(role, code)) return false
  return capabilityLockOwner(code) === null
}

export function buildMatrixRow(
  role: MatrixRoleInput,
  capability: CapabilityInfo,
  assignments: Readonly<Record<string, CapabilityAccessLevel>>,
): MatrixRow {
  const lockOwner = capabilityLockOwner(capability.code)
  return {
    ...capability,
    level: resolveLevel(role, capability.code, assignments),
    locked: lockOwner !== null,
    lockOwner,
    editable: isRowEditable(role, capability.code),
  }
}

function sectionIdOf(capability: CapabilityInfo): MatrixSectionId {
  if (capability.functionalGroup !== null) return capability.functionalGroup
  return capability.module === PORTAL_MODULE ? PORTAL_GROUP_ID : OTHER_GROUP_ID
}

function sectionLabel(id: MatrixSectionId): string {
  if (id === OTHER_GROUP_ID) return OTHER_GROUP_LABEL
  if (id === PORTAL_GROUP_ID) return PORTAL_GROUP_LABEL
  return FUNCTIONAL_GROUP_LABEL[id]
}

/** matrix ของ role หนึ่งตัว จัดกลุ่มตาม `13` §6.10 (4 กลุ่ม) + หมวดพอร์ทัล + กลุ่ม "อื่นๆ" ท้ายสุด */
export function buildRoleMatrix(
  role: MatrixRoleInput,
  capabilities: readonly CapabilityInfo[],
  assignments: Readonly<Record<string, CapabilityAccessLevel>>,
): MatrixSection[] {
  const order: MatrixSectionId[] = [...FUNCTIONAL_GROUP_ORDER, PORTAL_GROUP_ID, OTHER_GROUP_ID]

  return order
    .map((id) => ({
      id,
      label: sectionLabel(id),
      rows: capabilities
        .filter((capability) => sectionIdOf(capability) === id)
        .map((capability) => buildMatrixRow(role, capability, assignments)),
    }))
    .filter((section) => section.rows.length > 0)
}

/** จำนวนสิทธิ์ที่ role นี้ได้รับจริง (ไม่นับ `none`) — ใช้แสดงบนตารางรายการ role */
export function countGrantedLevels(
  role: MatrixRoleInput,
  capabilities: readonly CapabilityInfo[],
  assignments: Readonly<Record<string, CapabilityAccessLevel>>,
): { manage: number; view: number } {
  let manage = 0
  let view = 0
  for (const capability of capabilities) {
    const level = resolveLevel(role, capability.code, assignments)
    if (level === 'manage') manage += 1
    else if (level === 'view') view += 1
  }
  return { manage, view }
}
