import { describe, expect, it } from 'vitest'
import { caseListEmptyView, EMPTY_CASE_LIST_FILTERS } from '@/components/cases/case-list-params'

describe('ข้อความรายการเคสว่าง (mytester B-08)', () => {
  it('ไม่มีตัวกรอง = ยังไม่มีเคส ชวนเริ่มรับเคส ไม่ใช่ "ลองล้างตัวกรอง"', () => {
    const view = caseListEmptyView(EMPTY_CASE_LIST_FILTERS)
    expect(view.title).toBe('ยังไม่มีเคส')
    expect(view.description).not.toContain('ล้างตัวกรอง')
  })
  it('คำค้นที่มีแต่ช่องว่างนับเป็นไม่มีตัวกรอง', () => {
    expect(caseListEmptyView({ ...EMPTY_CASE_LIST_FILTERS, search: '   ' }).title).toBe('ยังไม่มีเคส')
  })
  it('มีตัวกรอง = ไม่พบตามเงื่อนไข', () => {
    expect(caseListEmptyView({ ...EMPTY_CASE_LIST_FILTERS, status: 'draft' }).title).toBe('ไม่พบเคสตามเงื่อนไขที่ค้นหา')
    expect(caseListEmptyView({ ...EMPTY_CASE_LIST_FILTERS, search: 'ABC' }).description).toContain('ล้างตัวกรอง')
  })
})
