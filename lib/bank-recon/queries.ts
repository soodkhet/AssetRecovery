import { ensurePeriodForDate, type AccountingMutationContext } from '@/lib/accounting/queries'
import { assertPeriodOpenAt } from '@/lib/accounting/period-guard'
import type { ApiWarning } from '@/lib/api/envelope'
import { alreadyMatchedWarning, BankReconError } from '@/lib/bank-recon/errors'
import {
  allowedTargetKind,
  findAutoMatch,
  hasNote,
  isExactMatchAmount,
  isMatched,
  manualMatchRequiresNote,
  nextBankMatchStatus,
  transactionSide,
  type MatchCandidate,
  type MatchTargetKind,
} from '@/lib/bank-recon/matching'
import { BANK_MATCH_STATUS_LABEL } from '@/lib/bank-recon/matching'
import type {
  BankMatchInput,
  BankTransactionListQuery,
  MatchCandidateQuery,
  ResolveUnmatchedInput,
  StatementImportInput,
} from '@/lib/bank-recon/schemas'
import {
  parseStatementCsv,
  StatementParseError,
  statementRowKey,
  type StatementRow,
} from '@/lib/bank-recon/statement'
import type {
  BankTransactionDto,
  BankTransactionListDto,
  MatchCandidateDto,
  MatchResultDto,
  StatementImportResultDto,
} from '@/lib/bank-recon/types'
import { emitAudit } from '@/lib/audit/audit'
import type { SessionUser } from '@/lib/auth/types'
import { Prisma } from '@/lib/generated/prisma/client'
import type { BankMatchStatus } from '@/lib/generated/prisma/enums'
import { prisma } from '@/lib/prisma'
import { PayoutError } from '@/lib/payout/errors'
import { syncPayoutBatchCompleted } from '@/lib/payout/queries'
import { RevenueError } from '@/lib/revenue/errors'
import { applyBillingReceipt } from '@/lib/revenue/queries'
import { SettingsError } from '@/lib/settings/errors'

/**
 * กระทบยอดธนาคาร (ไฟล์ 35) — ชั้น DB (`27` §6.14)
 *
 * ### กติกาที่ห้ามหลุด
 * - **งวดของรายการมาจาก `ensurePeriodForDate()` ของ 4.1 เท่านั้น** — ห้าม query
 *   `accounting_periods` เอง (ไม่งั้นรอบที่ยังไม่เปิดจะทำให้ import ล้ม)
 * - **auto-match เมื่อเหลือผู้สมัครรายเดียว** (`35` §6.2) — ตรรกะอยู่ที่ `matching.ts` (pure)
 *   ที่นี่แค่เตรียมผู้สมัครจาก DB
 * - **trigger 2 ทาง** (`35` §9): จับคู่บิล ⇒ สร้าง Cash Receipt (ไฟล์ 31) + `applyBillingReceipt()`
 *   ของ 3.6 (จุดเสียบเดียว รับ**ยอดสะสม** จึง idempotent) · จับคู่รอบจ่าย ⇒
 *   `syncPayoutBatchCompleted()` ของ 3.4 (idempotent เช่นกัน)
 * - **`unmatched_resolved` ห้ามผูก FK** และต้องมี `match_note` เสมอ (`35` §6.4/§10) —
 *   CHECK `bank_tx_status_fk_shape` ที่ DB จะปฏิเสธซ้ำอีกชั้นถ้าโค้ดพลาด
 * - นำเข้าไฟล์เดิมซ้ำต้อง**ไม่นับเงินซ้ำ** — กันด้วย `statementRowKey()` (วัน+ยอด+รายละเอียด)
 * - ทุก mutation ลง audit — จับคู่/เปลี่ยนการจับคู่/ปิดรายการ ใช้ `match_note` เป็นเหตุผล (`35` §13)
 */

export { MANAGE_BANK_RECONCILIATION } from '@/lib/bank-recon/matching'

const TARGET = 'bank_transactions'
const CASH_RECEIPT_TARGET = 'cash_receipts'

/** เงินออกจะถูกเก็บเป็นค่าติดลบเสมอ — ยอดที่เอาไปเทียบเอกสารคือค่าสัมบูรณ์ */
function absSatang(amountSatang: number): number {
  return Math.abs(amountSatang)
}

