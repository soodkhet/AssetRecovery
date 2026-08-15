import { describe, expect, it } from 'vitest'
import { buildRevenueRow, type RevenueRowInput } from '@/lib/revenue/revenue-builder'
import type { VatRatePeriod } from '@/lib/settings/vat'

/**
 * `22` §6.5–6.8 · `19` §16 — ยอดของ Revenue หนึ่งใบ + snapshot อัตรา VAT
 * (สูตรแต่ละตัวมีเทสต์ของตัวเองที่ 3.1 แล้ว — ที่นี่พิสูจน์ "การต่อกัน" และกติกาข้อห้าม)
 */

/** 7% ถึง 30/09/2569 แล้วขึ้น 10% ตั้งแต่ 01/10/2569 (สถานการณ์จริงตาม `19` §6.3) */
const PERIODS: VatRatePeriod[] = [
  {
    id: 'vat-7',
    ratePct: 7,
    effectiveFrom: new Date('2020-01-01T00:00:00.000Z'),
    effectiveTo: new Date('2026-09-30T00:00:00.000Z'),
  },
  {
    id: 'vat-10',
    ratePct: 10,
    effectiveFrom: new Date('2026-10-01T00:00:00.000Z'),
    effectiveTo: null,
  },
]

function input(overrides: Partial<RevenueRowInput> = {}): RevenueRowInput {
  return {
    snapshot: { model: 'SUCCESS_FEE', baseSatang: 0, ratePct: 10, basis: 'debt_amount', chargeOnFail: false },
    outcome: 'closed_success',
    basisValues: { debtAmountSatang: 1_000_000, assetValueSatang: null },
    vatMode: 'exclude_vat',
    revenueDate: new Date('2026-08-31T00:00:00.000Z'),
    vatRatePeriods: PERIODS,
    ...overrides,
  }
}

function values(overrides: Partial<RevenueRowInput> = {}) {
  const result = buildRevenueRow(input(overrides))
  if (!result.ok) throw new Error(`คาดว่าคิดยอดได้ แต่ได้ ${result.reason}`)
  return result.values
}

describe('buildRevenueRow — SUCCESS_FEE + exclude_vat', () => {
  it('`19` §16 — VAT คิดตามอัตรา ณ วันนั้น (มูลหนี้ 10,000 × 10% = 1,000 บาท + VAT 7%)', () => {
    expect(values()).toMatchObject({
      grossSatang: 100_000,
      vatSatang: 7_000,
      totalSatang: 107_000,
      vatRatePctUsed: 7,
      feeModelSnapshot: 'SUCCESS_FEE',
    })
  })

  it('`19` §16 — อัตราเปลี่ยนไม่กระทบใบเก่า: ใบที่ revenue_date ข้ามรอยต่อได้ 10%', () => {
    expect(values({ revenueDate: new Date('2026-10-01T00:00:00.000Z') })).toMatchObject({
      vatSatang: 10_000,
      totalSatang: 110_000,
      vatRatePctUsed: 10,
    })
    // ใบเดิม (31/08) ยังเป็น 7% เหมือนเดิมเพราะคิดจาก revenue_date ของตัวเอง ไม่ใช่อัตราปัจจุบัน
    expect(values().vatRatePctUsed).toBe(7)
  })

  it('closed_fail ของ SUCCESS_FEE = ยอด 0 (ตัวกันจริงคือเกตของ `19` §6.1 ที่ไม่ให้สร้างเลย)', () => {
    expect(values({ outcome: 'closed_fail' })).toMatchObject({ grossSatang: 0, vatSatang: 0, totalSatang: 0 })
  })
})

describe('buildRevenueRow — โหมด VAT อื่น', () => {
  it('no_vat = ไม่คิด VAT และ snapshot อัตรา 0 (ไม่ใช่อัตราปัจจุบัน)', () => {
    expect(values({ vatMode: 'no_vat' })).toMatchObject({
      grossSatang: 100_000,
      vatSatang: 0,
      totalSatang: 100_000,
      vatRatePctUsed: 0,
    })
  })

  it('include_vat = ถอด VAT ออกจากราคาที่ตกลง — total ไม่บวกเพิ่ม (บทเรียน 3.1)', () => {
    const row = values({ vatMode: 'include_vat' })
    expect(row.totalSatang).toBe(100_000)
    expect(row.grossSatang + row.vatSatang).toBe(100_000)
    expect(row.vatRatePctUsed).toBe(7)
  })

  it('no_vat ใช้งานได้แม้องค์กรยังไม่เคยตั้ง vat_rate_history เลย', () => {
    expect(values({ vatMode: 'no_vat', vatRatePeriods: [] }).vatSatang).toBe(0)
  })
})

describe('buildRevenueRow — FLAT / HYBRID', () => {
  const flat = { model: 'FLAT' as const, baseSatang: 500_000, ratePct: 0, basis: null, chargeOnFail: true }

  it('FLAT charge_on_fail = true ได้ base ทุก outcome', () => {
    expect(values({ snapshot: flat, outcome: 'closed_fail' }).grossSatang).toBe(500_000)
    expect(values({ snapshot: flat, outcome: 'closed_success' }).grossSatang).toBe(500_000)
  })

  it('FLAT charge_on_fail = false ไม่ได้อะไรเลยเมื่อไม่สำเร็จ', () => {
    expect(values({ snapshot: { ...flat, chargeOnFail: false }, outcome: 'closed_fail' }).grossSatang).toBe(0)
  })

  it('HYBRID — ส่วน rate ได้เฉพาะ closed_success เสมอ (`22` §6.7)', () => {
    const hybrid = { model: 'HYBRID' as const, baseSatang: 200_000, ratePct: 5, basis: 'debt_amount' as const, chargeOnFail: true }
    expect(values({ snapshot: hybrid, outcome: 'closed_success' }).grossSatang).toBe(200_000 + 50_000)
    expect(values({ snapshot: hybrid, outcome: 'closed_fail' }).grossSatang).toBe(200_000)
  })
})

describe('buildRevenueRow — ข้อห้าม', () => {
  it('เคสที่ไม่มีฐานคำนวณ (basis = asset_value แต่ยังไม่กรอก) ⇒ missing_basis ห้ามสร้าง Revenue', () => {
    const result = buildRevenueRow(
      input({
        snapshot: { model: 'SUCCESS_FEE', baseSatang: 0, ratePct: 10, basis: 'asset_value', chargeOnFail: false },
        basisValues: { debtAmountSatang: 1_000_000, assetValueSatang: null },
      }),
    )
    expect(result).toEqual({ ok: false, reason: 'missing_basis' })
  })

  it('ไม่มีอัตรา VAT ครอบวันนั้น ⇒ VAT_RATE_NOT_FOUND (ห้าม fallback 7%)', () => {
    expect(() => buildRevenueRow(input({ vatRatePeriods: [] }))).toThrowError(/VAT_RATE_NOT_FOUND/)
  })
})
