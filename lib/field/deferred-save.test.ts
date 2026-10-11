import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createDeferredSave, flushOnPageHide } from '@/lib/field/deferred-save'

/** mytester2 DO2-01 — autosave ฟอร์มปิดงานต้องไม่ยิงหลังกดยืนยันปิดงาน */
describe('createDeferredSave', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it('ทำงานหลังหน่วงเวลา และทำเฉพาะงานล่าสุด', () => {
    const saver = createDeferredSave(500)
    const first = vi.fn()
    const second = vi.fn()
    saver.schedule(first)
    vi.advanceTimersByTime(300)
    saver.schedule(second)
    vi.advanceTimersByTime(499)
    expect(second).not.toHaveBeenCalled()
    vi.advanceTimersByTime(1)
    expect(first).not.toHaveBeenCalled()
    expect(second).toHaveBeenCalledTimes(1)
    expect(saver.hasPending()).toBe(false)
  })

  it('blur แล้วกดยืนยันปิดงานภายใน 0.3 วิ ⇒ cancel แล้วไม่มีคำขอ draft ตามมา', () => {
    const saver = createDeferredSave(500)
    const draft = vi.fn()
    saver.schedule(draft)
    vi.advanceTimersByTime(300)
    saver.cancel()
    vi.advanceTimersByTime(10_000)
    expect(draft).not.toHaveBeenCalled()
    expect(saver.hasPending()).toBe(false)
  })

  it('flush ทำงานที่ค้างทันทีครั้งเดียว (ปิดหน้าต่างก่อนครบเวลา ข้อความไม่หาย)', () => {
    const saver = createDeferredSave(500)
    const draft = vi.fn()
    saver.schedule(draft)
    saver.flush()
    vi.advanceTimersByTime(1_000)
    expect(draft).toHaveBeenCalledTimes(1)
    saver.flush()
    expect(draft).toHaveBeenCalledTimes(1)
  })
})

/** รีวิว DO2-01 — สลับแอป/ปิดแท็บระหว่างหน่วง autosave ⇒ บันทึกทันที (ไม่รอ unmount ที่อาจไม่เกิด) */
describe('flushOnPageHide', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  function targets(): { win: EventTarget; doc: EventTarget & { visibilityState: DocumentVisibilityState } } {
    const doc = Object.assign(new EventTarget(), { visibilityState: 'visible' as DocumentVisibilityState })
    return { win: new EventTarget(), doc }
  }

  it('pagehide ⇒ ทำงานที่ค้างทันที', () => {
    const saver = createDeferredSave(500)
    const task = vi.fn()
    const { win, doc } = targets()
    flushOnPageHide(saver, win, doc)
    saver.schedule(task)
    win.dispatchEvent(new Event('pagehide'))
    expect(task).toHaveBeenCalledTimes(1)
    vi.advanceTimersByTime(1_000)
    expect(task).toHaveBeenCalledTimes(1)
  })

  it('visibilitychange: hidden ⇒ บันทึก · visible ⇒ ยังหน่วงตามปกติ', () => {
    const saver = createDeferredSave(500)
    const task = vi.fn()
    const { win, doc } = targets()
    flushOnPageHide(saver, win, doc)
    saver.schedule(task)
    doc.dispatchEvent(new Event('visibilitychange'))
    expect(task).not.toHaveBeenCalled()
    doc.visibilityState = 'hidden'
    doc.dispatchEvent(new Event('visibilitychange'))
    expect(task).toHaveBeenCalledTimes(1)
  })

  it('ส่งปิดงานแล้ว (shouldFlush = false) ⇒ ทิ้งงานค้าง ไม่ยิง draft ตามหลัง', () => {
    const saver = createDeferredSave(500)
    const task = vi.fn()
    const { win, doc } = targets()
    flushOnPageHide(saver, win, doc, () => false)
    saver.schedule(task)
    win.dispatchEvent(new Event('pagehide'))
    vi.advanceTimersByTime(1_000)
    expect(task).not.toHaveBeenCalled()
  })

  it('ถอด listener แล้ว ⇒ pagehide ไม่ทำอะไร', () => {
    const saver = createDeferredSave(500)
    const task = vi.fn()
    const { win, doc } = targets()
    const remove = flushOnPageHide(saver, win, doc)
    remove()
    saver.schedule(task)
    win.dispatchEvent(new Event('pagehide'))
    expect(task).not.toHaveBeenCalled()
  })
})
