import { ensurePeriod, type AccountingMutationContext } from '@/lib/accounting/queries'
import { PERIOD_ASSUMED_OPEN, type PeriodClosedLookup } from '@/lib/accounting/period'
import { assertPeriodOpenAt, loadPeriodClosedLookup } from '@/lib/accounting/period-guard'
import { emitAudit } from '@/lib/audit/audit'
import { assertInvoiceHasNoActiveNotes } from '@/lib/credit-notes/credit-note'
import type { SessionUser } from '@/lib/auth/types'
import { Prisma } from '@/lib/generated/prisma/client'
import type {
  InvoiceDeliveryFormat,
  TaxInvoiceDocKind,
  TaxInvoiceStatus,
  VatMode,
} from '@/lib/generated/prisma/enums'
import { parseSellerProfileSnapshot, sellerProfileOf, sellerProfileSnapshotJson } from '@/lib/organization/profile'
import { prisma } from '@/lib/prisma'
import { parseBillingPeriodLabel } from '@/lib/revenue/revenue'
import { SalesError } from '@/lib/sales/errors'
import {
  assertInvoiceDateValid,
  assertVatApplicable,
  receiptInvoiceAmounts,
  receiptInvoiceDescriptionOf,
  replacementNoteOf,
  TAX_INVOICE_DOC_KIND_TITLE,
} from '@/lib/sales/receipt-invoice'
import {
  assertCancellable,
  assertNoNumberGap,
  assertTaxInvoiceFieldsComplete,
  defaultInvoiceDate,
  requireCancelReason,
  summarizeSalesAmounts,
  TAX_INVOICE_STATUS_LABEL,
  type SalesAmounts,
  type TaxInvoiceDocSource,
} from '@/lib/sales/sales'
import type {
  CashReceiptListQuery,
  SalesListQuery,
  TaxInvoiceCancelInput,
  TaxInvoiceCreateInput,
  TaxInvoiceListQuery,
} from '@/lib/sales/schemas'
import type {
  CashReceiptDto,
  CashReceiptListDto,
  SalesListDto,
  SalesRecordDto,
  TaxInvoiceDto,
  TaxInvoiceListDto,
  TaxInvoiceSummaryDto,
} from '@/lib/sales/types'
import { documentYear, formatDocumentNumber, nextDocumentSequence } from '@/lib/document-numbering/format'
import { lockDocumentSeries, nextDocumentNumber } from '@/lib/document-numbering/queries'
import { resolveVatRate } from '@/lib/settings/queries/vat-rates'

/**
 * บัญชีขาย / ใบกำกับภาษี / เงินรับ (ไฟล์ 31) — ชั้น DB (`31` §14)
 *
 * ### กติกาที่ห้ามหลุด
 * - **Sales Record 1:1 กับ Billing Batch** (`31` §6.1 · unique `sales_records.billing_batch_id`)
 *   เกิดอัตโนมัติเมื่อรอบวางบิลเปลี่ยนเป็น `sent` — `syncSalesRecordFromBilling()` **idempotent**
 *   (เรียกซ้ำได้ ไม่สร้างซ้ำ) แบบเดียวกับจุดเสียบของ 4.2
 * - **เลขที่ใบกำกับภาษีห้าม gap ห้ามซ้ำ** (`31` §6.2/§10) ⇒ ใน `$transaction` เดียวกับ insert:
 *   `SELECT … FOR UPDATE` แถวชุดเลข `tax_invoice` (`lockDocumentSeries()`) → คิดเลขที่ควรได้
 *   (`nextDocumentSequence()`) → เดินเลขจริง (`nextDocumentNumber()` — มติ PO U102) → เทียบกัน (`INVOICE_NUMBER_GAP`) — คำขอที่เข้ามาพร้อมกันจึงต่อคิว
 *   กันที่ระดับ DB (D11 · `24` §6.8) · rollback = เลขคืนอัตโนมัติ ไม่ทิ้งช่อง
 * - **ไม่มี draft** — สร้าง = `active` · ยกเลิกเป็น terminal และ**เลขเดิมไม่ recycle** (`31` §9.1)
 * - **Cash Receipt สร้างที่นี่ไม่ได้** (`31` §6.3/§10) — โมดูลนี้อ่านอย่างเดียว ตัวสร้างจริงอยู่ที่
 *   `lib/bank-recon/queries.ts` (ไฟล์ 35) ซึ่งผูก `bank_transaction_id` ไว้ให้ trace ได้
 * - ออก/ยกเลิกใบกำกับภาษีคือการแตะ**ภาษี** ⇒ ผ่านยาม `PERIOD_LOCKED_DIRECT_EDIT` เสมอ + audit
 *   ต้องมี `reason` (Rule 03 · `tax_invoices` อยู่หมวด `tax` ของ `reason-policy`)
 */

const SALES_TARGET = 'sales_records'
const TAX_INVOICE_TARGET = 'tax_invoices'

export type SalesMutationContext = AccountingMutationContext

// ── scope ───────────────────────────────────────────────────────────────────

/** `null` = ผู้ใช้ไม่มีสิทธิ์เห็นแถวใดเลย (ฝั่งบริษัทไม่มี scope ในโมดูลบัญชี — `31` §12) */
function companyScopeFilter(user: SessionUser): { companyId?: string } | null {
  const scope = user.scope
  if (scope.kind === 'global') return {}
  if (scope.kind === 'company') return scope.companyId === null ? null : { companyId: scope.companyId }
  return null
}

function scopeWhere(user: SessionUser, companyId?: string): { companyId?: string } | { id: { in: [] } } {
  const scoped = companyScopeFilter(user)
  if (scoped === null) return { id: { in: [] } }
  if (companyId === undefined) return scoped
  if (scoped.companyId !== undefined && scoped.companyId !== companyId) return { id: { in: [] } }
  return { companyId }
}

// ── select / mapper ─────────────────────────────────────────────────────────

