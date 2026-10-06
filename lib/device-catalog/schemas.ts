import { z } from 'zod'
import {
  DEVICE_ASSET_KINDS,
  DEVICE_CATALOG_STATUSES,
  MAX_FILTER_BRANDS,
  MAX_RECENT_YEARS,
  MIN_RECENT_YEARS,
  cleanBrandList,
} from '@/lib/device-catalog/catalog'

/**
 * Zod ของแคตตาล็อก Model Phone (มติ PO U155 → U159) — ใช้ร่วม FE/BE
 * ตารางแคตตาล็อกไม่กระทบเงิน/สิทธิ์/ธนาคาร/ภาษี ⇒ เหตุผลไม่บังคับ (ลง audit เมื่อกรอก)
 */

const optionalReason = z
  .string()
  .trim()
  .max(500, 'เหตุผลยาวเกิน 500 ตัวอักษร')
  .optional()
  .transform((value) => (value === undefined || value === '' ? null : value))

const catalogName = (label: string) =>
  z
    .string({ error: `กรุณาระบุ${label}` })
    .trim()
    .min(1, `กรุณาระบุ${label}`)
    .max(120, `${label}ยาวเกิน 120 ตัวอักษร`)

const releaseYearSchema = z
  .number({ error: 'ปีที่ออกต้องเป็นตัวเลข' })
  .int('ปีที่ออกต้องเป็นจำนวนเต็ม')
  .min(1990, 'ปีที่ออกไม่ถูกต้อง (ต้องไม่ก่อน พ.ศ. 2533)')
  .max(2100, 'ปีที่ออกไม่ถูกต้อง')

/** รหัสอ้างอิง — `z.guid()` (รูปแบบเดียวกับ Postgres `uuid`) แนวเดียวกับ `lib/uploads/targets.ts` */
export const catalogIdSchema = z.guid('รหัสอ้างอิงไม่ถูกต้อง')

export const deviceAssetKindSchema = z.enum(DEVICE_ASSET_KINDS, { error: 'เลือกประเภททรัพย์' })
/** ค่าที่ผู้ดูแลตั้งด้วยมือ — `null` = กลับไปใช้ตัวกรอง (U159) */
export const manualStatusSchema = z.enum(DEVICE_CATALOG_STATUSES, { error: 'สถานะไม่ถูกต้อง' }).nullable()

export const deviceCatalogSettingsSchema = z.object({
  brandNames: z
    .array(z.string().max(120, 'ชื่อแบรนด์ยาวเกิน 120 ตัวอักษร'))
    .transform((values) => cleanBrandList(values))
    .refine((values) => values.length <= MAX_FILTER_BRANDS, `ไม่เกิน ${MAX_FILTER_BRANDS} แบรนด์`),
  recentYears: z
    .number({ error: 'จำนวนปีต้องเป็นตัวเลข' })
    .int('จำนวนปีต้องเป็นจำนวนเต็ม')
    .min(MIN_RECENT_YEARS, `อย่างน้อย ${MIN_RECENT_YEARS} ปี`)
    .max(MAX_RECENT_YEARS, `ไม่เกิน ${MAX_RECENT_YEARS} ปี`),
  reason: optionalReason,
})

export const deviceBrandCreateSchema = z.object({
  name: catalogName('ชื่อแบรนด์'),
  reason: optionalReason,
})

export const deviceBrandUpdateSchema = z
  .object({
    name: catalogName('ชื่อแบรนด์').optional(),
    manualStatus: manualStatusSchema.optional(),
    reason: optionalReason,
  })
  .refine((value) => value.name !== undefined || value.manualStatus !== undefined, {
    message: 'ไม่มีข้อมูลที่จะแก้ไข',
    path: ['name'],
  })

export const deviceModelCreateSchema = z.object({
  brandId: catalogIdSchema,
  assetKind: deviceAssetKindSchema,
  name: catalogName('ชื่อรุ่น'),
  releaseYear: releaseYearSchema.nullable().optional(),
  reason: optionalReason,
})

export const deviceModelUpdateSchema = z
  .object({
    name: catalogName('ชื่อรุ่น').optional(),
    assetKind: deviceAssetKindSchema.optional(),
    manualStatus: manualStatusSchema.optional(),
    releaseYear: releaseYearSchema.nullable().optional(),
    reason: optionalReason,
  })
  .refine(
    (value) =>
      value.name !== undefined ||
      value.assetKind !== undefined ||
      value.manualStatus !== undefined ||
      value.releaseYear !== undefined,
    { message: 'ไม่มีข้อมูลที่จะแก้ไข', path: ['name'] },
  )

export const deviceModelBulkStatusSchema = z.object({
  ids: z.array(catalogIdSchema).min(1, 'เลือกอย่างน้อย 1 รายการ').max(500, 'เลือกได้ครั้งละไม่เกิน 500 รายการ'),
  manualStatus: manualStatusSchema,
  reason: optionalReason,
})

const pageFields = {
  q: z.string().trim().max(120).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(200).default(50),
}

/** visible/hidden = ผลการแสดงจริง · manual = เฉพาะที่ตั้งด้วยมือ */
const visibilityFilter = z.enum(['all', 'visible', 'hidden', 'manual']).default('all')

export const deviceBrandListQuerySchema = z.object({
  visibility: visibilityFilter,
  ...pageFields,
})

export const deviceModelListQuerySchema = z.object({
  visibility: visibilityFilter,
  assetKind: z.enum([...DEVICE_ASSET_KINDS, 'all']).default('all'),
  brandId: catalogIdSchema.optional(),
  ...pageFields,
})

export type DeviceBrandListQuery = z.infer<typeof deviceBrandListQuerySchema>
export type DeviceModelListQuery = z.infer<typeof deviceModelListQuerySchema>

/** ค้นหาตัวเลือกในฟอร์มรับเคส (combobox) */
export const deviceModelSearchQuerySchema = z.object({
  assetKind: deviceAssetKindSchema.optional(),
  q: z.string().trim().max(120).default(''),
  limit: z.coerce.number().int().min(1).max(50).default(20),
})
