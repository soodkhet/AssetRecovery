import type { WhtRateOrigin } from '@/lib/finance/wht-calc'
import type { SubstituteReceiptRefDto } from '@/lib/substitute-receipts/types'
import { z } from 'zod'
import { reasonSchema } from '@/lib/api/validation'
import type { ApprovalHistoryEntry } from '@/lib/compensation/approval'
import type { ExpenseStatus, ExpenseType } from '@/lib/generated/prisma/enums'

/**
 * DTO + Zod ของสายอนุมัติค่าตอบแทน (ไฟล์ 16 §8/§14) — schema ชุดเดียวใช้ร่วม FE/BE (Rule 13)
 *
 * ⚠️ ยอด `wht`/`net` ที่นี่คือ **ตัวเลขสำหรับแสดงผล** ที่คำนวณสด ๆ จากอัตราปัจจุบันของ payee
 * (`22` §6.9 · `18` §6.3) — ยอดที่ **ผูกพันการจ่ายจริง** ถูก snapshot ตอนสร้าง `payout_batch_items`
 * ที่ Phase 3.4 (`92` §7.1) ห้ามเอาค่าจากที่นี่ไปเขียนลงตารางการเงิน
 */

export interface CompensationApprovalDto {
  id: string
  caseId: string | null
  caseRef: string | null
  debtorName: string | null
  agentName: string | null
  payeeId: string
  payeeName: string
  /** payee ที่ยัง unverified รวมเข้ารอบจ่ายไม่ได้ (`18` §6.2) — เตือนตั้งแต่หน้าอนุมัติ */
  payeeVerified: boolean
  /** มติ PO U131 — ข้อมูลรับเงินของผู้รับยังไม่ครบ (ภาษี/ที่อยู่/บัญชี/อัตรา) ⇒ ป้าย "ข้อมูลรับเงินไม่ครบ" ตั้งแต่ส่งเบิก */
  payeeInfoIncomplete: boolean
  expenseType: ExpenseType
  /** `YYYY-MM-DD` (คอลัมน์ `DATE`) — display แปลงเป็น พ.ศ. ที่ layer บนสุด (Rule 01) */
  expenseDate: string
  distanceKm: string | null
  /** staging E-044 — ค่าน้ำมันตามกิโลเมตร: จุดเริ่มเดินทาง + จุดเช็คอินของวันนั้น (ตามลำดับ) · ไม่มี = ว่าง/ไม่ระบุ */
  fuelRoute?: readonly { label: string; latitude: number; longitude: number }[]
  calculationSource: string | null
  /**
   * ข้อความ "สูตร / ฐานคิด" ที่ตารางแสดง (`16` §8 — เช่น "128.50 กม. × 3.50 บาท/กม.")
   * ประกอบฝั่ง server จาก **snapshot ของรายการ** เท่านั้น (`92` §7.1) หน้าจอห้ามคิดสูตรเอง
   */
  basisText: string
  /** ค่าที่พัก: ใบเสร็จออกในนามบริษัทหรือไม่ (มติ PO U96 #14) — รายการชนิดอื่น = `null` */
  receiptInCompanyName: boolean | null
  /** มติ PO U103 — ใบรับรองแทนใบเสร็จของรายการ (ป้ายบนคิวอนุมัติ) · ไม่มี = `null` */
  substituteReceipt: SubstituteReceiptRefDto | null
  grossSatang: number
  whtSatang: number
  netSatang: number
  whtPctUsed: number
  /** `payee` = ใช้ Tax Profile ของผู้รับเงิน · `plan` = fallback ชั่วคราว ต้องโชว์ `whtWarning` */
  /** มติ PO U121 — `type_default` = ค่าเริ่มต้นตามประเภทผู้รับ · `none` = ไม่ได้ใช้อัตรา */
  whtRateSource: WhtRateOrigin
  whtWarning: string | null
  /** BUG-176 — เงื่อนไข (2)/(3) บริษัทออกภาษีให้ ⇒ `whtSatang` = ภาษีที่ออกให้ (ไม่หักจากผู้รับ) · `net = gross` */
  whtPayerBorne: boolean
  /** BUG-176 — true = ยอด WHT/Net มาจากรายการรอบจ่ายที่บันทึกแล้ว (ยอดโอนจริง) · false = คาดการณ์ */
  whtFromPayout: boolean
  /** ยอดคาดการณ์ต่ำกว่าเกณฑ์ขั้นต่ำ ⇒ ไม่หัก (staging E-039) */
  whtBelowThreshold: boolean
  status: ExpenseStatus
  approvalStepCurrent: number
  approvalStepTotal: number
  /** role ที่ขั้นปัจจุบันรออยู่ — `null` = ตั้งค่าสายอนุมัติไม่ครอบยอดนี้ (`APPROVAL_MATRIX_NOT_FOUND`) */
  pendingStepRole: string | null
  approvalHistory: readonly ApprovalHistoryEntry[]
  /**
   * ผู้เรียกถือ capability ระดับ `manage` ของ **ขั้นที่รายการรออยู่** ไหม (UAT R6-7) — หน้าจอใช้ซ่อนปุ่ม
   * อนุมัติ/ตีกลับรายแถว แทนการโชว์ปุ่มที่กดแล้วได้ 403 · UX เท่านั้น API ตรวจซ้ำเสมอ (DEC-002)
   */
  viewerCanAct: boolean
  /** มติ PO U117/U118 — ผู้ดูปฏิเสธถาวรได้ (ใบเบิกค่าที่พัก · ขั้นที่รออยู่ หรือขั้นที่ตีกลับมาเมื่อ `needs_revision`) — UX เท่านั้น */
  viewerCanRejectPermanently: boolean
  rejectReason: string | null
  /** มติ PO U152 — หมายเหตุ/รายละเอียดของผู้เบิกตอนสร้างรายการ (`revision_note`) */
  note: string | null
  /** มติ PO U152 — คำชี้แจงตอนส่งใหม่หลังถูกตีกลับ (ครั้งล่าสุด) */
  resubmitNote: string | null
  /**
   * มติ PO U152/U143 — path ใบเสร็จที่ **ผ่านการตรวจของ server แล้ว** (เปิดผ่าน signed URL) · ไม่มี/ไม่ผ่าน = `null`
   */
  receiptFilePath: string | null
  /** ข้อมูลเก่าที่เป็น path พิมพ์เอง (ไม่ผ่านการตรวจ — U143) ⇒ ป้ายเตือน "ใบเสร็จไม่ผ่านการตรวจ" */
  receiptUnverified: boolean
  /** มติ PO U152 — ผู้พักร่วม (ค่าที่พัก) · ไม่มี = `null` */
  sharedWithName: string | null
  /** มติ PO U153 — ผู้บันทึกแทน (ผู้สร้างรายการไม่ใช่เจ้าของ payee) · บันทึกเอง = `null` */
  recordedByName: string | null
  createdAt: string
}

export const compensationListQuerySchema = z.object({
  status: z
    .enum(['pending_warehouse_confirm', 'pending_approval', 'pending_finance_approval', 'needs_revision', 'approved', 'all'])
    .default('all'),
  caseId: z.string().guid().optional(),
  payeeId: z.string().guid().optional(),
})

export const compensationApproveSchema = z.object({
  /** ขั้นที่หน้าจอเห็นตอนกด — ป้องกันกดจากหน้าที่ค้าง (`16` §11) */
  step: z.number().int().min(1).max(5).optional(),
  note: z.string().trim().max(500).optional(),
})

/** `24` §6.4 `REJECT_REASON_REQUIRED` — ตีกลับต้องมีเหตุผลเสมอ (Rule 04) */
export const compensationRejectSchema = z.object({
  reason: reasonSchema,
})

export type CompensationApprovalListQuery = z.infer<typeof compensationListQuerySchema>
export type CompensationApproveInput = z.infer<typeof compensationApproveSchema>
export type CompensationRejectInput = z.infer<typeof compensationRejectSchema>
