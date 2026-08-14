import { TeamError } from '@/lib/teams/errors'
import { unknownProvinces } from '@/lib/teams/provinces'

/**
 * Logic ล้วนของโมดูลทีม (ไฟล์ 09) — **ห้าม import อะไรที่แตะ Prisma/DB ในไฟล์นี้**
 * (กับดักใน REUSE_INDEX: ไฟล์ที่ import `lib/prisma` เทสต์ไม่ได้ถ้าไม่มี DB)
 *
 * ขอบเขต: normalize ค่าฟอร์ม · diff รายชื่อผู้จัดการ (N:N `team_managers`) ·
 * ยามเชิงกติกาที่ตัดสินได้จากข้อมูลที่ caller ส่งเข้ามา (ตัวนับ/แถวที่ query มาแล้ว)
 *
 * ความไม่สมมาตรที่ต้องจำ (`09` §7.1/§17): **ผู้จัดการ 1 คนดูแลได้หลายทีม** แต่
 * **หัวหน้าทีม 1 คนสังกัดได้ทีมเดียว** — ไม่ใช่ bug ของ schema ที่ไม่มี unique constraint
 */

export type TeamSide = 'inhouse' | 'outsource'
export type TeamStatus = 'active' | 'inactive'

/** role group ที่มีโครงสร้างผู้จัดการ/หัวหน้าทีม (`09` §7.1 — `system` ไม่มีลำดับชั้นแบบทีม) */
export const TEAM_ROLE_GROUPS = ['inhouse', 'outsource'] as const

/**
 * สถานะเคสที่ถือว่า "ยังไม่จบ" — ใช้ตัดสินว่าปิดทีมได้ไหม (`09` §10 · D7)
 * ยึด `02` §3 `case_status`: จบแล้ว = `closed_success` / `closed_fail` / `rejected`
 * ส่วน `draft` ยังไม่ถูกมอบหมายให้ทีมจึงไม่นับ (เคสที่ผูกทีมได้เริ่มที่ `pending_review` เป็นต้นไป)
 */
export const ACTIVE_CASE_STATUSES = [
  'pending_review',
  'need_info',
  'approved',
  'active',
  'pending_recycle_review',
] as const

/** ค่าที่ผู้ใช้ตั้งได้ต่อทีม — ตรงกับคอลัมน์ `teams` (`02` §5) + `team_managers` (N:N) */
export interface TeamValues {
  name: string
  side: TeamSide
  /** **บังคับเสมอตอนสร้าง** — ไม่มีทีมไหนไม่มีแผนค่าตอบแทน (`09` §7) */
  compensationPlanId: string
  supervisorId: string | null
  managerIds: string[]
  provinces: string[]
  status: TeamStatus
}

/** ตัดช่องว่าง + ลบค่าซ้ำ โดยคงลำดับที่ผู้ใช้เลือกไว้ (ลำดับมีผลกับการแสดงผลบนตาราง) */
function uniqueTrimmed(values: readonly string[]): string[] {
  const seen = new Set<string>()
  const result: string[] = []
  for (const raw of values) {
    const value = raw.trim()
    if (value === '' || seen.has(value)) continue
    seen.add(value)
    result.push(value)
  }
  return result
}

export function normalizeTeamValues(values: TeamValues): TeamValues {
  return {
    ...values,
    name: values.name.trim(),
    supervisorId: values.supervisorId === '' ? null : values.supervisorId,
    managerIds: uniqueTrimmed(values.managerIds),
    provinces: uniqueTrimmed(values.provinces),
  }
}

/** ทุกจังหวัดต้องอยู่ใน PROVINCE_DATA (`09` §8) — client เลือกจาก checkbox แต่ API ต้องตรวจซ้ำเสมอ */
export function assertProvincesKnown(provinces: readonly string[]): void {
  const unknown = unknownProvinces(provinces)
  if (unknown.length > 0) {
    throw new TeamError('INVALID_PROVINCE', {
      detail: `provinces=${unknown.join(',')}`,
      context: { invalidProvinces: unknown },
    })
  }
}

