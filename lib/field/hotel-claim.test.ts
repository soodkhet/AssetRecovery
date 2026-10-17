import { describe, expect, it } from 'vitest'
import { FieldError } from '@/lib/field/errors'
import {
  assertHotelClaimWithinCap,
  assertHotelReceiptPolicy,
  hotelCapExceededMessage,
  hotelClaimCapSatang,
  isHotelClaimOverCap,
  assertHotelClaimFields,
  assertSharedAgentInTeam,
  hotelClaimFormError,
  hotelClaimFormIssue,
  hotelNightsCapText,
  hotelStayDateKeys,
  isValidHotelNights,
  missingHotelClaimFields,
  parseHotelNightsInput,
  receiptInCompanyNameText,
  hotelReceiptNameText,
  effectiveReceiptInCompanyName,
} from '@/lib/field/hotel-claim'
import { hotelClaimSchema, resubmitExpenseSchema } from '@/lib/field/schemas'

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
    // มติ PO U103 — ช่องใบเสร็จยอมรับใบรับรองแทนใบเสร็จ (ติ๊ก "ไม่มีใบเสร็จ") แทนได้
    expect(missingHotelClaimFields({ ...valid, receiptFileUrl: null, hasSubstituteReceipt: true })).toEqual([])
    expect(missingHotelClaimFields({ ...valid, receiptFileUrl: null, hasSubstituteReceipt: false })).toEqual(['receiptFileUrl'])
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
    expect(hotelClaimFormError({ ...ok, hasReceipt: false })).toBe('ต้องแนบใบเสร็จ (หรือติ๊ก "ไม่มีใบเสร็จ" แล้วกรอกรายการ) ก่อนส่งคำขอเบิก')
    expect(hotelClaimFormError(ok)).toBeNull()
  })

  it('mytester6 T-014: แผนบังคับใบเสร็จ — ข้อความไม่ชี้ไปที่ตัวเลือก "ไม่มีใบเสร็จ" (ซึ่งถูกซ่อน)', () => {
    const issue = hotelClaimFormIssue({ ...ok, hasReceipt: false, receiptRequired: true })
    expect(issue).toEqual({ field: 'receipt', message: 'ต้องแนบใบเสร็จก่อนส่งคำขอเบิก' })
    expect(issue?.message).not.toContain('ไม่มีใบเสร็จ')
    expect(hotelClaimFormIssue({ ...ok, hasReceipt: false, receiptRequired: false })?.message).toContain('ติ๊ก "ไม่มีใบเสร็จ"')
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
    expect(() => hotelClaimCapSatang(80_000, 32)).toThrow(RangeError)
  })
})

