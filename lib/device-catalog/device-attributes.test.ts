import { describe, expect, it } from 'vitest'
import {
  DEFAULT_CAPACITY_OPTIONS,
  DEFAULT_COLOR_OPTIONS,
  NOT_SPECIFIED_IN_CONTRACT,
  attributeChoiceOf,
  cleanAttributeOptions,
  deviceAttributesText,
  normalizeCapacityText,
  parseAttributeOptionsText,
} from '@/lib/device-catalog/device-attributes'
import { deviceCatalogSettingsSchema } from '@/lib/device-catalog/schemas'
import { missingRequiredFields } from '@/lib/cases/case'

/** ความจุ + สีตามสัญญา (มติ PO U166) */

describe('ตัวเลือกมาตรฐาน', () => {
  it('ความจุ 16GB–2TB · สีพื้นฐาน 13 สี ตามมติ', () => {
    expect(DEFAULT_CAPACITY_OPTIONS).toEqual(['16GB', '32GB', '64GB', '128GB', '256GB', '512GB', '1TB', '2TB'])
    expect(DEFAULT_COLOR_OPTIONS).toHaveLength(13)
    expect(DEFAULT_COLOR_OPTIONS).toEqual(expect.arrayContaining(['ดำ', 'ขาว', 'เงิน', 'เทา', 'ทอง', 'น้ำเงิน', 'ฟ้า', 'เขียว', 'ม่วง', 'ชมพู', 'แดง', 'ส้ม', 'เหลือง']))
  })

  it('ทำความสะอาดรายการ: ตัดว่าง/ซ้ำ (ไม่สนตัวพิมพ์) · ตัด "ไม่ระบุในสัญญา" (ระบบใส่ให้เสมอ)', () => {
    expect(cleanAttributeOptions([' 128gb', '128GB', '', NOT_SPECIFIED_IN_CONTRACT, '1 TB'])).toEqual(['128gb', '1 TB'])
    expect(parseAttributeOptionsText('ดำ\nขาว, ดำ\n')).toEqual(['ดำ', 'ขาว'])
  })

  it('ค่าตั้งต้องมีอย่างน้อย 1 รายการ · จำนวนวันเตือน 1–3650', () => {
    const base = { brandNames: ['Samsung'], recentYears: 5, capacityOptions: ['128GB'], colorOptions: ['ดำ'], staleAlertDays: 90 }
    expect(deviceCatalogSettingsSchema.safeParse(base).success).toBe(true)
    expect(deviceCatalogSettingsSchema.safeParse({ ...base, colorOptions: [' '] }).success).toBe(false)
    expect(deviceCatalogSettingsSchema.safeParse({ ...base, staleAlertDays: 0 }).success).toBe(false)
  })
})

describe('ค่าบนฟอร์ม', () => {
  const options = ['128GB', '256GB']
  it('ค่ามาตรฐาน / ไม่ระบุในสัญญา / ระบุเอง / ยังไม่เลือก', () => {
    expect(attributeChoiceOf('', options)).toEqual({ kind: 'empty' })
    expect(attributeChoiceOf('128gb', options)).toEqual({ kind: 'option', value: '128GB' })
    expect(attributeChoiceOf(NOT_SPECIFIED_IN_CONTRACT, options)).toEqual({ kind: 'not_specified' })
    expect(attributeChoiceOf('384GB', options)).toEqual({ kind: 'custom', value: '384GB' })
  })

  it('ความจุจากไฟล์นำเข้า → รูปมาตรฐาน', () => {
    expect(normalizeCapacityText('128 gb')).toBe('128GB')
    expect(normalizeCapacityText('1tb')).toBe('1TB')
    expect(normalizeCapacityText('256G')).toBe('256GB')
    expect(normalizeCapacityText('ไม่ระบุในสัญญา')).toBe('ไม่ระบุในสัญญา')
    expect(normalizeCapacityText('  ')).toBeNull()
  })

  it('ข้อความแสดงผล', () => {
    expect(deviceAttributesText('128GB', 'ดำ')).toBe('128GB · ดำ')
    expect(deviceAttributesText(null, null)).toBe('—')
  })

  it('บังคับเลือกก่อนส่งตรวจ — "ไม่ระบุในสัญญา" นับว่าเลือกแล้ว', () => {
    expect(missingRequiredFields({})).toEqual(expect.arrayContaining(['assetCapacity', 'assetColor']))
    const filled = missingRequiredFields({ assetCapacity: NOT_SPECIFIED_IN_CONTRACT, assetColor: 'ดำ' })
    expect(filled).not.toContain('assetCapacity')
    expect(filled).not.toContain('assetColor')
  })
})
