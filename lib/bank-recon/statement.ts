/**
 * นำเข้า Bank Statement (ไฟล์ 35 §3 · `13` §6.3/§6.8) — **pure ล้วน ไม่มี I/O**
 *
 * ### กติกาที่ห้ามหลุด
 * - **เงิน = satang จำนวนเต็มเท่านั้น** (Rule 01) — แปลงจากข้อความในไฟล์ด้วยเลขจำนวนเต็มล้วน
 *   ห้าม `parseFloat` แล้วคูณ 100 (0.1+0.2 ปัญหาเดิม ๆ ของ float จะทำให้ยอดเพี้ยน 1 สตางค์
 *   แล้ว auto-match พลาดทั้งรอบ)
 * - **ประกอบตาม `column_mapping` ของรูปแบบที่ตั้งไว้** (`13` §6.8) — ไม่มี mapping ค่อยเดาจาก
 *   หัวตารางของไฟล์ ห้าม hardcode ลำดับคอลัมน์ของธนาคารใดธนาคารหนึ่ง
 * - schema (`02` §9) เก็บยอดเป็นคอลัมน์เดียว `amount_satang` (**บวก = รับเงิน · ลบ = จ่ายเงิน**)
 *   และ**ไม่มีคอลัมน์ `reference`** — เลขอ้างอิงของธนาคารจึงถูกผนวกเข้า `description`
 *   (SSOT ของ schema คือ `02` ไม่ใช่ตาราง §7.1 ของไฟล์ 35 — Rule 02)
 * - ผลลัพธ์ deterministic: ไฟล์เดิม + mapping เดิม → แถวเดิมเสมอ (ทำให้ตรวจซ้ำย้อนหลังได้)
 */

/** คอลัมน์ของไฟล์ statement ที่ระบบอ่านได้ (คู่ขนานกับ `SUPPORTED_BANK_FILE_COLUMNS` ฝั่งไฟล์โอน) */
export const SUPPORTED_STATEMENT_COLUMNS = [
  'transaction_date',
  'description',
  'reference',
  /** เงินเข้า (บวก) */
  'amount_in',
  /** เงินออก (บวก — ระบบใส่เครื่องหมายลบให้เอง) */
  'amount_out',
  /** ยอดเดียวมีเครื่องหมายในตัว (`-1,500.00` = จ่ายออก) */
  'amount',
  /** ยอดคงเหลือ — อ่านข้ามไป ไม่เก็บ (schema ไม่มีคอลัมน์นี้) */
  'balance',
] as const

export type StatementColumn = (typeof SUPPORTED_STATEMENT_COLUMNS)[number]

/** ชื่อหัวตารางที่พบจริงในไฟล์ของธนาคารไทย → คอลัมน์มาตรฐาน (ใช้เมื่อไม่มี `column_mapping`) */
const HEADER_ALIASES: Readonly<Record<string, StatementColumn>> = {
  transaction_date: 'transaction_date',
  date: 'transaction_date',
  'value date': 'transaction_date',
  'transaction date': 'transaction_date',
  วันที่: 'transaction_date',
  วันที่ทำรายการ: 'transaction_date',
  description: 'description',
  detail: 'description',
  details: 'description',
  narrative: 'description',
  รายละเอียด: 'description',
  รายการ: 'description',
  reference: 'reference',
  reference_no: 'reference',
  'reference no': 'reference',
  ref: 'reference',
  เลขที่อ้างอิง: 'reference',
  อ้างอิง: 'reference',
  amount_in: 'amount_in',
  deposit: 'amount_in',
  credit: 'amount_in',
  เงินเข้า: 'amount_in',
  ฝาก: 'amount_in',
  amount_out: 'amount_out',
  withdrawal: 'amount_out',
  debit: 'amount_out',
  เงินออก: 'amount_out',
  ถอน: 'amount_out',
  amount: 'amount',
  จำนวนเงิน: 'amount',
  balance: 'balance',
  ยอดคงเหลือ: 'balance',
}

