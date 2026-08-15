import { createException, ensurePeriodForDate, type AccountingMutationContext } from '@/lib/accounting/queries'
import { emitAudit } from '@/lib/audit/audit'
import type { SessionUser } from '@/lib/auth/types'
import { ExpenseRecordError } from '@/lib/expenses/errors'
import {
  assertCostCenterEditable,
  buildDocumentException,
  DOCUMENT_STATUS_LABEL,
  expenseCategoryOf,
  isSyncableBatchStatus,
  resolveDocumentStatus,
  resolveMappingRule,
  summarizeExpenseRecords,
  type DocumentSource,
  type DocumentStatus,
} from '@/lib/expenses/expense-record'
import type { CostCenterMapInput, ExpenseRecordListQuery } from '@/lib/expenses/schemas'
import type { CostCenterOptionDto, ExpenseRecordDto, ExpenseRecordListDto } from '@/lib/expenses/types'
import { Prisma } from '@/lib/generated/prisma/client'
import { prisma } from '@/lib/prisma'
import { SettingsError } from '@/lib/settings/errors'
import { assertPeriodEditable } from '@/lib/settings/period-lock'
import { syncWhtCertificatesFromPayout } from '@/lib/wht/queries'

/**
 * บัญชีค่าใช้จ่าย (ไฟล์ 32) — ชั้น DB (`32` §14)
 *
 * ### กติกาที่ห้ามหลุด
 * - **1 payout item = 1 expense record** (unique `expense_records.payout_batch_item_id` · `02` §9)
 *   และเกิดได้เฉพาะรอบจ่ายที่ `completed` เท่านั้น (`32` §6.1) — `syncExpenseRecordsFromPayout()`
 *   **idempotent** เรียกซ้ำได้ ไม่สร้างซ้ำ (แนวเดียวกับ `syncSalesRecordFromBilling()` ของ 4.3)
 * - **ยอดเงินเป็น snapshot จากรายการในรอบจ่าย** — โมดูลนี้ไม่มีทางแก้ยอดเลย ทุกเส้นทางที่พยายาม
 *   ต้องได้ `EDIT_AMOUNT_DIRECTLY` แล้วไปใช้ Adjustment (ไฟล์ 20)
 * - **แก้ Cost Center ได้เฉพาะ `manual`** (`COST_CENTER_AUTO_EDIT`) + ต้องมี `reason` เสมอ
 *   (`expense_records` อยู่หมวด `money` ของ `reason-policy` — Rule 03) + ผ่านยาม
 *   `PERIOD_LOCKED_DIRECT_EDIT` ของรอบที่รายการนั้นสังกัด (`13` §6.11)
 * - **เอกสารไม่ครบ ⇒ สร้าง exception ของไฟล์ 34 ให้อัตโนมัติ** ตอน sync ครั้งแรกเท่านั้น
 *   (ไม่ซ้ำเมื่อ sync ซ้ำ เพราะผูกกับจังหวะที่ record เกิดใหม่)
 * - **ต่อท้ายด้วยการออกใบ 50 ทวิ** (`33` §9 · Phase 4.5) — ใบผูกกับ `expense_record_id` จึงต้องเกิด
 *   หลังรายการค่าใช้จ่ายเสมอ · ตัวมันเอง idempotent ⇒ sync ซ้ำไม่ออกใบซ้ำ
 */

const TARGET = 'expense_records'

// ── select / mapper ─────────────────────────────────────────────────────────

const RECORD_SELECT = {
  id: true,
  periodId: true,
  payoutBatchItemId: true,
  costCenterId: true,
  grossSatang: true,
  whtSatang: true,
  netSatang: true,
  createdAt: true,
  period: { select: { periodLabel: true, status: true } },
  costCenter: { select: { code: true, name: true } },
  payoutBatchItem: {
    select: {
      payoutBatchId: true,
      payoutBatch: {
        select: { name: true, paymentFileGeneratedAt: true, updatedAt: true },
      },
      payee: { select: { user: { select: { fullName: true } } } },
      expense: { select: { expenseType: true, receiptFileUrl: true } },
    },
  },
} satisfies Prisma.ExpenseRecordSelect

