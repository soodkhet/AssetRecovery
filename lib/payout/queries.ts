import { randomUUID } from 'node:crypto'
import { assertPeriodOpenAt } from '@/lib/accounting/period-guard'
import type { ApiWarning } from '@/lib/api/envelope'
import { emitAudit } from '@/lib/audit/audit'
import type { RequestMeta } from '@/lib/auth/request-meta'
import type { SessionUser } from '@/lib/auth/types'
import { syncExpenseRecordsFromPayout } from '@/lib/expenses/queries'
import { EXPENSE_TYPE_LABEL } from '@/lib/field/expense-ui'
import { endOfBangkokDay } from '@/lib/format/datetime'
import { calculateWhtForPayee } from '@/lib/finance/wht-calc'
import { summarizePayoutBatch } from '@/lib/finance/payout-calc'
import { Prisma } from '@/lib/generated/prisma/client'
import type { PayoutBatchSide, PayoutBatchStatus } from '@/lib/generated/prisma/enums'
import { maskAccountNumber } from '@/lib/payees/payee'
import { PayeeError } from '@/lib/payees/errors'
import { resolveBankCode } from '@/lib/payout/bank-codes'
import {
  buildPaymentFile,
  encodePaymentFile,
  PAYMENT_FILE_EXTENSION,
  PAYMENT_FILE_MIME,
  type PaymentFileRowInput,
} from '@/lib/payout/bank-file-builder'
import { PayoutError } from '@/lib/payout/errors'
import type { PayoutDocIssuer } from '@/lib/payout/payout-doc'
import {
  assertHasItemsToPay,
  assertPayeesVerified,
  assertSingleSide,
  buildIdempotencyKey,
  buildPayoutBatchName,
  duplicatePaymentFileWarning,
  nextPaymentFileVersion,
  nextPayoutBatchStatus,
  paymentFileName,
  paymentFileStoragePath,
  resolvePayoutSide,
  whtFallbackWarning,
} from '@/lib/payout/payout'
import { downloadPaymentFile, sha256Hex, uploadPaymentFile } from '@/lib/payout/payment-file-storage'
import { dispatchNotificationAwaited, usersWithCapability } from '@/lib/notifications/dispatch'
import { payoutBatchCompletedMessage } from '@/lib/notifications/messages'
import type {
  PaymentFileResultDto,
  PayoutBatchDetailDto,
  PayoutBatchDto,
  PayoutBatchItemDto,
  PayoutItemSource,
} from '@/lib/payout/types'
import type {
  PaymentFileGenerateInput,
  PayoutBatchCreateInput,
  PayoutBatchListQuery,
  PayoutCompleteInput,
} from '@/lib/payout/schemas'
import { prisma } from '@/lib/prisma'
import { assertBankFileUsable } from '@/lib/settings/bank-file'
import { SettingsError } from '@/lib/settings/errors'
import type { WhtBasis } from '@/lib/settings/tax-profile'

/**
 * รอบจ่ายเงิน — ชั้น DB (ไฟล์ 17 · `27` §6.6)
 *
 * ### กติกาที่ห้ามหลุด
 * - **payee ที่ยังไม่ยืนยัน ห้ามเข้ารอบ** (`17` §10) — ตัดสินจาก `payee_profiles.is_verified`
 *   ผ่านยาม `assertPayeesVerified()` (`lib/payout/payout.ts`) ห้ามเช็คคอลัมน์ดิบเอง
 * - **WHT คิดที่ `calculateWhtForPayee()` (3.1) เท่านั้น** — กฎ "Payee ชนะ Plan" มีบ้านเดียว
 *   · ยอดรวมของรอบมาจาก `summarizePayoutBatch()` (`22` §6.10) ห้ามบวกเอง
 * - **1 รายการเข้าได้รอบเดียว** — ยึดสิทธิ์ด้วย `updateMany(... payoutBatchItemId: null)` ในทรานแซกชัน
 *   (สองรอบที่สร้างพร้อมกันจะมีรอบเดียวที่ได้รายการนั้น อีกรอบ rollback ทั้งก้อน)
 * - **idempotency_key 1 รอบ = 1 ค่า** (`17` §6.3) สร้างตอนทำไฟล์โอนครั้งแรกแล้วใช้ค่าเดิมตลอด
 *   ⇒ สร้างไฟล์ซ้ำได้แต่ธนาคารตรวจจับไฟล์ซ้ำได้เอง + คนกดต้องยืนยันหลังเห็น `DUPLICATE_PAYMENT_FILE`
 * - ไฟล์โอนทุกเวอร์ชัน**ห้ามทับของเดิม** — path เดินเวอร์ชัน + เก็บ SHA-256 ลง audit
 */

