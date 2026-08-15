import { ensurePeriod, type AccountingMutationContext } from '@/lib/accounting/queries'
import { assertPeriodOpenAt } from '@/lib/accounting/period-guard'
import { emitAudit } from '@/lib/audit/audit'
import type { SessionUser } from '@/lib/auth/types'
import { Prisma } from '@/lib/generated/prisma/client'
import type { TaxInvoiceStatus } from '@/lib/generated/prisma/enums'
import { prisma } from '@/lib/prisma'
import { parseBillingPeriodLabel } from '@/lib/revenue/revenue'
import { SalesError } from '@/lib/sales/errors'
import {
  assertCancellable,
  assertIssuable,
  assertNoNumberGap,
  assertTaxInvoiceFieldsComplete,
  defaultInvoiceDate,
  invoiceDescriptionOf,
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
import { nextSequence, type NumberingState } from '@/lib/settings/numbering'
import { reserveNextInvoiceNumber } from '@/lib/settings/queries/numbering'

/**
 * บัญชีขาย / ใบกำกับภาษี / เงินรับ (ไฟล์ 31) — ชั้น DB (`31` §14)
 *
 * ### กติกาที่ห้ามหลุด
 * - **Sales Record 1:1 กับ Billing Batch** (`31` §6.1 · unique `sales_records.billing_batch_id`)
 *   เกิดอัตโนมัติเมื่อรอบวางบิลเปลี่ยนเป็น `sent` — `syncSalesRecordFromBilling()` **idempotent**
 *   (เรียกซ้ำได้ ไม่สร้างซ้ำ) แบบเดียวกับจุดเสียบของ 4.2
 * - **เลขที่ใบกำกับภาษีห้าม gap ห้ามซ้ำ** (`31` §6.2/§10) ⇒ ใน `$transaction` เดียวกับ insert:
 *   `SELECT … FOR UPDATE` แถว `organizations` → คิดเลขที่ควรได้ (`nextSequence()`) → เดินเลขจริง
 *   (`reserveNextInvoiceNumber()`) → เทียบกัน (`INVOICE_NUMBER_GAP`) — คำขอที่เข้ามาพร้อมกันจึงต่อคิว
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
  invoiceNumber: true,
  invoiceDate: true,
  status: true,
  cancelReason: true,
  cancelledAt: true,
  createdAt: true,
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
  billingBatch: { select: { period: true, status: true } },
  taxInvoices: { select: TAX_INVOICE_SELECT, orderBy: { createdAt: 'desc' } },
} satisfies Prisma.SalesRecordSelect

type SalesRow = Prisma.SalesRecordGetPayload<{ select: typeof SALES_SELECT }>

function toInvoiceSummary(row: TaxInvoiceRow): TaxInvoiceSummaryDto {
  return {
    id: row.id,
    invoiceNumber: row.invoiceNumber,
    invoiceDate: row.invoiceDate.toISOString(),
    status: row.status,
    statusLabel: TAX_INVOICE_STATUS_LABEL[row.status],
    cancelReason: row.cancelReason,
    cancelledAt: row.cancelledAt?.toISOString() ?? null,
    cancelledByName: row.cancelledByUser?.fullName ?? null,
    createdAt: row.createdAt.toISOString(),
  }
}

function activeInvoiceOf(row: SalesRow): TaxInvoiceRow | null {
  return row.taxInvoices.find((invoice) => invoice.status === 'active') ?? null
}

function toSalesDto(row: SalesRow): SalesRecordDto {
  const active = activeInvoiceOf(row)
  return {
    id: row.id,
    periodId: row.periodId,
    periodLabel: row.period.periodLabel,
    companyId: row.companyId,
    companyName: row.company.name,
    billingBatchId: row.billingBatchId,
    billingPeriod: row.billingBatch.period,
    billingStatus: row.billingBatch.status,
    totalBeforeVatSatang: row.totalBeforeVatSatang,
    vatSatang: row.vatSatang,
    totalSatang: row.totalSatang,
    createdAt: row.createdAt.toISOString(),
    activeTaxInvoice: active === null ? null : toInvoiceSummary(active),
    taxInvoices: row.taxInvoices.map(toInvoiceSummary),
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
          reason: `บันทึกขายอัตโนมัติเมื่อรอบวางบิล "${batch.period}" ถูกส่งบิล (\`31\` §6.1)`,
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

  const items = rows.map(toSalesDto)
  return {
    items,
    totalBeforeVatSatang: items.reduce((sum, item) => sum + item.totalBeforeVatSatang, 0),
    vatSatang: items.reduce((sum, item) => sum + item.vatSatang, 0),
    totalSatang: items.reduce((sum, item) => sum + item.totalSatang, 0),
    awaitingInvoiceCount: items.filter((item) => item.activeTaxInvoice === null).length,
  }
}

async function findSalesRecord(user: SessionUser, salesRecordId: string): Promise<SalesRow> {
  const row = await prisma.salesRecord.findFirst({
    where: { id: salesRecordId, organizationId: user.organizationId, ...scopeWhere(user) },
    select: SALES_SELECT,
  })
  if (row === null) throw new SalesError('SALES_RECORD_NOT_FOUND', { detail: `sales_record=${salesRecordId}` })
  return row
}

// ── ใบกำกับภาษี ─────────────────────────────────────────────────────────────

function toInvoiceDto(row: TaxInvoiceRow, sales: SalesRow): TaxInvoiceDto {
  return {
    ...toInvoiceSummary(row),
    salesRecordId: sales.id,
    companyId: sales.companyId,
    companyName: sales.company.name,
    periodLabel: sales.period.periodLabel,
    totalBeforeVatSatang: sales.totalBeforeVatSatang,
    vatSatang: sales.vatSatang,
    totalSatang: sales.totalSatang,
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

  const items = rows
    .flatMap((sales) =>
      sales.taxInvoices
        .filter((invoice) => query.status === undefined || invoice.status === query.status)
        .map((invoice) => toInvoiceDto(invoice, sales)),
    )
    .sort((left, right) => right.invoiceNumber.localeCompare(left.invoiceNumber))

  return { items }
}

/** ผู้ขาย = องค์กรเจ้าของระบบ (`31` §7.2 "ดึงจากการตั้งค่าองค์กร") */
async function loadSeller(organizationId: string): Promise<{
  name: string
  taxId: string
  address: string
  phone: string | null
  vatRegistered: boolean
}> {
  const org = await prisma.organization.findUnique({
    where: { id: organizationId },
    select: { name: true, taxId: true, address: true, phone: true, vatRegistered: true },
  })
  if (org === null) throw new Error(`loadSeller: ไม่พบองค์กร ${organizationId}`)
  return org
}

/** ผู้ซื้อ = บริษัทไฟแนนซ์ (`31` §7.2 "ดึงจากไฟล์ 10") */
async function loadBuyer(companyId: string): Promise<{
  name: string
  taxId: string
  address: string | null
  phone: string | null
  defaultInvoiceDeliveryFormat: Prisma.FinanceCompanyGetPayload<{
    select: { defaultInvoiceDeliveryFormat: true }
  }>['defaultInvoiceDeliveryFormat']
}> {
  const company = await prisma.financeCompany.findUnique({
    where: { id: companyId },
    select: {
      name: true,
      taxId: true,
      address: true,
      phone: true,
      defaultInvoiceDeliveryFormat: true,
    },
  })
  if (company === null) throw new Error(`loadBuyer: ไม่พบบริษัทไฟแนนซ์ ${companyId}`)
  return company
}

function amountsOf(sales: SalesRow): SalesAmounts {
  return {
    totalBeforeVatSatang: sales.totalBeforeVatSatang,
    vatSatang: sales.vatSatang,
    totalSatang: sales.totalSatang,
  }
}

interface NumberingLockRow {
  tax_invoice_seq: number
  tax_invoice_numbering_mode: NumberingState['mode']
  tax_invoice_prefix: string
  tax_invoice_digit_length: number
  tax_invoice_last_reset_year: number | null
}

/**
 * `POST /api/accounting/tax-invoices` (`31` §14) — ออกใบกำกับภาษี (สร้าง = ออกทันที)
 *
 * ลำดับสำคัญ: ตรวจสิทธิ์/สถานะ/ฟิลด์บังคับ **ก่อน** แตะตัวเดินเลข — เพราะเลขที่จองแล้วต้องถูกใช้
 * เสมอ (rollback ได้ แต่ไม่ควรพึ่ง) · ตัวเดินเลขถูกล็อกด้วย `FOR UPDATE` ในทรานแซกชันเดียวกับ insert
 */
export async function issueTaxInvoice(
  ctx: SalesMutationContext,
  input: TaxInvoiceCreateInput,
  now: Date = new Date(),
): Promise<TaxInvoiceDto> {
  const organizationId = ctx.actor.organizationId
  const sales = await findSalesRecord(ctx.actor, input.salesRecordId)
  const active = activeInvoiceOf(sales)
  assertIssuable(active === null ? null : active.invoiceNumber)

  const invoiceDate = input.invoiceDate ?? defaultInvoiceDate(now)
  await assertPeriodOpenAt({
    organizationId,
    at: invoiceDate,
    targetType: TAX_INVOICE_TARGET,
    targetId: sales.id,
  })

  const [seller, buyer] = await Promise.all([loadSeller(organizationId), loadBuyer(sales.companyId)])
  const description = invoiceDescriptionOf(sales.billingBatch.period)
  assertTaxInvoiceFieldsComplete({
    seller: { name: seller.name, taxId: seller.taxId, address: seller.address },
    sellerVatRegistered: seller.vatRegistered,
    buyer: { name: buyer.name, taxId: buyer.taxId, address: buyer.address },
    description,
    amounts: amountsOf(sales),
  })

  const created = await prisma.$transaction(async (tx) => {
    // ล็อกแถวองค์กรก่อนอ่านตัวเดินเลข ⇒ คำขอที่เข้ามาพร้อมกันต่อคิวกันจริง (D11)
    const rows = await tx.$queryRaw<NumberingLockRow[]>`
      SELECT tax_invoice_seq, tax_invoice_numbering_mode, tax_invoice_prefix,
             tax_invoice_digit_length, tax_invoice_last_reset_year
        FROM organizations
       WHERE id = ${organizationId}::uuid
         FOR UPDATE
    `
    const state = rows[0]
    if (state === undefined) throw new Error(`issueTaxInvoice: ไม่พบองค์กร ${organizationId}`)

    const expected = nextSequence(
      {
        mode: state.tax_invoice_numbering_mode,
        prefix: state.tax_invoice_prefix,
        digitLength: state.tax_invoice_digit_length,
        lastNumber: state.tax_invoice_seq,
        lastResetYear: state.tax_invoice_last_reset_year,
      },
      invoiceDate,
    )

    const reserved = await reserveNextInvoiceNumber(organizationId, invoiceDate, tx)
    assertNoNumberGap(reserved.sequence, expected - 1)

    const invoice = await tx.taxInvoice.create({
      data: {
        organizationId,
        salesRecordId: sales.id,
        invoiceNumber: reserved.number,
        invoiceDate,
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
          invoice_number: invoice.invoiceNumber,
          invoice_date: invoice.invoiceDate.toISOString(),
          status: invoice.status,
          sales_record_id: sales.id,
          total_satang: sales.totalSatang,
        },
        reason: `ออกใบกำกับภาษี ${invoice.invoiceNumber} ให้ ${buyer.name} รอบ ${sales.billingBatch.period} (\`31\` §9.1)`,
        ipAddress: ctx.meta.ipAddress,
        userAgent: ctx.meta.userAgent,
      },
      tx,
    )

    return invoice
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

/** ข้อมูลดิบของใบกำกับภาษีสำหรับ PDF (`28` §6.2) — ประกอบเป็นข้อความที่ `buildTaxInvoiceDoc()` */
export async function getTaxInvoiceDocSource(user: SessionUser, invoiceId: string): Promise<TaxInvoiceDocSource> {
  const { invoice, sales } = await findTaxInvoice(user, invoiceId)
  const [seller, buyer, revenues] = await Promise.all([
    loadSeller(user.organizationId),
    loadBuyer(sales.companyId),
    prisma.revenue.findMany({
      where: { billingBatchId: sales.billingBatchId, deletedAt: null },
      select: { vatRatePctUsed: true },
    }),
  ])

  return {
    invoiceNumber: invoice.invoiceNumber,
    invoiceDate: invoice.invoiceDate,
    status: invoice.status,
    cancelReason: invoice.cancelReason,
    cancelledAt: invoice.cancelledAt,
    // `02` ไม่มีคอลัมน์ต่อใบ ⇒ อ่านค่าเริ่มต้นของบริษัท (`10` §7.1 · ดู `02_OPEN_DECISIONS` D13)
    deliveryFormat: buyer.defaultInvoiceDeliveryFormat,
    seller: { name: seller.name, taxId: seller.taxId, address: seller.address, phone: seller.phone },
    buyer: { name: buyer.name, taxId: buyer.taxId, address: buyer.address ?? '', phone: buyer.phone },
    description: invoiceDescriptionOf(sales.billingBatch.period),
    periodLabel: sales.period.periodLabel,
    amounts: amountsOf(sales),
    vatRatesPct: revenues.map((row) => row.vatRatePctUsed.toString()),
  }
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
      billingBatch: { select: { period: true, status: true, company: { select: { name: true } } } },
      bankTransaction: { select: { description: true, matchStatus: true } },
    },
  })

  const items: CashReceiptDto[] = rows.map((row) => ({
    id: row.id,
    receivedDate: row.receivedDate.toISOString(),
    payerName: row.billingBatch.company.name,
    amountSatang: row.amountSatang,
    whtWithheldByCustomerSatang: row.whtWithheldByCustomerSatang,
    bankRef: row.bankTransaction?.description ?? null,
    bankMatchStatus: row.bankTransaction?.matchStatus ?? null,
    billingBatchId: row.billingBatchId,
    billingPeriod: row.billingBatch.period,
    billingStatus: row.billingBatch.status,
    note: row.note,
    createdAt: row.createdAt.toISOString(),
  }))

  return {
    items,
    totalSatang: items.reduce((sum, item) => sum + item.amountSatang, 0),
    totalWhtWithheldByCustomerSatang: items.reduce((sum, item) => sum + item.whtWithheldByCustomerSatang, 0),
  }
}
