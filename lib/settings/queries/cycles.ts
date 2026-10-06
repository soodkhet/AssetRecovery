import { emitAudit } from '@/lib/audit/audit'
import { FinanceCompanyError } from '@/lib/finance-companies/errors'
import type { CycleType } from '@/lib/generated/prisma/enums'
import type { Prisma } from '@/lib/generated/prisma/client'
import { prisma } from '@/lib/prisma'
import {
  describeDueRule,
  findOverlappingCycle,
  normalizeCycleValues,
  toCycleAuditPayload,
  type CycleValues,
} from '@/lib/settings/cycles'
import { SettingsError } from '@/lib/settings/errors'
import { statusFilter, toIso, type SettingsMutationContext, type SettingsTxClient } from '@/lib/settings/queries/shared'
import type { CycleListQuery } from '@/lib/settings/schemas'
import type { CycleDto } from '@/lib/settings/types'

/**
 * รอบบิล/รอบจ่าย (`13` §6.1) — ชั้น DB · pure logic อยู่ `lib/settings/cycles.ts`
 *
 * มติ PO U133: ขอบเขตเป็นค่าจริง (AR ทุกบริษัท/รายบริษัท · AP ทุกทีม/In-house/Outsource) และ **ห้ามซ้อน**
 * กับรอบชนิดเดียวกันที่ยังใช้งาน (`CYCLE_SCOPE_OVERLAP`) — ตรวจภายใต้ advisory lock ต่อองค์กร+ชนิด
 * ⇒ สองคนสร้างรอบพร้อมกันไม่หลุดซ้อนกัน
 */

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
  scopeKind: true,
  legacyScopeNote: true,
  deletedAt: true,
  updatedAt: true,
  companies: { select: { company: { select: { id: true, name: true } } } },
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
    scopeKind: row.scopeKind,
    companies: row.companies
      .map((link) => ({ id: link.company.id, name: link.company.name }))
      .sort((a, b) => a.name.localeCompare(b.name, 'th')),
    legacyScopeNote: row.legacyScopeNote,
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
    scopeKind: dto.scopeKind,
    companyIds: dto.companies.map((company) => company.id).sort(),
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

/** บริษัทที่เลือกต้องมีจริงในองค์กร (ไม่ leak ข้ามองค์กร — `COMPANY_NOT_FOUND`) */
async function assertCompaniesExist(organizationId: string, companyIds: readonly string[]): Promise<void> {
  if (companyIds.length === 0) return
  const found = await prisma.financeCompany.findMany({
    where: { organizationId, id: { in: [...companyIds] }, deletedAt: null },
    select: { id: true },
  })
  const known = new Set(found.map((row) => row.id))
  const missing = companyIds.find((id) => !known.has(id))
  if (missing !== undefined) throw new FinanceCompanyError('COMPANY_NOT_FOUND', { detail: `company=${missing}` })
}

/**
 * กันขอบเขตซ้อน (มติ PO U133) — เรียก **ใน** transaction หลังจอง advisory lock ของ (องค์กร, ชนิด) แล้ว
 * ⇒ ตัวที่สองที่สร้างพร้อมกันรอจนตัวแรก commit แล้วเห็นรอบของตัวแรก
 */
