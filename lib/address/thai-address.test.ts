import { describe, expect, it } from 'vitest'
import {
  DISTRICT_DATA,
  POSTAL_CODE_AREAS,
  THAI_PROVINCES,
  THAI_PROVINCE_REGIONS,
  getDistricts,
  getSubDistricts,
  isThaiProvince,
  isValidPostalCode,
  lookupPostalCode,
} from '@/lib/address/thai-address'
import { PROVINCE_DATA } from '@/lib/teams/provinces'

describe('ทะเบียนจังหวัด (`38` §6.1.2)', () => {
  it('มีครบ 77 จังหวัด ไม่ซ้ำกัน', () => {
    expect(THAI_PROVINCES).toHaveLength(77)
    expect(new Set(THAI_PROVINCES).size).toBe(77)
  })

  it('แบ่ง 6 ภาค และผลรวมของทุกภาคเท่ากับรายชื่อแบบแบน', () => {
    expect(THAI_PROVINCE_REGIONS).toHaveLength(6)
    const flattened = THAI_PROVINCE_REGIONS.reduce((sum, group) => sum + group.provinces.length, 0)
    expect(flattened).toBe(THAI_PROVINCES.length)
  })

  it('จังหวัดที่ทีมรับผิดชอบได้ (`09` §8) ต้องเป็นสับเซตของ 77 จังหวัด', () => {
    const teamProvinces = PROVINCE_DATA.flatMap((group) => group.provinces)
    const unknown = teamProvinces.filter((province) => !isThaiProvince(province))
    expect(unknown).toEqual([])
  })

  it('`isThaiProvince` ตัดช่องว่างหัวท้ายให้ และปฏิเสธค่าที่ไม่ใช่ string', () => {
    expect(isThaiProvince(' ภูเก็ต ')).toBe(true)
    expect(isThaiProvince('จังหวัดที่ไม่มีจริง')).toBe(false)
    expect(isThaiProvince(null)).toBe(false)
    expect(isThaiProvince(undefined)).toBe(false)
  })
})

describe('อำเภอ/ตำบล cascading (ชุดตัวอย่าง — Open Item `38` §22 ข้อ 5)', () => {
  it('ทุกจังหวัดในชุดตัวอย่างต้องอยู่ในทะเบียน 77 จังหวัด', () => {
    const unknown = Object.keys(DISTRICT_DATA).filter((province) => !isThaiProvince(province))
    expect(unknown).toEqual([])
  })

  it('คืนอำเภอตามจังหวัด และตำบลตามอำเภอ', () => {
    expect(getDistricts('ภูเก็ต')).toEqual(['เมืองภูเก็ต', 'กะทู้'])
    expect(getSubDistricts('ภูเก็ต', 'กะทู้')).toEqual(['กะทู้', 'ป่าตอง'])
  })

  it('จังหวัดที่ยังไม่มี master data คืนรายการว่าง (ฟอร์มให้พิมพ์เอง ไม่ block)', () => {
    expect(isThaiProvince('น่าน')).toBe(true)
    expect(getDistricts('น่าน')).toEqual([])
    expect(getSubDistricts('น่าน', 'เมืองน่าน')).toEqual([])
  })

  it('ค่าว่าง/null ไม่ทำให้พัง', () => {
    expect(getDistricts(null)).toEqual([])
    expect(getSubDistricts('ภูเก็ต', null)).toEqual([])
  })
})

describe('รหัสไปรษณีย์ (`38` §6.1.2 ข้อ 2)', () => {
  it('รับเฉพาะตัวเลข 5 หลักพอดี', () => {
    expect(isValidPostalCode('83000')).toBe(true)
    expect(isValidPostalCode('8300')).toBe(false)
    expect(isValidPostalCode('830000')).toBe(false)
    expect(isValidPostalCode('8300A')).toBe(false)
    expect(isValidPostalCode(null)).toBe(false)
  })

  it('ทุกแถวของตารางตัวอย่างต้องชี้ไปยังจังหวัด/อำเภอ/ตำบลที่มีจริง', () => {
    for (const [code, area] of Object.entries(POSTAL_CODE_AREAS)) {
      expect(area.postalCode).toBe(code)
      expect(isThaiProvince(area.province)).toBe(true)
      expect(getDistricts(area.province)).toContain(area.district)
      expect(getSubDistricts(area.province, area.district)).toContain(area.subdistrict)
    }
  })

  it('ค้นเจอคืนพื้นที่ครบ 3 ระดับ · ไม่เจอคืน null (ไม่ throw เพราะฟอร์มต้องกรอกเองต่อได้)', async () => {
    await expect(lookupPostalCode('50200')).resolves.toEqual({
      postalCode: '50200',
      province: 'เชียงใหม่',
      district: 'เมืองเชียงใหม่',
      subdistrict: 'ศรีภูมิ',
    })
    await expect(lookupPostalCode('99999')).resolves.toBeNull()
    await expect(lookupPostalCode('123')).resolves.toBeNull()
  })
})
