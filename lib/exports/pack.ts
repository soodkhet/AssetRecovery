import type { ReadinessCheck } from '@/lib/accounting/period'
import { buildCsv, csvBaht, csvDate, csvText, CSV_EMPTY } from '@/lib/exports/csv'
import { fmtDate } from '@/lib/format/datetime'
import type { StatusBadgeGroup } from '@/lib/ui/status-badge'
import type {
  BankMatchStatus,
  ExceptionLevel,
  ExceptionStatus,
  ExportRecordStatus,
} from '@/lib/generated/prisma/enums'

/**
 * Accounting Pack (ไฟล์ 37) — **ตัวประกอบไฟล์ทั้งชุด แบบ pure ล้วน**
 *
 * ### กติกาที่ห้ามหลุด
 * - **รายชื่อไฟล์ 01–08 ครบไม่มีช่องว่าง** (`37` §6.1) — เพิ่ม/ลดไฟล์ = แก้ `PACK_FILES` ที่เดียว
 *   · หัวคอลัมน์ของทุกไฟล์ต้องตรง `reference/samples/01–08` เป๊ะ (มีเทสต์อ่านไฟล์ตัวอย่างมาเทียบ)
 * - `05_WHT_Data.csv` — `payee_tax_id` เป็น **ตัวเลข 13 หลักล้วน** (DEC-006/D10) ⇒ payee ที่ยังไม่กรอก
 *   เลขประจำตัวผู้เสียภาษีต้องหยุดตั้งแต่ต้น (`assertPayeeTaxIdsComplete()`) ไม่ใช่ปล่อยช่องว่างไปถึง
 *   สำนักงานบัญชี
 * - `06_Bank_Reconciliation.csv` — `status` ใช้ **enum เต็ม 4 ค่า** ตามสคีมา (DEC-006/D10) ไม่แปลไทย
 * - Version เดินขึ้นเรื่อย ๆ ไม่เขียนทับ (`37` §6.2) — ป้ายบนหน้าจอมาจาก `exportVersionLabel()` ที่เดียว
 *
 * ### สิ่งที่สคีมาไม่มีให้ (เลือกมาจากข้อมูลที่มีจริง — บันทึกไว้กันคนหลังงง)
 * - `bank_ref` ของไฟล์ 02/06: `bank_transactions` **ไม่มีคอลัมน์ reference แยก** (`02` §9 — ตัวนำเข้า
 *   statement รวมเลขอ้างอิงไว้ใน `description` ตั้งแต่ 4.2) ⇒ ใช้ `description` เป็น `bank_ref`
 * - `adjustment_ref` ของไฟล์ 07: ตาราง `adjustments` ไม่มีเลขที่เอกสาร ⇒ เดินเลขแบบ deterministic
 *   จากลำดับในรอบ (`adjustmentRef()`) แนวเดียวกับ `voucherNumber()` ของ 3.5 — ไม่เก็บลง DB
 * - `voucher_ref` ของไฟล์ 04: ใช้ `voucherNumber()` ตัวเดียวกับใบสำคัญจ่ายที่พิมพ์จริง (3.5)
 */

// ── สิทธิ์ (`37` §12) ───────────────────────────────────────────────────────

/** manage = สร้าง Export / mark-sent / accept (บัญชี) · view = ดูประวัติ (การเงิน, ผู้บริหาร) */
export const EXPORT_ACCOUNTING_PACK = 'export_accounting_pack'
export const EXPORT_READ_CAPABILITIES = [EXPORT_ACCOUNTING_PACK] as const

// ── สถานะ (`37` §7.1 — enum `export_record_status` ของ `02` §9) ─────────────

export const EXPORT_STATUS_LABEL: Readonly<Record<ExportRecordStatus, string>> = {
  generated: 'สร้างไฟล์แล้ว',
  sent: 'ส่งสำนักงานบัญชีแล้ว',
  accepted: 'สำนักงานบัญชีตอบรับแล้ว',
}

/** badge 3 สีตาม `37` §8 — generated=เทา / sent=ฟ้า / accepted=เขียว (`04` §8.1) */
export const EXPORT_STATUS_GROUP: Readonly<Record<ExportRecordStatus, StatusBadgeGroup>> = {
  generated: 'neutral',
  sent: 'info',
  accepted: 'success',
}

