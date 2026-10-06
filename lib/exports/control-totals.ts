import { payoutTransferSatang } from '@/lib/finance/advance-offset-calc'
import { buildCsv, csvBaht, CSV_EMPTY } from '@/lib/exports/csv'
import {
  packFileName,
  type AccruedExpenseExportRow,
  type AdjustmentExportRow,
  type AdvanceBalanceExportRow,
  type AdvanceReturnExportRow,
  type BankReconExportRow,
  type CashReceiptExportRow,
  type ChecklistExportRow,
  type CreditNoteExportRow,
  type CustomerWhtExportRow,
  type ExpenseExportRow,
  type PackCoverControlTotals,
  type PaymentExportRow,
  type RevenueExportRow,
  type SuspenseExportRow,
  type TaxInvoiceExportRow,
  type UnbilledRevenueExportRow,
  type WhtExportRow,
} from '@/lib/exports/pack'
import { sumSatang } from '@/lib/finance/satang'
import { isPayerBorneWhtCondition, payoutItemTaxSplit } from '@/lib/finance/wht-calc'
import { fmtDateTime } from '@/lib/format/datetime'

/**
 * `00_Control_Totals.csv` + ตารางยอดสรุปบนหน้าปก (มติ PO 06/10/2569 U94 ข้อ 4) — **pure ล้วน ไม่มี I/O**
 *
 * - คำนวณจาก **แถวชุดเดียวกับที่เขียนไฟล์ 01–16** (ผู้เรียกส่ง export rows ตัวเดียวกับที่ส่งเข้า `xxxCsv()`) ⇒
 *   ยอดในไฟล์ 00 ตรงกับผลรวมคอลัมน์ของไฟล์เสมอ ไม่มี query แยก
 * - `section = file`: ต่อไฟล์ = จำนวนแถว + ผลรวม**ดิบ**ของคอลัมน์เงินหลัก (รวมทุกแถวในไฟล์ ไม่กรองสถานะ — ใช้ตรวจว่า
 *   ไฟล์ครบ/ไม่ถูกแก้) · ไฟล์ที่มีหลายคอลัมน์เงินมีหลายบรรทัด · ไม่มีคอลัมน์เงิน ⇒ `item = -`
 * - `section = summary`: ยอดสรุปของงวดตามความหมายทางบัญชี (กรองสถานะ/วันที่ตามคำอธิบายของแต่ละบรรทัด)
 * - `section = meta`: เวลาที่สร้างชุด — ไฟล์ 11/14/15/16 เป็นภาพ ณ เวลานี้
 */

export const CONTROL_TOTALS_HEADERS = ['section', 'file', 'item', 'description', 'row_count', 'amount_baht'] as const

export type ControlTotalSection = 'meta' | 'file' | 'summary'

export interface ControlTotalLine {
  section: ControlTotalSection
  /** ชื่อไฟล์ต้นทาง · meta = `-` */
  file: string
  /** ชื่อคอลัมน์ (file) / รหัสยอดสรุป (summary) / `generated_at` (meta) */
  item: string
  description: string
  rowCount: number | null
  amountSatang: number | null
}

export interface ControlTotalsInput {
  /** ช่วงวันของงวด (date-only UTC) */
  period: { start: Date; end: Date }
  generatedAt: Date
  revenue: readonly RevenueExportRow[]
  cashReceipts: readonly CashReceiptExportRow[]
  expenses: readonly ExpenseExportRow[]
  payments: readonly PaymentExportRow[]
  wht: readonly WhtExportRow[]
  bank: readonly BankReconExportRow[]
  adjustments: readonly AdjustmentExportRow[]
  checklist: readonly ChecklistExportRow[]
  creditNotes: readonly CreditNoteExportRow[]
  customerWht: readonly CustomerWhtExportRow[]
  suspense: readonly SuspenseExportRow[]
  taxInvoices: readonly TaxInvoiceExportRow[]
  advanceReturns: readonly AdvanceReturnExportRow[]
  unbilledRevenue: readonly UnbilledRevenueExportRow[]
  accruedExpenses: readonly AccruedExpenseExportRow[]
  advanceBalances: readonly AdvanceBalanceExportRow[]
}

