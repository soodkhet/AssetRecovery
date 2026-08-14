import { emitAudit } from '@/lib/audit/audit'
import type { Prisma } from '@/lib/generated/prisma/client'
import { prisma } from '@/lib/prisma'
import {
  canPayFrom,
  canReceiveTo,
  maskAccountNumber,
  normalizeAccountNumber,
  normalizeBankAccountValues,
  toBankAccountAuditPayload,
  type BankAccountValues,
} from '@/lib/settings/bank-account'
import { SettingsError } from '@/lib/settings/errors'
import {
  statusFilter,
  toIso,
  type SettingsMutationContext,
  type SettingsTxClient,
} from '@/lib/settings/queries/shared'
import type { BankAccountListQuery } from '@/lib/settings/schemas'
import type { BankAccountDto } from '@/lib/settings/types'

/**
 * บัญชีธนาคารบริษัท (`13` §6.3) — ชั้น DB
 *
 * `13` §9: บัญชีที่มีรายการเงินผูกอยู่ **ห้ามลบ** (แก้ได้ แต่ต้อง audit) → `BANK_ACCOUNT_IN_USE`
 * · `is_payout_account` ถูก deprecate (DEC-006/D2) — ไม่อ่าน ไม่เขียนคอลัมน์นั้นเลย
 */

const TARGET = 'bank_accounts'

const accountSelect = {
  id: true,
  bankName: true,
  accountName: true,
  accountNumber: true,
  accountType: true,
  usage: true,
  statementFormat: true,
  paymentFileFormat: true,
  autoMatchToleranceDays: true,
  isPrimary: true,
  deletedAt: true,
  updatedAt: true,
} as const

type AccountRow = Prisma.BankAccountGetPayload<{ select: typeof accountSelect }>

function toDto(row: AccountRow): BankAccountDto {
  return {
    id: row.id,
    bankName: row.bankName,
    accountName: row.accountName,
    accountNumber: row.accountNumber,
    accountNumberMasked: maskAccountNumber(row.accountNumber),
    accountType: row.accountType,
    usage: row.usage,
    statementFormat: row.statementFormat,
    paymentFileFormat: row.paymentFileFormat,
    autoMatchToleranceDays: row.autoMatchToleranceDays,
    isPrimary: row.isPrimary,
    canPay: canPayFrom(row.usage),
    canReceive: canReceiveTo(row.usage),
    isActive: row.deletedAt === null,
    updatedAt: toIso(row.updatedAt),
  }
}

/** `accountType` ใน DB เป็น string เสรี แต่ API รับได้แค่ 2 ค่า (`13` §6.3) */
function toValues(dto: BankAccountDto): BankAccountValues {
  return {
    bankName: dto.bankName,
    accountName: dto.accountName,
    accountNumber: dto.accountNumber,
    accountType: dto.accountType === 'current' ? 'current' : 'savings',
    usage: dto.usage,
    statementFormat: dto.statementFormat,
    paymentFileFormat: dto.paymentFileFormat,
    autoMatchToleranceDays: dto.autoMatchToleranceDays,
    isPrimary: dto.isPrimary,
  }
}

export async function listBankAccounts(
  organizationId: string,
  query: BankAccountListQuery,
): Promise<BankAccountDto[]> {
  const rows = await prisma.bankAccount.findMany({
    where: { organizationId, usage: query.usage, ...statusFilter(query.status) },
    select: accountSelect,
    orderBy: [{ isPrimary: 'desc' }, { bankName: 'asc' }],
  })
  return rows.map(toDto)
}

export async function getBankAccount(organizationId: string, accountId: string): Promise<BankAccountDto> {
  const row = await prisma.bankAccount.findFirst({ where: { id: accountId, organizationId }, select: accountSelect })
  if (!row) throw new SettingsError('BANK_ACCOUNT_NOT_FOUND', { detail: `bank_account=${accountId}` })
  return toDto(row)
}

/** UNIQUE(organization_id, account_number) — เทียบเลขที่ normalize แล้วเพื่อไม่ให้ `-` หลอกได้ */
async function assertAccountNumberAvailable(
  organizationId: string,
  accountNumber: string,
  exceptId?: string,
): Promise<void> {
  const duplicate = await prisma.bankAccount.findFirst({
    where: {
      organizationId,
      accountNumber: normalizeAccountNumber(accountNumber),
      ...(exceptId === undefined ? {} : { NOT: { id: exceptId } }),
    },
    select: { id: true },
  })
  if (duplicate) throw new SettingsError('DUPLICATE_BANK_ACCOUNT', { detail: `account=${accountNumber}` })
}

/** จำนวนรายการเงินที่ผูกบัญชีนี้ (`13` §9) — รอบจ่ายเงิน + รายการเดินบัญชี */
export async function countBankAccountUsage(
  organizationId: string,
  accountId: string,
): Promise<{ payoutBatches: number; bankTransactions: number; total: number }> {
  const [payoutBatches, bankTransactions] = await Promise.all([
    prisma.payoutBatch.count({ where: { organizationId, bankAccountId: accountId } }),
    prisma.bankTransaction.count({ where: { organizationId, bankAccountId: accountId } }),
  ])
  return { payoutBatches, bankTransactions, total: payoutBatches + bankTransactions }
}

