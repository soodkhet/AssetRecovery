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
  /** มติ PO U107 — เวลายกเลิก (ISO UTC) + เหตุผล · ยังไม่ยกเลิก = `null` */
  cancelledAt: string | null
  cancelReason: string | null
  /** มติ PO U117 — เลขใบที่ยกเลิกซึ่งใบนี้ออกแทน · ออกครั้งแรก = `null` */
  replacesReceiptNumber: string | null
  /** มติ PO U117 — ใบที่ยกเลิกแล้วของรายการเดียวกัน (ใหม่ → เก่า · ไม่รวมใบนี้) ให้การ์ดแสดงคู่กัน */
  cancelledHistory: SubstituteReceiptCancelledDto[]
}

/** ใบที่ยกเลิกแล้ว (แสดงขีดฆ่าบนการ์ด — มติ PO U117) */
export interface SubstituteReceiptCancelledDto {
  id: string
  receiptNumber: string
  totalSatang: number
  /** ISO UTC */
  cancelledAt: string | null
  cancelReason: string | null
}

/** บรรทัดของใบ — ใช้ดึงไปตั้งต้นฟอร์ม "ออกใบใหม่แทน" (มติ PO U117 ข้อ 1) */
export interface SubstituteReceiptLineDto {
  /** `YYYY-MM-DD` */
  lineDate: string
  description: string
  amountSatang: number
  note: string | null
}

export interface SubstituteReceiptDetailDto {
  id: string
  receiptNumber: string
  status: SubstituteReceiptStatus
  totalSatang: number
  lines: SubstituteReceiptLineDto[]
}
