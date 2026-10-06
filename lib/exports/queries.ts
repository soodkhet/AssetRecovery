import { randomUUID } from 'node:crypto'
import { renderPackCover } from '@/components/pdf/pack-cover'
import { renderTaxInvoice } from '@/components/pdf/tax-invoice'
import { assertExportNotBlocked } from '@/lib/accounting/exception'
import { payoutItemTaxSplit } from '@/lib/finance/wht-calc'
import {
  accruedExpenseWhere,
  findPeriodById,
  getPeriodReadiness,
  unbilledRevenueWhere,
  type AccountingMutationContext,
} from '@/lib/accounting/queries'
import { emitAudit } from '@/lib/audit/audit'
import type { SessionUser } from '@/lib/auth/types'
import { buildChecklistWorkbook } from '@/lib/exports/checklist-excel'
import { ExportError } from '@/lib/exports/errors'
import {
  accruedExpenseCsv,
  adjustmentCsv,
  adjustmentRef,
  advanceBalanceCsv,
  companyDocumentCsv,
  type CompanyDocumentExportRow,
  advanceReturnCsv,
  bankReconCsv,
  buildPackCoverDoc,
  canTransitionExport,
  cashReceiptCsv,
  createPackPdfBudget,
  creditNoteCsv,
  customerWhtCsv,
  expenseCsv,
  exportVersionLabel,
  packAttemptId,
  packFileName,
  packNotAttachedFile,
  packNotAttachedText,
  packPdfEntryName,
  packPdfRef,
  packStoragePath,
  packZipDownloadName,
  packZipFileName,
  paymentCsv,
  payeesMissingTaxId,
  revenueCsv,
  suspenseCsv,
  taxInvoiceCsv,
  taxInvoiceNotAttachedText,
  taxInvoicePdfEntryName,
  unbilledRevenueCsv,
  whtCsv,
  EXPORT_STATUS_GROUP,
  EXPORT_STATUS_LABEL,
  packAttachmentCount,
  PACK_BILLING_INVOICE_PDF_DIR,
  PACK_COVER_FILE_NAME,
  PACK_COVER_KEY,
  PACK_TAX_INVOICE_NOT_ATTACHED_FILE,
  PACK_VOUCHER_PDF_DIR,
  PACK_WHT_CERTIFICATE_PDF_DIR,
  PACK_ZIP_KEY,
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
  type MatchedType,
  type PackPdfBudget,
  type PaymentExportRow,
  type RevenueExportRow,
  type SuspenseExportRow,
  type TaxInvoiceExportRow,
  type UnbilledRevenueExportRow,
  type WhtExportRow,
  whtReversalRow,
} from '@/lib/exports/pack'
import { estimateAccruedWhtSatang } from '@/lib/exports/accrued-expenses'
import { loadTaxProfileDefaults } from '@/lib/settings/queries/tax-profile-defaults'
import { pickTaxProfileDefault } from '@/lib/settings/tax-profile-defaults'
import { advanceBalanceRows, type AdvanceBalanceEntry } from '@/lib/exports/advance-balance'
import { buildControlTotals, controlTotalsCsv, controlTotalsForCover } from '@/lib/exports/control-totals'
import { renderBillingInvoice } from '@/components/pdf/billing-invoice'
import { renderPaymentVouchers } from '@/components/pdf/payment-voucher'
import { renderPayslips } from '@/components/pdf/payslip'
import { renderWhtCertificate } from '@/components/pdf/wht-certificate'
import {
  billingInvoiceLetterhead,
  billingInvoiceTemplate,
  createLetterheadResolver,
  currentLetterhead,
  taxInvoiceLetterhead,
  taxInvoiceTemplate,
} from '@/lib/organization/letterhead'
import { buildBillingInvoiceDoc } from '@/lib/revenue/billing-invoice'
import { getBillingInvoiceSource } from '@/lib/revenue/billing-invoice-queries'
import { buildPaymentVoucherDocs, buildPayslipDocs } from '@/lib/payout/payout-doc'
import { resolvePayoutSide } from '@/lib/payout/payout'
import { getPayoutDocSource } from '@/lib/payout/queries'
import { resolveWhtPolicyForPayout } from '@/lib/settings/queries/wht-policy'
import { getWhtCertificateDocSource } from '@/lib/wht/queries'
import { buildWhtCertificateDoc } from '@/lib/wht/wht'
import {
  downloadPackFile,
  packContentDigest,
  removePackFiles,
  sha256Hex,
  uploadPackFile,
} from '@/lib/exports/pack-storage'
import type { ExportHistoryListQuery, ExportPackInput, ExportStatusInput } from '@/lib/exports/schemas'
import type { ExportHistoryListDto, ExportRecordDto } from '@/lib/exports/types'
import { buildZip, type ZipEntry } from '@/lib/exports/zip'
import { expenseCategoryOf } from '@/lib/expenses/expense-record'
import { signedAdjustmentSatang } from '@/lib/adjustments/adjustment'
import { CREDIT_NOTE_DOCUMENT_CODE } from '@/lib/credit-notes/credit-note'
import { Prisma, type ExportRecordStatus } from '@/lib/generated/prisma/client'
import { parseBillingPeriodLabel } from '@/lib/revenue/revenue'
import { parseOrganizationLetterheadSnapshot } from '@/lib/organization/profile'
import { prisma } from '@/lib/prisma'
import { companyDocumentWarningsFor } from '@/lib/finance-companies/document-queries'
import { COMPANY_DOCUMENT_LABEL, currentCompanyDocuments } from '@/lib/finance-companies/documents'
import { startOfBangkokDay } from '@/lib/format/datetime'
import { assertOrgWideReadable } from '@/lib/auth/scope'
import { customerWhtExportSources } from '@/lib/customer-wht/queries'
import { TAX_INVOICE_DOC_KIND_TITLE } from '@/lib/sales/receipt-invoice'
import { buildTaxInvoiceDoc } from '@/lib/sales/sales'
import { taxInvoicesForPack } from '@/lib/sales/queries'

/**
 * Accounting Pack Export (ไฟล์ 37) — ชั้น DB + ตัวประกอบชุดเอกสาร (`37` §14)
 *
 * ### กติกาที่ห้ามหลุด
 * - **บล็อกเมื่อมี critical exception ที่ยัง `open`** ผ่าน `assertExportNotBlocked()` ของ 4.1
 *   (`EXPORT_BLOCKED_CRITICAL`) — ห้ามเขียนกฎบล็อกซ้ำที่นี่ · `authorized` ปลดบล็อกได้ตาม `34` §11
 * - **Versioning ไม่เขียนทับ** (`37` §6.2/§10): version = ครั้งล่าสุดของรอบ + 1 · path ใน bucket มี
 *   `v<version>` และอัปโหลดด้วย `upsert: false` ⇒ ต่อให้สองคนกดพร้อมกันจนได้เลขชนกัน ก็จะ**อัปโหลด
 *   ไม่ผ่าน** แทนที่จะทับไฟล์ที่ส่งไปแล้ว (คนกดใหม่ได้เวอร์ชันถัดไป)
 * - **`export_records` เก่าห้ามลบ** (`37` §10) — โมดูลนี้จึงไม่มี delete/update ยอดใด ๆ
 * - **สถานะเดินทางเดียว** `generated → sent → accepted` (`37` §9) — mark-sent แยกจากการสร้างไฟล์
 *   เพราะการส่งจริงเกิดนอกระบบ
 * - ไม่ติดยาม Period Lock โดยเจตนา: การส่งมอบเป็นการ*อ่าน*ข้อมูลงวดไปทำไฟล์ ไม่ได้แก้ยอดของงวด
 *   (งวดที่ `locked` ต้อง export ซ้ำได้ตาม `37` §9 — สำนักงานบัญชีขอชุดใหม่หลังปิดงวดได้)
 *
 * ### ขอบเขตของรอบ (period scoping) ต่อไฟล์
 * ตารางที่มี `period_id` (เงินรับ/ค่าใช้จ่าย/กระทบยอด/exception) ใช้ `period_id` ตรง ๆ ส่วน
 * `revenues` **ไม่มี `period_id`** (`02` §8) จึงใช้ช่วงวันของงวดตาม `revenue_date` เหมือน Readiness
 * Check ของ 4.1 · `adjustments` ยึด "งวดของเป้าหมาย" แบบเดียวกับที่ 3.7 ใช้ตัดสิน `period_status_at_target`
 */

const EXPORT_TARGET = 'export_records'

// ── select / mapper ─────────────────────────────────────────────────────────

const EXPORT_SELECT = {
  id: true,
  periodId: true,
  version: true,
  status: true,
  fileUrls: true,
  fileHash: true,
  generatedAt: true,
  sentAt: true,
  acceptedAt: true,
  period: { select: { periodLabel: true, yearBe: true, month: true } },
  generatedByUser: { select: { fullName: true } },
  sentByUser: { select: { fullName: true } },
} satisfies Prisma.ExportRecordSelect

type ExportRow = Prisma.ExportRecordGetPayload<{ select: typeof EXPORT_SELECT }>

/** `file_urls` เป็น Json อิสระ — อ่านแบบไม่เชื่อรูปร่าง แล้วคัดเฉพาะคู่ที่เป็น string */
function fileEntriesOf(value: Prisma.JsonValue): { key: string; path: string }[] {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return []
  return Object.entries(value)
    .filter((entry): entry is [string, string] => typeof entry[1] === 'string')
    .map(([key, path]) => ({ key, path }))
}

function fileNameOf(path: string): string {
  return path.slice(path.lastIndexOf('/') + 1)
}

function toExportDto(row: ExportRow, attachmentCount: number): ExportRecordDto {
  const entries = fileEntriesOf(row.fileUrls)
  const zip = entries.find((entry) => entry.key === PACK_ZIP_KEY)

  return {
    id: row.id,
    periodId: row.periodId,
    periodLabel: row.period.periodLabel,
    version: row.version,
    versionLabel: exportVersionLabel(row.version),
    status: row.status,
    statusLabel: EXPORT_STATUS_LABEL[row.status],
    statusGroup: EXPORT_STATUS_GROUP[row.status],
    // นับเฉพาะไฟล์ข้อมูล 00–17 (`37` §7.1 · 00 = ยอดรวมควบคุม มติ U94) — หน้าปกและไฟล์ .zip ไม่ใช่ "ไฟล์ข้อมูล"
    fileCount: entries.filter((entry) => /^\d{2}$/.test(entry.key)).length,
    // จำนวน PDF ใน zip (ทุกโฟลเดอร์) ตามที่บันทึกตอนสร้างชุด (UAT BUG-167 · `37` §7.1)
    attachmentCount,
    files: entries.map((entry) => ({ key: entry.key, fileName: fileNameOf(entry.path) })),
    fileHash: row.fileHash,
    // ชื่อที่ผู้ใช้เห็น (ไทยได้) — key จริงใน Storage เป็น ASCII ดู `packZipFileName()`
    zipFileName: zip === undefined ? null : packZipDownloadName(row.period.periodLabel, row.version),
    generatedAt: row.generatedAt.toISOString(),
    generatedByName: row.generatedByUser.fullName,
    sentAt: row.sentAt === null ? null : row.sentAt.toISOString(),
    sentByName: row.sentByUser?.fullName ?? null,
    acceptedAt: row.acceptedAt === null ? null : row.acceptedAt.toISOString(),
  }
}

// ── GET /api/accounting/export-history (`37` §14) ───────────────────────────

export async function listExportHistory(
  user: SessionUser,
  query: ExportHistoryListQuery,
): Promise<ExportHistoryListDto> {
  assertOrgWideReadable(user, 'export-records')
  const rows = await prisma.exportRecord.findMany({
    where: {
      organizationId: user.organizationId,
      ...(query.periodId === undefined ? {} : { periodId: query.periodId }),
    },
    orderBy: [{ generatedAt: 'desc' }],
    select: EXPORT_SELECT,
  })
  const counts = await loadAttachmentCounts(
    user.organizationId,
    rows.map((row) => row.id),
  )
  return { items: rows.map((row) => toExportDto(row, counts.get(row.id) ?? 0)) }
}

