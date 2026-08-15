import type { ExpenseStatus, ExpenseType } from '@/lib/generated/prisma/enums'

/**
 * Manual Claim (`15` §6.1 ข้อ 2) — **pure ล้วน** ใช้ร่วม FE/BE
 *
 * ### กติกาที่ตัดสินไว้ (ลำดับเอกสาร: `02` ชนะ `15`)
 * - **ไม่สร้าง enum ใหม่**: ประเภทเป็นค่าใน `expense_type` ของ `02` §3 / `41` §6.6 เท่านั้น
 *   (`15` §7.1 เขียนว่า `claim_type` เป็น free text แต่ `02` ไม่มีคอลัมน์ข้อความสำหรับประเภท
 *   — คำอธิบายเพิ่มเติมของผู้เบิกไปอยู่ช่องหมายเหตุ `revision_note` แทน)
 * - **ไม่ผูกเคส**: `expenses.case_id` = `NULL` ตามคำอธิบายคอลัมน์ใน `02` §8 ("NULL = Manual Claim
 *   ไม่ผูกเคส") ⇒ ไม่กระทบเกต Revenue ของเคส (`19` §6.1) และไม่ชนกับรายการอัตโนมัติของไฟล์ 41
 * - **ไม่ผ่านขั้นคลัง**: เข้าคิวอนุมัติทันทีเหมือนรายการ "เบิกแยก" ของ `41` §6.6
 */

/** ประเภทที่สร้างด้วยมือได้ — รายการกลุ่ม "ผูกกับเคส" (fuel/allowance/commission/no_success_fee) ระบบสร้างเองเท่านั้น */
export const MANUAL_CLAIM_TYPES: readonly ExpenseType[] = ['hotel', 'receipt', 'manual']

export function isManualClaimType(value: string): value is ExpenseType {
  return (MANUAL_CLAIM_TYPES as readonly string[]).includes(value)
}

/** `41` §6.6 — รายการที่ไม่ผูกเคสไม่ผ่าน `pending_warehouse_confirm` */
export const MANUAL_CLAIM_INITIAL_STATUS: ExpenseStatus = 'pending_approval'

/** `02` §8 `calculation_source` — ยอดมาจากการกรอกมือ ไม่ได้มาจากแผนค่าตอบแทน */
export const MANUAL_CLAIM_CALCULATION_SOURCE = 'manual'

/** รายการที่สร้างด้วยมือ (ไม่ได้มาจากไฟล์ 41 อัตโนมัติ) — ใช้ทำป้าย "🤖 Auto / ✏️ Manual" (`15` §8) */
export function isManualClaim(calculationSource: string | null): boolean {
  return calculationSource === MANUAL_CLAIM_CALCULATION_SOURCE || calculationSource === 'receipt'
}
