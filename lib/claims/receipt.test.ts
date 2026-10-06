import { describe, expect, it } from 'vitest'
import { advanceSettleSchema } from '@/lib/advances/schemas'
import { hasUnverifiedReceipt, isReceiptVerified, verifiedReceiptPath } from '@/lib/claims/receipt'
import { claimCreateSchema } from '@/lib/claims/schemas'
import { isIdDocumentVerified, payeeIdDocumentPath, checkPayeeIdDocumentCandidate } from '@/lib/payees/id-document'

/**
 * มติ PO 07/10/2569 U143 (ใบเสร็จเบิกด้วยมือ/เคลียร์เงินทดรอง = อัปโหลดจริง) + U150 (เอกสารยืนยันตัวตนผู้รับเงิน)
 * — ส่วน pure: สถานะ "ตรวจแล้ว" + กติกาใบเสร็จหรือใบรับรองแทนใบเสร็จใน schema ชุดเดียว FE/BE
 */

const HASH = 'a'.repeat(64)

describe('ใบเสร็จที่ตรวจแล้ว (U143)', () => {
  it('มี path + hash ของ server + ไม่ใช่ข้อมูลเก่า ⇒ ตรวจแล้ว · Export ใช้ path นี้', () => {
    const state = { receiptFileUrl: 'expenses/u/receipts/a.pdf', receiptFileHash: HASH, receiptFileUnverified: false }
    expect(isReceiptVerified(state)).toBe(true)
    expect(verifiedReceiptPath(state)).toBe('expenses/u/receipts/a.pdf')
    expect(hasUnverifiedReceipt(state)).toBe(false)
  })

  it('path เก่าที่พิมพ์เอง (ทำเครื่องหมายไว้) ⇒ ถือว่าไม่มีไฟล์ แต่ยังรู้ว่ามี path ค้าง (ป้ายเตือน)', () => {
    const legacy = { receiptFileUrl: 'ลิงก์ที่พิมพ์เอง', receiptFileHash: null, receiptFileUnverified: true }
    expect(verifiedReceiptPath(legacy)).toBeNull()
    expect(hasUnverifiedReceipt(legacy)).toBe(true)
    // flag ทับ hash เสมอ (กันข้อมูลเก่าที่บังเอิญมี hash ปน)
    expect(verifiedReceiptPath({ ...legacy, receiptFileHash: HASH })).toBeNull()
  })

  it('ไม่มี path / path ว่าง ⇒ ไม่มีไฟล์ และไม่ใช่ข้อมูลเก่า', () => {
    for (const receiptFileUrl of [null, '   ']) {
      const state = { receiptFileUrl, receiptFileHash: null, receiptFileUnverified: false }
      expect(verifiedReceiptPath(state)).toBeNull()
      expect(hasUnverifiedReceipt(state)).toBe(false)
    }
  })
})

describe('เบิกด้วยมือ: ใบเสร็จ หรือ ใบรับรองแทนใบเสร็จ อย่างใดอย่างหนึ่ง (U143 · กติกาเดิม U103)', () => {
  const base = { claimType: 'manual', grossSatang: 30_000, expenseDate: '2026-10-05', payeeId: null, note: 'ค่าเดินทาง' }
  const lines = [{ lineDate: '2026-10-05', description: 'ค่าทางด่วน', amountSatang: 30_000, note: null }]

  it('มีใบเสร็จ (path จากการอัปโหลด) ⇒ ผ่าน', () => {
    expect(claimCreateSchema.safeParse({ ...base, receiptFileUrl: 'expenses/u/receipts/a.pdf' }).success).toBe(true)
  })

  it('ไม่มีทั้งสองอย่าง ⇒ field error ที่ใบเสร็จ', () => {
    const parsed = claimCreateSchema.safeParse({ ...base, receiptFileUrl: '' })
    expect(parsed.success).toBe(false)
    expect(parsed.error?.issues.map((issue) => issue.path.join('.'))).toContain('receiptFileUrl')
  })

  it('ใบรับรองแทนใบเสร็จยอดรวมเท่ายอดเบิก ⇒ ผ่าน · ไม่เท่า ⇒ field error ที่ยอด', () => {
    expect(claimCreateSchema.safeParse({ ...base, substituteReceipt: { lines } }).success).toBe(true)
    const mismatch = claimCreateSchema.safeParse({ ...base, grossSatang: 40_000, substituteReceipt: { lines } })
    expect(mismatch.error?.issues.map((issue) => issue.path.join('.'))).toContain('grossSatang')
  })

  it('ส่งทั้งใบเสร็จและใบรับรอง ⇒ ปฏิเสธ', () => {
    const both = claimCreateSchema.safeParse({ ...base, receiptFileUrl: 'expenses/u/receipts/a.pdf', substituteReceipt: { lines } })
    expect(both.success).toBe(false)
  })
})

