import { describe, expect, it } from 'vitest'
import { CaseError } from '@/lib/cases/errors'
import { CASE_IMPORT_TEMPLATE_COLUMNS, IMPORT_COLUMNS } from '@/lib/cases/import'
import {
  CASE_REQUIRED_ADDRESS_FIELDS,
  readinessGapText,
  REQUIRED_FIELD_LABEL,
  assertBundleConfirmed,
  assertCaseDocumentDeletable,
  assertCaseEditable,
  assertDocumentModeCompatible,
  assertDocumentModeSelectable,
  documentModeAfterAdding,
  effectiveDocumentMode,
  isCaseDocumentDeletable,
  requiredDocumentSlots,
  assertDocumentsComplete,
  countDocuments,
  documentModeOf,
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
  isAcceptableAssetIdentifier,
  type CaseCompletenessInput,
} from '@/lib/cases/case'
import { caseCreateSchema } from '@/lib/cases/schemas'

const COMPANY_UUID = '11111111-1111-4111-8111-111111111111'

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
  it('ไม่มีตัวอักษร = IMEI (ตัดช่องว่าง/ขีด/จุด → 15 หลักล้วน) · มีตัวอักษร = serial (มติ PO U24)', () => {
    expect(splitAssetIdentifier('356938035643809')).toEqual({ imei: '356938035643809', serialNo: null })
    expect(splitAssetIdentifier(' 356938035643809 ')).toEqual({ imei: '356938035643809', serialNo: null })
    expect(splitAssetIdentifier('35-693803-564380-9')).toEqual({ imei: '356938035643809', serialNo: null })
    expect(splitAssetIdentifier('356938.035643809')).toEqual({ imei: '356938035643809', serialNo: null })
    expect(splitAssetIdentifier('DMPX1234ABCD')).toEqual({ imei: null, serialNo: 'DMPX1234ABCD' })
    expect(splitAssetIdentifier('SN-AB 12')).toEqual({ imei: null, serialNo: 'SN-AB 12' })
    expect(splitAssetIdentifier('  ')).toEqual({ imei: null, serialNo: null })
  })

  it('ค่าที่ดูเป็น IMEI แต่รูปแบบผิด = ไม่ยอมรับ (schema ปฏิเสธ ไม่ตัดทิ้งเงียบ ๆ)', () => {
    expect(isAcceptableAssetIdentifier('35693803564380')).toBe(false)
    expect(isAcceptableAssetIdentifier('3569380356438090')).toBe(false)
    expect(isAcceptableAssetIdentifier('356938035643809/01')).toBe(false)
    expect(isAcceptableAssetIdentifier('35-693803-564380-9')).toBe(true)
    expect(isAcceptableAssetIdentifier('DMPX1234ABCD')).toBe(true)
    expect(isAcceptableAssetIdentifier(null)).toBe(true)
    expect(isAcceptableAssetIdentifier('')).toBe(true)
    const rejected = caseCreateSchema.safeParse({ caseRef: 'HC-1', financeCompanyId: COMPANY_UUID, assetImeiSerial: '35693803564380' })
    expect(rejected.success).toBe(false)
    expect(rejected.error?.issues[0]?.path).toEqual(['assetImeiSerial'])
    const accepted = caseCreateSchema.safeParse({ caseRef: 'HC-1', financeCompanyId: COMPANY_UUID, assetImeiSerial: '35 693803 564380 9' })
    expect(accepted.success).toBe(true)
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

describe('readinessGapText — แปลงรายการที่ขาดจาก API เป็นภาษาไทย (UAT BUG-028)', () => {
  it('แสดงชื่อเอกสารและชื่อช่องตามฟอร์ม', () => {
    const text = readinessGapText({
      code: 'CASE_DOCUMENT_INCOMPLETE',
      missing: ['contract_doc', 'product_photo'],
      missingFields: ['debtorPhoneMobile', 'addressIdCard.detail'],
    })
    expect(text).toBe(
      'เอกสารที่ยังไม่ได้แนบ: สัญญาเช่าซื้อ/สัญญาผ่อนชำระ, รูปสินค้า · ' +
        'ช่องที่ยังไม่ได้กรอก: เบอร์โทรมือถือ, ที่อยู่ตามบัตรประชาชน — บ้านเลขที่ / หมู่บ้าน / ถนน',
    )
  })

  it('ทุกคีย์ที่ missingRequiredFields() คืนได้มีชื่อไทยเสมอ', () => {
    const keys = [
      ...missingRequiredFields({ nationality: null }),
      ...missingRequiredFields({ nationality: 'TH' }),
      ...missingRequiredFields({ nationality: 'OTHER' }),
    ]
    for (const key of keys) expect(REQUIRED_FIELD_LABEL[key], key).toBeDefined()
  })

  it('payload ไม่มีรายการ / ค่าแปลกปลอม → null', () => {
    expect(readinessGapText(undefined)).toBeNull()
    expect(readinessGapText({ code: 'REQUIRED_MISSING' })).toBeNull()
    expect(readinessGapText({ missing: ['unknown_slot', 5], missingFields: 'x' })).toBeNull()
  })
})

describe('เอกสารชุดเดียว (สแกนรวมเล่ม — มติ PO 04/10/2569)', () => {
  it('โหมดอนุมานจากไฟล์ — ไม่มี bundle_doc = แยกตามประเภท (เคสเดิมไม่กระทบ)', () => {
    expect(documentModeOf({})).toBe('separate')
    expect(documentModeOf({ contract_doc: 1, national_id_doc: 1, product_photo: 1 })).toBe('separate')
    expect(documentModeOf({ bundle_doc: 1 })).toBe('bundle')
  })

  it('countDocuments นับต่อ slot และข้ามชนิดที่ไม่รู้จัก', () => {
    expect(
      countDocuments([{ documentType: 'bundle_doc' }, { documentType: 'bundle_doc' }, { documentType: 'unknown' }]),
    ).toEqual({ bundle_doc: 2 })
  })

  it('โหมดชุด: bundle_doc 1 ไฟล์นับครบสัญญา + บัตรประชาชน และรูปสินค้าไม่บังคับ', () => {
    expect(missingRequiredDocuments({ bundle_doc: 1 })).toEqual([])
    expect(() => assertDocumentsComplete({ bundle_doc: 2, product_photo: 3 })).not.toThrow()
  })

  it('โหมดแยกประเภทยังบังคับครบ 3 slot เหมือนเดิม', () => {
    expect(missingRequiredDocuments({ contract_doc: 1 })).toEqual(['national_id_doc', 'product_photo'])
    expect(missingRequiredDocuments({})).toEqual(['contract_doc', 'national_id_doc', 'product_photo'])
  })

  it('ปนสองโหมดไม่ได้ → CASE_DOCUMENT_MODE_CONFLICT · รูปสินค้า/เอกสารอื่นเพิ่มได้ทั้งสองโหมด', () => {
    expect(() => assertDocumentModeCompatible({ contract_doc: 1 }, 'bundle_doc')).toThrow(
      expect.objectContaining({ code: 'CASE_DOCUMENT_MODE_CONFLICT' }),
    )
    expect(() => assertDocumentModeCompatible({ bundle_doc: 1 }, 'national_id_doc')).toThrow(
      expect.objectContaining({ code: 'CASE_DOCUMENT_MODE_CONFLICT' }),
    )
    expect(() => assertDocumentModeCompatible({ bundle_doc: 1 }, 'product_photo')).not.toThrow()
    expect(() => assertDocumentModeCompatible({ bundle_doc: 1 }, 'other_doc')).not.toThrow()
    expect(() => assertDocumentModeCompatible({ bundle_doc: 1 }, 'bundle_doc')).not.toThrow()
    expect(() => assertDocumentModeCompatible({ product_photo: 2, other_doc: 1 }, 'bundle_doc')).not.toThrow()
  })

  it('รับเคสโหมดชุดต้องติ๊กยืนยัน → CASE_BUNDLE_CONFIRMATION_REQUIRED · โหมดแยกประเภทไม่ต้อง', () => {
    for (const confirmed of [undefined, false]) {
      expect(() => assertBundleConfirmed({ bundle_doc: 1 }, confirmed)).toThrow(
        expect.objectContaining({ code: 'CASE_BUNDLE_CONFIRMATION_REQUIRED' }),
      )
    }
    expect(() => assertBundleConfirmed({ bundle_doc: 1 }, true)).not.toThrow()
    expect(() =>
      assertBundleConfirmed({ contract_doc: 1, national_id_doc: 1, product_photo: 1 }, undefined),
    ).not.toThrow()
  })
})

// ── มติ PO 04/10/2569 v3.4 — ติ๊กรูปสินค้า / จำโหมด / ลบเอกสาร ─────────────────
describe('เอกสารแนบ v3.4 — ติ๊กรูปสินค้า · จำโหมด · ลบเอกสาร', () => {
  const separateNoPhoto = { contract_doc: 1, national_id_doc: 1 }

  it('โหมดแยกประเภท ไม่ติ๊ก = ยังบังคับรูปสินค้า · ติ๊ก "รูปสินค้ารวมอยู่ในไฟล์สัญญาแล้ว" = ไม่บังคับ', () => {
    expect(missingRequiredDocuments(separateNoPhoto)).toEqual(['product_photo'])
    expect(missingRequiredDocuments(separateNoPhoto, { productPhotoInContract: false })).toEqual(['product_photo'])
    expect(missingRequiredDocuments(separateNoPhoto, { productPhotoInContract: true })).toEqual([])
    expect(() => assertDocumentsComplete(separateNoPhoto, { productPhotoInContract: true })).not.toThrow()
    // ติ๊กแล้วสัญญา/บัตรยังบังคับเหมือนเดิม
    expect(missingRequiredDocuments({}, { productPhotoInContract: true })).toEqual(['contract_doc', 'national_id_doc'])
  })

  it('caseReadiness ส่งค่าติ๊กต่อไปถึงเงื่อนไขเอกสาร', () => {
    expect(caseReadiness(complete, separateNoPhoto).ready).toBe(false)
    expect(caseReadiness(complete, separateNoPhoto, { productPhotoInContract: true }).ready).toBe(true)
  })

  it('requiredDocumentSlots ต่อโหมด — ชุด = bundle_doc · ติ๊กมีผลเฉพาะโหมดแยกประเภท', () => {
    expect(requiredDocumentSlots('bundle')).toEqual(['bundle_doc'])
    expect(requiredDocumentSlots('bundle', true)).toEqual(['bundle_doc'])
    expect(requiredDocumentSlots('separate')).toEqual(REQUIRED_DOCUMENT_SLOTS)
    expect(requiredDocumentSlots('separate', true)).toEqual(['contract_doc', 'national_id_doc'])
  })

  it('จำโหมด: บันทึกโหมดชุดไว้แต่ยังไม่มีไฟล์ = ขาด "เอกสารชุด" · ไฟล์ชนะคอลัมน์เสมอ', () => {
    expect(missingRequiredDocuments({}, { documentMode: 'bundle' })).toEqual(['bundle_doc'])
    expect(effectiveDocumentMode({}, 'bundle')).toBe('bundle')
    expect(effectiveDocumentMode({}, null)).toBe('separate')
    expect(effectiveDocumentMode({}, 'ค่าแปลก')).toBe('separate')
    expect(effectiveDocumentMode({ bundle_doc: 1 }, 'separate')).toBe('bundle')
    expect(missingRequiredDocuments({ bundle_doc: 1 }, { documentMode: 'separate' })).toEqual([])
  })

  it('บันทึกโหมดที่ขัดกับไฟล์ที่อัปโหลดแล้ว → CASE_DOCUMENT_MODE_CONFLICT · ไม่มีไฟล์ขัด = ได้', () => {
    expect(() => assertDocumentModeSelectable({ contract_doc: 1 }, 'bundle')).toThrow(
      expect.objectContaining({ code: 'CASE_DOCUMENT_MODE_CONFLICT' }),
    )
    expect(() => assertDocumentModeSelectable({ bundle_doc: 1 }, 'separate')).toThrow(
      expect.objectContaining({ code: 'CASE_DOCUMENT_MODE_CONFLICT' }),
    )
    // หลังลบสัญญา/บัตรออกหมด เหลือรูปสินค้า/เอกสารอื่น → สลับเป็นโหมดชุดได้
    expect(() => assertDocumentModeSelectable({ product_photo: 2, other_doc: 1 }, 'bundle')).not.toThrow()
    expect(() => assertDocumentModeSelectable({}, 'separate')).not.toThrow()
  })

  it('แนบไฟล์แล้วโหมดต้องสอดคล้องกับไฟล์ — ชุด ⇒ bundle · สัญญา/บัตร ⇒ separate · อื่น ๆ คงค่าเดิม', () => {
    expect(documentModeAfterAdding('separate', 'bundle_doc')).toBe('bundle')
    expect(documentModeAfterAdding('bundle', 'contract_doc')).toBe('separate')
    expect(documentModeAfterAdding('bundle', 'national_id_doc')).toBe('separate')
    expect(documentModeAfterAdding('bundle', 'product_photo')).toBe('bundle')
    expect(documentModeAfterAdding('separate', 'other_doc')).toBe('separate')
    expect(documentModeAfterAdding(null, 'other_doc')).toBe('separate')
  })

  it('ลบเอกสารได้เฉพาะ ร่าง / ขอข้อมูลเพิ่ม — สถานะอื่น CASE_DOCUMENT_DELETE_NOT_ALLOWED', () => {
    expect(isCaseDocumentDeletable('draft')).toBe(true)
    expect(isCaseDocumentDeletable('need_info')).toBe(true)
    for (const status of ['pending_review', 'approved', 'rejected', 'pending_recycle_review']) {
      expect(isCaseDocumentDeletable(status)).toBe(false)
      expect(() => assertCaseDocumentDeletable(status)).toThrow(
        expect.objectContaining({ code: 'CASE_DOCUMENT_DELETE_NOT_ALLOWED' }),
      )
    }
  })
})

describe('ช่องที่อยู่บังคับ — FE/BE ชุดเดียว (UAT BUG-024 · มติ PO U64)', () => {
  it('บังคับเฉพาะบ้านเลขที่ + จังหวัด ของที่อยู่ปัจจุบันและตามบัตร', () => {
    expect([...CASE_REQUIRED_ADDRESS_FIELDS].sort()).toEqual(['detail', 'province'])
    const missing = missingRequiredFields({
      ...complete,
      addrProvince: null,
      addrDetail: ' ',
      idCardAddrProvince: '',
      idCardAddrDetail: null,
    })
    expect(missing).toEqual(
      expect.arrayContaining([
        'addressCurrent.province',
        'addressCurrent.detail',
        'addressIdCard.province',
        'addressIdCard.detail',
      ]),
    )
    for (const key of missing.filter((field) => field.startsWith('address'))) {
      expect(REQUIRED_FIELD_LABEL[key]).toBeDefined()
    }
  })

  it('ไม่มีรหัสไปรษณีย์/อำเภอ/ตำบลก็ส่งตรวจได้ (ข้อมูลส่วนอื่นครบ)', () => {
    expect(missingRequiredFields(complete)).toEqual([])
  })

  it('แม่แบบนำเข้าระบุระดับบังคับของช่องที่อยู่ตรงกับชุดเดียวกัน', () => {
    for (const prefix of ['addressCurrent', 'addressIdCard'] as const) {
      for (const field of ['detail', 'postalCode', 'province', 'district', 'subdistrict'] as const) {
        const column = IMPORT_COLUMNS.find((item) => item.field === `${prefix}.${field}`)
        const template = CASE_IMPORT_TEMPLATE_COLUMNS.find((item) => item.header === column?.label)
        const expected = (CASE_REQUIRED_ADDRESS_FIELDS as readonly string[]).includes(field)
          ? 'required_before_review'
          : 'optional'
        expect(template?.requirement).toBe(expected)
      }
    }
  })
})
