/**
 * ปุ่ม Back ของ browser ระหว่างเปิด modal / drawer — preship R3-014 / R4-005 / R5-008 / R5-009 / R5-013
 *
 * เดิมกด Back (หรือปัดย้อนกลับบนมือถือ) ระหว่างกรอกฟอร์มใน modal ⇒ ออกจากหน้า ข้อมูลที่พิมพ์หายเงียบ
 * modal ที่ถามยืนยันก่อนทิ้ง (`confirmDiscard`) และ drawer จึงวาง history entry "กันชน" (sentinel — URL เดิม) ไว้หนึ่งชั้น:
 * - กด Back ⇒ browser ถอย sentinel (ยังอยู่หน้าเดิม) แล้ว modal ตัดสินใจ: ฟอร์มสกปรก = วาง sentinel คืน +
 *   ถามยืนยันทิ้ง (`stay`) · ไม่ได้กรอกอะไร = ปิด modal ตามปกติ (`close`) ไม่ออกจากหน้า
 * - modal ปิดด้วยวิธีอื่น (ยกเลิก/บันทึกสำเร็จ/X) ⇒ ถอย sentinel ทิ้งเอง (`history.back()`) ให้ Back ครั้งถัดไป
 *   ทำงานตามปกติ · การถอยที่โค้ดสั่งเองถูกกลืนที่นี่ (capture + stopImmediatePropagation) ไม่ให้ router ของ Next
 *   หรือ modal ตัวอื่นเข้าใจว่าเป็นการกด Back ของผู้ใช้
 * - การถอยนั้นถูกเลื่อนไป task ถัดไป แล้วยก URL + state ของ sentinel **ณ ตอนถอย** ไปเขียนทับ entry ที่ถอยกลับไป
 *   ⇒ หน้าที่ปิด modal พร้อมเปลี่ยนตัวกรอง/แท็บ (`replaceUrlParams` ใน effect ของ commit เดียวกัน — ทำงานหลัง
 *   cleanup ของ modal) URL ล่าสุดของหน้าชนะเสมอ ไม่ถูกถอยกลับไปค่าเดิม (R5-013) · ลบ `?case=` ตอนปิดก็ไม่เด้งกลับ
 * - ระหว่างเปิด modal มีการนำทางไปหน้าอื่น (entry ใหม่ถูก push / path เปลี่ยน) ⇒ ไม่ถอย (ไม่งั้นเด้งกลับหน้าเดิม)
 * - modal ซ้อนกัน: sentinel ของตัวที่เปิดทีหลังอยู่บนสุด ⇒ ตัวนั้นเป็นผู้ตัดสินเสมอ
 * - sentinel ที่หมดหน้าที่แล้วยังค้างใน history (browser ลบ entry ไม่ได้) — Forward ไปเจอ / Back ผ่าน /
 *   refresh ระหว่างเปิด modal แล้วโหลดใหม่บน sentinel ⇒ ข้ามไปเองแบบไม่มีอะไรเกิดบนจอ (R5-008)
 *   id ของ sentinel ไม่ซ้ำข้ามการโหลด (ขึ้นต้นด้วย id ของการโหลด) จึงไม่ชนกับ modal ที่เปิดใหม่หลัง refresh
 *
 * module-level state ฝั่ง client เท่านั้น (ทั้งแท็บมี history ชุดเดียว)
 */

export type ModalHistoryDecision = 'stay' | 'close'

/** key ใน `history.state` ของ sentinel — `replaceUrlParams` คัดค่าไปด้วยเพื่อไม่ให้ entry เสียเครื่องหมาย */
export const MODAL_GUARD_STATE_KEY = '__arModalGuard'

/**
 * - `dead` = ไม่มี entry ถัดไปแน่นอน (ปิด modal แล้วถอยออกมา) ⇒ เจอเมื่อไหร่ถอยกลับเสมอ
 * - `released` = ผู้ใช้นำทางไปหน้าอื่นจาก sentinel (มี entry ถัดไป) ⇒ ข้ามไปตามทิศที่กำลังไป
 */
type StaleKind = 'dead' | 'released'

interface Guard {
  id: string
  /** ผู้ใช้กด Back ถอย sentinel ของ modal นี้ — `stay` = วาง sentinel คืน · `close` = ปล่อยให้ถอยแล้วปิด modal */
  onBack: () => ModalHistoryDecision
  onClose: () => void
  pushed: boolean
  /** sentinel ถูกถอยไปแล้วโดยผู้ใช้ (modal กำลังปิดจาก Back) — ตอนปิดไม่ต้องถอยซ้ำ */
  consumed: boolean
  timer: ReturnType<typeof setTimeout> | null
  /** URL ของ sentinel · จำนวน entry หลัง push — ใช้ตรวจว่ามีการนำทางไปหน้าอื่นระหว่างเปิดหรือไม่ */
  url: string
  pathname: string
  length: number
  /** key ของ entry ใน Navigation API (คงเดิมแม้ถูก replaceState) — `null` = browser ไม่รองรับ */
  entryKey: string | null
}

