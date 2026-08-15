import { describe, expect, it } from 'vitest'
import {
  bahtAmountString,
  buildPaymentFile,
  encodePaymentFile,
  encodeTis620,
  type PaymentFileRowInput,
} from '@/lib/payout/bank-file-builder'
import { resolveBankCode } from '@/lib/payout/bank-codes'

/** `17` §6.4 · `13` §6.8 — ไฟล์โอนต้องประกอบตาม `column_mapping` ที่ตั้งไว้ ไม่ใช่ลำดับตายตัวในโค้ด */

const row = (overrides: Partial<PaymentFileRowInput> = {}): PaymentFileRowInput => ({
  receivingBankCode: '004',
  receivingAccountNo: '1234567890',
  receivingAccountName: 'สมชาย ใจดี',
  netSatang: 485_000,
  citizenId: '1234567890123',
  email: null,
  mobileNo: '0812345678',
  remark: 'ค่าตอบแทนรอบ 08/2569',
  referenceNo: 'PB-OUT-25690815-AAA-1',
  ...overrides,
})

const base = {
  payerAccountNo: '9876543210',
  payerName: 'บริษัท แอสเซท รีคัฟเวอรี่ จำกัด',
  transferDate: new Date('2026-08-15T03:00:00Z'),
}

describe('ยอดเงินในไฟล์ (Rule 01 — satang เท่านั้น)', () => {
  it.each([
    [485_000, '4850.00'],
    [10_050, '100.50'],
    [7, '0.07'],
    [0, '0.00'],
  ])('%d satang → %s บาท', (satang, expected) => {
    expect(bahtAmountString(satang)).toBe(expected)
  })

  it('ค่าที่ไม่ใช่ satang จำนวนเต็มไม่ผ่าน (กันบั๊กเงินทศนิยม)', () => {
    expect(() => bahtAmountString(100.5)).toThrow(RangeError)
    expect(() => bahtAmountString(-1)).toThrow(RangeError)
  })
})

describe('ประกอบไฟล์ตาม column_mapping', () => {
  it('CSV เรียงคอลัมน์ตามที่ตั้งไว้เป๊ะ + วันที่เป็น พ.ศ.', () => {
    const file = buildPaymentFile({
      ...base,
      columnMapping: 'receiving_bank_code, receiving_account_no, receiving_account_name, amount, transfer_date, reference_no',
      fileType: 'CSV',
      rows: [row()],
    })
    expect(file.text).toBe(
      '004,1234567890,สมชาย ใจดี,4850.00,15/08/2569,PB-OUT-25690815-AAA-1\n',
    )
    expect(file.rowCount).toBe(1)
  })

  it('สลับลำดับ mapping = สลับลำดับในไฟล์จริง (ไม่ hardcode)', () => {
    const file = buildPaymentFile({
      ...base,
      columnMapping: 'amount\nreceiving_account_no',
      fileType: 'CSV',
      rows: [row()],
    })
    expect(file.text).toBe('4850.00,1234567890\n')
  })

  it('TXT ใช้ `|` คั่นเหมือนตัวอย่างตอนทดสอบ format (1.10)', () => {
    const file = buildPaymentFile({
      ...base,
      columnMapping: 'receiving_account_no,amount,payer_account_no,payer_name',
      fileType: 'TXT',
      rows: [row()],
    })
    expect(file.text).toBe('1234567890|4850.00|9876543210|บริษัท แอสเซท รีคัฟเวอรี่ จำกัด\n')
  })

  it('CSV ครอบ `"` เมื่อค่ามีลูกน้ำ (กันคอลัมน์เลื่อน)', () => {
    const file = buildPaymentFile({
      ...base,
      columnMapping: 'receiving_account_name,amount',
      fileType: 'CSV',
      rows: [row({ receivingAccountName: 'บริษัท ก, จำกัด' })],
    })
    expect(file.text).toBe('"บริษัท ก, จำกัด",4850.00\n')
  })

  it('ค่าที่ไม่มี (อีเมล/เบอร์) ออกเป็นช่องว่าง ไม่ใช่ null', () => {
    const file = buildPaymentFile({
      ...base,
      columnMapping: 'email,mobile_no,citizen_id',
      fileType: 'CSV',
      rows: [row({ email: null, mobileNo: null, citizenId: null })],
    })
    expect(file.text).toBe(',,\n')
  })

  it('หลายรายการ = หลายบรรทัด + ปิดท้ายด้วย newline เสมอ', () => {
    const file = buildPaymentFile({
      ...base,
      columnMapping: 'amount',
      fileType: 'CSV',
      rows: [row(), row({ netSatang: 100 })],
    })
    expect(file.text).toBe('4850.00\n1.00\n')
  })

  it('input เดิม → ไฟล์เดิมทุกครั้ง (deterministic — hash เทียบย้อนหลังได้)', () => {
    const input = { ...base, columnMapping: 'amount,transfer_date', fileType: 'CSV' as const, rows: [row()] }
    expect(buildPaymentFile(input).text).toBe(buildPaymentFile(input).text)
  })
})

describe('encoding (`13` §6.8)', () => {
  it('UTF-8 = ไบต์มาตรฐาน', () => {
    expect(encodePaymentFile('AB', 'UTF_8')).toEqual(Uint8Array.from([0x41, 0x42]))
  })

  it('TIS-620 แปลงอักษรไทยเป็นไบต์เดียว', () => {
    // ก = U+0E01 → 0xA1 · ฮ = U+0E2E → 0xCE
    expect(encodeTis620('กฮA')).toEqual(Uint8Array.from([0xa1, 0xce, 0x41]))
  })

  it('TIS-620 แทนอักขระที่เก็บไม่ได้ด้วย ?', () => {
    expect(encodeTis620('好')).toEqual(Uint8Array.from([0x3f]))
  })
})

describe('รหัสธนาคาร (ไฟล์โอนต้องมีรหัสปลายทาง)', () => {
  it.each([
    ['ธนาคารกสิกรไทย', '004'],
    ['kbank', '004'],
    ['ไทยพาณิชย์', '014'],
    ['SCB', '014'],
    ['ธนาคารกรุงเทพ จำกัด (มหาชน)', '002'],
    ['ธ.ก.ส. — ธนาคารเพื่อการเกษตรและสหกรณ์การเกษตร', '034'],
  ])('%s → %s', (name, code) => {
    expect(resolveBankCode(name)).toBe(code)
  })

  it('ชื่อที่ไม่รู้จัก/ว่าง = null (ห้ามเดารหัส)', () => {
    expect(resolveBankCode('ธนาคารสมมติ')).toBeNull()
    expect(resolveBankCode('   ')).toBeNull()
    expect(resolveBankCode(null)).toBeNull()
  })
})