type RecordRow = Prisma.ExpenseRecordGetPayload<{ select: typeof RECORD_SELECT }>

/** วันที่จ่ายจริง (`32` §7.1) — วันสร้างไฟล์โอน ถ้าไม่มีใช้เวลาที่รอบจ่ายถูกปิดเป็น `completed` */
function paymentDateOf(batch: { paymentFileGeneratedAt: Date | null; updatedAt: Date }): Date {
  return batch.paymentFileGeneratedAt ?? batch.updatedAt
}

/** ต้นทางที่ใช้ derive ประเภท/ความครบของเอกสาร — `expense = null` ⇒ รายการเงินทดรองจ่าย (A4) */
function documentSourceOf(row: RecordRow): DocumentSource {
  const expense = row.payoutBatchItem.expense
  return {
    expenseType: expense?.expenseType ?? null,
    receiptFileUrl: expense?.receiptFileUrl ?? null,
  }
}

function toDto(row: RecordRow): ExpenseRecordDto {
  const source = documentSourceOf(row)
  const documentStatus: DocumentStatus = resolveDocumentStatus(source)
  // ยังไม่มีเส้นเชื่อม "ทีม → ศูนย์ต้นทุน" ใน `02` ⇒ ไม่มีต้นทางอัตโนมัติ (D14)
  const mappingRule = resolveMappingRule({ autoCostCenterId: null })

  return {
    id: row.id,
    periodId: row.periodId,
    periodLabel: row.period.periodLabel,
    payoutBatchItemId: row.payoutBatchItemId,
    payoutBatchId: row.payoutBatchItem.payoutBatchId,
    payoutBatchName: row.payoutBatchItem.payoutBatch.name,
    payeeName: row.payoutBatchItem.payee.user.fullName,
    category: expenseCategoryOf(source),
    paymentDate: paymentDateOf(row.payoutBatchItem.payoutBatch).toISOString(),
    grossSatang: row.grossSatang,
    whtSatang: row.whtSatang,
    netSatang: row.netSatang,
    costCenterId: row.costCenterId,
    costCenterLabel: row.costCenter === null ? null : `${row.costCenter.code} — ${row.costCenter.name}`,
    mappingRule,
    documentStatus,
    documentStatusLabel: DOCUMENT_STATUS_LABEL[documentStatus],
    receiptFileUrl: source.receiptFileUrl,
    createdAt: row.createdAt.toISOString(),
  }
}

// ── จุดเสียบ: รอบจ่ายเงิน `completed` ⇒ บันทึกบัญชีค่าใช้จ่าย (`32` §6.1/§9) ──

/**
 * sync รายการค่าใช้จ่ายจากรอบจ่ายที่จ่ายจริงแล้ว — **idempotent**
 *
 * เรียกจาก 2 ทางเดียวกับที่รอบจ่ายเปลี่ยนเป็น `completed` ได้ (`17` §9/§18):
 * ยืนยันด้วยมือ (`completePayoutBatch()`) และการจับคู่กระทบยอดธนาคาร (ไฟล์ 35)
 *
 * รอบที่ยังไม่ `completed` = ยังไม่ใช่ "รายจ่าย" ในมุมบัญชี ⇒ คืน `[]` เงียบ ๆ ไม่ใช่ error
 * (`32` §16 — เคส `file_generated` ต้องไม่ sync)
 */
