import { randomUUID } from 'node:crypto'
import { renderPackCover } from '@/components/pdf/pack-cover'
import { renderTaxInvoice } from '@/components/pdf/tax-invoice'
import { advanceRef } from '@/lib/advances/advance'
import { assertExportNotBlocked } from '@/lib/accounting/exception'
import {
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
  adjustmentCsv,
  adjustmentRef,
  advanceReturnCsv,
  unbilledRevenueCsv,
  taxInvoiceCsv,
  taxInvoiceNotAttachedText,
  taxInvoicePdfEntryName,
  PACK_TAX_INVOICE_NOT_ATTACHED_FILE,
  PACK_TAX_INVOICE_PDF_LIMIT,
  PACK_TAX_INVOICE_PDF_TIME_BUDGET_MS,
  type AdvanceReturnExportRow,
  type UnbilledRevenueExportRow,
  type TaxInvoiceExportRow,
  creditNoteCsv,
  customerWhtCsv,
  suspenseCsv,
  type CreditNoteExportRow,
  bankReconCsv,
  buildPackCoverDoc,
  canTransitionExport,
  cashReceiptCsv,
  expenseCsv,
  exportVersionLabel,
  packAttemptId,
  packFileName,
  packStoragePath,
  packZipFileName,
  packZipDownloadName,
  paymentCsv,
  payeesMissingTaxId,
  revenueCsv,
  whtCsv,
  EXPORT_STATUS_GROUP,
  EXPORT_STATUS_LABEL,
  PACK_COVER_FILE_NAME,
  PACK_COVER_KEY,
  PACK_ZIP_KEY,
  type AdjustmentExportRow,
  type ChecklistExportRow,
  type MatchedType,
  type WhtExportRow,
} from '@/lib/exports/pack'
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
import { voucherNumber } from '@/lib/payout/payout-doc'
import { prisma } from '@/lib/prisma'
import { buddhistYear, startOfBangkokDay } from '@/lib/format/datetime'
import { assertOrgWideReadable } from '@/lib/auth/scope'
import { customerWhtExportSources } from '@/lib/customer-wht/queries'
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

