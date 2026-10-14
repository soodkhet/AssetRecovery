/**
 * ลำดับชั้นของ modal ที่เปิดอยู่ — ใช้ตัดสินว่า Esc ควรปิด modal ตัวไหน (UAT BUG-031)
 *
 * modal ซ้อนกัน (เช่น หน้าดูไฟล์เปิดจากหน้าต่างพิจารณาเคส) ต่างคนต่างฟัง `keydown` ที่ `document`
 * ⇒ Esc ต้องปิด **เฉพาะตัวบนสุด** ตัวที่อยู่ข้างหลังต้องเฉย · ลำดับ = ลำดับที่เปิด (เปิดทีหลัง = อยู่บน)
 * — module-level state ฝั่ง client เท่านั้น (ทั้งแท็บมีชั้น modal ชุดเดียว)
 */

/**
 * toast ควรหลบไปทางไหนเมื่อชั้นนี้อยู่บนสุด (SV5-D3-01)
 * - `top` (ค่าเริ่มต้น) = modal กลาง ปุ่มหลักอยู่ท้ายหน้าต่างชิดขวาล่าง ⇒ toast ขึ้นมุมบน (mytester2 G2-02)
 * - `bottom` = เมนู/ลิ้นชักเต็มความสูง หรือตัวดูรูปเต็มจอ ที่หัว+ปุ่มปิดอยู่บนสุดของจอ ⇒ toast อยู่ล่างตามปกติ
 *   (เดิมเมนู Field Tracker ลงชั้นแล้ว toast เด้งขึ้นบนทับการ์ดผู้ใช้ + ปุ่ม X "ปิดเมนู" นาน 6 วินาที)
 */
export type ModalToastPlacement = 'top' | 'bottom'

interface ModalEntry {
  token: symbol
  toastPlacement: ModalToastPlacement
  /** แผงของชั้นนี้ — toast ใช้หาหัว/ท้ายแผงเพื่อหลบ (SV5-E1-02) */
  getPanel: (() => HTMLElement | null) | null
}

const stack: ModalEntry[] = []
const listeners = new Set<() => void>()

/** เพิ่มทุกครั้งที่กองเปลี่ยน — ผู้ฟังที่ต้องรู้ว่า "ชั้นบนสุดเปลี่ยนตัว" แม้ทิศ toast เท่าเดิม (modal กลางซ้อน modal กลาง) */
let version = 0

function notify(): void {
  version += 1
  for (const listener of listeners) listener()
}

/** ลงทะเบียน modal ที่เพิ่งเปิด — คืน token ไว้ถาม `isTopModal()` และถอนด้วย `unregisterModal()` */
export function registerModal({
  toastPlacement = 'top',
  getPanel,
}: {
  toastPlacement?: ModalToastPlacement
  /** แผงของ modal กลาง (หัว `[data-modal-header]` / ท้าย `[data-modal-footer]`) — toast มุมบนเลื่อนลงใต้หัวเมื่อทับปุ่ม X */
  getPanel?: () => HTMLElement | null
} = {}): symbol {
  const token = Symbol('modal')
  stack.push({ token, toastPlacement, getPanel: getPanel ?? null })
  notify()
  return token
}

/** ถอน modal ที่ปิด/unmount แล้ว — ถอนตัวที่อยู่กลางกองได้ (ปิดไม่เรียงลำดับ) */
export function unregisterModal(token: symbol): void {
  let index = stack.length - 1
  while (index >= 0 && stack[index]?.token !== token) index -= 1
  if (index !== -1) {
    stack.splice(index, 1)
    notify()
  }
}

export function isTopModal(token: symbol): boolean {
  return stack.length > 0 && stack[stack.length - 1]?.token === token
}

/** มี modal เปิดอยู่อย่างน้อยหนึ่งตัวไหม */
export function hasOpenModal(): boolean {
  return stack.length > 0
}

/**
 * ทิศที่ toast ควรหลบตามชั้นบนสุด — `null` = ไม่มี modal เปิด · ใช้กับ `useSyncExternalStore` (คืนค่า primitive คงที่)
 * (mytester2 G2-02 · SV5-D3-01)
 */
export function topModalToastPlacement(): ModalToastPlacement | null {
  return stack[stack.length - 1]?.toastPlacement ?? null
}

/** รุ่นของกอง modal (เปลี่ยนทุกครั้งที่เปิด/ปิด) — ใช้กับ `useSyncExternalStore` เพื่อวัดตำแหน่งใหม่ (SV5-E1-02) */
export function modalStackVersion(): number {
  return version
}

/** แผงของชั้นบนสุด (ถ้าลงทะเบียนไว้) — `null` = ไม่มี modal / ชั้นบนสุดไม่ได้ให้แผงมา */
export function topModalPanel(): HTMLElement | null {
  return stack[stack.length - 1]?.getPanel?.() ?? null
}

/** ฟังการเปิด/ปิด modal — คืนฟังก์ชันเลิกฟัง */
export function subscribeModalStack(listener: () => void): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}
