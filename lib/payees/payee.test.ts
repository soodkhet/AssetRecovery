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
  payeeAddressLine,
  payeeDisplayName,
  shouldResetVerification,
  whtConditionAffectsFormula,
  toPayeeAuditPayload,
  type PayeeValues,
} from '@/lib/payees/payee'
import { payeeFieldsSchema } from '@/lib/payees/schemas'

const complete = (overrides: Partial<PayeeValues> = {}): PayeeValues => ({
  payeeType: 'individual',
  taxProfileId: '11111111-1111-1111-1111-111111111111',
  nationalId: '1234567890123',
  bankName: 'ธนาคารกสิกรไทย',
  accountName: 'สมชาย ใจดี',
  accountNumber: '1234567890',
  idDocumentUrl: null,
  wht402Pct: null,
  nameTitle: 'นาย',
  addressDetail: '99/1 ถ.สุขุมวิท',
  addressSubdistrict: 'คลองเตย',
  addressDistrict: 'คลองเตย',
  addressProvince: 'กรุงเทพมหานคร',
  addressPostalCode: '10110',
  branchCode: '00000',
  whtCondition: 'withhold',
  ...overrides,
})

describe('อัตราหัก 40(2) ต่อคน (มติ PO 05/10/2569 UAT U7)', () => {
  it('แก้อัตรา 40(2) ของผู้รับที่ยืนยันแล้ว ⇒ ต้องยืนยันใหม่ (กระทบยอดภาษี)', () => {
    expect(changedVerificationFields(complete(), complete({ wht402Pct: 2.5 }))).toEqual(['wht402Pct'])
    expect(shouldResetVerification({ isVerified: true, before: complete(), after: complete({ wht402Pct: 2.5 }) })).toBe(true)
  })

  it('อัตรา 40(2) ลง audit เป็น wht_40_2_pct · ไม่บังคับก่อนยืนยัน (ใช้เฉพาะเมื่อค่าตั้งเป็น 40(2))', () => {
    expect(toPayeeAuditPayload(complete({ wht402Pct: 0 })).wht_40_2_pct).toBe(0)
    expect(missingFieldsForVerification(complete())).toEqual([])
  })
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
    // ข้อมูลผู้ถูกหักบนใบ 50 ทวิ (มติ PO U94 ข้อ 1)
    ['nameTitle', complete({ nameTitle: 'นาง' })],
    ['addressDetail', complete({ addressDetail: '1 ถ.พระราม 4' })],
    ['addressPostalCode', complete({ addressPostalCode: '10500' })],
    ['whtCondition', complete({ whtCondition: 'pay_once' })],
  ])('ฟิลด์ธนาคาร/ภาษี "%s" เปลี่ยน ⇒ reset', (field, after) => {
    // ฟิลด์แรกที่เปลี่ยนคือฟิลด์ที่แก้ (เปลี่ยนเป็นนิติบุคคล ⇒ คำนำหน้าถูกล้างตามไปด้วย — นับเป็นการแก้ภาษีเช่นกัน)
    expect(changedVerificationFields(complete(), after)[0]).toBe(field)
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
      wht_40_2_pct: null,
      name_title: 'นาย',
      address_detail: '99/1 ถ.สุขุมวิท',
      address_subdistrict: 'คลองเตย',
      address_district: 'คลองเตย',
      address_province: 'กรุงเทพมหานคร',
      address_postal_code: '10110',
      branch_code: '00000',
      wht_condition: 'withhold',
    })
  })
})

describe('ข้อมูลผู้ถูกหักบนใบ 50 ทวิ (มติ PO 06/10/2569 UAT U94 ข้อ 1)', () => {
  it('ยืนยันไม่ได้ถ้าที่อยู่ไม่ครบ 5 ช่อง — แจ้งชื่อช่องที่ขาด', () => {
    const values = complete({ addressDetail: null, addressPostalCode: '  ' })
    expect(missingFieldsForVerification(values)).toEqual(['addressDetail', 'addressPostalCode'])
    expect(() => assertPayeeReadyForVerification({ values, requireIdDocument: false })).toThrow(PayeeError)
  })

  it('ชื่อบนเอกสาร: บุคคลธรรมดาต่อคำนำหน้า · นิติบุคคลไม่ต่อ · ไม่ต่อซ้ำ', () => {
    expect(payeeDisplayName({ name: 'สมชาย ใจดี', nameTitle: 'นาย', payeeType: 'individual' })).toBe('นายสมชาย ใจดี')
    expect(payeeDisplayName({ name: 'นายสมชาย ใจดี', nameTitle: 'นาย', payeeType: 'individual' })).toBe('นายสมชาย ใจดี')
    expect(payeeDisplayName({ name: 'บริษัท ก จำกัด', nameTitle: 'นาย', payeeType: 'corporate' })).toBe('บริษัท ก จำกัด')
    expect(payeeDisplayName({ name: 'สมชาย', nameTitle: null, payeeType: 'individual' })).toBe('สมชาย')
  })

  it('normalize: นิติบุคคลไม่มีคำนำหน้า · บุคคลธรรมดาไม่มีสาขา (เก็บเป็นสำนักงานใหญ่)', () => {
    const corporate = normalizePayeeValues(complete({ payeeType: 'corporate', branchCode: '00002' }))
    expect(corporate.nameTitle).toBeNull()
    expect(corporate.branchCode).toBe('00002')
    expect(normalizePayeeValues(complete({ branchCode: '00002' })).branchCode).toBe('00000')
  })

  it('ที่อยู่บรรทัดเดียวจากโปรไฟล์', () => {
    expect(payeeAddressLine(complete())).toBe('99/1 ถ.สุขุมวิท แขวงคลองเตย เขตคลองเตย กรุงเทพมหานคร 10110')
  })

  it('เงื่อนไข (2)/(3) บันทึก/พิมพ์เท่านั้น — สูตรยังเป็นแบบหัก ณ ที่จ่าย', () => {
    expect(whtConditionAffectsFormula('withhold')).toBe(false)
    expect(whtConditionAffectsFormula('pay_always')).toBe(true)
    expect(whtConditionAffectsFormula('pay_once')).toBe(true)
  })

  it('Zod: รหัสสาขา/รหัสไปรษณีย์ต้องเป็นตัวเลข 5 หลัก · ไม่ส่งฟิลด์ใหม่มา = undefined (คงค่าเดิมตอนแก้ไข)', () => {
    const base = { payeeType: 'corporate', taxProfileId: '', nationalId: '', bankName: '', accountName: '', accountNumber: '', idDocumentUrl: '' }
    const parsed = payeeFieldsSchema.parse(base)
    expect(parsed.nameTitle).toBeUndefined()
    expect(parsed.address).toBeUndefined()
    expect(parsed.branchCode).toBeUndefined()
    expect(parsed.whtCondition).toBeUndefined()
    expect(payeeFieldsSchema.safeParse({ ...base, branchCode: '1' }).success).toBe(false)
    expect(
      payeeFieldsSchema.safeParse({
        ...base,
        address: { detail: '', postalCode: '123', province: '', district: '', subdistrict: '' },
      }).success,
    ).toBe(false)
    const ok = payeeFieldsSchema.parse({
      ...base,
      nameTitle: '',
      address: { detail: '1', postalCode: '10110', province: 'กรุงเทพมหานคร', district: '', subdistrict: '' },
      branchCode: '00001',
      whtCondition: 'pay_always',
    })
    expect(ok.nameTitle).toBeNull()
    expect(ok.address?.district).toBeNull()
    expect(ok.whtCondition).toBe('pay_always')
  })
})
