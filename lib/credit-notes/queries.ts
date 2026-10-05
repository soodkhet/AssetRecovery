import type { AccountingMutationContext } from '@/lib/accounting/queries'
import { assertPeriodOpenAt } from '@/lib/accounting/period-guard'
import { AdjustmentError } from '@/lib/adjustments/errors'
import { emitAudit } from '@/lib/audit/audit'
import type { SessionUser } from '@/lib/auth/types'
import {
  assertAdjustmentLinkable,
  assertCreditNoteCancellable,
  assertInvoiceCreditable,
  assertIssueDateNotBeforeInvoice,
  assertWithinInvoiceBalance,
  CREDIT_NOTE_STATUS_LABEL,
  isAwaitingCreditNote,
  requireCreditNoteCancelReason,
  resolveCreditNoteAmounts,
  resolveCreditNoteVatRate,
} from '@/lib/credit-notes/credit-note'
import type { CreditNoteCancelInput, CreditNoteCreateInput, CreditNoteListQuery } from '@/lib/credit-notes/schemas'
import type {
  AwaitingCreditNoteDto,
  CreditNoteDto,
  CreditNoteListDto,
  CreditNoteSummary,
  CreditNoteTotals,
} from '@/lib/credit-notes/types'
import { Prisma } from '@/lib/generated/prisma/client'
import type { CreditNoteStatus } from '@/lib/generated/prisma/enums'
import { prisma } from '@/lib/prisma'
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
 * - ยกเลิกต้องมีเหตุผล · ห้ามลบ (trigger) · audit before/after + reason ทุกครั้ง (หมวด `tax`)
 * - สิทธิ์: บันทึก/ยกเลิก = `manage_tax_invoice` (บัญชี) · ดู = `SALES_READ_CAPABILITIES` (การเงินดูได้) — ตรวจที่ route
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
  taxInvoiceId: true,
  adjustmentId: true,
  creditNoteNumber: true,
  issueDate: true,
  amountBeforeVatSatang: true,
  vatSatang: true,
  totalSatang: true,
  vatRatePctUsed: true,
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

function toDto(row: CreditNoteRow): CreditNoteDto {
  return {
    id: row.id,
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
    reason: row.reason,
    filePath: row.filePath,
    status: row.status,
    statusLabel: CREDIT_NOTE_STATUS_LABEL[row.status],
    cancelReason: row.cancelReason,
    cancelledAt: row.cancelledAt?.toISOString() ?? null,
    cancelledByName: row.cancelledByUser?.fullName ?? null,
    createdAt: row.createdAt.toISOString(),
    createdByName: row.createdByUser.fullName,
  }
}

// ── อ่าน ────────────────────────────────────────────────────────────────────

const INVOICE_SELECT = {
  id: true,
  status: true,
  invoiceNumber: true,
  invoiceDate: true,
  salesRecord: {
    select: {
      id: true,
      billingBatchId: true,
      companyId: true,
      totalBeforeVatSatang: true,
      vatSatang: true,
      totalSatang: true,
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
    },
    select: CREDIT_NOTE_SELECT,
    orderBy: [{ issueDate: 'desc' }, { createdAt: 'desc' }],
  })
  return { items: rows.map(toDto) }
}

// ── ฟังก์ชันให้ portal / โมดูลอื่น (active เท่านั้น) ─────────────────────────

const EMPTY_TOTALS: CreditNoteTotals = { amountBeforeVatSatang: 0, vatSatang: 0, totalSatang: 0, count: 0 }

/**
 * ยอดรวมใบลดหนี้ **active** ต่อใบกำกับ (หลายใบในคำสั่งเดียว — กัน N+1) · ใบที่ไม่มีใบลดหนี้ได้ยอด 0
 * ⚠️ ไม่ตรวจสิทธิ์ — ผู้เรียก (portal/route) ต้องกรองใบกำกับตาม scope ของตัวเองมาก่อน
 */
