import { CaseError } from '@/lib/cases/errors'

/**
 * Routing ทีมจากจังหวัด (ไฟล์ 38 §6.4/§7.4/§12) — **pure ล้วน ใช้ร่วม FE/BE**
 *
 * กติกาที่สเปคล็อกไว้ (`38` §11 + `01` §6 "Routing algorithm แบบ multi-criteria ไม่อยู่ในรอบนี้"):
 * - จับคู่จาก **จังหวัดของที่อยู่ปัจจุบันตัวเดียว** (`cases.addr_province`) เท่านั้น — ไม่ใช้ที่ทำงาน/ตามบัตร
 * - เป็น **ข้อเสนอ** เท่านั้น ไม่ auto-assign — ผู้พิจารณาต้องกด accept เพื่อยืนยันทีมเสมอ
 * - ไม่มีทีมตรงจังหวัด → `CASE_NO_TEAM_MATCH` (ให้เลือกทีมเองพร้อม reason)
 */

export interface TeamCoverage {
  id: string
  name: string
  /** จังหวัดที่ทีมรับผิดชอบ (`teams.provinces`) */
  provinces: readonly string[]
  status: string
}

export interface TeamSuggestionResult {
  /** ทีมที่ระบบเสนอ — `null` เมื่อไม่มีทีมไหนดูแลจังหวัดนี้ */
  suggestedTeamId: string | null
  suggestedTeamName: string | null
  province: string | null
  /** ทีมทั้งหมดที่ดูแลจังหวัดนี้ (เรียงตามชื่อ) — UI มี toggle "ดูทีมอื่น" (`38` §7.4) */
  matchedTeams: Array<{ id: string; name: string }>
  /** ไม่มีทีมตรงจังหวัด — FE ต้องบังคับให้เลือกทีมเองพร้อมเหตุผล */
  noMatch: boolean
}

/** เทียบชื่อจังหวัดแบบ trim + ตัดคำนำหน้า "จังหวัด" ออก (ข้อมูลจากไฟแนนซ์เขียนไม่เหมือนกัน) */
export function normalizeProvince(value: string | null | undefined): string {
  const trimmed = (value ?? '').trim()
  return trimmed.startsWith('จังหวัด') ? trimmed.slice('จังหวัด'.length).trim() : trimmed
}

/**
 * ทีมที่ดูแลจังหวัดนี้ — เฉพาะทีม `active` (ทีมที่ปิดใช้งานรับเคสใหม่ไม่ได้ · `09` §7)
 * เรียงตามชื่อเพื่อให้ผลลัพธ์คงที่ (ไม่ขึ้นกับลำดับแถวจาก DB)
 */
export function matchTeamsByProvince(
  province: string | null | undefined,
  teams: readonly TeamCoverage[],
): TeamCoverage[] {
  const target = normalizeProvince(province)
  if (target === '') return []
  return teams
    .filter((team) => team.status === 'active')
    .filter((team) => team.provinces.some((covered) => normalizeProvince(covered) === target))
    .sort((left, right) => left.name.localeCompare(right.name, 'th'))
}

/**
 * ผลการเสนอทีม — ไม่โยน error (หน้ารายละเอียด/ฟอร์มต้องแสดงสถานะ "ไม่มีทีมตรง" ได้โดยไม่พัง)
 * จุดที่ต้อง **block** ให้เรียก `assertTeamSuggestion()` แทน
 */
export function suggestTeam(
  province: string | null | undefined,
  teams: readonly TeamCoverage[],
): TeamSuggestionResult {
  const matched = matchTeamsByProvince(province, teams)
  const first = matched[0] ?? null
  return {
    suggestedTeamId: first?.id ?? null,
    suggestedTeamName: first?.name ?? null,
    province: normalizeProvince(province) === '' ? null : normalizeProvince(province),
    matchedTeams: matched.map((team) => ({ id: team.id, name: team.name })),
    noMatch: matched.length === 0,
  }
}

/** ใช้ตอนที่ flow ต้องมีทีมจริง ๆ — `38` §12 `CASE_NO_TEAM_MATCH` */
export function assertTeamSuggestion(result: TeamSuggestionResult): TeamSuggestionResult {
  if (result.noMatch) {
    throw new CaseError('CASE_NO_TEAM_MATCH', { context: { province: result.province } })
  }
  return result
}
