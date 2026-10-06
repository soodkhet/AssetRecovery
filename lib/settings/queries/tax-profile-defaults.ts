import { emitAudit } from '@/lib/audit/audit'
import type { PayeeTaxProfileValues } from '@/lib/finance/wht-calc'
import type { Prisma } from '@/lib/generated/prisma/client'
import { prisma } from '@/lib/prisma'
import { SettingsError } from '@/lib/settings/errors'
import { toIso, type SettingsMutationContext } from '@/lib/settings/queries/shared'
import {
  TAX_PROFILE_DEFAULT_SLOTS,
  emptyTaxProfileDefaults,
  type TaxProfileDefaultSlot,
  type TaxProfileDefaults,
} from '@/lib/settings/tax-profile-defaults'
import type { WhtBasis } from '@/lib/settings/tax-profile'
import type { TaxProfileDefaultSlotDto, TaxProfileDefaultsDto, TaxProfileDefaultsOverviewDto } from '@/lib/settings/types'

/**
 * Tax Profile ค่าเริ่มต้นตามประเภทผู้รับ (มติ PO 06/10/2569 U121 · `13` §6.4.3) — ชั้น DB
 *
 * - **insert-only** (`tax_profile_default_history`): ไม่มี PATCH/DELETE — เปลี่ยน = เพิ่มชุดใหม่ ·
 *   แถวที่บันทึกล่าสุดมีผลทันทีกับรอบจ่าย/คิวอนุมัติที่คิดหลังบันทึก
 * - สิทธิ์ = `manage_tax_profiles` (ล็อก Superadmin) · เหตุผลบังคับ + audit before/after (กระทบภาษี)
 * - อ้างได้เฉพาะ Tax Profile ที่ใช้งานอยู่ในองค์กรเดียวกัน (`TAX_PROFILE_NOT_FOUND`)
 * - รอบจ่ายเรียก `loadTaxProfileDefaults()` แล้ว snapshot id ของชุดลง `payout_batches.tax_profile_default_id`
 *   + Tax Profile ที่ใช้จริงลง `payout_batch_items.tax_profile_id` (ไม่คิดย้อนหลังจากค่าปัจจุบัน)
 */

const TARGET = 'tax_profile_default_history'

const slotProfileSelect = {
  id: true,
  name: true,
  whtPct: true,
  whtBasis: true,
  whtMinThresholdSatang: true,
  filingForm: true,
} as const

const rowSelect = {
  id: true,
  reason: true,
  createdAt: true,
  createdByUser: { select: { fullName: true } },
  inhouseIndividual: { select: slotProfileSelect },
  inhouseCorporate: { select: slotProfileSelect },
  outsourceIndividual: { select: slotProfileSelect },
  outsourceCorporate: { select: slotProfileSelect },
} as const

type DefaultsRow = Prisma.TaxProfileDefaultHistoryGetPayload<{ select: typeof rowSelect }>
type SlotProfileRow = NonNullable<DefaultsRow['inhouseIndividual']>

/** client ที่อ่านได้ — `prisma` หรือ tx client */
type DefaultsReadClient = Pick<typeof prisma, 'taxProfileDefaultHistory'>

function slotDto(profile: SlotProfileRow | null): TaxProfileDefaultSlotDto | null {
  if (profile === null) return null
  return { taxProfileId: profile.id, name: profile.name, whtPct: profile.whtPct.toNumber(), filingForm: profile.filingForm }
}

function toDto(row: DefaultsRow): TaxProfileDefaultsDto {
  return {
    id: row.id,
    slots: {
      inhouseIndividual: slotDto(row.inhouseIndividual),
      inhouseCorporate: slotDto(row.inhouseCorporate),
      outsourceIndividual: slotDto(row.outsourceIndividual),
      outsourceCorporate: slotDto(row.outsourceCorporate),
    },
    reason: row.reason,
    createdAt: toIso(row.createdAt),
    createdByName: row.createdByUser.fullName,
  }
}

async function loadLatestRow(client: DefaultsReadClient, organizationId: string): Promise<DefaultsRow | null> {
  return client.taxProfileDefaultHistory.findFirst({
    where: { organizationId },
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    select: rowSelect,
  })
}

/** Tax Profile ของช่องหนึ่งพร้อมค่าที่ใช้คิดภาษี */
export interface TaxProfileDefaultResolved {
  taxProfileId: string
  values: PayeeTaxProfileValues
}

export interface LoadedTaxProfileDefaults {
  /** id ของชุดที่มีผล · `null` = ยังไม่เคยตั้ง */
  id: string | null
  profiles: TaxProfileDefaults<TaxProfileDefaultResolved>
}

function resolvedOf(profile: SlotProfileRow | null): TaxProfileDefaultResolved | null {
  if (profile === null) return null
  return {
    taxProfileId: profile.id,
    values: {
      whtPct: profile.whtPct.toNumber(),
      whtBasis: (profile.whtBasis === 'gross_amount' ? 'gross_amount' : 'before_vat') as WhtBasis,
      whtMinThresholdSatang: profile.whtMinThresholdSatang,
    },
  }
}

