import type { BankFileEncoding, BankFileTestStatus, BankFileType } from '@/lib/generated/prisma/enums'
import { SettingsError } from '@/lib/settings/errors'

/**
 * รูปแบบไฟล์ธนาคาร (`13` §6.8) — **pure ล้วน**
 *
 * State machine เดียวของไฟล์ 13 (`13` §8): `pending → passed | failed → (แก้ mapping) → pending`
 * และ **gate สำคัญ**: format ที่ `test_status ≠ passed` ห้ามนำไปสร้างไฟล์โอนเงินจริง
 * (`BANK_FILE_NOT_TESTED` — Phase 3.4 Payout Batch เรียก `assertBankFileUsable()` ตัวนี้)
 *
 * "ทดสอบไฟล์ตัวอย่าง" ในเฟสนี้ = ตรวจว่า `column_mapping` ประกอบไฟล์ได้จริงหรือไม่
 * (คอลัมน์ที่ธนาคารต้องมีครบ / ไม่มีคอลัมน์แปลกปลอม / ไม่ซ้ำ / encoding รองรับตัวอักษรไทย)
 * — ยังไม่ใช่การยิงไฟล์เข้าระบบธนาคารจริง ซึ่งเป็น Open Item 🔶 ของ `13` §17
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

/** คอลัมน์ที่ขาดไม่ได้ — ไม่มีตัวใดตัวหนึ่ง ธนาคารตัดโอนไม่ได้ */
export const REQUIRED_BANK_FILE_COLUMNS: readonly BankFileColumn[] = [
  'receiving_bank_code',
  'receiving_account_no',
  'receiving_account_name',
  'amount',
]

export interface BankFileFormatValues {
  bankName: string
  fileType: BankFileType
  encoding: BankFileEncoding
  /** รายชื่อคอลัมน์ตามลำดับที่ธนาคารกำหนด คั่นด้วย `,` หรือขึ้นบรรทัดใหม่ */
  columnMapping: string
}

export interface BankFileTestResult {
  status: Extract<BankFileTestStatus, 'passed' | 'failed'>
  columns: string[]
  /** ปัญหาที่พบ — ว่าง = ผ่าน (FE แสดงเป็นรายการใต้ปุ่มทดสอบ) */
  issues: string[]
  /** ตัวอย่างบรรทัดข้อมูลที่ระบบจะสร้างด้วย mapping ชุดนี้ */
  samplePreview: string
}

/** แยก `column_mapping` เป็นรายชื่อคอลัมน์ (ตัดช่องว่าง/บรรทัดว่างทิ้ง คงลำดับเดิม) */
export function parseColumnMapping(columnMapping: string): string[] {
  return columnMapping
    .split(/[\n,]/)
    .map((column) => column.trim().toLowerCase())
    .filter((column) => column.length > 0)
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

function isSupportedColumn(column: string): column is BankFileColumn {
  return (SUPPORTED_BANK_FILE_COLUMNS as readonly string[]).includes(column)
}

/** TIS-620 เก็บได้เฉพาะไทย+ละติน — คอลัมน์ที่อาจมีอักขระอื่น (อีเมล/หมายเหตุ) ต้องเตือน */
const NON_TIS620_SAFE_COLUMNS: readonly BankFileColumn[] = ['email']

/**
 * ทดสอบรูปแบบไฟล์ (`POST /api/settings/bank-file-formats/:id/test` — `13` §13)
 * ผลลัพธ์ deterministic ล้วน: input เดิม → ผลเดิมเสมอ (ทดสอบซ้ำได้ ไม่พึ่งเวลา/เครือข่าย)
 */
export function runBankFileTest(values: BankFileFormatValues): BankFileTestResult {
  const columns = parseColumnMapping(values.columnMapping)
  const issues: string[] = []

  if (columns.length === 0) {
    issues.push('ยังไม่ได้ระบุคอลัมน์ใดเลยใน column_mapping')
  }

  const unknown = columns.filter((column) => !isSupportedColumn(column))
  if (unknown.length > 0) {
    issues.push(`คอลัมน์ที่ระบบยังสร้างค่าให้ไม่ได้: ${unknown.join(', ')}`)
  }

  const duplicates = columns.filter((column, index) => columns.indexOf(column) !== index)
  if (duplicates.length > 0) {
    issues.push(`คอลัมน์ซ้ำ: ${[...new Set(duplicates)].join(', ')}`)
  }

  const missing = REQUIRED_BANK_FILE_COLUMNS.filter((column) => !columns.includes(column))
  if (missing.length > 0) {
    issues.push(`ขาดคอลัมน์บังคับ: ${missing.join(', ')}`)
  }

  if (values.encoding === 'TIS_620') {
    const risky = columns.filter((column) => (NON_TIS620_SAFE_COLUMNS as readonly string[]).includes(column))
    if (risky.length > 0) {
      issues.push(`encoding TIS-620 อาจเก็บอักขระของคอลัมน์ ${risky.join(', ')} ไม่ครบ — ยืนยันกับธนาคารก่อนใช้จริง`)
    }
  }

  const known = columns.filter(isSupportedColumn)
  const separator = values.fileType === 'CSV' ? ',' : '|'
  const samplePreview = known.map((column) => SAMPLE_VALUES[column]).join(separator)

  return {
    status: issues.length === 0 ? 'passed' : 'failed',
    columns,
    issues,
    samplePreview,
  }
}

/** แก้ `column_mapping`/`file_type`/`encoding` = ผลทดสอบเดิมใช้ไม่ได้ ต้องกลับไป `pending` (`13` §8) */
export function testStatusAfterEdit(
  before: BankFileFormatValues,
  after: BankFileFormatValues,
  currentStatus: BankFileTestStatus,
): BankFileTestStatus {
  const affectsFile =
    before.columnMapping !== after.columnMapping ||
    before.fileType !== after.fileType ||
    before.encoding !== after.encoding
  return affectsFile ? 'pending' : currentStatus
}

/**
 * **Gate ก่อนสร้างไฟล์โอนเงินจริง** (`13` §6.8/§10 · `24` §6.3) — Phase 3.4 (`17`) ต้องเรียกตัวนี้
 * ห้าม inline เงื่อนไขนี้ที่อื่น: จุดตรวจเดียวทำให้เพิ่ม log/alert ทีหลังได้ที่เดียว
 */
export function assertBankFileUsable(format: { id: string; bankName: string; testStatus: BankFileTestStatus }): void {
  if (format.testStatus === 'passed') return
  throw new SettingsError('BANK_FILE_NOT_TESTED', {
    detail: `bank_file_format=${format.id} status=${format.testStatus}`,
    context: { bankName: format.bankName, testStatus: format.testStatus },
  })
}