const TX_SELECT = {
  id: true,
  periodId: true,
  bankAccountId: true,
  transactionDate: true,
  description: true,
  amountSatang: true,
  matchStatus: true,
  matchNote: true,
  matchedBillingId: true,
  matchedPayoutId: true,
  matchedAt: true,
  createdAt: true,
  period: { select: { periodLabel: true } },
  bankAccount: { select: { bankName: true, accountNumber: true } },
  matchedBilling: { select: { id: true, period: true, company: { select: { name: true } } } },
  matchedPayout: { select: { id: true, name: true } },
  matchedByUser: { select: { fullName: true } },
} satisfies Prisma.BankTransactionSelect

type TxRow = Prisma.BankTransactionGetPayload<{ select: typeof TX_SELECT }>

function bankAccountLabel(account: { bankName: string; accountNumber: string }): string {
  const tail = account.accountNumber.slice(-4)
  return `${account.bankName} (***${tail})`
}

function billingRef(batch: { period: string; company: { name: string } }): string {
  return `รอบวางบิล ${batch.period} · ${batch.company.name}`
}

function toDto(row: TxRow): BankTransactionDto {
  const matchedKind: MatchTargetKind | null =
    row.matchedBillingId !== null ? 'billing' : row.matchedPayoutId !== null ? 'payout' : null

  return {
    id: row.id,
    periodId: row.periodId,
    periodLabel: row.period.periodLabel,
    bankAccountId: row.bankAccountId,
    bankAccountLabel: bankAccountLabel(row.bankAccount),
    transactionDate: row.transactionDate.toISOString(),
    description: row.description,
    amountSatang: row.amountSatang,
    matchStatus: row.matchStatus,
    matchStatusLabel: BANK_MATCH_STATUS_LABEL[row.matchStatus],
    matchNote: row.matchNote,
    matchedKind,
    matchedId: row.matchedBillingId ?? row.matchedPayoutId,
    matchedRef:
      row.matchedBilling !== null
        ? billingRef(row.matchedBilling)
        : row.matchedPayout !== null
          ? row.matchedPayout.name
          : null,
    matchedByName: row.matchedByUser?.fullName ?? null,
    matchedAt: row.matchedAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
  }
}

// ── อ่านรายการ ──────────────────────────────────────────────────────────────

export async function listBankTransactions(
  user: SessionUser,
  query: BankTransactionListQuery,
): Promise<BankTransactionListDto> {
  const where: Prisma.BankTransactionWhereInput = {
    organizationId: user.organizationId,
    ...(query.periodId === undefined ? {} : { periodId: query.periodId }),
    ...(query.bankAccountId === undefined ? {} : { bankAccountId: query.bankAccountId }),
    ...(query.status === undefined ? {} : { matchStatus: query.status }),
  }

  const rows = await prisma.bankTransaction.findMany({
    where,
    select: TX_SELECT,
    orderBy: [{ transactionDate: 'desc' }, { createdAt: 'desc' }],
    take: query.limit,
  })

  const items = rows.map(toDto)
  const countBy = (status: BankMatchStatus): number => items.filter((item) => item.matchStatus === status).length

  return {
    items,
    summary: {
      total: items.length,
      unmatched: countBy('unmatched'),
      autoMatched: countBy('auto_matched'),
      manualMatched: countBy('manual_matched'),
      unmatchedResolved: countBy('unmatched_resolved'),
      totalInSatang: items.filter((item) => item.amountSatang > 0).reduce((sum, item) => sum + item.amountSatang, 0),
      totalOutSatang: items
        .filter((item) => item.amountSatang < 0)
        .reduce((sum, item) => sum + absSatang(item.amountSatang), 0),
    },
  }
}

// ── ผู้สมัครจับคู่ ───────────────────────────────────────────────────────────

/**
 * ผู้สมัครที่ระบบยอมให้จับคู่ — เงินเข้า = รอบวางบิลที่ยังเก็บเงินไม่ครบ (`sent`/`partially_paid`)
 * · เงินออก = รอบจ่ายที่สร้างไฟล์โอนแล้ว (`file_generated`) หรือที่ยืนยันจ่ายแล้ว (`completed`
 * — สำหรับเคสจับคู่ใหม่/แยกงวด) ตาม `35` §6.2 + state machine `23` §6.6/§6.8
 */
