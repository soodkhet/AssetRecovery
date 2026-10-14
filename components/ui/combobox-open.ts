/**
 * ตัดสินว่า combobox (ช่องพิมพ์ + รายการแนะนำ `role="listbox"`) ควรเปิด/ปิดรายการจากเหตุการณ์ใด
 * (ตรวจซ้ำ staging SV5-F1-01 — WAI-ARIA APG combobox)
 *
 * - **ได้โฟกัสอย่างเดียวไม่เปิดรายการ** — ครอบทั้ง Tab เข้า, โปรแกรมโฟกัสให้ (`revealFirstFieldError` /
 *   `useRevealFieldError` หลัง server ตอบ error รายช่อง) และ focus trap คืนโฟกัส ⇒ รายการไม่เด้งทับข้อความผิดใต้ช่อง
 * - เปิดเมื่อผู้ใช้กระทำเท่านั้น: คลิก/แตะช่อง (มือถือแตะแล้วเปิดทันทีเหมือนเดิม) · พิมพ์ · ลูกศรลง / Alt+ลูกศรลง
 * - Esc / Alt+ลูกศรขึ้น ขณะเปิด = ปิด
 *
 * combobox ที่เขียนเองทุกตัวต้องผ่านฟังก์ชันนี้ ห้ามผูก `onFocus` กับการเปิดรายการ
 * (`<datalist>` เป็นของเบราว์เซอร์ ไม่เปิดเองตอนโฟกัสอยู่แล้ว)
 */

export type ComboboxTrigger =
  | { type: 'focus' }
  | { type: 'click' }
  | { type: 'input' }
  | { type: 'keydown'; key: string; altKey: boolean }

/** `'open'` / `'close'` = ต้องเปลี่ยนสถานะ · `null` = ไม่แตะ (ปุ่มนำทางขณะเปิดอยู่ ฯลฯ ให้ผู้เรียกจัดการต่อ) */
export function comboboxOpenAction(trigger: ComboboxTrigger, open: boolean): 'open' | 'close' | null {
  switch (trigger.type) {
    case 'focus':
      return null
    case 'click':
    case 'input':
      return open ? null : 'open'
    case 'keydown':
      if (open) {
        if (trigger.key === 'Escape' || (trigger.key === 'ArrowUp' && trigger.altKey)) return 'close'
        return null
      }
      return trigger.key === 'ArrowDown' ? 'open' : null
  }
}

/**
 * keydown ที่ช่อง combobox ใช้เปิด/ปิดรายการ ⇒ `preventDefault()` แล้วคืน action ให้ผู้เรียกเปลี่ยนสถานะ (ตรวจซ้ำ staging SV5-G1-01)
 *
 * - ลูกศรไม่เลื่อนเคอร์เซอร์/หน้า
 * - **Esc ที่ใช้ปิดรายการ** ⇒ `defaultPrevented` บอก modal/overlay ที่ครอบอยู่ว่าใช้ไปแล้ว (`isDismissEscape` ข้าม) — โมดัลไม่ปิดตาม
 * - รายการปิดอยู่ Esc คืน `null` ไม่แตะ event ⇒ Esc ถัดไปปิดโมดัลตามเดิม
 */
export function consumeComboboxToggleKey(
  event: { key: string; altKey: boolean; preventDefault: () => void },
  open: boolean,
): 'open' | 'close' | null {
  const action = comboboxOpenAction({ type: 'keydown', key: event.key, altKey: event.altKey }, open)
  if (action !== null) event.preventDefault()
  return action
}

/** ชนิด input ที่ใช้เลือกตัวเลือก — `keyboard` = Enter · ที่เหลือตาม `PointerEvent.pointerType` (`''` = ไม่ทราบ) */
export type ComboboxPickInput = 'keyboard' | 'mouse' | 'touch' | 'pen' | ''

/**
 * เลือกตัวเลือกแล้วโฟกัสไปไหน (มติผู้ใช้ 15/10/2569 — มือถือแตะเลือกแล้วคีย์บอร์ดเสมือนค้าง/เด้งบังฟอร์ม)
 *
 * - `input` = คืนโฟกัสช่องพิมพ์ (APG combobox) — Enter / เมาส์ · เลือก "ระบุเอง" (`choice: 'manual'`) ทุกชนิด input
 *   (ผู้ใช้จะพิมพ์เองต่อ ⇒ คีย์บอร์ดขึ้นได้ เหมือนปุ่ม "เลือกจากรายการแทน" — มติผู้ใช้ 15/10/2569)
 * - `park` = ไม่โฟกัสช่องพิมพ์ (blur ถ้าโฟกัสอยู่ แม้กำลังพิมพ์กรอง) ให้คีย์บอร์ดยุบ — ผู้เรียกจอดโฟกัสในโมดัล ไม่ให้หลุดไป body
 *   · แตะ (`touch`) / ปากกา (`pen` — แท็บเล็ตก็เด้งคีย์บอร์ดเสมือน)
 *   · ไม่ทราบชนิด ⇒ ตัดสินจาก `(pointer: coarse)` แบบเดียวกับโฟกัสแรกของ focus trap
 */
export function focusAfterPick({
  input,
  coarsePointer,
  choice = 'option',
}: {
  input: ComboboxPickInput
  coarsePointer: boolean
  /** `option` = เลือกตัวเลือกจากรายการ · `manual` = เลือกพิมพ์เอง */
  choice?: 'option' | 'manual'
}): 'input' | 'park' {
  if (choice === 'manual') return 'input'
  switch (input) {
    case 'keyboard':
    case 'mouse':
      return 'input'
    case 'touch':
    case 'pen':
      return 'park'
    case '':
      return coarsePointer ? 'park' : 'input'
  }
}

/** แปลง `PointerEvent.pointerType` (สตริงอิสระตามสเปก) เป็น `ComboboxPickInput` */
export function toPickInput(pointerType: string | null | undefined): ComboboxPickInput {
  return pointerType === 'mouse' || pointerType === 'touch' || pointerType === 'pen' ? pointerType : ''
}
