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