export async function syncExpenseRecordsFromPayout(
  ctx: AccountingMutationContext,
  payoutBatchId: string,
): Promise<ExpenseRecordDto[]> {
  const organizationId = ctx.actor.organizationId
  const batch = await prisma.payoutBatch.findFirst({
    where: { id: payoutBatchId, organizationId, deletedAt: null },
    select: {
      id: true,
      name: true,
      status: true,
      paymentFileGeneratedAt: true,
      updatedAt: true,
      items: {
        select: {
          id: true,
          grossSatang: true,
          whtSatang: true,
          netSatang: true,
          payee: { select: { user: { select: { fullName: true } } } },
          expense: { select: { expenseType: true, receiptFileUrl: true } },
        },
      },
    },
  })
  if (batch === null || !isSyncableBatchStatus(batch.status)) return []

  const paymentDate = paymentDateOf(batch)
  const period = await ensurePeriodForDate(ctx, paymentDate)

  const created: RecordRow[] = []
  for (const item of batch.items) {
    const existing = await prisma.expenseRecord.findUnique({
      where: { payoutBatchItemId: item.id },
      select: RECORD_SELECT,
    })
    if (existing !== null) {
      created.push(existing)
      continue
    }

    const source = {
      expenseType: item.expense?.expenseType ?? null,
      receiptFileUrl: item.expense?.receiptFileUrl ?? null,
    }
    const payeeName = item.payee.user.fullName

    let row: RecordRow
    try {
      row = await prisma.$transaction(async (tx) => {
        const inserted = await tx.expenseRecord.create({
          data: {
            organizationId,
            periodId: period.id,
            payoutBatchItemId: item.id,
            grossSatang: item.grossSatang,
            whtSatang: item.whtSatang,
            netSatang: item.netSatang,
            createdBy: ctx.actor.id,
          },
          select: RECORD_SELECT,
        })
        await emitAudit(
          {
            organizationId,
            actorId: ctx.actor.id,
            actorRole: ctx.actor.roleName,
            action: 'create',
            targetType: TARGET,
            targetId: inserted.id,
            after: {
              payout_batch_item_id: item.id,
              payout_batch_id: batch.id,
              period_label: period.periodLabel,
              payee_name: payeeName,
              gross_satang: item.grossSatang,
              wht_satang: item.whtSatang,
              net_satang: item.netSatang,
            },
            reason: `บันทึกบัญชีค่าใช้จ่ายอัตโนมัติเมื่อรอบจ่าย "${batch.name}" จ่ายเงินจริงแล้ว (\`32\` §6.1)`,
            ipAddress: ctx.meta.ipAddress,
            userAgent: ctx.meta.userAgent,
          },
          tx,
        )
        return inserted
      })
    } catch (error) {
      // แข่งกันสร้างพร้อมกัน — คนที่แพ้อ่านของที่มีอยู่แล้วกลับไป (ไม่ใช่ error)
      if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== 'P2002') throw error
      const raced = await prisma.expenseRecord.findUnique({
        where: { payoutBatchItemId: item.id },
        select: RECORD_SELECT,
      })
      if (raced === null) throw error
      created.push(raced)
      continue
    }

    // เอกสารไม่ครบ ⇒ ขึ้น exception ของไฟล์ 34 อัตโนมัติ (`32` §6.3/§9) — เฉพาะตอนเกิดใหม่
    if (resolveDocumentStatus(source) === 'incomplete') {
      await createException(ctx, {
        periodId: period.id,
        ...buildDocumentException({
          payeeName,
          batchName: batch.name,
          category: expenseCategoryOf(source),
          expenseRecordId: row.id,
        }),
      })
    }

    created.push(row)
  }

  // มีบัญชีค่าใช้จ่ายแล้ว ⇒ ออกใบ 50 ทวิ ให้รายการที่หักภาษีจริง (`33` §9) — idempotent เช่นกัน
  // (ต้องอยู่**หลัง** expense record เกิด เพราะ `wht_certificates.expense_record_id` เป็น FK บังคับ)
  await syncWhtCertificatesFromPayout(ctx, payoutBatchId)

  return created.map(toDto)
}

// ── GET /api/accounting/expenses (`32` §14) ─────────────────────────────────

