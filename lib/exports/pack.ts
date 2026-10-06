import type { ReadinessCheck } from '@/lib/accounting/period'
import { payoutTransferSatang } from '@/lib/finance/advance-offset-calc'
import { isPayerBorneWhtCondition } from '@/lib/finance/wht-calc'
import { buildCsv, csvBaht, csvDate, csvText, CSV_EMPTY, CSV_NEWLINE } from '@/lib/exports/csv'
import { formatBranch } from '@/lib/format/branch'
import { fmtDate } from '@/lib/format/datetime'
import { fmtSatang } from '@/lib/format/money'
import type { StatusBadgeGroup } from '@/lib/ui/status-badge'
import type {
  BankMatchStatus,
  ExceptionLevel,
  ExceptionStatus,
  ExpenseStatus,
  ExportRecordStatus,
  WhtCondition,
  WhtFilingForm,
} from '@/lib/generated/prisma/enums'

/**
 * Accounting Pack (ไฟล์ 37) — **ตัวประกอบไฟล์ทั้งชุด แบบ pure ล้วน**
 *
 * ### กติกาที่ห้ามหลุด
 * - **รายชื่อไฟล์ 00–18 ครบไม่มีช่องว่าง** (`37` §6.1) — เพิ่ม/ลดไฟล์ = แก้ `PACK_FILES` ที่เดียว
 *   · หัวคอลัมน์ของทุกไฟล์ต้องตรง `reference/samples/01–09` เป๊ะ (มีเทสต์อ่านไฟล์ตัวอย่างมาเทียบ)
 *   · `09_Credit_Notes.csv` เพิ่มตามมติ PO 05/10/2569 (U21) — ใบลดหนี้/ใบเพิ่มหนี้ที่ออกในรอบ · ไฟล์ 01–08 ไม่เปลี่ยน
 *   · `10_Customer_WHT.csv` (U40 — 50 ทวิ ที่ลูกค้าหักเรา) + `11_Suspense_Receipts.csv` (U41 — เงินรับรอตรวจสอบ)
 *     เพิ่มตามมติ PO 05/10/2569 · ไฟล์ 01–09 ไม่เปลี่ยน
 *   · `12_Tax_Invoices.csv` (U57 — ใบกำกับภาษีที่ออก/ยกเลิกในรอบ + PDF ในโฟลเดอร์ `tax_invoices/` ของ zip)
 *     + `13_Advance_Returns.csv` (U68 — รับคืนเงินทดรอง หักกลบ/รับแยก) เพิ่มตามมติ PO 05/10/2569 · ไฟล์ 01–11 ไม่เปลี่ยน
 *   · `14_Unbilled_Revenue.csv` (U87 — รายได้ที่รับรู้แล้วแต่ยังไม่ได้วางบิล ณ เวลาสร้างชุด ให้สำนักงานบัญชีบันทึก
 *     รายได้ค้างรับ) เพิ่มตามมติ PO 06/10/2569 · ไฟล์ 01–13 ไม่เปลี่ยน
 *   · มติ PO 06/10/2569 (U94 ข้อ 2–5 · U96 #15): `00_Control_Totals.csv` (ยอดรวมควบคุม — ไฟล์แรกของชุด) +
 *     `15_Accrued_Expenses.csv` (ค่าใช้จ่ายค้างจ่าย) + `16_Advance_Balance.csv` (เงินทดรองยกมา/เคลื่อนไหว/คงเหลือ)
 *     ⇒ ชุดเป็น 00–16 (17 ไฟล์) · `03` ต่อท้ายคอลัมน์หลักฐานรายจ่าย · `09` ต่อท้าย `company_tax_id`
 *   · `17_Company_Documents.csv` (มติ PO 07/10/2569 U132 — รายการเอกสารบริษัทไฟแนนซ์เวอร์ชันปัจจุบัน + คำเตือน
 *     ภาพ ณ เวลาสร้างชุด · ไม่แนบตัวไฟล์) ⇒ ชุดเป็น 00–17 (18 ไฟล์) · ไฟล์ 00–16 ไม่เปลี่ยน
 *   · `18_Bank_Fee_Write_Offs.csv` (มติ PO 07/10/2569 U144 — ส่วนต่างรับชำระขาดไม่เกินเพดานที่ตัดเป็นค่าธรรมเนียมธนาคาร
 *     ตามวันที่ตัดในงวด) ⇒ ชุดเป็น 00–18 (19 ไฟล์) · ไฟล์ 00–17 ไม่เปลี่ยน
 *     · zip มีโฟลเดอร์ PDF `tax_invoices/` `wht_certificates/` `vouchers/` `billing_invoices/` ใช้เพดานร่วมกัน
 * - `05_WHT_Data.csv` — `payee_tax_id` เป็น **ตัวเลข 13 หลักล้วน** (DEC-006/D10) ⇒ payee ที่ยังไม่กรอก
 *   เลขประจำตัวผู้เสียภาษีต้องหยุดตั้งแต่ต้น (`assertPayeeTaxIdsComplete()`) ไม่ใช่ปล่อยช่องว่างไปถึง
 *   สำนักงานบัญชี
 * - `06_Bank_Reconciliation.csv` — `status` ใช้ **enum เต็มตามสคีมา** (DEC-006/D10) ไม่แปลไทย — 6 ค่าตั้งแต่ U41
 *   (`suspense` = เงินรับรอตรวจสอบ · `suspense_refunded` = คืนเงินผู้โอนแล้ว)
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
  { no: '00', fileName: '00_Control_Totals.csv', kind: 'csv', description: 'ยอดรวมควบคุม — จำนวนแถว + ยอดรวมคอลัมน์เงินหลักของทุกไฟล์ และยอดสรุปของงวด (ภาพ ณ เวลาสร้างชุด)', sourceDoc: '37' },
  { no: '01', fileName: '01_Revenue.csv', kind: 'csv', description: 'รายการรายได้ — company, case_ref, revenue_date, gross, vat_flag', sourceDoc: '19' },
  { no: '02', fileName: '02_Cash_Receipts.csv', kind: 'csv', description: 'รายการเงินรับ — receipt_date, payer, amount, bank_ref', sourceDoc: '31' },
  { no: '03', fileName: '03_Expenses.csv', kind: 'csv', description: 'รายการค่าใช้จ่าย — payee, category, gross, wht, net, ใบเสร็จค่าที่พักในนามบริษัท + หลักฐาน (expense_id, วันทำงาน, วันจ่าย, รอบจ่าย, ใบสำคัญจ่าย, เคส, ศูนย์ต้นทุน, ไฟล์ใบเสร็จ, เลขใบรับรองแทนใบเสร็จ)', sourceDoc: '32' },
  { no: '04', fileName: '04_Payments.csv', kind: 'csv', description: 'รายการจ่ายเงินจริง (+ ใบสำคัญจ่าย/สลิปค่าตอบแทน PDF ในโฟลเดอร์ vouchers/)', sourceDoc: '17' },
  { no: '05', fileName: '05_WHT_Data.csv', kind: 'csv', description: 'ข้อมูลหัก ณ ที่จ่าย (+ PDF หนังสือรับรอง 50 ทวิ ในโฟลเดอร์ wht_certificates/)', sourceDoc: '33' },
  { no: '06', fileName: '06_Bank_Reconciliation.csv', kind: 'csv', description: 'ผลกระทบยอดธนาคาร', sourceDoc: '35' },
  { no: '07', fileName: '07_Adjustment_Log.csv', kind: 'csv', description: 'รายการปรับปรุงยอดทั้งหมดของรอบนั้น', sourceDoc: '20' },
  { no: '08', fileName: '08_Document_Checklist.xlsx', kind: 'xlsx', description: 'source_ref, doc_status, exception summary', sourceDoc: '34' },
  { no: '09', fileName: '09_Credit_Notes.csv', kind: 'csv', description: 'ใบลดหนี้/ใบเพิ่มหนี้ที่ออกในรอบ — document_type, number, tax_invoice_ref, amount, vat, company_tax_id', sourceDoc: '31' },
  { no: '10', fileName: '10_Customer_WHT.csv', kind: 'csv', description: 'ภาษีที่ลูกค้าหัก ณ ที่จ่าย + สถานะหนังสือ 50 ทวิ — company, withheld, cert_no, cert_date, status', sourceDoc: '31' },
  { no: '11', fileName: '11_Suspense_Receipts.csv', kind: 'csv', description: 'เงินรับรอตรวจสอบ (ไม่ทราบที่มา) — amount, reason, status, resolved_ref, refund_date', sourceDoc: '35' },
  { no: '12', fileName: '12_Tax_Invoices.csv', kind: 'csv', description: 'ใบเสร็จรับเงิน/ใบกำกับภาษี (ออกตอนรับเงิน) และใบกำกับภาษีแบบเดิมที่ออก/ยกเลิกในรอบ ตามวันที่เอกสาร — number, date, company, tax_id, before_vat, vat, total, status, สาขาผู้ซื้อ, ชนิดเอกสาร, วันรับเงิน (+ PDF ในโฟลเดอร์ tax_invoices/ · ใบแจ้งหนี้ที่ส่งในรอบอยู่ใน billing_invoices/)', sourceDoc: '31' },
  { no: '13', fileName: '13_Advance_Returns.csv', kind: 'csv', description: 'รับคืนเงินทดรอง (หักในรอบจ่าย/เงินสด/โอน) — date, advance_ref, payee, amount, channel, status, return_number', sourceDoc: '15' },
  { no: '14', fileName: '14_Unbilled_Revenue.csv', kind: 'csv', description: 'รายได้ค้างรับ (ส่งมอบแล้ว ยังไม่วางบิล ณ วันสร้างชุด) — case_ref, company, delivered_date, before_vat, vat, total', sourceDoc: '19' },
  { no: '15', fileName: '15_Accrued_Expenses.csv', kind: 'csv', description: 'ค่าตอบแทน/ค่าใช้จ่ายค้างจ่าย ณ สิ้นงวด (ภาพ ณ เวลาสร้างชุด) — expense_id, payee, status, gross, estimated_wht, payout_batch_ref', sourceDoc: '17' },
  { no: '16', fileName: '16_Advance_Balance.csv', kind: 'csv', description: 'เงินทดรองต่อคน — ยอดยกมา, จ่าย, ใช้/เคลียร์, คืน (หักกลบ/รับแยก), คงเหลือสิ้นงวด, advance_refs', sourceDoc: '15' },
  { no: '17', fileName: '17_Company_Documents.csv', kind: 'csv', description: 'เอกสารบริษัทไฟแนนซ์เวอร์ชันปัจจุบัน (หนังสือรับรอง/ภ.พ.20/สัญญา/สมุดบัญชี/อื่น ๆ) + คำเตือนเอกสารไม่ครบ — ภาพ ณ เวลาสร้างชุด', sourceDoc: '10' },
  { no: '18', fileName: '18_Bank_Fee_Write_Offs.csv', kind: 'csv', description: 'ส่วนต่างรับชำระขาดไม่เกินเพดานที่ตัดเป็นค่าธรรมเนียมธนาคาร (ตามวันที่ตัดในงวด) — write_off_date, company, billing_ref, billed, received, customer_wht, bank_fee', sourceDoc: '19' },
]

/** ชื่อไฟล์ตามเลขลำดับ — ผู้ประกอบชุดอ้างเลข ไม่ใช่ตำแหน่งใน array (`37` §6.1) */
export function packFileName(no: string): string {
  const file = PACK_FILES.find((item) => item.no === no)
  if (file === undefined) throw new RangeError(`ไม่มีไฟล์เลข ${no} ในชุดเอกสารบัญชี`)
  return file.fileName
}

