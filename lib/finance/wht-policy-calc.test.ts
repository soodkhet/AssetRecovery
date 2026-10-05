import { describe, expect, it } from 'vitest'
import { calculatePayeeBatchWht } from '@/lib/finance/wht-calc'
import {
  DEFAULT_WHT_POLICY,
  isInWhtBase,
  resolveIncomeCategory,
  usesPerPayeeWhtRate,
  type WhtIncomeCategory,
  type WhtIncomeTypeMode,
} from '@/lib/settings/wht-policy'

/**
 * `22` §6.9 — ค่าตั้งภาษี มติ PO 05/10/2569 (UAT U3/U5/U7)
 * ฐาน WHT เลือกชนิดรายการได้ · 40(2) ใช้อัตราต่อคนไม่มีเกณฑ์ · แยกตามประเภททีม
 */

const profile3 = { whtPct: 3, whtBasis: 'before_vat' as const, whtMinThresholdSatang: 100_000 }
const line = (grossSatang: number, includedInBase: boolean) => ({
  grossSatang,
  includedInBase,
  source: { payeeTaxProfile: profile3, planWhtPct: 3 },
})

describe('ฐาน WHT ตั้งค่าได้ (U3)', () => {
  it('(ก) A1 — in1 ยอดรวม ฿1,950 แต่ฐาน WHT ฿1,350 (ไม่รวมค่าที่พัก ฿600) → หัก 4,050 สตางค์', () => {
    // คอมมิชชัน 1,000 + น้ำมัน 200 + เบี้ยเลี้ยง 150 = ฐาน 1,350 · ค่าที่พัก 600 จ่ายเต็มแต่ไม่อยู่ในฐาน
    const types = ['commission', 'fuel', 'allowance', 'hotel'] as const
    const grosses = [100_000, 20_000, 15_000, 60_000]
    const result = calculatePayeeBatchWht(
      types.map((type, index) => line(grosses[index]!, isInWhtBase(DEFAULT_WHT_POLICY, type))),
    )
    expect(result.totalBaseSatang).toBe(135_000)
    expect(result.totalWhtSatang).toBe(4050)
    expect(result.belowThreshold).toBe(false)
    const hotel = result.lines[3]!
    expect(hotel.includedInBase).toBe(false)
    expect(hotel.baseSatang).toBe(0)
    expect(hotel.whtSatang).toBe(0)
    expect(hotel.netSatang).toBe(60_000)
    // ยอดโอนของ in1 = 195,000 − 4,050 = 190,950 สตางค์
    expect(result.lines.reduce((sum, each) => sum + each.netSatang, 0)).toBe(190_950)
    expect(result.lines.every((each) => each.netSatang === grosses[result.lines.indexOf(each)]! - each.whtSatang)).toBe(true)
  })

  it('(ข) ฐานที่อยู่ในฐานต่ำกว่า ฿1,000 → ไม่หัก แม้ยอดรวมทั้งรอบเกิน ฿1,000', () => {
    const result = calculatePayeeBatchWht([line(90_000, true), line(60_000, false)])
    expect(result.totalBaseSatang).toBe(90_000)
    expect(result.belowThreshold).toBe(true)
    expect(result.totalWhtSatang).toBe(0)
  })

  it('ไม่มีรายการในฐานเลย → ไม่หัก (ไม่ต้องมีอัตรา 40(2) ด้วย)', () => {
    const result = calculatePayeeBatchWht([line(500_000, false)], { incomeCategory: 'sec_40_2', section402Pct: null })
    expect(result.totalWhtSatang).toBe(0)
    expect(result.lines[0]!.netSatang).toBe(500_000)
  })

  it('ไม่ระบุตัวเลือก = 40(8) ตามเดิม · รายการไม่ระบุ includedInBase = อยู่ในฐาน', () => {
    const result = calculatePayeeBatchWht([{ grossSatang: 120_000, source: { payeeTaxProfile: profile3, planWhtPct: 3 } }])
    expect(result.incomeCategory).toBe('sec_40_8')
    expect(result.totalWhtSatang).toBe(3600)
    expect(result.lines[0]!.includedInBase).toBe(true)
  })
})

