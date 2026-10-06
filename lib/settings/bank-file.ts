import {
  STATEMENT_COLUMN_LABEL,
  StatementParseError,
  SUPPORTED_STATEMENT_COLUMNS,
  buildStatementImportTemplate,
  isUsableStatementMapping,
  parseStatementCsv,
  type StatementColumn,
} from '@/lib/bank-recon/statement'
import { thaiBankByCode } from '@/lib/banks/thai-banks'
import type { BankFileEncoding, BankFilePurpose, BankFileTestStatus, BankFileType } from '@/lib/generated/prisma/enums'
import { SettingsError } from '@/lib/settings/errors'

/**
 * รูปแบบไฟล์ธนาคาร (`13` §6.8) — **pure ล้วน**
 *
 * มติ PO U147 (Final Test ด่าน 5 ND-5) — "เลือกจากรายการทั้งหมด":
 *  · `purpose` บอกว่าเป็นไฟล์ **statement** (นำเข้ากระทบยอด — ไฟล์ 35) หรือ **ไฟล์โอนเงิน** (ส่งธนาคาร — ไฟล์ 17)
 *  · ธนาคารเลือกจากรายการธนาคารไทยมาตรฐานชุดเดียว (`lib/banks/thai-banks.ts`) — เก็บ `bank_code` + ชื่อมาตรฐาน
 *  · คอลัมน์เลือกจากคำศัพท์ของชนิดนั้นเท่านั้น — คำศัพท์ชุดเดียวกับที่ตัวนำเข้า statement
 *    (`SUPPORTED_STATEMENT_COLUMNS`) / ตัวสร้างไฟล์โอน (`SUPPORTED_BANK_FILE_COLUMNS`) ใช้จริง
 *
 * State machine เดียวของไฟล์ 13 (`13` §8): `pending → passed | failed → (แก้ mapping) → pending`
 * และ **gate สำคัญ**: format ที่ `test_status ≠ passed` ห้ามนำไปสร้างไฟล์โอนเงินจริง (`BANK_FILE_NOT_TESTED`)
 *
 * "ทดสอบ" = ประกอบไฟล์ตัวอย่างจาก `column_mapping` แล้วตรวจกับตัวจริง:
 *  · ไฟล์โอน — คอลัมน์ที่ระบบสร้างค่าได้ครบ/ไม่ซ้ำ/encoding รองรับ (ยังไม่ยิงเข้าระบบธนาคารจริง — 🔶 `13` §17)
 *  · statement — สร้างไฟล์ตัวอย่างตามลำดับคอลัมน์แล้ว **ส่งเข้าตัวนำเข้า statement ตัวจริง** ต้องอ่านได้ครบทุกแถว
 */

/** คอลัมน์ที่ระบบสร้างค่าให้ได้ (ไฟล์โอนเงินของ `17` §6.4 + `28` §6.5) */
export const SUPPORTED_BANK_FILE_COLUMNS = [
  'receiving_bank_code',
  'receiving_account_no',
  'receiving_account_name',
  'amount',
  'transfer_date',
  'reference_no',
  'payer_account_no',
  'payer_name',
  'citizen_id',
  'email',
  'mobile_no',
  'remark',
] as const

export type BankFileColumn = (typeof SUPPORTED_BANK_FILE_COLUMNS)[number]

/** ชื่อคอลัมน์ไฟล์โอนภาษาไทย (ตัวเลือกบนหน้าตั้งค่า) */
export const PAYMENT_FILE_COLUMN_LABEL: Readonly<Record<BankFileColumn, string>> = {
  receiving_bank_code: 'รหัสธนาคารผู้รับ',
  receiving_account_no: 'เลขบัญชีผู้รับ',
  receiving_account_name: 'ชื่อบัญชีผู้รับ',
  amount: 'จำนวนเงิน',
  transfer_date: 'วันที่โอน',
  reference_no: 'เลขที่อ้างอิง',
  payer_account_no: 'เลขบัญชีผู้โอน',
  payer_name: 'ชื่อผู้โอน',
  citizen_id: 'เลขประจำตัวผู้เสียภาษีผู้รับ',
  email: 'อีเมลผู้รับ',
  mobile_no: 'เบอร์มือถือผู้รับ',
  remark: 'หมายเหตุ',
}

