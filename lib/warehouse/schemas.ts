import { z } from 'zod'
import { ASSET_STATUSES } from '@/lib/warehouse/asset-status'
import { imeiInputSchema } from '@/lib/warehouse/imei'
import { LOT_DOCUMENTS, LOT_STATUSES } from '@/lib/warehouse/lot-status'

/**
 * Zod ชุดเดียวใช้ร่วม FE/BE ของโมดูลคลัง (`44` §15 · `45` §6.4–6.5)
 *
 * คีย์ของ query ต้องตรงกับ `query` ใน `API_CONTRACT` เป๊ะ (มีเทสต์ยาม) — body ใช้ camelCase ตามโค้ด
 *
 * ⚠️ ช่องที่ "บังคับตามกติกาธุรกิจ" (สภาพเครื่อง / เหตุผลตีกลับ / ต้องเลือกเครื่องอย่างน้อย 1) จงใจ
 *    ปล่อยผ่าน schema แล้วไปตกที่ตัว assert ของโมดูล เพื่อให้ผู้ใช้เห็น code ของ `44` §12
 *    (`INTAKE_MISSING_CONDITION` / `REJECT_MISSING_REASON` / `EMPTY_LOT`) ไม่ใช่ `REQUIRED_MISSING`
 */

const trimmedText = z.string().trim()
const fileUrl = trimmedText.min(1).max(500)
const nullableText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .nullish()
    .transform((value) => (value === undefined || value === '' ? null : value))

const INPUT_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/

/**
 * ช่วงวันที่ของ filter — คงเป็น **string `YYYY-MM-DD` (ค.ศ.)** ตามที่ `<input type="date">` ส่งมา
 * (ข้อยกเว้นเดียวของ Rule 01) แล้วให้ชั้น query ประกอบเป็นช่วง UTC เอง
 */
const filterDate = trimmedText.regex(INPUT_DATE_PATTERN, 'วันที่ต้องเป็นรูปแบบ YYYY-MM-DD').refine((value) => {
  const parsed = new Date(`${value}T00:00:00.000Z`)
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value
}, 'ไม่ใช่วันที่ที่มีอยู่จริง')

/**
 * instant ที่ผู้ใช้เลือก (นัดรับ/วันส่งมอบจริง) — รับ ISO 8601 ที่ระบุโซนเวลา แล้วเก็บเป็น UTC
 * ⚠️ ปีต้องเป็น **ค.ศ.** — ตัวอย่างใน `44` §15 เขียนปี พ.ศ. (`2569-07-10T…`) ซึ่งเป็นรูปแบบ *display*
 *    ถ้าหลุดเข้ามาจริงจะกลายเป็นปี 2569 ค.ศ. ⇒ กันไว้ที่นี่ด้วยช่วงปีที่ยอมรับได้
 */
const instant = trimmedText.superRefine((value, ctx) => {
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) {
    ctx.addIssue({ code: 'custom', message: 'วันเวลาต้องเป็นรูปแบบ ISO 8601 (เช่น 2026-07-10T10:00:00+07:00)' })
    return
  }
  const year = parsed.getUTCFullYear()
  if (year < 2000 || year > 2200) {
    ctx.addIssue({ code: 'custom', message: 'ปีของวันเวลาต้องเป็น ค.ศ. (ระบบเก็บ UTC — แปลง พ.ศ. ที่หน้าจอ)' })
  }
})

const nullableInstant = instant.nullish().transform((value) => value ?? null)

/** ค่า filter ที่ส่งได้หลายค่าคั่นด้วย `,` (รูปแบบเดียวกับ `roleGroup` ของ `08`) */
function csvEnum<const T extends readonly [string, ...string[]]>(values: T) {
  return trimmedText
    .transform((value) => value.split(',').map((each) => each.trim()))
    .pipe(z.array(z.enum(values)).min(1))
}

// ── Assets (`44` §15) ───────────────────────────────────────────────────────

export const ASSET_CONDITIONS = ['normal', 'damaged', 'partial_loss'] as const

