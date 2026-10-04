import { parseBahtInput } from '@/lib/format/money'
import { DEBTOR_NATIONALITIES, type DebtorNationalityCode } from '@/lib/cases/case'
import { caseCreateSchema, type CaseCreateInput } from '@/lib/cases/schemas'
import { toFieldErrors } from '@/lib/api/validation'
import {
  buildImportTemplateCsv,
  looksLikeScientificNotation,
  scientificNotationMessage,
  sortTemplateColumns,
  templateColumnDocs,
  type ImportColumnRequirement,
  type ImportTemplateColumn,
  type ImportTemplateColumnDoc,
} from '@/lib/imports/template'

/**
 * Import เคสจากไฟล์ Excel/CSV (ไฟล์ 38 §8 `import_cases` · §12) — **pure ล้วน ใช้ร่วม FE/BE**
 *
 * ขอบเขตของไฟล์นี้: **mapping หัวคอลัมน์ → ฟิลด์ของเคส + validate ต่อแถว** เท่านั้น
 * - แถวที่ผิด reject เฉพาะแถวนั้น (`API_VALIDATION_FAILED`) **ไม่ reject ทั้งไฟล์** (`38` §12)
 * - แถวที่ผ่านถูกสร้างเป็น `draft` เสมอ (`38` §9) — ความครบถ้วนบังคับตอนขอขึ้น `pending_review`
 *
 * การอ่านไฟล์: wizard รับ .xlsx และ .csv — .xlsx ถูกแปลงเป็นข้อความ CSV ด้วย SheetJS (`lib/imports/xlsx.ts`)
 * แล้วเข้า `parseCsv()` ด้านล่างทางเดียวกับไฟล์ .csv (มติผู้ใช้ 04/10/2569) ก่อนส่ง `rows` มาที่ API
 * · API ยังรับ `csv` ดิบได้ (backend แยกเองด้วย `parseCsv()`)
 */

// ── CSV (RFC 4180 แบบย่อ — คั่นด้วย `,` มี quote ได้) ────────────────────────

/** แยกไฟล์ CSV เป็นแถว object โดยใช้บรรทัดแรกเป็นหัวคอลัมน์ (รองรับ BOM + CRLF + quote) */
export function parseCsv(text: string): Array<Record<string, string>> {
  const rows: string[][] = []
  let row: string[] = []
  let field = ''
  let quoted = false
  const source = text.replace(/^﻿/, '')

  for (let index = 0; index < source.length; index += 1) {
    const char = source[index]
    if (quoted) {
      if (char === '"') {
        if (source[index + 1] === '"') {
          field += '"'
          index += 1
        } else {
          quoted = false
        }
      } else {
        field += char
      }
      continue
    }
    if (char === '"') {
      quoted = true
    } else if (char === ',') {
      row.push(field)
      field = ''
    } else if (char === '\n' || char === '\r') {
      if (char === '\r' && source[index + 1] === '\n') index += 1
      row.push(field)
      rows.push(row)
      row = []
      field = ''
    } else {
      field += char
    }
  }
  if (field !== '' || row.length > 0) {
    row.push(field)
    rows.push(row)
  }

  const [header, ...body] = rows
  if (header === undefined) return []
  return body
    .filter((cells) => cells.some((cell) => cell.trim() !== ''))
    .map((cells) => {
      const record: Record<string, string> = {}
      header.forEach((name, index) => {
        record[name.trim()] = (cells[index] ?? '').trim()
      })
      return record
    })
}

// ── mapping หัวคอลัมน์ → ฟิลด์ (`38` §6.1–6.2) ───────────────────────────────

/** ฟิลด์ปลายทางบนฟอร์มเคส (จุดคั่น = ที่อยู่ย่อย) */
export type ImportField =
  | 'caseRef'
  | 'debtorName'
  | 'debtorNationality'
  | 'debtorNationalityOther'
  | 'debtorNationalId'
  | 'debtorPassportNo'
  | 'debtorPhoneMobile'
  | 'debtorPhoneWork'
  | 'debtorLineId'
  | 'debtorFacebook'
  | 'addressCurrent.detail'
  | 'addressCurrent.postalCode'
  | 'addressCurrent.province'
  | 'addressCurrent.district'
  | 'addressCurrent.subdistrict'
  | 'addressWork.detail'
  | 'addressWork.postalCode'
  | 'addressWork.province'
  | 'addressWork.district'
  | 'addressWork.subdistrict'
  | 'addressIdCard.detail'
  | 'addressIdCard.postalCode'
  | 'addressIdCard.province'
  | 'addressIdCard.district'
  | 'addressIdCard.subdistrict'
  | 'assetType'
  | 'assetBrandModel'
  | 'assetImeiSerial'
  | 'outstandingDebtBaht'

