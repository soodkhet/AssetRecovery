import { describe, expect, it } from 'vitest'
import {
  distinctFieldDays,
  fieldDayTotalsSatang,
  fuelPerKmSatang,
  initialCaseExpenseStatus,
  initialFieldDayExpenseStatus,
  planCaseExpenses,
  planFieldDayExpenses,
  splitDailyAmountSatang,
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
  // ยอด 0 = ไม่สร้างรายการ — ชุดเทสต์ fuel/allowance เดิมไม่ปนคอม (เทสต์คอมแยกด้านล่าง)
  commissionSatang: 0,
  noSuccessFeeSatang: 0,
}

const dailyFlatPlan: CompensationSnapshotValues = {
  fuelMode: 'DAILY_FLAT',
  fuelRatePerKmSatang: null,
  fuelMaxPerCaseSatang: null,
  // ฿250/วัน
  fuelDailyFlatSatang: 25_000,
  allowanceSatang: 30_000,
  commissionSatang: 0,
  noSuccessFeeSatang: 0,
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

describe('fieldDayTotalsSatang — ยอดต่อพนักงานต่อวัน D (`22` §6.2/§6.3 · มติ PO UAT Q21)', () => {
  it('DAILY_FLAT: fuel = อัตราเหมาจ่าย 1 ครั้ง + allowance 1 ครั้ง', () => {
    expect(fieldDayTotalsSatang(dailyFlatPlan)).toEqual({ fuelSatang: 25_000, allowanceSatang: 30_000 })
  })

  it('PER_KM: ไม่มี fuel รายวัน (คิดต่อเคสตามระยะทาง) แต่ allowance ยังรายวัน', () => {
    expect(fieldDayTotalsSatang(perKmPlan)).toEqual({ fuelSatang: 0, allowanceSatang: 30_000 })
  })

  it('ไม่ตั้งอัตรา = 0', () => {
    expect(fieldDayTotalsSatang({ ...dailyFlatPlan, fuelDailyFlatSatang: null, allowanceSatang: 0 })).toEqual({
      fuelSatang: 0,
      allowanceSatang: 0,
    })
  })
})

describe('splitDailyAmountSatang — กระจาย D เท่ากันทุกเคส เศษลงเคสแรก', () => {
  it('N=1 ได้เต็ม D', () => {
    expect(splitDailyAmountSatang(20_000, 1)).toEqual([20_000])
  })

  it('N=2 หารลงตัว', () => {
    expect(splitDailyAmountSatang(20_000, 2)).toEqual([10_000, 10_000])
  })

  it('N=3 มีเศษ 2 สตางค์ ลงเคสแรกทั้งหมด · ผลรวม = D เป๊ะ', () => {
    const shares = splitDailyAmountSatang(20_000, 3)
    expect(shares).toEqual([6_668, 6_666, 6_666])
    expect(shares.reduce((sum, value) => sum + value, 0)).toBe(20_000)
  })

  it('D น้อยกว่า N — เคสหลังได้ 0 (ผลรวมยังเท่า D)', () => {
    expect(splitDailyAmountSatang(1, 3)).toEqual([1, 0, 0])
    expect(splitDailyAmountSatang(0, 2)).toEqual([0, 0])
  })

  it('N ไม่ถูกต้อง / ยอดติดลบ = โยน', () => {
    expect(() => splitDailyAmountSatang(100, 0)).toThrow(RangeError)
    expect(() => splitDailyAmountSatang(100, 1.5)).toThrow(RangeError)
    expect(() => splitDailyAmountSatang(-1, 2)).toThrow()
  })
})

describe('planFieldDayExpenses — แถวรายวันต่อเคส (`41` §6.6 · UAT Q21)', () => {
  const at = (iso: string) => new Date(iso)
  // แผน in1: น้ำมันเหมา ฿200/วัน + เบี้ยเลี้ยง ฿150/วัน
  const plan = { fuelMode: 'DAILY_FLAT' as const, fuelDailyFlatSatang: 20_000, allowanceSatang: 15_000 }

  it('golden: 2 เคสวันเดียว → fuel 10,000 + allowance 7,500 ต่อเคส รวมต่อชนิด = D', () => {
    const result = planFieldDayExpenses({
      plan,
      cases: [
        { caseId: 'c2', assignmentId: 'a2', firstCheckedInAt: at('2026-10-03T05:00:00Z') },
        { caseId: 'c1', assignmentId: 'a1', firstCheckedInAt: at('2026-10-03T02:00:00Z') },
      ],
    })
    expect(result.orderedCaseIds).toEqual(['c1', 'c2'])
    expect(result.drafts).toEqual([
      { caseId: 'c1', assignmentId: 'a1', expenseType: 'fuel', grossSatang: 10_000 },
      { caseId: 'c2', assignmentId: 'a2', expenseType: 'fuel', grossSatang: 10_000 },
      { caseId: 'c1', assignmentId: 'a1', expenseType: 'allowance', grossSatang: 7_500 },
      { caseId: 'c2', assignmentId: 'a2', expenseType: 'allowance', grossSatang: 7_500 },
    ])
    expect(result.fuelTotalSatang).toBe(20_000)
    expect(result.allowanceTotalSatang).toBe(15_000)
  })

  it('3 เคส: เศษลงเคสที่เช็คอินแรกสุดของวัน', () => {
    const result = planFieldDayExpenses({
      plan: { ...plan, allowanceSatang: 10_000 },
      cases: [
        { caseId: 'b', assignmentId: 'ab', firstCheckedInAt: at('2026-10-03T03:00:00Z') },
        { caseId: 'c', assignmentId: 'ac', firstCheckedInAt: at('2026-10-03T04:00:00Z') },
        { caseId: 'a', assignmentId: 'aa', firstCheckedInAt: at('2026-10-03T01:00:00Z') },
      ],
    })
    const allowance = result.drafts.filter((row) => row.expenseType === 'allowance')
    expect(allowance.map((row) => [row.caseId, row.grossSatang])).toEqual([
      ['a', 3_334],
      ['b', 3_333],
      ['c', 3_333],
    ])
  })

  it('PER_KM: สร้างเฉพาะ allowance', () => {
    const result = planFieldDayExpenses({
      plan: { ...plan, fuelMode: 'PER_KM' },
      cases: [{ caseId: 'c1', assignmentId: 'a1', firstCheckedInAt: at('2026-10-03T02:00:00Z') }],
    })
    expect(result.drafts.map((row) => row.expenseType)).toEqual(['allowance'])
    expect(result.fuelTotalSatang).toBe(0)
  })

  it('ไม่มีเคส = ไม่มีแถว ยอดรวม 0 · ส่วนแบ่ง 0 ไม่สร้างแถว (D10)', () => {
    expect(planFieldDayExpenses({ plan, cases: [] })).toEqual({
      fuelTotalSatang: 0,
      allowanceTotalSatang: 0,
      orderedCaseIds: [],
      drafts: [],
    })
    const tiny = planFieldDayExpenses({
      plan: { fuelMode: 'DAILY_FLAT', fuelDailyFlatSatang: 1, allowanceSatang: 0 },
      cases: [
        { caseId: 'c1', assignmentId: 'a1', firstCheckedInAt: at('2026-10-03T02:00:00Z') },
        { caseId: 'c2', assignmentId: 'a2', firstCheckedInAt: at('2026-10-03T03:00:00Z') },
      ],
    })
    expect(tiny.drafts).toEqual([{ caseId: 'c1', assignmentId: 'a1', expenseType: 'fuel', grossSatang: 1 }])
  })
})

describe('initialFieldDayExpenseStatus (UAT Q21 ข้อ 6)', () => {
  it('สำเร็จ + ยังไม่ผ่านคลัง → รอคลัง', () => {
    expect(initialFieldDayExpenseStatus('closed_success', false)).toBe('pending_warehouse_confirm')
  })
  it('สำเร็จ + ล็อต confirmed แล้ว → เข้าคิวอนุมัติทันที (ขั้นปลดล็อกผ่านไปแล้ว)', () => {
    expect(initialFieldDayExpenseStatus('closed_success', true)).toBe('pending_approval')
  })
  it('ไม่สำเร็จ / ยังไม่ปิดงาน → เข้าคิวอนุมัติ', () => {
    expect(initialFieldDayExpenseStatus('closed_fail', false)).toBe('pending_approval')
    expect(initialFieldDayExpenseStatus(null, false)).toBe('pending_approval')
  })
})

describe('distinctFieldDays (`22` §6.3)', () => {
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

describe('planCaseExpenses — ชุดรายการเบิกตอนปิดงาน (`41` §6.6 · มติ PO UAT Q21)', () => {
  it('PER_KM: สร้าง fuel ตามระยะทาง สถานะรอคลังเมื่อสำเร็จ — ไม่มี allowance ตอนปิดงานแล้ว', () => {
    const plan = planCaseExpenses({
      outcome: 'closed_success',
      plan: perKmPlan,
      distanceKmHundredths: 2_000,
    })

    expect(plan.fuelDistancePending).toBe(false)
    expect(plan.drafts).toEqual([
      { expenseType: 'fuel', grossSatang: 10_000, distanceKmHundredths: 2_000, status: 'pending_warehouse_confirm' },
    ])
  })

  it('DAILY_FLAT: ไม่สร้าง fuel/allowance ตอนปิดงาน (เกิดจาก job รายวันหลังจบวัน) และไม่ค้าง job ระยะทาง', () => {
    const plan = planCaseExpenses({
      outcome: 'closed_fail',
      plan: dailyFlatPlan,
      distanceKmHundredths: null,
    })

    expect(plan.fuelDistancePending).toBe(false)
    expect(plan.drafts).toEqual([])
  })

  it('PER_KM ที่ยังไม่รู้ระยะทาง (Maps ล่ม/ไม่มี key) = ยังไม่สร้าง fuel แต่ตั้ง job (D10)', () => {
    const plan = planCaseExpenses({
      outcome: 'closed_success',
      plan: perKmPlan,
      distanceKmHundredths: null,
    })

    expect(plan.fuelDistancePending).toBe(true)
    expect(plan.drafts).toEqual([])
  })

  it('ยอด 0 ไม่สร้าง record เลย (D10 · DEC-006/D6)', () => {
    const plan = planCaseExpenses({
      outcome: 'closed_fail',
      plan: { ...perKmPlan, fuelRatePerKmSatang: 0 },
      distanceKmHundredths: 1_000,
    })

    expect(plan.drafts).toEqual([])
    expect(plan.fuelDistancePending).toBe(false)
  })
})

describe('planCaseExpenses — ค่าคอมมิชชั่น/เบี้ยเสี่ยง (`22` §6.4 · มติ PO 03/10/2569 UAT Q2)', () => {
  // แผน PLAN_IN ของ UAT (DATASET M5): คอม ฿500 / เบี้ยเสี่ยง ฿200
  const withCommission: CompensationSnapshotValues = { ...dailyFlatPlan, commissionSatang: 50_000, noSuccessFeeSatang: 20_000 }

  it('ปิดสำเร็จ: สร้าง commission ตามแผน สถานะรอคลังเหมือน fuel/allowance', () => {
    const plan = planCaseExpenses({ outcome: 'closed_success', plan: withCommission, distanceKmHundredths: null })

    expect(plan.drafts).toContainEqual({
      expenseType: 'commission',
      grossSatang: 50_000,
      distanceKmHundredths: null,
      status: 'pending_warehouse_confirm',
    })
    expect(plan.drafts.map((draft) => draft.expenseType)).not.toContain('no_success_fee')
  })

  it('ปิดไม่สำเร็จ: สร้าง no_success_fee (exclusive กับ commission) เข้าคิวอนุมัติทันที', () => {
    const plan = planCaseExpenses({ outcome: 'closed_fail', plan: withCommission, distanceKmHundredths: null })

    expect(plan.drafts).toContainEqual({
      expenseType: 'no_success_fee',
      grossSatang: 20_000,
      distanceKmHundredths: null,
      status: 'pending_approval',
    })
    expect(plan.drafts.map((draft) => draft.expenseType)).not.toContain('commission')
  })

  it('คอมไม่ขึ้นกับจำนวนวัน/ระยะทาง — ค่าตายตัวต่อเคส', () => {
    const plan = planCaseExpenses({ outcome: 'closed_success', plan: withCommission, distanceKmHundredths: null })

    expect(plan.drafts.find((draft) => draft.expenseType === 'commission')?.grossSatang).toBe(50_000)
  })

  it('แผนตั้งยอด 0 = ไม่สร้างแถว (D10)', () => {
    const plan = planCaseExpenses({
      outcome: 'closed_fail',
      plan: { ...withCommission, noSuccessFeeSatang: 0 },
      distanceKmHundredths: null,
    })

    expect(plan.drafts).toEqual([])
  })
})
