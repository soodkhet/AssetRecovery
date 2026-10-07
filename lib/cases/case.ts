import { CaseError } from '@/lib/cases/errors'
import { isImeiLikeIdentifier, parseImei } from '@/lib/warehouse/imei'
import type { AddressValue } from '@/lib/address/address-value'

/**
 * กติกาข้อมูลของโมดูลรับเคส (ไฟล์ 38 §6, §11, §12) — **pure ล้วน ใช้ร่วม FE/BE**
 * ห้าม import อะไรที่แตะ Prisma/`next/*` (ฟอร์มฝั่ง client เรียกตัว validate ชุดเดียวกับ API)
 *
 * แยกจากชั้นข้อมูล (`lib/cases/queries.ts`) ตามแนวเดียวกับโมดูลอื่น
 */

// ── สัญชาติ / เอกสารยืนยันตัวตน (`38` §6.1.1) ────────────────────────────────

export const DEBTOR_NATIONALITIES = ['TH', 'MM', 'LA', 'KH', 'OTHER'] as const
export type DebtorNationalityCode = (typeof DEBTOR_NATIONALITIES)[number]

export const DEBTOR_NATIONALITY_LABEL: Record<DebtorNationalityCode, string> = {
  TH: 'ไทย',
  MM: 'พม่า',
  LA: 'ลาว',
  KH: 'กัมพูชา',
  OTHER: 'อื่นๆ (ระบุ)',
}

/** สัญชาติไทย = เลขบัตรประชาชน 13 หลัก · สัญชาติอื่น = passport/เอกสารอื่น (free text) */
export function identityDocumentKind(nationality: DebtorNationalityCode): 'national_id' | 'passport' {
  return nationality === 'TH' ? 'national_id' : 'passport'
}

// ── รูปแบบตัวเลขที่บังคับ (`38` §6.1 · §12) ──────────────────────────────────

const DIGITS_ONLY = /^\d+$/

/** ตัวกรอง input ฝั่งฟอร์ม — ตัดทุกอย่างที่ไม่ใช่ตัวเลขทิ้งตั้งแต่ตอนพิมพ์ (`38` §6.1.1) */
export function digitsOnly(value: string): string {
  return value.replace(/\D/g, '')
}

/** เพดานจำนวนตัวอักษรที่ช่องเบอร์โทรรับตอนวาง (มีตัวคั่น/รหัสประเทศ/ข้อความเบอร์ต่อ) — ให้ browser ไม่ตัดก่อนถึง {@link normalizePhoneInput} */
export const PHONE_INPUT_MAX_LENGTH = 32
/** ตัวเลขที่เก็บในช่องได้มากสุด — เกิน 10 ได้เพื่อให้ผู้ใช้**เห็น** error แทนการตัดทิ้งเงียบ */
const PHONE_INPUT_MAX_DIGITS = 15
const PHONE_MAX_DIGITS = 10

const THAI_DIGIT_ZERO = 0x0e50
const FULLWIDTH_DIGIT_ZERO = 0xff10

/**
 * เลขไทย (๐-๙) / เลขเต็มความกว้าง (０-９) และ `＋` เต็มความกว้าง → ASCII (preship R3-030)
 * แป้นพิมพ์ไทย/IME บางตัวส่งเลขเหล่านี้มา — เดิมถูก `digitsOnly()` ตัดทิ้งเงียบจนเบอร์หายทั้งเบอร์
 * แทนที่ทีละตัว ความยาวสตริงเท่าเดิม (ตำแหน่ง cursor ไม่เลื่อน)
 */
export function toAsciiDigits(value: string): string {
  return value.replace(/[\u0E50-\u0E59\uFF10-\uFF19\uFF0B]/g, (char) => {
    const code = char.charCodeAt(0)
    if (code === 0xff0b) return '+'
    return String(code >= FULLWIDTH_DIGIT_ZERO ? code - FULLWIDTH_DIGIT_ZERO : code - THAI_DIGIT_ZERO)
  })
}

/**
 * ค่าที่พิมพ์/วางในช่องเบอร์โทร → ตัวเลขล้วน (preship R2-008)
 * - รูปแบบสากล `+66 81-234-5678` / `66812345678` ⇒ `0812345678` (เดิมกลายเป็น `6681234567` แล้วผ่านเงียบ)
 * - ตัดตัวคั่นทิ้ง แต่**ไม่ตัดความยาว** — ตัวเลขเกิน (เช่นวางเบอร์ต่อมาด้วย) ต้องขึ้น error ให้แก้ ไม่หายเงียบ
 * - เลขไทย/เลขเต็มความกว้างแปลงเป็นเลขอารบิกก่อน ไม่ถูกตัดทิ้ง (R3-030)
 */