/** `generated → sent → accepted` ทางเดียว (`37` §9) — ข้ามขั้นหรือย้อนกลับไม่ได้ */
export const EXPORT_TRANSITIONS: Readonly<Record<ExportRecordStatus, readonly ExportRecordStatus[]>> = {
  generated: ['sent'],
  sent: ['accepted'],
  accepted: [],
}

export function canTransitionExport(from: ExportRecordStatus, to: ExportRecordStatus): boolean {
  return EXPORT_TRANSITIONS[from].includes(to)
}

// ── Version (`37` §6.2) ─────────────────────────────────────────────────────

/**
 * `version` ในสคีมาเป็นจำนวนเต็ม (1, 2, 3…) ส่วนเอกสาร `37` §6.2/§7.1 เขียนป้ายเป็น `v1.0`, `v1.1`, `v1.2`
 * ⇒ ครั้งแรก = `v1.0` จากนั้นเดินทศนิยม (`37` §16 — export ครั้งที่ 2 ของรอบเดิมต้องเป็น `v1.1`)
 */
export function exportVersionLabel(version: number): string {
  return version <= 1 ? 'v1.0' : `v1.${version - 1}`
}

// ── รายชื่อไฟล์มาตรฐาน (`37` §6.1) ──────────────────────────────────────────

export type PackFileKind = 'csv' | 'xlsx' | 'pdf'

export interface PackFile {
  /** เลขลำดับในชุด — คีย์ของ `export_records.file_urls` ด้วย */
  no: string
  fileName: string
  kind: PackFileKind
  /** คำอธิบายบนหน้าปก (`reference/samples/07_accounting_pack_cover.pdf`) */
  description: string
  /** ไฟล์ต้นทางของข้อมูล */
  sourceDoc: string
}

export const PACK_FILES: readonly PackFile[] = [
  { no: '01', fileName: '01_Revenue.csv', kind: 'csv', description: 'รายการรายได้ — company, case_ref, revenue_date, gross, vat_flag', sourceDoc: '19' },
  { no: '02', fileName: '02_Cash_Receipts.csv', kind: 'csv', description: 'รายการเงินรับ — receipt_date, payer, amount, bank_ref', sourceDoc: '31' },
  { no: '03', fileName: '03_Expenses.csv', kind: 'csv', description: 'รายการค่าใช้จ่าย — payee, category, gross, wht, net', sourceDoc: '32' },
  { no: '04', fileName: '04_Payments.csv', kind: 'csv', description: 'รายการจ่ายเงินจริง', sourceDoc: '17' },
  { no: '05', fileName: '05_WHT_Data.csv', kind: 'csv', description: 'ข้อมูลหัก ณ ที่จ่าย', sourceDoc: '33' },
  { no: '06', fileName: '06_Bank_Reconciliation.csv', kind: 'csv', description: 'ผลกระทบยอดธนาคาร', sourceDoc: '35' },
  { no: '07', fileName: '07_Adjustment_Log.csv', kind: 'csv', description: 'รายการปรับปรุงยอดทั้งหมดของรอบนั้น', sourceDoc: '20' },
  { no: '08', fileName: '08_Document_Checklist.xlsx', kind: 'xlsx', description: 'source_ref, doc_status, exception summary', sourceDoc: '34' },
]

/** ชื่อไฟล์ตามเลขลำดับ — ผู้ประกอบชุดอ้างเลข ไม่ใช่ตำแหน่งใน array (`37` §6.1) */
export function packFileName(no: string): string {
  const file = PACK_FILES.find((item) => item.no === no)
  if (file === undefined) throw new RangeError(`ไม่มีไฟล์เลข ${no} ในชุดเอกสารบัญชี`)
  return file.fileName
}

/**
 * หน้าปกไม่อยู่ในรายชื่อ 8 ไฟล์ของ §6.1 — ตั้งเลข `00` เพื่อให้เรียงมาก่อนและไม่ไปแทรกเลข 01–08
 * (คีย์ `cover` ใน `file_urls` · ไม่ถูกนับใน `file_count`)
 */
export const PACK_COVER_KEY = 'cover'
export const PACK_COVER_FILE_NAME = '00_Cover_Sheet.pdf'
/** คีย์ของไฟล์ `.zip` ทั้งชุดใน `file_urls` */
export const PACK_ZIP_KEY = 'pack'

export function packZipFileName(periodLabel: string, version: number): string {
  const slug = periodLabel.replace(/\s+/g, '_')
  return `AccountingPack_${slug}_${exportVersionLabel(version)}.zip`
}

