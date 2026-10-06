import type { RoleGroup, UserStatus } from '@/lib/generated/prisma/enums'

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