export { GENERATE_PAYMENT_FILE, MANAGE_PAYOUT_BATCH } from '@/lib/payout/payout'

const TARGET = 'payout_batches'

export interface PayoutMutationContext {
  actor: SessionUser
  meta: RequestMeta
}

const batchSelect = {
  id: true,
  name: true,
  side: true,
  status: true,
  grossSatang: true,
  whtSatang: true,
  netSatang: true,
  bankAccountId: true,
  idempotencyKey: true,
  paymentFileUrl: true,
  paymentFileGeneratedAt: true,
  createdAt: true,
  updatedAt: true,
  bankAccount: { select: { bankName: true, accountNumber: true } },
  createdByUser: { select: { fullName: true } },
  _count: { select: { items: true } },
} as const

type BatchRow = Prisma.PayoutBatchGetPayload<{ select: typeof batchSelect }>

const itemSelect = {
  id: true,
  expenseId: true,
  advanceId: true,
  payeeId: true,
  trackingRound: true,
  grossSatang: true,
  whtSatang: true,
  netSatang: true,
  taxProfileId: true,
  whtPctSnapshot: true,
  taxProfile: { select: { name: true } },
  payee: {
    select: {
      bankName: true,
      accountName: true,
      accountNumber: true,
      nationalId: true,
      user: { select: { fullName: true, email: true, phone: true, team: { select: { name: true } } } },
    },
  },
  expense: { select: { expenseType: true, case: { select: { caseRef: true } } } },
  advance: { select: { purpose: true } },
} as const

type ItemRow = Prisma.PayoutBatchItemGetPayload<{ select: typeof itemSelect }>

function toBatchDto(row: BatchRow): PayoutBatchDto {
  return {
    id: row.id,
    name: row.name,
    side: row.side,
    status: row.status,
    grossSatang: row.grossSatang,
    whtSatang: row.whtSatang,
    netSatang: row.netSatang,
    itemCount: row._count.items,
    bankAccountId: row.bankAccountId,
    bankAccountLabel:
      row.bankAccount === null
        ? null
        : `${row.bankAccount.bankName} ${maskAccountNumber(row.bankAccount.accountNumber) ?? ''}`.trim(),
    idempotencyKey: row.idempotencyKey,
    paymentFileUrl: row.paymentFileUrl,
    paymentFileGeneratedAt: row.paymentFileGeneratedAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
    createdByName: row.createdByUser.fullName,
    updatedAt: row.updatedAt.toISOString(),
  }
}

function toItemDto(row: ItemRow): PayoutBatchItemDto {
  const source: PayoutItemSource = row.expenseId === null ? 'advance' : 'expense'
  return {
    id: row.id,
    source,
    sourceId: (row.expenseId ?? row.advanceId) as string,
    payeeId: row.payeeId,
    payeeName: row.payee.user.fullName,
    teamName: row.payee.user.team?.name ?? null,
    description:
      source === 'expense'
        ? (row.expense === null ? '' : EXPENSE_TYPE_LABEL[row.expense.expenseType])
        : (row.advance?.purpose ?? ''),
    caseRef: row.expense?.case?.caseRef ?? null,
    trackingRound: row.trackingRound,
    grossSatang: row.grossSatang,
    whtSatang: row.whtSatang,
    netSatang: row.netSatang,
    taxProfileId: row.taxProfileId,
    taxProfileName: row.taxProfile?.name ?? null,
    whtPctSnapshot: row.whtPctSnapshot === null ? null : Number(row.whtPctSnapshot),
    bankName: row.payee.bankName,
    accountNumberMasked: maskAccountNumber(row.payee.accountNumber),
  }
}

// ── GET /api/payout-batches ─────────────────────────────────────────────────

/**
 * scope: การเงิน (manage) + บัญชี/ผู้บริหาร (view) เห็นทั้งองค์กร (`17` §12) — ไม่มี scope ย่อยรายทีม
 * เพราะรอบจ่ายเป็นเอกสารระดับองค์กร (การกรองรายบุคคลอยู่ที่หน้ารายการเบิกของไฟล์ 15/16)
 */
export async function listPayoutBatches(
  user: SessionUser,
  query: PayoutBatchListQuery,
): Promise<PayoutBatchDto[]> {
  const rows = await prisma.payoutBatch.findMany({
    where: {
      organizationId: user.organizationId,
      deletedAt: null,
      ...(query.status === 'all' ? {} : { status: query.status as PayoutBatchStatus }),
      ...(query.side === 'all' ? {} : { side: query.side as PayoutBatchSide }),
    },
    select: batchSelect,
    orderBy: [{ createdAt: 'desc' }],
    take: 200,
  })
  return rows.map(toBatchDto)
}

