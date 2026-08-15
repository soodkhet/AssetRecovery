import { describe, expect, it } from 'vitest'
import { bahtInWords } from '@/lib/payout/baht-text'

describe('bahtInWords (`28` §6.1 — ยอดเป็นตัวอักษรบนใบสำคัญจ่าย)', () => {
  it('ตรงกับตัวอย่าง `05_payment_voucher.pdf` (8,245.00 บาท)', () => {
    expect(bahtInWords(824_500)).toBe('แปดพันสองร้อยสี่สิบห้าบาทถ้วน')
  })

  it.each([
    [0, 'ศูนย์บาทถ้วน'],
    [100, 'หนึ่งบาทถ้วน'],
    [1_000, 'สิบบาทถ้วน'],
    [1_100, 'สิบเอ็ดบาทถ้วน'],
    [2_000, 'ยี่สิบบาทถ้วน'],
    [2_100, 'ยี่สิบเอ็ดบาทถ้วน'],
    [10_100, 'หนึ่งร้อยเอ็ดบาทถ้วน'],
    [12_345, 'หนึ่งร้อยยี่สิบสามบาทสี่สิบห้าสตางค์'],
    [50, 'ศูนย์บาทห้าสิบสตางค์'],
    [1, 'ศูนย์บาทหนึ่งสตางค์'],
  ])('อ่าน %i satang เป็น "%s"', (satang, expected) => {
    expect(bahtInWords(satang)).toBe(expected)
  })

  it('อ่านหลักล้านซ้อนกันได้ และ 1 หลังคำว่าล้านอ่านว่า "เอ็ด"', () => {
    expect(bahtInWords(100_000_000)).toBe('หนึ่งล้านบาทถ้วน')
    expect(bahtInWords(100_000_100)).toBe('หนึ่งล้านเอ็ดบาทถ้วน')
    expect(bahtInWords(123_456_789)).toBe(
      'หนึ่งล้านสองแสนสามหมื่นสี่พันห้าร้อยหกสิบเจ็ดบาทแปดสิบเก้าสตางค์',
    )
    // 1,000,000,000,000 satang = 10,000,000,000 บาท → "หนึ่งหมื่นล้าน"
    expect(bahtInWords(1_000_000_000_000)).toBe('หนึ่งหมื่นล้านบาทถ้วน')
  })

  it('ปฏิเสธค่าที่ไม่ใช่ satang จำนวนเต็มไม่ติดลบ (กันยอดผิดขึ้นเอกสารการเงิน)', () => {
    expect(() => bahtInWords(100.5)).toThrow(RangeError)
    expect(() => bahtInWords(-1)).toThrow(RangeError)
    expect(() => bahtInWords(Number.NaN)).toThrow(RangeError)
  })
})