/** query ของ `GET /api/assets` — filter 8 ตัวตาม §8.2 + paging */
export const assetListQuerySchema = z.object({
  status: csvEnum(ASSET_STATUSES).optional(),
  companyId: z.guid().optional(),
  teamId: z.guid().optional(),
  agentId: z.guid().optional(),
  condition: z.enum(ASSET_CONDITIONS).optional(),
  search: trimmedText.min(1).max(100).optional(),
  dateFrom: filterDate.optional(),
  dateTo: filterDate.optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(200).default(50),
})

export type AssetListQuery = z.infer<typeof assetListQuerySchema>

/**
 * `POST /api/assets/:id/intake` (`44` §8.2 modal 3 ขั้น)
 * — IMEI ที่กรอกตัดได้เฉพาะช่องว่าง/ขีด/จุด แล้วต้องเป็นตัวเลข 15 หลักพอดี (มติ PO U24 · `parseImei()`)
 *   รูปแบบผิด = ปฏิเสธ (พิมพ์ผิด ไม่ใช่ "ไม่ตรงสัญญา") · ส่วน "ไม่ตรงกับสัญญา" เป็นแค่ **คำเตือน**
 *   ผ่านต่อได้ (`44` §12 `IMEI_MISMATCH`) · ค่าที่บันทึกเป็นตัวเลข 15 หลักล้วนเสมอ
 */
export const assetIntakeSchema = z.object({
  imeiActual: imeiInputSchema,
  serialActual: nullableText(100),
  condition: z.enum(ASSET_CONDITIONS).nullish().transform((value) => value ?? null),
  conditionNote: nullableText(1000),
  photos: z.array(fileUrl).max(20).default([]),
})

export type AssetIntakeInput = z.infer<typeof assetIntakeSchema>

/**
 * `POST /api/assets/:id/reject-intake` — ความว่างเปล่าถูกจับที่ `assertRejectReason()`
 * `imeiActual`/`serialActual` = ค่าที่ตรวจพบจริงบนเครื่องตอนตีกลับ (UAT BUG-075 — `44` §14 ต้องลง audit)
 * ไม่บังคับ (ตีกลับได้แม้อ่าน IMEI บนเครื่องไม่ได้) · ไม่ส่ง = คงค่าเดิมของเครื่อง · รูปแบบ IMEI ผ่าน `parseImei()`
 */
export const assetRejectIntakeSchema = z.object({
  rejectReason: z.string().max(1000).default(''),
  imeiActual: imeiInputSchema.optional(),
  serialActual: nullableText(100).optional(),
})

export type AssetRejectIntakeInput = z.infer<typeof assetRejectIntakeSchema>

// ── Handover Lots (`44` §15) ────────────────────────────────────────────────

export const HANDOVER_TYPES = ['finance_pickup', 'we_deliver'] as const

export const lotListQuerySchema = z.object({
  status: csvEnum(LOT_STATUSES).optional(),
  companyId: z.guid().optional(),
  type: z.enum(HANDOVER_TYPES).optional(),
  dateFrom: filterDate.optional(),
  dateTo: filterDate.optional(),
  /**
   * มติ PO U142 — ช่วง "วันส่งมอบ" ของแท็บ "ส่งมอบแล้ว" (วันตามปฏิทิน**ไทย** รวมทั้งสองขอบ)
   * วันส่งมอบ = วันส่งมอบจริง → ถ้ายังไม่มี (รอหลักฐาน) ใช้กำหนดส่ง → วันสร้างล็อต (`handoverDateWhere()`)
   */
  handedOverFrom: filterDate.optional(),
  handedOverTo: filterDate.optional(),
  search: trimmedText.min(1).max(100).optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(200).default(50),
})

export type LotListQuery = z.infer<typeof lotListQuerySchema>

/**
 * `GET /api/handover-lots/company-summary` (มติ PO U142) — ตัวกรองชุดเดียวกับ `lot.list`
 * ไม่มีแบ่งหน้า เพราะคืนยอดรวมต่อบริษัท (บริษัทในองค์กรมีหลักสิบ)
 */
