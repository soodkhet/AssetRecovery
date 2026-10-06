import { z } from 'zod'
import { dateOnlySchema, reasonSchema } from '@/lib/api/validation'
import { documentExtension } from '@/lib/warehouse/lot-documents'

/**
 * เอกสารบริษัทไฟแนนซ์ (มติ PO U132 · `10` §7.4) — **pure ล้วน** ใช้ร่วม FE/BE
 *
 * - ชนิดเอกสาร 5 แบบ: หนังสือรับรองบริษัท (+ วันที่ออก) · ภ.พ.20 · สัญญาว่าจ้าง · หน้าสมุดบัญชีธนาคาร (ไม่บังคับ)
 *   · อื่น ๆ (ระบุชื่อ)
 * - **เก็บทุกเวอร์ชัน ห้ามลบ** — แนบใหม่ = แถวใหม่ที่ชี้ `replaces_document_id` ไปเวอร์ชันก่อน (ไฟล์เดิมคงอยู่)
 *   ชนิดเดี่ยว (4 ชนิดแรก) มีได้ 1 สายต่อบริษัท · ชนิด "อื่น ๆ" มีได้หลายสาย (คนละชื่อ)
 * - path ต่อเวอร์ชัน `finance-companies/<companyId>/documents/<ชนิด>/<uuid>.<ext>` (ไม่ทับของเดิม — DEC-014)
 * - คำเตือน **ไม่บล็อก**: ไม่มีหนังสือรับรอง · ไม่มี ภ.พ.20 (เฉพาะบริษัทที่จด VAT) · หนังสือรับรองออกเกิน 6 เดือน
 *   — แสดงบนหน้าบริษัทและตอนสร้างรอบวางบิล (ไม่ใช่ error code ของ `24` — เป็นข้อความเตือนระดับหน้าจอ)
 */

export const COMPANY_DOCUMENT_TYPES = [
  'company_certificate',
  'vat_registration',
  'service_contract',
  'bank_book',
  'other',
] as const

export type CompanyDocumentType = (typeof COMPANY_DOCUMENT_TYPES)[number]

export const COMPANY_DOCUMENT_LABEL: Readonly<Record<CompanyDocumentType, string>> = {
  company_certificate: 'หนังสือรับรองบริษัท',
  vat_registration: 'ภ.พ.20 (ใบทะเบียนภาษีมูลค่าเพิ่ม)',
  service_contract: 'สัญญาว่าจ้าง',
  bank_book: 'หน้าสมุดบัญชีธนาคาร',
  other: 'เอกสารอื่น ๆ',
}

export const COMPANY_DOCUMENT_HINT: Readonly<Record<CompanyDocumentType, string>> = {
  company_certificate: 'ควรมี — ระบุวันที่ออกหนังสือ ระบบเตือนเมื่อออกเกิน 6 เดือน',
  vat_registration: 'ควรมีสำหรับบริษัทที่จด VAT — ใช้ยืนยันข้อมูลผู้ซื้อบนใบกำกับภาษี',
  service_contract: 'สัญญาที่ลงนามกับบริษัท — แก้สัญญาให้แนบเป็นเวอร์ชันใหม่',
  bank_book: 'ไม่บังคับ — ใช้ตรวจบัญชีที่ลูกค้าโอนเงินเข้ามา',
  other: 'ระบุชื่อเอกสารเอง เช่น หนังสือมอบอำนาจ',
}

/** ชื่อโฟลเดอร์ใน bucket ต่อชนิด */
const PATH_SEGMENT: Readonly<Record<CompanyDocumentType, string>> = {
  company_certificate: 'certificate',
  vat_registration: 'vat-registration',
  service_contract: 'contract',
  bank_book: 'bank-book',
  other: 'other',
}

/** ชนิดที่มีได้ 1 สายเวอร์ชันต่อบริษัท (ตรงกับ partial unique `uniq_company_documents_first_singleton`) */
export function isSingletonDocumentType(type: CompanyDocumentType): boolean {
  return type !== 'other'
}

/** อายุหนังสือรับรองที่ยังถือว่าใหม่ (เดือน) */
export const CERTIFICATE_MAX_AGE_MONTHS = 6

export const COMPANY_DOCUMENT_TITLE_MAX = 120

export function companyDocumentPrefix(companyId: string, type: CompanyDocumentType): string {
  return `finance-companies/${companyId}/documents/${PATH_SEGMENT[type]}/`
}

/** path ต่อเวอร์ชัน — `uniqueKey` ให้ผู้เรียกส่งเข้ามา (`crypto.randomUUID()`) เพื่อให้ยัง pure */
export function companyDocumentPath(
  companyId: string,
  type: CompanyDocumentType,
  fileName: string,
  uniqueKey: string,
): string {
  return `${companyDocumentPrefix(companyId, type)}${uniqueKey}.${documentExtension(fileName)}`
}

// ── Zod (ใช้ร่วม FE/BE) ─────────────────────────────────────────────────────

export const companyDocumentTypeSchema = z.enum(COMPANY_DOCUMENT_TYPES)

const optionalTitle = z.preprocess(
  (value) => (typeof value === 'string' && value.trim() === '' ? null : value),
  z.string().trim().max(COMPANY_DOCUMENT_TITLE_MAX, 'ชื่อเอกสารยาวเกินไป').nullable().default(null),
)

const optionalIssuedDate = z.preprocess(
  (value) => (value === '' || value === undefined ? null : value),
  dateOnlySchema('วันที่ออกหนังสือ').nullable(),
)