const TAX_INVOICE_SELECT = {
  id: true,
  salesRecordId: true,
  docKind: true,
  cashReceiptId: true,
  invoiceNumber: true,
  invoiceDate: true,
  buyerBranchCode: true,
  sellerBranchCode: true,
  amountBeforeVatSatang: true,
  vatSatang: true,
  totalSatang: true,
  vatRatePctUsed: true,
  sellerName: true,
  sellerTaxId: true,
  sellerAddress: true,
  sellerPhone: true,
  sellerProfileSnapshot: true,
  buyerName: true,
  buyerTaxId: true,
  buyerAddress: true,
  buyerPhone: true,
  deliveryFormat: true,
  description: true,
  status: true,
  cancelReason: true,
  cancelledAt: true,
  createdAt: true,
  replaces: { select: { invoiceNumber: true, invoiceDate: true, cancelReason: true } },
  cashReceipt: { select: { receivedDate: true } },
  cancelledByUser: { select: { fullName: true } },
  createdByUser: { select: { fullName: true } },
} satisfies Prisma.TaxInvoiceSelect

type TaxInvoiceRow = Prisma.TaxInvoiceGetPayload<{ select: typeof TAX_INVOICE_SELECT }>

const SALES_SELECT = {
  id: true,
  periodId: true,
  companyId: true,
  billingBatchId: true,
  totalBeforeVatSatang: true,
  vatSatang: true,
  totalSatang: true,
  createdAt: true,
  period: { select: { periodLabel: true } },
  company: { select: { name: true } },
  billingBatch: { select: { period: true, batchNumber: true, status: true } },
  taxInvoices: { select: TAX_INVOICE_SELECT, orderBy: { createdAt: 'desc' } },
} satisfies Prisma.SalesRecordSelect

type SalesRow = Prisma.SalesRecordGetPayload<{ select: typeof SALES_SELECT }>

function toInvoiceSummary(row: TaxInvoiceRow, periodClosed: PeriodClosedLookup): TaxInvoiceSummaryDto {
  return {
    id: row.id,
    docKind: row.docKind,
    docTitle: TAX_INVOICE_DOC_KIND_TITLE[row.docKind],
    cashReceiptId: row.cashReceiptId,
    totalBeforeVatSatang: row.amountBeforeVatSatang,
    vatSatang: row.vatSatang,
    totalSatang: row.totalSatang,
    vatRatePctUsed: row.vatRatePctUsed?.toString() ?? null,
    replacesInvoiceNumber: row.replaces?.invoiceNumber ?? null,
    invoiceNumber: row.invoiceNumber,
    invoiceDate: row.invoiceDate.toISOString(),
    status: row.status,
    statusLabel: TAX_INVOICE_STATUS_LABEL[row.status],
    cancelReason: row.cancelReason,
    cancelledAt: row.cancelledAt?.toISOString() ?? null,
    cancelledByName: row.cancelledByUser?.fullName ?? null,
    createdAt: row.createdAt.toISOString(),
    periodClosed: periodClosed(row.invoiceDate),
  }
}

function activeInvoiceOf(row: SalesRow): TaxInvoiceRow | null {
  return row.taxInvoices.find((invoice) => invoice.status === 'active') ?? null
}

function toSalesDto(row: SalesRow, periodClosed: PeriodClosedLookup = PERIOD_ASSUMED_OPEN): SalesRecordDto {
  const active = activeInvoiceOf(row)
  return {
    id: row.id,
    periodId: row.periodId,
    periodLabel: row.period.periodLabel,
    companyId: row.companyId,
    companyName: row.company.name,
    billingBatchId: row.billingBatchId,
    billingPeriod: row.billingBatch.period,
    billingBatchNumber: row.billingBatch.batchNumber,
    billingStatus: row.billingBatch.status,
    totalBeforeVatSatang: row.totalBeforeVatSatang,
    vatSatang: row.vatSatang,
    totalSatang: row.totalSatang,
    createdAt: row.createdAt.toISOString(),
    activeTaxInvoice: active === null ? null : toInvoiceSummary(active, periodClosed),
    taxInvoices: row.taxInvoices.map((invoice) => toInvoiceSummary(invoice, periodClosed)),
    invoicedBeforeVatSatang: row.taxInvoices
      .filter((invoice) => invoice.status === 'active')
      .reduce((sum, invoice) => sum + invoice.amountBeforeVatSatang, 0),
  }
}

// ── sync จาก Billing Batch (`31` §6.1 · §9.1) ───────────────────────────────

/**
 * สร้างรายการขายของรอบวางบิลที่ส่งบิลแล้ว — **idempotent** (unique `billing_batch_id` กันซ้ำระดับ DB)
 *
 * เรียกจาก `sendBillingBatch()` (ไฟล์ 19) *หลัง* transaction ของการส่งบิล เพื่อไม่ให้ความล้มเหลว
 * ของบัญชีย้อนไปล้มการส่งบิล — เรียกซ้ำได้เสมอถ้าครั้งแรกพลาด (แนวเดียวกับจุดเสียบของ 4.2)
 */
export async function syncSalesRecordFromBilling(
  ctx: SalesMutationContext,
  billingBatchId: string,
): Promise<SalesRecordDto | null> {
  const organizationId = ctx.actor.organizationId
  const batch = await prisma.billingBatch.findFirst({
    where: { id: billingBatchId, organizationId, deletedAt: null },
    select: {
      id: true,
      companyId: true,
      period: true,
      status: true,
      revenues: {
        where: { deletedAt: null },
        select: { grossSatang: true, vatSatang: true, totalSatang: true },
      },
    },
  })
  // รอบที่ยังไม่ส่งบิลไม่ใช่ "ขาย" ในมุมบัญชี (`31` §6.1) — เงียบไว้ ไม่ใช่ error ของผู้เรียก
  if (batch === null || batch.status === 'draft') return null

  const existing = await prisma.salesRecord.findUnique({ where: { billingBatchId }, select: SALES_SELECT })
  if (existing !== null) return toSalesDto(existing)

  const key = parseBillingPeriodLabel(batch.period)
  if (key === null) throw new RangeError(`syncSalesRecordFromBilling: อ่านงวดของรอบวางบิลไม่ได้ (${batch.period})`)
  const period = await ensurePeriod(ctx, key)
  const amounts = summarizeSalesAmounts(batch.revenues)

  try {
    const created = await prisma.$transaction(async (tx) => {
      const row = await tx.salesRecord.create({
        data: {
          organizationId,
          periodId: period.id,
          billingBatchId: batch.id,
          companyId: batch.companyId,
          totalBeforeVatSatang: amounts.totalBeforeVatSatang,
          vatSatang: amounts.vatSatang,
          totalSatang: amounts.totalSatang,
          createdBy: ctx.actor.id,
        },
        select: SALES_SELECT,
      })
      await emitAudit(
        {
          organizationId,
          actorId: ctx.actor.id,
          actorRole: ctx.actor.roleName,
          action: 'create',
          targetType: SALES_TARGET,
          targetId: row.id,
          after: {
            billing_batch_id: batch.id,
            period_label: period.periodLabel,
            total_before_vat_satang: amounts.totalBeforeVatSatang,
            vat_satang: amounts.vatSatang,
            total_satang: amounts.totalSatang,
          },
          reason: `บันทึกขายอัตโนมัติเมื่อรอบวางบิล "${batch.period}" ถูกส่งบิล`,
          ipAddress: ctx.meta.ipAddress,
          userAgent: ctx.meta.userAgent,
        },
        tx,
      )
      return row
    })
    return toSalesDto(created)
  } catch (error) {
    // แข่งกันสร้างพร้อมกัน — คนที่แพ้อ่านของที่มีอยู่แล้วกลับไป (ไม่ใช่ error)
    if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== 'P2002') throw error
    const raced = await prisma.salesRecord.findUnique({ where: { billingBatchId }, select: SALES_SELECT })
    if (raced === null) throw error
    return toSalesDto(raced)
  }
}

