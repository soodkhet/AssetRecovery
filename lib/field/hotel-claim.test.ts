import { describe, expect, it } from 'vitest'
import { FieldError } from '@/lib/field/errors'
import {
  assertHotelClaimWithinCap,
  hotelCapExceededMessage,
  hotelClaimCapSatang,
  isHotelClaimOverCap,
  assertHotelClaimFields,
  assertSharedAgentInTeam,
  hotelClaimFormError,
  missingHotelClaimFields,
} from '@/lib/field/hotel-claim'

const valid = {
  expenseDate: new Date('2026-08-10T00:00:00Z'),
  amountSatang: 80_000,
  receiptFileUrl: 'field/receipts/abc.jpg',
}

describe('ฟิลด์บังคับของการเบิกที่พัก (`41` §12)', () => {
  it('ครบทั้ง 3 = ผ่าน', () => {
    expect(missingHotelClaimFields(valid)).toEqual([])
    expect(() => assertHotelClaimFields(valid)).not.toThrow()
  })

  it('บอกครบทุกช่องที่ขาดในครั้งเดียว', () => {
    expect(missingHotelClaimFields({ expenseDate: null, amountSatang: null, receiptFileUrl: null })).toEqual([
      'expenseDate',
      'amountSatang',
      'receiptFileUrl',
    ])
  })

  it('ยอด 0 หรือติดลบ = ไม่ผ่าน', () => {
    expect(missingHotelClaimFields({ ...valid, amountSatang: 0 })).toEqual(['amountSatang'])
    expect(missingHotelClaimFields({ ...valid, amountSatang: -100 })).toEqual(['amountSatang'])
  })

  it('ยอดที่ไม่ใช่จำนวนเต็ม satang = ไม่ผ่าน (Rule 01)', () => {
    expect(missingHotelClaimFields({ ...valid, amountSatang: 100.5 })).toEqual(['amountSatang'])
  })

  it('โยน FieldError code ตาม `41` §12 พร้อมรายชื่อช่องที่ขาด', () => {
    try {
      assertHotelClaimFields({ ...valid, receiptFileUrl: '   ' })
      expect.unreachable('ต้องโยน')
    } catch (error) {
      expect(error).toBeInstanceOf(FieldError)
      expect((error as FieldError).code).toBe('HOTEL_CLAIM_FIELD_REQUIRED')
      expect((error as FieldError).context).toEqual({ missing: ['receiptFileUrl'] })
    }
  })
})

describe('ผู้พักร่วมต้องอยู่ทีมเดียวกัน (`41` §12)', () => {
  it('ไม่ระบุผู้พักร่วม = ผ่าน', () => {
    expect(() => assertSharedAgentInTeam(null, ['u1'])).not.toThrow()
    expect(() => assertSharedAgentInTeam(undefined, [])).not.toThrow()
  })

  it('คนในทีม = ผ่าน · คนนอกทีม = ปฏิเสธแม้ dropdown จะกรองไว้แล้ว', () => {
    expect(() => assertSharedAgentInTeam('u2', ['u2', 'u3'])).not.toThrow()
    try {
      assertSharedAgentInTeam('outsider', ['u2', 'u3'])
      expect.unreachable('ต้องโยน')
    } catch (error) {
      expect((error as FieldError).code).toBe('HOTEL_CLAIM_INVALID_SHARED_AGENT')
    }
  })
})

