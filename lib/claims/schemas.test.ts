import { describe, expect, it } from 'vitest'
import { hotelReceiptPolicyQuerySchema } from '@/lib/claims/schemas'

/** mytester5 F5-01 — query ของนโยบายใบเสร็จค่าที่พัก (ฟอร์มสร้างรายการเบิกเอง) */
describe('hotelReceiptPolicyQuerySchema', () => {
  it('ค่าว่าง = ของตัวเอง/วันนี้ (server เติม) · มีค่า = ผู้รับ + วันที่เกิดรายการ', () => {
    expect(hotelReceiptPolicyQuerySchema.parse({})).toEqual({ payeeId: null })
    expect(hotelReceiptPolicyQuerySchema.parse({ payeeId: '', expenseDate: '' })).toEqual({ payeeId: null })
    const parsed = hotelReceiptPolicyQuerySchema.parse({
      payeeId: '00000000-0000-4000-8000-000000000001',
      expenseDate: '2026-10-06',
    })
    expect(parsed.payeeId).toBe('00000000-0000-4000-8000-000000000001')
    expect(parsed.expenseDate?.toISOString()).toBe('2026-10-06T00:00:00.000Z')
  })

  it('รหัสผู้รับ/วันที่ผิดรูปแบบ ⇒ ไม่ผ่าน', () => {
    expect(hotelReceiptPolicyQuerySchema.safeParse({ payeeId: 'x' }).success).toBe(false)
    expect(hotelReceiptPolicyQuerySchema.safeParse({ expenseDate: '06/10/2569' }).success).toBe(false)
  })
})
