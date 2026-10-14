import { describe, expect, it } from 'vitest'
import {
  defaultResubmitEvidenceMode,
  hasRealReceiptFile,
  resubmitEvidenceModes,
  resubmitFormIssue,
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

/** ตรวจซ้ำ staging SV5-R3-01 — ข้อผิดพลาดฝั่ง client บอกช่องที่ผิด (ให้ฟอร์มเลื่อน/โฟกัสไปช่องนั้นได้) */
describe('resubmitFormIssue — ตรวจฟอร์มส่งใหม่ก่อนส่ง', () => {
  const ok = {
    amountEditable: true,
    amountBaht: '500',
    isHotel: true,
    nightsText: '1',
    newSubstitute: false,
    linesError: null,
    linesTotalSatang: 0,
    cancelsActive: false,
    cancelReason: '',
    receiptMissing: false,
    note: 'แก้ยอดตามที่แจ้ง',
  }

  it('กรอกครบ ⇒ ผ่าน', () => {
    expect(resubmitFormIssue(ok)).toBeNull()
  })

  it('เลือกแนบใบเสร็จจริงแต่ไม่แนบไฟล์ ⇒ ชี้ไปช่องแนบใบเสร็จ', () => {
    expect(resubmitFormIssue({ ...ok, receiptMissing: true })).toEqual({ field: 'receipt', message: 'แนบไฟล์ใบเสร็จก่อนส่ง' })
  })

  it('แต่ละข้อชี้ไปช่องของตัวเอง', () => {
    expect(resubmitFormIssue({ ...ok, amountBaht: '0' })?.field).toBe('amount')
    expect(resubmitFormIssue({ ...ok, amountBaht: 'abc' })?.field).toBe('amount')
    expect(resubmitFormIssue({ ...ok, nightsText: '0' })?.field).toBe('nights')
    expect(resubmitFormIssue({ ...ok, newSubstitute: true, linesError: 'รายการที่ 1: กรอกรายละเอียด' })).toEqual({
      field: 'lines',
      message: 'รายการที่ 1: กรอกรายละเอียด',
    })
    expect(resubmitFormIssue({ ...ok, newSubstitute: true, linesTotalSatang: 60_000 })?.field).toBe('amount')
    expect(resubmitFormIssue({ ...ok, cancelsActive: true, cancelReason: 'ส' })?.field).toBe('cancelReason')
    expect(resubmitFormIssue({ ...ok, note: '   ' })).toEqual({ field: 'note', message: 'ต้องระบุสิ่งที่แก้ไขให้ผู้อนุมัติทราบ' })
  })

  it('ไล่ตามลำดับช่องบนฟอร์มจากบนลงล่าง — ช่องบนสุดที่ผิดมาก่อน', () => {
    expect(resubmitFormIssue({ ...ok, amountBaht: '', receiptMissing: true, note: '' })?.field).toBe('amount')
    expect(resubmitFormIssue({ ...ok, receiptMissing: true, note: '' })?.field).toBe('receipt')
  })

  it('ช่องยอดถูกล็อก / ไม่ใช่ค่าที่พัก ⇒ ไม่ตรวจยอดและจำนวนคืน', () => {
    expect(resubmitFormIssue({ ...ok, amountEditable: false, amountBaht: '', isHotel: false, nightsText: 'x' })).toBeNull()
    // ยอดล็อก ⇒ ไม่เทียบยอดรวมรายการกับยอดเบิก
    expect(resubmitFormIssue({ ...ok, amountEditable: false, newSubstitute: true, linesTotalSatang: 99_999_00 })).toBeNull()
  })
})