function toExportDto(row: ExportRow): ExportRecordDto {
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
    // นับเฉพาะไฟล์หลัก 01–14 (`37` §7.1) — หน้าปกและไฟล์ .zip ไม่ใช่ "ไฟล์ข้อมูล"
    fileCount: entries.filter((entry) => /^\d{2}$/.test(entry.key)).length,
    // เอกสารแนบ (ใบเสร็จ/หลักฐาน) ยังไม่รวมในชุด — ดูหมายเหตุที่ `37` §7.1 ใน PROGRESS_ARCHIVE 4.6
    attachmentCount: 0,
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
  return { items: rows.map(toExportDto) }
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

async function revenueFile(organizationId: string, scope: PeriodScope): Promise<string> {
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

  return revenueCsv(
    rows.map((row) => ({
      companyName: row.company.name,
      caseRef: row.case.caseRef,
      revenueDate: row.revenueDate,
      grossSatang: row.grossSatang,
      vatSatang: row.vatSatang,
    })),
  )
}

async function cashReceiptFile(organizationId: string, scope: PeriodScope): Promise<string> {
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

  return cashReceiptCsv(
    rows.map((row) => ({
      receivedDate: row.receivedDate,
      payerName: row.billingBatch.company.name,
      amountSatang: row.amountSatang,
      // สคีมาไม่มีคอลัมน์เลขอ้างอิงธนาคารแยก — ตัวนำเข้า statement รวมไว้ใน `description` (ดูหัวไฟล์ pack.ts)
      bankRef: row.bankTransaction?.description ?? null,
    })),
  )
}

const EXPENSE_RECORD_SELECT = {
  grossSatang: true,
  whtSatang: true,
  netSatang: true,
  payoutBatchItem: {
    select: {
      id: true,
      payoutBatchId: true,
      payeeId: true,
      expense: { select: { expenseType: true, receiptInCompanyName: true } },
      payee: { select: { user: { select: { fullName: true } } } },
      payoutBatch: { select: { name: true, idempotencyKey: true, paymentFileGeneratedAt: true, updatedAt: true } },
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

function expenseFile(rows: readonly ExpenseRecordRow[]): string {
  return expenseCsv(
    rows.map((row) => ({
      payeeName: row.payoutBatchItem.payee.user.fullName,
      // รายการที่มาจากเงินทดรอง (A4) ไม่มี `expense_type` ของตัวเอง — ตัวแปลงเดียวกับไฟล์ 32
      category: expenseCategoryOf({ expenseType: row.payoutBatchItem.expense?.expenseType ?? null }),
      grossSatang: row.grossSatang,
      whtSatang: row.whtSatang,
      netSatang: row.netSatang,
      // มติ PO U96 #14 — เฉพาะค่าที่พัก (ชนิดอื่น/เงินทดรอง = ว่าง)
      receiptInCompanyName:
        row.payoutBatchItem.expense?.expenseType === 'hotel' ? row.payoutBatchItem.expense.receiptInCompanyName : null,
    })),
  )
}

/** ตัวอ้างอิงรอบเดียวกับที่พิมพ์บนเอกสาร (3.5): idempotency key ถ้ามี ไม่งั้น 8 ตัวแรกของ id — ไฟล์ 04/13 ใช้ร่วมกัน */
function payoutBatchRefOf(batch: { id: string; idempotencyKey: string | null }): string {
  return batch.idempotencyKey ?? batch.id.slice(0, 8).toUpperCase()
}

/** `02` §8 ไม่มีคอลัมน์วันจ่ายจริง — ยึดวันสร้างไฟล์โอน เหมือนที่ไฟล์ 32 ใช้ผูกงวด (4.4) · ไฟล์ 04/13 ใช้ร่วมกัน */
function payoutPaymentDateOf(batch: { paymentFileGeneratedAt: Date | null; updatedAt: Date }): Date {
  return batch.paymentFileGeneratedAt ?? batch.updatedAt
}

/**
 * `04_Payments.csv` — 1 แถว = 1 ใบสำคัญจ่าย (ผู้รับเงิน 1 คนต่อรอบจ่าย) เพื่อให้เลขอ้างอิงตรงกับ
 * ใบสำคัญจ่ายที่พิมพ์จริงจาก 3.5 (`voucherNumber()` — ลำดับผู้รับเงินภายในรอบจ่ายนั้น)
 */
async function paymentFile(organizationId: string, rows: readonly ExpenseRecordRow[]): Promise<string> {
  const batchIds = [...new Set(rows.map((row) => row.payoutBatchItem.payoutBatchId))]
  if (batchIds.length === 0) return paymentCsv([])

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
          netSatang: true,
          advanceOffsetSatang: true,
          payee: { select: { user: { select: { fullName: true } } } },
        },
      },
    },
  })

  const paidItemIds = new Set(rows.map((row) => row.payoutBatchItem.id))
  const out = []
  for (const batch of batches) {
    const batchRef = payoutBatchRefOf(batch)
    const paymentDate = payoutPaymentDateOf(batch)
    const beYear = buddhistYear(paymentDate) ?? 0

    // จัดกลุ่มตามผู้รับเงินโดยคง**ลำดับรายการในรอบ** ให้ตรงกับตอนพิมพ์ใบสำคัญจ่าย (3.5)
    const groups = new Map<
      string,
      { payeeName: string; netSatang: number; advanceOffsetSatang: number; inPeriod: boolean }
    >()
    for (const item of batch.items) {
      const existing = groups.get(item.payeeId)
      if (existing === undefined) {
        groups.set(item.payeeId, {
          payeeName: item.payee.user.fullName,
          netSatang: item.netSatang,
          advanceOffsetSatang: item.advanceOffsetSatang,
          inPeriod: paidItemIds.has(item.id),
        })
      } else {
        existing.netSatang += item.netSatang
        existing.advanceOffsetSatang += item.advanceOffsetSatang
        existing.inPeriod = existing.inPeriod || paidItemIds.has(item.id)
      }
    }

    let voucherIndex = 0
    for (const group of groups.values()) {
      voucherIndex += 1
      // ผู้รับเงินที่รายการยังไม่ถูก sync เข้างวดนี้ (รอบคาบเกี่ยว) ไม่ต้องอยู่ในไฟล์ของงวด
      // — แต่ลำดับใบสำคัญจ่ายยังนับต่อเนื่องทั้งรอบ เพื่อให้เลขตรงกับใบที่พิมพ์จริง
      if (!group.inPeriod) continue

      out.push({
        batchRef,
        paymentDate,
        payeeName: group.payeeName,
        netSatang: group.netSatang,
        advanceOffsetSatang: group.advanceOffsetSatang,
        voucherRef: voucherNumber({ batchRef, beYear, index: voucherIndex }),
      })
    }
  }

  return paymentCsv(out)
}