describe('40(2) อัตราต่อคน (U7)', () => {
  it('(ค) อัตรา 2.50% — ไม่มีเกณฑ์ ฿1,000 (ฐาน ฿500 ก็หัก)', () => {
    const result = calculatePayeeBatchWht([line(30_000, true), line(20_000, true)], {
      incomeCategory: 'sec_40_2',
      section402Pct: 2.5,
    })
    expect(result.incomeCategory).toBe('sec_40_2')
    expect(result.belowThreshold).toBe(false)
    expect(result.totalWhtSatang).toBe(1250)
    expect(result.lines.map((each) => each.whtSatang)).toEqual([750, 500])
    expect(result.lines.every((each) => each.whtPctUsed === 2.5 && each.incomeCategory === 'sec_40_2')).toBe(true)
  })

  it('ใช้อัตราต่อคน ไม่ใช่ Tax Profile/Plan · อัตรา 0.00 ได้ (หัก 0)', () => {
    const result = calculatePayeeBatchWht([line(500_000, true)], { incomeCategory: 'sec_40_2', section402Pct: 0 })
    expect(result.totalWhtSatang).toBe(0)
    expect(result.lines[0]!.rate.source).toBe('payee')
    expect(result.lines[0]!.rate.minThresholdSatang).toBe(0)
  })

  it('ไม่มีอัตรา → สูตรปฏิเสธ (ผู้เรียกต้องปัดการสร้างรอบก่อน)', () => {
    expect(() =>
      calculatePayeeBatchWht([line(100_000, true)], { incomeCategory: 'sec_40_2', section402Pct: null }),
    ).toThrow(RangeError)
  })

  it('รายการที่ไม่อยู่ในฐานก็ไม่ถูกหักภายใต้ 40(2)', () => {
    const result = calculatePayeeBatchWht([line(100_000, true), line(60_000, false)], {
      incomeCategory: 'sec_40_2',
      section402Pct: 5,
    })
    expect(result.lines.map((each) => each.whtSatang)).toEqual([5000, 0])
  })
})

/** ค่าตั้งโหมดประเภทเงินได้ + การจับคู่ต่อประเภททีมค่าเริ่มต้น (inhouse 40(2) · outsource 40(8)) */
function mode(
  incomeTypeMode: WhtIncomeTypeMode,
  inhouseIncomeCategory: WhtIncomeCategory = 'sec_40_2',
  outsourceIncomeCategory: WhtIncomeCategory = 'sec_40_8',
) {
  return { incomeTypeMode, inhouseIncomeCategory, outsourceIncomeCategory }
}

describe('(ง) แยกตามประเภททีม (U5)', () => {
  it('inhouse = 40(2) · outsource = 40(8) · โหมดทั้งหมดไม่สนฝั่ง', () => {
    expect(resolveIncomeCategory(mode('by_team_side'), 'inhouse')).toBe('sec_40_2')
    expect(resolveIncomeCategory(mode('by_team_side'), 'outsource')).toBe('sec_40_8')
    expect(resolveIncomeCategory(mode('by_team_side'), null)).toBe('sec_40_8')
    expect(resolveIncomeCategory(mode('all_40_2'), 'outsource')).toBe('sec_40_2')
    expect(resolveIncomeCategory(mode('all_40_8'), 'inhouse')).toBe('sec_40_8')
  })

  it('ผู้รับ inhouse ฐาน ฿600 อัตรา 2% หัก · ผู้รับ outsource ฐาน ฿600 ต่ำกว่าเกณฑ์ ไม่หัก', () => {
    const inhouse = calculatePayeeBatchWht([line(60_000, true)], {
      incomeCategory: resolveIncomeCategory(mode('by_team_side'), 'inhouse'),
      section402Pct: 2,
    })
    const outsource = calculatePayeeBatchWht([line(60_000, true)], {
      incomeCategory: resolveIncomeCategory(mode('by_team_side'), 'outsource'),
      section402Pct: null,
    })
    expect(inhouse.totalWhtSatang).toBe(1200)
    expect(outsource.totalWhtSatang).toBe(0)
    expect(outsource.belowThreshold).toBe(true)
  })
})