/**
 * หน้าปกไม่อยู่ในรายชื่อไฟล์ของ §6.1 — ตั้งชื่อ `00_Cover_Sheet.pdf` ให้เรียงมาก่อน (คีย์ `cover` ใน `file_urls` ·
 * ไม่ถูกนับใน `file_count`) · ไฟล์ข้อมูลเลข `00` คือ `00_Control_Totals.csv` (มติ U94 ข้อ 4 — นับใน `file_count`)
 */
export const PACK_COVER_KEY = 'cover'
export const PACK_COVER_FILE_NAME = '00_Cover_Sheet.pdf'
/** คีย์ของไฟล์ `.zip` ทั้งชุดใน `file_urls` */
export const PACK_ZIP_KEY = 'pack'

/**
 * ชื่อ object ของไฟล์ `.zip` ใน bucket — **ASCII ล้วน** (`AccountingPack_2569-10_v1.0.zip`)
 *
 * Supabase Storage ปฏิเสธ key ที่มีอักษรนอกชุด `[A-Za-z0-9!-_.*'()/]` ("Invalid key") ⇒ ห้ามเอา
 * ชื่อรอบภาษาไทย ("ตุลาคม 2569") มาประกอบ key (UAT R7cv3-B01) · ชื่อไทยใช้แค่ตอนดาวน์โหลด
 * ผ่าน `packZipDownloadName()` + `Content-Disposition: filename*=UTF-8''…`
 */
export function packZipFileName(yearBe: number, month: number, version: number): string {
  return `AccountingPack_${yearBe}-${String(month).padStart(2, '0')}_${exportVersionLabel(version)}.zip`
}

/** ชื่อไฟล์ที่ผู้ใช้เห็น/ได้ตอนดาวน์โหลด — ภาษาไทยได้ (ไม่ใช่ key ใน Storage) */
export function packZipDownloadName(periodLabel: string, version: number): string {
  const slug = periodLabel.trim().replace(/\s+/g, '_')
  return `AccountingPack_${slug}_${exportVersionLabel(version)}.zip`
}

