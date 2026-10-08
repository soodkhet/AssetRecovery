import { describe, expect, it } from 'vitest'
import {
  ClaimDuplicateError,
  ClaimReceiptReusedError,
  DUPLICATE_CLAIM_WINDOW_MS,
  findReceiptReuse,
  isDuplicateClaimSubmission,
  type ExistingClaim,
} from '@/lib/claims/duplicate-submission'

const now = new Date('2026-10-07T07:00:00Z')
const candidate = {
  payeeId: 'p1',
  expenseType: 'hotel',
  grossSatang: 80_000,
  expenseDate: new Date('2026-10-06T00:00:00Z'),
  receiptFileHash: 'a'.repeat(64),
  revisionNote: 'โรงแรมใกล้บ้านลูกหนี้',
  hotelNights: 1,
  sharedWithUserId: null,
  receiptInCompanyName: false,
}
const existing = (patch: Partial<ExistingClaim> = {}): ExistingClaim => ({
  ...candidate,
  status: 'pending_approval',
  createdAt: new Date(now.getTime() - 60_000),
  ...patch,
})

describe('isDuplicateClaimSubmission', () => {
  it('รายการเดียวกันที่เพิ่งส่ง = ซ้ำ', () => {
    expect(isDuplicateClaimSubmission(candidate, existing(), now)).toBe(true)
  })

  it('ไม่มีใบเสร็จทั้งคู่ (ใบรับรองแทนใบเสร็จ) ก็นับว่าตรง', () => {
    expect(
      isDuplicateClaimSubmission({ ...candidate, receiptFileHash: null }, existing({ receiptFileHash: null }), now),
    ).toBe(true)
  })

  it('ใบเสร็จต่างไฟล์ / มีกับไม่มี = ไม่ซ้ำ', () => {
    expect(isDuplicateClaimSubmission(candidate, existing({ receiptFileHash: 'b'.repeat(64) }), now)).toBe(false)
    expect(isDuplicateClaimSubmission(candidate, existing({ receiptFileHash: null }), now)).toBe(false)
  })

  it.each([
    ['ผู้รับเงิน', { payeeId: 'p2' }],
    ['ประเภท', { expenseType: 'fuel' }],
    ['ยอด (ต่าง 1 สตางค์)', { grossSatang: 80_001 }],
    ['วันที่รายจ่าย', { expenseDate: new Date('2026-10-05T00:00:00Z') }],
    ['หมายเหตุ', { revisionNote: 'อีกโรงแรม' }],
    ['จำนวนคืน', { hotelNights: 2 }],
    ['ผู้พักร่วม', { sharedWithUserId: 'u2' }],
    ['ใบเสร็จในนามบริษัท', { receiptInCompanyName: true }],
  ])('ต่าง%s = ไม่ซ้ำ', (_label, patch) => {
    expect(isDuplicateClaimSubmission(candidate, existing(patch), now)).toBe(false)
  })

  it('เบิกมือ (ไม่ใช่ค่าที่พัก) ไม่เทียบช่องเฉพาะค่าที่พัก — ค่า default ใน DB ไม่ทำให้หลุดการกันซ้ำ', () => {
    const manual = { ...candidate, expenseType: 'receipt', hotelNights: null, receiptInCompanyName: false }
    expect(isDuplicateClaimSubmission(manual, existing({ expenseType: 'receipt', hotelNights: 1 }), now)).toBe(true)
  })

  it('ใบเดิมที่ถูกตีกลับหรือถูกแทนที่ ไม่นับ', () => {
    expect(isDuplicateClaimSubmission(candidate, existing({ status: 'rejected' }), now)).toBe(false)
    expect(isDuplicateClaimSubmission(candidate, existing({ status: 'superseded' }), now)).toBe(false)
  })

  it('ใบเดิมที่อนุมัติแล้วยังนับ (ยังอยู่ในช่วงเวลา)', () => {
    expect(isDuplicateClaimSubmission(candidate, existing({ status: 'approved' }), now)).toBe(true)
  })

  it('ขอบช่วงเวลา: พอดี 10 นาทีนับ · เกินไป 1 ms ไม่นับ', () => {
    const at = (ms: number) => existing({ createdAt: new Date(now.getTime() - ms) })
    expect(isDuplicateClaimSubmission(candidate, at(DUPLICATE_CLAIM_WINDOW_MS), now)).toBe(true)
    expect(isDuplicateClaimSubmission(candidate, at(DUPLICATE_CLAIM_WINDOW_MS + 1), now)).toBe(false)
  })
})

