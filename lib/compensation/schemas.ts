import { z } from 'zod'
import { pctSchema, reasonSchema, satangSchema } from '@/lib/api/validation'

/**
 * Zod schema ชุดเดียวใช้ร่วม FE/BE ของโมดูลแผนค่าตอบแทน (ไฟล์ 11 · Rule 04 · Rule 13)
 *
 * หัวใจของไฟล์นี้คือ **conditional validation ของ Fuel Rule 2 โหมด** (`11` §7.1):
 * เลือกได้โหมดเดียวต่อแผน และฟิลด์ของอีกโหมดต้องไม่มีค่าเลย — ไม่ใช่แค่ซ่อนใน UI
 *
 * เงินทุกช่องเป็น **INTEGER satang** (Rule 01) · `wht_pct` เป็นเปอร์เซ็นต์ (`02` §2.2 ข้อยกเว้นเดียว)
 * `reason` บังคับทุก mutation เพราะ `compensation_plans` อยู่หมวด **เงิน** (`90` §13)
 */

export const fuelModeSchema = z.enum(['PER_KM', 'DAILY_FLAT'])
export const teamSideSchema = z.enum(['inhouse', 'outsource'])

/** `<input type="date">` ส่ง ISO ค.ศ. — ข้อยกเว้นเดียวของกฎ พ.ศ. (DEC-005) */
export const isoDateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'รูปแบบวันที่ไม่ถูกต้อง')
  .refine((value) => !Number.isNaN(Date.parse(`${value}T00:00:00Z`)), 'วันที่ไม่ถูกต้อง')

const planFieldsSchema = z.object({
  name: z.string().trim().min(2, 'ชื่อแผนสั้นเกินไป').max(120, 'ชื่อแผนยาวเกินไป'),
  side: teamSideSchema,

  fuelMode: fuelModeSchema,
  fuelRatePerKmSatang: satangSchema('อัตราค่าน้ำมันต่อกิโลเมตร').nullable().default(null),
  fuelMaxPerCaseSatang: satangSchema('เพดานค่าน้ำมันต่อเคส').nullable().default(null),
  fuelDailyFlatSatang: satangSchema('ค่าน้ำมันเหมาจ่ายรายวัน').nullable().default(null),

  allowanceSatang: satangSchema('เบี้ยเลี้ยง'),
  commissionSatang: satangSchema('ค่าคอมมิชชั่น (จ่ายเมื่อสำเร็จ)'),
  noSuccessFeeSatang: satangSchema('เบี้ยเสี่ยง (จ่ายเมื่อไม่สำเร็จ)'),

  hotelMaxPerNightSatang: satangSchema('ค่าที่พักสูงสุดต่อคืน').nullable().default(null),
  hotelReceiptRequired: z.boolean(),

  whtPct: pctSchema('อัตราหัก ณ ที่จ่าย'),
  effectiveFrom: isoDateSchema,
})

export type CompensationPlanFields = z.infer<typeof planFieldsSchema>

/**
 * Fuel Rule 2 โหมด (`11` §7.1) — เพดานของสองโหมดเป็นคนละตัวกัน ห้ามตั้งพร้อมกัน
 * `fuel_max_per_case` = null แปลว่า "ไม่จำกัดเพดาน" (ถูกต้อง ไม่ใช่ข้อมูลขาด)
 */
function refineFuelRule(value: CompensationPlanFields, ctx: z.RefinementCtx): void {
  if (value.fuelMode === 'PER_KM') {
    if (value.fuelRatePerKmSatang == null || value.fuelRatePerKmSatang <= 0) {
      ctx.addIssue({
        code: 'custom',
        path: ['fuelRatePerKmSatang'],
        message: 'โหมด PER_KM ต้องระบุอัตราค่าน้ำมันต่อกิโลเมตร',
      })
    }
    if (value.fuelDailyFlatSatang != null) {
      ctx.addIssue({
        code: 'custom',
        path: ['fuelDailyFlatSatang'],
        message: 'โหมด PER_KM ตั้งค่าเหมาจ่ายรายวันไม่ได้ (เลือกได้โหมดเดียว)',
      })
    }
    return
  }

  if (value.fuelDailyFlatSatang == null || value.fuelDailyFlatSatang <= 0) {
    ctx.addIssue({
      code: 'custom',
      path: ['fuelDailyFlatSatang'],
      message: 'โหมด DAILY_FLAT ต้องระบุค่าน้ำมันเหมาจ่ายรายวัน',
    })
  }
  if (value.fuelRatePerKmSatang != null) {
    ctx.addIssue({
      code: 'custom',
      path: ['fuelRatePerKmSatang'],
      message: 'โหมด DAILY_FLAT ตั้งค่าอัตราต่อกิโลเมตรไม่ได้ (เลือกได้โหมดเดียว)',
    })
  }
  if (value.fuelMaxPerCaseSatang != null) {
    ctx.addIssue({
      code: 'custom',
      path: ['fuelMaxPerCaseSatang'],
      message: 'เพดานต่อเคสใช้กับโหมด PER_KM เท่านั้น',
    })
  }
}

/** ตัวแผนล้วน (ไม่มี `reason`) — FE ใช้ตรวจฟอร์มก่อนเปิดกล่องยืนยันเหตุผล */
export const compensationPlanFieldsSchema = planFieldsSchema.superRefine(refineFuelRule)

export const compensationPlanCreateSchema = planFieldsSchema
  .extend({ reason: reasonSchema })
  .superRefine(refineFuelRule)

/** PATCH = สร้างเวอร์ชันใหม่ (`11` §14) จึงส่งค่าทั้งชุดเหมือนตอนสร้าง ไม่ใช่ partial patch */
export const compensationPlanUpdateSchema = compensationPlanCreateSchema

/** ปิด/เปิดใช้งานแผน — schema เก็บ soft delete ที่ `deleted_at` (`02` §2.4) ไม่มีคอลัมน์ `active` แยก */
export const compensationPlanActivationSchema = z.object({
  isActive: z.boolean(),
  reason: reasonSchema,
})

export const compensationPlanListQuerySchema = z.object({
  side: teamSideSchema.optional(),
  status: z.enum(['active', 'inactive', 'all']).default('active'),
})

export type CompensationPlanCreateInput = z.infer<typeof compensationPlanCreateSchema>
export type CompensationPlanUpdateInput = z.infer<typeof compensationPlanUpdateSchema>
export type CompensationPlanActivationInput = z.infer<typeof compensationPlanActivationSchema>
export type CompensationPlanListQuery = z.infer<typeof compensationPlanListQuerySchema>