/** อักขระที่ Supabase Storage ยอมให้อยู่ใน object key */
const STORAGE_KEY_PATTERN = /^[A-Za-z0-9!\-_.*'()/]+$/

export function isSafeStorageKey(key: string): boolean {
  return key.length > 0 && STORAGE_KEY_PATTERN.test(key)
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
  const path = `${input.organizationId}/${input.yearBe}-${month}/v${input.version}/${input.attempt}/${input.fileName}`
  // กันพลาดตั้งแต่ต้นทาง — key ที่ Storage ไม่รับจะล้มกลางการอัปโหลดแล้วทิ้งไฟล์ชุดเดียวกันค้าง
  if (!isSafeStorageKey(path)) throw new RangeError(`path ในที่เก็บไฟล์มีอักขระที่ไม่รองรับ: ${path}`)
  return path
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

export const EXPENSE_HEADERS = [
  'payee',
  'category',
  'gross_baht',
  'wht_baht',
  'net_baht',
  // มติ PO 06/10/2569 (U96 #14) — ต่อท้ายสุด: ค่าที่พักใบเสร็จในนามบริษัท `Y`/`N` (ชนิดอื่นเว้นว่าง)
  // ให้สำนักงานบัญชีพิจารณาฐานหัก ณ ที่จ่ายของค่าที่พักที่ไม่ได้ออกในนามบริษัท — ระบบไม่เปลี่ยนสูตร WHT เอง
  'receipt_in_company_name',
  // มติ PO 06/10/2569 (U96 #15) — หลักฐานรายจ่ายต่อท้าย **หลัง** `receipt_in_company_name` (คอลัมน์เดิม 6 ตัวไม่ย้าย)
  'expense_id',
  'work_date',
  'payment_date',
  'payout_batch_ref',
  'voucher_ref',
  'case_ref',
  'cost_center',
  'receipt_file',
  // มติ PO 06/10/2569 (U103) — ต่อท้ายสุด: เลขใบรับรองแทนใบเสร็จ (CRT) เมื่อรายการใช้ใบรับรองแทนใบเสร็จ (`receipt_file`
  // = ชื่อไฟล์ใบรับรองฉบับเซ็น) · รายการปกติ = `-`
  'substitute_receipt_number',
] as const

export interface ExpenseExportRow {
  payeeName: string
  category: string
  grossSatang: number
  whtSatang: number
  netSatang: number
  /** ค่าที่พัก: ใบเสร็จออกในนามบริษัท · รายการชนิดอื่น = `null` (คอลัมน์ว่าง) */
  receiptInCompanyName: boolean | null
  /**
   * U96 #15 — `expenses.id` ของรายการเบิก · รายการเงินทดรองจ่าย (ไม่มีใบเบิก) = เลขอ้างอิง `ADV-…` ·
   * ไม่ระบุ (ข้อมูลเก่าในเทสต์) = `-`
   */
  expenseId?: string | null
  /** วันที่ทำงาน/วันที่รายการ (`expenses.expense_date`) — เงินทดรอง = `null` */
  workDate?: Date | null
  /** วันจ่ายจริงของรอบ (ตัวเดียวกับไฟล์ 04) */
  paymentDate?: Date | null
  payoutBatchRef?: string | null
  /** เลขใบสำคัญจ่ายของผู้รับในรอบ (ตัวเดียวกับไฟล์ 04) */
  voucherRef?: string | null
  caseRef?: string | null
  /** `cost_centers.code` ของบัญชีค่าใช้จ่าย */
  costCenter?: string | null
  /** path ใบเสร็จใน bucket — ไฟล์ใส่แค่ชื่อไฟล์ (`evidenceFileName()`) */
  receiptFilePath?: string | null
  /** มติ PO U103 — เลข CRT ของใบรับรองแทนใบเสร็จ · ไม่มี = ว่าง */
  substituteReceiptNumber?: string | null
}

/** `Y`/`N` สำหรับค่าที่พัก · ชนิดอื่นเว้นว่าง (ไม่เกี่ยว) — รูปแบบเดียวกับธง `Y`/`N` ในไฟล์ 01 */
export function receiptInCompanyNameCell(value: boolean | null): string {
  if (value === null) return ''
  return value ? 'Y' : 'N'
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
      receiptInCompanyNameCell(row.receiptInCompanyName),
      csvText(row.expenseId),
      csvDate(row.workDate),
      csvDate(row.paymentDate),
      csvText(row.payoutBatchRef),
      csvText(row.voucherRef),
      csvText(row.caseRef),
      csvText(row.costCenter),
      csvText(evidenceFileName(row.receiptFilePath ?? null)),
      csvText(row.substituteReceiptNumber),
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
  // มติ PO 05/10/2569 (UAT U30) — ต่อท้ายไฟล์: ยอดหักคืนเงินทดรอง (หลังภาษี) + ยอดโอนจริง = amount − หัก
  'advance_offset_baht',
  'transfer_baht',
  // มติ PO 06/10/2569 (U105) — ต่อท้ายสุด: ภาษีที่บริษัทออกให้ผู้รับ (เงื่อนไข (2)/(3) — ค่าใช้จ่ายบริษัท ไม่ได้หักจากผู้รับ)
  'wht_paid_by_payer_baht',
] as const

/** ช่องทางจ่ายของระบบมีทางเดียว — โอนผ่านไฟล์ธนาคาร (`17` §6.3) */
export const PAYMENT_METHOD_LABEL = 'Bank Transfer'

export interface PaymentExportRow {
  batchRef: string
  paymentDate: Date
  payeeName: string
  netSatang: number
  voucherRef: string
  /** มติ U30 — ยอดหักคืนเงินทดรองของผู้รับในรอบ (0 = ไม่มี) */
  advanceOffsetSatang: number
  /** มติ U105 — ภาษีที่บริษัทออกให้ผู้รับในรอบ (`payoutItemTaxSplit()` · 0 = หัก ณ ที่จ่ายตามปกติ) */
  whtPaidByPayerSatang: number
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
      csvBaht(row.advanceOffsetSatang),
      csvBaht(payoutTransferSatang(row.netSatang, row.advanceOffsetSatang)),
      csvBaht(row.whtPaidByPayerSatang),
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
  // มติ PO 05/10/2569 (UAT U15) — ต่อท้ายสุด ไม่เปลี่ยนลำดับ/ชื่อคอลัมน์เดิม (แจ้งสำนักงานบัญชีแล้ว)
  'filing_form',
  // มติ PO 06/10/2569 (UAT U94 ข้อ 1) — ต่อท้ายสุด · ค่าจาก snapshot ของใบ 50 ทวิ (U96 #4)
  'payee_title',
  'payee_address',
  'payee_branch',
  'wht_condition',
  // มติ PO 06/10/2569 (U105) — ต่อท้ายสุด: ภาษีที่บริษัทออกให้ (เงื่อนไข (2)/(3) = wht_baht · (1) = 0)
  // gross_baht ของ (2)/(3) = เงินได้ + ภาษีที่ออกให้ (ตรงกับใบ 50 ทวิ)
  'wht_paid_by_payer_baht',
  // มติ PO 07/10/2569 (U128) — ต่อท้ายสุด: `status` = `active` (ใบที่มีผล/ใบที่ออกภายหลังของเดือนที่ส่งชุดไปแล้ว)
  // หรือ `cancelled` (แถวกลับรายการ — ยอดติดลบ) · `ref_cert_no` = ใบเดิมที่แถวนี้กลับรายการ / ใบที่ถูกออกแทน
  'status',
  'ref_cert_no',
] as const

/** ชนิดแถวของไฟล์ 05 (U128) — `active` แถวปกติ · `cancelled` แถวกลับรายการ (ยอดติดลบ) */
export type WhtExportRowStatus = 'active' | 'cancelled'

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
  /** `wht_certificates.filing_form` — แบบที่ต้องยื่น `PND1`/`PND3`/`PND53` (U15 · รหัสตรง enum `wht_filing_form`) */
  filingForm: WhtFilingForm
  /** snapshot คำนำหน้า (บุคคลธรรมดา) — ว่าง = ไม่มี (U94) */
  payeeTitle: string | null
  /** snapshot ที่อยู่บรรทัดเดียว — ว่าง = ยังไม่กรอกตอนออกใบ (U94) */
  payeeAddress: string | null
  /** snapshot รหัสสาขา 5 หลัก (นิติบุคคล — `00000` = สำนักงานใหญ่) · บุคคลธรรมดา = ว่าง (U94) */
  payeeBranchCode: string | null
  /** snapshot เงื่อนไขการหัก — รหัสตรง enum `wht_condition` (U94) */
  whtCondition: WhtCondition
  /** U128 — ไม่ส่ง = `active` (แถวปกติ) · `cancelled` = แถวกลับรายการ (gross/wht ติดลบแล้ว) */
  rowStatus?: WhtExportRowStatus
  /** U128 — แถวกลับรายการ = เลขใบเดิม · ใบออกแทน = เลขใบที่ถูกแทน · อื่น ๆ = ว่าง */
  refCertificateNumber?: string | null
}

/**
 * แถวกลับรายการของใบ 50 ทวิ ที่ยกเลิกหลังส่งชุดของเดือนที่จ่ายไปแล้ว (มติ PO 07/10/2569 U128)
 * — ยอดเงินติดลบ (ผลรวมไฟล์ 05/ยอดสรุปใน 00 หักกลับเอง) · `ref_cert_no` = เลขใบเดิม
 */
export function whtReversalRow(row: WhtExportRow): WhtExportRow {
  return {
    ...row,
    grossSatang: -row.grossSatang,
    whtSatang: -row.whtSatang,
    rowStatus: 'cancelled',
    refCertificateNumber: row.certificateNumber,
  }
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
      row.filingForm,
      row.payeeTitle ?? CSV_EMPTY,
      row.payeeAddress ?? CSV_EMPTY,
      row.payeeBranchCode ?? CSV_EMPTY,
      row.whtCondition,
      csvBaht(isPayerBorneWhtCondition(row.whtCondition) ? row.whtSatang : 0),
      row.rowStatus ?? 'active',
      row.refCertificateNumber ?? CSV_EMPTY,
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
  'billing_batch_number',
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
  /** เลขรอบวางบิล `BL-<พ.ศ.>-NNN` เมื่อจับคู่กับรอบวางบิล (มติ U79 — คอลัมน์ต่อท้าย) · อื่น ๆ = null */
  billingBatchNumber: string | null
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
      // enum เต็มตามสคีมา ห้ามแปลไทย (DEC-006/D10 · U41 เพิ่ม suspense/suspense_refunded)
      row.matchStatus,
      csvText(row.billingBatchNumber),
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
  'billing_batch_number',
] as const

export interface AdjustmentExportRow {
  targetType: string
  targetRef: string
  /** ยอดที่เซ็นแล้ว (`signedAdjustmentSatang()` ของ 3.7) — ลดยอดติดลบ */
  signedSatang: number
  reason: string
  approvedByName: string | null
  approvedAt: Date | null
  /** เลขรอบวางบิลเมื่อ `target_type` = `billing_batch` (มติ U79 — คอลัมน์ต่อท้าย) · อื่น ๆ = null */
  billingBatchNumber: string | null
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
      csvText(row.billingBatchNumber),
    ]),
  )
}

// ── 09_Credit_Notes.csv (ไฟล์ 31 — มติ PO 05/10/2569 U21) ────────────────────

/**
 * ใบลดหนี้ (`CN`) + ใบเพิ่มหนี้ (`DN`) ที่**ลงวันที่ในรอบ** (ภาษีขายปรับในเดือนที่ออกเอกสาร) รวมใบที่ยกเลิก
 * (`status` = enum เต็มแบบไฟล์ 06) · ยอดเป็นบวกเสมอ — ทิศทางดูจาก `document_type`
 * · `adjustment_ref` = เลขที่รายการปรับปรุงในไฟล์ 07 ของงวดเป้าหมายของ Adjustment (`adjustmentRef()`) · ไม่ผูก ⇒ `-`
 * · `company_branch` (มติ PO U82 · ม.86/4 — คอลัมน์ต่อท้าย) = "สำนักงานใหญ่" / "สาขาที่ 00001" ตาม snapshot
 *   สาขาผู้ซื้อของใบกำกับเดิม (รูปแบบเดียวกับไฟล์ 12 — มติ U84)
 */