export function normalizePhoneInput(raw: string): string {
  const trimmed = toAsciiDigits(raw).trim()
  let digits = digitsOnly(trimmed)
  const international = /^\+\s*66/.test(trimmed) || (digits.length === 11 && digits.startsWith('66'))
  if (international) {
    const local = digits.slice(2)
    digits = local.startsWith('0') ? local : `0${local}`
  }
  return digits.slice(0, PHONE_INPUT_MAX_DIGITS)
}

/**
 * {@link normalizePhoneInput} พร้อมตำแหน่ง cursor ใหม่ — ช่องเบอร์โทรเก็บค่าเป็นตัวเลขล้วนทุกครั้งที่พิมพ์
 * ถ้าไม่คืนตำแหน่ง cursor เอง การพิมพ์ขีด/เว้นวรรคกลางเบอร์จะทำให้ cursor กระโดดไปท้ายช่อง (preship R3-030)
 * ตำแหน่งใหม่ = จำนวนตัวเลขก่อน cursor เดิม (ปรับตามส่วนต่างจากการแปลง +66 / ตัดความยาว)
 */
export function normalizePhoneInputWithCaret(raw: string, caret: number | null): { value: string; caret: number } {
  const value = normalizePhoneInput(raw)
  const ascii = toAsciiDigits(raw)
  const position = caret === null ? ascii.length : Math.min(Math.max(caret, 0), ascii.length)
  const digitsBefore = digitsOnly(ascii.slice(0, position)).length
  const delta = value.length - digitsOnly(ascii).length
  return { value, caret: Math.min(Math.max(digitsBefore + (digitsBefore > 0 ? delta : 0), 0), value.length) }
}

/** error ระหว่างกรอก — แจ้งเฉพาะตัวเลขเกิน (สั้นกว่าระหว่างพิมพ์เป็นเรื่องปกติ ตรวจตอนบันทึก) */
export function phoneInputError(value: string): string | null {
  if (value.length <= PHONE_MAX_DIGITS) return null
  return `ตัวเลขเกิน ${PHONE_MAX_DIGITS} หลัก — ใส่เฉพาะเบอร์หลัก (ไม่ต้องใส่เบอร์ต่อ)`
}

/** เลขบัตรประชาชนไทย — 13 หลักพอดี ตัวเลขล้วน (ไม่มี checksum ตามสเปค) */
export function isValidNationalId(value: string): boolean {
  return value.length === 13 && DIGITS_ONLY.test(value)
}

/** เบอร์มือถือลูกหนี้/ผู้ติดต่อ — 10 หลักพอดี ตัวเลขล้วน ไม่รับขีด/วงเล็บ/เว้นวรรค */
export function isValidMobilePhone(value: string): boolean {
  return value.length === 10 && DIGITS_ONLY.test(value)
}

/** เบอร์ที่ทำงาน — 9-10 หลัก (รองรับเบอร์บ้าน/เบอร์ต่อสายที่สั้นกว่ามือถือ) */
export function isValidWorkPhone(value: string): boolean {
  return value.length >= 9 && value.length <= 10 && DIGITS_ONLY.test(value)
}

/**
 * ตรวจรูปแบบเลขบัตร/เบอร์โทรของ payload หนึ่งชุด — โยน `CASE_INVALID_NATIONAL_ID` /
 * `CASE_INVALID_PHONE_FORMAT` ตาม `38` §12 (Zod จับรูปแบบระดับ field ให้อีกชั้นก่อนถึงที่นี่)
 *
 * ค่าที่ยังไม่กรอก (`null`/`undefined`/ว่าง) **ไม่ผิด** — เคสจาก API สร้าง draft ได้แม้ข้อมูลไม่ครบ (`38` §11)
 */
