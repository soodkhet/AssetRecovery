import type { RoleGroup, UserStatus } from '@/lib/generated/prisma/enums'
import { UserError } from '@/lib/users/errors'

/**
 * Pure logic ของโมดูลผู้ใช้งาน (ไฟล์ 08) — **ห้าม import อะไรที่แตะ Prisma/`next/headers`**
 * (ฟอร์มฝั่ง client เรียกยามชุดนี้ตรง ๆ เพื่อเตือนก่อนกดบันทึก — API ตรวจซ้ำเสมอ)
 *
 * จุดบังคับของไฟล์ 08:
 * - **conditional required** `team_id` ถ้า role group = inhouse/outsource · `company_id` ถ้า finance_company (§7.1)
 * - **lifecycle** `active ⇄ suspended → deleted` — `deleted` = soft delete ไม่ reactivate ผ่าน UI (§7.2)
 * - **ห้ามลบผู้ใช้ที่มีประวัติ** ใช้ suspend แทนเสมอ (§10 · `USER_HAS_HISTORY`)
 */

/** ค่าที่ผู้ใช้ตั้งได้ต่อ user — ตรงกับคอลัมน์ `users` (`02` §4) ยกเว้น `status` ที่เปลี่ยนผ่าน endpoint แยก */
export interface UserValues {
  roleId: string
  username: string
  email: string | null
  fullName: string
  phone: string | null
  employeeCode: string | null
  teamId: string | null
  companyId: string | null
}

/** สังกัดที่ role group นั้นบังคับ — `null` = ไม่ผูกทั้งทีมและบริษัท (กลุ่ม `system`) */
export type RequiredUserScope = 'team' | 'company' | null

export function requiredScopeFor(roleGroup: RoleGroup): RequiredUserScope {
  if (roleGroup === 'inhouse' || roleGroup === 'outsource') return 'team'
  if (roleGroup === 'finance_company') return 'company'
  return null
}

/**
 * เก็บ username/อีเมลเป็นตัวพิมพ์เล็กเสมอ (ใช้เทียบซ้ำและใช้ login — มติ PO 03/10/2569)
 * เบอร์โทรตัดตัวคั่นทิ้งให้เหลือแต่ตัวเลข — เทียบซ้ำแบบ exact ตาม `08` §10
 */
export function normalizePhone(raw: string | null | undefined): string | null {
  if (raw === null || raw === undefined) return null
  const digits = raw.replace(/[\s\-().]/g, '').trim()
  return digits === '' ? null : digits
}

function blankToNull(raw: string | null | undefined): string | null {
  if (raw === null || raw === undefined) return null
  const trimmed = raw.trim()
  return trimmed === '' ? null : trimmed
}

export function normalizeUserValues(input: UserValues): UserValues {
  return {
    roleId: input.roleId,
    username: input.username.trim().toLowerCase(),
    email: blankToNull(input.email)?.toLowerCase() ?? null,
    fullName: input.fullName.trim(),
    phone: normalizePhone(input.phone),
    employeeCode: blankToNull(input.employeeCode),
    teamId: blankToNull(input.teamId),
    companyId: blankToNull(input.companyId),
  }
}

/**
 * conditional required ตาม role group (`08` §7.1) — ตรวจทั้ง "ขาด" และ "เกิน"
 * (ผู้ใช้กลุ่มระบบที่ถูกยัด `team_id` มาด้วยจะทำให้ scope resolver เพี้ยน — `05` §5)
 */
export function assertScopeConsistent(roleGroup: RoleGroup, values: Pick<UserValues, 'teamId' | 'companyId'>): void {
  const required = requiredScopeFor(roleGroup)
  const detail = `roleGroup=${roleGroup} team=${values.teamId ?? '-'} company=${values.companyId ?? '-'}`

  if (required === 'team' && (values.teamId === null || values.companyId !== null)) {
    throw new UserError('INVALID_USER_SCOPE', { detail })
  }
  if (required === 'company' && (values.companyId === null || values.teamId !== null)) {
    throw new UserError('INVALID_USER_SCOPE', { detail })
  }
  if (required === null && (values.teamId !== null || values.companyId !== null)) {
    throw new UserError('INVALID_USER_SCOPE', { detail })
  }
}