// ── GET /api/accounting/sales ───────────────────────────────────────────────

export async function listSalesRecords(user: SessionUser, query: SalesListQuery): Promise<SalesListDto> {
  const rows = await prisma.salesRecord.findMany({
    where: {
      organizationId: user.organizationId,
      ...scopeWhere(user, query.companyId),
      ...(query.periodId === undefined ? {} : { periodId: query.periodId }),
      ...(query.invoiceState === undefined
        ? {}
        : query.invoiceState === 'issued'
          ? { taxInvoices: { some: { status: 'active' } } }
          : { taxInvoices: { none: { status: 'active' } } }),
    },
    orderBy: { createdAt: 'desc' },
    select: SALES_SELECT,
  })

  const periodClosed = await loadPeriodClosedLookup(user.organizationId)
  const items = rows.map((row) => toSalesDto(row, periodClosed))
  return {
    items,
    totalBeforeVatSatang: items.reduce((sum, item) => sum + item.totalBeforeVatSatang, 0),
    vatSatang: items.reduce((sum, item) => sum + item.vatSatang, 0),
    totalSatang: items.reduce((sum, item) => sum + item.totalSatang, 0),
    awaitingInvoiceCount: items.filter((item) => item.activeTaxInvoice === null).length,
  }
}

// ── ใบกำกับภาษี / ใบเสร็จรับเงิน/ใบกำกับภาษี ────────────────────────────────

function toInvoiceDto(
  row: TaxInvoiceRow,
  sales: SalesRow,
  periodClosed: PeriodClosedLookup = PERIOD_ASSUMED_OPEN,
): TaxInvoiceDto {
  return {
    ...toInvoiceSummary(row, periodClosed),
    salesRecordId: sales.id,
    companyId: sales.companyId,
    // U96 #4 — ชื่อผู้ซื้อตาม snapshot บนใบ (ไม่ใช่ชื่อปัจจุบันของบริษัท)
    companyName: row.buyerName,
    periodLabel: sales.period.periodLabel,
    billingBatchNumber: sales.billingBatch.batchNumber,
    createdByName: row.createdByUser.fullName,
  }
}

export async function listTaxInvoices(user: SessionUser, query: TaxInvoiceListQuery): Promise<TaxInvoiceListDto> {
  const rows = await prisma.salesRecord.findMany({
    where: {
      organizationId: user.organizationId,
      ...scopeWhere(user, query.companyId),
      ...(query.periodId === undefined ? {} : { periodId: query.periodId }),
      taxInvoices: { some: query.status === undefined ? {} : { status: query.status } },
    },
    select: SALES_SELECT,
  })
  const periodClosed = await loadPeriodClosedLookup(user.organizationId)

  const items = rows
    .flatMap((sales) =>
      sales.taxInvoices
        .filter((invoice) => query.status === undefined || invoice.status === query.status)
        .map((invoice) => toInvoiceDto(invoice, sales, periodClosed)),
    )
    .sort((left, right) => right.invoiceNumber.localeCompare(left.invoiceNumber))

  return { items }
}

/** ผู้ขาย = องค์กรเจ้าของระบบ (`31` §7.2 "ดึงจากการตั้งค่าองค์กร") — ใช้ตอน**ออกใบ**เท่านั้น (snapshot ลงใบ · U96 #4) */
async function loadSeller(organizationId: string): Promise<{
  name: string
  taxId: string
  address: string
  phone: string | null
  vatRegistered: boolean
  branchCode: string
  nameEn: string | null
  email: string | null
  website: string | null
  logoUrl: string | null
}> {
  const org = await prisma.organization.findUnique({
    where: { id: organizationId },
    select: {
      name: true,
      taxId: true,
      address: true,
      phone: true,
      vatRegistered: true,
      branchCode: true,
      // มติ PO U99 — หัวเอกสารส่วนที่ snapshot เพิ่ม
      nameEn: true,
      email: true,
      website: true,
      logoUrl: true,
    },
  })
  if (org === null) throw new Error(`loadSeller: ไม่พบองค์กร ${organizationId}`)
  return org
}

/** ผู้ซื้อ = บริษัทไฟแนนซ์ (`31` §7.2 "ดึงจากไฟล์ 10") — ใช้ตอน**ออกใบ**เท่านั้น (snapshot ลงใบ · U96 #4) */
async function loadBuyer(companyId: string): Promise<{
  name: string
  taxId: string
  branchCode: string
  address: string | null
  phone: string | null
  defaultInvoiceDeliveryFormat: InvoiceDeliveryFormat
}> {
  const company = await prisma.financeCompany.findUnique({
    where: { id: companyId },
    select: { name: true, taxId: true, branchCode: true, address: true, phone: true, defaultInvoiceDeliveryFormat: true },
  })
  if (company === null) throw new Error(`loadBuyer: ไม่พบบริษัทไฟแนนซ์ ${companyId}`)
  return company
}

type Tx = Omit<typeof prisma, '$connect' | '$disconnect' | '$on' | '$transaction' | '$extends'>

interface IssueAmounts {
  amounts: SalesAmounts
  vatRatePct: number | null
  description: string
}