export interface ImportColumn {
  field: ImportField
  label: string
  /** ชื่อหัวคอลัมน์ที่ยอมรับ (ไทย/อังกฤษ/snake_case) — เทียบแบบ normalize แล้ว */
  aliases: readonly string[]
}

/** หัวคอลัมน์มาตรฐานของไฟล์นำเข้า — wizard (2.5) ใช้ตารางนี้ทำหน้าจอ mapping */
export const IMPORT_COLUMNS: readonly ImportColumn[] = [
  { field: 'caseRef', label: 'เลขที่สัญญา', aliases: ['เลขที่สัญญา', 'เลขสัญญา', 'case_ref', 'contract_no'] },
  { field: 'debtorName', label: 'ชื่อลูกหนี้', aliases: ['ชื่อลูกหนี้', 'ชื่อ-นามสกุล', 'debtor_name'] },
  { field: 'debtorNationality', label: 'สัญชาติ', aliases: ['สัญชาติ', 'debtor_nationality', 'nationality'] },
  {
    field: 'debtorNationalityOther',
    label: 'สัญชาติ (ระบุ)',
    aliases: ['สัญชาติอื่น', 'สัญชาติระบุ', 'debtor_nationality_other'],
  },
  {
    field: 'debtorNationalId',
    label: 'เลขบัตรประชาชน',
    aliases: ['เลขบัตรประชาชน', 'เลขประจำตัวประชาชน', 'debtor_national_id', 'national_id'],
  },
  { field: 'debtorPassportNo', label: 'เลข Passport', aliases: ['passport', 'เลขพาสปอร์ต', 'debtor_passport_no'] },
  {
    field: 'debtorPhoneMobile',
    label: 'เบอร์มือถือ',
    aliases: ['เบอร์มือถือ', 'เบอร์โทร', 'โทรศัพท์', 'debtor_phone_mobile', 'mobile'],
  },
  { field: 'debtorPhoneWork', label: 'เบอร์ที่ทำงาน', aliases: ['เบอร์ที่ทำงาน', 'debtor_phone_work'] },
  { field: 'debtorLineId', label: 'Line ID', aliases: ['line', 'line_id', 'debtor_line_id'] },
  { field: 'debtorFacebook', label: 'Facebook', aliases: ['facebook', 'debtor_facebook'] },

  {
    field: 'addressCurrent.detail',
    label: 'ที่อยู่ปัจจุบัน',
    aliases: ['ที่อยู่ปัจจุบัน', 'ที่อยู่', 'addr_detail', 'address'],
  },
  {
    field: 'addressCurrent.postalCode',
    label: 'รหัสไปรษณีย์ (ปัจจุบัน)',
    aliases: ['รหัสไปรษณีย์', 'ไปรษณีย์', 'addr_postal_code', 'postal_code'],
  },
  { field: 'addressCurrent.province', label: 'จังหวัด (ปัจจุบัน)', aliases: ['จังหวัด', 'addr_province', 'province'] },
  { field: 'addressCurrent.district', label: 'อำเภอ/เขต (ปัจจุบัน)', aliases: ['อำเภอ', 'เขต', 'addr_district'] },
  {
    field: 'addressCurrent.subdistrict',
    label: 'ตำบล/แขวง (ปัจจุบัน)',
    aliases: ['ตำบล', 'แขวง', 'addr_subdistrict'],
  },

  { field: 'addressWork.detail', label: 'ที่อยู่ที่ทำงาน', aliases: ['ที่อยู่ที่ทำงาน', 'work_addr_detail'] },
  {
    field: 'addressWork.postalCode',
    label: 'รหัสไปรษณีย์ (ที่ทำงาน)',
    aliases: ['รหัสไปรษณีย์ที่ทำงาน', 'work_addr_postal_code'],
  },
  { field: 'addressWork.province', label: 'จังหวัด (ที่ทำงาน)', aliases: ['จังหวัดที่ทำงาน', 'work_addr_province'] },
  { field: 'addressWork.district', label: 'อำเภอ/เขต (ที่ทำงาน)', aliases: ['อำเภอที่ทำงาน', 'work_addr_district'] },
  {
    field: 'addressWork.subdistrict',
    label: 'ตำบล/แขวง (ที่ทำงาน)',
    aliases: ['ตำบลที่ทำงาน', 'work_addr_subdistrict'],
  },

  {
    field: 'addressIdCard.detail',
    label: 'ที่อยู่ตามบัตร',
    aliases: ['ที่อยู่ตามบัตร', 'ที่อยู่ตามบัตรประชาชน', 'id_card_addr_detail'],
  },
  {
    field: 'addressIdCard.postalCode',
    label: 'รหัสไปรษณีย์ (ตามบัตร)',
    aliases: ['รหัสไปรษณีย์ตามบัตร', 'id_card_addr_postal_code'],
  },
  { field: 'addressIdCard.province', label: 'จังหวัด (ตามบัตร)', aliases: ['จังหวัดตามบัตร', 'id_card_addr_province'] },
  { field: 'addressIdCard.district', label: 'อำเภอ/เขต (ตามบัตร)', aliases: ['อำเภอตามบัตร', 'id_card_addr_district'] },
  {
    field: 'addressIdCard.subdistrict',
    label: 'ตำบล/แขวง (ตามบัตร)',
    aliases: ['ตำบลตามบัตร', 'id_card_addr_subdistrict'],
  },

  {
    field: 'assetType',
    label: 'ประเภทสินค้า',
    aliases: ['ประเภทสินค้า', 'ประเภทเครื่อง', 'asset_type', 'asset_kind'],
  },
  {
    field: 'assetBrandModel',
    label: 'ยี่ห้อ/รุ่น',
    aliases: ['ยี่ห้อ', 'รุ่น', 'ยี่ห้อรุ่น', 'asset_brand_model', 'brand_model'],
  },
  { field: 'assetImeiSerial', label: 'IMEI / Serial', aliases: ['imei', 'serial', 'imeiserial', 'asset_imei_serial'] },
  {
    field: 'outstandingDebtBaht',
    label: 'มูลหนี้คงเหลือ (บาท)',
    aliases: ['มูลหนี้คงเหลือ', 'มูลหนี้', 'ยอดหนี้', 'outstanding_debt', 'debt_amount'],
  },
]