async function loadCandidates(
  organizationId: string,
  kind: MatchTargetKind,
  search?: string,
): Promise<MatchCandidate[]> {
  if (kind === 'billing') {
    const rows = await prisma.billingBatch.findMany({
      where: {
        organizationId,
        deletedAt: null,
        status: { in: ['sent', 'partially_paid'] },
        ...(search === undefined || search === ''
          ? {}
          : {
              OR: [
                { period: { contains: search, mode: 'insensitive' } },
                { company: { name: { contains: search, mode: 'insensitive' } } },
              ],
            }),
      },
      select: {
        id: true,
        period: true,
        totalSatang: true,
        receivedSatang: true,
        whtWithheldByCustomerSatang: true,
        sentAt: true,
        company: { select: { name: true } },
      },
      orderBy: { sentAt: 'desc' },
      take: 100,
    })

    return rows.map((row) => ({
      kind: 'billing' as const,
      id: row.id,
      ref: billingRef(row),
      amountSatang: row.totalSatang,
      // A1 — ลูกค้าหัก WHT ก่อนโอน ⇒ ยอดเข้าจริง = total − wht (`35` §6.2 · มติ PO A1)
      altAmountSatang: row.whtWithheldByCustomerSatang > 0 ? row.totalSatang - row.whtWithheldByCustomerSatang : null,
      referenceDate: row.sentAt,
    }))
  }

  const rows = await prisma.payoutBatch.findMany({
    where: {
      organizationId,
      deletedAt: null,
      status: { in: ['file_generated', 'completed'] },
      ...(search === undefined || search === '' ? {} : { name: { contains: search, mode: 'insensitive' } }),
    },
    select: { id: true, name: true, netSatang: true, paymentFileGeneratedAt: true, status: true },
    orderBy: { paymentFileGeneratedAt: 'desc' },
    take: 100,
  })

  return rows.map((row) => ({
    kind: 'payout' as const,
    id: row.id,
    ref: row.name,
    amountSatang: row.netSatang,
    altAmountSatang: null,
    // รอบที่ `completed` แล้วไม่เข้าเกณฑ์อัตโนมัติ (จับคู่ไปแล้วครั้งหนึ่ง) — เลือก manual ได้เท่านั้น
    referenceDate: row.status === 'file_generated' ? row.paymentFileGeneratedAt : null,
  }))
}

/** ตัวเลือกของ Modal "จับคู่ Manual" (`35` §8) — เฉพาะฝั่งที่ตรงกับเครื่องหมายของรายการ */
export async function listMatchCandidates(
  user: SessionUser,
  query: MatchCandidateQuery,
): Promise<MatchCandidateDto[]> {
  const transaction = await prisma.bankTransaction.findFirst({
    where: { id: query.transactionId, organizationId: user.organizationId },
    select: { amountSatang: true },
  })
  if (transaction === null) throw new BankReconError('BANK_TRANSACTION_NOT_FOUND')

  const kind = allowedTargetKind(transaction.amountSatang)
  const candidates = await loadCandidates(user.organizationId, kind, query.q)

  return candidates.map((candidate) => ({
    kind: candidate.kind,
    id: candidate.id,
    ref: candidate.ref,
    label: candidate.ref,
    amountSatang: candidate.amountSatang,
    altAmountSatang: candidate.altAmountSatang,
    referenceDate: candidate.referenceDate?.toISOString() ?? null,
    exactAmount: isExactMatchAmount(transaction.amountSatang, candidate),
  }))
}

// ── ผลข้างเคียงของการจับคู่ (trigger 2 ทาง — `35` §9) ────────────────────────

/** ยอดสะสมที่รับชำระแล้วของรอบวางบิลนั้น = ผลรวม Cash Receipt ทั้งหมด (ห้ามบวกเพิ่มทีละก้อน) */
async function receivedTotalSatang(organizationId: string, billingBatchId: string): Promise<number> {
  const aggregate = await prisma.cashReceipt.aggregate({
    where: { organizationId, billingBatchId },
    _sum: { amountSatang: true },
  })
  return aggregate._sum.amountSatang ?? 0
}

