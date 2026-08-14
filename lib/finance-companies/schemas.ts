import { z } from 'zod'
import { reasonSchema } from '@/lib/api/validation'
import { normalizeTaxId } from '@/lib/finance-companies/company'

/**
 * Zod schema ชุดเดียวใช้ร่วม FE/BE ของโมดูลบริษัทไฟแนนซ์ (ไฟล์ 10 · Rule 04 · Rule 13)
 *
 * จุดบังคับของไฟล์ 10: `tax_id` ตัวเลข 13 หลัก (format-only ไม่มี checksum — §7.1 🔶) ·
 * ผูก `service_fee_template_id` เสมอ (§9.1) · ระงับบริษัทต้องมีเหตุผล (§11 `SUSPEND_REASON_REQUIRED`)
 *
 * `reason` บังคับทุก mutation — `finance_companies` อยู่หมวด **เงิน** (`90` §13 · `10` §13)
 */

const uuidSchema = z.string().uuid('รูปแบบรหัสไม่ถูกต้อง')

export const invoiceDeliveryFormatSchema = z.enum(['e_tax_invoice', 'paper_pdf'])
export const companyStatusSchema = z.enum(['active', 'suspended'])

/** ตัวเลข 13 หลัก — ยอมให้พิมพ์ `-`/ช่องว่างคั่นแล้ว normalize ทิ้งก่อนตรวจ (`10` §7.1) */
export const taxIdSchema = z
  .string()
  .trim()
  .transform(normalizeTaxId)
  .refine((value) => /^\d{13}$/.test(value), 'เลขประจำตัวผู้เสียภาษีต้องเป็นตัวเลข 13 หลัก')

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .nullish()
    .transform((value) => (value === undefined || value === null || value === '' ? null : value))

const companyFields = z.object({
  name: z.string().trim().min(2, 'ชื่อบริษัทสั้นเกินไป').max(200, 'ชื่อบริษัทยาวเกินไป'),
  shortName: z.string().trim().min(1, 'ต้องระบุชื่อย่อ').max(20, 'ชื่อย่อยาวเกินไป'),
  taxId: taxIdSchema,
  address: optionalText(500),
  phone: optionalText(20),
  // ฟอร์มส่ง '' มาเมื่อไม่กรอก — แปลงเป็น null **ก่อน** ตรวจรูปแบบ ไม่งั้นค่าว่างจะติด error อีเมล
  email: z.preprocess(
    (value) => (value === '' || value === undefined ? null : value),
    z.string().trim().max(255).email('รูปแบบอีเมลไม่ถูกต้อง').nullable().default(null),
  ),
  contactName: optionalText(200),
  contactPhone: optionalText(20),
  signerName: optionalText(200),
  serviceFeeTemplateId: uuidSchema,
  vatRegistered: z.boolean().default(true),
  defaultInvoiceDeliveryFormat: invoiceDeliveryFormatSchema.default('paper_pdf'),
  billingDay: z.number().int().min(1, 'วันตัดรอบบิลต้องอยู่ระหว่าง 1-31').max(31, 'วันตัดรอบบิลต้องอยู่ระหว่าง 1-31').default(1),
  paymentDueDays: z.number().int().min(0, 'จำนวนวันครบกำหนดต้องไม่ติดลบ').max(365, 'จำนวนวันครบกำหนดยาวเกินไป').default(30),
})

/** ตัวบริษัทล้วน (ไม่มี `reason`) — FE ใช้ตรวจฟอร์มก่อนเปิดกล่องยืนยันเหตุผล */
export const financeCompanyFieldsSchema = companyFields

export const financeCompanyCreateSchema = companyFields.extend({ reason: reasonSchema })

/** PATCH ส่งค่าทั้งชุดเหมือนตอนสร้าง (ฟอร์มเดียวกัน) — การเปลี่ยนสถานะใช้ endpoint แยก */
export const financeCompanyUpdateSchema = financeCompanyCreateSchema

/**
 * ระงับ/เปิดใช้งานบริษัท (`10` §9.3) — แยก endpoint จาก PATCH เพราะเป็น transition ที่มี
 * กติกาของตัวเอง: ระงับต้องมีเหตุผล (ใช้ `reason` เดียวกันทั้ง audit และคอลัมน์ `suspended_reason`)
 */
export const financeCompanyStatusSchema = z.object({
  status: companyStatusSchema,
  reason: reasonSchema,
})

export const financeCompanyListQuerySchema = z.object({
  status: z.enum(['active', 'suspended', 'all']).default('all'),
  search: z.string().trim().min(1).max(200).optional(),
})

export type FinanceCompanyFieldsInput = z.infer<typeof financeCompanyFieldsSchema>
export type FinanceCompanyCreateInput = z.infer<typeof financeCompanyCreateSchema>
export type FinanceCompanyStatusInput = z.infer<typeof financeCompanyStatusSchema>
export type FinanceCompanyListQuery = z.infer<typeof financeCompanyListQuerySchema>
