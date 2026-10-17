import { describe, expect, it } from 'vitest'
import { creditNoteAmountLimitIssue, creditNoteApiFieldErrors } from '@/lib/credit-notes/credit-note-form'

/** mytester6 T-022 — ยอดเกินเพดานที่ฟอร์มรู้ ตรวจตั้งแต่หน้าจอ + ข้อผิดจาก API ผูกช่อง */
describe('creditNoteAmountLimitIssue()', () => {
  const base = { isDebit: false, vatSatang: null, maxBeforeVatSatang: 3_936, maxTotalSatang: 4_212 }

  it('มูลค่าที่ลด ฿50 เกินเพดาน ฿39.36 (ก่อนภาษี) ⇒ ข้อความบอกเพดาน', () => {
    expect(creditNoteAmountLimitIssue({ ...base, amountSatang: 5_000 })).toContain('฿39.36')
  })

  it('ก่อนภาษีไม่เกิน แต่รวมภาษีที่กรอกเกินเพดานรวมภาษี ⇒ ข้อความรวมภาษี', () => {
    const text = creditNoteAmountLimitIssue({ ...base, amountSatang: 3_936, vatSatang: 400 })
    expect(text).toContain('฿42.12')
    expect(text).toContain('รวมภาษี')
  })

  it('ไม่เกิน / ไม่ทราบภาษี / ใบเพิ่มหนี้ / ไม่มียอด / ไม่มีเพดาน ⇒ null', () => {
    expect(creditNoteAmountLimitIssue({ ...base, amountSatang: 3_936, vatSatang: 276 })).toBeNull()
    expect(creditNoteAmountLimitIssue({ ...base, amountSatang: 3_936 })).toBeNull()
    expect(creditNoteAmountLimitIssue({ ...base, isDebit: true, amountSatang: 999_999 })).toBeNull()
    expect(creditNoteAmountLimitIssue({ ...base, amountSatang: null })).toBeNull()
    expect(
      creditNoteAmountLimitIssue({ isDebit: false, amountSatang: 999_999, vatSatang: 0, maxBeforeVatSatang: null, maxTotalSatang: null }),
    ).toBeNull()
  })
})

describe('creditNoteApiFieldErrors()', () => {
  it('code เพดาน ⇒ ช่องยอด · เลขซ้ำ ⇒ ช่องเลขที่ · VAT ไม่ตรง ⇒ ช่องภาษี · งวดปิด ⇒ ช่องวันที่', () => {
    expect(creditNoteApiFieldErrors({ code: 'CREDIT_NOTE_EXCEEDS_OUTSTANDING', message: 'เกิน' })).toEqual({ amount: 'เกิน' })
    expect(creditNoteApiFieldErrors({ code: 'CREDIT_NOTE_EXCEEDS_INVOICE', message: 'เกินใบ' })).toEqual({ amount: 'เกินใบ' })
    expect(creditNoteApiFieldErrors({ code: 'CREDIT_NOTE_NUMBER_DUPLICATE', message: 'ซ้ำ' })).toEqual({ number: 'ซ้ำ' })
    expect(creditNoteApiFieldErrors({ code: 'CREDIT_NOTE_VAT_MISMATCH', message: 'ภาษี' })).toEqual({ vat: 'ภาษี' })
    expect(creditNoteApiFieldErrors({ code: 'PERIOD_LOCKED_DIRECT_EDIT', message: 'ปิดงวด' })).toEqual({ date: 'ปิดงวด' })
  })

  it('fields จาก Zod ⇒ แปลง path เป็นช่อง · code ไม่รู้จัก ⇒ ว่าง (footer อย่างเดียว)', () => {
    expect(
      creditNoteApiFieldErrors({
        code: 'VALIDATION_ERROR',
        message: 'ข้อมูลไม่ถูกต้อง',
        fields: { reason: 'กรอกเหตุผลของเอกสาร', amountBeforeVatSatang: 'มูลค่าก่อนภาษีต้องมากกว่า 0' },
      }),
    ).toEqual({ reason: 'กรอกเหตุผลของเอกสาร', amount: 'มูลค่าก่อนภาษีต้องมากกว่า 0' })
    expect(creditNoteApiFieldErrors({ code: 'INTERNAL_ERROR', message: 'x' })).toEqual({})
  })
})
