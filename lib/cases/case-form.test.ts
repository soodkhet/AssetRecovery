import { describe, expect, it } from 'vitest'
import { EMPTY_ADDRESS, addressFromDto, isAddressEmpty } from '@/lib/address/address-value'
import {
  EMPTY_CASE_FORM,
  buildCasePayload,
  caseFormFromDetail,
  contactsPayload,
  emptyContact,
  identityFieldOf,
  isBlankContact,
  mapCaseErrorField,
  readDuplicateCase,
  zodFieldErrors,
  type CaseFormState,
} from '@/lib/cases/case-form'
import { caseCreateSchema, caseUpdateSchema } from '@/lib/cases/schemas'
import type { CaseDetailDto } from '@/lib/cases/types'

const COMPANY_ID = '11111111-1111-4111-8111-111111111111'

function formWith(overrides: Partial<CaseFormState> = {}): CaseFormState {
  return {
    ...EMPTY_CASE_FORM,
    financeCompanyId: COMPANY_ID,
    caseRef: 'SF-2569-00001',
    debtorName: 'สมชาย ใจดี',
    debtorNationalId: '1234567890123',
    debtorPhoneMobile: '0812345678',
    assetBrandModel: 'iPhone 14 Pro',
    assetImeiSerial: '355123456789012',
    outstandingDebtBaht: '12500.50',
    ...overrides,
  }
}

describe('ค่าที่อยู่ในฟอร์ม (`38` §6.1.2)', () => {
  it('DTO ที่ยังไม่กรอก (null) → ช่องว่างของฟอร์ม ไม่ใช่ "null" ที่เป็นข้อความ', () => {
    expect(addressFromDto(null)).toEqual(EMPTY_ADDRESS)
    expect(
      addressFromDto({ detail: 'บ้านเลขที่ 1', postalCode: null, province: 'ภูเก็ต', district: null, subdistrict: null }),
    ).toEqual({ detail: 'บ้านเลขที่ 1', postalCode: '', province: 'ภูเก็ต', district: '', subdistrict: '' })
  })

  it('รู้ว่าที่อยู่ชุดไหนยังว่างทั้งชุด (ที่อยู่ไม่บังคับ)', () => {
    expect(isAddressEmpty(EMPTY_ADDRESS)).toBe(true)
    expect(isAddressEmpty({ ...EMPTY_ADDRESS, province: 'ภูเก็ต' })).toBe(false)
  })
})

describe('ช่องเอกสารยืนยันตัวตนตามสัญชาติ (`38` §6.1.1)', () => {
  it('ไทย = เลขบัตรประชาชน · สัญชาติอื่น = passport · ยังไม่เลือก = ช่องเลขบัตร', () => {
    expect(identityFieldOf('TH')).toBe('national_id')
    expect(identityFieldOf('MM')).toBe('passport')
    expect(identityFieldOf('OTHER')).toBe('passport')
    expect(identityFieldOf('')).toBe('national_id')
  })
})