export function assertIdentityFormats(values: {
  nationality?: DebtorNationalityCode | null
  nationalId?: string | null
  phoneMobile?: string | null
  phoneWork?: string | null
  contactPhones?: readonly (string | null | undefined)[]
}): void {
  const nationalId = values.nationalId?.trim()
  if (nationalId !== undefined && nationalId !== '' && !isValidNationalId(nationalId)) {
    throw new CaseError('CASE_INVALID_NATIONAL_ID', { context: { field: 'debtor_national_id' } })
  }

  const mobile = values.phoneMobile?.trim()
  if (mobile !== undefined && mobile !== '' && !isValidMobilePhone(mobile)) {
    throw new CaseError('CASE_INVALID_PHONE_FORMAT', { context: { field: 'debtor_phone_mobile' } })
  }

  const work = values.phoneWork?.trim()
  if (work !== undefined && work !== '' && !isValidWorkPhone(work)) {
    throw new CaseError('CASE_INVALID_PHONE_FORMAT', { context: { field: 'debtor_phone_work' } })
  }

  for (const [index, phone] of (values.contactPhones ?? []).entries()) {
    const contactPhone = phone?.trim()
    if (contactPhone !== undefined && contactPhone !== '' && !isValidMobilePhone(contactPhone)) {
      throw new CaseError('CASE_INVALID_PHONE_FORMAT', { context: { field: `contacts.${index}.phone` } })
    }
  }
}

// ── เอกสารแนบ (`38` §6.3 · §6.3.1) ───────────────────────────────────────────

export const DOCUMENT_SLOTS = ['contract_doc', 'national_id_doc', 'product_photo', 'other_doc', 'bundle_doc'] as const
export type DocumentSlot = (typeof DOCUMENT_SLOTS)[number]

export const DOCUMENT_SLOT_LABEL: Record<DocumentSlot, string> = {
  contract_doc: 'สัญญาเช่าซื้อ/สัญญาผ่อนชำระ',
  national_id_doc: 'บัตรประชาชน/Passport ลูกหนี้',
  product_photo: 'รูปสินค้า',
  other_doc: 'เอกสารอื่นจากไฟแนนซ์',
  bundle_doc: 'เอกสารชุด (สแกนรวมเล่ม)',
}

/** slot ที่ต้องมีอย่างน้อย 1 ไฟล์ก่อนเข้าสถานะ `pending_review` (`38` §6.3 ตาราง + §6.3.1) — โหมดแยกตามประเภท */
export const REQUIRED_DOCUMENT_SLOTS: readonly DocumentSlot[] = ['contract_doc', 'national_id_doc', 'product_photo']

/**
 * โหมดเอกสารแนบของเคส (`38` §6.3.2 — มติ PO 04/10/2569 UAT เอกสารชุดเดียว)
 * - `separate` = แยกตามประเภท (ค่าเริ่มต้น — พฤติกรรมเดิมทุกเคส)
 * - `bundle`   = พาร์ทเนอร์ส่งเอกสาร 1 ชุดเย็บเล่ม แอดมินสแกนเป็นไฟล์ `bundle_doc` (1 ไฟล์ขึ้นไป)
 *
 * โหมดที่ผู้ใช้เลือกถูก **จำไว้ที่ `cases.document_mode`** (v3.4 — มติ PO 04/10/2569 จำโหมด) แต่ไฟล์ชนะเสมอ:
 * มี `bundle_doc` ที่ยังไม่ถูกลบ ≥ 1 = `bundle` (`effectiveDocumentMode()`) · ฝั่ง server จัดคอลัมน์ให้ตรงกับไฟล์
 * ทุกครั้งที่แนบ (`documentModeAfterAdding()`) · `assertDocumentModeCompatible()` กันไม่ให้สองโหมดปนกันในเคสเดียว
 */
export const DOCUMENT_MODES = ['separate', 'bundle'] as const
export type DocumentMode = (typeof DOCUMENT_MODES)[number]

export const DOCUMENT_MODE_LABEL: Record<DocumentMode, string> = {
  separate: 'แยกตามประเภท',
  bundle: 'เอกสารชุดเดียว (สแกนรวมเล่ม)',
}

/** slot ที่เป็น "ตัวแทน" ของโหมดแยกประเภท — ปนกับ `bundle_doc` ในเคสเดียวกันไม่ได้ */
export const SEPARATE_ONLY_SLOTS: readonly DocumentSlot[] = ['contract_doc', 'national_id_doc']

export function isDocumentSlot(value: string): value is DocumentSlot {
  return (DOCUMENT_SLOTS as readonly string[]).includes(value)
}

export type DocumentCounts = Partial<Record<DocumentSlot, number>>

export function documentModeOf(counts: DocumentCounts): DocumentMode {
  return (counts.bundle_doc ?? 0) > 0 ? 'bundle' : 'separate'
}

