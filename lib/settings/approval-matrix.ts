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
