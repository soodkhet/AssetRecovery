import { describe, expect, it } from 'vitest'
import {
  allowanceSatang,
  commissionSatang,
  directCostSatang,
  distinctFieldDays,
  fuelDailyFlatSatang,
  fuelPerKmSatang,
} from '@/lib/finance/compensation-calc'

/**
 * `22` §6.1–6.4 — สูตรค่าตอบแทนทีมงาน
 * §6.1–6.3 มีเทสต์เต็มอยู่แล้วที่ `lib/field/expense-calc.test.ts` (Phase 2.9) — ที่นี่ยามว่า
 * **re-export ชี้ไปที่ตัวเดิมจริง** (ถ้าใครก๊อปสูตรมาไว้ที่นี่ เทสต์ชุดนี้จะไม่จับ แต่เทสต์ค่าจะจับ)
 */

describe('§6.1–6.3 re-export ของ fuel/allowance (บ้านเดิมคือ `lib/field/expense-calc.ts`)', () => {
  it('PER_KM: 12.50 กม. × ฿5/กม. = ฿62.50 · เพดานตัดยอด', () => {
    expect(fuelPerKmSatang({ distanceKmHundredths: 1_250, ratePerKmSatang: 500, maxPerCaseSatang: null })).toBe(6_250)
    expect(fuelPerKmSatang({ distanceKmHundredths: 1_250, ratePerKmSatang: 500, maxPerCaseSatang: 5_000 })).toBe(5_000)
  })

  it('DAILY_FLAT: จ่ายค่าคงที่ ไม่คิดระยะทาง · null = 0', () => {
    expect(fuelDailyFlatSatang(30_000)).toBe(30_000)
    expect(fuelDailyFlatSatang(null)).toBe(0)
  })

  it('allowance = อัตราต่อวัน × จำนวนวันที่ลงพื้นที่จริง (v2 ของ `22` — ไม่ใช่ค่าคงที่ต่อเคส)', () => {
    expect(allowanceSatang(20_000, 3)).toBe(60_000)
    expect(allowanceSatang(20_000, 0)).toBe(0)
  })

  it('นับวันลงพื้นที่แบบ DISTINCT ตามวันปฏิทินไทย', () => {
    const checkIns = [
      new Date('2026-08-14T02:00:00Z'), // 09:00 ไทย 14/08
      new Date('2026-08-14T09:30:00Z'), // 16:30 ไทย 14/08 — วันเดียวกัน
      new Date('2026-08-14T17:30:00Z'), // 00:30 ไทย 15/08 — คนละวัน
    ]
    expect(distinctFieldDays(checkIns)).toBe(2)
  })
})

describe('§6.4 Commission / No-Success Fee', () => {
  const plan = { commissionSatang: 50_000, noSuccessFeeSatang: 20_000 }

  it('closed_success → commission (ค่าตายตัวต่อเคส ไม่ใช่ % ของมูลหนี้)', () => {
    expect(commissionSatang('closed_success', plan)).toEqual({ expenseType: 'commission', grossSatang: 50_000 })
  })

  it('closed_fail → no_success_fee (exclusive กับ commission)', () => {
    expect(commissionSatang('closed_fail', plan)).toEqual({ expenseType: 'no_success_fee', grossSatang: 20_000 })
  })

  it('ยอด 0 = ไม่สร้างรายการเบิก (D10)', () => {
    expect(commissionSatang('closed_success', { commissionSatang: 0, noSuccessFeeSatang: 20_000 })).toEqual({
      expenseType: null,
      grossSatang: 0,
    })
    expect(commissionSatang('closed_fail', { commissionSatang: 50_000, noSuccessFeeSatang: 0 })).toEqual({
      expenseType: null,
      grossSatang: 0,
    })
  })

  it('ไม่มีการหารเฉลี่ยตามจำนวนเคสต่อวัน — "กฎหาร 4" ถูกยกเลิกแล้ว (`22` §6.4)', () => {
    // เคสที่ 1 กับเคสที่ 4 ของวันเดียวกันต้องได้ยอดเท่ากันเสมอ
    const first = commissionSatang('closed_success', plan)
    const fourth = commissionSatang('closed_success', plan)
    expect(fourth.grossSatang).toBe(first.grossSatang)
    expect(fourth.grossSatang).toBe(50_000)
  })

  it('ยอดติดลบในแผน = ข้อมูลพัง ต้องล้ม', () => {
    expect(() => commissionSatang('closed_success', { commissionSatang: -1, noSuccessFeeSatang: 0 })).toThrow(RangeError)
    expect(() => commissionSatang('closed_fail', { commissionSatang: 0, noSuccessFeeSatang: -1 })).toThrow(RangeError)
  })
})

describe('§6.12 ต้นทุนตรงต่อเคส', () => {
  it('รวม fuel + allowance + commission/no-success fee เท่านั้น', () => {
    expect(directCostSatang({ fuelSatang: 6_250, allowanceSatang: 60_000, commissionSatang: 50_000 })).toBe(116_250)
  })

  it('เคส closed_fail ที่ไม่มีรายได้ก็ยังมีต้นทุนตรง (`21` §16)', () => {
    expect(directCostSatang({ fuelSatang: 6_250, allowanceSatang: 20_000, commissionSatang: 20_000 })).toBe(46_250)
  })

  it('ค่าที่ไม่ใช่สตางค์จำนวนเต็มต้องล้ม', () => {
    expect(() => directCostSatang({ fuelSatang: 1.5, allowanceSatang: 0, commissionSatang: 0 })).toThrow(RangeError)
  })
})
