import { z } from 'zod'
import {
  DEVICE_ASSET_KINDS,
  DEVICE_CATALOG_STATUSES,
  MAX_FILTER_BRANDS,
  MAX_RECENT_YEARS,
  MIN_RECENT_YEARS,
  cleanBrandList,
} from '@/lib/device-catalog/catalog'
import {
  MAX_ATTRIBUTE_LENGTH,
  MAX_ATTRIBUTE_OPTIONS,
  MAX_STALE_ALERT_DAYS,
  MIN_STALE_ALERT_DAYS,
  cleanAttributeOptions,
} from '@/lib/device-catalog/device-attributes'
import { TAC_SOURCES, parseTacInput } from '@/lib/device-catalog/tac'
import { IMEI_FORMAT_MESSAGE, parseImei } from '@/lib/warehouse/imei'

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

const attributeOptionsSchema = (label: string) =>
  z
    .array(z.string().max(MAX_ATTRIBUTE_LENGTH, `${label}ยาวเกิน ${MAX_ATTRIBUTE_LENGTH} ตัวอักษร`))
    .transform((values) => cleanAttributeOptions(values))
    .refine((values) => values.length >= 1, `ต้องมี${label}อย่างน้อย 1 รายการ`)
    .refine((values) => values.length <= MAX_ATTRIBUTE_OPTIONS, `ไม่เกิน ${MAX_ATTRIBUTE_OPTIONS} รายการ`)

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
  /** มติ PO U166 — ตัวเลือกความจุ/สีของฟอร์มรับเคส ("ไม่ระบุในสัญญา" ระบบใส่ให้เสมอ) */
  capacityOptions: attributeOptionsSchema('ตัวเลือกความจุ'),
  colorOptions: attributeOptionsSchema('ตัวเลือกสี'),
  /** มติ PO U167 — แหล่ง TAC ไม่อัปเดตเกิน N วัน ⇒ ป้ายเตือน */
  staleAlertDays: z
    .number({ error: 'จำนวนวันต้องเป็นตัวเลข' })
    .int('จำนวนวันต้องเป็นจำนวนเต็ม')
    .min(MIN_STALE_ALERT_DAYS, `อย่างน้อย ${MIN_STALE_ALERT_DAYS} วัน`)
    .max(MAX_STALE_ALERT_DAYS, `ไม่เกิน ${MAX_STALE_ALERT_DAYS} วัน`),
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

/**
 * "เลือกทั้งหมด / ไม่เลือกทั้งหมด" (มติ PO U162) — ตั้งการแสดงด้วยมือให้**ทุกรายการที่ตรงตัวกรอง/คำค้นปัจจุบัน**
 * (ทั้งชุด ไม่ใช่แค่หน้าที่เห็น) · เงื่อนไขชุดเดียวกับ query ของรายการ · เหตุผล**บังคับ** (กระทบหลายรายการในครั้งเดียว)
 */
const bulkReason = z
  .string({ error: 'กรุณาระบุเหตุผล' })
  .trim()
  .min(1, 'กรุณาระบุเหตุผล')
  .max(500, 'เหตุผลยาวเกิน 500 ตัวอักษร')

const bulkStatus = z.enum(DEVICE_CATALOG_STATUSES, { error: 'สถานะไม่ถูกต้อง' })
const bulkQuery = z.string().trim().max(120).optional()

export const deviceCatalogBulkVisibilitySchema = z.discriminatedUnion('target', [
  z.object({
    target: z.literal('brands'),
    manualStatus: bulkStatus,
    visibility: visibilityFilter,
    q: bulkQuery,
    reason: bulkReason,
  }),
  z.object({
    target: z.literal('models'),
    manualStatus: bulkStatus,
    visibility: visibilityFilter,
    assetKind: z.enum([...DEVICE_ASSET_KINDS, 'all']).default('all'),
    brandId: catalogIdSchema.optional(),
    q: bulkQuery,
    reason: bulkReason,
  }),
])

export type DeviceCatalogBulkVisibilityInput = z.infer<typeof deviceCatalogBulkVisibilitySchema>

export type DeviceBrandListQuery = z.infer<typeof deviceBrandListQuerySchema>
export type DeviceModelListQuery = z.infer<typeof deviceModelListQuerySchema>

/** ค้นหาตัวเลือกในฟอร์มรับเคส (combobox) */
export const deviceModelSearchQuerySchema = z.object({
  assetKind: deviceAssetKindSchema.optional(),
  q: z.string().trim().max(120).default(''),
  limit: z.coerce.number().int().min(1).max(50).default(20),
})

// ─── ฐาน TAC (มติ PO U166 · U167) ─────────────────────────────────

/** TAC 8 หลัก (ตัดช่องว่าง/ขีด/จุดได้) */
export const tacSchema = z
  .string({ error: 'กรุณาระบุ TAC' })
  .transform((value, ctx) => {
    const tac = parseTacInput(value)
    if (tac === null) {
      ctx.addIssue({ code: 'custom', message: 'TAC ต้องเป็นตัวเลข 8 หลัก (8 หลักแรกของ IMEI)' })
      return z.NEVER
    }
    return tac
  })

/** ฟอร์มรับเคสค้นยี่ห้อ/รุ่นจาก IMEI — แปลง/ตรวจด้วย `parseImei()` จุดเดียว (มติ PO U24) */
export const deviceTacLookupQuerySchema = z.object({
  imei: z
    .string({ error: 'กรุณาระบุ IMEI' })
    .max(40)
    .transform((value, ctx) => {
      const imei = parseImei(value)
      if (imei === null) {
        ctx.addIssue({ code: 'custom', message: IMEI_FORMAT_MESSAGE })
        return z.NEVER
      }
      return imei
    }),
})

export const deviceTacListQuerySchema = z.object({
  source: z.enum([...TAC_SOURCES, 'all']).default('all'),
  ...pageFields,
})

export type DeviceTacListQuery = z.infer<typeof deviceTacListQuerySchema>

/** ผู้ดูแลเพิ่ม/ผูก TAC เอง */
export const deviceTacBindSchema = z.object({
  tac: tacSchema,
  deviceModelId: catalogIdSchema,
  reason: optionalReason,
})

export type DeviceTacBindInput = z.infer<typeof deviceTacBindSchema>

/** ปุ่ม "อัปเดตตอนนี้" (+ "บังคับดึงใหม่") */
export const deviceTacUpdateRequestSchema = z.object({
  force: z.boolean().default(false),
})

/** "นำเข้าไฟล์เอง" — path ที่ได้จากการอัปโหลด (server ตรวจว่าเป็นขององค์กรผู้สั่ง) */
export const deviceTacImportRequestSchema = z.object({
  path: z.string().trim().min(1, 'กรุณาอัปโหลดไฟล์').max(1024),
})
