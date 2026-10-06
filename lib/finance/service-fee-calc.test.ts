import { describe, expect, it } from 'vitest'
import {
  calculateServiceFeeRevenue,
  type ServiceFeeBasisValues,
  type ServiceFeeSnapshot,
} from '@/lib/finance/service-fee-calc'
import { failFeeFromLegacyChargeOnFail } from '@/lib/service-fee/template'

/** `22` §6.5–6.7 — ยอดรายได้ค่าบริการก่อน VAT ครบทั้ง 3 model × 2 outcome × ยอดกรณีไม่สำเร็จ (มติ U165) */

const values: ServiceFeeBasisValues = { debtAmountSatang: 5_000_000 }

function snapshot(overrides: Partial<ServiceFeeSnapshot> = {}): ServiceFeeSnapshot {
  return { model: 'SUCCESS_FEE', baseSatang: 0, ratePct: 10, basis: 'debt_amount', failFeeSatang: null, ...overrides }
}

describe('§6.5 SUCCESS_FEE', () => {
  it('closed_success → ฐานคำนวณ × rate (฿50,000 × 10% = ฿5,000)', () => {
    const result = calculateServiceFeeRevenue(snapshot(), 'closed_success', values)
    expect(result.grossSatang).toBe(500_000)
    expect(result.rateComponentSatang).toBe(500_000)
    expect(result.baseComponentSatang).toBe(0)
    expect(result.basisSatang).toBe(5_000_000)
  })

  it('closed_fail + ไม่เก็บกรณีไม่สำเร็จ → 0', () => {
    expect(calculateServiceFeeRevenue(snapshot(), 'closed_fail', values).grossSatang).toBe(0)
  })

  it('closed_fail + ตั้งยอดกรณีไม่สำเร็จ ฿300 → ฿300 (มติ U165 ใช้ได้ทุกโมเดล) ไม่ใช้ฐาน/rate', () => {
    const result = calculateServiceFeeRevenue(snapshot({ failFeeSatang: 30_000 }), 'closed_fail', {
      debtAmountSatang: null,
    })
    expect(result.grossSatang).toBe(30_000)
    expect(result.failFeeComponentSatang).toBe(30_000)
    expect(result.rateComponentSatang).toBe(0)
    expect(result.missingBasis).toBe(false)
  })

  it('closed_success ไม่บวกยอดกรณีไม่สำเร็จ', () => {
    const result = calculateServiceFeeRevenue(snapshot({ failFeeSatang: 30_000 }), 'closed_success', values)
    expect(result.grossSatang).toBe(500_000)
    expect(result.failFeeComponentSatang).toBe(0)
  })

  it('ฐานคำนวณมีแบบเดียวคือมูลหนี้ (มติ PO U126) — basis null ที่หลุดมาก็ใช้มูลหนี้', () => {
    const result = calculateServiceFeeRevenue(snapshot({ basis: null }), 'closed_success', values)
    expect(result.basisSatang).toBe(5_000_000)
  })

  it('เคสยังไม่มีฐานคำนวณ → gross = null + missingBasis (ห้ามสร้าง Revenue)', () => {
    const result = calculateServiceFeeRevenue(snapshot(), 'closed_success', {
      debtAmountSatang: null,
    })
    expect(result.grossSatang).toBeNull()
    expect(result.missingBasis).toBe(true)
  })
})