/** คอลัมน์ที่ขาดไม่ได้ — ไม่มีตัวใดตัวหนึ่ง ธนาคารตัดโอนไม่ได้ */
export const REQUIRED_BANK_FILE_COLUMNS: readonly BankFileColumn[] = [
  'receiving_bank_code',
  'receiving_account_no',
  'receiving_account_name',
  'amount',
]

export const BANK_FILE_PURPOSES = ['statement', 'payment'] as const satisfies readonly BankFilePurpose[]

export const BANK_FILE_PURPOSE_LABEL: Readonly<Record<BankFilePurpose, string>> = {
  statement: 'ไฟล์ statement (นำเข้ากระทบยอด)',
  payment: 'ไฟล์โอนเงิน (ส่งธนาคาร)',
}

export interface BankFileColumnOption {
  value: string
  label: string
  required: boolean
}

/** ตัวเลือกคอลัมน์ของชนิดนั้น — คำศัพท์ชุดเดียวกับตัวนำเข้า/ตัวสร้างไฟล์ที่ใช้จริง */
export function bankFileColumnOptions(purpose: BankFilePurpose): BankFileColumnOption[] {
  if (purpose === 'statement') {
    return SUPPORTED_STATEMENT_COLUMNS.map((column) => ({
      value: column,
      label: STATEMENT_COLUMN_LABEL[column],
      required: column === 'transaction_date',
    }))
  }
  return SUPPORTED_BANK_FILE_COLUMNS.map((column) => ({
    value: column,
    label: PAYMENT_FILE_COLUMN_LABEL[column],
    required: REQUIRED_BANK_FILE_COLUMNS.includes(column),
  }))
}

/** คอลัมน์นี้อยู่ในคำศัพท์ของชนิดนั้นไหม */
export function isColumnOfPurpose(purpose: BankFilePurpose, column: string): boolean {
  return purpose === 'statement'
    ? (SUPPORTED_STATEMENT_COLUMNS as readonly string[]).includes(column)
    : (SUPPORTED_BANK_FILE_COLUMNS as readonly string[]).includes(column)
}

/** ป้ายคอลัมน์ (ไม่รู้จัก = คืนค่าเดิม) */
export function bankFileColumnLabel(purpose: BankFilePurpose, column: string): string {
  return bankFileColumnOptions(purpose).find((option) => option.value === column)?.label ?? column
}

export interface BankFileFormatValues {
  purpose: BankFilePurpose
  /** รหัสธนาคาร 3 หลักจากรายการมาตรฐาน — `null` = ข้อมูลเดิมที่จับคู่ธนาคารไม่ได้ */
  bankCode: string | null
  fileType: BankFileType
  encoding: BankFileEncoding
  /** รายชื่อคอลัมน์ตามลำดับที่ธนาคารกำหนด คั่นด้วย `,` */
  columnMapping: string
}

export interface BankFileTestResult {
  status: Extract<BankFileTestStatus, 'passed' | 'failed'>
  columns: string[]
  /** ปัญหาที่พบ — ว่าง = ผ่าน (FE แสดงเป็นรายการใต้ปุ่มทดสอบ) */
  issues: string[]
  /** ตัวอย่างข้อมูลที่ระบบจะสร้าง/อ่านด้วย mapping ชุดนี้ */
  samplePreview: string
}

/** แยก `column_mapping` เป็นรายชื่อคอลัมน์ (ตัดช่องว่าง/บรรทัดว่างทิ้ง คงลำดับเดิม) */
export function parseColumnMapping(columnMapping: string): string[] {
  return columnMapping
    .split(/[\n,]/)
    .map((column) => column.trim().toLowerCase())
    .filter((column) => column.length > 0)
}

/** รายชื่อคอลัมน์ที่เลือก → `column_mapping` ที่เก็บ */
export function toColumnMapping(columns: readonly string[]): string {
  return columns.map((column) => column.trim().toLowerCase()).filter((column) => column !== '').join(',')
}

/** ชื่อธนาคารมาตรฐานของรหัส (ระบบเขียนลง `bank_name`) — ไม่รู้จัก = `null` */
export function bankNameOfCode(bankCode: string | null): string | null {
  return thaiBankByCode(bankCode)?.name ?? null
}

/** ข้อความแสดงรูปแบบในตัวเลือกของบัญชีธนาคาร/หน้าสร้างไฟล์โอน */
export function bankFileFormatLabel(format: {
  bankName: string
  fileType: BankFileType
  encoding: BankFileEncoding
  columns: readonly string[]
}): string {
  const encoding = format.encoding === 'TIS_620' ? 'TIS-620' : 'UTF-8'
  return `${format.bankName} · ${format.fileType} ${encoding} · ${format.columns.length} คอลัมน์`
}

