import { describe, expect, it } from 'vitest'
import { isCronAuthorized } from '@/lib/jobs/cron-auth'

describe('isCronAuthorized (R2-018)', () => {
  it('ตั้ง secret แล้ว ⇒ ต้อง Bearer ตรงทุกตัวอักษร', () => {
    const env = { CRON_SECRET: 's3cret', NODE_ENV: 'production', VERCEL_ENV: 'production' }
    expect(isCronAuthorized('Bearer s3cret', env)).toBe(true)
    expect(isCronAuthorized('Bearer s3creT', env)).toBe(false)
    expect(isCronAuthorized('Bearer s3cret ', env)).toBe(false)
    expect(isCronAuthorized(null, env)).toBe(false)
  })

  it('ยังไม่ตั้ง secret บน Vercel (staging/preview/production) ⇒ ปฏิเสธเสมอ', () => {
    expect(isCronAuthorized(null, { NODE_ENV: 'development', VERCEL_ENV: 'preview' })).toBe(false)
    expect(isCronAuthorized(null, { NODE_ENV: 'production', VERCEL_ENV: 'production' })).toBe(false)
    expect(isCronAuthorized(null, { NODE_ENV: 'production' })).toBe(false)
  })

  it('ยังไม่ตั้ง secret บนเครื่อง dev ⇒ อนุญาต (ทดสอบ job ได้)', () => {
    expect(isCronAuthorized(null, { NODE_ENV: 'development' })).toBe(true)
  })
})