async function findBatch(user: SessionUser, batchId: string): Promise<BatchRow> {
  const row = await prisma.payoutBatch.findFirst({
    where: { id: batchId, organizationId: user.organizationId, deletedAt: null },
    select: batchSelect,
  })
  if (row === null) throw new PayoutError('PAYOUT_BATCH_NOT_FOUND', { detail: `batch=${batchId}` })
  return row
}

export async function getPayoutBatch(user: SessionUser, batchId: string): Promise<PayoutBatchDetailDto> {
  const batch = await findBatch(user, batchId)
  const items = await prisma.payoutBatchItem.findMany({
    where: { payoutBatchId: batchId, organizationId: user.organizationId },
    select: itemSelect,
    orderBy: [{ createdAt: 'asc' }],
  })
  return { ...toBatchDto(batch), items: items.map(toItemDto) }
}

/**
 * แหล่งข้อมูลของเอกสารภายใน 3 ใบ (`28` §6.1) — รอบจ่าย + ผู้ออกเอกสาร (องค์กรเจ้าของระบบ)
 * โครงเดียวกับ `getHandoverDocSource()` ของ 2.13 เพื่อให้ route ของเอกสารทุกใบหน้าตาเหมือนกัน
 */
export async function getPayoutDocSource(
  user: SessionUser,
  batchId: string,
): Promise<{ batch: PayoutBatchDetailDto; issuer: PayoutDocIssuer }> {
  const [batch, organization] = await Promise.all([
    getPayoutBatch(user, batchId),
    prisma.organization.findUniqueOrThrow({
      where: { id: user.organizationId },
      select: { name: true, address: true, taxId: true, phone: true },
    }),
  ])
  return { batch, issuer: organization }
}

// ── POST /api/payout-batches (batch builder — `17` §9) ──────────────────────

interface Candidate {
  source: PayoutItemSource
  sourceId: string
  payeeId: string
  payeeName: string
  isVerified: boolean
  side: PayoutBatchSide | null
  trackingRound: number
  grossSatang: number
  whtSatang: number
  netSatang: number
  taxProfileId: string | null
  whtPctSnapshot: number
  /** `true` = คิด WHT ด้วยอัตราของ Plan เพราะ Payee ยังไม่มี Tax Profile ⇒ ต้องเตือน (`18` §6.3) */
  whtRateFromPlan: boolean
}

/** payee ที่ verified แล้วต้องมี Tax Profile เสมอ (`18` §9) ⇒ ค่านี้ไม่ควรเป็น null ตอนคิด WHT */
interface PayeeTaxRow {
  taxProfileId: string | null
  taxProfile: { whtPct: Prisma.Decimal; whtBasis: string; whtMinThresholdSatang: number } | null
}

function payeeTaxValues(payee: PayeeTaxRow) {
  if (payee.taxProfile === null) return null
  return {
    whtPct: Number(payee.taxProfile.whtPct),
    whtBasis: (payee.taxProfile.whtBasis === 'gross_amount' ? 'gross_amount' : 'before_vat') as WhtBasis,
    whtMinThresholdSatang: payee.taxProfile.whtMinThresholdSatang,
  }
}

/**
 * ค่าตอบแทนที่อนุมัติแล้วและยังไม่เคยถูกจ่าย ภายในวันตัดรอบ (`17` §7.1)
 * — `expense_date` เป็นคอลัมน์ `DATE` ⇒ เทียบแบบ `<=` ตรง ๆ กับเที่ยงคืน UTC ของวันตัดรอบ
 */
async function collectExpenseCandidates(
  organizationId: string,
  cutoffDate: Date,
): Promise<Candidate[]> {
  const rows = await prisma.expense.findMany({
    where: {
      organizationId,
      deletedAt: null,
      status: 'approved',
      payoutBatchItemId: null,
      expenseDate: { lte: cutoffDate },
    },
    select: {
      id: true,
      grossSatang: true,
      compPlan: { select: { whtPct: true } },
      case: { select: { trackingRound: true } },
      payee: {
        select: {
          id: true,
          isVerified: true,
          taxProfileId: true,
          taxProfile: { select: { whtPct: true, whtBasis: true, whtMinThresholdSatang: true } },
          user: {
            select: { fullName: true, team: { select: { side: true } }, role: { select: { roleGroup: true } } },
          },
        },
      },
    },
    orderBy: [{ expenseDate: 'asc' }],
  })

  return rows.map((row) => {
    const wht = calculateWhtForPayee({
      grossSatang: row.grossSatang,
      source: {
        payeeTaxProfile: payeeTaxValues(row.payee),
        planWhtPct: row.compPlan === null ? null : Number(row.compPlan.whtPct),
      },
    })
    return {
      source: 'expense',
      sourceId: row.id,
      payeeId: row.payee.id,
      payeeName: row.payee.user.fullName,
      isVerified: row.payee.isVerified,
      side: resolvePayoutSide({
        teamSide: row.payee.user.team?.side ?? null,
        roleGroup: row.payee.user.role.roleGroup,
      }),
      trackingRound: row.case?.trackingRound ?? 1,
      grossSatang: row.grossSatang,
      whtSatang: wht.whtSatang,
      netSatang: wht.netSatang,
      taxProfileId: row.payee.taxProfileId,
      whtPctSnapshot: wht.rate.whtPct,
      whtRateFromPlan: wht.rate.source === 'plan',
    }
  })
}

