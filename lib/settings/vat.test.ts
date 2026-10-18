import { describe, expect, it } from 'vitest'
import {
  findOverlappingPeriods,
  findVatRateGaps,
  formatVatPeriodLabel,
  isPeriodRangeValid,
  openEndedPeriod,
  periodsOverlap,
  resolveVatRateAt,
  sortPeriodsDesc,
  toDayNumber,
  planVatRateAutoClose,
  validateVatRateChange,
  validateVatRateCreate,
  vatRateViolationMessage,
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

describe('formatVatPeriodLabel (mytester7 S7-AG2-04)', () => {
  it('ช่วงที่ปิดแล้วแสดงวันสิ้นสุดจริง (พ.ศ.) ไม่ใช่ "เป็นต้นไป"', () => {
    expect(formatVatPeriodLabel(period('a', 7, '2025-10-01', '2026-10-31'))).toBe('7% (01/10/2568–31/10/2569)')
  })

  it('ช่วงเปิดปลาย = "เป็นต้นไป"', () => {
    expect(formatVatPeriodLabel(period('a', 10, '2026-11-01', null))).toBe('10% (01/11/2569 เป็นต้นไป)')
  })
})

describe('findVatRateGaps', () => {
  it('ช่วงต่อกันพอดี = ไม่มีช่องว่าง', () => {
    expect(findVatRateGaps(HISTORY)).toEqual([])
  })

  it('7% ถึง 30/10 + 10% เริ่ม 01/11 ⇒ ช่องว่าง 31/10 วันเดียว', () => {
    const gaps = findVatRateGaps([period('a', 7, '2025-10-01', '2026-10-30'), period('b', 10, '2026-11-01', null)])
    expect(gaps).toEqual([{ from: d('2026-10-31'), to: d('2026-10-31') }])
  })

  it('ไม่นับก่อนช่วงแรก/หลังช่วงสุดท้าย', () => {
    expect(findVatRateGaps([period('a', 7, '2025-10-01', '2026-10-31')])).toEqual([])
  })
})

describe('validateVatRateChange (มติ D7-01 · mytester7 S7-AG2-02/03)', () => {
  /** 19/10/2569 10:00 เวลาไทย */
  const NOW = new Date('2026-10-19T03:00:00Z')
  const CURRENT = period('cur', 7, '2025-10-01', null)
  const REVENUE_SPAN = { first: d('2026-10-17'), last: d('2026-10-17') }

  const edit = (to: string | null, overrides: Partial<{ ratePct: number; from: string }> = {}) => ({
    ratePct: overrides.ratePct ?? 7,
    effectiveFrom: d(overrides.from ?? '2025-10-01'),
    effectiveTo: to === null ? null : d(to),
  })

  it('ปิดช่วงก่อนวันนี้ (16/10 ขณะวันนี้ 19/10) ⇒ VAT_RATE_END_DATE_PAST', () => {
    const violation = validateVatRateChange({
      candidate: edit('2026-10-16'),
      current: CURRENT,
      existing: [CURRENT],
      revenueSpan: null,
      now: NOW,
    })
    expect(violation).toEqual({ code: 'VAT_RATE_END_DATE_PAST', today: d('2026-10-19') })
  })

  it('"วันนี้" ตัดสินตามเวลาไทย — 18/10 23:30Z คือ 19/10 ไทย ⇒ ปิดที่ 18/10 ไม่ได้', () => {
    const violation = validateVatRateChange({
      candidate: edit('2026-10-18'),
      current: CURRENT,
      existing: [CURRENT],
      revenueSpan: null,
      now: new Date('2026-10-18T17:30:00Z'),
    })
    expect(violation?.code).toBe('VAT_RATE_END_DATE_PAST')
  })

  it('mytester7 review — ปิดช่วงล่าสุด (วันนี้/อนาคต) โดยไม่มีช่วงต่อ ⇒ VAT_RATE_GAP ตั้งแต่วันถัดไปเป็นต้นไป', () => {
    for (const [to, gapFrom] of [
      ['2026-10-19', '2026-10-20'],
      ['2026-10-31', '2026-11-01'],
    ] as const) {
      expect(
        validateVatRateChange({ candidate: edit(to), current: CURRENT, existing: [CURRENT], revenueSpan: REVENUE_SPAN, now: NOW }),
      ).toEqual({ code: 'VAT_RATE_GAP', gap: { from: d(gapFrom), to: null } })
    }
  })

  it('mytester7 review — เลื่อนวันเริ่มของช่วงแรกไปหลังวันนี้ ⇒ VAT_RATE_GAP วันนี้ถึงวันก่อนวันเริ่ม', () => {
    expect(
      validateVatRateChange({
        candidate: edit(null, { from: '2026-10-25' }),
        current: CURRENT,
        existing: [CURRENT],
        revenueSpan: null,
        now: NOW,
      }),
    ).toEqual({ code: 'VAT_RATE_GAP', gap: { from: d('2026-10-19'), to: d('2026-10-24') } })
  })

  it('ช่วงล่าสุดถูกปิดอยู่ก่อนแล้ว (ข้อมูลเดิม) ⇒ แก้ช่วงอื่นที่ไม่กระทบไม่ถูกปฏิเสธ', () => {
    const a = period('a', 7, '2024-01-01', '2025-09-30')
    const b = period('b', 7, '2025-10-01', '2026-10-31')
    expect(
      validateVatRateChange({
        candidate: { ratePct: 7, effectiveFrom: d('2024-01-01'), effectiveTo: d('2025-09-30') },
        current: a,
        existing: [a, b],
        revenueSpan: null,
        now: NOW,
      }),
    ).toBeNull()
  })

  it('ยังไม่มีช่วงเลย ⇒ เพิ่มช่วงแรกได้เสมอ (ไม่ทำให้วันใดเสียอัตรา)', () => {
    expect(
      validateVatRateChange({ candidate: edit(null, { from: '2026-11-01' }), current: null, existing: [], revenueSpan: null, now: NOW }),
    ).toBeNull()
  })

  it('แก้หมายเหตุของช่วงที่ปิดไปแล้วในอดีต (วันสิ้นสุดไม่เปลี่ยน) ไม่โดน', () => {
    const closed = period('old', 7, '2024-01-01', '2025-09-30')
    const next = period('next', 7, '2025-10-01', null)
    expect(
      validateVatRateChange({
        candidate: edit('2025-09-30', { from: '2024-01-01' }),
        current: closed,
        existing: [closed, next],
        revenueSpan: { first: d('2025-01-05'), last: d('2025-09-30') },
        now: NOW,
      }),
    ).toBeNull()
  })

  it('เปลี่ยนอัตราของช่วงที่มีรายได้อ้าง (7 → 7.5) ⇒ VAT_RATE_IN_USE rate_changed', () => {
    const violation = validateVatRateChange({
      candidate: edit(null, { ratePct: 7.5 }),
      current: CURRENT,
      existing: [CURRENT],
      revenueSpan: REVENUE_SPAN,
      now: NOW,
    })
    expect(violation).toMatchObject({ code: 'VAT_RATE_IN_USE', reason: 'rate_changed' })
  })

  it('เปลี่ยนอัตราของช่วงที่ยังไม่มีรายได้ได้', () => {
    expect(
      validateVatRateChange({
        candidate: edit(null, { ratePct: 7.5 }),
        current: CURRENT,
        existing: [CURRENT],
        revenueSpan: null,
        now: NOW,
      }),
    ).toBeNull()
  })

  it('เลื่อนวันเริ่มเกินวันที่ของรายได้ ⇒ VAT_RATE_IN_USE range_excludes_revenue', () => {
    const violation = validateVatRateChange({
      candidate: edit(null, { from: '2026-10-18' }),
      current: CURRENT,
      existing: [CURRENT],
      revenueSpan: REVENUE_SPAN,
      now: NOW,
    })
    expect(violation).toMatchObject({ code: 'VAT_RATE_IN_USE', reason: 'range_excludes_revenue' })
  })

  it('ปิดช่วง 30/10 แล้วเพิ่ม 10% เริ่ม 01/11 ⇒ VAT_RATE_GAP (31/10)', () => {
    const closed = period('cur', 7, '2025-10-01', '2026-10-30')
    const violation = validateVatRateChange({
      candidate: edit(null, { ratePct: 10, from: '2026-11-01' }),
      current: null,
      existing: [closed],
      revenueSpan: null,
      now: NOW,
    })
    expect(violation).toEqual({ code: 'VAT_RATE_GAP', gap: { from: d('2026-10-31'), to: d('2026-10-31') } })
  })

  it('ย่นช่วงเดิมจนห่างจากช่วงถัดไป ⇒ VAT_RATE_GAP', () => {
    const first = period('a', 7, '2025-10-01', '2026-10-31')
    const second = period('b', 10, '2026-11-01', null)
    const violation = validateVatRateChange({
      candidate: edit('2026-10-25'),
      current: first,
      existing: [first, second],
      revenueSpan: null,
      now: NOW,
    })
    expect(violation?.code).toBe('VAT_RATE_GAP')
  })

  it('เพิ่มช่วงใหม่ต่อจากวันสิ้นสุดพอดี ⇒ ผ่าน', () => {
    const closed = period('cur', 7, '2025-10-01', '2026-10-31')
    expect(
      validateVatRateChange({
        candidate: edit(null, { ratePct: 10, from: '2026-11-01' }),
        current: null,
        existing: [closed],
        revenueSpan: null,
        now: NOW,
      }),
    ).toBeNull()
  })

  it('ช่องว่างที่มีอยู่ก่อนแล้ว ไม่ทำให้การแก้อื่นถูกปฏิเสธ', () => {
    const a = period('a', 7, '2024-01-01', '2024-12-30')
    const b = period('b', 7, '2025-01-01', null)
    expect(
      validateVatRateChange({
        candidate: { ratePct: 7, effectiveFrom: d('2025-01-01'), effectiveTo: null },
        current: b,
        existing: [a, b],
        revenueSpan: null,
        now: NOW,
      }),
    ).toBeNull()
  })

  it('ข้อความช่องว่างปลายเปิด บอกวันเริ่มที่ไม่มีอัตรา + วิธีเปลี่ยนอัตรา', () => {
    const message = vatRateViolationMessage({ code: 'VAT_RATE_GAP', gap: { from: d('2026-11-01'), to: null } })
    expect(message.message).toContain('01/11/2569 เป็นต้นไป')
    expect(message.message).toContain('เพิ่มอัตราใหม่')
    expect(message.message).not.toMatch(/§|D7-/)
  })

  it('ข้อความไทยระบุวันที่ พ.ศ. และไม่มีเลขอ้างอิงสเปค', () => {
    const message = vatRateViolationMessage({ code: 'VAT_RATE_GAP', gap: { from: d('2026-10-31'), to: d('2026-10-31') } })
    expect(message.message).toContain('31/10/2569')
    const inUse = vatRateViolationMessage({ code: 'VAT_RATE_IN_USE', reason: 'rate_changed', span: REVENUE_SPAN })
    expect(inUse.message).toContain('17/10/2569')
    for (const text of [message.message, inUse.message, inUse.title]) expect(text).not.toMatch(/§|D7-/)
  })
})

describe('เพิ่มอัตราใหม่ = ปิดช่วงเดิมให้อัตโนมัติ (มติ D7-01 · mytester7 review)', () => {
  /** 19/10/2569 10:00 เวลาไทย */
  const NOW = new Date('2026-10-19T03:00:00Z')
  const CURRENT = period('cur', 7, '2025-10-01', null)
  const next = (from: string, to: string | null = null) => ({ ratePct: 10, effectiveFrom: d(from), effectiveTo: to === null ? null : d(to) })

  it('ช่วงใหม่เริ่มหลังวันเริ่มของช่วงเปิดปลาย ⇒ แผนปิดถึงวันก่อนวันเริ่มใหม่', () => {
    expect(planVatRateAutoClose(next('2026-11-01'), [CURRENT])).toEqual({ period: CURRENT, closedTo: d('2026-10-31') })
  })

  it('ไม่มีช่วงเปิดปลาย / ช่วงใหม่เริ่มก่อนหรือวันเดียวกับช่วงเปิดปลาย ⇒ ไม่มีแผน', () => {
    expect(planVatRateAutoClose(next('2026-11-01'), [period('a', 7, '2025-10-01', '2026-10-31')])).toBeNull()
    expect(planVatRateAutoClose(next('2025-10-01'), [CURRENT])).toBeNull()
  })

  it('ปิดอัตโนมัติ + ช่วงใหม่เปิดปลาย ⇒ ผ่าน', () => {
    const autoClose = planVatRateAutoClose(next('2026-11-01'), [CURRENT])
    expect(
      validateVatRateCreate({
        candidate: next('2026-11-01'),
        existing: [CURRENT],
        autoClose,
        revenueSpan: { first: d('2026-10-17'), last: d('2026-10-17') },
        now: NOW,
      }),
    ).toBeNull()
  })

  it('ช่วงใหม่เริ่มวันนี้หรือก่อน ⇒ ช่วงเดิมต้องปิดย้อนหลัง ⇒ VAT_RATE_END_DATE_PAST', () => {
    const autoClose = planVatRateAutoClose(next('2026-10-19'), [CURRENT])
    expect(
      validateVatRateCreate({ candidate: next('2026-10-19'), existing: [CURRENT], autoClose, revenueSpan: null, now: NOW })
        ?.code,
    ).toBe('VAT_RATE_END_DATE_PAST')
  })

  it('มีรายได้ในช่วงเดิมหลังวันปิด ⇒ VAT_RATE_IN_USE', () => {
    const autoClose = planVatRateAutoClose(next('2026-11-01'), [CURRENT])
    expect(
      validateVatRateCreate({
        candidate: next('2026-11-01'),
        existing: [CURRENT],
        autoClose,
        revenueSpan: { first: d('2026-10-17'), last: d('2026-11-05') },
        now: NOW,
      }),
    ).toMatchObject({ code: 'VAT_RATE_IN_USE', reason: 'range_excludes_revenue' })
  })

  it('ช่วงใหม่มีวันสิ้นสุด ⇒ หลังวันสิ้นสุดไม่มีอัตรา ⇒ VAT_RATE_GAP ปลายเปิด', () => {
    const autoClose = planVatRateAutoClose(next('2026-11-01'), [CURRENT])
    expect(
      validateVatRateCreate({
        candidate: next('2026-11-01', '2026-12-31'),
        existing: [CURRENT],
        autoClose,
        revenueSpan: null,
        now: NOW,
      }),
    ).toEqual({ code: 'VAT_RATE_GAP', gap: { from: d('2027-01-01'), to: null } })
  })
})
