import type { AccountingMutationContext } from '@/lib/accounting/queries'
import { PERIOD_ASSUMED_OPEN, type PeriodClosedLookup } from '@/lib/accounting/period'
import { assertPeriodOpenAt, loadPeriodClosedLookup } from '@/lib/accounting/period-guard'
import { AdjustmentError } from '@/lib/adjustments/errors'
import { emitAudit } from '@/lib/audit/audit'
import type { SessionUser } from '@/lib/auth/types'
import {
  adjustmentAmountMismatchWarning,
  assertAdjustmentLinkable,
  assertCreditNoteCancellable,
  assertInvoiceCreditable,
  assertIssueDateNotBeforeInvoice,
  assertWithinBillingOutstanding,
  assertWithinInvoiceBalance,
  AWAITING_NOTE_LABEL,
  awaitingNoteType,
  canWaiveAwaitingCreditNote,
  CREDIT_NOTE_STATUS_LABEL,
  CREDIT_NOTE_TYPE_LABEL,
  requireCreditNoteCancelReason,
  resolveCreditNoteAmounts,
  resolveCreditNoteVatRate,
} from '@/lib/credit-notes/credit-note'
import type { CreditNoteCancelInput, CreditNoteCreateInput, CreditNoteListQuery } from '@/lib/credit-notes/schemas'
import type {
  AwaitingCreditNoteDto,
  CreditNoteCreateResultDto,
  CreditNoteDto,
  CreditNoteListDto,
  CreditNoteSummary,
} from '@/lib/credit-notes/types'
import { Prisma } from '@/lib/generated/prisma/client'
import type { CreditNoteStatus, CreditNoteType } from '@/lib/generated/prisma/enums'
import { formatBranch } from '@/lib/format/branch'
import { fmtSatangSymbol } from '@/lib/format/money'
import { documentedOutstandingByBatch } from '@/lib/portal/documented-amounts'
import { prisma } from '@/lib/prisma'
import { syncBillingStatusWithDocuments } from '@/lib/revenue/billing-status-sync'
import { SalesError } from '@/lib/sales/errors'
import { creditNoteFileRule } from '@/lib/uploads/rules'
import { verifyUploadedFile } from '@/lib/uploads/verify'

/**
 * ใบลดหนี้ที่สำนักงานบัญชีออกนอกระบบ (มติ PO 05/10/2569 U14 + มติบัญชี B1 · ม.86/10) — ชั้น DB
 *
 * ### กติกาที่ห้ามหลุด
 * - ระบบ **บันทึก** เอกสารที่ออกแล้วเท่านั้น (Hybrid Accounting Boundary) — เลขที่มาจากสำนักงานบัญชี
 * - วันที่ออกอยู่ในงวดที่ล็อก ⇒ `PERIOD_LOCKED_DIRECT_EDIT` (ใบลดหนี้เป็นเอกสารของงวดที่ออก — ภาษีขาย
 *   ลดในเดือนที่ออกใบลดหนี้ · B1) ใช้ยามกลาง `assertPeriodOpenAt()` ตัวเดียวกับใบกำกับภาษี
 *   (งวด `sent_to_accountant` ก็ปฏิเสธเช่นกัน เพราะขยับยอดที่ส่งสำนักงานบัญชีแล้ว — `13` §6.11)
 * - ยอดห้ามเกินยอดคงเหลือของใบกำกับ — ตรวจที่นี่ (ข้อความดี) + trigger ระดับ DB ที่ล็อกแถวใบกำกับ (กันแข่งกัน)
 * - มติ PO U171 — ใบลดหนี้ห้ามเกิน**ยอดค้างตามเอกสาร**ของรอบวางบิล (ล็อกแถวรอบใน transaction แล้วตรวจ ⇒ `CREDIT_NOTE_EXCEEDS_OUTSTANDING`)
 * - ยกเลิกต้องมีเหตุผล · ห้ามลบ (trigger) · audit before/after + reason ทุกครั้ง (หมวด `tax`)
 * - สิทธิ์: บันทึก/ยกเลิก = `manage_tax_invoice` (บัญชี) · ดู = `SALES_READ_CAPABILITIES` (การเงินดูได้) — ตรวจที่ route
 *
 * ### ใบเพิ่มหนี้ (มติ PO 05/10/2569 U19) — ตารางเดียวกัน `note_type = 'debit'`
 * - กติกาเดียวกับใบลดหนี้ทุกข้อ (งวดล็อก/งวด sent ⇒ ปฏิเสธ · VAT อัตราใบกำกับเดิม · ยกเลิกต้องมีเหตุผล)
 *   ยกเว้น: **ไม่มีเพดาน**ยอดใบกำกับ และผูกได้เฉพาะ Adjustment `increase`
 * - ยอดตามเอกสาร = ใบกำกับ − ใบลดหนี้ + ใบเพิ่มหนี้ (`netInvoiceAmounts` / portal `documented-amounts.ts`)
 * - ยอดก่อน VAT ไม่ตรง Adjustment ที่อ้างถึง ⇒ **เตือน ไม่บล็อก** (U21) คืนใน `warnings` + audit `amount_matches_adjustment`
 */

