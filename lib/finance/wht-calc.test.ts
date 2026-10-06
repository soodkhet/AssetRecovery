import { describe, expect, it } from 'vitest'
import {
  calculatePayeeBatchWht,
  calculateCustomerWithheldWht,
  calculateWht,
  calculateWhtForPayee,
  estimateCustomerWhtForBilling,
  isPayerBorneWhtCondition,
  payoutItemTaxSplit,
  sumPayoutTaxSplit,
  resolveWhtRate,
  whtGrossUp,
  whtTaxForCondition,
} from '@/lib/finance/wht-calc'
import { DEFAULT_WHT_MIN_THRESHOLD_SATANG } from '@/lib/settings/tax-profile'
import { isSettingsError } from '@/lib/settings/errors'

/**
 * `22` §6.9 · `18` §6.3 · `13` §6.4 — WHT ฝั่งจ่าย
 * กติกาที่ต้องมีเทสต์คุมเสมอ: **Payee ชนะ Plan** · fallback มี warning · ฐาน before_vat · เกณฑ์ 1,000 บาท
 */

const payeeProfile = { whtPct: 1, whtBasis: 'before_vat' as const, whtMinThresholdSatang: 100_000 }

describe('§6.3 ของ `18` — ลำดับความสำคัญของอัตรา', () => {
  it('Payee มี Tax Profile → ใช้อัตราของ Payee ชนะ Plan เสมอ (1% ชนะ 3%)', () => {
    const rate = resolveWhtRate({ payeeTaxProfile: payeeProfile, planWhtPct: 3 })!
    expect(rate.whtPct).toBe(1)
    expect(rate.source).toBe('payee')
    expect(rate.warning).toBeUndefined()
  })

  it('Payee ไม่มี Tax Profile → fallback Plan **พร้อม warning** (ห้ามเงียบ)', () => {
    const rate = resolveWhtRate({ payeeTaxProfile: null, planWhtPct: 3 })!
    expect(rate.whtPct).toBe(3)
    expect(rate.source).toBe('plan')
    expect(rate.warning).toContain('Tax Profile')
  })

  it('fallback ใช้ฐาน before_vat และเกณฑ์มาตรฐาน 1,000 บาท (Plan ไม่มีสองค่านี้)', () => {
    const rate = resolveWhtRate({ payeeTaxProfile: null, planWhtPct: 3 })!
    expect(rate.whtBasis).toBe('before_vat')
    expect(rate.minThresholdSatang).toBe(DEFAULT_WHT_MIN_THRESHOLD_SATANG)
    expect(rate.minThresholdSatang).toBe(100_000)
  })

  it('ไม่มีอัตราเลย ⇒ `null` (ไม่ throw · ไม่เดา 3% — มติ PO U121)', () => {
    expect(resolveWhtRate({ payeeTaxProfile: null, planWhtPct: null })).toBeNull()
    expect(resolveWhtRate({ payeeTaxProfile: null, typeDefaultTaxProfile: null, planWhtPct: null })).toBeNull()
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
    })!
    expect(result.rate.source).toBe('payee')
    expect(result.whtPctUsed).toBe(1)
    expect(result.whtSatang).toBe(10_000)
    expect(result.netSatang).toBe(990_000)
  })

  it('fallback Plan → ยอดถูกและ warning ติดมาด้วย', () => {
    const result = calculateWhtForPayee({
      grossSatang: 1_000_000,
      source: { payeeTaxProfile: null, planWhtPct: 3 },
    })!
    expect(result.whtSatang).toBe(30_000)
    expect(result.rate.warning).toBeDefined()
  })

  it('ไม่มีอัตราเลย ⇒ `null` แทนการ throw (มติ PO U121)', () => {
    expect(calculateWhtForPayee({ grossSatang: 1_000_000, source: { payeeTaxProfile: null, planWhtPct: null } })).toBeNull()
  })
})

