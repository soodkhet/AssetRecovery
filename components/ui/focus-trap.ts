import { fieldErrorControl } from '@/components/ui/input'

/**
 * กักโฟกัสในโมดัล/ลิ้นชักที่ประกาศ `aria-modal="true"` (ตรวจ a11y staging SV5-C1-01 — WAI-ARIA dialog pattern / WCAG 2.4.3)
 *
 * - Tab / Shift+Tab วนอยู่ในแผงของชั้นบนสุดเท่านั้น (ชั้นข้างหลังเฉย — ตัดสินด้วย `isTop` จาก `modal-stack.ts`)
 * - เปิดแล้ว: โฟกัสที่อยู่ในแผงอยู่แล้ว (`autoFocus`) คงไว้ · `[data-autofocus]` · ไม่งั้นช่อง/ปุ่มแรกที่ Tab ถึง
 *   (ข้ามปุ่มที่ติด `data-initial-focus="skip"` เช่นปุ่ม X ที่หัว) — แต่ช่องที่เปิดรายการแนะนำเอง (combobox) / iframe /
 *   ช่องพิมพ์บนจอสัมผัส (คีย์บอร์ดเด้งบังฟอร์ม) ⇒ โฟกัสแผงแทน (`initialFocus: 'container'` = โฟกัสแผงเสมอ)
 * - ปิดแล้วคืนโฟกัสให้ปุ่มที่เปิด — เว้นแต่ผู้เรียกย้ายโฟกัสไปที่อื่นเองแล้ว
 * - ปุ่มที่โฟกัสอยู่ถูก disable (`<Button loading>`) / ถอดออก ⇒ จอดโฟกัสที่แผง แล้วคืนให้ปุ่มเมื่อกลับมาใช้ได้ (SV5-D3-02)
 * - ใช้ keydown ไม่ใช้ `inert` — โมดัลของระบบ render ในที่ (ไม่มี portal) จึงไม่มี sibling ระดับ body ให้ปิด
 *
 * ตรรกะตัดสินแยกเป็น pure function (`selectTabbable` / `decideTabTarget` / `chooseInitialFocus`) — เทสต์ไม่ต้องใช้ DOM
 */

// ───────────────────────────── pure ─────────────────────────────

/** ข้อมูลที่ต้องใช้ตัดสินว่า element รับ Tab ได้ไหม (ดึงจาก DOM ใน `describeCandidate`) */
export interface TabCandidate {
  tabIndex: number
  disabled: boolean
  /** ไม่แสดงบนจอ (display:none / visibility:hidden / อยู่ใต้ `[inert]` / `[hidden]`) */
  hidden: boolean
  /** ชื่อกลุ่มของ `<input type="radio" name>` — browser ให้ Tab ถึงแค่ตัวเดียวต่อกลุ่ม */
  radioGroup: string | null
  checked: boolean
}

/**
 * คัดเฉพาะตัวที่ Tab ถึงได้ ตามลำดับเอกสาร — กลุ่ม radio เหลือตัวที่เลือกอยู่ (ไม่มีตัวที่เลือก ⇒ ตัวแรก)
 * (ระบบไม่ใช้ tabindex บวก จึงไม่เรียงตาม tabindex)
 */
export function selectTabbable<T extends TabCandidate>(candidates: readonly T[]): T[] {
  const visible = candidates.filter((item) => item.tabIndex >= 0 && !item.disabled && !item.hidden)
  const checkedGroups = new Set(visible.filter((item) => item.radioGroup !== null && item.checked).map((item) => item.radioGroup))
  const seenGroups = new Set<string>()
  return visible.filter((item) => {
    if (item.radioGroup === null) return true
    if (checkedGroups.has(item.radioGroup)) return item.checked
    if (seenGroups.has(item.radioGroup)) return false
    seenGroups.add(item.radioGroup)
    return true
  })
}

