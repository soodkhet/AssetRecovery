import { describe, expect, it } from 'vitest'
import { draftOwnerTransition } from '@/components/ui'

/**
 * มติผู้ใช้ 14/10/2569 — ฟอร์มที่ผูกกับรายการ: เปลี่ยนรายการ ⇒ ล้างร่าง · เปิดรายการเดิม ⇒ คงร่าง
 * (ตัว hook `useResetOnRecordChange` บางมาก — repo ไม่มี DOM test ⇒ ตรวจส่วน hook ด้วยมือ/E2E)
 */
describe('draftOwnerTransition()', () => {
  it('เปิดครั้งแรก ⇒ จำเจ้าของ ไม่ล้าง', () => {
    expect(draftOwnerTransition(null, 'adv-1')).toEqual({ owner: 'adv-1', reset: false })
  })

  it('ปิดฟอร์ม ⇒ คงร่างและเจ้าของเดิม', () => {
    expect(draftOwnerTransition('adv-1', null)).toEqual({ owner: 'adv-1', reset: false })
  })

  it('เปิดซ้ำรายการเดิม (หลังปิด) ⇒ คงร่าง', () => {
    const closed = draftOwnerTransition('adv-1', null)
    expect(draftOwnerTransition(closed.owner, 'adv-1')).toEqual({ owner: 'adv-1', reset: false })
  })

  it('เปิดรายการอื่น (หลังปิด) ⇒ ล้างร่าง + เปลี่ยนเจ้าของ', () => {
    const closed = draftOwnerTransition('adv-1', null)
    expect(draftOwnerTransition(closed.owner, 'adv-2')).toEqual({ owner: 'adv-2', reset: true })
  })

  it('สลับรายการตรง ๆ โดยไม่ปิด ⇒ ล้างร่าง', () => {
    expect(draftOwnerTransition('adv-1', 'adv-2')).toEqual({ owner: 'adv-2', reset: true })
  })

  it('ปิดค้างตั้งแต่ mount ⇒ ไม่ทำอะไร', () => {
    expect(draftOwnerTransition(null, null)).toEqual({ owner: null, reset: false })
  })
})