describe('calculateCustomerWithheldWht — A1 ลูกค้าหักภาษีจากเราก่อนโอน (มติ PO 2026-08-12)', () => {
  it('ฐานเป็นยอด **ก่อน VAT** เสมอ (Rule 01) — บิล 8,025 บาท (7,500 + VAT 525) หัก 3% = 225 บาท', () => {
    expect(calculateCustomerWithheldWht({ amountBeforeVatSatang: 750_000, whtPct: 3 })).toBe(22_500)
  })

  it('บริษัทที่ไม่หักภาษีก่อนโอน (`null`) หรืออัตรา 0 ⇒ 0 — ไม่มียอดทางเลือกให้จับคู่', () => {
    expect(calculateCustomerWithheldWht({ amountBeforeVatSatang: 750_000, whtPct: null })).toBe(0)
    expect(calculateCustomerWithheldWht({ amountBeforeVatSatang: 750_000, whtPct: 0 })).toBe(0)
  })

  it('ไม่มีเกณฑ์ขั้นต่ำแบบ §6.9 — ยอดเล็กก็ยังคิดตามอัตรา (เกณฑ์ 1,000 ผูกกับ tax_profile ฝั่งเรา)', () => {
    expect(calculateCustomerWithheldWht({ amountBeforeVatSatang: 50_000, whtPct: 3 })).toBe(1_500)
  })

  it('ปัดเศษเป็นสตางค์เต็มจำนวนด้วยตัวช่วยกลาง — ห้ามมีทศนิยมสตางค์หลุดออกไป', () => {
    const result = calculateCustomerWithheldWht({ amountBeforeVatSatang: 33_333, whtPct: 3 })
    expect(Number.isInteger(result)).toBe(true)
    expect(result).toBe(1_000)
  })

  it('ยอดติดลบ / อัตรานอกช่วง ⇒ โยนทิ้ง ไม่ปล่อยค่าเพี้ยนลงฐาน', () => {
    expect(() => calculateCustomerWithheldWht({ amountBeforeVatSatang: -1, whtPct: 3 })).toThrow()
    expect(() => calculateCustomerWithheldWht({ amountBeforeVatSatang: 750_000, whtPct: 120 })).toThrow()
  })
})

describe('estimateCustomerWhtForBilling — BUG-165 ภาษีที่ลูกค้าจะหัก (ประมาณ) บนรอบวางบิล', () => {
  it('รอบร่าง 1,000 + VAT 70 · บริษัทหัก 3% ⇒ ประมาณ 30 · คาดว่าจะได้รับ 1,040', () => {
    expect(
      estimateCustomerWhtForBilling({ amountBeforeVatSatang: 100_000, totalSatang: 107_000, recordedWhtSatang: 0, whtPct: 3 }),
    ).toEqual({ whtSatang: 3_000, isEstimate: true, expectedReceiptSatang: 104_000 })
  })

  it('บันทึกยอดหักจริงแล้ว ⇒ ใช้ยอดจริง ไม่ใช่ประมาณ', () => {
    expect(
      estimateCustomerWhtForBilling({ amountBeforeVatSatang: 100_000, totalSatang: 107_000, recordedWhtSatang: 2_000, whtPct: 3 }),
    ).toEqual({ whtSatang: 2_000, isEstimate: false, expectedReceiptSatang: 105_000 })
  })

  it('บริษัทไม่หัก ⇒ 0 · ยอดที่คาดว่าจะได้รับ = ยอดเต็ม', () => {
    expect(
      estimateCustomerWhtForBilling({ amountBeforeVatSatang: 100_000, totalSatang: 107_000, recordedWhtSatang: 0, whtPct: null }),
    ).toEqual({ whtSatang: 0, isEstimate: true, expectedReceiptSatang: 107_000 })
  })
})

