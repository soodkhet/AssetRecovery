import { describe, expect, it } from 'vitest'
import { normalizeTaxId } from '@/lib/finance-companies/company'
import { bankAccountNumberProblem } from '@/lib/format/bank-account'
import { applyNumericPaste, normalizeNumericPaste, numericChange, numericRule, toAsciiDigits, type NumericRule } from '@/lib/format/numeric-input'
import { normalizePhoneInput, PHONE_INPUT_SEPARATORS } from '@/lib/cases/case'
import { parseTacInput } from '@/lib/device-catalog/tac'

/** พิมพ์ทีละตัวต่อท้าย (ตัวที่ไม่รับ = ช่องคงค่าเดิม) */
function typeChars(rule: NumericRule, text: string, start = ''): string {
  let value = start
  for (const char of text) value = numericChange(rule, value, value + char).value
  return value
}

describe('kind=decimal (เปอร์เซ็นต์ NUMERIC(5,2))', () => {
  const pct = numericRule({ kind: 'decimal' })
  it.each(['', '0', '3', '3.', '2.5', '2.50', '.5', '100.00'])('รับ %j', (text) => {
    expect(pct.accepts(text)).toBe(true)
  })
  it.each(['abc', '3%', '-3', '1e2', '2.505', '1.2.3', '3,5', ' 3'])('ไม่รับ %j', (text) => {
    expect(pct.accepts(text)).toBe(false)
  })
  it('พิมพ์ตัวอักษร/ขีด/e ⇒ ไม่เข้า · ทศนิยมเกิน 2 ⇒ หยุด', () => {
    expect(typeChars(pct, 'a3e-.5x07')).toBe('3.50')
    expect(typeChars(pct, '-7')).toBe('7')
  })
  it('maxDigits = จำนวนหลักหน้าจุด (เปอร์เซ็นต์ ≤ 3 หลัก)', () => {
    const pct3 = numericRule({ kind: 'decimal', maxDigits: 3 })
    expect(typeChars(pct3, '1000.5')).toBe('100.5')
    expect(applyNumericPaste(pct3, '', 0, 0, '1000')).toBeNull()
  })
  it('decimals กำหนดเองได้ (0 = จำนวนเต็ม)', () => {
    expect(typeChars(numericRule({ kind: 'decimal', decimals: 3 }), '1.2345')).toBe('1.234')
    expect(typeChars(numericRule({ kind: 'decimal', decimals: 0 }), '1.5')).toBe('15')
  })
  it('วาง: ตัดช่องว่างได้ · คอมมา/เครื่องหมาย % ⇒ ไม่รับทั้งก้อน', () => {
    expect(applyNumericPaste(pct, '', 0, 0, ' 2.50 ')).toBe('2.50')
    expect(applyNumericPaste(pct, '', 0, 0, '3,5')).toBeNull()
    expect(applyNumericPaste(pct, '', 0, 0, '3%')).toBeNull()
    expect(applyNumericPaste(pct, '', 0, 0, '2.505')).toBeNull()
  })
})

describe('kind=integer (ชั่วโมง/วัน/ปี/จำนวนคืน)', () => {
  const int = numericRule({ kind: 'integer' })
  it('พิมพ์ได้เฉพาะตัวเลข — จุด/ขีด/e/ตัวอักษรไม่เข้า', () => {
    expect(typeChars(int, '1.5')).toBe('15')
    expect(typeChars(int, '-3e2x')).toBe('32')
    expect(typeChars(int, 'abc')).toBe('')
  })
  it('เลข 0 นำหน้าคงอยู่ (ไม่แปลงเป็นตัวเลขระหว่างพิมพ์)', () => {
    expect(typeChars(int, '007')).toBe('007')
  })
  it('maxDigits ⇒ พิมพ์เกินไม่เข้า · วางเกิน ⇒ ไม่รับ (ไม่ตัดเงียบ)', () => {
    const year = numericRule({ kind: 'integer', maxDigits: 4 })
    expect(typeChars(year, '25689')).toBe('2568')
    expect(applyNumericPaste(year, '', 0, 0, '25689')).toBeNull()
  })
  it('วาง: ตัดคอมมา/ช่องว่างได้ · มีอักขระอื่น ⇒ ไม่รับ', () => {
    expect(applyNumericPaste(int, '', 0, 0, '1,000')).toBe('1000')
    expect(applyNumericPaste(int, '', 0, 0, ' 24\n')).toBe('24')
    expect(applyNumericPaste(int, '', 0, 0, '1.5')).toBeNull()
    expect(applyNumericPaste(int, '', 0, 0, '-1')).toBeNull()
    expect(applyNumericPaste(int, '', 0, 0, '2e3')).toBeNull()
  })
  it('เลขไทยไม่แปลง (กติกาเดียวกับช่องเงิน) ⇒ ไม่รับ', () => {
    expect(typeChars(int, '๑๒')).toBe('')
  })
})