/**
 * Lifecycle ของผู้ใช้ (`08` §7.2 · `23` — ไม่มี state machine เฉพาะของ users จึงยึดตาราง §7.2 ตรง)
 * `deleted` เป็น terminal ในเชิง UI — คืนสถานะต้องแก้ที่ฐานข้อมูลโดย Superadmin เท่านั้น
 */
export const USER_STATUS_TRANSITIONS: Readonly<Record<UserStatus, readonly UserStatus[]>> = {
  active: ['suspended', 'deleted'],
  suspended: ['active', 'deleted'],
  deleted: [],
}

export function canTransitionUserStatus(from: UserStatus, to: UserStatus): boolean {
  return USER_STATUS_TRANSITIONS[from].includes(to)
}

export function assertUserStatusTransition(from: UserStatus, to: UserStatus): void {
  if (!canTransitionUserStatus(from, to)) {
    throw new UserError('INVALID_USER_STATUS_TRANSITION', { detail: `${from} → ${to}` })
  }
}

/** ประเภทข้อมูลที่ทำให้ลบผู้ใช้ไม่ได้ — ตัวนับจริงมาจาก DB (`lib/users/queries.ts`) */
export type UserReferenceCounts = Readonly<Record<string, number>>

export function referencesInUse(counts: UserReferenceCounts): Record<string, number> {
  return Object.fromEntries(Object.entries(counts).filter(([, count]) => count > 0))
}

/**
 * `08` §10/§11 — ผู้ใช้ที่มีประวัติห้ามลบ ต้อง suspend แทน
 * ส่ง breakdown กลับไปให้ FE บอกได้ว่าติดตรงไหน (ปลอดภัย: เป็นแค่จำนวน ไม่มีข้อมูลเคส)
 */
export function assertUserDeletable(counts: UserReferenceCounts): void {
  const blocking = referencesInUse(counts)
  if (Object.keys(blocking).length > 0) {
    throw new UserError('USER_HAS_HISTORY', {
      detail: JSON.stringify(blocking),
      context: { references: blocking },
    })
  }
}

const CHANGE_LABELS: ReadonlyArray<[keyof UserValues, string]> = [
  ['username', 'ชื่อผู้ใช้'],
  ['email', 'อีเมล'],
  ['fullName', 'ชื่อ-นามสกุล'],
  ['phone', 'เบอร์โทร'],
  ['employeeCode', 'รหัสพนักงาน'],
  ['teamId', 'ทีม'],
  ['companyId', 'บริษัท'],
]

/**
 * เหตุผลที่ระบบสร้างลง audit ตอนแก้ไขผู้ใช้ (มติ PO 03/10/2569 — ฟอร์มแก้ไขไม่มีช่องเหตุผล)
 * สรุปจากสิ่งที่เปลี่ยนจริง: บทบาทระบุชื่อเดิม → ใหม่ (ฟิลด์สิทธิ์ที่ตรวจย้อนหลังบ่อยที่สุด) · ฟิลด์อื่นระบุแค่ชื่อฟิลด์
 * (ค่าเต็ม before/after อยู่ใน audit อยู่แล้ว)
 */
export function describeUserChanges(
  before: UserValues & { roleName: string },
  after: UserValues & { roleName: string },
): string {
  const parts: string[] = []
  if (before.roleId !== after.roleId) parts.push(`บทบาท ${before.roleName} → ${after.roleName}`)
  for (const [key, label] of CHANGE_LABELS) {
    if (before[key] !== after[key]) parts.push(label)
  }
  return parts.length === 0 ? 'แก้ไขข้อมูลผู้ใช้ (ไม่มีฟิลด์เปลี่ยน)' : `แก้ไขข้อมูลผู้ใช้: ${parts.join(', ')}`
}

/** payload สำหรับ audit before/after — snake_case ตรงคอลัมน์จริง (`90` §13) */
export function toUserAuditPayload(
  values: UserValues,
  extra?: { status?: UserStatus; roleName?: string },
): Record<string, unknown> {
  const payload: Record<string, unknown> = {
    role_id: values.roleId,
    username: values.username,
    email: values.email,
    full_name: values.fullName,
    phone: values.phone,
    employee_code: values.employeeCode,
    team_id: values.teamId,
    company_id: values.companyId,
  }
  if (extra?.status !== undefined) payload['status'] = extra.status
  if (extra?.roleName !== undefined) payload['role_name'] = extra.roleName
  return payload
}
