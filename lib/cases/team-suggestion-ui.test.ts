import { describe, expect, it } from 'vitest'
import { otherMatchedHeading, teamSelectionView } from '@/lib/cases/team-suggestion-ui'

describe('กล่องทีมที่เสนอ (staging E-026)', () => {
  const suggested = { id: 'a', name: 'TEAM_A กรุงเทพ' }
  it('ยังใช้ทีมที่ระบบเสนอ ⇒ ป้าย "ระบบเสนอ"', () => {
    expect(teamSelectionView({ province: 'กรุงเทพมหานคร', selectedId: 'a', suggested, matchedIds: new Set(['a']) })).toMatchObject({
      badgeLabel: 'ระบบเสนอ',
      suggestedNote: null,
      areaNote: 'ดูแลจังหวัดกรุงเทพมหานคร',
    })
  })
  it('เปลี่ยนเป็นทีมนอกพื้นที่ ⇒ ป้าย "เลือกเอง" + บอกนอกพื้นที่ + ระบบเสนออะไร', () => {
    const view = teamSelectionView({ province: 'กรุงเทพมหานคร', selectedId: 'b', suggested, matchedIds: new Set(['a']) })
    expect(view.badgeLabel).toBe('เลือกเอง')
    expect(view.areaNote).toContain('นอกพื้นที่')
    expect(view.suggestedNote).toBe('ระบบเสนอ: TEAM_A กรุงเทพ')
  })
  it('หัวข้อทีมอื่นในพื้นที่นับหลังตัดทีมที่เลือก · ไม่เหลือ ⇒ ไม่มีหัวข้อ', () => {
    expect(otherMatchedHeading(2)).toBe('ทีมอื่นที่ดูแลจังหวัดนี้ (2)')
    expect(otherMatchedHeading(0)).toBeNull()
  })
})
