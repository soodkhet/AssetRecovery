import { describe, expect, it } from 'vitest'
import { TOUCH_TARGET_CLASS } from '@/components/ui/button'
import {
  hasOpenModal,
  modalStackVersion,
  registerModal,
  subscribeModalStack,
  topModalPanel,
  topModalToastPlacement,
  unregisterModal,
} from '@/components/ui/modal-stack'
import {
  TOAST_DISMISS_BUTTON_CLASS,
  TOAST_MODAL_GAP_PX,
  TOAST_TOP_CLASS,
  toastTopAvoidingModalHeader,
  toastViewportPositionClass,
} from '@/components/ui/toast-position'

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

describe('toast มุมบนไม่ทับหัว modal/ปุ่ม X (ตรวจซ้ำ staging SV5-E1-02)', () => {
  // desktop 1440×900 · toast max-w-sm ชิดขวา (x1040–1424 สูง 56) · โมดัล lg กลางจอ (x336–1104) หัว y45–110 ปุ่ม X y62–86
  const desktopToast = { left: 1040, right: 1424, height: 56 }
  const lgHeader = { top: 45, bottom: 110, left: 336, right: 1104 }

  it('ทับหัวโมดัล lg ⇒ ย้ายลงใต้หัวแผง (ไม่ทับปุ่ม X อีก)', () => {
    const top = toastTopAvoidingModalHeader({ naturalTop: 16, toast: desktopToast, header: lgHeader, bottomLimit: 800 })
    expect(top).toBe(110 + TOAST_MODAL_GAP_PX)
    expect(top).not.toBeNull()
    expect((top ?? 0) >= lgHeader.bottom).toBe(true)
  })

  it('โมดัลแคบมีที่ว่างข้างขวา (md x464–976) ⇒ คงมุมบนเดิม', () => {
    const header = { top: 200, bottom: 260, left: 464, right: 976 }
    expect(toastTopAvoidingModalHeader({ naturalTop: 16, toast: desktopToast, header, bottomLimit: 700 })).toBeNull()
  })

  it('โมดัลเตี้ยกลางจอมือถือมีที่ว่างด้านบน ⇒ คงมุมบนเดิม', () => {
    const mobileToast = { left: 16, right: 359, height: 56 }
    const header = { top: 300, bottom: 360, left: 16, right: 359 }
    expect(toastTopAvoidingModalHeader({ naturalTop: 16, toast: mobileToast, header, bottomLimit: 500 })).toBeNull()
  })

  it('มือถือ: โมดัลสูงเต็มจอ หัวชิดบน + safe-area ⇒ ย้ายลงใต้หัว', () => {
    const mobileToast = { left: 16, right: 359, height: 56 }
    const header = { top: 40, bottom: 100, left: 16, right: 359 }
    expect(toastTopAvoidingModalHeader({ naturalTop: 63, toast: mobileToast, header, bottomLimit: 760 })).toBe(108)
  })

  it('ย้ายลงแล้วจะทับท้ายแผง (ปุ่มหลัก — G2-02) ⇒ คงมุมบน ไม่ถอยไปทับปุ่มท้าย', () => {
    const header = { top: 45, bottom: 110, left: 336, right: 1104 }
    // footer เริ่มที่ y160 — toast สูง 56 ใต้หัว (118–174) จะทับ
    expect(toastTopAvoidingModalHeader({ naturalTop: 16, toast: desktopToast, header, bottomLimit: 160 })).toBeNull()
    // พอดีขอบพร้อมระยะห่าง ⇒ ย้ายได้
    expect(toastTopAvoidingModalHeader({ naturalTop: 16, toast: desktopToast, header, bottomLimit: 118 + 56 + TOAST_MODAL_GAP_PX })).toBe(118)
  })

  it('ชนขอบพอดีไม่นับว่าทับ · ไม่มี footer ใช้ขอบล่างแผง · toast ซ้อนหลายอันสูงเกินที่ว่าง ⇒ คงเดิม', () => {
    expect(toastTopAvoidingModalHeader({ naturalTop: 16, toast: desktopToast, header: { ...lgHeader, top: 72 }, bottomLimit: 800 })).toBeNull()
    expect(toastTopAvoidingModalHeader({ naturalTop: 110, toast: desktopToast, header: lgHeader, bottomLimit: 800 })).toBeNull()
    expect(toastTopAvoidingModalHeader({ naturalTop: 16, toast: desktopToast, header: lgHeader, bottomLimit: 855 })).toBe(118)
    expect(
      toastTopAvoidingModalHeader({ naturalTop: 16, toast: { ...desktopToast, height: 700 }, header: lgHeader, bottomLimit: 810 }),
    ).toBeNull()
  })

  it('modal กลางเปิดซ้อน modal กลาง (ทิศเท่าเดิม) ⇒ รุ่นของกองเปลี่ยน ให้ toast วัดแผงชั้นบนใหม่', () => {
    const outer = { id: 'outer' } as unknown as HTMLElement
    const inner = { id: 'inner' } as unknown as HTMLElement
    const first = registerModal({ getPanel: () => outer })
    const before = modalStackVersion()
    const second = registerModal({ getPanel: () => inner })
    expect(topModalToastPlacement()).toBe('top')
    expect(modalStackVersion()).not.toBe(before)
    expect(topModalPanel()).toBe(inner)
    unregisterModal(second)
    expect(topModalPanel()).toBe(outer)
    unregisterModal(first)
  })

  it('ไม่รู้หัวแผง / ยังไม่มี toast ⇒ คงเดิม', () => {
    expect(toastTopAvoidingModalHeader({ naturalTop: 16, toast: desktopToast, header: null, bottomLimit: null })).toBeNull()
    expect(
      toastTopAvoidingModalHeader({ naturalTop: 16, toast: { ...desktopToast, height: 0 }, header: lgHeader, bottomLimit: null }),
    ).toBeNull()
  })

  it('มุมบนใช้ class เดียวกับตัววัดตำแหน่ง + modal-stack ให้แผงของชั้นบนสุด', () => {
    expect(toastViewportPositionClass({ modalPlacement: 'top', aboveBottomNav: false })).toBe(TOAST_TOP_CLASS)
    const panel = { id: 'panel' } as unknown as HTMLElement
    const lower = registerModal({ getPanel: () => panel })
    expect(topModalPanel()).toBe(panel)
    const drawer = registerModal({ toastPlacement: 'bottom' })
    expect(topModalPanel()).toBeNull()
    unregisterModal(drawer)
    expect(topModalPanel()).toBe(panel)
    unregisterModal(lower)
    expect(topModalPanel()).toBeNull()
  })
})
