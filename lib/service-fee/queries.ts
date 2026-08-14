import { Prisma } from '@/lib/generated/prisma/client'
import { emitAudit } from '@/lib/audit/audit'
import type { RequestMeta } from '@/lib/auth/request-meta'
import type { SessionUser } from '@/lib/auth/types'
import { ServiceFeeError } from '@/lib/service-fee/errors'
import {
  assertRateRange,
  normalizeTemplateValues,
  planNextTemplateVersion,
  type ServiceFeeTemplateValues,
  type ServiceFeeTemplateVersion,
} from '@/lib/service-fee/template'
import type { ServiceFeeTemplateListQuery } from '@/lib/service-fee/schemas'
import { prisma } from '@/lib/prisma'

/**
 * ชั้นข้อมูลของโมดูลเทมเพลตค่าบริการ (ไฟล์ 12) — **แยกจาก pure logic** (`lib/service-fee/template.ts`)
 *
 * โครงเดียวกับแผนค่าตอบแทน: 1 เทมเพลต = แถวชื่อเดียวกันหลายเวอร์ชัน · PATCH สร้างแถวใหม่แล้วย้าย
 * `finance_companies.service_fee_template_id` มาชี้เวอร์ชันปัจจุบัน ⇒ เคสที่ยังไม่ approved
 * เห็นค่าใหม่ทันที ส่วนเคสที่ approved ไปแล้วใช้ snapshot ของตัวเอง (`12` §9 · `10` §9.2)
 */

const templateSelect = {
  id: true,
  name: true,
  model: true,
  baseSatang: true,
  ratePct: true,
  basis: true,
  chargeOnFail: true,
  chargePerTrackingRound: true,
  version: true,
  isCurrent: true,
  deletedAt: true,
  updatedAt: true,
} as const

type TemplateRow = Prisma.ServiceFeeTemplateGetPayload<{ select: typeof templateSelect }>

export interface ServiceFeeTemplateRecord extends ServiceFeeTemplateVersion {
  isActive: boolean
  updatedAt: string
}

export interface ServiceFeeTemplateListItem extends ServiceFeeTemplateRecord {
  /** จำนวนบริษัทไฟแนนซ์ที่ผูกเวอร์ชันนี้อยู่ — ยาม `TEMPLATE_IN_USE` (`12` §10) */
  companyCount: number
}

function toRecord(row: TemplateRow): ServiceFeeTemplateRecord {
  return {
    id: row.id,
    name: row.name,
    model: row.model,
    baseSatang: row.baseSatang,
    ratePct: row.ratePct.toNumber(),
    basis: row.basis,
    chargeOnFail: row.chargeOnFail,
    chargePerTrackingRound: row.chargePerTrackingRound,
    version: row.version,
    isCurrent: row.isCurrent,
    isActive: row.deletedAt === null,
    updatedAt: row.updatedAt.toISOString(),
  }
}

/** ค่าที่บันทึกลง audit — ชื่อคอลัมน์ snake_case ตามตารางจริง (`12` §13) */
function toAuditPayload(values: ServiceFeeTemplateValues, version: number): Record<string, unknown> {
  const normalized = normalizeTemplateValues(values)
  return {
    name: normalized.name,
    model: normalized.model,
    base_satang: normalized.baseSatang,
    rate_pct: normalized.ratePct,
    basis: normalized.basis,
    charge_on_fail: normalized.chargeOnFail,
    charge_per_tracking_round: normalized.chargePerTrackingRound,
    version,
  }
}

function toCreateData(values: ServiceFeeTemplateValues) {
  const normalized = normalizeTemplateValues(values)
  return {
    name: normalized.name,
    model: normalized.model,
    baseSatang: normalized.baseSatang,
    ratePct: new Prisma.Decimal(normalized.ratePct.toFixed(2)),
    basis: normalized.basis,
    chargeOnFail: normalized.chargeOnFail,
    chargePerTrackingRound: normalized.chargePerTrackingRound,
  }
}

