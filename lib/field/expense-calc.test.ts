import { describe, expect, it } from 'vitest'
import {
  allowanceSatang,
  distinctFieldDays,
  fuelDailyFlatSatang,
  fuelPerKmSatang,
  initialCaseExpenseStatus,
  planCaseExpenses,
  type CompensationSnapshotValues,
} from '@/lib/field/expense-calc'

const perKmPlan: CompensationSnapshotValues = {
  fuelMode: 'PER_KM',
  // ฿5.00/กม.
  fuelRatePerKmSatang: 500,
  fuelMaxPerCaseSatang: null,
  fuelDailyFlatSatang: null,
  // ฿300/วัน
  allowanceSatang: 30_000,
}

const dailyFlatPlan: CompensationSnapshotValues = {
  fuelMode: 'DAILY_FLAT',
  fuelRatePerKmSatang: null,
  fuelMaxPerCaseSatang: null,
  // ฿250/วัน
  fuelDailyFlatSatang: 25_000,
  allowanceSatang: 30_000,
}

describe('fuelPerKmSatang (`22` §6.1)', () => {
  it('ไม่มีเพดาน = จ่ายเต็มตามระยะทางจริง × rate', () => {
    // 12.35 กม. × ฿5.00 = ฿61.75
    expect(fuelPerKmSatang({ distanceKmHundredths: 1235, ratePerKmSatang: 500, maxPerCaseSatang: null })).toBe(6175)
  })

  it('ชนเพดาน max_per_case = ตัดที่เพดาน (`41` §20)', () => {
    // 120 กม. × ฿5 = ฿600 แต่เพดาน ฿400
    expect(fuelPerKmSatang({ distanceKmHundredths: 12_000, ratePerKmSatang: 500, maxPerCaseSatang: 40_000 })).toBe(
      40_000,
    )
  })

  it('ยอดต่ำกว่าเพดานไม่ถูกตัด', () => {
    expect(fuelPerKmSatang({ distanceKmHundredths: 1_000, ratePerKmSatang: 500, maxPerCaseSatang: 40_000 })).toBe(5_000)
  })

  it('เพดาน 0/ไม่ได้ตั้ง ถือว่าไม่มีเพดาน', () => {
    expect(fuelPerKmSatang({ distanceKmHundredths: 12_000, ratePerKmSatang: 500, maxPerCaseSatang: 0 })).toBe(60_000)
  })

  it('rate ที่ยังไม่ได้ตั้ง = 0 บาท (ไม่ระเบิด ไม่คิดเงินมั่ว)', () => {
    expect(fuelPerKmSatang({ distanceKmHundredths: 1_000, ratePerKmSatang: null, maxPerCaseSatang: null })).toBe(0)
  })

  it('ยอดออกมาเป็นจำนวนเต็ม satang เสมอ (ห้ามมีเศษทศนิยม)', () => {
    // 3.33 กม. × ฿1.33 = 442.89 สตางค์ → 443
    const value = fuelPerKmSatang({ distanceKmHundredths: 333, ratePerKmSatang: 133, maxPerCaseSatang: null })
    expect(value).toBe(443)
    expect(Number.isInteger(value)).toBe(true)
  })

  it('ระยะทางติดลบ/ไม่ใช่จำนวนเต็ม = โยนทิ้ง', () => {
    expect(() => fuelPerKmSatang({ distanceKmHundredths: -1, ratePerKmSatang: 500, maxPerCaseSatang: null })).toThrow()
    expect(() => fuelPerKmSatang({ distanceKmHundredths: 1.5, ratePerKmSatang: 500, maxPerCaseSatang: null })).toThrow()
  })
})

describe('fuelDailyFlatSatang (`22` §6.2)', () => {
  it('คงที่ ไม่เกี่ยวกับระยะทาง', () => {
    expect(fuelDailyFlatSatang(25_000)).toBe(25_000)
    expect(fuelDailyFlatSatang(null)).toBe(0)
  })
})

