/**
 * ลำดับชั้นของ modal ที่เปิดอยู่ — ใช้ตัดสินว่า Esc ควรปิด modal ตัวไหน (UAT BUG-031)
 *
 * modal ซ้อนกัน (เช่น หน้าดูไฟล์เปิดจากหน้าต่างพิจารณาเคส) ต่างคนต่างฟัง `keydown` ที่ `document`
 * ⇒ Esc ต้องปิด **เฉพาะตัวบนสุด** ตัวที่อยู่ข้างหลังต้องเฉย · ลำดับ = ลำดับที่เปิด (เปิดทีหลัง = อยู่บน)
 * — module-level state ฝั่ง client เท่านั้น (ทั้งแท็บมีชั้น modal ชุดเดียว)
 */

const stack: symbol[] = []

/** ลงทะเบียน modal ที่เพิ่งเปิด — คืน token ไว้ถาม `isTopModal()` และถอนด้วย `unregisterModal()` */
export function registerModal(): symbol {
  const token = Symbol('modal')
  stack.push(token)
  return token
}

/** ถอน modal ที่ปิด/unmount แล้ว — ถอนตัวที่อยู่กลางกองได้ (ปิดไม่เรียงลำดับ) */
export function unregisterModal(token: symbol): void {
  const index = stack.lastIndexOf(token)
  if (index !== -1) stack.splice(index, 1)
}

export function isTopModal(token: symbol): boolean {
  return stack.length > 0 && stack[stack.length - 1] === token
}