function sum(values: readonly number[]): number {
  return sumSatang(values, 'ยอดรวมควบคุม')
}

function inPeriod(date: Date, period: { start: Date; end: Date }): boolean {
  return date >= period.start && date < period.end
}

/** รหัส + ป้ายยอดสรุปของงวด — ลำดับตามมติ U94 ข้อ 4 */
export const CONTROL_SUMMARY_ITEMS = {
  revenue_before_vat: 'รายได้ก่อน VAT (รายได้ที่รับรู้ในงวด)',
  output_vat_documents: 'VAT ขาย ตามใบเสร็จรับเงิน/ใบกำกับภาษีที่ลงวันที่ในงวด (ไม่รวมใบที่ยกเลิก)',
  output_vat_credit_debit_notes: 'ปรับ VAT ขาย ตามใบเพิ่มหนี้ − ใบลดหนี้ที่ลงวันที่ในงวด (ไม่รวมใบที่ยกเลิก)',
  cash_received: 'รับเงินจากลูกค้า',
  customer_wht: 'ภาษีที่ลูกค้าหัก ณ ที่จ่าย (รับเงินในงวด)',
  payout_transfer: 'จ่ายออก (ยอดโอนจริง หลังหักคืนเงินทดรอง)',
  // มติ PO 06/10/2569 U114 (BUG-177) — แยกภาษีที่หักจากผู้รับ / บริษัทออกให้ / รวมต้องนำส่ง
  wht_withheld: 'ภาษีหัก ณ ที่จ่าย — หักจากผู้รับ (ใบ 50 ทวิ ที่มีผล)',
  wht_paid_by_payer: 'ภาษีหัก ณ ที่จ่าย — บริษัทออกให้ (ไม่ได้หักจากผู้รับ)',
  wht_remit_total: 'ภาษีหัก ณ ที่จ่าย — รวมต้องนำส่ง',
  accrued_expenses: 'ค่าใช้จ่ายค้างจ่าย (ยอดก่อนหักภาษี — ภาพ ณ เวลาสร้างชุด)',
  unbilled_revenue: 'รายได้ค้างรับ (ยอดก่อน VAT — ภาพ ณ เวลาสร้างชุด)',
  suspense_outstanding: 'เงินรับรอตรวจสอบคงค้าง (ภาพ ณ เวลาสร้างชุด)',
  advance_balance: 'เงินทดรองคงเหลือสิ้นงวด',
} as const

export type ControlSummaryItem = keyof typeof CONTROL_SUMMARY_ITEMS