describe('ข้อความของฟอร์มเบิกที่พักแยกต่อช่อง (UAT BUG-073)', () => {
  const ok = { expenseDate: '2026-10-03', amountBaht: '600', hasReceipt: true }

  it('ยอด 0 / ติดลบ → "จำนวนเงินต้องมากกว่า 0" ไม่ปนกับเรื่องวันที่', () => {
    expect(hotelClaimFormError({ ...ok, amountBaht: '0' })).toBe('จำนวนเงินต้องมากกว่า 0')
    expect(hotelClaimFormError({ ...ok, amountBaht: '-100' })).toBe('จำนวนเงินต้องมากกว่า 0')
  })

  it('แต่ละช่องมีข้อความของตัวเอง', () => {
    expect(hotelClaimFormError({ ...ok, expenseDate: '' })).toBe('กรุณาเลือกวันที่เข้าพัก')
    expect(hotelClaimFormError({ ...ok, amountBaht: '' })).toBe('กรุณากรอกจำนวนเงิน')
    expect(hotelClaimFormError({ ...ok, amountBaht: '600.505' })).toBe('จำนวนเงินกรอกทศนิยมได้ไม่เกิน 2 ตำแหน่ง')
    expect(hotelClaimFormError({ ...ok, amountBaht: 'abc' })).toBe('จำนวนเงินต้องเป็นตัวเลข')
    expect(hotelClaimFormError({ ...ok, hasReceipt: false })).toBe('ต้องแนบใบเสร็จก่อนส่งคำขอเบิก')
    expect(hotelClaimFormError(ok)).toBeNull()
  })
})

describe('เพดานค่าที่พักต่อคืน (มติ PO U89 · `22` §6.15)', () => {
  const cap = { maxPerNightSatang: 80_000, nights: 1 }

  it('เท่าเพดานพอดี = ผ่าน', () => {
    expect(isHotelClaimOverCap({ ...cap, amountSatang: 80_000 })).toBe(false)
    expect(() => assertHotelClaimWithinCap({ ...cap, amountSatang: 80_000 })).not.toThrow()
  })

  it('เกินเพดาน 1 สตางค์ = บล็อก พร้อมข้อความบอกเพดานเป็นบาท', () => {
    expect(isHotelClaimOverCap({ ...cap, amountSatang: 80_001 })).toBe(true)
    try {
      assertHotelClaimWithinCap({ ...cap, amountSatang: 80_001 })
      expect.unreachable()
    } catch (error) {
      expect(error).toBeInstanceOf(FieldError)
      const fieldError = error as FieldError
      expect(fieldError.code).toBe('HOTEL_CLAIM_EXCEEDS_CAP')
      expect(fieldError.status).toBe(400)
      expect(fieldError.userMessage).toContain('800.00 บาท/คืน')
      expect(fieldError.userMessage).toContain('800.01 บาท')
      expect(fieldError.userMessage).not.toMatch(/§|ไฟล์ \d/)
      expect(fieldError.context).toMatchObject({ capSatang: 80_000, nights: 1 })
    }
  })

  it('หลายคืน = เพดานต่อคืน × จำนวนคืน', () => {
    expect(hotelClaimCapSatang(80_000, 3)).toBe(240_000)
    expect(isHotelClaimOverCap({ maxPerNightSatang: 80_000, nights: 3, amountSatang: 240_000 })).toBe(false)
    expect(isHotelClaimOverCap({ maxPerNightSatang: 80_000, nights: 3, amountSatang: 240_001 })).toBe(true)
    expect(hotelCapExceededMessage({ maxPerNightSatang: 80_000, nights: 3, amountSatang: 240_001 })).toContain(
      '800.00 บาท/คืน × 3 คืน = 2,400.00 บาท',
    )
  })

  it('แผนไม่ตั้งเพดาน = ไม่จำกัด', () => {
    expect(hotelClaimCapSatang(null, 1)).toBeNull()
    expect(isHotelClaimOverCap({ maxPerNightSatang: null, nights: 1, amountSatang: 99_999_999 })).toBe(false)
  })

  it('เพดาน 0 = เบิกไม่ได้ทุกยอด', () => {
    expect(isHotelClaimOverCap({ maxPerNightSatang: 0, nights: 1, amountSatang: 1 })).toBe(true)
  })

  it('จำนวนคืน/เพดานไม่ถูกต้อง = RangeError', () => {
    expect(() => hotelClaimCapSatang(80_000, 0)).toThrow(RangeError)
    expect(() => hotelClaimCapSatang(80_000, 1.5)).toThrow(RangeError)
    expect(() => hotelClaimCapSatang(-1, 1)).toThrow(RangeError)
  })
})
