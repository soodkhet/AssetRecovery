import { afterEach, describe, expect, it, vi } from 'vitest'
import { isInvalidIdError, unexpectedErrorResponse } from '@/lib/api/unexpected-error'
import { toAuthErrorResponse } from '@/lib/auth/errors'

const prismaInvalidUuid = Object.assign(new Error('Invalid input value: invalid input syntax for type uuid: "abc"'), {
  code: 'P2007',
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('isInvalidIdError', () => {
  it('จับ error ของ Prisma ที่เกิดจาก id ไม่ใช่ UUID', () => {
    expect(isInvalidIdError(prismaInvalidUuid)).toBe(true)
    expect(isInvalidIdError(Object.assign(new Error('Error creating UUID, invalid character'), { code: 'P2023' }))).toBe(true)
  })

  it('ไม่จับ error อื่นที่ code เดียวกันแต่ไม่ใช่เรื่อง UUID / error ทั่วไป', () => {
    expect(isInvalidIdError(Object.assign(new Error('invalid input value for enum'), { code: 'P2007' }))).toBe(false)
    expect(isInvalidIdError(new Error('invalid input syntax for type uuid'))).toBe(false)
    expect(isInvalidIdError(null)).toBe(false)
  })
})

describe('unexpectedErrorResponse', () => {
  it('id ไม่ใช่ UUID ⇒ 400 INVALID_ID_FORMAT (ไม่ log เป็น error ของระบบ)', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const response = unexpectedErrorResponse(prismaInvalidUuid)
    expect(response.status).toBe(400)
    expect((await response.json()).error.code).toBe('INVALID_ID_FORMAT')
    expect(log).not.toHaveBeenCalled()
  })

  it('error อื่น ⇒ 500 INTERNAL_ERROR เป็น JSON envelope · ไม่ส่งรายละเอียดออก · log ฝั่ง server', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const response = unexpectedErrorResponse(new Error('connection terminated: password=secret'))
    expect(response.status).toBe(500)
    const body = await response.json()
    expect(body).toMatchObject({ success: false, data: null, error: { code: 'INTERNAL_ERROR' } })
    expect(JSON.stringify(body)).not.toContain('secret')
    expect(log).toHaveBeenCalledOnce()
  })

  it('toAuthErrorResponse ไม่โยน error แปลกปลอมต่อแล้ว — ได้ 500 envelope', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const response = toAuthErrorResponse(new TypeError('boom'))
    expect(response.status).toBe(500)
    expect((await response.json()).error.code).toBe('INTERNAL_ERROR')
  })
})
