import { describe, expect, it } from 'vitest'
import { wrapReference } from '@/lib/format/ref-wrap'

describe('wrapReference (mytester WH-01)', () => {
  it('สั้นกว่าหรือเท่ากับความกว้าง ⇒ คงเดิม', () => {
    expect(wrapReference('NDP/2569/03', 16)).toBe('NDP/2569/03')
  })

  it('เลขสัญญายาว ⇒ ขึ้นบรรทัดหลังตัวคั่น ทุกบรรทัด ≤ ความกว้าง และต่อกลับได้ค่าเดิม', () => {
    const ref = 'MTJ-HP-6810-MT1011-01'
    const wrapped = wrapReference(ref, 16)
    expect(wrapped).toBe('MTJ-HP-6810-\nMT1011-01')
    expect(wrapped.split('\n').every((line) => line.length <= 16)).toBe(true)
    expect(wrapped.replaceAll('\n', '')).toBe(ref)
  })

  it('ส่วนท้ายที่ใช้แยกเครื่อง (-01/-11) อยู่ครบในบรรทัดเดียว', () => {
    for (const suffix of ['01', '02', '06', '11']) {
      const lines = wrapReference(`MTJ-HP-6810-MT1011-${suffix}`, 16).split('\n')
      expect(lines.at(-1)).toBe(`MT1011-${suffix}`)
    }
  })

  it('ช่วงยาวที่ไม่มีตัวคั่น ⇒ ตัดตามจำนวนตัวอักษร ไม่ทำตัวอักษรหาย', () => {
    const ref = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123'
    const wrapped = wrapReference(ref, 12)
    expect(wrapped.split('\n').every((line) => line.length <= 12)).toBe(true)
    expect(wrapped.replaceAll('\n', '')).toBe(ref)
  })

  it('ความกว้างไม่ถูกต้อง ⇒ error', () => {
    expect(() => wrapReference('X', 0)).toThrow(RangeError)
  })
})