export const CREDIT_NOTE_HEADERS = [
  'document_type',
  'number',
  'issue_date',
  'tax_invoice_ref',
  'company',
  'amount_before_vat_baht',
  'vat_baht',
  'total_baht',
  'reason',
  'status',
  'adjustment_ref',
  'company_branch',
  // มติ PO 06/10/2569 (U94 ข้อ 5) — ต่อท้ายสุด: เลขผู้เสียภาษีผู้ซื้อ 13 หลักตาม snapshot บนใบกำกับเดิม
  'company_tax_id',
] as const

export interface CreditNoteExportRow {
  documentType: 'CN' | 'DN'
  number: string
  issueDate: Date
  taxInvoiceRef: string
  companyName: string
  amountBeforeVatSatang: number
  vatSatang: number
  totalSatang: number
  reason: string
  status: string
  adjustmentRef: string | null
  /** snapshot สาขาผู้ซื้อตามใบกำกับเดิม (`credit_notes.buyer_branch_code` · `00000` = สำนักงานใหญ่) */
  companyBranchCode: string
  /** U94 ข้อ 5 — snapshot `tax_invoices.buyer_tax_id` ของใบกำกับเดิม · ไม่ระบุ/ไม่ครบ 13 หลัก = `-` */
  companyTaxId?: string | null
}

export function creditNoteCsv(rows: readonly CreditNoteExportRow[]): string {
  return buildCsv(
    CREDIT_NOTE_HEADERS,
    rows.map((row) => [
      row.documentType,
      row.number,
      csvDate(row.issueDate),
      row.taxInvoiceRef,
      row.companyName,
      csvBaht(row.amountBeforeVatSatang),
      csvBaht(row.vatSatang),
      csvBaht(row.totalSatang),
      row.reason,
      row.status,
      csvText(row.adjustmentRef),
      formatBranch(row.companyBranchCode),
      normalizeTaxId(row.companyTaxId) ?? CSV_EMPTY,
    ]),
  )
}

// ── 10_Customer_WHT.csv (ไฟล์ 31 — มติ PO 05/10/2569 U40) ────────────────────

/**
 * ภาษีที่**ลูกค้าหักเรา** ณ ที่จ่าย (เครดิตภาษีของบริษัท) + สถานะหนังสือรับรอง 50 ทวิ
 * แถว = รายการที่รับเงินในงวด + รายการที่ยังรอหนังสือซึ่งรับเงินก่อนงวด (ยกมา) · `status` = enum ดิบ
 * (`pending` = ยังไม่ได้รับหนังสือ · `received` = ได้รับแล้ว) · ยังไม่ได้รับ ⇒ ช่องหนังสือเป็น `-`
 */
export const CUSTOMER_WHT_HEADERS = [
  'received_date',
  'company',
  'company_tax_id',
  'billing_ref',
  'tax_invoice_ref',
  'withheld_baht',
  'cert_no',
  'cert_date',
  'cert_wht_baht',
  'status',
  'billing_batch_number',
] as const

export interface CustomerWhtExportRow {
  withheldDate: Date
  companyName: string
  companyTaxId: string | null
  billingRef: string | null
  taxInvoiceNumbers: readonly string[]
  withheldSatang: number
  certificateNumber: string | null
  certificateDate: Date | null
  whtSatang: number | null
  status: 'pending' | 'received'
  /** เลขรอบวางบิล (มติ U79 — คอลัมน์ต่อท้าย · `billing_ref` คงเป็นรอบเดือน) */
  billingBatchNumber: string | null
}

export function customerWhtCsv(rows: readonly CustomerWhtExportRow[]): string {
  return buildCsv(
    CUSTOMER_WHT_HEADERS,
    rows.map((row) => [
      csvDate(row.withheldDate),
      row.companyName,
      normalizeTaxId(row.companyTaxId) ?? CSV_EMPTY,
      csvText(row.billingRef),
      row.taxInvoiceNumbers.length === 0 ? CSV_EMPTY : row.taxInvoiceNumbers.join(' '),
      csvBaht(row.withheldSatang),
      csvText(row.certificateNumber),
      csvDate(row.certificateDate),
      row.whtSatang === null ? CSV_EMPTY : csvBaht(row.whtSatang),
      row.status,
      csvText(row.billingBatchNumber),
    ]),
  )
}

// ── 11_Suspense_Receipts.csv (ไฟล์ 35 — มติ PO 05/10/2569 U41) ──────────────

/**
 * เงินรับรอตรวจสอบ (เงินเข้าไม่ทราบที่มา — หนี้สิน ไม่รับรู้รายได้) · แถว = รายการเดินบัญชีที่**เคย**ย้ายเข้า
 * เงินรับรอตรวจสอบ และ (เกิดในงวด / ยังคงค้าง / จับคู่หรือคืนเงินในงวด) · `status` = enum ดิบของรายการ
 * (`suspense` = ยังค้าง · `manual_matched` = ทราบที่มาแล้วจับคู่กับรอบวางบิล · `suspense_refunded` = คืนผู้โอนแล้ว)
 */
export const SUSPENSE_HEADERS = [
  'bank_txn_date',
  'bank_ref',
  'amount_baht',
  'suspended_date',
  'suspense_reason',
  'status',
  'resolved_ref',
  'resolved_date',
  'refund_reason',
  'billing_batch_number',
] as const

export interface SuspenseExportRow {
  transactionDate: Date
  description: string
  amountSatang: number
  suspendedAt: Date
  suspenseNote: string
  matchStatus: BankMatchStatus
  /** รอบวางบิลที่จับคู่ภายหลัง (ถ้ามี) */
  matchedRef: string | null
  /** วันที่จับคู่ภายหลัง หรือวันที่คืนเงิน */
  resolvedDate: Date | null
  refundNote: string | null
  /** เลขรอบวางบิลที่จับคู่ภายหลัง (มติ U79 — คอลัมน์ต่อท้าย) */
  billingBatchNumber: string | null
}

export function suspenseCsv(rows: readonly SuspenseExportRow[]): string {
  return buildCsv(
    SUSPENSE_HEADERS,
    rows.map((row) => [
      csvDate(row.transactionDate),
      csvText(row.description),
      csvBaht(Math.abs(row.amountSatang)),
      csvDate(row.suspendedAt),
      row.suspenseNote,
      row.matchStatus,
      csvText(row.matchedRef),
      csvDate(row.resolvedDate),
      csvText(row.refundNote),
      csvText(row.billingBatchNumber),
    ]),
  )
}

// ── 12_Tax_Invoices.csv (ไฟล์ 31 — มติ PO 05/10/2569 U57 · O41/BUG-123) ─────

/**
 * ใบกำกับภาษีขาย (ใช้ทำรายงานภาษีขาย/ภ.พ.30) · แถว = ใบที่**ลงวันที่ในรอบ** (รวมใบที่ยกเลิกภายหลัง) +
 * ใบของรอบก่อนที่**ถูกยกเลิกในรอบนี้** · ยอดมาจาก snapshot ของรายการขาย (ไม่คำนวณใหม่) ·
 * `vat_rate_pct` = `vat_rate_pct_used` ของรายได้ในรอบวางบิล (หลายอัตรา ⇒ คั่นด้วยช่องว่าง) ·
 * `status` = enum ดิบ (`active`/`cancelled`) · `replaced_by` = ใบที่ออกแทนใบที่ยกเลิก (รายการขายเดียวกัน)
 * · `pdf_file` = path ของสำเนา PDF ใน zip (ไม่ได้แนบ ⇒ `-` + รายชื่อใน `tax_invoices/NOT_ATTACHED.txt`)
 * · `company_branch` (มติ PO U77 · ม.86/4 — คอลัมน์ต่อท้าย) = "สำนักงานใหญ่" / "สาขาที่ 00001" จาก **snapshot บนใบ**
 *   (เป็นข้อความ ไม่ใช่รหัสล้วน — เปิดใน Excel แล้วเลข 0 นำหน้าไม่หาย)
 */
export const TAX_INVOICE_HEADERS = [
  'invoice_number',
  'invoice_date',
  'company',
  'company_tax_id',
  'amount_before_vat_baht',
  'vat_baht',
  'total_baht',
  'vat_rate_pct',
  'billing_ref',
  'status',
  'cancelled_date',
  'cancel_reason',
  'replaced_by',
  'pdf_file',
  'company_branch',
  'billing_batch_number',
  'document_type',
  'received_date',
] as const

