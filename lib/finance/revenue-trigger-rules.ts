import type { CaseOutcome, ServiceFeeModel } from '@/lib/generated/prisma/enums'

/**
 * กติกา "เมื่อไหร่ Revenue เกิด" (`19` §6.1 · §17 · DEC-006/D6 · `44` §11) — **pure ล้วน ไม่มี I/O**
 *
 * ไฟล์นี้คือบ้านของสูตรตาม `docs/01_PLAN.md` §3.1 (`revenue-trigger-rules`) — เขียนก่อนกำหนดใน
 * Phase 2.13 เพราะ lot confirm ต้องใช้จริงแล้ว (`44` §11 step 4) · **ห้าม** เขียนเงื่อนไขนี้ซ้ำที่อื่น
 * ทั้ง `RevenueService` (3.6) และ ขั้นอนุมัติ expense (3.2) ต้องเรียกตัวนี้ตัวเดียว
 *
 * ### 🔑 Warehouse gate
 * เคส `closed_success` **ต้องรอ `HandoverLot.confirmed` เสมอ ไม่มีข้อยกเว้น** — รวมเคสที่ไม่มี
 * expense เลย (DEC-006/D6) เหตุผลคือกันวางบิลก่อนส่งมอบเครื่องจริง ถ้าเครื่องมีปัญหาที่พบในคลัง
 * ยังตีกลับได้ก่อนรายได้เกิด (`92` §6.1)
 *
 * ### เงื่อนไขตาม fee model (`19` §6.1)
 * | model | outcome | ต้องมีอะไรครบ |
 * |---|---|---|
 * | `SUCCESS_FEE` | `closed_success` | expense approved (ถ้ามี expense) **+ lot confirmed** |
 * | `SUCCESS_FEE` | `closed_fail` | ไม่เกิดเลย (ไม่มีความสำเร็จให้คิดค่าบริการ) |
 * | `FLAT`/`HYBRID` `charge_on_fail = true` | `closed_fail` | expense approved (ถ้ามี expense) — ไม่ต้องผ่านคลัง |
 * | `FLAT`/`HYBRID` `charge_on_fail = true` | `closed_success` | expense approved (ถ้ามี) **+ lot confirmed** |
 * | `FLAT`/`HYBRID` `charge_on_fail = false` | `closed_fail` | ไม่เกิด |
 * | `FLAT`/`HYBRID` `charge_on_fail = false` | `closed_success` | expense approved (ถ้ามี) **+ lot confirmed** |
 */

/** สถานะ expense ของเคสเท่าที่ตัวตัดสินใจต้องรู้ (`23` §6.5) */
export type ExpenseGateState = 'approved' | 'not_approved'

/** สถานะล็อตของเคสเท่าที่ตัวตัดสินใจต้องรู้ (`44` §9.2) */
export type LotGateState = 'confirmed' | 'not_confirmed'

export interface RevenueTriggerInput {
  /** snapshot ค่าบริการในตัวเคส (`10` §9.2) — `null` = เคสยังไม่ผ่าน approved จึงยังไม่มี snapshot */
  model: ServiceFeeModel | null
  /** snapshot `service_fee_charge_on_fail` — ใช้กับ `FLAT`/`HYBRID` เท่านั้น */
  chargeOnFail: boolean | null
  outcome: CaseOutcome | null
  /** เคสนี้มีรายการเบิกอยู่จริงไหม — `false` = เคสไม่มี expense เลย (DEC-006/D6) */
  hasExpense: boolean
  expenseState: ExpenseGateState
  lotState: LotGateState
}

/** เหตุผลที่ยัง**ไม่**เกิดรายได้ — ใช้อธิบายบนหน้าจอ/audit ว่าติดด่านไหน */
export type RevenueBlockReason =
  | 'no_snapshot'
  | 'no_outcome'
  | 'model_excludes_fail'
  | 'expense_not_approved'
  | 'warehouse_gate'

export interface RevenueTriggerDecision {
  shouldCreate: boolean
  /** ระบุเสมอเมื่อ `shouldCreate = false` */
  blockedBy?: RevenueBlockReason
}

/**
 * ตัดสินว่าเคสนี้ถึงจุดที่ต้องสร้าง Revenue แล้วหรือยัง
 *
 * **ไม่** ตรวจว่าเคยสร้างไปแล้วหรือยัง — ความ idempotent เป็นหน้าที่ของผู้เรียก
 * (ดู `tryCreateRevenue()` ที่กันซ้ำด้วย `(case_id, tracking_round)`)
 */
export function evaluateRevenueTrigger(input: RevenueTriggerInput): RevenueTriggerDecision {
  if (input.model === null) return { shouldCreate: false, blockedBy: 'no_snapshot' }
  if (input.outcome === null) return { shouldCreate: false, blockedBy: 'no_outcome' }

  const chargesOnFail = input.model !== 'SUCCESS_FEE' && input.chargeOnFail === true
  if (input.outcome === 'closed_fail' && !chargesOnFail) {
    return { shouldCreate: false, blockedBy: 'model_excludes_fail' }
  }

  // เคสที่มี expense ต้องผ่านขั้นอนุมัติจ่ายก่อนเสมอ (`19` §6.1 — ขั้นนี้ทำหน้าที่ QC ครั้งสุดท้าย)
  // เคสที่ไม่มี expense เลย เงื่อนไขนี้ตกไป แต่ Warehouse gate ยังอยู่ (DEC-006/D6)
  if (input.hasExpense && input.expenseState !== 'approved') {
    return { shouldCreate: false, blockedBy: 'expense_not_approved' }
  }

  // 🔑 Warehouse gate — closed_success ต้องรอล็อต confirmed เสมอ ไม่มีข้อยกเว้น
  if (input.outcome === 'closed_success' && input.lotState !== 'confirmed') {
    return { shouldCreate: false, blockedBy: 'warehouse_gate' }
  }

  return { shouldCreate: true }
}

/** รูปแบบสั้นของ `evaluateRevenueTrigger()` สำหรับจุดที่สนใจแค่ ใช่/ไม่ใช่ */
export function shouldCreateRevenue(input: RevenueTriggerInput): boolean {
  return evaluateRevenueTrigger(input).shouldCreate
}
