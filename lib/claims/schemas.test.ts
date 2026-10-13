import { describe, expect, it } from 'vitest'
import { hotelReceiptPolicyExpenseDate, hotelReceiptPolicyQuerySchema } from '@/lib/claims/schemas'

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

/** ทดสอบซ้ำ local LR6-02 — ยังไม่กรอกวันที่ = วันนี้ตามเวลาไทย ในรูปเดียวกับวันที่ที่กรอก (ฝั่ง POST) */
describe('hotelReceiptPolicyExpenseDate', () => {
  it('ไม่กรอกวันที่ ⇒ วันนี้ (ไทย) แบบ date-only เท่ากับค่าที่กรอกวันนี้เอง', () => {
    const now = new Date('2026-10-13T03:00:00.000Z') // 10:00 น. ไทย
    const fallback = hotelReceiptPolicyExpenseDate(hotelReceiptPolicyQuerySchema.parse({}), now)
    const typed = hotelReceiptPolicyQuerySchema.parse({ expenseDate: '2026-10-13' }).expenseDate
    expect(fallback.toISOString()).toBe('2026-10-13T00:00:00.000Z')
    expect(fallback.getTime()).toBe(typed?.getTime())
  })

  it('หลัง 17:00 UTC (เช้ามืดวันใหม่ของไทย) ⇒ วันไทย ไม่ใช่วัน UTC', () => {
    const now = new Date('2026-10-12T18:30:00.000Z') // 01:30 น. ไทย วันที่ 13
    expect(hotelReceiptPolicyExpenseDate(hotelReceiptPolicyQuerySchema.parse({}), now).toISOString()).toBe(
      '2026-10-13T00:00:00.000Z',
    )
  })

  it('กรอกวันที่แล้ว ⇒ ใช้วันที่ที่กรอก', () => {
    const query = hotelReceiptPolicyQuerySchema.parse({ expenseDate: '2026-10-06' })
    expect(hotelReceiptPolicyExpenseDate(query, new Date('2026-10-13T03:00:00.000Z')).toISOString()).toBe(
      '2026-10-06T00:00:00.000Z',
    )
  })
})
