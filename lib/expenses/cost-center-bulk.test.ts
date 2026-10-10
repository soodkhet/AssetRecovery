import { describe, expect, it } from 'vitest'
import { bulkMappableIds, effectiveBulkSelection, toggleAllBulkSelection } from '@/lib/expenses/cost-center-bulk'

const rows = [
  { id: 'a', mappingRule: 'manual' },
  { id: 'b', mappingRule: 'auto' },
  { id: 'c', mappingRule: 'manual' },
]

describe('เลือกหลายรายการ map ศูนย์ต้นทุน (staging E-065)', () => {
  it('เลือกได้เฉพาะรายการ manual', () => {
    expect(bulkMappableIds(rows)).toEqual(['a', 'c'])
    expect(effectiveBulkSelection(new Set(['a', 'b', 'x']), rows)).toEqual(['a'])
  })

  it('เลือกทั้งหมด ⇒ เลือกทุก manual · กดซ้ำ ⇒ ล้าง', () => {
    const all = toggleAllBulkSelection(new Set(), rows)
    expect([...all]).toEqual(['a', 'c'])
    expect([...toggleAllBulkSelection(all, rows)]).toEqual([])
  })
})