describe('allowance (`22` §6.3)', () => {
  it('อัตราต่อวัน × จำนวนวันที่ลงพื้นที่จริง', () => {
    expect(allowanceSatang(30_000, 2)).toBe(60_000)
    expect(allowanceSatang(30_000, 0)).toBe(0)
  })

  it('นับ DISTINCT วันปฏิทิน**เวลาไทย** — หลายเช็คอินในวันเดียวนับวันเดียว', () => {
    expect(
      distinctFieldDays([
        new Date('2026-08-14T02:00:00Z'),
        new Date('2026-08-14T09:30:00Z'),
        new Date('2026-08-15T02:00:00Z'),
      ]),
    ).toBe(2)
  })

  it('เช็คอิน 23:30 กับ 00:30 เวลาไทย = คนละวัน (ห้ามใช้ UTC ตัดวัน)', () => {
    // 2026-08-14T16:30Z = 23:30 ไทย · 2026-08-14T17:30Z = 00:30 ของวันที่ 15 ไทย
    expect(distinctFieldDays([new Date('2026-08-14T16:30:00Z'), new Date('2026-08-14T17:30:00Z')])).toBe(2)
  })
})

describe('initialCaseExpenseStatus (`41` §6.6)', () => {
  it('เคสสำเร็จต้องรอคลังยืนยันเสมอ', () => {
    expect(initialCaseExpenseStatus('closed_success')).toBe('pending_warehouse_confirm')
  })

  it('เคสไม่สำเร็จเข้าคิวอนุมัติได้ทันที', () => {
    expect(initialCaseExpenseStatus('closed_fail')).toBe('pending_approval')
  })
})

describe('planCaseExpenses — ชุดรายการเบิกตอนปิดงาน (`41` §6.6)', () => {
  it('PER_KM: สร้าง fuel ตามระยะทาง + allowance ตามจำนวนวัน สถานะรอคลังเมื่อสำเร็จ', () => {
    const plan = planCaseExpenses({
      outcome: 'closed_success',
      plan: perKmPlan,
      distanceKmHundredths: 2_000,
      fieldDays: 1,
    })

    expect(plan.fuelDistancePending).toBe(false)
    expect(plan.drafts).toEqual([
      { expenseType: 'fuel', grossSatang: 10_000, distanceKmHundredths: 2_000, status: 'pending_warehouse_confirm' },
      { expenseType: 'allowance', grossSatang: 30_000, distanceKmHundredths: null, status: 'pending_warehouse_confirm' },
    ])
  })

  it('DAILY_FLAT: ไม่แตะระยะทางเลย (`41` §20) และไม่ค้าง job คำนวณ', () => {
    const plan = planCaseExpenses({
      outcome: 'closed_fail',
      plan: dailyFlatPlan,
      distanceKmHundredths: null,
      fieldDays: 1,
    })

    expect(plan.fuelDistancePending).toBe(false)
    expect(plan.drafts).toEqual([
      { expenseType: 'fuel', grossSatang: 25_000, distanceKmHundredths: null, status: 'pending_approval' },
      { expenseType: 'allowance', grossSatang: 30_000, distanceKmHundredths: null, status: 'pending_approval' },
    ])
  })

  it('PER_KM ที่ยังไม่รู้ระยะทาง (Maps ล่ม/ไม่มี key) = ยังไม่สร้าง fuel แต่ allowance เกิดปกติ (D10)', () => {
    const plan = planCaseExpenses({
      outcome: 'closed_success',
      plan: perKmPlan,
      distanceKmHundredths: null,
      fieldDays: 1,
    })

    expect(plan.fuelDistancePending).toBe(true)
    expect(plan.drafts.map((draft) => draft.expenseType)).toEqual(['allowance'])
  })

  it('ยอด 0 ไม่สร้าง record เลย (D10 · DEC-006/D6)', () => {
    const plan = planCaseExpenses({
      outcome: 'closed_fail',
      plan: { ...perKmPlan, fuelRatePerKmSatang: 0, allowanceSatang: 0 },
      distanceKmHundredths: 1_000,
      fieldDays: 3,
    })

    expect(plan.drafts).toEqual([])
    expect(plan.fuelDistancePending).toBe(false)
  })

  it('ไม่มีเช็คอินเลย (ปิดงานผ่านทางอื่น) = ไม่มีเบี้ยเลี้ยง', () => {
    const plan = planCaseExpenses({
      outcome: 'closed_fail',
      plan: dailyFlatPlan,
      distanceKmHundredths: null,
      fieldDays: 0,
    })

    expect(plan.drafts.map((draft) => draft.expenseType)).toEqual(['fuel'])
  })
})
