import { describe, expect, it } from 'vitest'
import {
  ALL_MONTHS,
  matchesMonth,
  monthKeyOfDateOnly,
  monthKeyOfInstant,
  monthLabel,
  monthOptions,
  monthQueryValue,
} from '@/lib/field/month-filter'

describe('month-filter (`41` §7.9/§7.10/§7.11)', () => {
  it('เดือนของคอลัมน์ DATE ตัดตรง ๆ ไม่แปลงเขตเวลา', () => {
    expect(monthKeyOfDateOnly('2026-08-01')).toBe('2026-08')
  })

  it('instant แปลงเป็นเวลาไทยก่อนหาเดือนเสมอ', () => {
    // 31/08 20:00 UTC = 01/09 03:00 น. ไทย ⇒ ต้องเป็นเดือน 9
    expect(monthKeyOfInstant('2026-08-31T20:00:00.000Z')).toBe('2026-09')
    // 01/09 00:30 UTC = 01/09 07:30 น. ไทย
    expect(monthKeyOfInstant('2026-09-01T00:30:00.000Z')).toBe('2026-09')
    // ต้นเดือนฝั่งไทยแต่ยังเป็นเดือนก่อนหน้าใน UTC
    expect(monthKeyOfInstant('2026-07-31T18:00:00.000Z')).toBe('2026-08')
  })

  it('ค่าว่าง/ไม่ถูกต้องคืน null', () => {
    expect(monthKeyOfInstant(null)).toBeNull()
    expect(monthKeyOfInstant('')).toBeNull()
    expect(monthKeyOfInstant('ไม่ใช่วันที่')).toBeNull()
  })

  it('ป้ายเดือนเป็น พ.ศ. เสมอ (Rule 01)', () => {
    expect(monthLabel('2026-08')).toBe('สิงหาคม 2569')
    expect(monthLabel('2025-12')).toBe('ธันวาคม 2568')
  })

  it('คีย์ที่อ่านไม่ได้คืนค่าเดิมแทนที่จะพัง', () => {
    expect(monthLabel('2026-13')).toBe('2026-13')
    expect(monthLabel('ขยะ')).toBe('ขยะ')
  })

  it('ตัวเลือกเดือนไม่ซ้ำ เรียงใหม่→เก่า และมี "ทุกเดือน" นำหน้า', () => {
    const options = monthOptions(['2026-07', '2026-08', '2026-07', null, ''])
    expect(options.map((option) => option.value)).toEqual([ALL_MONTHS, '2026-08', '2026-07'])
    expect(options[0]?.label).toBe('ทุกเดือน')
    expect(options[1]?.label).toBe('สิงหาคม 2569')
  })

  it('ตัวกรอง "ทุกเดือน" ผ่านทุกแถว รวมแถวที่ไม่มีเดือน', () => {
    expect(matchesMonth(ALL_MONTHS, null)).toBe(true)
    expect(matchesMonth('', '2026-08')).toBe(true)
    expect(matchesMonth('2026-08', '2026-08')).toBe(true)
    expect(matchesMonth('2026-08', '2026-07')).toBe(false)
    expect(matchesMonth('2026-08', null)).toBe(false)
  })

  it('"ทุกเดือน" ไม่ส่งพารามิเตอร์ month ไปที่ API', () => {
    expect(monthQueryValue(ALL_MONTHS)).toBeUndefined()
    expect(monthQueryValue('2026-08')).toBe('2026-08')
  })
})