/**
 * เงินทดรองจ่ายที่อนุมัติแล้วและยังไม่เคยถูกโอนออก (A4 มติ PO 2026-08-12 —
 * `advances.payout_batch_item_id` คือ "เส้นทางจ่ายเงินทดรองออกผ่านรอบจ่าย")
 *
 * ⚠️ **ไม่หัก WHT** — เงินทดรองเป็นเงินยืมล่วงหน้าที่ต้องเคลียร์ยอดคืน ไม่ใช่เงินได้ของผู้รับ
 *    ภาษีถูกหักตอนจ่าย "ค่าตอบแทน" จริง (สาย `expenses`) แล้ว ⇒ หักที่นี่อีก = หักซ้ำ
 *    ยัง snapshot `tax_profile_id` ของผู้รับไว้เพื่อให้ตรวจย้อนหลังได้ว่าใช้กติกาภาษีชุดไหน
 */
async function collectAdvanceCandidates(
  organizationId: string,
  cutoffDate: Date,
): Promise<Candidate[]> {
  const rows = await prisma.advance.findMany({
    where: {
      organizationId,
      deletedAt: null,
      status: { in: ['approved', 'overdue'] },
      payoutBatchItemId: null,
      // `approved_at` เป็น TIMESTAMPTZ ⇒ ขอบบนต้องเป็นสิ้นวัน**ตามเวลาไทย** ไม่ใช่สิ้นวัน UTC
      // (ไม่งั้นเงินทดรองที่อนุมัติเช้าวันถัดไปหลุดเข้ารอบตัดยอดไป 7 ชั่วโมง)
      approvedAt: { lte: endOfBangkokDay(cutoffDate) },
    },
    select: {
      id: true,
      requestedSatang: true,
      approvedSatang: true,
      payee: {
        select: {
          id: true,
          isVerified: true,
          taxProfileId: true,
          user: {
            select: { fullName: true, team: { select: { side: true } }, role: { select: { roleGroup: true } } },
          },
        },
      },
    },
    orderBy: [{ approvedAt: 'asc' }],
  })

  return rows.map((row) => {
    // สถานะ `approved`/`overdue` ต้องมี `approved_satang` เสมอ (`resolveApprovedSatang()` เขียนให้
    // ตั้งแต่ตอนอนุมัติ) — ถ้า null คือข้อมูลเพี้ยน **ต้องดัง ไม่ใช่เดา**: fallback ไปยอด "ที่ขอ"
    // จะโอนเกินยอดที่อนุมัติจริงได้ (`approved <= requested` เสมอ)
    if (row.approvedSatang === null) {
      throw new Error(`เงินทดรอง ${row.id} สถานะอนุมัติแล้วแต่ไม่มี approved_satang — ข้อมูลไม่สอดคล้อง`)
    }
    const grossSatang = row.approvedSatang
    return {
      source: 'advance',
      sourceId: row.id,
      payeeId: row.payee.id,
      payeeName: row.payee.user.fullName,
      isVerified: row.payee.isVerified,
      side: resolvePayoutSide({
        teamSide: row.payee.user.team?.side ?? null,
        roleGroup: row.payee.user.role.roleGroup,
      }),
      trackingRound: 1,
      grossSatang,
      whtSatang: 0,
      netSatang: grossSatang,
      taxProfileId: row.payee.taxProfileId,
      whtPctSnapshot: 0,
      // เงินทดรองไม่หัก WHT อยู่แล้ว ⇒ ไม่มีการ fallback อัตราให้ต้องเตือน
      whtRateFromPlan: false,
    }
  })
}

export interface PayoutBatchCreateOutcome {
  batch: PayoutBatchDetailDto
  /** `WHT_RATE_FALLBACK_TO_PLAN` — เตือนไม่บล็อก (`18` §6.3 · `24` §6.5) */
  warning?: ApiWarning
}