/**
 * จำนวน PDF ที่แนบใน zip ต่อชุด — อ่านจาก `after_data.attachments` ของ audit `export` ที่บันทึกตอนสร้าง
 * (immutable — ไม่ต้องเพิ่มคอลัมน์ และชุดเก่าที่สร้างไปแล้วได้ค่าถูกย้อนหลัง · UAT BUG-167)
 */
async function loadAttachmentCounts(organizationId: string, exportIds: readonly string[]): Promise<Map<string, number>> {
  const counts = new Map<string, number>()
  if (exportIds.length === 0) return counts
  const audits = await prisma.auditLog.findMany({
    where: { organizationId, targetType: EXPORT_TARGET, targetId: { in: [...exportIds] }, action: 'export' },
    orderBy: { createdAt: 'asc' },
    select: { targetId: true, afterData: true },
  })
  for (const audit of audits) {
    if (audit.targetId === null || counts.has(audit.targetId)) continue
    const after = audit.afterData
    if (after === null || typeof after !== 'object' || Array.isArray(after) || !('attachments' in after)) continue
    counts.set(audit.targetId, packAttachmentCount(after.attachments))
  }
  return counts
}

export async function findExportRecord(user: SessionUser, id: string): Promise<ExportRow> {
  assertOrgWideReadable(user, 'export-records')
  const row = await prisma.exportRecord.findFirst({
    where: { id, organizationId: user.organizationId },
    select: EXPORT_SELECT,
  })
  if (row === null) throw new ExportError('EXPORT_RECORD_NOT_FOUND', { detail: `export=${id}` })
  return row
}

// ── ข้อมูลของแต่ละไฟล์ (§6.1) ───────────────────────────────────────────────

interface PeriodScope {
  id: string
  yearBe: number
  month: number
  periodLabel: string
  /** ช่วงวันของงวด (date-only UTC) — ใช้กับตารางที่ไม่มี `period_id` */
  start: Date
  end: Date
}

function scopeOf(row: { id: string; yearBe: number; month: number; periodLabel: string }): PeriodScope {
  const yearCe = row.yearBe - 543
  return {
    id: row.id,
    yearBe: row.yearBe,
    month: row.month,
    periodLabel: row.periodLabel,
    start: new Date(Date.UTC(yearCe, row.month - 1, 1)),
    end: new Date(Date.UTC(row.month === 12 ? yearCe + 1 : yearCe, row.month === 12 ? 0 : row.month, 1)),
  }
}

async function revenueRows(organizationId: string, scope: PeriodScope): Promise<RevenueExportRow[]> {
  const rows = await prisma.revenue.findMany({
    where: {
      organizationId,
      deletedAt: null,
      revenueDate: { gte: scope.start, lt: scope.end },
    },
    orderBy: [{ revenueDate: 'asc' }, { createdAt: 'asc' }],
    select: {
      revenueDate: true,
      grossSatang: true,
      vatSatang: true,
      case: { select: { caseRef: true } },
      company: { select: { name: true } },
    },
  })

  return rows.map((row) => ({
    companyName: row.company.name,
    caseRef: row.case.caseRef,
    revenueDate: row.revenueDate,
    grossSatang: row.grossSatang,
    vatSatang: row.vatSatang,
  }))
}

async function cashReceiptRows(organizationId: string, scope: PeriodScope): Promise<CashReceiptExportRow[]> {
  const rows = await prisma.cashReceipt.findMany({
    where: { organizationId, periodId: scope.id },
    orderBy: [{ receivedDate: 'asc' }, { createdAt: 'asc' }],
    select: {
      receivedDate: true,
      amountSatang: true,
      billingBatch: { select: { company: { select: { name: true } } } },
      bankTransaction: { select: { description: true } },
    },
  })

  return rows.map((row) => ({
    receivedDate: row.receivedDate,
    payerName: row.billingBatch.company.name,
    amountSatang: row.amountSatang,
    // สคีมาไม่มีคอลัมน์เลขอ้างอิงธนาคารแยก — ตัวนำเข้า statement รวมไว้ใน `description` (ดูหัวไฟล์ pack.ts)
    bankRef: row.bankTransaction?.description ?? null,
  }))
}

const EXPENSE_RECORD_SELECT = {
  grossSatang: true,
  whtSatang: true,
  netSatang: true,
  costCenter: { select: { code: true } },
  payoutBatchItem: {
    select: {
      id: true,
      payoutBatchId: true,
      payeeId: true,
      advanceId: true,
      advance: { select: { advanceNumber: true } },
      expense: {
        select: {
          id: true,
          expenseType: true,
          receiptInCompanyName: true,
          expenseDate: true,
          receiptFileUrl: true,
          case: { select: { caseRef: true } },
          // มติ PO U103 — ใบรับรองแทนใบเสร็จของใบเบิก (เลข CRT + ไฟล์ฉบับเซ็น)
          substituteReceipts: {
            // มติ PO U107 — ใบที่ยกเลิกแล้วไม่ใช่หลักฐานของรายการ
            where: { deletedAt: null, status: { not: 'cancelled' } },
            select: { receiptNumber: true, signedFilePath: true },
          },
        },
      },
      payee: { select: { user: { select: { fullName: true } } } },
      payoutBatch: {
        select: { id: true, name: true, idempotencyKey: true, paymentFileGeneratedAt: true, updatedAt: true },
      },
    },
  },
} satisfies Prisma.ExpenseRecordSelect

type ExpenseRecordRow = Prisma.ExpenseRecordGetPayload<{ select: typeof EXPENSE_RECORD_SELECT }>

async function expenseRecordsOf(organizationId: string, scope: PeriodScope): Promise<ExpenseRecordRow[]> {
  return prisma.expenseRecord.findMany({
    where: { organizationId, periodId: scope.id },
    orderBy: [{ createdAt: 'asc' }],
    select: EXPENSE_RECORD_SELECT,
  })
}

/**
 * `03_Expenses.csv` — แถวต่อบัญชีค่าใช้จ่าย · มติ PO U96 #15: หลักฐานรายจ่ายต่อท้าย — `payment_date` /
 * `payout_batch_ref` / `voucher_ref` ตัวเดียวกับไฟล์ 04 (`PayoutVouchers`) ⇒ โยงแถวข้ามไฟล์ได้ตรงตัว
 */
function expenseRows(rows: readonly ExpenseRecordRow[], vouchers: PayoutVouchers): ExpenseExportRow[] {
  return rows.map((row) => {
    const item = row.payoutBatchItem
    const expense = item.expense
    return {
      payeeName: item.payee.user.fullName,
      // รายการที่มาจากเงินทดรอง (A4) ไม่มี `expense_type` ของตัวเอง — ตัวแปลงเดียวกับไฟล์ 32
      category: expenseCategoryOf({ expenseType: expense?.expenseType ?? null }),
      grossSatang: row.grossSatang,
      whtSatang: row.whtSatang,
      netSatang: row.netSatang,
      // มติ PO U96 #14 — เฉพาะค่าที่พัก (ชนิดอื่น/เงินทดรอง = ว่าง)
      receiptInCompanyName: expense?.expenseType === 'hotel' ? expense.receiptInCompanyName : null,
      // มติ PO U96 #15 — เงินทดรองจ่ายไม่มีใบเบิก ⇒ ใช้เลขอ้างอิงเงินทดรอง
      expenseId: expense?.id ?? item.advance?.advanceNumber ?? null,
      workDate: expense?.expenseDate ?? null,
      paymentDate: payoutPaymentDateOf(item.payoutBatch),
      payoutBatchRef: payoutBatchRefOf(item.payoutBatch),
      voucherRef: vouchers.voucherRefOf.get(voucherKey(item.payoutBatchId, item.payeeId)) ?? null,
      caseRef: expense?.case?.caseRef ?? null,
      costCenter: row.costCenter?.code ?? null,
      // มติ PO U103 — ใช้ใบรับรองแทนใบเสร็จ ⇒ `receipt_file` = ไฟล์ใบรับรองฉบับเซ็น (ปกติคือไฟล์เดียวกับใบเสร็จของใบเบิก)
      receiptFilePath: expense?.receiptFileUrl ?? expense?.substituteReceipts[0]?.signedFilePath ?? null,
      substituteReceiptNumber: expense?.substituteReceipts[0]?.receiptNumber ?? null,
    }
  })
}

/** ตัวอ้างอิงรอบเดียวกับที่พิมพ์บนเอกสาร (3.5): idempotency key ถ้ามี ไม่งั้น 8 ตัวแรกของ id — ไฟล์ 04/13 ใช้ร่วมกัน */
function payoutBatchRefOf(batch: { id: string; idempotencyKey: string | null }): string {
  return batch.idempotencyKey ?? batch.id.slice(0, 8).toUpperCase()
}

/** `02` §8 ไม่มีคอลัมน์วันจ่ายจริง — ยึดวันสร้างไฟล์โอน เหมือนที่ไฟล์ 32 ใช้ผูกงวด (4.4) · ไฟล์ 04/13 ใช้ร่วมกัน */
function payoutPaymentDateOf(batch: { paymentFileGeneratedAt: Date | null; updatedAt: Date }): Date {
  return batch.paymentFileGeneratedAt ?? batch.updatedAt
}

function voucherKey(batchId: string, payeeId: string): string {
  return `${batchId}|${payeeId}`
}

interface PayoutVouchers {
  /** แถวของ `04_Payments.csv` */
  payments: PaymentExportRow[]
  /** เลขใบสำคัญจ่ายต่อ (รอบ, ผู้รับ) — ไฟล์ 03 อ้างตัวเดียวกัน */
  voucherRefOf: Map<string, string>
  /** รอบจ่ายที่มีรายการในงวด (เรียงตามเวลาสร้าง) — แนบใบสำคัญจ่าย/สลิปใน `vouchers/` */
  batches: { id: string; ref: string }[]
}

/**
 * `04_Payments.csv` — 1 แถว = 1 ใบสำคัญจ่าย (ผู้รับเงิน 1 คนต่อรอบจ่าย) เพื่อให้เลขอ้างอิงตรงกับ
 * ใบสำคัญจ่ายที่พิมพ์จริง (snapshot `payout_batch_items.voucher_number` — มติ PO U102)
 */
async function payoutVouchersOf(organizationId: string, rows: readonly ExpenseRecordRow[]): Promise<PayoutVouchers> {
  const batchIds = [...new Set(rows.map((row) => row.payoutBatchItem.payoutBatchId))]
  const voucherRefOf = new Map<string, string>()
  if (batchIds.length === 0) return { payments: [], voucherRefOf, batches: [] }

  const batches = await prisma.payoutBatch.findMany({
    where: { organizationId, id: { in: batchIds } },
    orderBy: [{ createdAt: 'asc' }],
    select: {
      id: true,
      name: true,
      idempotencyKey: true,
      paymentFileGeneratedAt: true,
      updatedAt: true,
      items: {
        orderBy: [{ createdAt: 'asc' }],
        select: {
          id: true,
          payeeId: true,
          grossSatang: true,
          whtSatang: true,
          netSatang: true,
          whtCondition: true,
          advanceOffsetSatang: true,
          voucherNumber: true,
          payee: { select: { user: { select: { fullName: true } } } },
        },
      },
    },
  })

  const paidItemIds = new Set(rows.map((row) => row.payoutBatchItem.id))
  const out: PaymentExportRow[] = []
  for (const batch of batches) {
    const batchRef = payoutBatchRefOf(batch)
    const paymentDate = payoutPaymentDateOf(batch)

    // จัดกลุ่มตามผู้รับเงินโดยคง**ลำดับรายการในรอบ** ให้ตรงกับตอนพิมพ์ใบสำคัญจ่าย (3.5)
    const groups = new Map<
      string,
      {
        payeeId: string
        payeeName: string
        netSatang: number
        advanceOffsetSatang: number
        whtPaidByPayerSatang: number
        inPeriod: boolean
        voucherNumber: string | null
      }
    >()
    for (const item of batch.items) {
      const existing = groups.get(item.payeeId)
      // มติ PO U105 — ภาษีที่บริษัทออกให้ (snapshot ของรายการ · ไม่คิดใหม่)
      const paidByPayer = payoutItemTaxSplit(item).whtPaidByPayerSatang
      if (existing === undefined) {
        groups.set(item.payeeId, {
          payeeId: item.payeeId,
          payeeName: item.payee.user.fullName,
          netSatang: item.netSatang,
          advanceOffsetSatang: item.advanceOffsetSatang,
          whtPaidByPayerSatang: paidByPayer,
          inPeriod: paidItemIds.has(item.id),
          voucherNumber: item.voucherNumber,
        })
      } else {
        existing.netSatang += item.netSatang
        existing.advanceOffsetSatang += item.advanceOffsetSatang
        existing.whtPaidByPayerSatang += paidByPayer
        existing.inPeriod = existing.inPeriod || paidItemIds.has(item.id)
        existing.voucherNumber = existing.voucherNumber ?? item.voucherNumber
      }
    }

    for (const group of groups.values()) {
      // เลขใบสำคัญจ่ายเป็น snapshot ที่ออกตอนสร้างไฟล์โอน — รอบที่จ่ายแล้วมีเลขเสมอ (ว่าง = ข้อมูลผิดปกติ)
      const voucherRef = group.voucherNumber ?? ''
      voucherRefOf.set(voucherKey(batch.id, group.payeeId), voucherRef)
      // ผู้รับเงินที่รายการยังไม่ถูก sync เข้างวดนี้ (รอบคาบเกี่ยว) ไม่ต้องอยู่ในไฟล์ของงวด
      if (!group.inPeriod) continue

      out.push({
        batchRef,
        paymentDate,
        payeeName: group.payeeName,
        netSatang: group.netSatang,
        advanceOffsetSatang: group.advanceOffsetSatang,
        whtPaidByPayerSatang: group.whtPaidByPayerSatang,
        voucherRef,
      })
    }
  }

  return {
    payments: out,
    voucherRefOf,
    batches: batches.map((batch) => ({ id: batch.id, ref: payoutBatchRefOf(batch) })),
  }
}