async function listCostCenterOptions(organizationId: string): Promise<CostCenterOptionDto[]> {
  const rows = await prisma.costCenter.findMany({
    where: { organizationId, deletedAt: null, isActive: true },
    orderBy: { code: 'asc' },
    select: { id: true, code: true, name: true },
  })
  return rows
}

export async function listExpenseRecords(
  user: SessionUser,
  query: ExpenseRecordListQuery,
): Promise<ExpenseRecordListDto> {
  const rows = await prisma.expenseRecord.findMany({
    where: {
      organizationId: user.organizationId,
      ...(query.periodId === undefined ? {} : { periodId: query.periodId }),
      ...(query.unmappedOnly === true ? { costCenterId: null } : {}),
    },
    orderBy: { createdAt: 'desc' },
    select: RECORD_SELECT,
  })

  // `documentStatus` เป็นค่า derive (ไม่มีคอลัมน์ — D14) ⇒ กรองหลังแปลง ไม่ใช่ที่ SQL
  const items = rows
    .map(toDto)
    .filter((item) => query.documentStatus === undefined || item.documentStatus === query.documentStatus)

  return {
    items,
    summary: summarizeExpenseRecords(items),
    costCenters: await listCostCenterOptions(user.organizationId),
  }
}

async function findRecord(user: SessionUser, expenseRecordId: string): Promise<RecordRow> {
  const row = await prisma.expenseRecord.findFirst({
    where: { id: expenseRecordId, organizationId: user.organizationId },
    select: RECORD_SELECT,
  })
  if (row === null) {
    throw new ExpenseRecordError('EXPENSE_RECORD_NOT_FOUND', { detail: `expense_record=${expenseRecordId}` })
  }
  return row
}

// ── PATCH /api/accounting/expenses/:id/cost-center (`32` §14) ───────────────

/**
 * map/เปลี่ยน Cost Center ของรายการที่ `mapping_rule = manual` เท่านั้น (`32` §6.2/§10)
 * — audit บังคับ `reason` (`32` §13 · Rule 03)
 */
export async function mapExpenseCostCenter(
  ctx: AccountingMutationContext,
  expenseRecordId: string,
  input: CostCenterMapInput,
): Promise<ExpenseRecordDto> {
  const record = await findRecord(ctx.actor, expenseRecordId)
  const current = toDto(record)

  assertCostCenterEditable(current.mappingRule, expenseRecordId)
  assertPeriodEditable({
    periodStatus: record.period.status,
    targetType: TARGET,
    targetId: expenseRecordId,
  })

  const costCenter = await prisma.costCenter.findFirst({
    where: {
      id: input.costCenterId,
      organizationId: ctx.actor.organizationId,
      deletedAt: null,
      isActive: true,
    },
    select: { id: true, code: true, name: true },
  })
  // ศูนย์ต้นทุนเป็นของโมดูลตั้งค่า (`13` §6.6) ⇒ ใช้ code ของโมดูลต้นทาง ไม่ประกาศซ้ำ
  if (costCenter === null) {
    throw new SettingsError('COST_CENTER_NOT_FOUND', { detail: `cost_center=${input.costCenterId}` })
  }

  const updated = await prisma.$transaction(async (tx) => {
    const row = await tx.expenseRecord.update({
      where: { id: expenseRecordId },
      data: { costCenterId: costCenter.id },
      select: RECORD_SELECT,
    })
    await emitAudit(
      {
        organizationId: ctx.actor.organizationId,
        actorId: ctx.actor.id,
        actorRole: ctx.actor.roleName,
        action: 'update',
        targetType: TARGET,
        targetId: expenseRecordId,
        before: { cost_center_id: record.costCenterId },
        after: { cost_center_id: costCenter.id, cost_center_code: costCenter.code, mapping_rule: 'manual' },
        reason: input.reason,
        ipAddress: ctx.meta.ipAddress,
        userAgent: ctx.meta.userAgent,
        diffOnly: false,
      },
      tx,
    )
    return row
  })

  return toDto(updated)
}
