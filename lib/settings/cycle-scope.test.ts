import { describe, expect, it } from 'vitest'
import {
  cycleCoversCompany,
  cycleCoversSide,
  cycleScopesOverlap,
  describeCycleScope,
  findOverlappingCycle,
  isScopeKindValidForType,
  normalizeCycleValues,
  pickMatchingCycle,
  type CycleScopeValues,
} from '@/lib/settings/cycles'
import { cycleCreateSchema } from '@/lib/settings/schemas'

/** มติ PO U133 — ขอบเขตรอบบิล/รอบจ่ายเป็นค่าจริง · ห้ามซ้อน · เลือกรอบที่ตรงให้อัตโนมัติ */

const C1 = '00000000-0000-4000-8000-0000000000c1'
const C2 = '00000000-0000-4000-8000-0000000000c2'

const ar = (scopeKind: 'all_companies' | 'selected_companies', companyIds: string[] = []): CycleScopeValues => ({
  type: 'AR',
  scopeKind,
  companyIds,
})
const ap = (scopeKind: 'all_teams' | 'inhouse' | 'outsource'): CycleScopeValues => ({ type: 'AP', scopeKind, companyIds: [] })

describe('isScopeKindValidForType', () => {
  it('AR ใช้กับบริษัท · AP ใช้กับฝั่งทีม', () => {
    expect(isScopeKindValidForType('AR', 'all_companies')).toBe(true)
    expect(isScopeKindValidForType('AR', 'inhouse')).toBe(false)
    expect(isScopeKindValidForType('AP', 'outsource')).toBe(true)
    expect(isScopeKindValidForType('AP', 'selected_companies')).toBe(false)
  })
})

describe('cycleScopesOverlap', () => {
  it('ทุกบริษัทซ้อนกับรอบบิลทุกรอบ', () => {
    expect(cycleScopesOverlap(ar('all_companies'), ar('selected_companies', [C1]))).toBe(true)
    expect(cycleScopesOverlap(ar('all_companies'), ar('all_companies'))).toBe(true)
  })
  it('รายบริษัทซ้อนเมื่อมีบริษัทร่วมเท่านั้น', () => {
    expect(cycleScopesOverlap(ar('selected_companies', [C1]), ar('selected_companies', [C2]))).toBe(false)
    expect(cycleScopesOverlap(ar('selected_companies', [C1, C2]), ar('selected_companies', [C2]))).toBe(true)
  })
  it('รอบจ่าย: ทุกทีมซ้อนทุกรอบ · In-house กับ Outsource ไม่ซ้อน · ฝั่งเดียวกันซ้อน', () => {
    expect(cycleScopesOverlap(ap('all_teams'), ap('inhouse'))).toBe(true)
    expect(cycleScopesOverlap(ap('inhouse'), ap('outsource'))).toBe(false)
    expect(cycleScopesOverlap(ap('outsource'), ap('outsource'))).toBe(true)
  })
  it('ต่างชนิดไม่ซ้อนกันเลย', () => {
    expect(cycleScopesOverlap(ar('all_companies'), ap('all_teams'))).toBe(false)
  })
})

describe('findOverlappingCycle', () => {
  it('ไม่นับตัวเอง (ตอนแก้รอบเดิม)', () => {
    const others = [{ id: 'x', ...ar('all_companies') }]
    expect(findOverlappingCycle({ id: 'x', ...ar('all_companies') }, others)).toBeNull()
    expect(findOverlappingCycle(ar('selected_companies', [C1]), others)?.id).toBe('x')
  })
})

describe('cycleCoversCompany / cycleCoversSide / pickMatchingCycle', () => {
  it('ครอบบริษัท/ฝั่งตามขอบเขต', () => {
    expect(cycleCoversCompany(ar('all_companies'), C1)).toBe(true)
    expect(cycleCoversCompany(ar('selected_companies', [C2]), C1)).toBe(false)
    expect(cycleCoversCompany(ap('all_teams'), C1)).toBe(false)
    expect(cycleCoversSide(ap('all_teams'), 'inhouse')).toBe(true)
    expect(cycleCoversSide(ap('outsource'), 'inhouse')).toBe(false)
  })
  it('รอบที่ระบุเจาะจงชนะรอบ "ทั้งหมด" · ไม่มีรอบตรง = null', () => {
    const cycles = [
      { id: 'all', ...ar('all_companies') },
      { id: 'c1', ...ar('selected_companies', [C1]) },
    ]
    expect(pickMatchingCycle(cycles, { companyId: C1 })?.id).toBe('c1')
    expect(pickMatchingCycle(cycles, { companyId: C2 })?.id).toBe('all')
    expect(pickMatchingCycle([{ id: 'in', ...ap('inhouse') }], { side: 'outsource' })).toBeNull()
  })
})

describe('normalizeCycleValues + schema', () => {
  const base = {
    name: 'รอบบิล',
    type: 'AR' as const,
    cutoffRuleType: 'month_end' as const,
    cutoffDates: [],
    cutoffText: null,
    dueRuleType: 'net_days' as const,
    dueRuleValue: 30,
  }
  it('ล้างรายชื่อบริษัทเมื่อไม่ใช่รายบริษัท', () => {
    expect(normalizeCycleValues({ ...base, scopeKind: 'all_companies', companyIds: [C1] }).companyIds).toEqual([])
  })
  it('schema ปฏิเสธขอบเขตไม่เข้าคู่ชนิด และรายบริษัทที่ไม่เลือกบริษัท', () => {
    const wrongKind = cycleCreateSchema.safeParse({ ...base, scopeKind: 'inhouse', reason: 'ทดสอบเหตุผล' })
    expect(wrongKind.success).toBe(false)
    const empty = cycleCreateSchema.safeParse({ ...base, scopeKind: 'selected_companies', reason: 'ทดสอบเหตุผล' })
    expect(empty.success).toBe(false)
    const ok = cycleCreateSchema.safeParse({ ...base, scopeKind: 'selected_companies', companyIds: [C1], reason: 'ทดสอบเหตุผล' })
    expect(ok.success).toBe(true)
  })
  it('ข้อความ "ใช้กับ" แสดงชื่อบริษัทเมื่อเลือกรายบริษัท', () => {
    expect(describeCycleScope('selected_companies', ['A', 'B'])).toBe('A, B')
    expect(describeCycleScope('outsource', [])).toBe('ทีม Outsource')
  })
})
