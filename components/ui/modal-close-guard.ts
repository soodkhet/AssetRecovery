/**
 * ตัดสินว่าการปิด modal ที่ผู้ใช้สั่งเอง (Esc / คลิก backdrop / ปุ่ม X) ควรทำอะไร — preship audit PS-001
 *
 * - ระหว่างบันทึก (busy) ห้ามปิด: ถ้าปิดได้ ฟอร์มที่ mount เฉพาะตอนเปิดจะเสีย state `saving`
 *   แล้วเปิดใหม่ได้ปุ่มบันทึกที่กดได้ ทั้งที่ request แรกยังไม่จบ ⇒ ส่งคำขอซ้ำ
 * - ผู้ใช้กรอกข้อมูลไปแล้ว (dirty) ต้องยืนยันก่อนทิ้ง — คลิกพลาดครั้งเดียวไม่ควรทำให้ฟอร์มยาวหาย
 * การปิดที่โค้ดสั่งเอง (บันทึกสำเร็จแล้วตั้ง `open=false`) และปุ่ม "ยกเลิก" ของฟอร์มไม่ผ่านตัวนี้
 */

export type ModalCloseDecision = 'ignore' | 'confirm-discard' | 'close'

export function decideModalClose({
  busy,
  dirty,
  confirmDiscard,
}: {
  busy: boolean
  dirty: boolean
  confirmDiscard: boolean
}): ModalCloseDecision {
  if (busy) return 'ignore'
  if (dirty && confirmDiscard) return 'confirm-discard'
  return 'close'
}

/**
 * ปุ่มที่กำลังหมุน (`aria-busy`) ถือเป็น "กำลังบันทึก" ของ modal ไหม — preship R3-002 → R4-006
 * ค่าเริ่มต้น = ล็อกเสมอ (ปุ่มบันทึกจริงอยู่ใน body ก็มี — R4-006: เดิมดูจากตำแหน่ง ทำให้ modal เอกสารบริษัท
 * ปิด/ทิ้งได้ระหว่างบันทึกแต่คำขอยังถูกส่ง) · ยกเว้นปุ่มย่อยที่ติด `data-modal-busy="ignore"` (ค้นหา/ดาวน์โหลด/โหลดตัวเลือก)
 */
export function busyElementLocksModal({ optedOut }: { optedOut: boolean }): boolean {
  return !optedOut
}

/** แอตทริบิวต์บนปุ่มย่อยใน modal ที่หมุนได้โดยไม่ล็อกทั้ง modal — `<Button {...MODAL_BUSY_IGNORE}>` */
export const MODAL_BUSY_IGNORE = { 'data-modal-busy': 'ignore' } as const
