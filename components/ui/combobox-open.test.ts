import { describe, expect, it } from 'vitest'
import { comboboxOpenAction, consumeComboboxToggleKey } from '@/components/ui/combobox-open'
import { isDismissEscape } from '@/components/ui/modal-stack'

const key = (k: string, altKey = false) => ({ type: 'keydown' as const, key: k, altKey })

describe('comboboxOpenAction (SV5-F1-01)', () => {
  it('ได้โฟกัสอย่างเดียว (Tab / โปรแกรมโฟกัสช่องที่ผิด / focus trap คืนโฟกัส) ไม่เปิดรายการ', () => {
    expect(comboboxOpenAction({ type: 'focus' }, false)).toBeNull()
    expect(comboboxOpenAction({ type: 'focus' }, true)).toBeNull()
  })
  it('คลิก/แตะ และพิมพ์ ⇒ เปิด · เปิดอยู่แล้วไม่แตะ', () => {
    expect(comboboxOpenAction({ type: 'click' }, false)).toBe('open')
    expect(comboboxOpenAction({ type: 'input' }, false)).toBe('open')
    expect(comboboxOpenAction({ type: 'click' }, true)).toBeNull()
    expect(comboboxOpenAction({ type: 'input' }, true)).toBeNull()
  })
  it('ปิดอยู่: ลูกศรลง / Alt+ลูกศรลง ⇒ เปิด · ปุ่มอื่นไม่เปิด', () => {
    expect(comboboxOpenAction(key('ArrowDown'), false)).toBe('open')
    expect(comboboxOpenAction(key('ArrowDown', true), false)).toBe('open')
    for (const k of ['ArrowUp', 'Enter', 'Escape', 'Tab', 'a', 'Shift']) {
      expect(comboboxOpenAction(key(k), false)).toBeNull()
    }
  })
  it('เปิดอยู่: Esc / Alt+ลูกศรขึ้น ⇒ ปิด · ลูกศร/Enter ปล่อยให้นำทางรายการ', () => {
    expect(comboboxOpenAction(key('Escape'), true)).toBe('close')
    expect(comboboxOpenAction(key('ArrowUp', true), true)).toBe('close')
    expect(comboboxOpenAction(key('ArrowDown', true), true)).toBeNull() // ผู้เรียกข้ามการเลื่อน highlight เมื่อกด Alt
    for (const k of ['ArrowDown', 'ArrowUp', 'Enter']) {
      expect(comboboxOpenAction(key(k), true)).toBeNull()
    }
  })
})

/** event จำลองแบบ KeyboardEvent — preventDefault ตั้ง defaultPrevented เหมือนของจริง */
function fakeKey(k: string, altKey = false) {
  const event = {
    key: k,
    altKey,
    defaultPrevented: false,
    preventDefault() {
      event.defaultPrevented = true
    },
  }
  return event
}

describe('consumeComboboxToggleKey + isDismissEscape — Esc ปิดแค่รายการ ไม่ปิดโมดัล (SV5-G1-01)', () => {
  it('รายการเปิด: Esc ⇒ close + preventDefault ⇒ โมดัลที่ฟังต่อท้ายข้าม', () => {
    const event = fakeKey('Escape')
    expect(consumeComboboxToggleKey(event, true)).toBe('close')
    expect(event.defaultPrevented).toBe(true)
    expect(isDismissEscape(event)).toBe(false)
  })
  it('รายการปิด: Esc ไม่แตะ event ⇒ โมดัลปิดตามเดิม', () => {
    const event = fakeKey('Escape')
    expect(consumeComboboxToggleKey(event, false)).toBeNull()
    expect(event.defaultPrevented).toBe(false)
    expect(isDismissEscape(event)).toBe(true)
  })
  it('ลูกศรที่เปิด/ปิดรายการ preventDefault · ปุ่มนำทางขณะเปิดไม่แตะ (ผู้เรียกจัดการเอง)', () => {
    const down = fakeKey('ArrowDown')
    expect(consumeComboboxToggleKey(down, false)).toBe('open')
    expect(down.defaultPrevented).toBe(true)
    const altUp = fakeKey('ArrowUp', true)
    expect(consumeComboboxToggleKey(altUp, true)).toBe('close')
    expect(altUp.defaultPrevented).toBe(true)
    for (const k of ['ArrowDown', 'ArrowUp', 'Enter', 'a']) {
      const event = fakeKey(k)
      expect(consumeComboboxToggleKey(event, true)).toBeNull()
      expect(event.defaultPrevented).toBe(false)
    }
  })
})