/**
 * รหัสของ "ครั้งที่พยายามสร้าง" — ใช้คั่น path ไม่ให้ความพยายามที่ล้มกลางทางไปบล็อกครั้งถัดไป
 *
 * `version` มาจาก `MAX(export_records.version) + 1` ⇒ ถ้าอัปโหลดสำเร็จแล้ว tx/audit ล้ม (หรือสองคน
 * กด Export รอบเดียวกันพร้อมกัน) จะมีไฟล์ `v<n>` ค้างในถังโดยไม่มีแถวใน `export_records`
 * ⇒ ครั้งถัดไปคิด `version` ได้เท่าเดิม แล้วชน `upsert: false` **ทุกครั้งไม่มีวันหาย**
 * (ทั้งระบบไม่มีโค้ดลบ object ใน storage ⇒ ต้องเข้าไปลบมือถึงจะ Export รอบนั้นได้อีก)
 */
export function packAttemptId(generatedAt: Date, uniqueSuffix: string): string {
  const stamp = generatedAt.toISOString().replace(/[-:.]/g, '').replace('T', '-').slice(0, 16)
  return `${stamp}-${uniqueSuffix.replace(/[^0-9a-zA-Z]/g, '').slice(0, 8).toLowerCase()}`
}

/**
 * path ใน bucket — เดินตาม version ⇒ ไฟล์เวอร์ชันเก่าไม่มีวันถูกทับ (Rule 09)
 *
 * ชั้น `attempt` อยู่ **ใต้** `v<version>` ⇒ ยังอ่านออกว่าไฟล์ชุดไหนเป็นเวอร์ชันอะไร และ path จริง
 * ของชุดที่ใช้งานถูกเก็บไว้ใน `export_records.file_urls` อยู่แล้ว (ไม่มีใครประกอบ path ใหม่ตอนดาวน์โหลด)
 */
export function packStoragePath(input: {
  organizationId: string
  yearBe: number
  month: number
  version: number
  attempt: string
  fileName: string
}): string {
  const month = String(input.month).padStart(2, '0')
  return `${input.organizationId}/${input.yearBe}-${month}/v${input.version}/${input.attempt}/${input.fileName}`
}

// ── 01_Revenue.csv (ไฟล์ 19) ────────────────────────────────────────────────

export const REVENUE_HEADERS = ['company', 'case_ref', 'revenue_date', 'gross_baht', 'vat_flag'] as const

export interface RevenueExportRow {
  companyName: string
  caseRef: string
  revenueDate: Date
  grossSatang: number
  vatSatang: number
}

export function revenueCsv(rows: readonly RevenueExportRow[]): string {
  return buildCsv(
    REVENUE_HEADERS,
    rows.map((row) => [
      row.companyName,
      row.caseRef,
      csvDate(row.revenueDate),
      csvBaht(row.grossSatang),
      // Y/N ตามตัวอย่าง — ยอด VAT จริงอยู่ที่ระบบ ไฟล์นี้บอกแค่ว่ารายการนี้มี VAT หรือไม่
      row.vatSatang > 0 ? 'Y' : 'N',
    ]),
  )
}

// ── 02_Cash_Receipts.csv (ไฟล์ 31) ──────────────────────────────────────────

export const CASH_RECEIPT_HEADERS = ['receipt_date', 'payer', 'amount_baht', 'bank_ref'] as const

export interface CashReceiptExportRow {
  receivedDate: Date
  payerName: string
  amountSatang: number
  bankRef: string | null
}

export function cashReceiptCsv(rows: readonly CashReceiptExportRow[]): string {
  return buildCsv(
    CASH_RECEIPT_HEADERS,
    rows.map((row) => [csvDate(row.receivedDate), row.payerName, csvBaht(row.amountSatang), csvText(row.bankRef)]),
  )
}

// ── 03_Expenses.csv (ไฟล์ 32) ───────────────────────────────────────────────

export const EXPENSE_HEADERS = ['payee', 'category', 'gross_baht', 'wht_baht', 'net_baht'] as const

export interface ExpenseExportRow {
  payeeName: string
  category: string
  grossSatang: number
  whtSatang: number
  netSatang: number
}

export function expenseCsv(rows: readonly ExpenseExportRow[]): string {
  return buildCsv(
    EXPENSE_HEADERS,
    rows.map((row) => [
      row.payeeName,
      row.category,
      csvBaht(row.grossSatang),
      csvBaht(row.whtSatang),
      csvBaht(row.netSatang),
    ]),
  )
}