/** ค่าตัวอย่างต่อคอลัมน์ — คงที่เสมอเพื่อให้ผลทดสอบ deterministic (ไม่ใช้เวลา/สุ่ม) */
const SAMPLE_VALUES: Readonly<Record<BankFileColumn, string>> = {
  receiving_bank_code: '004',
  receiving_account_no: '1234567890',
  receiving_account_name: 'บริษัท ตัวอย่าง จำกัด',
  amount: '1500.00',
  transfer_date: '15/08/2569',
  reference_no: 'PB-2569-0001',
  payer_account_no: '9876543210',
  payer_name: 'บริษัท แอสเซท รีคัฟเวอรี่ จำกัด',
  citizen_id: '1234567890123',
  email: 'payee@example.com',
  mobile_no: '0812345678',
  remark: 'ค่าตอบแทนรอบ 08/2569',
}

function isPaymentColumn(column: string): column is BankFileColumn {
  return (SUPPORTED_BANK_FILE_COLUMNS as readonly string[]).includes(column)
}

/** TIS-620 เก็บได้เฉพาะไทย+ละติน — คอลัมน์ที่อาจมีอักขระอื่น (อีเมล/หมายเหตุ) ต้องเตือน */
const NON_TIS620_SAFE_COLUMNS: readonly BankFileColumn[] = ['email']

function describeColumns(purpose: BankFilePurpose, columns: readonly string[]): string {
  return columns.map((column) => `${bankFileColumnLabel(purpose, column)} (${column})`).join(', ')
}

function commonIssues(values: BankFileFormatValues, columns: readonly string[]): string[] {
  const issues: string[] = []
  if (bankNameOfCode(values.bankCode) === null) issues.push('ยังไม่ได้เลือกธนาคารจากรายการ')
  if (columns.length === 0) issues.push('ยังไม่ได้เลือกคอลัมน์ใดเลย')
  const unknown = columns.filter((column) => !isColumnOfPurpose(values.purpose, column))
  if (unknown.length > 0) {
    issues.push(`คอลัมน์ที่ไม่ใช่ของ${BANK_FILE_PURPOSE_LABEL[values.purpose]}: ${unknown.join(', ')}`)
  }
  const duplicates = [...new Set(columns.filter((column, index) => columns.indexOf(column) !== index))]
  if (duplicates.length > 0) issues.push(`คอลัมน์ซ้ำ: ${describeColumns(values.purpose, duplicates)}`)
  return issues
}

function runPaymentFileTest(values: BankFileFormatValues, columns: string[]): BankFileTestResult {
  const issues = commonIssues(values, columns)

  const missing = REQUIRED_BANK_FILE_COLUMNS.filter((column) => !columns.includes(column))
  if (missing.length > 0) issues.push(`ขาดคอลัมน์บังคับ: ${describeColumns('payment', missing)}`)

  if (values.encoding === 'TIS_620') {
    const risky = columns.filter((column) => (NON_TIS620_SAFE_COLUMNS as readonly string[]).includes(column))
    if (risky.length > 0) {
      issues.push(`encoding TIS-620 อาจเก็บอักขระของคอลัมน์ ${risky.join(', ')} ไม่ครบ — ยืนยันกับธนาคารก่อนใช้จริง`)
    }
  }

  const separator = values.fileType === 'CSV' ? ',' : '|'
  const samplePreview = columns
    .filter(isPaymentColumn)
    .map((column) => SAMPLE_VALUES[column])
    .join(separator)

  return { status: issues.length === 0 ? 'passed' : 'failed', columns, issues, samplePreview }
}

/**
 * statement: ประกอบไฟล์ตัวอย่างด้วยแม่แบบนำเข้าตามลำดับคอลัมน์ที่ตั้ง แล้วอ่านด้วย `parseStatementCsv()` ตัวจริง
 * ⇒ ผ่าน = ไฟล์ของธนาคารที่เรียงคอลัมน์ตามนี้นำเข้าได้จริง
 */
