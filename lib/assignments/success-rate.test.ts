import { describe, expect, it } from 'vitest'
import { successRate, successRateOf, toDecisionSupport } from '@/lib/assignments/success-rate'
import { fmtRatioPct } from '@/lib/format/money'

describe('successRate (`40` §6.2 · มติ PO 03/10/2569 UAT Q20 — สำเร็จ ÷ ปิดแล้ว)', () => {
  it('ปิดสำเร็จ 7 จากที่ปิดแล้ว 10 เคส = 70%', () => {
    expect(successRate({ successCount: 7, closedCount: 10 })).toBe(70)
  })

  it('ปัดทศนิยม 2 ตำแหน่ง (BUG-156 — 66.67 ไม่ใช่ 66.70)', () => {
    expect(successRate({ successCount: 2, closedCount: 3 })).toBe(66.67)
    expect(successRate({ successCount: 6, closedCount: 7 })).toBe(85.71)
  })

  it('ยังไม่มีเคสปิด = null (ห้ามหารศูนย์) แล้วหน้าจอแสดง N/A — ไม่ใช่ 0.00% (BUG-060)', () => {
    expect(successRate({ successCount: 0, closedCount: 0 })).toBeNull()
    expect(fmtRatioPct(successRate({ successCount: 0, closedCount: 0 }))).toBe('N/A')
    expect(fmtRatioPct(successRateOf(0, 0))).toBe('N/A')
  })

  it('ปิดแล้วแต่ไม่สำเร็จเลย = 0% (มีตัวหารแล้ว ไม่ใช่ N/A)', () => {
    expect(successRateOf(0, 2)).toBe(0)
  })

  it('successRateOf = สำเร็จ ÷ (สำเร็จ + ไม่สำเร็จ)', () => {
    expect(successRateOf(1, 3)).toBe(25)
  })

  it('ตัวเลขเพี้ยน (สำเร็จมากกว่าที่ปิด) ต้องไม่เกิน 100%', () => {
    expect(successRate({ successCount: 12, closedCount: 10 })).toBe(100)
    expect(successRate({ successCount: -3, closedCount: 10 })).toBe(0)
  })

  it('toDecisionSupport ประกอบข้อมูล 3 ตัวของ §6.2 พร้อม calculation_source (§6.3)', () => {
    const support = toDecisionSupport({
      activeCaseCount: 4,
      successCount: 1,
      closedCount: 4,
      coveredProvinces: ['กรุงเทพมหานคร', 'นนทบุรี'],
    })
    expect(support.activeCaseCount).toBe(4)
    expect(support.successRate).toBe(25)
    expect(support.coveredProvinces).toEqual(['กรุงเทพมหานคร', 'นนทบุรี'])
    expect(support.successRateSource).toContain('40 §6.2')
  })

  it('เคสในมือแต่ยังไม่ปิดสักเคส = N/A (การ์ดมอบหมายงาน — R3)', () => {
    expect(
      toDecisionSupport({ activeCaseCount: 2, successCount: 0, closedCount: 0, coveredProvinces: [] }).successRate,
    ).toBeNull()
  })
})
