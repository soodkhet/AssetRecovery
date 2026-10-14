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
export function toastViewportPositionClass({
  modalPlacement,
  aboveBottomNav,
}: {
  /** ทิศที่ชั้นบนสุดขอให้ toast หลบ — `null` = ไม่มี modal เปิด (`topModalToastPlacement()`) */
  modalPlacement: ModalToastPlacement | null
  aboveBottomNav: boolean
}): string {
  if (modalPlacement === 'top') return 'top-[calc(1rem+env(safe-area-inset-top))]'
  // ยกเหนือส่วนท้ายแผง (ปุ่มออกจากระบบท้ายเมนูภาคสนาม/พอร์ทัล สูงราว 80–90px) + safe-area
  if (modalPlacement === 'bottom') return 'bottom-[calc(6rem+env(safe-area-inset-bottom))]'
  return aboveBottomNav ? 'bottom-[calc(5rem+env(safe-area-inset-bottom))] lg:bottom-4' : 'bottom-4'
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
