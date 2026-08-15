import type { CostCenterMappingRule, DocumentStatus, ExpenseSummary } from '@/lib/expenses/expense-record'

/**
 * DTO ของบัญชีค่าใช้จ่าย (ไฟล์ 32 §8) — เงินเป็น satang เสมอ, วันที่เป็น ISO UTC
 * (ฝั่งจอแปลงเป็น พ.ศ. ด้วย `fmtDate` — Rule 01)
 */

export interface ExpenseRecordDto {
  id: string
  periodId: string
  periodLabel: string
  /** รายการต้นทางในรอบจ่าย (ไฟล์ 17 §7.2) */
  payoutBatchItemId: string
  payoutBatchId: string
  payoutBatchName: string
  /** ชื่อผู้รับเงิน — อ่านจาก payee ต้นทาง (ยังไม่มีคอลัมน์ snapshot — D14) */
  payeeName: string
  /** ประเภทค่าใช้จ่าย (`32` §7.1) — derive จากประเภทรายการเบิก/เงินทดรอง */
  category: string
  /** วันที่จ่ายจริง (`32` §7.1) = วันสร้างไฟล์โอน หรือวันที่รอบจ่ายเป็น `completed` */
  paymentDate: string
  grossSatang: number
  whtSatang: number
  netSatang: number
  costCenterId: string | null
  costCenterLabel: string | null
  mappingRule: CostCenterMappingRule
  documentStatus: DocumentStatus
  documentStatusLabel: string
  /** ใบเสร็จของรายการเบิกแยก (`41` §6.6) — `null` = ไม่ต้องแนบ หรือยังไม่มี */
  receiptFileUrl: string | null
  createdAt: string
}

/** ตัวเลือกศูนย์ต้นทุนสำหรับ modal map — ส่งมากับ list เพื่อไม่ต้องยิง `/api/settings/*` ซ้ำ */
export interface CostCenterOptionDto {
  id: string
  code: string
  name: string
}

export interface ExpenseRecordListDto {
  items: ExpenseRecordDto[]
  summary: ExpenseSummary
  costCenters: CostCenterOptionDto[]
}