export async function createPayoutBatch(
  context: PayoutMutationContext,
  input: PayoutBatchCreateInput,
): Promise<PayoutBatchCreateOutcome> {
  const user = context.actor

  // Period Lock (`13` §6.11 · Phase 4.1) — รอบจ่ายผูกกับงวดของวันตัดรอบ (`02` ไม่มีคอลัมน์วันตัดรอบ
  // ⇒ ใช้ `cutoffDate` ที่ผู้ใช้ระบุ ซึ่งเป็นวันเดียวกับที่คัดรายการเข้ารอบ)
  await assertPeriodOpenAt({
    organizationId: user.organizationId,
    at: input.cutoffDate,
    targetType: 'payout_batches',
  })

  const [expenses, advances] = await Promise.all([
    collectExpenseCandidates(user.organizationId, input.cutoffDate),
    collectAdvanceCandidates(user.organizationId, input.cutoffDate),
  ])

  // คัดฝั่งก่อนตรวจ payee — คนที่ยังไม่ยืนยันของ "อีกฝั่ง" ไม่ควรบล็อกรอบนี้ (`17` §6.1)
  const candidates = [...expenses, ...advances].filter((candidate) => candidate.side === input.side)
  assertHasItemsToPay(candidates.length)
  assertPayeesVerified(candidates)
  assertSingleSide(input.side, candidates)

  const totals = summarizePayoutBatch(candidates)
  const name = input.name ?? buildPayoutBatchName(input.side, input.cutoffDate)
  const status = nextPayoutBatchStatus('draft', 'collect')

  const batchId = await prisma.$transaction(async (tx) => {
    const batch = await tx.payoutBatch.create({
      data: {
        organizationId: user.organizationId,
        name,
        side: input.side,
        status: 'draft',
        createdBy: user.id,
      },
      select: { id: true },
    })

    for (const candidate of candidates) {
      const item = await tx.payoutBatchItem.create({
        data: {
          organizationId: user.organizationId,
          payoutBatchId: batch.id,
          expenseId: candidate.source === 'expense' ? candidate.sourceId : null,
          advanceId: candidate.source === 'advance' ? candidate.sourceId : null,
          payeeId: candidate.payeeId,
          trackingRound: candidate.trackingRound,
          grossSatang: candidate.grossSatang,
          whtSatang: candidate.whtSatang,
          netSatang: candidate.netSatang,
          taxProfileId: candidate.taxProfileId,
          whtPctSnapshot: new Prisma.Decimal(candidate.whtPctSnapshot.toFixed(2)),
          createdBy: user.id,
        },
        select: { id: true },
      })

      // ยึดสิทธิ์รายการต้นทาง — ยังว่างอยู่เท่านั้นถึงจะดึงเข้ารอบนี้ได้ (กันสองรอบแย่งรายการเดียวกัน)
      const claimed =
        candidate.source === 'expense'
          ? await tx.expense.updateMany({
              where: { id: candidate.sourceId, payoutBatchItemId: null },
              data: { payoutBatchItemId: item.id, updatedBy: user.id },
            })
          : await tx.advance.updateMany({
              where: { id: candidate.sourceId, payoutBatchItemId: null },
              data: { payoutBatchItemId: item.id, updatedBy: user.id },
            })
      if (claimed.count !== 1) {
        throw new PayoutError('NO_ITEMS_TO_PAY', {
          detail: `${candidate.source}=${candidate.sourceId} ถูกดึงเข้ารอบจ่ายอื่นไปแล้ว`,
        })
      }
    }

    await tx.payoutBatch.update({
      where: { id: batch.id },
      data: {
        status,
        grossSatang: totals.grossSatang,
        whtSatang: totals.whtSatang,
        netSatang: totals.netSatang,
        updatedBy: user.id,
      },
    })

    await emitAudit(
      {
        organizationId: user.organizationId,
        actorId: user.id,
        actorRole: user.roleName,
        action: 'create',
        targetType: TARGET,
        targetId: batch.id,
        after: {
          name,
          side: input.side,
          status,
          // `02` §8 ไม่มีคอลัมน์ `cutoff_date` ⇒ เก็บวันตัดรอบไว้ใน audit (ดู `buildPayoutBatchName()`)
          cutoff_date: input.cutoffDate.toISOString().slice(0, 10),
          gross_satang: totals.grossSatang,
          wht_satang: totals.whtSatang,
          net_satang: totals.netSatang,
          item_count: totals.itemCount,
        },
        reason: null,
        ipAddress: context.meta.ipAddress,
        userAgent: context.meta.userAgent,
        diffOnly: false,
      },
      tx,
    )

    return batch.id
  })

  // `18` §6.3 — ใครถูกคิดด้วยอัตราสำรองต้องถูกรายงานกลับเสมอ ห้ามคิดเงียบ (Rule 01)
  const warning = whtFallbackWarning(
    candidates.filter((candidate) => candidate.whtRateFromPlan).map((candidate) => candidate.payeeName),
  )

  return { batch: await getPayoutBatch(user, batchId), ...(warning === null ? {} : { warning }) }
}