/** แผนการออกเอกสาร 1 ใบ — ตรวจทุกอย่างที่ตรวจได้นอก transaction ก่อน แล้วคิดยอดจริงหลังล็อกตัวเดินเลข */
interface IssuePlan {
  docKind: TaxInvoiceDocKind
  sales: SalesRow
  cashReceiptId: string | null
  receivedDate: Date | null
  defaultDate: Date
  replaces: { id: string; invoiceNumber: string } | null
  /** คิดยอดใน transaction (หลังล็อกแถวองค์กร ⇒ ใบของรอบเดียวกันที่ออกพร้อมกันต่อคิว ยอดไม่ซ้อน) */
  amounts: (tx: Tx) => Promise<IssueAmounts>
}

const RECEIPT_SELECT = {
  id: true,
  receivedDate: true,
  amountSatang: true,
  whtWithheldByCustomerSatang: true,
  billingBatchId: true,
  billingBatch: { select: { companyId: true, period: true, batchNumber: true } },
} satisfies Prisma.CashReceiptSelect

async function loadSalesOfBatch(ctx: SalesMutationContext, billingBatchId: string): Promise<SalesRow> {
  let sales = await prisma.salesRecord.findUnique({ where: { billingBatchId }, select: SALES_SELECT })
  // sync ตอนส่งบิลล้มไว้ (เรียกซ้ำได้ — idempotent) ⇒ ลองสร้างก่อนออกใบ
  if (sales === null) {
    await syncSalesRecordFromBilling(ctx, billingBatchId)
    sales = await prisma.salesRecord.findUnique({ where: { billingBatchId }, select: SALES_SELECT })
  }
  if (sales === null) throw new SalesError('SALES_RECORD_NOT_FOUND', { detail: `billing_batch=${billingBatchId}` })
  return sales
}

async function batchVatSnapshot(billingBatchId: string): Promise<{ rates: number[]; modes: VatMode[] }> {
  const revenues = await prisma.revenue.findMany({
    where: { billingBatchId, deletedAt: null },
    select: { vatRatePctUsed: true, vatModeSnapshot: true },
  })
  return {
    rates: revenues.map((row) => row.vatRatePctUsed.toNumber()),
    modes: [...new Set(revenues.map((row) => row.vatModeSnapshot))],
  }
}

/** แผนใบเสร็จรับเงิน/ใบกำกับภาษีของเงินรับ (U95) */
async function planReceiptInvoice(
  ctx: SalesMutationContext,
  cashReceiptId: string,
  forcedReplaces: { id: string; invoiceNumber: string } | null,
): Promise<IssuePlan> {
  const organizationId = ctx.actor.organizationId
  const scoped = scopeWhere(ctx.actor)
  const billingWhere: Prisma.BillingBatchWhereInput = 'id' in scoped ? { id: { in: [] } } : scoped
  const receipt = await prisma.cashReceipt.findFirst({
    where: { id: cashReceiptId, organizationId, billingBatch: billingWhere },
    select: RECEIPT_SELECT,
  })
  if (receipt === null) throw new SalesError('CASH_RECEIPT_NOT_FOUND', { detail: `cash_receipt=${cashReceiptId}` })

  const active = await prisma.taxInvoice.findFirst({
    where: { cashReceiptId, status: 'active' },
    select: { invoiceNumber: true },
  })
  if (active !== null) {
    throw new SalesError('TAX_INVOICE_ALREADY_ISSUED', {
      detail: `มี ${active.invoiceNumber} ใช้งานอยู่`,
      context: { invoiceNumber: active.invoiceNumber },
    })
  }

  const sales = await loadSalesOfBatch(ctx, receipt.billingBatchId)
  const vat = await batchVatSnapshot(receipt.billingBatchId)
  // U96 #3 — ตรวจก่อนหาอัตรา (บริษัท no_vat อาจไม่มีอัตราในระบบเลย)
  if (vat.modes.includes('no_vat')) assertVatApplicable({ vatModes: vat.modes, vatRatePct: 0, vatSatang: 0 })
  // U96 #9 — อัตรา ณ จุดความรับผิด = วันรับเงิน (ไม่ใช่อัตราใน snapshot รายได้ตอนวางบิล)
  const vatRatePct = (await resolveVatRate(organizationId, receipt.receivedDate)).ratePct

  const replaces =
    forcedReplaces ??
    (await prisma.taxInvoice.findFirst({
      where: { cashReceiptId, status: 'cancelled', replacedBy: { none: {} } },
      orderBy: { createdAt: 'desc' },
      select: { id: true, invoiceNumber: true },
    }))

  return {
    docKind: 'receipt_tax_invoice',
    sales,
    cashReceiptId: receipt.id,
    receivedDate: receipt.receivedDate,
    defaultDate: receipt.receivedDate,
    replaces,
    amounts: async (tx) => {
      // ตรวจซ้ำหลังล็อก — คำขอที่ต่อคิวมาหลังอีกคนออกใบของเงินรับนี้ไปแล้วต้องได้ code ที่ตรงความจริง
      const raced = await tx.taxInvoice.findFirst({
        where: { cashReceiptId, status: 'active' },
        select: { invoiceNumber: true },
      })
      if (raced !== null) {
        throw new SalesError('TAX_INVOICE_ALREADY_ISSUED', {
          detail: `มี ${raced.invoiceNumber} ใช้งานอยู่ (ออกโดยคำขออื่นพร้อมกัน)`,
          context: { invoiceNumber: raced.invoiceNumber },
        })
      }
      const prior = await tx.taxInvoice.findMany({
        where: { salesRecordId: sales.id, status: 'active' },
        select: { amountBeforeVatSatang: true, vatSatang: true, vatRatePctUsed: true },
      })
      const computed = receiptInvoiceAmounts({
        basis: {
          billedBeforeVatSatang: sales.totalBeforeVatSatang,
          billedVatSatang: sales.vatSatang,
          billedVatRatesPct: vat.rates,
        },
        prior: prior.map((row) => ({
          amountBeforeVatSatang: row.amountBeforeVatSatang,
          vatSatang: row.vatSatang,
          vatRatePct: row.vatRatePctUsed === null ? null : row.vatRatePctUsed.toNumber(),
        })),
        // ภาษีที่ลูกค้าหัก ณ ที่จ่ายนับเป็นการรับชำระ (U95)
        paidSatang: receipt.amountSatang + receipt.whtWithheldByCustomerSatang,
        vatRatePct,
      })
      assertVatApplicable({ vatModes: vat.modes, vatRatePct, vatSatang: computed.vatSatang })
      return {
        amounts: {
          totalBeforeVatSatang: computed.totalBeforeVatSatang,
          vatSatang: computed.vatSatang,
          totalSatang: computed.totalSatang,
        },
        vatRatePct,
        description: receiptInvoiceDescriptionOf({
          periodLabel: receipt.billingBatch.period,
          billingBatchNumber: receipt.billingBatch.batchNumber,
          coversRemainder: computed.coversRemainder,
        }),
      }
    },
  }
}

