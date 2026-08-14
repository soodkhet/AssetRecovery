import { emitAudit } from '@/lib/audit/audit'
import type { Prisma } from '@/lib/generated/prisma/client'
import { prisma } from '@/lib/prisma'
import { describeDueRule, normalizeCycleValues, toCycleAuditPayload, type CycleValues } from '@/lib/settings/cycles'
import { SettingsError } from '@/lib/settings/errors'
import { statusFilter, toIso, type SettingsMutationContext } from '@/lib/settings/queries/shared'
import type { CycleListQuery } from '@/lib/settings/schemas'
import type { CycleDto } from '@/lib/settings/types'

/** รอบบิล/รอบจ่าย (`13` §6.1) — ชั้น DB · pure logic อยู่ `lib/settings/cycles.ts` */

const TARGET = 'billing_payout_cycles'

const cycleSelect = {
  id: true,
  name: true,
  type: true,
  cutoffRuleType: true,
  cutoffDates: true,
  cutoffText: true,
  dueRuleType: true,
  dueRuleValue: true,
  dueRule: true,
  scope: true,
  deletedAt: true,
  updatedAt: true,
} as const

type CycleRow = Prisma.BillingPayoutCycleGetPayload<{ select: typeof cycleSelect }>

function toDto(row: CycleRow): CycleDto {
  return {
    id: row.id,
    name: row.name,
    type: row.type,
    cutoffRuleType: row.cutoffRuleType,
    cutoffDates: row.cutoffDates,
    cutoffText: row.cutoffText,
    dueRuleType: row.dueRuleType,
    dueRuleValue: row.dueRuleValue,
    dueRule: row.dueRule,
    scope: row.scope,
    isActive: row.deletedAt === null,
    updatedAt: toIso(row.updatedAt),
  }
}

function toValues(dto: CycleDto): CycleValues {
  return {
    name: dto.name,
    type: dto.type,
    cutoffRuleType: dto.cutoffRuleType,
    cutoffDates: dto.cutoffDates,
    cutoffText: dto.cutoffText,
    dueRuleType: dto.dueRuleType,
    dueRuleValue: dto.dueRuleValue,
    scope: dto.scope,
  }
}

export async function listCycles(organizationId: string, query: CycleListQuery): Promise<CycleDto[]> {
  const rows = await prisma.billingPayoutCycle.findMany({
    where: { organizationId, type: query.type, ...statusFilter(query.status) },
    select: cycleSelect,
    orderBy: [{ type: 'asc' }, { name: 'asc' }],
  })
  return rows.map(toDto)
}

export async function getCycle(organizationId: string, cycleId: string): Promise<CycleDto> {
  const row = await prisma.billingPayoutCycle.findFirst({
    where: { id: cycleId, organizationId },
    select: cycleSelect,
  })
  if (!row) throw new SettingsError('CYCLE_NOT_FOUND', { detail: `cycle=${cycleId}` })
  return toDto(row)
}

/** ชื่อรอบต้องไม่ซ้ำในองค์กร — `02` §5 ไม่มี UNIQUE ให้ จึงกันที่ชั้นนี้ (`DUPLICATE_CYCLE_NAME`) */
async function assertNameAvailable(organizationId: string, name: string, exceptId?: string): Promise<void> {
  const duplicate = await prisma.billingPayoutCycle.findFirst({
    where: { organizationId, name, deletedAt: null, ...(exceptId === undefined ? {} : { NOT: { id: exceptId } }) },
    select: { id: true },
  })
  if (duplicate) throw new SettingsError('DUPLICATE_CYCLE_NAME', { detail: `name=${name}` })
}

function toWriteData(values: CycleValues) {
  const normalized = normalizeCycleValues(values)
  return {
    name: normalized.name,
    type: normalized.type,
    cutoffRuleType: normalized.cutoffRuleType,
    cutoffDates: normalized.cutoffDates,
    cutoffText: normalized.cutoffText,
    dueRuleType: normalized.dueRuleType,
    dueRuleValue: normalized.dueRuleValue,
    // label ประกอบจาก type+value เสมอ ไม่รับค่าที่ผู้ใช้พิมพ์ (A5 — ห้าม parse label มาคำนวณ)
    dueRule: describeDueRule(normalized),
    scope: normalized.scope,
  }
}

export async function createCycle(context: SettingsMutationContext, values: CycleValues): Promise<CycleDto> {
  const organizationId = context.actor.organizationId
  const normalized = normalizeCycleValues(values)
  await assertNameAvailable(organizationId, normalized.name)

  const created = await prisma.$transaction(async (tx) => {
    const row = await tx.billingPayoutCycle.create({
      data: { organizationId, ...toWriteData(values), createdBy: context.actor.id },
      select: cycleSelect,
    })

    await emitAudit(
      {
        organizationId,
        actorId: context.actor.id,
        actorRole: context.actor.roleName,
        action: 'create',
        targetType: TARGET,
        targetId: row.id,
        after: toCycleAuditPayload(normalized),
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

export async function updateCycle(
  context: SettingsMutationContext,
  current: CycleDto,
  values: CycleValues,
): Promise<CycleDto> {
  const organizationId = context.actor.organizationId
  const normalized = normalizeCycleValues(values)
  await assertNameAvailable(organizationId, normalized.name, current.id)

  const updated = await prisma.$transaction(async (tx) => {
    const row = await tx.billingPayoutCycle.update({
      where: { id: current.id },
      data: { ...toWriteData(values), updatedBy: context.actor.id },
      select: cycleSelect,
    })

    await emitAudit(
      {
        organizationId,
        actorId: context.actor.id,
        actorRole: context.actor.roleName,
        action: 'update',
        targetType: TARGET,
        targetId: row.id,
        before: toCycleAuditPayload(toValues(current)),
        after: toCycleAuditPayload(normalized),
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

/** ปิดใช้งานรอบ = soft delete (`02` §2.4) — ไม่มี hard delete เพราะเอกสารเก่าอ้างชื่อรอบไว้ */
export async function deleteCycle(context: SettingsMutationContext, current: CycleDto): Promise<CycleDto> {
  const organizationId = context.actor.organizationId

  const updated = await prisma.$transaction(async (tx) => {
    const row = await tx.billingPayoutCycle.update({
      where: { id: current.id },
      data: { deletedAt: new Date(), updatedBy: context.actor.id },
      select: cycleSelect,
    })

    await emitAudit(
      {
        organizationId,
        actorId: context.actor.id,
        actorRole: context.actor.roleName,
        action: 'delete',
        targetType: TARGET,
        targetId: row.id,
        before: toCycleAuditPayload(toValues(current)),
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