// ── ไฟล์ตัวอย่าง (แม่แบบ) — มติ PO 04/10/2569 (UAT — แม่แบบนำเข้าภาษาไทย) ─────────────

interface ImportColumnTemplateSpec {
  requirement: ImportColumnRequirement
  format: string
  /** แถวตัวอย่าง 2 แถว: [ลูกหนี้สัญชาติไทย, ลูกหนี้ต่างชาติ] — ค่าสมมติทั้งหมด ไม่ใช่ข้อมูลจริง */
  examples: readonly [string, string]
}

/**
 * ระดับความจำเป็น + รูปแบบ + ค่าตัวอย่างต่อฟิลด์ — `Record<ImportField>` บังคับให้ครบทุกฟิลด์ของ `IMPORT_COLUMNS`
 * - `required` = schema บังคับตั้งแต่ตอนนำเข้า (`caseRef` ตัวเดียว — แถวที่ไม่มีถูก reject)
 * - `required_before_review` / `conditional` = ตรงกับ `missingRequiredFields()` (`lib/cases/case.ts`) —
 *   นำเข้าเป็น `draft` ได้แม้ว่าง แต่ต้องครบก่อนขอขึ้น `pending_review` (`38` §9/§11)
 */
const IMPORT_COLUMN_TEMPLATE: Record<ImportField, ImportColumnTemplateSpec> = {
  caseRef: {
    requirement: 'required',
    format: 'ไม่เกิน 100 ตัวอักษร · ห้ามซ้ำกับเคสเดิมของบริษัทเดียวกัน',
    examples: ['CT-2569-00001', 'CT-2569-00002'],
  },
  debtorName: { requirement: 'required_before_review', format: 'ชื่อ-นามสกุล', examples: ['นายสมชาย ตัวอย่าง', 'Mr. Aung Example'] },
  debtorNationality: {
    requirement: 'required_before_review',
    format: 'ไทย / พม่า / ลาว / กัมพูชา / อื่นๆ',
    examples: ['ไทย', 'พม่า'],
  },
  debtorNationalityOther: { requirement: 'conditional', format: 'กรอกเมื่อสัญชาติเป็น "อื่นๆ"', examples: ['', ''] },
  debtorNationalId: {
    requirement: 'conditional',
    format: 'ตัวเลข 13 หลัก · บังคับเมื่อสัญชาติไทย',
    examples: ['1234567890121', ''],
  },
  debtorPassportNo: {
    requirement: 'conditional',
    format: 'บังคับเมื่อไม่ใช่สัญชาติไทย',
    examples: ['', 'MA0000001'],
  },
  debtorPhoneMobile: {
    requirement: 'required_before_review',
    format: 'ตัวเลข เช่น 0812345678',
    examples: ['0812345678', '0898765432'],
  },
  debtorPhoneWork: { requirement: 'optional', format: 'ตัวเลข', examples: ['021234567', ''] },
  debtorLineId: { requirement: 'optional', format: 'ข้อความ', examples: ['somchai.example', ''] },
  debtorFacebook: { requirement: 'optional', format: 'ชื่อหรือลิงก์', examples: ['', ''] },

  'addressCurrent.detail': {
    requirement: 'required_before_review',
    format: 'บ้านเลขที่ หมู่ ซอย ถนน',
    examples: ['99/1 หมู่ 2 ถนนตัวอย่าง', 'ห้อง 305 อาคารตัวอย่าง'],
  },
  'addressCurrent.postalCode': { requirement: 'optional', format: 'ตัวเลข 5 หลัก', examples: ['10110', '10400'] },
  'addressCurrent.province': {
    requirement: 'required_before_review',
    format: 'ชื่อจังหวัดเต็ม',
    examples: ['กรุงเทพมหานคร', 'กรุงเทพมหานคร'],
  },
  'addressCurrent.district': { requirement: 'optional', format: 'ชื่ออำเภอ/เขต', examples: ['คลองเตย', 'พญาไท'] },
  'addressCurrent.subdistrict': { requirement: 'optional', format: 'ชื่อตำบล/แขวง', examples: ['คลองเตย', 'สามเสนใน'] },

  'addressWork.detail': { requirement: 'optional', format: 'บ้านเลขที่ หมู่ ซอย ถนน', examples: ['', ''] },
  'addressWork.postalCode': { requirement: 'optional', format: 'ตัวเลข 5 หลัก', examples: ['', ''] },
  'addressWork.province': { requirement: 'optional', format: 'ชื่อจังหวัดเต็ม', examples: ['', ''] },
  'addressWork.district': { requirement: 'optional', format: 'ชื่ออำเภอ/เขต', examples: ['', ''] },
  'addressWork.subdistrict': { requirement: 'optional', format: 'ชื่อตำบล/แขวง', examples: ['', ''] },

  'addressIdCard.detail': {
    requirement: 'required_before_review',
    format: 'บ้านเลขที่ หมู่ ซอย ถนน',
    examples: ['12 หมู่ 3', 'ห้อง 305 อาคารตัวอย่าง'],
  },
  'addressIdCard.postalCode': { requirement: 'optional', format: 'ตัวเลข 5 หลัก', examples: ['50200', '10400'] },
  'addressIdCard.province': {
    requirement: 'required_before_review',
    format: 'ชื่อจังหวัดเต็ม',
    examples: ['เชียงใหม่', 'กรุงเทพมหานคร'],
  },
  'addressIdCard.district': { requirement: 'optional', format: 'ชื่ออำเภอ/เขต', examples: ['เมืองเชียงใหม่', 'พญาไท'] },
  'addressIdCard.subdistrict': { requirement: 'optional', format: 'ชื่อตำบล/แขวง', examples: ['ศรีภูมิ', 'สามเสนใน'] },

  assetType: { requirement: 'required_before_review', format: 'มือถือ หรือ แท็บเล็ต', examples: ['มือถือ', 'แท็บเล็ต'] },
  assetBrandModel: {
    requirement: 'required_before_review',
    format: 'ยี่ห้อและรุ่น',
    examples: ['Samsung Galaxy A55', 'iPad 10th Gen'],
  },
  assetImeiSerial: {
    requirement: 'required_before_review',
    format: 'IMEI ตัวเลข 15 หลัก (หรือ Serial ของเครื่อง)',
    examples: ['350000000000001', '350000000000019'],
  },
  outstandingDebtBaht: {
    requirement: 'required_before_review',
    format: 'จำนวนเงินบาท ทศนิยมไม่เกิน 2 ตำแหน่ง ไม่ต้องใส่จุลภาค',
    examples: ['15000.00', '8500.50'],
  },
}

