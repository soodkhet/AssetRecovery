import { describe, expect, it } from 'vitest'
import { Prisma } from '@/lib/generated/prisma/client'
import { SettingsError } from '@/lib/settings/errors'
import { isLockTimeoutError, mapVatRateLockError } from '@/lib/settings/queries/vat-rate-lock'

/** mytester7 FX review sec — รอล็อกช่วงอัตรา VAT เกิน lock_timeout (SQLSTATE 55P03) ⇒ `VAT_RATE_LOCK_TIMEOUT` */
function rawError(meta: Record<string, unknown>): Prisma.PrismaClientKnownRequestError {
  return new Prisma.PrismaClientKnownRequestError('Raw query failed', { code: 'P2010', clientVersion: 'test', meta })
}

const ADAPTER_LOCK_TIMEOUT = rawError({
  driverAdapterError: {
    name: 'DriverAdapterError',
    cause: { originalCode: '55P03', code: '55P03', kind: 'postgres', message: 'canceling statement due to lock timeout' },
  },
})

describe('isLockTimeoutError / mapVatRateLockError', () => {
  it('55P03 จาก driver adapter หรือ meta.code ⇒ ใช่', () => {
    expect(isLockTimeoutError(ADAPTER_LOCK_TIMEOUT)).toBe(true)
    expect(isLockTimeoutError(rawError({ code: '55P03' }))).toBe(true)
  })

  it('SQLSTATE อื่น / error ทั่วไป ⇒ ไม่ใช่', () => {
    expect(isLockTimeoutError(rawError({ driverAdapterError: { cause: { originalCode: '40P01' } } }))).toBe(false)
    expect(isLockTimeoutError(rawError({}))).toBe(false)
    expect(isLockTimeoutError(new Error('55P03'))).toBe(false)
    expect(isLockTimeoutError(null)).toBe(false)
  })

  it('แปลงเป็น VAT_RATE_LOCK_TIMEOUT 409 พร้อมข้อความไทยให้ลองใหม่ · error อื่นคืนตัวเดิม', () => {
    const mapped = mapVatRateLockError(ADAPTER_LOCK_TIMEOUT, 'org-1')
    expect(mapped).toBeInstanceOf(SettingsError)
    const error = mapped as SettingsError
    expect(error.code).toBe('VAT_RATE_LOCK_TIMEOUT')
    expect(error.status).toBe(409)
    expect(error.userMessage).toBe('ระบบกำลังปรับอัตรา VAT อยู่ กรุณาลองใหม่อีกครั้ง')
    const other = new Error('อื่น')
    expect(mapVatRateLockError(other, 'org-1')).toBe(other)
  })
})
