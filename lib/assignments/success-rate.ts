/**
 * % ความสำเร็จ (`40` §6.2 · §11) — **ค่ากลางของทั้งระบบ** (การ์ดพนักงาน/Kanban/แอปพนักงาน/รายงาน O1/O3/E)
 *
 * มติ PO 03/10/2569 (UAT Q20 · BUG-060):
 * "% ความสำเร็จ = (เคสที่ปิดสำเร็จ ÷ เคสที่ปิดแล้ว (สำเร็จ + ไม่สำเร็จ)) × 100"
 * — เคสที่ยังค้าง/ถูกโอนออก (`reassigned_away`) ไม่เข้าตัวหาร · **ยังไม่มีเคสปิด = `null` แสดง "N/A" ทุกจุด**
 * (เดิมหารด้วยเคสที่ได้รับมอบหมายทั้งหมด ⇒ ยังไม่ปิดสักเคสก็ขึ้น "0.00%")
 *
 * ⚠️ ห้ามคำนวณสูตรซ้ำในโมดูลอื่น — เรียกตัวนี้ แล้วแสดงด้วย `fmtRatioPct()` (`lib/format/money.ts`) ตัวเดียว
 * — ตัวนับจริงจาก DB ของการ์ดพนักงานอยู่ที่ `lib/assignments/agent-queries.ts` (`agentCounts()`)
 *
 * **pure ล้วน** — ไม่มีการหารศูนย์
 */

export interface SuccessRateInput {
  /** จำนวนเคสที่ปิดด้วยผลสำเร็จ */
  successCount: number
  /** จำนวนเคสที่ปิดแล้ว (สำเร็จ + ไม่สำเร็จ · นับเคสไม่ซ้ำ) */
  closedCount: number
}

/** ที่มาของตัวเลข — เก็บคู่กับค่าตาม `40` §6.3 (`calculation_source`) */
export const SUCCESS_RATE_SOURCE = '40 §6.2 lifetime (success_cases / closed_cases) — มติ PO 03/10/2569 UAT Q20'

/**
 * ปัดเป็นทศนิยม **2 ตำแหน่ง** ตรงกับที่แสดงผล (`fmtRatioPct()` พิมพ์ 2 ตำแหน่ง) — 7/10 = 70 · 2/3 = 66.67 · 6/7 = 85.71
 * · ยังไม่มีเคสปิด = `null` (BUG-156: เดิมปัด 1 ตำแหน่งแล้วไปเติม 0 ตอนแสดง ⇒ 66.70%)
 */
export function successRate(input: SuccessRateInput): number | null {
  const { successCount, closedCount } = input
  if (!Number.isFinite(closedCount) || closedCount <= 0) return null
  const capped = Math.min(Math.max(successCount, 0), closedCount)
  return Math.round((capped * 10000) / closedCount) / 100
}

/** รูปที่ใช้บ่อย — สำเร็จ/ไม่สำเร็จแยกกัน (ตัวหาร = ผลรวม) */
export function successRateOf(successCount: number, failCount: number): number | null {
  return successRate({ successCount, closedCount: successCount + failCount })
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
  closedCount: number
  coveredProvinces: readonly string[]
}): AgentDecisionSupport {
  return {
    activeCaseCount: input.activeCaseCount,
    successRate: successRate(input),
    successRateSource: SUCCESS_RATE_SOURCE,
    coveredProvinces: input.coveredProvinces,
  }
}
