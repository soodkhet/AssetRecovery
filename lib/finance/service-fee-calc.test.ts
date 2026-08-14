import { describe, expect, it } from 'vitest'
import {
  calculateServiceFeeRevenue,
  type ServiceFeeBasisValues,
  type ServiceFeeSnapshot,
} from '@/lib/finance/service-fee-calc'

/** `22` §6.5–6.7 — ยอดรายได้ค่าบริการก่อน VAT ครบทั้ง 3 model × 2 outcome × charge_on_fail */

const values: ServiceFeeBasisValues = { debtAmountSatang: 5_000_000, assetValueSatang: 2_000_000 }

function snapshot(overrides: Partial<ServiceFeeSnapshot> = {}): ServiceFeeSnapshot {
  return { model: 'SUCCESS_FEE', baseSatang: 0, ratePct: 10, basis: 'debt_amount', chargeOnFail: false, ...overrides }
}

describe('§6.5 SUCCESS_FEE', () => {
  it('closed_success → ฐานคำนวณ × rate (฿50,000 × 10% = ฿5,000)', () => {
    const result = calculateServiceFeeRevenue(snapshot(), 'closed_success', values)
    expect(result.grossSatang).toBe(500_000)
    expect(result.rateComponentSatang).toBe(500_000)
    expect(result.baseComponentSatang).toBe(0)
    expect(result.basisSatang).toBe(5_000_000)
  })

  it('closed_fail → 0 เสมอ (ไม่มีความสำเร็จให้คิดค่าบริการ) แม้ chargeOnFail หลุดมาเป็น true', () => {
    expect(calculateServiceFeeRevenue(snapshot({ chargeOnFail: true }), 'closed_fail', values).grossSatang).toBe(0)
  })

  it('basis = asset_value ใช้มูลค่าทรัพย์ ไม่ใช่มูลหนี้', () => {
    const result = calculateServiceFeeRevenue(snapshot({ basis: 'asset_value' }), 'closed_success', values)
    expect(result.basisSatang).toBe(2_000_000)
    expect(result.grossSatang).toBe(200_000)
  })

  it('เคสยังไม่มีฐานคำนวณ → gross = null + missingBasis (ห้ามสร้าง Revenue)', () => {
    const result = calculateServiceFeeRevenue(snapshot(), 'closed_success', {
      debtAmountSatang: null,
      assetValueSatang: null,
    })
    expect(result.grossSatang).toBeNull()
    expect(result.missingBasis).toBe(true)
  })
})

describe('§6.6 FLAT', () => {
  const flat = snapshot({ model: 'FLAT', baseSatang: 300_000, basis: null, ratePct: 0 })

  it('charge_on_fail = true → ได้ base ทุก outcome', () => {
    const withFail = { ...flat, chargeOnFail: true }
    expect(calculateServiceFeeRevenue(withFail, 'closed_success', values).grossSatang).toBe(300_000)
    expect(calculateServiceFeeRevenue(withFail, 'closed_fail', values).grossSatang).toBe(300_000)
  })

  it('charge_on_fail = false → ได้ base เฉพาะ closed_success · closed_fail = 0', () => {
    expect(calculateServiceFeeRevenue(flat, 'closed_success', values).grossSatang).toBe(300_000)
    expect(calculateServiceFeeRevenue(flat, 'closed_fail', values).grossSatang).toBe(0)
  })

  it('ไม่มีส่วน rate เลย แม้ตั้ง ratePct มา (และไม่ต้องใช้ฐานคำนวณ)', () => {
    const result = calculateServiceFeeRevenue({ ...flat, ratePct: 10 }, 'closed_success', {
      debtAmountSatang: null,
      assetValueSatang: null,
    })
    expect(result.rateComponentSatang).toBe(0)
    expect(result.missingBasis).toBe(false)
    expect(result.grossSatang).toBe(300_000)
  })
})

describe('§6.7 HYBRID', () => {
  const hybrid = snapshot({ model: 'HYBRID', baseSatang: 100_000, ratePct: 5, basis: 'debt_amount' })

  it('closed_success = base + (ฐาน × rate) — ฿1,000 + (฿50,000 × 5%) = ฿3,500', () => {
    const result = calculateServiceFeeRevenue(hybrid, 'closed_success', values)
    expect(result.baseComponentSatang).toBe(100_000)
    expect(result.rateComponentSatang).toBe(250_000)
    expect(result.grossSatang).toBe(350_000)
  })

  it('closed_fail + charge_on_fail = true → ได้เฉพาะ base ส่วน rate ไม่ได้เลย', () => {
    const result = calculateServiceFeeRevenue({ ...hybrid, chargeOnFail: true }, 'closed_fail', values)
    expect(result.grossSatang).toBe(100_000)
    expect(result.rateComponentSatang).toBe(0)
  })

  it('closed_fail + charge_on_fail = false → 0', () => {
    expect(calculateServiceFeeRevenue(hybrid, 'closed_fail', values).grossSatang).toBe(0)
  })

  it('ส่วน rate ได้เฉพาะ closed_success เสมอ ไม่ขึ้นกับ charge_on_fail', () => {
    const withFail = calculateServiceFeeRevenue({ ...hybrid, chargeOnFail: true }, 'closed_fail', values)
    const withoutFail = calculateServiceFeeRevenue(hybrid, 'closed_fail', values)
    expect(withFail.rateComponentSatang).toBe(withoutFail.rateComponentSatang)
  })
})

describe('ยามและคำอธิบายสูตร', () => {
  it('เศษสตางค์ปัดครึ่งขึ้น — ฿123.45 × 7% = 864 สตางค์', () => {
    const result = calculateServiceFeeRevenue(snapshot({ ratePct: 7 }), 'closed_success', {
      debtAmountSatang: 12_345,
      assetValueSatang: null,
    })
    expect(result.grossSatang).toBe(864)
  })

  it('base/rate/ฐานคำนวณติดลบหรือเกินช่วง = ล้ม', () => {
    expect(() => calculateServiceFeeRevenue(snapshot({ baseSatang: -1, model: 'FLAT' }), 'closed_success', values)).toThrow(
      RangeError,
    )
    expect(() => calculateServiceFeeRevenue(snapshot({ ratePct: 101 }), 'closed_success', values)).toThrow(RangeError)
    expect(() =>
      calculateServiceFeeRevenue(snapshot(), 'closed_success', { debtAmountSatang: -5, assetValueSatang: null }),
    ).toThrow(RangeError)
  })

  it('formula อธิบายที่มาของยอดให้ modal "ดูสูตร" (`16` §8)', () => {
    const result = calculateServiceFeeRevenue(snapshot({ model: 'HYBRID', baseSatang: 100_000 }), 'closed_success', values)
    expect(result.formula).toContain('model=HYBRID')
    expect(result.formula).toContain('มูลหนี้=5000000')
    expect(result.formula).toContain('10%')
  })
})
