import { describe, expect, it } from 'vitest'
import {
  calculateProjectedRevenue,
  caseProjectedRevenueSatang,
  projectedRevenueNote,
  parseProjectedRevenueSource,
  projectedRevenueSourceText,
  type ProjectedRevenueTemplate,
} from '@/lib/cases/projected-revenue'
import { pctOfSatang } from '@/lib/finance/satang'

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

const DEBT_10K = { debtAmountSatang: 1_000_000 }

describe('ประมาณการรายได้ (`38` §6.5)', () => {
  it('FLAT = base ไม่ขึ้นกับมูลหนี้', () => {
    expect(calculateProjectedRevenue(FLAT, DEBT_10K).amountSatang).toBe(150_000)
    expect(calculateProjectedRevenue(FLAT, { debtAmountSatang: null }).amountSatang).toBe(
      150_000,
    )
  })

  it('SUCCESS_FEE = มูลหนี้ × rate (10,000 × 20% = 2,000 บาท)', () => {
    expect(calculateProjectedRevenue(SUCCESS_FEE, DEBT_10K).amountSatang).toBe(200_000)
  })

  it('HYBRID = base + (มูลหนี้ × rate) (500 + 10,000×15% = 2,000 บาท)', () => {
    expect(calculateProjectedRevenue(HYBRID, DEBT_10K).amountSatang).toBe(200_000)
  })

  it('ฐานคำนวณมีแบบเดียวคือมูลหนี้ (มติ PO U126) — basis null ที่หลุดมาก็ใช้มูลหนี้', () => {
    const template = { ...SUCCESS_FEE, basis: null }
    expect(calculateProjectedRevenue(template, DEBT_10K).basisSatang).toBe(1_000_000)
    expect(calculateProjectedRevenue(template, DEBT_10K).amountSatang).toBe(200_000)
  })

  it('ยังไม่มีฐานคำนวณ → ยอด null + missingBasis (ห้ามเดาเป็น 0)', () => {
    const result = calculateProjectedRevenue(SUCCESS_FEE, { debtAmountSatang: null })
    expect(result.amountSatang).toBeNull()
    expect(result.missingBasis).toBe(true)
  })

  it('เป็น best-case 100% — ไม่คูณลด และไม่สนใจยอดกรณีไม่สำเร็จ', () => {
    const failFeeIrrelevant = calculateProjectedRevenue(HYBRID, DEBT_10K).amountSatang
    expect(failFeeIrrelevant).toBe(HYBRID.baseSatang + 150_000)
  })

  it('ผลลัพธ์เป็นจำนวนเต็มสตางค์เสมอ แม้ rate มีทศนิยม', () => {
    const template = { ...SUCCESS_FEE, ratePct: 12.35 }
    const result = calculateProjectedRevenue(template, { debtAmountSatang: 999_999 })
    expect(Number.isInteger(result.amountSatang)).toBe(true)
    expect(result.amountSatang).toBe(pctOfSatang(999_999, 12.35))
  })

  // Final Test ด่าน 2 — ประมาณการเคยคูณ % เองด้วย `Math.round(base * pct / 100)` ซึ่งกินเศษ binary
  // ของ `NUMERIC(5,2)` แล้วปัดลงผิดไป 1 สตางค์ ต่างจากยอดวางบิลจริงที่คิดผ่าน `pctOfSatang()`
  it('คูณ % ผ่าน `pctOfSatang()` ตัวเดียวของระบบ — ไม่ต่างจากยอดจริง 1 สตางค์', () => {
    const cases: readonly [number, number][] = [
      [1_001_000, 2.05],
      [1_000_500, 4.1],
      [1_000_250, 8.2],
      [1_001_250, 8.04],
    ]
    for (const [debtAmountSatang, ratePct] of cases) {
      const result = calculateProjectedRevenue({ ...SUCCESS_FEE, ratePct }, { debtAmountSatang })
      expect(result.amountSatang).toBe(pctOfSatang(debtAmountSatang, ratePct))
      // สูตรเดิมที่ถูกถอดออก — ยืนยันว่าเลิกใช้แล้วจริง (ต่างกัน 1 สตางค์ทุกคู่)
      expect(result.amountSatang).not.toBe(Math.round((debtAmountSatang * ratePct) / 100))
    }
  })

  it('calculation_source อ้าง template/version ที่ใช้คำนวณ (`38` §6.4)', () => {
    const source = calculateProjectedRevenue(HYBRID, DEBT_10K).source
    expect(source).toContain('tpl-hybrid')
    expect(source).toContain('v2')
    expect(source).toContain('HYBRID')
  })
})