const TARGET = 'credit_notes'

export type CreditNoteMutationContext = AccountingMutationContext

// ── scope ───────────────────────────────────────────────────────────────────

/** `null` = ไม่เห็นแถวใดเลย (ฝั่งบริษัทไม่มี scope ในโมดูลบัญชี — แนวเดียวกับ `lib/sales/queries.ts`) */
function companyScope(user: SessionUser): { companyId?: string } | null {
  const scope = user.scope
  if (scope.kind === 'global') return {}
  if (scope.kind === 'company') return scope.companyId === null ? null : { companyId: scope.companyId }
  return null
}

function invoiceWhere(user: SessionUser): Prisma.TaxInvoiceWhereInput {
  const scoped = companyScope(user)
  if (scoped === null) return { id: { in: [] } }
  return { organizationId: user.organizationId, ...(scoped.companyId === undefined ? {} : { salesRecord: { companyId: scoped.companyId } }) }
}

// ── select / mapper ─────────────────────────────────────────────────────────

const CREDIT_NOTE_SELECT = {
  id: true,
  noteType: true,
  taxInvoiceId: true,
  adjustmentId: true,
  creditNoteNumber: true,
  issueDate: true,
  amountBeforeVatSatang: true,
  vatSatang: true,
  totalSatang: true,
  vatRatePctUsed: true,
  buyerBranchCode: true,
  reason: true,
  filePath: true,
  status: true,
  cancelReason: true,
  cancelledAt: true,
  createdAt: true,
  cancelledByUser: { select: { fullName: true } },
  createdByUser: { select: { fullName: true } },
  taxInvoice: {
    select: {
      invoiceNumber: true,
      salesRecord: { select: { companyId: true, company: { select: { name: true } } } },
    },
  },
} satisfies Prisma.CreditNoteSelect

type CreditNoteRow = Prisma.CreditNoteGetPayload<{ select: typeof CREDIT_NOTE_SELECT }>

function toDto(row: CreditNoteRow, periodClosed: PeriodClosedLookup = PERIOD_ASSUMED_OPEN): CreditNoteDto {
  return {
    id: row.id,
    noteType: row.noteType,
    noteTypeLabel: CREDIT_NOTE_TYPE_LABEL[row.noteType],
    taxInvoiceId: row.taxInvoiceId,
    invoiceNumber: row.taxInvoice.invoiceNumber,
    companyId: row.taxInvoice.salesRecord.companyId,
    companyName: row.taxInvoice.salesRecord.company.name,
    adjustmentId: row.adjustmentId,
    creditNoteNumber: row.creditNoteNumber,
    issueDate: row.issueDate.toISOString(),
    amountBeforeVatSatang: row.amountBeforeVatSatang,
    vatSatang: row.vatSatang,
    totalSatang: row.totalSatang,
    vatRatePctUsed: row.vatRatePctUsed.toString(),
    buyerBranchCode: row.buyerBranchCode,
    buyerBranchLabel: formatBranch(row.buyerBranchCode),
    reason: row.reason,
    filePath: row.filePath,
    status: row.status,
    statusLabel: CREDIT_NOTE_STATUS_LABEL[row.status],
    cancelReason: row.cancelReason,
    cancelledAt: row.cancelledAt?.toISOString() ?? null,
    cancelledByName: row.cancelledByUser?.fullName ?? null,
    createdAt: row.createdAt.toISOString(),
    createdByName: row.createdByUser.fullName,
    // ยามยกเลิกใช้งวดของ `issue_date` — ตัวเดียวกับที่นี่ (UAT BUG-169)
    periodClosed: periodClosed(row.issueDate),
  }
}

// ── อ่าน ────────────────────────────────────────────────────────────────────

const INVOICE_SELECT = {
  id: true,
  status: true,
  invoiceNumber: true,
  invoiceDate: true,
  buyerBranchCode: true,
  // มติ PO U95 — ยอด/อัตราของ**ใบที่อ้างถึง** (ใบเสร็จรับเงิน/ใบกำกับภาษีหลายใบต่อรอบได้ ⇒ ไม่ใช้ยอดทั้งรอบ)
  amountBeforeVatSatang: true,
  vatSatang: true,
  totalSatang: true,
  vatRatePctUsed: true,
  salesRecord: {
    select: {
      id: true,
      billingBatchId: true,
      companyId: true,
    },
  },
} satisfies Prisma.TaxInvoiceSelect

type InvoiceRow = Prisma.TaxInvoiceGetPayload<{ select: typeof INVOICE_SELECT }>

