import { describe, expect, it } from 'vitest'
import { successRate, toDecisionSupport } from '@/lib/assignments/success-rate'
import { fmtRatioPct } from '@/lib/format/money'

describe('successRate (`40` §6.2 · §20)', () => {
  it('ปิดสำเร็จ 7 จาก 10 เคสสะสม = 70%', () => {
    expect(successRate({ successCount: 7, assignedCount: 10 })).toBe(70)
  })

  it('ปัดทศนิยม 1 ตำแหน่ง', () => {
    expect(successRate({ successCount: 2, assignedCount: 3 })).toBe(66.7)
  })

  it('ยังไม่เคยได้รับมอบหมาย = null (ห้ามหารศูนย์ · Rule 01) แล้วหน้าจอแสดง N/A', () => {
    expect(successRate({ successCount: 0, assignedCount: 0 })).toBeNull()
    expect(fmtRatioPct(successRate({ successCount: 0, assignedCount: 0 }))).toBe('N/A')
  })

  it('ตัวเลขเพี้ยน (สำเร็จมากกว่าที่ได้รับมอบหมาย) ต้องไม่เกิน 100%', () => {
    expect(successRate({ successCount: 12, assignedCount: 10 })).toBe(100)
    expect(successRate({ successCount: -3, assignedCount: 10 })).toBe(0)
  })

  it('toDecisionSupport ประกอบข้อมูล 3 ตัวของ §6.2 พร้อม calculation_source (§6.3)', () => {
    const support = toDecisionSupport({
      activeCaseCount: 4,
      successCount: 1,
      assignedCount: 4,
      coveredProvinces: ['กรุงเทพมหานคร', 'นนทบุรี'],
    })
    expect(support.activeCaseCount).toBe(4)
    expect(support.successRate).toBe(25)
    expect(support.coveredProvinces).toEqual(['กรุงเทพมหานคร', 'นนทบุรี'])
    expect(support.successRateSource).toContain('40 §6.2')
  })
})