/** แผนออกแทนใบที่ยกเลิกแล้ว (U96 #8) — ใบเสร็จฯ ⇒ คิดจากเงินรับเดิม · ใบแบบเดิม ⇒ ยอด/อัตรา/รายการเดิม */
async function planReplacement(ctx: SalesMutationContext, replacesInvoiceId: string, today: Date): Promise<IssuePlan> {
  const { invoice, sales } = await findTaxInvoice(ctx.actor, replacesInvoiceId)
  if (invoice.status !== 'cancelled') {
    throw new SalesError('TAX_INVOICE_INVALID_STATUS', {
      detail: `replace at ${invoice.status}`,
      message: 'ออกใบแทนได้เฉพาะใบที่ยกเลิกแล้วเท่านั้น',
    })
  }
  const already = await prisma.taxInvoice.findFirst({
    where: { replacesTaxInvoiceId: invoice.id },
    select: { invoiceNumber: true },
  })
  if (already !== null) {
    throw new SalesError('TAX_INVOICE_ALREADY_ISSUED', {
      detail: `ออกแทนแล้วด้วย ${already.invoiceNumber}`,
      message: `ใบนี้ถูกออกแทนแล้วด้วยเลขที่ ${already.invoiceNumber}`,
    })
  }
  const replaces = { id: invoice.id, invoiceNumber: invoice.invoiceNumber }

  if (invoice.docKind === 'receipt_tax_invoice') {
    if (invoice.cashReceiptId === null) {
      throw new SalesError('CASH_RECEIPT_NOT_FOUND', { detail: `tax_invoice=${invoice.id} เงินรับถูกถอนแล้ว` })
    }
    return planReceiptInvoice(ctx, invoice.cashReceiptId, replaces)
  }

  const vat = await batchVatSnapshot(sales.billingBatchId)
  const vatRatePct = invoice.vatRatePctUsed === null ? null : invoice.vatRatePctUsed.toNumber()
  return {
    docKind: 'tax_invoice',
    sales,
    cashReceiptId: null,
    receivedDate: null,
    defaultDate: today,
    replaces,
    amounts: async () => {
      assertVatApplicable({ vatModes: vat.modes, vatRatePct: vatRatePct ?? 1, vatSatang: invoice.vatSatang })
      return {
        amounts: {
          totalBeforeVatSatang: invoice.amountBeforeVatSatang,
          vatSatang: invoice.vatSatang,
          totalSatang: invoice.totalSatang,
        },
        vatRatePct,
        description: invoice.description,
      }
    },
  }
}

/**
 * `POST /api/accounting/tax-invoices` (`31` §14 · มติ PO U95) — ออกเอกสารภาษี (สร้าง = ออกทันที)
 *
 * - `cashReceiptId` ⇒ **ใบเสร็จรับเงิน/ใบกำกับภาษี** ของเงินรับ: ยอดตามเงินที่รับ (+ภาษีที่ลูกค้าหัก) ·
 *   VAT อัตรา ณ วันรับเงิน · วันที่เอกสาร = วันรับเงิน (เลื่อนได้แต่ไม่ก่อนวันรับเงิน)
 * - `replacesInvoiceId` ⇒ ออกแทนใบที่ยกเลิกแล้ว (พิมพ์ "ออกแทนฉบับเลขที่ …")
 *
 * ลำดับสำคัญ: ตรวจสิทธิ์/สถานะ/งวด **ก่อน** แตะตัวเดินเลข · ใน `$transaction`: ล็อกแถวองค์กร `FOR UPDATE` →
 * ตรวจวันที่เทียบเลขก่อนหน้า (U96 #7) → คิดยอด (ใบของรอบเดียวกันต่อคิวกัน) → ฟิลด์บังคับ → เดินเลข → insert
 * พร้อม snapshot คู่ค้า (U96 #4) → audit — rollback ทั้งก้อน เลขไม่ขาด
 */