async function syncBillingAfterReceipt(
  ctx: AccountingMutationContext,
  billingBatchId: string,
  sourceRef: string,
): Promise<{ billingStatus: string; outstandingSatang: number }> {
  const received = await receivedTotalSatang(ctx.actor.organizationId, billingBatchId)
  const result = await applyBillingReceipt({
    organizationId: ctx.actor.organizationId,
    batchId: billingBatchId,
    receivedSatang: received,
    sourceRef,
    actorId: ctx.actor.id,
    actorRole: ctx.actor.roleName,
  })
  return { billingStatus: result.status, outstandingSatang: result.outstandingSatang }
}

// ── นำเข้า statement ────────────────────────────────────────────────────────

interface PreparedRow extends StatementRow {
  periodId: string
  periodLabel: string
}

/**
 * `POST /api/bank-reconciliation/import` (`35` §14)
 *
 * ขั้นตอน: อ่านไฟล์ตาม format ที่ตั้งไว้ → ผูกงวดด้วย `ensurePeriodForDate()` → กันแถวซ้ำ →
 * บันทึก + audit ต่อแถว → พยายาม auto-match ทีละรายการ (ผลข้างเคียงเดินผ่านทางเดียวกับ manual)
 */
export async function importStatement(
  ctx: AccountingMutationContext,
  input: StatementImportInput,
): Promise<StatementImportResultDto> {
  const account = await prisma.bankAccount.findFirst({
    where: { id: input.bankAccountId, organizationId: ctx.actor.organizationId, deletedAt: null },
    select: { id: true, bankName: true, accountNumber: true, statementFormat: true, autoMatchToleranceDays: true },
  })
  // code ของโมดูลตั้งค่า (`13` §10 · `24` §6.3) — ใช้ซ้ำ ไม่ประกาศใหม่ (Rule 04)
  if (account === null) throw new SettingsError('BANK_ACCOUNT_NOT_FOUND', { detail: input.bankAccountId })

  const format =
    account.statementFormat === null
      ? null
      : await prisma.bankFileFormat.findFirst({
          where: {
            organizationId: ctx.actor.organizationId,
            deletedAt: null,
            bankName: account.statementFormat,
          },
          select: { columnMapping: true },
        })

  let parsed
  try {
    parsed = parseStatementCsv({ csv: input.csv, columnMapping: format?.columnMapping ?? null })
  } catch (error) {
    if (error instanceof StatementParseError) {
      throw new BankReconError('STATEMENT_FILE_INVALID', { detail: error.message })
    }
    throw error
  }

  if (parsed.rows.length === 0) {
    throw new BankReconError('STATEMENT_FILE_INVALID', {
      detail: `ไม่มีแถวที่ใช้ได้ในไฟล์ ${input.fileName}`,
      context: { skippedRows: parsed.errors },
    })
  }

  // งวดของแต่ละแถว — เปิดรอบให้อัตโนมัติ (idempotent) แล้วกันเขียนทับรอบที่ปิดไปแล้ว
  const periodCache = new Map<string, { id: string; label: string }>()
  const prepared: PreparedRow[] = []
  for (const row of parsed.rows) {
    const monthKey = row.transactionDate.toISOString().slice(0, 7)
    let period = periodCache.get(monthKey)
    if (period === undefined) {
      await assertPeriodOpenAt({
        organizationId: ctx.actor.organizationId,
        at: row.transactionDate,
        targetType: TARGET,
      })
      const opened = await ensurePeriodForDate(ctx, row.transactionDate)
      period = { id: opened.id, label: opened.periodLabel }
      periodCache.set(monthKey, period)
    }
    prepared.push({ ...row, periodId: period.id, periodLabel: period.label })
  }

  // กันนำเข้าซ้ำ — เทียบกับรายการเดิมของบัญชีเดียวกันในช่วงวันที่ของไฟล์
  const dates = prepared.map((row) => row.transactionDate.getTime())
  const existing = await prisma.bankTransaction.findMany({
    where: {
      organizationId: ctx.actor.organizationId,
      bankAccountId: account.id,
      transactionDate: { gte: new Date(Math.min(...dates)), lte: new Date(Math.max(...dates)) },
    },
    select: { transactionDate: true, amountSatang: true, description: true },
  })
  const seen = new Set(existing.map(statementRowKey))

  const created: { id: string; row: PreparedRow }[] = []
  let duplicates = 0

  for (const row of prepared) {
    const key = statementRowKey(row)
    if (seen.has(key)) {
      duplicates += 1
      continue
    }
    seen.add(key)

    const inserted = await prisma.$transaction(async (tx) => {
      const record = await tx.bankTransaction.create({
        data: {
          organizationId: ctx.actor.organizationId,
          periodId: row.periodId,
          bankAccountId: account.id,
          transactionDate: row.transactionDate,
          description: row.description,
          amountSatang: row.amountSatang,
          createdBy: ctx.actor.id,
        },
        select: { id: true },
      })
      await emitAudit(
        {
          organizationId: ctx.actor.organizationId,
          actorId: ctx.actor.id,
          actorRole: ctx.actor.roleName,
          action: 'import',
          targetType: TARGET,
          targetId: record.id,
          after: {
            period_label: row.periodLabel,
            transaction_date: row.transactionDate,
            description: row.description,
            amount_satang: row.amountSatang,
            match_status: 'unmatched',
            source_file: input.fileName,
          },
          reason: `นำเข้า statement ${input.fileName} ของบัญชี ${bankAccountLabel(account)} (ไฟล์ 35 §9)`,
          ipAddress: ctx.meta.ipAddress,
          userAgent: ctx.meta.userAgent,
        },
        tx,
      )
      return record
    })

    created.push({ id: inserted.id, row })
  }

  // auto-match รอบเดียวหลังบันทึกครบ — ผู้สมัครถูกอ่านครั้งเดียวต่อฝั่ง
  const billingCandidates = await loadCandidates(ctx.actor.organizationId, 'billing')
  const payoutCandidates = await loadCandidates(ctx.actor.organizationId, 'payout')
  const takenIds = new Set<string>()
  let autoMatched = 0

  for (const entry of created) {
    const pool = (transactionSide(entry.row.amountSatang) === 'in' ? billingCandidates : payoutCandidates).filter(
      (candidate) => !takenIds.has(candidate.id),
    )
    const outcome = findAutoMatch(
      {
        amountSatang: entry.row.amountSatang,
        transactionDate: entry.row.transactionDate,
        toleranceDays: account.autoMatchToleranceDays,
      },
      pool,
    )
    if (!outcome.matched) continue

    takenIds.add(outcome.candidate.id)
    await applyMatch(ctx, {
      transactionId: entry.id,
      candidate: outcome.candidate,
      mode: 'auto',
      matchNote: null,
    })
    autoMatched += 1
  }

  return {
    bankAccountId: account.id,
    fileName: input.fileName,
    parsedRows: parsed.rows.length,
    imported: created.length,
    duplicates,
    skippedRows: parsed.errors,
    autoMatched,
    usedConfiguredMapping: parsed.usedConfiguredMapping,
    periods: [...periodCache.values()].map((period) => ({ periodId: period.id, periodLabel: period.label })),
  }
}