function toWriteData(values: BankAccountValues) {
  const normalized = normalizeBankAccountValues(values)
  return {
    bankName: normalized.bankName,
    accountName: normalized.accountName,
    accountNumber: normalized.accountNumber,
    accountType: normalized.accountType,
    usage: normalized.usage,
    statementFormat: normalized.statementFormat,
    paymentFileFormat: normalized.paymentFileFormat,
    autoMatchToleranceDays: normalized.autoMatchToleranceDays,
    isPrimary: normalized.isPrimary,
  }
}

/** บัญชีหลักมีได้บัญชีเดียวต่อองค์กร — ตั้งใหม่แล้วต้องปลดของเดิมในทรานแซกชันเดียวกัน */
async function demoteOtherPrimaries(
  tx: SettingsTxClient,
  organizationId: string,
  exceptId?: string,
): Promise<void> {
  await tx.bankAccount.updateMany({
    where: { organizationId, isPrimary: true, ...(exceptId === undefined ? {} : { NOT: { id: exceptId } }) },
    data: { isPrimary: false },
  })
}

export async function createBankAccount(
  context: SettingsMutationContext,
  values: BankAccountValues,
): Promise<BankAccountDto> {
  const organizationId = context.actor.organizationId
  const normalized = normalizeBankAccountValues(values)
  await assertAccountNumberAvailable(organizationId, normalized.accountNumber)

  const created = await prisma.$transaction(async (tx) => {
    if (normalized.isPrimary) await demoteOtherPrimaries(tx, organizationId)

    const row = await tx.bankAccount.create({
      data: { organizationId, ...toWriteData(values), createdBy: context.actor.id },
      select: accountSelect,
    })

    await emitAudit(
      {
        organizationId,
        actorId: context.actor.id,
        actorRole: context.actor.roleName,
        action: 'create',
        targetType: TARGET,
        targetId: row.id,
        after: toBankAccountAuditPayload(normalized),
        reason: context.reason,
        ipAddress: context.meta.ipAddress,
        userAgent: context.meta.userAgent,
      },
      tx,
    )

    return row
  })

  return toDto(created)
}

export async function updateBankAccount(
  context: SettingsMutationContext,
  current: BankAccountDto,
  values: BankAccountValues,
): Promise<BankAccountDto> {
  const organizationId = context.actor.organizationId
  const normalized = normalizeBankAccountValues(values)
  await assertAccountNumberAvailable(organizationId, normalized.accountNumber, current.id)

  const updated = await prisma.$transaction(async (tx) => {
    if (normalized.isPrimary) await demoteOtherPrimaries(tx, organizationId, current.id)

    const row = await tx.bankAccount.update({
      where: { id: current.id },
      data: toWriteData(values),
      select: accountSelect,
    })

    await emitAudit(
      {
        organizationId,
        actorId: context.actor.id,
        actorRole: context.actor.roleName,
        action: 'update',
        targetType: TARGET,
        targetId: row.id,
        before: toBankAccountAuditPayload(normalizeBankAccountValues(toValues(current))),
        after: toBankAccountAuditPayload(normalized),
        reason: context.reason,
        ipAddress: context.meta.ipAddress,
        userAgent: context.meta.userAgent,
      },
      tx,
    )

    return row
  })

  return toDto(updated)
}

/**
 * ปิดใช้งานบัญชี = soft delete — **บัญชีที่มีรายการเงินผูกอยู่ปิดไม่ได้** (`13` §9)
 * ให้เปลี่ยน `usage` แทนถ้าต้องการหยุดใช้บัญชีในบางทาง
 */
export async function deleteBankAccount(
  context: SettingsMutationContext,
  current: BankAccountDto,
): Promise<BankAccountDto> {
  const organizationId = context.actor.organizationId
  const usage = await countBankAccountUsage(organizationId, current.id)
  if (usage.total > 0) {
    throw new SettingsError('BANK_ACCOUNT_IN_USE', {
      detail: `bank_account=${current.id} payout_batches=${usage.payoutBatches} bank_transactions=${usage.bankTransactions}`,
      context: { payoutBatches: usage.payoutBatches, bankTransactions: usage.bankTransactions },
    })
  }

  const updated = await prisma.$transaction(async (tx) => {
    const row = await tx.bankAccount.update({
      where: { id: current.id },
      data: { deletedAt: new Date(), isPrimary: false },
      select: accountSelect,
    })

    await emitAudit(
      {
        organizationId,
        actorId: context.actor.id,
        actorRole: context.actor.roleName,
        action: 'delete',
        targetType: TARGET,
        targetId: row.id,
        before: toBankAccountAuditPayload(normalizeBankAccountValues(toValues(current))),
        reason: context.reason,
        ipAddress: context.meta.ipAddress,
        userAgent: context.meta.userAgent,
        diffOnly: false,
      },
      tx,
    )

    return row
  })

  return toDto(updated)
}
