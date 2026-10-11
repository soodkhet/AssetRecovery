import { describe, expect, it } from 'vitest'
import { matchHotelStays, stayDateKeys } from '@/lib/field/hotel-matched-cases'

const stay = { id: 'exp-1', agentUserId: 'agent-a', checkInDate: '2026-10-11', nights: 2 }

describe('matchHotelStays (mytester DO-08)', () => {
  it('จับคู่เคสของพนักงานคนเดียวกันที่จัดวันอยู่ในช่วงวันพัก (วันเข้าพัก … + คืน − 1)', () => {
    const result = matchHotelStays(
      [stay],
      [
        { agentId: 'agent-a', scheduledDate: '2026-10-12', caseId: 'c4', caseRef: 'NDP/2569/MT1011-04' },
        { agentId: 'agent-a', scheduledDate: '2026-10-11', caseId: 'c3', caseRef: 'NDP/2569/MT1011-03' },
        // วันเช็คเอาต์ (คืนที่ 3) ไม่นับ
        { agentId: 'agent-a', scheduledDate: '2026-10-13', caseId: 'c5', caseRef: 'NDP/2569/MT1011-05' },
        // คนอื่นวันเดียวกัน ไม่นับ
        { agentId: 'agent-b', scheduledDate: '2026-10-11', caseId: 'c9', caseRef: 'X-9' },
      ],
    )
    expect(result.get('exp-1')).toEqual([
      { caseId: 'c3', caseRef: 'NDP/2569/MT1011-03', scheduledDate: '2026-10-11' },
      { caseId: 'c4', caseRef: 'NDP/2569/MT1011-04', scheduledDate: '2026-10-12' },
    ])
  })

  it('เคสเดียวกันจัดซ้ำหลายวันในช่วงพัก ⇒ แสดงครั้งเดียว · ไม่มีเคส ⇒ รายการว่าง', () => {
    const result = matchHotelStays(
      [stay, { ...stay, id: 'exp-2', checkInDate: '2026-11-01', nights: 1 }],
      [
        { agentId: 'agent-a', scheduledDate: '2026-10-11', caseId: 'c3', caseRef: 'R-3' },
        { agentId: 'agent-a', scheduledDate: '2026-10-12', caseId: 'c3', caseRef: 'R-3' },
      ],
    )
    expect(result.get('exp-1')).toEqual([{ caseId: 'c3', caseRef: 'R-3', scheduledDate: '2026-10-11' }])
    expect(result.get('exp-2')).toEqual([])
  })

  it('จำนวนคืนผิดรูปจากข้อมูลเก่า ⇒ ถือเป็น 1 คืน ไม่ throw', () => {
    expect(stayDateKeys({ ...stay, nights: 0 })).toEqual(['2026-10-11'])
  })
})
