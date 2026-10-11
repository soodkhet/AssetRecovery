/**
 * ลำดับชั้นของ modal ที่เปิดอยู่ — ใช้ตัดสินว่า Esc ควรปิด modal ตัวไหน (UAT BUG-031)
 *
 * modal ซ้อนกัน (เช่น หน้าดูไฟล์เปิดจากหน้าต่างพิจารณาเคส) ต่างคนต่างฟัง `keydown` ที่ `document`
 * ⇒ Esc ต้องปิด **เฉพาะตัวบนสุด** ตัวที่อยู่ข้างหลังต้องเฉย · ลำดับ = ลำดับที่เปิด (เปิดทีหลัง = อยู่บน)
 * — module-level state ฝั่ง client เท่านั้น (ทั้งแท็บมีชั้น modal ชุดเดียว)
 */

const stack: symbol[] = []
const listeners = new Set<() => void>()

function notify(): void {
  for (const listener of listeners) listener()
}

/** ลงทะเบียน modal ที่เพิ่งเปิด — คืน token ไว้ถาม `isTopModal()` และถอนด้วย `unregisterModal()` */
export function registerModal(): symbol {
  const token = Symbol('modal')
  stack.push(token)
  notify()
  return token
}

/** ถอน modal ที่ปิด/unmount แล้ว — ถอนตัวที่อยู่กลางกองได้ (ปิดไม่เรียงลำดับ) */
export function unregisterModal(token: symbol): void {
  const index = stack.lastIndexOf(token)
  if (index !== -1) {
    stack.splice(index, 1)
    notify()
  }
}

export function isTopModal(token: symbol): boolean {
  return stack.length > 0 && stack[stack.length - 1] === token
}

/** มี modal เปิดอยู่อย่างน้อยหนึ่งตัวไหม — ใช้กับ `useSyncExternalStore` (toast หลบปุ่มท้าย modal — mytester2 G2-02) */
export function hasOpenModal(): boolean {
  return stack.length > 0
}

/** ฟังการเปิด/ปิด modal — คืนฟังก์ชันเลิกฟัง */
export function subscribeModalStack(listener: () => void): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}
