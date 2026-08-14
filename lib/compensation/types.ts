import type { CompensationPlanVersion } from '@/lib/compensation/plan'

/**
 * รูปร่างข้อมูลที่ API ของโมดูลแผนค่าตอบแทนส่งออก — **pure type ล้วน**
 * แยกจาก `lib/compensation/queries.ts` เพราะไฟล์นั้น import Prisma (ห้ามหลุดเข้าไฟล์ `'use client'`)
 */

export interface CompensationPlanDto extends CompensationPlanVersion {
  /** `deleted_at IS NULL` — `02` §2.4 ไม่มีคอลัมน์ `active` แยก (`11` §7 เรียกว่า status) */
  isActive: boolean
  updatedAt: string
}

export interface CompensationPlanListDto extends CompensationPlanDto {
  teamCount: number
}
