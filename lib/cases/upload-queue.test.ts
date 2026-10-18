import { describe, expect, it } from 'vitest'
import { EMPTY_CASE_FORM, isCaseFormDirty } from '@/lib/cases/case-form'
import { isDocumentAttached, runWithConcurrency, slotUploadBadge, uploadProgressLabel } from '@/lib/cases/upload-queue'

describe('runWithConcurrency (mytester B-14)', () => {
  it('รันพร้อมกันไม่เกิน limit · ผลเรียงตามลำดับเดิม', async () => {
    let running = 0
    let peak = 0
    const delays = [30, 5, 20, 1, 10]
    const results = await runWithConcurrency(delays, 3, async (delay, index) => {
      running += 1
      peak = Math.max(peak, running)
      await new Promise((resolve) => setTimeout(resolve, delay))
      running -= 1
      return index * 10
    })
    expect(peak).toBe(3)
    expect(results.map((result) => (result.status === 'fulfilled' ? result.value : null))).toEqual([0, 10, 20, 30, 40])
  })

  it('ตัวที่ล้มไม่หยุดตัวอื่น · คืนเป็น rejected', async () => {
    const results = await runWithConcurrency(['a', 'b', 'c'], 2, async (item) => {
      if (item === 'b') throw new Error('ล้ม')
      return item.toUpperCase()
    })
    expect(results.map((result) => result.status)).toEqual(['fulfilled', 'rejected', 'fulfilled'])
  })

  it('ไม่มีรายการ = คืนว่าง', async () => {
    expect(await runWithConcurrency([], 3, async () => 1)).toEqual([])
  })
})

describe('ป้ายสถานะช่องเอกสาร (mytester B-04)', () => {
  it('เลือกไฟล์แล้วแต่ยังไม่ส่ง ≠ อัปโหลดแล้ว', () => {
    expect(slotUploadBadge(0, 1)).toEqual({ label: 'รออัปโหลด 1 ไฟล์', group: 'pending' })
    expect(slotUploadBadge(2, 1).label).toBe('อัปโหลดแล้ว 2 · รออัปโหลด 1 ไฟล์')
  })
  it('ผูกกับเคสแล้ว = อัปโหลดแล้ว ✓ · ไม่มีอะไร = ยังไม่อัปโหลด', () => {
    expect(slotUploadBadge(2, 0)).toEqual({ label: 'อัปโหลดแล้ว ✓ (2 ไฟล์)', group: 'success' })
    expect(slotUploadBadge(0, 0)).toEqual({ label: 'ยังไม่อัปโหลด', group: 'neutral' })
  })
  it('ข้อความความคืบหน้า', () => {
    expect(uploadProgressLabel(1, 3)).toBe('กำลังอัปโหลดไฟล์ 1/3 — อย่าปิดหน้านี้')
  })
})

describe('ฟอร์มรับเคสมีข้อมูลค้าง (mytester B-05)', () => {
  it('ยังไม่แก้อะไร = ไม่ถาม', () => {
    expect(isCaseFormDirty(EMPTY_CASE_FORM, EMPTY_CASE_FORM, 0)).toBe(false)
  })
  it('กรอกช่องใดช่องหนึ่ง หรือเลือกไฟล์ไว้ = ถามก่อนทิ้ง', () => {
    expect(isCaseFormDirty({ ...EMPTY_CASE_FORM, debtorName: 'สมชาย' }, EMPTY_CASE_FORM, 0)).toBe(true)
    expect(isCaseFormDirty(EMPTY_CASE_FORM, EMPTY_CASE_FORM, 1)).toBe(true)
  })
})

describe('isDocumentAttached — คำตอบผูกไฟล์หายแต่ server บันทึกแล้ว ไม่แจ้งว่าไม่สำเร็จ (mytester7 S7-AG5-01)', () => {
  const docs = [
    { fileUrl: 'cases/c1/contract/aaa-contract.pdf', documentType: 'contract' },
    { fileUrl: 'cases/c1/product_photo/45cdd6d4-phone2.jpg', documentType: 'product_photo' },
  ]
  it('path + ช่องตรง = ผูกแล้ว', () => {
    expect(isDocumentAttached(docs, { fileUrl: 'cases/c1/product_photo/45cdd6d4-phone2.jpg', documentType: 'product_photo' })).toBe(true)
  })
  it('ชื่อไฟล์เดียวกันแต่ path ต่าง (อัปโหลดคนละครั้ง) = ยังไม่ผูก', () => {
    expect(isDocumentAttached(docs, { fileUrl: 'cases/c1/product_photo/99999999-phone2.jpg', documentType: 'product_photo' })).toBe(false)
  })
})
