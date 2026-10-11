/**
 * กัน toast ซ้ำซ้อน (mytester DO-05) — เน็ตหลุดแล้วคำขอสองทาง (เช่น เช็คอิน + autosave) ล้มพร้อมกัน
 * ได้ข้อความเดียวกันซ้อน 2 กล่อง ⇒ ข้อความที่เหมือนกันทุกช่องและยังแสดงอยู่ ให้ใช้กล่องเดิม — pure เพื่อ unit test
 */
export interface ToastIdentity {
  id: number
  tone: string
  title: string
  description?: string
}

/** id ของ toast ที่ยังแสดงอยู่และเหมือนกับข้อความใหม่ทุกช่อง — ไม่มี ⇒ `null` (แสดงกล่องใหม่ได้) */
export function findDuplicateToast(
  current: readonly ToastIdentity[],
  next: Omit<ToastIdentity, 'id'>,
): number | null {
  const match = current.find(
    (toast) => toast.tone === next.tone && toast.title === next.title && toast.description === next.description,
  )
  return match === undefined ? null : match.id
}