describe('§6.9 เกณฑ์ขั้นต่ำต่อ payee ต่อรอบจ่าย (มติ PO 03/10/2569 — UAT Q5, BUG-014)', () => {
  const profile3 = { whtPct: 3, whtBasis: 'before_vat' as const, whtMinThresholdSatang: 100_000 }
  const item = (grossSatang: number, planWhtPct: number | null = 5) => ({
    grossSatang,
    source: { payeeTaxProfile: profile3, planWhtPct },
  })

  it('3 รายการ × ฿600 อัตรา 3% → ฐานรวม ฿1,800 ถึงเกณฑ์ → หักรวม ฿54 (รายการละ ฿18)', () => {
    const result = calculatePayeeBatchWht([item(60_000), item(60_000), item(60_000)])
    expect(result.belowThreshold).toBe(false)
    expect(result.totalBaseSatang).toBe(180_000)
    expect(result.totalWhtSatang).toBe(5_400)
    expect(result.lines.map((line) => line.whtSatang)).toEqual([1_800, 1_800, 1_800])
    expect(result.lines.map((line) => line.netSatang)).toEqual([58_200, 58_200, 58_200])
  })

  it('ฐานรวมต่ำกว่าเกณฑ์ (฿350 + ฿350 = ฿700) → ไม่หักทุกรายการ', () => {
    const result = calculatePayeeBatchWht([item(35_000), item(35_000)])
    expect(result.belowThreshold).toBe(true)
    expect(result.totalWhtSatang).toBe(0)
    expect(result.lines.every((line) => line.whtSatang === 0 && line.netSatang === 35_000)).toBe(true)
  })

  it('ฐานรวมเท่าเกณฑ์พอดี (฿1,000) → หัก (เกณฑ์คือ "ต่ำกว่า" จึงไม่หัก)', () => {
    expect(calculatePayeeBatchWht([item(50_000), item(50_000)]).totalWhtSatang).toBe(3_000)
  })

  it('รายการเดียว = ผลเท่ากับ calculateWhtForPayee() เดิม (golden OUT-1: ฿5,500 × 3% = ฿165)', () => {
    const batch = calculatePayeeBatchWht([item(550_000)])
    const single = calculateWhtForPayee({ grossSatang: 550_000, source: item(550_000).source })!
    expect(batch.lines[0]).toEqual({
      ...single,
      includedInBase: true,
      incomeCategory: 'sec_40_8',
      // U105 — ไม่ระบุเงื่อนไข = (1) หัก ณ ที่จ่าย ⇒ gross ของรายการรอบจ่าย = ยอดรายการเดิม
      payoutGrossSatang: 550_000,
      whtCondition: 'withhold',
      rateMissing: false,
    })
    expect(batch.totalWhtSatang).toBe(16_500)
  })

  it('กระจายเศษไม่หาย: ฿333.33 × 3 อัตรา 3% → รวม = pct ของฐานรวม และ net = gross − wht ทุกแถว', () => {
    const result = calculatePayeeBatchWht([item(33_333), item(33_333), item(33_334)])
    expect(result.totalWhtSatang).toBe(3_000) // 100,000 × 3% ปัดครั้งเดียว
    expect(result.lines.reduce((sum, line) => sum + line.whtSatang, 0)).toBe(result.totalWhtSatang)
    for (const line of result.lines) expect(line.netSatang + line.whtSatang).toBe(line.baseSatang)
    expect(result.lines.map((line) => line.whtSatang)).toEqual([1_000, 1_000, 1_000])
  })

  it('เศษแจกให้รายการที่เศษมากสุดก่อน (เสมอกัน = รายการแรก) — 7 สตางค์แบ่ง 3 ส่วนเท่ากัน → 3/2/2', () => {
    // ฐานรวม 233 สตางค์ × 3% = 6.99 → 7 · เกณฑ์ 0 เพื่อให้หัก
    const tiny = { whtPct: 3, whtBasis: 'before_vat' as const, whtMinThresholdSatang: 0 }
    const result = calculatePayeeBatchWht(
      [78, 78, 77].map((grossSatang) => ({ grossSatang, source: { payeeTaxProfile: tiny, planWhtPct: null } })),
    )
    expect(result.totalWhtSatang).toBe(7)
    expect(result.lines.map((line) => line.whtSatang)).toEqual([3, 2, 2])
  })

  it('payee ไม่มี Tax Profile + แผนต่างอัตรา → เทียบเกณฑ์จากฐานรวม แล้วคิดแยกตามอัตรา พร้อม warning', () => {
    const result = calculatePayeeBatchWht([
      { grossSatang: 60_000, source: { payeeTaxProfile: null, planWhtPct: 3 } },
      { grossSatang: 60_000, source: { payeeTaxProfile: null, planWhtPct: 5 } },
    ])
    expect(result.belowThreshold).toBe(false)
    expect(result.lines.map((line) => line.whtSatang)).toEqual([1_800, 3_000])
    expect(result.lines.every((line) => line.rate.source === 'plan' && line.rate.warning !== undefined)).toBe(true)
  })

  it('ไม่มีรายการ → ศูนย์ทั้งหมด', () => {
    expect(calculatePayeeBatchWht([])).toEqual({
      lines: [],
      totalBaseSatang: 0,
      totalWhtSatang: 0,
      belowThreshold: true,
      incomeCategory: 'sec_40_8',
      rateMissing: false,
    })
  })

  it('เกณฑ์ขั้นต่ำไม่เท่ากันในชุดเดียว (ปน payee) → ล้ม ไม่เดา', () => {
    expect(() =>
      calculatePayeeBatchWht([
        item(60_000),
        { grossSatang: 60_000, source: { payeeTaxProfile: null, planWhtPct: 3 } },
        { grossSatang: 60_000, source: { payeeTaxProfile: { ...profile3, whtMinThresholdSatang: 50_000 }, planWhtPct: 3 } },
      ]),
    ).toThrow(RangeError)
  })
})

