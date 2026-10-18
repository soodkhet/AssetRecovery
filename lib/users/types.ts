import type { AssignmentStatus, ExpenseStatus, ExpenseType, RoleGroup, UserStatus } from '@/lib/generated/prisma/enums'

/**
 * รูปร่างข้อมูลที่ API ของโมดูลผู้ใช้งานส่งออก — **pure type ล้วน**
 * แยกจาก `lib/users/queries.ts` เพราะไฟล์นั้น import Prisma (ห้ามหลุดเข้าไฟล์ `'use client'`)
 */

export interface UserDto {
  id: string
  username: string | null
  email: string | null
  fullName: string
  phone: string | null
  employeeCode: string | null
  roleId: string
  roleName: string
  roleGroup: RoleGroup
  teamId: string | null
  teamName: string | null
  /** ทีมที่ผู้ใช้เป็นหัวหน้า (`teams.supervisor_id`) — หัวหน้าทีมไม่มี `team_id` (mytester6 T-006) */
  supervisedTeamNames: string[]
  /** ทีมที่ผู้ใช้เป็นผู้จัดการ (`team_managers`) — ดูแลได้หลายทีม */
  managedTeamNames: string[]
  companyId: string | null
  companyName: string | null
  status: UserStatus
  /**
   * ผูกกับ Supabase Auth แล้วหรือยัง (`users.supabase_uid`) — `false` = ยังไม่มีรหัสผ่าน จึงยัง login ไม่ได้
   * (ผู้ใช้ค้างจาก flow เชิญเดิมของ D1) → ผู้ดูแลกด "ตั้งรหัสผ่าน" ให้ได้ (มติ PO 03/10/2569)
   */
  isProvisioned: boolean
  /** ผู้ดูแลตั้งรหัสให้แล้ว ผู้ใช้ยังไม่ได้เปลี่ยนเอง */
  mustChangePassword: boolean
  lastLoginAt: string | null
  /** จำนวนงานภาคสนามที่ยังไม่จบของผู้ใช้คนนี้ — ใช้เตือนก่อนระงับบัญชี (D7 default) */
  activeCaseCount: number
  /** Payee ที่ผูกกับผู้ใช้ (มติ PO U131 — ฟอร์มผู้ใช้โหลดข้อมูลรับเงินจากตัวนี้) · `null` = ยังไม่มี */
  payeeId: string | null
  updatedAt: string
}

/** งานภาคสนามที่ยังไม่จบของผู้ใช้ (ผู้รับผิดชอบงาน) — ต้องมอบใหม่ก่อนย้ายทีม/กลุ่ม (มติ D7-03) */
export interface UserOpenAssignmentDto {
  assignmentId: string
  caseId: string
  caseRef: string
  status: AssignmentStatus
}

/**
 * ใบเบิกที่ไม่ผูกงานซึ่งยังรออนุมัติ/ถูกตีกลับ — ผู้อนุมัติขั้นผู้จัดการคิดจากทีมปัจจุบันของผู้เบิก
 * จึงต้องจบก่อนย้ายทีม/กลุ่ม (มติ D7-03 ขยาย — mytester7 S7-AG7-03)
 */
export interface UserPendingClaimDto {
  expenseId: string
  expenseType: ExpenseType
  grossSatang: number
  status: ExpenseStatus
}

/** คิวรออนุมัติที่ผู้ใช้เป็นผู้ลงมือ (ใช้เตือนก่อนระงับ — mytester7 S7-AG7-04) */
export interface UserApprovalQueueDto {
  id: string
  label: string
  count: number
  /** จำนวนชนเพดานการดึงข้อมูล — แสดงเป็น "N+" */
  capped: boolean
  /** ไม่มีผู้ใช้อื่นที่ใช้งานอยู่ถือสิทธิ์ทำคิวนี้ (ยกเว้น Superadmin) */
  soleApprover: boolean
}

/** `GET /api/users/:id/pending-work` — งานค้างทุกชนิดของผู้ใช้ */
export interface UserPendingWorkDto {
  openAssignments: UserOpenAssignmentDto[]
  pendingClaims: UserPendingClaimDto[]
  approvalQueues: UserApprovalQueueDto[]
}
