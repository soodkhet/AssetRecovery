import { describe, expect, it } from 'vitest'
import { valueAxisTicks } from './report-bar-chart'

describe('valueAxisTicks — แกนค่ากราฟแท่งรวม 0 เสมอ (mytester2 J2-01)', () => {
  it('ทุกค่าติดลบ (ขาดทุนทุกเคส) ⇒ ขีดบนสุดเป็น 0 แท่งติดลบจึงถูกวาดจากฐาน 0', () => {
    const ticks = valueAxisTicks([-10000, -2582], 100)
    expect(ticks.at(-1)).toBe(0)
    expect(ticks[0]).toBeLessThanOrEqual(-10000)
  })

  it('ทุกค่าเป็นบวก ⇒ ขีดล่างสุดเป็น 0', () => {
    const ticks = valueAxisTicks([500, 9000], 100)
    expect(ticks[0]).toBe(0)
    expect(ticks.at(-1)).toBeGreaterThanOrEqual(9000)
  })
})

describe('valueAxisTicks — ขีดเป็นเลขกลมและมี 0 (mytester2 LR-02)', () => {
  it('F1 เจาะลึกรายเคส มีทั้งบวกและลบ ⇒ มีขีด 0 และขั้นเป็นบาทกลม ไม่ใช่ min/max ของข้อมูล', () => {
    // ค่าเป็น satang: +283.32 / −56.17 / −406.17 บาท
    const ticks = valueAxisTicks([28332, -5617, -40617], 100)
    expect(ticks).toEqual([-60000, -40000, -20000, 0, 20000, 40000])
    expect(ticks).toContain(0)
  })

  it('ขั้นห่างเท่ากันและเป็น 1/2/5 × 10ⁿ', () => {
    for (const values of [[123, 98765], [-1, 7], [-333333, 12], [0.4, 3.7]]) {
      const ticks = valueAxisTicks(values, 1)
      const step = (ticks[1] ?? 0) - (ticks[0] ?? 0)
      const magnitude = 10 ** Math.floor(Math.log10(step))
      expect([1, 2, 5]).toContain(Math.round(step / magnitude))
      ticks.forEach((tick, i) => expect(tick).toBeCloseTo((ticks[0] ?? 0) + i * step, 9))
      expect(ticks).toContain(0)
      expect(ticks[0]).toBeLessThanOrEqual(Math.min(...values, 0))
      expect(ticks.at(-1)).toBeGreaterThanOrEqual(Math.max(...values, 0))
    }
  })

  it('เงินขั้นเล็กสุด 1 บาท (100 satang) — ไม่มีขีดเป็นสตางค์แม้ยอดน้อย', () => {
    expect(valueAxisTicks([150, -50], 100)).toEqual([-100, 0, 100, 200])
  })

  it('ทุกค่าเป็น 0 หรือไม่มีข้อมูล ⇒ แกน 0 ถึงหนึ่งขั้น ไม่หารศูนย์', () => {
    expect(valueAxisTicks([0, 0], 100)).toEqual([0, 100])
    expect(valueAxisTicks([], 1)).toEqual([0, 1])
  })
})
