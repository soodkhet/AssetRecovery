import type { ServiceFeeTemplateVersion } from '@/lib/service-fee/template'

/**
 * รูปร่างข้อมูลที่ API ของโมดูลเทมเพลตค่าบริการส่งออก — **pure type ล้วน**
 * แยกจาก `lib/service-fee/queries.ts` เพราะไฟล์นั้น import Prisma (ห้ามหลุดเข้าไฟล์ `'use client'`)
 */

export interface ServiceFeeTemplateDto extends ServiceFeeTemplateVersion {
  /** `deleted_at IS NULL` — ตรงกับ `active` ของ `12` §7.1 (`02` §2.4 ไม่มีคอลัมน์แยก) */
  isActive: boolean
  updatedAt: string
}

export interface ServiceFeeTemplateListDto extends ServiceFeeTemplateDto {
  companyCount: number
}
