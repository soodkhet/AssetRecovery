import type { RoleGroup } from '@/lib/generated/prisma/enums'
import type { CapabilityLockOwner } from '@/lib/roles/capability-locks'
import type { CapabilityInfo, MatrixSection } from '@/lib/roles/matrix'

/**
 * รูปร่างข้อมูลที่ API ของโมดูล Roles & Permissions ส่งออก — **pure type ล้วน**
 * แยกจาก `lib/roles/queries.ts` เพราะไฟล์นั้น import Prisma (ห้ามหลุดเข้าไฟล์ `'use client'`)
 */

export interface RoleDetail {
  id: string
  name: string
  roleGroup: RoleGroup
  isSeed: boolean
  isEditable: boolean
  userCount: number
}

export interface RoleListItem extends RoleDetail {
  /** จำนวนสิทธิ์ที่ได้รับจริง — Superadmin นับเป็น manage ทุกรายการ (ไม่มี record) */
  grants: { manage: number; view: number }
}

export interface CapabilityListItem extends CapabilityInfo {
  locked: boolean
  lockOwner: CapabilityLockOwner | null
}

export interface RolePermissionsPayload {
  role: RoleDetail
  sections: MatrixSection[]
}

/** response envelope ชั่วคราวของ Phase 1 — ย้ายไป envelope กลางของไฟล์ `45` ใน Phase 2.1 */
export interface ApiData<T> {
  data: T
}

export interface ApiErrorBody {
  error: {
    code: string
    title: string
    message: string
    fields?: Record<string, string>
  }
}
