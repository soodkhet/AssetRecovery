import { describe, expect, it } from 'vitest'
import {
  defaultResubmitEvidenceMode,
  hasRealReceiptFile,
  resubmitEvidenceModes,
  resubmitReceiptFileRequired,
  resubmitReceiptPickerText,
} from '@/lib/field/resubmit-evidence'

/** ตรวจซ้ำ staging SV5-R2-01 — ทางเลือกหลักฐานในฟอร์มส่งใหม่ (มติ PO 14/10/2569 แนวทาง ก) */
describe('หลักฐานในฟอร์มแก้ไขรายการเบิกที่ถูกตีกลับ', () => {
  const cancelledOnly = { hasActiveSubstitute: false, hasSubstituteHistory: true, hasRealReceipt: false }
  const active = { hasActiveSubstitute: true, hasSubstituteHistory: true, hasRealReceipt: false }
  const plain = { hasActiveSubstitute: false, hasSubstituteHistory: false, hasRealReceipt: true }

  it('ค่าเริ่มต้น: ใบถูกยกเลิก ⇒ ออกใบใหม่ · มีใบที่ใช้งานอยู่ ⇒ ใช้ใบเดิม · มีใบเสร็จจริง ⇒ ใบเสร็จ', () => {
    expect(defaultResubmitEvidenceMode(cancelledOnly)).toBe('new_substitute')
    expect(defaultResubmitEvidenceMode(active)).toBe('keep_substitute')
    expect(defaultResubmitEvidenceMode(plain)).toBe('receipt')
    expect(defaultResubmitEvidenceMode({ ...cancelledOnly, hasRealReceipt: true })).toBe('receipt')
  })

  it('ตัวเลือกที่แสดง', () => {
    expect(resubmitEvidenceModes(cancelledOnly)).toEqual(['new_substitute', 'receipt'])
    expect(resubmitEvidenceModes(active)).toEqual(['keep_substitute', 'new_substitute', 'receipt'])
    expect(resubmitEvidenceModes(plain)).toEqual([])
    // เคยใช้ใบรับรองแต่ตอนนี้มีใบเสร็จจริงแล้ว ⇒ ช่องใบเสร็จอย่างเดียว (ออกใบรับรองซ้อนไม่ได้)
    expect(resubmitEvidenceModes({ ...cancelledOnly, hasRealReceipt: true })).toEqual([])
  })

  it('ไม่อ้าง "ใบเสร็จเดิม" เมื่อไม่เคยมีใบเสร็จจริง', () => {
    expect(resubmitReceiptPickerText({ hasExistingReceipt: false, fileName: null })).not.toContain('ใบเสร็จเดิม')
    expect(resubmitReceiptPickerText({ hasExistingReceipt: true, fileName: null })).toContain('ใช้ใบเสร็จเดิม')
    expect(resubmitReceiptPickerText({ hasExistingReceipt: false, fileName: 'r.jpg' })).toBe('r.jpg')
    // ไฟล์ของใบเบิกที่มีใบรับรองใช้งานอยู่คือฉบับเซ็น ไม่ใช่ใบเสร็จจริง
    expect(hasRealReceiptFile({ receiptFileUrl: 'x', hasActiveSubstitute: true })).toBe(false)
    expect(hasRealReceiptFile({ receiptFileUrl: 'x', hasActiveSubstitute: false })).toBe(true)
    expect(hasRealReceiptFile({ receiptFileUrl: null, hasActiveSubstitute: false })).toBe(false)
  })

  it('บังคับแนบไฟล์เมื่อเลือกใบเสร็จจริงแทนใบรับรอง หรือค่าที่พักที่ไม่มีใบเสร็จ', () => {
    expect(resubmitReceiptFileRequired({ ...cancelledOnly, mode: 'receipt', isHotel: true })).toBe(true)
    expect(resubmitReceiptFileRequired({ ...active, mode: 'receipt', isHotel: false })).toBe(true)
    expect(resubmitReceiptFileRequired({ ...cancelledOnly, mode: 'new_substitute', isHotel: true })).toBe(false)
    expect(resubmitReceiptFileRequired({ ...plain, mode: 'receipt', isHotel: true })).toBe(false)
    expect(
      resubmitReceiptFileRequired({ hasActiveSubstitute: false, hasSubstituteHistory: false, hasRealReceipt: false, mode: 'receipt', isHotel: false }),
    ).toBe(false)
  })
})