async function findInvoice(user: SessionUser, taxInvoiceId: string): Promise<InvoiceRow> {
  const invoice = await prisma.taxInvoice.findFirst({
    where: { id: taxInvoiceId, ...invoiceWhere(user) },
    select: INVOICE_SELECT,
  })
  // นอก scope = 404 แบบไม่ leak
  if (invoice === null) throw new SalesError('TAX_INVOICE_NOT_FOUND', { detail: `tax_invoice=${taxInvoiceId}` })
  return invoice
}

/** ยามของ upload/download ไฟล์สแกน — ใบกำกับต้องอยู่ใน org + scope ของผู้เรียก */
export async function assertTaxInvoiceInScope(user: SessionUser, taxInvoiceId: string): Promise<void> {
  await findInvoice(user, taxInvoiceId)
}

/** `GET /api/accounting/credit-notes` — ทะเบียนใบลดหนี้ (รวมใบที่ยกเลิก) */
export async function listCreditNotes(user: SessionUser, query: CreditNoteListQuery): Promise<CreditNoteListDto> {
  const rows = await prisma.creditNote.findMany({
    where: {
      organizationId: user.organizationId,
      taxInvoice: invoiceWhere(user),
      ...(query.taxInvoiceId === undefined ? {} : { taxInvoiceId: query.taxInvoiceId }),
      ...(query.status === undefined ? {} : { status: query.status }),
      ...(query.noteType === undefined ? {} : { noteType: query.noteType }),
    },
    select: CREDIT_NOTE_SELECT,
    orderBy: [{ issueDate: 'desc' }, { createdAt: 'desc' }],
  })
  const periodClosed = await loadPeriodClosedLookup(user.organizationId)
  return { items: rows.map((row) => toDto(row, periodClosed)) }
}

// ── ฟังก์ชันให้ portal / โมดูลอื่น (active เท่านั้น) ─────────────────────────

// ยอดรวมใบลดหนี้ต่อใบกำกับอยู่ `lib/credit-notes/totals.ts` (กัน import วน) — re-export ให้ผู้เรียกเดิม
export { sumCreditNotesByInvoice, sumCreditNotesForInvoice } from '@/lib/credit-notes/totals'

/**
 * ใบลดหนี้ **active** ของรอบวางบิล (ผ่านรายการขาย 1:1 → ใบกำกับทุกใบของรอบ รวมใบกำกับที่ยกเลิกแล้วด้วย
 * เพราะใบลดหนี้ที่บันทึกไว้ก่อนใบกำกับถูกยกเลิกยังเป็นเอกสารที่ออกจริง) — เรียงตามวันที่ออก
 * ⚠️ ไม่ตรวจสิทธิ์ — ผู้เรียกต้องตรวจว่ารอบวางบิลอยู่ใน scope ก่อน
 */
export async function creditNotesForBillingBatch(
  billingBatchId: string,
  options: { organizationId?: string } = {},
): Promise<CreditNoteSummary[]> {
  const rows = await prisma.creditNote.findMany({
    where: {
      status: 'active',
      taxInvoice: { salesRecord: { billingBatchId } },
      ...(options.organizationId === undefined ? {} : { organizationId: options.organizationId }),
    },
    select: CREDIT_NOTE_SUMMARY_SELECT,
    orderBy: [{ issueDate: 'asc' }, { createdAt: 'asc' }],
  })
  return rows.map(toCreditNoteSummary)
}

/**
 * ใบลดหนี้ **active** แบบย่อต่อใบกำกับ (หลายใบในคำสั่งเดียว — กัน N+1) · ใบที่ไม่มีใบลดหนี้ได้รายการว่าง
 * เรียงตามวันที่ออก · ⚠️ ไม่ตรวจสิทธิ์ — ผู้เรียก (portal) ต้องกรองใบกำกับตาม scope ของตัวเองมาก่อน
 */
export async function creditNotesByInvoice(
  taxInvoiceIds: readonly string[],
  options: { organizationId?: string } = {},
): Promise<Map<string, CreditNoteSummary[]>> {
  const result = new Map<string, CreditNoteSummary[]>(taxInvoiceIds.map((id) => [id, []]))
  if (taxInvoiceIds.length === 0) return result
  const rows = await prisma.creditNote.findMany({
    where: {
      status: 'active',
      taxInvoiceId: { in: [...taxInvoiceIds] },
      ...(options.organizationId === undefined ? {} : { organizationId: options.organizationId }),
    },
    select: CREDIT_NOTE_SUMMARY_SELECT,
    orderBy: [{ issueDate: 'asc' }, { createdAt: 'asc' }, { id: 'asc' }],
  })
  for (const row of rows) result.get(row.taxInvoiceId)?.push(toCreditNoteSummary(row))
  return result
}

