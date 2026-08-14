import { describe, expect, it } from 'vitest'
import {
  assertNonNegativeSatang,
  assertPct,
  assertSatang,
  pctOfSatang,
  sumSatang,
  vatIncludedInSatang,
} from '@/lib/finance/satang'

/** Rule 01 — เงินเป็นสตางค์จำนวนเต็มเสมอ · ยามทุกตัวต้องล้มให้เห็น ไม่ใช่ปัดให้เงียบ ๆ */

describe('ยามค่าเงิน/อัตรา', () => {
  it('รับเฉพาะสตางค์จำนวนเต็ม — float คือบั๊กเงิน', () => {
    expect(() => assertSatang(10_050, 'ยอด')).not.toThrow()
    expect(() => assertSatang(-10_050, 'ยอด')).not.toThrow()
    expect(() => assertSatang(100.5, 'ยอด')).toThrow(RangeError)
    expect(() => assertSatang(Number.NaN, 'ยอด')).toThrow(RangeError)
  })

  it('ยอดที่ติดลบไม่ได้ต้องล้ม', () => {
    expect(() => assertNonNegativeSatang(0, 'ยอด')).not.toThrow()
    expect(() => assertNonNegativeSatang(-1, 'ยอด')).toThrow(RangeError)
  })

  it('อัตราต้องอยู่ 0–100', () => {
    expect(() => assertPct(0, 'อัตรา')).not.toThrow()
    expect(() => assertPct(100, 'อัตรา')).not.toThrow()
    expect(() => assertPct(-0.01, 'อัตรา')).toThrow(RangeError)
    expect(() => assertPct(100.01, 'อัตรา')).toThrow(RangeError)
    expect(() => assertPct(Number.POSITIVE_INFINITY, 'อัตรา')).toThrow(RangeError)
  })
})

describe('pctOfSatang — ตัวคูณเปอร์เซ็นต์ตัวเดียวของระบบ', () => {
  it('ยอดลงตัว: ฿1,000 × 3% = ฿30', () => {
    expect(pctOfSatang(100_000, 3)).toBe(3_000)
  })

  it('อัตรา 0% = 0 · ฐาน 0 = 0', () => {
    expect(pctOfSatang(100_000, 0)).toBe(0)
    expect(pctOfSatang(0, 7)).toBe(0)
  })

  it('เศษครึ่งสตางค์ปัดขึ้น (ครึ่งขึ้นทั้งระบบ)', () => {
    // 12,345 × 7% = 864.15 → 864
    expect(pctOfSatang(12_345, 7)).toBe(864)
    // 10,050 × 7% = 703.5 → 704
    expect(pctOfSatang(10_050, 7)).toBe(704)
  })

  it('อัตราทศนิยม 2 ตำแหน่งที่ลงตัวพอดี `.5` ต้องไม่ถูก float กินไป 1 สตางค์', () => {
    // 1,000 × 2.05% = 20.5 → 21 (ถ้าไม่ล้างเศษ binary ก่อน จะได้ 20)
    expect(pctOfSatang(1_000, 2.05)).toBe(21)
    // 3,000 × 1.05% = 31.5 → 32
    expect(pctOfSatang(3_000, 1.05)).toBe(32)
  })

  it('ยามค่าเข้าทำงาน', () => {
    expect(() => pctOfSatang(100.5, 3)).toThrow(RangeError)
    expect(() => pctOfSatang(100_000, 101)).toThrow(RangeError)
  })
})

describe('vatIncludedInSatang — ถอด VAT ออกจากยอดที่รวมแล้ว (`22` §6.8)', () => {
  it('฿107 รวม VAT 7% → VAT = ฿7', () => {
    expect(vatIncludedInSatang(10_700, 7)).toBe(700)
  })

  it('฿1,000 รวม VAT 7% → 65.42 บาท (6,542 สตางค์)', () => {
    // 100,000 × 7 / 107 = 6,542.05… → 6,542
    expect(vatIncludedInSatang(100_000, 7)).toBe(6_542)
  })

  it('อัตรา 0% → 0 (ไม่หารด้วย 100)', () => {
    expect(vatIncludedInSatang(100_000, 0)).toBe(0)
  })

  it('อัตราตามกฎหมาย 10% ให้ผลต่างจาก 7% จริง (ห้าม hardcode อัตรา)', () => {
    expect(vatIncludedInSatang(110_000, 10)).toBe(10_000)
  })
})

describe('sumSatang', () => {
  it('รวมยอดและยามค่าไม่ใช่จำนวนเต็ม', () => {
    expect(sumSatang([])).toBe(0)
    expect(sumSatang([100, 250, -50])).toBe(300)
    expect(() => sumSatang([100, 0.5])).toThrow(RangeError)
  })
})
