import { describe, expect, it } from 'vitest'
import {
  BANK_ACCOUNT_USAGE_LABEL,
  DEFAULT_AUTO_MATCH_TOLERANCE_DAYS,
  canPayFrom,
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
  statementFormat: '  ',
  paymentFileFormat: ' KBANK-CSV ',
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
    expect(values.statementFormat).toBeNull()
    expect(values.paymentFileFormat).toBe('KBANK-CSV')
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
