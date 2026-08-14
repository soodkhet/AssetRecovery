import { describe, expect, it } from 'vitest'
import { grossProfit, summarizeGrossProfit } from '@/lib/finance/gross-profit'
import { fmtRatioPct } from '@/lib/format/money'

/** `22` §6.12 · `21` §6.1 + §16 — กำไรขั้นต้น (Actual) */

describe('grossProfit', () => {
  it('gp = revenue - direct_cost · margin = gp/revenue × 100', () => {
    const result = grossProfit({ revenueSatang: 1_000_000, directCostSatang: 400_000 })
    expect(result.grossProfitSatang).toBe(600_000)
    expect(result.marginPct).toBe(60)
  })

  it('revenue = 0 → margin เป็น null **ห้ามหารศูนย์** (แสดง N/A)', () => {
    const result = grossProfit({ revenueSatang: 0, directCostSatang: 46_250 })
    expect(result.grossProfitSatang).toBe(-46_250)
    expect(result.marginPct).toBeNull()
    expect(Number.isNaN(result.marginPct as unknown as number)).toBe(false)
    expect(fmtRatioPct(result.marginPct)).toBe('N/A')
  })

  it('ต้นทุนมากกว่ารายได้ → ขาดทุนขั้นต้น (margin ติดลบ ไม่ใช่ 0)', () => {
    const result = grossProfit({ revenueSatang: 100_000, directCostSatang: 150_000 })
    expect(result.grossProfitSatang).toBe(-50_000)
    expect(result.marginPct).toBe(-50)
  })

  it('ค่าที่ไม่ใช่สตางค์จำนวนเต็ม = ล้ม', () => {
    expect(() => grossProfit({ revenueSatang: 1_000.5, directCostSatang: 0 })).toThrow(RangeError)
  })
})

describe('summarizeGrossProfit — แยกตามมิติ (`21` §6.2)', () => {
  const rows = [
    { key: 'company-a', label: 'ไฟแนนซ์ A', revenueSatang: 1_000_000, directCostSatang: 400_000 },
    { key: 'company-b', label: 'ไฟแนนซ์ B', revenueSatang: 500_000, directCostSatang: 450_000 },
  ]

  it('คิด margin รายมิติ + ยอดรวม', () => {
    const summary = summarizeGrossProfit(rows)
    expect(summary.rows[0]?.marginPct).toBe(60)
    expect(summary.rows[1]?.marginPct).toBe(10)
    expect(summary.total.revenueSatang).toBe(1_500_000)
    expect(summary.total.grossProfitSatang).toBe(650_000)
  })

  it('margin ของยอดรวมคิดจากยอดรวม ไม่ใช่ค่าเฉลี่ยของ margin รายแถว', () => {
    const summary = summarizeGrossProfit(rows)
    const averageOfRows = (60 + 10) / 2
    expect(summary.total.marginPct).toBeCloseTo((650_000 / 1_500_000) * 100, 10)
    expect(summary.total.marginPct).not.toBe(averageOfRows)
  })

  it('เคส closed_fail ที่มีต้นทุนแต่ไม่มีรายได้ ต้องกด margin ลงจริง (`21` §16)', () => {
    const withFailedCases = summarizeGrossProfit([
      ...rows,
      { key: 'company-c', revenueSatang: 0, directCostSatang: 200_000 },
    ])
    expect(withFailedCases.rows[2]?.marginPct).toBeNull()
    expect(withFailedCases.total.grossProfitSatang).toBe(450_000)
    expect(withFailedCases.total.marginPct).toBeLessThan(summarizeGrossProfit(rows).total.marginPct as number)
  })

  it('ไม่มีแถวเลย → รายได้ 0 ⇒ margin เป็น null', () => {
    const summary = summarizeGrossProfit([])
    expect(summary.rows).toEqual([])
    expect(summary.total.marginPct).toBeNull()
  })
})
