import { z } from 'zod'
import { reasonSchema, satangSchema } from '@/lib/api/validation'

/**
 * Zod schema ชุดเดียวใช้ร่วม FE/BE ของโมดูลเทมเพลตค่าบริการ (ไฟล์ 12 · Rule 04 · Rule 13)
 *
 * หัวใจคือ **conditional validation ตาม model** (`12` §7.1):
 * | model | base | rate | basis | charge_on_fail |
 * |---|---|---|---|---|
 * | SUCCESS_FEE | ต้องเป็น 0 | บังคับ > 0 | บังคับ | ไม่ใช้ (บังคับ false) |
 * | FLAT | บังคับ > 0 | ต้องเป็น 0 | ต้องว่าง | ตั้งได้ทั้ง true/false |
 * | HYBRID | บังคับ > 0 | บังคับ > 0 | บังคับ | ตั้งได้ทั้ง true/false |
 *
 * ช่วงของ `rate` (0-100) **ไม่ได้เช็คที่นี่** — ใช้ code เฉพาะ `INVALID_RATE_RANGE` (`24` §6.1)
 * ผ่าน `assertRateRange()` ใน `lib/service-fee/template.ts` แทน `REQUIRED_MISSING` ทั่วไป
 */

export const serviceFeeModelSchema = z.enum(['SUCCESS_FEE', 'FLAT', 'HYBRID'])
export const serviceFeeBasisSchema = z.enum(['debt_amount', 'asset_value'])

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
  chargeOnFail: z.boolean(),
  /** A3 (มติ PO 2026-08-12) — คิดค่าบริการต่อรอบการติดตาม (แต่ละรอบอิสระ) */
  chargePerTrackingRound: z.boolean(),
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

  // `12` §7.1 — SUCCESS_FEE ไม่มี base จึงไม่ใช้ฟิลด์นี้ (เก็บ false เสมอ กัน UI เผลอส่ง true มาค้างใน DB)
  if (value.model === 'SUCCESS_FEE' && value.chargeOnFail) {
    ctx.addIssue({
      code: 'custom',
      path: ['chargeOnFail'],
      message: 'model SUCCESS_FEE เก็บเฉพาะเคสสำเร็จโดยนิยาม ตั้ง charge_on_fail ไม่ได้',
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
