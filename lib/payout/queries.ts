import { randomUUID } from 'node:crypto'
import { assertPeriodOpenAt } from '@/lib/accounting/period-guard'
import type { ApiWarning } from '@/lib/api/envelope'
import { emitAudit } from '@/lib/audit/audit'
import type { RequestMeta } from '@/lib/auth/request-meta'
import type { SessionUser } from '@/lib/auth/types'
import { syncExpenseRecordsFromPayout } from '@/lib/expenses/queries'
import { EXPENSE_TYPE_LABEL } from '@/lib/field/expense-ui'
import { endOfBangkokDay } from '@/lib/format/datetime'
import { calculatePayeeBatchWht, sumPayoutTaxSplit, type PayeeBatchWhtLine } from '@/lib/finance/wht-calc'
import {
  advanceReturnOutstandingSatang,
  allocatePayeeAdvanceOffset,
  payoutTransferSatang,
  type OutstandingAdvanceReturn,
} from '@/lib/finance/advance-offset-calc'
import { advanceOffsetLineLabel } from '@/lib/advances/advance'
import { nextDocumentNumber } from '@/lib/document-numbering/queries'
import { summarizePayoutBatch } from '@/lib/finance/payout-calc'
import { Prisma } from '@/lib/generated/prisma/client'
import type { PayoutBatchSide, PayoutBatchStatus, WhtCondition } from '@/lib/generated/prisma/enums'
import { maskAccountNumber, payeeAddressLine, payeeDisplayName } from '@/lib/payees/payee'
import { formatBranch } from '@/lib/format/branch'
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
import { payslipStatsOf, type PayoutDocIssuer, type PayoutPayeeDocInfo } from '@/lib/payout/payout-doc'
import {
  assertHasItemsToPay,
  assertPayeesVerified,
  assertPayoutCancellable,
  assertPayoutNotCancelled,
  requirePayoutCancelReason,
  statusesAllowing,
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
  PayoutCancelInput,
  PayoutBatchListQuery,
  PayoutCompleteInput,
} from '@/lib/payout/schemas'
import { prisma } from '@/lib/prisma'
import { assertBankFileUsable } from '@/lib/settings/bank-file'
import { SettingsError } from '@/lib/settings/errors'
import type { WhtBasis } from '@/lib/settings/tax-profile'
import { resolveWhtPolicyForPayout } from '@/lib/settings/queries/wht-policy'
import { loadTaxProfileDefaults, type LoadedTaxProfileDefaults } from '@/lib/settings/queries/tax-profile-defaults'
import { pickTaxProfileDefault } from '@/lib/settings/tax-profile-defaults'
import {
  LEGACY_WHT_POLICY,
  isInWhtBase,
  normalizeBaseExpenseTypes,
  resolveIncomeCategory,
  usesPerPayeeWhtRate,
  isWhtConditionAllowed,
  type WhtIncomeCategory,
  type WhtPolicyValues,
} from '@/lib/settings/wht-policy'

/**
 * รอบจ่ายเงิน — ชั้น DB (ไฟล์ 17 · `27` §6.6)
 *
 * ### กติกาที่ห้ามหลุด
 * - **payee ที่ยังไม่ยืนยัน ห้ามเข้ารอบ** (`17` §10) — ตัดสินจาก `payee_profiles.is_verified`
 *   ผ่านยาม `assertPayeesVerified()` (`lib/payout/payout.ts`) ห้ามเช็คคอลัมน์ดิบเอง
 * - **WHT คิดที่ `calculatePayeeBatchWht()` (3.1) เท่านั้น** — กฎ "Payee ชนะ Plan" + เกณฑ์ต่อ payee ต่อรอบ (UAT Q5) มีบ้านเดียว
 *   · ยอดรวมของรอบมาจาก `summarizePayoutBatch()` (`22` §6.10) ห้ามบวกเอง
 * - **1 รายการเข้าได้รอบเดียว** — ยึดสิทธิ์ด้วย `updateMany(... payoutBatchItemId: null)` ในทรานแซกชัน
 *   (สองรอบที่สร้างพร้อมกันจะมีรอบเดียวที่ได้รายการนั้น อีกรอบ rollback ทั้งก้อน)
 * - **idempotency_key 1 รอบ = 1 ค่า** (`17` §6.3) สร้างตอนทำไฟล์โอนครั้งแรกแล้วใช้ค่าเดิมตลอด
 *   ⇒ สร้างไฟล์ซ้ำได้แต่ธนาคารตรวจจับไฟล์ซ้ำได้เอง + คนกดต้องยืนยันหลังเห็น `DUPLICATE_PAYMENT_FILE`
 * - ไฟล์โอนทุกเวอร์ชัน**ห้ามทับของเดิม** — path เดินเวอร์ชัน + เก็บ SHA-256 ลง audit
 */

export { GENERATE_PAYMENT_FILE, MANAGE_PAYOUT_BATCH } from '@/lib/payout/payout'

const TARGET = 'payout_batches'

/** client ในทรานแซกชันของ `prisma.$transaction(async (tx) => …)` */
export type PayoutTxClient = Omit<typeof prisma, '$connect' | '$disconnect' | '$on' | '$transaction' | '$extends'>

export interface PayoutMutationContext {
  actor: SessionUser
  meta: RequestMeta
  /** เวลาอ้างอิงของคำขอ (เลือกค่าตั้งภาษีที่มีผล) — ไม่ระบุ = ตอนนี้ · เทสต์ใช้ตรึงวัน */
  now?: Date
}