export async function listServiceFeeTemplates(
  organizationId: string,
  query: ServiceFeeTemplateListQuery,
): Promise<ServiceFeeTemplateListItem[]> {
  const rows = await prisma.serviceFeeTemplate.findMany({
    where: {
      organizationId,
      isCurrent: true,
      model: query.model,
      ...(query.status === 'all' ? {} : query.status === 'active' ? { deletedAt: null } : { NOT: { deletedAt: null } }),
    },
    select: { ...templateSelect, _count: { select: { financeCompanies: { where: { deletedAt: null } } } } },
    orderBy: [{ model: 'asc' }, { name: 'asc' }],
  })

  return rows.map((row) => {
    const { _count, ...rest } = row
    return { ...toRecord(rest), companyCount: _count.financeCompanies }
  })
}

export async function getServiceFeeTemplate(
  organizationId: string,
  templateId: string,
): Promise<ServiceFeeTemplateRecord> {
  const row = await prisma.serviceFeeTemplate.findFirst({
    where: { id: templateId, organizationId },
    select: templateSelect,
  })
  if (!row) throw new ServiceFeeError('TEMPLATE_NOT_FOUND', { detail: `template=${templateId}` })
  return toRecord(row)
}

/** ประวัติทุกเวอร์ชันของเทมเพลตเดียวกัน — เรียงใหม่→เก่า */
export async function listServiceFeeTemplateVersions(
  organizationId: string,
  templateId: string,
): Promise<ServiceFeeTemplateRecord[]> {
  const template = await getServiceFeeTemplate(organizationId, templateId)
  const rows = await prisma.serviceFeeTemplate.findMany({
    where: { organizationId, name: template.name },
    select: templateSelect,
    orderBy: { version: 'desc' },
  })
  return rows.map(toRecord)
}

interface MutationContext {
  actor: SessionUser
  meta: RequestMeta
  reason: string
}

async function assertNameAvailable(organizationId: string, name: string, exceptName?: string): Promise<void> {
  if (exceptName !== undefined && exceptName === name) return
  const duplicate = await prisma.serviceFeeTemplate.findFirst({
    where: { organizationId, name },
    select: { id: true },
  })
  if (duplicate) throw new ServiceFeeError('DUPLICATE_TEMPLATE_NAME', { detail: `name=${name}` })
}

export async function createServiceFeeTemplate(
  context: MutationContext,
  values: ServiceFeeTemplateValues,
): Promise<ServiceFeeTemplateRecord> {
  const organizationId = context.actor.organizationId
  assertRateRange(values.ratePct)
  await assertNameAvailable(organizationId, values.name)

  const created = await prisma.$transaction(async (tx) => {
    const template = await tx.serviceFeeTemplate.create({
      data: {
        organizationId,
        ...toCreateData(values),
        version: 1,
        isCurrent: true,
        createdBy: context.actor.id,
      },
      select: templateSelect,
    })

    await emitAudit(
      {
        organizationId,
        actorId: context.actor.id,
        actorRole: context.actor.roleName,
        action: 'create',
        targetType: 'service_fee_templates',
        targetId: template.id,
        after: toAuditPayload(values, 1),
        reason: context.reason,
        ipAddress: context.meta.ipAddress,
        userAgent: context.meta.userAgent,
      },
      tx,
    )

    return template
  })

  return toRecord(created)
}

/**
 * PATCH = **สร้างเวอร์ชันใหม่ ไม่ overwrite ของเดิม** (`12` §9)
 * ปิดเวอร์ชันเดิม → สร้างเวอร์ชันใหม่ → ย้ายบริษัทมาผูก → audit ทั้งหมดใน `$transaction` เดียว
 */