describe('§6.9.2 เงื่อนไขการหัก (1)/(2)/(3) — ทบยอดภาษีที่ออกให้ (มติ PO 06/10/2569 U105)', () => {
  const tax3 = { payeeTaxProfile: { whtPct: 3, whtBasis: 'before_vat' as const, whtMinThresholdSatang: 100_000 }, planWhtPct: 3 }

  it('ตัวเลขทองคำ: เงินได้ ฿10,000 อัตรา 3%', () => {
    // (1) หัก ณ ที่จ่าย — ภาษี 300.00 ผู้รับได้ 9,700.00
    expect(whtGrossUp({ incomeSatang: 1_000_000, whtPct: 3, condition: 'withhold' })).toEqual({
      whtSatang: 30_000,
      certificateIncomeSatang: 1_000_000,
      payeeReceivesSatang: 970_000,
      companyCostSatang: 1_000_000,
      whtPaidByPayerSatang: 0,
    })
    // (2) ออกให้ตลอดไป — ภาษี = 10,000 × 3 ÷ 97 = 309.28 · เงินได้บนใบ 10,309.28 · ผู้รับได้เต็ม
    expect(whtGrossUp({ incomeSatang: 1_000_000, whtPct: 3, condition: 'pay_always' })).toEqual({
      whtSatang: 30_928,
      certificateIncomeSatang: 1_030_928,
      payeeReceivesSatang: 1_000_000,
      companyCostSatang: 1_030_928,
      whtPaidByPayerSatang: 30_928,
    })
    // (3) ออกให้ครั้งเดียว — ภาษี 300.00 · เงินได้บนใบ 10,300.00 · ผู้รับได้เต็ม
    expect(whtGrossUp({ incomeSatang: 1_000_000, whtPct: 3, condition: 'pay_once' })).toEqual({
      whtSatang: 30_000,
      certificateIncomeSatang: 1_030_000,
      payeeReceivesSatang: 1_000_000,
      companyCostSatang: 1_030_000,
      whtPaidByPayerSatang: 30_000,
    })
  })

  it('(2) ทบยอดถูกต้องตามนิยาม: ภาษี = อัตรา × (เงินได้ + ภาษี) (ปัดครึ่งขึ้นเป็นสตางค์ ห่างไม่เกิน 1 สตางค์)', () => {
    for (const [income, pct] of [
      [1_000_000, 3],
      [123_457, 5],
      [99_999_999, 1.5],
      [500_000, 0.75],
      [1, 3],
    ] as const) {
      const tax = whtTaxForCondition(income, pct, 'pay_always')
      // ภาษีของ "เงินได้ทบยอด" คิดด้วยอัตราปกติต้องได้ภาษีเดิม (ต่างได้ไม่เกินเศษปัด 1 สตางค์)
      expect(Math.abs(Math.round(((income + tax) * pct) / 100) - tax)).toBeLessThanOrEqual(1)
    }
    // ปัดครึ่งขึ้น: 10,000 × 3 / 97 = 309.2783… → 309.28 · 1 สตางค์ × 3/97 = 0.03 → 0
    expect(whtTaxForCondition(1_000_000, 3, 'pay_always')).toBe(30_928)
    expect(whtTaxForCondition(1, 3, 'pay_always')).toBe(0)
    // อัตรา 0% ⇒ 0 ทุกเงื่อนไข
    expect(whtTaxForCondition(1_000_000, 0, 'pay_always')).toBe(0)
    // ทบยอดที่อัตรา 100% ไม่มีความหมาย (ตัวหารเป็นศูนย์)
    expect(() => whtTaxForCondition(1_000_000, 100, 'pay_always')).toThrow(RangeError)
    // (1)/(3)/ไม่ระบุ = สูตรเดิม
    expect(whtTaxForCondition(1_000_000, 3, 'pay_once')).toBe(30_000)
    expect(whtTaxForCondition(1_000_000, 3, null)).toBe(30_000)
  })

  it('isPayerBorneWhtCondition: (2)/(3) = ผู้จ่ายออกให้ · (1)/null/undefined = ไม่ใช่', () => {
    expect(isPayerBorneWhtCondition('pay_always')).toBe(true)
    expect(isPayerBorneWhtCondition('pay_once')).toBe(true)
    expect(isPayerBorneWhtCondition('withhold')).toBe(false)
    expect(isPayerBorneWhtCondition(null)).toBe(false)
    expect(isPayerBorneWhtCondition(undefined)).toBe(false)
  })

  it('รอบจ่าย (2): ภาษีทบยอดต่อกลุ่ม → กระจาย largest remainder · ผู้รับได้ยอดรายการเต็ม · gross = ยอด + ภาษี · net = gross − wht', () => {
    const result = calculatePayeeBatchWht(
      [
        { grossSatang: 600_000, source: tax3 },
        { grossSatang: 400_000, source: tax3 },
      ],
      { condition: 'pay_always' },
    )
    expect(result.totalWhtSatang).toBe(30_928)
    expect(result.lines.map((line) => line.whtSatang)).toEqual([18_557, 12_371])
    expect(result.lines.map((line) => line.netSatang)).toEqual([600_000, 400_000])
    expect(result.lines.map((line) => line.payoutGrossSatang)).toEqual([618_557, 412_371])
    for (const line of result.lines) {
      expect(line.netSatang).toBe(line.payoutGrossSatang - line.whtSatang)
      expect(line.whtCondition).toBe('pay_always')
    }
    // ผลรวมเงินได้บนใบ 50 ทวิ = 10,309.28
    expect(result.lines.reduce((sum, line) => sum + line.payoutGrossSatang, 0)).toBe(1_030_928)
  })

  it('รอบจ่าย (3): ภาษีอัตราปกติ แต่ไม่หักจากผู้รับ · (1): หักตามเดิม', () => {
    const once = calculatePayeeBatchWht([{ grossSatang: 1_000_000, source: tax3 }], { condition: 'pay_once' })
    expect(once.lines[0]).toMatchObject({ whtSatang: 30_000, netSatang: 1_000_000, payoutGrossSatang: 1_030_000 })
    const withhold = calculatePayeeBatchWht([{ grossSatang: 1_000_000, source: tax3 }], { condition: 'withhold' })
    expect(withhold.lines[0]).toMatchObject({ whtSatang: 30_000, netSatang: 970_000, payoutGrossSatang: 1_000_000 })
  })

  it('เกณฑ์ ฿1,000 เทียบกับเงินได้ก่อนบวกภาษี: ฿990 แบบ (2) ⇒ ไม่หัก (แม้ 990 + ภาษีจะเกิน 1,000) · รายการนอกฐานไม่บวกภาษี', () => {
    const below = calculatePayeeBatchWht([{ grossSatang: 99_000, source: tax3 }], { condition: 'pay_always' })
    expect(below.belowThreshold).toBe(true)
    expect(below.lines[0]).toMatchObject({ whtSatang: 0, netSatang: 99_000, payoutGrossSatang: 99_000 })

    const mixed = calculatePayeeBatchWht(
      [
        { grossSatang: 1_000_000, source: tax3 },
        { grossSatang: 60_000, source: tax3, includedInBase: false },
      ],
      { condition: 'pay_always' },
    )
    expect(mixed.lines[1]).toMatchObject({ whtSatang: 0, netSatang: 60_000, payoutGrossSatang: 60_000 })
    expect(mixed.lines[0]).toMatchObject({ whtSatang: 30_928, netSatang: 1_000_000 })
  })

  it('payoutItemTaxSplit: แยกค่าตอบแทน/ภาษีที่หัก/ภาษีที่บริษัทออกให้ จาก snapshot โดยไม่คิดใหม่', () => {
    expect(
      payoutItemTaxSplit({ grossSatang: 1_030_928, whtSatang: 30_928, netSatang: 1_000_000, whtCondition: 'pay_always' }),
    ).toEqual({ compensationSatang: 1_000_000, whtWithheldSatang: 0, whtPaidByPayerSatang: 30_928 })
    expect(
      payoutItemTaxSplit({ grossSatang: 1_000_000, whtSatang: 30_000, netSatang: 970_000, whtCondition: 'withhold' }),
    ).toEqual({ compensationSatang: 1_000_000, whtWithheldSatang: 30_000, whtPaidByPayerSatang: 0 })
    // รอบเก่า (snapshot NULL) = หัก ณ ที่จ่าย
    expect(payoutItemTaxSplit({ grossSatang: 50_000, whtSatang: 0, netSatang: 50_000, whtCondition: null })).toEqual({
      compensationSatang: 50_000,
      whtWithheldSatang: 0,
      whtPaidByPayerSatang: 0,
    })
  })

  it('sumPayoutTaxSplit (มติ PO U109): รวมยอดแยกของ (1)/(2)/(3) ปนกัน — ค่าตอบแทน + ภาษีออกให้ = Σ gross · Σ gross − ภาษีทั้งสอง = Σ net', () => {
    const items = [
      { grossSatang: 1_000_000, whtSatang: 30_000, netSatang: 970_000, whtCondition: 'withhold' as const },
      { grossSatang: 1_030_928, whtSatang: 30_928, netSatang: 1_000_000, whtCondition: 'pay_always' as const },
      { grossSatang: 1_030_000, whtSatang: 30_000, netSatang: 1_000_000, whtCondition: 'pay_once' as const },
    ]
    const total = sumPayoutTaxSplit(items)
    expect(total).toEqual({ compensationSatang: 3_000_000, whtWithheldSatang: 30_000, whtPaidByPayerSatang: 60_928 })
    const gross = items.reduce((sum, item) => sum + item.grossSatang, 0)
    const net = items.reduce((sum, item) => sum + item.netSatang, 0)
    expect(total.compensationSatang + total.whtPaidByPayerSatang).toBe(gross)
    expect(gross - total.whtWithheldSatang - total.whtPaidByPayerSatang).toBe(net)
    expect(sumPayoutTaxSplit([])).toEqual({ compensationSatang: 0, whtWithheldSatang: 0, whtPaidByPayerSatang: 0 })
  })
})

