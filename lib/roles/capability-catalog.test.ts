import { describe, expect, it } from 'vitest'
import { CAPABILITIES, withCatalogText } from '@/lib/roles/capability-catalog'

describe('ข้อความ capability บนหน้าสิทธิ์ (mytester2 A2-01)', () => {
  it('ป้าย/คำอธิบายไม่มีรหัสสถานะงวดหรือศัพท์ระบบ', () => {
    const RAW = /\b(collecting|sent|locked|mark filed|resolve|manual|map|own scope|gap|open|block)\b|pending_\w+/
    const offenders = CAPABILITIES.flatMap((capability) =>
      [capability.label, capability.description ?? ''].filter((text) => RAW.test(text)).map((text) => `${capability.code}: ${text}`),
    )
    expect(offenders).toEqual([])
  })

  it('withCatalogText ใช้ข้อความจากแคตตาล็อกแทนค่าที่ seed ไว้เดิม — code ที่ไม่รู้จักคงค่าจากฐาน', () => {
    const rows = withCatalogText([
      { code: 'unlock_period', label: 'ปลดล็อกรอบบัญชีที่ locked', description: 'เดิม' },
      { code: 'not_in_catalog', label: 'จากฐาน', description: null },
    ])
    expect(rows[0]).toEqual({ code: 'unlock_period', label: 'ปลดล็อกงวดบัญชีที่ล็อกแล้ว', description: '🔒 ผู้บริหารเท่านั้น + บันทึกประวัติการใช้งาน' })
    expect(rows[1]).toEqual({ code: 'not_in_catalog', label: 'จากฐาน', description: null })
  })
})
