import { describe, expect, it } from 'vitest'
import { ModuleError } from '@/lib/api/errors'
import { assertReorderCoversDay, nextScheduleOrder, recomputeScheduleOrder } from '@/lib/field/schedule'

function codeOf(fn: () => void): string {
  try {
    fn()
    return 'NO_ERROR'
  } catch (error) {
    return error instanceof ModuleError ? error.code : 'UNKNOWN'
  }
}

describe('ลำดับงานในวัน (`41` §8 · §20)', () => {
  it('วันว่าง → ลำดับ 1', () => {
    expect(nextScheduleOrder([])).toBe(1)
  })

  it('วันที่มีเคสอยู่ 2 รายการ → ลำดับ 3 (ต่อท้ายเสมอ)', () => {
    expect(nextScheduleOrder([1, 2])).toBe(3)
  })

  it('ลำดับไม่ต่อเนื่อง (ลบ/ย้ายเคสไปวันอื่น) → ต่อจากเลขสูงสุด', () => {
    expect(nextScheduleOrder([1, 5])).toBe(6)
  })

  it('แถวเก่าที่ยังไม่มีลำดับ (null) ก็ยังไม่ชนกัน', () => {
    expect(nextScheduleOrder([null, null])).toBe(3)
    expect(nextScheduleOrder([1, null])).toBe(3)
  })
})

describe('ลากสลับลำดับ = recompute ทั้งวัน (`41` §8 `reorder_schedule`)', () => {
  const current = new Map([
    ['a', 1],
    ['b', 2],
    ['c', 3],
  ])

  it('§20 ลากเคสลำดับ 3 มาไว้ที่ 1 → ที่เหลือเลื่อนลงทั้งหมด', () => {
    expect(recomputeScheduleOrder(['c', 'a', 'b'], current)).toEqual([
      { assignmentId: 'c', scheduleOrder: 1 },
      { assignmentId: 'a', scheduleOrder: 2 },
      { assignmentId: 'b', scheduleOrder: 3 },
    ])
  })

  it('ลำดับเหมือนเดิม = ไม่ต้องเขียน DB เลย', () => {
    expect(recomputeScheduleOrder(['a', 'b', 'c'], current)).toEqual([])
  })

  it('แถวที่ยังไม่มีลำดับถูกเติมให้ด้วย', () => {
    expect(recomputeScheduleOrder(['a', 'b'], new Map([['a', 1] as const, ['b', null] as const]))).toEqual([
      { assignmentId: 'b', scheduleOrder: 2 },
    ])
  })
})

describe('รายการที่ลากมาต้องครอบคลุมทั้งวันพอดี', () => {
  it('ครบเท่ากันผ่าน', () => {
    expect(codeOf(() => assertReorderCoversDay(['a', 'b'], ['b', 'a']))).toBe('NO_ERROR')
  })

  it('ขาดเคสของวันนั้น / มีเคสแปลกปลอม / ส่งซ้ำ = REQUIRED_MISSING', () => {
    expect(codeOf(() => assertReorderCoversDay(['a', 'b'], ['a']))).toBe('REQUIRED_MISSING')
    expect(codeOf(() => assertReorderCoversDay(['a', 'b'], ['a', 'b', 'x']))).toBe('REQUIRED_MISSING')
    expect(codeOf(() => assertReorderCoversDay(['a', 'b'], ['a', 'a']))).toBe('REQUIRED_MISSING')
  })
})
