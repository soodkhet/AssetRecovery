import { z } from 'zod'
import { dateOnlySchema } from '@/lib/api/validation'
import { FIELD_GROUPS } from '@/lib/field/field-status'

/**
 * Zod ชุดเดียวใช้ร่วม FE/BE ของ Field Tracker (`41` §17.1 · `45` §6.3)
 *
 * คีย์ของ query ต้องตรงกับ `query` ใน `API_CONTRACT` เป๊ะ (มีเทสต์ยาม) — body ใช้ camelCase ตามโค้ด
 * ⚠️ **ห้ามมีช่องกรอกพิกัดมือ** (`41` §11) — `latitude`/`longitude` ของเช็คอินต้องมาจาก Geolocation API
 * ของอุปกรณ์เท่านั้น ยามชั้น BE อยู่ที่ `assertDeviceCoordinates()`
 */

const trimmedText = z.string().trim()
const fileUrl = trimmedText.min(1).max(500)
const fileList = z.array(fileUrl).max(50).default([])

const latitude = z.coerce.number().min(-90).max(90)
const longitude = z.coerce.number().min(-180).max(180)

/** มุมมองของแท็บ "รับงานแล้ว" (`41` §7.3) — `team` = read-only เห็นของเพื่อนร่วมทีมทั้งทีม */
export const FIELD_VIEWS = ['own', 'team'] as const
export type FieldView = (typeof FIELD_VIEWS)[number]

/** query ของ `GET /api/field/cases` — 4 กลุ่มสถานะตาม §7.2/§7.3/§7.5/§7.11 */
export const fieldCaseListQuerySchema = z.object({
  status: z.enum(FIELD_GROUPS).optional(),
  view: z.enum(FIELD_VIEWS).default('own'),
})

export type FieldCaseListQuery = z.infer<typeof fieldCaseListQuerySchema>

/** `POST /api/field/cases/:id/schedule` — วันที่ลงพื้นที่ (คอลัมน์ `DATE` ⇒ ต้องใช้ `dateOnlySchema`) */
export const scheduleCaseSchema = z.object({
  scheduleDate: dateOnlySchema('วันที่ลงพื้นที่'),
})

export type ScheduleCaseInput = z.infer<typeof scheduleCaseSchema>

/** `PATCH /api/field/cases/reorder` — ลำดับใหม่ทั้งวัน (`41` §8 `reorder_schedule`) */
export const reorderSchedulesSchema = z.object({
  date: dateOnlySchema('วันที่'),
  orderedCaseIds: z.array(z.uuid('รหัสเคสไม่ถูกต้อง')).min(1, 'ต้องมีอย่างน้อย 1 เคส').max(100),
})

export type ReorderSchedulesInput = z.infer<typeof reorderSchedulesSchema>

/** ประเภทจุดเช็คอิน (`02` §3 `checkin_type`) — ค่าเริ่มต้น = ที่อยู่ลูกหนี้ */
export const CHECKIN_TYPES = ['address', 'contact', 'workplace', 'asset_location'] as const

/** `POST /api/field/cases/:id/checkin` — พิกัดจาก device GPS จริงเท่านั้น */
export const checkinSchema = z.object({
  latitude,
  longitude,
  checkinType: z.enum(CHECKIN_TYPES).default('address'),
  /** `label` ของ §6.4 — ข้อความกำกับจุด (เช่น "บ้านลูกหนี้") */
  addressNote: trimmedText.max(500).optional(),
  note: trimmedText.max(1000).optional(),
})

export type CheckinInput = z.infer<typeof checkinSchema>

/** จุดเริ่มเดินทาง (`41` §6.4.1) — เดินทางมากับ draft ไม่มี endpoint แยกใน `45` §6.3 */
export const travelOriginSchema = z.object({
  latitude,
  longitude,
  source: z.enum(['gps_auto', 'manual_adjusted']).default('gps_auto'),
})

export type TravelOriginInput = z.infer<typeof travelOriginSchema>

const evidenceMediaShape = {
  photos: fileList,
  videos: fileList,
  productPhotos: fileList,
  audioUrl: fileUrl.nullish(),
}

/**
 * `POST /api/field/cases/:id/close-draft` — บันทึกเท่าที่กรอก ไม่บังคับครบ (`41` §6.5)
 * `travelOrigin` ที่ส่งมาพร้อม draft = ตอนกด "เริ่มงาน" (auto GPS) หรือหลังลากปรับตำแหน่ง
 */
export const closeDraftSchema = z.object({
  outcome: z.enum(['closed_success', 'closed_fail']).nullish(),
  ...evidenceMediaShape,
  note: trimmedText.max(2000).nullish(),
  travelOrigin: travelOriginSchema.optional(),
})

export type CloseDraftInput = z.infer<typeof closeDraftSchema>

