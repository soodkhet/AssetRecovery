import { describe, expect, it } from 'vitest'
import {
  DELIVERY_DOC_PREFIX,
  formatHandoverNumber,
  handoverNumberYear,
  isHandoverNumber,
  LOT_PREFIX,
  parseHandoverNumber,
} from '@/lib/warehouse/numbering'

/** `44` §6.2 · §10 — เลขเอกสารปี **พ.ศ.** ไม่ซ้ำ ไม่ recycle (Rule 01) */

describe('handoverNumberYear', () => {
  it('คืนปี พ.ศ. ตามเวลาไทย', () => {
    expect(handoverNumberYear(new Date('2026-07-10T03:00:00.000Z'))).toBe(2569)
  })

  it('เอกสารที่ออกหลังเที่ยงคืนไทยของ 1 ม.ค. ได้ปีใหม่ (ไม่ใช่ปีเก่าตาม UTC)', () => {
    // 31/12/2026 18:00Z = 01/01/2027 01:00 เวลาไทย ⇒ ต้องเป็น 2570
    expect(handoverNumberYear(new Date('2026-12-31T18:00:00.000Z'))).toBe(2570)
    expect(handoverNumberYear(new Date('2026-12-31T16:00:00.000Z'))).toBe(2569)
  })

  it('วันที่ไม่ถูกต้อง = โยน error (ห้ามออกเลขจากค่าเพี้ยน)', () => {
    expect(() => handoverNumberYear(new Date('ไม่ใช่วันที่'))).toThrowError()
  })
})

describe('formatHandoverNumber', () => {
  it('เติมศูนย์ครบ 3 หลักตามรูปแบบ LOT-2569-001 / DLV-2569-001', () => {
    expect(formatHandoverNumber(LOT_PREFIX, 2569, 1)).toBe('LOT-2569-001')
    expect(formatHandoverNumber(DELIVERY_DOC_PREFIX, 2569, 42)).toBe('DLV-2569-042')
  })

  it('เกิน 999 ต่อปี ยาวขึ้นตามลำดับจริง (ไม่ตัด ไม่วนกลับ)', () => {
    expect(formatHandoverNumber(LOT_PREFIX, 2569, 1000)).toBe('LOT-2569-1000')
  })
})

describe('parseHandoverNumber', () => {
  it('อ่านเลขที่ถูกรูปแบบได้ครบทุกส่วน', () => {
    expect(parseHandoverNumber('LOT-2569-007')).toEqual({ prefix: 'LOT', beYear: 2569, sequence: 7 })
    expect(parseHandoverNumber('DLV-2570-123')).toEqual({ prefix: 'DLV', beYear: 2570, sequence: 123 })
  })

  it('ปฏิเสธปี ค.ศ. ที่หลุดเข้ามา (เลขทั้งชุดจะผิดถ้าปล่อยผ่าน)', () => {
    expect(parseHandoverNumber('LOT-2026-001')).toBeNull()
  })

  it('ปฏิเสธ prefix อื่น/รูปแบบอื่น', () => {
    expect(parseHandoverNumber('INV-2569-001')).toBeNull()
    expect(parseHandoverNumber('LOT/2569/001')).toBeNull()
    expect(parseHandoverNumber('lot-2569-001')).toBeNull()
    expect(parseHandoverNumber('LOT-2569-01')).toBeNull()
    expect(parseHandoverNumber('')).toBeNull()
  })

  it('isHandoverNumber สอดคล้องกับ parse', () => {
    expect(isHandoverNumber('LOT-2569-001')).toBe(true)
    expect(isHandoverNumber('LOT-2026-001')).toBe(false)
  })

  it('เลขที่ format ออกมาต้องอ่านกลับได้เสมอ (round-trip)', () => {
    for (const sequence of [1, 9, 10, 99, 100, 999]) {
      const value = formatHandoverNumber(DELIVERY_DOC_PREFIX, 2569, sequence)
      expect(parseHandoverNumber(value)).toEqual({ prefix: 'DLV', beYear: 2569, sequence })
    }
  })
})