// ── 04_Payments.csv (ไฟล์ 17) ───────────────────────────────────────────────

export const PAYMENT_HEADERS = [
  'payout_batch_ref',
  'payment_date',
  'payee',
  'amount_baht',
  'method',
  'voucher_ref',
] as const

/** ช่องทางจ่ายของระบบมีทางเดียว — โอนผ่านไฟล์ธนาคาร (`17` §6.3) */
export const PAYMENT_METHOD_LABEL = 'Bank Transfer'

export interface PaymentExportRow {
  batchRef: string
  paymentDate: Date
  payeeName: string
  netSatang: number
  voucherRef: string
}

export function paymentCsv(rows: readonly PaymentExportRow[]): string {
  return buildCsv(
    PAYMENT_HEADERS,
    rows.map((row) => [
      row.batchRef,
      csvDate(row.paymentDate),
      row.payeeName,
      csvBaht(row.netSatang),
      PAYMENT_METHOD_LABEL,
      row.voucherRef,
    ]),
  )
}

// ── 05_WHT_Data.csv (ไฟล์ 33 · DEC-006/D10) ─────────────────────────────────

export const WHT_HEADERS = [
  'cert_no',
  'payee',
  'payee_tax_id',
  'pay_date',
  'income_type',
  'gross_baht',
  'wht_baht',
  'wht_pct',
] as const

export interface WhtExportRow {
  certificateNumber: string
  payeeName: string
  /** `payee_profiles.national_id` — อาจว่างได้ในสคีมา แต่ห้ามว่างในไฟล์ส่งบัญชี */
  payeeTaxId: string | null
  paymentDate: Date
  incomeType: string
  grossSatang: number
  whtSatang: number
  /** snapshot `wht_pct` ของรายการจ่าย (`92` §7.1) — NULL = ไม่เคยหัก (ไม่ควรมีใบ) */
  whtPct: string | null
}

/** ตัวเลข 13 หลักล้วน — ตัดขีด/ช่องว่างที่คนกรอกติดมา แล้วตรวจความยาว (DEC-006/D10) */
export function normalizeTaxId(value: string | null | undefined): string | null {
  const digits = (value ?? '').replace(/\D/g, '')
  return digits.length === 13 ? digits : null
}

export interface MissingTaxIdPayee {
  certificateNumber: string
  payeeName: string
}

/** payee ที่เลขประจำตัวผู้เสียภาษีใช้ไม่ได้ — ผู้เรียกต้องหยุด export แล้วให้คนไปแก้โปรไฟล์ก่อน */
export function payeesMissingTaxId(rows: readonly WhtExportRow[]): MissingTaxIdPayee[] {
  return rows
    .filter((row) => normalizeTaxId(row.payeeTaxId) === null)
    .map((row) => ({ certificateNumber: row.certificateNumber, payeeName: row.payeeName }))
}

/** `wht_pct` ตัวอย่างเขียน `3.00` — snapshot เป็น NUMERIC(5,2) อยู่แล้ว แค่คงทศนิยม 2 ตำแหน่ง */
export function whtPctText(value: string | null): string {
  if (value === null) return CSV_EMPTY
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed.toFixed(2) : CSV_EMPTY
}

export function whtCsv(rows: readonly WhtExportRow[]): string {
  return buildCsv(
    WHT_HEADERS,
    rows.map((row) => [
      row.certificateNumber,
      row.payeeName,
      normalizeTaxId(row.payeeTaxId) ?? CSV_EMPTY,
      csvDate(row.paymentDate),
      row.incomeType,
      csvBaht(row.grossSatang),
      csvBaht(row.whtSatang),
      whtPctText(row.whtPct),
    ]),
  )
}

// ── 06_Bank_Reconciliation.csv (ไฟล์ 35 · DEC-006/D10) ──────────────────────

export const BANK_RECON_HEADERS = [
  'bank_txn_date',
  'bank_ref',
  'amount_baht',
  'direction',
  'matched_type',
  'matched_ref',
  'status',
] as const

/** ชนิดของสิ่งที่รายการเดินบัญชีถูกจับคู่ด้วย — ค่าดิบเพื่อให้สำนักงานบัญชี map เข้าระบบตัวเองได้ */
export type MatchedType = 'billing_batch' | 'payout_batch' | 'advance' | 'split_allocation'

