/**
 * ปุ่ม Back ของ browser ระหว่างเปิด modal ฟอร์ม — preship R3-014 / R4-005
 *
 * เดิมกด Back (หรือปัดย้อนกลับบนมือถือ) ระหว่างกรอกฟอร์มใน modal ⇒ ออกจากหน้า ข้อมูลที่พิมพ์หายเงียบ
 * modal ที่ถามยืนยันก่อนทิ้ง (`confirmDiscard`) จึงวาง history entry "กันชน" (sentinel — URL เดิม) ไว้หนึ่งชั้น:
 * - กด Back ⇒ browser ถอย sentinel (ยังอยู่หน้าเดิม) แล้ว modal ตัดสินใจ: ฟอร์มสกปรก = วาง sentinel คืน +
 *   ถามยืนยันทิ้ง (`stay`) · ไม่ได้กรอกอะไร = ปิด modal ตามปกติ (`close`) ไม่ออกจากหน้า
 * - modal ปิดด้วยวิธีอื่น (ยกเลิก/บันทึกสำเร็จ/X) ⇒ ถอย sentinel ทิ้งเอง (`history.back()`) ให้ Back ครั้งถัดไป
 *   ทำงานตามปกติ · การถอยที่โค้ดสั่งเองถูกกลืนที่นี่ (capture + stopImmediatePropagation) ไม่ให้ router ของ Next
 *   หรือ modal ตัวอื่นเข้าใจว่าเป็นการกด Back ของผู้ใช้ และถ้าระหว่างเปิด URL ถูกเปลี่ยนแบบ replace
 *   (เช่นลบ `?case=` ตอนปิด) จะเขียน URL ปัจจุบันทับ entry ที่ถอยกลับไป ไม่ให้ modal เด้งกลับมาเปิดเอง
 * - ระหว่างเปิด modal มีการนำทางไปหน้าอื่น (entry ใหม่ถูก push / path เปลี่ยน) ⇒ ไม่ถอย (ไม่งั้นเด้งกลับหน้าเดิม)
 * - modal ซ้อนกัน: sentinel ของตัวที่เปิดทีหลังอยู่บนสุด ⇒ ตัวนั้นเป็นผู้ตัดสินเสมอ
 *
 * module-level state ฝั่ง client เท่านั้น (ทั้งแท็บมี history ชุดเดียว)
 */

export type ModalHistoryDecision = 'stay' | 'close'

const STATE_KEY = '__arModalGuard'

interface Guard {
  id: number
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
}

const guards: Guard[] = []
/** URL ที่ต้องเขียนทับหลังการถอยที่โค้ดสั่งเอง (หนึ่งรายการต่อ `history.back()` หนึ่งครั้ง ตามลำดับ) */
const pendingBacks: string[] = []
let nextId = 1
let listening = false

function currentUrl(): string {
  return `${window.location.pathname}${window.location.search}${window.location.hash}`
}

function pushSentinel(guard: Guard, url?: string): void {
  // ไม่ส่ง URL (หรือส่ง URL เดิมของ sentinel) — Next คัด state ภายในของ router มาใส่ entry ใหม่ให้เอง
  window.history.pushState({ [STATE_KEY]: guard.id }, '', url)
  guard.pushed = true
  guard.url = currentUrl()
  guard.pathname = window.location.pathname
  // sentinel ของเราเองไม่นับเป็น "การนำทาง" ของ modal ตัวอื่นที่เปิดค้างอยู่ข้างล่าง
  for (const other of guards) other.length = window.history.length
}

/** modal ที่รอวาง sentinel จนกว่าการถอยที่สั่งไว้ก่อนหน้าจะเสร็จ (ปิดตัวหนึ่งแล้วเปิดอีกตัวทันที) */
function flushWaiting(): void {
  if (pendingBacks.length > 0) return
  for (const guard of guards) {
    if (!guard.pushed && guard.timer === null) pushSentinel(guard)
  }
}

function handlePopState(event: PopStateEvent): void {
  const fixUrl = pendingBacks.shift()
  if (fixUrl !== undefined) {
    // การถอย sentinel ที่โค้ดสั่งเอง — ไม่ใช่การกด Back ของผู้ใช้
    event.stopImmediatePropagation()
    if (currentUrl() !== fixUrl) window.history.replaceState(null, '', fixUrl)
    flushWaiting()
    return
  }
  const active = guards.filter((guard) => guard.pushed && !guard.consumed)
  const top = active[active.length - 1]
  if (top === undefined) return
  const state: unknown = window.history.state
  // ยังยืนอยู่บน sentinel ของตัวเอง (เช่นกด Forward กลับมา) ⇒ ไม่ใช่การถอยออกจาก modal
  if (typeof state === 'object' && state !== null && (state as Record<string, unknown>)[STATE_KEY] === top.id) return

  if (top.onBack() === 'stay') {
    pushSentinel(top, currentUrl() === top.url ? undefined : top.url)
  } else {
    // ตั้งก่อนเรียก onClose — ตอน modal unmount จะได้ไม่ถอย history ซ้ำ
    top.consumed = true
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
}

const ensureListening = installModalHistory

/**
 * วาง sentinel ให้ modal ที่เพิ่งเปิด — คืนฟังก์ชันถอนเมื่อ modal ปิด/unmount
 * push ถูกเลื่อนไป task ถัดไป: React StrictMode (dev) mount → unmount → mount effect ทันที
 * ถ้า push/back ทันทีจะได้ `history.back()` ค้างคิวไปถอย sentinel ตัวใหม่แทน
 */
export function guardModalHistory({
  onBack,
  onClose,
}: {
  onBack: () => ModalHistoryDecision
  onClose: () => void
}): () => void {
  if (typeof window === 'undefined') return () => undefined
  ensureListening()
  const guard: Guard = {
    id: nextId++,
    onBack,
    onClose,
    pushed: false,
    consumed: false,
    timer: null,
    url: '',
    pathname: '',
    length: 0,
  }
  guards.push(guard)
  guard.timer = setTimeout(() => {
    guard.timer = null
    // ยังมี `history.back()` ค้างคิว ⇒ push ตอนนี้จะถูกถอยทับ — รอ popstate ของการถอยนั้นก่อน
    if (pendingBacks.length === 0) pushSentinel(guard)
  }, 0)

  return () => {
    if (guard.timer !== null) clearTimeout(guard.timer)
    const index = guards.indexOf(guard)
    if (index !== -1) guards.splice(index, 1)
    if (!guard.pushed || guard.consumed) return
    // นำทางไปหน้าอื่นแล้ว (มี entry ใหม่ทับ sentinel / path เปลี่ยน) ⇒ ไม่ถอย ไม่งั้นผู้ใช้ถูกดึงกลับหน้าเดิม
    if (window.history.length !== guard.length || window.location.pathname !== guard.pathname) return
    pendingBacks.push(currentUrl())
    window.history.back()
  }
}
