import { CaseError } from '@/lib/cases/errors'

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

export const DOCUMENT_SLOTS = ['contract_doc', 'national_id_doc', 'product_photo', 'other_doc'] as const
export type DocumentSlot = (typeof DOCUMENT_SLOTS)[number]

export const DOCUMENT_SLOT_LABEL: Record<DocumentSlot, string> = {
  contract_doc: 'สัญญาเช่าซื้อ/สัญญาผ่อนชำระ',
  national_id_doc: 'บัตรประชาชน/Passport ลูกหนี้',
  product_photo: 'รูปสินค้า',
  other_doc: 'เอกสารอื่นจากไฟแนนซ์',
}

/** slot ที่ต้องมีอย่างน้อย 1 ไฟล์ก่อนเข้าสถานะ `pending_review` (`38` §6.3 ตาราง + §6.3.1) */
export const REQUIRED_DOCUMENT_SLOTS: readonly DocumentSlot[] = ['contract_doc', 'national_id_doc', 'product_photo']

/** `38` §6.3.1 — รูปสินค้าสูงสุด 8 รูปต่อเคส */
export const PRODUCT_PHOTO_MAX = 8

export function isDocumentSlot(value: string): value is DocumentSlot {
  return (DOCUMENT_SLOTS as readonly string[]).includes(value)
}

export type DocumentCounts = Partial<Record<DocumentSlot, number>>

/** slot บังคับที่ยังไม่มีไฟล์ — ใช้ทั้งบน UI (แสดงว่าขาดอะไร) และตอน gate `pending_review` */
export function missingRequiredDocuments(counts: DocumentCounts): DocumentSlot[] {
  return REQUIRED_DOCUMENT_SLOTS.filter((slot) => (counts[slot] ?? 0) < 1)
}

/** gate ก่อนเปลี่ยนสถานะเป็น `pending_review` (`38` §12 `CASE_DOCUMENT_INCOMPLETE`) */
export function assertDocumentsComplete(counts: DocumentCounts): void {
  const missing = missingRequiredDocuments(counts)
  if (missing.length > 0) {
    throw new CaseError('CASE_DOCUMENT_INCOMPLETE', {
      context: { missing, missingLabels: missing.map((slot) => DOCUMENT_SLOT_LABEL[slot]) },
    })
  }
}

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
  debtAmountSatang?: number | null
}

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
  if (blank(values.addrProvince)) missing.push('addressCurrent.province')
  if (blank(values.addrDetail)) missing.push('addressCurrent.detail')
  if (blank(values.idCardAddrProvince)) missing.push('addressIdCard.province')
  if (blank(values.idCardAddrDetail)) missing.push('addressIdCard.detail')
  if (blank(values.assetKind)) missing.push('assetType')
  if (blank(values.assetBrandModel)) missing.push('assetBrandModel')
  if (blank(values.assetImeiSerial)) missing.push('assetImeiSerial')
  if (values.debtAmountSatang === null || values.debtAmountSatang === undefined) {
    missing.push('outstandingDebtSatang')
  }
  return missing
}

// ── ตัวระบุเครื่อง (`38` §6.2 `asset_imei_serial` → `02` §6 imei/serial_no · A6) ─

/**
 * ฟอร์มมีช่องเดียว ("IMEI หรือ Serial Number") แต่ DB แยก 2 คอลัมน์ตามมติ A6:
 * ตัวเลข **15 หลักพอดี** = IMEI (exact match ห้าม fuzzy — `44` §6.5) นอกนั้นถือเป็น serial
 */
export function splitAssetIdentifier(value: string | null | undefined): { imei: string | null; serialNo: string | null } {
  const trimmed = value?.trim() ?? ''
  if (trimmed === '') return { imei: null, serialNo: null }
  if (trimmed.length === 15 && DIGITS_ONLY.test(trimmed)) return { imei: trimmed, serialNo: null }
  return { imei: null, serialNo: trimmed }
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

export function caseReadiness(values: CaseCompletenessInput, documents: DocumentCounts): CaseReadiness {
  const missingFields = missingRequiredFields(values)
  const missingDocuments = missingRequiredDocuments(documents)
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