/** นับไฟล์ต่อ slot จากรายการเอกสาร (ข้ามชนิดที่ไม่รู้จัก) — ใช้ทั้ง FE/BE */
export function countDocuments(documents: ReadonlyArray<{ documentType: string }>): DocumentCounts {
  const counts: DocumentCounts = {}
  for (const document of documents) {
    if (!isDocumentSlot(document.documentType)) continue
    counts[document.documentType] = (counts[document.documentType] ?? 0) + 1
  }
  return counts
}

/**
 * ค่าที่บันทึกไว้ที่เคส ซึ่งมีผลกับเงื่อนไขเอกสารก่อนส่งตรวจ (v3.4 — มติ PO 04/10/2569)
 * - `documentMode` = `cases.document_mode` (ไม่ส่ง = อนุมานจากไฟล์อย่างเดียว)
 * - `productPhotoInContract` = ติ๊ก "รูปสินค้ารวมอยู่ในไฟล์สัญญาแล้ว" (มีผลเฉพาะโหมดแยกประเภท)
 */
export interface DocumentRequirementOptions {
  documentMode?: DocumentMode | string | null
  productPhotoInContract?: boolean | null
}

export function isDocumentMode(value: unknown): value is DocumentMode {
  return typeof value === 'string' && (DOCUMENT_MODES as readonly string[]).includes(value)
}

/** โหมดที่มีผลจริง — ไฟล์ชนะคอลัมน์: มี `bundle_doc` = `bundle` เสมอ ไม่งั้นใช้ค่าที่บันทึกไว้ (ค่าเริ่มต้น `separate`) */
export function effectiveDocumentMode(counts: DocumentCounts, stored?: DocumentMode | string | null): DocumentMode {
  if ((counts.bundle_doc ?? 0) > 0) return 'bundle'
  return isDocumentMode(stored) ? stored : 'separate'
}

/**
 * slot ที่ต้องมี ≥ 1 ไฟล์ก่อนส่งตรวจ ต่อโหมด
 * - `bundle` → `bundle_doc` (นับแทนสัญญา + บัตรประชาชน · รูปสินค้าไม่บังคับ — `38` §6.3.2)
 * - `separate` → สัญญา + บัตรประชาชน + รูปสินค้า — ติ๊ก "รูปสินค้ารวมอยู่ในไฟล์สัญญาแล้ว" = ไม่บังคับรูปสินค้า (v3.4)
 */
export function requiredDocumentSlots(mode: DocumentMode, productPhotoInContract = false): readonly DocumentSlot[] {
  if (mode === 'bundle') return ['bundle_doc']
  return productPhotoInContract
    ? REQUIRED_DOCUMENT_SLOTS.filter((slot) => slot !== 'product_photo')
    : REQUIRED_DOCUMENT_SLOTS
}

/** slot บังคับที่ยังไม่มีไฟล์ — ใช้ทั้งบน UI (แสดงว่าขาดอะไร) และตอน gate `pending_review` */
export function missingRequiredDocuments(
  counts: DocumentCounts,
  options: DocumentRequirementOptions = {},
): DocumentSlot[] {
  const mode = effectiveDocumentMode(counts, options.documentMode)
  // โหมดชุดที่ยังไม่มีไฟล์ชุดเลย แต่บันทึกโหมดไว้ = ขาด "เอกสารชุด" · ไม่บันทึกโหมด = แสดงตามโหมดแยกประเภท (เดิม)
  return requiredDocumentSlots(mode, options.productPhotoInContract === true).filter(
    (slot) => (counts[slot] ?? 0) < 1,
  )
}

/** gate ก่อนเปลี่ยนสถานะเป็น `pending_review` (`38` §12 `CASE_DOCUMENT_INCOMPLETE`) */
export function assertDocumentsComplete(counts: DocumentCounts, options: DocumentRequirementOptions = {}): void {
  const missing = missingRequiredDocuments(counts, options)
  if (missing.length > 0) {
    throw new CaseError('CASE_DOCUMENT_INCOMPLETE', {
      context: { missing, missingLabels: missing.map((slot) => DOCUMENT_SLOT_LABEL[slot]) },
    })
  }
}

/**
 * กันสองโหมดปนกันในเคสเดียว (`38` §12 `CASE_DOCUMENT_MODE_CONFLICT`) — `existing` = ไฟล์ที่มีอยู่แล้ว
 * เอกสารชุด ห้ามเพิ่มเมื่อมีสัญญา/บัตรประชาชนแยกอยู่แล้ว และกลับกัน · รูปสินค้า/เอกสารอื่นเพิ่มได้ทั้งสองโหมด
 */
