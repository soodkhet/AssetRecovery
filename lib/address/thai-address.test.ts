import { describe, expect, it } from 'vitest'
import {
  DISTRICT_DATA,
  THAI_PROVINCES,
  THAI_PROVINCE_REGIONS,
  commonPostalArea,
  getDistricts,
  getSubDistricts,
  isThaiProvince,
  isValidPostalCode,
  lookupPostalCode,
} from '@/lib/address/thai-address'
import { PROVINCE_DATA } from '@/lib/teams/provinces'
import postalTable from '@/lib/address/data/thai-postal.json'

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

  it('ไฟล์ข้อมูลครบทั้งประเทศ: 966 รหัส · 7,436 ตำบล · ทุกจังหวัดอยู่ในทะเบียน 77 จังหวัด', () => {
    const entries = Object.entries(postalTable)
    expect(entries).toHaveLength(966)
    const provinces = new Set<string>()
    let subdistricts = 0
    for (const [code, groups] of entries) {
      expect(isValidPostalCode(code)).toBe(true)
      for (const [province, district, subs] of groups) {
        expect(typeof province).toBe('string')
        expect(typeof district).toBe('string')
        expect(Array.isArray(subs)).toBe(true)
        provinces.add(String(province))
        subdistricts += Array.isArray(subs) ? subs.length : 0
      }
    }
    expect(subdistricts).toBe(7436)
    expect(provinces.size).toBe(77)
    expect([...provinces].filter((province) => !isThaiProvince(province))).toEqual([])
  })

  it('ชื่อไม่มีคำนำหน้า เขต/อำเภอ/แขวง/ตำบล (ให้ตรงกับค่าที่ฟอร์ม/ข้อมูลเคสใช้)', () => {
    const prefixed = Object.values(postalTable).flatMap((groups) =>
      groups.flatMap(([, district, subs]) =>
        [district, ...(Array.isArray(subs) ? subs : [])].filter(
          (name) => typeof name === 'string' && /^(เขต|อำเภอ|แขวง|ตำบล)/.test(name),
        ),
      ),
    )
    expect(prefixed).toEqual([])
  })

  it('10900 → กรุงเทพมหานคร / จตุจักร ทุกแขวง (หลายตำบล อำเภอเดียว)', async () => {
    const areas = await lookupPostalCode('10900')
    expect(areas.length).toBeGreaterThan(1)
    expect(new Set(areas.map((area) => `${area.province}/${area.district}`))).toEqual(
      new Set(['กรุงเทพมหานคร/จตุจักร']),
    )
    expect(areas.map((area) => area.subdistrict)).toEqual(expect.arrayContaining(['จตุจักร', 'จอมพล', 'ลาดยาว']))
    expect(areas.every((area) => area.postalCode === '10900')).toBe(true)
    expect(commonPostalArea(areas)).toEqual({ province: 'กรุงเทพมหานคร', district: 'จตุจักร', subdistrict: '' })
  })

  it('10200 → เขตพระนคร มีแขวงพระบรมมหาราชวัง', async () => {
    const areas = await lookupPostalCode(' 10200 ')
    expect(areas).toContainEqual({
      postalCode: '10200',
      province: 'กรุงเทพมหานคร',
      district: 'พระนคร',
      subdistrict: 'พระบรมมหาราชวัง',
    })
    expect(areas.every((area) => area.province === 'กรุงเทพมหานคร')).toBe(true)
  })

  it('รหัสที่ครอบคลุมหลายอำเภอ (10110 คลองเตย+วัฒนา) → เติมได้แค่จังหวัด ให้ผู้ใช้เลือกต่อ', async () => {
    const areas = await lookupPostalCode('10110')
    expect(new Set(areas.map((area) => area.district))).toEqual(new Set(['คลองเตย', 'วัฒนา']))
    expect(commonPostalArea(areas)).toEqual({ province: 'กรุงเทพมหานคร', district: '', subdistrict: '' })
  })

  it('รหัสที่ข้ามจังหวัด (13240) → ไม่เติมจังหวัดเอง', async () => {
    const areas = await lookupPostalCode('13240')
    expect(new Set(areas.map((area) => area.province)).size).toBeGreaterThan(1)
    expect(commonPostalArea(areas).province).toBe('')
  })

  it('ชื่ออำเภอเมืองตรงกับรูปแบบที่ใช้อยู่ (11000 → เมืองนนทบุรี / สวนใหญ่)', async () => {
    const areas = await lookupPostalCode('11000')
    expect(areas).toContainEqual({
      postalCode: '11000',
      province: 'นนทบุรี',
      district: 'เมืองนนทบุรี',
      subdistrict: 'สวนใหญ่',
    })
  })

  it('พื้นที่เดียว → commonPostalArea เติมครบ 3 ระดับ · รายการว่าง → ค่าว่าง', () => {
    const one = { postalCode: '99999', province: 'ก', district: 'ข', subdistrict: 'ค' }
    expect(commonPostalArea([one])).toEqual({ province: 'ก', district: 'ข', subdistrict: 'ค' })
    expect(commonPostalArea([])).toEqual({ province: '', district: '', subdistrict: '' })
  })

  it('ไม่มีรหัสนี้จริง / รูปแบบผิด → คืนรายการว่าง (ไม่ throw เพราะฟอร์มต้องกรอกเองต่อได้)', async () => {
    await expect(lookupPostalCode('99999')).resolves.toEqual([])
    await expect(lookupPostalCode('00000')).resolves.toEqual([])
    await expect(lookupPostalCode('123')).resolves.toEqual([])
    await expect(lookupPostalCode('constructor')).resolves.toEqual([])
  })
})
