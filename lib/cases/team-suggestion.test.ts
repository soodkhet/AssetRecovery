import { describe, expect, it } from 'vitest'
import { CaseError } from '@/lib/cases/errors'
import {
  assertTeamSuggestion,
  matchTeamsByProvince,
  normalizeProvince,
  suggestTeam,
  type TeamCoverage,
} from '@/lib/cases/team-suggestion'

/** `38` §20: "Team suggestion ตรงจังหวัด" / "ไม่มีทีมตรงจังหวัด → CASE_NO_TEAM_MATCH" */

const TEAMS: TeamCoverage[] = [
  { id: 'team-north', name: 'ทีมเหนือ', provinces: ['เชียงใหม่', 'ลำพูน'], status: 'active' },
  { id: 'team-central', name: 'ทีมกลาง', provinces: ['กรุงเทพมหานคร', 'นนทบุรี'], status: 'active' },
  { id: 'team-old', name: 'ทีมเก่า', provinces: ['เชียงใหม่'], status: 'inactive' },
]

describe('จับคู่ทีมจากจังหวัดที่อยู่ปัจจุบัน', () => {
  it('เสนอทีมที่ดูแลจังหวัดนั้น', () => {
    const result = suggestTeam('เชียงใหม่', TEAMS)
    expect(result.suggestedTeamId).toBe('team-north')
    expect(result.suggestedTeamName).toBe('ทีมเหนือ')
    expect(result.noMatch).toBe(false)
    expect(result.matchedTeams).toHaveLength(1)
  })

  it('ข้ามทีมที่ไม่ active (`09` §7)', () => {
    expect(matchTeamsByProvince('เชียงใหม่', TEAMS).map((team) => team.id)).toEqual(['team-north'])
  })

  it('ไม่มีทีมตรงจังหวัด → noMatch (ไม่โยน error เพื่อให้หน้าจอแสดงสถานะได้)', () => {
    const result = suggestTeam('ภูเก็ต', TEAMS)
    expect(result.noMatch).toBe(true)
    expect(result.suggestedTeamId).toBeNull()
    expect(result.matchedTeams).toEqual([])
  })

  it('จุดที่ต้อง block ใช้ assertTeamSuggestion → CASE_NO_TEAM_MATCH', () => {
    try {
      assertTeamSuggestion(suggestTeam('ภูเก็ต', TEAMS))
      throw new Error('ควรโยน error')
    } catch (error) {
      expect(error).toBeInstanceOf(CaseError)
      expect((error as CaseError).code).toBe('CASE_NO_TEAM_MATCH')
    }
  })

  it('เคสที่ยังไม่กรอกจังหวัด = ไม่มีทีมเสนอ (ไม่ match ทุกทีม)', () => {
    expect(suggestTeam(null, TEAMS).noMatch).toBe(true)
    expect(suggestTeam('   ', TEAMS).matchedTeams).toEqual([])
  })

  it('รองรับข้อมูลที่เขียนว่า "จังหวัดเชียงใหม่" และช่องว่างหัวท้าย', () => {
    expect(normalizeProvince(' จังหวัดเชียงใหม่ ')).toBe('เชียงใหม่')
    expect(suggestTeam(' จังหวัดเชียงใหม่ ', TEAMS).suggestedTeamId).toBe('team-north')
  })

  it('หลายทีมดูแลจังหวัดเดียวกัน → คืนครบทุกทีม (UI มี toggle ดูทีมอื่น) และลำดับคงที่', () => {
    const teams: TeamCoverage[] = [
      ...TEAMS,
      { id: 'team-b', name: 'ทีมข', provinces: ['เชียงใหม่'], status: 'active' },
      { id: 'team-a', name: 'ทีมก', provinces: ['เชียงใหม่'], status: 'active' },
    ]
    const first = suggestTeam('เชียงใหม่', teams)
    const second = suggestTeam('เชียงใหม่', [...teams].reverse())
    expect(first.matchedTeams).toHaveLength(3)
    expect(first.matchedTeams).toEqual(second.matchedTeams)
  })

  it('ไม่ auto-assign — ผลลัพธ์เป็นแค่ข้อเสนอ (ไม่มี field ที่สั่งมอบหมาย)', () => {
    expect(Object.keys(suggestTeam('เชียงใหม่', TEAMS)).sort()).toEqual([
      'matchedTeams',
      'noMatch',
      'province',
      'suggestedTeamId',
      'suggestedTeamName',
    ])
  })
})
