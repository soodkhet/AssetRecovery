import { describe, expect, it } from 'vitest'
import { estimateAccruedWhtSatang, type AccruedWhtItem } from '@/lib/exports/accrued-expenses'
import { DEFAULT_WHT_POLICY } from '@/lib/settings/wht-policy'

/** `15_Accrued_Expenses.csv` — WHT ที่คาดว่าจะหัก ใช้สูตรรอบจ่ายเดิม (`22` §6.9) ไม่คิดสูตรเอง */

const profile3 = { whtPct: 3, whtBasis: 'before_vat' as const, whtMinThresholdSatang: 100_000 }

function item(overrides: Partial<AccruedWhtItem> = {}): AccruedWhtItem {
  return {
    payeeId: 'p-1',
    grossSatang: 60_000,
    expenseType: 'commission',
    batchWhtSatang: null,
    payeeType: 'individual',
    side: 'outsource',
    payeeTaxProfile: profile3,
    planWhtPct: 3,
    section402Pct: null,
    ...overrides,
  }
}

const policy = { ...DEFAULT_WHT_POLICY, baseExpenseTypes: ['commission', 'no_success_fee'] as const, incomeTypeMode: 'all_40_8' as const }

describe('estimateAccruedWhtSatang', () => {
  it('อยู่ในรอบจ่ายแล้ว ⇒ ใช้ยอดของรอบตรงตัว', () => {
    expect(estimateAccruedWhtSatang([item({ batchWhtSatang: 1_234 })], policy)).toEqual([1_234])
  })

  it('เกณฑ์ขั้นต่ำเทียบยอดรวมของผู้รับ (3 × ฿600 = ฿1,800 ⇒ หัก ฿54 กระจายรายการละ ฿18)', () => {
    expect(estimateAccruedWhtSatang([item(), item(), item()], policy)).toEqual([1_800, 1_800, 1_800])
  })

  it('ต่ำกว่าเกณฑ์ ⇒ 0 · ชนิดที่ไม่อยู่ในฐาน ⇒ 0 · ผู้รับคนละคนคิดแยก', () => {
    expect(
      estimateAccruedWhtSatang(
        [item({ grossSatang: 35_000 }), item({ payeeId: 'p-2', grossSatang: 500_000, expenseType: 'hotel' })],
        policy,
      ),
    ).toEqual([0, 0])
  })

  it('ผู้รับ 40(2) ที่ยังไม่มีอัตรา ⇒ ประมาณไม่ได้ (null) ไม่เดาอัตรา · รายการที่อยู่ในรอบแล้วไม่กระทบ', () => {
    const all402 = { ...policy, incomeTypeMode: 'all_40_2' as const }
    expect(estimateAccruedWhtSatang([item(), item({ batchWhtSatang: 0 })], all402)).toEqual([null, 0])
  })

  it('ไม่มีทั้ง Tax Profile และอัตราแผน ⇒ null', () => {
    expect(estimateAccruedWhtSatang([item({ payeeTaxProfile: null, planWhtPct: null })], policy)).toEqual([null])
  })

  it('มติ PO U121 — รายการนอกฐานของผู้รับที่ไม่มีอัตรา ⇒ 0 (ไม่ต้องมีอัตรา) · ในฐาน ⇒ null', () => {
    expect(
      estimateAccruedWhtSatang([item({ expenseType: 'hotel', payeeTaxProfile: null, planWhtPct: null })], policy),
    ).toEqual([0])
  })

  it('มติ PO U121 — ไม่มี Tax Profile รายคน ⇒ ใช้ค่าเริ่มต้นตามประเภท (ไม่มีแผนก็คิดได้)', () => {
    const fromDefault = item({ payeeTaxProfile: null, planWhtPct: null, typeDefaultTaxProfile: profile3, grossSatang: 200_000 })
    expect(estimateAccruedWhtSatang([fromDefault], policy)).toEqual([6_000])
  })
})
