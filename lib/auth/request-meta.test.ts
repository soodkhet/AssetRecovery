import { describe, expect, it } from 'vitest'
import { getRequestMeta, normalizeIpAddress } from '@/lib/auth/request-meta'

describe('normalizeIpAddress (`audit_logs.ip_address` เป็น INET — ค่าที่ไม่ใช่ IP ต้องเป็น NULL)', () => {
  it('x-forwarded-for หลายค่า = เอาตัวแรก', () => {
    expect(normalizeIpAddress('203.0.113.9, 70.41.3.18')).toBe('203.0.113.9')
  })

  it('IPv6 ผ่าน', () => {
    expect(normalizeIpAddress('2001:db8::1')).toBe('2001:db8::1')
  })

  it('ค่าที่ไม่ใช่ IP หรือ octet เกิน 255 = null', () => {
    expect(normalizeIpAddress('unknown')).toBeNull()
    expect(normalizeIpAddress('999.1.1.1')).toBeNull()
    expect(normalizeIpAddress('')).toBeNull()
    expect(normalizeIpAddress(null)).toBeNull()
  })
})

describe('getRequestMeta', () => {
  it('อ่าน ip + user agent จาก header', () => {
    const request = new Request('https://example.com/api/auth/login', {
      headers: { 'x-forwarded-for': '203.0.113.9', 'user-agent': 'vitest' },
    })
    expect(getRequestMeta(request)).toEqual({ ipAddress: '203.0.113.9', userAgent: 'vitest' })
  })

  it('ไม่มี header = null ทั้งคู่ (audit ยังบันทึกได้)', () => {
    const request = new Request('https://example.com/api/auth/login')
    expect(getRequestMeta(request)).toEqual({ ipAddress: null, userAgent: null })
  })
})