describe('§6.6 FLAT', () => {
  const flat = snapshot({ model: 'FLAT', baseSatang: 300_000, basis: null, ratePct: 0 })

  it('ยอดกรณีไม่สำเร็จ = base (ข้อมูลเดิมที่ migrate จาก charge_on_fail) → ได้ base ทุก outcome', () => {
    const withFail = { ...flat, failFeeSatang: 300_000 }
    expect(calculateServiceFeeRevenue(withFail, 'closed_success', values).grossSatang).toBe(300_000)
    expect(calculateServiceFeeRevenue(withFail, 'closed_fail', values).grossSatang).toBe(300_000)
  })

  it('ตัวอย่างมติ U165: สำเร็จ ฿1,500 / ไม่สำเร็จ ฿300', () => {
    const split = { ...flat, baseSatang: 150_000, failFeeSatang: 30_000 }
    expect(calculateServiceFeeRevenue(split, 'closed_success', values).grossSatang).toBe(150_000)
    expect(calculateServiceFeeRevenue(split, 'closed_fail', values).grossSatang).toBe(30_000)
  })

  it('ยอดกรณีไม่สำเร็จ = 0 (ตั้งไว้ชัด) → closed_fail = 0', () => {
    expect(calculateServiceFeeRevenue({ ...flat, failFeeSatang: 0 }, 'closed_fail', values).grossSatang).toBe(0)
  })

  it('ไม่เก็บกรณีไม่สำเร็จ (null) → ได้ base เฉพาะ closed_success · closed_fail = 0', () => {
    expect(calculateServiceFeeRevenue(flat, 'closed_success', values).grossSatang).toBe(300_000)
    expect(calculateServiceFeeRevenue(flat, 'closed_fail', values).grossSatang).toBe(0)
  })

  it('ไม่มีส่วน rate เลย แม้ตั้ง ratePct มา (และไม่ต้องใช้ฐานคำนวณ)', () => {
    const result = calculateServiceFeeRevenue({ ...flat, ratePct: 10 }, 'closed_success', {
      debtAmountSatang: null,
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

  it('closed_fail + ยอดกรณีไม่สำเร็จ ฿300 → ฿300 เท่านั้น ส่วน rate/base ไม่ได้เลย', () => {
    const result = calculateServiceFeeRevenue({ ...hybrid, failFeeSatang: 30_000 }, 'closed_fail', values)
    expect(result.grossSatang).toBe(30_000)
    expect(result.baseComponentSatang).toBe(0)
    expect(result.rateComponentSatang).toBe(0)
  })

  it('closed_fail + ไม่เก็บกรณีไม่สำเร็จ → 0', () => {
    expect(calculateServiceFeeRevenue(hybrid, 'closed_fail', values).grossSatang).toBe(0)
  })

  it('closed_success ไม่ขึ้นกับยอดกรณีไม่สำเร็จ', () => {
    const withFail = calculateServiceFeeRevenue({ ...hybrid, failFeeSatang: 30_000 }, 'closed_success', values)
    expect(withFail.grossSatang).toBe(350_000)
  })
})

describe('ยามและคำอธิบายสูตร', () => {
  it('เศษสตางค์ปัดครึ่งขึ้น — ฿123.45 × 7% = 864 สตางค์', () => {
    const result = calculateServiceFeeRevenue(snapshot({ ratePct: 7 }), 'closed_success', {
      debtAmountSatang: 12_345,
    })
    expect(result.grossSatang).toBe(864)
  })

  it('base/rate/ฐานคำนวณติดลบหรือเกินช่วง = ล้ม', () => {
    expect(() => calculateServiceFeeRevenue(snapshot({ baseSatang: -1, model: 'FLAT' }), 'closed_success', values)).toThrow(
      RangeError,
    )
    expect(() => calculateServiceFeeRevenue(snapshot({ ratePct: 101 }), 'closed_success', values)).toThrow(RangeError)
    expect(() => calculateServiceFeeRevenue(snapshot({ failFeeSatang: -1 }), 'closed_fail', values)).toThrow(RangeError)
    expect(() =>
      calculateServiceFeeRevenue(snapshot(), 'closed_success', { debtAmountSatang: -5 }),
    ).toThrow(RangeError)
  })

  it('formula อธิบายที่มาของยอดให้ modal "ดูสูตร" (`16` §8)', () => {
    const result = calculateServiceFeeRevenue(snapshot({ model: 'HYBRID', baseSatang: 100_000 }), 'closed_success', values)
    expect(result.formula).toContain('model=HYBRID')
    expect(result.formula).toContain('มูลหนี้=5000000')
    expect(result.formula).toContain('10%')
  })
})

describe('formula กรณีไม่สำเร็จ', () => {
  it('บอกยอดกรณีไม่สำเร็จ หรือ "ไม่เก็บ"', () => {
    expect(calculateServiceFeeRevenue(snapshot({ failFeeSatang: 30_000 }), 'closed_fail', values).formula).toContain(
      'fail_fee=30000',
    )
    expect(calculateServiceFeeRevenue(snapshot(), 'closed_fail', values).formula).toContain('fail_fee=ไม่เก็บ')
  })
})

describe('มติ U165 — ข้อมูลเดิม (charge_on_fail) หลัง migrate ได้รายได้เท่าเดิมทุกบาท', () => {
  /** สูตรเดิมก่อนมติ (สำเนาไว้เทียบเท่านั้น) — base ได้เมื่อสำเร็จหรือ charge_on_fail · rate ได้เฉพาะสำเร็จ */
  function legacyGross(
    model: ServiceFeeSnapshot['model'],
    chargeOnFail: boolean,
    baseSatang: number,
    ratePct: number,
    outcome: 'closed_success' | 'closed_fail',
    debt: number,
  ): number {
    const isSuccess = outcome === 'closed_success'
    const base = model !== 'SUCCESS_FEE' && (isSuccess || chargeOnFail) ? baseSatang : 0
    const rate = model !== 'FLAT' && isSuccess ? Math.round((debt * ratePct) / 100) : 0
    return base + rate
  }

  /** เงื่อนไขเกิดรายได้กรณีไม่สำเร็จแบบเดิม */
  function legacyChargesOnFail(model: ServiceFeeSnapshot['model'], chargeOnFail: boolean | null): boolean {
    return model !== 'SUCCESS_FEE' && chargeOnFail === true
  }

  const models = ['SUCCESS_FEE', 'FLAT', 'HYBRID'] as const
  const outcomes = ['closed_success', 'closed_fail'] as const
  const flags = [true, false, null] as const

  for (const model of models) {
    for (const chargeOnFail of flags) {
      for (const outcome of outcomes) {
        it(`${model} · charge_on_fail=${String(chargeOnFail)} · ${outcome}`, () => {
          const baseSatang = model === 'SUCCESS_FEE' ? 0 : 749_000
          const ratePct = model === 'FLAT' ? 0 : 3
          const debt = 2_345_678
          const failFeeSatang = failFeeFromLegacyChargeOnFail(model, chargeOnFail, baseSatang)
          const next = calculateServiceFeeRevenue(
            { model, baseSatang, ratePct, basis: model === 'FLAT' ? null : 'debt_amount', failFeeSatang },
            outcome,
            { debtAmountSatang: debt },
          )
          expect(next.grossSatang).toBe(legacyGross(model, chargeOnFail === true, baseSatang, ratePct, outcome, debt))
          // เงื่อนไข "เกิดรายได้กรณีไม่สำเร็จ" ของ trigger ต้องตรงของเดิมด้วย
          expect(failFeeSatang !== null).toBe(legacyChargesOnFail(model, chargeOnFail))
        })
      }
    }
  }
})
