import { describe, expect, it } from 'vitest'
import { isCurrentAssignee } from '@/lib/field/queries'

/** preship R4-007 — สิทธิ์ดาวน์โหลดไฟล์เคสฝั่งภาคสนาม = ผู้ถือ assignment ล่าสุดของรอบปัจจุบันเท่านั้น */
describe('isCurrentAssignee', () => {
  const row = (overrides: Partial<{ agentId: string; status: string; trackingRound: number }> = {}) => ({
    agentId: 'me',
    status: 'accepted',
    trackingRound: 1,
    case: { trackingRound: 1 },
    ...overrides,
  })

  it('ผู้ถืองานรอบปัจจุบัน ⇒ ผ่าน (รวมปิดงานแล้ว)', () => {
    expect(isCurrentAssignee(row(), 'me')).toBe(true)
    expect(isCurrentAssignee(row({ status: 'closed_success' }), 'me')).toBe(true)
  })

  it('เพื่อนร่วมทีม / ถูกย้ายงานออก / รอบเก่า / ไม่มี assignment ⇒ ไม่ผ่าน', () => {
    expect(isCurrentAssignee(row({ agentId: 'teammate' }), 'me')).toBe(false)
    expect(isCurrentAssignee(row({ status: 'reassigned_away' }), 'me')).toBe(false)
    expect(isCurrentAssignee(row({ trackingRound: 0 }), 'me')).toBe(false)
    expect(isCurrentAssignee(null, 'me')).toBe(false)
  })
})
