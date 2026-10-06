import { z } from 'zod'
import { satangSchema } from '@/lib/api/validation'
import { DEBTOR_NATIONALITIES, DOCUMENT_MODES, DOCUMENT_SLOTS, isAcceptableAssetIdentifier } from '@/lib/cases/case'
import { IMEI_FORMAT_MESSAGE } from '@/lib/warehouse/imei'
import { CASE_STATUS_ACTIONS, CASE_STATUSES } from '@/lib/cases/state-machine'

/**
 * Zod ชุดเดียวใช้ร่วม FE/BE ของโมดูลรับเคส (ไฟล์ 38 §6) — Rule 13
 *
 * ⚠️ หลักการสำคัญ (`38` §11): **ฟิลด์ "required" ของ §6 เป็น optional ที่ชั้น schema**
 * เพราะทุกช่องทาง (API/Import/Manual) ต้องสร้าง `draft` ได้แม้ข้อมูลยังไม่ครบ — สิ่งเดียวที่ reject
 * ตั้งแต่ตอนสร้างคือ `case_ref` ซ้ำ · ความครบถ้วนถูกบังคับตอนขอขึ้น `pending_review`
 * ผ่าน `caseReadiness()` (`lib/cases/case.ts`) ไม่ใช่ที่ schema
 */

const trimmedText = z.string().trim()

/** ช่องข้อความที่ฟอร์มส่ง `''` มาเสมอ → แปลงเป็น `null` **ก่อน** ตรวจ (pattern เดียวกับโมดูล 1.8) */
function optionalText(max = 255) {
  return z.preprocess(
    (value) => (typeof value === 'string' && value.trim() === '' ? null : value),
    trimmedText.max(max).nullable().optional(),
  )
}

/** ที่อยู่ 1 ชุด (`38` §6.1.2) — ลำดับฟิลด์ตามฟอร์ม: detail → postalCode → province → district → subdistrict */
export const caseAddressSchema = z.object({
  detail: optionalText(500),
  postalCode: z.preprocess(
    (value) => (typeof value === 'string' && value.trim() === '' ? null : value),
    trimmedText.regex(/^\d{5}$/, 'รหัสไปรษณีย์ต้องเป็นตัวเลข 5 หลัก').nullable().optional(),
  ),
  province: optionalText(100),
  district: optionalText(100),
  subdistrict: optionalText(100),
})

export type CaseAddressInput = z.infer<typeof caseAddressSchema>

/** ผู้ติดต่ออื่น (`38` §6.1.3) — เพิ่มแถวแล้วต้องกรอกครบทั้ง 3 ช่อง */
export const caseContactSchema = z.object({
  contactName: trimmedText.min(1, 'กรุณาระบุชื่อผู้ติดต่อ').max(255),
  relationship: trimmedText.min(1, 'กรุณาระบุความสัมพันธ์').max(100),
  contactPhone: trimmedText.regex(/^\d{10}$/, 'เบอร์ผู้ติดต่อต้องเป็นตัวเลข 10 หลัก'),
})

export type CaseContactInput = z.infer<typeof caseContactSchema>