const CREDIT_NOTE_SUMMARY_SELECT = {
  id: true,
  noteType: true,
  taxInvoiceId: true,
  creditNoteNumber: true,
  issueDate: true,
  amountBeforeVatSatang: true,
  vatSatang: true,
  totalSatang: true,
  buyerBranchCode: true,
  taxInvoice: { select: { invoiceNumber: true } },
} as const satisfies Prisma.CreditNoteSelect

function toCreditNoteSummary(
  row: Prisma.CreditNoteGetPayload<{ select: typeof CREDIT_NOTE_SUMMARY_SELECT }>,
): CreditNoteSummary {
  return {
    id: row.id,
    noteType: row.noteType,
    taxInvoiceId: row.taxInvoiceId,
    invoiceNumber: row.taxInvoice.invoiceNumber,
    creditNoteNumber: row.creditNoteNumber,
    issueDate: row.issueDate.toISOString(),
    amountBeforeVatSatang: row.amountBeforeVatSatang,
    vatSatang: row.vatSatang,
    totalSatang: row.totalSatang,
    buyerBranchCode: row.buyerBranchCode,
  }
}

/**
 * Adjustment ที่ "รอใบลดหนี้" (ลดยอด) / "รอใบเพิ่มหนี้" (เพิ่มยอด — U19) — อนุมัติแล้ว + รอบวางบิลของรายการต้นทาง
 * มีใบกำกับ active + ยังไม่มีเอกสาร active อ้างถึง (ป้ายในหน้า Adjustment/ใบกำกับ)
 */
export async function listAdjustmentsAwaitingCreditNote(user: SessionUser): Promise<AwaitingCreditNoteDto[]> {
  if (companyScope(user) === null) return []
  const adjustments = await prisma.adjustment.findMany({
    where: {
      organizationId: user.organizationId,
      status: 'approved',
      adjustmentType: { in: ['decrease', 'increase'] },
      // staging E-016 — ปิดป้ายแล้ว (จัดการนอกระบบ) ไม่รออีก
      creditNoteWaivedAt: null,
      OR: [{ billingBatchId: { not: null } }, { revenue: { billingBatchId: { not: null } } }],
    },
    select: {
      id: true,
      status: true,
      adjustmentType: true,
      amountSatang: true,
      billingBatchId: true,
      revenue: { select: { billingBatchId: true } },
      creditNotes: { where: { status: 'active' }, select: { id: true } },
    },
  })
  const batchIds = [
    ...new Set(
      adjustments
        .map((row) => row.billingBatchId ?? row.revenue?.billingBatchId ?? null)
        .filter((id): id is string => id !== null),
    ),
  ]
  if (batchIds.length === 0) return []

  const invoices = await prisma.taxInvoice.findMany({
    where: { ...invoiceWhere(user), status: 'active', salesRecord: { billingBatchId: { in: batchIds } } },
    select: { id: true, invoiceNumber: true, salesRecord: { select: { billingBatchId: true } } },
  })
  const invoiceByBatch = new Map(invoices.map((invoice) => [invoice.salesRecord.billingBatchId, invoice]))
  const outstandingByBatch = await billOutstandingByBatch(user.organizationId, batchIds)

  const awaiting: AwaitingCreditNoteDto[] = []
  for (const row of adjustments) {
    const batchId = row.billingBatchId ?? row.revenue?.billingBatchId ?? null
    const invoice = batchId === null ? undefined : invoiceByBatch.get(batchId)
    if (batchId === null || invoice === undefined) continue
    const noteType = awaitingNoteType({
      status: row.status,
      adjustmentType: row.adjustmentType,
      hasActiveInvoice: true,
      hasActiveCreditNote: row.creditNotes.length > 0,
    })
    if (noteType === null) continue
    awaiting.push({
      adjustmentId: row.id,
      noteType,
      label: AWAITING_NOTE_LABEL[noteType],
      taxInvoiceId: invoice.id,
      invoiceNumber: invoice.invoiceNumber,
      billingBatchId: batchId,
      amountSatang: row.amountSatang,
      billOutstandingSatang: outstandingByBatch.get(batchId) ?? 0,
      canWaive: canWaiveAwaitingCreditNote({ noteType, billOutstandingSatang: outstandingByBatch.get(batchId) ?? 0 }),
    })
  }
  return awaiting
}

/** ยอดค้างตามเอกสารต่อรอบวางบิล — สูตรเดียวกับ U171 (`documentedOutstandingByBatch()`) */
async function billOutstandingByBatch(organizationId: string, batchIds: readonly string[]): Promise<Map<string, number>> {
  if (batchIds.length === 0) return new Map()
  const batches = await prisma.billingBatch.findMany({
    where: { organizationId, id: { in: [...batchIds] } },
    select: { id: true, totalSatang: true, receivedSatang: true, whtWithheldByCustomerSatang: true, bankFeeWrittenOffSatang: true },
  })
  return documentedOutstandingByBatch(organizationId, batches)
}

