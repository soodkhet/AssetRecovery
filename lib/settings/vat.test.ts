import { describe, expect, it } from 'vitest'
import {
  findOverlappingPeriods,
  isPeriodRangeValid,
  openEndedPeriod,
  periodsOverlap,
  resolveVatRateAt,
  sortPeriodsDesc,
  toDayNumber,
  type VatRatePeriod,
} from '@/lib/settings/vat'

/**
 * `13` §6.5 · §10 `VAT_RATE_OVERLAP` · §15 "เพิ่ม VAT Rate ทับช่วงเดิม → reject"
 * DoD ของ Phase 1.10: overlap/resolve ต้องถูกต้อง**ข้ามช่วงเวลา** (รวมช่วงเปิดปลาย)
 */

/** คอลัมน์เป็น `DATE` ⇒ เก็บ/เทียบเป็นเที่ยงคืน **UTC** เสมอ (ไม่ใช่เที่ยงคืนไทย) */
const d = (iso: string): Date => new Date(`${iso}T00:00:00Z`)

const period = (id: string, ratePct: number, from: string, to: string | null): VatRatePeriod => ({
  id,
  ratePct,
  effectiveFrom: d(from),
  effectiveTo: to === null ? null : d(to),
})

/** ชุดข้อมูลจริงตาม `13` §6.5: 7% ถึง 30/09/2569 แล้วกลับไป 10% ตั้งแต่ 01/10/2569 */
const OLD_PERIOD = period('old', 7, '2024-01-01', '2026-09-30')
const NEXT_PERIOD = period('next', 10, '2026-10-01', null)
const HISTORY: VatRatePeriod[] = [OLD_PERIOD, NEXT_PERIOD]

describe('toDayNumber', () => {
  it('ตัดเวลาทิ้ง — วันเดียวกันคนละเวลาได้เลขเดียวกัน', () => {
    expect(toDayNumber(new Date('2026-08-14T00:00:00Z'))).toBe(toDayNumber(new Date('2026-08-14T23:59:59Z')))
  })

  it('วันติดกันต่างกัน 1', () => {
    expect(toDayNumber(d('2026-08-15')) - toDayNumber(d('2026-08-14'))).toBe(1)
  })
})

describe('isPeriodRangeValid', () => {
  it('ช่วงวันเดียว (from = to) ใช้ได้', () => {
    expect(isPeriodRangeValid({ effectiveFrom: d('2026-08-14'), effectiveTo: d('2026-08-14') })).toBe(true)
  })

  it('ช่วงเปิดปลายใช้ได้', () => {
    expect(isPeriodRangeValid({ effectiveFrom: d('2026-08-14'), effectiveTo: null })).toBe(true)
  })

  it('วันสิ้นสุดมาก่อนวันเริ่ม = ไม่ถูกต้อง', () => {
    expect(isPeriodRangeValid({ effectiveFrom: d('2026-08-14'), effectiveTo: d('2026-08-13') })).toBe(false)
  })
})

describe('periodsOverlap', () => {
  it('ช่วงติดกันแบบไม่ซ้อน (30/09 ต่อ 01/10) ไม่ทับ', () => {
    expect(periodsOverlap(OLD_PERIOD, NEXT_PERIOD)).toBe(false)
  })

  it('ขอบวันเดียวกันถือว่าทับ (inclusive ทั้งสองด้าน)', () => {
    expect(
      periodsOverlap(
        { effectiveFrom: d('2026-09-30'), effectiveTo: d('2026-12-31') },
        { effectiveFrom: d('2024-01-01'), effectiveTo: d('2026-09-30') },
      ),
    ).toBe(true)
  })

  it('ช่วงเปิดปลาย 2 ช่วงทับกันเสมอ', () => {
    expect(
      periodsOverlap({ effectiveFrom: d('2030-01-01'), effectiveTo: null }, { effectiveFrom: d('2026-10-01'), effectiveTo: null }),
    ).toBe(true)
  })

  it('ช่วงใหม่คร่อมช่วงเดิมทั้งช่วง = ทับ', () => {
    expect(
      periodsOverlap(
        { effectiveFrom: d('2023-01-01'), effectiveTo: d('2027-01-01') },
        { effectiveFrom: d('2024-01-01'), effectiveTo: d('2026-09-30') },
      ),
    ).toBe(true)
  })
})

