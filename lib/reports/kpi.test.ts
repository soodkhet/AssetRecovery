import { describe, expect, it } from 'vitest'
import { momComparison, momLabel, momToneClass, ratioPct } from '@/lib/reports/kpi'

describe('momComparison (`96` §11)', () => {
  it('เพิ่มขึ้น/ลดลง/เท่าเดิม คิดเป็น % ทศนิยม 1 ตำแหน่ง', () => {
    expect(momComparison(150, 100)).toMatchObject({ changePct: 50, direction: 'up' })
    expect(momComparison(75, 100)).toMatchObject({ changePct: -25, direction: 'down' })
    expect(momComparison(100, 100)).toMatchObject({ changePct: 0, direction: 'flat' })
    expect(momComparison(103_33, 100_00).changePct).toBe(3.3)
  })

  it('งวดก่อนเป็น 0 ⇒ เทียบไม่ได้ (`null`) — ห้ามหารศูนย์ (Rule 01)', () => {
    expect(momComparison(500, 0)).toMatchObject({ changePct: null, direction: 'up' })
    expect(momComparison(0, 0)).toMatchObject({ changePct: null, direction: 'flat' })
    expect(momLabel(momComparison(500, 0))).toBe('N/A')
  })

  it('ฐานติดลบ (เช่นกำไรขั้นต้นติดลบ) — แย่ลงต้องได้ทิศทางลง', () => {
    // ขาดทุนมากขึ้นจาก -100 เป็น -150
    expect(momComparison(-150, -100)).toMatchObject({ changePct: -50, direction: 'down' })
    // ขาดทุนน้อยลง = ดีขึ้น
    expect(momComparison(-50, -100)).toMatchObject({ changePct: 50, direction: 'up' })
  })

  it('ป้ายบน badge มีลูกศรและค่าสัมบูรณ์', () => {
    expect(momLabel(momComparison(150, 100))).toBe('↑ 50.0%')
    expect(momLabel(momComparison(75, 100))).toBe('↓ 25.0%')
    expect(momLabel(momComparison(100, 100))).toBe('— 0.0%')
  })

  it('สีขึ้นกับ "มากขึ้นดีหรือไม่" ไม่ใช่ทิศทางอย่างเดียว', () => {
    const up = momComparison(150, 100)
    expect(momToneClass(up, true)).toContain('emerald')
    expect(momToneClass(up, false)).toContain('red')
    expect(momToneClass(momComparison(100, 100), true)).toContain('slate')
    expect(momToneClass(momComparison(1, 0), true)).toContain('slate')
  })
})

describe('ratioPct', () => {
  it('คิดเป็น % ทศนิยม 1 ตำแหน่ง · ตัวหาร 0 คืน null (ไม่ใช่ 0)', () => {
    expect(ratioPct(3, 4)).toBe(75)
    expect(ratioPct(1, 3)).toBe(33.3)
    expect(ratioPct(0, 5)).toBe(0)
    expect(ratioPct(5, 0)).toBeNull()
  })
})