export interface TaxInvoiceExportRow {
  invoiceNumber: string
  invoiceDate: Date
  companyName: string
  companyTaxId: string | null
  /** snapshot สำนักงานใหญ่/สาขาของผู้ซื้อบนใบ (`tax_invoices.buyer_branch_code` · `00000` = สำนักงานใหญ่) */
  companyBranchCode: string
  amountBeforeVatSatang: number
  vatSatang: number
  totalSatang: number
  /** snapshot `revenues.vat_rate_pct_used` ของรอบวางบิล (NUMERIC เป็นข้อความ) */
  vatRatesPct: readonly string[]
  billingRef: string | null
  status: 'active' | 'cancelled'
  cancelledAt: Date | null
  cancelReason: string | null
  replacedBy: string | null
  /** path ใน zip (`tax_invoices/…pdf`) — null = ไม่ได้แนบ */
  pdfFile: string | null
  /** เลขรอบวางบิล (มติ U79 — คอลัมน์ต่อท้าย · `billing_ref` คงเป็นรอบเดือน) */
  billingBatchNumber: string | null
  /** มติ PO U95 — ชื่อเอกสาร ("ใบเสร็จรับเงิน/ใบกำกับภาษี" / "ใบกำกับภาษี" แบบเดิม) · คอลัมน์ต่อท้าย */
  documentType: string
  /** วันรับเงินที่เป็นจุดความรับผิด VAT (ใบเสร็จรับเงิน/ใบกำกับภาษี) — ใบแบบเดิม ⇒ `-` */
  receivedDate: Date | null
}

/** อัตรา VAT แบบทศนิยม 2 ตำแหน่ง ไม่ซ้ำ เรียงน้อยไปมาก — ไม่มีรายได้ผูก ⇒ `-` */
export function vatRatesText(rates: readonly string[]): string {
  const unique = [
    ...new Set(
      rates
        .map((rate) => Number(rate))
        .filter((rate) => Number.isFinite(rate))
        .map((rate) => rate.toFixed(2)),
    ),
  ].sort((a, b) => Number(a) - Number(b))
  return unique.length === 0 ? CSV_EMPTY : unique.join(' ')
}

export function taxInvoiceCsv(rows: readonly TaxInvoiceExportRow[]): string {
  return buildCsv(
    TAX_INVOICE_HEADERS,
    rows.map((row) => [
      row.invoiceNumber,
      csvDate(row.invoiceDate),
      row.companyName,
      normalizeTaxId(row.companyTaxId) ?? CSV_EMPTY,
      csvBaht(row.amountBeforeVatSatang),
      csvBaht(row.vatSatang),
      csvBaht(row.totalSatang),
      vatRatesText(row.vatRatesPct),
      csvText(row.billingRef),
      row.status,
      row.status === 'cancelled' ? csvDate(row.cancelledAt) : CSV_EMPTY,
      row.status === 'cancelled' ? csvText(row.cancelReason) : CSV_EMPTY,
      csvText(row.replacedBy),
      csvText(row.pdfFile),
      formatBranch(row.companyBranchCode),
      csvText(row.billingBatchNumber),
      row.documentType,
      row.receivedDate === null ? CSV_EMPTY : csvDate(row.receivedDate),
    ]),
  )
}

/** โฟลเดอร์สำเนา PDF ใบกำกับภาษีใน zip (U57) */
export const PACK_TAX_INVOICE_PDF_DIR = 'tax_invoices'
/** ไฟล์รายชื่อใบที่ไม่ได้แนบ PDF (เกินเพดาน) — มีเฉพาะเมื่อมีใบที่ไม่ได้แนบ */
export const PACK_TAX_INVOICE_NOT_ATTACHED_FILE = `${PACK_TAX_INVOICE_PDF_DIR}/NOT_ATTACHED.txt`
/**
 * เพดานจำนวน PDF ต่อชุด — กันคำขอ Export ยาวเกินเวลาที่ฟังก์ชันบน Vercel อนุญาต
 * (ใบเกินเพดานยังอยู่ใน `12_Tax_Invoices.csv` ครบ · ดาวน์โหลด PDF รายใบจากหน้ารายการขายได้)
 */
export const PACK_TAX_INVOICE_PDF_LIMIT = 200
/** เพดานเวลาประกอบ PDF ทั้งหมดต่อชุด (มิลลิวินาที) — เกินแล้วหยุดแนบ ใบที่เหลือไปอยู่ในรายชื่อไม่ได้แนบ */
export const PACK_TAX_INVOICE_PDF_TIME_BUDGET_MS = 60_000

/**
 * ต่อท้ายชื่อไฟล์ PDF ของเอกสารที่**ยกเลิกแล้ว**ใน zip — ใช้แบบเดียวกันทุกโฟลเดอร์เอกสารภาษี
 * (`tax_invoices/` · `wht_certificates/`) ให้สำนักงานบัญชีแยกออกได้จากชื่อไฟล์ (UAT BUG-168)
 */
export const PACK_CANCELLED_PDF_SUFFIX = '-CANCELLED'

/** เลขเอกสารที่ใช้ตั้งชื่อไฟล์ — ยกเลิกแล้วต่อท้าย `-CANCELLED` */
export function packPdfRef(documentNumber: string, cancelled: boolean): string {
  return cancelled ? `${documentNumber.trim()}${PACK_CANCELLED_PDF_SUFFIX}` : documentNumber
}