async function whtFile(organizationId: string, scope: PeriodScope): Promise<string> {
  const rows = await prisma.whtCertificate.findMany({
    where: {
      organizationId,
      // ใบที่ยกเลิกไม่นับยอด (`33` §16) — ไฟล์ที่ส่งสำนักงานบัญชีจึงมีเฉพาะใบที่ยังมีผล
      status: 'active',
      expenseRecord: { periodId: scope.id },
    },
    orderBy: [{ certificateNumber: 'asc' }],
    select: {
      certificateNumber: true,
      incomeType: true,
      paymentDate: true,
      grossSatang: true,
      whtSatang: true,
      filingForm: true,
      // snapshot ผู้ถูกหัก ณ วันออกใบ (มติ PO U96 #4) — ไม่อ่านโปรไฟล์ปัจจุบัน
      payeeName: true,
      payeeNameTitle: true,
      payeeTaxId: true,
      payeeAddress: true,
      payeeBranchCode: true,
      whtCondition: true,
      expenseRecord: { select: { payoutBatchItem: { select: { whtPctSnapshot: true } } } },
    },
  })

  const exportRows: WhtExportRow[] = rows.map((row) => ({
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
  }))

  // `payee_tax_id` ต้องเป็นเลข 13 หลักล้วนทุกแถว (DEC-006/D10) — ขาดแม้แถวเดียวคือหยุด ไม่ส่งช่องว่างออกไป
  const missing = payeesMissingTaxId(exportRows)
  if (missing.length > 0) {
    throw new ExportError('EXPORT_PAYEE_TAX_ID_MISSING', {
      detail: `ผู้รับเงินที่เลขประจำตัวผู้เสียภาษีไม่ครบ ${missing.length} ราย`,
      context: { payees: missing },
    })
  }

  return whtCsv(exportRows)
}

