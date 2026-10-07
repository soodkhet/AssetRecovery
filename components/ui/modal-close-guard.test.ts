import { describe, expect, it } from 'vitest'
import { decideModalClose } from '@/components/ui/modal-close-guard'

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