export const lotCompanySummaryQuerySchema = lotListQuerySchema.omit({ page: true, limit: true })

export type LotCompanySummaryQuery = z.infer<typeof lotCompanySummaryQuerySchema>

/**
 * `POST /api/handover-lots` — 1 ล็อต = 1 บริษัท (`44` §6.2)
 * `assetIds` ต้องไม่ซ้ำกันเอง: ชั้น query นับจำนวนแถวที่ผูกสำเร็จเทียบกับความยาวลิสต์
 * เพื่อกันสองคนหยิบเครื่องชุดเดียวกัน — id ซ้ำจะทำให้การนับนั้นเพี้ยน
 *
 * `deliveryAddr` **บังคับเมื่อ `we_deliver`** (`44` §7.2) — `44` §12 ไม่มี error code สำหรับช่องนี้
 * จึงตกที่ validation กลาง (`REQUIRED_MISSING` + field error) ไม่ใช่ code ใหม่ (Rule 04)
 */
export const lotCreateSchema = z.object({
  companyId: z.guid('บริษัทไฟแนนซ์ไม่ถูกต้อง'),
  assetIds: z
    .array(z.guid('รหัสเครื่องไม่ถูกต้อง'))
    .max(500)
    .default([])
    .refine((ids) => new Set(ids).size === ids.length, 'เลือกเครื่องซ้ำกัน'),
  type: z.enum(HANDOVER_TYPES),
  scheduledAt: nullableInstant,
  contactPerson: nullableText(200),
  deliveryAddr: nullableText(500),
  trackingNo: nullableText(100),
  note: nullableText(1000),
}).superRefine((value, ctx) => {
  if (value.type === 'we_deliver' && value.deliveryAddr === null) {
    ctx.addIssue({
      code: 'custom',
      path: ['deliveryAddr'],
      message: 'ล็อตแบบ "เราจัดส่งไปให้" ต้องระบุที่อยู่จัดส่ง',
    })
  }
})

export type LotCreateInput = z.infer<typeof lotCreateSchema>

/**
 * `PATCH /api/handover-lots/:id/confirm` — ไม่ส่ง url มา = ใช้ไฟล์ที่แนบไว้ก่อนหน้า
 * ครบ/ไม่ครบตามชนิดล็อตถูกตัดสินที่ `assertLotConfirmDocuments()` (`44` §6.3)
 * `deliveredAt` ว่าง = ใช้เวลาที่กดยืนยัน
 */
export const lotConfirmSchema = z.object({
  deliveredAt: nullableInstant,
  signedDocUrl: fileUrl.nullish().transform((value) => value ?? null),
  deliveryProofUrl: fileUrl.nullish().transform((value) => value ?? null),
})

export type LotConfirmInput = z.infer<typeof lotConfirmSchema>

/**
 * `POST /api/handover-lots/:id/documents` — ผูกเอกสารที่อัปโหลดแล้วเข้าล็อต (มติ PO 03/10/2569 — UAT Q13 · หนี้ #1)
 * server ตรวจไฟล์เอง (มีจริง · อยู่ใต้ `handover-lots/<lotId>/<ชนิด>/` · ชนิดจากเนื้อไฟล์ · ขนาด) แล้วเก็บ SHA-256
 * ของ server · `fileHash` จาก browser ไม่บังคับ — ส่งมาแล้วไม่ตรง = `UPLOAD_HASH_MISMATCH`
 */
export const lotDocumentAttachSchema = z.object({
  document: z.enum(LOT_DOCUMENTS),
  fileUrl,
  fileHash: z
    .string()
    .trim()
    .regex(/^[a-f0-9]{64}$/i, 'file_hash ต้องเป็น SHA-256 (hex 64 ตัว)')
    .optional(),
})

export type LotDocumentAttachInput = z.infer<typeof lotDocumentAttachSchema>
