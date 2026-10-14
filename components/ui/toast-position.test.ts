import { describe, expect, it } from 'vitest'
import { TOUCH_TARGET_CLASS } from '@/components/ui/button'
import {
  hasOpenModal,
  registerModal,
  subscribeModalStack,
  topModalToastPlacement,
  unregisterModal,
} from '@/components/ui/modal-stack'
import { TOAST_DISMISS_BUTTON_CLASS, toastViewportPositionClass } from '@/components/ui/toast-position'

describe('toast ไม่บังปุ่มหลักของ modal (mytester2 G2-02)', () => {
  it('ไม่มี modal ⇒ มุมล่างตามเดิม (หน้าภาคสนามยกเหนือแถบเมนูล่าง)', () => {
    expect(toastViewportPositionClass({ modalPlacement: null, aboveBottomNav: false })).toBe('bottom-4')
    expect(toastViewportPositionClass({ modalPlacement: null, aboveBottomNav: true })).toContain('bottom-[calc(5rem')
  })

  it('modal กลางเปิด ⇒ ย้ายขึ้นมุมบน ไม่ใช้ตำแหน่งล่างเลย', () => {
    for (const aboveBottomNav of [false, true]) {
      const position = toastViewportPositionClass({ modalPlacement: 'top', aboveBottomNav })
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

describe('toast ไม่บังหัว/ปุ่มปิดของเมนู-ลิ้นชักเต็มความสูง (SV5-D3-01)', () => {
  it('เมนู/ตัวดูรูปเต็มจอ ⇒ คงมุมล่าง ยกพ้นส่วนท้ายแผง + safe-area ไม่ขึ้นมุมบน', () => {
    for (const aboveBottomNav of [false, true]) {
      const position = toastViewportPositionClass({ modalPlacement: 'bottom', aboveBottomNav })
      expect(position).toMatch(/^bottom-/)
      expect(position).toContain('safe-area-inset-bottom')
      expect(position).not.toMatch(/(^|\s)top-/)
    }
  })

  it('registerModal ค่าเริ่มต้น = top (modal กลางไม่ถดถอย) · ชั้นบนสุดเป็นผู้ตัดสิน', () => {
    expect(topModalToastPlacement()).toBeNull()
    const drawer = registerModal({ toastPlacement: 'bottom' })
    expect(topModalToastPlacement()).toBe('bottom')
    const modal = registerModal()
    expect(topModalToastPlacement()).toBe('top')
    const viewer = registerModal({ toastPlacement: 'bottom' })
    expect(topModalToastPlacement()).toBe('bottom')
    // ปิดตัวกลางกองก่อน (ไม่เรียงลำดับ) — ชั้นบนยังเป็นตัวดูรูป
    unregisterModal(modal)
    expect(topModalToastPlacement()).toBe('bottom')
    unregisterModal(viewer)
    expect(topModalToastPlacement()).toBe('bottom')
    unregisterModal(drawer)
    expect(topModalToastPlacement()).toBeNull()
  })

  it('ปุ่มปิด toast เป้าแตะ ≥44×44px บนจอสัมผัส (เดิม 18×18)', () => {
    expect(TOAST_DISMISS_BUTTON_CLASS).toContain(TOUCH_TARGET_CLASS)
    expect(TOUCH_TARGET_CLASS).toContain('pointer-coarse:min-h-11')
    expect(TOUCH_TARGET_CLASS).toContain('pointer-coarse:min-w-11')
    // ไอคอนอยู่กลางเป้าแตะ
    expect(TOAST_DISMISS_BUTTON_CLASS).toContain('items-center')
    expect(TOAST_DISMISS_BUTTON_CLASS).toContain('justify-center')
  })
})
