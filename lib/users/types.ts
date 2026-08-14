import type { RoleGroup, UserStatus } from '@/lib/generated/prisma/enums'

/**
 * รูปร่างข้อมูลที่ API ของโมดูลผู้ใช้งานส่งออก — **pure type ล้วน**
 * แยกจาก `lib/users/queries.ts` เพราะไฟล์นั้น import Prisma (ห้ามหลุดเข้าไฟล์ `'use client'`)
 */

export interface UserDto {
  id: string
  email: string
  fullName: string
  phone: string | null
  employeeCode: string | null
  roleId: string
  roleName: string
  roleGroup: RoleGroup
  teamId: string | null
  teamName: string | null
  companyId: string | null
  companyName: string | null
  status: UserStatus
  /**
   * ผูกกับ Supabase Auth แล้วหรือยัง (`users.supabase_uid`) — `false` = ยังตั้งรหัสผ่านไม่ได้
   * จึงยัง login ไม่ได้ (`05` §6.1 ตอบ `USER_NOT_PROVISIONED`) · flow เชิญ/ตั้งรหัสครั้งแรก = D1
   */
  isProvisioned: boolean
  lastLoginAt: string | null
  /** จำนวนงานภาคสนามที่ยังไม่จบของผู้ใช้คนนี้ — ใช้เตือนก่อนระงับบัญชี (D7 default) */
  activeCaseCount: number
  updatedAt: string
}