const WHT_EXPORT_SELECT = {
  id: true,
  certificateNumber: true,
  incomeType: true,
  paymentDate: true,
  grossSatang: true,
  whtSatang: true,
  filingForm: true,
  status: true,
  cancelledAt: true,
  createdAt: true,
  // snapshot ผู้ถูกหัก ณ วันออกใบ (มติ PO U96 #4) — ไม่อ่านโปรไฟล์ปัจจุบัน
  payeeName: true,
  payeeNameTitle: true,
  payeeTaxId: true,
  payeeAddress: true,
  payeeBranchCode: true,
  whtCondition: true,
  replaces: { select: { certificateNumber: true } },
  expenseRecord: { select: { periodId: true, payoutBatchItem: { select: { whtPctSnapshot: true } } } },
} satisfies Prisma.WhtCertificateSelect

type WhtExportSource = Prisma.WhtCertificateGetPayload<{ select: typeof WHT_EXPORT_SELECT }>

function toWhtExportRow(row: WhtExportSource): WhtExportRow {
  return {
    certificateNumber: row.certificateNumber,
    payeeName: row.payeeName,
    payeeTaxId: row.payeeTaxId,
    paymentDate: row.paymentDate,
    incomeType: row.incomeType,
    grossSatang: row.grossSatang,
    whtSatang: row.whtSatang,
    whtPct: row.expenseRecord.payoutBatchItem.whtPctSnapshot?.toString() ?? null,
    filingForm: row.filingForm,
    payeeTitle: row.payeeNameTitle,
    payeeAddress: row.payeeAddress,
    payeeBranchCode: row.payeeBranchCode,
    whtCondition: row.whtCondition,
    rowStatus: 'active',
    refCertificateNumber: row.replaces?.certificateNumber ?? null,
  }
}

/**
 * งวดของ "เดือนที่จ่าย" ที่ส่งชุดให้สำนักงานบัญชีไปแล้ว **ก่อน** เหตุการณ์ (มติ PO 07/10/2569 U128) — ดูชุดล่าสุดของงวดนั้น:
 * ชุดล่าสุดสร้างก่อนเหตุการณ์และ mark ส่งแล้ว (`sent`/`accepted`) ⇒ ไฟล์ที่สำนักงานบัญชีถืออยู่ยังไม่สะท้อนเหตุการณ์นี้
 * · ชุดล่าสุดสร้างหลังเหตุการณ์ (สร้างงวดเดิมใหม่) = สะท้อนแล้ว ไม่ต้องลงซ้ำในงวดถัดไป · ยังไม่ส่ง = จะสร้างใหม่ก่อนส่งอยู่แล้ว
 */
async function sentPackLookup(
  organizationId: string,
  periodIds: readonly string[],
): Promise<(periodId: string, eventAt: Date) => boolean> {
  if (periodIds.length === 0) return () => false
  const exports = await prisma.exportRecord.findMany({
    where: { organizationId, periodId: { in: [...new Set(periodIds)] } },
    orderBy: [{ periodId: 'asc' }, { version: 'desc' }],
    select: { periodId: true, status: true, generatedAt: true },
  })
  const latest = new Map<string, { status: string; generatedAt: Date }>()
  for (const row of exports) if (!latest.has(row.periodId)) latest.set(row.periodId, row)
  return (periodId, eventAt) => {
    const pack = latest.get(periodId)
    return pack !== undefined && pack.status !== 'generated' && pack.generatedAt.getTime() <= eventAt.getTime()
  }
}

/**
 * `05_WHT_Data.csv` (มติ PO 07/10/2569 U128 — ตามเดือนที่จ่าย ตรงกับการยื่น ภ.ง.ด.)
 * 1. ใบที่มีผลซึ่ง `payment_date` อยู่ในเดือนของงวด (ใบที่ยกเลิกไม่นับยอด — `33` §16)
 * 2. **แถวกลับรายการ** (`status=cancelled` ยอดติดลบ · `ref_cert_no` = ใบเดิม) — ใบของเดือนก่อนที่ส่งชุดไปแล้ว
 *    แต่ถูกยกเลิกในงวดนี้
 * 3. **ใบที่ออกภายหลัง** (เช่นใบออกแทน · `ref_cert_no` = ใบที่ถูกแทน) — ใบของเดือนก่อนที่ส่งชุดไปแล้ว แต่ออกในงวดนี้
 * ยอดใน `00_Control_Totals.csv` คิดจากแถวชุดนี้ (รวมยอดติดลบ) จึงตรงกับไฟล์เสมอ
 */
async function whtRows(
  organizationId: string,
  scope: PeriodScope,
): Promise<{ rows: WhtExportRow[]; certificates: { id: string; number: string }[] }> {
  const startAt = startOfBangkokDay(scope.start)
  const endAt = startOfBangkokDay(scope.end)
  const [paidInPeriod, lateEvents] = await Promise.all([
    prisma.whtCertificate.findMany({
      where: { organizationId, status: 'active', paymentDate: { gte: scope.start, lt: scope.end } },
      orderBy: [{ certificateNumber: 'asc' }],
      select: WHT_EXPORT_SELECT,
    }),
    // ใบของเดือนก่อนหน้าที่มีเหตุการณ์ (ยกเลิก/ออก) ในงวดนี้ — กรองต่อด้วย "ส่งชุดของเดือนนั้นไปแล้ว"
    prisma.whtCertificate.findMany({
      where: {
        organizationId,
        paymentDate: { lt: scope.start },
        OR: [{ cancelledAt: { gte: startAt, lt: endAt } }, { createdAt: { gte: startAt, lt: endAt } }],
      },
      orderBy: [{ certificateNumber: 'asc' }],
      select: WHT_EXPORT_SELECT,
    }),
  ])

  const sentBefore = await sentPackLookup(
    organizationId,
    lateEvents.map((row) => row.expenseRecord.periodId),
  )
  const inScope = (at: Date | null): at is Date => at !== null && at >= startAt && at < endAt
  const issuedLate = lateEvents.filter(
    (row) => inScope(row.createdAt) && sentBefore(row.expenseRecord.periodId, row.createdAt),
  )
  const reversed = lateEvents.filter(
    (row) =>
      row.status === 'cancelled' &&
      inScope(row.cancelledAt) &&
      // ใบที่ออกและยกเลิกในงวดนี้เอง = แถวออก + แถวกลับรายการ (หักกลบเป็นศูนย์) · ใบที่อยู่ในชุดที่ส่งแล้ว = กลับรายการ
      (sentBefore(row.expenseRecord.periodId, row.cancelledAt) || issuedLate.some((issued) => issued.id === row.id)),
  )

  const exportRows: WhtExportRow[] = [
    ...paidInPeriod.map(toWhtExportRow),
    ...issuedLate.map(toWhtExportRow),
    ...reversed.map((row) => whtReversalRow(toWhtExportRow(row))),
  ]

  // `payee_tax_id` ต้องเป็นเลข 13 หลักล้วนทุกแถว (DEC-006/D10) — ขาดแม้แถวเดียวคือหยุด ไม่ส่งช่องว่างออกไป
  const missing = payeesMissingTaxId(exportRows)
  if (missing.length > 0) {
    throw new ExportError('EXPORT_PAYEE_TAX_ID_MISSING', {
      detail: `ผู้รับเงินที่เลขประจำตัวผู้เสียภาษีไม่ครบ ${missing.length} ราย`,
      context: { payees: missing },
    })
  }

  return {
    rows: exportRows,
    // PDF แนบชุดเดียวกับแถวที่มีผล (ใบที่ยกเลิกแนบแยกด้วย `-CANCELLED`)
    certificates: [...paidInPeriod, ...issuedLate]
      .filter((row) => row.status === 'active')
      .map((row) => ({ id: row.id, number: row.certificateNumber })),
  }
}

async function bankReconRows(organizationId: string, scope: PeriodScope): Promise<BankReconExportRow[]> {
  const rows = await prisma.bankTransaction.findMany({
    where: { organizationId, periodId: scope.id },
    orderBy: [{ transactionDate: 'asc' }, { createdAt: 'asc' }],
    select: {
      transactionDate: true,
      description: true,
      amountSatang: true,
      matchStatus: true,
      isSplitAllocation: true,
      matchedBilling: { select: { batchNumber: true, period: true, company: { select: { name: true } } } },
      matchedPayout: { select: { name: true } },
      matchedAdvance: { select: { id: true, payee: { select: { user: { select: { fullName: true } } } } } },
    },
  })

  return rows.map((row): BankReconExportRow => {
      let matchedType: MatchedType | null = null
      let matchedRef: string | null = null
      if (row.matchedBilling !== null) {
        matchedType = 'billing_batch'
        // มติ U79 — คงรูปแบบอ้างอิงเดิม · เลขรอบอยู่คอลัมน์ `billing_batch_number` ต่อท้าย
        matchedRef = `${row.matchedBilling.company.name} ${row.matchedBilling.period}`
      } else if (row.matchedPayout !== null) {
        matchedType = 'payout_batch'
        matchedRef = row.matchedPayout.name
      } else if (row.matchedAdvance !== null) {
        matchedType = 'advance'
        matchedRef = row.matchedAdvance.payee.user.fullName
      } else if (row.isSplitAllocation) {
        // A2 — เงินก้อนเดียวจ่ายหลายบิล ไม่มี FK เดี่ยว (`02` §9)
        matchedType = 'split_allocation'
      }

      return {
        transactionDate: row.transactionDate,
        description: row.description,
        amountSatang: row.amountSatang,
        matchStatus: row.matchStatus,
        matchedType,
        matchedRef,
        billingBatchNumber: row.matchedBilling?.batchNumber ?? null,
      }
    })
}

/**
 * งวดของรายการปรับปรุง = งวดของ**เป้าหมาย** (แนวเดียวกับที่ 3.7 ใช้ตัดสิน `period_status_at_target`)
 * — ไม่ใช่วันที่อนุมัติ เพราะการแก้ยอดเดือนมิถุนายนมักถูกอนุมัติในเดือนกรกฎาคม
 */
function adjustmentTargetDate(row: {
  revenue: { revenueDate: Date } | null
  expense: { expenseDate: Date } | null
  billingBatch: { period: string; dueDate: Date } | null
  payoutBatch: { createdAt: Date } | null
}): Date | null {
  if (row.revenue !== null) return row.revenue.revenueDate
  if (row.expense !== null) return row.expense.expenseDate
  if (row.billingBatch !== null) {
    const key = parseBillingPeriodLabel(row.billingBatch.period)
    return key === null ? row.billingBatch.dueDate : new Date(Date.UTC(key.yearBe - 543, key.month - 1, 1))
  }
  if (row.payoutBatch !== null) return row.payoutBatch.createdAt
  return null
}

