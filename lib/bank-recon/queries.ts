import { payoutTransferSatang } from '@/lib/finance/advance-offset-calc'
import { ensurePeriodForDate, type AccountingMutationContext } from '@/lib/accounting/queries'
import { assertPeriodOpenAt } from '@/lib/accounting/period-guard'
import type { ApiWarning } from '@/lib/api/envelope'
import { alreadyMatchedWarning, BankReconError } from '@/lib/bank-recon/errors'
import {
  allowedTargetKind,
  PROPOSAL_MATCH_NOTE,
  alreadyMatchedWithText,
  canMoveToSuspense,
  debitNoteReferenceDate,
  findAutoMatch,
  findMatchProposals,
  hasNote,
  isExactMatchAmount,
  isMatched,
  manualMatchRequiresNote,
  nextBankMatchStatus,
  suspenseMatchRequiresNote,
  transactionSide,
  whtWithheldForReceipt,
  type MatchCandidate,
  type MatchTargetKind,
} from '@/lib/bank-recon/matching'
import { BANK_MATCH_STATUS_LABEL } from '@/lib/bank-recon/matching'
import type {
  BankMatchInput,
  BankTransactionListQuery,
  MatchCandidateQuery,
  MoveToSuspenseInput,
  RefundSuspenseInput,
  ResolveUnmatchedInput,
  StatementImportInput,
} from '@/lib/bank-recon/schemas'
import {
  buildStatementImportTemplate,
  parseStatementCsv,
  StatementParseError,
  statementRowKey,
  withOccurrenceSeq,
  type StatementRow,
} from '@/lib/bank-recon/statement'
import type {
  BankTransactionDto,
  BankTransactionListDto,
  MatchCandidateDto,
  MatchProposalDto,
  MatchResultDto,
  StatementImportResultDto,
  StatementImportTemplateDto,
} from '@/lib/bank-recon/types'
import { emitAudit } from '@/lib/audit/audit'
import { SalesError } from '@/lib/sales/errors'
import type { SessionUser } from '@/lib/auth/types'
import { calculateCustomerWithheldWht } from '@/lib/finance/wht-calc'
import { Prisma } from '@/lib/generated/prisma/client'
import type {
  BankFileEncoding,
  BankFilePurpose,
  BankFileType,
  BankMatchStatus,
} from '@/lib/generated/prisma/enums'
import { arOutstandingSatang, remainingAfterCustomerWhtSatang } from '@/lib/finance/ar-calc'
import { withDocumentedArTotals } from '@/lib/portal/documented-amounts'
import { prisma } from '@/lib/prisma'
import { PayoutError } from '@/lib/payout/errors'
import { PAYOUT_STATUS_LABEL } from '@/lib/payout/payout'
import { finishPayoutPostCompletionSafely } from '@/lib/payout/post-completion'
import { syncPayoutBatchCompleted } from '@/lib/payout/queries'
import { RevenueError } from '@/lib/revenue/errors'
import { BILLING_STATUS_LABEL } from '@/lib/revenue/revenue-ui'
import { applyBillingReceipt } from '@/lib/revenue/queries'
import { getFinancePolicy } from '@/lib/settings/queries/finance-policy'
import { bankFileFormatLabel, parseColumnMapping } from '@/lib/settings/bank-file'
import { SettingsError } from '@/lib/settings/errors'
import { assertOrgWideReadable } from '@/lib/auth/scope'
import { createPendingCustomerWht, releaseCustomerWhtForReceipt } from '@/lib/customer-wht/queries'
import { bankRefundFileRule } from '@/lib/uploads/rules'
import { verifyUploadedFile } from '@/lib/uploads/verify'

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
 * - นำเข้าไฟล์เดิมซ้ำต้อง**ไม่นับเงินซ้ำ** — กันด้วย `statementRowKey()` (วัน+ยอด+รายละเอียด+ลำดับการเกิดในไฟล์ — U136)
 * - ทุก mutation ลง audit — จับคู่/เปลี่ยนการจับคู่/ปิดรายการ ใช้ `match_note` เป็นเหตุผล (`35` §13)
 * - **U40** (มติ PO 05/10/2569): เงินรับที่ลูกค้าหักภาษี ⇒ สร้างรายการ "รอ 50 ทวิ จากลูกค้า" ใน tx เดียวกับเงินรับ
 *   · เปลี่ยนการจับคู่ ⇒ ถอนรายการรอ 50 ทวิ ของเงินรับเดิมก่อนลบเงินรับ (`lib/customer-wht/queries.ts`)
 * - **U41**: `unmatched → suspense` ("เงินรับรอตรวจสอบ" — **ไม่สร้างเงินรับ ไม่แตะ AR ไม่รับรู้รายได้**) →
 *   ภายหลังจับคู่กับรอบวางบิล (สายปกติ + เหตุผลบังคับ) หรือ `suspense → suspense_refunded` (คืนเงินผู้โอน)
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
  matchedBilling: { select: { id: true, batchNumber: true, period: true, company: { select: { name: true } } } },
  matchedPayout: { select: { id: true, name: true } },
  matchedByUser: { select: { fullName: true } },
  suspenseNote: true,
  suspendedAt: true,
  suspendedByUser: { select: { fullName: true } },
  refundDate: true,
  refundNote: true,
  refundFilePath: true,
  refundedByUser: { select: { fullName: true } },
} satisfies Prisma.BankTransactionSelect

type TxRow = Prisma.BankTransactionGetPayload<{ select: typeof TX_SELECT }>

function bankAccountLabel(account: { bankName: string; accountNumber: string }): string {
  const tail = account.accountNumber.slice(-4)
  return `${account.bankName} (***${tail})`
}

function billingRef(batch: { batchNumber: string; period: string; company: { name: string } }): string {
  // มติ U76 — นำด้วยเลขรอบจริง BL-<พ.ศ.>-NNN
  return `รอบวางบิล ${batch.batchNumber} (${batch.period}) · ${batch.company.name}`
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
    suspenseNote: row.suspenseNote,
    suspendedAt: row.suspendedAt?.toISOString() ?? null,
    suspendedByName: row.suspendedByUser?.fullName ?? null,
    refundDate: row.refundDate?.toISOString() ?? null,
    refundNote: row.refundNote,
    refundFilePath: row.refundFilePath,
    refundedByName: row.refundedByUser?.fullName ?? null,
    createdAt: row.createdAt.toISOString(),
  }
}

