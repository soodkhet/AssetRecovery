import { describe, expect, it } from 'vitest'
import { VALUE_AXIS_DOMAIN } from './report-bar-chart'

const [lower, upper] = VALUE_AXIS_DOMAIN

describe('VALUE_AXIS_DOMAIN — แกนค่ากราฟแท่งรวม 0 เสมอ (mytester2 J2-01)', () => {
  it('ทุกค่าติดลบ (ขาดทุนทุกเคส) ⇒ ขอบบนเป็น 0 แท่งติดลบจึงถูกวาดจากฐาน 0', () => {
    expect(lower(-10000)).toBe(-10000)
    expect(upper(-2582)).toBe(0)
  })

  it('ทุกค่าเป็นบวก ⇒ ขอบล่างเป็น 0', () => {
    expect(lower(500)).toBe(0)
    expect(upper(9000)).toBe(9000)
  })

  it('มีทั้งบวกและลบ ⇒ ใช้ค่าจริงทั้งสองฝั่ง', () => {
    expect(lower(-300)).toBe(-300)
    expect(upper(700)).toBe(700)
  })
})