/**
 * `POST /api/accounting/credit-notes/awaiting/:adjustmentId/waive` (staging E-016 · มติ PO 10/10/2569)
 * ปิดป้าย "รอใบลดหนี้" ของบิลที่ชำระครบแล้ว (ออกใบลดหนี้ในระบบไม่ได้ — U171) เป็น "จัดการนอกระบบ" พร้อมเหตุผล
 * · ไม่แก้ยอด/สถานะของ Adjustment · audit พร้อมเหตุผล (ภาษี) · คิวรอใบลดหนี้/ป้ายลูกหนี้ไม่นับรายการนี้อีก
 */
export async function waiveAwaitingCreditNote(
  ctx: CreditNoteMutationContext,
  adjustmentId: string,
  input: { reason: string },
): Promise<AwaitingCreditNoteDto> {
  const reason = input.reason.trim()
  if (reason === '') throw new SalesError('CANCEL_REQUIRES_REASON', { detail: 'ปิดป้ายรอใบลดหนี้ต้องมีเหตุผล' })
  const awaiting = (await listAdjustmentsAwaitingCreditNote(ctx.actor)).find((item) => item.adjustmentId === adjustmentId)
  if (awaiting === undefined || !awaiting.canWaive) {
    throw new SalesError('CREDIT_NOTE_WAIVE_NOT_ALLOWED', {
      detail: `adjustment=${adjustmentId} outstanding=${awaiting?.billOutstandingSatang ?? 'n/a'}`,
    })
  }
  const now = new Date()
  await prisma.$transaction(async (tx) => {
    const claimed = await tx.adjustment.updateMany({
      where: { id: adjustmentId, organizationId: ctx.actor.organizationId, creditNoteWaivedAt: null },
      data: { creditNoteWaivedAt: now, creditNoteWaivedBy: ctx.actor.id, creditNoteWaiveReason: reason, updatedBy: ctx.actor.id },
    })
    if (claimed.count === 0) {
      throw new SalesError('CREDIT_NOTE_WAIVE_NOT_ALLOWED', { detail: `adjustment=${adjustmentId} already waived` })
    }
    await emitAudit(
      {
        organizationId: ctx.actor.organizationId,
        actorId: ctx.actor.id,
        actorRole: ctx.actor.roleName,
        action: 'update',
        targetType: 'adjustments',
        targetId: adjustmentId,
        before: { credit_note_waived_at: null },
        after: {
          credit_note_waived_at: now.toISOString(),
          invoice_number: awaiting.invoiceNumber,
          billing_batch_id: awaiting.billingBatchId,
          amount_satang: awaiting.amountSatang,
          bill_outstanding_satang: awaiting.billOutstandingSatang,
        },
        reason,
        ipAddress: ctx.meta.ipAddress,
        userAgent: ctx.meta.userAgent,
        diffOnly: false,
      },
      tx,
    )
  })
  return { ...awaiting, canWaive: false }
}

// ── บันทึก ──────────────────────────────────────────────────────────────────

async function vatRateOfInvoice(billingBatchId: string): Promise<number> {
  const revenues = await prisma.revenue.findMany({
    where: { billingBatchId, deletedAt: null },
    select: { vatRatePctUsed: true },
  })
  return resolveCreditNoteVatRate(revenues.map((row) => row.vatRatePctUsed.toString()))
}

/** ตรวจ Adjustment ที่อ้างถึง — คืนยอดของมัน (ไว้เทียบยอดเอกสาร · U21) */
async function assertAdjustment(
  user: SessionUser,
  adjustmentId: string,
  invoice: InvoiceRow,
  noteType: CreditNoteType,
): Promise<{ amountSatang: number }> {
  const adjustment = await prisma.adjustment.findFirst({
    where: { id: adjustmentId, organizationId: user.organizationId },
    select: {
      amountSatang: true,
      status: true,
      adjustmentType: true,
      billingBatchId: true,
      revenue: { select: { billingBatchId: true } },
      creditNotes: { where: { status: 'active' }, select: { id: true } },
    },
  })
  if (adjustment === null) throw new AdjustmentError('ADJUSTMENT_NOT_FOUND', { detail: `adjustment=${adjustmentId}` })
  assertAdjustmentLinkable(
    {
      status: adjustment.status,
      adjustmentType: adjustment.adjustmentType,
      billingBatchId: adjustment.billingBatchId ?? adjustment.revenue?.billingBatchId ?? null,
      hasActiveCreditNote: adjustment.creditNotes.length > 0,
    },
    invoice.salesRecord.billingBatchId,
    noteType,
  )
  return { amountSatang: adjustment.amountSatang }
}

