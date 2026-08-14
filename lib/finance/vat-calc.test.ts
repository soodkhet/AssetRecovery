import { describe, expect, it } from 'vitest'
import { calculateVat, calculateVatForRevenue } from '@/lib/finance/vat-calc'
import { isSettingsError } from '@/lib/settings/errors'
import type { VatRatePeriod } from '@/lib/settings/vat'

/**
 * `22` §6.8 · `19` §6.3 + §16 — VAT ตามอัตราที่ effective ณ `revenue_date`
 * **ห้าม hardcode 7%**: เทสต์ชุดนี้จงใจใช้ทั้ง 7% และ 10% เพื่อให้สูตรที่ตรึงอัตราไว้ล้มทันที
 */

const periods: VatRatePeriod[] = [
  // 7% (อัตราลดพิเศษ) — ถึง 30 ก.ย. 2569
  { id: 'v7', ratePct: 7, effectiveFrom: new Date('2020-10-01T00:00:00Z'), effectiveTo: new Date('2026-09-30T00:00:00Z') },
  // 10% (อัตราตามกฎหมาย) — ตั้งแต่ 1 ต.ค. 2569 เปิดปลาย
  { id: 'v10', ratePct: 10, effectiveFrom: new Date('2026-10-01T00:00:00Z'), effectiveTo: null },
]

describe('§6.8 exclude_vat — ราคาก่อน VAT แยกบรรทัด', () => {
  it('฿1,000 + VAT 7% → vat ฿70 · total ฿1,070 · snapshot 7', () => {
    expect(calculateVat({ amountSatang: 100_000, vatMode: 'exclude_vat', vatRatePct: 7 })).toEqual({
      vatMode: 'exclude_vat',
      grossSatang: 100_000,
      vatSatang: 7_000,
      totalSatang: 107_000,
      vatRatePctUsed: 7,
    })
  })

  it('อัตรา 10% ให้ยอดต่างจาก 7% จริง', () => {
    const result = calculateVat({ amountSatang: 100_000, vatMode: 'exclude_vat', vatRatePct: 10 })
    expect(result.vatSatang).toBe(10_000)
    expect(result.totalSatang).toBe(110_000)
    expect(result.vatRatePctUsed).toBe(10)
  })
})

describe('§6.8 include_vat — ราคาที่ตกลงรวม VAT แล้ว', () => {
  it('฿1,070 รวม VAT 7% → vat ฿70 · gross ฿1,000 · total ไม่บวกเพิ่ม', () => {
    expect(calculateVat({ amountSatang: 107_000, vatMode: 'include_vat', vatRatePct: 7 })).toEqual({
      vatMode: 'include_vat',
      grossSatang: 100_000,
      vatSatang: 7_000,
      totalSatang: 107_000,
      vatRatePctUsed: 7,
    })
  })

  it('total = gross + vat เสมอ (ยามความสอดคล้องกับ `02` §5)', () => {
    const result = calculateVat({ amountSatang: 100_000, vatMode: 'include_vat', vatRatePct: 7 })
    expect(result.grossSatang + result.vatSatang).toBe(result.totalSatang)
    expect(result.totalSatang).toBe(100_000)
  })
})

describe('§6.8 no_vat', () => {
  it('บริษัทที่ไม่คิด VAT → vat 0 · total = gross · snapshot อัตรา 0', () => {
    expect(calculateVat({ amountSatang: 100_000, vatMode: 'no_vat', vatRatePct: 7 })).toEqual({
      vatMode: 'no_vat',
      grossSatang: 100_000,
      vatSatang: 0,
      totalSatang: 100_000,
      vatRatePctUsed: 0,
    })
  })

  it('ออกบิลได้แม้ยังไม่ตั้ง vat_rate_history เลย', () => {
    expect(
      calculateVatForRevenue({
        amountSatang: 100_000,
        vatMode: 'no_vat',
        revenueDate: new Date('2026-08-15T00:00:00Z'),
        vatRatePeriods: [],
      }).vatSatang,
    ).toBe(0)
  })
})

describe('resolve อัตราตาม revenue_date (`19` §16)', () => {
  it('วันในช่วง 7% → ใช้ 7%', () => {
    const result = calculateVatForRevenue({
      amountSatang: 100_000,
      vatMode: 'exclude_vat',
      revenueDate: new Date('2026-08-15T00:00:00Z'),
      vatRatePeriods: periods,
    })
    expect(result.vatRatePctUsed).toBe(7)
    expect(result.vatSatang).toBe(7_000)
  })

  it('รอยต่อ 30/09 → 01/10 เปลี่ยนอัตราถูกวัน (inclusive ทั้งสองด้าน)', () => {
    const last7 = calculateVatForRevenue({
      amountSatang: 100_000,
      vatMode: 'exclude_vat',
      revenueDate: new Date('2026-09-30T00:00:00Z'),
      vatRatePeriods: periods,
    })
    const first10 = calculateVatForRevenue({
      amountSatang: 100_000,
      vatMode: 'exclude_vat',
      revenueDate: new Date('2026-10-01T00:00:00Z'),
      vatRatePeriods: periods,
    })
    expect(last7.vatRatePctUsed).toBe(7)
    expect(first10.vatRatePctUsed).toBe(10)
  })

  it('เพิ่มอัตราใหม่ไม่กระทบใบเก่า — snapshot ของใบเดิมยังเป็น 7 (`19` §16)', () => {
    const before = calculateVatForRevenue({
      amountSatang: 100_000,
      vatMode: 'exclude_vat',
      revenueDate: new Date('2026-08-15T00:00:00Z'),
      vatRatePeriods: [periods[0] as VatRatePeriod],
    })
    const after = calculateVatForRevenue({
      amountSatang: 100_000,
      vatMode: 'exclude_vat',
      revenueDate: new Date('2026-08-15T00:00:00Z'),
      vatRatePeriods: periods,
    })
    expect(after.vatRatePctUsed).toBe(before.vatRatePctUsed)
  })

  it('ไม่มีอัตราครอบคลุมวันนั้น → VAT_RATE_NOT_FOUND (ห้าม fallback 7%)', () => {
    const call = () =>
      calculateVatForRevenue({
        amountSatang: 100_000,
        vatMode: 'exclude_vat',
        revenueDate: new Date('2019-01-01T00:00:00Z'),
        vatRatePeriods: periods,
      })
    expect(call).toThrow()
    try {
      call()
    } catch (error) {
      expect(isSettingsError(error) && error.code).toBe('VAT_RATE_NOT_FOUND')
    }
  })
})

describe('ยามค่าเข้า', () => {
  it('ยอดติดลบ/ไม่ใช่จำนวนเต็ม = ล้ม', () => {
    expect(() => calculateVat({ amountSatang: -1, vatMode: 'exclude_vat', vatRatePct: 7 })).toThrow(RangeError)
    expect(() => calculateVat({ amountSatang: 100.5, vatMode: 'exclude_vat', vatRatePct: 7 })).toThrow(RangeError)
  })

  it('อัตรานอกช่วง 0–100 = ล้ม', () => {
    expect(() => calculateVat({ amountSatang: 100_000, vatMode: 'exclude_vat', vatRatePct: 101 })).toThrow(RangeError)
  })
})