export interface StatementRow {
  /** เที่ยงคืน UTC ของวันนั้น — ตรงกับรูปของ `dateOnlySchema()` และคอลัมน์ `DATE` */
  transactionDate: Date
  /** รายละเอียด + เลขอ้างอิงของธนาคาร (schema ไม่มีคอลัมน์ `reference` แยก) */
  description: string
  /** บวก = เงินเข้า · ลบ = เงินออก (`02` §9) */
  amountSatang: number
  /** บรรทัดที่เท่าไรในไฟล์ (นับรวมหัวตาราง) — ใช้รายงานผลนำเข้าให้คนตามได้ */
  lineNumber: number
}

export interface StatementRowError {
  lineNumber: number
  message: string
}

export interface StatementParseResult {
  rows: StatementRow[]
  errors: StatementRowError[]
  /** คอลัมน์ที่ใช้จริงตามลำดับ (มาจาก mapping ที่ตั้งไว้ หรือหัวตารางของไฟล์) */
  columns: StatementColumn[]
  /** `true` = ใช้ `column_mapping` ที่ตั้งไว้ · `false` = เดาจากหัวตารางของไฟล์ */
  usedConfiguredMapping: boolean
}

export class StatementParseError extends Error {}

function isStatementColumn(value: string): value is StatementColumn {
  return (SUPPORTED_STATEMENT_COLUMNS as readonly string[]).includes(value)
}

/** แยก `column_mapping` (คั่นด้วย `,` หรือขึ้นบรรทัดใหม่) เป็นคอลัมน์ statement ที่รู้จัก */
export function parseStatementColumnMapping(columnMapping: string | null | undefined): StatementColumn[] {
  if (!columnMapping) return []
  const parts = columnMapping
    .split(/[\n,]/)
    .map((part) => part.trim().toLowerCase())
    .filter((part) => part.length > 0)
  // mapping ของไฟล์โอนเงิน (receiving_bank_code ฯลฯ) ถูกใช้ผิดช่อง ⇒ ไม่ใช่ mapping ของ statement
  if (parts.length === 0 || !parts.every(isStatementColumn)) return []
  return parts as StatementColumn[]
}

/** mapping ที่ใช้ได้จริงต้องบอกได้ว่า "วันไหน" และ "ยอดเท่าไร" */
export function isUsableStatementMapping(columns: readonly StatementColumn[]): boolean {
  const has = (column: StatementColumn): boolean => columns.includes(column)
  return has('transaction_date') && (has('amount') || has('amount_in') || has('amount_out'))
}

/** แยก 1 บรรทัด CSV เป็นเซลล์ — รองรับ `"` ครอบและ `""` แทนอัญประกาศในข้อความ */
export function splitCsvLine(line: string): string[] {
  const cells: string[] = []
  let current = ''
  let quoted = false
  for (let index = 0; index < line.length; index += 1) {
    const char = line[index]
    if (quoted) {
      if (char === '"') {
        if (line[index + 1] === '"') {
          current += '"'
          index += 1
        } else {
          quoted = false
        }
      } else {
        current += char
      }
      continue
    }
    if (char === '"') {
      quoted = true
      continue
    }
    if (char === ',') {
      cells.push(current.trim())
      current = ''
      continue
    }
    current += char
  }
  cells.push(current.trim())
  return cells
}

/**
 * ข้อความจำนวนเงิน → satang **ด้วยเลขจำนวนเต็มล้วน** (Rule 01 — ห้าม float)
 * รองรับ `1,234.56` / `(1,234.56)` (วงเล็บ = ติดลบตามแบบรายงานบัญชี) / `-1234` / `฿1,234.5`
 * คืน `null` เมื่ออ่านไม่ออก · ทศนิยมเกิน 2 ตำแหน่ง = อ่านไม่ออก (ไม่ปัดให้เอง — เงินห้ามเดา)
 */
export function parseAmountToSatang(input: string): number | null {
  const raw = input.trim()
  if (raw === '' || raw === '-' || raw === '—') return null

  const negatedByParentheses = /^\(.*\)$/.test(raw)
  const cleaned = raw
    .replace(/^\((.*)\)$/, '$1')
    .replace(/[฿,\s]/g, '')
    .replace(/(THB|บาท)$/i, '')
  const matched = /^(?<sign>[+-]?)(?<int>\d+)(?:\.(?<frac>\d{1,2}))?$/.exec(cleaned)
  if (matched?.groups === undefined) return null

  const { sign, int, frac } = matched.groups
  const satang = Number.parseInt(int ?? '0', 10) * 100 + Number.parseInt((frac ?? '').padEnd(2, '0'), 10)
  const negative = sign === '-' || negatedByParentheses
  return negative ? -satang : satang
}

