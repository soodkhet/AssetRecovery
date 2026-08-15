import type { RoleGroup } from '@/lib/generated/prisma/enums'
import { FIELD_AGENT_ROLE_NAME } from '@/lib/auth/constants'
import { AuthError } from '@/lib/auth/errors'
import type { ScopeTarget, SessionScope, SessionUser } from '@/lib/auth/types'

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

/**
 * ยามของ **ทรัพยากรระดับองค์กร** — ผ่านเฉพาะ scope `global` (DEC-002 · Rule 03)
 *
 * ใช้กับตารางที่ยอด/เอกสาร "รวมทั้งองค์กร" อยู่ในแถวเดียว (รอบบัญชี, ชุดส่งบัญชี, ใบหัก ณ ที่จ่าย,
 * รายการเดินบัญชีธนาคาร) — แถวพวกนี้ **ไม่มีคอลัมน์บริษัท/ทีมให้กรองรายแถว** ⇒ ปล่อยให้ scope
 * `company`/`team`/`self` อ่านได้เท่ากับเปิดข้อมูลข้ามบริษัททั้งก้อน (`97` §11 ห้าม leak)
 *
 * ### ทำไมต้องมีทั้งที่ capability ยังไม่ถูกมอบให้ role กลุ่มนั้น
 * `role_capabilities` แก้ได้จากหน้า Settings — วันที่ Superadmin ผูก `manage_wht` ให้ role ฝั่ง
 * บริษัทไฟแนนซ์ ยามที่ route (`requirePermission`) จะปล่อยผ่านทันที ⇒ ต้องมีชั้นที่ **ข้อมูล** ด้วย
 * (แนวเดียวกับ `assertAuditReadable()` ของ `90` — whitelist `global` ไม่ใช่ blacklist `company`)
 *
 * ⚠️ ใช้กับ resource ที่กรองรายแถวได้ (cases/assets/revenues/sales) **ไม่ได้** — พวกนั้นต้อง
 * "แคบ filter" ด้วย `scopeWhere()` ของโมดูลตัวเอง ไม่ใช่ 403 ทั้งก้อน
 *
 * @throws {AuthError} `PERMISSION_DENIED` (403) — ไม่บอกว่ามีข้อมูลอยู่จริงไหม (`25` ห้าม leak)
 */
export function assertOrgWideReadable(user: SessionUser, resource: string): void {
  if (user.scope.kind !== 'global') {
    throw new AuthError('PERMISSION_DENIED', `${resource}: scope=${user.scope.kind} user=${user.id}`)
  }
}

/**
 * ผู้เรียกเป็นผู้ใช้ฝั่ง **บริษัทไฟแนนซ์** (external tenant) หรือไม่ — Superadmin ไม่นับ
 *
 * ใช้เป็นสวิตช์ของการ **ตัดฟิลด์ภายในออกจาก response** (field-level redaction) ในโมดูลที่
 * บริษัทไฟแนนซ์เข้าถึงได้ผ่าน `view_own_company_data`: `97` §6.1 ห้ามให้ฝั่งบริษัทเห็น
 * ชื่อ/เบอร์พนักงานภาคสนาม · ทีมที่มอบหมาย · IMEI · หลักฐานปิดงาน และ §7 ห้าม expose
 * ราคาละเอียด/note ภายใน — `assetScopeWhere()`/`caseScopeWhere()` คุมแค่ว่าเห็น **แถวไหน**
 * ไม่ได้คุมว่าแถวนั้นมี **คอลัมน์อะไรติดมา**
 *
 * (แนวเดียวกับ `isCompanySideViewer()` ของโมดูล revenue ที่กรอง billing batch `draft` ออก)
 */
export function isCompanySideViewer(user: SessionUser): boolean {
  return !user.isSuperadmin && user.scope.kind === 'company'
}