/**
 * `POST /api/finance-companies/:id/documents` — ผูกไฟล์ที่อัปโหลดแล้ว (target `company_document`)
 * `replacesDocumentId` = แทนที่เวอร์ชันเดิม (เวอร์ชันเดิมยังอยู่ — ห้ามลบ)
 */
export const companyDocumentCreateSchema = z
  .object({
    documentType: companyDocumentTypeSchema,
    title: optionalTitle,
    issuedDate: optionalIssuedDate,
    path: z.string().trim().min(1).max(1024),
    originalName: z.string().trim().min(1).max(255),
    replacesDocumentId: z.preprocess(
      (value) => (value === '' || value === undefined ? null : value),
      z.guid().nullable(),
    ),
    reason: reasonSchema,
  })
  .superRefine((values, ctx) => {
    if (values.documentType === 'other' && values.title === null) {
      ctx.addIssue({ code: 'custom', path: ['title'], message: 'ระบุชื่อเอกสาร' })
    }
    if (values.documentType === 'company_certificate' && values.issuedDate === null) {
      ctx.addIssue({ code: 'custom', path: ['issuedDate'], message: 'ระบุวันที่ออกหนังสือรับรอง' })
    }
  })

export type CompanyDocumentCreateInput = z.infer<typeof companyDocumentCreateSchema>

/** ค่าที่เก็บจริงตามชนิด — ชื่อเก็บเฉพาะ "อื่น ๆ" · วันที่ออกเก็บเฉพาะหนังสือรับรอง (ตรง CHECK ระดับ DB) */
export function normalizeCompanyDocumentFields(input: {
  documentType: CompanyDocumentType
  title: string | null
  issuedDate: Date | null
}): { title: string | null; issuedDate: Date | null } {
  return {
    title: input.documentType === 'other' ? input.title : null,
    issuedDate: input.documentType === 'company_certificate' ? input.issuedDate : null,
  }
}

// ── เวอร์ชันปัจจุบัน + คำเตือน ───────────────────────────────────────────────

export interface CompanyDocumentVersionLike {
  id: string
  documentType: CompanyDocumentType
  replacesDocumentId: string | null
  /** `YYYY-MM-DD` (date-only) หรือ null */
  issuedDate: string | null
}

/** เวอร์ชันล่าสุดของแต่ละสาย = แถวที่ไม่มีใครแทนที่ */
export function currentCompanyDocuments<T extends CompanyDocumentVersionLike>(rows: readonly T[]): T[] {
  const replaced = new Set(rows.map((row) => row.replacesDocumentId).filter((id): id is string => id !== null))
  return rows.filter((row) => !replaced.has(row.id))
}

export type CompanyDocumentWarningKind = 'missing_certificate' | 'missing_vat_registration' | 'certificate_outdated'

export interface CompanyDocumentWarning {
  kind: CompanyDocumentWarningKind
  message: string
}

/** `YYYY-MM-DD` + N เดือน (วันเกินจำนวนวันในเดือนปลายทาง → clamp วันสุดท้าย) */
export function addMonthsToDateKey(dateKey: string, months: number): string {
  const [year = 0, month = 1, day = 1] = dateKey.split('-').map((part) => Number.parseInt(part, 10))
  const targetMonthIndex = month - 1 + months
  const lastDay = new Date(Date.UTC(year, targetMonthIndex + 1, 0)).getUTCDate()
  const result = new Date(Date.UTC(year, targetMonthIndex, Math.min(day, lastDay)))
  return result.toISOString().slice(0, 10)
}

/** หนังสือรับรองออกเกิน 6 เดือนแล้วหรือยัง (นับถึง `todayKey` ตามวันไทย) */
export function isCertificateOutdated(issuedDateKey: string, todayKey: string): boolean {
  return addMonthsToDateKey(issuedDateKey, CERTIFICATE_MAX_AGE_MONTHS) < todayKey
}

/**
 * คำเตือนเอกสารบริษัท (ไม่บล็อก) — `currentDocs` = เวอร์ชันปัจจุบันเท่านั้น · `todayKey` = `YYYY-MM-DD` ตามวันไทย
 * ภ.พ.20 เตือนเฉพาะบริษัทที่จด VAT (บริษัทไม่จด VAT ไม่มีเอกสารนี้)
 */
export function companyDocumentWarnings(input: {
  currentDocs: readonly Pick<CompanyDocumentVersionLike, 'documentType' | 'issuedDate'>[]
  vatRegistered: boolean
  todayKey: string
}): CompanyDocumentWarning[] {
  const warnings: CompanyDocumentWarning[] = []
  const certificate = input.currentDocs.find((doc) => doc.documentType === 'company_certificate')
  if (certificate === undefined) {
    warnings.push({ kind: 'missing_certificate', message: 'ยังไม่มีหนังสือรับรองบริษัท' })
  } else if (certificate.issuedDate !== null && isCertificateOutdated(certificate.issuedDate, input.todayKey)) {
    warnings.push({
      kind: 'certificate_outdated',
      message: `หนังสือรับรองบริษัทออกเกิน ${CERTIFICATE_MAX_AGE_MONTHS} เดือนแล้ว — ขอฉบับใหม่จากบริษัท`,
    })
  }
  if (input.vatRegistered && !input.currentDocs.some((doc) => doc.documentType === 'vat_registration')) {
    warnings.push({ kind: 'missing_vat_registration', message: 'ยังไม่มี ภ.พ.20 ของบริษัท' })
  }
  return warnings
}