describe('(ช) U33 — ประเภทเงินได้ต่อประเภททีมเป็นค่าตั้ง + 40(1) (มติ PO 05/10/2569)', () => {
  const categories: WhtIncomeCategory[] = ['sec_40_1', 'sec_40_2', 'sec_40_8']

  it('ทุกชุดผสม inhouse × outsource (3 × 3) — แต่ละฝั่งได้ประเภทที่ตั้งไว้ · ไม่มีฝั่ง = 40(8)', () => {
    for (const inhouse of categories) {
      for (const outsource of categories) {
        const policy = mode('by_team_side', inhouse, outsource)
        expect(resolveIncomeCategory(policy, 'inhouse')).toBe(inhouse)
        expect(resolveIncomeCategory(policy, 'outsource')).toBe(outsource)
        expect(resolveIncomeCategory(policy, null)).toBe('sec_40_8')
      }
    }
  })

  it('โหมด "ทั้งหมด" ไม่สนการจับคู่ที่เก็บไว้', () => {
    for (const inhouse of categories) {
      for (const outsource of categories) {
        expect(resolveIncomeCategory(mode('all_40_8', inhouse, outsource), 'inhouse')).toBe('sec_40_8')
        expect(resolveIncomeCategory(mode('all_40_2', inhouse, outsource), 'outsource')).toBe('sec_40_2')
      }
    }
  })

  it('40(1)/40(2) ใช้อัตราต่อคน · 40(8) ไม่ใช้', () => {
    expect(usesPerPayeeWhtRate('sec_40_1')).toBe(true)
    expect(usesPerPayeeWhtRate('sec_40_2')).toBe(true)
    expect(usesPerPayeeWhtRate('sec_40_8')).toBe(false)
    expect(usesPerPayeeWhtRate(null)).toBe(false)
  })

  it('40(1) กติกาเดียวกับ 40(2): อัตราต่อคน · ไม่มีเกณฑ์ ฿1,000 · ฐานก่อน VAT', () => {
    const items = [line(60_000, true), line(20_000, false)]
    const sec401 = calculatePayeeBatchWht(items, { incomeCategory: 'sec_40_1', section402Pct: 5 })
    const sec402 = calculatePayeeBatchWht(items, { incomeCategory: 'sec_40_2', section402Pct: 5 })
    expect(sec401.lines.map((each) => each.whtSatang)).toEqual([3000, 0])
    expect(sec401.totalWhtSatang).toBe(sec402.totalWhtSatang)
    expect(sec401.belowThreshold).toBe(false)
    expect(sec401.incomeCategory).toBe('sec_40_1')
    expect(sec401.lines[0]!.rate.source).toBe('payee')
  })

  it('40(1) อัตรา 0% — คิดได้ ภาษี 0', () => {
    const result = calculatePayeeBatchWht([line(100_000, true)], { incomeCategory: 'sec_40_1', section402Pct: 0 })
    expect(result.totalWhtSatang).toBe(0)
    expect(result.lines[0]!.netSatang).toBe(100_000)
  })

  it('40(1) ไม่มีอัตราต่อคน + มีรายการในฐาน ⇒ คิดไม่ได้ (ผู้เรียกต้องปัดรอบก่อน)', () => {
    expect(() => calculatePayeeBatchWht([line(100_000, true)], { incomeCategory: 'sec_40_1', section402Pct: null })).toThrow(
      RangeError,
    )
    // ทุกรายการนอกฐาน = ไม่มีอะไรให้หัก ไม่ต้องมีอัตรา
    expect(
      calculatePayeeBatchWht([line(100_000, false)], { incomeCategory: 'sec_40_1', section402Pct: null }).totalWhtSatang,
    ).toBe(0)
  })

  it('outsource ตั้งเป็น 40(1) ⇒ ฐาน ฿600 ก็หัก (ไม่มีเกณฑ์) · inhouse ตั้งเป็น 40(8) ⇒ ต่ำกว่าเกณฑ์ไม่หัก', () => {
    const policy = mode('by_team_side', 'sec_40_8', 'sec_40_1')
    const outsource = calculatePayeeBatchWht([line(60_000, true)], {
      incomeCategory: resolveIncomeCategory(policy, 'outsource'),
      section402Pct: 3,
    })
    const inhouse = calculatePayeeBatchWht([line(60_000, true)], {
      incomeCategory: resolveIncomeCategory(policy, 'inhouse'),
      section402Pct: 3,
    })
    expect(outsource.totalWhtSatang).toBe(1800)
    expect(inhouse.totalWhtSatang).toBe(0)
    expect(inhouse.belowThreshold).toBe(true)
  })
})