export async function issueTaxInvoice(
  ctx: SalesMutationContext,
  input: TaxInvoiceCreateInput,
  now: Date = new Date(),
): Promise<TaxInvoiceDto> {
  const organizationId = ctx.actor.organizationId
  const today = defaultInvoiceDate(now)
  const plan =
    input.cashReceiptId !== undefined
      ? await planReceiptInvoice(ctx, input.cashReceiptId, null)
      : await planReplacement(ctx, input.replacesInvoiceId ?? '', today)
  const { sales } = plan
  const invoiceDate = input.invoiceDate ?? plan.defaultDate

  await assertPeriodOpenAt({ organizationId, at: invoiceDate, targetType: TAX_INVOICE_TARGET, targetId: sales.id })

  const [seller, buyer] = await Promise.all([loadSeller(organizationId), loadBuyer(sales.companyId)])
  const title = TAX_INVOICE_DOC_KIND_TITLE[plan.docKind]

  const created = await prisma
    .$transaction(async (tx) => {
      // ล็อกแถวชุดเลขก่อนอ่านตัวนับ ⇒ คำขอที่เข้ามาพร้อมกันต่อคิวกันจริง (D11 · มติ PO U102)
      const series = await lockDocumentSeries(tx, organizationId, 'tax_invoice')
      const expected = nextDocumentSequence(series, invoiceDate)

      // U96 #7 — วันที่ ≤ วันนี้ · ≥ วันที่ของเอกสาร**เลขก่อนหน้า**ในชุดเดียวกัน (รวมใบที่ยกเลิก) · ≥ วันรับเงิน
      const previous =
        expected <= 1
          ? null
          : await tx.taxInvoice.findFirst({
              where: { organizationId, invoiceNumber: formatDocumentNumber(series, expected - 1, documentYear(invoiceDate)) },
              select: { invoiceNumber: true, invoiceDate: true },
            })
      assertInvoiceDateValid({
        invoiceDate,
        today,
        previousInvoiceDate: previous?.invoiceDate ?? null,
        previousInvoiceNumber: previous?.invoiceNumber ?? null,
        notBefore: plan.receivedDate,
      })

      const issue = await plan.amounts(tx)
      assertTaxInvoiceFieldsComplete({
        seller: { name: seller.name, taxId: seller.taxId, address: seller.address },
        sellerVatRegistered: seller.vatRegistered,
        buyer: { name: buyer.name, taxId: buyer.taxId, address: buyer.address },
        description: issue.description,
        amounts: issue.amounts,
      })

      const reserved = await nextDocumentNumber(tx, organizationId, 'tax_invoice', invoiceDate)
      assertNoNumberGap(reserved.sequence, expected - 1)

      const invoice = await tx.taxInvoice.create({
        data: {
          organizationId,
          salesRecordId: sales.id,
          docKind: plan.docKind,
          cashReceiptId: plan.cashReceiptId,
          replacesTaxInvoiceId: plan.replaces?.id ?? null,
          invoiceNumber: reserved.number,
          invoiceDate,
          amountBeforeVatSatang: issue.amounts.totalBeforeVatSatang,
          vatSatang: issue.amounts.vatSatang,
          totalSatang: issue.amounts.totalSatang,
          vatRatePctUsed: issue.vatRatePct === null ? null : new Prisma.Decimal(issue.vatRatePct),
          // U96 #4 — snapshot คู่ค้า ณ ตอนออก (แก้บริษัท/องค์กรภายหลัง ใบเดิมไม่เปลี่ยน)
          sellerName: seller.name,
          sellerTaxId: seller.taxId,
          sellerAddress: seller.address,
          sellerPhone: seller.phone,
          buyerName: buyer.name,
          buyerTaxId: buyer.taxId,
          buyerAddress: buyer.address ?? '',
          buyerPhone: buyer.phone,
          deliveryFormat: buyer.defaultInvoiceDeliveryFormat,
          description: issue.description,
          // มติ PO U77/U82 (ม.86/4) — snapshot สำนักงานใหญ่/สาขาของผู้ซื้อ/ผู้ขาย ณ ตอนออกใบ
          buyerBranchCode: buyer.branchCode,
          sellerBranchCode: seller.branchCode,
          // มติ PO U99 — หัวเอกสาร (ชื่ออังกฤษ/อีเมล/เว็บไซต์/โลโก้) ณ ตอนออก · แก้ข้อมูลองค์กรภายหลังใบนี้ไม่เปลี่ยน
          sellerProfileSnapshot: sellerProfileSnapshotJson(sellerProfileOf(seller)),
          createdBy: ctx.actor.id,
        },
        select: TAX_INVOICE_SELECT,
      })

      await emitAudit(
        {
          organizationId,
          actorId: ctx.actor.id,
          actorRole: ctx.actor.roleName,
          action: 'create',
          targetType: TAX_INVOICE_TARGET,
          targetId: invoice.id,
          after: {
            doc_kind: invoice.docKind,
            invoice_number: invoice.invoiceNumber,
            invoice_date: invoice.invoiceDate.toISOString(),
            cash_receipt_id: invoice.cashReceiptId,
            received_date: plan.receivedDate?.toISOString() ?? null,
            replaces_tax_invoice_id: plan.replaces?.id ?? null,
            replaces_invoice_number: plan.replaces?.invoiceNumber ?? null,
            amount_before_vat_satang: invoice.amountBeforeVatSatang,
            vat_satang: invoice.vatSatang,
            total_satang: invoice.totalSatang,
            vat_rate_pct_used: invoice.vatRatePctUsed?.toString() ?? null,
            buyer_name: invoice.buyerName,
            buyer_tax_id: invoice.buyerTaxId,
            buyer_branch_code: invoice.buyerBranchCode,
            seller_tax_id: invoice.sellerTaxId,
            seller_branch_code: invoice.sellerBranchCode,
            status: invoice.status,
            sales_record_id: sales.id,
          },
          reason:
            `ออก${title} ${invoice.invoiceNumber} ให้ ${buyer.name} รอบ ${sales.billingBatch.period}` +
            (plan.replaces === null ? '' : ` (ออกแทน ${plan.replaces.invoiceNumber})`),
          ipAddress: ctx.meta.ipAddress,
          userAgent: ctx.meta.userAgent,
        },
        tx,
      )

      return invoice
    })
    .catch((error: unknown) => {
      // แข่งกันออกใบพร้อมกัน (เงินรับเดียวกัน / ใบแทนใบเดียวกัน) — partial unique ที่ DB เป็นคนตัดสิน
      // ⇒ คนที่แพ้ต้องได้ code ของ `24` ไม่ใช่ Prisma error ดิบ (เลขไม่ขาดเพราะจองเลขใน transaction เดียวกัน)
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new SalesError('TAX_INVOICE_ALREADY_ISSUED', {
          detail: `เอกสารของรายการขาย ${sales.id} ถูกออกโดยคำขออื่นพร้อมกัน`,
          context: { salesRecordId: sales.id },
        })
      }
      throw error
    })

  return toInvoiceDto(created, sales)
}

async function findTaxInvoice(user: SessionUser, invoiceId: string): Promise<{ invoice: TaxInvoiceRow; sales: SalesRow }> {
  const invoice = await prisma.taxInvoice.findFirst({
    where: { id: invoiceId, organizationId: user.organizationId },
    select: { ...TAX_INVOICE_SELECT, salesRecord: { select: SALES_SELECT } },
  })
  if (invoice === null) throw new SalesError('TAX_INVOICE_NOT_FOUND', { detail: `tax_invoice=${invoiceId}` })

  const scoped = companyScopeFilter(user)
  // นอก scope = 404 แบบไม่ leak ว่ามีอยู่จริง (`25` — Company User ไม่มีสิทธิ์เห็นเอกสารบัญชี)
  if (scoped === null || (scoped.companyId !== undefined && scoped.companyId !== invoice.salesRecord.companyId)) {
    throw new SalesError('TAX_INVOICE_NOT_FOUND', { detail: `tax_invoice=${invoiceId} out of scope` })
  }

  const { salesRecord, ...rest } = invoice
  return { invoice: rest, sales: salesRecord }
}

