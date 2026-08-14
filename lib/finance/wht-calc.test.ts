import { describe, expect, it } from 'vitest'
import { calculateWht, calculateWhtForPayee, resolveWhtRate } from '@/lib/finance/wht-calc'
import { DEFAULT_WHT_MIN_THRESHOLD_SATANG } from '@/lib/settings/tax-profile'
import { isSettingsError } from '@/lib/settings/errors'

/**
 * `22` §6.9 · `18` §6.3 · `13` §6.4 — WHT ฝั่งจ่าย
 * กติกาที่ต้องมีเทสต์คุมเสมอ: **Payee ชนะ Plan** · fallback มี warning · ฐาน before_vat · เกณฑ์ 1,000 บาท
 */

const payeeProfile = { whtPct: 1, whtBasis: 'before_vat' as const, whtMinThresholdSatang: 100_000 }

describe('§6.3 ของ `18` — ลำดับความสำคัญของอัตรา', () => {
  it('Payee มี Tax Profile → ใช้อัตราของ Payee ชนะ Plan เสมอ (1% ชนะ 3%)', () => {
    const rate = resolveWhtRate({ payeeTaxProfile: payeeProfile, planWhtPct: 3 })
    expect(rate.whtPct).toBe(1)
    expect(rate.source).toBe('payee')
    expect(rate.warning).toBeUndefined()
  })

  it('Payee ไม่มี Tax Profile → fallback Plan **พร้อม warning** (ห้ามเงียบ)', () => {
    const rate = resolveWhtRate({ payeeTaxProfile: null, planWhtPct: 3 })
    expect(rate.whtPct).toBe(3)
    expect(rate.source).toBe('plan')
    expect(rate.warning).toContain('Tax Profile')
  })

  it('fallback ใช้ฐาน before_vat และเกณฑ์มาตรฐาน 1,000 บาท (Plan ไม่มีสองค่านี้)', () => {
    const rate = resolveWhtRate({ payeeTaxProfile: null, planWhtPct: 3 })
    expect(rate.whtBasis).toBe('before_vat')
    expect(rate.minThresholdSatang).toBe(DEFAULT_WHT_MIN_THRESHOLD_SATANG)
    expect(rate.minThresholdSatang).toBe(100_000)
  })

  it('ไม่มีทั้งสองระดับ = ข้อมูลพัง ต้องล้ม ไม่เดา 3%', () => {
    expect(() => resolveWhtRate({ payeeTaxProfile: null, planWhtPct: null })).toThrow(RangeError)
  })

  it('อัตราที่ผิดช่วง = INVALID_WHT_RATE (`13` §10)', () => {
    try {
      resolveWhtRate({ payeeTaxProfile: { ...payeeProfile, whtPct: 120 }, planWhtPct: 3 })
      expect.unreachable('ต้องโยน INVALID_WHT_RATE')
    } catch (error) {
      expect(isSettingsError(error) && error.code).toBe('INVALID_WHT_RATE')
    }
  })
})

