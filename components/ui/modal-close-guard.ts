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
 * ปุ่มที่กำลังหมุน (`aria-busy`) ถือเป็น "กำลังบันทึก" ของ modal ไหม — preship R3-002
 * นับ: ปุ่มใน footer · ปุ่ม submit ของฟอร์ม · หรือ modal ไม่มี footer (ปุ่มหลักอยู่ใน body)
 * ไม่นับ: ปุ่มย่อยใน body ของ modal ที่มี footer (ค้นหา/ดาวน์โหลด/โหลดตัวเลือก) — เดิมปุ่มค้นหาค้าง
 * แล้วทั้ง modal รวมปุ่ม "ยกเลิก" ล็อกจนต้อง reload
 */
export function busyElementLocksModal({
  hasFooter,
  inFooter,
  isSubmit,
}: {
  hasFooter: boolean
  inFooter: boolean
  isSubmit: boolean
}): boolean {
  return !hasFooter || inFooter || isSubmit
}
