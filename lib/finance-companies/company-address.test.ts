import { describe, expect, it } from 'vitest'
import {
  EMPTY_ADDRESS,
  formatThaiAddressLine,
  parseThaiAddressLine,
  suggestThaiAddressFromText,
} from '@/lib/address/address-value'
import {
  companyAddressFormOf,
  companyAddressLine,
  isUntouchedLegacyAddress,
  legacyCompanyAddressSuggestion,
  missingCompanyAddressFields,
} from '@/lib/finance-companies/company'

/** mytester2 A2-03 — ที่อยู่บริษัทไฟแนนซ์ใช้ช่องเลือกจังหวัด/อำเภอ/ตำบล/รหัสไปรษณีย์ แต่เก็บคอลัมน์เดียวเหมือนเดิม */

const PROVINCIAL = {
  detail: '99/1 หมู่ 2 ถนนพหลโยธิน',
  subdistrict: 'คลองหนึ่ง',
  district: 'คลองหลวง',
  province: 'ปทุมธานี',
  postalCode: '12120',
}
const BANGKOK = {
  detail: '123 อาคารเอ ชั้น 5 ถนนสีลม',
  subdistrict: 'สีลม',
  district: 'บางรัก',
  province: 'กรุงเทพมหานคร',
  postalCode: '10500',
}

describe('parseThaiAddressLine — ย้อนบรรทัดเดียวกลับเป็น 5 ช่อง', () => {
  it('ต่างจังหวัด / กรุงเทพมหานคร ย้อนกลับได้ครบและตรงตัว', () => {
    for (const value of [PROVINCIAL, BANGKOK]) {
      const line = formatThaiAddressLine(value) ?? ''
      expect(parseThaiAddressLine(line)).toEqual(value)
    }
    expect(formatThaiAddressLine(BANGKOK)).toBe('123 อาคารเอ ชั้น 5 ถนนสีลม แขวงสีลม เขตบางรัก กรุงเทพมหานคร 10500')
  })

  it('ข้อความพิมพ์เองแบบเก่า/ไม่ครบ ⇒ null (ไม่เดาแยก)', () => {
    expect(parseThaiAddressLine('99 ถ.วิภาวดีรังสิต จตุจักร กรุงเทพฯ 10900')).toBeNull()
    expect(parseThaiAddressLine('99/1 ต.คลองหนึ่ง อ.คลองหลวง จ.ปทุมธานี')).toBeNull()
    expect(parseThaiAddressLine('99 ต.ก อ.ข จ.กรุงเทพมหานคร 10100')).toBeNull()
    expect(parseThaiAddressLine('')).toBeNull()
  })
})

describe('ฟอร์มที่อยู่บริษัท', () => {
  it('สร้างใหม่ ⇒ ต้องกรอกครบทุกช่อง + รหัสไปรษณีย์ 5 หลัก', () => {
    expect(missingCompanyAddressFields({ value: EMPTY_ADDRESS, legacyText: null })).toEqual([
      'detail',
      'postalCode',
      'province',
      'district',
      'subdistrict',
    ])
    expect(missingCompanyAddressFields({ value: { ...PROVINCIAL, postalCode: '1212' }, legacyText: null })).toEqual(['postalCode'])
    expect(missingCompanyAddressFields({ value: PROVINCIAL, legacyText: null })).toEqual([])
  })

  it('บันทึกแล้วเปิดแก้ไขใหม่ ⇒ ได้ 5 ช่องเดิม (ไปกลับไม่เพี้ยน)', () => {
    const stored = companyAddressLine(PROVINCIAL)
    expect(companyAddressFormOf(stored)).toEqual({ value: PROVINCIAL, legacyText: null })
  })

  it('ที่อยู่เก่าแบบข้อความอิสระ ⇒ อยู่ในช่องบ้านเลขที่ทั้งก้อน · ไม่แตะ = บันทึกต่อได้และได้ข้อความเดิมทุกตัวอักษร', () => {
    const legacy = '99 ถ.วิภาวดีรังสิต แขวงจตุจักร เขตจตุจักร กทม. 10900'
    const form = companyAddressFormOf(legacy)
    expect(form).toEqual({ value: { ...EMPTY_ADDRESS, detail: legacy }, legacyText: legacy })
    expect(missingCompanyAddressFields(form)).toEqual([])
    expect(companyAddressLine(form.value)).toBe(legacy)
  })

  it('ที่อยู่เก่าที่แก้แล้ว ⇒ ต้องแยกกรอกให้ครบตามช่อง', () => {
    const legacy = '99 ถ.วิภาวดีรังสิต กทม.'
    const form = companyAddressFormOf(legacy)
    const edited = { ...form, value: { ...form.value, detail: '99 ถ.วิภาวดีรังสิต' } }
    expect(missingCompanyAddressFields(edited)).toEqual(['postalCode', 'province', 'district', 'subdistrict'])
  })

  it('ที่อยู่ว่าง (ข้อมูลเก่าที่ไม่มีที่อยู่) ⇒ ฟอร์มว่าง ต้องกรอกครบ', () => {
    expect(companyAddressFormOf(null)).toEqual({ value: EMPTY_ADDRESS, legacyText: null })
  })
})