interface AdjustmentLogEntry {
  id: string
  row: AdjustmentExportRow
}

/** ช่วงวันของงวดตามปี พ.ศ./เดือน (date-only UTC) — ตัวเดียวกับ `scopeOf()` */
function periodRange(yearBe: number, month: number): Pick<PeriodScope, 'yearBe' | 'month' | 'start' | 'end'> {
  const yearCe = yearBe - 543
  return {
    yearBe,
    month,
    start: new Date(Date.UTC(yearCe, month - 1, 1)),
    end: new Date(Date.UTC(month === 12 ? yearCe + 1 : yearCe, month === 12 ? 0 : month, 1)),
  }
}

/**
 * แถวของ `07_Adjustment_Log.csv` ของงวด (เรียงตามลำดับที่ใช้เดินเลข `adjustmentRef()`) พร้อม `id` ของ Adjustment
 * — ใช้ทั้งประกอบไฟล์ 07 และหาเลขที่อ้างถึงในไฟล์ 09 (ลำดับต้องตรงกัน)
 */
async function adjustmentLogOf(
  organizationId: string,
  scope: Pick<PeriodScope, 'start' | 'end'>,
): Promise<AdjustmentLogEntry[]> {
  const rows = await prisma.adjustment.findMany({
    where: {
      organizationId,
      status: 'approved',
      // รายการปรับปรุงเกิดหลังงวดเริ่มเสมอ — ตัดปีเก่าออกตั้งแต่ระดับ DB แล้วค่อยกรองตามงวดของเป้าหมาย
      createdAt: { gte: scope.start },
    },
    orderBy: [{ createdAt: 'asc' }],
    select: {
      id: true,
      adjustmentType: true,
      amountSatang: true,
      reason: true,
      approvedAt: true,
      approvedByUser: { select: { fullName: true } },
      revenue: { select: { revenueDate: true, case: { select: { caseRef: true } } } },
      expense: { select: { expenseDate: true, case: { select: { caseRef: true } } } },
      billingBatch: { select: { batchNumber: true, period: true, dueDate: true } },
      payoutBatch: { select: { createdAt: true, name: true } },
    },
  })

  const entries: AdjustmentLogEntry[] = []
  for (const row of rows) {
    const targetDate = adjustmentTargetDate(row)
    if (targetDate === null || targetDate < scope.start || targetDate >= scope.end) continue

    const target =
      row.revenue !== null
        ? { type: 'revenue', ref: row.revenue.case.caseRef }
        : row.expense !== null
          ? { type: 'expense', ref: row.expense.case?.caseRef ?? null }
          : row.billingBatch !== null
            ? { type: 'billing_batch', ref: row.billingBatch.period }
            : { type: 'payout_batch', ref: row.payoutBatch?.name ?? null }

    entries.push({
      id: row.id,
      row: {
        targetType: target.type,
        targetRef: target.ref ?? '',
        signedSatang: signedAdjustmentSatang(row.adjustmentType, row.amountSatang),
        reason: row.reason,
        approvedByName: row.approvedByUser?.fullName ?? null,
        approvedAt: row.approvedAt,
        // มติ U79 — เลขรอบแยกเป็นคอลัมน์ต่อท้าย (`target_ref` คงเป็นรอบเดือนแบบเดิม)
        billingBatchNumber: row.billingBatch?.batchNumber ?? null,
      },
    })
  }
  return entries
}

/** `10_Customer_WHT.csv` (มติ PO 05/10/2569 U40) — รับเงินในงวด + ยังรอหนังสือที่ยกมา */
async function customerWhtRows(organizationId: string, scope: PeriodScope): Promise<CustomerWhtExportRow[]> {
  return customerWhtExportSources(organizationId, scope)
}

/**
 * `11_Suspense_Receipts.csv` (มติ PO 05/10/2569 U41) — รายการที่เคยเป็นเงินรับรอตรวจสอบ และ
 * เกิดในงวด / ยังค้างอยู่ (เกิดก่อนสิ้นงวด) / จับคู่หรือคืนเงินภายในงวด ⇒ สำนักงานบัญชีเห็นทั้งยอดยกมา ยอดเกิด
 * และยอดที่เคลียร์ในงวด (หนี้สินรอตรวจสอบ — ไม่ใช่รายได้)
 */
async function suspenseRows(organizationId: string, scope: PeriodScope): Promise<SuspenseExportRow[]> {
  // วันที่จับคู่เป็น timestamp ⇒ ใช้ขอบวันตามเวลาไทยของงวด
  const startAt = startOfBangkokDay(scope.start)
  const endAt = startOfBangkokDay(scope.end)
  const rows = await prisma.bankTransaction.findMany({
    where: {
      organizationId,
      suspendedAt: { not: null },
      OR: [
        { periodId: scope.id },
        { matchStatus: 'suspense', transactionDate: { lt: scope.end } },
        { matchStatus: 'suspense_refunded', refundDate: { gte: scope.start, lt: scope.end } },
        { matchStatus: { in: ['auto_matched', 'manual_matched'] }, matchedAt: { gte: startAt, lt: endAt } },
      ],
    },
    orderBy: [{ transactionDate: 'asc' }, { createdAt: 'asc' }],
    select: {
      transactionDate: true,
      description: true,
      amountSatang: true,
      suspendedAt: true,
      suspenseNote: true,
      matchStatus: true,
      matchedAt: true,
      refundDate: true,
      refundNote: true,
      matchedBilling: { select: { batchNumber: true, period: true, company: { select: { name: true } } } },
    },
  })
  return rows.map((row) => ({
      transactionDate: row.transactionDate,
      description: row.description,
      amountSatang: row.amountSatang,
      suspendedAt: row.suspendedAt ?? row.transactionDate,
      suspenseNote: row.suspenseNote ?? '',
      matchStatus: row.matchStatus,
      // มติ U79 — คงรูปแบบอ้างอิงเดิม · เลขรอบอยู่คอลัมน์ `billing_batch_number` ต่อท้าย
      matchedRef: row.matchedBilling === null ? null : `${row.matchedBilling.company.name} ${row.matchedBilling.period}`,
      resolvedDate:
        row.matchStatus === 'suspense_refunded'
          ? row.refundDate
          : row.matchStatus === 'suspense'
            ? null
            : row.matchedAt,
      refundNote: row.refundNote,
      billingBatchNumber: row.matchedBilling?.batchNumber ?? null,
    }))
}

async function adjustmentRows(organizationId: string, scope: PeriodScope): Promise<AdjustmentExportRow[]> {
  const entries = await adjustmentLogOf(organizationId, scope)
  return entries.map((entry) => entry.row)
}

/**
 * `09_Credit_Notes.csv` (มติ PO 05/10/2569 U21) — ใบลดหนี้ + ใบเพิ่มหนี้ที่**ลงวันที่ในรอบ** (รวมใบที่ยกเลิก)
 * · `adjustment_ref` = เลขที่ของ Adjustment ที่อ้างถึงในไฟล์ 07 **ของงวดเป้าหมายของ Adjustment นั้น** (ใบลดหนี้มักออก
 *   เดือนถัดจากรายได้ที่ปรับ ⇒ หาเลขจาก log ของงวดนั้น · memo ต่องวด) · หาไม่เจอ/ไม่ผูก ⇒ `-`
 */
async function creditNoteRows(
  organizationId: string,
  scope: Pick<PeriodScope, 'start' | 'end'>,
): Promise<CreditNoteExportRow[]> {
  const rows = await prisma.creditNote.findMany({
    where: { organizationId, issueDate: { gte: scope.start, lt: scope.end } },
    orderBy: [{ issueDate: 'asc' }, { createdAt: 'asc' }, { id: 'asc' }],
    select: {
      noteType: true,
      creditNoteNumber: true,
      issueDate: true,
      amountBeforeVatSatang: true,
      vatSatang: true,
      totalSatang: true,
      reason: true,
      status: true,
      buyerBranchCode: true,
      taxInvoice: {
        select: {
          invoiceNumber: true,
          buyerTaxId: true,
          salesRecord: { select: { company: { select: { name: true } } } },
        },
      },
      adjustment: {
        select: {
          id: true,
          revenue: { select: { revenueDate: true } },
          expense: { select: { expenseDate: true } },
          billingBatch: { select: { period: true, dueDate: true } },
          payoutBatch: { select: { createdAt: true } },
        },
      },
    },
  })

  const logs = new Map<string, Promise<AdjustmentLogEntry[]>>()
  async function refOf(adjustment: (typeof rows)[number]['adjustment']): Promise<string | null> {
    if (adjustment === null) return null
    const targetDate = adjustmentTargetDate(adjustment)
    if (targetDate === null) return null
    const ym = fmtYearMonth(targetDate)
    const range = periodRange(ym.yearBe, ym.month)
    const key = `${range.yearBe}-${range.month}`
    let log = logs.get(key)
    if (log === undefined) {
      log = adjustmentLogOf(organizationId, range)
      logs.set(key, log)
    }
    const index = (await log).findIndex((entry) => entry.id === adjustment.id)
    return index < 0 ? null : adjustmentRef({ yearBe: range.yearBe, month: range.month, index: index + 1 })
  }

  const exportRows: CreditNoteExportRow[] = []
  for (const row of rows) {
    exportRows.push({
      documentType: CREDIT_NOTE_DOCUMENT_CODE[row.noteType],
      number: row.creditNoteNumber,
      issueDate: row.issueDate,
      taxInvoiceRef: row.taxInvoice.invoiceNumber,
      companyName: row.taxInvoice.salesRecord.company.name,
      amountBeforeVatSatang: row.amountBeforeVatSatang,
      vatSatang: row.vatSatang,
      totalSatang: row.totalSatang,
      reason: row.reason,
      status: row.status,
      adjustmentRef: await refOf(row.adjustment),
      // มติ PO U82 — snapshot สาขาผู้ซื้อตามใบกำกับเดิม (คอลัมน์ต่อท้าย)
      companyBranchCode: row.buyerBranchCode,
      // มติ PO U94 ข้อ 5 — เลขผู้เสียภาษีผู้ซื้อตาม snapshot บนใบกำกับเดิม (คอลัมน์ต่อท้าย)
      companyTaxId: row.taxInvoice.buyerTaxId,
    })
  }
  return exportRows
}

/** เนื้อไฟล์ `09_Credit_Notes.csv` ของงวด (ปี พ.ศ./เดือน) — ตัวเดียวกับที่ Export Pack ใช้ (เปิดให้เทสต์ระดับ DB) */
export async function buildCreditNotePackFile(organizationId: string, yearBe: number, month: number): Promise<string> {
  return creditNoteCsv(await creditNoteRows(organizationId, periodRange(yearBe, month)))
}

/** ปี พ.ศ./เดือน ของวันที่ (date-only UTC — คอลัมน์ DATE ของงวดเป้าหมาย) */
function fmtYearMonth(date: Date): { yearBe: number; month: number } {
  return { yearBe: date.getUTCFullYear() + 543, month: date.getUTCMonth() + 1 }
}

interface PackPdfEntry {
  name: string
  data: Uint8Array
}

export interface TaxInvoicePackResult {
  csv: string
  rows: TaxInvoiceExportRow[]
  /** PDF ใน `tax_invoices/` (+ `NOT_ATTACHED.txt` เมื่อมีใบที่ไม่ได้แนบ) */
  entries: PackPdfEntry[]
  attached: number
  notAttached: string[]
}

/**
 * `12_Tax_Invoices.csv` + PDF ในโฟลเดอร์ `tax_invoices/` (มติ PO 05/10/2569 U57 · O41/BUG-123)
 * — ใบที่ลงวันที่ในงวด + ใบที่ยกเลิกในงวด · ยอดจาก snapshot รายการขาย · PDF จาก renderer เดียวกับ
 * `GET /tax-invoices/:id/pdf` · มีเพดานจำนวน/เวลา (`PACK_TAX_INVOICE_PDF_LIMIT`/`…_TIME_BUDGET_MS`)
 * กันฟังก์ชันหมดเวลา — ใบที่ไม่ได้แนบยังอยู่ใน CSV ครบ (`pdf_file` = `-`) + รายชื่อใน `NOT_ATTACHED.txt`
 */
