import { describe, expect, it } from 'vitest'
import { userAffiliationText } from '@/lib/users/affiliation'

const base = { teamName: null, supervisedTeamNames: [], managedTeamNames: [], companyName: null }

describe('userAffiliationText — คอลัมน์สังกัดหน้าผู้ใช้งาน (mytester6 T-006)', () => {
  it('พนักงาน = ทีมที่สังกัด', () => {
    expect(userAffiliationText({ ...base, teamName: 'ทีม Inhouse กทม.' })).toBe('ทีม Inhouse กทม.')
  })

  it('หัวหน้าทีม (ไม่มี team_id) = ทีมที่เป็นหัวหน้า', () => {
    expect(userAffiliationText({ ...base, supervisedTeamNames: ['ทีม Inhouse กทม.'] })).toBe('หัวหน้าทีม ทีม Inhouse กทม.')
  })

  it('ผู้จัดการ = ทุกทีมที่ดูแล', () => {
    expect(userAffiliationText({ ...base, managedTeamNames: ['ทีม A', 'ทีม B'] })).toBe('ดูแล ทีม A, ทีม B')
  })

  it('ผู้ใช้บริษัทไฟแนนซ์ = ชื่อบริษัท · ไม่มีสังกัด = —', () => {
    expect(userAffiliationText({ ...base, companyName: 'บริษัท ก' })).toBe('บริษัท ก')
    expect(userAffiliationText(base)).toBe('—')
  })
})
