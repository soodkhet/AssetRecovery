/**
 * เก็บสถานะของหน้า (แท็บ/ตัวกรอง/หน้า) ไว้ใน URL — preship audit PS-013
 *
 * เดิมเป็น React state ล้วน ⇒ refresh กลาง flow (มักเกิดหลังคำขอช้า/ล้มเหลว) หรือกด Back กลับมา
 * แล้วหลุดไปแท็บแรก/รายการที่ไม่ได้กรอง · ใช้ `history.replaceState` (Next รองรับ — ไม่ยิง server ซ้ำ
 * ไม่เพิ่ม history ทุกครั้งที่พิมพ์ค้นหา) แล้วให้ page อ่าน `searchParams` เป็นค่าเริ่มต้น
 */

/** ค่า `null`/`''`/ค่าเริ่มต้น = ลบ key ออกจาก URL (URL สั้น อ่านง่าย) */
export type UrlParamUpdates = Readonly<Record<string, string | number | null>>

/** รวมค่าใหม่เข้ากับ query เดิม — pure (เทสต์ได้โดยไม่ต้องมี window) · คืน query ไม่มี `?` */
export function mergeSearchParams(current: string, updates: UrlParamUpdates): string {
  const params = new URLSearchParams(current)
  for (const [key, value] of Object.entries(updates)) {
    if (value === null || value === '') params.delete(key)
    else params.set(key, String(value))
  }
  return params.toString()
}

/** เขียนค่าลง URL ของหน้าปัจจุบันแบบไม่เพิ่ม history entry */
export function replaceUrlParams(updates: UrlParamUpdates): void {
  if (typeof window === 'undefined') return
  const query = mergeSearchParams(window.location.search, updates)
  const next = `${window.location.pathname}${query === '' ? '' : `?${query}`}${window.location.hash}`
  if (next !== `${window.location.pathname}${window.location.search}${window.location.hash}`) {
    window.history.replaceState(window.history.state, '', next)
  }
}

/** อ่านค่าจาก `searchParams` ของ page (server) — ค่าไม่อยู่ในชุดที่อนุญาต = ค่าเริ่มต้น */
export function pickParam<T extends string>(value: string | string[] | undefined, allowed: readonly T[], fallback: T): T {
  const single = Array.isArray(value) ? value[0] : value
  return single !== undefined && (allowed as readonly string[]).includes(single) ? (single as T) : fallback
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** id ของรายการจาก `searchParams` (เช่น `?case=` จากลิงก์แจ้งเตือน) — ไม่ใช่ UUID = `null` (สิทธิ์จริงตรวจที่ API) */
export function pickUuid(value: string | string[] | undefined): string | null {
  const single = Array.isArray(value) ? value[0] : value
  return single !== undefined && UUID_PATTERN.test(single) ? single : null
}

/** อ่านเลขหน้าจาก `searchParams` — ไม่ใช่จำนวนเต็มบวก = 1 */
export function pickPage(value: string | string[] | undefined): number {
  const single = Array.isArray(value) ? value[0] : value
  const page = Number(single)
  return Number.isInteger(page) && page >= 1 ? page : 1
}