/** ผู้ใช้เท่าที่ต้องรู้เพื่อตัดสินว่าตั้งเป็นผู้จัดการ/หัวหน้าทีมได้ไหม */
export interface TeamMemberCandidate {
  id: string
  status: string
  roleGroup: string
  supervisedTeamId?: string | null
}

/**
 * ผู้จัดการ/หัวหน้าทีมต้อง (1) มีตัวตนในองค์กรเดียวกัน (2) ยัง active (3) อยู่กลุ่ม inhouse/outsource
 * (`09` §7.1) — id ที่ query ไม่เจอถือว่าไม่ผ่านเหมือนกัน (ไม่ leak ว่าอยู่องค์กรอื่นหรือไม่มีจริง)
 */
export function assertTeamMembersEligible(
  ids: readonly string[],
  candidates: readonly TeamMemberCandidate[],
): void {
  const byId = new Map(candidates.map((candidate) => [candidate.id, candidate]))
  const invalid = ids.filter((id) => {
    const candidate = byId.get(id)
    if (candidate === undefined) return true
    if (candidate.status !== 'active') return true
    return !TEAM_ROLE_GROUPS.some((group) => group === candidate.roleGroup)
  })

  if (invalid.length > 0) {
    throw new TeamError('INVALID_TEAM_MEMBER', {
      detail: `users=${invalid.join(',')}`,
      context: { invalidUserIds: invalid },
    })
  }
}

/**
 * หัวหน้าทีม 1 คน = 1 ทีม (`09` §7.1/§17 — ปิด Open Item §18 ด้วยการ **reject ไม่ใช่แค่เตือน**)
 * `currentTeamId` = ทีมที่กำลังแก้อยู่ เพื่อให้บันทึกทีมเดิมซ้ำได้โดยไม่ชนตัวเอง
 */
export function assertSupervisorAvailable(
  supervisorId: string | null,
  supervisedTeamId: string | null,
  currentTeamId: string | null,
): void {
  if (supervisorId === null || supervisedTeamId === null) return
  if (supervisedTeamId === currentTeamId) return
  throw new TeamError('SUPERVISOR_ALREADY_ASSIGNED', {
    detail: `supervisor=${supervisorId} team=${supervisedTeamId}`,
    context: { conflictTeamId: supervisedTeamId },
  })
}

/** ปิดทีมที่ยังมีเคสค้างไม่ได้ (`09` §10) — ตัวนับมาจาก `lib/teams/queries.ts` */
export function assertTeamDeactivatable(activeCaseCount: number): void {
  if (activeCaseCount > 0) {
    throw new TeamError('TEAM_HAS_ACTIVE_CASES', {
      detail: `activeCases=${activeCaseCount}`,
      context: { activeCaseCount },
    })
  }
}

export interface ManagerDiff {
  added: string[]
  removed: string[]
}

/** diff `team_managers` — insert/delete เฉพาะส่วนต่าง ไม่ลบทิ้งทั้งชุดแล้วใส่ใหม่ (audit จะอ่านไม่รู้เรื่อง) */
export function diffManagers(current: readonly string[], next: readonly string[]): ManagerDiff {
  const currentSet = new Set(current)
  const nextSet = new Set(next)
  return {
    added: [...nextSet].filter((id) => !currentSet.has(id)),
    removed: [...currentSet].filter((id) => !nextSet.has(id)),
  }
}

/** ค่าที่บันทึกลง audit — ชื่อคอลัมน์ snake_case ตามตารางจริง (`90` §6.1) */
export function toTeamAuditPayload(values: TeamValues): Record<string, unknown> {
  const normalized = normalizeTeamValues(values)
  return {
    name: normalized.name,
    side: normalized.side,
    compensation_plan_id: normalized.compensationPlanId,
    supervisor_id: normalized.supervisorId,
    // `team_managers` เป็นตารางแยก — เก็บลง audit ของทีมด้วยเพื่อให้เห็น before/after ครบในรายการเดียว
    manager_ids: normalized.managerIds,
    provinces: normalized.provinces,
    status: normalized.status,
  }
}