/**
 * คอลัมน์ของไฟล์แม่แบบ — หัวคอลัมน์ = `label` ภาษาไทย (อยู่ในชุดที่ `resolveImportField()` รู้จัก)
 * เรียงคอลัมน์บังคับก่อนแล้วตามด้วยไม่บังคับ
 */
export const CASE_IMPORT_TEMPLATE_COLUMNS: readonly ImportTemplateColumn[] = sortTemplateColumns(
  IMPORT_COLUMNS.map((column) => ({ header: column.label, ...IMPORT_COLUMN_TEMPLATE[column.field] })),
)

export const CASE_IMPORT_TEMPLATE_DOCS: readonly ImportTemplateColumnDoc[] = templateColumnDocs(
  CASE_IMPORT_TEMPLATE_COLUMNS,
)

export const CASE_IMPORT_TEMPLATE_FILE_NAME = 'case-import-template.csv'
/** แม่แบบหลัก (มติผู้ใช้ 04/10/2569) — สร้างด้วย `buildImportTemplateXlsx(CASE_IMPORT_TEMPLATE_COLUMNS)` */
export const CASE_IMPORT_TEMPLATE_XLSX_FILE_NAME = 'case-import-template.xlsx'

/** เพดานแถวข้อมูลต่อการนำเข้า 1 ครั้ง (ตรงกับ `caseImportSchema.rows`) */
export const MAX_CASE_IMPORT_ROWS = 1000