function runStatementFileTest(values: BankFileFormatValues, columns: string[]): BankFileTestResult {
  const issues = commonIssues(values, columns)
  // ตัวนำเข้าอ่านไฟล์เป็นข้อความ CSV UTF-8 (หรือ .xlsx) — TXT fixed-width / TIS-620 อ่านไม่ได้
  if (values.fileType !== 'CSV') issues.push('ตัวนำเข้า statement อ่านไฟล์ CSV (หรือ Excel) เท่านั้น — เลือกชนิดไฟล์ CSV')
  if (values.encoding !== 'UTF_8') issues.push('ตัวนำเข้า statement อ่านไฟล์ UTF-8 เท่านั้น — เลือก encoding UTF-8')

  const known = columns.filter((column): column is StatementColumn => isColumnOfPurpose('statement', column))
  if (!isUsableStatementMapping(known)) {
    issues.push('ต้องมีคอลัมน์ "วันที่" และคอลัมน์ยอดเงินอย่างน้อย 1 ช่อง (เงินเข้า / เงินออก / จำนวนเงิน)')
  }

  let samplePreview = ''
  if (issues.length === 0) {
    const template = buildStatementImportTemplate(toColumnMapping(columns))
    samplePreview = template.csv.replace(/^﻿/, '').trim()
    try {
      const parsed = parseStatementCsv({ csv: template.csv, columnMapping: toColumnMapping(columns) })
      if (!parsed.usedConfiguredMapping) issues.push('ตัวนำเข้าไม่ได้ใช้ลำดับคอลัมน์ที่ตั้งไว้')
      // ตัวอย่างมี 2 แถว (เงินเข้า 1 · เงินออก 1) — รูปแบบที่มีแค่ช่องเงินเข้าหรือเงินออกอ่านได้แถวเดียวตามจริง
      if (parsed.rows.length === 0) issues.push('ตัวนำเข้าอ่านไฟล์ตัวอย่างตามลำดับคอลัมน์นี้ไม่ได้เลย')
    } catch (error) {
      if (!(error instanceof StatementParseError)) throw error
      issues.push(error.message)
    }
  }

  return { status: issues.length === 0 ? 'passed' : 'failed', columns, issues, samplePreview }
}

/**
 * ทดสอบรูปแบบไฟล์ (`POST /api/settings/bank-file-formats/:id/test` — `13` §13)
 * ผลลัพธ์ deterministic ล้วน: input เดิม → ผลเดิมเสมอ (ทดสอบซ้ำได้ ไม่พึ่งเวลา/เครือข่าย)
 */
export function runBankFileTest(values: BankFileFormatValues): BankFileTestResult {
  const columns = parseColumnMapping(values.columnMapping)
  return values.purpose === 'statement' ? runStatementFileTest(values, columns) : runPaymentFileTest(values, columns)
}

/** แก้ชนิด/ธนาคาร/mapping/ชนิดไฟล์/encoding = ผลทดสอบเดิมใช้ไม่ได้ ต้องกลับไป `pending` (`13` §8) */
export function testStatusAfterEdit(
  before: BankFileFormatValues,
  after: BankFileFormatValues,
  currentStatus: BankFileTestStatus,
): BankFileTestStatus {
  const affectsFile =
    before.purpose !== after.purpose ||
    before.bankCode !== after.bankCode ||
    before.columnMapping !== after.columnMapping ||
    before.fileType !== after.fileType ||
    before.encoding !== after.encoding
  return affectsFile ? 'pending' : currentStatus
}

/**
 * **Gate ก่อนสร้างไฟล์โอนเงินจริง** (`13` §6.8/§10 · `24` §6.3) — Phase 3.4 (`17`) ต้องเรียกตัวนี้
 * ห้าม inline เงื่อนไขนี้ที่อื่น: จุดตรวจเดียวทำให้เพิ่ม log/alert ทีหลังได้ที่เดียว
 * · รูปแบบ statement ไม่ใช่ไฟล์โอน ⇒ `BANK_FILE_FORMAT_NOT_FOUND` (ไม่มีรูปแบบไฟล์โอนตามที่อ้าง — มติ PO U147)
 */
export function assertBankFileUsable(format: {
  id: string
  bankName: string
  testStatus: BankFileTestStatus
  purpose?: BankFilePurpose
}): void {
  if (format.purpose !== undefined && format.purpose !== 'payment') {
    throw new SettingsError('BANK_FILE_FORMAT_NOT_FOUND', {
      detail: `bank_file_format=${format.id} purpose=${format.purpose}`,
    })
  }
  if (format.testStatus === 'passed') return
  throw new SettingsError('BANK_FILE_NOT_TESTED', {
    detail: `bank_file_format=${format.id} status=${format.testStatus}`,
    context: { bankName: format.bankName, testStatus: format.testStatus },
  })
}
