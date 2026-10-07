import { describe, expect, it } from 'vitest'
import { FetchTimeoutError } from '@/lib/api/fetch-with-timeout'
import { requestLogout } from '@/lib/auth/logout-client'

/** preship R3-010 — logout ล้มเหลวฝั่ง server ต้องไม่ถือว่าสำเร็จ */
describe('requestLogout', () => {
  it('200 ⇒ สำเร็จ (null)', async () => {
    expect(await requestLogout(async () => new Response('{}', { status: 200 }))).toBeNull()
  })

  it('500/401 ⇒ ไม่สำเร็จ แสดงข้อความ ไม่พาไปหน้า login', async () => {
    expect(await requestLogout(async () => new Response('{}', { status: 500 }))).toMatch('ออกจากระบบไม่สำเร็จ')
    expect(await requestLogout(async () => new Response('{}', { status: 401 }))).toMatch('ออกจากระบบไม่สำเร็จ')
  })

  it('timeout / เน็ตหลุด ⇒ ข้อความแยกกัน', async () => {
    const timeout = await requestLogout(async () => {
      throw new FetchTimeoutError(60_000)
    })
    expect(timeout).toMatch('ตอบช้าเกินไป')
    const network = await requestLogout(async () => {
      throw new TypeError('Failed to fetch')
    })
    expect(network).toMatch('อินเทอร์เน็ต')
  })
})
