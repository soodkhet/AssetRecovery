import { emitAudit } from '@/lib/audit/audit'
import { Prisma } from '@/lib/generated/prisma/client'
import { prisma } from '@/lib/prisma'
import { SettingsError } from '@/lib/settings/errors'
import { statusFilter, toIso, type SettingsMutationContext } from '@/lib/settings/queries/shared'
import {
  assertWhtPctValid,
  normalizeTaxProfileValues,
  toTaxProfileAuditPayload,
  type TaxProfileValues,
  type WhtBasis,
} from '@/lib/settings/tax-profile'
import type { TaxProfileDto } from '@/lib/settings/types'

/**
 * กติกาภาษี Payee (`13` §6.4) — ชั้น DB
 *
 * `13` §9/§12: แก้ Tax Profile ต้อง **audit + reason เสมอ** (กระทบยอดภาษีทุกรายการที่ใช้ profile นั้น)
 * · profile ที่ถูกผูกกับ payee/รายการจ่ายแล้ว **ลบไม่ได้** (`TAX_PROFILE_IN_USE`) เพราะยอดภาษีเดิม
 *   ต้องอ้างอิงกลับได้ (`payout_batch_items` snapshot `tax_profile_id` — `92` §7.1)
 */

const TARGET = 'tax_profiles'

const profileSelect = {
  id: true,
  name: true,
  whtPct: true,
  whtBasis: true,
  whtMinThresholdSatang: true,
  incomeType: true,
  filingForm: true,
  deletedAt: true,
  updatedAt: true,
} as const

type ProfileRow = Prisma.TaxProfileGetPayload<{ select: typeof profileSelect }>

function toDto(row: ProfileRow): TaxProfileDto {
  return {
    id: row.id,
    name: row.name,
    whtPct: row.whtPct.toNumber(),
    whtBasis: row.whtBasis === 'gross_amount' ? 'gross_amount' : 'before_vat',
    whtMinThresholdSatang: row.whtMinThresholdSatang,
    incomeType: row.incomeType,
    filingForm: row.filingForm,
    isActive: row.deletedAt === null,
    updatedAt: toIso(row.updatedAt),
  }
}

function toValues(dto: TaxProfileDto): TaxProfileValues {
  return {
    name: dto.name,
    whtPct: dto.whtPct,
    whtBasis: dto.whtBasis as WhtBasis,
    whtMinThresholdSatang: dto.whtMinThresholdSatang,
    incomeType: dto.incomeType,
    filingForm: dto.filingForm,
  }
}

export async function listTaxProfiles(
  organizationId: string,
  status: 'active' | 'inactive' | 'all' = 'active',
): Promise<TaxProfileDto[]> {
  const rows = await prisma.taxProfile.findMany({
    where: { organizationId, ...statusFilter(status) },
    select: profileSelect,
    orderBy: { name: 'asc' },
  })
  return rows.map(toDto)
}

export async function getTaxProfile(organizationId: string, profileId: string): Promise<TaxProfileDto> {
  const row = await prisma.taxProfile.findFirst({ where: { id: profileId, organizationId }, select: profileSelect })
  if (!row) throw new SettingsError('TAX_PROFILE_NOT_FOUND', { detail: `tax_profile=${profileId}` })
  return toDto(row)
}

async function assertNameAvailable(organizationId: string, name: string, exceptId?: string): Promise<void> {
  const duplicate = await prisma.taxProfile.findFirst({
    where: { organizationId, name, ...(exceptId === undefined ? {} : { NOT: { id: exceptId } }) },
    select: { id: true },
  })
  if (duplicate) throw new SettingsError('DUPLICATE_TAX_PROFILE_NAME', { detail: `name=${name}` })
}