export function assertDocumentModeCompatible(existing: DocumentCounts, adding: DocumentSlot): void {
  const conflicting: readonly DocumentSlot[] =
    adding === 'bundle_doc' ? SEPARATE_ONLY_SLOTS : SEPARATE_ONLY_SLOTS.includes(adding) ? ['bundle_doc'] : []
  const found = conflicting.filter((slot) => (existing[slot] ?? 0) > 0)
  if (found.length > 0) {
    throw new CaseError('CASE_DOCUMENT_MODE_CONFLICT', {
      context: { adding, existing: found, mode: documentModeOf(existing) },
    })
  }
}

/** slot ที่ใช้ไม่ได้เมื่ออยู่ในโหมด `mode` (ต้องไม่มีไฟล์ค้างก่อนเลือกโหมดนั้น) */
export function slotsExcludedBy(mode: DocumentMode): readonly DocumentSlot[] {
  return mode === 'bundle' ? SEPARATE_ONLY_SLOTS : ['bundle_doc']
}

/**
 * บันทึกโหมดเอกสารที่เลือกบนฟอร์ม (v3.4 จำโหมด) — เลือกโหมดที่ขัดกับไฟล์ที่ **อัปโหลดแล้ว** ไม่ได้
 * (`38` §12 `CASE_DOCUMENT_MODE_CONFLICT`) · ลบไฟล์ของโหมดเดิมออกหมดก่อนจึงสลับได้
 */
export function assertDocumentModeSelectable(existing: DocumentCounts, mode: DocumentMode): void {
  const found = slotsExcludedBy(mode).filter((slot) => (existing[slot] ?? 0) > 0)
  if (found.length > 0) {
    throw new CaseError('CASE_DOCUMENT_MODE_CONFLICT', {
      context: { selecting: mode, existing: found, mode: documentModeOf(existing) },
    })
  }
}

/**
 * โหมดที่ต้องบันทึกหลังแนบไฟล์ slot `adding` — ไฟล์ชนะ: แนบเอกสารชุด ⇒ `bundle` · แนบสัญญา/บัตรแยก ⇒ `separate`
 * (เรียกหลัง `assertDocumentModeCompatible()` ผ่านแล้ว) · รูปสินค้า/เอกสารอื่น ⇒ คงค่าเดิม
 */
export function documentModeAfterAdding(stored: DocumentMode | string | null | undefined, adding: DocumentSlot): DocumentMode {
  if (adding === 'bundle_doc') return 'bundle'
  if (SEPARATE_ONLY_SLOTS.includes(adding)) return 'separate'
  return isDocumentMode(stored) ? stored : 'separate'
}

// ── ลบเอกสารที่แนบผิด (v3.4 — มติ PO 04/10/2569) ────────────────────────────

/** ลบ (soft-delete) เอกสารได้เฉพาะก่อนส่งตรวจ — ร่าง / ขอข้อมูลเพิ่ม (ตีกลับให้แก้) */
export const DOCUMENT_DELETABLE_CASE_STATUSES = ['draft', 'need_info'] as const

export function isCaseDocumentDeletable(status: string): boolean {
  return (DOCUMENT_DELETABLE_CASE_STATUSES as readonly string[]).includes(status)
}

/** `38` §12 `CASE_DOCUMENT_DELETE_NOT_ALLOWED` — ส่งตรวจ/อนุมัติแล้วลบไม่ได้ (ไฟล์เป็นหลักฐานที่ผู้ตรวจเห็นแล้ว) */
export function assertCaseDocumentDeletable(status: string): void {
  if (!isCaseDocumentDeletable(status)) {
    throw new CaseError('CASE_DOCUMENT_DELETE_NOT_ALLOWED', { context: { status } })
  }
}

/**
 * ตอนรับเคส (`accept`) ที่ใช้เอกสารชุด ผู้ตรวจต้องยืนยันว่าในชุดมีสัญญาและบัตรประชาชนครบ
 * (`38` §12 `CASE_BUNDLE_CONFIRMATION_REQUIRED`) — โหมดแยกประเภทไม่ต้องยืนยัน
 */
export function assertBundleConfirmed(counts: DocumentCounts, confirmed: boolean | undefined): void {
  if (documentModeOf(counts) === 'bundle' && confirmed !== true) {
    throw new CaseError('CASE_BUNDLE_CONFIRMATION_REQUIRED', { context: { documentMode: 'bundle' } })
  }
}

/** `38` §6.3.1 — รูปสินค้าสูงสุด 8 รูปต่อเคส */
export const PRODUCT_PHOTO_MAX = 8