async function taxInvoiceFile(
  organizationId: string,
  scope: Pick<PeriodScope, 'start' | 'end'>,
  budget: PackPdfBudget,
): Promise<TaxInvoicePackResult> {
  const invoices = await taxInvoicesForPack(organizationId, {
    start: scope.start,
    end: scope.end,
    // วันที่ยกเลิกเป็น timestamp ⇒ ใช้ขอบวันตามเวลาไทยของงวด
    startAt: startOfBangkokDay(scope.start),
    endAt: startOfBangkokDay(scope.end),
  })
  // หัวเอกสารจาก snapshot บนใบ (มติ PO U99) — cache โลโก้ต่อ path ทั้งชุด
  const letterheads = createLetterheadResolver(organizationId)

  const entries: PackPdfEntry[] = []
  const pdfFileOf = new Map<string, string>()
  const notAttached: string[] = []
  const usedNames = new Set<string>()
  for (const invoice of invoices) {
    if (!budget.tryTake()) {
      notAttached.push(invoice.source.invoiceNumber)
      continue
    }
    let name = taxInvoicePdfEntryName(invoice.source.invoiceNumber, invoice.source.status === 'cancelled')
    // เลขที่ใบกำกับ unique อยู่แล้ว — กันชื่อชนหลังตัดอักขระ (เช่น `A/1` กับ `A_1`)
    if (usedNames.has(name)) name = name.replace(/\.pdf$/, `_${invoice.id.slice(0, 8)}.pdf`)
    usedNames.add(name)
    const pdf = await renderTaxInvoice(
      buildTaxInvoiceDoc(invoice.source),
      await taxInvoiceLetterhead(letterheads, invoice.source),
      await taxInvoiceTemplate(letterheads, invoice.source),
    )
    entries.push({ name, data: new Uint8Array(pdf) })
    pdfFileOf.set(invoice.id, name)
  }
  if (notAttached.length > 0) {
    entries.push({ name: PACK_TAX_INVOICE_NOT_ATTACHED_FILE, data: encoder.encode(taxInvoiceNotAttachedText(notAttached)) })
  }

  const rows: TaxInvoiceExportRow[] = invoices.map((invoice) => ({
    invoiceNumber: invoice.source.invoiceNumber,
    invoiceDate: invoice.source.invoiceDate,
    companyName: invoice.companyName,
    companyTaxId: invoice.source.buyer.taxId,
    companyBranchCode: invoice.source.buyerBranchCode,
    amountBeforeVatSatang: invoice.source.amounts.totalBeforeVatSatang,
    vatSatang: invoice.source.amounts.vatSatang,
    totalSatang: invoice.source.amounts.totalSatang,
    vatRatesPct: invoice.source.vatRatesPct,
    billingRef: invoice.billingRef,
    billingBatchNumber: invoice.billingBatchNumber,
    status: invoice.source.status,
    cancelledAt: invoice.source.cancelledAt,
    cancelReason: invoice.source.cancelReason,
    replacedBy: invoice.replacedBy,
    pdfFile: pdfFileOf.get(invoice.id) ?? null,
    documentType: TAX_INVOICE_DOC_KIND_TITLE[invoice.source.docKind],
    receivedDate: invoice.source.receivedDate,
  }))
  return { csv: taxInvoiceCsv(rows), rows, entries, attached: pdfFileOf.size, notAttached }
}

/** เนื้อไฟล์ `12_Tax_Invoices.csv` + PDF ของงวด (ปี พ.ศ./เดือน) — ตัวเดียวกับที่ Export Pack ใช้ (เปิดให้เทสต์ระดับ DB) */
export async function buildTaxInvoicePackFiles(
  organizationId: string,
  yearBe: number,
  month: number,
  options: { limit?: number; timeBudgetMs?: number; now?: () => number } = {},
): Promise<TaxInvoicePackResult> {
  return taxInvoiceFile(organizationId, periodRange(yearBe, month), createPackPdfBudget(options))
}

/**
 * `13_Advance_Returns.csv` (มติ PO 05/10/2569 U68 · จาก U30) — แถวของ `advance_returns` ในงวด:
 * - หักกลบในรอบจ่าย: รายการจ่ายที่ถูกหักอยู่ในงวดนี้ (ตัวเดียวกับที่ทำให้แถวอยู่ใน `04_Payments.csv`)
 * - รับคืนแยก (เงินสด/โอน): วันที่รับเงินอยู่ในงวด
 * - กลับรายการในงวด: แสดงซ้ำพร้อมสถานะ `reversed` (เฉพาะแถวที่เคยมีผลจริง — หักกลบที่ยังไม่จ่ายไม่นับ)
 */
async function advanceReturnRows(organizationId: string, scope: PeriodScope): Promise<AdvanceReturnExportRow[]> {
  const startAt = startOfBangkokDay(scope.start)
  const endAt = startOfBangkokDay(scope.end)
  const paidInPeriod = { is: { expenseRecord: { is: { periodId: scope.id } } } }
  const rows = await prisma.advanceReturn.findMany({
    where: {
      organizationId,
      OR: [
        { channel: { in: ['cash', 'bank_transfer'] }, receivedDate: { gte: scope.start, lt: scope.end } },
        { channel: 'payout_offset', payoutBatchItem: paidInPeriod },
        {
          reversedAt: { gte: startAt, lt: endAt },
          OR: [
            { channel: { in: ['cash', 'bank_transfer'] } },
            { payoutBatchItem: { is: { expenseRecord: { isNot: null } } } },
          ],
        },
      ],
    },
    orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    select: {
      advanceId: true,
      advance: { select: { advanceNumber: true } },
      returnNumber: true,
      channel: true,
      amountSatang: true,
      receivedDate: true,
      evidenceFilePath: true,
      reversedAt: true,
      reversalReason: true,
      createdAt: true,
      payee: { select: { user: { select: { fullName: true } } } },
      payoutBatch: { select: { id: true, idempotencyKey: true, paymentFileGeneratedAt: true, updatedAt: true } },
    },
  })

  const exportRows: (AdvanceReturnExportRow & { createdAt: Date })[] = rows.map((row) => ({
    returnDate:
      row.channel === 'payout_offset' && row.payoutBatch !== null
        ? payoutPaymentDateOf(row.payoutBatch)
        : (row.receivedDate ?? row.createdAt),
    advanceRef: row.advance.advanceNumber,
    payeeName: row.payee.user.fullName,
    amountSatang: row.amountSatang,
    channel: row.channel,
    payoutBatchRef: row.payoutBatch === null ? null : payoutBatchRefOf(row.payoutBatch),
    evidenceFilePath: row.evidenceFilePath,
    reversedAt: row.reversedAt,
    reversalReason: row.reversalReason,
    returnNumber: row.returnNumber,
    createdAt: row.createdAt,
  }))
  exportRows.sort(
    (a, b) => a.returnDate.getTime() - b.returnDate.getTime() || a.createdAt.getTime() - b.createdAt.getTime(),
  )
  return exportRows
}

/**
 * `14_Unbilled_Revenue.csv` (มติ PO 06/10/2569 U87) — รายได้ที่ `revenue_date` อยู่ในงวดหรือก่อนงวด
 * และ ณ เวลาสร้างชุดยังไม่อยู่ในรอบวางบิลที่ส่งลูกค้าแล้ว (ไม่ผูกรอบ / อยู่ในรอบร่าง / รอบถูกลบ)
 * — นิยามเดียวกับคำเตือน "รายได้ค้างรับ" ของ Readiness (`unbilledRevenueWhere()`)
 */
async function unbilledRevenueRows(
  organizationId: string,
  scope: Pick<PeriodScope, 'end'>,
): Promise<UnbilledRevenueExportRow[]> {
  const rows = await prisma.revenue.findMany({
    where: unbilledRevenueWhere(organizationId, scope.end),
    orderBy: [{ revenueDate: 'asc' }, { createdAt: 'asc' }, { id: 'asc' }],
    select: {
      revenueDate: true,
      grossSatang: true,
      vatSatang: true,
      totalSatang: true,
      vatRatePctUsed: true,
      feeModelSnapshot: true,
      case: { select: { caseRef: true } },
      company: { select: { name: true, taxId: true } },
      billingBatch: { select: { batchNumber: true, status: true, deletedAt: true } },
    },
  })
  const exportRows: UnbilledRevenueExportRow[] = rows.map((row) => ({
    caseRef: row.case.caseRef,
    companyName: row.company.name,
    companyTaxId: row.company.taxId,
    revenueDate: row.revenueDate,
    feeModel: row.feeModelSnapshot,
    grossSatang: row.grossSatang,
    vatSatang: row.vatSatang,
    totalSatang: row.totalSatang,
    vatRatePct: row.vatRatePctUsed.toString(),
    draftBillingBatchNumber:
      row.billingBatch !== null && row.billingBatch.deletedAt === null && row.billingBatch.status === 'draft'
        ? row.billingBatch.batchNumber
        : null,
  }))
  return exportRows
}

/** เนื้อไฟล์ `14_Unbilled_Revenue.csv` ของงวด (ปี พ.ศ./เดือน) — ตัวเดียวกับที่ Export Pack ใช้ (เปิดให้เทสต์ระดับ DB) */
export async function buildUnbilledRevenuePackFile(organizationId: string, yearBe: number, month: number): Promise<string> {
  return unbilledRevenueCsv(await unbilledRevenueRows(organizationId, periodRange(yearBe, month)))
}

/**
 * `15_Accrued_Expenses.csv` (มติ PO 06/10/2569 U94 ข้อ 2) — รายการเบิกที่ `accruedExpenseWhere()` คัด (นิยามจุดเดียว)
 * · WHT ที่คาดว่าจะหัก: อยู่ในรอบจ่ายที่ยังไม่โอน = ยอดของรอบ · ยังไม่เข้ารอบ = `estimateAccruedWhtSatang()` ด้วย
 *   ค่าตั้ง WHT ที่มีผล ณ เวลาสร้างชุด (สูตรเดียวกับรอบจ่าย) · `payout_batch_ref` = รอบที่ยังไม่โอน/ไม่ยกเลิก
 */
async function accruedExpenseRows(
  organizationId: string,
  scope: Pick<PeriodScope, 'end'>,
  generatedAt: Date,
): Promise<AccruedExpenseExportRow[]> {
  const [rows, policy, typeDefaults] = await Promise.all([
    prisma.expense.findMany({
      where: accruedExpenseWhere(organizationId, scope.end),
      orderBy: [{ expenseDate: 'asc' }, { createdAt: 'asc' }, { id: 'asc' }],
      select: {
        id: true,
        expenseType: true,
        grossSatang: true,
        expenseDate: true,
        status: true,
        case: { select: { caseRef: true } },
        compPlan: { select: { whtPct: true } },
        payoutItems: {
          where: { payoutBatch: { is: { deletedAt: null, status: { notIn: ['completed', 'cancelled'] } } } },
          orderBy: [{ createdAt: 'desc' }],
          take: 1,
          select: { whtSatang: true, payoutBatch: { select: { id: true, idempotencyKey: true } } },
        },
        payee: {
          select: {
            id: true,
            payeeType: true,
            nationalId: true,
            wht402Pct: true,
            whtCondition: true,
            taxProfile: { select: { whtPct: true, whtBasis: true, whtMinThresholdSatang: true } },
            user: {
              select: { fullName: true, team: { select: { side: true } }, role: { select: { roleGroup: true } } },
            },
          },
        },
      },
    }),
    resolveWhtPolicyForPayout(organizationId, generatedAt),
    // มติ PO U121 — Tax Profile ค่าเริ่มต้นตามประเภทผู้รับ (ชุดเดียวกับที่รอบจ่ายจะใช้)
    loadTaxProfileDefaults(organizationId),
  ])

  const estimates = estimateAccruedWhtSatang(
    rows.map((row) => {
      const side = resolvePayoutSide({
        teamSide: row.payee.user.team?.side ?? null,
        roleGroup: row.payee.user.role.roleGroup,
      })
      return {
        payeeId: row.payee.id,
        grossSatang: row.grossSatang,
        expenseType: row.expenseType,
        batchWhtSatang: row.payoutItems[0]?.whtSatang ?? null,
        payeeType: row.payee.payeeType,
        side,
        typeDefaultTaxProfile: pickTaxProfileDefault(typeDefaults.profiles, side, row.payee.payeeType)?.values ?? null,
        payeeTaxProfile:
          row.payee.taxProfile === null
            ? null
            : {
                whtPct: Number(row.payee.taxProfile.whtPct),
                whtBasis: row.payee.taxProfile.whtBasis === 'gross_amount' ? 'gross_amount' : 'before_vat',
                whtMinThresholdSatang: row.payee.taxProfile.whtMinThresholdSatang,
              },
        planWhtPct: row.compPlan === null ? null : Number(row.compPlan.whtPct),
        section402Pct: row.payee.wht402Pct === null ? null : Number(row.payee.wht402Pct),
        whtCondition: row.payee.whtCondition,
      }
    }),
    policy.values,
  )

  return rows.map((row, index) => {
    const batch = row.payoutItems[0]?.payoutBatch ?? null
    return {
      expenseId: row.id,
      payeeName: row.payee.user.fullName,
      payeeTaxId: row.payee.nationalId,
      category: expenseCategoryOf({ expenseType: row.expenseType }),
      caseRef: row.case?.caseRef ?? null,
      workDate: row.expenseDate,
      status: row.status,
      grossSatang: row.grossSatang,
      estimatedWhtSatang: estimates[index] ?? null,
      payoutBatchRef: batch === null ? null : payoutBatchRefOf(batch),
    }
  })
}