/**
 * `POST /api/field/cases/:id/close` — ยืนยันปิดงาน
 * outcome ปล่อยเป็น optional ที่ schema เพื่อให้ error ที่ผู้ใช้เห็นเป็น `CLOSE_OUTCOME_REQUIRED`
 * ตาม `41` §12 ไม่ใช่ `REQUIRED_MISSING` (ตัวบังคับจริงอยู่ `assertCloseEvidence()`)
 */
export const closeCaseSchema = z.object({
  outcome: z.enum(['closed_success', 'closed_fail']).nullish(),
  ...evidenceMediaShape,
  note: trimmedText.max(2000).nullish(),
})

export type CloseCaseInput = z.infer<typeof closeCaseSchema>

/**
 * `POST /api/field/cases/:id/resubmit-close` (`41` §8 `resubmit_close_case`)
 * ส่งได้เฉพาะ **สื่อ** — outcome/เช็คอินล็อกตามเดิม (`41` §10.1) จึงไม่มีช่อง `outcome` ที่นี่โดยตั้งใจ
 */
export const resubmitCloseSchema = z.object({
  ...evidenceMediaShape,
  note: trimmedText.max(2000).nullish(),
})

export type ResubmitCloseInput = z.infer<typeof resubmitCloseSchema>

/** `POST /api/cases/:id/reject-evidence` (`41` §8 `reject_evidence`) — เจ้าหน้าที่อนุมัติเคสเท่านั้น */
export const rejectEvidenceSchema = z.object({
  reason: trimmedText.min(5, 'ต้องระบุเหตุผลอย่างน้อย 5 ตัวอักษร').max(1000),
})

export type RejectEvidenceInput = z.infer<typeof rejectEvidenceSchema>

/** `GET /api/field/expenses?type=` — 2 แท็บของ `41` §7.9 */
export const EXPENSE_VIEW_TYPES = ['caseBound', 'separate'] as const
export type ExpenseViewType = (typeof EXPENSE_VIEW_TYPES)[number]

export const fieldExpenseListQuerySchema = z.object({
  type: z.enum(EXPENSE_VIEW_TYPES).default('caseBound'),
})

export type FieldExpenseListQuery = z.infer<typeof fieldExpenseListQuerySchema>

/** `POST /api/field/expenses/hotel` (`41` §6.6 กลุ่มเบิกแยก) — ยอดเป็น satang จำนวนเต็มเสมอ (Rule 01) */
export const hotelClaimSchema = z.object({
  expenseDate: dateOnlySchema('วันที่เข้าพัก'),
  amountSatang: z.int().positive('จำนวนเงินต้องมากกว่า 0'),
  sharedWithUserId: z.uuid('ผู้พักร่วมไม่ถูกต้อง').nullish(),
  receiptFileUrl: fileUrl,
  note: trimmedText.max(1000).nullish(),
})

export type HotelClaimInput = z.infer<typeof hotelClaimSchema>

/** `POST /api/field/expenses/:id/resubmit` (`41` §8 `resubmit_expense`) — แก้เอกสาร/ยอดแล้วส่งใหม่ */
export const resubmitExpenseSchema = z.object({
  amountSatang: z.int().positive().optional(),
  receiptFileUrl: fileUrl.optional(),
  note: trimmedText.max(1000).nullish(),
})

export type ResubmitExpenseInput = z.infer<typeof resubmitExpenseSchema>

/** `POST /api/field/expenses/:id/reject` (`41` §8 `reject_expense`) — ผู้อนุมัติจ่ายเท่านั้น */
export const rejectExpenseSchema = z.object({
  reason: trimmedText.min(5, 'ต้องระบุเหตุผลอย่างน้อย 5 ตัวอักษร').max(1000),
})

export type RejectExpenseInput = z.infer<typeof rejectExpenseSchema>

/** `POST /api/field/reassignment/:id/respond` (`41` §8 · `40` §8) */
export const respondFieldReassignmentSchema = z.object({
  consent: z.boolean(),
  declineReason: trimmedText.max(1000).nullish(),
})

export type RespondFieldReassignmentInput = z.infer<typeof respondFieldReassignmentSchema>

/** `GET /api/field/income-summary?month=YYYY-MM` — ไม่ระบุเดือน = สะสมตลอด (`41` §7.10) */
export const incomeSummaryQuerySchema = z.object({
  month: z
    .string()
    .regex(/^\d{4}-(0[1-9]|1[0-2])$/, 'เดือนต้องอยู่ในรูปแบบ YYYY-MM (ค.ศ.)')
    .optional(),
})

export type IncomeSummaryQuery = z.infer<typeof incomeSummaryQuerySchema>

/** `POST /api/field/push/subscribe` (`41` §15) — payload ตรงกับ `PushSubscription.toJSON()` ของเบราว์เซอร์ */
export const pushSubscribeSchema = z.object({
  endpoint: trimmedText.min(1).max(1000),
  keys: z.object({
    p256dh: trimmedText.min(1).max(500),
    auth: trimmedText.min(1).max(500),
  }),
})

export type PushSubscribeInput = z.infer<typeof pushSubscribeSchema>
