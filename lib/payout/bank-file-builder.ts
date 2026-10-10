import { fmtDate } from '@/lib/format/datetime'
import type { BankFileEncoding, BankFileType } from '@/lib/generated/prisma/enums'
import { parseColumnMapping, type BankFileColumn } from '@/lib/settings/bank-file'

/**
 * ตัวสร้างไฟล์โอนเงินธนาคาร (`17` §6.4 · `13` §6.8) — **pure ล้วน ไม่มี I/O**
 *
 * ประกอบไฟล์ตาม `column_mapping` ของรูปแบบที่ตั้งไว้ (ไฟล์ 13) เท่านั้น — **ห้าม hardcode ลำดับ
 * คอลัมน์ของธนาคารใดธนาคารหนึ่ง** (`17` §18: รายชื่อธนาคาร/format ตั้งค่าได้ ไม่ fix ในโค้ด)
 *
 * ### กติกา
 * - ยอดเงินในไฟล์เป็น **บาททศนิยม 2 ตำแหน่ง** แปลงจาก satang ด้วยเลขจำนวนเต็มล้วน (ห้าม float)
 * - วันที่ในไฟล์ใช้ `fmtDate()` (พ.ศ. `DD/MM/YYYY` — Rule 01) เหมือนตัวอย่างของ `runBankFileTest()`
 * - gate `assertBankFileUsable()` (1.10) ต้องผ่าน **ก่อน** เรียกตัวนี้เสมอ — ที่นี่ไม่ตรวจ `test_status`
 * - ผลลัพธ์ deterministic ล้วน: input เดิม → ไฟล์เดิม (ทำให้ hash เทียบย้อนหลังได้)
 */

/** ค่าที่ระบบเติมลงแต่ละแถวของไฟล์โอน (1 แถว = 1 ผู้รับในรอบ — staging E-009 · เดิม 1 แถวต่อรายการ) */
export interface PaymentFileRowInput {
  receivingBankCode: string
  receivingAccountNo: string
  receivingAccountName: string
  /** ยอดที่โอนจริง = `net_satang` (หลังหัก WHT แล้ว — `17` §6.2) */
  netSatang: number
  citizenId: string | null
  email: string | null
  mobileNo: string | null
  remark: string
  /** เลขอ้างอิงต่อแถว — ผูกกับ `idempotency_key` ของรอบจ่าย (`17` §6.3) */
  referenceNo: string
}

export interface PaymentFileInput {
  columnMapping: string
  fileType: BankFileType
  payerAccountNo: string
  payerName: string
  transferDate: Date
  rows: readonly PaymentFileRowInput[]
  /** staging E-009 — แถวแรกเป็นชื่อคอลัมน์ตาม `column_mapping` (ตั้งต่อรูปแบบไฟล์ `bank_file_formats.include_header`) */
  includeHeader?: boolean
}

export interface PaymentFileContent {
  /** เนื้อไฟล์ก่อน encode (บรรทัดสุดท้ายมี newline ปิดเสมอ) */
  text: string
  columns: string[]
  rowCount: number
}

/** satang → บาททศนิยม 2 ตำแหน่ง ด้วยเลขจำนวนเต็มล้วน (Rule 01 — ห้ามหารเป็น float) */
export function bahtAmountString(satang: number): string {
  if (!Number.isInteger(satang) || satang < 0) {
    throw new RangeError(`ยอดโอนต้องเป็นจำนวนเต็ม satang ที่ไม่ติดลบ (ได้ ${satang})`)
  }
  return `${Math.trunc(satang / 100)}.${String(satang % 100).padStart(2, '0')}`
}

function valueOf(
  column: BankFileColumn,
  row: PaymentFileRowInput,
  file: Pick<PaymentFileInput, 'payerAccountNo' | 'payerName' | 'transferDate'>,
): string {
  switch (column) {
    case 'receiving_bank_code':
      return row.receivingBankCode
    case 'receiving_account_no':
      return row.receivingAccountNo
    case 'receiving_account_name':
      return row.receivingAccountName
    case 'amount':
      return bahtAmountString(row.netSatang)
    case 'transfer_date':
      return fmtDate(file.transferDate)
    case 'reference_no':
      return row.referenceNo
    case 'payer_account_no':
      return file.payerAccountNo
    case 'payer_name':
      return file.payerName
    case 'citizen_id':
      return row.citizenId ?? ''
    case 'email':
      return row.email ?? ''
    case 'mobile_no':
      return row.mobileNo ?? ''
    case 'remark':
      return row.remark
  }
}