/** U41 — เงินรับรอตรวจสอบที่ยังคงค้างทั้งองค์กร (หนี้สินที่ยังไม่ทราบที่มา) */
async function suspenseOutstanding(organizationId: string): Promise<{ count: number; amountSatang: number }> {
  const aggregate = await prisma.bankTransaction.aggregate({
    where: { organizationId, matchStatus: 'suspense' },
    _count: { _all: true },
    _sum: { amountSatang: true },
  })
  return { count: aggregate._count._all, amountSatang: aggregate._sum.amountSatang ?? 0 }
}

// ── อ่านรายการ ──────────────────────────────────────────────────────────────

export async function listBankTransactions(
  user: SessionUser,
  query: BankTransactionListQuery,
): Promise<BankTransactionListDto> {
  assertOrgWideReadable(user, 'bank-transactions')
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
  const outstanding = await suspenseOutstanding(user.organizationId)

  return {
    items,
    summary: {
      total: items.length,
      unmatched: countBy('unmatched'),
      autoMatched: countBy('auto_matched'),
      manualMatched: countBy('manual_matched'),
      unmatchedResolved: countBy('unmatched_resolved'),
      suspense: countBy('suspense'),
      suspenseRefunded: countBy('suspense_refunded'),
      suspenseOutstandingCount: outstanding.count,
      suspenseOutstandingSatang: outstanding.amountSatang,
      totalInSatang: items.filter((item) => item.amountSatang > 0).reduce((sum, item) => sum + item.amountSatang, 0),
      totalOutSatang: items
        .filter((item) => item.amountSatang < 0)
        .reduce((sum, item) => sum + absSatang(item.amountSatang), 0),
    },
  }
}

// ── ผู้สมัครจับคู่ ───────────────────────────────────────────────────────────

/**
 * **A1 — ยอดเข้าจริงเมื่อลูกค้าหัก WHT ก่อนโอน** (มติ PO 2026-08-12 · `35` §6.2)
 *
 * `billing_batches.wht_withheld_by_customer_satang` เป็นยอดที่ **บันทึกตอนรับชำระแล้ว**
 * (`applyBillingReceipt()` เขียนลงตอนจับคู่สำเร็จ) ⇒ ตอนที่ยังไม่เคยรับเงินเลยค่านี้เป็น 0 เสมอ
 * ⇒ ถ้ายึดค่านี้อย่างเดียว **ยอดทางเลือกไม่มีวันเกิด** และเงินโอนที่ถูกหักภาษีมาแล้วจะจับคู่
 * อัตโนมัติไม่ได้สักใบ (ไก่กับไข่) ⇒ AR ค้าง 3% ตลอดกาลตามที่ A1 ระบุไว้เป็นปัญหาตั้งต้น
 *
 * ⇒ ยังไม่มียอดที่บันทึกไว้ ให้**คาดการณ์**จากอัตราของบริษัท (`finance_companies`
 * `.wht_withheld_by_customer_pct` · `NULL` = ไม่หัก) บนฐานรายได้ **ก่อน VAT** ของรอบ
 * · ค่านี้เป็นเพียงยอด*ทางเลือก* — ยอดเต็มยังจับคู่ได้เหมือนเดิมเสมอ (`matching.ts` รับได้ทั้งคู่)
 * ⇒ คาดผิดไม่ทำให้จับคู่พลาด และไม่แตะยอด AR (ยอดหักจริงถูกบันทึกตอนจับคู่สำเร็จเท่านั้น)
 */
function altAmountForBilling(row: {
  totalSatang: number
  whtWithheldByCustomerSatang: number
  company: { whtWithheldByCustomerPct: Prisma.Decimal | null }
  revenues: readonly { grossSatang: number }[]
}): number | null {
  const withheldSatang =
    row.whtWithheldByCustomerSatang > 0
      ? row.whtWithheldByCustomerSatang
      : calculateCustomerWithheldWht({
          amountBeforeVatSatang: row.revenues.reduce((sum, revenue) => sum + revenue.grossSatang, 0),
          whtPct: row.company.whtWithheldByCustomerPct === null ? null : Number(row.company.whtWithheldByCustomerPct),
        })
  return withheldSatang > 0 ? row.totalSatang - withheldSatang : null
}

/**
 * ผู้สมัครที่ระบบยอมให้จับคู่ — เงินเข้า = รอบวางบิลที่ยังเก็บเงินไม่ครบ (`sent`/`partially_paid`)
 * · เงินออก = รอบจ่ายที่สร้างไฟล์โอนแล้ว (`file_generated`) หรือที่ยืนยันจ่ายแล้ว (`completed`
 * — สำหรับเคสจับคู่ใหม่/แยกงวด) ตาม `35` §6.2 + state machine `23` §6.6/§6.8
 */