/** เนื้อไฟล์ `case-import-template.csv` (UTF-8 + BOM) — ไม่มีข้อมูลจริง สร้างฝั่ง client ได้ */
export function buildCaseImportTemplate(): string {
  return buildImportTemplateCsv(CASE_IMPORT_TEMPLATE_COLUMNS)
}

/** เทียบหัวคอลัมน์แบบไม่สนตัวพิมพ์/ช่องว่าง/`_`/`-`/วงเล็บ */
export function normalizeHeader(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[\s_\-.()[\]/]/g, '')
}

const ALIAS_TO_FIELD = new Map<string, ImportField>(
  IMPORT_COLUMNS.flatMap((column) => [
    [normalizeHeader(column.label), column.field] as const,
    ...column.aliases.map((alias) => [normalizeHeader(alias), column.field] as const),
  ]),
)

function importColumnLabel(field: ImportField): string {
  return IMPORT_COLUMNS.find((column) => column.field === field)?.label ?? field
}

/** หัวคอลัมน์ → ฟิลด์ปลายทาง (`null` = คอลัมน์ที่ระบบไม่รู้จัก — ข้ามไป ไม่ทำให้แถวผิด) */
export function resolveImportField(header: string): ImportField | null {
  return ALIAS_TO_FIELD.get(normalizeHeader(header)) ?? null
}

/** คอลัมน์ในไฟล์ที่ระบบไม่รู้จัก — wizard เอาไปเตือนก่อนยืนยันนำเข้า */
export function unmappedHeaders(headers: readonly string[]): string[] {
  return headers.filter((header) => header.trim() !== '' && resolveImportField(header) === null)
}

// ── แปลงค่าในเซลล์ → ค่าที่ schema รับ ───────────────────────────────────────

const NATIONALITY_ALIASES: Record<string, DebtorNationalityCode> = {
  ไทย: 'TH',
  th: 'TH',
  thai: 'TH',
  พม่า: 'MM',
  เมียนมา: 'MM',
  mm: 'MM',
  ลาว: 'LA',
  la: 'LA',
  กัมพูชา: 'KH',
  เขมร: 'KH',
  kh: 'KH',
  อื่น: 'OTHER',
  อื่นๆ: 'OTHER',
  other: 'OTHER',
}

export function parseNationality(value: string): DebtorNationalityCode | null | 'invalid' {
  const trimmed = value.trim()
  if (trimmed === '') return null
  const upper = trimmed.toUpperCase()
  if ((DEBTOR_NATIONALITIES as readonly string[]).includes(upper)) return upper as DebtorNationalityCode
  return NATIONALITY_ALIASES[trimmed.toLowerCase()] ?? 'invalid'
}

