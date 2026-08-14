import { describe, expect, it } from 'vitest'
import { PayeeError } from '@/lib/payees/errors'
import {
  assertPayeeNationalId,
  assertPayeeReadyForVerification,
  changedVerificationFields,
  checkBankAccountName,
  maskAccountNumber,
  missingFieldsForVerification,
  normalizeAccountNumber,
  normalizePayeeValues,
  shouldResetVerification,
  toPayeeAuditPayload,
  type PayeeValues,
} from '@/lib/payees/payee'

const complete = (overrides: Partial<PayeeValues> = {}): PayeeValues => ({
  payeeType: 'individual',
  taxProfileId: '11111111-1111-1111-1111-111111111111',
  nationalId: '1234567890123',
  bankName: 'ธนาคารกสิกรไทย',
  accountName: 'สมชาย ใจดี',
  accountNumber: '1234567890',
  idDocumentUrl: null,
  ...overrides,
})

describe('normalize (`18` §7.1)', () => {
  it('เลขบัญชีเก็บเฉพาะตัวเลข — ขีด/ช่องว่างเป็นแค่การแสดงผล', () => {
    expect(normalizeAccountNumber('123-4-56789-0')).toBe('1234567890')
    expect(normalizeAccountNumber('  ')).toBeNull()
    expect(normalizeAccountNumber(null)).toBeNull()
  })

  it('เลข 13 หลักตัดขีดออกเหมือนกับเลขผู้เสียภาษีของบริษัทไฟแนนซ์ (ใช้ตัวตรวจร่วมกัน)', () => {
    expect(normalizePayeeValues(complete({ nationalId: '1-2345-67890-12-3' })).nationalId).toBe('1234567890123')
  })

  it('ช่องข้อความว่างกลายเป็น null ไม่ใช่ empty string', () => {
    const values = normalizePayeeValues(complete({ bankName: '   ', accountName: '' }))
    expect(values.bankName).toBeNull()
    expect(values.accountName).toBeNull()
  })
})

describe('assertPayeeNationalId (`18` §7.1 — รูปแบบอย่างเดียว ไม่มี checksum)', () => {
  it('ผ่านเมื่อเป็นตัวเลข 13 หลัก และคืนค่าที่ normalize แล้ว', () => {
    expect(assertPayeeNationalId('1-2345-67890-12-3')).toBe('1234567890123')
  })

  it('null ผ่านได้ (ตอนสร้างยังไม่ต้องกรอก)', () => {
    expect(assertPayeeNationalId(null)).toBeNull()
  })

  it.each(['12345', '12345678901234', 'abcdefghijklm'])('ปฏิเสธ %s', (value) => {
    expect(() => assertPayeeNationalId(value)).toThrow(PayeeError)
  })
})

describe('auto-reset verification (`18` §9 · `23` §6.2)', () => {
  it('แก้เลขบัญชีของ payee ที่ verified แล้ว ⇒ ต้องยืนยันใหม่', () => {
    const before = complete()
    const after = complete({ accountNumber: '9999999999' })
    expect(changedVerificationFields(before, after)).toEqual(['accountNumber'])
    expect(shouldResetVerification({ isVerified: true, before, after })).toBe(true)
  })

  it.each([
    ['taxProfileId', complete({ taxProfileId: '22222222-2222-2222-2222-222222222222' })],
    ['nationalId', complete({ nationalId: '9876543210987' })],
    ['bankName', complete({ bankName: 'ธนาคารไทยพาณิชย์' })],
    ['accountName', complete({ accountName: 'สมหญิง ใจงาม' })],
    ['payeeType', complete({ payeeType: 'corporate' })],
  ])('ฟิลด์ธนาคาร/ภาษี "%s" เปลี่ยน ⇒ reset', (field, after) => {
    expect(changedVerificationFields(complete(), after)).toEqual([field])
    expect(shouldResetVerification({ isVerified: true, before: complete(), after })).toBe(true)
  })

  it('เปลี่ยนแค่รูปแบบการเขียนเลขบัญชี (ขีด) ไม่นับว่าแก้', () => {
    const after = complete({ accountNumber: '123-456-7890' })
    expect(changedVerificationFields(complete(), after)).toEqual([])
    expect(shouldResetVerification({ isVerified: true, before: complete(), after })).toBe(false)
  })

  it('เอกสารยืนยันตัวตนไม่ใช่ปลายทางของเงิน ⇒ แนบเพิ่มแล้วไม่ reset', () => {
    const after = complete({ idDocumentUrl: 'https://example.com/id.pdf' })
    expect(changedVerificationFields(complete(), after)).toEqual([])
  })

  it('payee ที่ยัง unverified ไม่มีอะไรให้ reset', () => {
    expect(
      shouldResetVerification({
        isVerified: false,
        before: complete(),
        after: complete({ accountNumber: '9999999999' }),
      }),
    ).toBe(false)
  })
})