/** CSV ต้องครอบด้วย `"` เมื่อมี `,` / `"` / ขึ้นบรรทัดใหม่ (กันคอลัมน์เลื่อน) */
function csvCell(value: string): string {
  return /[",\n\r]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value
}

/** TXT ใช้ `|` คั่น — ตรงกับตัวอย่างที่ `runBankFileTest()` (1.10) แสดงให้ผู้ใช้ตอนทดสอบ format */
const SEPARATOR: Readonly<Record<BankFileType, string>> = { CSV: ',', TXT: '|' }

export function buildPaymentFile(input: PaymentFileInput): PaymentFileContent {
  const columns = parseColumnMapping(input.columnMapping) as BankFileColumn[]
  const separator = SEPARATOR[input.fileType]

  const lines = input.rows.map((row) =>
    columns
      .map((column) => {
        const value = valueOf(column, row, input)
        return input.fileType === 'CSV' ? csvCell(value) : value
      })
      .join(separator),
  )

  // แถวหัวคอลัมน์ไม่นับเป็นรายการโอน (`rowCount` = จำนวนผู้รับในไฟล์)
  const header = input.includeHeader === true && lines.length > 0 ? [columns.join(separator)] : []
  const all = [...header, ...lines]

  return {
    text: all.length === 0 ? '' : `${all.join('\n')}\n`,
    columns,
    rowCount: input.rows.length,
  }
}

/** รายการโอนของผู้รับหนึ่งรายการ (ก่อนรวม) — ลำดับตามรายการในรอบ */
export interface TransferEntry<P> {
  payeeId: string
  transferSatang: number
  /** ข้อความต่อท้ายหมายเหตุของรายการนี้ (เช่น เลขเงินทดรองที่หักคืน) */
  remarkParts: readonly string[]
  payee: P
}

export interface PayeeTransfer<P> {
  payeeId: string
  transferSatang: number
  remarkParts: string[]
  payee: P
  /** ลำดับผู้รับในไฟล์ (เริ่ม 1) — ใช้ทำเลขอ้างอิงที่คงที่ทุกครั้งที่สร้างไฟล์ซ้ำ */
  sequence: number
}

/**
 * staging E-009 (มติ PO 10/10/2569) — **1 บรรทัดต่อผู้รับ**: รวมยอดโอนทุกรายการของผู้รับเดียวกันในรอบ
 * (ลดค่าธรรมเนียมโอนและบรรทัดใน statement) · ลำดับตามรายการแรกของผู้รับ · ยอดรวมเป็น 0 ไม่ใส่ไฟล์
 * — ยอดเป็นจำนวนเต็ม satang บวกกันตรง ๆ (Rule 01)
 */
export function groupTransfersByPayee<P>(entries: readonly TransferEntry<P>[]): PayeeTransfer<P>[] {
  const byPayee = new Map<string, Omit<PayeeTransfer<P>, 'sequence'>>()
  for (const entry of entries) {
    const current = byPayee.get(entry.payeeId)
    if (current === undefined) {
      byPayee.set(entry.payeeId, {
        payeeId: entry.payeeId,
        transferSatang: entry.transferSatang,
        remarkParts: [...entry.remarkParts],
        payee: entry.payee,
      })
      continue
    }
    current.transferSatang += entry.transferSatang
    for (const part of entry.remarkParts) if (!current.remarkParts.includes(part)) current.remarkParts.push(part)
  }
  return [...byPayee.values()]
    .filter((transfer) => transfer.transferSatang > 0)
    .map((transfer, index) => ({ ...transfer, sequence: index + 1 }))
}

/**
 * TIS-620: ASCII ผ่านตรง · อักษรไทย U+0E01–U+0E5B ⇒ ไบต์ `codePoint - 0x0E00 + 0xA0`
 * อักขระที่แทนไม่ได้ (เช่น emoji / อักษรอื่น) แทนด้วย `?` — ธนาคารที่ใช้ TIS-620 รับได้แค่นี้จริง ๆ
 */
export function encodeTis620(text: string): Uint8Array {
  const bytes: number[] = []
  for (const character of text) {
    const code = character.codePointAt(0) ?? 0x3f
    if (code <= 0x7f) bytes.push(code)
    else if (code >= 0x0e01 && code <= 0x0e5b) bytes.push(code - 0x0e00 + 0xa0)
    else bytes.push(0x3f)
  }
  return Uint8Array.from(bytes)
}

/** แปลงเนื้อไฟล์เป็นไบต์ตาม encoding ที่ตั้งไว้ (`13` §6.8) */
export function encodePaymentFile(text: string, encoding: BankFileEncoding): Uint8Array {
  return encoding === 'TIS_620' ? encodeTis620(text) : new TextEncoder().encode(text)
}

export const PAYMENT_FILE_MIME: Readonly<Record<BankFileType, string>> = {
  CSV: 'text/csv',
  TXT: 'text/plain',
}

export const PAYMENT_FILE_EXTENSION: Readonly<Record<BankFileType, 'csv' | 'txt'>> = {
  CSV: 'csv',
  TXT: 'txt',
}