/** เนื้อไฟล์ `15_Accrued_Expenses.csv` ของงวด — ตัวเดียวกับที่ Export Pack ใช้ (เปิดให้เทสต์ระดับ DB) */
export async function buildAccruedExpensePackFile(
  organizationId: string,
  yearBe: number,
  month: number,
  generatedAt: Date = new Date(),
): Promise<string> {
  return accruedExpenseCsv(await accruedExpenseRows(organizationId, periodRange(yearBe, month), generatedAt))
}

const ADVANCE_BATCH_SELECT = { status: true, paymentFileGeneratedAt: true, updatedAt: true } as const

/**
 * `16_Advance_Balance.csv` (มติ PO 06/10/2569 U94 ข้อ 3) — โหลดเงินทดรองที่เคยจ่ายออกได้ แล้วให้ pure module
 * `advanceBalanceRows()` คิดยกมา/เคลื่อนไหว/คงเหลือ (สูตร `22` §6.13–6.14 + วันจ่ายของรายงานอายุเงินทดรอง)
 */
async function advanceBalanceExportRows(
  organizationId: string,
  scope: Pick<PeriodScope, 'start' | 'end'>,
): Promise<AdvanceBalanceExportRow[]> {
  const rows = await prisma.advance.findMany({
    where: {
      organizationId,
      deletedAt: null,
      status: { in: ['approved', 'overdue', 'cleared'] },
      // จ่ายออกได้แค่หลังอนุมัติ ⇒ อนุมัติหลังสิ้นงวดไม่มีทางมียอดในงวดนี้ (ไม่มีเวลาอนุมัติ = ข้อมูลเก่า ให้ pure ตัดสินจากวันจ่าย)
      OR: [{ approvedAt: null }, { approvedAt: { lt: startOfBangkokDay(scope.end) } }],
    },
    orderBy: [{ approvedAt: 'asc' }, { id: 'asc' }],
    select: {
      id: true,
      advanceNumber: true,
      status: true,
      approvedSatang: true,
      returnSatang: true,
      clearedAt: true,
      payee: { select: { id: true, nationalId: true, user: { select: { fullName: true } } } },
      payoutItems: { select: { payoutBatch: { select: ADVANCE_BATCH_SELECT } } },
      returns: {
        select: {
          channel: true,
          amountSatang: true,
          receivedDate: true,
          reversedAt: true,
          payoutBatch: { select: ADVANCE_BATCH_SELECT },
        },
      },
    },
  })
  const entries: AdvanceBalanceEntry[] = rows.map((row) => ({
    advanceId: row.id,
    advanceNumber: row.advanceNumber,
    payeeId: row.payee.id,
    payeeName: row.payee.user.fullName,
    payeeTaxId: row.payee.nationalId,
    status: row.status,
    approvedSatang: row.approvedSatang,
    returnSatang: row.returnSatang,
    clearedAt: row.clearedAt,
    payoutBatches: row.payoutItems.map((item) => item.payoutBatch),
    returns: row.returns,
  }))
  return advanceBalanceRows(entries, scope)
}

/**
 * แถวของ `17_Company_Documents.csv` (มติ PO 07/10/2569 U132) — ภาพ ณ เวลาสร้างชุด (ไม่ขึ้นกับงวด):
 * เอกสารเวอร์ชันปัจจุบันของบริษัทไฟแนนซ์ทุกราย (ที่ยังไม่ถูกลบ) + คำเตือนเอกสารไม่ครบ · บริษัทที่ไม่มีเอกสารได้ 1 แถว
 */
export async function companyDocumentExportRows(
  organizationId: string,
  generatedAt: Date,
): Promise<CompanyDocumentExportRow[]> {
  const companies = await prisma.financeCompany.findMany({
    where: { organizationId, deletedAt: null },
    select: { id: true, name: true, taxId: true, vatRegistered: true },
    orderBy: [{ name: 'asc' }],
  })
  if (companies.length === 0) return []
  const [documents, warnings] = await Promise.all([
    prisma.financeCompanyDocument.findMany({
      where: { organizationId, companyId: { in: companies.map((company) => company.id) } },
      select: {
        id: true,
        companyId: true,
        documentType: true,
        title: true,
        issuedDate: true,
        version: true,
        replacesDocumentId: true,
        originalName: true,
        fileSha256: true,
        createdAt: true,
      },
      orderBy: [{ documentType: 'asc' }, { createdAt: 'asc' }],
    }),
    companyDocumentWarningsFor(organizationId, companies, generatedAt),
  ])
  const current = currentCompanyDocuments(
    documents.map((doc) => ({ ...doc, issuedDate: doc.issuedDate === null ? null : doc.issuedDate.toISOString().slice(0, 10) })),
  )
  const rows: CompanyDocumentExportRow[] = []
  for (const company of companies) {
    const companyWarnings = (warnings.get(company.id) ?? []).map((warning) => warning.message)
    const own = current.filter((doc) => doc.companyId === company.id)
    if (own.length === 0) {
      rows.push({
        companyName: company.name,
        companyTaxId: company.taxId,
        documentType: null,
        documentName: null,
        version: null,
        issuedDate: null,
        originalName: null,
        fileSha256: null,
        uploadedAt: null,
        warnings: companyWarnings,
      })
      continue
    }
    for (const doc of own) {
      rows.push({
        companyName: company.name,
        companyTaxId: company.taxId,
        documentType: doc.documentType,
        documentName: doc.documentType === 'other' && doc.title !== null ? doc.title : COMPANY_DOCUMENT_LABEL[doc.documentType],
        version: doc.version,
        issuedDate: doc.issuedDate === null ? null : new Date(`${doc.issuedDate}T00:00:00Z`),
        originalName: doc.originalName,
        fileSha256: doc.fileSha256,
        uploadedAt: doc.createdAt,
        warnings: companyWarnings,
      })
    }
  }
  return rows
}

/** เนื้อไฟล์ `16_Advance_Balance.csv` ของงวด — ตัวเดียวกับที่ Export Pack ใช้ (เปิดให้เทสต์ระดับ DB) */
export async function buildAdvanceBalancePackFile(organizationId: string, yearBe: number, month: number): Promise<string> {
  return advanceBalanceCsv(await advanceBalanceExportRows(organizationId, periodRange(yearBe, month)))
}

// ── PDF ใน zip นอกจากใบกำกับภาษี (มติ PO U94 ข้อ 5) ────────────────────────────

interface PackPdfFolderResult {
  entries: PackPdfEntry[]
  attached: number
  notAttached: string[]
}

/**
 * ประกอบ PDF ของโฟลเดอร์หนึ่งภายใต้เพดานร่วม (`PackPdfBudget`) — ชื่อซ้ำหลังตัดอักขระต่อท้ายด้วย id ·
 * เกินเพดาน ⇒ ลงรายชื่อใน `<dir>/NOT_ATTACHED.txt` (ข้อมูลยังอยู่ใน CSV ครบ)
 */
async function packPdfFolder<T extends { id: string; ref: string }>(input: {
  dir: string
  items: readonly T[]
  budget: PackPdfBudget
  /** 1 รายการอาจได้หลายไฟล์ (เช่น ใบสำคัญจ่าย + สลิป) — แต่ละไฟล์กินเพดาน 1 ฉบับ */
  render: (item: T) => { suffix: string; render: () => Promise<Uint8Array> }[]
  notAttached: { documentLabel: string; unit: string; csvFileName: string | null }
}): Promise<PackPdfFolderResult> {
  const entries: PackPdfEntry[] = []
  const notAttached: string[] = []
  const usedNames = new Set<string>()
  let attached = 0
  for (const item of input.items) {
    const parts = input.render(item)
    for (const part of parts) {
      const label = `${part.suffix}${item.ref}`
      if (!input.budget.tryTake()) {
        notAttached.push(label)
        continue
      }
      let name = packPdfEntryName(input.dir, label)
      if (usedNames.has(name)) name = name.replace(/\.pdf$/, `_${item.id.slice(0, 8)}.pdf`)
      usedNames.add(name)
      entries.push({ name, data: await part.render() })
      attached += 1
    }
  }
  if (notAttached.length > 0) {
    entries.push({
      name: packNotAttachedFile(input.dir),
      data: encoder.encode(packNotAttachedText({ ...input.notAttached, refs: notAttached })),
    })
  }
  return { entries, attached, notAttached }
}

/**
 * ใบ 50 ทวิ ที่**ยกเลิก**ของงวด — ใบของงวดนี้ที่ยกเลิกแล้ว + ใบงวดอื่นที่ถูกยกเลิกในช่วงงวดนี้
 * (แบบเดียวกับ `tax_invoices/` ที่แนบใบยกเลิกในงวด · UAT BUG-168) · ใช้แนบ PDF เท่านั้น —
 * `05_WHT_Data.csv` ยังมีเฉพาะใบที่มีผล (ใบยกเลิกไม่นับยอด ภ.ง.ด.)
 */
async function cancelledWhtCertificatesForPack(
  organizationId: string,
  scope: PeriodScope,
): Promise<{ id: string; number: string }[]> {
  const rows = await prisma.whtCertificate.findMany({
    where: {
      organizationId,
      status: 'cancelled',
      // มติ PO U128 — ตามเดือนที่จ่าย (ชุดเดียวกับไฟล์ 05) + ใบที่ถูกยกเลิกในช่วงงวดนี้
      OR: [
        { paymentDate: { gte: scope.start, lt: scope.end } },
        { cancelledAt: { gte: startOfBangkokDay(scope.start), lt: startOfBangkokDay(scope.end) } },
      ],
    },
    orderBy: [{ certificateNumber: 'asc' }],
    select: { id: true, certificateNumber: true },
  })
  return rows.map((row) => ({ id: row.id, number: row.certificateNumber }))
}

/**
 * `wht_certificates/` — ใบ 50 ทวิ ชุดเดียวกับ `05_WHT_Data.csv` + ใบที่ยกเลิกในงวด (ชื่อไฟล์ลงท้าย
 * `-CANCELLED`) · renderer เดียวกับพิมพ์รายใบ (2 ฉบับในไฟล์)
 */
async function whtCertificatePdfs(
  actor: SessionUser,
  certificates: readonly { id: string; number: string; cancelled: boolean }[],
  budget: PackPdfBudget,
): Promise<PackPdfFolderResult> {
  return packPdfFolder({
    dir: PACK_WHT_CERTIFICATE_PDF_DIR,
    items: [...certificates]
      .sort((left, right) => left.number.localeCompare(right.number))
      .map((cert) => ({ id: cert.id, ref: packPdfRef(cert.number, cert.cancelled) })),
    budget,
    render: (item) => [
      {
        suffix: '',
        render: async () =>
          new Uint8Array(await renderWhtCertificate(buildWhtCertificateDoc(await getWhtCertificateDocSource(actor, item.id)))),
      },
    ],
    notAttached: { documentLabel: 'หนังสือรับรองการหักภาษี ณ ที่จ่าย', unit: 'ใบ', csvFileName: packFileName('05') },
  })
}