// ── POST /api/payout-batches/:id/generate-payment-file (`17` §6.3/§6.4) ─────

export interface PaymentFileOutcome {
  result: PaymentFileResultDto
  warning?: ApiWarning
}

export async function generatePaymentFile(
  context: PayoutMutationContext,
  batchId: string,
  input: PaymentFileGenerateInput,
  now: Date = new Date(),
): Promise<PaymentFileOutcome> {
  const user = context.actor
  const batch = await findBatch(user, batchId)
  const previousGeneratedAt = batch.paymentFileGeneratedAt

  await assertPeriodOpenAt({
    organizationId: user.organizationId,
    at: batch.createdAt,
    targetType: 'payout_batches',
    targetId: batchId,
  })

  // `17` §11 `DUPLICATE_PAYMENT_FILE` — เตือนก่อนเสมอ ไม่ reject · ยืนยันแล้วค่อยสร้างจริง
  if (previousGeneratedAt !== null && !input.confirmDuplicate) {
    return {
      result: {
        generated: false,
        batch: toBatchDto(batch),
        fileName: null,
        fileHash: null,
        rowCount: batch._count.items,
        previousGeneratedAt: previousGeneratedAt.toISOString(),
      },
      warning: duplicatePaymentFileWarning(previousGeneratedAt),
    }
  }

  const status = nextPayoutBatchStatus(batch.status, 'generate_file')

  const [format, account, items] = await Promise.all([
    prisma.bankFileFormat.findFirst({
      where: { id: input.bankFileFormatId, organizationId: user.organizationId, deletedAt: null },
      select: { id: true, bankName: true, fileType: true, encoding: true, columnMapping: true, testStatus: true },
    }),
    prisma.bankAccount.findFirst({
      where: { id: input.bankAccountId, organizationId: user.organizationId, deletedAt: null },
      select: { id: true, bankName: true, accountName: true, accountNumber: true, usage: true },
    }),
    prisma.payoutBatchItem.findMany({
      where: { payoutBatchId: batchId, organizationId: user.organizationId },
      select: itemSelect,
      orderBy: [{ createdAt: 'asc' }],
    }),
  ])

  if (format === null) {
    throw new SettingsError('BANK_FILE_FORMAT_NOT_FOUND', { detail: `format=${input.bankFileFormatId}` })
  }
  if (account === null) {
    throw new SettingsError('BANK_ACCOUNT_NOT_FOUND', { detail: `account=${input.bankAccountId}` })
  }
  // gate เดียวของระบบ: format ที่ยังไม่ผ่านทดสอบ ห้ามใช้ตัดโอนจริง (`13` §6.8 · `24` §6.3)
  assertBankFileUsable(format)
  assertHasItemsToPay(items.length)

  const idempotencyKey =
    batch.idempotencyKey ??
    buildIdempotencyKey({ side: batch.side, generatedAt: now, uniqueSuffix: randomUUID() })

  const rows = items.map((item, index): PaymentFileRowInput => {
    const bankCode = resolveBankCode(item.payee.bankName)
    if (bankCode === null || item.payee.accountNumber === null) {
      throw new PayeeError('REQUIRED_MISSING', {
        detail: `payee=${item.payeeId} bank_name=${item.payee.bankName ?? ''}`,
        context: {
          fields: ['bank_name', 'account_number'],
          payees: [item.payee.user.fullName],
        },
      })
    }
    return {
      receivingBankCode: bankCode,
      receivingAccountNo: item.payee.accountNumber,
      receivingAccountName: item.payee.accountName ?? item.payee.user.fullName,
      netSatang: item.netSatang,
      citizenId: item.payee.nationalId,
      email: item.payee.user.email,
      mobileNo: item.payee.user.phone,
      remark: batch.name,
      referenceNo: `${idempotencyKey}-${index + 1}`,
    }
  })

  const file = buildPaymentFile({
    columnMapping: format.columnMapping,
    fileType: format.fileType,
    payerAccountNo: account.accountNumber,
    payerName: account.accountName,
    transferDate: now,
    rows,
  })
  const bytes = encodePaymentFile(file.text, format.encoding)
  const fileHash = sha256Hex(bytes)
  const extension = PAYMENT_FILE_EXTENSION[format.fileType]
  const version = nextPaymentFileVersion(batch.paymentFileUrl)
  const path = paymentFileStoragePath({ batchId, idempotencyKey, version, extension })

  // อัปโหลดก่อนแตะ DB — อัปโหลดไม่ผ่าน = ไม่มีอะไรเปลี่ยนใน DB (ไฟล์กำพร้าใน storage ปลอดภัยกว่า
  // แถวที่ชี้ไปไฟล์ที่ไม่มีจริง) · `upsert: false` ⇒ ไม่ทับไฟล์เวอร์ชันก่อน
  await uploadPaymentFile({ path, bytes, contentType: PAYMENT_FILE_MIME[format.fileType] })

  const updated = await prisma.$transaction(async (tx) => {
    const row = await tx.payoutBatch.update({
      where: { id: batchId },
      data: {
        status,
        idempotencyKey,
        bankAccountId: account.id,
        paymentFileUrl: path,
        paymentFileGeneratedAt: now,
        updatedBy: user.id,
      },
      select: batchSelect,
    })

    await emitAudit(
      {
        organizationId: user.organizationId,
        actorId: user.id,
        actorRole: user.roleName,
        // `17` §13 — การสร้างไฟล์โอนทุกครั้งต้อง audit พร้อม idempotency_key/ผู้สร้าง/เวลา
        action: 'export',
        targetType: TARGET,
        targetId: batchId,
        before: {
          status: batch.status,
          payment_file_url: batch.paymentFileUrl,
          payment_file_generated_at: previousGeneratedAt?.toISOString() ?? null,
        },
        after: {
          status,
          idempotency_key: idempotencyKey,
          bank_account_id: account.id,
          bank_file_format_id: format.id,
          payment_file_url: path,
          payment_file_version: version,
          payment_file_sha256: fileHash,
          row_count: file.rowCount,
          net_satang: row.netSatang,
          regenerated: previousGeneratedAt !== null,
        },
        reason: input.reason,
        ipAddress: context.meta.ipAddress,
        userAgent: context.meta.userAgent,
        diffOnly: false,
      },
      tx,
    )

    return row
  })

  return {
    result: {
      generated: true,
      batch: toBatchDto(updated),
      fileName: paymentFileName({ idempotencyKey, version, extension }),
      fileHash,
      rowCount: file.rowCount,
      previousGeneratedAt: previousGeneratedAt?.toISOString() ?? null,
    },
    // สร้างซ้ำสำเร็จก็ยังต้องเตือน เพื่อกันอัปโหลดไฟล์เก่าซ้ำเข้าระบบธนาคาร (`17` §6.3)
    warning: previousGeneratedAt === null ? undefined : duplicatePaymentFileWarning(previousGeneratedAt),
  }
}