/** แปลง error ของ DB (unique / trigger ยอดเกิน) เป็น code ของ `24` — ไม่ปล่อย Prisma error ดิบ */
function translateDbError(error: unknown, input: { creditNoteNumber: string; adjustmentId: string | null }): unknown {
  if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
    const target = JSON.stringify(error.meta ?? {})
    if (target.includes('adjustment')) {
      return new SalesError('CREDIT_NOTE_ADJUSTMENT_MISMATCH', { detail: `adjustment=${input.adjustmentId} มีเอกสารแล้ว` })
    }
    return new SalesError('CREDIT_NOTE_NUMBER_DUPLICATE', {
      detail: `credit_note_number=${input.creditNoteNumber}`,
      context: { creditNoteNumber: input.creditNoteNumber },
    })
  }
  const message = error instanceof Error ? error.message : ''
  if (message.includes('CREDIT_NOTE_EXCEEDS_INVOICE')) return new SalesError('CREDIT_NOTE_EXCEEDS_INVOICE', { detail: 'trigger' })
  if (message.includes('CREDIT_NOTE_INVOICE_CANCELLED')) {
    return new SalesError('TAX_INVOICE_INVALID_STATUS', { detail: 'ใบกำกับถูกยกเลิกระหว่างบันทึก' })
  }
  return error
}

type CreditNoteTx = Parameters<Parameters<typeof prisma.$transaction>[0]>[0]

/** ล็อกแถวรอบวางบิล (`FOR UPDATE`) — คำขอใบลดหนี้/ยกเลิกใบเพิ่มหนี้/รับเงินของรอบเดียวกันเข้าคิว (U171) */
async function lockBillingBatch(tx: CreditNoteTx, billingBatchId: string): Promise<void> {
  await tx.$queryRaw`SELECT id FROM billing_batches WHERE id = ${billingBatchId}::uuid FOR UPDATE`
}

/**
 * มติ PO U171 (BUG-185) — ใบลดหนี้ต้องไม่เกิน**ยอดค้างตามเอกสาร**ของรอบวางบิล ณ ตอนบันทึก ·
 * เรียกใน transaction หลังล็อกแถวรอบแล้ว ⇒ ใบที่บันทึกพร้อมกันอ่านยอดหลังใบก่อนหน้าเสมอ (ไม่ทะลุรวมกัน)
 * · ยอดค้างจาก `documentedOutstandingByBatch()` ตัวเดียวกับหน้ารายได้/พอร์ทัล (ห้ามเขียนสูตรซ้ำ)
 */
async function assertCreditWithinOutstanding(
  tx: CreditNoteTx,
  organizationId: string,
  billingBatchId: string,
  amounts: { amountBeforeVatSatang: number; vatSatang: number; totalSatang: number },
): Promise<void> {
  await lockBillingBatch(tx, billingBatchId)
  const batch = await tx.billingBatch.findFirstOrThrow({
    where: { id: billingBatchId, organizationId },
    select: {
      id: true,
      totalSatang: true,
      receivedSatang: true,
      whtWithheldByCustomerSatang: true,
      bankFeeWrittenOffSatang: true,
    },
  })
  const outstanding = await documentedOutstandingByBatch(organizationId, [batch], tx)
  assertWithinBillingOutstanding(outstanding.get(batch.id) ?? 0, amounts)
}

/**
 * `POST /api/accounting/credit-notes` — บันทึกใบลดหนี้/ใบเพิ่มหนี้ที่สำนักงานบัญชีออกแล้ว
 *
 * ลำดับ: ใบกำกับ (scope/สถานะ/วันที่) → งวดของวันที่ออก → Adjustment ที่อ้างถึง → อัตรา VAT เดิม + ยอด →
 * ยอดคงเหลือ (ใบลดหนี้เท่านั้น) → ตรวจไฟล์สแกน (นอก transaction) → insert + audit ใน transaction เดียว
 * · ยอดก่อน VAT ไม่ตรง Adjustment ⇒ บันทึกได้ + `warnings` (U21)
 */
