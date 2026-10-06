import type { SubstituteReceiptStatus } from '@/lib/generated/prisma/enums'

/**
 * ใบรับรองแทนใบเสร็จที่ผูกกับใบเบิก/เงินทดรอง (มติ PO U103) — ฝังใน DTO ของรายการเบิก/เงินทดรอง/คิวอนุมัติ
 * ยอดเป็น satang (หน้าจอแค่ format — Rule 01)
 */
export interface SubstituteReceiptRefDto {
  id: string
  /** เลข CRT */
  receiptNumber: string
  status: SubstituteReceiptStatus
  totalSatang: number
  /** `YYYY-MM-DD` วันที่ออกใบ (วันไทย) */
  issueDate: string
  /** เวลาอัปโหลดฉบับเซ็น (ISO UTC) — ยังไม่อัปโหลด = `null` */
  signedAt: string | null
}
