import type { CompanyStatus, InvoiceDeliveryFormat } from '@/lib/finance-companies/company'

/**
 * รูปร่างข้อมูลที่ API ของโมดูลบริษัทไฟแนนซ์ส่งออก — **pure type ล้วน**
 * แยกจาก `lib/finance-companies/queries.ts` เพราะไฟล์นั้น import Prisma (ห้ามหลุดเข้าไฟล์ `'use client'`)
 */

export interface FinanceCompanyDto {
  id: string
  name: string
  shortName: string
  taxId: string
  address: string | null
  phone: string | null
  email: string | null
  contactName: string | null
  contactPhone: string | null
  signerName: string | null
  serviceFeeTemplateId: string
  /** ชื่อ + model ของเทมเพลตที่ผูกอยู่ (การ์ดบริษัทแสดง 2 ค่านี้ — `10` §8) */
  serviceFeeTemplateName: string | null
  serviceFeeTemplateModel: string | null
  vatRegistered: boolean
  defaultInvoiceDeliveryFormat: InvoiceDeliveryFormat
  billingDay: number
  paymentDueDays: number
  status: CompanyStatus
  suspendedReason: string | null
  caseCount: number
  userCount: number
  updatedAt: string
}

/** บัญชีผู้ใช้ฝั่งบริษัท (`10` §7.2) — read-only ใน Phase 1.8 (สร้าง user อยู่ Users module 1.9) */
export interface CompanyUserDto {
  id: string
  fullName: string
  email: string
  phone: string | null
  roleName: string
  status: string
  lastLoginAt: string | null
}