describe('ข้อความที่มาประมาณการสำหรับผู้ใช้ (UAT BUG-034)', () => {
  const TEMPLATE_ID = '3f2a9c4e-1b7d-4e8a-9c3f-2d1e0b9a8c7d'

  function sourceOf(template: ProjectedRevenueTemplate): string {
    return calculateProjectedRevenue(template, { debtAmountSatang: 1_000_000 }).source
  }

  it('อ่านค่าดิบกลับเป็นชิ้นส่วนได้ครบ', () => {
    const source = sourceOf({
      model: 'HYBRID',
      baseSatang: 50_000,
      ratePct: 15,
      basis: 'debt_amount',
      templateId: TEMPLATE_ID,
      templateVersion: 2,
    })
    expect(parseProjectedRevenueSource(source)).toEqual({
      model: 'HYBRID',
      templateId: TEMPLATE_ID,
      templateVersion: 2,
      baseSatang: 50_000,
      ratePct: 15,
      basis: 'debt_amount',
    })
  })

  it('HYBRID: ชื่อเทมเพลต + version + สูตรย่อ ไม่มี UUID', () => {
    const source = sourceOf({
      model: 'HYBRID',
      baseSatang: 50_000,
      ratePct: 15,
      basis: 'debt_amount',
      templateId: TEMPLATE_ID,
      templateVersion: 2,
    })
    const text = projectedRevenueSourceText(source, 'ค่าบริการมาตรฐาน')
    expect(text).toBe('เทมเพลต "ค่าบริการมาตรฐาน" v2 · แบบผสม: ฿500.00 + 15% ของมูลหนี้')
    expect(text).not.toContain(TEMPLATE_ID)
  })

  it('FLAT / SUCCESS_FEE และกรณีไม่รู้ชื่อเทมเพลต', () => {
    const flat = sourceOf({ model: 'FLAT', baseSatang: 150_000, ratePct: 0, basis: null, templateVersion: 1 })
    expect(projectedRevenueSourceText(flat, null)).toBe('เทมเพลต v1 · เหมาจ่ายรายเคส: ฿1,500.00')

    const success = sourceOf({ model: 'SUCCESS_FEE', baseSatang: 0, ratePct: 2.5, basis: 'debt_amount' })
    expect(projectedRevenueSourceText(success, 'ตามมูลหนี้')).toBe(
      'เทมเพลต "ตามมูลหนี้" · ตาม % ความสำเร็จ: 2.5% ของมูลหนี้',
    )
  })

  it('ค่าดิบรูปแบบที่อ่านไม่ออก → null (UI แสดงข้อความกลางแทน)', () => {
    expect(projectedRevenueSourceText('อะไรก็ไม่รู้', 'x')).toBeNull()
    expect(projectedRevenueSourceText('model=UNKNOWN · v1', null)).toBeNull()
  })
})

describe('mytester5 B5-01 — เคสที่รับแล้วคิดประมาณการจาก snapshot ค่าบริการของเคส', () => {
  const snapshot = {
    serviceFeeModelSnapshot: 'HYBRID' as const,
    serviceFeeBaseSatang: 50_000,
    serviceFeeRatePct: 2.05,
    serviceFeeBasisSnapshot: 'debt_amount' as const,
  }

  it('มี snapshot ⇒ ใช้สูตรเดิมกับค่าของ snapshot (ไม่ใช้ยอดที่เก็บไว้ก่อนรับเคส)', () => {
    const result = caseProjectedRevenueSatang(snapshot, { debtAmountSatang: 100_100_000 }, 999)
    expect(result).toEqual({ amountSatang: 50_000 + pctOfSatang(100_100_000, 2.05), fromSnapshot: true })
    expect(
      caseProjectedRevenueSatang(
        { serviceFeeModelSnapshot: 'FLAT', serviceFeeBaseSatang: 150_000, serviceFeeRatePct: null, serviceFeeBasisSnapshot: null },
        { debtAmountSatang: null },
        120_000,
      ),
    ).toEqual({ amountSatang: 150_000, fromSnapshot: true })
  })

  it('ยังไม่รับเคส (ไม่มี snapshot) ⇒ ยอดที่บันทึกไว้เดิม', () => {
    expect(
      caseProjectedRevenueSatang(
        { serviceFeeModelSnapshot: null, serviceFeeBaseSatang: null, serviceFeeRatePct: null, serviceFeeBasisSnapshot: null },
        { debtAmountSatang: 1_000 },
        120_000,
      ),
    ).toEqual({ amountSatang: 120_000, fromSnapshot: false })
  })

  it('ข้อความ: รับเคสแล้วบอกอย่างเดียวว่าคิดจากค่าบริการที่บันทึกไว้ตอนรับเคส (ไม่มี "คำนวณไว้ก่อนรับเคส")', () => {
    const accepted = projectedRevenueNote({
      status: 'approved',
      projectedRevenueSource: 'model=FLAT · v1 · base=150000',
      projectedRevenueSourceLabel: 'เทมเพลต "เหมาจ่าย" v1 · เหมาจ่ายรายเคส: ฿1,500.00',
      serviceFeeModelSnapshot: 'FLAT',
    })
    expect(accepted).toContain('คำนวณจากค่าบริการที่บันทึกไว้ตอนรับเคส (เทมเพลต "เหมาจ่าย" v1')
    expect(accepted).not.toContain('ก่อนรับเคส')
    const pending = projectedRevenueNote({
      status: 'pending_review',
      projectedRevenueSource: 'model=FLAT · v1 · base=150000',
      projectedRevenueSourceLabel: 'เทมเพลต "เหมาจ่าย" v1 · เหมาจ่ายรายเคส: ฿1,500.00',
      serviceFeeModelSnapshot: null,
    })
    expect(pending).toContain('เป็นประมาณการก่อนรับเคส')
    expect(pending).not.toContain('บันทึกไว้ตอนรับเคส')
    expect(
      projectedRevenueNote({ status: 'draft', projectedRevenueSource: null, projectedRevenueSourceLabel: null, serviceFeeModelSnapshot: null }),
    ).toContain('ระบบคำนวณให้เมื่อส่งตรวจสอบ')
  })
})