/** จำนวนที่อ้าง profile นี้อยู่ — payee ที่ผูกไว้ + รายการจ่ายที่ snapshot ไปแล้ว */
export async function countTaxProfileUsage(
  organizationId: string,
  profileId: string,
): Promise<{ payeeProfiles: number; payoutBatchItems: number; total: number }> {
  const [payeeProfiles, payoutBatchItems] = await Promise.all([
    prisma.payeeProfile.count({ where: { organizationId, taxProfileId: profileId } }),
    prisma.payoutBatchItem.count({ where: { organizationId, taxProfileId: profileId } }),
  ])
  return { payeeProfiles, payoutBatchItems, total: payeeProfiles + payoutBatchItems }
}

function toWriteData(values: TaxProfileValues) {
  const normalized = normalizeTaxProfileValues(values)
  return {
    name: normalized.name,
    // NUMERIC(5,2) — ส่งเป็น Decimal ที่ปัดเป็น 2 ตำแหน่งแล้ว (ห้ามปล่อย float เข้า DB)
    whtPct: new Prisma.Decimal(normalized.whtPct.toFixed(2)),
    whtBasis: normalized.whtBasis,
    whtMinThresholdSatang: normalized.whtMinThresholdSatang,
    incomeType: normalized.incomeType,
    filingForm: normalized.filingForm,
  }
}

export async function createTaxProfile(
  context: SettingsMutationContext,
  values: TaxProfileValues,
): Promise<TaxProfileDto> {
  const organizationId = context.actor.organizationId
  const normalized = normalizeTaxProfileValues(values)
  assertWhtPctValid(normalized.whtPct)
  await assertNameAvailable(organizationId, normalized.name)

  const created = await prisma.$transaction(async (tx) => {
    const row = await tx.taxProfile.create({
      data: { organizationId, ...toWriteData(values), createdBy: context.actor.id },
      select: profileSelect,
    })

    await emitAudit(
      {
        organizationId,
        actorId: context.actor.id,
        actorRole: context.actor.roleName,
        action: 'create',
        targetType: TARGET,
        targetId: row.id,
        after: toTaxProfileAuditPayload(normalized),
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

export async function updateTaxProfile(
  context: SettingsMutationContext,
  current: TaxProfileDto,
  values: TaxProfileValues,
): Promise<TaxProfileDto> {
  const organizationId = context.actor.organizationId
  const normalized = normalizeTaxProfileValues(values)
  assertWhtPctValid(normalized.whtPct)
  await assertNameAvailable(organizationId, normalized.name, current.id)

  const updated = await prisma.$transaction(async (tx) => {
    const row = await tx.taxProfile.update({
      where: { id: current.id },
      data: toWriteData(values),
      select: profileSelect,
    })

    await emitAudit(
      {
        organizationId,
        actorId: context.actor.id,
        actorRole: context.actor.roleName,
        action: 'update',
        targetType: TARGET,
        targetId: row.id,
        before: toTaxProfileAuditPayload(toValues(current)),
        after: toTaxProfileAuditPayload(normalized),
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

export async function deleteTaxProfile(
  context: SettingsMutationContext,
  current: TaxProfileDto,
): Promise<TaxProfileDto> {
  const organizationId = context.actor.organizationId
  const usage = await countTaxProfileUsage(organizationId, current.id)
  if (usage.total > 0) {
    throw new SettingsError('TAX_PROFILE_IN_USE', {
      detail: `tax_profile=${current.id} payees=${usage.payeeProfiles} payout_items=${usage.payoutBatchItems}`,
      context: { payeeProfiles: usage.payeeProfiles, payoutBatchItems: usage.payoutBatchItems },
    })
  }

  const updated = await prisma.$transaction(async (tx) => {
    const row = await tx.taxProfile.update({
      where: { id: current.id },
      data: { deletedAt: new Date() },
      select: profileSelect,
    })

    await emitAudit(
      {
        organizationId,
        actorId: context.actor.id,
        actorRole: context.actor.roleName,
        action: 'delete',
        targetType: TARGET,
        targetId: row.id,
        before: toTaxProfileAuditPayload(toValues(current)),
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
