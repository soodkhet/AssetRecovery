import {
  allowanceSatang,
  commissionSatang,
  distinctFieldDays,
  fuelDailyFlatSatang,
  fuelPerKmSatang,
  type CommissionPlanValues,
  type CommissionResult,
} from '@/lib/field/expense-calc'
import { sumSatang } from '@/lib/finance/satang'

/**
 * ค่าตอบแทนทีมงานต่อเคส (`22` §6.1–6.4) — **pure ล้วน ไม่มี I/O**
 *
 * §6.1–6.3 (fuel/allowance) มีบ้านอยู่แล้วที่ `lib/field/expense-calc.ts` ตั้งแต่ Phase 2.9 —
 * ไฟล์นี้ **re-export ของเดิม** ไม่เขียนสูตรซ้ำ — §6.4 (commission / no-success fee) ย้ายไปอยู่ที่
 * `expense-calc.ts` ด้วย (มติ PO 03/10/2569 UAT Q2: ปิดงานสร้างเป็นรายการเบิกในชุดเดียวกับ fuel/allowance)
 * ที่นี่เหลือแค่ยอดต้นทุนตรงรวมต่อเคสที่ §6.12 (Gross Profit) ต้องใช้
 */

export { allowanceSatang, commissionSatang, distinctFieldDays, fuelDailyFlatSatang, fuelPerKmSatang }
export type { CommissionPlanValues, CommissionResult }

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
