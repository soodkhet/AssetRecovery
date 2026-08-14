import { describe, expect, it } from 'vitest'
import { calculateProjectedRevenue, type ProjectedRevenueTemplate } from '@/lib/cases/projected-revenue'

/**
 * `38` §20 — Projected revenue 3 โมเดล (ตัวเลขในสเปคเป็น **บาท** ที่นี่เทียบเป็น **สตางค์**)
 * ตัวเลขทุกตัวต้องเป็นจำนวนเต็มสตางค์ (Rule 01)
 */

const FLAT: ProjectedRevenueTemplate = {
  model: 'FLAT',
  baseSatang: 150_000, // 1,500 บาท
  ratePct: 0,
  basis: null,
  templateId: 'tpl-flat',
  templateVersion: 1,
}

const SUCCESS_FEE: ProjectedRevenueTemplate = {
  model: 'SUCCESS_FEE',
  baseSatang: 0,
  ratePct: 20,
  basis: 'debt_amount',
  templateId: 'tpl-success',
  templateVersion: 1,
}

const HYBRID: ProjectedRevenueTemplate = {
  model: 'HYBRID',
  baseSatang: 50_000, // 500 บาท
  ratePct: 15,
  basis: 'debt_amount',
  templateId: 'tpl-hybrid',
  templateVersion: 2,
}

const DEBT_10K = { debtAmountSatang: 1_000_000, assetValueSatang: 800_000 }

describe('ประมาณการรายได้ (`38` §6.5)', () => {
  it('FLAT = base ไม่ขึ้นกับมูลหนี้', () => {
    expect(calculateProjectedRevenue(FLAT, DEBT_10K).amountSatang).toBe(150_000)
    expect(calculateProjectedRevenue(FLAT, { debtAmountSatang: null, assetValueSatang: null }).amountSatang).toBe(
      150_000,
    )
  })

  it('SUCCESS_FEE = มูลหนี้ × rate (10,000 × 20% = 2,000 บาท)', () => {
    expect(calculateProjectedRevenue(SUCCESS_FEE, DEBT_10K).amountSatang).toBe(200_000)
  })

  it('HYBRID = base + (มูลหนี้ × rate) (500 + 10,000×15% = 2,000 บาท)', () => {
    expect(calculateProjectedRevenue(HYBRID, DEBT_10K).amountSatang).toBe(200_000)
  })

  it('basis = asset_value ใช้มูลค่าเครื่องแทนมูลหนี้ (`12` §6.1)', () => {
    const template = { ...SUCCESS_FEE, basis: 'asset_value' as const }
    expect(calculateProjectedRevenue(template, DEBT_10K).basisSatang).toBe(800_000)
    expect(calculateProjectedRevenue(template, DEBT_10K).amountSatang).toBe(160_000)
  })

  it('ยังไม่มีฐานคำนวณ → ยอด null + missingBasis (ห้ามเดาเป็น 0)', () => {
    const result = calculateProjectedRevenue(SUCCESS_FEE, { debtAmountSatang: null, assetValueSatang: null })
    expect(result.amountSatang).toBeNull()
    expect(result.missingBasis).toBe(true)
  })

  it('เป็น best-case 100% — ไม่คูณลด และไม่สนใจ charge_on_fail', () => {
    const chargeOnFailIrrelevant = calculateProjectedRevenue(HYBRID, DEBT_10K).amountSatang
    expect(chargeOnFailIrrelevant).toBe(HYBRID.baseSatang + 150_000)
  })

  it('ผลลัพธ์เป็นจำนวนเต็มสตางค์เสมอ แม้ rate มีทศนิยม', () => {
    const template = { ...SUCCESS_FEE, ratePct: 12.35 }
    const result = calculateProjectedRevenue(template, { debtAmountSatang: 999_999, assetValueSatang: null })
    expect(Number.isInteger(result.amountSatang)).toBe(true)
    expect(result.amountSatang).toBe(Math.round((999_999 * 12.35) / 100))
  })

  it('calculation_source อ้าง template/version ที่ใช้คำนวณ (`38` §6.4)', () => {
    const source = calculateProjectedRevenue(HYBRID, DEBT_10K).source
    expect(source).toContain('tpl-hybrid')
    expect(source).toContain('v2')
    expect(source).toContain('HYBRID')
  })
})