describe('findOverlappingPeriods', () => {
  it('เพิ่มอัตราที่เริ่มกลางช่วงเดิม → เจอช่วงที่ทับ (`13` §15)', () => {
    const found = findOverlappingPeriods({ effectiveFrom: d('2026-06-01'), effectiveTo: null }, HISTORY)
    expect(found.map((p) => p.id)).toEqual(['old', 'next'])
  })

  it('เพิ่มอัตราต่อท้ายช่วงที่ปิดแล้ว → ไม่ทับ', () => {
    const closed = [period('old', 7, '2024-01-01', '2026-09-30')]
    expect(findOverlappingPeriods({ effectiveFrom: d('2026-10-01'), effectiveTo: null }, closed)).toEqual([])
  })

  it('PATCH ตัวเอง — ไม่นับตัวเองเป็นคู่ทับ', () => {
    const found = findOverlappingPeriods({ effectiveFrom: d('2026-10-01'), effectiveTo: d('2027-12-31') }, HISTORY, 'next')
    expect(found).toEqual([])
  })

  it('PATCH ตัวเองให้ย้อนไปทับช่วงก่อนหน้า → ยังจับได้', () => {
    const found = findOverlappingPeriods({ effectiveFrom: d('2026-09-01'), effectiveTo: null }, HISTORY, 'next')
    expect(found.map((p) => p.id)).toEqual(['old'])
  })
})

describe('resolveVatRateAt', () => {
  it('วันในช่วงเก่าได้ 7% / วันในช่วงใหม่ได้ 10% (ห้าม hardcode 7% — Rule 01)', () => {
    expect(resolveVatRateAt(d('2026-09-30'), HISTORY)?.ratePct).toBe(7)
    expect(resolveVatRateAt(d('2026-10-01'), HISTORY)?.ratePct).toBe(10)
  })

  it('ขอบซ้ายของช่วงแรกรวมอยู่ในช่วง', () => {
    expect(resolveVatRateAt(d('2024-01-01'), HISTORY)?.id).toBe('old')
  })

  it('วันก่อนช่วงแรก = ไม่มีอัตรา (`VAT_RATE_NOT_FOUND`)', () => {
    expect(resolveVatRateAt(d('2023-12-31'), HISTORY)).toBeNull()
  })

  it('ช่วงเปิดปลายครอบคลุมอนาคตไกล', () => {
    expect(resolveVatRateAt(d('2099-01-01'), HISTORY)?.id).toBe('next')
  })

  it('เวลาในวันไม่กระทบผล (คอลัมน์เป็น DATE)', () => {
    expect(resolveVatRateAt(new Date('2026-09-30T23:30:00Z'), HISTORY)?.id).toBe('old')
  })

  it('ถ้าข้อมูลเก่าเผลอทับกัน เลือกช่วงที่เริ่มใหม่สุด (กันคำนวณสองค่า)', () => {
    const messy = [period('a', 7, '2024-01-01', null), period('b', 10, '2026-01-01', null)]
    expect(resolveVatRateAt(d('2026-06-01'), messy)?.id).toBe('b')
  })
})

describe('sortPeriodsDesc / openEndedPeriod', () => {
  it('เรียงใหม่→เก่า', () => {
    expect(sortPeriodsDesc(HISTORY).map((p) => p.id)).toEqual(['next', 'old'])
  })

  it('หาช่วงที่ยังเปิดปลายอยู่', () => {
    expect(openEndedPeriod(HISTORY)?.id).toBe('next')
    expect(openEndedPeriod([OLD_PERIOD])).toBeNull()
  })
})
