import type { TeamSide, TeamStatus } from '@/lib/teams/team'

/**
 * รูปร่างข้อมูลที่ API ของโมดูลทีมส่งออก — **pure type ล้วน**
 * แยกจาก `lib/teams/queries.ts` เพราะไฟล์นั้น import Prisma (ห้ามหลุดเข้าไฟล์ `'use client'`)
 */

export interface TeamMemberRefDto {
  id: string
  fullName: string
  roleName: string
}

export interface TeamDto {
  id: string
  name: string
  side: TeamSide
  status: TeamStatus
  provinces: string[]
  compensationPlanId: string
  /** ชื่อ + ฝั่งของแผนที่ผูกอยู่ (ตารางทีมแสดงคอลัมน์ "แผนค่าตอบแทน" ตาม `09` §7) */
  compensationPlanName: string | null
  compensationPlanSide: TeamSide | null
  supervisor: TeamMemberRefDto | null
  managers: TeamMemberRefDto[]
  memberCount: number
  activeCaseCount: number
  updatedAt: string
}

/** ผู้ใช้ที่เลือกเป็นผู้จัดการ/หัวหน้าทีมได้ (`GET /api/teams/eligible-members`) */
export interface EligibleMemberDto extends TeamMemberRefDto {
  roleGroup: 'inhouse' | 'outsource'
  /** ทีมที่เป็นหัวหน้าอยู่แล้ว — FE ใช้กันไม่ให้เลือกซ้ำ (API ปฏิเสธซ้ำเสมอ) */
  supervisedTeamId: string | null
  supervisedTeamName: string | null
}