describe('จำนวนคืนของใบเบิกค่าที่พัก (มติ PO O50)', () => {
  it('1 / 2 / 31 คืน = ถูกต้อง · 0 / 32 / ทศนิยม = ผิด', () => {
    for (const nights of [1, 2, 31]) expect(isValidHotelNights(nights)).toBe(true)
    for (const nights of [0, 32, -1, 1.5, Number.NaN]) expect(isValidHotelNights(nights)).toBe(false)
  })

  it('เพดานรวม 1 / 2 / 31 คืน', () => {
    expect(hotelClaimCapSatang(80_000, 1)).toBe(80_000)
    expect(hotelClaimCapSatang(80_000, 2)).toBe(160_000)
    expect(hotelClaimCapSatang(80_000, 31)).toBe(2_480_000)
    expect(() => hotelClaimCapSatang(80_000, 0)).toThrow(RangeError)
    expect(() => hotelClaimCapSatang(80_000, 32)).toThrow(RangeError)
  })

  it('ช่องในฟอร์ม: ว่าง = 1 · ตัวเลขในช่วง = ค่านั้น · อื่น ๆ = null (ไม่ปัดเศษ)', () => {
    expect(parseHotelNightsInput('')).toBe(1)
    expect(parseHotelNightsInput('  ')).toBe(1)
    expect(parseHotelNightsInput('2')).toBe(2)
    expect(parseHotelNightsInput(' 31 ')).toBe(31)
    for (const text of ['0', '32', '1.5', '-1', '2 คืน', 'abc']) expect(parseHotelNightsInput(text)).toBeNull()
  })

  it('ข้อความฟอร์มบอกช่วงจำนวนคืน · ไม่ส่งช่องจำนวนคืน = ผ่านตามเดิม', () => {
    const ok = { expenseDate: '2026-10-03', amountBaht: '1600', hasReceipt: true }
    expect(hotelClaimFormError(ok)).toBeNull()
    expect(hotelClaimFormError({ ...ok, nightsText: '2' })).toBeNull()
    expect(hotelClaimFormError({ ...ok, nightsText: '' })).toBeNull()
    expect(hotelClaimFormError({ ...ok, nightsText: '0' })).toBe('จำนวนคืนต้องเป็นจำนวนเต็ม 1–31')
    expect(hotelClaimFormError({ ...ok, nightsText: '32' })).toBe('จำนวนคืนต้องเป็นจำนวนเต็ม 1–31')
  })

  it('Zod: ไม่ส่ง = 1 · 1/2/31 ผ่าน · 0/32/ทศนิยม ไม่ผ่าน (schema เดียวกับฟอร์ม)', () => {
    const base = { expenseDate: '2026-10-03', amountSatang: 160_000, receiptFileUrl: 'expenses/u/r.jpg' }
    const parsed = hotelClaimSchema.safeParse(base)
    expect(parsed.success && parsed.data.hotelNights).toBe(1)
    for (const hotelNights of [1, 2, 31]) expect(hotelClaimSchema.safeParse({ ...base, hotelNights }).success).toBe(true)
    for (const hotelNights of [0, 32, 1.5]) expect(hotelClaimSchema.safeParse({ ...base, hotelNights }).success).toBe(false)
    expect(resubmitExpenseSchema.safeParse({ hotelNights: 3 }).success).toBe(true)
    expect(resubmitExpenseSchema.safeParse({ hotelNights: 0 }).success).toBe(false)
    const omitted = resubmitExpenseSchema.safeParse({})
    expect(omitted.success && omitted.data.hotelNights).toBeUndefined()
  })

  it('ช่วงวันที่ auto-mapping = วันเข้าพัก … + จำนวนคืน − 1 (ข้ามเดือนได้)', () => {
    expect(hotelStayDateKeys('2026-10-03', 1)).toEqual(['2026-10-03'])
    expect(hotelStayDateKeys('2026-10-30', 3)).toEqual(['2026-10-30', '2026-10-31', '2026-11-01'])
    expect(hotelStayDateKeys('2026-10-01', 31)).toHaveLength(31)
    expect(() => hotelStayDateKeys('2026-10-01', 0)).toThrow(RangeError)
    expect(() => hotelStayDateKeys('bad', 1)).toThrow(RangeError)
  })

  it('ข้อความแสดง "2 คืน · เพดาน ฿1,600.00" · ไม่ตั้งเพดาน = จำนวนคืนอย่างเดียว', () => {
    expect(hotelNightsCapText(2, 80_000)).toBe('2 คืน · เพดาน ฿1,600.00')
    expect(hotelNightsCapText(1, 80_000)).toBe('1 คืน · เพดาน ฿800.00')
    expect(hotelNightsCapText(2, null)).toBe('2 คืน')
  })
})