/**
 * ตำแหน่งของโฟกัสปัจจุบันเทียบกับรายการที่ Tab ถึงในแผง
 * - `item` = อยู่บนตัวที่ `index` · `before` = ตัวแผงเอง/จุดในแผงก่อนตัวแรก · `after` = จุดในแผงหลังตัวสุดท้าย
 * - `between` = จุดในแผงที่ Tab ไม่ถึงแต่อยู่ระหว่างกลาง · `outside` = นอกแผง (หลุดไปหน้าหลังโมดัล/body)
 */
export type FocusPosition =
  | { kind: 'item'; index: number }
  | { kind: 'before' }
  | { kind: 'after' }
  | { kind: 'between' }
  | { kind: 'outside' }

/** ผลการกด Tab: `first`/`last` = ย้ายเอง · `container` = ไม่มีอะไรให้ Tab ⇒ ค้างที่แผง · `null` = ปล่อย browser ทำตามปกติ */
export type TabTarget = 'first' | 'last' | 'container' | null

export function decideTabTarget(count: number, position: FocusPosition, shift: boolean): TabTarget {
  if (count === 0) return 'container'
  switch (position.kind) {
    case 'outside':
      return shift ? 'last' : 'first'
    case 'before':
      return shift ? 'last' : 'first'
    case 'after':
      return shift ? 'last' : 'first'
    case 'between':
      return null
    case 'item':
      if (!shift && position.index >= count - 1) return 'first'
      if (shift && position.index <= 0) return 'last'
      return null
  }
}

/** ชนิดของตัวเลือกโฟกัสแรก — ใช้ตัดสินว่าควรโฟกัสตอนเปิดหรือไม่ */
export type InitialFocusKind = 'text' | 'combobox' | 'frame' | 'other'

export interface InitialFocusCandidate {
  /** `data-initial-focus="skip"` — เช่นปุ่ม X ที่หัวโมดัล */
  skip: boolean
  kind: InitialFocusKind
}

/**
 * เลือกตัวที่โฟกัสตอนเปิด — คืน index ใน `candidates` หรือ -1 = โฟกัสแผง
 * ตัวแรกที่ไม่ข้าม: combobox (โฟกัสแล้วเปิดรายการแนะนำเอง) / iframe (ตัวแสดง PDF ดึงคีย์ Esc ไป) ⇒ แผง ·
 * ช่องพิมพ์บนจอสัมผัส ⇒ แผง (คีย์บอร์ดเด้งบังฟอร์มทันทีที่เปิด)
 */
export function chooseInitialFocus(candidates: readonly InitialFocusCandidate[], { coarsePointer }: { coarsePointer: boolean }): number {
  const index = candidates.findIndex((item) => !item.skip)
  const kind = candidates[index]?.kind
  if (kind === undefined) return -1
  if (kind === 'combobox' || kind === 'frame') return -1
  if (kind === 'text' && coarsePointer) return -1
  return index
}

/** โฟกัสหลังปิดควรคืนให้ปุ่มที่เปิดไหม — ผู้เรียกย้ายโฟกัสไปที่อื่น (นอกแผง ไม่ใช่ body) แล้ว ⇒ ไม่แย่ง */
export function shouldRestoreFocus({
  openerConnected,
  activeIsBody,
  activeInsideContainer,
}: {
  openerConnected: boolean
  activeIsBody: boolean
  activeInsideContainer: boolean
}): boolean {
  return openerConnected && (activeIsBody || activeInsideContainer)
}

/**
 * ใครเป็นผู้เปิด (ไว้คืนโฟกัสตอนปิด): element ที่โฟกัสอยู่ตอนเปิด ถ้ายังอยู่นอกแผงและไม่ใช่ body ·
 * ไม่งั้น element ที่ผู้ใช้กด/โฟกัสล่าสุดนอกแผง (Safari ไม่โฟกัสปุ่มที่คลิก · `autoFocus`/effect ของลูกย้ายโฟกัสเข้าแผงก่อน)
 */
export function pickOpener<T>({ active, lastInteracted }: { active: T | null; lastInteracted: T | null }): T | null {
  return active ?? lastInteracted
}

