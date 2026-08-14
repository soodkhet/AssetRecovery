import { describe, expect, it } from 'vitest'
import { describeTeamCost, type TeamCostSnapshot } from '@/lib/cases/team-cost'

/**
 * `38` §7.4 — กล่องค่าใช้จ่ายของทีมต้องเป็น **ข้อมูลดิบเท่านั้น**
 * เทสต์ชุดนี้เป็นยามกัน "เผลอคำนวณ" (กำไร/ขาดทุน/ยอดรวม) หลุดเข้ามาในกล่องนี้
 */

const PER_KM: TeamCostSnapshot = {
  planId: '11111111-1111-4111-8111-111111111111',
  planName: 'แผนภาคกลาง',
  planVersion: 2,
  fuelMode: 'PER_KM',
  fuelRatePerKmSatang: 500,
  fuelMaxPerCaseSatang: 50_000,
  fuelDailyFlatSatang: null,
  allowanceSatang: 30_000,
  hotelMaxPerNightSatang: 80_000,
  commissionSatang: 120_000,
  noSuccessFeeSatang: 30_000,
}

const DAILY_FLAT: TeamCostSnapshot = {
  ...PER_KM,
  fuelMode: 'DAILY_FLAT',
  fuelRatePerKmSatang: null,
  fuelMaxPerCaseSatang: null,
  fuelDailyFlatSatang: 40_000,
  hotelMaxPerNightSatang: null,
}

describe('describeTeamCost', () => {
  it('คืน 5 แถวตามลำดับที่ §7.4 กำหนด', () => {
    expect(describeTeamCost(PER_KM).map((row) => row.key)).toEqual([
      'fuel',
      'allowance',
      'hotel',
      'commission',
      'no_success_fee',
    ])
  })

  it('PER_KM แสดงอัตราต่อ กม. + เพดานต่อเคส', () => {
    const [fuel] = describeTeamCost(PER_KM)
    expect(fuel?.text).toBe('฿5.00/กม.')
    expect(fuel?.note).toBe('เพดาน ฿500.00/เคส')
  })

  it('PER_KM ที่ไม่มีเพดาน บอกว่าไม่จำกัด (ไม่ใช่ ฿0.00)', () => {
    const [fuel] = describeTeamCost({ ...PER_KM, fuelMaxPerCaseSatang: null })
    expect(fuel?.note).toBe('ไม่จำกัดเพดานต่อเคส')
  })

  it('DAILY_FLAT แสดงเหมาจ่ายรายวัน และไม่มีอัตราต่อ กม.', () => {
    const [fuel] = describeTeamCost(DAILY_FLAT)
    expect(fuel?.text).toBe('฿400.00/วัน')
    expect(fuel?.text).not.toContain('กม.')
  })

  it('ค่าที่พักที่ไม่ได้ตั้งไว้ แสดง "ไม่กำหนด"', () => {
    expect(describeTeamCost(DAILY_FLAT)[2]?.text).toBe('ไม่กำหนด')
  })

  it('แยกคอมมิชชั่น (สำเร็จ) กับเบี้ยเสี่ยง (ไม่สำเร็จ) คนละแถวชัดเจน', () => {
    const rows = describeTeamCost(PER_KM)
    expect(rows[3]).toMatchObject({ text: '฿1,200.00', note: 'จ่ายเมื่อติดตามสำเร็จ' })
    expect(rows[4]).toMatchObject({ text: '฿300.00', note: 'จ่ายเมื่อติดตามไม่สำเร็จ' })
  })

  it('ไม่มีแถวสรุป/กำไร/ขาดทุน หรือยอดรวมใด ๆ', () => {
    const text = describeTeamCost(PER_KM)
      .map((row) => `${row.label} ${row.text} ${row.note ?? ''}`)
      .join(' ')
    for (const forbidden of ['กำไร', 'ขาดทุน', 'รวม', 'สุทธิ']) {
      expect(text).not.toContain(forbidden)
    }
  })
})
