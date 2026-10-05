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

describe('describeExpenseBasis — ค่าที่พัก (มติ PO U89)', () => {
  const base = { fuelRatePerKmSatang: null, fuelDailyFlatSatang: null, allowanceSatang: null }
  it('มีเพดาน snapshot → แสดงยอด + จำนวนคืน + เพดานรวม', () => {
    expect(
      describeExpenseBasis({
        expenseType: 'hotel',
        grossSatang: 60_000,
        distanceKm: null,
        compPlan: { ...base, hotelMaxPerNightSatang: 80_000 },
      }),
    ).toBe('600.00 บาท (1 คืน · เพดาน ฿800.00)')
  })
  it('หลายคืน (มติ PO O50) → "2 คืน · เพดาน ฿1,600.00"', () => {
    expect(
      describeExpenseBasis({
        expenseType: 'hotel',
        grossSatang: 160_000,
        distanceKm: null,
        hotelNights: 2,
        compPlan: { ...base, hotelMaxPerNightSatang: 80_000 },
      }),
    ).toBe('1,600.00 บาท (2 คืน · เพดาน ฿1,600.00)')
  })
  it('หลายคืนแต่ไม่ตั้งเพดาน → บอกจำนวนคืน', () => {
    expect(
      describeExpenseBasis({
        expenseType: 'hotel',
        grossSatang: 160_000,
        distanceKm: null,
        hotelNights: 3,
        compPlan: { ...base, hotelMaxPerNightSatang: null },
      }),
    ).toBe('1,600.00 บาท (3 คืน)')
  })
  it('ไม่ตั้งเพดาน → ยอดอย่างเดียว', () => {
    expect(
      describeExpenseBasis({
        expenseType: 'hotel',
        grossSatang: 60_000,
        distanceKm: null,
        compPlan: { ...base, hotelMaxPerNightSatang: null },
      }),
    ).toBe('600.00 บาท')
  })
})

describe('describeExpenseBasis — ใบเสร็จค่าที่พักในนามบริษัท (มติ PO U96 #14)', () => {
  const base = { fuelRatePerKmSatang: null, fuelDailyFlatSatang: null, allowanceSatang: null }
  it('ติ๊ก/ไม่ติ๊ก → ผู้อนุมัติเห็นป้ายต่อท้าย · ยอดไม่เปลี่ยน', () => {
    const row = {
      expenseType: 'hotel' as const,
      grossSatang: 60_000,
      distanceKm: null,
      compPlan: { ...base, hotelMaxPerNightSatang: 80_000 },
    }
    expect(describeExpenseBasis({ ...row, receiptInCompanyName: true })).toBe(
      '600.00 บาท (1 คืน · เพดาน ฿800.00) · ใบเสร็จในนามบริษัท',
    )
    expect(describeExpenseBasis({ ...row, receiptInCompanyName: false })).toBe(
      '600.00 บาท (1 คืน · เพดาน ฿800.00) · ใบเสร็จไม่ได้ออกในนามบริษัท',
    )
    expect(
      describeExpenseBasis({
        ...row,
        compPlan: { ...base, hotelMaxPerNightSatang: null },
        receiptInCompanyName: false,
      }),
    ).toBe('600.00 บาท · ใบเสร็จไม่ได้ออกในนามบริษัท')
  })
})
