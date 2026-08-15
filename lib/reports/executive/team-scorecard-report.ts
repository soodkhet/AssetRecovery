import { grossProfit } from '@/lib/finance/gross-profit'
import { sumSatang } from '@/lib/finance/satang'
import { TEAM_SIDE_LABEL } from '@/lib/reports/finance/compensation-report'
import { hoursToDays } from '@/lib/reports/operations/sla'
import { successPctOf } from '@/lib/reports/operations/success-rate-report'
import { ROW_KEY, type ReportColumn, type ReportData, type ReportRow } from '@/lib/reports/payload'

/**
 * **E3 — Scorecard รายทีม** (`96` §6-E3) — ชั้น **pure ล้วน ไม่มี I/O**
 *
 * คอลัมน์ตามเอกสารตรงตัว: ทีม | ประเภท | พนักงาน | เคสทั้งหมด | Success Rate | TAT เฉลี่ย |
 * ต้นทุน | กำไรขั้นต้น
 *
 * ### กติกาที่ห้ามหลุด
 * - **ไม่มีสูตรใหม่**: กำไร = `grossProfit()` (`22` §6.12) · % สำเร็จ = `successPctOf()` ของ O1 ·
 *   **TAT = calendar days รวมวันหยุด** แปลงหน่วยด้วย `hoursToDays()` ของ O2 (`96` §13 O2)
 *   — ผู้เรียกส่ง `tatHours` ของเคสที่ปิดในช่วงมาให้ (`elapsedHours()`)
 * - **ทีมที่ไม่มีเคสปิดเลยได้ TAT `null` แสดง "—" ไม่ใช่ 0 วัน** (0 วันอ่านเหมือนปิดงานทันที — O2)
 * - เคสที่ยังไม่ถูกมอบหมายทีมรวมเป็นแถว "ไม่ระบุทีม" — ห้ามทิ้ง เพราะต้นทุน/รายได้ของมันมีจริง
 */

/** 1 ทีม — เงินเป็น satang และผ่าน `netAfterAdjustments()` มาแล้ว (`20` §9) */
export interface TeamScorecardEntry {
  /** id ของทีม หรือ `__unassigned__` สำหรับเคสที่ยังไม่ระบุทีม */
  teamKey: string
  teamName: string
  /** `inhouse` / `outsource` — `null` = ไม่ระบุทีม */
  side: string | null
  /** จำนวนพนักงานที่ยังใช้งานอยู่ในทีม — `null` = ไม่ระบุทีม (แสดง "—") */
  memberCount: number | null
  /** เคสที่รับเข้าระบบในช่วงที่เลือก (รวมเคสที่ยังไม่ปิด) */
  caseCount: number
  successCount: number
  failCount: number
  /** ชั่วโมง TAT ของ**เคสที่ปิดในช่วงที่เลือก** — ว่าง = ยังไม่มีเคสปิด */
  tatHours: readonly number[]
  revenueSatang: number
  directCostSatang: number
}

export const UNASSIGNED_TEAM_KEY = '__unassigned__'
export const UNASSIGNED_TEAM_LABEL = 'ไม่ระบุทีม'

const COLUMNS: readonly ReportColumn[] = [
  { key: 'team', header: 'ทีม', type: 'text', width: 26 },
  { key: 'side', header: 'ประเภท', type: 'text', width: 12 },
  { key: 'memberCount', header: 'พนักงาน', type: 'number' },
  { key: 'caseCount', header: 'เคสทั้งหมด', type: 'number' },
  { key: 'successPct', header: '% สำเร็จ', type: 'percent' },
  { key: 'avgTatDays', header: 'TAT เฉลี่ย (วัน)', type: 'number' },
  { key: 'directCostSatang', header: 'ต้นทุนตรง', type: 'money' },
  { key: 'grossProfitSatang', header: 'กำไรขั้นต้น', type: 'money' },
]

/** ค่าเฉลี่ยของรายการว่าง = `null` (ห้ามหารศูนย์ — Rule 01) */
function averageDays(hours: readonly number[]): number | null {
  if (hours.length === 0) return null
  return hoursToDays(hours.reduce((sum, value) => sum + value, 0) / hours.length)
}

export function sideLabel(side: string | null): string | null {
  if (side === null) return null
  return TEAM_SIDE_LABEL[side] ?? side
}