/** `GET /api/payout-batches/:id/payment-file` — ส่งไฟล์ผ่าน endpoint ของเราเสมอ ไม่แจก signed URL */
export async function readPaymentFile(
  user: SessionUser,
  batchId: string,
): Promise<{ fileName: string; bytes: Uint8Array; contentType: string }> {
  const batch = await findBatch(user, batchId)
  if (batch.paymentFileUrl === null) {
    throw new PayoutError('PAYMENT_FILE_NOT_GENERATED', { detail: `batch=${batchId}` })
  }
  const bytes = await downloadPaymentFile(batch.paymentFileUrl)
  const fileName = batch.paymentFileUrl.split('/').pop() ?? 'payment-file.csv'
  return {
    fileName,
    bytes,
    contentType: fileName.endsWith('.txt') ? PAYMENT_FILE_MIME.TXT : PAYMENT_FILE_MIME.CSV,
  }
}

// ── PATCH /api/payout-batches/:id/complete (`17` §9) ────────────────────────

/**
 * ยืนยันจ่ายสำเร็จด้วยมือ — **ทางเลือกสำรอง** ของการ sync จาก Bank Reconciliation (ไฟล์ 35 · `17` §18)
 * เส้นทางอัตโนมัติของ Phase 4.2 เรียก `syncPayoutBatchCompleted()` ด้านล่างแทน
 */
