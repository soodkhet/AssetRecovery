import { z } from 'zod'
import { dateOnlySchema, satangSchema } from '@/lib/api/validation'
import { MANUAL_CLAIM_TYPES } from '@/lib/claims/claim'
import type { ExpenseType } from '@/lib/generated/prisma/enums'
import { substituteReceiptDraftSchema } from '@/lib/substitute-receipts/schemas'

/**
 * Zod ชุดเดียวใช้ร่วม FE/BE ของ Manual Claim (`15` §7.1 · Rule 13)
 * ประเภทจำกัดอยู่ใน `expense_type` ของ `02` §3 เท่านั้น — ห้ามสร้าง enum ใหม่ (`15` §9 header)
 */

const manualClaimTypeSchema = z.enum(MANUAL_CLAIM_TYPES as [ExpenseType, ...ExpenseType[]], {
  message: 'ประเภทรายการเบิกไม่ถูกต้อง',
})

export const claimCreateSchema = z.object({
  claimType: manualClaimTypeSchema,
  grossSatang: satangSchema('ยอดเงิน').refine((value) => value > 0, 'ยอดเงินต้องมากกว่า 0'),
  expenseDate: dateOnlySchema('วันที่เกิดรายการ'),
  /** บันทึกแทนผู้อื่น — ใช้ได้เฉพาะผู้ถือสิทธิ์อนุมัติขั้นการเงิน (`25` §7.2) */
  payeeId: z.preprocess(
    (value) => (typeof value === 'string' && value.trim() === '' ? null : value),
    z.string().guid('รูปแบบรหัสไม่ถูกต้อง').nullable().default(null),
  ),
  /**
   * มติ PO U143 — **path ใบเสร็จจากกลไกอัปโหลดของ server** (target `expense_receipt`) ไม่ใช่ข้อความพิมพ์เอง
   * server ดาวน์โหลดมาตรวจ (prefix ของผู้บันทึก · magic bytes · ขนาด) + เก็บ SHA-256 · ไม่มีใบเสร็จ ⇒ ส่ง `substituteReceipt`
   */
  receiptFileUrl: z.preprocess(
    (value) => (typeof value === 'string' && value.trim() === '' ? null : value),
    z.string().trim().max(1024, 'path ของไฟล์ใบเสร็จยาวเกินไป').nullable().default(null),
  ),
  /**
   * ติ๊ก "ไม่มีใบเสร็จ" → รายการของใบรับรองแทนใบเสร็จ (มติ PO U103 กติกาเดิม · U143) — ยอดรวมต้องเท่ายอดเบิก
   * มีใบเสร็จหรือใบรับรองอย่างใดอย่างหนึ่งเท่านั้น
   */
  substituteReceipt: substituteReceiptDraftSchema.nullable().default(null),
  /** คำอธิบายรายการ — `15` §7.1 ต้องการข้อความอิสระ เก็บที่ช่องหมายเหตุของ `expenses` */
  note: z.preprocess(
    (value) => (typeof value === 'string' && value.trim() === '' ? null : value),
    z.string().trim().max(500, 'หมายเหตุยาวเกินไป').nullable().default(null),
  ),
}).superRefine((value, ctx) => {
  const hasReceipt = value.receiptFileUrl !== null
  const substitute = value.substituteReceipt
  if (hasReceipt && substitute !== null) {
    ctx.addIssue({ code: 'custom', path: ['substituteReceipt'], message: 'แนบใบเสร็จแล้ว ไม่ต้องกรอกใบรับรองแทนใบเสร็จ' })
  }
  if (!hasReceipt && substitute === null) {
    ctx.addIssue({ code: 'custom', path: ['receiptFileUrl'], message: 'ต้องแนบใบเสร็จ หรือติ๊ก "ไม่มีใบเสร็จ" แล้วกรอกรายการ' })
  }
  if (substitute !== null) {
    const total = substitute.lines.reduce((sum, line) => sum + line.amountSatang, 0)
    if (total !== value.grossSatang) {
      ctx.addIssue({ code: 'custom', path: ['grossSatang'], message: 'ยอดเงินต้องเท่ากับยอดรวมของรายการในใบรับรองแทนใบเสร็จ' })
    }
  }
})

export type ClaimCreateInput = z.infer<typeof claimCreateSchema>