// ── จับคู่ (auto/manual ใช้เส้นทางเดียวกัน) ──────────────────────────────────

async function loadTransaction(organizationId: string, id: string): Promise<TxRow> {
  const row = await prisma.bankTransaction.findFirst({
    where: { id, organizationId },
    select: TX_SELECT,
  })
  if (row === null) throw new BankReconError('BANK_TRANSACTION_NOT_FOUND')
  return row
}

interface ApplyMatchInput {
  transactionId: string
  candidate: MatchCandidate
  mode: 'auto' | 'manual'
  matchNote: string | null
}

/**
 * เขียนผลการจับคู่ + ผลข้างเคียง — ใช้ทั้งเส้นทางอัตโนมัติและ manual
 *
 * ลำดับ (สำคัญ): `$transaction` เดียวสำหรับ [ปลดการจับคู่เดิม → อัปเดตรายการ → สร้าง Cash Receipt
 * → audit] แล้วจึงเรียกจุดเสียบของโมดูลปลายทาง (`applyBillingReceipt()` / `syncPayoutBatchCompleted()`)
 * ซึ่ง**รับยอดสะสม/idempotent** ⇒ เรียกซ้ำได้ถ้าขั้นหลังพลาด โดยไม่นับเงินซ้ำ
 */
async function applyMatch(ctx: AccountingMutationContext, input: ApplyMatchInput): Promise<MatchResultDto> {
  const before = await loadTransaction(ctx.actor.organizationId, input.transactionId)
  const status = nextBankMatchStatus(before.matchStatus, input.mode === 'auto' ? 'auto_match' : 'manual_match')
  if (status === null) {
    throw new BankReconError('BANK_TRANSACTION_INVALID_STATUS', {
      detail: `${before.matchStatus} → ${input.mode}`,
    })
  }

  await assertPeriodOpenAt({
    organizationId: ctx.actor.organizationId,
    at: before.transactionDate,
    targetType: TARGET,
    targetId: before.id,
  })

  const previousBillingId = before.matchedBillingId
  const note = input.matchNote?.trim() ?? null
  const reason =
    note ??
    `จับคู่รายการเดินบัญชีกับ ${input.candidate.ref} ${input.mode === 'auto' ? 'อัตโนมัติ' : 'โดยเจ้าหน้าที่'} (ไฟล์ 35 §6.2)`

  const { cashReceiptId } = await prisma.$transaction(async (tx) => {
    // เปลี่ยนการจับคู่เดิม (re-match) — ถอน Cash Receipt ของการจับคู่เดิมออกก่อน ไม่ให้ยอดรับซ้ำ
    if (previousBillingId !== null) {
      const stale = await tx.cashReceipt.findMany({
        where: { organizationId: ctx.actor.organizationId, bankTransactionId: before.id },
        select: { id: true, billingBatchId: true, amountSatang: true, receivedDate: true },
      })
      for (const receipt of stale) {
        await tx.cashReceipt.delete({ where: { id: receipt.id } })
        await emitAudit(
          {
            organizationId: ctx.actor.organizationId,
            actorId: ctx.actor.id,
            actorRole: ctx.actor.roleName,
            action: 'delete',
            targetType: CASH_RECEIPT_TARGET,
            targetId: receipt.id,
            before: {
              billing_batch_id: receipt.billingBatchId,
              amount_satang: receipt.amountSatang,
              received_date: receipt.receivedDate,
            },
            reason: `ยกเลิกเงินรับเดิมเพราะเปลี่ยนการจับคู่รายการเดินบัญชี ${before.id} (ไฟล์ 35 §10)`,
            ipAddress: ctx.meta.ipAddress,
            userAgent: ctx.meta.userAgent,
          },
          tx,
        )
      }
    }

    await tx.bankTransaction.update({
      where: { id: before.id },
      data: {
        matchStatus: status,
        matchNote: note,
        matchedBillingId: input.candidate.kind === 'billing' ? input.candidate.id : null,
        matchedPayoutId: input.candidate.kind === 'payout' ? input.candidate.id : null,
        matchedAdvanceId: null,
        isSplitAllocation: false,
        matchedBy: ctx.actor.id,
        matchedAt: new Date(),
        updatedBy: ctx.actor.id,
      },
    })

    let receiptId: string | null = null
    if (input.candidate.kind === 'billing') {
      const receipt = await tx.cashReceipt.create({
        data: {
          organizationId: ctx.actor.organizationId,
          periodId: before.periodId,
          billingBatchId: input.candidate.id,
          bankTransactionId: before.id,
          amountSatang: absSatang(before.amountSatang),
          receivedDate: before.transactionDate,
          note,
          createdBy: ctx.actor.id,
        },
        select: { id: true },
      })
      receiptId = receipt.id
      await emitAudit(
        {
          organizationId: ctx.actor.organizationId,
          actorId: ctx.actor.id,
          actorRole: ctx.actor.roleName,
          action: 'create',
          targetType: CASH_RECEIPT_TARGET,
          targetId: receipt.id,
          after: {
            billing_batch_id: input.candidate.id,
            bank_transaction_id: before.id,
            amount_satang: absSatang(before.amountSatang),
            received_date: before.transactionDate,
            source: 'bank_reconciliation',
          },
          reason: `เงินรับจากการจับคู่รายการเดินบัญชีกับ ${input.candidate.ref} (ไฟล์ 31 §6 — ห้ามสร้างมือ)`,
          ipAddress: ctx.meta.ipAddress,
          userAgent: ctx.meta.userAgent,
        },
        tx,
      )
    }

    await emitAudit(
      {
        organizationId: ctx.actor.organizationId,
        actorId: ctx.actor.id,
        actorRole: ctx.actor.roleName,
        action: 'update',
        targetType: TARGET,
        targetId: before.id,
        before: {
          match_status: before.matchStatus,
          matched_billing_id: before.matchedBillingId,
          matched_payout_id: before.matchedPayoutId,
          match_note: before.matchNote,
        },
        after: {
          match_status: status,
          matched_billing_id: input.candidate.kind === 'billing' ? input.candidate.id : null,
          matched_payout_id: input.candidate.kind === 'payout' ? input.candidate.id : null,
          match_note: note,
          matched_ref: input.candidate.ref,
          amount_satang: before.amountSatang,
        },
        reason,
        ipAddress: ctx.meta.ipAddress,
        userAgent: ctx.meta.userAgent,
        diffOnly: false,
      },
      tx,
    )

    return { cashReceiptId: receiptId }
  })

  // ── trigger 2 ทาง (`35` §9) — จุดเสียบของโมดูลปลายทาง idempotent ทั้งคู่
  let effect: MatchResultDto['effect'] = null

  if (previousBillingId !== null && previousBillingId !== input.candidate.id) {
    // รอบเดิมต้องถูกลดยอดรับลงหลังถอน Cash Receipt ออกแล้ว
    await syncBillingAfterReceipt(ctx, previousBillingId, `bank_transaction:${before.id}:rematch`)
  }

  if (input.candidate.kind === 'billing' && cashReceiptId !== null) {
    const applied = await syncBillingAfterReceipt(ctx, input.candidate.id, `bank_transaction:${before.id}`)
    effect = { kind: 'billing', cashReceiptId, ...applied }
  }

  // ⚠️ re-match ที่ย้ายออกจากรอบจ่ายเดิม: `23` §6.6 ไม่มีเส้นทาง `completed → file_generated`
  //    ⇒ รอบเดิมยังคง `completed` โดยตั้งใจ (ย้อนสถานะการจ่ายเงินจริงเงียบ ๆ ไม่ได้) —
  //    ถ้าต้องแก้ยอดของรอบเดิมต้องผ่าน Adjustment (ไฟล์ 20) · การเปลี่ยนคู่ถูกบันทึกลง audit แล้ว
  if (input.candidate.kind === 'payout') {
    const payoutStatus = await syncPayoutBatchCompleted({
      organizationId: ctx.actor.organizationId,
      batchId: input.candidate.id,
      bankTransactionId: before.id,
      actorId: ctx.actor.id,
      actorRole: ctx.actor.roleName,
    })
    effect = { kind: 'payout', payoutStatus }
  }

  const after = await loadTransaction(ctx.actor.organizationId, before.id)
  return { transaction: toDto(after), effect }
}

