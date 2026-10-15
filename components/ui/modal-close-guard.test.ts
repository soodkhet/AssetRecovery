import { describe, expect, it } from 'vitest'
import { busyElementLocksModal, decideModalClose, discardAndClose, dropMarksDraft, MODAL_BUSY_IGNORE } from '@/components/ui/modal-close-guard'

describe('decideModalClose', () => {
  it('ระหว่างบันทึก ปิดไม่ได้เลย แม้กรอกข้อมูลไว้หรือปิดการยืนยันทิ้ง', () => {
    expect(decideModalClose({ busy: true, dirty: false, confirmDiscard: true })).toBe('ignore')
    expect(decideModalClose({ busy: true, dirty: true, confirmDiscard: true })).toBe('ignore')
    expect(decideModalClose({ busy: true, dirty: true, confirmDiscard: false })).toBe('ignore')
  })

  it('กรอกข้อมูลแล้ว ต้องยืนยันก่อนทิ้ง', () => {
    expect(decideModalClose({ busy: false, dirty: true, confirmDiscard: true })).toBe('confirm-discard')
  })

  it('modal ที่ปิดการยืนยันทิ้ง ปิดได้ทันทีแม้กรอกแล้ว', () => {
    expect(decideModalClose({ busy: false, dirty: true, confirmDiscard: false })).toBe('close')
  })

  it('ยังไม่ได้กรอกอะไร ปิดได้ทันที', () => {
    expect(decideModalClose({ busy: false, dirty: false, confirmDiscard: true })).toBe('close')
  })
})

describe('busyElementLocksModal (R3-002 → R4-006)', () => {
  it('ปุ่มที่หมุนใน modal ล็อกเสมอ — รวมปุ่มบันทึกที่อยู่ใน body', () => {
    expect(busyElementLocksModal({ optedOut: false })).toBe(true)
  })

  it('ปุ่มย่อยที่ติด data-modal-busy="ignore" (ค้นหา) ไม่ล็อกทั้ง modal', () => {
    expect(busyElementLocksModal({ optedOut: true })).toBe(false)
    expect(MODAL_BUSY_IGNORE).toEqual({ 'data-modal-busy': 'ignore' })
  })
})

describe('discardAndClose (SV5-J1-01)', () => {
  it('มี onDiscard ⇒ ล้างร่างก่อนแล้วจึงปิด', () => {
    const calls: string[] = []
    discardAndClose({ onDiscard: () => calls.push('discard'), onClose: () => calls.push('close') })
    expect(calls).toEqual(['discard', 'close'])
  })

  it('ไม่มี onDiscard ⇒ ปิดอย่างเดียว', () => {
    const calls: string[] = []
    discardAndClose({ onDiscard: undefined, onClose: () => calls.push('close') })
    expect(calls).toEqual(['close'])
  })
})

describe('dropMarksDraft (ตรวจซ้ำ staging SV5-P1-01)', () => {
  it('ลากไฟล์วางในโซนที่รับไฟล์ ⇒ มีร่าง (ปิดแล้วถามทิ้ง)', () => {
    expect(dropMarksDraft({ handled: true, fileCount: 1 })).toBe(true)
  })

  it('วางนอกโซนที่รับ หรือไม่มีไฟล์ ⇒ ไม่นับ', () => {
    expect(dropMarksDraft({ handled: false, fileCount: 1 })).toBe(false)
    expect(dropMarksDraft({ handled: true, fileCount: 0 })).toBe(false)
  })
})