export const caseCreateSchema = z.object({
  /** เก็บค่าดิบ ไม่ถูกแก้ไข — ตัว normalize สำหรับเทียบซ้ำอยู่ที่ `normalizeCaseRef()` */
  caseRef: trimmedText.min(1, 'กรุณาระบุเลขที่สัญญา').max(100),
  financeCompanyId: z.guid('บริษัทไฟแนนซ์ไม่ถูกต้อง'),
  sourceChannel: z.enum(['manual', 'import', 'api']).default('manual'),

  debtorName: optionalText(255),
  debtorNationality: z.enum(DEBTOR_NATIONALITIES).nullable().optional(),
  debtorNationalityOther: optionalText(100),
  debtorNationalId: optionalText(13),
  debtorPassportNo: optionalText(100),
  debtorPhoneMobile: optionalText(20),
  debtorPhoneWork: optionalText(20),
  debtorLineId: optionalText(100),
  debtorFacebook: optionalText(255),

  addressCurrent: caseAddressSchema.optional(),
  addressWork: caseAddressSchema.optional(),
  addressIdCard: caseAddressSchema.optional(),

  contacts: z.array(caseContactSchema).max(50).optional(),

  assetType: z.enum(['smartphone', 'tablet']).nullable().optional(),
  assetBrandModel: optionalText(255),
  /**
   * มติ PO U155 — รุ่นในแคตตาล็อกที่เลือกจากรายการ (`null` = ระบุเอง) · server ตรวจว่าเป็นรุ่น active ของประเภททรัพย์นั้น
   * แล้วเก็บข้อความจากแคตตาล็อกเป็น snapshot · ใช้ไม่ได้ = เก็บข้อความที่ส่งมาตามเดิม (ไม่บล็อก)
   */
  deviceModelId: z.guid('รุ่นเครื่องไม่ถูกต้อง').nullable().optional(),
  /**
   * ช่องเดียวบนฟอร์ม — ไม่มีตัวอักษร = IMEI (ตัดช่องว่าง/ขีด/จุดได้ ต้องเหลือ 15 หลักพอดี · มติ PO U24)
   * มีตัวอักษร = serial · แยกคอลัมน์ที่ `splitAssetIdentifier()`
   */
  assetImeiSerial: optionalText(100).refine((value) => isAcceptableAssetIdentifier(value), {
    message: IMEI_FORMAT_MESSAGE,
  }),
  /** มูลหนี้คงเหลือ — **สตางค์** (Rule 01) FE แปลงจากบาทด้วย `parseBahtInput()` ก่อนส่ง */
  outstandingDebtSatang: satangSchema('มูลค่าหนี้คงเหลือ').nullable().optional(),

  /**
   * โหมดเอกสารแนบที่เลือกบนฟอร์ม — จำไว้ที่ `cases.document_mode` (มติ PO 04/10/2569 v3.4)
   * ไม่ส่ง = คงค่าเดิม (สร้างใหม่ = `separate`) · ขัดกับไฟล์ที่อัปโหลดแล้ว = `CASE_DOCUMENT_MODE_CONFLICT`
   */
  documentMode: z.enum(DOCUMENT_MODES).optional(),
  /** ติ๊ก "รูปสินค้ารวมอยู่ในไฟล์สัญญาแล้ว" — โหมดแยกประเภทไม่บังคับรูปสินค้าก่อนส่งตรวจ (v3.4) */
  productPhotoInContract: z.boolean().optional(),
})

export type CaseCreateInput = z.infer<typeof caseCreateSchema>

/**
 * แก้ไขเคส (`38` §8 edit_case) — ใช้ฟอร์มเดียวกับตอนสร้าง แก้ได้ทุก field รวม `case_ref`
 * `editNote` = หมายเหตุที่จะถูกบันทึกลง `case_edit_history` (`38` §6.4)
 */
export const caseUpdateSchema = caseCreateSchema
  .omit({ sourceChannel: true })
  .partial()
  .extend({ editNote: optionalText(500) })

export type CaseUpdateInput = z.infer<typeof caseUpdateSchema>

/** อัปโหลดเอกสารต่อ slot (`38` §6.3 · เอกสารชุด `bundle_doc` §6.3.2) — ไฟล์จริงขึ้น Storage แล้วส่ง metadata มาผูกกับเคส */
export const caseDocumentUploadSchema = z.object({
  documentType: z.enum(DOCUMENT_SLOTS),
  fileUrl: trimmedText.min(1, 'ไม่พบที่อยู่ไฟล์').max(1000),
  /**
   * SHA-256 hex 64 ตัวที่ browser คำนวณ (ไฟล์ 01) — **ไม่บังคับ และไม่ถูกเชื่อ**: server ดาวน์โหลดไฟล์มา
   * คำนวณเองแล้วเก็บค่าของ server · ส่งมาแล้วไม่ตรง = `UPLOAD_HASH_MISMATCH` (มติ PO 03/10/2569 UAT Q13)
   */
  fileHash: trimmedText.regex(/^[a-f0-9]{64}$/i, 'file_hash ต้องเป็น SHA-256 (hex 64 ตัว)').optional(),
  originalName: trimmedText.min(1).max(255),
  mimeType: trimmedText.min(1).max(150),
  sizeBytes: z.number().int('ขนาดไฟล์ต้องเป็นจำนวนเต็ม').positive('ขนาดไฟล์ต้องมากกว่า 0'),
})