describe('§6.9 การคำนวณยอดหัก', () => {
  it('ฐาน ฿10,000 × 3% = ฿300 · net = ฿9,700', () => {
    const result = calculateWht({
      grossSatang: 1_000_000,
      whtPct: 3,
      whtBasis: 'before_vat',
      minThresholdSatang: 100_000,
    })
    expect(result.baseSatang).toBe(1_000_000)
    expect(result.whtSatang).toBe(30_000)
    expect(result.netSatang).toBe(970_000)
    expect(result.belowThreshold).toBe(false)
  })

  it('ฐานต่ำกว่าเกณฑ์ 1,000 บาท → ไม่หัก (net = gross)', () => {
    const result = calculateWht({
      grossSatang: 99_999,
      whtPct: 3,
      whtBasis: 'before_vat',
      minThresholdSatang: 100_000,
    })
    expect(result.whtSatang).toBe(0)
    expect(result.belowThreshold).toBe(true)
    expect(result.netSatang).toBe(99_999)
  })

  it('ฐานเท่ากับเกณฑ์พอดี → หัก (เงื่อนไขคือ "ต่ำกว่า" ไม่ใช่ "ไม่เกิน")', () => {
    const result = calculateWht({
      grossSatang: 100_000,
      whtPct: 3,
      whtBasis: 'before_vat',
      minThresholdSatang: 100_000,
    })
    expect(result.belowThreshold).toBe(false)
    expect(result.whtSatang).toBe(3_000)
  })

  it('ฐาน before_vat ไม่รวม VAT · ฐาน gross_amount รวม VAT', () => {
    const beforeVat = calculateWht({
      grossSatang: 1_000_000,
      vatSatang: 70_000,
      whtPct: 3,
      whtBasis: 'before_vat',
      minThresholdSatang: 100_000,
    })
    const grossAmount = calculateWht({
      grossSatang: 1_000_000,
      vatSatang: 70_000,
      whtPct: 3,
      whtBasis: 'gross_amount',
      minThresholdSatang: 100_000,
    })
    expect(beforeVat.baseSatang).toBe(1_000_000)
    expect(beforeVat.whtSatang).toBe(30_000)
    expect(grossAmount.baseSatang).toBe(1_070_000)
    expect(grossAmount.whtSatang).toBe(32_100)
  })

  it('net หักเฉพาะ WHT ไม่ลบ VAT ออกจากยอดโอน', () => {
    const result = calculateWht({
      grossSatang: 1_000_000,
      vatSatang: 70_000,
      whtPct: 3,
      whtBasis: 'gross_amount',
      minThresholdSatang: 100_000,
    })
    expect(result.netSatang).toBe(1_000_000 - 32_100)
  })

  it('เศษสตางค์ปัดครึ่งขึ้น — ฿123.45 × 3% = 370 สตางค์', () => {
    const result = calculateWht({
      grossSatang: 12_345,
      whtPct: 3,
      whtBasis: 'before_vat',
      minThresholdSatang: 0,
    })
    expect(result.whtSatang).toBe(370)
  })

  it('ยามค่าเข้า: ยอด/เกณฑ์ติดลบ หรืออัตราเกินช่วง = ล้ม', () => {
    expect(() =>
      calculateWht({ grossSatang: -1, whtPct: 3, whtBasis: 'before_vat', minThresholdSatang: 0 }),
    ).toThrow(RangeError)
    expect(() =>
      calculateWht({ grossSatang: 100, whtPct: 3, whtBasis: 'before_vat', minThresholdSatang: -1 }),
    ).toThrow(RangeError)
    expect(() =>
      calculateWht({ grossSatang: 100, whtPct: 101, whtBasis: 'before_vat', minThresholdSatang: 0 }),
    ).toThrow(RangeError)
  })
})

describe('calculateWhtForPayee — resolve + คิดยอดในก้าวเดียว (Phase 3.4 เรียกตัวนี้)', () => {
  it('Payee 1% ชนะ Plan 3% แล้วคิดยอดตามอัตราของ Payee', () => {
    const result = calculateWhtForPayee({
      grossSatang: 1_000_000,
      source: { payeeTaxProfile: payeeProfile, planWhtPct: 3 },
    })
    expect(result.rate.source).toBe('payee')
    expect(result.whtPctUsed).toBe(1)
    expect(result.whtSatang).toBe(10_000)
    expect(result.netSatang).toBe(990_000)
  })

  it('fallback Plan → ยอดถูกและ warning ติดมาด้วย', () => {
    const result = calculateWhtForPayee({
      grossSatang: 1_000_000,
      source: { payeeTaxProfile: null, planWhtPct: 3 },
    })
    expect(result.whtSatang).toBe(30_000)
    expect(result.rate.warning).toBeDefined()
  })
})
