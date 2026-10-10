import { describe, expect, it } from 'vitest'
import { deniedHref, menuDeniedMessage, portalDeniedMessage } from '@/lib/nav/denied-notice'

describe('denied notice — staging E-072', () => {
  it('ลิงก์เด้งกลับพร้อมหมวด', () => {
    expect(deniedHref('/portal', 'finance')).toBe('/portal?denied=finance')
  })

  it('พอร์ทัล: หมวดที่รู้จักบอกชื่อหมวด · ค่าแปลก/ไม่ส่ง ⇒ null (ไม่สะท้อนข้อความจาก URL)', () => {
    expect(portalDeniedMessage('finance')).toContain('การเงิน')
    expect(portalDeniedMessage(['handover'])).toContain('ใบส่งมอบทรัพย์')
    expect(portalDeniedMessage('<script>')).toBeNull()
    expect(portalDeniedMessage(undefined)).toBeNull()
  })

  it('ระบบภายใน: ใช้ชื่อเมนูจาก registry', () => {
    expect(menuDeniedMessage('dashboard')).toContain('แดชบอร์ด')
    expect(menuDeniedMessage('no-such-menu')).toBeNull()
  })
})