export interface BankReconExportRow {
  transactionDate: Date
  /** `description` ของรายการ (สคีมาไม่มีคอลัมน์ reference แยก — ดูหัวไฟล์) */
  description: string
  amountSatang: number
  matchStatus: BankMatchStatus
  matchedType: MatchedType | null
  matchedRef: string | null
}

/** บวก = เงินเข้า (credit) · ลบ = เงินออก (debit) — ตามตัวอย่างไฟล์ 06 */
export function bankDirection(amountSatang: number): 'credit' | 'debit' {
  return amountSatang < 0 ? 'debit' : 'credit'
}

export function bankReconCsv(rows: readonly BankReconExportRow[]): string {
  return buildCsv(
    BANK_RECON_HEADERS,
    rows.map((row) => [
      csvDate(row.transactionDate),
      csvText(row.description),
      // ยอดตามตัวอย่างเป็นเลขบวกเสมอ ทิศทางอ่านจากคอลัมน์ `direction`
      csvBaht(Math.abs(row.amountSatang)),
      bankDirection(row.amountSatang),
      row.matchedType ?? CSV_EMPTY,
      csvText(row.matchedRef),
      // enum เต็ม 4 ค่าตามสคีมา ห้ามแปลไทย (DEC-006/D10)
      row.matchStatus,
    ]),
  )
}

// ── 07_Adjustment_Log.csv (ไฟล์ 20) ─────────────────────────────────────────

export const ADJUSTMENT_HEADERS = [
  'adjustment_ref',
  'target_type',
  'target_ref',
  'amount_baht',
  'reason',
  'approved_by',
  'approved_date',
] as const

export interface AdjustmentExportRow {
  targetType: string
  targetRef: string
  /** ยอดที่เซ็นแล้ว (`signedAdjustmentSatang()` ของ 3.7) — ลดยอดติดลบ */
  signedSatang: number
  reason: string
  approvedByName: string | null
  approvedAt: Date | null
}

/** เลขที่รายการปรับปรุงแบบ deterministic — `ADJ-<พ.ศ.>-<เดือน>-<ลำดับในรอบ>` (ดูหัวไฟล์) */
export function adjustmentRef(input: { yearBe: number; month: number; index: number }): string {
  const month = String(input.month).padStart(2, '0')
  return `ADJ-${input.yearBe}-${month}-${String(input.index).padStart(3, '0')}`
}

export function adjustmentCsv(
  rows: readonly AdjustmentExportRow[],
  period: { yearBe: number; month: number },
): string {
  return buildCsv(
    ADJUSTMENT_HEADERS,
    rows.map((row, index) => [
      adjustmentRef({ yearBe: period.yearBe, month: period.month, index: index + 1 }),
      row.targetType,
      csvText(row.targetRef),
      csvBaht(row.signedSatang),
      row.reason,
      csvText(row.approvedByName),
      csvDate(row.approvedAt),
    ]),
  )
}

// ── 08_Document_Checklist.xlsx (ไฟล์ 34) ────────────────────────────────────

export const CHECKLIST_HEADERS = [
  'source_type',
  'source_ref',
  'doc_status',
  'severity',
  'exception_summary',
  'responsible',
] as const

export const CHECKLIST_SHEET_NAME = 'Document Checklist'

export type ChecklistDocStatus = 'ครบถ้วน' | 'ขาดเอกสาร' | 'รอตรวจสอบ'

export interface ChecklistExportRow {
  sourceModule: string
  sourceRef: string | null
  level: ExceptionLevel
  status: ExceptionStatus
  title: string
  /** ผู้รับผิดชอบ = ผู้ที่ปิดรายการแล้ว ถ้ายังไม่ปิดคือผู้บันทึก (สคีมาไม่มีคอลัมน์ผู้รับผิดชอบแยก) */
  responsibleName: string | null
}

/**
 * สถานะเอกสารของแต่ละแถว (`34` §6.1) — แปลงจากสถานะ+ระดับของ Exception:
 * ปิดแล้ว/ยกเว้นแล้ว = ครบถ้วน · critical ที่ยังเปิด = ขาดเอกสาร · ที่เหลือ = รอตรวจสอบ
 */
export function checklistDocStatus(row: {
  level: ExceptionLevel
  status: ExceptionStatus
}): ChecklistDocStatus {
  if (row.status !== 'open') return 'ครบถ้วน'
  return row.level === 'critical' ? 'ขาดเอกสาร' : 'รอตรวจสอบ'
}