/**
 * โฟกัสในแผงหลุดเพราะ element ที่โฟกัสอยู่ถูก disable/ซ่อน/ถอดออก (เช่น `<Button loading>` ที่กดยืนยันแล้วเข้าสถานะโหลด)
 * ⇒ ตัดสินว่าจะทำอะไร (SV5-D3-02) — ไม่เปลี่ยนการ disable ปุ่ม จึงยังกันกดส่งซ้ำ/Enter ส่งฟอร์มซ้ำได้เหมือนเดิม
 * - `park` = โฟกัสหลุด (body / ตัวที่ใช้ไม่ได้แล้ว) ⇒ จอดที่ตัวแผง (`tabIndex=-1`) ไม่ให้ screen reader หลงไป body
 * - `restore` = trap จอดโฟกัสไว้เอง แล้วเป้าคืน (ช่องที่ผิดหลังส่ง หรือตัวที่ใช้ไม่ได้ตอนจอด) กลับมาใช้ได้ ⇒ คืนให้ตัวนั้น
 *   (คืนเฉพาะกรณีจอดไว้เอง — ไม่ดึงโฟกัสเข้าช่องพิมพ์ที่ผู้ใช้ blur เองจนคีย์บอร์ดมือถือเด้ง)
 * - `null` = โฟกัสอยู่ที่ใช้ได้แล้ว (เช่น `revealFirstFieldError` โฟกัสช่องที่ผิดไปแล้ว) ⇒ ไม่แย่ง
 */
export type FocusRecovery = 'restore' | 'park' | null

export function decideFocusRecovery({
  focusLost,
  parked,
  restoreTargetUsable,
}: {
  /** activeElement เป็น body/null หรือเป็น element ในแผงที่ใช้ไม่ได้แล้ว (disabled/ถูกถอด/ซ่อน) */
  focusLost: boolean
  /** โฟกัสอยู่ที่ตัวแผงเพราะ trap จอดไว้เอง (ไม่ใช่ผู้ใช้/ผู้เรียกตั้งใจโฟกัสแผง) */
  parked: boolean
  /** มีเป้าคืน (`pickRestoreTarget`) และใช้ได้แล้ว */
  restoreTargetUsable: boolean
}): FocusRecovery {
  if (focusLost) return 'park'
  if (parked && restoreTargetUsable) return 'restore'
  return null
}

/**
 * เป้าที่จะคืนโฟกัสหลังจอด — ช่องที่ผิด (มีข้อความ `[data-field-error]` หลังส่งไม่ผ่าน) ชนะตัวที่จอดมา:
 * `<Modal>` ปลด fieldset ช้ากว่า 1 commit ⇒ `revealFirstFieldError` โฟกัสช่องที่ยัง disabled ไม่ติด ต้องโฟกัสแทนตรงนี้
 * · `parkedFrom` = ตัวที่ใช้ไม่ได้ตอนจอด (ปุ่มที่กด) — ผู้ใช้ blur เอง/หลุดด้วยเหตุอื่น ⇒ `null` (จอดเฉย ๆ ไม่คืน)
 */
export function pickRestoreTarget<T>({ errorControl, parkedFrom }: { errorControl: T | null; parkedFrom: T | null }): T | null {
  return errorControl ?? parkedFrom
}

// ───────────────────────────── DOM ─────────────────────────────

const CANDIDATE_SELECTOR = [
  'a[href]',
  'area[href]',
  'button',
  'input:not([type="hidden"])',
  'select',
  'textarea',
  'iframe',
  'summary',
  'audio[controls]',
  'video[controls]',
  '[contenteditable]:not([contenteditable="false"])',
  '[tabindex]',
].join(',')

const NON_TEXT_INPUT_TYPES = new Set(['button', 'checkbox', 'radio', 'file', 'submit', 'reset', 'range', 'color', 'image'])

function isHidden(element: HTMLElement): boolean {
  if (element.closest('[inert], [hidden]') !== null) return true
  if (element.getClientRects().length === 0) return true
  return element.ownerDocument.defaultView?.getComputedStyle(element).visibility === 'hidden'
}