/** วันออกใบเพิ่มหนี้ active ล่าสุดต่อรอบวางบิล (มติ O77) */
async function latestDebitNoteDateByBatch(
  organizationId: string,
  billingBatchIds: readonly string[],
): Promise<Map<string, Date>> {
  const result = new Map<string, Date>()
  if (billingBatchIds.length === 0) return result
  const notes = await prisma.creditNote.findMany({
    where: {
      organizationId,
      noteType: 'debit',
      status: 'active',
      taxInvoice: { salesRecord: { billingBatchId: { in: [...billingBatchIds] } } },
    },
    select: { issueDate: true, taxInvoice: { select: { salesRecord: { select: { billingBatchId: true } } } } },
  })
  for (const note of notes) {
    const batchId = note.taxInvoice.salesRecord.billingBatchId
    const current = result.get(batchId)
    if (current === undefined || note.issueDate.getTime() > current.getTime()) result.set(batchId, note.issueDate)
  }
  return result
}

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
                { batchNumber: { contains: search, mode: 'insensitive' } },
                { company: { name: { contains: search, mode: 'insensitive' } } },
              ],
            }),
      },
      select: {
        id: true,
        batchNumber: true,
        period: true,
        totalSatang: true,
        receivedSatang: true,
        whtWithheldByCustomerSatang: true,
        bankFeeWrittenOffSatang: true,
        sentAt: true,
        company: { select: { name: true, whtWithheldByCustomerPct: true } },
        revenues: { select: { grossSatang: true } },
      },
      orderBy: { sentAt: 'desc' },
      take: 100,
    })

    // มติ O75 — ยอดของรอบ = ยอดตามเอกสาร (รวมใบลด/เพิ่มหนี้) · รอบที่รับเงินไปบางส่วนแล้วรับ "ยอดค้างที่เหลือ" เป็นยอดตรงด้วย
    const [documented, debitNoteDates] = await Promise.all([
      withDocumentedArTotals(organizationId, rows),
      latestDebitNoteDateByBatch(
        organizationId,
        rows.map((row) => row.id),
      ),
    ])
    return documented.map((row) => {
      const remaining = arOutstandingSatang(row)
      const hasReceipts = remaining !== row.totalSatang
      const remainingAmountSatang = hasReceipts && remaining > 0 ? remaining : null
      const altAmountSatang = altAmountForBilling(row)
      // staging E-064 — ยอดค้างหลังลูกค้าหัก ณ ที่จ่ายส่วนที่ยังไม่บันทึก (`22` §6.11.1)
      const remainingAltAmountSatang =
        remainingAmountSatang === null || altAmountSatang === null
          ? null
          : remainingAfterCustomerWhtSatang({
              remainingSatang: remainingAmountSatang,
              expectedWhtSatang: Math.max(0, row.totalSatang - altAmountSatang),
              priorWhtSatang: row.whtWithheldByCustomerSatang,
            })
      return {
        kind: 'billing' as const,
        id: row.id,
        ref: billingRef(row),
        amountSatang: row.totalSatang,
        // A1 — ลูกค้าหัก WHT ก่อนโอน ⇒ ยอดเข้าจริง = total − wht (`35` §6.2 · มติ PO A1)
        altAmountSatang,
        remainingAmountSatang,
        remainingAltAmountSatang,
        referenceDate: row.sentAt,
        // มติ O77 — ยอดค้างจากใบเพิ่มหนี้ ⇒ ช่วงวันนับจากวันออกใบเพิ่มหนี้ล่าสุด
        remainingReferenceDate:
          remainingAmountSatang === null ? null : debitNoteReferenceDate(row.sentAt, debitNoteDates.get(row.id) ?? null),
      }
    })
  }

  const rows = await prisma.payoutBatch.findMany({
    where: {
      organizationId,
      deletedAt: null,
      status: { in: ['file_generated', 'completed'] },
      ...(search === undefined || search === '' ? {} : { name: { contains: search, mode: 'insensitive' } }),
    },
    select: {
      id: true,
      name: true,
      netSatang: true,
      advanceOffsetSatang: true,
      recoveryOffsetSatang: true,
      paymentFileGeneratedAt: true,
      status: true,
      // staging E-057 — รายการเดินบัญชีที่จับคู่รอบนี้ไปแล้ว (แสดง "จับคู่แล้วกับ…" + ต้องยืนยันก่อนจับซ้ำ)
      bankTransactions: {
        where: { matchStatus: { in: ['auto_matched', 'manual_matched'] } },
        select: { id: true, transactionDate: true, amountSatang: true },
        orderBy: { transactionDate: 'asc' },
      },
    },
    orderBy: { paymentFileGeneratedAt: 'desc' },
    take: 100,
  })

  return rows.map((row) => ({
    kind: 'payout' as const,
    id: row.id,
    ref: row.name,
    // มติ PO U30 — เงินออกจากบัญชีจริง = ยอดโอน (net − หักคืนเงินทดรอง · `22` §6.14) ไม่ใช่ net
    amountSatang: payoutTransferSatang(row.netSatang, row.advanceOffsetSatang, row.recoveryOffsetSatang),
    altAmountSatang: null,
    // รอบที่ `completed` แล้วไม่เข้าเกณฑ์อัตโนมัติ (จับคู่ไปแล้วครั้งหนึ่ง) — เลือก manual ได้เท่านั้น
    referenceDate: row.status === 'file_generated' ? row.paymentFileGeneratedAt : null,
    matchedTransactions: row.bankTransactions,
  }))
}

/** ตัวเลือกของ Modal "จับคู่ Manual" (`35` §8) — เฉพาะฝั่งที่ตรงกับเครื่องหมายของรายการ */
export async function listMatchCandidates(
  user: SessionUser,
  query: MatchCandidateQuery,
): Promise<MatchCandidateDto[]> {
  assertOrgWideReadable(user, 'bank-transactions')
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
    remainingAmountSatang: candidate.remainingAmountSatang ?? null,
    remainingAltAmountSatang: candidate.remainingAltAmountSatang ?? null,
    referenceDate: candidate.referenceDate?.toISOString() ?? null,
    exactAmount: isExactMatchAmount(transaction.amountSatang, candidate),
    alreadyMatchedWith: alreadyMatchedWithText(candidate.matchedTransactions, query.transactionId),
  }))
}

// ── คู่ที่เสนอ — จับคู่ทางกลับ (มติ PO 07/10/2569 U137) ─────────────────────────

/** รายการเดินบัญชีที่ยังไม่จับคู่สูงสุดที่นำมาเทียบต่อครั้ง (ใหม่สุดก่อน) */
const PROPOSAL_TRANSACTION_LIMIT = 500

/**
 * `GET /api/bank-reconciliation/match-proposals` — **คู่ที่เสนอ** ให้กดยืนยัน 1 คลิก (ไม่จับคู่เงียบ)
 *
 * ทางกลับของ auto-match ตอนนำเข้า: เอกสารที่เกิด/เปลี่ยนสถานะ **หลัง** statement ถูกนำเข้าแล้ว
 * (บันทึกรอบวางบิลส่งแล้ว · รอบจ่ายยืนยันจ่ายสำเร็จด้วยมือ) จะไม่มีวันถูกจับคู่อัตโนมัติอีก ⇒ คำนวณสด
 * ทุกครั้งที่เปิดหน้า: เอกสารที่ยังรอจับคู่ × รายการ `unmatched` ที่ยอดตรง + วันอยู่ในช่วงเกณฑ์เดิม
 * (`findMatchProposals()` — tolerance ของบัญชีของรายการ)
 *
 * - รอบวางบิล: `sent` / `partially_paid` (ผู้สมัครชุดเดียวกับ auto-match)
 * - รอบจ่าย: `file_generated` / `completed` ที่ **ยังไม่มีรายการเดินบัญชีจับคู่** · วันอ้างอิง = วันสร้างไฟล์โอน
 * - ยืนยัน = `PATCH /transactions/:id/match` เดิม (สิทธิ์/กติกา/audit ของการจับคู่มือทุกข้อ) + `fromProposal`
 */
