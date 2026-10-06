/**
 * สายการอนุมัติ (`13` §6.2) — **pure ล้วน ใช้ร่วม FE/BE**
 *
 * `condition_threshold` เก็บเป็น **satang** เสมอ (Rule 01 — `13` §6.2 เขียนเป็นบาทระดับเอกสาร
 * แต่ `02` §5 คอลัมน์จริงคือ `condition_threshold_satang`) · `null` = เงื่อนไขนี้ไม่อ้างเพดานเงิน
 *
 * ⚠️ **ตัวจับคู่ flow กับรายการเบิกอยู่ไฟล์ 16 (Phase 3.2/3.3) ไม่ใช่ที่นี่** — ไฟล์นี้ดูแลแค่
 * ความถูกต้องของ "ตัวตั้งค่า" (รูปร่างของ flow + เพดาน) ไม่ตัดสินว่ารายการหนึ่งต้องผ่านสายไหน
 * เพื่อไม่ให้เดา semantics ของ `16` §9 ล่วงหน้า
 */

import { EXECUTIVE_ROLE_NAME, FINANCE_ROLE_NAME, TEAM_MANAGER_ROLE_NAME } from '@/lib/auth/constants'
import type { RoleGroup } from '@/lib/generated/prisma/enums'

/** คอลัมน์ผู้อนุมัติบน `expenses` ที่ขั้นนั้นต้องประทับ (`02` §8 · `16` §7 DEC-006/D5) */
export type ApproverColumn = 'manager' | 'finance' | 'executive'

/**
 * ชื่อ role ในสายอนุมัติ → คอลัมน์ผู้อนุมัติ — ตัวจับคู่เดียวของทั้งระบบ (ตัวตั้งค่า + ตัวอนุมัติใน
 * `lib/compensation/approval.ts`) · รับชื่อ role ตาม seed (`07` §5) และชื่ออังกฤษที่ `13` §6.2 ยกเป็นตัวอย่าง
 * (ข้อมูลเก่า) — ชื่อนอกรายการ = ตั้งค่าสายผิด
 */
const APPROVAL_ROLE_COLUMNS: Readonly<Record<string, ApproverColumn>> = {
  [TEAM_MANAGER_ROLE_NAME]: 'manager',
  [FINANCE_ROLE_NAME]: 'finance',
  [EXECUTIVE_ROLE_NAME]: 'executive',
  manager: 'manager',
  finance: 'finance',
  financeadmin: 'finance',
  executive: 'executive',
}

/** ชื่อ role seed ที่เป็นผู้อนุมัติ (ชื่ออังกฤษใน `APPROVAL_ROLE_COLUMNS` มีไว้แปลงข้อมูลเก่าเท่านั้น) */
const SEED_APPROVER_NAMES: readonly string[] = [TEAM_MANAGER_ROLE_NAME, FINANCE_ROLE_NAME, EXECUTIVE_ROLE_NAME]

/** คอลัมน์ผู้อนุมัติของชื่อ role ในสาย — `null` = ไม่มี role อนุมัติชื่อนี้ */
export function approvalRoleColumn(roleName: string): ApproverColumn | null {
  const exact = APPROVAL_ROLE_COLUMNS[roleName.trim()]
  if (exact !== undefined) return exact
  return APPROVAL_ROLE_COLUMNS[roleName.trim().toLowerCase().replace(/\s+/g, '')] ?? null
}

/** role เท่าที่ตัวเลือกขั้นอนุมัติต้องรู้ (`roles`) */
export interface ApprovalRoleRef {
  id: string
  name: string
  roleGroup: RoleGroup
  isSeed: boolean
  /** soft delete — role ที่ลบแล้วเลือกเป็นขั้นใหม่ไม่ได้ */
  deletedAt?: Date | string | null
}

