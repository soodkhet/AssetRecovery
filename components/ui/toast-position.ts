/**
 * ตำแหน่งแนวตั้งของกอง toast (class ของ Tailwind) — pure เพื่อทดสอบได้
 *
 * - ปกติ: มุมล่าง (หน้าที่มีแถบเมนูล่างบนมือถือ ⇒ ยกขึ้นเหนือแถบ — staging E-031)
 * - **มี modal เปิดอยู่ ⇒ ย้ายขึ้นมุมบน** — ปุ่มหลักของ modal อยู่ท้ายหน้าต่างชิดขวาล่าง toast มุมขวาล่างจึงทับปุ่ม
 *   (เช่น "บันทึกใบลดหนี้" ตอน server ปฏิเสธ ต้องรอ toast หายก่อนแก้แล้วกดใหม่ — mytester2 G2-02)
 *   หน้าอื่นที่ไม่มี modal ยังอยู่มุมล่างเหมือนเดิม
 */
export function toastViewportPositionClass({
  modalOpen,
  aboveBottomNav,
}: {
  modalOpen: boolean
  aboveBottomNav: boolean
}): string {
  if (modalOpen) return 'top-[calc(1rem+env(safe-area-inset-top))]'
  return aboveBottomNav ? 'bottom-[calc(5rem+env(safe-area-inset-bottom))] lg:bottom-4' : 'bottom-4'
}
