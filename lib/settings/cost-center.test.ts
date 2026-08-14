import { describe, expect, it } from 'vitest'
import { costCenterCodeSequence, formatCostCenterCode, nextCostCenterCode } from '@/lib/settings/cost-center'

/** `13` §6.6 — `code` เป็น running number อัตโนมัติ (`CC-001`) ผู้ใช้กรอกเองไม่ได้ */

describe('costCenterCodeSequence', () => {
  it('อ่านเลขลำดับจากรหัสรูปแบบมาตรฐาน', () => {
    expect(costCenterCodeSequence('CC-001')).toBe(1)
    expect(costCenterCodeSequence('CC-042')).toBe(42)
    expect(costCenterCodeSequence(' cc-007 ')).toBe(7)
  })

  it('รหัสนอกรูปแบบ = null (ไม่นับรวมตอนหาเลขถัดไป)', () => {
    expect(costCenterCodeSequence('CC001')).toBeNull()
    expect(costCenterCodeSequence('OPS-001')).toBeNull()
    expect(costCenterCodeSequence('CC-A01')).toBeNull()
    expect(costCenterCodeSequence('')).toBeNull()
  })
})

describe('formatCostCenterCode', () => {
  it('เติมศูนย์ให้ครบ 3 หลัก', () => {
    expect(formatCostCenterCode(1)).toBe('CC-001')
    expect(formatCostCenterCode(123)).toBe('CC-123')
  })

  it('เลขเกิน 3 หลักไม่ถูกตัด', () => {
    expect(formatCostCenterCode(1234)).toBe('CC-1234')
  })
})

describe('nextCostCenterCode', () => {
  it('ยังไม่มีศูนย์ต้นทุน = CC-001', () => {
    expect(nextCostCenterCode([])).toBe('CC-001')
  })

  it('นับต่อจากเลขสูงสุด ไม่ใช่จำนวนแถว', () => {
    expect(nextCostCenterCode(['CC-001', 'CC-005', 'CC-003'])).toBe('CC-006')
  })

  it('รหัสที่ถูก soft delete ยังกันเลขซ้ำได้ (caller ส่งมาทั้งหมดรวมที่ลบแล้ว)', () => {
    expect(nextCostCenterCode(['CC-001', 'CC-002', 'CC-003'])).toBe('CC-004')
  })

  it('ข้ามรหัสนอกรูปแบบ', () => {
    expect(nextCostCenterCode(['LEGACY-A', 'CC-002'])).toBe('CC-003')
  })
})