async function assertNoScopeOverlap(
  tx: SettingsTxClient,
  organizationId: string,
  values: CycleValues,
  exceptId?: string,
): Promise<void> {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`billing_payout_cycles:${organizationId}:${values.type}`}))`
  const others = await tx.billingPayoutCycle.findMany({
    where: {
      organizationId,
      type: values.type,
      deletedAt: null,
      ...(exceptId === undefined ? {} : { NOT: { id: exceptId } }),
    },
    select: { id: true, name: true, type: true, scopeKind: true, companies: { select: { companyId: true } } },
  })
  const overlap = findOverlappingCycle(
    values,
    others.map((other) => ({
      id: other.id,
      name: other.name,
      type: other.type,
      scopeKind: other.scopeKind,
      companyIds: other.companies.map((link) => link.companyId),
    })),
  )
  if (overlap !== null) {
    throw new SettingsError('CYCLE_SCOPE_OVERLAP', {
      detail: `cycle overlaps ${overlap.id}`,
      context: { overlappingCycleName: overlap.name },
    })
  }
}

function toWriteData(normalized: CycleValues) {
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
    scopeKind: normalized.scopeKind,
  }
}

async function writeCompanyLinks(
  tx: SettingsTxClient,
  organizationId: string,
  cycleId: string,
  companyIds: readonly string[],
): Promise<void> {
  await tx.billingCycleCompany.deleteMany({ where: { cycleId } })
  if (companyIds.length === 0) return
  await tx.billingCycleCompany.createMany({
    data: companyIds.map((companyId) => ({ organizationId, cycleId, companyId })),
  })
}

export async function createCycle(context: SettingsMutationContext, values: CycleValues): Promise<CycleDto> {
  const organizationId = context.actor.organizationId
  const normalized = normalizeCycleValues(values)
  await assertNameAvailable(organizationId, normalized.name)
  await assertCompaniesExist(organizationId, normalized.companyIds)

  const created = await prisma.$transaction(async (tx) => {
    await assertNoScopeOverlap(tx, organizationId, normalized)
    const row = await tx.billingPayoutCycle.create({
      data: { organizationId, ...toWriteData(normalized), createdBy: context.actor.id },
      select: { id: true },
    })
    await writeCompanyLinks(tx, organizationId, row.id, normalized.companyIds)

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

    return tx.billingPayoutCycle.findUniqueOrThrow({ where: { id: row.id }, select: cycleSelect })
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
  await assertCompaniesExist(organizationId, normalized.companyIds)

  const updated = await prisma.$transaction(async (tx) => {
    // รอบที่ปิดใช้งานแล้วไม่ต้องกันซ้อน (ไม่ถูกเลือกใช้) — กันเฉพาะรอบที่ยังใช้งาน
    if (current.isActive) await assertNoScopeOverlap(tx, organizationId, normalized, current.id)
    // เปลี่ยนชนิด AR ↔ AP ⇒ lock ของชนิดเดิมไม่เกี่ยว (รอบเดิมไม่นับตัวเองอยู่แล้ว)
    await tx.billingPayoutCycle.update({
      where: { id: current.id },
      data: { ...toWriteData(normalized), updatedBy: context.actor.id },
      select: { id: true },
    })
    await writeCompanyLinks(tx, organizationId, current.id, normalized.companyIds)

    await emitAudit(
      {
        organizationId,
        actorId: context.actor.id,
        actorRole: context.actor.roleName,
        action: 'update',
        targetType: TARGET,
        targetId: current.id,
        before: { ...toCycleAuditPayload(toValues(current)), legacy_scope_note: current.legacyScopeNote },
        after: { ...toCycleAuditPayload(normalized), legacy_scope_note: current.legacyScopeNote },
        reason: context.reason,
        ipAddress: context.meta.ipAddress,
        userAgent: context.meta.userAgent,
      },
      tx,
    )

    return tx.billingPayoutCycle.findUniqueOrThrow({ where: { id: current.id }, select: cycleSelect })
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
        before: { ...toCycleAuditPayload(toValues(current)), legacy_scope_note: current.legacyScopeNote },
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

/**
 * รอบที่ยังใช้งานของชนิดนั้น ในรูปที่ใช้ตัดสินขอบเขต — ใช้ตอนสร้างรอบวางบิล/รอบจ่ายเพื่อตรวจรอบที่เลือก
 */
export async function loadActiveCycleForScope(
  organizationId: string,
  cycleId: string,
  type: CycleType,
): Promise<{
  id: string
  name: string
  type: CycleType
  scopeKind: CycleValues['scopeKind']
  companyIds: string[]
  dueRuleType: CycleValues['dueRuleType']
  dueRuleValue: number | null
}> {
  const cycle = await prisma.billingPayoutCycle.findFirst({
    where: { id: cycleId, organizationId, deletedAt: null, type },
    select: {
      id: true,
      name: true,
      type: true,
      scopeKind: true,
      dueRuleType: true,
      dueRuleValue: true,
      companies: { select: { companyId: true } },
    },
  })
  if (cycle === null) throw new SettingsError('CYCLE_NOT_FOUND', { detail: `cycle=${cycleId} (type=${type})` })
  return {
    id: cycle.id,
    name: cycle.name,
    type: cycle.type,
    scopeKind: cycle.scopeKind,
    companyIds: cycle.companies.map((link) => link.companyId),
    dueRuleType: cycle.dueRuleType,
    dueRuleValue: cycle.dueRuleValue,
  }
}
