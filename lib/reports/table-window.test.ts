import { describe, expect, it } from 'vitest'
import {
  VIRTUAL_ROW_HEIGHT,
  VIRTUAL_SCROLL_THRESHOLD,
  shouldVirtualize,
  visibleRowWindow,
} from '@/lib/reports/table-window'

describe('virtual scroll ของตารางรายงาน (`96` §11)', () => {
  it('เปิดใช้เมื่อเกิน 100 แถวเท่านั้น', () => {
    expect(VIRTUAL_SCROLL_THRESHOLD).toBe(100)
    expect(shouldVirtualize(100)).toBe(false)
    expect(shouldVirtualize(101)).toBe(true)
  })

  it('อยู่บนสุด: เรนเดอร์ตั้งแต่แถวแรก + เผื่อกันชนท้าย', () => {
    const window = visibleRowWindow({ rowCount: 1000, scrollTop: 0 })
    expect(window.start).toBe(0)
    expect(window.end).toBeGreaterThan(Math.ceil(560 / VIRTUAL_ROW_HEIGHT))
    expect(window.end).toBeLessThan(1000)
  })

  it('เลื่อนกลางตาราง: หน้าต่างครอบแถวที่มองเห็นจริง', () => {
    const scrollTop = 100 * VIRTUAL_ROW_HEIGHT
    const window = visibleRowWindow({ rowCount: 1000, scrollTop })
    expect(window.start).toBeLessThanOrEqual(100)
    expect(window.end).toBeGreaterThanOrEqual(100 + Math.ceil(560 / VIRTUAL_ROW_HEIGHT))
  })

  it('เลื่อนสุดล่าง: ไม่ล้นจำนวนแถว และยังเรนเดอร์แถวสุดท้าย', () => {
    const rowCount = 250
    const window = visibleRowWindow({ rowCount, scrollTop: rowCount * VIRTUAL_ROW_HEIGHT })
    expect(window.end).toBe(rowCount)
    expect(window.start).toBeLessThan(rowCount)
  })

  it('ค่าประหลาด (scroll ติดลบ / ไม่มีแถว) ไม่ทำให้ช่วงพัง', () => {
    expect(visibleRowWindow({ rowCount: 500, scrollTop: -200 }).start).toBe(0)
    expect(visibleRowWindow({ rowCount: 0, scrollTop: 0 })).toEqual({ start: 0, end: 0 })
  })

  it('จำนวนแถวที่เรนเดอร์คงที่ไม่ว่าตารางจะใหญ่แค่ไหน (ประสิทธิภาพ)', () => {
    const small = visibleRowWindow({ rowCount: 500, scrollTop: 5_000 })
    const huge = visibleRowWindow({ rowCount: 200_000, scrollTop: 5_000 })
    expect(huge.end - huge.start).toBe(small.end - small.start)
    expect(huge.end - huge.start).toBeLessThan(40)
  })
})
