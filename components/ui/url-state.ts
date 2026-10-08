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

/**
 * query ที่หน้าเขียนเองล่าสุด — Next ซิงก์ `replaceState` เข้า `useSearchParams()` แบบ transition (ช้ากว่า state ของหน้า)
 * ⇒ ระหว่างพิมพ์ค้นหา/กดตัวกรองรัว ค่าเก่าที่เพิ่งเขียนวนกลับมาทีหลัง · ตัวฟัง URL (`useSearchQueryChange`) ต้องไม่ถือว่า
 * เป็นการนำทาง ไม่งั้นตัวกรองย้อนกลับไปค่าก่อนหน้า (preship R7-004)
 */
const SELF_WRITE_WINDOW_MS = 500
/** `self` = หน้าเขียน URL เอง · `nav` = หน้ารับ query จากการนำทางแล้ว (`markQueryAsCurrent`) */
const urlEvents: { query: string; at: number; kind: 'self' | 'nav' }[] = []

/**
 * `query` (ไม่มี `?`) เป็นค่าที่หน้าเขียนลง URL เอง — ค่าล่าสุดที่**หน้าเขียนเอง** (state ของหน้าเท่ากับค่านี้อยู่แล้ว)
 * หรือค่าที่เขียนภายใน 500ms (echo ของการกดรัว ที่ Next ซิงก์ช้ากว่า) · ค่าที่เขียนนานกว่านั้นแล้วถูกนำทางกลับมา =
 * การนำทางจริง (เช่น กดแจ้งเตือนที่ลิงก์ `?tab=advances` หลังผู้ใช้กรอง — ต้องล้างตัวกรอง)
 */
export function isRecentSelfWrite(query: string, now: number = Date.now()): boolean {
  const latest = urlEvents[urlEvents.length - 1]
  // กฎ "ค่าล่าสุด" ใช้เฉพาะค่าที่หน้าเขียนเอง — query จากการนำทางต้องส่งถึงตัวฟังทุกตัวของหน้า (หลาย hook ตัวกรอง
  // ในแท็บเดียว) ไม่ใช่ตัวแรกรับแล้วตัวถัดไปถูกข้ามเพราะนับเป็น echo (preship R9-002)
  if (latest !== undefined && latest.kind === 'self' && latest.query === query) return true
  return urlEvents.some((event) => event.kind === 'self' && event.query === query && now - event.at <= SELF_WRITE_WINDOW_MS)
}

/**
 * หน้ารับ query จากการนำทางแล้ว (state ตาม URL นี้แล้ว) — ค่าที่หน้าเขียนเองก่อนหน้าไม่ใช่ "ค่าล่าสุด" อีกต่อไป
 * ⇒ กด Back กลับไป entry ที่มีตัวกรอง (ค่าที่เคยเขียนเอง) ถือเป็นการนำทาง ไม่ใช่ echo (preship R8-004 — เดิมจอค้าง
 * "ทั้งหมด" ทั้งที่ URL กลับมามีตัวกรอง)
 */
export function markQueryAsCurrent(query: string): void {
  recordUrlEvent(query, Number.NEGATIVE_INFINITY, 'nav')
}

function recordUrlEvent(query: string, at: number, kind: 'self' | 'nav'): void {
  urlEvents.push({ query, at, kind })
  if (urlEvents.length > 30) urlEvents.splice(0, urlEvents.length - 30)
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
    recordUrlEvent(query, Date.now(), 'self')
    window.history.replaceState(modalGuardHistoryState(), '', next)
  }
}

/**
 * ล้างทุก key ของ URL ยกเว้น `keep` — ใช้ตอนผู้ใช้เปลี่ยนแท็บของหน้า shell (การเงิน/บัญชี) ให้ตัวกรองย่อยของแท็บเดิม
 * ไม่ค้างใน URL (preship R6-008/R7-005) · เรียกก่อน `setTab` เพื่อให้แท็บใหม่อ่าน URL ที่สะอาดตอน mount
 */
export function clearUrlParamsExcept(keep: readonly string[]): void {
  if (typeof window === 'undefined') return
  const updates: Record<string, null> = {}
  for (const key of new URLSearchParams(window.location.search).keys()) {
    if (!keep.includes(key)) updates[key] = null
  }
  replaceUrlParams(updates)
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
