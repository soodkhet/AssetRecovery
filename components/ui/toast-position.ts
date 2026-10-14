import type { ModalToastPlacement } from '@/components/ui/modal-stack'
import { TOUCH_TARGET_CLASS } from '@/components/ui/button'

/**
 * ตำแหน่งแนวตั้งของกอง toast (class ของ Tailwind) — pure เพื่อทดสอบได้
 *
 * - ปกติ: มุมล่าง (หน้าที่มีแถบเมนูล่างบนมือถือ ⇒ ยกขึ้นเหนือแถบ — staging E-031)
 * - **modal กลางเปิดอยู่ (`top`) ⇒ ย้ายขึ้นมุมบน** — ปุ่มหลักของ modal อยู่ท้ายหน้าต่างชิดขวาล่าง toast มุมขวาล่างจึงทับปุ่ม
 *   (เช่น "บันทึกใบลดหนี้" ตอน server ปฏิเสธ ต้องรอ toast หายก่อนแก้แล้วกดใหม่ — mytester2 G2-02)
 * - **เมนู/ลิ้นชักเต็มความสูง หรือตัวดูรูปเต็มจอ (`bottom`) ⇒ คงมุมล่าง** — หัวแผงกับปุ่มปิดอยู่ชิดขอบบนของจอ
 *   toast มุมบนทับการ์ดผู้ใช้ + ปุ่ม X "ปิดเมนู" (SV5-D3-01) · มุมล่าง ไม่ทับปุ่มควบคุมของแผง
 *   ยกสูงพอพ้นส่วนท้ายแผง (ปุ่มออกจากระบบ) — ทับได้แค่รายการเมนูกลางแผงที่เลื่อนได้/ตัวรูป
 * - ชั้นบนสุดเป็นผู้ตัดสิน (ตัวดูรูปซ้อนในลิ้นชัก ⇒ ตามตัวดูรูป)
 */
/** มุมบนของ toast ตอน modal กลางเปิด — ใช้ร่วมกับตัววัดตำแหน่งปกติใน `ToastViewport` (SV5-E1-02) */
export const TOAST_TOP_CLASS = 'top-[calc(1rem+env(safe-area-inset-top))]'

export function toastViewportPositionClass({
  modalPlacement,
  aboveBottomNav,
}: {
  /** ทิศที่ชั้นบนสุดขอให้ toast หลบ — `null` = ไม่มี modal เปิด (`topModalToastPlacement()`) */
  modalPlacement: ModalToastPlacement | null
  aboveBottomNav: boolean
}): string {
  if (modalPlacement === 'top') return TOAST_TOP_CLASS
  // ยกเหนือส่วนท้ายแผง (ปุ่มออกจากระบบท้ายเมนูภาคสนาม/พอร์ทัล สูงราว 80–90px) + safe-area
  if (modalPlacement === 'bottom') return 'bottom-[calc(6rem+env(safe-area-inset-bottom))]'
  return aboveBottomNav ? 'bottom-[calc(5rem+env(safe-area-inset-bottom))] lg:bottom-4' : 'bottom-4'
}

/** กรอบสี่เหลี่ยมบนจอ (px · แบบ `getBoundingClientRect()`) */
export interface ScreenBox {
  top: number
  bottom: number
  left: number
  right: number
}

/** ระยะห่างจากหัวแผง/ท้ายแผงเมื่อย้าย toast ลงใต้หัว modal (px) */
export const TOAST_MODAL_GAP_PX = 8

/**
 * toast มุมบน (modal กลางเปิด) ทับหัวแผง/ปุ่ม X ไหม ⇒ คืนตำแหน่ง `top` (px) ใหม่ใต้หัวแผง · `null` = คงมุมบนเดิม
 * (ตรวจซ้ำ staging SV5-E1-02 — desktop 1440px toast y16–72 ทับปุ่ม "ปิด" ของโมดัล lg y62–86)
 *
 * - ไม่ทับหัวแผง (โมดัลแคบมีที่ว่างข้างขวา / โมดัลเตี้ยมีที่ว่างด้านบน) ⇒ คงเดิม
 * - ทับ ⇒ ย้ายลงใต้หัวแผง (ทับได้แค่เนื้อหาที่เลื่อนได้ของแผงชั่วคราว) — ชิดขวาเท่าเดิม
 * - ย้ายแล้วจะล้นลงไปทับท้ายแผง (ปุ่มหลัก — กติกา G2-02 สำคัญกว่า) ⇒ คงเดิม
 *
 * @param naturalTop ตำแหน่งบนของ toast ตอนอยู่มุมบนปกติ (รวม safe-area แล้ว)
 * @param toast ขอบซ้าย/ขวา + ความสูงของกอง toast
 * @param header หัวแผง (ชื่อ + ปุ่ม X) — `null` = ไม่รู้แผง ⇒ คงเดิม
 * @param bottomLimit ขอบบนของท้ายแผง (footer) หรือขอบล่างแผงถ้าไม่มี footer
 */
export function toastTopAvoidingModalHeader({
  naturalTop,
  toast,
  header,
  bottomLimit,
  gap = TOAST_MODAL_GAP_PX,
}: {
  naturalTop: number
  toast: { left: number; right: number; height: number }
  header: ScreenBox | null
  bottomLimit: number | null
  gap?: number
}): number | null {
  if (header === null || toast.height <= 0) return null
  const overlaps =
    toast.left < header.right && toast.right > header.left && naturalTop < header.bottom && naturalTop + toast.height > header.top
  if (!overlaps) return null
  const top = Math.ceil(header.bottom + gap)
  if (bottomLimit !== null && top + toast.height > bottomLimit - gap) return null
  return top
}

/**
 * ปุ่มปิด toast — ไอคอนเล็กเท่าเดิมบนเมาส์ แต่บนจอสัมผัสเป้าแตะ ≥44×44px (SV5-D3-01 · เดิม 18×18)
 * ขอบลบชดเชย padding ของกล่อง ⇒ toast ไม่สูงขึ้นเกินจำเป็น
 */
export const TOAST_DISMISS_BUTTON_CLASS = [
  'focus-ring inline-flex shrink-0 items-center justify-center rounded p-0.5 opacity-60 hover:opacity-100',
  TOUCH_TARGET_CLASS,
  'pointer-coarse:-my-2.5 pointer-coarse:-mr-2',
].join(' ')