/** เพดานรูปสินค้า — `existing` = จำนวนรูปที่มีอยู่แล้ว (ไม่นับที่ลบไปแล้ว) */
export function assertProductPhotoCapacity(existing: number, adding = 1): void {
  if (existing + adding > PRODUCT_PHOTO_MAX) {
    throw new CaseError('CASE_PRODUCT_PHOTO_LIMIT', { context: { existing, max: PRODUCT_PHOTO_MAX } })
  }
}

// ── ความครบถ้วนของข้อมูล (`38` §9 — เงื่อนไข draft → pending_review) ─────────

/** ค่าที่ระบบใช้ตัดสินว่าเคส "ข้อมูลครบ" พอจะขึ้น `pending_review` แล้วหรือยัง */
export interface CaseCompletenessInput {
  caseRef?: string | null
  companyId?: string | null
  debtorName?: string | null
  nationality?: DebtorNationalityCode | null
  nationalityOther?: string | null
  nationalId?: string | null
  passportNo?: string | null
  phoneMobile?: string | null
  addrProvince?: string | null
  addrDetail?: string | null
  idCardAddrProvince?: string | null
  idCardAddrDetail?: string | null
  assetKind?: string | null
  assetBrandModel?: string | null
  assetImeiSerial?: string | null
  /** มติ PO U166 — ความจุ/สีตามสัญญา ("ไม่ระบุในสัญญา" นับว่าเลือกแล้ว) */
  assetCapacity?: string | null
  assetColor?: string | null
  debtAmountSatang?: number | null
}

/**
 * ช่องของที่อยู่ที่ "ต้องกรอกก่อนส่งตรวจ" — ใช้กับที่อยู่ปัจจุบันและที่อยู่ตามบัตรประชาชน (`38` §6.1 object = yes)
 * **ชุดเดียวที่ FE (ดอกจันบน `AddressFields`) และ BE (`missingRequiredFields()`) ใช้ร่วมกัน** (UAT BUG-024 · มติ PO U64)
 * - `province` = หลักเดียวของ routing ทีม (`38` §6.1.2) · `detail` = บ้านเลขที่/ถนน สำหรับลงพื้นที่
 * - รหัสไปรษณีย์/อำเภอ/ตำบล **ไม่บังคับ** — รหัสที่หาไม่พบต้องไม่ block การกรอก (`38` §12 `CASE_POSTAL_CODE_NOT_FOUND`)
 *   และไฟล์นำเข้าจากไฟแนนซ์มักไม่มีครบทุกช่อง
 */
export const CASE_REQUIRED_ADDRESS_FIELDS = ['province', 'detail'] as const satisfies readonly (keyof AddressValue)[]

function blank(value: string | null | undefined): boolean {
  return value === null || value === undefined || value.trim() === ''
}

/**
 * ฟิลด์ required ตาม `38` §6.1/§6.2 ที่ยังว่างอยู่ — คืนเป็นชื่อ field ระดับ API (snake_case)
 * เพื่อให้ FE ชี้ช่องที่ขาดได้ตรง ๆ · เงื่อนไขตามสัญชาติเป็นไปตาม §6.1.1
 */
export function missingRequiredFields(values: CaseCompletenessInput): string[] {
  const missing: string[] = []
  if (blank(values.caseRef)) missing.push('caseRef')
  if (blank(values.companyId)) missing.push('financeCompanyId')
  if (blank(values.debtorName)) missing.push('debtorName')

  if (values.nationality === null || values.nationality === undefined) {
    missing.push('debtorNationality')
  } else if (values.nationality === 'TH') {
    if (blank(values.nationalId)) missing.push('debtorNationalId')
  } else {
    if (blank(values.passportNo)) missing.push('debtorPassportNo')
    if (values.nationality === 'OTHER' && blank(values.nationalityOther)) missing.push('debtorNationalityOther')
  }

  if (blank(values.phoneMobile)) missing.push('debtorPhoneMobile')
  const requiredAddresses = {
    addressCurrent: { province: values.addrProvince, detail: values.addrDetail },
    addressIdCard: { province: values.idCardAddrProvince, detail: values.idCardAddrDetail },
  } as const
  for (const [prefix, address] of Object.entries(requiredAddresses)) {
    for (const field of CASE_REQUIRED_ADDRESS_FIELDS) {
      if (blank(address[field])) missing.push(`${prefix}.${field}`)
    }
  }
  if (blank(values.assetKind)) missing.push('assetType')
  if (blank(values.assetBrandModel)) missing.push('assetBrandModel')
  if (blank(values.assetImeiSerial)) missing.push('assetImeiSerial')
  if (blank(values.assetCapacity)) missing.push('assetCapacity')
  if (blank(values.assetColor)) missing.push('assetColor')
  if (values.debtAmountSatang === null || values.debtAmountSatang === undefined) {
    missing.push('outstandingDebtSatang')
  }
  return missing
}

