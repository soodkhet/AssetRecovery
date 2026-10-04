import { describe, expect, it } from 'vitest'
import { describeExpenseBasis } from '@/lib/compensation/approval-queries'
import { Prisma } from '@/lib/generated/prisma/client'

const plan = { fuelRatePerKmSatang: null, fuelDailyFlatSatang: 15000, allowanceSatang: 20000 }
const settlement = {
  fieldDate: new Date('2026-10-04T00:00:00Z'),
  caseCount: 2,
  fuelTotalSatang: 15000,
  allowanceTotalSatang: 20000,
}

describe('describeExpenseBasis — แถวรายวัน (BUG-095 / มติ PO U1)', () => {
  it('ค่าน้ำมันรายวัน: อัตรา/วัน ÷ จำนวนเคส (วันที่ พ.ศ.) = ยอด', () => {
    expect(
      describeExpenseBasis({ expenseType: 'fuel', grossSatang: 7500, distanceKm: null, compPlan: plan, fieldDaySettlement: settlement }),
    ).toBe('150.00 บาท/วัน ÷ 2 เคส (04/10/2569) = 75.00')
  })

  it('เบี้ยเลี้ยงรายวัน ใช้ยอดต่อวันจาก snapshot ไม่ใช่แผนปัจจุบัน', () => {
    expect(
      describeExpenseBasis({
        expenseType: 'allowance',
        grossSatang: 10000,
        distanceKm: null,
        compPlan: { ...plan, allowanceSatang: 99900 },
        fieldDaySettlement: settlement,
      }),
    ).toBe('200.00 บาท/วัน ÷ 2 เคส (04/10/2569) = 100.00')
  })

  it('ค่าน้ำมันกิโลเมตร (ไม่ผูกรายวัน) คงรูปแบบเดิม', () => {
    expect(
      describeExpenseBasis({
        expenseType: 'fuel',
        grossSatang: 44975,
        distanceKm: new Prisma.Decimal('128.5'),
        compPlan: { ...plan, fuelRatePerKmSatang: 350 },
        fieldDaySettlement: null,
      }),
    ).toBe('128.50 กม. × 3.50 บาท/กม.')
  })
})
