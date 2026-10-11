import { describe, expect, it } from 'vitest'
import { payeeBankOptions, resolveBankCode, THAI_BANK_CODES } from '@/lib/banks/thai-banks'

describe('payeeBankOptions (mytester A-16)', () => {
  it('ทุกตัวเลือกแปลงกลับเป็นรหัสธนาคารของตัวเองได้ตรง (ไฟล์โอนใช้รหัสถูก)', () => {
    const options = payeeBankOptions('')
    expect(options.length).toBeGreaterThan(10)
    for (const option of options) {
      const entry = THAI_BANK_CODES.find((bank) => bank.name === option.value)
      expect(entry).toBeDefined()
      expect(resolveBankCode(option.value)).toBe(entry?.code)
    }
    expect(options.map((option) => option.value)).toEqual(
      expect.arrayContaining(['ธนาคารกสิกรไทย', 'ธนาคารกรุงไทย', 'ธนาคารไทยพาณิชย์', 'ธนาคารกรุงเทพ']),
    )
  })

  it('ค่ามาตรฐานไม่เพิ่มตัวเลือกซ้ำ', () => {
    expect(payeeBankOptions('ธนาคารกสิกรไทย')).toEqual(payeeBankOptions(''))
  })

  it('ค่าเดิมที่พิมพ์เองคงไว้เป็นตัวเลือกแรก พร้อมบอกว่าระบบอ่านเป็นธนาคารอะไร / อ่านไม่ออก', () => {
    const [legacy] = payeeBankOptions('กสิกร')
    expect(legacy).toEqual({ value: 'กสิกร', label: 'กสิกร (ค่าเดิม — ระบบอ่านเป็นธนาคารกสิกรไทย)' })
    const [unknown] = payeeBankOptions('ธนาคารดาวอังคาร')
    expect(unknown?.label).toContain('ไม่อยู่ในรายการ')
  })
})
