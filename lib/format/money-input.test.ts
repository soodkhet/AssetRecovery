import { describe, expect, it } from 'vitest'
import { applyMoneyPaste, isMoneyInputText, moneyChange, normalizePastedMoney, sanitizeTypedMoney } from '@/lib/format/money-input'
import { parseBahtInput } from '@/lib/format/money'

/** พิมพ์ทีละตัวจากช่องว่าง (ตัวที่ไม่รับ = ช่องคงค่าเดิม) — จำลองผู้ใช้พิมพ์ต่อท้าย */
function typeChars(text: string, start = ''): string {
  let value = start
  for (const char of text) value = sanitizeTypedMoney(value, value + char)
  return value
}

describe('isMoneyInputText — ข้อความที่อยู่ในช่องเงินได้', () => {
  it.each(['', '0', '12', '12.', '12.3', '12.34', '.5', '1500.25'])('รับ %j', (text) => {
    expect(isMoneyInputText(text)).toBe(true)
  })
  it.each(['abc', '12a', '1.2.3', '1.234', '-5', '1,500', ' 12', '1e5', '๑๒', '12..'])('ไม่รับ %j', (text) => {
    expect(isMoneyInputText(text)).toBe(false)
  })
})

describe('sanitizeTypedMoney — ระหว่างพิมพ์', () => {
  it('ตัวอักษรล้วน ⇒ ช่องว่าง', () => {
    expect(typeChars('abc')).toBe('')
  })
  it('ตัวอักษรปนตัวเลข ⇒ เหลือเฉพาะตัวเลข', () => {
    expect(typeChars('12a.3b4')).toBe('12.34')
    expect(typeChars('12,5x')).toBe('125')
  })
  it('จุดซ้อน ⇒ จุดที่สองไม่เข้า', () => {
    expect(typeChars('1..2.3')).toBe('1.23')
  })
  it('ทศนิยม 3 ตำแหน่ง ⇒ หยุดที่ 2 ตำแหน่ง (ไม่ปัดเศษ)', () => {
    expect(typeChars('1.234')).toBe('1.23')
    expect(typeChars('9.999')).toBe('9.99')
  })
  it('ติดลบไม่ได้', () => {
    expect(typeChars('-50')).toBe('50')
  })
  it('ลบตัวอักษร/ล้างช่อง ⇒ รับ', () => {
    expect(sanitizeTypedMoney('12.34', '12.3')).toBe('12.3')
    expect(sanitizeTypedMoney('12.34', '')).toBe('')
  })
  it('แทรกตัวเลขกลางทศนิยมจนเกิน 2 ตำแหน่ง ⇒ คงค่าเดิม (ไม่ตัดท้ายเงียบ)', () => {
    expect(sanitizeTypedMoney('1.23', '1.243')).toBe('1.23')
  })
  it('ค่าที่เข้าเป็นก้อน (autofill/เสนอคำ/เสียง/IME) ⇒ กติกาเดียวกับวาง: ตัดได้แค่คอมมา/ช่องว่าง', () => {
    expect(sanitizeTypedMoney('', '1,500')).toBe('1500')
    expect(sanitizeTypedMoney('', '1 500.25')).toBe('1500.25')
  })
  it.each(['-50', '1e5', '฿1,500', '12x', '1.2.3', 'abc'])('ค่าที่เข้าเป็นก้อน %j มีอักขระอื่น ⇒ ไม่รับทั้งก้อน (ไม่ตัดเงียบ)', (bulk) => {
    expect(moneyChange('7', bulk)).toEqual({ value: '7', caret: 1, rejected: true })
    expect(moneyChange('', bulk).value).toBe('')
  })
  it('ตัดอักขระได้เฉพาะพิมพ์เพิ่มทีละ 1 ตัว', () => {
    expect(moneyChange('12', '12x').value).toBe('12')
    expect(moneyChange('12', '1x2', 2)).toEqual({ value: '12', caret: 1, rejected: false })
    expect(moneyChange('12', '12xy').rejected).toBe(true)
  })
})

describe('moneyChange — ตำแหน่งเคอร์เซอร์', () => {
  it('ค่าถูกรูป ⇒ เคอร์เซอร์เดิม', () => {
    expect(moneyChange('15', '125', 2)).toEqual({ value: '125', caret: 2, rejected: false })
  })
  it('ตัดคอมมาหน้าเคอร์เซอร์ ⇒ เคอร์เซอร์ถอยตาม', () => {
    expect(moneyChange('', '1,500', 5)).toEqual({ value: '1500', caret: 4, rejected: false })
  })
  it('ไม่รับ ⇒ เคอร์เซอร์กลับตำแหน่งก่อนพิมพ์', () => {
    expect(moneyChange('1.23', '1.243', 4)).toEqual({ value: '1.23', caret: 3, rejected: true })
  })
})

describe('applyMoneyPaste — วางข้อความ', () => {
  it('ตัดคอมมาและช่องว่าง', () => {
    expect(applyMoneyPaste('', 0, 0, '1,500.25')).toBe('1500.25')
    expect(applyMoneyPaste('', 0, 0, ' 1 500 ')).toBe('1500')
    expect(applyMoneyPaste('', 0, 0, '1,500.25\n')).toBe('1500.25')
  })
  it('มีอักขระอื่น ⇒ ไม่รับทั้งก้อน', () => {
    expect(applyMoneyPaste('', 0, 0, '12x')).toBeNull()
    expect(applyMoneyPaste('', 0, 0, '-5')).toBeNull()
    expect(applyMoneyPaste('', 0, 0, '฿100')).toBeNull()
    expect(applyMoneyPaste('', 0, 0, '1e5')).toBeNull()
  })
  it('ผลรวมผิดรูป (ทศนิยมเกิน/จุดซ้อน) ⇒ ไม่รับ', () => {
    expect(applyMoneyPaste('', 0, 0, '1.234')).toBeNull()
    expect(applyMoneyPaste('1.2', 3, 3, '.5')).toBeNull()
  })
  it('แทนช่วงที่เลือก', () => {
    expect(applyMoneyPaste('1000', 1, 4, '250')).toBe('1250')
    expect(applyMoneyPaste('99.99', 0, 5, '1,234.5')).toBe('1234.5')
  })
  it('วางข้อความว่าง ⇒ ค่าเดิม', () => {
    expect(normalizePastedMoney('')).toBe('')
    expect(applyMoneyPaste('12', 2, 2, '')).toBe('12')
  })
})

describe('ข้อความที่ช่องยอมรับแปลงเป็นสตางค์ด้วยตัวแปลงเดิม', () => {
  it.each([
    ['1500.25', 150025],
    ['12.3', 1230],
    ['.5', 50],
    ['', null],
  ])('%j ⇒ %j', (text, satang) => {
    expect(isMoneyInputText(text)).toBe(true)
    expect(parseBahtInput(text)).toBe(satang)
  })
})