export async function sumCreditNotesByInvoice(
  taxInvoiceIds: readonly string[],
  options: { organizationId?: string } = {},
): Promise<Map<string, CreditNoteTotals>> {
  const result = new Map<string, CreditNoteTotals>(taxInvoiceIds.map((id) => [id, { ...EMPTY_TOTALS }]))
  if (taxInvoiceIds.length === 0) return result
  const groups = await prisma.creditNote.groupBy({
    by: ['taxInvoiceId'],
    where: {
      taxInvoiceId: { in: [...taxInvoiceIds] },
      status: 'active',
      ...(options.organizationId === undefined ? {} : { organizationId: options.organizationId }),
    },
    _sum: { amountBeforeVatSatang: true, vatSatang: true, totalSatang: true },
    _count: { _all: true },
  })
  for (const group of groups) {
    result.set(group.taxInvoiceId, {
      amountBeforeVatSatang: group._sum.amountBeforeVatSatang ?? 0,
      vatSatang: group._sum.vatSatang ?? 0,
      totalSatang: group._sum.totalSatang ?? 0,
      count: group._count._all,
    })
  }
  return result
}

/** ยอดรวมใบลดหนี้ **active** ของใบกำกับหนึ่งใบ (ไม่มี = 0) — ไม่ตรวจสิทธิ์ (ดู `sumCreditNotesByInvoice`) */
export async function sumCreditNotesForInvoice(
  taxInvoiceId: string,
  options: { organizationId?: string } = {},
): Promise<CreditNoteTotals> {
  const totals = await sumCreditNotesByInvoice([taxInvoiceId], options)
  return totals.get(taxInvoiceId) ?? { ...EMPTY_TOTALS }
}

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
    select: {
      id: true,
      taxInvoiceId: true,
      creditNoteNumber: true,
      issueDate: true,
      amountBeforeVatSatang: true,
      vatSatang: true,
      totalSatang: true,
      taxInvoice: { select: { invoiceNumber: true } },
    },
    orderBy: [{ issueDate: 'asc' }, { createdAt: 'asc' }],
  })
  return rows.map((row) => ({
    id: row.id,
    taxInvoiceId: row.taxInvoiceId,
    invoiceNumber: row.taxInvoice.invoiceNumber,
    creditNoteNumber: row.creditNoteNumber,
    issueDate: row.issueDate.toISOString(),
    amountBeforeVatSatang: row.amountBeforeVatSatang,
    vatSatang: row.vatSatang,
    totalSatang: row.totalSatang,
  }))
}

/**
 * Adjustment ที่ "รอใบลดหนี้" — ลดยอด + อนุมัติแล้ว + รอบวางบิลของรายการต้นทางมีใบกำกับ active
 * + ยังไม่มีใบลดหนี้ active อ้างถึง (ป้ายในหน้า Adjustment/ใบกำกับ)
 */
