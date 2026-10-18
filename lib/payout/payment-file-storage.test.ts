import { describe, expect, it } from 'vitest'
import { isStorageAlreadyExistsError, PaymentFileStorageError } from '@/lib/payout/payment-file-storage'

// mytester7 S7-AG3-04 — path ซ้ำจาก storage ต้องแยกออกจากความผิดพลาดอื่น (กลายเป็น 409 ไม่ใช่ 500)
describe('isStorageAlreadyExistsError', () => {
  it('รู้จักรูปแบบ "มีไฟล์อยู่แล้ว" ของ Supabase Storage', () => {
    expect(isStorageAlreadyExistsError({ message: 'The resource already exists', statusCode: '409' })).toBe(true)
    expect(isStorageAlreadyExistsError({ message: 'x', status: 409 })).toBe(true)
    expect(isStorageAlreadyExistsError({ message: 'x', error: 'Duplicate' })).toBe(true)
    expect(isStorageAlreadyExistsError({ message: 'The resource already exists' })).toBe(true)
  })

  it('ความผิดพลาดอื่น (ไม่มี bucket/สิทธิ์/เครือข่าย) ไม่ใช่ path ซ้ำ', () => {
    expect(isStorageAlreadyExistsError({ message: 'Bucket not found', statusCode: '404' })).toBe(false)
    expect(isStorageAlreadyExistsError({ message: 'new row violates row-level security policy', status: 403 })).toBe(
      false,
    )
  })

  it('PaymentFileStorageError เก็บธง alreadyExists (ค่าเริ่มต้น false)', () => {
    expect(new PaymentFileStorageError('x').alreadyExists).toBe(false)
    expect(new PaymentFileStorageError('x', { alreadyExists: true }).alreadyExists).toBe(true)
  })
})
