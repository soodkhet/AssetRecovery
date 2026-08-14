import { describe, expect, it } from 'vitest'
import { isSettingsError } from '@/lib/settings/errors'
import {
  DEFAULT_WHT_MIN_THRESHOLD_SATANG,
  DEFAULT_WHT_PCT,
  assertWhtPctValid,
  normalizeTaxProfileValues,
  suggestedFilingForm,
  toTaxProfileAuditPayload,
  type TaxProfileValues,
} from '@/lib/settings/tax-profile'

/** `13` §6.4 · §10 `INVALID_WHT_RATE` · §14 "WHT 3% + เกณฑ์ขั้นต่ำ 1,000 บาท" */

const base: TaxProfileValues = {
  name: ' Outsource บุคคลธรรมดา ',
  whtPct: 3,
  whtBasis: 'before_vat',
  whtMinThresholdSatang: DEFAULT_WHT_MIN_THRESHOLD_SATANG,
  incomeType: ' ค่าจ้างทำของ มาตรา 40(8) ',
  filingForm: 'PND3',
}

describe('ค่ามาตรฐาน', () => {
  it('WHT มาตรฐาน 3% (`13` §6.4 — ตั้งได้ ห้าม hardcode ในสูตร)', () => {
    expect(DEFAULT_WHT_PCT).toBe(3)
  })

  it('เกณฑ์ขั้นต่ำ 1,000 บาท = 100,000 สตางค์ (Rule 01)', () => {
    expect(DEFAULT_WHT_MIN_THRESHOLD_SATANG).toBe(100_000)
  })

  it('ฐานหักมาตรฐานคือก่อน VAT', () => {
    expect(base.whtBasis).toBe('before_vat')
  })
})

describe('normalizeTaxProfileValues', () => {
  it('ตัดช่องว่างของชื่อและประเภทเงินได้', () => {
    const values = normalizeTaxProfileValues(base)
    expect(values.name).toBe('Outsource บุคคลธรรมดา')
    expect(values.incomeType).toBe('ค่าจ้างทำของ มาตรา 40(8)')
  })

  it('ไม่แตะตัวเลข (เงิน/อัตราต้องผ่านมาแล้วจาก Zod)', () => {
    expect(normalizeTaxProfileValues(base).whtMinThresholdSatang).toBe(100_000)
  })
})

describe('assertWhtPctValid', () => {
  it.each([0, 1, 3, 5, 100])('อัตรา %s%% ผ่าน', (pct) => {
    expect(() => assertWhtPctValid(pct)).not.toThrow()
  })

  it.each([-1, 100.01, Number.NaN, Number.POSITIVE_INFINITY])('อัตรา %s = INVALID_WHT_RATE', (pct) => {
    try {
      assertWhtPctValid(pct)
      expect.unreachable('ต้องโยน error')
    } catch (error) {
      expect(isSettingsError(error)).toBe(true)
      if (isSettingsError(error)) {
        expect(error.code).toBe('INVALID_WHT_RATE')
        expect(error.status).toBe(400)
      }
    }
  })
})

describe('suggestedFilingForm', () => {
  it('บุคคลธรรมดา = ภ.ง.ด.3 · นิติบุคคล = ภ.ง.ด.53 (`33` §6.1)', () => {
    expect(suggestedFilingForm('individual')).toBe('PND3')
    expect(suggestedFilingForm('corporate')).toBe('PND53')
  })
})

describe('toTaxProfileAuditPayload', () => {
  it('ใช้ชื่อคอลัมน์ snake_case ตามตารางจริง', () => {
    expect(toTaxProfileAuditPayload(normalizeTaxProfileValues(base))).toEqual({
      name: 'Outsource บุคคลธรรมดา',
      wht_pct: 3,
      wht_basis: 'before_vat',
      wht_min_threshold_satang: 100_000,
      income_type: 'ค่าจ้างทำของ มาตรา 40(8)',
      filing_form: 'PND3',
    })
  })
})