export async function completePayoutBatch(
  context: PayoutMutationContext,
  batchId: string,
  input: PayoutCompleteInput,
): Promise<PayoutBatchDto> {
  const user = context.actor
  const batch = await findBatch(user, batchId)
  const status = nextPayoutBatchStatus(batch.status, 'complete')

  await assertPeriodOpenAt({
    organizationId: user.organizationId,
    at: batch.createdAt,
    targetType: 'payout_batches',
    targetId: batchId,
  })

  const updated = await prisma.$transaction(async (tx) => {
    const row = await tx.payoutBatch.update({
      where: { id: batchId },
      data: { status, updatedBy: user.id },
      select: batchSelect,
    })

    await emitAudit(
      {
        organizationId: user.organizationId,
        actorId: user.id,
        actorRole: user.roleName,
        // `17` §13 — ต้องระบุผู้ยืนยันชัดเจน (ความรับผิดทางการเงิน)
        action: 'confirm',
        targetType: TARGET,
        targetId: batchId,
        before: { status: batch.status },
        after: { status, net_satang: row.netSatang, confirmed_source: 'manual' },
        reason: input.reason,
        ipAddress: context.meta.ipAddress,
        userAgent: context.meta.userAgent,
        diffOnly: false,
      },
      tx,
    )

    return row
  })

  // จ่ายเงินจริงแล้ว ⇒ บันทึกบัญชีค่าใช้จ่าย (`32` §6.1) — idempotent เรียกซ้ำไม่สร้างซ้ำ
  await syncExpenseRecordsFromPayout(context, batchId)

  await notifyPayoutCompleted(user.organizationId, updated, 'manual')

  return toBatchDto(updated)
}

/**
 * **จุดเสียบของ Phase 4.2** (ไฟล์ 35) — Bank Statement จับคู่รอบจ่ายสำเร็จ ⇒ `completed` อัตโนมัติ
 * (`17` §9/§18 ระบุว่าเส้นทางนี้เป็นหลัก manual เป็นสำรอง)
 *
 * idempotent: รอบที่ `completed` แล้วเรียกซ้ำได้ ไม่เปลี่ยนอะไรและไม่โยน error (job รันซ้ำได้ — `91`)
 */
export async function syncPayoutBatchCompleted(input: {
  organizationId: string
  batchId: string
  /** ธุรกรรมธนาคารที่จับคู่ได้ — ลง audit เพื่อ trace กลับต้นทาง */
  bankTransactionId: string
  /** ผู้สั่งงาน — `null` = job อัตโนมัติ (audit บังคับ `reason` ให้เอง) */
  actorId: string | null
  actorRole: string
}): Promise<PayoutBatchStatus> {
  const batch = await prisma.payoutBatch.findFirst({
    where: { id: input.batchId, organizationId: input.organizationId, deletedAt: null },
    select: { id: true, name: true, status: true, netSatang: true },
  })
  if (batch === null) throw new PayoutError('PAYOUT_BATCH_NOT_FOUND', { detail: `batch=${input.batchId}` })
  if (batch.status === 'completed') return batch.status

  const status = nextPayoutBatchStatus(batch.status, 'complete')

  await prisma.$transaction(async (tx) => {
    await tx.payoutBatch.update({
      where: { id: batch.id },
      data: { status, updatedBy: input.actorId },
    })
    await emitAudit(
      {
        organizationId: input.organizationId,
        actorId: input.actorId,
        actorRole: input.actorRole,
        action: 'confirm',
        targetType: TARGET,
        targetId: batch.id,
        before: { status: batch.status },
        after: {
          status,
          net_satang: batch.netSatang,
          confirmed_source: 'bank_reconciliation',
          bank_transaction_id: input.bankTransactionId,
        },
        reason: `จับคู่กับรายการเดินบัญชี ${input.bankTransactionId} สำเร็จ (ไฟล์ 35)`,
        ipAddress: null,
        userAgent: null,
        diffOnly: false,
      },
      tx,
    )
  })

  await notifyPayoutCompleted(input.organizationId, batch, 'bank_reconciliation')

  return status
}

/**
 * `90` §6.3 แถว 7 — รอบจ่ายสำเร็จต้องแจ้งผู้ดูแลรอบจ่าย (ทั้งเส้นทางกดเองและเส้นทาง sync จากธนาคาร)
 *
 * เส้นทาง sync เป็น **consumer** (ยิงซ้ำได้ตามกติกา `91`) ⇒ ข้อความพก `dedupeKey` ผูกกับรอบจ่าย
 * ⇒ เรียกซ้ำกี่ครั้งก็ได้แถวเดียว · ต้อง `await` เพื่อให้ job รู้ผลก่อนจบรอบ
 */
async function notifyPayoutCompleted(
  organizationId: string,
  batch: { id: string; name: string; netSatang: number },
  source: 'manual' | 'bank_reconciliation',
): Promise<void> {
  const userIds = await usersWithCapability(organizationId, 'manage_payout_batch')
  await dispatchNotificationAwaited(
    { organizationId, userIds },
    payoutBatchCompletedMessage({
      batchId: batch.id,
      batchName: batch.name,
      netSatang: batch.netSatang,
      source,
    }),
  )
}