export function buildTeamScorecardReport(input: {
  teams: readonly TeamScorecardEntry[]
  /** ป้ายช่วงเวลาที่เลือก (พ.ศ.) */
  rangeLabel: string
}): ReportData {
  const { rangeLabel } = input

  const teams = input.teams
    .map((entry) => ({
      entry,
      profit: grossProfit({ revenueSatang: entry.revenueSatang, directCostSatang: entry.directCostSatang }),
    }))
    .sort(
      (a, b) =>
        b.profit.grossProfitSatang - a.profit.grossProfitSatang ||
        b.entry.caseCount - a.entry.caseCount ||
        a.entry.teamName.localeCompare(b.entry.teamName, 'th'),
    )

  const rows: ReportRow[] = teams.map(({ entry, profit }) => ({
    [ROW_KEY]: entry.teamKey,
    team: entry.teamName,
    side: sideLabel(entry.side),
    memberCount: entry.memberCount,
    caseCount: entry.caseCount,
    successPct: successPctOf(entry.successCount, entry.failCount),
    avgTatDays: averageDays(entry.tatHours),
    directCostSatang: entry.directCostSatang,
    grossProfitSatang: profit.grossProfitSatang,
  }))

  const totalRevenue = sumSatang(teams.map(({ entry }) => entry.revenueSatang), 'รายได้รวม')
  const totalCost = sumSatang(teams.map(({ entry }) => entry.directCostSatang), 'ต้นทุนตรงรวม')
  const totalProfit = grossProfit({ revenueSatang: totalRevenue, directCostSatang: totalCost })
  const totalCases = teams.reduce((sum, { entry }) => sum + entry.caseCount, 0)
  const totalSuccess = teams.reduce((sum, { entry }) => sum + entry.successCount, 0)
  const totalFail = teams.reduce((sum, { entry }) => sum + entry.failCount, 0)
  const totalMembers = teams.reduce((sum, { entry }) => sum + (entry.memberCount ?? 0), 0)
  const allTatHours = teams.flatMap(({ entry }) => [...entry.tatHours])
  const totalSuccessPct = successPctOf(totalSuccess, totalFail)

  return {
    columns: COLUMNS,
    rows,
    kpis: [
      {
        key: 'teamCount',
        label: 'ทีมในรายงาน',
        value: rows.length,
        type: 'number',
        hint: `พนักงานรวม ${totalMembers.toLocaleString('th-TH')} คน`,
      },
      {
        key: 'successPct',
        label: '% สำเร็จรวม',
        value: totalSuccessPct,
        type: 'percent',
        hint: `จากเคสที่ปิดแล้ว ${(totalSuccess + totalFail).toLocaleString('th-TH')} เคส`,
      },
      {
        key: 'avgTatDays',
        label: 'TAT เฉลี่ย (วัน)',
        value: averageDays(allTatHours),
        type: 'number',
        hint: `จากเคสที่ปิดในช่วงนี้ ${allTatHours.length.toLocaleString('th-TH')} เคส`,
        higherIsBetter: false,
      },
      {
        key: 'grossProfit',
        label: 'กำไรขั้นต้นรวม',
        value: totalProfit.grossProfitSatang,
        type: 'money',
        hint: rangeLabel,
      },
    ],
    totalRow: {
      team: 'รวมทั้งหมด',
      side: null,
      memberCount: totalMembers,
      caseCount: totalCases,
      successPct: totalSuccessPct,
      avgTatDays: averageDays(allTatHours),
      directCostSatang: totalCost,
      grossProfitSatang: totalProfit.grossProfitSatang,
    },
    note:
      `ขอบเขต: เคสนับจากวันที่รับเข้าระบบในช่วง ${rangeLabel} · % สำเร็จ คิดจากเคสที่ปิดแล้วเท่านั้น · ` +
      'TAT เฉลี่ยคิดจากเคสที่ **ปิดในช่วงนี้** เท่านั้น (นับเป็นวันตามปฏิทินรวมวันหยุด) — ทีมที่ยังไม่มีเคสปิดแสดง "—" · ' +
      'ต้นทุนตรง = ค่าน้ำมัน/เบี้ยเลี้ยง/ค่าคอมมิชชั่น/ค่าไม่สำเร็จ ของเคสที่ผูกทีมนั้น (ยอดหลังรายการปรับปรุงที่อนุมัติแล้ว)',
  }
}
