import { describe, expect, it } from 'vitest'
import {
  BANK_ACCOUNT_USAGE_LABEL,
  DEFAULT_AUTO_MATCH_TOLERANCE_DAYS,
  bankFileFormatOptions,
  canPayFrom,
  defaultPaymentFileFormatId,
  canReceiveTo,
  maskAccountNumber,
  normalizeAccountNumber,
  normalizeBankAccountValues,
  toBankAccountAuditPayload,
  type BankAccountValues,
} from '@/lib/settings/bank-account'

/** `13` §6.3 — `usage` เป็นตัวตัดสินเดียว (`is_payout_account` ถูก deprecate ตาม DEC-006/D2) */

const base: BankAccountValues = {
  bankName: ' ธนาคารกสิกรไทย ',
  accountName: ' บริษัท แอสเซท รีคัฟเวอรี่ จำกัด ',
  accountNumber: ' 123-4-56789-0 ',
  accountType: 'current',
  usage: 'both',
  statementFormatId: '  ',
  paymentFileFormatId: ' 00000000-0000-4000-8000-0000000000f3 ',
  autoMatchToleranceDays: 7,
  isPrimary: true,
}

describe('normalizeAccountNumber', () => {
  it('ตัด - และช่องว่างทิ้ง เพื่อให้ UNIQUE จับเลขซ้ำได้จริง', () => {
    expect(normalizeAccountNumber(' 123-4-56789-0 ')).toBe('1234567890')
    expect(normalizeAccountNumber('123 456 7890')).toBe('1234567890')
  })

  it('เลขเดียวกันคนละรูปแบบ normalize แล้วเท่ากัน', () => {
    expect(normalizeAccountNumber('123-4567890')).toBe(normalizeAccountNumber('1234567890'))
  })
})

describe('normalizeBankAccountValues', () => {
  it('ตัดช่องว่าง + normalize เลขบัญชี + ข้อความว่างเป็น null', () => {
    const values = normalizeBankAccountValues(base)
    expect(values.bankName).toBe('ธนาคารกสิกรไทย')
    expect(values.accountNumber).toBe('1234567890')
    expect(values.statementFormatId).toBeNull()
    expect(values.paymentFileFormatId).toBe('00000000-0000-4000-8000-0000000000f3')
  })

  it('ค่าเริ่มต้นแนะนำของ auto-match = 7 วัน (`13` §6.3)', () => {
    expect(DEFAULT_AUTO_MATCH_TOLERANCE_DAYS).toBe(7)
  })
})

describe('canPayFrom / canReceiveTo', () => {
  it('receive = รับได้ จ่ายไม่ได้', () => {
    expect(canReceiveTo('receive')).toBe(true)
    expect(canPayFrom('receive')).toBe(false)
  })

  it('pay = จ่ายได้ รับไม่ได้', () => {
    expect(canPayFrom('pay')).toBe(true)
    expect(canReceiveTo('pay')).toBe(false)
  })

  it('both = ได้ทั้งสองทาง', () => {
    expect(canPayFrom('both')).toBe(true)
    expect(canReceiveTo('both')).toBe(true)
  })

  it('มี label ครบทั้ง 3 ค่า enum', () => {
    expect(Object.keys(BANK_ACCOUNT_USAGE_LABEL).sort()).toEqual(['both', 'pay', 'receive'])
  })
})

describe('maskAccountNumber', () => {
  it('เหลือ 4 ตัวท้าย', () => {
    expect(maskAccountNumber('123-4-56789-0')).toBe('xxxxxx7890')
  })

  it('เลขสั้นกว่า 4 ตัวไม่ปิดบัง (ไม่มีอะไรให้ปิด)', () => {
    expect(maskAccountNumber('123')).toBe('123')
  })
})

describe('toBankAccountAuditPayload', () => {
  it('ใช้ชื่อคอลัมน์ snake_case + ไม่มี is_payout_account ที่ถูก deprecate', () => {
    const payload = toBankAccountAuditPayload(normalizeBankAccountValues(base))
    expect(payload).toMatchObject({ account_number: '1234567890', usage: 'both', auto_match_tolerance_days: 7 })
    expect(payload).not.toHaveProperty('is_payout_account')
  })
})

describe('รูปแบบไฟล์ธนาคารของบัญชี (มติ PO U147 — อ้างด้วย id + ชนิดตรงช่อง)', () => {
  const formats = [
    { id: 'f1', purpose: 'payment' as const, label: 'KBank ไฟล์โอน', usable: false },
    { id: 'f2', purpose: 'payment' as const, label: 'SCB ไฟล์โอน', usable: true },
    { id: 'f3', purpose: 'payment' as const, label: 'KBank ไฟล์โอน 2', usable: true },
    { id: 's1', purpose: 'statement' as const, label: 'KBank statement', usable: true },
    { id: 's2', purpose: 'statement' as const, label: 'SCB statement', usable: true, isActive: false },
  ]

  it('ตัวเลือกเฉพาะชนิดของช่องนั้นที่ยังใช้งาน · ค่าเดิมที่ไม่อยู่ในรายการยังแสดง (missing)', () => {
    expect(bankFileFormatOptions(formats, 'statement', null).map((option) => option.value)).toEqual(['s1'])
    expect(bankFileFormatOptions(formats, 'payment', '').map((option) => option.value)).toEqual(['f1', 'f2', 'f3'])
    const withMissing = bankFileFormatOptions(formats, 'statement', 'f2')
    expect(withMissing[0]).toMatchObject({ value: 'f2', missing: true })
    expect(bankFileFormatOptions(formats, 'statement', 's2')[0]).toMatchObject({ value: 's2', missing: true })
  })

  it('ไฟล์โอน: เลือกรูปแบบไฟล์โอนที่ใช้ได้และตรงกับบัญชีก่อน · ไม่ตรง/ไม่ได้ตั้ง → ไฟล์โอนที่ใช้ได้ตัวแรก', () => {
    expect(defaultPaymentFileFormatId(formats, 'f3')).toBe('f3')
    expect(defaultPaymentFileFormatId(formats, null)).toBe('f2')
    expect(defaultPaymentFileFormatId(formats, 'f1')).toBe('f2')
    // รูปแบบ statement ไม่ถูกเลือกเป็นไฟล์โอนแม้บัญชีอ้าง id นั้น
    expect(defaultPaymentFileFormatId(formats, 's1')).toBe('f2')
    expect(defaultPaymentFileFormatId([{ id: 'x', purpose: 'payment', label: 'A', usable: false }], 'x')).toBe('')
  })
})