/**
 * ข้อความวันที่ → เที่ยงคืน UTC ของวันนั้น — รองรับ `DD/MM/YYYY` (พ.ศ. หรือ ค.ศ.),
 * `YYYY-MM-DD`, `DD-MM-YYYY` · ปี ≥ 2400 ถือเป็น **พ.ศ.** แปลงเป็น ค.ศ. ให้ (Rule 01)
 */
export function parseStatementDate(input: string): Date | null {
  const raw = input.trim()
  const iso = /^(\d{4})-(\d{2})-(\d{2})/.exec(raw)
  const dmy = /^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/.exec(raw)

  let year: number
  let month: number
  let day: number
  if (iso !== null) {
    year = Number.parseInt(iso[1] ?? '', 10)
    month = Number.parseInt(iso[2] ?? '', 10)
    day = Number.parseInt(iso[3] ?? '', 10)
  } else if (dmy !== null) {
    day = Number.parseInt(dmy[1] ?? '', 10)
    month = Number.parseInt(dmy[2] ?? '', 10)
    year = Number.parseInt(dmy[3] ?? '', 10)
  } else {
    return null
  }

  if (year >= 2400) year -= 543
  const date = new Date(Date.UTC(year, month - 1, day))
  if (
    Number.isNaN(date.getTime()) ||
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    return null
  }
  return date
}

/** หัวตาราง 1 แถว → คอลัมน์มาตรฐาน (คอลัมน์ที่ไม่รู้จัก = `null` ข้ามไป) */
function mapHeaderRow(cells: readonly string[]): (StatementColumn | null)[] {
  return cells.map((cell) => {
    const key = cell.trim().toLowerCase()
    if (isStatementColumn(key)) return key
    return HEADER_ALIASES[key] ?? null
  })
}

function looksLikeHeaderRow(cells: readonly string[]): boolean {
  const mapped = mapHeaderRow(cells)
  return mapped.filter((column) => column !== null).length >= 2
}

function cellAt(cells: readonly string[], columns: readonly (StatementColumn | null)[], want: StatementColumn): string {
  const index = columns.indexOf(want)
  return index === -1 ? '' : (cells[index] ?? '')
}

/** ยอดสุทธิของแถว (บวก = เข้า · ลบ = ออก) — `null` = อ่านยอดไม่ได้เลย */
function rowAmountSatang(cells: readonly string[], columns: readonly (StatementColumn | null)[]): number | null {
  const inValue = parseAmountToSatang(cellAt(cells, columns, 'amount_in'))
  const outValue = parseAmountToSatang(cellAt(cells, columns, 'amount_out'))
  if (inValue !== null && inValue !== 0) return Math.abs(inValue)
  if (outValue !== null && outValue !== 0) return -Math.abs(outValue)

  const signed = parseAmountToSatang(cellAt(cells, columns, 'amount'))
  if (signed !== null && signed !== 0) return signed
  return null
}

export interface StatementParseInput {
  csv: string
  /** `column_mapping` ของรูปแบบ statement ที่ตั้งไว้กับบัญชีนั้น (`13` §6.3 → §6.8) */
  columnMapping?: string | null
}

/**
 * อ่านไฟล์ statement (CSV) → แถวที่พร้อมบันทึก
 *
 * ลำดับการตัดสินใจว่าคอลัมน์ไหนคืออะไร:
 *  1. `column_mapping` ที่ตั้งไว้ (ตำแหน่งคอลัมน์ตามลำดับที่ธนาคารกำหนด) — หัวตารางถูกข้ามให้
 *  2. ไม่มี/ใช้ไม่ได้ → เดาจากหัวตารางของไฟล์ผ่านตารางชื่อพ้อง
 *  3. ทั้งสองทางไม่ได้ → `StatementParseError` (ผู้เรียกแปลงเป็น `STATEMENT_FILE_INVALID`)
 *
 * แถวที่อ่านไม่ออกจะถูกรายงานใน `errors` **ไม่ทำให้ทั้งไฟล์ล้ม** (statement จริงมีบรรทัดสรุป
 * ยอดยกมา/ยอดคงเหลือปนอยู่เสมอ) — แต่ถ้าไม่มีแถวใช้ได้เลย ผู้เรียกต้อง reject
 */