/** การถอยที่โค้ดสั่งเอง — `state`/`url` = ของ sentinel ตอนถอย เขียนทับ entry ที่ถอยไปถึง (`null` = ไม่ต้องเขียน) */
interface PendingBack {
  state: Record<string, unknown> | null
  url: string | null
}

/** Navigation API เฉพาะส่วนที่ใช้ (ยังไม่มีใน lib.dom ทุกเวอร์ชัน) */
interface NavigationEntryLike {
  key: string
  index: number
}
interface NavigationLike {
  currentEntry: NavigationEntryLike | null
  canGoForward: boolean
  addEventListener(type: 'currententrychange', listener: (event: Event & { from?: NavigationEntryLike }) => void): void
}

const guards: Guard[] = []
const pendingBacks: PendingBack[] = []
/** การถอยที่นัดไว้แล้วแต่ยังไม่สั่ง (รอ task ถัดไป) — ระหว่างนี้ห้ามวาง sentinel ใหม่ */
let scheduledBacks = 0
const staleById = new Map<string, StaleKind>()
const staleByEntryKey = new Map<string, StaleKind>()
const LOAD_ID = makeLoadId()
let nextSeq = 1
let listening = false
/** index ของ entry ปัจจุบัน/ก่อนหน้า (Navigation API) — ใช้รู้ทิศ Back/Forward ของ popstate */
let knownIndex = -1
let previousIndex = -1

function makeLoadId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return crypto.randomUUID().slice(0, 8)
  return Math.random().toString(36).slice(2, 10)
}

function navigationApi(): NavigationLike | null {
  if (typeof window === 'undefined') return null
  const nav = (window as unknown as { navigation?: NavigationLike }).navigation
  return nav !== undefined && nav !== null && typeof nav.addEventListener === 'function' ? nav : null
}

function currentEntryKey(): string | null {
  return navigationApi()?.currentEntry?.key ?? null
}

function currentUrl(): string {
  return `${window.location.pathname}${window.location.search}${window.location.hash}`
}

function sentinelIdOf(state: unknown): string | null {
  if (typeof state !== 'object' || state === null) return null
  const value = (state as Record<string, unknown>)[MODAL_GUARD_STATE_KEY]
  // id แบบเก่า (ตัวเลข) จากแท็บที่เปิดค้างก่อนอัปเดต ก็ถือเป็น sentinel ค้างเช่นกัน
  return typeof value === 'string' ? value : typeof value === 'number' ? String(value) : null
}

/** state ปัจจุบันโดยไม่มีเครื่องหมาย sentinel (ของ router Next ยังอยู่ครบ) */
function stateWithoutGuard(): Record<string, unknown> | null {
  const state: unknown = window.history.state
  if (typeof state !== 'object' || state === null) return null
  const copy: Record<string, unknown> = { ...(state as Record<string, unknown>) }
  delete copy[MODAL_GUARD_STATE_KEY]
  return copy
}

/** state สำหรับ `history.replaceState` ของโค้ดอื่น — คงเครื่องหมาย sentinel ไว้ ไม่งั้น entry ค้างแยกไม่ออก */
export function modalGuardHistoryState(): Record<string, unknown> | null {
  if (typeof window === 'undefined') return null
  const id = sentinelIdOf(window.history.state)
  return id === null ? null : { [MODAL_GUARD_STATE_KEY]: id }
}

function markStale(guard: Guard, kind: StaleKind): void {
  staleById.set(guard.id, kind)
  if (guard.entryKey !== null) staleByEntryKey.set(guard.entryKey, kind)
}

function pushSentinel(guard: Guard, url?: string): void {
  // ไม่ส่ง URL (หรือส่ง URL เดิมของ sentinel) — Next คัด state ภายในของ router มาใส่ entry ใหม่ให้เอง
  window.history.pushState({ [MODAL_GUARD_STATE_KEY]: guard.id }, '', url)
  guard.pushed = true
  guard.url = currentUrl()
  guard.pathname = window.location.pathname
  guard.entryKey = currentEntryKey()
  // sentinel ของเราเองไม่นับเป็น "การนำทาง" ของ modal ตัวอื่นที่เปิดค้างอยู่ข้างล่าง
  for (const other of guards) other.length = window.history.length
}

function historySettled(): boolean {
  return pendingBacks.length === 0 && scheduledBacks === 0
}

