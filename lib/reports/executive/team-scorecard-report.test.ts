import { describe, expect, it } from 'vitest'
import {
  buildTeamScorecardReport,
  sideLabel,
  UNASSIGNED_TEAM_KEY,
  type TeamScorecardEntry,
} from '@/lib/reports/executive/team-scorecard-report'
import { ROW_KEY } from '@/lib/reports/payload'

/**
 * E3 (`96` §6-E3) — Scorecard รายทีม
 *
 * จุดที่ต้องไม่พลาด: TAT = calendar days (คิดจากเคสที่ปิดในช่วง) · ทีมที่ยังไม่มีเคสปิดได้ `null`
 * ไม่ใช่ 0 วัน · % สำเร็จ นับเฉพาะเคสที่ปิดแล้ว · แถว "ไม่ระบุทีม" ต้องไม่หาย
 */

const DAY = 24

function team(key: string, overrides: Partial<TeamScorecardEntry> = {}): TeamScorecardEntry {
  return {
    teamKey: key,
    teamName: `ทีม ${key}`,
    side: 'inhouse',
    memberCount: 5,
    caseCount: 10,
    successCount: 6,
    failCount: 2,
    tatHours: [3 * DAY, 5 * DAY],
    revenueSatang: 1_000_00,
    directCostSatang: 400_00,
    ...overrides,
  }
}

function build(teams: readonly TeamScorecardEntry[]) {
  return buildTeamScorecardReport({ teams, rangeLabel: 'สิงหาคม 2569' })
}

describe('buildTeamScorecardReport', () => {
  it('คอลัมน์ตรงตาม `96` §6-E3 (ทีม | ประเภท | พนักงาน | เคส | %สำเร็จ | TAT | ต้นทุน | กำไร)', () => {
    expect(build([team('a')]).columns.map((column) => column.key)).toEqual([
      'team',
      'side',
      'memberCount',
      'caseCount',
      'successPct',
      'avgTatDays',
      'directCostSatang',
      'grossProfitSatang',
    ])
  })

  it('TAT เฉลี่ยเป็นวันตามปฏิทิน และ % สำเร็จคิดจากเคสที่ปิดแล้ว', () => {
    const report = build([team('a', { tatHours: [2 * DAY, 4 * DAY, 9 * DAY], caseCount: 40 })])

    expect(report.rows[0]).toMatchObject({ avgTatDays: 5, successPct: 75, caseCount: 40 })
  })

  it('ทีมที่ยังไม่มีเคสปิดในช่วงนี้ ⇒ TAT = null (แสดง "—") ห้ามเป็น 0 วัน', () => {
    const report = build([team('a', { tatHours: [], successCount: 0, failCount: 0 })])

    expect(report.rows[0]?.['avgTatDays']).toBeNull()
    expect(report.rows[0]?.['successPct']).toBeNull()
  })

  it('ป้ายประเภททีมมาจากทะเบียนกลาง · ไม่ระบุทีม = ไม่มีประเภท/จำนวนคน', () => {
    expect(sideLabel('inhouse')).toBe('Inhouse')
    expect(sideLabel('outsource')).toBe('Outsource')
    expect(sideLabel(null)).toBeNull()

    const report = build([
      team(UNASSIGNED_TEAM_KEY, { teamName: 'ไม่ระบุทีม', side: null, memberCount: null }),
    ])
    expect(report.rows[0]).toMatchObject({ side: null, memberCount: null })
  })

  it('เรียงตามกำไรขั้นต้นจากมากไปน้อย — ทีมที่ขาดทุนอยู่ท้ายตาราง', () => {
    const report = build([
      team('a', { revenueSatang: 500_00, directCostSatang: 900_00 }),
      team('b', { revenueSatang: 2_000_00, directCostSatang: 500_00 }),
      team('c', { revenueSatang: 1_000_00, directCostSatang: 500_00 }),
    ])

    expect(report.rows.map((row) => row[ROW_KEY])).toEqual(['b', 'c', 'a'])
    expect(report.rows.at(-1)?.['grossProfitSatang']).toBe(-400_00)
  })

  it('แถวรวมและ KPI คิดจากยอดรวมทุกทีม (TAT เฉลี่ยถ่วงตามจำนวนเคสที่ปิดจริง)', () => {
    const report = build([
      team('a', { tatHours: [2 * DAY], successCount: 1, failCount: 0, revenueSatang: 1_000_00, directCostSatang: 400_00, memberCount: 3 }),
      team('b', { tatHours: [4 * DAY, 6 * DAY], successCount: 1, failCount: 1, revenueSatang: 2_000_00, directCostSatang: 600_00, memberCount: 4 }),
    ])

    expect(report.totalRow).toMatchObject({
      memberCount: 7,
      caseCount: 20,
      // สำเร็จ 2 จากเคสที่ปิดแล้ว 3 ⇒ 66.7 (ปัด 1 ตำแหน่งที่ `successRate()` ตัวกลาง)
      successPct: 66.7,
      avgTatDays: 4,
      directCostSatang: 1_000_00,
      grossProfitSatang: 2_000_00,
    })
    expect(report.kpis?.find((item) => item.key === 'avgTatDays')?.higherIsBetter).toBe(false)
  })
})
