import type { CapabilityAccessLevel, RoleGroup, UserStatus } from '@/lib/generated/prisma/enums'

/**
 * ระดับสิทธิ์ที่ endpoint ร้องขอ (DEC-009 · `25` §16.1)
 * - `view`   = ดูอย่างเดียว — ผ่านทั้ง access_level `view` และ `manage`
 * - `manage` = แก้ไข/สั่งการ — ผ่านเฉพาะ access_level `manage`
 * ไม่มี record ใน `role_capabilities` = ไม่มีสิทธิ์ (มองไม่เห็น)
 */
export type PermissionAction = 'view' | 'manage'

/** ชนิด scope ข้อมูลที่ผู้ใช้มองเห็น (`05` §5 · `07` §6) */
export type ScopeKind = 'global' | 'team' | 'company' | 'self'

export interface SessionScope {
  kind: ScopeKind
  /** kind = `team` — ทีมที่ผู้ใช้ดูแล (manager หลายทีมจาก `team_managers` · supervisor ทีมเดียว) */
  teamIds: readonly string[]
  /** kind = `company` — บริษัทไฟแนนซ์ของผู้ใช้ (`users.company_id`) */
  companyId: string | null
  /** kind = `self` — เห็นเฉพาะงานของตัวเอง (Field Agent) */
  userId: string
}

/** แถวข้อมูลปลายทางที่ต้องเช็ค scope — ระบุเท่าที่ endpoint รู้ (ไม่ระบุ = ไม่ตรวจ row-level) */
export interface ScopeTarget {
  teamId?: string | null
  companyId?: string | null
  userId?: string | null
}

/** ข้อมูล user + role + scope ที่ cache ไว้ใน session (ไม่ query DB ทุก request — `01` §6.1) */
export interface SessionUser {
  id: string
  organizationId: string
  supabaseUid: string
  email: string
  fullName: string
  status: UserStatus
  roleId: string
  roleName: string
  roleGroup: RoleGroup
  /** Superadmin = manage ทุกอย่างโดยนิยาม ไม่เก็บ record ใน `role_capabilities` (DEC-009) */
  isSuperadmin: boolean
  teamId: string | null
  companyId: string | null
  /** capability code → access level (Superadmin ไม่มี record — ใช้ `isSuperadmin` แทน) */
  capabilities: Readonly<Record<string, CapabilityAccessLevel>>
  scope: SessionScope
  /** `users.last_login_at` (ISO UTC) — ใช้คำนวณ session timeout 24 ชม. (`05` §10) */
  loginAt: string | null
}

/** ข้อมูล session ที่ส่งลงฝั่ง client ได้ (ไม่มีข้อมูลอ่อนไหวเกินจำเป็น) */
export interface ClientSession {
  id: string
  email: string
  fullName: string
  roleName: string
  roleGroup: RoleGroup
  isSuperadmin: boolean
  capabilities: Readonly<Record<string, CapabilityAccessLevel>>
  scope: SessionScope
}

export function toClientSession(user: SessionUser): ClientSession {
  return {
    id: user.id,
    email: user.email,
    fullName: user.fullName,
    roleName: user.roleName,
    roleGroup: user.roleGroup,
    isSuperadmin: user.isSuperadmin,
    capabilities: user.capabilities,
    scope: user.scope,
  }
}