/**
 * `PATCH /api/bank-reconciliation/transactions/:id/match` (`35` §6.3)
 *
 * - จับคู่ทับของเดิม ⇒ เตือน `ALREADY_MATCHED` ก่อนเสมอ ยืนยันแล้วค่อยเปลี่ยน (`35` §11)
 * - ยอดไม่ตรงเป๊ะ หรือเป็นการเปลี่ยนการจับคู่เดิม ⇒ `MATCH_NOTE_REQUIRED`
 */
export async function matchBankTransaction(
  ctx: AccountingMutationContext,
  transactionId: string,
  input: BankMatchInput,
): Promise<{ result: MatchResultDto | null; warning?: ApiWarning }> {
  const transaction = await loadTransaction(ctx.actor.organizationId, transactionId)

  if (transaction.matchStatus === 'unmatched_resolved') {
    throw new BankReconError('BANK_TRANSACTION_INVALID_STATUS', {
      detail: 'unmatched_resolved เป็นสถานะสุดท้าย จับคู่ต่อไม่ได้ (`23` §6.14)',
    })
  }

  const expectedKind = allowedTargetKind(transaction.amountSatang)
  if (input.targetKind !== expectedKind) {
    throw new BankReconError('BANK_TRANSACTION_INVALID_STATUS', {
      detail: `รายการฝั่ง ${transactionSide(transaction.amountSatang)} จับคู่กับ ${input.targetKind} ไม่ได้`,
    })
  }

  const rematch = isMatched(transaction.matchStatus)
  if (rematch && !input.confirmRematch) {
    const currentRef =
      transaction.matchedBilling !== null
        ? billingRef(transaction.matchedBilling)
        : (transaction.matchedPayout?.name ?? 'รายการเดิม')
    return { result: null, warning: alreadyMatchedWarning(currentRef) }
  }

  const candidates = await loadCandidates(ctx.actor.organizationId, input.targetKind)
  const candidate = candidates.find((item) => item.id === input.targetId)
  if (candidate === undefined) {
    throw input.targetKind === 'billing'
      ? new RevenueError('BILLING_BATCH_NOT_FOUND', { detail: `batch=${input.targetId}` })
      : new PayoutError('PAYOUT_BATCH_NOT_FOUND', { detail: `batch=${input.targetId}` })
  }

  const exactAmount = isExactMatchAmount(transaction.amountSatang, candidate)
  if (manualMatchRequiresNote({ exactAmount, isRematch: rematch }) && !hasNote(input.matchNote)) {
    throw new BankReconError('MATCH_NOTE_REQUIRED', {
      detail: exactAmount ? 'เปลี่ยนการจับคู่เดิมต้องมีเหตุผล' : 'ยอดไม่ตรงเป๊ะ',
      context: { transactionAmountSatang: transaction.amountSatang, targetAmountSatang: candidate.amountSatang },
    })
  }

  const result = await applyMatch(ctx, {
    transactionId,
    candidate,
    mode: 'manual',
    matchNote: input.matchNote,
  })
  return { result }
}