async function bankReconFile(organizationId: string, scope: PeriodScope): Promise<string> {
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

  return bankReconCsv(
    rows.map((row) => {
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
    }),
  )
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
async function customerWhtFile(organizationId: string, scope: PeriodScope): Promise<string> {
  return customerWhtCsv(await customerWhtExportSources(organizationId, scope))
}

/**
 * `11_Suspense_Receipts.csv` (มติ PO 05/10/2569 U41) — รายการที่เคยเป็นเงินรับรอตรวจสอบ และ
 * เกิดในงวด / ยังค้างอยู่ (เกิดก่อนสิ้นงวด) / จับคู่หรือคืนเงินภายในงวด ⇒ สำนักงานบัญชีเห็นทั้งยอดยกมา ยอดเกิด
 * และยอดที่เคลียร์ในงวด (หนี้สินรอตรวจสอบ — ไม่ใช่รายได้)
 */
async function suspenseFile(organizationId: string, scope: PeriodScope): Promise<string> {
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
  return suspenseCsv(
    rows.map((row) => ({
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
    })),
  )
}

async function adjustmentFile(organizationId: string, scope: PeriodScope): Promise<string> {
  const entries = await adjustmentLogOf(organizationId, scope)
  return adjustmentCsv(
    entries.map((entry) => entry.row),
    { yearBe: scope.yearBe, month: scope.month },
  )
}

/**
 * `09_Credit_Notes.csv` (มติ PO 05/10/2569 U21) — ใบลดหนี้ + ใบเพิ่มหนี้ที่**ลงวันที่ในรอบ** (รวมใบที่ยกเลิก)
 * · `adjustment_ref` = เลขที่ของ Adjustment ที่อ้างถึงในไฟล์ 07 **ของงวดเป้าหมายของ Adjustment นั้น** (ใบลดหนี้มักออก
 *   เดือนถัดจากรายได้ที่ปรับ ⇒ หาเลขจาก log ของงวดนั้น · memo ต่องวด) · หาไม่เจอ/ไม่ผูก ⇒ `-`
 */
async function creditNoteFile(organizationId: string, scope: PeriodScope): Promise<string> {
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
      taxInvoice: { select: { invoiceNumber: true, salesRecord: { select: { company: { select: { name: true } } } } } },
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
    })
  }
  return creditNoteCsv(exportRows)
}

/** เนื้อไฟล์ `09_Credit_Notes.csv` ของงวด (ปี พ.ศ./เดือน) — ตัวเดียวกับที่ Export Pack ใช้ (เปิดให้เทสต์ระดับ DB) */
export async function buildCreditNotePackFile(organizationId: string, yearBe: number, month: number): Promise<string> {
  const range = periodRange(yearBe, month)
  return creditNoteFile(organizationId, { ...range, id: '', periodLabel: '' })
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
  options: { limit?: number; timeBudgetMs?: number; now?: () => number } = {},
): Promise<TaxInvoicePackResult> {
  const limit = options.limit ?? PACK_TAX_INVOICE_PDF_LIMIT
  const budget = options.timeBudgetMs ?? PACK_TAX_INVOICE_PDF_TIME_BUDGET_MS
  const now = options.now ?? Date.now
  const invoices = await taxInvoicesForPack(organizationId, {
    start: scope.start,
    end: scope.end,
    // วันที่ยกเลิกเป็น timestamp ⇒ ใช้ขอบวันตามเวลาไทยของงวด
    startAt: startOfBangkokDay(scope.start),
    endAt: startOfBangkokDay(scope.end),
  })

  const entries: PackPdfEntry[] = []
  const pdfFileOf = new Map<string, string>()
  const notAttached: string[] = []
  const usedNames = new Set<string>()
  const startedAt = now()
  for (const invoice of invoices) {
    if (entries.length >= limit || now() - startedAt > budget) {
      notAttached.push(invoice.source.invoiceNumber)
      continue
    }
    let name = taxInvoicePdfEntryName(invoice.source.invoiceNumber)
    // เลขที่ใบกำกับ unique อยู่แล้ว — กันชื่อชนหลังตัดอักขระ (เช่น `A/1` กับ `A_1`)
    if (usedNames.has(name)) name = name.replace(/\.pdf$/, `_${invoice.id.slice(0, 8)}.pdf`)
    usedNames.add(name)
    const pdf = await renderTaxInvoice(buildTaxInvoiceDoc(invoice.source))
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
  }))
  return { csv: taxInvoiceCsv(rows), entries, attached: pdfFileOf.size, notAttached }
}

/** เนื้อไฟล์ `12_Tax_Invoices.csv` + PDF ของงวด (ปี พ.ศ./เดือน) — ตัวเดียวกับที่ Export Pack ใช้ (เปิดให้เทสต์ระดับ DB) */
export async function buildTaxInvoicePackFiles(
  organizationId: string,
  yearBe: number,
  month: number,
  options: { limit?: number; timeBudgetMs?: number; now?: () => number } = {},
): Promise<TaxInvoicePackResult> {
  return taxInvoiceFile(organizationId, periodRange(yearBe, month), options)
}