export async function createCreditNote(
  ctx: CreditNoteMutationContext,
  // `noteType` ไม่ส่ง = ใบลดหนี้ (ผู้เรียกเดิมก่อน U19)
  input: Omit<CreditNoteCreateInput, 'noteType'> & { noteType?: CreditNoteType },
): Promise<CreditNoteCreateResultDto> {
  const organizationId = ctx.actor.organizationId
  const noteType: CreditNoteType = input.noteType ?? 'credit'
  const typeLabel = CREDIT_NOTE_TYPE_LABEL[noteType]
  const invoice = await findInvoice(ctx.actor, input.taxInvoiceId)
  assertInvoiceCreditable(invoice.status)
  assertIssueDateNotBeforeInvoice(input.issueDate, invoice.invoiceDate)

  await assertPeriodOpenAt({ organizationId, at: input.issueDate, targetType: TARGET, targetId: invoice.id })

  const adjustmentId = input.adjustmentId ?? null
  const adjustment = adjustmentId === null ? null : await assertAdjustment(ctx.actor, adjustmentId, invoice, noteType)

  // อัตราตาม snapshot บนใบ (U96 #9) · ใบเดิมหลายอัตรา (null) ⇒ อ่านจากรายได้ของรอบ (ปฏิเสธหลายอัตราตาม U21)
  const vatRatePct =
    invoice.vatRatePctUsed === null
      ? await vatRateOfInvoice(invoice.salesRecord.billingBatchId)
      : invoice.vatRatePctUsed.toNumber()
  const amounts = resolveCreditNoteAmounts({
    amountBeforeVatSatang: input.amountBeforeVatSatang,
    vatSatang: input.vatSatang ?? null,
    vatRatePct,
  })

  // ใบเพิ่มหนี้ไม่มีเพดาน (U19) — ตรวจยอดคงเหลือเฉพาะใบลดหนี้
  if (noteType === 'credit') {
    const existing = await prisma.creditNote.findMany({
      where: { taxInvoiceId: invoice.id },
      select: { amountBeforeVatSatang: true, vatSatang: true, totalSatang: true, status: true, noteType: true },
    })
    assertWithinInvoiceBalance(
      { totalBeforeVatSatang: invoice.amountBeforeVatSatang, vatSatang: invoice.vatSatang, totalSatang: invoice.totalSatang },
      existing,
      amounts,
    )
  }

  const mismatchWarning =
    adjustment === null
      ? null
      : adjustmentAmountMismatchWarning({
          noteType,
          amountBeforeVatSatang: amounts.amountBeforeVatSatang,
          adjustmentAmountSatang: adjustment.amountSatang,
          formatSatang: (satang) => fmtSatangSymbol(satang),
        })

  const filePath = input.filePath ?? null
  const verified = filePath === null ? null : await verifyUploadedFile(filePath, creditNoteFileRule(invoice.id))
  const creditNoteNumber = input.creditNoteNumber.trim()
  const reason = input.reason.trim()

  const created = await prisma
    .$transaction(async (tx) => {
      // U171 — ใบลดหนี้ ≤ ยอดค้างตามเอกสารของรอบ (ใบเพิ่มหนี้ไม่มีเพดาน)
      if (noteType === 'credit') {
        await assertCreditWithinOutstanding(tx, organizationId, invoice.salesRecord.billingBatchId, amounts)
      }
      const row = await tx.creditNote.create({
        data: {
          organizationId,
          noteType,
          taxInvoiceId: invoice.id,
          adjustmentId,
          creditNoteNumber,
          issueDate: input.issueDate,
          amountBeforeVatSatang: amounts.amountBeforeVatSatang,
          vatSatang: amounts.vatSatang,
          totalSatang: amounts.totalSatang,
          vatRatePctUsed: new Prisma.Decimal(vatRatePct),
          // มติ PO U82 (ม.86/4) — สาขาผู้ซื้อตาม snapshot บนใบกำกับเดิม (ไม่ใช่ค่าปัจจุบันของบริษัท)
          buyerBranchCode: invoice.buyerBranchCode,
          reason,
          filePath,
          fileSha256: verified?.sha256 ?? null,
          createdBy: ctx.actor.id,
        },
        select: CREDIT_NOTE_SELECT,
      })

      await emitAudit(
        {
          organizationId,
          actorId: ctx.actor.id,
          actorRole: ctx.actor.roleName,
          action: 'create',
          targetType: TARGET,
          targetId: row.id,
          after: {
            note_type: noteType,
            credit_note_number: row.creditNoteNumber,
            issue_date: row.issueDate.toISOString(),
            tax_invoice_id: invoice.id,
            invoice_number: invoice.invoiceNumber,
            adjustment_id: adjustmentId,
            // U21 — เก็บว่ายอดไม่ตรง Adjustment ที่อ้างถึง (เตือน ไม่บล็อก)
            adjustment_amount_satang: adjustment?.amountSatang ?? null,
            amount_matches_adjustment: adjustment === null ? null : mismatchWarning === null,
            amount_before_vat_satang: row.amountBeforeVatSatang,
            vat_satang: row.vatSatang,
            total_satang: row.totalSatang,
            vat_rate_pct_used: vatRatePct,
            buyer_branch_code: row.buyerBranchCode,
            file_path: filePath,
            file_sha256: verified?.sha256 ?? null,
            status: row.status,
          },
          reason: `บันทึก${typeLabel} ${row.creditNoteNumber} อ้างใบกำกับ ${invoice.invoiceNumber} — ${reason}`,
          ipAddress: ctx.meta.ipAddress,
          userAgent: ctx.meta.userAgent,
        },
        tx,
      )
      // มติ O75 — ใบเพิ่มหนี้หลังรับชำระครบ ⇒ รอบกลับเป็น `partially_paid` (ใบลดหนี้ที่ปิดยอดค้าง ⇒ `paid`)
      await syncBillingStatusWithDocuments(tx, {
        organizationId,
        billingBatchId: invoice.salesRecord.billingBatchId,
        actorId: ctx.actor.id,
        actorRole: ctx.actor.roleName,
        sourceRef: `${typeLabel} ${row.creditNoteNumber}`,
        ipAddress: ctx.meta.ipAddress,
        userAgent: ctx.meta.userAgent,
      })
      return row
    })
    .catch((error: unknown) => {
      throw translateDbError(error, { creditNoteNumber, adjustmentId })
    })

  return { ...toDto(created), warnings: mismatchWarning === null ? [] : [mismatchWarning] }
}

