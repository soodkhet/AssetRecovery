/**
 * เก็บสถานะของหน้า (แท็บ/ตัวกรอง/หน้า) ไว้ใน URL — preship audit PS-013
 *
 * เดิมเป็น React state ล้วน ⇒ refresh กลาง flow (มักเกิดหลังคำขอช้า/ล้มเหลว) หรือกด Back กลับมา
 * แล้วหลุดไปแท็บแรก/รายการที่ไม่ได้กรอง · ใช้ `history.replaceState` (Next รองรับ — ไม่ยิง server ซ้ำ
 * ไม่เพิ่ม history ทุกครั้งที่พิมพ์ค้นหา) แล้วให้ page อ่าน `searchParams` เป็นค่าเริ่มต้น
 */

import { modalGuardHistoryState } from '@/components/ui/modal-history'

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
    // state ห้ามมี `__NA` — ส่ง `history.state` เดิมทั้งก้อนแล้ว router ของ Next ไม่รับรู้ URL ใหม่ ⇒ ลิงก์แจ้งเตือน
    // กลับไปค่าเดิมไม่ทำงาน และ re-render เขียน URL เก่าทับ (preship R2-009) · คงเฉพาะเครื่องหมาย sentinel ของ
    // modal ที่เปิดอยู่ (ไม่มี = `null` ตามตัวอย่างของ Next) ไม่งั้น entry นั้นค้างใน history แยกไม่ออก (R5-008)
    window.history.replaceState(modalGuardHistoryState(), '', next)
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

/**
 * ค่าเริ่มต้นของ state ที่ผูกกับ `?key=` — อ่านจาก URL จริงของ browser (preship R6-004)
 * prop จาก server (`fallback`) ใช้ตอน render ฝั่ง server และตอนนำทางฝั่ง client มาจากหน้าอื่นเท่านั้น:
 * Back/Forward กลับมาหน้าเดิม Next ใช้ payload/searchParams เก่าใน router cache (ก่อน `replaceUrlParams` เขียน
 * ตัวกรอง/แท็บลง URL) ⇒ เดิมหน้าเริ่มด้วยค่าเริ่มต้นแล้ว effect เขียนทับ URL ที่ถูกต้อง ตัวกรอง/แท็บหาย
 * ตอน hydrate URL ของ browser = URL ที่ server render ⇒ ผู้เรียกต้อง parse ด้วยกติกาเดียวกับ server (ไม่ mismatch)
 */
export function initialUrlParam(key: string, fallback: string | null, pathname?: string): string | null {
  const query = browserSearchParams(pathname)
  return query === null ? fallback : query.get(key)
}

/** query ของ URL จริงของ browser — ฝั่ง server / นำทางฝั่ง client มาจาก path อื่น = `null` (ใช้ prop จาก server) */
export function browserSearchParams(pathname?: string): URLSearchParams | null {
  if (typeof window === 'undefined') return null
  // นำทางฝั่ง client (router.push จากแจ้งเตือน/เมนู) render หน้าใหม่ก่อน Next เปลี่ยน URL ของ browser ⇒ ตอนนี้
  // window.location ยังเป็นหน้าเดิม — ใช้ค่าจาก server แทน (preship R6-003 · Back/Forward URL เปลี่ยนแล้วจึงอ่านจาก URL ได้)
  if (pathname !== undefined && window.location.pathname !== pathname) return null
  return new URLSearchParams(window.location.search)
}

/**
 * ค่าเริ่มต้นของ state ที่ผูกกับ `?key=<uuid>` (เช่นเปิดรายละเอียดเคสจาก `?case=`) — กติกาเดียวกับ `initialUrlParam`
 * Back/Forward กลับมา entry ที่เคยลบ `?case=` ด้วย `replaceUrlParams` แล้ว Next ใช้ payload เก่าที่ยังมี `?case=`
 * ⇒ เดิมรายละเอียดเคสเด้งเปิดเอง (preship R5-007)
 */
export function initialUrlUuid(key: string, fallback: string | null, pathname?: string): string | null {
  return pickUuid(initialUrlParam(key, fallback, pathname) ?? undefined)
}