describe('checkBankAccountName (`18` §11 — เตือน ไม่ block)', () => {
  it('ตรงกันเมื่อเขียนเหมือนกัน', () => {
    expect(checkBankAccountName('สมชาย ใจดี', 'สมชาย ใจดี').matches).toBe(true)
  })

  it('ต่างแค่ช่องว่าง/คำนำหน้า ยังถือว่าตรง', () => {
    expect(checkBankAccountName('สมชาย ใจดี', 'นายสมชาย  ใจดี').matches).toBe(true)
    expect(checkBankAccountName('Somchai Jaidee', 'MR. SOMCHAI JAIDEE').matches).toBe(true)
  })

  it('คนละชื่อ ⇒ ไม่ตรง (แต่ไม่ throw — เป็น warning)', () => {
    const result = checkBankAccountName('สมชาย ใจดี', 'สมหญิง ใจงาม')
    expect(result.matches).toBe(false)
    expect(result.accountName).toBe('สมหญิง ใจงาม')
  })

  it('ยังไม่กรอกชื่อบัญชี ⇒ ไม่เตือน (ปล่อยให้ REQUIRED_MISSING ตอนยืนยันจัดการ)', () => {
    expect(checkBankAccountName('สมชาย ใจดี', null).matches).toBe(true)
    expect(checkBankAccountName('สมชาย ใจดี', '   ').matches).toBe(true)
  })
})

describe('assertPayeeReadyForVerification (`18` §9/§10)', () => {
  it('ข้อมูลครบ + policy ปิด ⇒ ผ่าน', () => {
    expect(() =>
      assertPayeeReadyForVerification({ values: complete(), requireIdDocument: false }),
    ).not.toThrow()
  })

  it('ขาดข้อมูลธนาคาร ⇒ REQUIRED_MISSING พร้อมรายชื่อฟิลด์', () => {
    const values = complete({ bankName: null, accountNumber: null })
    expect(missingFieldsForVerification(values)).toEqual(['bankName', 'accountNumber'])
    expect(() => assertPayeeReadyForVerification({ values, requireIdDocument: false })).toThrow(
      expect.objectContaining({ code: 'REQUIRED_MISSING' }),
    )
  })

  it('ยังไม่ผูก Tax Profile ⇒ ยืนยันไม่ได้ (`18` §7.1 required)', () => {
    expect(() =>
      assertPayeeReadyForVerification({ values: complete({ taxProfileId: null }), requireIdDocument: false }),
    ).toThrow(expect.objectContaining({ code: 'REQUIRED_MISSING' }))
  })

  it('policy `require_payee_id_document = true` แต่ไม่มีไฟล์แนบ ⇒ PAYEE_ID_DOCUMENT_REQUIRED', () => {
    expect(() => assertPayeeReadyForVerification({ values: complete(), requireIdDocument: true })).toThrow(
      expect.objectContaining({ code: 'PAYEE_ID_DOCUMENT_REQUIRED' }),
    )
  })

  it('policy เปิด + มีไฟล์แนบ ⇒ ผ่าน', () => {
    expect(() =>
      assertPayeeReadyForVerification({
        values: complete({ idDocumentUrl: 'https://example.com/id.pdf' }),
        requireIdDocument: true,
      }),
    ).not.toThrow()
  })

  it('เลขผู้เสียภาษีผิดรูปแบบ ⇒ INVALID_TAX_ID_FORMAT', () => {
    expect(() =>
      assertPayeeReadyForVerification({ values: complete({ nationalId: '123' }), requireIdDocument: false }),
    ).toThrow(expect.objectContaining({ code: 'INVALID_TAX_ID_FORMAT' }))
  })
})

describe('การแสดงผล / audit', () => {
  it('ปิดบังเลขบัญชีเหลือ 4 ตัวท้าย', () => {
    expect(maskAccountNumber('1234567890')).toBe('••••••7890')
    expect(maskAccountNumber('123')).toBe('123')
    expect(maskAccountNumber(null)).toBeNull()
  })

  it('audit payload ใช้ชื่อคอลัมน์ snake_case ตามตารางจริง', () => {
    expect(toPayeeAuditPayload(complete())).toEqual({
      payee_type: 'individual',
      tax_profile_id: '11111111-1111-1111-1111-111111111111',
      national_id: '1234567890123',
      bank_name: 'ธนาคารกสิกรไทย',
      account_name: 'สมชาย ใจดี',
      account_number: '1234567890',
      id_document_url: null,
    })
  })
})
