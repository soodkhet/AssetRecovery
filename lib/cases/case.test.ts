import { describe, expect, it } from 'vitest'
import { CaseError } from '@/lib/cases/errors'
import {
  assertCaseEditable,
  assertDocumentsComplete,
  assertIdentityFormats,
  assertProductPhotoCapacity,
  caseReadiness,
  digitsOnly,
  identityDocumentKind,
  isCaseEditable,
  isValidMobilePhone,
  isValidNationalId,
  isValidWorkPhone,
  joinAssetIdentifier,
  missingRequiredDocuments,
  missingRequiredFields,
  PRODUCT_PHOTO_MAX,
  REQUIRED_DOCUMENT_SLOTS,
  splitAssetIdentifier,
  type CaseCompletenessInput,
} from '@/lib/cases/case'

/** เทียบกับ Test Cases ของ `38` §20 (แถวที่เป็น pure logic) */

const complete: CaseCompletenessInput = {
  caseRef: 'SF-2026-001',
  companyId: '00000000-0000-0000-0000-000000000001',
  debtorName: 'สมชาย ใจดี',
  nationality: 'TH',
  nationalId: '1234567890123',
  phoneMobile: '0812345678',
  addrProvince: 'กรุงเทพมหานคร',
  addrDetail: '99/1 ถนนสุขุมวิท',
  idCardAddrProvince: 'กรุงเทพมหานคร',
  idCardAddrDetail: '99/1 ถนนสุขุมวิท',
  assetKind: 'smartphone',
  assetBrandModel: 'iPhone 15',
  assetImeiSerial: '356938035643809',
  debtAmountSatang: 1_000_000,
}

describe('เอกสารยืนยันตัวตนตามสัญชาติ (`38` §6.1.1)', () => {
  it('สัญชาติไทยใช้เลขบัตรประชาชน · สัญชาติอื่นใช้ passport', () => {
    expect(identityDocumentKind('TH')).toBe('national_id')
    for (const nationality of ['MM', 'LA', 'KH', 'OTHER'] as const) {
      expect(identityDocumentKind(nationality)).toBe('passport')
    }
  })

  it('สัญชาติต่างด้าวขาด passport = ยังไม่ครบ (ไม่ใช่ขาดเลขบัตรประชาชน)', () => {
    const missing = missingRequiredFields({ ...complete, nationality: 'MM', nationalId: null, passportNo: null })
    expect(missing).toContain('debtorPassportNo')
    expect(missing).not.toContain('debtorNationalId')
  })

  it('สัญชาติ OTHER ต้องระบุชื่อสัญชาติเพิ่ม', () => {
    const missing = missingRequiredFields({
      ...complete,
      nationality: 'OTHER',
      nationalId: null,
      passportNo: 'A1234567',
      nationalityOther: null,
    })
    expect(missing).toEqual(['debtorNationalityOther'])
  })
})

describe('รูปแบบเลขบัตร/เบอร์โทร (`38` §12)', () => {
  it('เลขบัตรประชาชน = ตัวเลข 13 หลักพอดี', () => {
    expect(isValidNationalId('1234567890123')).toBe(true)
    expect(isValidNationalId('123456789012')).toBe(false)
    expect(isValidNationalId('12345678901234')).toBe(false)
    expect(isValidNationalId('123456789012A')).toBe(false)
    expect(isValidNationalId('1-2345-67890-12-3')).toBe(false)
  })

  it('มือถือ 10 หลัก · เบอร์ที่ทำงาน 9-10 หลัก', () => {
    expect(isValidMobilePhone('0812345678')).toBe(true)
    expect(isValidMobilePhone('081234567')).toBe(false)
    expect(isValidMobilePhone('081-234-5678')).toBe(false)
    expect(isValidWorkPhone('021234567')).toBe(true)
    expect(isValidWorkPhone('0212345678')).toBe(true)
    expect(isValidWorkPhone('02123456')).toBe(false)
  })

  it('digitsOnly ตัดทุกอย่างที่ไม่ใช่ตัวเลข (ตัวกรอง input ของฟอร์ม)', () => {
    expect(digitsOnly('1-2345 67890(12)3')).toBe('1234567890123')
  })

  it('assertIdentityFormats โยน code ตรงตามช่องที่ผิด', () => {
    expect(() => assertIdentityFormats({ nationalId: '123' })).toThrowError(
      expect.objectContaining({ code: 'CASE_INVALID_NATIONAL_ID' }),
    )
    expect(() => assertIdentityFormats({ phoneMobile: '081234' })).toThrowError(
      expect.objectContaining({ code: 'CASE_INVALID_PHONE_FORMAT' }),
    )
    expect(() => assertIdentityFormats({ phoneWork: '0212' })).toThrowError(
      expect.objectContaining({ code: 'CASE_INVALID_PHONE_FORMAT' }),
    )
    expect(() => assertIdentityFormats({ contactPhones: ['0812345678', '123'] })).toThrowError(
      expect.objectContaining({ code: 'CASE_INVALID_PHONE_FORMAT' }),
    )
  })

  it('ค่าว่าง/ยังไม่กรอกไม่ถือว่าผิด — เคสจาก API สร้าง draft ได้ (`38` §11)', () => {
    expect(() =>
      assertIdentityFormats({ nationalId: null, phoneMobile: undefined, phoneWork: '', contactPhones: [] }),
    ).not.toThrow()
  })
})

