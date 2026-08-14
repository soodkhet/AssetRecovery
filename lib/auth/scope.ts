import type { RoleGroup } from '@/lib/generated/prisma/enums'
import { FIELD_AGENT_ROLE_NAME } from '@/lib/auth/constants'
import type { ScopeTarget, SessionScope } from '@/lib/auth/types'

/**
 * Scope resolver — แปลง role_group + role ของผู้ใช้เป็นขอบเขตข้อมูลที่มองเห็น (`05` §5 · `07` §6)
 *
 * | Role Group | Role | Scope |
 * |---|---|---|
 * | `system` | Superadmin / เจ้าหน้าที่อนุมัติเคส / บริหาร / การเงิน / บัญชี / ธุรการ | `global` — เห็นทั้งองค์กร (ข้อจำกัดเชิงหน้าที่มาจาก capability ไม่ใช่ scope) |
 * | `inhouse` / `outsource` | ผู้จัดการทีมติดตามทรัพย์ | `team` — เฉพาะทีมใน `team_managers` (หลายทีมได้) |
 * | `inhouse` / `outsource` | หัวหน้าทีมติดตามทรัพย์ | `team` — ทีมเดียวที่ตนเป็น `teams.supervisor_id` / สังกัด |
 * | `inhouse` / `outsource` | พนักงานติดตามทรัพย์ (Field Agent) | `self` — เฉพาะเคส/งานของตัวเอง |
 * | `finance_company` | ผู้จัดการ / หัวหน้า / แอดมิน | `company` — เฉพาะ `users.company_id` ของตัวเอง |
 *
 * ⚠️ scope นี้เป็นการบังคับ **เพิ่มจาก** access_level (DEC-009) ที่ระดับ business logic — `25` §16.1
 */
export interface ScopeInput {
  userId: string
  roleGroup: RoleGroup
  roleName: string
  teamId: string | null
  companyId: string | null
  /** ทีมที่เป็นผู้จัดการ (`team_managers`) */
  managedTeamIds: readonly string[]
  /** ทีมที่เป็นหัวหน้า (`teams.supervisor_id`) */
  supervisedTeamIds: readonly string[]
}

export function resolveScope(input: ScopeInput): SessionScope {
  if (input.roleGroup === 'system') {
    return { kind: 'global', teamIds: [], companyId: null, userId: input.userId }
  }

  if (input.roleGroup === 'finance_company') {
    return { kind: 'company', teamIds: [], companyId: input.companyId, userId: input.userId }
  }

  // inhouse / outsource
  if (input.roleName === FIELD_AGENT_ROLE_NAME) {
    return { kind: 'self', teamIds: [], companyId: null, userId: input.userId }
  }

  const teamIds = [
    ...new Set([...input.managedTeamIds, ...input.supervisedTeamIds, ...(input.teamId ? [input.teamId] : [])]),
  ]
  return { kind: 'team', teamIds, companyId: null, userId: input.userId }
}

/**
 * ตรวจว่าแถวปลายทางอยู่ในขอบเขตของผู้ใช้หรือไม่
 * - ไม่ระบุ target (หรือระบุแต่ค่าเป็น null/undefined ทั้งหมด) = ไม่ตรวจ row-level → ผ่าน
 * - `global` ผ่านเสมอ · `team` ผ่านเมื่อทีมตรง หรือแถวนั้นเป็นของตัวเอง
 * - `company` ผ่านเมื่อ company ตรง · `self` ผ่านเมื่อเป็นแถวของตัวเอง
 */
export function isWithinScope(scope: SessionScope, target?: ScopeTarget): boolean {
  if (!target) return true

  const teamId = target.teamId ?? null
  const companyId = target.companyId ?? null
  const userId = target.userId ?? null
  if (teamId === null && companyId === null && userId === null) return true

  switch (scope.kind) {
    case 'global':
      return true
    case 'team':
      if (userId !== null && userId === scope.userId) return true
      return teamId !== null && scope.teamIds.includes(teamId)
    case 'company':
      return companyId !== null && scope.companyId !== null && companyId === scope.companyId
    case 'self':
      return userId !== null && userId === scope.userId
  }
}
