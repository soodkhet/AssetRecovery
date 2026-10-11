import { describe, expect, it } from 'vitest'
import { hasOpenModal, registerModal, subscribeModalStack, unregisterModal } from '@/components/ui/modal-stack'
import { toastViewportPositionClass } from '@/components/ui/toast-position'

describe('toast ไม่บังปุ่มหลักของ modal (mytester2 G2-02)', () => {
  it('ไม่มี modal ⇒ มุมล่างตามเดิม (หน้าภาคสนามยกเหนือแถบเมนูล่าง)', () => {
    expect(toastViewportPositionClass({ modalOpen: false, aboveBottomNav: false })).toBe('bottom-4')
    expect(toastViewportPositionClass({ modalOpen: false, aboveBottomNav: true })).toContain('bottom-[calc(5rem')
  })

  it('มี modal เปิด ⇒ ย้ายขึ้นมุมบน ไม่ใช้ตำแหน่งล่างเลย', () => {
    for (const aboveBottomNav of [false, true]) {
      const position = toastViewportPositionClass({ modalOpen: true, aboveBottomNav })
      expect(position).toMatch(/^top-/)
      expect(position).not.toContain('bottom')
    }
  })

  it('modal-stack แจ้งผู้ฟังเมื่อเปิด/ปิด modal และ hasOpenModal ตามจริง', () => {
    let calls = 0
    const unsubscribe = subscribeModalStack(() => {
      calls += 1
    })
    expect(hasOpenModal()).toBe(false)
    const token = registerModal()
    expect(hasOpenModal()).toBe(true)
    unregisterModal(token)
    unregisterModal(token) // ถอนซ้ำ = ไม่แจ้งซ้ำ
    expect(hasOpenModal()).toBe(false)
    expect(calls).toBe(2)
    unsubscribe()
    unregisterModal(registerModal())
    expect(calls).toBe(2)
  })
})