const settledCallbacks: Array<() => void> = []

/** modal ที่รอวาง sentinel จนกว่าการถอยที่สั่งไว้ก่อนหน้าจะเสร็จ (ปิดตัวหนึ่งแล้วเปิดอีกตัวทันที) */
function flushWaiting(): void {
  if (!historySettled()) return
  for (const guard of guards) {
    if (!guard.pushed && guard.timer === null) pushSentinel(guard)
  }
  for (const callback of settledCallbacks.splice(0)) callback()
}

/**
 * เรียก `callback` เมื่อการถอย sentinel ที่ค้างอยู่เสร็จแล้ว (ทันทีถ้าไม่มี) — ใช้ก่อน `router.push` จากใน drawer/modal
 * (ปิดแล้วนำทางทันทีจะ push ทับ sentinel ⇒ Back จากหน้าใหม่ต้องกดสองครั้ง)
 */
export function afterModalHistorySettled(callback: () => void): void {
  if (typeof window === 'undefined' || historySettled()) {
    callback()
    return
  }
  settledCallbacks.push(callback)
}

/** ทิศของ popstate ปัจจุบัน — `null` = ไม่รู้ (browser ไม่มี Navigation API) */
function travelDirection(): 'back' | 'forward' | null {
  const index = navigationApi()?.currentEntry?.index
  if (index === undefined || index < 0) return null
  // currententrychange มาก่อน popstate ตามสเปก — เผื่อ browser ที่ลำดับต่างก็ใช้ค่าที่รู้ล่าสุด
  const from = knownIndex === index ? previousIndex : knownIndex
  if (from < 0 || from === index) return null
  return index < from ? 'back' : 'forward'
}

/** ตกลงบน sentinel ที่หมดหน้าที่แล้ว (ไม่มี modal เปิดอยู่) ⇒ ข้ามไปต่อตามทิศที่ผู้ใช้กำลังไป */
function skipStaleEntry(event: PopStateEvent, kind: StaleKind | undefined): void {
  // entry ซ้ำของหน้าเดิม — ไม่ให้ router render (URL ของมันอาจเป็นค่าเก่า เช่น `?case=` ที่ลบไปแล้ว)
  event.stopImmediatePropagation()
  if (kind !== 'dead' && travelDirection() === 'forward' && navigationApi()?.canGoForward !== false) {
    window.history.forward()
    return
  }
  window.history.back()
}

function handlePopState(event: PopStateEvent): void {
  const pending = pendingBacks.shift()
  if (pending !== undefined) {
    // การถอย sentinel ที่โค้ดสั่งเอง — ไม่ใช่การกด Back ของผู้ใช้
    event.stopImmediatePropagation()
    if (pending.url !== null) {
      // ยก URL + state (ของ router Next) ล่าสุดของ sentinel มาไว้ที่ entry นี้ — ถ้า entry นี้เป็น sentinel ของ
      // modal ที่ซ้อนอยู่ข้างล่าง คงเครื่องหมายของมันไว้
      const arrivalId = sentinelIdOf(window.history.state)
      const base = pending.state ?? {}
      window.history.replaceState(
        arrivalId === null ? base : { ...base, [MODAL_GUARD_STATE_KEY]: arrivalId },
        '',
        pending.url,
      )
    }
    flushWaiting()
    return
  }

  const landedId = sentinelIdOf(window.history.state)
  const landedKey = currentEntryKey()
  const active = guards.filter((guard) => guard.pushed && !guard.consumed)
  const top = active[active.length - 1]

  if (top === undefined) {
    const kind = (landedKey === null ? undefined : staleByEntryKey.get(landedKey)) ?? (landedId === null ? undefined : staleById.get(landedId))
    // sentinel ของการโหลดก่อน (refresh / ออกนอกเว็บแล้วกลับมา) ก็ข้ามเช่นกัน
    if (kind !== undefined || landedId !== null) skipStaleEntry(event, kind)
    return
  }

  // ยังยืนอยู่บน sentinel ของตัวเอง (เช่นกด Forward กลับมา) ⇒ ไม่ใช่การถอยออกจาก modal
  if (landedId === top.id || (landedKey !== null && landedKey === top.entryKey)) return

  if (top.onBack() === 'stay') {
    pushSentinel(top, currentUrl() === top.url ? undefined : top.url)
  } else {
    // ตั้งก่อนเรียก onClose — ตอน modal unmount จะได้ไม่ถอย history ซ้ำ · sentinel ที่เหลือข้างหน้ากลายเป็น entry ค้าง
    top.consumed = true
    markStale(top, 'dead')
    top.onClose()
  }
}

