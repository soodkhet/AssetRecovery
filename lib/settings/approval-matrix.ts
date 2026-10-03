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

/** คอลัมน์ผู้อนุมัติของชื่อ role ในสาย — `null` = ไม่มี role อนุมัติชื่อนี้ */
export function approvalRoleColumn(roleName: string): ApproverColumn | null {
  const exact = APPROVAL_ROLE_COLUMNS[roleName.trim()]
  if (exact !== undefined) return exact
  return APPROVAL_ROLE_COLUMNS[roleName.trim().toLowerCase().replace(/\s+/g, '')] ?? null
}

/**
 * ตัวเลือกของ dropdown ขั้นอนุมัติ — ชื่อ role **ที่มีอยู่จริงในองค์กร** (ไม่ซ้ำ — ชื่อเดียวกันข้ามกลุ่ม
 * นับครั้งเดียว) และตัวอนุมัติรู้จัก (UAT BUG-008: เดิมพิมพ์อิสระ พิมพ์ผิดก็บันทึกได้แล้วไปพังตอนอนุมัติ)
 */
export function approvalRoleOptions(roleNames: readonly string[]): string[] {
  const options: string[] = []
  for (const name of roleNames) {
    const trimmed = name.trim()
    if (approvalRoleColumn(trimmed) !== null && !options.includes(trimmed)) options.push(trimmed)
  }
  return options
}

/** ขั้นในสายที่ไม่ใช่ตัวเลือกที่ใช้ได้ (ไม่มี role ชื่อนี้ในองค์กร หรือ role นี้อนุมัติไม่ได้) — ว่าง = ผ่าน */
export function invalidApprovalSteps(approvalFlow: readonly string[], roleNames: readonly string[]): string[] {
  const options = approvalRoleOptions(roleNames)
  return [...new Set(approvalFlow.map((step) => step.trim()).filter((step) => !options.includes(step)))]
}

export interface ApprovalMatrixValues {
  condition: string
  conditionThresholdSatang: number | null
  /** ลำดับ role ที่ต้องอนุมัติ เช่น `['ผู้จัดการ','การเงิน']` — ลำดับมีความหมาย */
  approvalFlow: string[]
  enforceSegregationOfDuties: boolean
}

/** ขั้นอนุมัติมากกว่านี้คือกรอกผิด (สายจริงยาวสุดใน `16` §9 = 3 ขั้น) */
export const MAX_APPROVAL_STEPS = 5

export function normalizeApprovalMatrixValues(input: ApprovalMatrixValues): ApprovalMatrixValues {
  return {
    condition: input.condition.trim(),
    conditionThresholdSatang: input.conditionThresholdSatang,
    approvalFlow: input.approvalFlow.map((role) => role.trim()).filter((role) => role.length > 0),
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
export function isApprovalFlowConsistent(values: Pick<ApprovalMatrixValues, 'approvalFlow' | 'enforceSegregationOfDuties'>): boolean {
  if (!isApprovalFlowShapeValid(values.approvalFlow)) return false
  if (!values.enforceSegregationOfDuties) return true
  return duplicateApprovalSteps(values.approvalFlow).length === 0
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
    approval_flow: values.approvalFlow,
    enforce_segregation_of_duties: values.enforceSegregationOfDuties,
  }
}