describe('เคลียร์เงินทดรอง: มีรายจ่าย ⇒ ต้องมีใบเสร็จหรือใบรับรอง (U143)', () => {
  it('ใช้จริง > 0 ไม่มีทั้งสองอย่าง ⇒ field error ที่ใบเสร็จ', () => {
    const parsed = advanceSettleSchema.safeParse({ usedSatang: 100_000 })
    expect(parsed.error?.issues.map((issue) => issue.path.join('.'))).toContain('receiptFileUrl')
  })

  it('ใช้จริง 0 (คืนเต็มจำนวน) ⇒ ไม่ต้องมีใบเสร็จ', () => {
    expect(advanceSettleSchema.safeParse({ usedSatang: 0 }).success).toBe(true)
  })

  it('มีใบเสร็จ หรือมีใบรับรองบางส่วน ⇒ ผ่าน', () => {
    expect(advanceSettleSchema.safeParse({ usedSatang: 100_000, receiptFileUrl: 'expenses/u/receipts/a.pdf' }).success).toBe(true)
    expect(
      advanceSettleSchema.safeParse({
        usedSatang: 100_000,
        substituteReceipt: { lines: [{ lineDate: '2026-10-05', description: 'ค่าที่จอดรถ', amountSatang: 4_000, note: null }] },
      }).success,
    ).toBe(true)
  })
})

describe('เอกสารยืนยันตัวตนผู้รับเงิน (U150)', () => {
  it('path ต่อไฟล์ใต้องค์กร · นามสกุลตัวเล็ก', () => {
    expect(payeeIdDocumentPath('org-1', 'บัตร.JPG', 'k1')).toBe('payees/org-1/id-documents/k1.jpg')
  })

  it('ตรวจแล้ว = มี path + hash + ไม่ใช่ URL เก่า', () => {
    expect(isIdDocumentVerified({ idDocumentUrl: 'payees/o/id-documents/k.pdf', idDocumentHash: HASH, idDocumentUnverified: false })).toBe(true)
    expect(isIdDocumentVerified({ idDocumentUrl: 'https://legacy.test/id.pdf', idDocumentHash: null, idDocumentUnverified: true })).toBe(false)
    expect(isIdDocumentVerified({ idDocumentUrl: null, idDocumentHash: null, idDocumentUnverified: false })).toBe(false)
  })

  it('ตรวจไฟล์ก่อนอัปโหลด: รูป/PDF ≤ 10 MB เท่านั้น (UX — ตัวบังคับจริงคือ server)', () => {
    expect(checkPayeeIdDocumentCandidate({ name: 'a.pdf', type: 'application/pdf', size: 1000 })).toBeNull()
    expect(checkPayeeIdDocumentCandidate({ name: 'a.docx', type: 'application/msword', size: 1000 })).not.toBeNull()
    expect(checkPayeeIdDocumentCandidate({ name: 'a.jpg', type: 'image/jpeg', size: 11 * 1024 * 1024 })).not.toBeNull()
    expect(checkPayeeIdDocumentCandidate({ name: 'a.jpg', type: 'image/jpeg', size: 0 })).not.toBeNull()
  })
})