export async function updateServiceFeeTemplate(
  context: MutationContext,
  current: ServiceFeeTemplateRecord,
  values: ServiceFeeTemplateValues,
): Promise<ServiceFeeTemplateRecord> {
  const organizationId = context.actor.organizationId
  if (!current.isCurrent) throw new ServiceFeeError('VERSION_NOT_CURRENT', { detail: `template=${current.id}` })

  assertRateRange(values.ratePct)

  const next = planNextTemplateVersion(current, values)
  if (next === null) return current

  await assertNameAvailable(organizationId, next.values.name, current.name)

  const updated = await prisma.$transaction(async (tx) => {
    await tx.serviceFeeTemplate.update({
      where: { id: current.id },
      data: { isCurrent: false, updatedBy: context.actor.id },
    })

    // เปลี่ยนชื่อ = เปลี่ยนทั้งชุด — ประวัติเวอร์ชันจับกลุ่มด้วย `name` จึงต้องตรงกันทุกแถว
    if (next.values.name !== current.name) {
      await tx.serviceFeeTemplate.updateMany({
        where: { organizationId, name: current.name },
        data: { name: next.values.name, updatedBy: context.actor.id },
      })
    }

    const template = await tx.serviceFeeTemplate.create({
      data: {
        organizationId,
        ...toCreateData(next.values),
        version: next.version,
        isCurrent: true,
        createdBy: context.actor.id,
      },
      select: templateSelect,
    })

    // บริษัทต้องชี้เวอร์ชันปัจจุบันเสมอ ⇒ เคสที่ยังไม่ approved เห็นค่าใหม่ทันที (`12` §9)
    await tx.financeCompany.updateMany({
      where: { organizationId, serviceFeeTemplateId: current.id },
      data: { serviceFeeTemplateId: template.id, updatedBy: context.actor.id },
    })

    await emitAudit(
      {
        organizationId,
        actorId: context.actor.id,
        actorRole: context.actor.roleName,
        action: 'update',
        targetType: 'service_fee_templates',
        targetId: template.id,
        before: toAuditPayload(current, current.version),
        after: toAuditPayload(next.values, next.version),
        reason: context.reason,
        ipAddress: context.meta.ipAddress,
        userAgent: context.meta.userAgent,
        diffOnly: false,
      },
      tx,
    )

    return template
  })

  return toRecord(updated)
}

/** ชื่อบริษัทที่ยังผูกเทมเพลตชุดนี้อยู่ (ทุกเวอร์ชัน) — `12` §11 ให้ reject พร้อมรายชื่อบริษัท */
export async function listCompaniesUsingTemplate(
  organizationId: string,
  templateName: string,
): Promise<string[]> {
  const rows = await prisma.financeCompany.findMany({
    where: {
      organizationId,
      deletedAt: null,
      serviceFeeTemplate: { organizationId, name: templateName },
    },
    select: { name: true },
    orderBy: { name: 'asc' },
  })
  return rows.map((row) => row.name)
}

/**
 * ปิด/เปิดใช้งานเทมเพลต — `active` ของ `12` §7.1 เก็บที่ `deleted_at` (`02` §2.4 ไม่มีคอลัมน์แยก)
 * ปิดเทมเพลตที่มีบริษัทผูกอยู่ไม่ได้ (`12` §10) — reject พร้อมรายชื่อบริษัทตาม `12` §11
 */
export async function setServiceFeeTemplateActive(
  context: MutationContext,
  current: ServiceFeeTemplateRecord,
  isActive: boolean,
): Promise<ServiceFeeTemplateRecord> {
  const organizationId = context.actor.organizationId

  if (!isActive) {
    const companies = await listCompaniesUsingTemplate(organizationId, current.name)
    if (companies.length > 0) {
      throw new ServiceFeeError('TEMPLATE_IN_USE', {
        detail: `template=${current.name} companies=${companies.length}`,
        context: { companies },
      })
    }
  }

  const deletedAt = isActive ? null : new Date()

  await prisma.$transaction(async (tx) => {
    await tx.serviceFeeTemplate.updateMany({
      where: { organizationId, name: current.name },
      data: { deletedAt, updatedBy: context.actor.id },
    })

    await emitAudit(
      {
        organizationId,
        actorId: context.actor.id,
        actorRole: context.actor.roleName,
        action: isActive ? 'update' : 'delete',
        targetType: 'service_fee_templates',
        targetId: current.id,
        before: { name: current.name, is_active: current.isActive },
        after: { name: current.name, is_active: isActive },
        reason: context.reason,
        ipAddress: context.meta.ipAddress,
        userAgent: context.meta.userAgent,
        diffOnly: false,
      },
      tx,
    )
  })

  return { ...current, isActive }
}