/**
 * ชื่อช่องภาษาไทยตามฟอร์มเคส (`case-form-modal.tsx` / `AddressFields`) ของคีย์ที่ `missingRequiredFields()` คืน
 * — ใช้แปล `missingFields` ใน error ของ API ให้ผู้ใช้รู้ว่าต้องกรอกช่องไหน (UAT BUG-028)
 */
export const REQUIRED_FIELD_LABEL: Record<string, string> = {
  caseRef: 'เลขที่สัญญา',
  financeCompanyId: 'บริษัทไฟแนนซ์',
  debtorName: 'ชื่อ-นามสกุลลูกหนี้',
  debtorNationality: 'สัญชาติ',
  debtorNationalId: 'เลขบัตรประชาชน',
  debtorPassportNo: 'เลข Passport / เอกสารอื่น',
  debtorNationalityOther: 'ระบุสัญชาติ',
  debtorPhoneMobile: 'เบอร์โทรมือถือ',
  'addressCurrent.province': 'ที่อยู่ปัจจุบัน — จังหวัด',
  'addressCurrent.detail': 'ที่อยู่ปัจจุบัน — บ้านเลขที่ / หมู่บ้าน / ถนน',
  'addressIdCard.province': 'ที่อยู่ตามบัตรประชาชน — จังหวัด',
  'addressIdCard.detail': 'ที่อยู่ตามบัตรประชาชน — บ้านเลขที่ / หมู่บ้าน / ถนน',
  assetType: 'ประเภททรัพย์',
  assetBrandModel: 'ยี่ห้อ/รุ่นเครื่อง',
  assetImeiSerial: 'IMEI / Serial Number',
  assetCapacity: 'ความจุ',
  assetColor: 'สี',
  outstandingDebtSatang: 'มูลหนี้คงเหลือ',
}

function stringList(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : []
}

/**
 * แปลงข้อมูลประกอบของ error gate ส่งตรวจ (`CASE_DOCUMENT_INCOMPLETE` → `missing` ·
 * `REQUIRED_MISSING` → `missingFields`) เป็นรายการภาษาไทยที่แสดงให้ผู้ใช้ได้ทันที
 * — รับ payload ดิบจาก API (`unknown`) เพราะ envelope กระจาย context ลงมาเป็นคีย์ระดับบนสุด
 */
export function readinessGapLabels(payload: Readonly<Record<string, unknown>> | undefined): {
  documents: string[]
  fields: string[]
} {
  if (payload === undefined) return { documents: [], fields: [] }
  const documents = stringList(payload.missing)
    .filter(isDocumentSlot)
    .map((slot) => DOCUMENT_SLOT_LABEL[slot])
  const fields = stringList(payload.missingFields).map((key) => REQUIRED_FIELD_LABEL[key] ?? key)
  return { documents, fields }
}

/** ข้อความสรุปสิ่งที่ขาดสำหรับ toast/alert — `null` เมื่อ payload ไม่มีรายการให้แสดง */
export function readinessGapText(payload: Readonly<Record<string, unknown>> | undefined): string | null {
  const { documents, fields } = readinessGapLabels(payload)
  const parts: string[] = []
  if (documents.length > 0) parts.push(`เอกสารที่ยังไม่ได้แนบ: ${documents.join(', ')}`)
  if (fields.length > 0) parts.push(`ช่องที่ยังไม่ได้กรอก: ${fields.join(', ')}`)
  return parts.length === 0 ? null : parts.join(' · ')
}

// ── ตัวระบุเครื่อง (`38` §6.2 `asset_imei_serial` → `02` §6 imei/serial_no · A6) ─

/**
 * ฟอร์มมีช่องเดียว ("IMEI หรือ Serial Number") แต่ DB แยก 2 คอลัมน์ตามมติ A6:
 * - **ไม่มีตัวอักษรเลย** = IMEI ⇒ normalize ด้วย `parseImei()` (ตัดช่องว่าง/ขีด/จุด → ตัวเลข 15 หลักพอดี ·
 *   มติ PO U24) แล้วเก็บเป็นตัวเลขล้วน · รูปแบบผิดถูก schema (`caseCreateSchema`) ปฏิเสธไปก่อนแล้ว
 * - มีตัวอักษร = serial (เก็บตามที่กรอก ตัดแค่ช่องว่างหัวท้าย)
 */
