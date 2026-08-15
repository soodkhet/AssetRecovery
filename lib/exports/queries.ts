import { renderPackCover } from '@/components/pdf/pack-cover'
import { assertExportNotBlocked } from '@/lib/accounting/exception'
import { findPeriodById, getPeriodReadiness, type AccountingMutationContext } from '@/lib/accounting/queries'
import { emitAudit } from '@/lib/audit/audit'
import type { SessionUser } from '@/lib/auth/types'
import { buildChecklistWorkbook } from '@/lib/exports/checklist-excel'
import { ExportError } from '@/lib/exports/errors'
import {
  adjustmentCsv,
  bankReconCsv,
  buildPackCoverDoc,
  canTransitionExport,
  cashReceiptCsv,
  expenseCsv,
  exportVersionLabel,
  packFileName,
  packStoragePath,
  packZipFileName,
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
  sha256Hex,
  uploadPackFile,
} from '@/lib/exports/pack-storage'
import type { ExportHistoryListQuery, ExportPackInput, ExportStatusInput } from '@/lib/exports/schemas'
import type { ExportHistoryListDto, ExportRecordDto } from '@/lib/exports/types'
import { buildZip, type ZipEntry } from '@/lib/exports/zip'
import { expenseCategoryOf } from '@/lib/expenses/expense-record'
import { signedAdjustmentSatang } from '@/lib/adjustments/adjustment'
import { Prisma, type ExportRecordStatus } from '@/lib/generated/prisma/client'
import { parseBillingPeriodLabel } from '@/lib/revenue/revenue'
import { voucherNumber } from '@/lib/payout/payout-doc'
import { prisma } from '@/lib/prisma'
import { buddhistYear } from '@/lib/format/datetime'

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
    // นับเฉพาะไฟล์หลัก 01–08 (`37` §7.1) — หน้าปกและไฟล์ .zip ไม่ใช่ "ไฟล์ข้อมูล"
    fileCount: entries.filter((entry) => /^\d{2}$/.test(entry.key)).length,
    // เอกสารแนบ (ใบเสร็จ/หลักฐาน) ยังไม่รวมในชุด — ดูหมายเหตุที่ `37` §7.1 ใน PROGRESS_ARCHIVE 4.6
    attachmentCount: 0,
    files: entries.map((entry) => ({ key: entry.key, fileName: fileNameOf(entry.path) })),
    fileHash: row.fileHash,
    zipFileName: zip === undefined ? null : fileNameOf(zip.path),
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
      expense: { select: { expenseType: true } },
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
    })),
  )
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
          payee: { select: { user: { select: { fullName: true } } } },
        },
      },
    },
  })

  const paidItemIds = new Set(rows.map((row) => row.payoutBatchItem.id))
  const out = []
  for (const batch of batches) {
    // ตัวอ้างอิงรอบเดียวกับที่พิมพ์บนเอกสาร (3.5): idempotency key ถ้ามี ไม่งั้น 8 ตัวแรกของ id
    const batchRef = batch.idempotencyKey ?? batch.id.slice(0, 8).toUpperCase()
    // `02` §8 ไม่มีคอลัมน์วันจ่ายจริง — ยึดวันสร้างไฟล์โอน เหมือนที่ไฟล์ 32 ใช้ผูกงวด (4.4)
    const paymentDate = batch.paymentFileGeneratedAt ?? batch.updatedAt
    const beYear = buddhistYear(paymentDate) ?? 0

    // จัดกลุ่มตามผู้รับเงินโดยคง**ลำดับรายการในรอบ** ให้ตรงกับตอนพิมพ์ใบสำคัญจ่าย (3.5)
    const groups = new Map<string, { payeeName: string; netSatang: number; inPeriod: boolean }>()
    for (const item of batch.items) {
      const existing = groups.get(item.payeeId)
      if (existing === undefined) {
        groups.set(item.payeeId, {
          payeeName: item.payee.user.fullName,
          netSatang: item.netSatang,
          inPeriod: paidItemIds.has(item.id),
        })
      } else {
        existing.netSatang += item.netSatang
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
      payee: { select: { nationalId: true, user: { select: { fullName: true } } } },
      expenseRecord: { select: { payoutBatchItem: { select: { whtPctSnapshot: true } } } },
    },
  })

  const exportRows: WhtExportRow[] = rows.map((row) => ({
    certificateNumber: row.certificateNumber,
    payeeName: row.payee.user.fullName,
    payeeTaxId: row.payee.nationalId,
    paymentDate: row.paymentDate,
    incomeType: row.incomeType,
    grossSatang: row.grossSatang,
    whtSatang: row.whtSatang,
    whtPct: row.expenseRecord.payoutBatchItem.whtPctSnapshot?.toString() ?? null,
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
      matchedBilling: { select: { period: true, company: { select: { name: true } } } },
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

async function adjustmentFile(organizationId: string, scope: PeriodScope): Promise<string> {
  const rows = await prisma.adjustment.findMany({
    where: {
      organizationId,
      status: 'approved',
      // รายการปรับปรุงเกิดหลังงวดเริ่มเสมอ — ตัดปีเก่าออกตั้งแต่ระดับ DB แล้วค่อยกรองตามงวดของเป้าหมาย
      createdAt: { gte: scope.start },
    },
    orderBy: [{ createdAt: 'asc' }],
    select: {
      adjustmentType: true,
      amountSatang: true,
      reason: true,
      approvedAt: true,
      approvedByUser: { select: { fullName: true } },
      revenue: { select: { revenueDate: true, case: { select: { caseRef: true } } } },
      expense: { select: { expenseDate: true, case: { select: { caseRef: true } } } },
      billingBatch: { select: { period: true, dueDate: true } },
      payoutBatch: { select: { createdAt: true, name: true } },
    },
  })

  const exportRows: AdjustmentExportRow[] = []
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

    exportRows.push({
      targetType: target.type,
      targetRef: target.ref ?? '',
      signedSatang: signedAdjustmentSatang(row.adjustmentType, row.amountSatang),
      reason: row.reason,
      approvedByName: row.approvedByUser?.fullName ?? null,
      approvedAt: row.approvedAt,
    })
  }

  return adjustmentCsv(exportRows, { yearBe: scope.yearBe, month: scope.month })
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
  const period = await findPeriodById(actor, input.periodId)
  const scope = scopeOf(period)

  // ① ยามเดียวของ Export — critical ที่ยัง `open` ของ**รอบนี้เท่านั้น** (4.1 · `34` §11)
  const exceptions = await prisma.exception.findMany({
    where: { organizationId: actor.organizationId, periodId: scope.id },
    select: { id: true, level: true, status: true, title: true, sourceModule: true },
  })
  assertExportNotBlocked(exceptions)

  // ② ประกอบเนื้อไฟล์ทั้ง 8 (อ่านอย่างเดียว — ยิงขนานได้)
  const expenseRecords = await expenseRecordsOf(actor.organizationId, scope)
  const [revenue, receipts, payments, wht, bank, adjustments, checklist, readiness, organization] =
    await Promise.all([
      revenueFile(actor.organizationId, scope),
      cashReceiptFile(actor.organizationId, scope),
      paymentFile(actor.organizationId, expenseRecords),
      whtFile(actor.organizationId, scope),
      bankReconFile(actor.organizationId, scope),
      adjustmentFile(actor.organizationId, scope),
      checklistRowsOf(actor.organizationId, scope),
      getPeriodReadiness(actor, scope.id),
      prisma.organization.findUniqueOrThrow({ where: { id: actor.organizationId }, select: { name: true } }),
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
  ]

  // ③ เวอร์ชันถัดไปของรอบ — ไฟล์เวอร์ชันเก่าไม่ถูกแตะ (`37` §6.2)
  const last = await prisma.exportRecord.findFirst({
    where: { organizationId: actor.organizationId, periodId: scope.id },
    orderBy: [{ version: 'desc' }],
    select: { version: true },
  })
  const version = (last?.version ?? 0) + 1

  // ④ หน้าปกอ้าง SHA-256 ของ "เนื้อไฟล์ 01–08" (คำนวณซ้ำจากไฟล์ในชุดได้ — ดู `packContentDigest()`)
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
  ]
  const zipBytes = buildZip(entries, generatedAt)
  const zipFileName = packZipFileName(scope.periodLabel, version)

  // ⑤ อัปโหลดทั้งชุด — `upsert: false` ⇒ ไฟล์เวอร์ชันเดิมไม่มีวันถูกทับ (Rule 09)
  const pathFor = (fileName: string): string =>
    packStoragePath({
      organizationId: actor.organizationId,
      yearBe: scope.yearBe,
      month: scope.month,
      version,
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
  await Promise.all(uploads.map((file) => uploadPackFile(file)))

  const fileUrls: Record<string, string> = {}
  for (const file of uploads) fileUrls[file.key] = file.path

  // ⑥ บันทึกประวัติ + audit (`37` §13 — ต้องมี version, ผู้ส่ง, รายชื่อไฟล์)
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
  })

  return toExportDto(created)
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

  return { bytes: await downloadPackFile(zip.path), fileName: fileNameOf(zip.path), fileHash: row.fileHash }
}