/**
 * `13_Advance_Returns.csv` (มติ PO 05/10/2569 U68 · จาก U30) — แถวของ `advance_returns` ในงวด:
 * - หักกลบในรอบจ่าย: รายการจ่ายที่ถูกหักอยู่ในงวดนี้ (ตัวเดียวกับที่ทำให้แถวอยู่ใน `04_Payments.csv`)
 * - รับคืนแยก (เงินสด/โอน): วันที่รับเงินอยู่ในงวด
 * - กลับรายการในงวด: แสดงซ้ำพร้อมสถานะ `reversed` (เฉพาะแถวที่เคยมีผลจริง — หักกลบที่ยังไม่จ่ายไม่นับ)
 */
async function advanceReturnFile(organizationId: string, scope: PeriodScope): Promise<string> {
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
    advanceRef: advanceRef(row.advanceId),
    payeeName: row.payee.user.fullName,
    amountSatang: row.amountSatang,
    channel: row.channel,
    payoutBatchRef: row.payoutBatch === null ? null : payoutBatchRefOf(row.payoutBatch),
    evidenceFilePath: row.evidenceFilePath,
    reversedAt: row.reversedAt,
    reversalReason: row.reversalReason,
    createdAt: row.createdAt,
  }))
  exportRows.sort(
    (a, b) => a.returnDate.getTime() - b.returnDate.getTime() || a.createdAt.getTime() - b.createdAt.getTime(),
  )
  return advanceReturnCsv(exportRows)
}

/**
 * `14_Unbilled_Revenue.csv` (มติ PO 06/10/2569 U87) — รายได้ที่ `revenue_date` อยู่ในงวดหรือก่อนงวด
 * และ ณ เวลาสร้างชุดยังไม่อยู่ในรอบวางบิลที่ส่งลูกค้าแล้ว (ไม่ผูกรอบ / อยู่ในรอบร่าง / รอบถูกลบ)
 * — นิยามเดียวกับคำเตือน "รายได้ค้างรับ" ของ Readiness (`unbilledRevenueWhere()`)
 */
async function unbilledRevenueFile(organizationId: string, scope: Pick<PeriodScope, 'end'>): Promise<string> {
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
  return unbilledRevenueCsv(exportRows)
}