describe('ClaimDuplicateError', () => {
  it('ตอบ 409 พร้อม id ใบเดิม ไม่มีเลขอ้างอิงสเปคในข้อความ', () => {
    const error = new ClaimDuplicateError('e1')
    expect(error.code).toBe('CLAIM_DUPLICATE_SUBMISSION')
    expect(error.status).toBe(409)
    expect(error.context).toEqual({ existingExpenseId: 'e1' })
    expect(error.userMessage).not.toMatch(/§|ไฟล์ \d/)
  })
})

describe('findReceiptReuse (preship R3-004)', () => {
  const hash = 'a'.repeat(64)
  const holder = (id: string, status: string, receiptFileHash: string | null = hash) => ({ id, status, receiptFileHash })

  it('ใบเสร็จเดียวกันอยู่ในใบเบิกที่ยังมีผล = ใช้ซ้ำ ไม่ว่าสร้างนานแค่ไหน/หมายเหตุต่างกัน', () => {
    expect(findReceiptReuse(hash, [holder('e1', 'pending_approval')])?.id).toBe('e1')
    expect(findReceiptReuse(hash, [holder('e1', 'approved')])?.id).toBe('e1')
    expect(findReceiptReuse(hash, [holder('e1', 'paid')])?.id).toBe('e1')
  })

  it('ใบเดิมถูกตีกลับ/แทนที่แล้ว = ใช้ใบเสร็จนั้นเบิกใหม่ได้', () => {
    expect(findReceiptReuse(hash, [holder('e1', 'rejected'), holder('e2', 'superseded')])).toBeUndefined()
  })

  it('ไม่นับตัวเอง (ส่งใหม่หลังตีกลับด้วยใบเสร็จเดิม)', () => {
    expect(findReceiptReuse(hash, [holder('self', 'rejected')], 'self')).toBeUndefined()
    expect(findReceiptReuse(hash, [holder('self', 'rejected'), holder('e2', 'pending_approval')], 'self')?.id).toBe('e2')
  })

  it('ไม่มีใบเสร็จ (ใบรับรองแทนใบเสร็จ) / ใบเสร็จต่างไฟล์ ไม่นับ', () => {
    expect(findReceiptReuse(null, [holder('e1', 'pending_approval', null)])).toBeUndefined()
    expect(findReceiptReuse(hash, [holder('e1', 'pending_approval', 'b'.repeat(64))])).toBeUndefined()
  })
})

describe('ClaimReceiptReusedError', () => {
  it('ใช้ code เดิม 409 · ผู้รับเงินเดียวกันเห็น id ใบเดิม · คนอื่นไม่ leak id', () => {
    const own = new ClaimReceiptReusedError('e1', true)
    expect(own.code).toBe('CLAIM_DUPLICATE_SUBMISSION')
    expect(own.status).toBe(409)
    expect(own.context).toEqual({ reason: 'receipt_reused', existingExpenseId: 'e1' })
    const other = new ClaimReceiptReusedError('e9', false)
    expect(other.context).toEqual({ reason: 'receipt_reused' })
    expect(own.userMessage).toContain('ใบเบิกอื่นของคุณ')
    expect(other.userMessage).toContain('รายการอื่น')
    for (const error of [own, other]) {
      expect(error.userMessage).toContain('ใบเสร็จ')
      expect(error.userMessage).not.toMatch(/§|ไฟล์ \d/)
    }
  })

  it('ใบเสร็จที่ใช้เคลียร์เงินทดรองของตัวเอง ⇒ บอกว่าเป็นเงินทดรอง (preship R7-008) · ของคนอื่นไม่บอกชนิดรายการ', () => {
    const own = new ClaimReceiptReusedError('a1', true, 'advance')
    expect(own.userMessage).toContain('เคลียร์เงินทดรองของคุณ')
    expect(own.userMessage).not.toContain('ใบเบิกอื่น')
    expect(own.context).toEqual({ reason: 'receipt_reused', existingAdvanceId: 'a1' })
    const other = new ClaimReceiptReusedError('a9', false, 'advance')
    expect(other.userMessage).not.toContain('เงินทดรอง')
    expect(other.context).toEqual({ reason: 'receipt_reused' })
  })
})

describe('isOwnExcessClaim (preship L6-001)', () => {
  it('audit การเคลียร์ที่สร้างใบเบิกส่วนเกินใบนี้ ⇒ true · ใบอื่น/ไม่มี ⇒ false', async () => {
    const { isOwnExcessClaim } = await import('@/lib/claims/duplicate-submission-queries')
    expect(isOwnExcessClaim({ excess_claim_id: 'e1' }, 'e1')).toBe(true)
    expect(isOwnExcessClaim({ excess_claim_id: 'e1' }, 'e2')).toBe(false)
    expect(isOwnExcessClaim({ excess_claim_id: null }, 'e1')).toBe(false)
    expect(isOwnExcessClaim({ excess_claim_id: 'e1' }, undefined)).toBe(false)
    expect(isOwnExcessClaim(null, 'e1')).toBe(false)
  })
})