describe('ใบเสร็จค่าที่พักในนามบริษัท (มติ PO U96 #14)', () => {
  it('ไม่ส่ง = ไม่ติ๊ก (ค่าเริ่มต้น) · ส่ง true ได้ · ไม่ใช่ boolean ถูกปฏิเสธ', () => {
    const body = {
      expenseDate: '2026-08-10',
      amountSatang: 80_000,
      receiptFileUrl: 'expenses/u/receipts/a.jpg',
    }
    expect(hotelClaimSchema.parse(body).receiptInCompanyName).toBe(false)
    expect(hotelClaimSchema.parse({ ...body, receiptInCompanyName: true }).receiptInCompanyName).toBe(true)
    expect(hotelClaimSchema.safeParse({ ...body, receiptInCompanyName: 'yes' }).success).toBe(false)
    expect(resubmitExpenseSchema.parse({}).receiptInCompanyName).toBeUndefined()
    expect(resubmitExpenseSchema.parse({ receiptInCompanyName: false }).receiptInCompanyName).toBe(false)
  })

  it('ป้ายแสดงผล', () => {
    expect(receiptInCompanyNameText(true)).toBe('ใบเสร็จในนามบริษัท')
    expect(receiptInCompanyNameText(false)).toBe('ใบเสร็จไม่ได้ออกในนามบริษัท')
    // mytester5 D-OUT5-01 — ใช้ใบรับรองแทนใบเสร็จ ⇒ ไม่มีป้าย
    expect(hotelReceiptNameText(false, true)).toBeNull()
    expect(hotelReceiptNameText(false, false)).toBe('ใบเสร็จไม่ได้ออกในนามบริษัท')
  })

  it('mytester5 รีวิว D-OUT5-01: ใช้ใบรับรองแทนใบเสร็จที่ยังมีผล ⇒ ค่าจริงเป็น false เสมอ (ครอบข้อมูลเก่าที่บันทึก true)', () => {
    expect(effectiveReceiptInCompanyName(true, true)).toBe(false)
    expect(effectiveReceiptInCompanyName(false, true)).toBe(false)
    expect(effectiveReceiptInCompanyName(true, false)).toBe(true)
    expect(effectiveReceiptInCompanyName(false, false)).toBe(false)
  })
})

describe('assertHotelReceiptPolicy (known Q7/M2 · DO-02)', () => {
  it('แผนบังคับใบเสร็จ + ใช้ใบรับรองแทน หรือไม่แนบอะไร ⇒ HOTEL_CLAIM_FIELD_REQUIRED (ช่องใบเสร็จ)', () => {
    for (const input of [
      { hasReceiptFile: false, hasSubstituteReceipt: true, receiptRequired: true },
      { hasReceiptFile: false, hasSubstituteReceipt: false, receiptRequired: true },
    ]) {
      expect(() => assertHotelReceiptPolicy(input)).toThrow(
        expect.objectContaining({ code: 'HOTEL_CLAIM_FIELD_REQUIRED', context: expect.objectContaining({ missing: ['receiptFileUrl'] }) }),
      )
    }
  })
  it('แผนบังคับ + แนบใบเสร็จจริง ⇒ ผ่าน · แผนไม่บังคับ ⇒ ใช้ใบรับรองแทนได้ตามเดิม', () => {
    expect(() => assertHotelReceiptPolicy({ hasReceiptFile: true, hasSubstituteReceipt: false, receiptRequired: true })).not.toThrow()
    expect(() => assertHotelReceiptPolicy({ hasReceiptFile: false, hasSubstituteReceipt: true, receiptRequired: false })).not.toThrow()
  })
})

/** ตรวจซ้ำ staging SV5-R3-01 — ข้อผิดพลาดบอกช่องที่ผิด ให้ฟอร์มเลื่อน/โฟกัสไปช่องนั้น */
describe('hotelClaimFormIssue — ช่องที่ผิด', () => {
  const ok = { expenseDate: '2026-10-03', amountBaht: '600', hasReceipt: true, nightsText: '1' }

  it('ผ่าน ⇒ null · ข้อความตรงกับ hotelClaimFormError', () => {
    expect(hotelClaimFormIssue(ok)).toBeNull()
    expect(hotelClaimFormIssue({ ...ok, amountBaht: '0' })?.message).toBe(hotelClaimFormError({ ...ok, amountBaht: '0' }))
  })

  it('แต่ละข้อชี้ไปช่องของตัวเอง', () => {
    expect(hotelClaimFormIssue({ ...ok, expenseDate: '' })?.field).toBe('expenseDate')
    expect(hotelClaimFormIssue({ ...ok, nightsText: '0' })?.field).toBe('nights')
    expect(hotelClaimFormIssue({ ...ok, amountBaht: '' })?.field).toBe('amount')
    expect(hotelClaimFormIssue({ ...ok, hasReceipt: false })?.field).toBe('receipt')
  })
})
