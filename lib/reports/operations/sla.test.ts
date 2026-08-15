import { describe, expect, it } from 'vitest'
import { elapsedHours, hoursToDays, isWithinSla, slaOverdueDays } from '@/lib/reports/operations/sla'

/** TAT/SLA (`96` §13 O2 · §14) — calendar days รวมวันหยุด และ "ครบพอดียังไม่เกิน" */
describe('elapsedHours / hoursToDays', () => {
  it('นับเวลาจริงข้ามเดือนได้ถูก (31 ก.ค. → 2 ส.ค. = 2 วัน)', () => {
    const hours = elapsedHours(new Date('2026-07-31T03:00:00Z'), new Date('2026-08-02T03:00:00Z'))
    expect(hours).toBe(48)
    expect(hoursToDays(hours)).toBe(2)
  })

  it('นับรวมวันหยุด — เสาร์-อาทิตย์ไม่ถูกตัดออก', () => {
    // ศุกร์ 14 ส.ค. 2026 → จันทร์ 17 ส.ค. 2026
    const hours = elapsedHours(new Date('2026-08-14T02:00:00Z'), new Date('2026-08-17T02:00:00Z'))
    expect(hoursToDays(hours)).toBe(3)
  })

  it('ปัดวันเป็นทศนิยม 1 ตำแหน่ง', () => {
    expect(hoursToDays(36)).toBe(1.5)
    expect(hoursToDays(1)).toBe(0)
    expect(hoursToDays(100)).toBe(4.2)
  })
})

describe('isWithinSla', () => {
  it('ครบพอดี = ยังอยู่ในเกณฑ์', () => {
    expect(isWithinSla(72, 72)).toBe(true)
    expect(isWithinSla(71.9, 72)).toBe(true)
    expect(isWithinSla(72.1, 72)).toBe(false)
  })
})

describe('slaOverdueDays', () => {
  const created = new Date('2026-08-10T00:00:00Z')

  it('ยังไม่เกิน (รวมกรณีครบพอดี) คืน null — ไม่ใช่ 0 วัน', () => {
    expect(slaOverdueDays(created, new Date('2026-08-12T00:00:00Z'), 72)).toBeNull()
    expect(slaOverdueDays(created, new Date('2026-08-13T00:00:00Z'), 72)).toBeNull()
  })

  it('เกินแล้วคืนจำนวนวันที่เกินเกณฑ์ (ไม่ใช่อายุเคสทั้งหมด)', () => {
    expect(slaOverdueDays(created, new Date('2026-08-15T00:00:00Z'), 72)).toBe(2)
  })

  it('เกณฑ์ที่ตั้งไว้สั้นลง เคสเดิมเกินมากขึ้น (ค่ามาจากค่าตั้งองค์กร ไม่ hardcode)', () => {
    expect(slaOverdueDays(created, new Date('2026-08-15T00:00:00Z'), 24)).toBe(4)
  })
})