const batchSelect = {
  id: true,
  name: true,
  side: true,
  status: true,
  grossSatang: true,
  whtSatang: true,
  netSatang: true,
  advanceOffsetSatang: true,
  bankAccountId: true,
  idempotencyKey: true,
  paymentFileUrl: true,
  paymentFileGeneratedAt: true,
  whtBaseExpenseTypes: true,
  whtCertificateMode: true,
  whtIncomeTypeMode: true,
  whtIssueZeroRate402Certificate: true,
  whtInhouseIncomeCategory: true,
  whtOutsourceIncomeCategory: true,
  whtAllowGrossUpConditions: true,
  createdAt: true,
  updatedAt: true,
  cancelledAt: true,
  cancelReason: true,
  bankAccount: { select: { bankName: true, accountNumber: true } },
  createdByUser: { select: { fullName: true } },
  cancelledByUser: { select: { fullName: true } },
  _count: { select: { items: true } },
  // มติ PO U109 — แยกภาษีที่บริษัทออกให้ออกจากค่าตอบแทนของทั้งรอบ (snapshot ต่อรายการ)
  items: { select: { grossSatang: true, whtSatang: true, netSatang: true, whtCondition: true } },
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
  whtBaseIncluded: true,
  whtIncomeCategory: true,
  whtCondition: true,
  advanceOffsetSatang: true,
  advanceReturns: {
    where: { reversedAt: null },
    select: { advanceId: true, amountSatang: true, advance: { select: { advanceNumber: true } } },
    orderBy: { createdAt: 'asc' },
  },
  voucherNumber: true,
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
    advanceOffsetSatang: row.advanceOffsetSatang,
    transferSatang: payoutTransferSatang(row.netSatang, row.advanceOffsetSatang),
    ...sumPayoutTaxSplit(row.items),
    itemCount: row._count.items,
    bankAccountId: row.bankAccountId,
    bankAccountLabel:
      row.bankAccount === null
        ? null
        : `${row.bankAccount.bankName} ${maskAccountNumber(row.bankAccount.accountNumber) ?? ''}`.trim(),
    idempotencyKey: row.idempotencyKey,
    paymentFileUrl: row.paymentFileUrl,
    paymentFileGeneratedAt: row.paymentFileGeneratedAt?.toISOString() ?? null,
    // snapshot ค่าตั้งภาษี (มติ PO 05/10/2569 UAT U8) — รอบที่สร้างก่อนมีค่าตั้ง = null
    whtPolicy:
      row.whtCertificateMode === null || row.whtIncomeTypeMode === null
        ? null
        : {
            baseExpenseTypes: normalizeBaseExpenseTypes(row.whtBaseExpenseTypes),
            certificateMode: row.whtCertificateMode,
            incomeTypeMode: row.whtIncomeTypeMode,
            // NULL = รอบที่สร้างก่อนมีค่าตั้ง U16 ⇒ ไม่ออกใบ 0% (พฤติกรรมเดิม)
            issueZeroRate402Certificate: row.whtIssueZeroRate402Certificate ?? false,
            // NULL = รอบที่สร้างก่อนมีค่าตั้ง U33 ⇒ การจับคู่เดิม (inhouse 40(2) · outsource 40(8))
            inhouseIncomeCategory: row.whtInhouseIncomeCategory ?? LEGACY_WHT_POLICY.inhouseIncomeCategory,
            outsourceIncomeCategory: row.whtOutsourceIncomeCategory ?? LEGACY_WHT_POLICY.outsourceIncomeCategory,
            // NULL = รอบที่สร้างก่อนมีค่าตั้ง U105 ⇒ ไม่อนุญาต (คิดแบบ (1) เสมอ)
            allowGrossUpConditions: row.whtAllowGrossUpConditions ?? LEGACY_WHT_POLICY.allowGrossUpConditions,
          },
    createdAt: row.createdAt.toISOString(),
    createdByName: row.createdByUser.fullName,
    updatedAt: row.updatedAt.toISOString(),
    cancelledAt: row.cancelledAt?.toISOString() ?? null,
    cancelledByName: row.cancelledByUser?.fullName ?? null,
    cancelReason: row.cancelReason,
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
    whtBaseIncluded: row.whtBaseIncluded,
    whtIncomeCategory: row.whtIncomeCategory,
    whtCondition: row.whtCondition,
    advanceOffsetSatang: row.advanceOffsetSatang,
    transferSatang: payoutTransferSatang(row.netSatang, row.advanceOffsetSatang),
    advanceOffsets: row.advanceReturns.map((entry) => ({
      advanceId: entry.advanceId,
      advanceRef: entry.advance.advanceNumber,
      amountSatang: entry.amountSatang,
    })),
    voucherNumber: row.voucherNumber,
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
): Promise<{ batch: PayoutBatchDetailDto; issuer: PayoutDocIssuer; payees: Map<string, PayoutPayeeDocInfo> }> {
  const [batch, organization] = await Promise.all([
    getPayoutBatch(user, batchId),
    prisma.organization.findUniqueOrThrow({
      where: { id: user.organizationId },
      select: { name: true, address: true, taxId: true, phone: true },
    }),
  ])
  return { batch, issuer: organization, payees: await payoutPayeeDocInfo(user.organizationId, batch) }
}

/**
 * ข้อมูลผู้รับบนใบสำคัญจ่าย/สลิป (มติ PO U100/U101) — ชื่อพร้อมคำนำหน้า · เลข 13 หลัก · ที่อยู่ (U94) · สาขา (นิติบุคคล)
 * + สรุปเคสสำเร็จ/วันทำงาน/คืนที่พัก จากรายการเบิกในรอบ · ข้อมูลผู้รับอ่าน ณ เวลาพิมพ์ (เอกสารภายใน)
 */