/** `vouchers/` — ใบสำคัญจ่าย (`PV-…`) + สลิปค่าตอบแทน (`SLIP-…`) ต่อรอบจ่ายที่โอนแล้วในงวด (ชุดเดียวกับไฟล์ 04) */
async function voucherPdfs(
  actor: SessionUser,
  batches: readonly { id: string; ref: string }[],
  budget: PackPdfBudget,
): Promise<PackPdfFolderResult> {
  const letterheads = createLetterheadResolver(actor.organizationId)
  return packPdfFolder({
    dir: PACK_VOUCHER_PDF_DIR,
    items: batches,
    budget,
    render: (item) => {
      let source: Promise<Awaited<ReturnType<typeof getPayoutDocSource>>> | null = null
      const load = () => (source ??= getPayoutDocSource(actor, item.id))
      // มติ PO U130 — หัวกระดาษ ณ ตอนสร้างไฟล์โอนครั้งแรก (snapshot ของรอบ) · รอบก่อน U130 = ค่าปัจจุบัน (U99)
      const letterheadOf = (snapshot: unknown) =>
        letterheads.forOrganizationSnapshot(parseOrganizationLetterheadSnapshot(snapshot))
      return [
        {
          suffix: 'PV-',
          render: async () => {
            const { batch, issuer, payees, letterheadSnapshot } = await load()
            return new Uint8Array(
              await renderPaymentVouchers(buildPaymentVoucherDocs(batch, issuer, payees), await letterheadOf(letterheadSnapshot)),
            )
          },
        },
        {
          suffix: 'SLIP-',
          render: async () => {
            const { batch, issuer, payees, letterheadSnapshot } = await load()
            return new Uint8Array(
              await renderPayslips(buildPayslipDocs(batch, issuer, payees), await letterheadOf(letterheadSnapshot)),
            )
          },
        },
      ]
    },
    notAttached: { documentLabel: 'ใบสำคัญจ่าย/สลิปค่าตอบแทน', unit: 'ไฟล์', csvFileName: packFileName('04') },
  })
}

/**
 * `billing_invoices/` — ใบแจ้งหนี้/ใบวางบิลของรอบที่**ส่งลูกค้าในงวด** (`sent_at` ตามวันไทย) · ไม่ใช่เอกสารภาษี
 * (มติ PO U95) จึงแยกจาก `tax_invoices/` และมาท้ายสุดในลำดับเพดาน
 */
async function billingInvoicePdfs(
  actor: SessionUser,
  scope: Pick<PeriodScope, 'start' | 'end'>,
  budget: PackPdfBudget,
): Promise<PackPdfFolderResult> {
  const batches = await prisma.billingBatch.findMany({
    where: {
      organizationId: actor.organizationId,
      deletedAt: null,
      status: { not: 'draft' },
      sentAt: { gte: startOfBangkokDay(scope.start), lt: startOfBangkokDay(scope.end) },
    },
    orderBy: [{ sentAt: 'asc' }, { batchNumber: 'asc' }],
    select: { id: true, batchNumber: true },
  })
  const letterheads = createLetterheadResolver(actor.organizationId)
  return packPdfFolder({
    dir: PACK_BILLING_INVOICE_PDF_DIR,
    items: batches.map((batch) => ({ id: batch.id, ref: batch.batchNumber })),
    budget,
    render: (item) => [
      {
        suffix: '',
        render: async () => {
          const source = await getBillingInvoiceSource(actor, item.id)
          return new Uint8Array(
            await renderBillingInvoice(
              buildBillingInvoiceDoc(source),
              await billingInvoiceLetterhead(letterheads, source),
              await billingInvoiceTemplate(letterheads, source),
            ),
          )
        },
      },
    ],
    notAttached: { documentLabel: 'ใบแจ้งหนี้/ใบวางบิล', unit: 'ใบ', csvFileName: null },
  })
}

async function checklistRowsOf(organizationId: string, scope: PeriodScope): Promise<ChecklistExportRow[]> {
  const rows = await prisma.exception.findMany({
    where: { organizationId, periodId: scope.id },
    orderBy: [{ createdAt: 'asc' }],
    select: {
      sourceModule: true,
      sourceRef: true,
      level: true,
      status: true,
      title: true,
      authorizeNote: true,
      resolvedByUser: { select: { fullName: true } },
      createdByUser: { select: { fullName: true } },
    },
  })

  return rows.map((row) => ({
    sourceModule: row.sourceModule,
    sourceRef: row.sourceRef,
    level: row.level,
    status: row.status,
    title: row.title,
    // สคีมาไม่มีคอลัมน์ "ผู้รับผิดชอบ" — ใช้ผู้ที่ปิดรายการ ถ้ายังไม่ปิดใช้ผู้บันทึก (`34` §7.1)
    responsibleName: row.resolvedByUser?.fullName ?? row.createdByUser.fullName,
    authorizeNote: row.authorizeNote,
  }))
}

// ── POST /api/accounting/export-pack (`37` §9 · §14) ────────────────────────

const encoder = new TextEncoder()

type PackAssetKind = 'csv' | 'xlsx' | 'pdf' | 'zip'

const CONTENT_TYPE: Readonly<Record<PackAssetKind, string>> = {
  csv: 'text/csv; charset=utf-8',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  pdf: 'application/pdf',
  zip: 'application/zip',
}