export async function listMatchProposals(user: SessionUser): Promise<MatchProposalDto[]> {
  assertOrgWideReadable(user, 'bank-transactions')
  const organizationId = user.organizationId

  const transactions = await prisma.bankTransaction.findMany({
    where: { organizationId, matchStatus: 'unmatched' },
    orderBy: [{ transactionDate: 'desc' }, { id: 'asc' }],
    take: PROPOSAL_TRANSACTION_LIMIT,
    select: {
      id: true,
      transactionDate: true,
      description: true,
      amountSatang: true,
      bankAccount: { select: { bankName: true, accountNumber: true, autoMatchToleranceDays: true } },
    },
  })
  if (transactions.length === 0) return []

  const billing = await loadCandidates(organizationId, 'billing')
  const payoutRows = await prisma.payoutBatch.findMany({
    where: {
      organizationId,
      deletedAt: null,
      status: { in: ['file_generated', 'completed'] },
      paymentFileGeneratedAt: { not: null },
      bankTransactions: { none: { matchStatus: { in: ['auto_matched', 'manual_matched'] } } },
    },
    select: { id: true, name: true, status: true, netSatang: true, advanceOffsetSatang: true, recoveryOffsetSatang: true, paymentFileGeneratedAt: true },
    orderBy: { paymentFileGeneratedAt: 'desc' },
    take: 100,
  })
  const targetLabel = new Map(payoutRows.map((row) => [`payout:${row.id}`, PAYOUT_STATUS_LABEL[row.status]]))
  const payouts: MatchCandidate[] = payoutRows.map((row) => ({
    kind: 'payout',
    id: row.id,
    ref: row.name,
    amountSatang: payoutTransferSatang(row.netSatang, row.advanceOffsetSatang, row.recoveryOffsetSatang),
    altAmountSatang: null,
    referenceDate: row.paymentFileGeneratedAt,
  }))
  const billingRows = await prisma.billingBatch.findMany({
    where: { organizationId, id: { in: billing.map((candidate) => candidate.id) } },
    select: { id: true, status: true },
  })
  for (const row of billingRows) targetLabel.set(`billing:${row.id}`, BILLING_STATUS_LABEL[row.status])

  const byId = new Map(transactions.map((row) => [row.id, row]))
  const proposals = findMatchProposals(
    [...billing, ...payouts],
    transactions.map((row) => ({
      id: row.id,
      amountSatang: row.amountSatang,
      transactionDate: row.transactionDate,
      toleranceDays: row.bankAccount.autoMatchToleranceDays,
    })),
  )

  return proposals.flatMap((proposal) => {
    const transaction = byId.get(proposal.transactionId)
    const referenceDate = proposal.referenceDate
    if (transaction === undefined) return []
    const statusLabel = targetLabel.get(`${proposal.candidate.kind}:${proposal.candidate.id}`) ?? ''
    return [
      {
        target: {
          kind: proposal.candidate.kind,
          id: proposal.candidate.id,
          ref: proposal.candidate.ref,
          amountSatang: proposal.candidate.amountSatang,
          statusLabel,
          referenceDate: referenceDate.toISOString(),
        },
        transaction: {
          id: transaction.id,
          transactionDate: transaction.transactionDate.toISOString(),
          description: transaction.description,
          amountSatang: transaction.amountSatang,
          bankAccountLabel: bankAccountLabel(transaction.bankAccount),
        },
        matchedAmountSatang: proposal.matchedAmountSatang,
        ambiguous: proposal.ambiguous,
      },
    ]
  })
}

// ── ผลข้างเคียงของการจับคู่ (trigger 2 ทาง — `35` §9) ────────────────────────

/** ยอดสะสมที่รับชำระแล้วของรอบวางบิลนั้น = ผลรวม Cash Receipt ทั้งหมด (ห้ามบวกเพิ่มทีละก้อน) */
/**
 * ยอดสะสมของรอบวางบิลจากใบเงินรับทั้งหมด — **รวมยอด WHT ที่ลูกค้าหักไว้ด้วย** (A1)
 *
 * ส่วนที่ลูกค้าหักไปเป็นเครดิตภาษีของบริษัท ไม่ใช่หนี้ที่ยังเก็บไม่ได้ (`19` §9.2 · `31` §8) ⇒
 * ต้องส่งกลับไปเขียนที่ `billing_batches` ด้วย ไม่งั้น `settledSatang()` ขาดไป 3% ⇒ รอบค้างอยู่
 * ที่ `partially_paid` และยอดนั้นค้างใน AR aging ตลอดกาลทั้งที่เก็บเงินครบแล้ว
 * · ทั้งคู่เป็น **ยอดสะสม** (ไม่ใช่ส่วนเพิ่ม) ⇒ `applyBillingReceipt()` ยัง idempotent เหมือนเดิม
 */
async function receivedTotalSatang(
  organizationId: string,
  billingBatchId: string,
): Promise<{ receivedSatang: number; whtWithheldByCustomerSatang: number; lastReceivedDate: Date | null }> {
  const aggregate = await prisma.cashReceipt.aggregate({
    where: { organizationId, billingBatchId },
    _sum: { amountSatang: true, whtWithheldByCustomerSatang: true },
    // มติ PO U144 — วันรับเงินล่าสุด = วันที่ตัดส่วนต่างค่าธรรมเนียมธนาคาร (ถ้ามี)
    _max: { receivedDate: true },
  })
  return {
    receivedSatang: aggregate._sum.amountSatang ?? 0,
    whtWithheldByCustomerSatang: aggregate._sum.whtWithheldByCustomerSatang ?? 0,
    lastReceivedDate: aggregate._max.receivedDate,
  }
}

async function syncBillingAfterReceipt(
  ctx: AccountingMutationContext,
  billingBatchId: string,
  sourceRef: string,
): Promise<{ billingStatus: string; outstandingSatang: number; bankFeeWrittenOffSatang: number }> {
  const received = await receivedTotalSatang(ctx.actor.organizationId, billingBatchId)
  const result = await applyBillingReceipt({
    organizationId: ctx.actor.organizationId,
    batchId: billingBatchId,
    receivedSatang: received.receivedSatang,
    whtWithheldByCustomerSatang: received.whtWithheldByCustomerSatang,
    lastReceivedDate: received.lastReceivedDate,
    sourceRef,
    actorId: ctx.actor.id,
    actorRole: ctx.actor.roleName,
  })
  return {
    billingStatus: result.status,
    outstandingSatang: result.outstandingSatang,
    bankFeeWrittenOffSatang: result.bankFeeWrittenOffSatang,
  }
}

// ── นำเข้า statement ────────────────────────────────────────────────────────

interface PreparedRow extends StatementRow {
  /** มติ PO U136 — ลำดับการเกิดของคีย์ (วัน+ยอด+รายละเอียด) เดียวกันในไฟล์นี้ */
  occurrenceSeq: number
  periodId: string
  periodLabel: string
}