// ── ยกเลิก ──────────────────────────────────────────────────────────────────

/**
 * `PATCH /api/accounting/credit-notes/:id/cancel` — `active → cancelled` (ห้ามลบ ห้าม reverse)
 * ใช้เมื่อบันทึกผิด (เลขที่/ยอดไม่ตรงเอกสาร) หรือสำนักงานบัญชียกเลิกเอกสาร · งวดของวันที่ออกต้องยังไม่ล็อก
 */
export async function cancelCreditNote(
  ctx: CreditNoteMutationContext,
  creditNoteId: string,
  input: CreditNoteCancelInput,
  now: Date = new Date(),
): Promise<CreditNoteDto> {
  const row = await prisma.creditNote.findFirst({
    where: { id: creditNoteId, organizationId: ctx.actor.organizationId, taxInvoice: invoiceWhere(ctx.actor) },
    select: CREDIT_NOTE_SELECT,
  })
  if (row === null) throw new SalesError('CREDIT_NOTE_NOT_FOUND', { detail: `credit_note=${creditNoteId}` })
  assertCreditNoteCancellable(row.status)
  const reason = requireCreditNoteCancelReason(input.reason)

  await assertPeriodOpenAt({
    organizationId: ctx.actor.organizationId,
    at: row.issueDate,
    targetType: TARGET,
    targetId: row.id,
  })

  const cancelled = await prisma.$transaction(async (tx) => {
    // U171 — เข้าคิวกับการบันทึกใบลดหนี้ของรอบเดียวกัน (ยกเลิกใบเพิ่มหนี้ระหว่างตรวจยอดค้าง)
    const invoiceOfNote = await tx.taxInvoice.findUniqueOrThrow({
      where: { id: row.taxInvoiceId },
      select: { salesRecord: { select: { billingBatchId: true } } },
    })
    await lockBillingBatch(tx, invoiceOfNote.salesRecord.billingBatchId)
    const claimed = await tx.creditNote.updateMany({
      where: { id: row.id, status: 'active' },
      data: { status: 'cancelled', cancelReason: reason, cancelledBy: ctx.actor.id, cancelledAt: now, updatedBy: ctx.actor.id },
    })
    if (claimed.count === 0) {
      throw new SalesError('CREDIT_NOTE_INVALID_STATUS', { detail: 'ใบนี้ถูกยกเลิกไปแล้วโดยผู้ใช้อื่น' })
    }

    await emitAudit(
      {
        organizationId: ctx.actor.organizationId,
        actorId: ctx.actor.id,
        actorRole: ctx.actor.roleName,
        action: 'status_change',
        targetType: TARGET,
        targetId: row.id,
        before: { status: 'active' satisfies CreditNoteStatus, cancel_reason: null },
        after: {
          status: 'cancelled' satisfies CreditNoteStatus,
          cancel_reason: reason,
          cancelled_at: now.toISOString(),
          note_type: row.noteType,
          credit_note_number: row.creditNoteNumber,
          total_satang: row.totalSatang,
        },
        reason,
        ipAddress: ctx.meta.ipAddress,
        userAgent: ctx.meta.userAgent,
        diffOnly: false,
      },
      tx,
    )

    // มติ O75 — ยกเลิกเอกสารเปลี่ยนยอดตามเอกสาร ⇒ สถานะรอบตามยอดใหม่
    await syncBillingStatusWithDocuments(tx, {
      organizationId: ctx.actor.organizationId,
      billingBatchId: invoiceOfNote.salesRecord.billingBatchId,
      actorId: ctx.actor.id,
      actorRole: ctx.actor.roleName,
      sourceRef: `ยกเลิก${CREDIT_NOTE_TYPE_LABEL[row.noteType]} ${row.creditNoteNumber}`,
      ipAddress: ctx.meta.ipAddress,
      userAgent: ctx.meta.userAgent,
    })

    return tx.creditNote.findUniqueOrThrow({ where: { id: row.id }, select: CREDIT_NOTE_SELECT })
  })

  return toDto(cancelled)
}