export function checklistRows(rows: readonly ChecklistExportRow[]): string[][] {
  return rows.map((row) => {
    const docStatus = checklistDocStatus(row)
    const closed = docStatus === 'ครบถ้วน'
    return [
      row.sourceModule,
      row.sourceRef ?? CSV_EMPTY,
      docStatus,
      closed ? CSV_EMPTY : row.level,
      closed ? CSV_EMPTY : row.title,
      row.responsibleName ?? CSV_EMPTY,
    ]
  })
}

export interface ChecklistSummary {
  complete: number
  missingCritical: number
  pending: number
}

export function checklistSummary(rows: readonly ChecklistExportRow[]): ChecklistSummary {
  const summary: ChecklistSummary = { complete: 0, missingCritical: 0, pending: 0 }
  for (const row of rows) {
    const status = checklistDocStatus(row)
    if (status === 'ครบถ้วน') summary.complete += 1
    else if (status === 'ขาดเอกสาร') summary.missingCritical += 1
    else summary.pending += 1
  }
  return summary
}

export const CHECKLIST_FOOTER_NOTE =
  'หมายเหตุ: ห้าม Export Accounting Pack ถ้ายังมีรายการ Critical เปิดอยู่ (ไฟล์ 30 Readiness Check)'

/** ชีตเดียวทั้งไฟล์ — หัวเรื่อง 2 บรรทัด + ตาราง + สรุปนับ + หมายเหตุ (ตาม `samples/08`) */
export function checklistSheet(input: {
  periodLabel: string
  generatedByName: string
  generatedAt: Date
  rows: readonly ChecklistExportRow[]
}): string[][] {
  const summary = checklistSummary(input.rows)
  return [
    [`Document Checklist Export — รอบบัญชี ${input.periodLabel}`],
    [
      `อ้างอิง: ไฟล์ 34-accounting-document-checklist-exceptions.md — จัดทำโดย ${input.generatedByName} ` +
        `วันที่ ${fmtDate(input.generatedAt)}`,
    ],
    [],
    [...CHECKLIST_HEADERS],
    ...checklistRows(input.rows),
    [],
    ['สรุป:'],
    ['ครบถ้วน', String(summary.complete)],
    ['ขาดเอกสาร (Critical)', String(summary.missingCritical)],
    ['รอตรวจสอบ', String(summary.pending)],
    [],
    [CHECKLIST_FOOTER_NOTE],
  ]
}

// ── หน้าปก (`reference/samples/07_accounting_pack_cover.pdf`) ────────────────

export interface PackCoverFileRow {
  fileName: string
  description: string
}

export interface PackCoverDoc {
  organizationName: string
  headerNote: string
  title: string
  titleEn: string
  periodLabel: string
  versionLabel: string
  generatedByName: string
  generatedAtLabel: string
  /** SHA-256 ของ **เนื้อไฟล์ข้อมูล 01–08** (คำนวณซ้ำจากไฟล์ในชุดนี้ได้ — ดู `packContentDigest()`) */
  contentDigest: string
  checks: readonly { label: string; passed: boolean }[]
  files: readonly PackCoverFileRow[]
  fileName: string
}

export const PACK_COVER_TITLE = 'หน้าปกชุดเอกสารบัญชี'
export const PACK_COVER_HEADER_NOTE = 'ส่งสำนักงานบัญชี — ประจำรอบเดือน'

export function buildPackCoverDoc(input: {
  organizationName: string
  periodLabel: string
  version: number
  generatedByName: string
  generatedAt: Date
  contentDigest: string
  checks: readonly ReadinessCheck[]
}): PackCoverDoc {
  return {
    organizationName: input.organizationName,
    headerNote: PACK_COVER_HEADER_NOTE,
    title: PACK_COVER_TITLE,
    titleEn: 'Accounting Pack Cover Sheet',
    periodLabel: input.periodLabel,
    versionLabel: exportVersionLabel(input.version),
    generatedByName: input.generatedByName,
    generatedAtLabel: fmtDate(input.generatedAt),
    contentDigest: input.contentDigest,
    checks: input.checks.map((check) => ({ label: check.label, passed: check.passed })),
    files: PACK_FILES.map((file) => ({ fileName: file.fileName, description: file.description })),
    fileName: PACK_COVER_FILE_NAME,
  }
}
