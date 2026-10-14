import { describe, expect, it } from 'vitest'
import { comboboxOpenAction } from '@/components/ui/combobox-open'

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
