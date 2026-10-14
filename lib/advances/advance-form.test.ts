import { describe, expect, it } from 'vitest'
import { ADVANCE_PAYEE_REQUIRED_MESSAGE, advanceFormIssues } from '@/lib/advances/advance-form'
import { advanceCreateSchema } from '@/lib/advances/schemas'
import { toFieldErrors } from '@/lib/api/validation'
import { parseBahtInput } from '@/lib/format/money'

const CASE_ID = '00000000-0000-4000-8000-000000000001'

/** จำลอง submit() ของฟอร์มขอเงินทดรอง — payload + schema ชุดเดียวกับ modal */
function check(input: { amount?: string; purpose?: string; dueClearDate?: string; caseId?: string | null; needsPayee?: boolean }) {
  const parsed = advanceCreateSchema.safeParse({
    requestedSatang: parseBahtInput(input.amount ?? '') ?? Number.NaN,
    purpose: (input.purpose ?? '').trim(),
    dueClearDate: input.dueClearDate ?? '',
    payeeId: null,
    caseId: input.caseId ?? null,
  })
  return advanceFormIssues({
    schemaErrors: parsed.success ? {} : toFieldErrors(parsed.error),
    needsPayee: input.needsPayee ?? false,
  })
}

describe('advanceFormIssues() — ข้อแรกตามลำดับบนจอ (SV5-R8-01)', () => {
  it('ฟอร์มว่างทั้งหมด ⇒ ข้อแรก = ยอดเงิน (ช่องบนสุด) และมีข้อผิดครบทุกช่องบังคับ', () => {
    const { errors, first } = check({})
    expect(first?.field).toBe('requestedSatang')
    expect(Object.keys(errors).sort()).toEqual(['dueClearDate', 'purpose', 'requestedSatang'])
  })

  it('ยอด "abc" + วันที่ว่าง ⇒ ข้อแรก = ยอดเงิน ไม่ใช่กำหนดเคลียร์ยอด', () => {
    const { first, errors } = check({ amount: 'abc', purpose: 'เดินทางไปติดตามทรัพย์' })
    expect(first?.field).toBe('requestedSatang')
    expect(errors.dueClearDate).toBeDefined()
  })

  it('ผิดเฉพาะกำหนดเคลียร์ยอด ⇒ ข้อแรก = กำหนดเคลียร์ยอด พร้อมข้อความของช่อง', () => {
    const { first } = check({ amount: '500', purpose: 'เดินทางไปติดตามทรัพย์' })
    expect(first?.field).toBe('dueClearDate')
    expect(first?.message).not.toBe('')
  })

  it('ต้องเลือกผู้รับ (ขอแทนอย่างเดียว) ⇒ ข้อแรก = ผู้รับเงิน เหนือช่องอื่นทั้งหมด', () => {
    const { first, errors } = check({ needsPayee: true })
    expect(first).toEqual({ field: 'payeeId', message: ADVANCE_PAYEE_REQUIRED_MESSAGE })
    expect(errors.requestedSatang).toBeDefined()
  })

  it('อ้างอิงเคสผิดรูปแบบมาก่อนกำหนดเคลียร์ยอด แต่หลังวัตถุประสงค์', () => {
    expect(check({ amount: '500', purpose: 'เดินทางไปติดตามทรัพย์', caseId: 'not-a-uuid' }).first?.field).toBe('caseId')
    expect(check({ amount: '500', caseId: 'not-a-uuid' }).first?.field).toBe('purpose')
    expect(check({ amount: '500', purpose: 'เดินทางไปติดตามทรัพย์', caseId: CASE_ID }).first?.field).toBe('dueClearDate')
  })

  it('ไม่มีข้อผิด ⇒ first = null', () => {
    expect(advanceFormIssues({ schemaErrors: {}, needsPayee: false })).toEqual({ errors: {}, first: null })
  })

  it('key ที่ไม่อยู่ในลำดับไปท้ายสุด · ข้อความ payee จาก schema ไม่ถูกทับ', () => {
    expect(advanceFormIssues({ schemaErrors: { _: 'x', dueClearDate: 'y' }, needsPayee: false }).first?.field).toBe('dueClearDate')
    expect(advanceFormIssues({ schemaErrors: { payeeId: 'รูปแบบไม่ถูกต้อง' }, needsPayee: true }).errors.payeeId).toBe('รูปแบบไม่ถูกต้อง')
  })
})