describe('payload ของฟอร์มรับเคส', () => {
  it('แปลงเงินจากบาทเป็นสตางค์ (จำนวนเต็ม) ก่อนส่ง — Rule 01', () => {
    const payload = buildCasePayload(formWith({ outstandingDebtBaht: '12500.50' }), 'create')
    expect(payload.outstandingDebtSatang).toBe(1_250_050)
    expect(Number.isInteger(payload.outstandingDebtSatang)).toBe(true)
  })

  it('ผ่าน `caseCreateSchema` ตัวเดียวกับ backend และตั้ง sourceChannel = manual', () => {
    const parsed = caseCreateSchema.safeParse(buildCasePayload(formWith(), 'create'))
    expect(parsed.success).toBe(true)
    expect(parsed.success && parsed.data.sourceChannel).toBe('manual')
    expect(parsed.success && parsed.data.outstandingDebtSatang).toBe(1_250_050)
  })

  it('โหมดแก้ไขไม่ส่ง sourceChannel แต่ส่ง editNote (`38` §6.4)', () => {
    const payload = buildCasePayload(formWith({ editNote: 'แก้เบอร์ตามที่ไฟแนนซ์แจ้ง' }), 'edit')
    expect(payload.sourceChannel).toBeUndefined()
    expect(payload.editNote).toBe('แก้เบอร์ตามที่ไฟแนนซ์แจ้ง')
    expect(caseUpdateSchema.safeParse(payload).success).toBe(true)
  })

  it('สลับสัญชาติแล้วต้องล้างช่องของอีกแบบจริง (ค่าค้างข้ามสัญชาติ = บั๊ก)', () => {
    const thai = buildCasePayload(formWith({ debtorPassportNo: 'A1234567' }), 'create')
    expect(thai.debtorNationalId).toBe('1234567890123')
    expect(thai.debtorPassportNo).toBe('')

    const foreign = buildCasePayload(
      formWith({ debtorNationality: 'MM', debtorPassportNo: 'A1234567' }),
      'create',
    )
    expect(foreign.debtorNationalId).toBe('')
    expect(foreign.debtorPassportNo).toBe('A1234567')
  })

  it('ระบุสัญชาติอื่นเฉพาะตอนเลือก OTHER เท่านั้น', () => {
    const notOther = buildCasePayload(formWith({ debtorNationalityOther: 'เวียดนาม' }), 'create')
    expect(notOther.debtorNationalityOther).toBe('')

    const other = buildCasePayload(
      formWith({ debtorNationality: 'OTHER', debtorNationalityOther: 'เวียดนาม' }),
      'create',
    )
    expect(other.debtorNationalityOther).toBe('เวียดนาม')
  })

  it('มูลหนี้ที่พิมพ์ผิดรูปตกไปเป็น error ของช่องนั้น (ไม่ส่ง NaN ขึ้น API)', () => {
    const payload = buildCasePayload(formWith({ outstandingDebtBaht: 'หนึ่งหมื่น' }), 'create')
    expect(payload.outstandingDebtSatang).toBe('หนึ่งหมื่น')
    const parsed = caseCreateSchema.safeParse(payload)
    expect(parsed.success).toBe(false)
    expect(parsed.success === false && zodFieldErrors(parsed.error).outstandingDebtSatang).toBeTruthy()
  })

  it('ฟอร์มเปล่า (ยังไม่กรอกอะไร) ต้องบันทึกร่างได้ ขาดแค่เลขที่สัญญา/ไฟแนนซ์ (`38` §11)', () => {
    const parsed = caseCreateSchema.safeParse(buildCasePayload(EMPTY_CASE_FORM, 'create'))
    expect(parsed.success).toBe(false)
    const fields = parsed.success === false ? zodFieldErrors(parsed.error) : {}
    expect(Object.keys(fields).sort()).toEqual(['caseRef', 'financeCompanyId'])

    const minimal = caseCreateSchema.safeParse(
      buildCasePayload({ ...EMPTY_CASE_FORM, caseRef: 'SF-1', financeCompanyId: COMPANY_ID }, 'create'),
    )
    expect(minimal.success).toBe(true)
  })
})

describe('ผู้ติดต่ออื่น (`38` §6.1.3)', () => {
  it('แถวที่ว่างทั้งแถวถูกตัดทิ้ง (0 คนก็บันทึกได้)', () => {
    const form = formWith({ contacts: [emptyContact('a'), emptyContact('b')] })
    expect(contactsPayload(form.contacts)).toEqual([])
    expect(caseCreateSchema.safeParse(buildCasePayload(form, 'create')).success).toBe(true)
  })

  it('แถวที่กรอกครบ 3 ช่องผ่าน schema', () => {
    const form = formWith({
      contacts: [{ key: 'a', contactName: 'สมชาย', relationship: 'บุตร', contactPhone: '0811111111' }],
    })
    const parsed = caseCreateSchema.safeParse(buildCasePayload(form, 'create'))
    expect(parsed.success).toBe(true)
    expect(parsed.success === true && parsed.data.contacts).toEqual([
      { contactName: 'สมชาย', relationship: 'บุตร', contactPhone: '0811111111' },
    ])
  })

  it('แถวที่กรอกไม่ครบ = error รายช่องของแถวนั้น (ไม่ถูกตัดทิ้งเงียบ ๆ)', () => {
    const form = formWith({
      contacts: [{ key: 'a', contactName: 'สมชาย', relationship: '', contactPhone: '081' }],
    })
    const parsed = caseCreateSchema.safeParse(buildCasePayload(form, 'create'))
    expect(parsed.success).toBe(false)
    const fields = parsed.success === false ? zodFieldErrors(parsed.error) : {}
    expect(Object.keys(fields).sort()).toEqual(['contacts.0.contactPhone', 'contacts.0.relationship'])
  })

  it('รู้ว่าแถวไหนว่างทั้งแถว', () => {
    expect(isBlankContact(emptyContact('a'))).toBe(true)
    expect(isBlankContact({ ...emptyContact('a'), contactPhone: '08' })).toBe(false)
  })

  it('error เบอร์ผู้ติดต่อจาก API ชี้กลับไปที่ช่องบนฟอร์มได้', () => {
    expect(mapCaseErrorField('contacts.1.phone')).toBe('contacts.1.contactPhone')
    expect(mapCaseErrorField('debtor_phone_mobile')).toBe('debtorPhoneMobile')
    expect(mapCaseErrorField('ไม่รู้จัก')).toBe('_')
  })
})