async function payoutPayeeDocInfo(
  organizationId: string,
  batch: PayoutBatchDetailDto,
): Promise<Map<string, PayoutPayeeDocInfo>> {
  const payeeIds = [...new Set(batch.items.map((item) => item.payeeId))]
  const expenseIds = batch.items.filter((item) => item.source === 'expense').map((item) => item.sourceId)
  const [payees, expenses] = await Promise.all([
    prisma.payeeProfile.findMany({
      where: { id: { in: payeeIds }, organizationId },
      select: {
        id: true,
        payeeType: true,
        nameTitle: true,
        nationalId: true,
        branchCode: true,
        addressDetail: true,
        addressSubdistrict: true,
        addressDistrict: true,
        addressProvince: true,
        addressPostalCode: true,
        user: { select: { fullName: true } },
      },
    }),
    prisma.expense.findMany({
      where: { id: { in: expenseIds }, organizationId },
      select: {
        payeeId: true,
        expenseType: true,
        caseId: true,
        fieldDaySettlementId: true,
        expenseDate: true,
        hotelNights: true,
      },
    }),
  ])
  return new Map(
    payees.map((payee) => {
      const isCorporate = payee.payeeType === 'corporate'
      return [
        payee.id,
        {
          displayName: payeeDisplayName({ name: payee.user.fullName, nameTitle: payee.nameTitle, payeeType: payee.payeeType }),
          taxId: payee.nationalId,
          isCorporate,
          address: payeeAddressLine(payee),
          branchLabel: isCorporate ? formatBranch(payee.branchCode) : null,
          stats: payslipStatsOf(expenses.filter((expense) => expense.payeeId === payee.id)),
        },
      ]
    }),
  )
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
  /** snapshot: อยู่ในฐาน WHT ตามค่าตั้งของรอบ (มติ PO 05/10/2569 UAT U3) */
  whtBaseIncluded: boolean
  /** snapshot ประเภทเงินได้ของผู้รับ (UAT U5) — `null` = เงินทดรองจ่าย (ไม่ใช่เงินได้) */
  whtIncomeCategory: WhtIncomeCategory | null
  /** snapshot เงื่อนไขการหักของผู้รับ (มติ PO U105) — `null` = เงินทดรองจ่าย */
  whtCondition: WhtCondition | null
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
  side: PayoutBatchSide,
  policy: WhtPolicyValues,
  typeDefaults: LoadedTaxProfileDefaults,
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
      expenseType: true,
      compPlan: { select: { whtPct: true } },
      case: { select: { trackingRound: true } },
      payee: {
        select: {
          id: true,
          isVerified: true,
          taxProfileId: true,
          wht402Pct: true,
          // มติ PO U105 — เงื่อนไขการหัก (1)/(2)/(3) ⇒ snapshot ลงรายการ + ตรวจกับค่าตั้ง
          whtCondition: true,
          // นิติบุคคล ⇒ ไม่ใช่เงินได้ 40(1)/40(2) ไม่ว่าโหมดค่าตั้งเป็นอะไร (มติ PO U96 #2)
          payeeType: true,
          taxProfile: { select: { whtPct: true, whtBasis: true, whtMinThresholdSatang: true } },
          user: {
            select: { fullName: true, team: { select: { side: true } }, role: { select: { roleGroup: true } } },
          },
        },
      },
    },
    orderBy: [{ expenseDate: 'asc' }],
  })

  // คัดฝั่งก่อนคิดภาษี — ผู้รับ "อีกฝั่ง" ไม่ควรบล็อกรอบนี้ (`17` §6.1) รวมถึงกรณีขาดอัตรา 40(2) ·
  // payee หนึ่งคนอยู่ฝั่งเดียวเสมอ (`resolvePayoutSide()` อิงทีม/role ของ payee) ⇒ คัดก่อนจัดกลุ่มไม่ปนรอบ
  const sided = rows
    .map((row) => ({
      row,
      side: resolvePayoutSide({
        teamSide: row.payee.user.team?.side ?? null,
        roleGroup: row.payee.user.role.roleGroup,
      }),
    }))
    .filter((entry) => entry.side === side)

  // `22` §6.9 — มติ PO 03/10/2569 (UAT Q5, BUG-014): เกณฑ์ขั้นต่ำเทียบกับ **ฐานรวมของ payee ทั้งรอบจ่าย**
  // แล้วกระจายภาษีกลับลงรายการ (`calculatePayeeBatchWht()`)
  // มติ PO 05/10/2569 (UAT U3/U5/U7): ฐานเฉพาะชนิดรายการที่ค่าตั้งรวม · ประเภทเงินได้ตามค่าตั้ง+ฝั่งของผู้รับ ·
  // 40(2) ใช้อัตราต่อคน (`payee_profiles.wht_40_2_pct`) ไม่มีเกณฑ์
  const indicesByPayee = new Map<string, number[]>()
  sided.forEach((entry, index) => {
    const members = indicesByPayee.get(entry.row.payee.id) ?? []
    members.push(index)
    indicesByPayee.set(entry.row.payee.id, members)
  })

  // ผู้รับ 40(1)/40(2) ที่มีรายการในฐานแต่ไม่มีอัตรา ⇒ ปัดทั้งรอบพร้อมรายชื่อ (ไม่เดาอัตรา — Hybrid Boundary)
  // (มติ PO 05/10/2569 UAT U33 — 40(1) ใช้กติกาเดียวกับ 40(2))
  const missing402: string[] = []
  for (const members of indicesByPayee.values()) {
    const first = sided[members[0]!]!
    const category = resolveIncomeCategory(policy, first.side, first.row.payee.payeeType)
    const hasBaseItem = members.some((index) => isInWhtBase(policy, sided[index]!.row.expenseType))
    if (usesPerPayeeWhtRate(category) && hasBaseItem && first.row.payee.wht402Pct === null) {
      missing402.push(first.row.payee.user.fullName)
    }
  }
  if (missing402.length > 0) {
    throw new PayoutError('WHT_40_2_RATE_MISSING', {
      detail: `payees=${missing402.join(', ')}`,
      context: { payees: missing402 },
    })
  }

  // มติ PO 06/10/2569 U105 — ค่าตั้งปิดเงื่อนไข (2)/(3) แต่ผู้รับยังตั้งไว้ ⇒ **บล็อกทั้งรอบ** พร้อมรายชื่อ
  // (ไม่คิดแบบ (1) แทนเงียบ ๆ — ใบ 50 ทวิ จะพิมพ์ช่อง "ผู้จ่ายเงิน" ไม่ตรงกับยอดภาษีจริง)
  const disallowedConditions: string[] = []
  for (const members of indicesByPayee.values()) {
    const first = sided[members[0]!]!
    const hasBaseItem = members.some((index) => isInWhtBase(policy, sided[index]!.row.expenseType))
    if (hasBaseItem && !isWhtConditionAllowed(policy, first.row.payee.whtCondition)) {
      disallowedConditions.push(first.row.payee.user.fullName)
    }
  }
  if (disallowedConditions.length > 0) {
    throw new PayoutError('WHT_CONDITION_NOT_ALLOWED', {
      detail: `payees=${disallowedConditions.join(', ')}`,
      context: { payees: disallowedConditions },
    })
  }

  const whtByIndex = new Array<PayeeBatchWhtLine | undefined>(sided.length)
  /** Tax Profile ค่าเริ่มต้นตามประเภทของผู้รับ (มติ PO U121) — snapshot id เมื่อถูกใช้จริง */
  const typeDefaultByIndex = new Array<string | null>(sided.length).fill(null)
  const missingRate: string[] = []
  for (const members of indicesByPayee.values()) {
    const first = sided[members[0]!]!
    const incomeCategory = resolveIncomeCategory(policy, first.side, first.row.payee.payeeType)
    const typeDefault = pickTaxProfileDefault(typeDefaults.profiles, first.side, first.row.payee.payeeType)
    const { lines, rateMissing } = calculatePayeeBatchWht(
      members.map((index) => {
        const row = sided[index]!.row
        return {
          grossSatang: row.grossSatang,
          includedInBase: isInWhtBase(policy, row.expenseType),
          source: {
            payeeTaxProfile: payeeTaxValues(row.payee),
            typeDefaultTaxProfile: typeDefault?.values ?? null,
            planWhtPct: row.compPlan === null ? null : Number(row.compPlan.whtPct),
          },
        }
      }),
      {
        incomeCategory,
        section402Pct: first.row.payee.wht402Pct === null ? null : Number(first.row.payee.wht402Pct),
        condition: first.row.payee.whtCondition,
      },
    )
    if (rateMissing) missingRate.push(first.row.payee.user.fullName)
    members.forEach((index, position) => {
      whtByIndex[index] = lines[position]
      if (lines[position]?.rate.source === 'type_default') typeDefaultByIndex[index] = typeDefault?.taxProfileId ?? null
    })
  }
  // มติ PO U121 — รายการในฐานที่ไม่มีอัตราเลย (ไม่มี Tax Profile รายคน/ค่าเริ่มต้นตามประเภท และไม่มีอัตราแผน)
  // ⇒ ปัดทั้งรอบพร้อมรายชื่อ ห้ามเดาอัตรา
  if (missingRate.length > 0) {
    throw new PayoutError('WHT_RATE_MISSING', {
      detail: `payees=${missingRate.join(', ')}`,
      context: { payees: missingRate },
    })
  }

  return sided.map(({ row, side: payeeSide }, index) => {
    const wht = whtByIndex[index]
    if (wht === undefined) throw new Error(`คำนวณ WHT ไม่ครบ — expense ${row.id}`)
    return {
      source: 'expense',
      sourceId: row.id,
      payeeId: row.payee.id,
      payeeName: row.payee.user.fullName,
      isVerified: row.payee.isVerified,
      side: payeeSide,
      trackingRound: row.case?.trackingRound ?? 1,
      // U105 — ผู้จ่ายออกภาษีให้ ⇒ gross = ยอดรายการ + ภาษีที่ออกให้ (เงินได้บนใบ 50 ทวิ) · net = ยอดรายการเต็ม
      grossSatang: wht.payoutGrossSatang,
      whtSatang: wht.whtSatang,
      netSatang: wht.netSatang,
      // snapshot Tax Profile ที่ใช้จริง — มาจากค่าเริ่มต้นตามประเภท ⇒ id ของ profile ค่าเริ่มต้น (มติ PO U121)
      taxProfileId: typeDefaultByIndex[index] ?? row.payee.taxProfileId,
      whtPctSnapshot: wht.rate.whtPct,
      // fallback อัตราของ Plan มีความหมายเฉพาะรายการที่อยู่ในฐาน 40(8) จริง
      whtRateFromPlan: wht.rate.source === 'plan' && wht.includedInBase,
      whtBaseIncluded: wht.includedInBase,
      whtIncomeCategory: wht.incomeCategory,
      whtCondition: wht.whtCondition,
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
      // ไม่ใช่เงินได้ ⇒ ไม่อยู่ในฐาน WHT และไม่มีประเภทเงินได้
      whtBaseIncluded: false,
      whtIncomeCategory: null,
      whtCondition: null,
    }
  })
}

