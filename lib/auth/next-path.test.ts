import { describe, expect, it } from 'vitest'
import { CHANGE_PASSWORD_PATH } from '@/lib/auth/constants'
import { postLoginPath, safeNextPath } from '@/lib/auth/next-path'

describe('safeNextPath (preship R7-006)', () => {
  it('path ภายในพร้อม query = ผ่าน', () => {
    expect(safeNextPath('/finance?tab=revenue&bill_status=sent')).toBe('/finance?tab=revenue&bill_status=sent')
    expect(safeNextPath('/field/tracking?case=abc')).toBe('/field/tracking?case=abc')
  })

  it('โดเมนอื่น / ไม่ใช่ path / อักขระควบคุม / หน้า login = null', () => {
    for (const value of [
      '//evil.example',
      '/\\evil.example',
      'https://evil.example',
      'finance',
      '/\tevil',
      '/login',
      '/login?next=/x',
      '',
      undefined,
      ['/finance'],
      `/${'a'.repeat(2001)}`,
    ]) {
      expect(safeNextPath(value)).toBeNull()
    }
    // %0a ที่ยังเข้ารหัสอยู่ไม่ใช่อักขระควบคุมจริง — เป็น path ภายใน (browser ไม่ตีเป็นโดเมนอื่น)
    expect(safeNextPath('/%0a')).toBe('/%0a')
  })
})

describe('postLoginPath', () => {
  it('มี next ⇒ กลับหน้าเดิม · ไม่มี ⇒ หน้าแรกของ role', () => {
    expect(postLoginPath('/dashboard', '/finance?tab=billing')).toBe('/finance?tab=billing')
    expect(postLoginPath('/dashboard', null)).toBe('/dashboard')
    expect(postLoginPath(null, null)).toBe('/')
    expect(postLoginPath('/field', '//evil.example')).toBe('/field')
  })

  it('ต้องเปลี่ยนรหัสผ่านก่อน ⇒ หน้าเปลี่ยนรหัสชนะ next', () => {
    expect(postLoginPath(CHANGE_PASSWORD_PATH, '/finance')).toBe(CHANGE_PASSWORD_PATH)
  })
})