export async function listAdjustmentsAwaitingCreditNote(user: SessionUser): Promise<AwaitingCreditNoteDto[]> {
  if (companyScope(user) === null) return []
  const adjustments = await prisma.adjustment.findMany({
    where: {
      organizationId: user.organizationId,
      status: 'approved',
      adjustmentType: 'decrease',
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

  const awaiting: AwaitingCreditNoteDto[] = []
  for (const row of adjustments) {
    const batchId = row.billingBatchId ?? row.revenue?.billingBatchId ?? null
    const invoice = batchId === null ? undefined : invoiceByBatch.get(batchId)
    if (batchId === null || invoice === undefined) continue
    if (
      !isAwaitingCreditNote({
        status: row.status,
        adjustmentType: row.adjustmentType,
        hasActiveInvoice: true,
        hasActiveCreditNote: row.creditNotes.length > 0,
      })
    ) {
      continue
    }
    awaiting.push({
      adjustmentId: row.id,
      taxInvoiceId: invoice.id,
      invoiceNumber: invoice.invoiceNumber,
      billingBatchId: batchId,
      amountSatang: row.amountSatang,
    })
  }
  return awaiting
}

// ── บันทึก ──────────────────────────────────────────────────────────────────

async function vatRateOfInvoice(billingBatchId: string): Promise<number> {
  const revenues = await prisma.revenue.findMany({
    where: { billingBatchId, deletedAt: null },
    select: { vatRatePctUsed: true },
  })
  return resolveCreditNoteVatRate(revenues.map((row) => row.vatRatePctUsed.toString()))
}

async function assertAdjustment(user: SessionUser, adjustmentId: string, invoice: InvoiceRow): Promise<void> {
  const adjustment = await prisma.adjustment.findFirst({
    where: { id: adjustmentId, organizationId: user.organizationId },
    select: {
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
  )
}

/** แปลง error ของ DB (unique / trigger ยอดเกิน) เป็น code ของ `24` — ไม่ปล่อย Prisma error ดิบ */
function translateDbError(error: unknown, input: { creditNoteNumber: string; adjustmentId: string | null }): unknown {
  if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
    const target = JSON.stringify(error.meta ?? {})
    if (target.includes('adjustment')) {
      return new SalesError('CREDIT_NOTE_ADJUSTMENT_MISMATCH', { detail: `adjustment=${input.adjustmentId} มีใบลดหนี้แล้ว` })
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

/**
 * `POST /api/accounting/credit-notes` — บันทึกใบลดหนี้ที่สำนักงานบัญชีออกแล้ว
 *
 * ลำดับ: ใบกำกับ (scope/สถานะ/วันที่) → งวดของวันที่ออก → Adjustment ที่อ้างถึง → อัตรา VAT เดิม + ยอด →
 * ยอดคงเหลือ → ตรวจไฟล์สแกน (นอก transaction) → insert + audit ใน transaction เดียว
 */
export async function createCreditNote(
  ctx: CreditNoteMutationContext,
  input: CreditNoteCreateInput,
): Promise<CreditNoteDto> {
  const organizationId = ctx.actor.organizationId
  const invoice = await findInvoice(ctx.actor, input.taxInvoiceId)
  assertInvoiceCreditable(invoice.status)
  assertIssueDateNotBeforeInvoice(input.issueDate, invoice.invoiceDate)

  await assertPeriodOpenAt({ organizationId, at: input.issueDate, targetType: TARGET, targetId: invoice.id })

  const adjustmentId = input.adjustmentId ?? null
  if (adjustmentId !== null) await assertAdjustment(ctx.actor, adjustmentId, invoice)

  const vatRatePct = await vatRateOfInvoice(invoice.salesRecord.billingBatchId)
  const amounts = resolveCreditNoteAmounts({
    amountBeforeVatSatang: input.amountBeforeVatSatang,
    vatSatang: input.vatSatang ?? null,
    vatRatePct,
  })

  const existing = await prisma.creditNote.findMany({
    where: { taxInvoiceId: invoice.id },
    select: { amountBeforeVatSatang: true, vatSatang: true, totalSatang: true, status: true },
  })
  assertWithinInvoiceBalance(invoice.salesRecord, existing, amounts)

  const filePath = input.filePath ?? null
  const verified = filePath === null ? null : await verifyUploadedFile(filePath, creditNoteFileRule(invoice.id))
  const creditNoteNumber = input.creditNoteNumber.trim()
  const reason = input.reason.trim()

  const created = await prisma
    .$transaction(async (tx) => {
      const row = await tx.creditNote.create({
        data: {
          organizationId,
          taxInvoiceId: invoice.id,
          adjustmentId,
          creditNoteNumber,
          issueDate: input.issueDate,
          amountBeforeVatSatang: amounts.amountBeforeVatSatang,
          vatSatang: amounts.vatSatang,
          totalSatang: amounts.totalSatang,
          vatRatePctUsed: new Prisma.Decimal(vatRatePct),
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
            credit_note_number: row.creditNoteNumber,
            issue_date: row.issueDate.toISOString(),
            tax_invoice_id: invoice.id,
            invoice_number: invoice.invoiceNumber,
            adjustment_id: adjustmentId,
            amount_before_vat_satang: row.amountBeforeVatSatang,
            vat_satang: row.vatSatang,
            total_satang: row.totalSatang,
            vat_rate_pct_used: vatRatePct,
            file_path: filePath,
            file_sha256: verified?.sha256 ?? null,
            status: row.status,
          },
          reason: `บันทึกใบลดหนี้ ${row.creditNoteNumber} อ้างใบกำกับ ${invoice.invoiceNumber} — ${reason}`,
          ipAddress: ctx.meta.ipAddress,
          userAgent: ctx.meta.userAgent,
        },
        tx,
      )
      return row
    })
    .catch((error: unknown) => {
      throw translateDbError(error, { creditNoteNumber, adjustmentId })
    })

  return toDto(created)
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

    return tx.creditNote.findUniqueOrThrow({ where: { id: row.id }, select: CREDIT_NOTE_SELECT })
  })

  return toDto(cancelled)
}