function describeCandidate(element: HTMLElement): TabCandidate & { element: HTMLElement } {
  const isRadio = element instanceof HTMLInputElement && element.type === 'radio'
  return {
    element,
    tabIndex: element.tabIndex,
    disabled: element.matches(':disabled'),
    hidden: isHidden(element),
    radioGroup: isRadio && element.name !== '' ? `${element.form?.id ?? ''}::${element.name}` : null,
    checked: isRadio && element.checked,
  }
}

/** element ในแผงที่ Tab ถึงได้ ตามลำดับเอกสาร */
export function tabbableElements(container: HTMLElement): HTMLElement[] {
  const elements = Array.from(container.querySelectorAll<HTMLElement>(CANDIDATE_SELECTOR))
  return selectTabbable(elements.map(describeCandidate)).map((item) => item.element)
}

function initialFocusKind(element: HTMLElement): InitialFocusKind {
  if (element instanceof HTMLIFrameElement) return 'frame'
  if (element.matches('[role="combobox"], [aria-autocomplete], input[list]')) return 'combobox'
  if (element instanceof HTMLTextAreaElement || element.isContentEditable) return 'text'
  if (element instanceof HTMLInputElement && !NON_TEXT_INPUT_TYPES.has(element.type)) return 'text'
  return 'other'
}

function focusPosition(container: HTMLElement, items: readonly HTMLElement[], active: Element | null): FocusPosition {
  if (active === null || !container.contains(active)) return { kind: 'outside' }
  const index = items.indexOf(active as HTMLElement)
  if (index !== -1) return { kind: 'item', index }
  if (active === container || items.length === 0) return { kind: 'before' }
  const first = items[0]
  const last = items[items.length - 1]
  if (first === undefined || last === undefined) return { kind: 'before' }
  if (active.compareDocumentPosition(first) & Node.DOCUMENT_POSITION_FOLLOWING) return { kind: 'before' }
  if (active.compareDocumentPosition(last) & Node.DOCUMENT_POSITION_PRECEDING) return { kind: 'after' }
  return { kind: 'between' }
}

/**
 * element ล่าสุดที่ผู้ใช้กด/โฟกัส (ทั้งหน้า) — ฟังที่ document แบบ capture ตั้งแต่โหลดโมดูล (ก่อนโมดัลแรกเปิด)
 * กดที่ element ที่โฟกัสไม่ได้ (เช่นแถวตาราง) ⇒ จำตัวที่โฟกัสได้ที่ใกล้ที่สุด (ไม่มี = ไม่จำ)
 */
let lastInteracted: HTMLElement | null = null
if (typeof document !== 'undefined') {
  const remember = (event: Event) => {
    const target = event.target
    if (!(target instanceof Element)) return
    const focusable = target.closest<HTMLElement>(CANDIDATE_SELECTOR)
    if (focusable !== null) lastInteracted = focusable
  }
  document.addEventListener('pointerdown', remember, true)
  document.addEventListener('focusin', remember, true)
}

function outsideOf(container: HTMLElement, element: Element | null, doc: Document): HTMLElement | null {
  return element instanceof HTMLElement && element !== doc.body && element.isConnected && !container.contains(element)
    ? element
    : null
}

function focusElement(element: HTMLElement): void {
  element.focus({ preventScroll: false })
}

export interface FocusTrapOptions {
  /** แผงที่กักโฟกัส — เรียกทุกครั้งที่กด Tab (เปลี่ยนแผงได้ เช่นกล่องยืนยันทิ้งข้อมูลที่ซ้อนในโมดัล) */
  getContainer: () => HTMLElement | null
  /** ชั้นนี้อยู่บนสุดไหม — ชั้นข้างหลังไม่กัก/ไม่แย่งโฟกัส */
  isTop: () => boolean
  /** `first` = ช่อง/ปุ่มแรก (ค่าเริ่มต้น) · `container` = โฟกัสแผงเสมอ (ลิ้นชักเมนู/ตัวดูรูป) */
  initialFocus?: 'first' | 'container'
}

