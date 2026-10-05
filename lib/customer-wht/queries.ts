import type { AccountingMutationContext } from '@/lib/accounting/queries'
import { emitAudit } from '@/lib/audit/audit'
import { assertOrgWideReadable } from '@/lib/auth/scope'
import type { SessionUser } from '@/lib/auth/types'
import { BankReconError } from '@/lib/bank-recon/errors'
import {
  CUSTOMER_WHT_STATUS_GROUP,
  CUSTOMER_WHT_STATUS_LABEL,
  canReceiveCustomerWht,
  customerWhtAgeBucket,
  customerWhtAgeDays,
  customerWhtAmountWarning,
  withheldDateRangeOf,
} from '@/lib/customer-wht/customer-wht'
import type { CustomerWhtListQuery, CustomerWhtReceiveInput } from '@/lib/customer-wht/schemas'
import type {
  CustomerWhtCompanySummary,
  CustomerWhtDto,
  CustomerWhtListDto,
  CustomerWhtReceiveResultDto,
} from '@/lib/customer-wht/types'
import { fmtSatangSymbol } from '@/lib/format/money'
import { Prisma } from '@/lib/generated/prisma/client'
import { prisma } from '@/lib/prisma'
import { customerWhtFileRule } from '@/lib/uploads/rules'
import { verifyUploadedFile } from '@/lib/uploads/verify'

/**
 * 50 ทวิ ที่ลูกค้า (บริษัทไฟแนนซ์) หักเรา — ชั้น DB (มติ PO 05/10/2569 U40)
 *
 * ### กติกาที่ห้ามหลุด
 * - รายการ `pending` เกิดจาก {@link createPendingCustomerWht} **ภายใน `$transaction` เดียวกับการสร้างเงินรับ**
 *   (กระทบยอดธนาคาร) เท่านั้น — partial unique `uniq_customer_wht_cash_receipt` กันเงินรับเดียวเกิดสองรายการ
 * - เงินรับถูกถอน (เปลี่ยนการจับคู่) ⇒ {@link releaseCustomerWhtForReceipt}: `pending` ถูก soft delete (ไม่ต้องตามแล้ว)
 *   · `received` คงไว้ (หนังสือจริงอยู่ในมือแล้ว) แค่ FK เงินรับเป็น NULL — ทั้งสองกรณีลง audit พร้อมเหตุผล
 * - รับหนังสือ = เอกสารภาษี ไม่ได้เปลี่ยนยอดเงิน ⇒ **ไม่ติดยามงวดล็อก** (หนังสือมักมาถึงหลังปิดงวด — เหตุผลของ U40)
 * - ทั้งองค์กร (`assertOrgWideReadable`) — ผู้ใช้ scope ทีม/บริษัทไม่มีสิทธิ์เห็นข้อมูลภาษีของบริษัท
 */

/** client ภายใน `$transaction` ของ prisma ตัวที่ extend แล้ว (แนวเดียวกับ `CaseTxClient`) */
export type CustomerWhtTxClient = Omit<typeof prisma, '$connect' | '$disconnect' | '$on' | '$transaction' | '$extends'>

const TARGET = 'customer_wht_certificates'
const EXCEPTION_TARGET = 'exceptions'
/** `exceptions.source_module` ของข้อยกเว้นที่ผูกกับรายการนี้ (`source_ref` = id ของรายการ) */
export const CUSTOMER_WHT_EXCEPTION_MODULE = 'customer_wht'

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

const ROW_SELECT = {
  id: true,
  companyId: true,
  status: true,
  withheldSatang: true,
  withheldDate: true,
  billingBatchId: true,
  cashReceiptId: true,
  certificateNumber: true,
  certificateDate: true,
  whtSatang: true,
  grossSatang: true,
  fileUrl: true,
  note: true,
  receivedAt: true,
  createdAt: true,
  company: { select: { name: true } },
  billingBatch: {
    select: {
      batchNumber: true,
      period: true,
      salesRecord: { select: { taxInvoices: { where: { status: 'active' }, select: { invoiceNumber: true } } } },
    },
  },
  cashReceipt: { select: { bankTransactionId: true } },
  receivedByUser: { select: { fullName: true } },
} satisfies Prisma.CustomerWhtCertificateSelect

type Row = Prisma.CustomerWhtCertificateGetPayload<{ select: typeof ROW_SELECT }>

function billingRefOf(row: Row): string | null {
  return row.billingBatch === null ? null : `รอบวางบิล ${row.billingBatch.batchNumber} (${row.billingBatch.period}) · ${row.company.name}`
}

