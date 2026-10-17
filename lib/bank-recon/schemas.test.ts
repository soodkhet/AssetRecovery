import { describe, expect, it } from 'vitest'
import {
  isDateOnlyAfterBangkokToday,
  REFUND_DATE_IN_FUTURE_MESSAGE,
  refundSuspenseInputIssues,
  refundSuspenseInputProblem,
  refundSuspenseSchema,
} from '@/lib/bank-recon/schemas'

describe('วันที่คืนเงินผู้โอนห้ามเกินวันนี้ (มติชั่วคราว M6 H-03)', () => {
  // 11/10/2569 20:00 เวลาไทย = 13:00Z
  const now = new Date('2026-10-11T13:00:00Z')

  it('วันนี้/ย้อนหลัง = ผ่าน · พรุ่งนี้ = เกิน', () => {
    expect(isDateOnlyAfterBangkokToday(new Date('2026-10-11T00:00:00Z'), now)).toBe(false)
    expect(isDateOnlyAfterBangkokToday(new Date('2026-10-01T00:00:00Z'), now)).toBe(false)
    expect(isDateOnlyAfterBangkokToday(new Date('2026-10-12T00:00:00Z'), now)).toBe(true)
  })

  it('ใช้วันตามเวลาไทย: 12/10 01:00 น. ไทย (= 11/10 18:00Z) วันที่ 12/10 ถือเป็นวันนี้', () => {
    const earlyBangkok = new Date('2026-10-11T18:00:00Z')
    expect(isDateOnlyAfterBangkokToday(new Date('2026-10-12T00:00:00Z'), earlyBangkok)).toBe(false)
  })

  it('Zod ปฏิเสธวันที่อนาคตพร้อมข้อความที่ช่อง refundDate', () => {
    const result = refundSuspenseSchema.safeParse({ refundDate: '2999-01-01', reason: 'คืน', filePath: 'a/b.pdf' })
    expect(result.success).toBe(false)
    expect(result.error?.issues[0]?.path).toEqual(['refundDate'])
    expect(refundSuspenseSchema.safeParse({ refundDate: '2020-01-01', reason: 'คืน', filePath: 'a/b.pdf' }).success).toBe(true)
  })
})

describe('refundSuspenseInputProblem — ตรวจก่อนอัปโหลดสลิป (mytester2 H2-02)', () => {
  it('วันที่อนาคต ⇒ ข้อความเดียวกับ server (ไม่อัปโหลด) · ข้อมูลครบถูกต้อง ⇒ null', () => {
    expect(refundSuspenseInputProblem({ refundDate: '2999-01-01', reason: 'โอนผิดบัญชี' })).toBe(REFUND_DATE_IN_FUTURE_MESSAGE)
    expect(refundSuspenseInputProblem({ refundDate: '2020-01-01', reason: '   ' })).toBe('ต้องระบุเหตุผลที่คืนเงิน')
    expect(refundSuspenseInputProblem({ refundDate: '2020-01-01', reason: 'โอนผิดบัญชี' })).toBeNull()
  })
})

describe('refundSuspenseInputIssues — ข้อผิดรายช่อง (mytester6 T-023)', () => {
  it('วันที่อนาคต ⇒ ผูกช่อง refundDate · เหตุผลว่าง ⇒ ช่อง reason · ถูกต้อง ⇒ {}', () => {
    expect(refundSuspenseInputIssues({ refundDate: '2999-01-01', reason: 'โอนผิดบัญชี' })).toEqual({
      refundDate: REFUND_DATE_IN_FUTURE_MESSAGE,
    })
    expect(refundSuspenseInputIssues({ refundDate: '2999-01-01', reason: ' ' })).toEqual({
      refundDate: REFUND_DATE_IN_FUTURE_MESSAGE,
      reason: 'ต้องระบุเหตุผลที่คืนเงิน',
    })
    expect(refundSuspenseInputIssues({ refundDate: '2020-01-01', reason: 'โอนผิดบัญชี' })).toEqual({})
  })
})