const ASSET_TYPE_ALIASES: Record<string, 'smartphone' | 'tablet'> = {
  smartphone: 'smartphone',
  phone: 'smartphone',
  มือถือ: 'smartphone',
  โทรศัพท์: 'smartphone',
  สมาร์ทโฟน: 'smartphone',
  tablet: 'tablet',
  แท็บเล็ต: 'tablet',
  แทบเลต: 'tablet',
}

export function parseAssetType(value: string): 'smartphone' | 'tablet' | null | 'invalid' {
  const trimmed = value.trim()
  if (trimmed === '') return null
  return ASSET_TYPE_ALIASES[trimmed.toLowerCase()] ?? 'invalid'
}

type MappedRow = Record<string, unknown>

/**
 * คอลัมน์ตัวเลขยาวที่ Excel ชอบแปลงเพี้ยน — ค่าเลขยกกำลัง (`3.5E+14`) ต้อง reject แถว ห้ามเดาค่าคืน
 * (มติผู้ใช้ 04/10/2569 · IMEI exact match 15 หลัก) — key = ชื่อฟิลด์ใน error ของแถว
 */
const NUMERIC_TEXT_FIELDS: ReadonlyArray<{ field: ImportField; errorKey: string }> = [
  { field: 'caseRef', errorKey: 'caseRef' },
  { field: 'debtorNationalId', errorKey: 'debtorNationalId' },
  { field: 'debtorPassportNo', errorKey: 'debtorPassportNo' },
  { field: 'debtorPhoneMobile', errorKey: 'debtorPhoneMobile' },
  { field: 'debtorPhoneWork', errorKey: 'debtorPhoneWork' },
  { field: 'assetImeiSerial', errorKey: 'assetImeiSerial' },
]

/** เบอร์โทรไทยขึ้นต้นด้วย 0 เสมอ — ตัวเลขล้วน 8–9 หลักที่ไม่ขึ้นต้น 0 = เลข 0 นำหน้าถูก Excel ตัดทิ้ง */
const PHONE_FIELDS: readonly ImportField[] = ['debtorPhoneMobile', 'debtorPhoneWork']

export function looksLikeLostLeadingZeroPhone(value: string): boolean {
  return /^[1-9]\d{7,8}$/.test(value.trim())
}

/** ประกอบ payload ของ `POST /api/cases` จากแถวดิบ (ยังไม่ validate — ค่าที่แปลงไม่ได้ถูกทิ้งไว้ให้ Zod จับ) */
export function mapImportRow(
  raw: Record<string, unknown>,
  financeCompanyId: string,
): { payload: MappedRow; errors: Record<string, string> } {
  const values = new Map<ImportField, string>()
  const errors: Record<string, string> = {}

  for (const [header, cell] of Object.entries(raw)) {
    const field = resolveImportField(header)
    if (field === null) continue
    const text = cell === null || cell === undefined ? '' : String(cell).trim()
    if (text !== '') values.set(field, text)
  }

  const text = (field: ImportField): string | undefined => values.get(field)

  for (const { field, errorKey } of NUMERIC_TEXT_FIELDS) {
    const value = text(field)
    if (value !== undefined && looksLikeScientificNotation(value)) {
      errors[errorKey] = scientificNotationMessage(importColumnLabel(field), value)
    }
  }
  for (const field of PHONE_FIELDS) {
    const value = text(field)
    if (value !== undefined && errors[field] === undefined && looksLikeLostLeadingZeroPhone(value)) {
      errors[field] = `${importColumnLabel(field)} "${value}" ไม่มีเลข 0 นำหน้า (Excel อาจตัดทิ้ง) — ตั้งรูปแบบเซลล์เป็น “ข้อความ” แล้วพิมพ์เบอร์ใหม่ให้ครบ`
    }
  }

  const addressOf = (prefix: 'addressCurrent' | 'addressWork' | 'addressIdCard') => {
    const block = {
      detail: text(`${prefix}.detail` as ImportField) ?? null,
      postalCode: text(`${prefix}.postalCode` as ImportField) ?? null,
      province: text(`${prefix}.province` as ImportField) ?? null,
      district: text(`${prefix}.district` as ImportField) ?? null,
      subdistrict: text(`${prefix}.subdistrict` as ImportField) ?? null,
    }
    return Object.values(block).every((value) => value === null) ? undefined : block
  }

  const nationalityRaw = text('debtorNationality')
  const nationality = nationalityRaw === undefined ? null : parseNationality(nationalityRaw)
  if (nationality === 'invalid') errors.debtorNationality = `สัญชาติ "${nationalityRaw}" ไม่อยู่ในรายการที่ระบบรับ`

  const assetTypeRaw = text('assetType')
  const assetType = assetTypeRaw === undefined ? null : parseAssetType(assetTypeRaw)
  if (assetType === 'invalid') errors.assetType = `ประเภทสินค้า "${assetTypeRaw}" ต้องเป็นมือถือหรือแท็บเล็ตเท่านั้น`

  const debtRaw = text('outstandingDebtBaht')
  let outstandingDebtSatang: number | null = null
  if (debtRaw !== undefined) {
    const satang = parseBahtInput(debtRaw)
    if (satang === null || Number.isNaN(satang)) {
      errors.outstandingDebtSatang = `มูลหนี้คงเหลือ "${debtRaw}" ไม่ใช่จำนวนเงินที่ถูกต้อง`
    } else {
      outstandingDebtSatang = satang
    }
  }

  const payload: MappedRow = {
    caseRef: text('caseRef') ?? '',
    financeCompanyId,
    sourceChannel: 'import',
    debtorName: text('debtorName') ?? null,
    debtorNationality: nationality === 'invalid' ? null : nationality,
    debtorNationalityOther: text('debtorNationalityOther') ?? null,
    debtorNationalId: text('debtorNationalId') ?? null,
    debtorPassportNo: text('debtorPassportNo') ?? null,
    debtorPhoneMobile: text('debtorPhoneMobile') ?? null,
    debtorPhoneWork: text('debtorPhoneWork') ?? null,
    debtorLineId: text('debtorLineId') ?? null,
    debtorFacebook: text('debtorFacebook') ?? null,
    addressCurrent: addressOf('addressCurrent'),
    addressWork: addressOf('addressWork'),
    addressIdCard: addressOf('addressIdCard'),
    assetType: assetType === 'invalid' ? null : assetType,
    assetBrandModel: text('assetBrandModel') ?? null,
    assetImeiSerial: text('assetImeiSerial') ?? null,
    outstandingDebtSatang,
  }

  return { payload, errors }
}

