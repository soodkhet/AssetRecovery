import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * SV5-D2-01 — ตัวดูรูปพอร์ทัลซ้อนในลิ้นชักเคส: Back ปิดชั้นบนทีละชั้น (รูป → ลิ้นชัก → ออกหน้า) ไม่มี history ค้าง
 * จำลอง window.history (node env) แล้วใช้ `guardModalHistory` + `modal-stack` ตัวจริงแบบเดียวกับ
 * `PortalCaseDetailDrawer` / `PhotoLightbox` (onBack = ชั้นบนสุดปิด · ชั้นข้างล่าง stay)
 */

interface Entry {
  state: unknown
  url: string
}

type PopListener = (event: { stopImmediatePropagation: () => void }) => void

function createFakeWindow(startUrl: string) {
  const entries: Entry[] = [{ state: null, url: startUrl }]
  let index = 0
  const listeners: PopListener[] = []
  /** จำนวน popstate ที่หลุดถึง router ของ Next (ไม่ถูกกลืน) */
  let routerEvents = 0
  const current = () => entries[index] as Entry

  function dispatch() {
    let stopped = false
    const event = { stopImmediatePropagation: () => (stopped = true) }
    for (const listener of [...listeners]) {
      if (stopped) break
      listener(event)
    }
    if (!stopped) routerEvents += 1
  }

  const history = {
    get length() {
      return entries.length
    },
    get state() {
      return current().state
    },
    pushState(state: unknown, _title: string, url?: string) {
      entries.splice(index + 1)
      entries.push({ state, url: url ?? current().url })
      index += 1
    },
    replaceState(state: unknown, _title: string, url?: string) {
      entries[index] = { state, url: url ?? current().url }
    },
    back() {
      setTimeout(() => {
        if (index === 0) return
        index -= 1
        dispatch()
      }, 0)
    },
    forward() {
      setTimeout(() => {
        if (index >= entries.length - 1) return
        index += 1
        dispatch()
      }, 0)
    },
  }
  const location = {
    get pathname() {
      return new URL(current().url, 'https://x.test').pathname
    },
    get search() {
      return new URL(current().url, 'https://x.test').search
    },
    get hash() {
      return ''
    },
  }
  const win = {
    history,
    location,
    addEventListener: (type: string, listener: PopListener) => {
      if (type === 'popstate') listeners.push(listener)
    },
  }
  return {
    win,
    index: () => index,
    length: () => entries.length,
    routerEvents: () => routerEvents,
  }
}

async function settle() {
  for (let i = 0; i < 6; i += 1) await new Promise((resolve) => setTimeout(resolve, 0))
}

async function loadModules() {
  vi.resetModules()
  const history = await import('@/components/ui/modal-history')
  const stack = await import('@/components/ui/modal-stack')
  return { ...history, ...stack }
}

/** ชั้นทับหน้าแบบเดียวกับใน component: ลงชั้น + sentinel · onBack ปิดเฉพาะเมื่อเป็นชั้นบนสุด */
function openLayer(mod: Awaited<ReturnType<typeof loadModules>>, name: string, closed: string[]) {
  const token = mod.registerModal({ toastPlacement: 'bottom' })
  let open = true
  const unmount = () => {
    if (!open) return
    open = false
    mod.unregisterModal(token)
    release()
  }
  const release = mod.guardModalHistory({
    onBack: () => (mod.isTopModal(token) ? 'close' : 'stay'),
    onClose: () => {
      closed.push(name)
      unmount()
    },
  })
  return {
    /** ปิดด้วยปุ่ม X / Esc */
    closeByButton: () => {
      closed.push(name)
      unmount()
    },
  }
}

describe('ตัวดูรูปซ้อนในลิ้นชัก — Back ปิดทีละชั้น (SV5-D2-01)', () => {
  let fake: ReturnType<typeof createFakeWindow>

  beforeEach(() => {
    fake = createFakeWindow('/portal/cases?case=abc')
    vi.stubGlobal('window', fake.win)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('อาการเดิม: ตัวดูรูปไม่วาง sentinel ⇒ Back ถูกลิ้นชักกลืน (stay) ไม่ปิดอะไรเลย', async () => {
    const mod = await loadModules()
    const closed: string[] = []
    openLayer(mod, 'drawer', closed)
    await settle()
    mod.registerModal() // ตัวดูรูปแบบเดิม — ลงชั้นอย่างเดียว
    await settle()
    fake.win.history.back()
    await settle()
    expect(closed).toEqual([])
  })

  it('Back ครั้งแรกปิดรูป (ลิ้นชักยังอยู่) · ครั้งที่สองปิดลิ้นชัก · อยู่หน้าเดิมไม่มี entry ค้างข้างหน้าที่ต้องกดผ่าน', async () => {
    const mod = await loadModules()
    const closed: string[] = []
    openLayer(mod, 'drawer', closed)
    await settle()
    openLayer(mod, 'lightbox', closed)
    await settle()
    expect(fake.index()).toBe(2)

    fake.win.history.back()
    await settle()
    expect(closed).toEqual(['lightbox'])
    expect(mod.hasOpenModal()).toBe(true)
    expect(fake.index()).toBe(1)

    fake.win.history.back()
    await settle()
    expect(closed).toEqual(['lightbox', 'drawer'])
    expect(mod.hasOpenModal()).toBe(false)
    expect(fake.index()).toBe(0)
  })

  it('ปิดรูปด้วยปุ่ม X ⇒ ถอย sentinel ของรูปเอง (router ไม่เห็น) · Back ครั้งถัดไปปิดลิ้นชักทันที', async () => {
    const mod = await loadModules()
    const closed: string[] = []
    openLayer(mod, 'drawer', closed)
    await settle()
    const lightbox = openLayer(mod, 'lightbox', closed)
    await settle()

    lightbox.closeByButton()
    await settle()
    expect(fake.index()).toBe(1)
    expect(fake.routerEvents()).toBe(0)

    fake.win.history.back()
    await settle()
    expect(closed).toEqual(['lightbox', 'drawer'])
    expect(fake.index()).toBe(0)
  })

  it('เปิดรูปซ้ำหลายครั้ง (ปิดด้วย X) ⇒ ไม่สะสม history · Back ปิดลิ้นชักครั้งเดียว', async () => {
    const mod = await loadModules()
    const closed: string[] = []
    openLayer(mod, 'drawer', closed)
    await settle()
    for (let i = 0; i < 3; i += 1) {
      const lightbox = openLayer(mod, `lightbox-${i}`, closed)
      await settle()
      lightbox.closeByButton()
      await settle()
    }
    expect(fake.index()).toBe(1)

    fake.win.history.back()
    await settle()
    expect(closed.at(-1)).toBe('drawer')
    expect(fake.index()).toBe(0)
    expect(mod.hasOpenModal()).toBe(false)
  })
})