/**
 * เริ่มกักโฟกัส — เรียกใน effect ตอนเปิด (หลัง `registerModal()`) แล้วเรียกฟังก์ชันที่คืนมาตอนปิด/unmount
 * ⇒ คืนโฟกัสให้ element ที่เปิด
 */
export function installFocusTrap({ getContainer, isTop, initialFocus = 'first' }: FocusTrapOptions): () => void {
  const container = getContainer()
  if (container === null) return () => {}
  const doc = container.ownerDocument
  const active = doc.activeElement
  // `autoFocus` ข้างในทำงานก่อน effect ⇒ ไม่แย่งโฟกัสจากช่องนั้น
  const focusAlreadyInside = active !== null && active !== container && container.contains(active)
  const opener = pickOpener({
    active: outsideOf(container, active, doc),
    lastInteracted: outsideOf(container, lastInteracted, doc),
  })

  // ชั้นที่ไม่ใช่บนสุด (แม่-ลูกเปิดใน commit เดียวกัน) ไม่ตั้งโฟกัสแรก — ไม่แย่งจากตัวบน
  if (!focusAlreadyInside && isTop()) {
    const explicit = container.querySelector<HTMLElement>('[data-autofocus]')
    if (explicit !== null) {
      focusElement(explicit)
    } else if (initialFocus === 'container') {
      focusElement(container)
    } else {
      const items = tabbableElements(container)
      const coarsePointer = doc.defaultView?.matchMedia?.('(pointer: coarse)').matches ?? false
      const index = chooseInitialFocus(
        items.map((element) => ({ skip: element.dataset.initialFocus === 'skip', kind: initialFocusKind(element) })),
        { coarsePointer },
      )
      focusElement(items[index] ?? container)
    }
  }

  /**
   * ตัวล่าสุดในแผงที่ได้โฟกัส · trap จอดโฟกัสที่แผงอยู่ไหม · ตัวที่ใช้ไม่ได้ตอนจอด (เป้าคืน) — SV5-D3-02
   */
  const initial = doc.activeElement
  let lastFocusedInside: HTMLElement | null =
    initial instanceof HTMLElement && initial !== container && container.contains(initial) ? initial : null
  let parked = false
  let parkedFrom: HTMLElement | null = null

  /** ใช้ได้แบบถูก ๆ (ไม่บังคับ layout — callback นี้ทำงานทุก commit ในแผง): อยู่ในแผง ไม่ disabled ไม่อยู่ใต้ inert/hidden */
  function isUsable(element: HTMLElement | null, current: HTMLElement): boolean {
    return (
      element !== null &&
      element !== current &&
      element.isConnected &&
      current.contains(element) &&
      !element.matches(':disabled') &&
      element.closest('[inert], [hidden]') === null
    )
  }

  /** ช่องที่ผิดหลังส่ง — `pending` = มีข้อความผิดแต่ช่องยัง disabled (fieldset ปลดใน commit ถัดไป) ⇒ รอ จอดต่อ */
  function errorControl(current: HTMLElement): HTMLElement | 'pending' | null {
    const message = current.querySelector<HTMLElement>('[data-field-error]')
    if (message === null) return null
    const control = fieldErrorControl(current, message)
    if (control === null) return null
    return isUsable(control, current) ? control : 'pending'
  }

  function restoreTarget(current: HTMLElement): HTMLElement | null {
    // ไม่มีปุ่มที่จอดมา (ผู้ใช้ blur เอง) ⇒ ไม่คืนอะไร — ไม่ดึงโฟกัสเข้าช่องพิมพ์เอง
    if (parkedFrom === null || !parkedFrom.isConnected) return null
    const error = errorControl(current)
    if (error === 'pending') return null
    return pickRestoreTarget({ errorControl: error, parkedFrom: isUsable(parkedFrom, current) ? parkedFrom : null })
  }

  function recoverFocus() {
    if (!isTop()) return
    const current = getContainer()
    if (current === null) return
    const now = doc.activeElement
    const isParked = parked && now === current
    // ทางลัด: โฟกัสอยู่ที่แผงโดยไม่ได้จอด (ผู้ใช้แตะพื้นที่ว่าง/initialFocus container) ⇒ ไม่มีอะไรต้องทำ
    if (now === current && !isParked) return
    const inside = now instanceof HTMLElement && now !== current && current.contains(now)
    const focusLost = now === null || now === doc.body || (inside && !isUsable(now, current))
    const target = isParked ? restoreTarget(current) : null
    const decision = decideFocusRecovery({ focusLost, parked: isParked, restoreTargetUsable: target !== null })
    if (decision === 'restore' && target !== null) {
      parked = false
      parkedFrom = null
      target.focus({ preventScroll: true })
    } else if (decision === 'park') {
      // เป้าคืน = ตัวที่ใช้ไม่ได้ตอนนี้ (ปุ่มที่ถูก disable) เท่านั้น — ตัวที่ยังใช้ได้ (ผู้ใช้ blur เอง) ไม่คืน
      const lostFrom = inside && now instanceof HTMLElement ? now : lastFocusedInside
      parkedFrom = lostFrom !== null && !isUsable(lostFrom, current) && lostFrom.isConnected ? lostFrom : null
      parked = true
      current.focus({ preventScroll: true })
    }
  }

  // ปุ่มที่โฟกัสอยู่ถูก disable (`<Button loading>`) / ถอดออก ⇒ browser ทิ้งโฟกัสไป body เงียบ ๆ (ไม่มี focusout ให้ฟัง)
  // ⇒ ดูการเปลี่ยน disabled/hidden/inert/ลูกในแผง แล้วจอดโฟกัสที่แผง · ปุ่มกลับมาใช้ได้ (error) ⇒ คืนให้ปุ่มนั้น
  const observer =
    typeof MutationObserver === 'undefined'
      ? null
      : new MutationObserver(() => {
          recoverFocus()
        })
  observer?.observe(container, {
    subtree: true,
    childList: true,
    attributes: true,
    attributeFilter: ['disabled', 'hidden', 'inert', 'aria-busy'],
  })

  function handleKey(event: KeyboardEvent) {
    if (event.key !== 'Tab' || event.defaultPrevented || event.altKey || event.ctrlKey || event.metaKey) return
    if (!isTop()) return
    const current = getContainer()
    if (current === null) return
    const items = tabbableElements(current)
    const target = decideTabTarget(items.length, focusPosition(current, items, doc.activeElement), event.shiftKey)
    if (target === null) return
    event.preventDefault()
    if (target === 'container') focusElement(current)
    else focusElement((target === 'first' ? items[0] : items[items.length - 1]) ?? current)
  }

  // โฟกัสหลุดออกนอกแผงทางอื่นที่ไม่ใช่ Tab ในหน้า (Tab ออกจาก iframe ตัวแสดง PDF — keydown ไม่ขึ้นมาถึง document ·
  // คลิกส่วนอื่นของหน้า) ⇒ ดึงกลับเข้าแผง
  function handleFocusIn(event: FocusEvent) {
    if (!isTop()) return
    const current = getContainer()
    const target = event.target
    if (current === null || !(target instanceof Node)) return
    if (current.contains(target)) {
      // จำตัวที่ได้โฟกัสล่าสุด (ไม่นับตัวแผงเอง) — ผู้ใช้/ผู้เรียกย้ายโฟกัสเอง ⇒ เลิกสถานะจอด
      if (target !== current && target instanceof HTMLElement) {
        lastFocusedInside = target
        parked = false
        parkedFrom = null
      }
      return
    }
    focusElement(tabbableElements(current)[0] ?? current)
  }

  doc.addEventListener('keydown', handleKey)
  doc.addEventListener('focusin', handleFocusIn)
  return () => {
    doc.removeEventListener('keydown', handleKey)
    doc.removeEventListener('focusin', handleFocusIn)
    observer?.disconnect()
    if (opener === null) return
    const now = doc.activeElement
    if (
      shouldRestoreFocus({
        openerConnected: opener.isConnected,
        activeIsBody: now === null || now === doc.body,
        activeInsideContainer: now !== null && container.contains(now),
      })
    ) {
      opener.focus({ preventScroll: true })
    }
  }
}
