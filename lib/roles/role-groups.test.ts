import { describe, expect, it } from 'vitest'
import { roleBadgeText } from '@/lib/roles/role-groups'

describe('ป้ายบทบาทบนแถบเมนู (mytester B-07)', () => {
  it('กลุ่มแอดมินไม่แสดงรหัสกลุ่มดิบ', () => {
    expect(roleBadgeText('ธุรการ', 'system')).toBe('ธุรการ')
    expect(roleBadgeText('ธุรการ', 'system')).not.toContain('system')
  })
  it('ทีมภาคสนามบอก Inhouse/Outsource', () => {
    expect(roleBadgeText('หัวหน้าทีม', 'outsource')).toBe('หัวหน้าทีม · Outsource')
  })
})