export function buildControlTotals(input: ControlTotalsInput): ControlTotalLine[] {
  const lines: ControlTotalLine[] = []
  const meta = (item: string, description: string): void => {
    lines.push({ section: 'meta', file: CSV_EMPTY, item, description, rowCount: null, amountSatang: null })
  }
  const file = (no: string, rowCount: number, columns: readonly [string, number][]): void => {
    const fileName = packFileName(no)
    if (columns.length === 0) {
      lines.push({ section: 'file', file: fileName, item: CSV_EMPTY, description: 'จำนวนแถว', rowCount, amountSatang: null })
      return
    }
    for (const [column, amount] of columns) {
      lines.push({ section: 'file', file: fileName, item: column, description: `ผลรวมคอลัมน์ ${column}`, rowCount, amountSatang: amount })
    }
  }
  const summary = (no: string, item: ControlSummaryItem, rowCount: number, amount: number): void => {
    lines.push({ section: 'summary', file: packFileName(no), item, description: CONTROL_SUMMARY_ITEMS[item], rowCount, amountSatang: amount })
  }

  meta('generated_at', `ภาพข้อมูล ณ เวลาสร้างชุด ${fmtDateTime(input.generatedAt)} น.`)

  // ── ต่อไฟล์ ────────────────────────────────────────────────────────────────
  const r = input
  file('01', r.revenue.length, [['gross_baht', sum(r.revenue.map((row) => row.grossSatang))]])
  file('02', r.cashReceipts.length, [['amount_baht', sum(r.cashReceipts.map((row) => row.amountSatang))]])
  file('03', r.expenses.length, [
    ['gross_baht', sum(r.expenses.map((row) => row.grossSatang))],
    ['wht_baht', sum(r.expenses.map((row) => row.whtSatang))],
    ['net_baht', sum(r.expenses.map((row) => row.netSatang))],
  ])
  const transfers = r.payments.map((row) => payoutTransferSatang(row.netSatang, row.advanceOffsetSatang))
  file('04', r.payments.length, [
    ['amount_baht', sum(r.payments.map((row) => row.netSatang))],
    ['advance_offset_baht', sum(r.payments.map((row) => row.advanceOffsetSatang))],
    ['transfer_baht', sum(transfers)],
  ])
  file('05', r.wht.length, [
    ['gross_baht', sum(r.wht.map((row) => row.grossSatang))],
    ['wht_baht', sum(r.wht.map((row) => row.whtSatang))],
  ])
  file('06', r.bank.length, [
    ['amount_baht[credit]', sum(r.bank.filter((row) => row.amountSatang >= 0).map((row) => row.amountSatang))],
    ['amount_baht[debit]', sum(r.bank.filter((row) => row.amountSatang < 0).map((row) => -row.amountSatang))],
  ])
  file('07', r.adjustments.length, [['amount_baht', sum(r.adjustments.map((row) => row.signedSatang))]])
  file('08', r.checklist.length, [])
  file('09', r.creditNotes.length, [
    ['amount_before_vat_baht', sum(r.creditNotes.map((row) => row.amountBeforeVatSatang))],
    ['vat_baht', sum(r.creditNotes.map((row) => row.vatSatang))],
    ['total_baht', sum(r.creditNotes.map((row) => row.totalSatang))],
  ])
  file('10', r.customerWht.length, [['withheld_baht', sum(r.customerWht.map((row) => row.withheldSatang))]])
  file('11', r.suspense.length, [['amount_baht', sum(r.suspense.map((row) => Math.abs(row.amountSatang)))]])
  file('12', r.taxInvoices.length, [
    ['amount_before_vat_baht', sum(r.taxInvoices.map((row) => row.amountBeforeVatSatang))],
    ['vat_baht', sum(r.taxInvoices.map((row) => row.vatSatang))],
    ['total_baht', sum(r.taxInvoices.map((row) => row.totalSatang))],
  ])
  file('13', r.advanceReturns.length, [['amount_baht', sum(r.advanceReturns.map((row) => row.amountSatang))]])
  file('14', r.unbilledRevenue.length, [
    ['amount_before_vat_baht', sum(r.unbilledRevenue.map((row) => row.grossSatang))],
    ['vat_baht', sum(r.unbilledRevenue.map((row) => row.vatSatang))],
    ['total_baht', sum(r.unbilledRevenue.map((row) => row.totalSatang))],
  ])
  file('15', r.accruedExpenses.length, [
    ['gross_baht', sum(r.accruedExpenses.map((row) => row.grossSatang))],
    ['estimated_wht_baht', sum(r.accruedExpenses.map((row) => row.estimatedWhtSatang ?? 0))],
  ])
  file('16', r.advanceBalances.length, [
    ['opening_baht', sum(r.advanceBalances.map((row) => row.openingSatang))],
    ['paid_baht', sum(r.advanceBalances.map((row) => row.paidSatang))],
    ['cleared_baht', sum(r.advanceBalances.map((row) => row.clearedSatang))],
    ['returned_offset_baht', sum(r.advanceBalances.map((row) => row.returnedOffsetSatang))],
    ['returned_direct_baht', sum(r.advanceBalances.map((row) => row.returnedDirectSatang))],
    ['closing_baht', sum(r.advanceBalances.map((row) => row.closingSatang))],
  ])

  // ── ยอดสรุปของงวด ───────────────────────────────────────────────────────────
  summary('01', 'revenue_before_vat', r.revenue.length, sum(r.revenue.map((row) => row.grossSatang)))
  const docs = r.taxInvoices.filter((row) => row.status === 'active' && inPeriod(row.invoiceDate, r.period))
  summary('12', 'output_vat_documents', docs.length, sum(docs.map((row) => row.vatSatang)))
  const notes = r.creditNotes.filter((row) => row.status === 'active' && inPeriod(row.issueDate, r.period))
  summary(
    '09',
    'output_vat_credit_debit_notes',
    notes.length,
    sum(notes.map((row) => (row.documentType === 'DN' ? row.vatSatang : -row.vatSatang))),
  )
  summary('02', 'cash_received', r.cashReceipts.length, sum(r.cashReceipts.map((row) => row.amountSatang)))
  const withheld = r.customerWht.filter((row) => inPeriod(row.withheldDate, r.period))
  summary('10', 'customer_wht', withheld.length, sum(withheld.map((row) => row.withheldSatang)))
  summary('04', 'payout_transfer', r.payments.length, sum(transfers))
  // U114: แยกตามเงื่อนไขการหักผ่าน `payoutItemTaxSplit()` (ไม่คิดภาษีใหม่) · ไฟล์ 05 เก็บ gross ของ (2)/(3) = เงินได้ + ภาษี
  const whtSplits = r.wht.map((row) =>
    payoutItemTaxSplit({
      grossSatang: row.grossSatang,
      whtSatang: row.whtSatang,
      netSatang: row.grossSatang - row.whtSatang,
      whtCondition: row.whtCondition,
    }),
  )
  const payerBorneCount = r.wht.filter((row) => isPayerBorneWhtCondition(row.whtCondition)).length
  summary('05', 'wht_withheld', r.wht.length - payerBorneCount, sum(whtSplits.map((split) => split.whtWithheldSatang)))
  summary('05', 'wht_paid_by_payer', payerBorneCount, sum(whtSplits.map((split) => split.whtPaidByPayerSatang)))
  summary('05', 'wht_remit_total', r.wht.length, sum(r.wht.map((row) => row.whtSatang)))
  summary('15', 'accrued_expenses', r.accruedExpenses.length, sum(r.accruedExpenses.map((row) => row.grossSatang)))
  summary('14', 'unbilled_revenue', r.unbilledRevenue.length, sum(r.unbilledRevenue.map((row) => row.grossSatang)))
  const open = r.suspense.filter((row) => row.matchStatus === 'suspense')
  summary('11', 'suspense_outstanding', open.length, sum(open.map((row) => Math.abs(row.amountSatang))))
  summary('16', 'advance_balance', r.advanceBalances.length, sum(r.advanceBalances.map((row) => row.closingSatang)))

  return lines
}

export function controlTotalsCsv(lines: readonly ControlTotalLine[]): string {
  return buildCsv(
    CONTROL_TOTALS_HEADERS,
    lines.map((line) => [
      line.section,
      line.file,
      line.item,
      line.description,
      line.rowCount === null ? CSV_EMPTY : String(line.rowCount),
      line.amountSatang === null ? CSV_EMPTY : csvBaht(line.amountSatang),
    ]),
  )
}

/** ข้อมูลสำหรับหน้าปก — จำนวนแถวต่อไฟล์ (รวม 00 เอง) + ยอดสรุปของงวด (ค่าเดียวกับแถว `summary`) */
export function controlTotalsForCover(lines: readonly ControlTotalLine[]): PackCoverControlTotals {
  const rowCounts: Record<string, number> = {}
  for (const line of lines) {
    if (line.section === 'file' && line.rowCount !== null) rowCounts[line.file] = line.rowCount
  }
  rowCounts[packFileName('00')] = lines.length
  return {
    rowCounts,
    summary: lines
      .filter((line) => line.section === 'summary')
      .map((line) => ({ label: line.description, amountSatang: line.amountSatang ?? 0 })),
  }
}