/**
 * มติ PO 05/10/2569 (UAT U30) — ยอดคืนค้างแบบ "หักกลบในรอบจ่าย" ของผู้รับในรอบนี้
 * **ล็อกแถวเงินทดรอง (`FOR UPDATE`) ก่อนอ่านยอดค้าง** ⇒ การรับคืนแยก/เปลี่ยนวิธีคืน/รอบจ่ายอีกรอบที่เกิด
 * พร้อมกันต้องรอ แล้วเห็นยอดค้างที่ถูกหักไปแล้ว (trigger ของ DB เป็นด่านสุดท้ายอีกชั้น)
 * ลำดับ: เคลียร์ก่อนหักก่อน (FIFO — `22` §6.14)
 */
async function lockOutstandingOffsetReturns(
  tx: PayoutTxClient,
  organizationId: string,
  payeeIds: readonly string[],
): Promise<Map<string, OutstandingAdvanceReturn[]>> {
  const byPayee = new Map<string, OutstandingAdvanceReturn[]>()
  if (payeeIds.length === 0) return byPayee

  const locked = await tx.$queryRaw<Array<{ id: string }>>`
    SELECT id FROM advances
     WHERE organization_id = ${organizationId}::uuid
       AND payee_id IN (${Prisma.join(payeeIds.map((id) => Prisma.sql`${id}::uuid`))})
       AND status = 'cleared' AND return_method = 'payout_offset' AND deleted_at IS NULL
     ORDER BY cleared_at ASC, id ASC
     FOR UPDATE`
  if (locked.length === 0) return byPayee

  const rows = await tx.advance.findMany({
    where: { id: { in: locked.map((row) => row.id) } },
    select: {
      id: true,
      payeeId: true,
      returnSatang: true,
      returns: { where: { reversedAt: null }, select: { amountSatang: true } },
    },
    orderBy: [{ clearedAt: 'asc' }, { id: 'asc' }],
  })
  for (const row of rows) {
    const outstandingSatang = advanceReturnOutstandingSatang({
      returnSatang: row.returnSatang,
      collectedSatang: row.returns.map((entry) => entry.amountSatang),
    })
    if (outstandingSatang === 0) continue
    const bucket = byPayee.get(row.payeeId) ?? []
    bucket.push({ advanceId: row.id, outstandingSatang })
    byPayee.set(row.payeeId, bucket)
  }
  return byPayee
}

interface PlannedOffset {
  candidateIndex: number
  advanceId: string
  amountSatang: number
}

/** แผนหักกลบของทั้งรอบ — หลัง WHT ต่อผู้รับ (`allocatePayeeAdvanceOffset()` · `22` §6.14) */
function planAdvanceOffsets(
  candidates: readonly Candidate[],
  outstanding: ReadonlyMap<string, readonly OutstandingAdvanceReturn[]>,
): { lineOffsets: number[]; planned: PlannedOffset[] } {
  const lineOffsets = candidates.map(() => 0)
  const planned: PlannedOffset[] = []
  const indicesByPayee = new Map<string, number[]>()
  candidates.forEach((candidate, index) => {
    const bucket = indicesByPayee.get(candidate.payeeId) ?? []
    bucket.push(index)
    indicesByPayee.set(candidate.payeeId, bucket)
  })
  for (const [payeeId, indices] of indicesByPayee) {
    const returns = outstanding.get(payeeId)
    if (returns === undefined || returns.length === 0) continue
    const result = allocatePayeeAdvanceOffset(
      indices.map((index) => candidates[index]!.netSatang),
      returns,
    )
    result.lineOffsetSatang.forEach((offset, position) => {
      lineOffsets[indices[position]!] = offset
    })
    for (const allocation of result.allocations) {
      planned.push({
        candidateIndex: indices[allocation.lineIndex]!,
        advanceId: allocation.advanceId,
        amountSatang: allocation.amountSatang,
      })
    }
  }
  return { lineOffsets, planned }
}