/**
 * `POST /api/bank-reconciliation/import` (`35` §14)
 *
 * ขั้นตอน: อ่านไฟล์ตาม format ที่ตั้งไว้ → ผูกงวดด้วย `ensurePeriodForDate()` → กันแถวซ้ำ →
 * บันทึก + audit ต่อแถว → พยายาม auto-match ทีละรายการ (ผลข้างเคียงเดินผ่านทางเดียวกับ manual)
 */
/**
 * รูปแบบ statement ที่ผูกกับบัญชี (`13` §6.3 → §6.8) — อ้างด้วย id (มติ PO U147 · เดิมจับคู่ด้วยชื่อพิมพ์อิสระ)
 * ไม่ได้ตั้ง/ไม่ใช่ชนิด statement = `null` (อ่านจากหัวตาราง) · รูปแบบลบไม่ได้ขณะบัญชีอ้างอยู่ (`BANK_FILE_FORMAT_IN_USE`)
 */
const statementFormatSelect = {
  statementFormat: { select: { purpose: true, bankName: true, fileType: true, encoding: true, columnMapping: true } },
} as const

function statementFormatOf(account: {
  statementFormat: {
    purpose: BankFilePurpose
    bankName: string
    fileType: BankFileType
    encoding: BankFileEncoding
    columnMapping: string
  } | null
}): { columnMapping: string; label: string } | null {
  const format = account.statementFormat
  if (format === null || format.purpose !== 'statement') return null
  return {
    columnMapping: format.columnMapping,
    label: bankFileFormatLabel({ ...format, columns: parseColumnMapping(format.columnMapping) }),
  }
}

/**
 * ไฟล์ตัวอย่างสำหรับนำเข้า statement (มติ PO 04/10/2569 — UAT แม่แบบนำเข้าภาษาไทย)
 * ระบุบัญชี ⇒ เรียงคอลัมน์ตามรูปแบบที่ตั้งไว้กับบัญชีนั้น · ไม่ระบุ/ยังไม่ตั้ง ⇒ รูปแบบมาตรฐานของระบบ
 * อ่านอย่างเดียว (ไม่มี audit) · ผู้เรียกต้องผ่าน `manage` ของกระทบยอดธนาคารเหมือนตัวนำเข้า
 */
export async function getStatementImportTemplate(
  user: SessionUser,
  bankAccountId: string | null,
): Promise<StatementImportTemplateDto> {
  assertOrgWideReadable(user, 'bank-transactions')
  if (bankAccountId === null) {
    return { ...buildStatementImportTemplate(null), bankAccountId: null, statementFormat: null }
  }
  const account = await prisma.bankAccount.findFirst({
    where: { id: bankAccountId, organizationId: user.organizationId, deletedAt: null },
    select: { id: true, ...statementFormatSelect },
  })
  if (account === null) throw new SettingsError('BANK_ACCOUNT_NOT_FOUND', { detail: bankAccountId })
  const format = statementFormatOf(account)
  return {
    ...buildStatementImportTemplate(format?.columnMapping ?? null),
    bankAccountId: account.id,
    statementFormat: format?.label ?? null,
  }
}