/**
 * `PATCH /api/bank-reconciliation/transactions/:id/resolve-unmatched` (`35` §6.4)
 * — ปิดรายการที่ไม่มีทางจับคู่ได้จริง (ค่าธรรมเนียม/ดอกเบี้ย) **ห้ามผูก FK** + เหตุผลบังคับเสมอ
 */
export async function resolveUnmatchedTransaction(
  ctx: AccountingMutationContext,
  transactionId: string,
  input: ResolveUnmatchedInput,
): Promise<BankTransactionDto> {
  const before = await loadTransaction(ctx.actor.organizationId, transactionId)
  const status = nextBankMatchStatus(before.matchStatus, 'resolve_unmatched')
  if (status === null) {
    throw new BankReconError('BANK_TRANSACTION_INVALID_STATUS', {
      detail: `${before.matchStatus} → unmatched_resolved (ปิดได้เฉพาะรายการที่ยังไม่จับคู่)`,
    })
  }
  if (!hasNote(input.matchNote)) throw new BankReconError('MATCH_NOTE_REQUIRED')

  await assertPeriodOpenAt({
    organizationId: ctx.actor.organizationId,
    at: before.transactionDate,
    targetType: TARGET,
    targetId: before.id,
  })

  const note = input.matchNote.trim()
  await prisma.$transaction(async (tx) => {
    await tx.bankTransaction.update({
      where: { id: before.id },
      data: {
        matchStatus: status,
        matchNote: note,
        matchedBillingId: null,
        matchedPayoutId: null,
        matchedAdvanceId: null,
        isSplitAllocation: false,
        matchedBy: ctx.actor.id,
        matchedAt: new Date(),
        updatedBy: ctx.actor.id,
      },
    })
    await emitAudit(
      {
        organizationId: ctx.actor.organizationId,
        actorId: ctx.actor.id,
        actorRole: ctx.actor.roleName,
        action: 'status_change',
        targetType: TARGET,
        targetId: before.id,
        before: { match_status: before.matchStatus, match_note: before.matchNote },
        after: { match_status: status, match_note: note, amount_satang: before.amountSatang },
        reason: note,
        ipAddress: ctx.meta.ipAddress,
        userAgent: ctx.meta.userAgent,
        diffOnly: false,
      },
      tx,
    )
  })

  return toDto(await loadTransaction(ctx.actor.organizationId, before.id))
}