// ── ผลลัพธ์ต่อแถว ───────────────────────────────────────────────────────────

export interface ImportRowError {
  rowNumber: number
  /** code ตาม `38` §12 (แถวที่ mapping/validate ไม่ผ่าน) */
  code: 'API_VALIDATION_FAILED'
  fields: Record<string, string>
}

export interface ImportRowValue {
  rowNumber: number
  input: CaseCreateInput
}

export interface ImportPlan {
  rows: ImportRowValue[]
  errors: ImportRowError[]
}

/**
 * แปลงทุกแถวเป็น payload ที่พร้อมสร้างเคส + รวมรายการแถวที่ผิด
 * `rowNumber` เริ่มที่ 2 เพราะแถวที่ 1 ของไฟล์คือหัวคอลัมน์ (ผู้ใช้เปิดไฟล์แล้วเห็นเลขเดียวกัน)
 */
export function planImport(
  rawRows: readonly Record<string, unknown>[],
  financeCompanyId: string,
): ImportPlan {
  const rows: ImportRowValue[] = []
  const errors: ImportRowError[] = []

  rawRows.forEach((raw, index) => {
    const rowNumber = index + 2
    const { payload, errors: mappingErrors } = mapImportRow(raw, financeCompanyId)
    const parsed = caseCreateSchema.safeParse(payload)

    if (!parsed.success || Object.keys(mappingErrors).length > 0) {
      const fieldErrors = parsed.success ? {} : toFieldErrors(parsed.error)
      errors.push({ rowNumber, code: 'API_VALIDATION_FAILED', fields: { ...fieldErrors, ...mappingErrors } })
      return
    }
    rows.push({ rowNumber, input: parsed.data })
  })

  return { rows, errors }
}

/** แถวที่ `case_ref` ซ้ำกันเองภายในไฟล์เดียว — กันไว้ก่อนถึง DB (แถวหลังเป็นฝ่ายผิด) */
export function findDuplicateRefsInFile(rows: readonly ImportRowValue[], normalize: (ref: string) => string): Set<number> {
  const seen = new Map<string, number>()
  const duplicates = new Set<number>()
  for (const row of rows) {
    const key = normalize(row.input.caseRef)
    if (seen.has(key)) duplicates.add(row.rowNumber)
    else seen.set(key, row.rowNumber)
  }
  return duplicates
}