describe('ลำดับ resolve อัตรา: รายคน → ค่าเริ่มต้นตามประเภท → แผน → ไม่มีอัตรา (มติ PO 06/10/2569 U121)', () => {
  const personal = { whtPct: 1, whtBasis: 'before_vat' as const, whtMinThresholdSatang: 100_000 }
  const typeDefault = { whtPct: 3, whtBasis: 'before_vat' as const, whtMinThresholdSatang: 100_000 }

  it('1. ตั้งรายคน ชนะค่าเริ่มต้นตามประเภทและแผน', () => {
    const rate = resolveWhtRate({ payeeTaxProfile: personal, typeDefaultTaxProfile: typeDefault, planWhtPct: 5 })
    expect(rate).toEqual({ whtPct: 1, whtBasis: 'before_vat', minThresholdSatang: 100_000, source: 'payee' })
  })

  it('2. ไม่มีรายคน ⇒ ค่าเริ่มต้นตามประเภท (นับเป็นฝั่ง payee — ชนะแผน · ไม่มีคำเตือน)', () => {
    const rate = resolveWhtRate({ payeeTaxProfile: null, typeDefaultTaxProfile: typeDefault, planWhtPct: 5 })
    expect(rate).toEqual({ whtPct: 3, whtBasis: 'before_vat', minThresholdSatang: 100_000, source: 'type_default' })
  })

  it('2b. ค่าเริ่มต้นตามประเภทใช้ได้แม้รายการไม่มีแผน (เบิกเอง/ค่าที่พัก)', () => {
    expect(resolveWhtRate({ payeeTaxProfile: null, typeDefaultTaxProfile: typeDefault, planWhtPct: null })?.source).toBe(
      'type_default',
    )
  })

  it('3. ไม่มีรายคน/ค่าเริ่มต้น ⇒ แผน + คำเตือน (พฤติกรรมเดิม)', () => {
    const rate = resolveWhtRate({ payeeTaxProfile: null, typeDefaultTaxProfile: null, planWhtPct: 5 })
    expect(rate?.source).toBe('plan')
    expect(rate?.warning).toBeDefined()
  })

  it('4. ไม่มีเลย ⇒ null', () => {
    expect(resolveWhtRate({ payeeTaxProfile: null, typeDefaultTaxProfile: null, planWhtPct: null })).toBeNull()
  })

  it('ค่าเริ่มต้นตามประเภทที่อัตราผิดช่วง ⇒ INVALID_WHT_RATE (ตรวจเหมือน Tax Profile รายคน)', () => {
    try {
      resolveWhtRate({ payeeTaxProfile: null, typeDefaultTaxProfile: { ...typeDefault, whtPct: 120 }, planWhtPct: null })
      expect.unreachable('ต้องโยน INVALID_WHT_RATE')
    } catch (error) {
      expect(isSettingsError(error) && error.code).toBe('INVALID_WHT_RATE')
    }
  })

  it('batch: ค่าเริ่มต้นตามประเภทคิดภาษีจริง ฿10,000 × 3% = ฿300 · ที่มา type_default', () => {
    const result = calculatePayeeBatchWht([
      { grossSatang: 1_000_000, source: { payeeTaxProfile: null, typeDefaultTaxProfile: typeDefault, planWhtPct: null } },
    ])
    expect(result.totalWhtSatang).toBe(30_000)
    expect(result.rateMissing).toBe(false)
    expect(result.lines[0]?.rate.source).toBe('type_default')
  })
})