describe('mytester3 A3-02 — ข้อเสนอแยกที่อยู่เก่าเป็นช่อง (ผู้ใช้กดยืนยันเอง)', () => {
  it('คำเต็ม ตำบล/อำเภอ/จังหวัด + รหัสไปรษณีย์ ⇒ แยกครบ 5 ช่อง', () => {
    const legacy = '45/6 ถนนแจ้งวัฒนะ ตำบลบางตลาด อำเภอปากเกร็ด จังหวัดนนทบุรี 11120'
    expect(companyAddressFormOf(legacy).legacyText).toBe(legacy)
    expect(legacyCompanyAddressSuggestion(legacy)).toEqual({
      detail: '45/6 ถนนแจ้งวัฒนะ',
      subdistrict: 'บางตลาด',
      district: 'ปากเกร็ด',
      province: 'นนทบุรี',
      postalCode: '11120',
    })
  })

  it('กรุงเทพฯ แบบย่อ (แขวง/เขต/กทม.) ⇒ จังหวัดเป็นชื่อเต็ม', () => {
    expect(suggestThaiAddressFromText('99 ถ.วิภาวดีรังสิต แขวงจตุจักร เขตจตุจักร กทม. 10900')).toEqual({
      detail: '99 ถ.วิภาวดีรังสิต',
      subdistrict: 'จตุจักร',
      district: 'จตุจักร',
      province: 'กรุงเทพมหานคร',
      postalCode: '10900',
    })
  })

  it('หาได้บางช่อง ⇒ ช่องที่หาไม่เจอว่าง · หาจังหวัดในทะเบียนไม่เจอ ⇒ null (ไม่เดาต่อ)', () => {
    expect(suggestThaiAddressFromText('12 ม.3 จ.เชียงใหม่')).toEqual({
      detail: '12 ม.3',
      subdistrict: '',
      district: '',
      province: 'เชียงใหม่',
      postalCode: '',
    })
    expect(suggestThaiAddressFromText('99 ถ.วิภาวดีรังสิต จตุจักร 10900')).toBeNull()
    expect(suggestThaiAddressFromText('99 จังหวัดไม่มีจริง 10900')).toBeNull()
    expect(legacyCompanyAddressSuggestion(null)).toBeNull()
  })

  it('ไม่กดใช้ข้อเสนอ = ข้อมูลเดิมคงอยู่ทุกตัวอักษร · กดใช้แล้วต้องครบตามช่อง', () => {
    const legacy = '45/6 ถนนแจ้งวัฒนะ ตำบลบางตลาด อำเภอปากเกร็ด จังหวัดนนทบุรี 11120'
    const form = companyAddressFormOf(legacy)
    expect(isUntouchedLegacyAddress(form)).toBe(true)
    expect(companyAddressLine(form.value)).toBe(legacy)
    const applied = { ...form, value: legacyCompanyAddressSuggestion(legacy) ?? EMPTY_ADDRESS }
    expect(isUntouchedLegacyAddress(applied)).toBe(false)
    expect(missingCompanyAddressFields(applied)).toEqual([])
    expect(companyAddressLine(applied.value)).toBe('45/6 ถนนแจ้งวัฒนะ ต.บางตลาด อ.ปากเกร็ด จ.นนทบุรี 11120')
  })
})