/**
 * ติดตั้ง listener ของ popstate — **ต้องลงทะเบียนก่อน router ของ Next** (listener บน window ทำงานตามลำดับ
 * ที่ลงทะเบียน แม้ใช้ capture) ไม่งั้นการถอย sentinel ที่โค้ดสั่งเองหยุด router ไม่ทัน แล้ว router
 * พาไป URL เก่าของ entry นั้น (เช่น `?case=` ที่เพิ่งลบตอนปิด ⇒ modal เด้งกลับมาเปิด)
 * ⇒ เรียกจาก `instrumentation-client.ts` (ทำงานก่อน hydrate) · `guardModalHistory()` เรียกซ้ำเป็น fallback ได้
 */
export function installModalHistory(): void {
  if (listening || typeof window === 'undefined') return
  listening = true
  window.addEventListener('popstate', handlePopState, { capture: true })

  const nav = navigationApi()
  if (nav !== null) {
    knownIndex = nav.currentEntry?.index ?? -1
    nav.addEventListener('currententrychange', (event) => {
      previousIndex = event.from?.index ?? knownIndex
      knownIndex = nav.currentEntry?.index ?? -1
    })
  }

  // โหลดหน้าขึ้นมาบน sentinel ของการโหลดก่อน (refresh ระหว่างเปิด modal) ⇒ ถอยลง entry จริงข้างล่างทันที
  // พร้อมยก URL ปัจจุบันไปด้วย — ไม่งั้น Back ครั้งแรกตกลง entry ซ้ำ "ไม่มีอะไรเกิดขึ้น" (R5-008)
  if (sentinelIdOf(window.history.state) !== null) {
    const key = currentEntryKey()
    if (key !== null) staleByEntryKey.set(key, 'dead')
    pendingBacks.push({ state: stateWithoutGuard(), url: currentUrl() })
    window.history.back()
  }
}

const ensureListening = installModalHistory

/**
 * วาง sentinel ให้ modal ที่เพิ่งเปิด — คืนฟังก์ชันถอนเมื่อ modal ปิด/unmount
 * push ถูกเลื่อนไป task ถัดไป: React StrictMode (dev) mount → unmount → mount effect ทันที
 * ถ้า push/back ทันทีจะได้ `history.back()` ค้างคิวไปถอย sentinel ตัวใหม่แทน
 * ถอนด้วย `{ navigating: true }` เมื่อปิดเพราะกำลังนำทางไปหน้าอื่น (ไม่ถอย — ปล่อยให้ entry ใหม่ทับ)
 */
export function guardModalHistory({
  onBack,
  onClose,
}: {
  onBack: () => ModalHistoryDecision
  onClose: () => void
}): (options?: { navigating?: boolean }) => void {
  if (typeof window === 'undefined') return () => undefined
  ensureListening()
  const guard: Guard = {
    id: `${LOAD_ID}-${nextSeq++}`,
    onBack,
    onClose,
    pushed: false,
    consumed: false,
    timer: null,
    url: '',
    pathname: '',
    length: 0,
    entryKey: null,
  }
  guards.push(guard)
  guard.timer = setTimeout(() => {
    guard.timer = null
    // ยังมี `history.back()` ค้างคิว ⇒ push ตอนนี้จะถูกถอยทับ — รอ popstate ของการถอยนั้นก่อน
    if (historySettled()) pushSentinel(guard)
  }, 0)

  return (options) => {
    if (guard.timer !== null) clearTimeout(guard.timer)
    const index = guards.indexOf(guard)
    if (index !== -1) guards.splice(index, 1)
    if (!guard.pushed || guard.consumed) return
    if (options?.navigating === true) {
      markStale(guard, 'released')
      return
    }
    // เลื่อนการถอยไป task ถัดไป — effect ของหน้าแม่ใน commit เดียวกัน (เช่นเขียนตัวกรองลง URL) ทำงานหลัง cleanup นี้
    // ต้องเขียนเสร็จก่อน แล้วค่อยยก URL ล่าสุดไปไว้ที่ entry ข้างล่าง (R5-013)
    scheduledBacks += 1
    setTimeout(() => {
      scheduledBacks -= 1
      // นำทางไปหน้าอื่นแล้ว (มี entry ใหม่ทับ sentinel / path เปลี่ยน) ⇒ ไม่ถอย ไม่งั้นผู้ใช้ถูกดึงกลับหน้าเดิม
      if (window.history.length !== guard.length || window.location.pathname !== guard.pathname) {
        markStale(guard, 'released')
        flushWaiting()
        return
      }
      markStale(guard, 'dead')
      pendingBacks.push({ state: stateWithoutGuard(), url: currentUrl() })
      window.history.back()
    }, 0)
  }
}