/** ชื่อไฟล์ PDF ใน zip — ตัดอักขระที่ใช้เป็นชื่อไฟล์ไม่ได้ (เลขที่ใบกำกับตั้ง prefix เองได้) */
export function taxInvoicePdfEntryName(invoiceNumber: string, cancelled = false): string {
  const safe = invoiceNumber.trim().replace(/[\\/:*?"<>|\s]+/g, '_')
  return `${PACK_TAX_INVOICE_PDF_DIR}/${packPdfRef(safe === '' ? 'invoice' : safe, cancelled)}.pdf`
}

/** เนื้อไฟล์ `NOT_ATTACHED.txt` — บอกสำนักงานบัญชีว่าใบไหนไม่มี PDF ในชุด และไปเอาจากที่ไหน */
export function taxInvoiceNotAttachedText(invoiceNumbers: readonly string[]): string {
  return [
    `ใบกำกับภาษีที่ไม่ได้แนบ PDF ในชุดนี้ ${invoiceNumbers.length} ใบ (เกินจำนวน/เวลาที่ประกอบได้ต่อครั้ง)`,
    'ข้อมูลของทุกใบยังอยู่ครบใน 12_Tax_Invoices.csv — ขอสำเนา PDF รายใบได้จากผู้ดูแลระบบ',
    '',
    ...invoiceNumbers,
    '',
  ].join(CSV_NEWLINE)
}

// ── เอกสาร PDF ใน zip (มติ PO U57 · U94 ข้อ 5) ────────────────────────────────

/** โฟลเดอร์ PDF หนังสือรับรอง 50 ทวิ ที่ออกในงวด (ชุดเดียวกับ `05_WHT_Data.csv`) */
export const PACK_WHT_CERTIFICATE_PDF_DIR = 'wht_certificates'
/** โฟลเดอร์ PDF ใบสำคัญจ่าย + สลิปค่าตอบแทนของรอบจ่ายที่โอนแล้วในงวด (ชุดเดียวกับ `04_Payments.csv`) */
export const PACK_VOUCHER_PDF_DIR = 'vouchers'
/** โฟลเดอร์ PDF ใบแจ้งหนี้/ใบวางบิลที่ส่งลูกค้าในงวด — **ไม่ใช่เอกสารภาษี** จึงไม่อยู่ใน `tax_invoices/` (U95) */
export const PACK_BILLING_INVOICE_PDF_DIR = 'billing_invoices'

/** ชื่อไฟล์ `NOT_ATTACHED.txt` ของโฟลเดอร์ — มีเฉพาะเมื่อมีเอกสารที่ไม่ได้แนบ */
export function packNotAttachedFile(dir: string): string {
  return `${dir}/NOT_ATTACHED.txt`
}

/** ชื่อไฟล์ PDF ใต้โฟลเดอร์ — ตัดอักขระที่ใช้เป็นชื่อไฟล์ไม่ได้ (แบบเดียวกับ `taxInvoicePdfEntryName()`) */
export function packPdfEntryName(dir: string, ref: string, fallback = 'document'): string {
  const safe = ref.trim().replace(/[\\/:*?"<>|\s]+/g, '_')
  return `${dir}/${safe === '' ? fallback : safe}.pdf`
}

/** เนื้อ `NOT_ATTACHED.txt` ของโฟลเดอร์ใดก็ได้ — บอกจำนวน/เลขที่ และไฟล์ CSV ที่ข้อมูลยังอยู่ครบ */
export function packNotAttachedText(input: {
  documentLabel: string
  unit: string
  /** ไฟล์ CSV ที่ข้อมูลของทุกรายการยังอยู่ครบ — `null` = ไม่มีไฟล์ CSV ของเอกสารชนิดนี้ (เช่น ใบแจ้งหนี้) */
  csvFileName: string | null
  refs: readonly string[]
}): string {
  return [
    `${input.documentLabel}ที่ไม่ได้แนบ PDF ในชุดนี้ ${input.refs.length} ${input.unit} (เกินจำนวน/เวลาที่ประกอบได้ต่อครั้ง)`,
    input.csvFileName === null
      ? 'ขอสำเนา PDF รายฉบับได้จากผู้ดูแลระบบ'
      : `ข้อมูลของทุกรายการยังอยู่ครบใน ${input.csvFileName} — ขอสำเนา PDF รายฉบับได้จากผู้ดูแลระบบ`,
    '',
    ...input.refs,
    '',
  ].join(CSV_NEWLINE)
}

/**
 * เพดานแนบ PDF **ร่วมกันทุกโฟลเดอร์** ของชุด (จำนวน `PACK_TAX_INVOICE_PDF_LIMIT` + เวลา
 * `PACK_TAX_INVOICE_PDF_TIME_BUDGET_MS`) — ใช้เพดานเดียวทั้งชุดเพราะสิ่งที่ต้องคุมคือเวลาทั้งคำขอ Export บน
 * Vercel ไม่ใช่เวลาต่อโฟลเดอร์ (แยกเพดานต่อโฟลเดอร์ = 4 เท่าของเวลาเดิม) · ลำดับความสำคัญ: เอกสารภาษี
 * (`tax_invoices/` → `wht_certificates/`) ก่อน แล้ว `vouchers/` → `billing_invoices/`
 * · `now` ฉีดเข้ามาได้ ⇒ เทสต์ได้แบบ pure
 */
export interface PackPdfBudget {
  /** ขอแนบอีก 1 ฉบับ — `false` = เต็มเพดานแล้ว (ผู้เรียกต้องลงรายชื่อไม่ได้แนบ) */
  tryTake(): boolean
  readonly used: number
}

export function createPackPdfBudget(
  options: { limit?: number; timeBudgetMs?: number; now?: () => number } = {},
): PackPdfBudget {
  const limit = options.limit ?? PACK_TAX_INVOICE_PDF_LIMIT
  const budget = options.timeBudgetMs ?? PACK_TAX_INVOICE_PDF_TIME_BUDGET_MS
  const now = options.now ?? Date.now
  const startedAt = now()
  let used = 0
  return {
    tryTake(): boolean {
      if (used >= limit || now() - startedAt > budget) return false
      used += 1
      return true
    },
    get used(): number {
      return used
    },
  }
}

// ── 13_Advance_Returns.csv (ไฟล์ 15 — มติ PO 05/10/2569 U68 · จาก U30) ──────

/**
 * รับคืนเงินทดรอง (ลดลูกหนี้เงินทดรอง) · แถว = 1 แถวของ `advance_returns`
 * - `payout_offset` (หักกลบในรอบจ่าย) — วันที่ = วันจ่ายของรอบ (ตัวเดียวกับ `04_Payments.csv`) · `payout_batch_ref`
 *   = ตัวอ้างอิงรอบเดียวกับไฟล์ 04 · ยอดหักนี้คือส่วนต่างระหว่าง `amount_baht` กับ `transfer_baht` ของไฟล์ 04
 * - `cash` / `bank_transfer` (รับคืนแยก) — วันที่ = วันที่รับเงิน · `evidence_file` = ชื่อไฟล์หลักฐาน
 * - `status` = `active` / `reversed` (กลับรายการ — ยอดกลับเป็นค้าง) + วันที่/เหตุผลกลับรายการ
 */
export const ADVANCE_RETURN_HEADERS = [
  'return_date',
  'advance_ref',
  'payee',
  'amount_baht',
  'channel',
  'payout_batch_ref',
  'evidence_file',
  'status',
  'reversed_date',
  'reversal_reason',
  // มติ PO 06/10/2569 (O67 · U100) — ต่อท้ายสุด: เลขที่ใบรับคืนเงินทดรอง (RAV) ของแถว
  'return_number',
] as const

export type AdvanceReturnExportChannel = 'payout_offset' | 'cash' | 'bank_transfer'

export interface AdvanceReturnExportRow {
  returnDate: Date
  advanceRef: string
  payeeName: string
  amountSatang: number
  channel: AdvanceReturnExportChannel
  payoutBatchRef: string | null
  evidenceFilePath: string | null
  reversedAt: Date | null
  reversalReason: string | null
  /** เลขที่ใบรับคืนเงินทดรอง (RAV — มติ PO U102) · ข้อมูลเก่าในเทสต์ไม่ระบุ = `-` */
  returnNumber?: string | null
}

/** ชื่อไฟล์หลักฐาน (ไม่เปิดเผย path ใน bucket) */
export function evidenceFileName(path: string | null): string | null {
  if (path === null) return null
  const name = path.slice(path.lastIndexOf('/') + 1).trim()
  return name === '' ? null : name
}

export function advanceReturnCsv(rows: readonly AdvanceReturnExportRow[]): string {
  return buildCsv(
    ADVANCE_RETURN_HEADERS,
    rows.map((row) => {
      const reversed = row.reversedAt !== null
      return [
        csvDate(row.returnDate),
        row.advanceRef,
        row.payeeName,
        csvBaht(row.amountSatang),
        row.channel,
        row.channel === 'payout_offset' ? csvText(row.payoutBatchRef) : CSV_EMPTY,
        csvText(evidenceFileName(row.evidenceFilePath)),
        reversed ? 'reversed' : 'active',
        reversed ? csvDate(row.reversedAt) : CSV_EMPTY,
        reversed ? csvText(row.reversalReason) : CSV_EMPTY,
        csvText(row.returnNumber),
      ]
    }),
  )
}

// ── 14_Unbilled_Revenue.csv (ไฟล์ 19 — มติ PO 06/10/2569 U87) ──────────────

/**
 * รายได้ค้างรับ — รายได้ที่ `revenue_date` อยู่ในงวดหรือก่อนงวด และ **ณ เวลาสร้างชุด** ยังไม่อยู่ในรอบวางบิล
 * ที่ส่งลูกค้าแล้ว (ไม่ผูกรอบเลย หรืออยู่ในรอบที่ยังเป็นร่าง) · สำนักงานบัญชีใช้บันทึกรายได้ค้างรับตามเกณฑ์คงค้าง
 * (ภาษีขายยังไม่เกิดจนกว่าจะออกใบกำกับ — ยอด VAT ในไฟล์นี้เป็นยอดที่จะเรียกเก็บ ไม่ใช่ภาษีขายของงวด)
 * - `delivered_date` = `revenue_date` (วันยืนยันล็อตส่งมอบ — วันที่รายได้เกิด)
 * - `fee_model` = enum ดิบตามสคีมา (`SUCCESS_FEE`/`FLAT`/`HYBRID`) · `vat_rate_pct` = snapshot `vat_rate_pct_used`
 * - `billing_batch_number` = เลขรอบวางบิล**ร่าง**ที่รายการนี้อยู่ (ยังไม่ผูกรอบ ⇒ `-`)
 * - ยอดมาจาก snapshot ของรายได้ ไม่คำนวณใหม่
 */
export const UNBILLED_REVENUE_HEADERS = [
  'case_ref',
  'company',
  'company_tax_id',
  'delivered_date',
  'fee_model',
  'amount_before_vat_baht',
  'vat_baht',
  'total_baht',
  'vat_rate_pct',
  'billing_batch_number',
] as const

export interface UnbilledRevenueExportRow {
  caseRef: string
  companyName: string
  companyTaxId: string | null
  revenueDate: Date
  feeModel: string
  grossSatang: number
  vatSatang: number
  totalSatang: number
  /** snapshot `revenues.vat_rate_pct_used` (NUMERIC เป็นข้อความ) */
  vatRatePct: string
  /** เลขรอบวางบิลร่าง — `null` = ยังไม่ผูกรอบ */
  draftBillingBatchNumber: string | null
}

export function unbilledRevenueCsv(rows: readonly UnbilledRevenueExportRow[]): string {
  return buildCsv(
    UNBILLED_REVENUE_HEADERS,
    rows.map((row) => [
      row.caseRef,
      row.companyName,
      normalizeTaxId(row.companyTaxId) ?? CSV_EMPTY,
      csvDate(row.revenueDate),
      row.feeModel,
      csvBaht(row.grossSatang),
      csvBaht(row.vatSatang),
      csvBaht(row.totalSatang),
      vatRatesText([row.vatRatePct]),
      csvText(row.draftBillingBatchNumber),
    ]),
  )
}

// ── 15_Accrued_Expenses.csv (มติ PO 06/10/2569 U94 ข้อ 2) ────────────────────

/**
 * สถานะรายการเบิกที่นับเป็น "ค่าใช้จ่ายค้างจ่าย" — งานเกิดแล้ว รออนุมัติ/อนุมัติแล้ว แต่ยังไม่ได้จ่าย
 * (รอคลังยืนยัน · รออนุมัติ · รอการเงินอนุมัติ · อนุมัติแล้ว) · ไม่นับ `rejected`/`needs_revision`/`superseded`
 * (ยังไม่เป็นภาระที่แน่นอน/ถูกแทนแล้ว) — นิยามจุดเดียวคู่กับ `accruedExpenseWhere()`
 */
export const ACCRUED_EXPENSE_STATUSES = [
  'pending_warehouse_confirm',
  'pending_approval',
  'pending_finance_approval',
  'approved',
] as const satisfies readonly ExpenseStatus[]

/**
 * ค่าใช้จ่ายค้างจ่าย ณ สิ้นงวด — **ภาพ ณ เวลาสร้างชุด**: รายการที่วันที่ทำงาน ≤ สิ้นงวด และ ณ ตอนสร้างชุดยังไม่อยู่ใน
 * รอบจ่ายที่โอนแล้ว (`completed`) · `status` = enum ดิบ · `estimated_wht_baht` = ภาษีที่คาดว่าจะหัก (อยู่ในรอบจ่ายแล้ว =
 * ยอดของรอบ · ยังไม่เข้ารอบ = ประมาณด้วยสูตรเดียวกับรอบจ่าย ต่อผู้รับรวมทุกรายการค้าง · ประมาณไม่ได้ = `-`) ·
 * `payout_batch_ref` = รอบจ่ายที่ยังไม่โอน (ร่าง/ตรวจ/สร้างไฟล์แล้ว) ที่รายการนี้อยู่ · ไม่อยู่รอบใด = `-`
 */
export const ACCRUED_EXPENSE_HEADERS = [
  'expense_id',
  'payee',
  'payee_tax_id',
  'category',
  'case_ref',
  'work_date',
  'status',
  'gross_baht',
  'estimated_wht_baht',
  'payout_batch_ref',
] as const

export interface AccruedExpenseExportRow {
  expenseId: string
  payeeName: string
  payeeTaxId: string | null
  category: string
  caseRef: string | null
  workDate: Date
  status: ExpenseStatus
  grossSatang: number
  /** `null` = ประมาณไม่ได้ (เช่น ผู้รับ 40(1)/40(2) ที่ยังไม่มีอัตรา) */
  estimatedWhtSatang: number | null
  payoutBatchRef: string | null
}

export function accruedExpenseCsv(rows: readonly AccruedExpenseExportRow[]): string {
  return buildCsv(
    ACCRUED_EXPENSE_HEADERS,
    rows.map((row) => [
      row.expenseId,
      row.payeeName,
      normalizeTaxId(row.payeeTaxId) ?? CSV_EMPTY,
      row.category,
      csvText(row.caseRef),
      csvDate(row.workDate),
      row.status,
      csvBaht(row.grossSatang),
      row.estimatedWhtSatang === null ? CSV_EMPTY : csvBaht(row.estimatedWhtSatang),
      csvText(row.payoutBatchRef),
    ]),
  )
}

// ── 16_Advance_Balance.csv (มติ PO 06/10/2569 U94 ข้อ 3) ────────────────────

/**
 * เงินทดรองต่อคน (ลูกหนี้เงินทดรอง) · `opening + paid − cleared − returned_offset − returned_direct = closing`
 * ทุกแถว (คำนวณที่ `lib/exports/advance-balance.ts`) · `advance_refs` = เลขที่ใบ (`ADV-…`) ที่มียอดหรือเคลื่อนไหว
 * คั่นด้วยช่องว่าง
 */
export const ADVANCE_BALANCE_HEADERS = [
  'payee',
  'payee_tax_id',
  'opening_baht',
  'paid_baht',
  'cleared_baht',
  'returned_offset_baht',
  'returned_direct_baht',
  'closing_baht',
  'advance_refs',
] as const

export interface AdvanceBalanceExportRow {
  payeeName: string
  payeeTaxId: string | null
  openingSatang: number
  paidSatang: number
  clearedSatang: number
  returnedOffsetSatang: number
  returnedDirectSatang: number
  closingSatang: number
  advanceRefs: readonly string[]
}

export function advanceBalanceCsv(rows: readonly AdvanceBalanceExportRow[]): string {
  return buildCsv(
    ADVANCE_BALANCE_HEADERS,
    rows.map((row) => [
      row.payeeName,
      normalizeTaxId(row.payeeTaxId) ?? CSV_EMPTY,
      csvBaht(row.openingSatang),
      csvBaht(row.paidSatang),
      csvBaht(row.clearedSatang),
      csvBaht(row.returnedOffsetSatang),
      csvBaht(row.returnedDirectSatang),
      csvBaht(row.closingSatang),
      row.advanceRefs.length === 0 ? CSV_EMPTY : row.advanceRefs.join(' '),
    ]),
  )
}

// ── 17_Company_Documents.csv (มติ PO 07/10/2569 U132) ───────────────────────

export const COMPANY_DOCUMENT_HEADERS = [
  'company',
  'company_tax_id',
  'document_type',
  'document_name',
  'version',
  'issued_date',
  'original_name',
  'file_sha256',
  'uploaded_at',
  'company_warnings',
] as const

/** หนึ่งแถว = เอกสารเวอร์ชันปัจจุบัน 1 ชิ้น · บริษัทที่ยังไม่มีเอกสารเลยได้ 1 แถว (ช่องเอกสารเป็น `-`) */
export interface CompanyDocumentExportRow {
  companyName: string
  companyTaxId: string
  /** enum `company_document_type` — null = บริษัทที่ยังไม่มีเอกสาร */
  documentType: string | null
  documentName: string | null
  version: number | null
  issuedDate: Date | null
  originalName: string | null
  fileSha256: string | null
  uploadedAt: Date | null
  /** ข้อความเตือนของบริษัท (ไม่บล็อก) — คั่นด้วย ` | ` */
  warnings: readonly string[]
}

export function companyDocumentCsv(rows: readonly CompanyDocumentExportRow[]): string {
  return buildCsv(
    COMPANY_DOCUMENT_HEADERS,
    rows.map((row) => [
      row.companyName,
      normalizeTaxId(row.companyTaxId) ?? CSV_EMPTY,
      csvText(row.documentType),
      csvText(row.documentName),
      row.version === null ? CSV_EMPTY : String(row.version),
      csvDate(row.issuedDate),
      csvText(row.originalName),
      csvText(row.fileSha256),
      csvDate(row.uploadedAt),
      row.warnings.length === 0 ? CSV_EMPTY : row.warnings.join(' | '),
    ]),
  )
}

// ── 18_Bank_Fee_Write_Offs.csv (มติ PO 07/10/2569 U144) ─────────────────────

export const BANK_FEE_WRITE_OFF_HEADERS = [
  'write_off_date',
  'company',
  'company_tax_id',
  'billing_ref',
  'billed_total_baht',
  'received_baht',
  'customer_wht_baht',
  'bank_fee_baht',
] as const

/** หนึ่งแถว = รอบวางบิล 1 รอบที่ตัดส่วนต่างเป็นค่าธรรมเนียมธนาคาร (วันที่ตัดอยู่ในงวด) */
export interface BankFeeWriteOffExportRow {
  writeOffDate: Date
  companyName: string
  companyTaxId: string
  /** เลขรอบวางบิล `BL-…` */
  billingRef: string
  billedTotalSatang: number
  receivedSatang: number
  customerWhtSatang: number
  bankFeeSatang: number
}

export function bankFeeWriteOffCsv(rows: readonly BankFeeWriteOffExportRow[]): string {
  return buildCsv(
    BANK_FEE_WRITE_OFF_HEADERS,
    rows.map((row) => [
      csvDate(row.writeOffDate),
      row.companyName,
      normalizeTaxId(row.companyTaxId) ?? CSV_EMPTY,
      row.billingRef,
      csvBaht(row.billedTotalSatang),
      csvBaht(row.receivedSatang),
      csvBaht(row.customerWhtSatang),
      csvBaht(row.bankFeeSatang),
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

/**
 * สถานะเอกสารในไฟล์ 08 · `อนุญาตปิดงวด — ยังรอเอกสาร` = exception ที่ผู้บริหารอนุญาตให้ปิดงวด (`authorized`)
 * **ยังไม่ใช่แก้จริง** ต้องแยกจาก "ครบถ้วน" เสมอ (มติ PO 05/10/2569 UAT U31 · BUG-129)
 */
export const CHECKLIST_AUTHORIZED_PENDING = 'อนุญาตปิดงวด — ยังรอเอกสาร'

export type ChecklistDocStatus = 'ครบถ้วน' | 'ขาดเอกสาร' | 'รอตรวจสอบ' | typeof CHECKLIST_AUTHORIZED_PENDING

export interface ChecklistExportRow {
  sourceModule: string
  sourceRef: string | null
  level: ExceptionLevel
  status: ExceptionStatus
  title: string
  /** ผู้รับผิดชอบ = ผู้ที่ปิดรายการแล้ว ถ้ายังไม่ปิดคือผู้บันทึก (สคีมาไม่มีคอลัมน์ผู้รับผิดชอบแยก) */
  responsibleName: string | null
  /** `exceptions.authorize_note` — เหตุผลที่ผู้บริหารอนุญาตปิดงวด (เฉพาะ `authorized`) */
  authorizeNote?: string | null
}

/**
 * สถานะเอกสารของแต่ละแถว (`34` §6.1) — แปลงจากสถานะ+ระดับของ Exception:
 * แก้แล้ว (`resolved`) = ครบถ้วน · อนุญาตปิดงวด (`authorized`) = **อนุญาตปิดงวด — ยังรอเอกสาร**
 * (ไม่นับว่าครบ — มติ PO 05/10/2569 UAT U31 · `34` §6.3 แยก authorized จาก resolved เสมอ) ·
 * critical ที่ยังเปิด = ขาดเอกสาร · ที่เหลือ = รอตรวจสอบ
 */
export function checklistDocStatus(row: {
  level: ExceptionLevel
  status: ExceptionStatus
}): ChecklistDocStatus {
  if (row.status === 'resolved') return 'ครบถ้วน'
  if (row.status === 'authorized') return CHECKLIST_AUTHORIZED_PENDING
  return row.level === 'critical' ? 'ขาดเอกสาร' : 'รอตรวจสอบ'
}

/** หัวข้อ exception — แถวที่อนุญาตปิดงวดต่อท้ายเหตุผลที่อนุญาต ให้สำนักงานบัญชีรู้ว่ายังรอเอกสารอะไร (U31) */
function checklistSummaryText(row: ChecklistExportRow): string {
  const note = (row.authorizeNote ?? '').trim()
  if (row.status !== 'authorized' || note === '') return row.title
  return `${row.title} (อนุญาตปิดงวด: ${note})`
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
      // UAT BUG-123 — แถวที่ปิดแล้วยังต้องบอกหัวข้อ ไม่งั้นสำนักงานบัญชีไม่รู้ว่าเคยขาดอะไร
      checklistSummaryText(row),
      row.responsibleName ?? CSV_EMPTY,
    ]
  })
}

export interface ChecklistSummary {
  complete: number
  missingCritical: number
  pending: number
  /** อนุญาตปิดงวดแต่ยังรอเอกสาร — นับแยก ไม่รวมใน "ครบถ้วน" (U31) */
  authorizedPending: number
}

export function checklistSummary(rows: readonly ChecklistExportRow[]): ChecklistSummary {
  const summary: ChecklistSummary = { complete: 0, missingCritical: 0, pending: 0, authorizedPending: 0 }
  for (const row of rows) {
    const status = checklistDocStatus(row)
    if (status === 'ครบถ้วน') summary.complete += 1
    else if (status === 'ขาดเอกสาร') summary.missingCritical += 1
    else if (status === CHECKLIST_AUTHORIZED_PENDING) summary.authorizedPending += 1
    else summary.pending += 1
  }
  return summary
}

export const CHECKLIST_FOOTER_NOTE =
  'หมายเหตุ: ห้าม Export Accounting Pack ถ้ายังมีรายการ Critical เปิดอยู่ (Readiness Check)'

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
      `จัดทำโดย ${input.generatedByName} ` +
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
    [CHECKLIST_AUTHORIZED_PENDING, String(summary.authorizedPending)],
    [],
    [CHECKLIST_FOOTER_NOTE],
  ]
}

// ── หน้าปก (`reference/samples/07_accounting_pack_cover.pdf`) ────────────────

export interface PackCoverFileRow {
  fileName: string
  description: string
  /** จำนวนแถวข้อมูลของไฟล์ (ตัวเดียวกับ `00_Control_Totals.csv`) — ข้อความพร้อมพิมพ์ · ไม่ทราบ = `-` */
  rowCountText: string
}

/** ยอดสรุปบนหน้าปก (มติ U94 ข้อ 4) — ค่าเดียวกับแถว `summary` ของ `00_Control_Totals.csv` */
export interface PackCoverTotalRow {
  label: string
  amountText: string
}

/** ข้อมูลยอดรวมควบคุมที่หน้าปกต้องใช้ — ประกอบจากชุดข้อมูลเดียวกับที่เขียนไฟล์ (`lib/exports/control-totals.ts`) */
export interface PackCoverControlTotals {
  /** จำนวนแถวต่อชื่อไฟล์ */
  rowCounts: Readonly<Record<string, number>>
  summary: readonly { label: string; amountSatang: number }[]
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
  /** SHA-256 ของ **เนื้อไฟล์ข้อมูล 00–18** (คำนวณซ้ำจากไฟล์ในชุดนี้ได้ — ดู `packContentDigest()`) */
  contentDigest: string
  /** ป้ายช่วงไฟล์ที่ digest ครอบคลุม เช่น `00–18` — มาจาก `PACK_FILES` ไม่พิมพ์ตายตัวใน component */
  fileRangeLabel: string
  checks: readonly { label: string; passed: boolean }[]
  files: readonly PackCoverFileRow[]
  /** ยอดสรุปของงวด (U94 ข้อ 4) — ว่าง = ไม่แสดงตาราง */
  totals: readonly PackCoverTotalRow[]
  /** หมายเหตุโฟลเดอร์ PDF ใน zip */
  attachmentNote: string
  fileName: string
}

/** ช่วงเลขไฟล์ข้อมูลในชุด เช่น `00–18` */
export function packFileRangeLabel(): string {
  const first = PACK_FILES[0]?.no ?? ''
  const last = PACK_FILES.at(-1)?.no ?? ''
  return `${first}–${last}`
}

/**
 * ⚠️ ข้อความที่พิมพ์ลง PDF ต้องใช้อักษรที่ฟอนต์ไทยมีเท่านั้น — ลูกศร (⇒ →) / เครื่องหมายถูก-ผิด ไม่มี glyph
 *    แล้วพิมพ์เป็นสัญลักษณ์เพี้ยนทับตัวถัดไป (UAT BUG-166 · เทสต์ `components/pdf/font-glyphs.test.ts`)
 */
export const PACK_ATTACHMENT_NOTE =
  `สำเนา PDF ใน zip: ${PACK_TAX_INVOICE_PDF_DIR}/ (ใบเสร็จรับเงิน/ใบกำกับภาษี) · ${PACK_WHT_CERTIFICATE_PDF_DIR}/ (50 ทวิ) · ` +
  `${PACK_VOUCHER_PDF_DIR}/ (ใบสำคัญจ่าย/สลิปค่าตอบแทน) · ${PACK_BILLING_INVOICE_PDF_DIR}/ (ใบแจ้งหนี้ — ไม่ใช่เอกสารภาษี) · ` +
  `เกินเพดานต่อชุด ดูรายชื่อใน NOT_ATTACHED.txt ของแต่ละโฟลเดอร์`

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
  /** มติ U94 ข้อ 4 — ไม่ส่ง = ไม่มีจำนวนแถว/ตารางยอดสรุป (เทสต์เก่า) */
  controlTotals?: PackCoverControlTotals
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
    fileRangeLabel: packFileRangeLabel(),
    checks: input.checks.map((check) => ({ label: check.label, passed: check.passed })),
    files: PACK_FILES.map((file) => {
      const count = input.controlTotals?.rowCounts[file.fileName]
      return {
        fileName: file.fileName,
        description: file.description,
        rowCountText: count === undefined ? CSV_EMPTY : count.toLocaleString('en-US'),
      }
    }),
    totals: (input.controlTotals?.summary ?? []).map((line) => ({
      label: line.label,
      amountText: fmtSatang(line.amountSatang),
    })),
    attachmentNote: PACK_ATTACHMENT_NOTE,
    fileName: PACK_COVER_FILE_NAME,
  }
}

/**
 * จำนวน PDF ที่แนบใน zip จริง — รวม `attached` ทุกโฟลเดอร์จาก `attachments` ที่บันทึกใน audit `export`
 * ตอนสร้างชุด (UAT BUG-167: ประวัติเคยแสดง "เอกสารแนบ 0 ไฟล์" ตายตัว) · ค่าที่อ่านไม่ออก = 0
 * (`NOT_ATTACHED.txt` ไม่ใช่เอกสารแนบ — ไม่นับ)
 */
export function packAttachmentCount(attachments: unknown): number {
  if (attachments === null || typeof attachments !== 'object' || Array.isArray(attachments)) return 0
  let total = 0
  for (const folder of Object.values(attachments as Record<string, unknown>)) {
    if (folder === null || typeof folder !== 'object') continue
    const attached = (folder as { attached?: unknown }).attached
    if (typeof attached === 'number' && Number.isInteger(attached) && attached > 0) total += attached
  }
  return total
}