/** เนื้อไฟล์ `14_Unbilled_Revenue.csv` ของงวด (ปี พ.ศ./เดือน) — ตัวเดียวกับที่ Export Pack ใช้ (เปิดให้เทสต์ระดับ DB) */
export async function buildUnbilledRevenuePackFile(organizationId: string, yearBe: number, month: number): Promise<string> {
  return unbilledRevenueFile(organizationId, periodRange(yearBe, month))
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

  // ② ประกอบเนื้อไฟล์ทั้ง 14 (อ่านอย่างเดียว — ยิงขนานได้)
  const expenseRecords = await expenseRecordsOf(actor.organizationId, scope)
  const [
    revenue,
    receipts,
    payments,
    wht,
    bank,
    adjustments,
    checklist,
    readiness,
    organization,
    creditNotes,
    customerWht,
    suspense,
    taxInvoices,
    advanceReturns,
    unbilledRevenue,
  ] = await Promise.all([
      revenueFile(actor.organizationId, scope),
      cashReceiptFile(actor.organizationId, scope),
      paymentFile(actor.organizationId, expenseRecords),
      whtFile(actor.organizationId, scope),
      bankReconFile(actor.organizationId, scope),
      adjustmentFile(actor.organizationId, scope),
      checklistRowsOf(actor.organizationId, scope),
      getPeriodReadiness(actor, scope.id),
      prisma.organization.findUniqueOrThrow({ where: { id: actor.organizationId }, select: { name: true } }),
      creditNoteFile(actor.organizationId, scope),
      customerWhtFile(actor.organizationId, scope),
      suspenseFile(actor.organizationId, scope),
      taxInvoiceFile(actor.organizationId, scope),
      advanceReturnFile(actor.organizationId, scope),
      unbilledRevenueFile(actor.organizationId, scope),
    ])

  const generatedAt = new Date()
  const dataFiles: readonly { key: string; fileName: string; bytes: Uint8Array; kind: PackAssetKind }[] = [
    { key: '01', fileName: packFileName('01'), bytes: encoder.encode(revenue), kind: 'csv' },
    { key: '02', fileName: packFileName('02'), bytes: encoder.encode(receipts), kind: 'csv' },
    { key: '03', fileName: packFileName('03'), bytes: encoder.encode(expenseFile(expenseRecords)), kind: 'csv' },
    { key: '04', fileName: packFileName('04'), bytes: encoder.encode(payments), kind: 'csv' },
    { key: '05', fileName: packFileName('05'), bytes: encoder.encode(wht), kind: 'csv' },
    { key: '06', fileName: packFileName('06'), bytes: encoder.encode(bank), kind: 'csv' },
    { key: '07', fileName: packFileName('07'), bytes: encoder.encode(adjustments), kind: 'csv' },
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
    { key: '09', fileName: packFileName('09'), bytes: encoder.encode(creditNotes), kind: 'csv' },
    // มติ PO 05/10/2569 (U40/U41) — 50 ทวิ ที่ลูกค้าหักเรา · เงินรับรอตรวจสอบ
    { key: '10', fileName: packFileName('10'), bytes: encoder.encode(customerWht), kind: 'csv' },
    { key: '11', fileName: packFileName('11'), bytes: encoder.encode(suspense), kind: 'csv' },
    // มติ PO 05/10/2569 (U57/U68) — ใบกำกับภาษีที่ออก/ยกเลิกในรอบ · รับคืนเงินทดรอง
    { key: '12', fileName: packFileName('12'), bytes: encoder.encode(taxInvoices.csv), kind: 'csv' },
    { key: '13', fileName: packFileName('13'), bytes: encoder.encode(advanceReturns), kind: 'csv' },
    // มติ PO 06/10/2569 (U87) — รายได้ค้างรับ (ส่งมอบแล้ว ยังไม่วางบิล ณ เวลาสร้างชุด)
    { key: '14', fileName: packFileName('14'), bytes: encoder.encode(unbilledRevenue), kind: 'csv' },
  ]

  // ③ เวอร์ชันถัดไปของรอบ — ไฟล์เวอร์ชันเก่าไม่ถูกแตะ (`37` §6.2)
  const last = await prisma.exportRecord.findFirst({
    where: { organizationId: actor.organizationId, periodId: scope.id },
    orderBy: [{ version: 'desc' }],
    select: { version: true },
  })
  const version = (last?.version ?? 0) + 1

  // ④ หน้าปกอ้าง SHA-256 ของ "เนื้อไฟล์ 01–14" (คำนวณซ้ำจากไฟล์ในชุดได้ — ดู `packContentDigest()`)
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
    }),
  )

  const entries: ZipEntry[] = [
    { name: PACK_COVER_FILE_NAME, data: new Uint8Array(cover) },
    ...dataFiles.map((file) => ({ name: file.fileName, data: file.bytes })),
    // U57 — สำเนา PDF ใบกำกับภาษีของงวด อยู่ใน zip เท่านั้น (ไม่อัปโหลดแยกทีละใบ — ดาวน์โหลดรายใบได้จากหน้ารายการขาย)
    ...taxInvoices.entries,
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
          tax_invoice_pdfs: { attached: taxInvoices.attached, not_attached: taxInvoices.notAttached },
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

  return toExportDto(created)
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

  return toExportDto(updated)
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