/** role ผู้อนุมัติ 1 ตัวเลือกต่อคอลัมน์ — `id` คือค่าที่เก็บลง `approval_flow_role_ids` */
export interface ApprovalRoleOption {
  id: string
  name: string
  column: ApproverColumn
}

/** ลำดับความสำคัญของกลุ่มเมื่อ role ผู้อนุมัติชื่อเดียวกันมีหลาย record (ผู้จัดการทีม inhouse/outsource) */
const ROLE_GROUP_PRIORITY: Readonly<Record<RoleGroup, number>> = {
  system: 0,
  inhouse: 1,
  outsource: 2,
  finance_company: 3,
}

/**
 * ตัวเลือกของ dropdown ขั้นอนุมัติ (มติ PO U149) — role **seed** ที่ตัวอนุมัติรู้จัก 1 ตัวต่อคอลัมน์ผู้อนุมัติ
 *
 * - เก็บเป็น **role id** — role ชื่อซ้ำข้ามกลุ่ม (เช่น "ผู้จัดการ" ของบริษัทไฟแนนซ์) จึงไม่ถูกจับคู่ผิด
 * - ผู้จัดการทีมมี 2 record (inhouse/outsource) ที่ถือสิทธิ์อนุมัติขั้นเดียวกัน ⇒ ใช้ record เดียว (system → inhouse → outsource)
 * - role ที่สร้างเองไม่อยู่ในรายการ — สิทธิ์อนุมัติแต่ละขั้นผูกกับ capability ของ role seed (`16` §10)
 */
export function approvalRoleOptions(roles: readonly ApprovalRoleRef[]): ApprovalRoleOption[] {
  const byColumn = new Map<ApproverColumn, ApprovalRoleRef>()
  for (const role of roles) {
    if (!role.isSeed || (role.deletedAt !== undefined && role.deletedAt !== null)) continue
    const column = approvalRoleColumn(role.name)
    if (column === null || !SEED_APPROVER_NAMES.includes(role.name.trim())) continue
    const current = byColumn.get(column)
    if (current === undefined || ROLE_GROUP_PRIORITY[role.roleGroup] < ROLE_GROUP_PRIORITY[current.roleGroup]) {
      byColumn.set(column, role)
    }
  }
  const order: readonly ApproverColumn[] = ['manager', 'finance', 'executive']
  return order.flatMap((column) => {
    const role = byColumn.get(column)
    return role === undefined ? [] : [{ id: role.id, name: role.name.trim(), column }]
  })
}

/** ขั้นในสายที่ไม่ใช่ role ผู้อนุมัติที่เลือกได้ (ไม่มี/ถูกลบ/ไม่ใช่ role อนุมัติ) — คืน role id · ว่าง = ผ่าน */
export function invalidApprovalSteps(roleIds: readonly string[], roles: readonly ApprovalRoleRef[]): string[] {
  const allowed = new Set(approvalRoleOptions(roles).map((option) => option.id))
  return [...new Set(roleIds.map((id) => id.trim()).filter((id) => !allowed.has(id)))]
}

/**
 * role id ของสาย → ชื่อ role **ปัจจุบัน** (ใช้แสดงผลและส่งต่อให้ตัวอนุมัติ) — ชื่อตามจริงทุกครั้งที่อ่าน
 * ⇒ เปลี่ยนชื่อ role แล้วสายยังชี้ role เดิม · id ที่ไม่พบ = `''` (ตัวอนุมัติปฏิเสธเป็น `APPROVAL_MATRIX_NOT_FOUND`)
 */
export function approvalFlowRoleNames(roleIds: readonly string[], roleNames: ReadonlyMap<string, string>): string[] {
  return roleIds.map((id) => roleNames.get(id) ?? '')
}

export interface ApprovalMatrixValues {
  condition: string
  conditionThresholdSatang: number | null
  /** ลำดับ **role id** ที่ต้องอนุมัติ — ลำดับมีความหมาย (มติ PO U149) */
  approvalFlowRoleIds: string[]
  enforceSegregationOfDuties: boolean
}