/**
 * `PATCH /api/accounting/tax-invoices/:id/cancel` (`31` §14) — `active → cancelled`
 *
 * ยกเลิก **ไม่ใช่ลบ**: แถวเดิมอยู่ครบพร้อมเลขที่เดิม (`02` §13 immutable) — ออกใบใหม่ได้เลขถัดไป
 * ไม่ recycle เลขเดิม (`31` §9.1 · เทสต์เคส "ยกเลิก 005 ⇒ ใบใหม่ได้ 006")
 *
 * มติ PO 05/10/2569 U18 — ใบที่ยังมีใบลดหนี้/ใบเพิ่มหนี้ `active` ยกเลิกไม่ได้ (`TAX_INVOICE_HAS_ACTIVE_NOTES`
 * บอกเลขเอกสารที่ต้องยกเลิกก่อน) · ตรวจซ้ำใน transaction หลังยึดแถวใบกำกับแล้ว — trigger ของ `credit_notes`
 * ล็อกแถวใบกำกับ `FOR UPDATE` ก่อน insert ⇒ บันทึกเอกสารพร้อมกับกดยกเลิกไม่หลุดทั้งสองทาง
 */
export async function cancelTaxInvoice(
  ctx: SalesMutationContext,
  invoiceId: string,
  input: TaxInvoiceCancelInput,
  now: Date = new Date(),
): Promise<TaxInvoiceDto> {
  const { invoice, sales } = await findTaxInvoice(ctx.actor, invoiceId)
  assertCancellable(invoice.status)
  const reason = requireCancelReason(input.reason)
  assertInvoiceHasNoActiveNotes(await prisma.creditNote.findMany(activeNotesQuery(invoice.id)))

  await assertPeriodOpenAt({
    organizationId: ctx.actor.organizationId,
    at: invoice.invoiceDate,
    targetType: TAX_INVOICE_TARGET,
    targetId: invoice.id,
  })

  const cancelled = await prisma.$transaction(async (tx) => {
    // ยึดด้วยสถานะเดิม — สองคนกดยกเลิกพร้อมกัน คนที่สองได้ 0 แถวแล้วโดนปฏิเสธ
    const claimed = await tx.taxInvoice.updateMany({
      where: { id: invoice.id, status: 'active' },
      data: { status: 'cancelled', cancelReason: reason, cancelledBy: ctx.actor.id, cancelledAt: now },
    })
    if (claimed.count === 0) {
      throw new SalesError('TAX_INVOICE_INVALID_STATUS', { detail: 'ใบนี้ถูกยกเลิกไปแล้วโดยผู้ใช้อื่น' })
    }
    // ยึดแถวแล้ว — ตรวจซ้ำกันเอกสารที่บันทึกเข้ามาระหว่างตรวจรอบแรก (rollback ทั้งก้อน)
    assertInvoiceHasNoActiveNotes(await tx.creditNote.findMany(activeNotesQuery(invoice.id)))

    await emitAudit(
      {
        organizationId: ctx.actor.organizationId,
        actorId: ctx.actor.id,
        actorRole: ctx.actor.roleName,
        action: 'status_change',
        targetType: TAX_INVOICE_TARGET,
        targetId: invoice.id,
        before: { status: 'active' satisfies TaxInvoiceStatus, cancel_reason: null },
        after: {
          status: 'cancelled' satisfies TaxInvoiceStatus,
          cancel_reason: reason,
          cancelled_at: now.toISOString(),
          invoice_number: invoice.invoiceNumber,
        },
        reason,
        ipAddress: ctx.meta.ipAddress,
        userAgent: ctx.meta.userAgent,
        diffOnly: false,
      },
      tx,
    )

    return tx.taxInvoice.findUniqueOrThrow({ where: { id: invoice.id }, select: TAX_INVOICE_SELECT })
  })

  return toInvoiceDto(cancelled, sales)
}

/** ใบลดหนี้/ใบเพิ่มหนี้ `active` ที่อ้างใบกำกับนี้ (เรียงตามวันที่ออก) — ยามของ U18 */
function activeNotesQuery(invoiceId: string) {
  return {
    where: { taxInvoiceId: invoiceId, status: 'active' },
    select: { noteType: true, creditNoteNumber: true },
    orderBy: [{ issueDate: 'asc' }, { createdAt: 'asc' }],
  } as const satisfies Prisma.CreditNoteFindManyArgs
}


/** ข้อมูลดิบของเอกสารสำหรับ PDF (`28` §6.2) — ประกอบเป็นข้อความที่ `buildTaxInvoiceDoc()` */
export async function getTaxInvoiceDocSource(user: SessionUser, invoiceId: string): Promise<TaxInvoiceDocSource> {
  const { invoice, sales } = await findTaxInvoice(user, invoiceId)
  return docSourceOf(invoice, { periodLabel: sales.period.periodLabel, billingBatchNumber: sales.billingBatch.batchNumber })
}

/**
 * ประกอบข้อมูลเอกสารจากแถวที่โหลดแล้ว — ตัวเดียวกันทั้งพิมพ์รายใบ แนบใน Export Pack (U57) และ portal
 * · **อ่าน snapshot บนใบทั้งหมด** (คู่ค้า/สาขา/รูปแบบการส่ง/ยอด/อัตรา — U96 #4) ไม่อ่านค่าปัจจุบันของบริษัท/องค์กร
 */
function docSourceOf(
  invoice: TaxInvoiceRow,
  context: { periodLabel: string; billingBatchNumber: string },
): TaxInvoiceDocSource {
  return {
    docKind: invoice.docKind,
    invoiceNumber: invoice.invoiceNumber,
    invoiceDate: invoice.invoiceDate,
    status: invoice.status,
    cancelReason: invoice.cancelReason,
    cancelledAt: invoice.cancelledAt,
    deliveryFormat: invoice.deliveryFormat,
    seller: { name: invoice.sellerName, taxId: invoice.sellerTaxId, address: invoice.sellerAddress, phone: invoice.sellerPhone },
    buyer: { name: invoice.buyerName, taxId: invoice.buyerTaxId, address: invoice.buyerAddress, phone: invoice.buyerPhone },
    buyerBranchCode: invoice.buyerBranchCode,
    sellerBranchCode: invoice.sellerBranchCode,
    sellerProfile: parseSellerProfileSnapshot(invoice.sellerProfileSnapshot),
    description: invoice.description,
    periodLabel: context.periodLabel,
    amounts: {
      totalBeforeVatSatang: invoice.amountBeforeVatSatang,
      vatSatang: invoice.vatSatang,
      totalSatang: invoice.totalSatang,
    },
    // ใบเดิมหลายอัตรา = null ⇒ ไม่ระบุ % บนหัวคอลัมน์
    vatRatesPct: invoice.vatRatePctUsed === null ? [] : [invoice.vatRatePctUsed.toString()],
    replacementNote: replacementNoteOf(invoice.replaces),
    billingBatchNumber: context.billingBatchNumber,
    receivedDate: invoice.cashReceipt?.receivedDate ?? null,
  }
}