function toDto(row: Row, now: Date): CustomerWhtDto {
  const ageDays = customerWhtAgeDays(row.withheldDate, now)
  return {
    id: row.id,
    companyId: row.companyId,
    companyName: row.company.name,
    status: row.status,
    statusLabel: CUSTOMER_WHT_STATUS_LABEL[row.status],
    statusGroup: CUSTOMER_WHT_STATUS_GROUP[row.status],
    withheldSatang: row.withheldSatang,
    withheldDate: row.withheldDate.toISOString(),
    ageDays,
    ageBucket: customerWhtAgeBucket(ageDays),
    billingBatchId: row.billingBatchId,
    billingRef: billingRefOf(row),
    taxInvoiceNumbers: row.billingBatch?.salesRecord?.taxInvoices.map((invoice) => invoice.invoiceNumber) ?? [],
    cashReceiptId: row.cashReceiptId,
    bankTransactionId: row.cashReceipt?.bankTransactionId ?? null,
    certificateNumber: row.certificateNumber,
    certificateDate: row.certificateDate?.toISOString() ?? null,
    whtSatang: row.whtSatang,
    grossSatang: row.grossSatang,
    filePath: row.fileUrl,
    note: row.note,
    amountMatches: row.whtSatang === null ? null : row.whtSatang === row.withheldSatang,
    receivedAt: row.receivedAt?.toISOString() ?? null,
    receivedByName: row.receivedByUser?.fullName ?? null,
    createdAt: row.createdAt.toISOString(),
  }
}

// ── เกิด/ถอนรายการตามเงินรับ (เรียกจากกระทบยอดธนาคาร ภายใน tx) ───────────────

/**
 * สร้างรายการ "รอ 50 ทวิ จากลูกค้า" ของเงินรับที่ถูกหักภาษี — **ผู้เรียกต้องอยู่ใน `$transaction`**
 * เดียวกับการสร้างเงินรับ · ยอด ≤ 0 = ไม่สร้าง (คืน `null`)
 */
export async function createPendingCustomerWht(
  tx: CustomerWhtTxClient,
  ctx: AccountingMutationContext,
  input: {
    cashReceiptId: string
    billingBatchId: string
    withheldSatang: number
    withheldDate: Date
    sourceRef: string
  },
): Promise<string | null> {
  if (input.withheldSatang <= 0) return null
  const batch = await tx.billingBatch.findFirstOrThrow({
    where: { id: input.billingBatchId, organizationId: ctx.actor.organizationId },
    select: { companyId: true, period: true },
  })
  const row = await tx.customerWhtCertificate.create({
    data: {
      organizationId: ctx.actor.organizationId,
      companyId: batch.companyId,
      billingBatchId: input.billingBatchId,
      cashReceiptId: input.cashReceiptId,
      status: 'pending',
      withheldSatang: input.withheldSatang,
      withheldDate: input.withheldDate,
      createdBy: ctx.actor.id,
    },
    select: { id: true },
  })
  await emitAudit(
    {
      organizationId: ctx.actor.organizationId,
      actorId: ctx.actor.id,
      actorRole: ctx.actor.roleName,
      action: 'create',
      targetType: TARGET,
      targetId: row.id,
      after: {
        status: 'pending',
        company_id: batch.companyId,
        billing_batch_id: input.billingBatchId,
        cash_receipt_id: input.cashReceiptId,
        withheld_satang: input.withheldSatang,
        withheld_date: input.withheldDate,
        source: 'bank_reconciliation',
      },
      reason: `ลูกค้าหักภาษี ณ ที่จ่ายจากเงินรับ ${input.sourceRef} — รอหนังสือรับรอง 50 ทวิ จากลูกค้า`,
      ipAddress: ctx.meta.ipAddress,
      userAgent: ctx.meta.userAgent,
    },
    tx,
  )
  return row.id
}

/**
 * เงินรับกำลังถูกถอน (เปลี่ยนการจับคู่) — **เรียกก่อนลบเงินรับ ภายใน tx เดียวกัน**
 * `pending` ⇒ soft delete · `received` ⇒ คงไว้ (FK เงินรับจะเป็น NULL เอง) — ลง audit ทั้งคู่
 */
