import { z } from 'zod'
import { reasonSchema, satangSchema } from '@/lib/api/validation'

/**
 * Zod schema ชุดเดียวใช้ร่วม FE/BE ของโมดูลเทมเพลตค่าบริการ (ไฟล์ 12 · Rule 04 · Rule 13)
 *
 * หัวใจคือ **conditional validation ตาม model** (`12` §7.1):
 * | model | base | rate | basis | fail_fee (มติ U165) |
 * |---|---|---|---|---|
 * | SUCCESS_FEE | ต้องเป็น 0 | บังคับ > 0 | บังคับ | `null` หรือ > 0 |
 * | FLAT | บังคับ > 0 | ต้องเป็น 0 | ต้องว่าง | `null` หรือ > 0 |
 * | HYBRID | บังคับ > 0 | บังคับ > 0 | บังคับ | `null` หรือ > 0 |
 *
 * `failFeeSatang` เป็น key บังคับ (ส่ง `null` = ไม่เก็บกรณีไม่สำเร็จ) — request เก่าที่ส่ง `chargeOnFail`
 * มาโดยไม่มี `failFeeSatang` ได้ 400 แทนการเงียบตัดทิ้ง (กันเทมเพลตที่เคยเก็บกรณีไม่สำเร็จหลุดเป็นไม่เก็บ)
 *
 * ช่วงของ `rate` (0-100) **ไม่ได้เช็คที่นี่** — ใช้ code เฉพาะ `INVALID_RATE_RANGE` (`24` §6.1)
 * ผ่าน `assertRateRange()` ใน `lib/service-fee/template.ts` แทน `REQUIRED_MISSING` ทั่วไป
 */

export const serviceFeeModelSchema = z.enum(['SUCCESS_FEE', 'FLAT', 'HYBRID'])
/** มติ PO U126 — ฐานคำนวณเหลือยอดหนี้คงเหลืออย่างเดียว */
export const serviceFeeBasisSchema = z.enum(['debt_amount'])

const templateFieldsSchema = z.object({
  name: z.string().trim().min(2, 'ชื่อเทมเพลตสั้นเกินไป').max(120, 'ชื่อเทมเพลตยาวเกินไป'),
  model: serviceFeeModelSchema,
  baseSatang: satangSchema('ค่าบริการตั้งต้น (base)'),
  ratePct: z
    .number({ message: 'อัตราค่าความสำเร็จต้องเป็นตัวเลข' })
    .refine(
      (value) => Math.abs(value * 100 - Math.round(value * 100)) < 1e-9,
      'อัตราค่าความสำเร็จมีทศนิยมได้ไม่เกิน 2 ตำแหน่ง',
    ),
  basis: serviceFeeBasisSchema.nullable().default(null),
  failFeeSatang: satangSchema('ค่าบริการกรณีไม่สำเร็จ').nullable(),
})

export type ServiceFeeTemplateFields = z.infer<typeof templateFieldsSchema>

function refineByModel(value: ServiceFeeTemplateFields, ctx: z.RefinementCtx): void {
  const needsRate = value.model === 'SUCCESS_FEE' || value.model === 'HYBRID'
  const needsBase = value.model === 'FLAT' || value.model === 'HYBRID'

  if (needsBase && value.baseSatang <= 0) {
    ctx.addIssue({
      code: 'custom',
      path: ['baseSatang'],
      message: `model ${value.model} ต้องระบุค่าบริการตั้งต้น (base)`,
    })
  }
  if (!needsBase && value.baseSatang !== 0) {
    ctx.addIssue({
      code: 'custom',
      path: ['baseSatang'],
      message: 'model SUCCESS_FEE ไม่มีค่าบริการตั้งต้น (ต้องเป็น 0)',
    })
  }

  if (needsRate && value.ratePct <= 0) {
    ctx.addIssue({
      code: 'custom',
      path: ['ratePct'],
      message: `model ${value.model} ต้องระบุอัตราค่าความสำเร็จ`,
    })
  }
  if (!needsRate && value.ratePct !== 0) {
    ctx.addIssue({
      code: 'custom',
      path: ['ratePct'],
      message: 'model FLAT ไม่คิดตามเปอร์เซ็นต์ (อัตราต้องเป็น 0)',
    })
  }

  if (needsRate && value.basis == null) {
    ctx.addIssue({ code: 'custom', path: ['basis'], message: 'ต้องเลือกฐานคำนวณเมื่อมีอัตราค่าความสำเร็จ' })
  }
  if (!needsRate && value.basis != null) {
    ctx.addIssue({ code: 'custom', path: ['basis'], message: 'model FLAT ไม่ใช้ฐานคำนวณ' })
  }

  // มติ U165 — ติ๊ก "เรียกเก็บกรณีไม่สำเร็จ" แล้วต้องกรอกยอด > 0 (ไม่เก็บ = ส่ง null)
  if (value.failFeeSatang !== null && value.failFeeSatang <= 0) {
    ctx.addIssue({
      code: 'custom',
      path: ['failFeeSatang'],
      message: 'ระบุค่าบริการกรณีไม่สำเร็จมากกว่า 0 — ถ้าไม่เรียกเก็บให้เอาเครื่องหมายออก',
    })
  }
}

/** ตัวเทมเพลตล้วน (ไม่มี `reason`) — FE ใช้ตรวจฟอร์มก่อนเปิดกล่องยืนยันเหตุผล */
export const serviceFeeTemplateFieldsSchema = templateFieldsSchema.superRefine(refineByModel)

export const serviceFeeTemplateCreateSchema = templateFieldsSchema
  .extend({ reason: reasonSchema })
  .superRefine(refineByModel)

/** PATCH = สร้างเวอร์ชันใหม่ (`12` §9) จึงส่งค่าทั้งชุดเหมือนตอนสร้าง ไม่ใช่ partial patch */
export const serviceFeeTemplateUpdateSchema = serviceFeeTemplateCreateSchema

/** ปิด/เปิดใช้งานเทมเพลต — `active` ของ `12` §7.1 เก็บที่ `deleted_at` (`02` §2.4 ไม่มีคอลัมน์ `active`) */
export const serviceFeeTemplateActivationSchema = z.object({
  isActive: z.boolean(),
  reason: reasonSchema,
})

export const serviceFeeTemplateListQuerySchema = z.object({
  model: serviceFeeModelSchema.optional(),
  status: z.enum(['active', 'inactive', 'all']).default('active'),
})

export type ServiceFeeTemplateCreateInput = z.infer<typeof serviceFeeTemplateCreateSchema>
export type ServiceFeeTemplateUpdateInput = z.infer<typeof serviceFeeTemplateUpdateSchema>
export type ServiceFeeTemplateActivationInput = z.infer<typeof serviceFeeTemplateActivationSchema>
export type ServiceFeeTemplateListQuery = z.infer<typeof serviceFeeTemplateListQuerySchema>