/**
 * เอกสารภาษีของ Export Pack (มติ PO 05/10/2569 U57 · U95) — ใบที่**ลงวันที่ในช่วง** + ใบที่**ถูกยกเลิกในช่วง**
 * พร้อมข้อมูลเอกสาร PDF (ตัวเดียวกับ `GET /tax-invoices/:id/pdf`) · ระดับองค์กร — ผู้เรียกตรวจสิทธิ์ระดับทั้งองค์กรแล้ว
 * · `replacedBy` = ใบที่ออกแทน (ลิงก์ `replaces_tax_invoice_id` — U96 #8) · ใบเก่าก่อนมีลิงก์ ⇒ ใบ `active` แบบเดิมที่ออกทีหลังบนรายการขายเดียวกัน
 */
export async function taxInvoicesForPack(
  organizationId: string,
  range: { start: Date; end: Date; startAt: Date; endAt: Date },
): Promise<
  {
    id: string
    source: TaxInvoiceDocSource
    companyName: string
    billingRef: string
    billingBatchNumber: string
    replacedBy: string | null
  }[]
> {
  const rows = await prisma.taxInvoice.findMany({
    where: {
      organizationId,
      OR: [
        { invoiceDate: { gte: range.start, lt: range.end } },
        { status: 'cancelled', cancelledAt: { gte: range.startAt, lt: range.endAt } },
      ],
    },
    orderBy: [{ invoiceDate: 'asc' }, { invoiceNumber: 'asc' }],
    select: {
      ...TAX_INVOICE_SELECT,
      replacedBy: { select: { invoiceNumber: true }, take: 1 },
      salesRecord: {
        select: {
          period: { select: { periodLabel: true } },
          billingBatch: { select: { period: true, batchNumber: true } },
          taxInvoices: {
            where: { status: 'active', docKind: 'tax_invoice' },
            orderBy: { createdAt: 'asc' },
            select: { invoiceNumber: true, createdAt: true },
          },
        },
      },
    },
  })

  return rows.map((row) => {
    const { salesRecord: sales, replacedBy, ...invoice } = row
    const legacyReplacement =
      row.status === 'cancelled' && row.docKind === 'tax_invoice'
        ? sales.taxInvoices.find((other) => other.createdAt > row.createdAt && other.invoiceNumber !== row.invoiceNumber)
        : undefined
    return {
      id: row.id,
      source: docSourceOf(invoice, {
        periodLabel: sales.period.periodLabel,
        billingBatchNumber: sales.billingBatch.batchNumber,
      }),
      companyName: row.buyerName,
      billingRef: sales.billingBatch.period,
      billingBatchNumber: sales.billingBatch.batchNumber,
      replacedBy: replacedBy[0]?.invoiceNumber ?? legacyReplacement?.invoiceNumber ?? null,
    }
  })
}

// ── GET /api/accounting/cash-receipts (อ่านอย่างเดียว — `31` §6.3) ──────────

export async function listCashReceipts(user: SessionUser, query: CashReceiptListQuery): Promise<CashReceiptListDto> {
  const scoped = scopeWhere(user, query.companyId)
  // เงินรับไม่มีคอลัมน์ `company_id` ของตัวเอง — กรองผ่านรอบวางบิลที่ผูกอยู่
  const billingWhere: Prisma.BillingBatchWhereInput = 'id' in scoped ? { id: { in: [] } } : scoped
  const rows = await prisma.cashReceipt.findMany({
    where: {
      organizationId: user.organizationId,
      ...(query.periodId === undefined ? {} : { periodId: query.periodId }),
      billingBatch: billingWhere,
    },
    orderBy: [{ receivedDate: 'desc' }, { createdAt: 'desc' }],
    select: {
      id: true,
      receivedDate: true,
      amountSatang: true,
      whtWithheldByCustomerSatang: true,
      note: true,
      createdAt: true,
      billingBatchId: true,
      billingBatch: {
        select: {
          period: true,
          batchNumber: true,
          status: true,
          company: { select: { name: true } },
          salesRecord: {
            select: { taxInvoices: { where: { status: 'active', docKind: 'tax_invoice' }, select: { id: true } } },
          },
        },
      },
      bankTransaction: { select: { description: true, matchStatus: true } },
      taxInvoices: { select: TAX_INVOICE_SELECT, orderBy: { createdAt: 'desc' } },
    },
  })

  const periodClosed = await loadPeriodClosedLookup(user.organizationId)
  const items: CashReceiptDto[] = rows.map((row) => {
    const active = row.taxInvoices.find((invoice) => invoice.status === 'active') ?? null
    return {
      id: row.id,
      receivedDate: row.receivedDate.toISOString(),
      payerName: row.billingBatch.company.name,
      amountSatang: row.amountSatang,
      whtWithheldByCustomerSatang: row.whtWithheldByCustomerSatang,
      bankRef: row.bankTransaction?.description ?? null,
      bankMatchStatus: row.bankTransaction?.matchStatus ?? null,
      billingBatchId: row.billingBatchId,
      billingPeriod: row.billingBatch.period,
      billingBatchNumber: row.billingBatch.batchNumber,
      billingStatus: row.billingBatch.status,
      note: row.note,
      createdAt: row.createdAt.toISOString(),
      taxInvoice: active === null ? null : toInvoiceSummary(active, periodClosed),
      cancelledTaxInvoices: row.taxInvoices
        .filter((invoice) => invoice.status === 'cancelled')
        .map((invoice) => toInvoiceSummary(invoice, periodClosed)),
      coveredByLegacyInvoice: (row.billingBatch.salesRecord?.taxInvoices.length ?? 0) > 0,
    }
  })

  return {
    items,
    totalSatang: items.reduce((sum, item) => sum + item.amountSatang, 0),
    totalWhtWithheldByCustomerSatang: items.reduce((sum, item) => sum + item.whtWithheldByCustomerSatang, 0),
    awaitingTaxInvoiceCount: items.filter((item) => item.taxInvoice === null && !item.coveredByLegacyInvoice).length,
  }
}
