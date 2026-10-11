import { describe, expect, it } from 'vitest'
import { roleBadgeText, roleChipText } from '@/lib/roles/role-groups'

describe('ป้ายบทบาทบนแถบเมนู (mytester B-07)', () => {
  it('กลุ่มแอดมินไม่แสดงรหัสกลุ่มดิบ', () => {
    expect(roleBadgeText('ธุรการ', 'system')).toBe('ธุรการ')
    expect(roleBadgeText('ธุรการ', 'system')).not.toContain('system')
  })
  it('ทีมภาคสนามบอก Inhouse/Outsource', () => {
    expect(roleBadgeText('หัวหน้าทีม', 'outsource')).toBe('หัวหน้าทีม · Outsource')
  })
})

describe('ชิปบทบาทในตารางสิทธิ์ (mytester2 A2-01)', () => {
  it('กลุ่มบริษัทไฟแนนซ์แสดงภาษาไทย ไม่ใช่รหัส finance_company', () => {
    expect(roleChipText('ผู้จัดการ', 'finance_company')).toBe('ผู้จัดการ · บริษัทไฟแนนซ์')
  })
  it('ทีมภาคสนามใช้ตัวย่อ IN/OUT · แอดมินแสดงชื่ออย่างเดียว', () => {
    expect(roleChipText('หัวหน้าทีม', 'inhouse')).toBe('หัวหน้าทีม · IN')
    expect(roleChipText('หัวหน้าทีม', 'outsource')).toBe('หัวหน้าทีม · OUT')
    expect(roleChipText('การเงิน', 'system')).toBe('การเงิน')
  })
  it('กลุ่มที่ไม่รู้จักไม่หลุดรหัสดิบขึ้นจอ', () => {
    expect(roleChipText('บทบาทใหม่', 'unknown_group')).toBe('บทบาทใหม่')
  })
})