export async function createExportPack(
  ctx: AccountingMutationContext,
  input: ExportPackInput,
  /** เพดาน PDF ของชุด — ค่าเริ่มต้นตาม `PACK_TAX_INVOICE_PDF_LIMIT`/`…_TIME_BUDGET_MS` (เทสต์ส่งค่าเล็กได้) */
  options: { pdfBudget?: { limit?: number; timeBudgetMs?: number; now?: () => number } } = {},
): Promise<ExportRecordDto> {
  const { actor } = ctx
  assertOrgWideReadable(actor, 'export-records')
  const period = await findPeriodById(actor, input.periodId)
  const scope = scopeOf(period)

  // ① ยามเดียวของ Export — critical ที่ยัง `open` ของ**รอบนี้เท่านั้น** (4.1 · `34` §11)
  const exceptions = await prisma.exception.findMany({
    where: { organizationId: actor.organizationId, periodId: scope.id },
    select: { id: true, level: true, status: true, title: true, sourceModule: true },
  })
  assertExportNotBlocked(exceptions)

  // ② ประกอบแถวข้อมูลของไฟล์ 01–17 (อ่านอย่างเดียว — ยิงขนานได้) · ยอดรวมควบคุม (00) คิดจากแถวชุดเดียวกันนี้
  const generatedAt = new Date()
  const expenseRecords = await expenseRecordsOf(actor.organizationId, scope)
  const [
    revenue,
    receipts,
    vouchers,
    wht,
    bank,
    adjustments,
    checklist,
    readiness,
    organization,
    creditNotes,
    customerWht,
    suspense,
    advanceReturns,
    unbilledRevenue,
    accruedExpenses,
    advanceBalances,
    companyDocuments,
  ] = await Promise.all([
    revenueRows(actor.organizationId, scope),
    cashReceiptRows(actor.organizationId, scope),
    payoutVouchersOf(actor.organizationId, expenseRecords),
    whtRows(actor.organizationId, scope),
    bankReconRows(actor.organizationId, scope),
    adjustmentRows(actor.organizationId, scope),
    checklistRowsOf(actor.organizationId, scope),
    getPeriodReadiness(actor, scope.id),
    prisma.organization.findUniqueOrThrow({ where: { id: actor.organizationId }, select: { name: true } }),
    creditNoteRows(actor.organizationId, scope),
    customerWhtRows(actor.organizationId, scope),
    suspenseRows(actor.organizationId, scope),
    advanceReturnRows(actor.organizationId, scope),
    unbilledRevenueRows(actor.organizationId, scope),
    accruedExpenseRows(actor.organizationId, scope, generatedAt),
    advanceBalanceExportRows(actor.organizationId, scope),
    companyDocumentExportRows(actor.organizationId, generatedAt),
  ])
  const expenses = expenseRows(expenseRecords, vouchers)

  // ③ PDF ใน zip — เพดานเดียวทั้งชุด (จำนวน/เวลา) เรียงตามความสำคัญ: เอกสารภาษีก่อน (มติ U57 · U94 ข้อ 5)
  const pdfBudget = createPackPdfBudget(options.pdfBudget)
  const taxInvoices = await taxInvoiceFile(actor.organizationId, scope, pdfBudget)
  const cancelledWht = await cancelledWhtCertificatesForPack(actor.organizationId, scope)
  const whtPdfs = await whtCertificatePdfs(
    actor,
    [
      ...wht.certificates.map((cert) => ({ ...cert, cancelled: false })),
      ...cancelledWht.map((cert) => ({ ...cert, cancelled: true })),
    ],
    pdfBudget,
  )
  const voucherFiles = await voucherPdfs(actor, vouchers.batches, pdfBudget)
  const billingInvoices = await billingInvoicePdfs(actor, scope, pdfBudget)

  // ④ ยอดรวมควบคุม (มติ U94 ข้อ 4) — จากแถวชุดเดียวกับที่เขียนไฟล์ ไม่ query แยก
  const controlLines = buildControlTotals({
    period: scope,
    generatedAt,
    revenue,
    cashReceipts: receipts,
    expenses,
    payments: vouchers.payments,
    wht: wht.rows,
    bank,
    adjustments,
    checklist,
    creditNotes,
    customerWht,
    suspense,
    taxInvoices: taxInvoices.rows,
    advanceReturns,
    unbilledRevenue,
    accruedExpenses,
    advanceBalances,
    companyDocuments,
  })

  const dataFiles: readonly { key: string; fileName: string; bytes: Uint8Array; kind: PackAssetKind }[] = [
    // มติ PO 06/10/2569 (U94 ข้อ 4) — ยอดรวมควบคุม
    { key: '00', fileName: packFileName('00'), bytes: encoder.encode(controlTotalsCsv(controlLines)), kind: 'csv' },
    { key: '01', fileName: packFileName('01'), bytes: encoder.encode(revenueCsv(revenue)), kind: 'csv' },
    { key: '02', fileName: packFileName('02'), bytes: encoder.encode(cashReceiptCsv(receipts)), kind: 'csv' },
    { key: '03', fileName: packFileName('03'), bytes: encoder.encode(expenseCsv(expenses)), kind: 'csv' },
    { key: '04', fileName: packFileName('04'), bytes: encoder.encode(paymentCsv(vouchers.payments)), kind: 'csv' },
    { key: '05', fileName: packFileName('05'), bytes: encoder.encode(whtCsv(wht.rows)), kind: 'csv' },
    { key: '06', fileName: packFileName('06'), bytes: encoder.encode(bankReconCsv(bank)), kind: 'csv' },
    {
      key: '07',
      fileName: packFileName('07'),
      bytes: encoder.encode(adjustmentCsv(adjustments, { yearBe: scope.yearBe, month: scope.month })),
      kind: 'csv',
    },
    {
      key: '08',
      fileName: packFileName('08'),
      bytes: buildChecklistWorkbook({
        periodLabel: scope.periodLabel,
        generatedByName: actor.fullName,
        generatedAt,
        rows: checklist,
      }),
      kind: 'xlsx',
    },
    // มติ PO 05/10/2569 (U21) — ใบลดหนี้/ใบเพิ่มหนี้ที่ออกในรอบ
    { key: '09', fileName: packFileName('09'), bytes: encoder.encode(creditNoteCsv(creditNotes)), kind: 'csv' },
    // มติ PO 05/10/2569 (U40/U41) — 50 ทวิ ที่ลูกค้าหักเรา · เงินรับรอตรวจสอบ
    { key: '10', fileName: packFileName('10'), bytes: encoder.encode(customerWhtCsv(customerWht)), kind: 'csv' },
    { key: '11', fileName: packFileName('11'), bytes: encoder.encode(suspenseCsv(suspense)), kind: 'csv' },
    // มติ PO 05/10/2569 (U57/U68) — ใบกำกับภาษีที่ออก/ยกเลิกในรอบ · รับคืนเงินทดรอง
    { key: '12', fileName: packFileName('12'), bytes: encoder.encode(taxInvoices.csv), kind: 'csv' },
    { key: '13', fileName: packFileName('13'), bytes: encoder.encode(advanceReturnCsv(advanceReturns)), kind: 'csv' },
    // มติ PO 06/10/2569 (U87) — รายได้ค้างรับ (ส่งมอบแล้ว ยังไม่วางบิล ณ เวลาสร้างชุด)
    { key: '14', fileName: packFileName('14'), bytes: encoder.encode(unbilledRevenueCsv(unbilledRevenue)), kind: 'csv' },
    // มติ PO 06/10/2569 (U94 ข้อ 2/3) — ค่าใช้จ่ายค้างจ่าย · เงินทดรองยกมา/คงเหลือ
    { key: '15', fileName: packFileName('15'), bytes: encoder.encode(accruedExpenseCsv(accruedExpenses)), kind: 'csv' },
    { key: '16', fileName: packFileName('16'), bytes: encoder.encode(advanceBalanceCsv(advanceBalances)), kind: 'csv' },
    // มติ PO 07/10/2569 (U132) — รายการเอกสารบริษัทไฟแนนซ์ (ภาพ ณ เวลาสร้างชุด)
    { key: '17', fileName: packFileName('17'), bytes: encoder.encode(companyDocumentCsv(companyDocuments)), kind: 'csv' },
  ]

  // ⑤ เวอร์ชันถัดไปของรอบ — ไฟล์เวอร์ชันเก่าไม่ถูกแตะ (`37` §6.2)
  const last = await prisma.exportRecord.findFirst({
    where: { organizationId: actor.organizationId, periodId: scope.id },
    orderBy: [{ version: 'desc' }],
    select: { version: true },
  })
  const version = (last?.version ?? 0) + 1

  // ⑥ หน้าปกอ้าง SHA-256 ของ "เนื้อไฟล์ 00–17" (คำนวณซ้ำจากไฟล์ในชุดได้ — ดู `packContentDigest()`)
  const contentDigest = packContentDigest(dataFiles.map((file) => ({ name: file.fileName, data: file.bytes })))
  const cover = await renderPackCover(
    buildPackCoverDoc({
      organizationName: organization.name,
      periodLabel: scope.periodLabel,
      version,
      generatedByName: actor.fullName,
      generatedAt,
      contentDigest,
      checks: readiness.checks,
      controlTotals: controlTotalsForCover(controlLines),
    }),
    await currentLetterhead(actor.organizationId),
  )

  const attachments = {
    tax_invoices: { attached: taxInvoices.attached, not_attached: taxInvoices.notAttached },
    wht_certificates: { attached: whtPdfs.attached, not_attached: whtPdfs.notAttached },
    vouchers: { attached: voucherFiles.attached, not_attached: voucherFiles.notAttached },
    billing_invoices: { attached: billingInvoices.attached, not_attached: billingInvoices.notAttached },
  }
  const entries: ZipEntry[] = [
    { name: PACK_COVER_FILE_NAME, data: new Uint8Array(cover) },
    ...dataFiles.map((file) => ({ name: file.fileName, data: file.bytes })),
    // PDF อยู่ใน zip เท่านั้น (ไม่อัปโหลดแยกทีละใบ — ดาวน์โหลดรายใบได้จากหน้าของเอกสารนั้น)
    ...taxInvoices.entries,
    ...whtPdfs.entries,
    ...voucherFiles.entries,
    ...billingInvoices.entries,
  ]
  const zipBytes = buildZip(entries, generatedAt)
  // key ใน Storage = ASCII ล้วน · ชื่อไทยใช้ตอนดาวน์โหลดเท่านั้น (UAT R7cv3-B01)
  const zipFileName = packZipFileName(scope.yearBe, scope.month, version)

  // ⑤ อัปโหลดทั้งชุด — `upsert: false` ⇒ ไฟล์เวอร์ชันเดิมไม่มีวันถูกทับ (Rule 09)
  // path มีชั้น "ครั้งที่พยายาม" คั่นไว้ ⇒ ความพยายามที่ล้มหลังอัปโหลด (tx ล้ม / สองคนกดพร้อมกัน)
  // ทิ้งไฟล์กำพร้าได้ แต่**ไม่บล็อกครั้งถัดไป** — ดู `packAttemptId()`
  const attempt = packAttemptId(generatedAt, randomUUID())
  const pathFor = (fileName: string): string =>
    packStoragePath({
      organizationId: actor.organizationId,
      yearBe: scope.yearBe,
      month: scope.month,
      version,
      attempt,
      fileName,
    })

  const uploads: { key: string; path: string; bytes: Uint8Array; contentType: string }[] = [
    ...dataFiles.map((file) => ({
      key: file.key,
      path: pathFor(file.fileName),
      bytes: file.bytes,
      contentType: CONTENT_TYPE[file.kind],
    })),
    {
      key: PACK_COVER_KEY,
      path: pathFor(PACK_COVER_FILE_NAME),
      bytes: new Uint8Array(cover),
      contentType: CONTENT_TYPE.pdf,
    },
    { key: PACK_ZIP_KEY, path: pathFor(zipFileName), bytes: zipBytes, contentType: CONTENT_TYPE.zip },
  ]
  await uploadAttempt(uploads)

  const fileUrls: Record<string, string> = {}
  for (const file of uploads) fileUrls[file.key] = file.path

  // ⑥ บันทึกประวัติ + audit (`37` §13 — ต้องมี version, ผู้ส่ง, รายชื่อไฟล์)
  //
  // version ถูกคำนวณนอก transaction (ขั้น ③) เพราะต้องใช้ประกอบหน้าปก/ชื่อไฟล์ก่อนอัปโหลด ⇒
  // สองคำขอพร้อมกันได้เลขเดียวกันแล้วชนกับ `uniq_export_period_version` · ข้อมูลไม่เสีย
  // (ไฟล์เดิมไม่ถูกทับ ไม่มี version ซ้ำ) แต่ต้องตอบด้วย code จาก `24` ไม่ใช่ Prisma error ดิบ 500
  const created = await prisma.$transaction(async (tx) => {
    const row = await tx.exportRecord.create({
      data: {
        organizationId: actor.organizationId,
        periodId: scope.id,
        version,
        status: 'generated',
        fileUrls,
        fileHash: sha256Hex(zipBytes),
        generatedAt,
        generatedBy: actor.id,
      },
      select: EXPORT_SELECT,
    })
    await emitAudit(
      {
        organizationId: actor.organizationId,
        actorId: actor.id,
        actorRole: actor.roleName,
        action: 'export',
        targetType: EXPORT_TARGET,
        targetId: row.id,
        before: null,
        after: {
          period: scope.periodLabel,
          version: exportVersionLabel(version),
          file_names: entries.map((entry) => entry.name),
          zip_file: zipFileName,
          attachments,
          file_hash: row.fileHash,
          content_digest: contentDigest,
        },
        reason: input.note ?? null,
        ipAddress: ctx.meta.ipAddress,
        userAgent: ctx.meta.userAgent,
      },
      tx,
    )
    return row
  }).catch(async (error: unknown) => {
    // ไม่มีแถวอ้างไฟล์ชุดนี้ ⇒ เก็บกวาดไฟล์ของครั้งนี้ทิ้ง (path มีชั้น attempt — ไม่แตะชุดของคนอื่น)
    await cleanupAttempt(uploads.map((file) => file.path))
    if (isUniqueViolation(error)) {
      throw new ExportError('EXPORT_VERSION_CONFLICT', {
        detail: `period=${scope.id} version=${version}`,
      })
    }
    throw error
  })

  return toExportDto(created, packAttachmentCount(attachments))
}


/**
 * อัปโหลดไฟล์ทั้งชุดของ "ครั้งที่พยายาม" นี้ — ล้มแม้ไฟล์เดียว ⇒ ลบไฟล์ที่ขึ้นไปแล้ว (best-effort)
 * แล้วตอบ `EXPORT_STORAGE_FAILED` (ไม่สร้าง `export_records` — ชุดไม่ครบต้องไม่ถูกอ้างถึง)
 */
async function uploadAttempt(
  uploads: readonly { path: string; bytes: Uint8Array; contentType: string }[],
): Promise<void> {
  const results = await Promise.allSettled(uploads.map((file) => uploadPackFile(file)))
  const failed = results.flatMap((result, index) =>
    result.status === 'rejected' ? [{ path: uploads[index]?.path ?? '', reason: result.reason }] : [],
  )
  if (failed.length === 0) return

  const uploaded = uploads.filter((_file, index) => results[index]?.status === 'fulfilled').map((file) => file.path)
  await cleanupAttempt(uploaded)
  const first = failed[0]
  throw new ExportError('EXPORT_STORAGE_FAILED', {
    detail: `${failed.length}/${uploads.length} ไฟล์ล้ม · ${first?.path ?? ''}: ${
      first?.reason instanceof Error ? first.reason.message : String(first?.reason)
    }`,
  })
}

async function cleanupAttempt(paths: readonly string[]): Promise<void> {
  const leftovers = await removePackFiles(paths)
  if (leftovers.length > 0) {
    console.error('[export-pack] ลบไฟล์ของครั้งที่ล้มไม่สำเร็จ — ต้องตามลบเอง', leftovers)
  }
}

/** Prisma `P2002` = ชน unique constraint — ที่นี่คือ `uniq_export_period_version` */
function isUniqueViolation(error: unknown): boolean {
  return typeof error === 'object' && error !== null && (error as { code?: string }).code === 'P2002'
}

// ── PATCH mark-sent / accept (`37` §9 · §14) ────────────────────────────────

async function transitionExport(
  ctx: AccountingMutationContext,
  id: string,
  to: ExportRecordStatus,
  input: ExportStatusInput,
): Promise<ExportRecordDto> {
  const row = await findExportRecord(ctx.actor, id)
  if (!canTransitionExport(row.status, to)) {
    throw new ExportError('EXPORT_INVALID_STATUS', { detail: `${row.status} → ${to}` })
  }

  const now = new Date()
  const updated = await prisma.$transaction(async (tx) => {
    const next = await tx.exportRecord.update({
      where: { id },
      data:
        to === 'sent'
          ? { status: to, sentAt: now, sentByUser: { connect: { id: ctx.actor.id } } }
          : { status: to, acceptedAt: now },
      select: EXPORT_SELECT,
    })
    await emitAudit(
      {
        organizationId: ctx.actor.organizationId,
        actorId: ctx.actor.id,
        actorRole: ctx.actor.roleName,
        action: 'status_change',
        targetType: EXPORT_TARGET,
        targetId: id,
        before: { status: row.status },
        after: { status: next.status, version: exportVersionLabel(next.version) },
        reason: input.note ?? null,
        ipAddress: ctx.meta.ipAddress,
        userAgent: ctx.meta.userAgent,
      },
      tx,
    )
    return next
  })

  const counts = await loadAttachmentCounts(ctx.actor.organizationId, [updated.id])
  return toExportDto(updated, counts.get(updated.id) ?? 0)
}

export async function markExportSent(
  ctx: AccountingMutationContext,
  id: string,
  input: ExportStatusInput,
): Promise<ExportRecordDto> {
  return transitionExport(ctx, id, 'sent', input)
}

export async function acceptExport(
  ctx: AccountingMutationContext,
  id: string,
  input: ExportStatusInput,
): Promise<ExportRecordDto> {
  return transitionExport(ctx, id, 'accepted', input)
}

// ── GET /api/accounting/export-history/:id/download ─────────────────────────

/** ดาวน์โหลดซ้ำเวอร์ชันไหนก็ได้ — ไฟล์เดิมที่ส่งไปจริง ไม่สร้างใหม่ (`37` §8 "ดาวน์โหลดซ้ำ") */
export async function getExportPackDownload(
  user: SessionUser,
  id: string,
): Promise<{ bytes: Uint8Array; fileName: string; fileHash: string }> {
  const row = await findExportRecord(user, id)
  const zip = fileEntriesOf(row.fileUrls).find((entry) => entry.key === PACK_ZIP_KEY)
  if (zip === undefined) {
    throw new ExportError('EXPORT_RECORD_NOT_FOUND', { detail: `export=${id} ไม่มีไฟล์ .zip ในระเบียน` })
  }

  return {
    bytes: await downloadPackFile(zip.path),
    fileName: packZipDownloadName(row.period.periodLabel, row.version),
    fileHash: row.fileHash,
  }
}