/**
 * คืนยอดหักกลบของรายการในรอบจ่ายให้กลับเป็น "ค้าง" (มติ PO U30) — ใช้เมื่อรอบจ่ายถูกยกเลิก
 * หรือรายการถูกตัดออกจากรอบ: **กลับรายการ** แถว `advance_returns` (ไม่ลบ — ตรวจย้อนหลังได้) ⇒ ยอดค้าง
 * กลับมาเท่าเดิม ไม่หาย และรอบจ่ายถัดไปหักได้ใหม่ครั้งเดียว (partial unique ผูกเฉพาะแถวที่ยังไม่กลับรายการ)
 *
 * ⚠️ เรียกในทรานแซกชันเดียวกับการยกเลิก/ตัดรายการเสมอ · ต้องมีเหตุผล (กระทบเงิน)
 * idempotent: แถวที่กลับรายการแล้วไม่ถูกแตะซ้ำ
 */
export async function releasePayoutAdvanceOffsets(
  tx: PayoutTxClient,
  input: {
    organizationId: string
    payoutBatchItemIds: readonly string[]
    actorId: string
    actorRole: string
    reason: string
    meta: RequestMeta
    now?: Date
  },
): Promise<number> {
  const reason = input.reason.trim()
  if (reason === '') throw new Error('releasePayoutAdvanceOffsets: ต้องมีเหตุผล')
  if (input.payoutBatchItemIds.length === 0) return 0
  const at = input.now ?? new Date()

  const rows = await tx.advanceReturn.findMany({
    where: {
      organizationId: input.organizationId,
      payoutBatchItemId: { in: [...input.payoutBatchItemIds] },
      reversedAt: null,
    },
    select: { id: true, advanceId: true, amountSatang: true, payoutBatchId: true, payoutBatchItemId: true },
  })
  for (const row of rows) {
    await tx.advanceReturn.update({
      where: { id: row.id },
      data: { reversedAt: at, reversedBy: input.actorId, reversalReason: reason, updatedBy: input.actorId },
    })
    await emitAudit(
      {
        organizationId: input.organizationId,
        actorId: input.actorId,
        actorRole: input.actorRole,
        action: 'status_change',
        targetType: 'advance_returns',
        targetId: row.id,
        before: { reversed: false, advance_id: row.advanceId, amount_satang: row.amountSatang },
        after: {
          reversed: true,
          advance_id: row.advanceId,
          amount_satang: row.amountSatang,
          payout_batch_id: row.payoutBatchId,
          payout_batch_item_id: row.payoutBatchItemId,
        },
        reason,
        ipAddress: input.meta.ipAddress,
        userAgent: input.meta.userAgent,
        diffOnly: false,
      },
      tx,
    )
  }
  return rows.length
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

  // ค่าตั้งภาษีที่มีผล ณ วันสร้างรอบ (มติ PO 05/10/2569 UAT U8) — snapshot ลงรอบด้านล่าง
  // รอบที่สร้างแล้วไม่ถูกคิดใหม่เมื่อค่าตั้งเปลี่ยน (Rule 08)
  const whtPolicy = await resolveWhtPolicyForPayout(user.organizationId, context.now ?? new Date())
  // Tax Profile ค่าเริ่มต้นตามประเภทผู้รับ ณ วันสร้างรอบ (มติ PO U121) — snapshot id ของชุดลงรอบ
  const typeDefaults = await loadTaxProfileDefaults(user.organizationId)

  const [expenses, advances] = await Promise.all([
    collectExpenseCandidates(user.organizationId, input.cutoffDate, input.side, whtPolicy.values, typeDefaults),
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
    // มติ PO U30 — หักยอดคืนเงินทดรองค้าง **หลัง WHT** (ฐาน WHT / 50 ทวิ / gross·wht·net ไม่เปลี่ยน)
    const outstanding = await lockOutstandingOffsetReturns(
      tx,
      user.organizationId,
      [...new Set(candidates.map((candidate) => candidate.payeeId))],
    )
    const { lineOffsets, planned } = planAdvanceOffsets(candidates, outstanding)
    const totalOffsetSatang = lineOffsets.reduce((sum, value) => sum + value, 0)
    const itemIds: string[] = []

    const batch = await tx.payoutBatch.create({
      data: {
        organizationId: user.organizationId,
        name,
        side: input.side,
        status: 'draft',
        whtPolicyId: whtPolicy.policyId,
        whtBaseExpenseTypes: normalizeBaseExpenseTypes(whtPolicy.values.baseExpenseTypes),
        whtCertificateMode: whtPolicy.values.certificateMode,
        whtIncomeTypeMode: whtPolicy.values.incomeTypeMode,
        whtIssueZeroRate402Certificate: whtPolicy.values.issueZeroRate402Certificate,
        whtInhouseIncomeCategory: whtPolicy.values.inhouseIncomeCategory,
        whtOutsourceIncomeCategory: whtPolicy.values.outsourceIncomeCategory,
        whtAllowGrossUpConditions: whtPolicy.values.allowGrossUpConditions,
        taxProfileDefaultId: typeDefaults.id,
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
          whtBaseIncluded: candidate.whtBaseIncluded,
          whtIncomeCategory: candidate.whtIncomeCategory,
          whtCondition: candidate.whtCondition,
          advanceOffsetSatang: lineOffsets[itemIds.length] ?? 0,
          createdBy: user.id,
        },
        select: { id: true },
      })
      itemIds.push(item.id)

      // ยึดสิทธิ์รายการต้นทาง — ยังว่างอยู่เท่านั้นถึงจะดึงเข้ารอบนี้ได้ (กันสองรอบแย่งรายการเดียวกัน)
      const claimed =
        candidate.source === 'expense'
          ? await tx.expense.updateMany({
              where: { id: candidate.sourceId, payoutBatchItemId: null },
              data: { payoutBatchItemId: item.id, updatedBy: user.id },
            })
          : await tx.advance.updateMany({
              // มติ PO U74 — ผูกสถานะ "ยังไม่เคลียร์" ด้วย: แข่งกับการเคลียร์ยอดที่ล็อกแถวไว้ ⇒ รอแล้วประเมิน
              // เงื่อนไขใหม่ (READ COMMITTED) — เคลียร์แล้วต้องไม่ถูกดึงเข้ารอบไปจ่ายออกอีก
              where: { id: candidate.sourceId, payoutBatchItemId: null, status: { in: ['approved', 'overdue'] } },
              data: { payoutBatchItemId: item.id, updatedBy: user.id },
            })
      if (claimed.count !== 1) {
        throw new PayoutError('NO_ITEMS_TO_PAY', {
          detail: `${candidate.source}=${candidate.sourceId} ถูกดึงเข้ารอบจ่ายอื่นไปแล้ว`,
        })
      }
    }

    // สมุดย่อยการคืนยอด — 1 แถวต่อ (เงินทดรอง × บรรทัดที่หัก) · trigger กันยอดสะสมเกินยอดคืน
    for (const offset of planned) {
      await tx.advanceReturn.create({
        data: {
          organizationId: user.organizationId,
          advanceId: offset.advanceId,
          payeeId: candidates[offset.candidateIndex]!.payeeId,
          channel: 'payout_offset',
          amountSatang: offset.amountSatang,
          payoutBatchId: batch.id,
          payoutBatchItemId: itemIds[offset.candidateIndex]!,
          createdBy: user.id,
        },
      })
    }

    await tx.payoutBatch.update({
      where: { id: batch.id },
      data: {
        status,
        grossSatang: totals.grossSatang,
        whtSatang: totals.whtSatang,
        netSatang: totals.netSatang,
        advanceOffsetSatang: totalOffsetSatang,
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
          // มติ PO U30 — ยอดหักคืนเงินทดรอง (หลัง WHT) + ยอดโอนจริง
          advance_offset_satang: totalOffsetSatang,
          transfer_satang: totals.netSatang - totalOffsetSatang,
          advance_offsets: planned.map((offset) => ({
            advance_id: offset.advanceId,
            payout_batch_item_id: itemIds[offset.candidateIndex] ?? null,
            amount_satang: offset.amountSatang,
          })),
          item_count: totals.itemCount,
          wht_policy_id: whtPolicy.policyId,
          wht_base_expense_types: normalizeBaseExpenseTypes(whtPolicy.values.baseExpenseTypes),
          wht_certificate_mode: whtPolicy.values.certificateMode,
          wht_income_type_mode: whtPolicy.values.incomeTypeMode,
          wht_inhouse_income_category: whtPolicy.values.inhouseIncomeCategory,
          wht_outsource_income_category: whtPolicy.values.outsourceIncomeCategory,
          wht_allow_gross_up_conditions: whtPolicy.values.allowGrossUpConditions,
          tax_profile_default_id: typeDefaults.id,
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

/**
 * จองคีย์กันโอนซ้ำของรอบ — **ค่าเดียวตลอดชีพของรอบ** (`17` §6.3 · Rule 09)
 *
 * mint จากค่าที่อ่านมาก่อนหน้า (`batch.idempotencyKey ?? สร้างใหม่`) ไม่ได้ เพราะสองคำขอที่เข้ามา
 * พร้อมกันบนรอบที่ยังไม่เคยสร้างไฟล์จะเห็น `null` **ทั้งคู่** แล้วได้คนละคีย์ ⇒ `referenceNo` ของ
 * สองไฟล์เป็นคนละชุด ⇒ ถ้าไฟล์ทั้งสองถูกอัปเข้าธนาคาร **ธนาคารจับซ้ำไม่ได้ = โอนซ้ำ**
 *
 * ⇒ จองด้วย `UPDATE … WHERE idempotency_key IS NULL` (Postgres ล็อกแถวตอนอัปเดต ⇒ ผู้ชนะมีคนเดียว
 * เสมอ) แล้ว**อ่านค่าจริงกลับมา** ใช้ร่วมกันทั้งสองฝั่ง · จองก่อนอัปโหลดโดยตั้งใจ — คีย์เป็นแค่
 * ตัวระบุรอบ ไม่ใช่สถานะ "สร้างไฟล์แล้ว" (ตัวนั้นคือ `payment_file_generated_at`) ⇒ อัปโหลดล้ม
 * แล้วลองใหม่ยังได้คีย์เดิม ซึ่งเป็นพฤติกรรมที่ `17` §6.3 ต้องการ
 */
async function claimIdempotencyKey(
  batch: { id: string; side: PayoutBatchSide; idempotencyKey: string | null },
  now: Date,
): Promise<string> {
  if (batch.idempotencyKey !== null) return batch.idempotencyKey

  // จองได้เฉพาะรอบที่ยังสร้างไฟล์ได้ — รอบที่เพิ่งถูกยกเลิก (มติ PO U67) ต้องไม่ได้คีย์ใหม่
  await prisma.payoutBatch.updateMany({
    where: { id: batch.id, idempotencyKey: null, status: { in: statusesAllowing('generate_file') } },
    data: {
      idempotencyKey: buildIdempotencyKey({ side: batch.side, generatedAt: now, uniqueSuffix: randomUUID() }),
    },
  })

  const claimed = await prisma.payoutBatch.findUnique({
    where: { id: batch.id },
    select: { idempotencyKey: true, status: true },
  })
  if (claimed !== null && !statusesAllowing('generate_file').includes(claimed.status)) {
    throw new PayoutError('PAYOUT_BATCH_INVALID_STATUS', { detail: `batch=${batch.id} at ${claimed.status}` })
  }
  // ไปไม่ถึงบรรทัดนี้ — แถวเพิ่งถูกอ่านมาแล้ว และคีย์ไม่มีทางถูกล้างกลับเป็น NULL
  if (claimed?.idempotencyKey == null) {
    throw new Error(`claimIdempotencyKey: จองคีย์กันโอนซ้ำของรอบ ${batch.id} ไม่สำเร็จ`)
  }
  return claimed.idempotencyKey
}

/**
 * ออกเลขใบสำคัญจ่ายให้ผู้รับที่ยังไม่มีเลขในรอบนี้ — เรียกในทรานแซกชันของการสร้างไฟล์เท่านั้น
 * (ล้ม = ตัวนับ rollback) · คืนเลขที่ออกใหม่ (ว่าง = สร้างไฟล์ซ้ำ ใช้เลขเดิมทั้งหมด)
 */
async function assignVoucherNumbers(
  tx: Parameters<Parameters<typeof prisma.$transaction>[0]>[0],
  organizationId: string,
  batchId: string,
  items: ReadonlyArray<{ payeeId: string; voucherNumber: string | null }>,
  at: Date,
): Promise<string[]> {
  const pending: string[] = []
  const seen = new Set<string>()
  for (const item of items) {
    if (seen.has(item.payeeId)) continue
    seen.add(item.payeeId)
    const hasNumber = items.some((other) => other.payeeId === item.payeeId && other.voucherNumber !== null)
    if (!hasNumber) pending.push(item.payeeId)
  }

  const issued: string[] = []
  for (const payeeId of pending) {
    const voucher = await nextDocumentNumber(tx, organizationId, 'payment_voucher', at)
    await tx.payoutBatchItem.updateMany({
      where: { payoutBatchId: batchId, organizationId, payeeId, voucherNumber: null },
      data: { voucherNumber: voucher.number },
    })
    issued.push(voucher.number)
  }
  return issued
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
  // ตรวจสถานะก่อนคำเตือนไฟล์ซ้ำ — รอบที่ยกเลิก/จ่ายแล้วต้องถูกปฏิเสธทันที ไม่ใช่ได้คำเตือนก่อน (มติ PO U67)
  const status = nextPayoutBatchStatus(batch.status, 'generate_file')

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

  const idempotencyKey = await claimIdempotencyKey(
    { id: batchId, side: batch.side, idempotencyKey: batch.idempotencyKey },
    now,
  )

  // มติ PO U30 — ยอดโอน = net − หักคืนเงินทดรอง · บรรทัดที่ถูกหักจนเหลือ 0 ไม่ต้องโอน (ไม่ใส่แถวยอด 0
  // ให้ธนาคาร) · เลขอ้างอิงต่อแถวยึดลำดับรายการเดิมเพื่อให้คงที่ทุกครั้งที่สร้างไฟล์ซ้ำ
  const transferable = items
    .map((item, index) => ({ item, index, transferSatang: payoutTransferSatang(item.netSatang, item.advanceOffsetSatang) }))
    .filter((entry) => entry.transferSatang > 0)

  const rows = transferable.map(({ item, index, transferSatang }): PaymentFileRowInput => {
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
      netSatang: transferSatang,
      citizenId: item.payee.nationalId,
      email: item.payee.user.email,
      mobileNo: item.payee.user.phone,
      remark:
        item.advanceReturns.length === 0
          ? batch.name
          : `${batch.name} ${item.advanceReturns.map((entry) => advanceOffsetLineLabel(entry.advance.advanceNumber)).join(' ')}`,
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
    // มติ PO U67 — แข่งกับการยกเลิกรอบ: อัปเดตเฉพาะเมื่อสถานะยังสร้างไฟล์ได้ (Postgres ตรวจ WHERE ซ้ำหลัง
    // รอล็อกแถว) ⇒ ยกเลิกชนะก่อน = 0 แถว = ปฏิเสธ (ไฟล์ที่อัปโหลดไปแล้วเป็นไฟล์กำพร้า ไม่มีแถวชี้ถึง)
    const claimed = await tx.payoutBatch.updateMany({
      where: { id: batchId, status: { in: statusesAllowing('generate_file') } },
      data: {
        status,
        idempotencyKey,
        bankAccountId: account.id,
        paymentFileUrl: path,
        paymentFileGeneratedAt: now,
        updatedBy: user.id,
      },
    })
    if (claimed.count !== 1) {
      throw new PayoutError('PAYOUT_BATCH_INVALID_STATUS', { detail: `batch=${batchId} changed during generate_file` })
    }
    // มติ PO U102 — ใบสำคัญจ่าย 1 เลขต่อผู้รับเงินต่อรอบ ออกตอนสร้างไฟล์ครั้งแรก (สร้างซ้ำใช้เลขเดิม)
    // ลำดับผู้รับ = ลำดับรายการแรกของแต่ละคน (ตรงกับลำดับบนเอกสาร) · ปีตามวันที่สร้างไฟล์ (เวลาไทย)
    const vouchers = await assignVoucherNumbers(tx, user.organizationId, batchId, items, now)
    const row = await tx.payoutBatch.findUniqueOrThrow({ where: { id: batchId }, select: batchSelect })

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
          voucher_numbers: vouchers,
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
  // มติ PO U67 — ไฟล์โอนของรอบที่ยกเลิกห้ามดาวน์โหลดซ้ำ (กันเผลออัปโหลดเข้าธนาคาร = โอนซ้ำกับรอบใหม่)
  assertPayoutNotCancelled(batch.status, 'payment_file')
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
    // แข่งกับการยกเลิก (มติ PO U67) — ยืนยันจ่ายได้เฉพาะเมื่อยังเป็น `file_generated` อยู่จริง
    const claimed = await tx.payoutBatch.updateMany({
      where: { id: batchId, status: { in: statusesAllowing('complete') } },
      data: { status, updatedBy: user.id },
    })
    if (claimed.count !== 1) {
      throw new PayoutError('PAYOUT_BATCH_INVALID_STATUS', { detail: `batch=${batchId} changed during complete` })
    }
    const row = await tx.payoutBatch.findUniqueOrThrow({ where: { id: batchId }, select: batchSelect })

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
    // แข่งกับการยกเลิก (มติ PO U67) — รอบที่ถูกยกเลิกไปก่อนห้ามถูกจับคู่ปิดเป็นจ่ายสำเร็จ
    const claimed = await tx.payoutBatch.updateMany({
      where: { id: batch.id, status: { in: statusesAllowing('complete') } },
      data: { status, updatedBy: input.actorId },
    })
    if (claimed.count !== 1) {
      throw new PayoutError('PAYOUT_BATCH_INVALID_STATUS', { detail: `batch=${batch.id} changed during sync` })
    }
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
        reason: `จับคู่กับรายการเดินบัญชี ${input.bankTransactionId} สำเร็จ`,
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

// ── POST /api/payout-batches/:id/cancel (มติ PO U67 · `23` §6.6) ────────────

export interface PayoutCancelOutcome {
  batch: PayoutBatchDto
  /** รายการเบิกที่กลับไปรอจ่าย (พร้อมถูกดึงเข้ารอบใหม่) */
  releasedExpenseCount: number
  /** เงินทดรองจ่ายที่กลับไปรอจ่าย */
  releasedAdvanceCount: number
  /** แถวหักคืนเงินทดรองที่ถูกกลับรายการ ⇒ ยอดคืนกลับเป็นค้าง */
  reversedAdvanceOffsetCount: number
}

/**
 * ยกเลิกรอบจ่าย — **ได้เฉพาะก่อนโอนจริง** (มติ PO U67) · เหตุผลบังคับ · terminal
 *
 * ทำทั้งหมดใน**ทรานแซกชันเดียว** (ล้มข้อใด rollback ทั้งก้อน):
 * 1. ล็อกแถวรอบจ่าย (`FOR UPDATE`) แล้วตรวจสถานะ ณ ตอนนั้น ⇒ แข่งกับสร้างไฟล์/ยืนยันจ่าย/จับคู่ธนาคาร
 *    มีผู้ชนะคนเดียว (ฝั่งนั้นอัปเดตแบบมีเงื่อนไขสถานะ — ดู `statusesAllowing()`)
 * 2. ปลดรายการต้นทาง (`expenses` / `advances`.`payout_batch_item_id` → NULL) ⇒ กลับไปรอจ่าย ไม่หาย
 *    · แถว `payout_batch_items` ของรอบนี้คงไว้เป็นประวัติ (snapshot) · รอบใหม่สร้างรายการใหม่ได้ครั้งเดียว
 *    เพราะการยึดรายการยังเป็น `updateMany(... payoutBatchItemId: null)` เหมือนเดิม
 * 3. กลับรายการหักคืนเงินทดรอง (`releasePayoutAdvanceOffsets()` — U30) ⇒ ยอดคืนกลับเป็นค้าง
 * 4. สถานะ `cancelled` + ผู้ยกเลิก/เวลา/เหตุผล + audit (before/after)
 *
 * idempotency key ของรอบที่ยกเลิก**คงไว้** (UNIQUE ระดับ DB) — ไม่ถูกนำกลับมาใช้ · รอบใหม่ได้คีย์ใหม่ตอน
 * สร้างไฟล์ ⇒ ไม่ชนกัน · ไฟล์โอนของรอบที่ยกเลิกดาวน์โหลดซ้ำไม่ได้อีก (`assertPayoutNotCancelled()`)
 *
 * 50 ทวิ / บัญชีค่าใช้จ่าย: เกิดเมื่อรอบ `completed` เท่านั้น (`32` §6.1 · `33` §9) ⇒ รอบที่ยกเลิกได้
 * ไม่มีเอกสารเหล่านี้โดยโครงสร้าง · ถ้าพบบัญชีค่าใช้จ่ายของรอบ = เงินออกแล้ว ⇒ `PAYOUT_BATCH_ALREADY_PAID`
 */
export async function cancelPayoutBatch(
  context: PayoutMutationContext,
  batchId: string,
  input: PayoutCancelInput,
): Promise<PayoutCancelOutcome> {
  const user = context.actor
  const organizationId = user.organizationId
  const reason = requirePayoutCancelReason(input.reason)
  const batch = await findBatch(user, batchId)
  const now = context.now ?? new Date()

  await assertPeriodOpenAt({
    organizationId,
    at: batch.createdAt,
    targetType: 'payout_batches',
    targetId: batchId,
  })

  const outcome = await prisma.$transaction(async (tx) => {
    const locked = await tx.$queryRaw<
      Array<{ status: PayoutBatchStatus; payment_file_generated_at: Date | null; idempotency_key: string | null }>
    >`
      SELECT status, payment_file_generated_at, idempotency_key FROM payout_batches
       WHERE id = ${batchId}::uuid AND organization_id = ${organizationId}::uuid AND deleted_at IS NULL
       FOR UPDATE`
    const current = locked[0]
    if (current === undefined) throw new PayoutError('PAYOUT_BATCH_NOT_FOUND', { detail: `batch=${batchId}` })

    const items = await tx.payoutBatchItem.findMany({
      where: { payoutBatchId: batchId, organizationId },
      select: { id: true },
    })
    const itemIds = items.map((item) => item.id)

    const [expenseRecordCount, bankMatchCount] = await Promise.all([
      itemIds.length === 0
        ? Promise.resolve(0)
        : tx.expenseRecord.count({ where: { organizationId, payoutBatchItemId: { in: itemIds } } }),
      tx.bankTransaction.count({
        where: {
          organizationId,
          matchedPayoutId: batchId,
          matchStatus: { in: ['auto_matched', 'manual_matched'] },
        },
      }),
    ])

    const status = assertPayoutCancellable({
      status: current.status,
      paymentFileGenerated: current.payment_file_generated_at !== null,
      confirmFileNotSent: input.confirmFileNotSent,
      hasExpenseRecords: expenseRecordCount > 0,
      hasBankMatch: bankMatchCount > 0,
    })

    // ปลดรายการต้นทาง — เฉพาะที่ยังชี้มาที่รอบนี้ (idempotent ในตัว)
    const [expenseRows, advanceRows] = await Promise.all([
      tx.expense.findMany({
        where: { organizationId, payoutBatchItemId: { in: itemIds } },
        select: { id: true },
      }),
      tx.advance.findMany({
        where: { organizationId, payoutBatchItemId: { in: itemIds } },
        select: { id: true },
      }),
    ])
    if (expenseRows.length > 0) {
      await tx.expense.updateMany({
        where: { id: { in: expenseRows.map((row) => row.id) } },
        data: { payoutBatchItemId: null, updatedBy: user.id },
      })
    }
    if (advanceRows.length > 0) {
      await tx.advance.updateMany({
        where: { id: { in: advanceRows.map((row) => row.id) } },
        data: { payoutBatchItemId: null, updatedBy: user.id },
      })
    }

    const reversedAdvanceOffsetCount = await releasePayoutAdvanceOffsets(tx, {
      organizationId,
      payoutBatchItemIds: itemIds,
      actorId: user.id,
      actorRole: user.roleName,
      reason: `ยกเลิกรอบจ่าย "${batch.name}": ${reason}`,
      meta: context.meta,
      now,
    })

    await tx.payoutBatch.update({
      where: { id: batchId },
      data: { status, cancelledAt: now, cancelledBy: user.id, cancelReason: reason, updatedBy: user.id },
    })

    await emitAudit(
      {
        organizationId,
        actorId: user.id,
        actorRole: user.roleName,
        action: 'status_change',
        targetType: TARGET,
        targetId: batchId,
        before: {
          status: current.status,
          payment_file_generated_at: current.payment_file_generated_at?.toISOString() ?? null,
          idempotency_key: current.idempotency_key,
          net_satang: batch.netSatang,
          advance_offset_satang: batch.advanceOffsetSatang,
        },
        after: {
          status,
          cancelled_at: now.toISOString(),
          cancel_reason: reason,
          // key คงไว้กับรอบที่ยกเลิก (ไม่ถูกนำกลับมาใช้) — รอบใหม่ได้ key ใหม่
          idempotency_key: current.idempotency_key,
          confirm_file_not_sent: current.payment_file_generated_at === null ? null : input.confirmFileNotSent,
          released_expense_ids: expenseRows.map((row) => row.id),
          released_advance_ids: advanceRows.map((row) => row.id),
          reversed_advance_offset_count: reversedAdvanceOffsetCount,
          item_count: itemIds.length,
        },
        reason,
        ipAddress: context.meta.ipAddress,
        userAgent: context.meta.userAgent,
        diffOnly: false,
      },
      tx,
    )

    return {
      releasedExpenseCount: expenseRows.length,
      releasedAdvanceCount: advanceRows.length,
      reversedAdvanceOffsetCount,
    }
  })

  return { batch: toBatchDto(await findBatch(user, batchId)), ...outcome }
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
