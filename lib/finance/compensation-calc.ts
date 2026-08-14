import { allowanceSatang, distinctFieldDays, fuelDailyFlatSatang, fuelPerKmSatang } from '@/lib/field/expense-calc'
import { assertNonNegativeSatang, sumSatang } from '@/lib/finance/satang'
import type { CaseOutcome, ExpenseType } from '@/lib/generated/prisma/enums'

/**
 * ค่าตอบแทนทีมงานต่อเคส (`22` §6.1–6.4) — **pure ล้วน ไม่มี I/O**
 *
 * §6.1–6.3 (fuel/allowance) มีบ้านอยู่แล้วที่ `lib/field/expense-calc.ts` ตั้งแต่ Phase 2.9 —
 * ไฟล์นี้ **re-export ของเดิม** ไม่เขียนสูตรซ้ำ แล้วเติมเฉพาะส่วนที่ยังไม่มี:
 * §6.4 (commission / no-success fee) + ยอดต้นทุนตรงรวมต่อเคสที่ §6.12 (Gross Profit) ต้องใช้
 */

export { allowanceSatang, distinctFieldDays, fuelDailyFlatSatang, fuelPerKmSatang }

/** ค่าจากแผนค่าตอบแทนที่ **snapshot ไว้ในตัว expense แล้ว** (`92` §7.1) — ห้ามอ่าน live plan มาคิดย้อนหลัง */
export interface CommissionPlanValues {
  /** จ่ายเมื่อ `closed_success` */
  commissionSatang: number
  /** เบี้ยเสี่ยง จ่ายเมื่อ `closed_fail` — exclusive กับ commission */
  noSuccessFeeSatang: number
}

export interface CommissionResult {
  /** ชนิดรายการเบิกที่ต้องสร้าง — `null` เมื่อยอดเป็น 0 (ยอด 0 ไม่สร้าง record ตาม D10) */
  expenseType: Extract<ExpenseType, 'commission' | 'no_success_fee'> | null
  grossSatang: number
}

/**
 * `22` §6.4 — ค่าตายตัวต่อเคสตาม outcome (**ไม่ใช่ % ของมูลหนี้** และ **ไม่มีการหารเฉลี่ยต่อวัน**
 * — "กฎหาร 4" ถูกยกเลิกแล้ว) · commission กับ no-success fee เป็น mutually exclusive เสมอ
 */
export function commissionSatang(outcome: CaseOutcome, plan: CommissionPlanValues): CommissionResult {
  assertNonNegativeSatang(plan.commissionSatang, 'commission')
  assertNonNegativeSatang(plan.noSuccessFeeSatang, 'no_success_fee')

  const grossSatang = outcome === 'closed_success' ? plan.commissionSatang : plan.noSuccessFeeSatang
  if (grossSatang === 0) return { expenseType: null, grossSatang: 0 }
  return {
    expenseType: outcome === 'closed_success' ? 'commission' : 'no_success_fee',
    grossSatang,
  }
}

/** องค์ประกอบต้นทุนตรงของเคสหนึ่ง (`22` §6.12 — เฉพาะต้นทุนที่ผูกกับเคส/ทีมโดยตรง) */
export interface DirectCostComponents {
  fuelSatang: number
  allowanceSatang: number
  /** commission หรือ no-success fee (ตัวใดตัวหนึ่งเท่านั้น) */
  commissionSatang: number
}

/**
 * ต้นทุนตรงรวมของเคส (`22` §6.12 — `direct_cost = SUM(fuel + allowance + commission/no_success_fee)`)
 * ⚠️ **ไม่รวม** ค่าที่พัก/รายการเบิกทั่วไปขององค์กร ตามที่ `21` §6.1 กำหนดไว้ชัด
 */
export function directCostSatang(components: DirectCostComponents): number {
  return sumSatang(
    [components.fuelSatang, components.allowanceSatang, components.commissionSatang],
    'ต้นทุนตรง',
  )
}