describe('pre-fill ฟอร์มจากเคสเดิม (`38` §8 edit_case)', () => {
  const detail = {
    id: 'case-1',
    caseRef: 'SF-2569-00099',
    financeCompanyId: COMPANY_ID,
    debtorName: 'สมหญิง',
    debtorNationality: 'LA',
    debtorNationalityOther: null,
    debtorNationalId: null,
    debtorPassportNo: 'L998877',
    debtorPhoneMobile: '0899999999',
    debtorPhoneWork: null,
    debtorLineId: null,
    debtorFacebook: null,
    addressCurrent: { detail: 'ม.2', postalCode: '83000', province: 'ภูเก็ต', district: 'เมืองภูเก็ต', subdistrict: 'ตลาดใหญ่' },
    addressWork: { detail: null, postalCode: null, province: null, district: null, subdistrict: null },
    addressIdCard: { detail: null, postalCode: null, province: null, district: null, subdistrict: null },
    assetType: 'tablet',
    assetBrandModel: 'iPad Air',
    assetImeiSerial: 'SN-001',
    outstandingDebtSatang: 999_900,
    contacts: [
      { id: 'contact-1', contactName: 'สมชาย', relationship: 'บุตร', contactPhone: '0811111111' },
      { id: 'contact-2', contactName: 'สมศรี', relationship: 'คู่สมรส', contactPhone: null },
    ],
  } as unknown as CaseDetailDto

  it('แปลงค่า null เป็นช่องว่าง และเงินสตางค์กลับเป็นบาทให้ผู้ใช้แก้ต่อ', () => {
    const form = caseFormFromDetail(detail)
    expect(form.caseRef).toBe('SF-2569-00099')
    expect(form.debtorNationality).toBe('LA')
    expect(form.debtorPassportNo).toBe('L998877')
    expect(form.debtorPhoneWork).toBe('')
    expect(form.addressCurrent.province).toBe('ภูเก็ต')
    expect(form.outstandingDebtBaht).toBe('9999.00')
    expect(form.editNote).toBe('')
  })

  it('เคสที่สัญชาติเป็นค่าที่ไม่รู้จักไม่ล็อกฟอร์มไว้กับค่าเดิม (ให้เลือกใหม่)', () => {
    const form = caseFormFromDetail({ ...detail, debtorNationality: 'ZZ' } as CaseDetailDto)
    expect(form.debtorNationality).toBe('')
  })

  it('ไม่มีเคส (โหมดสร้าง) = ฟอร์มเปล่า', () => {
    expect(caseFormFromDetail(null)).toEqual(EMPTY_CASE_FORM)
  })
})

describe('เลขที่สัญญาซ้ำ → ลิงก์เคสเดิม (`38` §7.3/§11)', () => {
  it('อ่านข้อมูลเคสเดิมจาก context ของ `CASE_REF_DUPLICATE`', () => {
    expect(
      readDuplicateCase({
        code: 'CASE_REF_DUPLICATE',
        payload: { existingCase: { id: 'case-9', caseRef: 'SF-1', status: 'approved', trackingRound: 2 } },
      }),
    ).toEqual({ id: 'case-9', caseRef: 'SF-1', status: 'approved', trackingRound: 2 })
  })

  it('error อื่น / context ไม่ครบ = ไม่มีลิงก์ (ไม่พังหน้าจอ)', () => {
    expect(readDuplicateCase(null)).toBeNull()
    expect(readDuplicateCase({ code: 'REQUIRED_MISSING' })).toBeNull()
    expect(readDuplicateCase({ code: 'CASE_REF_DUPLICATE', payload: { caseRef: 'SF-1' } })).toBeNull()
    expect(
      readDuplicateCase({ code: 'CASE_REF_DUPLICATE', payload: { existingCase: { caseRef: 'SF-1' } } }),
    ).toBeNull()
  })
})
