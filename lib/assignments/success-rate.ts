/**
 * % ความสำเร็จของพนักงาน (`40` §6.2 · §11) — **ค่ากลางของทั้งระบบ**
 *
 * "% ความสำเร็จสะสมตลอดการทำงาน = (เคสที่ outcome สำเร็จ ÷ เคสที่ได้รับมอบหมายทั้งหมดสะสม) × 100"
 *
 * ⚠️ Report รายบุคคล/ทีมในอนาคต (`96`) ต้องเรียกตัวนี้ ห้ามคำนวณสูตรซ้ำในโมดูลตัวเอง
 * — ตัวนับจริงจาก DB อยู่ที่ `lib/assignments/agent-queries.ts` (`agentPerformance()`)
 *
 * **pure ล้วน** — ไม่มีการหารศูนย์: ไม่เคยได้รับมอบหมายเลย → `null` (หน้าจอแสดง "N/A" ด้วย `fmtRatioPct`)
 */

export interface SuccessRateInput {
  /** จำนวนเคสที่ปิดด้วยผลสำเร็จ (`cases.outcome = 'success'` — ไฟล์ 43) */
  successCount: number
  /** จำนวนเคสที่เคยได้รับมอบหมายทั้งหมดสะสม (นับเคสไม่ซ้ำ ไม่ใช่จำนวนแถว assignment) */
  assignedCount: number
}

/** ที่มาของตัวเลข — เก็บคู่กับค่าตาม `40` §6.3 (`calculation_source`) */
export const SUCCESS_RATE_SOURCE = '40 §6.2 lifetime (success_cases / assigned_cases)'

/** ปัดเป็นทศนิยม 1 ตำแหน่ง — 7/10 = 70 · 2/3 = 66.7 */
export function successRate(input: SuccessRateInput): number | null {
  const { successCount, assignedCount } = input
  if (!Number.isFinite(assignedCount) || assignedCount <= 0) return null
  const capped = Math.min(Math.max(successCount, 0), assignedCount)
  return Math.round((capped / assignedCount) * 1000) / 10
}

export interface AgentDecisionSupport {
  /** เคสที่ถือครองอยู่ตอนนี้ (มอบหมายแล้วยังไม่ปิด) — ไม่จำกัดเพดาน เป็นข้อมูลให้ดูเฉย ๆ (`40` §6.2) */
  activeCaseCount: number
  successRate: number | null
  successRateSource: string
  /** จังหวัดที่ทีมของพนักงานรับผิดชอบ (`09` §7.1 — สืบทอดจากทีม) */
  coveredProvinces: readonly string[]
}

export function toDecisionSupport(input: {
  activeCaseCount: number
  successCount: number
  assignedCount: number
  coveredProvinces: readonly string[]
}): AgentDecisionSupport {
  return {
    activeCaseCount: input.activeCaseCount,
    successRate: successRate(input),
    successRateSource: SUCCESS_RATE_SOURCE,
    coveredProvinces: input.coveredProvinces,
  }
}