describe('เอกสารแนบ (`38` §6.3 · §6.3.1)', () => {
  it('slot บังคับมี 3 ตัวตามสเปค', () => {
    expect([...REQUIRED_DOCUMENT_SLOTS]).toEqual(['contract_doc', 'national_id_doc', 'product_photo'])
  })

  it('ขาด national_id_doc → CASE_DOCUMENT_INCOMPLETE (`38` §20)', () => {
    const counts = { contract_doc: 1, product_photo: 2 }
    expect(missingRequiredDocuments(counts)).toEqual(['national_id_doc'])
    expect(() => assertDocumentsComplete(counts)).toThrowError(
      expect.objectContaining({ code: 'CASE_DOCUMENT_INCOMPLETE' }),
    )
  })

  it('ครบ 3 slot แล้วผ่าน (other_doc ไม่บังคับ)', () => {
    expect(() =>
      assertDocumentsComplete({ contract_doc: 1, national_id_doc: 2, product_photo: 1 }),
    ).not.toThrow()
  })

  it('รูปสินค้าเกิน 8 รูป → CASE_PRODUCT_PHOTO_LIMIT', () => {
    expect(PRODUCT_PHOTO_MAX).toBe(8)
    expect(() => assertProductPhotoCapacity(7)).not.toThrow()
    expect(() => assertProductPhotoCapacity(8)).toThrowError(
      expect.objectContaining({ code: 'CASE_PRODUCT_PHOTO_LIMIT' }),
    )
    expect(() => assertProductPhotoCapacity(6, 3)).toThrow(CaseError)
  })
})

describe('ความพร้อมขึ้น pending_review (`38` §9)', () => {
  it('ข้อมูล+เอกสารครบ = ready', () => {
    const readiness = caseReadiness(complete, { contract_doc: 1, national_id_doc: 1, product_photo: 1 })
    expect(readiness).toEqual({ ready: true, missingFields: [], missingDocuments: [] })
  })

  it('เคสจาก API ที่ข้อมูลไม่ครบ = ไม่ ready แต่ไม่ throw (สร้าง draft ได้ · `38` §11/§20)', () => {
    const readiness = caseReadiness({ caseRef: 'SF-1', companyId: 'c1' }, {})
    expect(readiness.ready).toBe(false)
    expect(readiness.missingFields).toContain('debtorName')
    expect(readiness.missingFields).toContain('addressCurrent.province')
    expect(readiness.missingDocuments).toEqual(['contract_doc', 'national_id_doc', 'product_photo'])
  })

  it('มูลหนี้ 0 สตางค์ถือว่ากรอกแล้ว (ไม่ใช่ค่าว่าง)', () => {
    expect(missingRequiredFields({ ...complete, debtAmountSatang: 0 })).toEqual([])
  })
})

describe('ตัวระบุเครื่อง (A6 · `44` §6.5)', () => {
  it('ตัวเลข 15 หลักพอดี = IMEI · นอกนั้นเป็น serial', () => {
    expect(splitAssetIdentifier('356938035643809')).toEqual({ imei: '356938035643809', serialNo: null })
    expect(splitAssetIdentifier('35693803564380')).toEqual({ imei: null, serialNo: '35693803564380' })
    expect(splitAssetIdentifier('DMPX1234ABCD')).toEqual({ imei: null, serialNo: 'DMPX1234ABCD' })
    expect(splitAssetIdentifier('  ')).toEqual({ imei: null, serialNo: null })
  })

  it('join คืนค่าเดิมที่ผู้ใช้กรอก', () => {
    expect(joinAssetIdentifier('356938035643809', null)).toBe('356938035643809')
    expect(joinAssetIdentifier(null, 'DMPX1234ABCD')).toBe('DMPX1234ABCD')
    expect(joinAssetIdentifier(null, null)).toBeNull()
  })
})

describe('สถานะที่แก้ไขได้ (`38` §8 · §20)', () => {
  it('แก้ได้เฉพาะ draft / pending_review / need_info', () => {
    for (const status of ['draft', 'pending_review', 'need_info']) {
      expect(isCaseEditable(status)).toBe(true)
      expect(() => assertCaseEditable(status)).not.toThrow()
    }
  })

  it('แก้หลัง approved → CASE_LOCKED_AFTER_APPROVAL', () => {
    for (const status of ['approved', 'rejected', 'active', 'closed_success', 'closed_fail']) {
      expect(isCaseEditable(status)).toBe(false)
      expect(() => assertCaseEditable(status)).toThrowError(
        expect.objectContaining({ code: 'CASE_LOCKED_AFTER_APPROVAL' }),
      )
    }
  })
})