export function splitAssetIdentifier(value: string | null | undefined): { imei: string | null; serialNo: string | null } {
  const trimmed = value?.trim() ?? ''
  if (trimmed === '') return { imei: null, serialNo: null }
  if (isImeiLikeIdentifier(trimmed)) {
    const imei = parseImei(trimmed)
    // ไม่ควรเกิด (schema กันไว้แล้ว) — ถ้าหลุดมาก็ห้ามตัดทิ้งเงียบ ๆ: เก็บค่าดิบเป็น serial ให้ตามสอบได้
    return imei === null ? { imei: null, serialNo: trimmed } : { imei, serialNo: null }
  }
  return { imei: null, serialNo: trimmed }
}

/**
 * ค่าในช่อง "IMEI หรือ Serial" ใช้ได้ไหม — ว่าง/มีตัวอักษร (serial) ผ่าน · ไม่มีตัวอักษร = ต้องเป็น IMEI
 * ที่ถูกรูปแบบ (`parseImei()`) — ใช้ใน Zod ร่วม FE/BE (ฟอร์ม + นำเข้าไฟล์ + API)
 */
export function isAcceptableAssetIdentifier(value: string | null | undefined): boolean {
  const trimmed = value?.trim() ?? ''
  if (trimmed === '' || !isImeiLikeIdentifier(trimmed)) return true
  return parseImei(trimmed) !== null
}

/** ค่ากลับทางของ `splitAssetIdentifier()` — ใช้ตอนส่ง DTO กลับให้ฟอร์ม */
export function joinAssetIdentifier(imei: string | null, serialNo: string | null): string | null {
  return imei ?? serialNo
}

/**
 * เคสนี้พร้อมขึ้น `pending_review` แล้วหรือยัง (`38` §9) — รวมทั้งข้อมูลและเอกสาร
 * ใช้ทั้งตอนแสดงสถานะความพร้อมบนหน้ารายละเอียด และเป็น gate จริงตอนเปลี่ยนสถานะ (Phase 2.3)
 */
export interface CaseReadiness {
  ready: boolean
  missingFields: string[]
  missingDocuments: DocumentSlot[]
}

export function caseReadiness(
  values: CaseCompletenessInput,
  documents: DocumentCounts,
  documentOptions: DocumentRequirementOptions = {},
): CaseReadiness {
  const missingFields = missingRequiredFields(values)
  const missingDocuments = missingRequiredDocuments(documents, documentOptions)
  return { ready: missingFields.length === 0 && missingDocuments.length === 0, missingFields, missingDocuments }
}

// ── สถานะที่แก้ไขได้ (`38` §8 edit_case · §12 `CASE_LOCKED_AFTER_APPROVAL`) ───

/** แก้ไขเคสได้เฉพาะ 3 สถานะนี้เท่านั้น — `approved`/`rejected`/สถานะปลายทางอื่นแก้ตรงไม่ได้ */
export const EDITABLE_CASE_STATUSES = ['draft', 'pending_review', 'need_info'] as const
export type EditableCaseStatus = (typeof EDITABLE_CASE_STATUSES)[number]

export function isCaseEditable(status: string): boolean {
  return (EDITABLE_CASE_STATUSES as readonly string[]).includes(status)
}

export function assertCaseEditable(status: string): void {
  if (!isCaseEditable(status)) {
    throw new CaseError('CASE_LOCKED_AFTER_APPROVAL', { context: { status } })
  }
}

/**
 * optimistic concurrency ของการแก้เคส — preship R3-003 · `38` §12 v3.12
 * ฟอร์มส่ง `updatedAt` ที่โหลดมา ไม่ตรงค่าปัจจุบัน (เทียบระดับมิลลิวินาทีเท่าที่ JSON ส่งได้) ⇒ `CASE_EDIT_CONFLICT`
 * `expected` ไม่ส่ง = ไม่ตรวจ (ผู้เรียกภายนอก/เดิม)
 */
export function assertCaseNotModifiedSince(current: Date, expected: string | undefined): void {
  if (expected === undefined) return
  const expectedMs = Date.parse(expected)
  if (Number.isNaN(expectedMs) || Math.floor(current.getTime()) !== expectedMs) {
    throw new CaseError('CASE_EDIT_CONFLICT', { context: { currentUpdatedAt: current.toISOString(), expectedUpdatedAt: expected } })
  }
}
