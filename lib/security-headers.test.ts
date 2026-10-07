import { describe, expect, it } from 'vitest'
import { securityHeaders } from '@/lib/security-headers'

const asMap = (production: boolean) =>
  Object.fromEntries(securityHeaders({ production }).map((header) => [header.key, header.value]))

describe('securityHeaders', () => {
  it('กัน clickjacking แต่ยังให้ระบบฝังไฟล์ของตัวเองได้', () => {
    const headers = asMap(false)
    expect(headers['X-Frame-Options']).toBe('SAMEORIGIN')
    expect(headers['Content-Security-Policy']).toBe("frame-ancestors 'self'")
  })

  it('กัน MIME sniffing + จำกัด referrer', () => {
    const headers = asMap(false)
    expect(headers['X-Content-Type-Options']).toBe('nosniff')
    expect(headers['Referrer-Policy']).toBe('strict-origin-when-cross-origin')
  })

  it('HSTS เฉพาะ production', () => {
    expect(asMap(false)['Strict-Transport-Security']).toBeUndefined()
    expect(asMap(true)['Strict-Transport-Security']).toBe('max-age=63072000; includeSubDomains')
  })
})