export function parseStatementCsv(input: StatementParseInput): StatementParseResult {
  const lines = input.csv
    .replace(/^﻿/, '')
    .split(/\r?\n/)
    .map((line) => line.trimEnd())

  const configured = parseStatementColumnMapping(input.columnMapping)
  const useConfigured = isUsableStatementMapping(configured)

  let columns: (StatementColumn | null)[] = useConfigured ? [...configured] : []
  let startIndex = 0

  if (lines.length === 0) throw new StatementParseError('ไฟล์ statement ว่างเปล่า')

  const firstNonEmpty = lines.findIndex((line) => line.trim() !== '')
  if (firstNonEmpty === -1) throw new StatementParseError('ไฟล์ statement ว่างเปล่า')

  const firstCells = splitCsvLine(lines[firstNonEmpty] ?? '')
  if (useConfigured) {
    // mapping ตั้งไว้แล้ว — ข้ามหัวตารางถ้าไฟล์มีมาด้วย
    startIndex = looksLikeHeaderRow(firstCells) ? firstNonEmpty + 1 : firstNonEmpty
  } else {
    columns = mapHeaderRow(firstCells)
    startIndex = firstNonEmpty + 1
  }

  const effective = columns.filter((column): column is StatementColumn => column !== null)
  if (!isUsableStatementMapping(effective)) {
    throw new StatementParseError(
      'อ่านคอลัมน์ของไฟล์ statement ไม่ได้ — ต้องมีอย่างน้อยคอลัมน์วันที่และจำนวนเงิน (ตั้งรูปแบบไฟล์ที่หน้าตั้งค่า `13` §6.8)',
    )
  }

  const rows: StatementRow[] = []
  const errors: StatementRowError[] = []

  for (let index = startIndex; index < lines.length; index += 1) {
    const line = lines[index] ?? ''
    if (line.trim() === '') continue
    const lineNumber = index + 1
    const cells = splitCsvLine(line)

    const transactionDate = parseStatementDate(cellAt(cells, columns, 'transaction_date'))
    if (transactionDate === null) {
      errors.push({ lineNumber, message: 'อ่านวันที่ไม่ได้ (รองรับ DD/MM/YYYY หรือ YYYY-MM-DD)' })
      continue
    }

    const amountSatang = rowAmountSatang(cells, columns)
    if (amountSatang === null) {
      errors.push({ lineNumber, message: 'อ่านจำนวนเงินไม่ได้ หรือยอดเป็นศูนย์' })
      continue
    }

    const description = cellAt(cells, columns, 'description').trim()
    const reference = cellAt(cells, columns, 'reference').trim()
    const composed = [description, reference === '' ? '' : `อ้างอิง ${reference}`].filter((part) => part !== '')

    rows.push({
      transactionDate,
      description: composed.length === 0 ? 'รายการเดินบัญชี (ไม่มีรายละเอียดในไฟล์)' : composed.join(' · '),
      amountSatang,
      lineNumber,
    })
  }

  return { rows, errors, columns: effective, usedConfiguredMapping: useConfigured }
}

/**
 * คีย์กันนำเข้าซ้ำ (Rule 09 idempotency) — statement เดือนเดียวกันถูกอัปโหลดซ้ำได้ง่ายมาก
 * และการนับเงินเข้าซ้ำ = ยอด AR เพี้ยนทั้งรอบ ⇒ แถวที่ (วัน + ยอด + รายละเอียด) ซ้ำของบัญชีเดิม
 * ถือเป็นแถวเดิมเสมอ
 */
export function statementRowKey(row: {
  transactionDate: Date
  amountSatang: number
  description: string
}): string {
  const date = row.transactionDate.toISOString().slice(0, 10)
  return `${date}|${row.amountSatang}|${row.description.trim().toLowerCase()}`
}
