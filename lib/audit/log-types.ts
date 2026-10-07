import type { AuditAction } from '@/lib/generated/prisma/enums'

/**
 * DTO ของหน้าบันทึกการใช้งาน (`90` §8/§14) — ใช้ร่วม FE/BE
 * เวลาเป็น ISO UTC เสมอ (แปลง Asia/Bangkok + พ.ศ. ที่ display layer — Rule 01)
 */

export interface AuditLogListItemDto {
  id: string
  createdAt: string
  action: AuditAction
  /** `null` = งานอัตโนมัติของระบบ (job) — ที่มาอยู่ใน `reason` (`90` §13) */
  actorId: string | null
  actorName: string | null
  actorRole: string | null
  /** ชื่อตารางปลายทาง (snake_case ตาม `02`) */
  targetType: string
  targetId: string | null
  reason: string | null
  /** login/ยืนยันรหัสที่ล้มเหลว (`after.result = failed`) — แยกจาก login สำเร็จบนหน้าจอ (preship R3-016) */
  loginFailure: AuditLoginFailure | null
}

export interface AuditLoginFailure {
  /** error code ที่ลงไว้ เช่น `INVALID_CREDENTIALS` / `LOGIN_RATE_LIMITED` */
  code: string
  /** ชื่อผู้ใช้/อีเมลที่พิมพ์ (`<invalid>` = ไม่ใช่รูปแบบที่บันทึกได้) — `null` = ไม่ได้บันทึก */
  identifier: string | null
}

export interface AuditLogDetailDto extends AuditLogListItemDto {
  before: unknown
  after: unknown
  ipAddress: string | null
  userAgent: string | null
}

export interface AuditLogListDto {
  items: AuditLogListItemDto[]
  total: number
  offset: number
  limit: number
  hasMore: boolean
  /** ค่าที่มีจริงในองค์กรนี้ — ใช้เติมช่องกรอง "เป้าหมาย" */
  targetTypes: string[]
  /** ผู้ที่เคยมีรายการในองค์กรนี้ — ใช้เติมช่องกรอง "ผู้ดำเนินการ" (`90` §14) */
  actors: AuditLogActorOptionDto[]
}

export interface AuditLogActorOptionDto {
  id: string
  name: string
}