export async function releaseCustomerWhtForReceipt(
  tx: CustomerWhtTxClient,
  ctx: AccountingMutationContext,
  cashReceiptId: string,
  reason: string,
): Promise<void> {
  const rows = await tx.customerWhtCertificate.findMany({
    where: { organizationId: ctx.actor.organizationId, cashReceiptId, deletedAt: null },
    select: { id: true, status: true, withheldSatang: true, certificateNumber: true },
  })
  for (const row of rows) {
    if (row.status === 'pending') {
      await tx.customerWhtCertificate.update({
        where: { id: row.id },
        data: { deletedAt: new Date(), updatedBy: ctx.actor.id },
      })
      await emitAudit(
        {
          organizationId: ctx.actor.organizationId,
          actorId: ctx.actor.id,
          actorRole: ctx.actor.roleName,
          action: 'delete',
          targetType: TARGET,
          targetId: row.id,
          before: { status: row.status, cash_receipt_id: cashReceiptId, withheld_satang: row.withheldSatang },
          reason: `ยกเลิกรายการรอ 50 ทวิ เพราะ${reason}`,
          ipAddress: ctx.meta.ipAddress,
          userAgent: ctx.meta.userAgent,
        },
        tx,
      )
      continue
    }
    await emitAudit(
      {
        organizationId: ctx.actor.organizationId,
        actorId: ctx.actor.id,
        actorRole: ctx.actor.roleName,
        action: 'update',
        targetType: TARGET,
        targetId: row.id,
        before: { cash_receipt_id: cashReceiptId },
        after: { cash_receipt_id: null, certificate_number: row.certificateNumber },
        reason: `เงินรับที่อ้างถึงถูกถอน (${reason}) — คงหนังสือที่ได้รับแล้วไว้`,
        ipAddress: ctx.meta.ipAddress,
        userAgent: ctx.meta.userAgent,
        diffOnly: false,
      },
      tx,
    )
  }
}

// ── อ่าน ────────────────────────────────────────────────────────────────────

export async function listCustomerWht(
  user: SessionUser,
  query: CustomerWhtListQuery,
  now: Date = new Date(),
): Promise<CustomerWhtListDto> {
  assertOrgWideReadable(user, 'customer-wht-certificates')
  const base: Prisma.CustomerWhtCertificateWhereInput = {
    organizationId: user.organizationId,
    deletedAt: null,
    ...(query.companyId === undefined ? {} : { companyId: query.companyId }),
  }
  const where: Prisma.CustomerWhtCertificateWhereInput = {
    ...base,
    ...(query.status === undefined ? {} : { status: query.status }),
    ...(query.age === undefined ? {} : { withheldDate: withheldDateRangeOf(query.age, now) }),
  }

  const [rows, byStatus, pendingByCompany] = await Promise.all([
    prisma.customerWhtCertificate.findMany({
      where,
      select: ROW_SELECT,
      orderBy: [{ status: 'asc' }, { withheldDate: 'asc' }, { createdAt: 'asc' }],
      take: query.limit,
    }),
    prisma.customerWhtCertificate.groupBy({
      by: ['status'],
      where: base,
      _count: { _all: true },
      _sum: { withheldSatang: true },
    }),
    prisma.customerWhtCertificate.groupBy({
      by: ['companyId'],
      where: { organizationId: user.organizationId, deletedAt: null, status: 'pending' },
      _count: { _all: true },
      _sum: { withheldSatang: true },
    }),
  ])

  const companies = await prisma.financeCompany.findMany({
    where: { organizationId: user.organizationId, id: { in: pendingByCompany.map((row) => row.companyId) } },
    select: { id: true, name: true },
  })
  const nameOf = new Map(companies.map((company) => [company.id, company.name]))
  const byCompany: CustomerWhtCompanySummary[] = pendingByCompany
    .map((row) => ({
      companyId: row.companyId,
      companyName: nameOf.get(row.companyId) ?? '',
      pendingCount: row._count._all,
      pendingSatang: row._sum.withheldSatang ?? 0,
    }))
    .sort((a, b) => a.companyName.localeCompare(b.companyName, 'th'))

  const statusOf = (status: 'pending' | 'received') => byStatus.find((row) => row.status === status)

  return {
    items: rows.map((row) => toDto(row, now)),
    summary: {
      pendingCount: statusOf('pending')?._count._all ?? 0,
      pendingSatang: statusOf('pending')?._sum.withheldSatang ?? 0,
      receivedCount: statusOf('received')?._count._all ?? 0,
      receivedSatang: statusOf('received')?._sum.withheldSatang ?? 0,
    },
    byCompany,
  }
}

async function loadRow(organizationId: string, id: string): Promise<Row> {
  // id ที่ไม่ใช่ UUID ⇒ ตอบเหมือนไม่พบ (404 ไม่ leak) ก่อนถึง DB
  if (!UUID_PATTERN.test(id)) throw new BankReconError('CUSTOMER_WHT_NOT_FOUND', { detail: `id=${id}` })
  const row = await prisma.customerWhtCertificate.findFirst({
    where: { id, organizationId, deletedAt: null },
    select: ROW_SELECT,
  })
  if (row === null) throw new BankReconError('CUSTOMER_WHT_NOT_FOUND', { detail: `id=${id}` })
  return row
}