/** ชุดที่มีผลอยู่ (บันทึกล่าสุด) — ใช้คิด WHT ของคิวอนุมัติ/รอบจ่าย/ไฟล์ค้างจ่าย */
export async function loadTaxProfileDefaults(
  organizationId: string,
  client: DefaultsReadClient = prisma,
): Promise<LoadedTaxProfileDefaults> {
  const row = await loadLatestRow(client, organizationId)
  if (row === null) return { id: null, profiles: emptyTaxProfileDefaults() }
  return {
    id: row.id,
    profiles: {
      inhouseIndividual: resolvedOf(row.inhouseIndividual),
      inhouseCorporate: resolvedOf(row.inhouseCorporate),
      outsourceIndividual: resolvedOf(row.outsourceIndividual),
      outsourceCorporate: resolvedOf(row.outsourceCorporate),
    },
  }
}

export async function getTaxProfileDefaultsOverview(organizationId: string): Promise<TaxProfileDefaultsOverviewDto> {
  const rows = await prisma.taxProfileDefaultHistory.findMany({
    where: { organizationId },
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    select: rowSelect,
  })
  const history = rows.map(toDto)
  return { current: history[0] ?? null, history }
}

/** ช่องที่ชุดปัจจุบันอ้าง Tax Profile นี้ — ใช้กันปิดใช้งาน profile ที่ยังเป็นค่าเริ่มต้นอยู่ */
export async function countCurrentDefaultSlotsUsing(organizationId: string, taxProfileId: string): Promise<number> {
  const row = await loadLatestRow(prisma, organizationId)
  if (row === null) return 0
  return TAX_PROFILE_DEFAULT_SLOTS.filter((slot) => row[slot]?.id === taxProfileId).length
}

function auditPayload(slots: TaxProfileDefaults<string>): Record<string, string | null> {
  return {
    inhouse_individual_tax_profile_id: slots.inhouseIndividual,
    inhouse_corporate_tax_profile_id: slots.inhouseCorporate,
    outsource_individual_tax_profile_id: slots.outsourceIndividual,
    outsource_corporate_tax_profile_id: slots.outsourceCorporate,
  }
}

function idsOf(row: DefaultsRow | null): TaxProfileDefaults<string> {
  const ids = emptyTaxProfileDefaults<string>()
  if (row === null) return ids
  for (const slot of TAX_PROFILE_DEFAULT_SLOTS) ids[slot] = row[slot]?.id ?? null
  return ids
}

/** บันทึกชุดใหม่ (insert-only) — ทุกช่องที่ระบุต้องเป็น Tax Profile ที่ใช้งานอยู่ขององค์กร */
export async function createTaxProfileDefaults(
  context: SettingsMutationContext,
  slots: TaxProfileDefaults<string>,
): Promise<TaxProfileDefaultsDto> {
  const organizationId = context.actor.organizationId
  const referenced = [...new Set(TAX_PROFILE_DEFAULT_SLOTS.map((slot) => slots[slot]).filter((id): id is string => id !== null))]
  if (referenced.length > 0) {
    const found = await prisma.taxProfile.findMany({
      where: { organizationId, id: { in: referenced }, deletedAt: null },
      select: { id: true },
    })
    const foundIds = new Set(found.map((profile) => profile.id))
    const missing = referenced.filter((id) => !foundIds.has(id))
    if (missing.length > 0) {
      throw new SettingsError('TAX_PROFILE_NOT_FOUND', { detail: `tax_profile=${missing.join(',')}` })
    }
  }

  const created = await prisma.$transaction(async (tx) => {
    const before = await loadLatestRow(tx, organizationId)
    const data: Record<`${TaxProfileDefaultSlot}TaxProfileId`, string | null> = {
      inhouseIndividualTaxProfileId: slots.inhouseIndividual,
      inhouseCorporateTaxProfileId: slots.inhouseCorporate,
      outsourceIndividualTaxProfileId: slots.outsourceIndividual,
      outsourceCorporateTaxProfileId: slots.outsourceCorporate,
    }
    const row = await tx.taxProfileDefaultHistory.create({
      data: { organizationId, ...data, reason: context.reason, createdBy: context.actor.id },
      select: rowSelect,
    })

    await emitAudit(
      {
        organizationId,
        actorId: context.actor.id,
        actorRole: context.actor.roleName,
        action: 'create',
        targetType: TARGET,
        targetId: row.id,
        before: auditPayload(idsOf(before)),
        after: auditPayload(slots),
        reason: context.reason,
        ipAddress: context.meta.ipAddress,
        userAgent: context.meta.userAgent,
        diffOnly: false,
      },
      tx,
    )
    return row
  })

  return toDto(created)
}