export type CaseDocumentUploadInput = z.infer<typeof caseDocumentUploadSchema>

/**
 * `PATCH /api/cases/:id/status` (`38` §8/§17.1 · `45` §6.1)
 *
 * `reason` ใช้ได้ทั้งเป็นเหตุผลปฏิเสธ/ขอข้อมูลเพิ่ม และหมายเหตุคำขอรีไซเกิล — ตัวบังคับว่า action ไหน
 * ต้องมีค่าอยู่ที่ `assertStatusChange()` (`lib/cases/state-machine.ts`) ที่เดียว ไม่ซ้ำที่ schema
 * `teamId` = ทีมที่ผู้พิจารณายืนยันตอน `accept` (ต่างจากที่ระบบเสนอ ⇒ ต้องมี `teamChangeReason`)
 */
/** ลบเอกสารที่แนบผิด (มติ PO 04/10/2569 v3.4) — เหตุผลไม่บังคับ (ไม่กรอก = เหตุผลมาตรฐานลง audit) */
export const caseDocumentDeleteSchema = z.object({
  reason: optionalText(500),
})

export type CaseDocumentDeleteInput = z.infer<typeof caseDocumentDeleteSchema>

export const caseStatusChangeSchema = z.object({
  action: z.enum(CASE_STATUS_ACTIONS),
  reason: optionalText(1000),
  teamId: z.guid('ทีมไม่ถูกต้อง').nullable().optional(),
  teamChangeReason: optionalText(500),
  /**
   * ผู้ตรวจติ๊กยืนยันว่าเอกสารชุด (สแกนรวมเล่ม) มีสัญญาและบัตรประชาชนครบ — บังคับเฉพาะ `accept` ของเคสโหมดชุด
   * (มติ PO 04/10/2569 · ตัวบังคับอยู่ที่ `assertBundleConfirmed()`)
   */
  bundleDocumentsConfirmed: z.boolean().optional(),
})

export type CaseStatusChangeInput = z.infer<typeof caseStatusChangeSchema>

/**
 * `POST /api/cases/import` (`38` §17.1) — รับได้ 2 รูปแบบ
 * - `rows`: แถว object จากไฟล์ที่ wizard แปลงมาแล้ว (Excel ผ่าน SheetJS ฝั่ง client)
 * - `csv`: เนื้อไฟล์ CSV ดิบ (backend แยกเองด้วย `parseCsv()` — ไม่ต้องพึ่ง dependency เพิ่ม)
 *
 * `dryRun` = ตรวจอย่างเดียวเพื่อ preview ก่อนยืนยัน (`38` §7.1 — mapping + preview ก่อนนำเข้า)
 */
export const caseImportSchema = z
  .object({
    financeCompanyId: z.guid('บริษัทไฟแนนซ์ไม่ถูกต้อง'),
    rows: z.array(z.record(z.string(), z.unknown())).max(1000, 'นำเข้าได้สูงสุด 1,000 แถวต่อครั้ง').optional(),
    csv: z.string().max(5_000_000).optional(),
    dryRun: z.boolean().default(false),
  })
  .refine((value) => value.rows !== undefined || value.csv !== undefined, {
    message: 'ต้องส่งข้อมูลนำเข้าอย่างน้อย 1 รูปแบบ (rows หรือ csv)',
    path: ['rows'],
  })

export type CaseImportInput = z.infer<typeof caseImportSchema>

/** query ของ `GET /api/cases` — คีย์ต้องตรงกับ `query` ของ `case.list` ใน contract (`45` §6.1) */
export const caseListQuerySchema = z.object({
  status: z.enum(CASE_STATUSES).optional(),
  source_channel: z.enum(['manual', 'import', 'api']).optional(),
  finance_company_id: z.guid().optional(),
  province: trimmedText.min(1).max(100).optional(),
  search: trimmedText.min(1).max(100).optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
})

export type CaseListQuery = z.infer<typeof caseListQuerySchema>