describe('kind=digits (รหัสที่เป็นตัวเลข — เก็บเป็นข้อความ)', () => {
  it('รหัสสาขา 5 หลัก: 0 นำหน้าคงอยู่ · เกิน 5 ไม่เข้า · ขีดไม่เข้า', () => {
    const branch = numericRule({ kind: 'digits', maxDigits: 5 })
    expect(typeChars(branch, '00001')).toBe('00001')
    expect(typeChars(branch, '000012')).toBe('00001')
    expect(typeChars(branch, '0-0a1')).toBe('001')
    expect(applyNumericPaste(branch, '', 0, 0, ' 00001 ')).toBe('00001')
    expect(applyNumericPaste(branch, '', 0, 0, '0000-1')).toBeNull()
  })

  it('เลขผู้เสียภาษี: พิมพ์/วางขีดและช่องว่างคั่นได้ (spec ยอมรับ) — นับ 13 หลักไม่รวมตัวคั่น · ตัวอักษรไม่รับ', () => {
    const taxId = numericRule({ kind: 'digits', separators: '- ', maxDigits: 13 })
    const pasted = applyNumericPaste(taxId, '', 0, 0, '0-1055-12345-67-8')
    expect(pasted).toBe('0-1055-12345-67-8')
    expect(normalizeTaxId(pasted ?? '')).toBe('0105512345678')
    expect(typeChars(taxId, '01055123456789')).toBe('0105512345678')
    expect(typeChars(taxId, '0a1')).toBe('01')
    expect(applyNumericPaste(taxId, '', 0, 0, 'TH0105512345678')).toBeNull()
    expect(applyNumericPaste(taxId, '', 0, 0, '01055123456789')).toBeNull()
  })

  it('เลขบัญชี: ขีด/ช่องว่างคั่นได้ ยาวรวม ≤ maxLength · ค่าที่รับผ่านกติกาเลขบัญชีเดิม', () => {
    const account = numericRule({ kind: 'digits', separators: '- ', maxLength: 30 })
    expect(typeChars(account, '123-4-56789-0')).toBe('123-4-56789-0')
    expect(bankAccountNumberProblem('123-4-56789-0')).toBeNull()
    expect(typeChars(account, '12x3')).toBe('123')
    expect(applyNumericPaste(account, '', 0, 0, '1'.repeat(31))).toBeNull()
    expect(applyNumericPaste(account, '', 0, 0, 'abc-12')).toBeNull()
    expect(applyNumericPaste(account, '', 0, 0, ` ${'1'.repeat(30)} `)).toBe('1'.repeat(30))
  })

  it('เบอร์โทรเคส: วางพร้อมตัวคั่น/+66 ได้ (แปลงต่อด้วย normalizePhoneInput เดิม) · ตัวอักษรไม่รับ', () => {
    const phone = numericRule({ kind: 'digits', separators: PHONE_INPUT_SEPARATORS, maxLength: 32 })
    for (const text of ['+66 81 234 5678', '081-234-5678', '(081) 234.5678']) {
      const pasted = applyNumericPaste(phone, '', 0, 0, text)
      expect(pasted).not.toBeNull()
      expect(normalizePhoneInput(pasted ?? '')).toBe('0812345678')
    }
    expect(applyNumericPaste(phone, '', 0, 0, '081-234-5678 ต่อ 12')).toBeNull()
    expect(typeChars(phone, '08a1')).toBe('081')
  })

  it('TAC: ช่องว่าง/ขีด/จุดคั่นได้ (ตาม parseTacInput เดิม) 8 หลัก', () => {
    const tac = numericRule({ kind: 'digits', separators: ' -.', maxDigits: 8 })
    const pasted = applyNumericPaste(tac, '', 0, 0, '3512.3456')
    expect(parseTacInput(pasted)).toBe('35123456')
    expect(applyNumericPaste(tac, '', 0, 0, '351234567')).toBeNull()
  })

  it('เลขไทย/เลขเต็มความกว้างแปลงเป็นอารบิก (เดิมช่องเบอร์/บัตรประชาชนแปลงให้อยู่แล้ว)', () => {
    const digits = numericRule({ kind: 'digits', maxDigits: 13 })
    expect(numericChange(digits, '', '๐๘๑')).toEqual({ value: '081', caret: 3, rejected: false })
    expect(normalizeNumericPaste(digits, '０８１')).toBe('081')
    expect(toAsciiDigits('๑２+＋')).toBe('12++')
  })
})

describe('numericChange — กติการ่วม', () => {
  const int = numericRule({ kind: 'integer' })
  it('ค่าเข้าเป็นก้อนมีอักขระอื่น ⇒ ไม่รับทั้งก้อน + เคอร์เซอร์กลับที่เดิม', () => {
    expect(numericChange(int, '7', '7-1e5x', 6)).toEqual({ value: '7', caret: 1, rejected: true })
  })
  it('พิมพ์ตัวอักษรกลางค่า ⇒ ทิ้งตัวอักษร เคอร์เซอร์คงตำแหน่ง', () => {
    expect(numericChange(int, '12', '1x2', 2)).toEqual({ value: '12', caret: 1, rejected: false })
  })
  it('ค่าเดิมผิดรูป (ข้อมูลเก่า) ⇒ ลบให้สั้นลงได้', () => {
    const branch = numericRule({ kind: 'digits', maxDigits: 5 })
    expect(numericChange(branch, '0000a', '0000').rejected).toBe(false)
    expect(numericChange(branch, '0000ab', '0000a').value).toBe('0000a')
    // เลือกบางส่วนแล้วพิมพ์ทับด้วยอักขระอื่น ⇒ ไม่ใช่การลบ ⇒ ไม่รับ
    expect(numericChange(branch, '12a3', '12x', 3).rejected).toBe(true)
  })
})