/** ยามของ upload/download ไฟล์สแกน — รายการต้องอยู่ในองค์กรของผู้เรียก · อัปโหลดได้เฉพาะรายการที่ยังรอหนังสือ */
export async function assertCustomerWhtInScope(
  user: SessionUser,
  id: string,
  options: { requirePending?: boolean } = {},
): Promise<void> {
  assertOrgWideReadable(user, 'customer-wht-certificates')
  const row = await loadRow(user.organizationId, id)
  if (options.requirePending === true && !canReceiveCustomerWht(row.status)) {
    throw new BankReconError('CUSTOMER_WHT_INVALID_STATUS', { detail: `status=${row.status}` })
  }
}

// ── รับหนังสือ ───────────────────────────────────────────────────────────────

function isUniqueViolation(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002'
}

/**
 * `PATCH /api/accounting/customer-wht-certificates/:id/receive` — `pending → received`
 *
 * ไฟล์ตรวจนอก tx (I/O) · อัปเดตแบบมีเงื่อนไข `status = pending` กันสองคนกดพร้อมกัน ·
 * ข้อยกเว้นที่ผูกไว้ (`source_module = customer_wht`, `source_ref = id`) ที่ยัง `open` ⇒ แก้ไขแล้วอัตโนมัติ
 */
export async function receiveCustomerWht(
  ctx: AccountingMutationContext,
  id: string,
  input: CustomerWhtReceiveInput,
  now: Date = new Date(),
): Promise<CustomerWhtReceiveResultDto> {
  assertOrgWideReadable(ctx.actor, 'customer-wht-certificates')
  const before = await loadRow(ctx.actor.organizationId, id)
  if (!canReceiveCustomerWht(before.status)) {
    throw new BankReconError('CUSTOMER_WHT_INVALID_STATUS', { detail: `status=${before.status}` })
  }

  const verified = await verifyUploadedFile(input.filePath, customerWhtFileRule(before.id))
  const certificateNumber = input.certificateNumber.trim()
  const note = input.note?.trim() === '' ? null : (input.note?.trim() ?? null)
  const warning = customerWhtAmountWarning({
    withheldSatang: before.withheldSatang,
    certificateWhtSatang: input.whtSatang,
    formatSatang: (satang) => fmtSatangSymbol(satang),
  })
  const reason =
    `ได้รับหนังสือรับรองการหักภาษี ณ ที่จ่ายจาก ${before.company.name} เลขที่ ${certificateNumber}` +
    (note === null ? '' : ` — ${note}`)

  try {
    await prisma.$transaction(async (tx) => {
      const updated = await tx.customerWhtCertificate.updateMany({
        where: { id: before.id, organizationId: ctx.actor.organizationId, status: 'pending', deletedAt: null },
        data: {
          status: 'received',
          certificateNumber,
          certificateDate: input.certificateDate,
          whtSatang: input.whtSatang,
          grossSatang: input.grossSatang ?? null,
          fileUrl: input.filePath,
          fileSha256: verified.sha256,
          note,
          receivedAt: now,
          receivedBy: ctx.actor.id,
          updatedBy: ctx.actor.id,
        },
      })
      if (updated.count === 0) {
        throw new BankReconError('CUSTOMER_WHT_INVALID_STATUS', { detail: 'ถูกบันทึกไปแล้วโดยคำขออื่น' })
      }
      await emitAudit(
        {
          organizationId: ctx.actor.organizationId,
          actorId: ctx.actor.id,
          actorRole: ctx.actor.roleName,
          action: 'status_change',
          targetType: TARGET,
          targetId: before.id,
          before: { status: before.status },
          after: {
            status: 'received',
            certificate_number: certificateNumber,
            certificate_date: input.certificateDate,
            wht_satang: input.whtSatang,
            gross_satang: input.grossSatang ?? null,
            withheld_satang: before.withheldSatang,
            amount_matches_withheld: warning === null,
            file_path: input.filePath,
            file_sha256: verified.sha256,
          },
          reason,
          ipAddress: ctx.meta.ipAddress,
          userAgent: ctx.meta.userAgent,
          diffOnly: false,
        },
        tx,
      )

      // ข้อยกเว้นที่เปิดไว้รอหนังสือฉบับนี้ ⇒ ได้หนังสือแล้ว = แก้ไขแล้ว (authorized เป็นสถานะสุดท้าย ไม่แตะ)
      const linked = await tx.exception.findMany({
        where: {
          organizationId: ctx.actor.organizationId,
          sourceModule: CUSTOMER_WHT_EXCEPTION_MODULE,
          sourceRef: before.id,
          status: 'open',
        },
        select: { id: true, title: true },
      })
      for (const exception of linked) {
        const resolutionNote = `ได้รับหนังสือรับรอง 50 ทวิ จากลูกค้าแล้ว เลขที่ ${certificateNumber}`
        await tx.exception.update({
          where: { id: exception.id },
          data: {
            status: 'resolved',
            resolvedBy: ctx.actor.id,
            resolvedAt: now,
            resolutionNote,
            updatedBy: ctx.actor.id,
          },
        })
        await emitAudit(
          {
            organizationId: ctx.actor.organizationId,
            actorId: ctx.actor.id,
            actorRole: ctx.actor.roleName,
            action: 'status_change',
            targetType: EXCEPTION_TARGET,
            targetId: exception.id,
            before: { status: 'open' },
            after: { status: 'resolved', resolution_note: resolutionNote, customer_wht_certificate_id: before.id },
            reason: resolutionNote,
            ipAddress: ctx.meta.ipAddress,
            userAgent: ctx.meta.userAgent,
            diffOnly: false,
          },
          tx,
        )
      }
    })
  } catch (error) {
    if (isUniqueViolation(error)) {
      throw new BankReconError('CUSTOMER_WHT_NUMBER_DUPLICATE', { detail: `number=${certificateNumber}` })
    }
    throw error
  }

  return {
    certificate: toDto(await loadRow(ctx.actor.organizationId, before.id), now),
    warnings: warning === null ? [] : [warning],
  }
}

