import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createDeferredSave } from '@/lib/field/deferred-save'

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