describe('รายการนอกฐาน WHT / ไม่มีอัตรา — ไม่ล้ม (มติ PO 06/10/2569 U121 · บั๊ก RangeError → 500)', () => {
  const noRate = { payeeTaxProfile: null, planWhtPct: null }

  it('รายการนอกฐาน (ค่าที่พัก/เบิกเอง) ของผู้รับที่ไม่มี Tax Profile และไม่มีแผน ⇒ ไม่ resolve อัตรา · จ่ายเต็ม', () => {
    const result = calculatePayeeBatchWht([{ grossSatang: 160_000, includedInBase: false, source: noRate }])
    expect(result.rateMissing).toBe(false)
    expect(result.totalWhtSatang).toBe(0)
    expect(result.lines[0]).toMatchObject({
      whtSatang: 0,
      netSatang: 160_000,
      includedInBase: false,
      rateMissing: false,
      whtPctUsed: 0,
    })
    expect(result.lines[0]?.rate.source).toBe('none')
  })

  it('รายการนอกฐานไม่ resolve แม้มีอัตรา (อัตราผิดช่วงก็ไม่ถูกตรวจ เพราะไม่ได้ใช้)', () => {
    const broken = { payeeTaxProfile: { whtPct: 120, whtBasis: 'before_vat' as const, whtMinThresholdSatang: 0 }, planWhtPct: null }
    expect(calculatePayeeBatchWht([{ grossSatang: 1_000, includedInBase: false, source: broken }]).totalWhtSatang).toBe(0)
  })

  it('รายการในฐานแต่ไม่มีอัตรา ⇒ `rateMissing` ภาษี 0 ไม่นับฐาน (ไม่ throw)', () => {
    const result = calculatePayeeBatchWht([{ grossSatang: 500_000, source: noRate }])
    expect(result.rateMissing).toBe(true)
    expect(result.totalBaseSatang).toBe(0)
    expect(result.totalWhtSatang).toBe(0)
    expect(result.lines[0]).toMatchObject({ rateMissing: true, includedInBase: true, whtSatang: 0, netSatang: 500_000 })
  })

  it('ปนกัน: รายการมีแผน + รายการไม่มีอัตรา ⇒ รายการที่มีอัตราคิดตามปกติ · ธง rateMissing ระดับผู้รับ', () => {
    const result = calculatePayeeBatchWht([
      { grossSatang: 200_000, source: { payeeTaxProfile: null, planWhtPct: 3 } },
      { grossSatang: 50_000, source: noRate },
    ])
    expect(result.rateMissing).toBe(true)
    expect(result.totalBaseSatang).toBe(200_000)
    expect(result.lines.map((line) => line.whtSatang)).toEqual([6_000, 0])
    expect(result.lines.map((line) => line.rateMissing)).toEqual([false, true])
  })
})