/** ขั้นอนุมัติมากกว่านี้คือกรอกผิด (สายจริงยาวสุดใน `16` §9 = 3 ขั้น) */
export const MAX_APPROVAL_STEPS = 5

export function normalizeApprovalMatrixValues(input: ApprovalMatrixValues): ApprovalMatrixValues {
  return {
    condition: input.condition.trim(),
    conditionThresholdSatang: input.conditionThresholdSatang,
    approvalFlowRoleIds: input.approvalFlowRoleIds.map((id) => id.trim()).filter((id) => id.length > 0),
    enforceSegregationOfDuties: input.enforceSegregationOfDuties,
  }
}

/** ขั้นอนุมัติต้องมีอย่างน้อย 1 ขั้น และไม่เกินเพดาน */
export function isApprovalFlowShapeValid(approvalFlow: readonly string[]): boolean {
  return approvalFlow.length > 0 && approvalFlow.length <= MAX_APPROVAL_STEPS
}

/**
 * role ที่ซ้ำในสายเดียวกัน — คืนรายชื่อที่ซ้ำ (ว่าง = ไม่ซ้ำ)
 *
 * ซ้ำได้เฉพาะเมื่อ `enforce_segregation_of_duties = false` เท่านั้น: ถ้าบังคับแยกหน้าที่แล้วยังใส่
 * role เดิม 2 ขั้น สายนั้นจะเดินไม่จบเมื่อองค์กรมีคนในบทบาทนั้นคนเดียว (`16` — SEGREGATION_OF_DUTIES_VIOLATION)
 */
export function duplicateApprovalSteps(approvalFlow: readonly string[]): string[] {
  const seen = new Set<string>()
  const duplicates = new Set<string>()
  for (const role of approvalFlow) {
    if (seen.has(role)) duplicates.add(role)
    seen.add(role)
  }
  return [...duplicates]
}

/** สายนี้ใช้ได้จริงไหมเมื่อรวมเงื่อนไขแยกหน้าที่ */
export function isApprovalFlowConsistent(
  values: Pick<ApprovalMatrixValues, 'approvalFlowRoleIds' | 'enforceSegregationOfDuties'>,
): boolean {
  if (!isApprovalFlowShapeValid(values.approvalFlowRoleIds)) return false
  if (!values.enforceSegregationOfDuties) return true
  return duplicateApprovalSteps(values.approvalFlowRoleIds).length === 0
}

/** label ของสายอนุมัติที่ตารางแท็บแสดง (`13` §7) — `ผู้จัดการ → การเงิน → บริหาร` */
export function describeApprovalFlow(approvalFlow: readonly string[]): string {
  return approvalFlow.length === 0 ? '—' : approvalFlow.join(' → ')
}

/** เรียงสายอนุมัติสำหรับแสดงผล: เพดานน้อยไปมาก แล้วสายที่ไม่อ้างเพดาน (`null`) ไว้ท้ายสุด */
export function sortApprovalMatrices<T extends { conditionThresholdSatang: number | null }>(matrices: readonly T[]): T[] {
  return [...matrices].sort((a, b) => {
    if (a.conditionThresholdSatang === null) return b.conditionThresholdSatang === null ? 0 : 1
    if (b.conditionThresholdSatang === null) return -1
    return a.conditionThresholdSatang - b.conditionThresholdSatang
  })
}

/** payload ที่ลง audit — ชื่อคอลัมน์ snake_case ตามตารางจริง (`90` §13) */
export function toApprovalMatrixAuditPayload(values: ApprovalMatrixValues): Record<string, unknown> {
  return {
    condition: values.condition,
    condition_threshold_satang: values.conditionThresholdSatang,
    approval_flow_role_ids: values.approvalFlowRoleIds,
    enforce_segregation_of_duties: values.enforceSegregationOfDuties,
  }
}