// ── ส่งออก (Accounting Pack) ───────────────────────────────────────────────

export interface CustomerWhtExportSource {
  withheldDate: Date
  companyName: string
  companyTaxId: string | null
  billingRef: string | null
  taxInvoiceNumbers: string[]
  withheldSatang: number
  certificateNumber: string | null
  certificateDate: Date | null
  whtSatang: number | null
  status: 'pending' | 'received'
  /** เลขรอบวางบิล `BL-<พ.ศ.>-NNN` (มติ U79 — คอลัมน์ต่อท้าย) */
  billingBatchNumber: string | null
}

/**
 * แถวของไฟล์ส่งบัญชี — รายการที่**รับเงินในงวด** + รายการที่**ยังรอหนังสือ**ซึ่งรับเงินก่อนสิ้นงวด (ยกมาจากงวดก่อน)
 * ⇒ สำนักงานบัญชีเห็นทั้งเครดิตภาษีของงวดและยอดค้างรับหนังสือ ณ วันสร้างไฟล์
 */
export async function customerWhtExportSources(
  organizationId: string,
  range: { start: Date; end: Date },
): Promise<CustomerWhtExportSource[]> {
  const rows = await prisma.customerWhtCertificate.findMany({
    where: {
      organizationId,
      deletedAt: null,
      OR: [
        { withheldDate: { gte: range.start, lt: range.end } },
        { status: 'pending', withheldDate: { lt: range.start } },
      ],
    },
    orderBy: [{ withheldDate: 'asc' }, { createdAt: 'asc' }],
    select: {
      withheldDate: true,
      withheldSatang: true,
      certificateNumber: true,
      certificateDate: true,
      whtSatang: true,
      status: true,
      company: { select: { name: true, taxId: true } },
      billingBatch: {
        select: {
          batchNumber: true,
          period: true,
          salesRecord: { select: { taxInvoices: { where: { status: 'active' }, select: { invoiceNumber: true } } } },
        },
      },
    },
  })
  return rows.map((row) => ({
    withheldDate: row.withheldDate,
    companyName: row.company.name,
    companyTaxId: row.company.taxId,
    // มติ U79 — `billing_ref` คงเป็นรอบเดือนแบบเดิม · เลขรอบแยกคอลัมน์ต่อท้าย
    billingRef: row.billingBatch?.period ?? null,
    billingBatchNumber: row.billingBatch?.batchNumber ?? null,
    taxInvoiceNumbers: row.billingBatch?.salesRecord?.taxInvoices.map((invoice) => invoice.invoiceNumber) ?? [],
    withheldSatang: row.withheldSatang,
    certificateNumber: row.certificateNumber,
    certificateDate: row.certificateDate,
    whtSatang: row.whtSatang,
    status: row.status,
  }))
}