export async function importStatement(
  ctx: AccountingMutationContext,
  input: StatementImportInput,
): Promise<StatementImportResultDto> {
  assertOrgWideReadable(ctx.actor, 'bank-transactions')
  const account = await prisma.bankAccount.findFirst({
    where: { id: input.bankAccountId, organizationId: ctx.actor.organizationId, deletedAt: null },
    select: { id: true, bankName: true, accountNumber: true, autoMatchToleranceDays: true, ...statementFormatSelect },
  })
  // code ของโมดูลตั้งค่า (`13` §10 · `24` §6.3) — ใช้ซ้ำ ไม่ประกาศใหม่ (Rule 04)
  if (account === null) throw new SettingsError('BANK_ACCOUNT_NOT_FOUND', { detail: input.bankAccountId })

  const columnMapping = statementFormatOf(account)?.columnMapping ?? null

  let parsed
  try {
    parsed = parseStatementCsv({ csv: input.csv, columnMapping })
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
  for (const row of withOccurrenceSeq(parsed.rows)) {
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
    select: { transactionDate: true, amountSatang: true, description: true, occurrenceSeq: true },
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

    // ด่านที่ 2 ของการกันซ้ำ: `uniq_bank_tx_statement_row` (สะท้อน `statementRowKey()` เป๊ะ)
    // ด่านแรกข้างบนเป็น read-then-insert ⇒ สองคำขอที่อัปไฟล์เดียวกัน **พร้อมกัน** ผ่านทั้งคู่ได้
    // ⇒ เงินเข้าถูกนับซ้ำ · ชนแล้วถือเป็น "ซ้ำ" ตามปกติ ไม่ใช่ล้มทั้งไฟล์
    let inserted: { id: string } | null = null
    try {
      inserted = await prisma.$transaction(async (tx) => {
        const record = await tx.bankTransaction.create({
          data: {
            organizationId: ctx.actor.organizationId,
            periodId: row.periodId,
            bankAccountId: account.id,
            transactionDate: row.transactionDate,
            description: row.description,
            amountSatang: row.amountSatang,
            occurrenceSeq: row.occurrenceSeq,
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
              occurrence_seq: row.occurrenceSeq,
              source_file_line: row.lineNumber,
              match_status: 'unmatched',
              source_file: input.fileName,
            },
            reason: `นำเข้า statement ${input.fileName} ของบัญชี ${bankAccountLabel(account)}`,
            ipAddress: ctx.meta.ipAddress,
            userAgent: ctx.meta.userAgent,
          },
          tx,
        )
        return record
      })
    } catch (error) {
      if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== 'P2002') throw error
      duplicates += 1
      continue
    }

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

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

async function loadTransaction(organizationId: string, id: string): Promise<TxRow> {
  // id จาก URL ที่ไม่ใช่ UUID ⇒ Postgres โยน "invalid input syntax for type uuid" เป็น 500 (UAT BUG-111)
  // ⇒ ตอบเหมือนไม่พบรายการ (404 ไม่ leak) ก่อนถึง DB
  if (!UUID_PATTERN.test(id)) {
    throw new BankReconError('BANK_TRANSACTION_NOT_FOUND', { detail: `transaction=${id} ไม่ใช่ UUID` })
  }
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
  /** มติ PO U137 — ผู้ใช้กดยืนยันคู่ที่ระบบเสนอ (ไม่ใช่เลือกเองจากรายการ) */
  fromProposal?: boolean
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
  const typedNote = input.matchNote?.trim() ?? ''
  // staging E-056 — ยืนยันคู่ที่ระบบเสนอโดยไม่กรอกหมายเหตุ ⇒ เติมหมายเหตุอัตโนมัติ (เดิมแสดง "—")
  const note = typedNote !== '' ? typedNote : input.fromProposal === true ? PROPOSAL_MATCH_NOTE : null
  const reason =
    note ??
    (input.fromProposal === true
      ? `ยืนยันคู่ที่ระบบเสนอ: จับคู่รายการเดินบัญชีกับ ${input.candidate.ref} โดยเจ้าหน้าที่`
      : `จับคู่รายการเดินบัญชีกับ ${input.candidate.ref} ${input.mode === 'auto' ? 'อัตโนมัติ' : 'โดยเจ้าหน้าที่'}`)

  // มติ PO U163 — เพดานค่าธรรมเนียม (U144) ใช้ตัดสินภาษีลูกค้าหักของใบเงินรับด้วย
  const writeOffToleranceSatang =
    input.candidate.kind === 'billing' ? (await getFinancePolicy(ctx.actor.organizationId)).writeOffToleranceSatang : 0

  const { cashReceiptId } = await prisma.$transaction(async (tx) => {
    // มติ PO U67 — ล็อกแถวรอบจ่ายก่อนผูกรายการเดินบัญชี ⇒ แข่งกับการยกเลิกรอบได้ผู้ชนะคนเดียว
    // (การยกเลิกล็อกแถวเดียวกันแล้วตรวจว่ามีรายการเดินบัญชีจับคู่หรือยัง)
    if (input.candidate.kind === 'payout') {
      const locked = await tx.$queryRaw<Array<{ status: string }>>`
        SELECT status::text AS status FROM payout_batches
         WHERE id = ${input.candidate.id}::uuid AND organization_id = ${ctx.actor.organizationId}::uuid
         FOR UPDATE`
      const payoutStatus = locked[0]?.status
      if (payoutStatus !== 'file_generated' && payoutStatus !== 'completed') {
        throw new PayoutError('PAYOUT_BATCH_INVALID_STATUS', {
          detail: `batch=${input.candidate.id} at ${payoutStatus ?? 'missing'}`,
        })
      }
    }

    // เปลี่ยนการจับคู่เดิม (re-match) — ถอน Cash Receipt ของการจับคู่เดิมออกก่อน ไม่ให้ยอดรับซ้ำ
    if (previousBillingId !== null) {
      const stale = await tx.cashReceipt.findMany({
        where: { organizationId: ctx.actor.organizationId, bankTransactionId: before.id },
        select: { id: true, billingBatchId: true, amountSatang: true, receivedDate: true },
      })
      // มติ PO U95 — เงินรับที่ออกใบเสร็จรับเงิน/ใบกำกับภาษี (active) แล้วถอนไม่ได้ ต้องยกเลิกเอกสารพร้อมเหตุผลก่อน
      // (ใบที่ยกเลิกแล้วคงอยู่ — ลิงก์เงินรับเป็น NULL ผ่าน FK `ON DELETE SET NULL`)
      const invoiced = await tx.taxInvoice.findFirst({
        where: { cashReceiptId: { in: stale.map((receipt) => receipt.id) }, status: 'active' },
        select: { invoiceNumber: true },
      })
      if (invoiced !== null) {
        throw new SalesError('CASH_RECEIPT_HAS_TAX_INVOICE', {
          detail: `bank_transaction=${before.id} invoice=${invoiced.invoiceNumber}`,
          message: `เปลี่ยนการจับคู่ไม่ได้ — เงินรับเดิมออกใบเสร็จรับเงิน/ใบกำกับภาษี ${invoiced.invoiceNumber} แล้ว ต้องยกเลิกเอกสารนั้นพร้อมเหตุผลก่อน`,
        })
      }
      for (const receipt of stale) {
        // U40 — รายการรอ 50 ทวิ ของเงินรับเดิมต้องถูกถอนก่อน (ไม่งั้นค้างตามหนังสือที่ไม่มีวันมา)
        await releaseCustomerWhtForReceipt(tx, ctx, receipt.id, `เปลี่ยนการจับคู่รายการเดินบัญชี ${before.id}`)
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
            reason: `ยกเลิกเงินรับเดิมเพราะเปลี่ยนการจับคู่รายการเดินบัญชี ${before.id}`,
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
      // A1 — ลูกค้าหัก WHT ก่อนโอน ⇒ เก็บส่วนต่างไว้กับใบเงินรับเป็นเครดิตภาษี (`31` §8)
      // มติ PO U163 — ตัดสินจากยอดรับสะสม (ใบก่อน ๆ + ใบนี้) ⇒ ล็อกแถวรอบวางบิลกันสองรายการเดินบัญชีนับภาษีซ้ำ
      await tx.$queryRaw`SELECT id FROM billing_batches
         WHERE id = ${input.candidate.id}::uuid AND organization_id = ${ctx.actor.organizationId}::uuid
         FOR UPDATE`
      const prior = await tx.cashReceipt.aggregate({
        where: { organizationId: ctx.actor.organizationId, billingBatchId: input.candidate.id },
        _sum: { amountSatang: true, whtWithheldByCustomerSatang: true },
      })
      const whtWithheldSatang = whtWithheldForReceipt(before.amountSatang, input.candidate, {
        priorReceivedSatang: prior._sum.amountSatang ?? 0,
        priorWhtSatang: prior._sum.whtWithheldByCustomerSatang ?? 0,
        toleranceSatang: writeOffToleranceSatang,
      })
      const receipt = await tx.cashReceipt.create({
        data: {
          organizationId: ctx.actor.organizationId,
          periodId: before.periodId,
          billingBatchId: input.candidate.id,
          bankTransactionId: before.id,
          amountSatang: absSatang(before.amountSatang),
          whtWithheldByCustomerSatang: whtWithheldSatang,
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
            wht_withheld_by_customer_satang: whtWithheldSatang,
            received_date: before.transactionDate,
            source: 'bank_reconciliation',
          },
          reason: `เงินรับจากการจับคู่รายการเดินบัญชีกับ ${input.candidate.ref} (ห้ามสร้างมือ)`,
          ipAddress: ctx.meta.ipAddress,
          userAgent: ctx.meta.userAgent,
        },
        tx,
      )
      // U40 — ลูกค้าหักภาษีไว้ ⇒ เกิดรายการ "รอ 50 ทวิ จากลูกค้า" (tx เดียวกับเงินรับ — ไม่มีทางเกิดครึ่งเดียว)
      await createPendingCustomerWht(tx, ctx, {
        cashReceiptId: receipt.id,
        billingBatchId: input.candidate.id,
        withheldSatang: whtWithheldSatang,
        withheldDate: before.transactionDate,
        sourceRef: input.candidate.ref,
      })
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
          ...(input.fromProposal === true ? { matched_via: 'proposal' } : {}),
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
    // จ่ายจริงแล้ว ⇒ บันทึกบัญชีค่าใช้จ่าย + 50 ทวิ ของรอบนั้น (`32` §6.1) — idempotent เช่นกัน
    // ล้มหลัง commit ⇒ ไม่โยนต่อ · ตัวกวาด `payout_completion_repair` ทำต่อให้ครบ (มติ PO U134)
    if (payoutStatus === 'completed') await finishPayoutPostCompletionSafely(ctx, input.candidate.id)
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
  assertOrgWideReadable(ctx.actor, 'bank-transactions')
  const transaction = await loadTransaction(ctx.actor.organizationId, transactionId)

  if (transaction.matchStatus === 'unmatched_resolved') {
    throw new BankReconError('BANK_TRANSACTION_INVALID_STATUS', {
      detail: 'unmatched_resolved เป็นสถานะสุดท้าย จับคู่ต่อไม่ได้',
      message: 'รายการนี้ถูกปิดโดยไม่จับคู่ไปแล้ว — จับคู่ต่อไม่ได้',
    })
  }
  if (transaction.matchStatus === 'suspense_refunded') {
    throw new BankReconError('BANK_TRANSACTION_INVALID_STATUS', {
      detail: 'suspense_refunded เป็นสถานะสุดท้าย จับคู่ต่อไม่ได้',
      message: 'รายการนี้คืนเงินผู้โอนไปแล้ว — จับคู่ต่อไม่ได้',
    })
  }

  const expectedKind = allowedTargetKind(transaction.amountSatang)
  if (input.targetKind !== expectedKind) {
    throw new BankReconError('BANK_TRANSACTION_INVALID_STATUS', {
      detail: `รายการฝั่ง ${transactionSide(transaction.amountSatang)} จับคู่กับ ${input.targetKind} ไม่ได้`,
      message:
        transactionSide(transaction.amountSatang) === 'in'
          ? 'รายการนี้เป็นเงินเข้า — จับคู่ได้กับรอบวางบิล (รับชำระ) เท่านั้น'
          : 'รายการนี้เป็นเงินออก — จับคู่ได้กับรอบจ่ายเงินเท่านั้น',
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
  // U41 — จับคู่เงินรับรอตรวจสอบเมื่อทราบที่มา ⇒ ต้องอธิบายเสมอว่าทราบจากอะไร
  if (suspenseMatchRequiresNote(transaction.matchStatus) && !hasNote(input.matchNote)) {
    throw new BankReconError('MATCH_NOTE_REQUIRED', {
      detail: 'จับคู่เงินรับรอตรวจสอบต้องมีเหตุผล',
      message: 'จับคู่เงินรับรอตรวจสอบต้องระบุว่าทราบที่มาของเงินจากอะไร',
    })
  }
  const alreadyMatchedWith = alreadyMatchedWithText(candidate.matchedTransactions, transactionId)
  if (
    manualMatchRequiresNote({ exactAmount, isRematch: rematch, targetAlreadyMatched: alreadyMatchedWith !== null }) &&
    !hasNote(input.matchNote)
  ) {
    throw new BankReconError('MATCH_NOTE_REQUIRED', {
      detail:
        alreadyMatchedWith !== null
          ? `รอบจ่ายจับคู่แล้วกับ${alreadyMatchedWith}`
          : exactAmount
            ? 'เปลี่ยนการจับคู่เดิมต้องมีเหตุผล'
            : 'ยอดไม่ตรงเป๊ะ',
      ...(alreadyMatchedWith !== null
        ? { message: `รอบจ่ายนี้จับคู่แล้วกับ${alreadyMatchedWith} — ต้องระบุเหตุผลที่จับคู่เพิ่ม` }
        : {}),
      context: { transactionAmountSatang: transaction.amountSatang, targetAmountSatang: candidate.amountSatang },
    })
  }

  const result = await applyMatch(ctx, {
    transactionId,
    candidate,
    mode: 'manual',
    matchNote: input.matchNote,
    fromProposal: input.fromProposal,
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
  assertOrgWideReadable(ctx.actor, 'bank-transactions')
  const before = await loadTransaction(ctx.actor.organizationId, transactionId)
  const status = nextBankMatchStatus(before.matchStatus, 'resolve_unmatched')
  if (status === null) {
    throw new BankReconError('BANK_TRANSACTION_INVALID_STATUS', {
      detail: `${before.matchStatus} → unmatched_resolved (ปิดได้เฉพาะรายการที่ยังไม่จับคู่)`,
      message:
        before.matchStatus === 'unmatched_resolved'
          ? 'รายการนี้ถูกปิดโดยไม่จับคู่ไปแล้ว'
          : 'รายการนี้จับคู่ไปแล้ว — ปิดโดยไม่จับคู่ได้เฉพาะรายการที่ยังไม่จับคู่',
    })
  }
  if (!hasNote(input.matchNote)) {
    throw new BankReconError('MATCH_NOTE_REQUIRED', { message: 'ต้องระบุเหตุผลที่ปิดรายการนี้โดยไม่จับคู่' })
  }

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

// ── U41: เงินรับรอตรวจสอบ ────────────────────────────────────────────────────

/**
 * `PATCH /api/bank-reconciliation/transactions/:id/suspense` (มติ PO U41)
 *
 * เงินเข้าที่ยังไม่ทราบที่มา ⇒ "เงินรับรอตรวจสอบ" (หนี้สิน) — **ไม่สร้างเงินรับ ไม่แตะยอดรับของรอบวางบิล/AR
 * ไม่รับรู้รายได้** · เหตุผลบังคับ · ไม่นับเป็นค้างจับคู่ในการตรวจความพร้อมปิดงวด (แสดงเตือนยอดคงค้างแทน)
 */
export async function moveToSuspense(
  ctx: AccountingMutationContext,
  transactionId: string,
  input: MoveToSuspenseInput,
): Promise<BankTransactionDto> {
  assertOrgWideReadable(ctx.actor, 'bank-transactions')
  const before = await loadTransaction(ctx.actor.organizationId, transactionId)
  if (!canMoveToSuspense(before.matchStatus, before.amountSatang)) {
    throw new BankReconError('BANK_TRANSACTION_INVALID_STATUS', {
      detail: `${before.matchStatus} (amount=${before.amountSatang}) → suspense`,
      message:
        before.amountSatang <= 0
          ? 'เงินรับรอตรวจสอบใช้กับรายการเงินเข้าเท่านั้น'
          : 'ย้ายเป็นเงินรับรอตรวจสอบได้เฉพาะรายการที่ยังไม่จับคู่',
    })
  }
  // ข้อความเฉพาะกรณี — ข้อความกลางของ code พูดถึงยอดจับคู่ไม่ตรง ซึ่งไม่เกี่ยวกับการย้ายเป็นเงินรอตรวจสอบ (staging S-020)
  if (!hasNote(input.reason)) {
    throw new BankReconError('MATCH_NOTE_REQUIRED', { message: 'ต้องระบุเหตุผลที่ย้ายรายการนี้เป็นเงินรับรอตรวจสอบ' })
  }

  await assertPeriodOpenAt({
    organizationId: ctx.actor.organizationId,
    at: before.transactionDate,
    targetType: TARGET,
    targetId: before.id,
  })

  const reason = input.reason.trim()
  const now = new Date()
  await prisma.$transaction(async (tx) => {
    // มีเงื่อนไขสถานะ — สองคำขอพร้อมกัน (ย้าย/จับคู่) ต้องสำเร็จได้ทางเดียว
    const updated = await tx.bankTransaction.updateMany({
      where: { id: before.id, organizationId: ctx.actor.organizationId, matchStatus: 'unmatched' },
      data: {
        matchStatus: 'suspense',
        suspenseNote: reason,
        suspendedAt: now,
        suspendedBy: ctx.actor.id,
        updatedBy: ctx.actor.id,
      },
    })
    if (updated.count === 0) {
      throw new BankReconError('BANK_TRANSACTION_INVALID_STATUS', { detail: 'สถานะเปลี่ยนไประหว่างทำรายการ' })
    }
    await emitAudit(
      {
        organizationId: ctx.actor.organizationId,
        actorId: ctx.actor.id,
        actorRole: ctx.actor.roleName,
        action: 'status_change',
        targetType: TARGET,
        targetId: before.id,
        before: { match_status: before.matchStatus },
        after: { match_status: 'suspense', suspense_note: reason, amount_satang: before.amountSatang },
        reason,
        ipAddress: ctx.meta.ipAddress,
        userAgent: ctx.meta.userAgent,
        diffOnly: false,
      },
      tx,
    )
  })

  return toDto(await loadTransaction(ctx.actor.organizationId, before.id))
}

/**
 * `PATCH /api/bank-reconciliation/transactions/:id/refund` (มติ PO U41)
 *
 * คืนเงินรับรอตรวจสอบให้ผู้โอน — วันที่โอนคืน + หลักฐาน (ตรวจไฟล์ที่ server) + เหตุผล · terminal
 * ยามงวดล็อกใช้ทั้งวันที่ของรายการเดิมและวันที่คืนเงิน (ห้ามแก้ข้อมูลของงวดที่ล็อกตรง ๆ)
 */
export async function refundSuspense(
  ctx: AccountingMutationContext,
  transactionId: string,
  input: RefundSuspenseInput,
): Promise<BankTransactionDto> {
  assertOrgWideReadable(ctx.actor, 'bank-transactions')
  const before = await loadTransaction(ctx.actor.organizationId, transactionId)
  const status = nextBankMatchStatus(before.matchStatus, 'refund_suspense')
  if (status === null) {
    throw new BankReconError('BANK_TRANSACTION_INVALID_STATUS', {
      detail: `${before.matchStatus} → suspense_refunded`,
      message: 'คืนเงินผู้โอนได้เฉพาะรายการที่เป็นเงินรับรอตรวจสอบ',
    })
  }
  if (!hasNote(input.reason)) {
    throw new BankReconError('MATCH_NOTE_REQUIRED', { message: 'ต้องระบุเหตุผลที่คืนเงินให้ผู้โอน' })
  }

  for (const at of [before.transactionDate, input.refundDate]) {
    await assertPeriodOpenAt({ organizationId: ctx.actor.organizationId, at, targetType: TARGET, targetId: before.id })
  }

  const verified = await verifyUploadedFile(input.filePath, bankRefundFileRule(before.id))
  const reason = input.reason.trim()
  const now = new Date()
  await prisma.$transaction(async (tx) => {
    const updated = await tx.bankTransaction.updateMany({
      where: { id: before.id, organizationId: ctx.actor.organizationId, matchStatus: 'suspense' },
      data: {
        matchStatus: status,
        refundDate: input.refundDate,
        refundNote: reason,
        refundFilePath: input.filePath,
        refundFileSha256: verified.sha256,
        refundedAt: now,
        refundedBy: ctx.actor.id,
        updatedBy: ctx.actor.id,
      },
    })
    if (updated.count === 0) {
      throw new BankReconError('BANK_TRANSACTION_INVALID_STATUS', { detail: 'สถานะเปลี่ยนไประหว่างทำรายการ' })
    }
    await emitAudit(
      {
        organizationId: ctx.actor.organizationId,
        actorId: ctx.actor.id,
        actorRole: ctx.actor.roleName,
        action: 'status_change',
        targetType: TARGET,
        targetId: before.id,
        before: { match_status: before.matchStatus, suspense_note: before.suspenseNote },
        after: {
          match_status: status,
          refund_date: input.refundDate,
          refund_note: reason,
          refund_file_path: input.filePath,
          refund_file_sha256: verified.sha256,
          amount_satang: before.amountSatang,
        },
        reason: `คืนเงินผู้โอน — ${reason}`,
        ipAddress: ctx.meta.ipAddress,
        userAgent: ctx.meta.userAgent,
        diffOnly: false,
      },
      tx,
    )
  })

  return toDto(await loadTransaction(ctx.actor.organizationId, before.id))
}

/** ยามของ upload/download หลักฐานคืนเงิน — รายการต้องอยู่ในองค์กรของผู้เรียก · อัปโหลดได้เฉพาะเงินรับรอตรวจสอบ */
export async function assertBankTransactionInScope(
  user: SessionUser,
  transactionId: string,
  options: { requireSuspense?: boolean } = {},
): Promise<void> {
  assertOrgWideReadable(user, 'bank-transactions')
  const row = await loadTransaction(user.organizationId, transactionId)
  if (options.requireSuspense === true && row.matchStatus !== 'suspense') {
    throw new BankReconError('BANK_TRANSACTION_INVALID_STATUS', {
      detail: `upload refund evidence ขณะ status=${row.matchStatus}`,
      message: 'แนบหลักฐานคืนเงินได้เฉพาะรายการที่เป็นเงินรับรอตรวจสอบ',
    })
  }
}
