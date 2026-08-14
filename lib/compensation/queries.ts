import { Prisma } from '@/lib/generated/prisma/client'
import { emitAudit } from '@/lib/audit/audit'
import type { RequestMeta } from '@/lib/auth/request-meta'
import type { SessionUser } from '@/lib/auth/types'
import { CompensationError } from '@/lib/compensation/errors'
import {
  normalizePlanValues,
  planNextVersion,
  type CompensationPlanValues,
  type CompensationPlanVersion,
} from '@/lib/compensation/plan'
import type { CompensationPlanListQuery } from '@/lib/compensation/schemas'
import { prisma } from '@/lib/prisma'

/**
 * ชั้นข้อมูลของโมดูลแผนค่าตอบแทน (ไฟล์ 11) — **แยกจาก pure logic** (`lib/compensation/plan.ts`)
 *
 * ทุก query กรองด้วย `organization_id` เสมอ (`02` §2) · ทุก mutation อยู่ใน `$transaction`
 * เดียวกับ `emitAudit()` พร้อม `reason` เพราะ `compensation_plans` อยู่หมวด **เงิน** (`90` §13)
 *
 * **แผนหนึ่งชุด = แถวที่มี `name` เดียวกันหลายเวอร์ชัน** (UNIQUE `organization_id, name, version`)
 * — PATCH สร้างแถวใหม่แล้วย้าย `teams.compensation_plan_id` มาชี้เวอร์ชันปัจจุบัน ส่วนแถวเก่า
 * ยังอยู่ครบเพื่อให้ `expenses` ที่ snapshot ไว้แล้วอ้างถึงได้เสมอ (`92` §7.1)
 */

const planSelect = {
  id: true,
  name: true,
  side: true,
  fuelMode: true,
  fuelRatePerKmSatang: true,
  fuelMaxPerCaseSatang: true,
  fuelDailyFlatSatang: true,
  allowanceSatang: true,
  commissionSatang: true,
  noSuccessFeeSatang: true,
  hotelMaxPerNightSatang: true,
  hotelReceiptRequired: true,
  whtPct: true,
  version: true,
  effectiveFrom: true,
  effectiveTo: true,
  isCurrent: true,
  deletedAt: true,
  updatedAt: true,
} as const

type PlanRow = Prisma.CompensationPlanGetPayload<{ select: typeof planSelect }>

export interface CompensationPlanRecord extends CompensationPlanVersion {
  isActive: boolean
  updatedAt: string
}

export interface CompensationPlanListItem extends CompensationPlanRecord {
  /** จำนวนทีมที่ผูกอยู่กับเวอร์ชันนี้ — ใช้เตือนก่อนแก้/ปิดใช้งาน (`11` §10) */
  teamCount: number
}

/** DATE ของ Postgres มาเป็น `Date` เที่ยงคืน UTC — ตัดเป็น `YYYY-MM-DD` ตรง ๆ ห้ามแปลง timezone */
function toIsoDate(value: Date | null): string | null {
  return value === null ? null : value.toISOString().slice(0, 10)
}

function fromIsoDate(value: string): Date {
  return new Date(`${value}T00:00:00.000Z`)
}

function toRecord(row: PlanRow): CompensationPlanRecord {
  return {
    id: row.id,
    name: row.name,
    side: row.side,
    fuelMode: row.fuelMode,
    fuelRatePerKmSatang: row.fuelRatePerKmSatang,
    fuelMaxPerCaseSatang: row.fuelMaxPerCaseSatang,
    fuelDailyFlatSatang: row.fuelDailyFlatSatang,
    allowanceSatang: row.allowanceSatang,
    commissionSatang: row.commissionSatang,
    noSuccessFeeSatang: row.noSuccessFeeSatang,
    hotelMaxPerNightSatang: row.hotelMaxPerNightSatang,
    hotelReceiptRequired: row.hotelReceiptRequired,
    whtPct: row.whtPct.toNumber(),
    version: row.version,
    effectiveFrom: toIsoDate(row.effectiveFrom) ?? '',
    effectiveTo: toIsoDate(row.effectiveTo),
    isCurrent: row.isCurrent,
    isActive: row.deletedAt === null,
    updatedAt: row.updatedAt.toISOString(),
  }
}

/** ค่าที่บันทึกลง audit — ชื่อคอลัมน์ snake_case ตามตารางจริง (`90` §6.1) */
function toAuditPayload(values: CompensationPlanValues, version: number): Record<string, unknown> {
  const normalized = normalizePlanValues(values)
  return {
    name: normalized.name,
    side: normalized.side,
    fuel_mode: normalized.fuelMode,
    fuel_rate_per_km_satang: normalized.fuelRatePerKmSatang,
    fuel_max_per_case_satang: normalized.fuelMaxPerCaseSatang,
    fuel_daily_flat_satang: normalized.fuelDailyFlatSatang,
    allowance_satang: normalized.allowanceSatang,
    commission_satang: normalized.commissionSatang,
    no_success_fee_satang: normalized.noSuccessFeeSatang,
    hotel_max_per_night_satang: normalized.hotelMaxPerNightSatang,
    hotel_receipt_required: normalized.hotelReceiptRequired,
    wht_pct: normalized.whtPct,
    effective_from: normalized.effectiveFrom,
    version,
  }
}

function toCreateData(values: CompensationPlanValues) {
  const normalized = normalizePlanValues(values)
  return {
    name: normalized.name,
    side: normalized.side,
    fuelMode: normalized.fuelMode,
    fuelRatePerKmSatang: normalized.fuelRatePerKmSatang,
    fuelMaxPerCaseSatang: normalized.fuelMaxPerCaseSatang,
    fuelDailyFlatSatang: normalized.fuelDailyFlatSatang,
    allowanceSatang: normalized.allowanceSatang,
    commissionSatang: normalized.commissionSatang,
    noSuccessFeeSatang: normalized.noSuccessFeeSatang,
    hotelMaxPerNightSatang: normalized.hotelMaxPerNightSatang,
    hotelReceiptRequired: normalized.hotelReceiptRequired,
    whtPct: new Prisma.Decimal(normalized.whtPct.toFixed(2)),
    effectiveFrom: fromIsoDate(normalized.effectiveFrom),
  }
}

export async function listCompensationPlans(
  organizationId: string,
  query: CompensationPlanListQuery,
): Promise<CompensationPlanListItem[]> {
  const rows = await prisma.compensationPlan.findMany({
    where: {
      organizationId,
      isCurrent: true,
      side: query.side,
      ...(query.status === 'all' ? {} : query.status === 'active' ? { deletedAt: null } : { NOT: { deletedAt: null } }),
    },
    select: { ...planSelect, _count: { select: { teams: { where: { deletedAt: null } } } } },
    orderBy: [{ side: 'asc' }, { name: 'asc' }],
  })

  return rows.map((row) => {
    const { _count, ...rest } = row
    return { ...toRecord(rest), teamCount: _count.teams }
  })
}

/** เวอร์ชันหนึ่งแถวตาม id — ไม่กรอง `is_current` เพื่อให้เปิดดูเวอร์ชันเก่าได้ */
export async function getCompensationPlan(
  organizationId: string,
  planId: string,
): Promise<CompensationPlanRecord> {
  const row = await prisma.compensationPlan.findFirst({
    where: { id: planId, organizationId },
    select: planSelect,
  })
  if (!row) throw new CompensationError('PLAN_NOT_FOUND', { detail: `plan=${planId}` })
  return toRecord(row)
}

/** ประวัติทุกเวอร์ชันของแผนเดียวกัน (`11` §14 `GET /:id/versions`) — เรียงใหม่→เก่า */
export async function listCompensationPlanVersions(
  organizationId: string,
  planId: string,
): Promise<CompensationPlanRecord[]> {
  const plan = await getCompensationPlan(organizationId, planId)
  const rows = await prisma.compensationPlan.findMany({
    where: { organizationId, name: plan.name },
    select: planSelect,
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
  const duplicate = await prisma.compensationPlan.findFirst({
    where: { organizationId, name },
    select: { id: true },
  })
  if (duplicate) throw new CompensationError('DUPLICATE_TEMPLATE_NAME', { detail: `name=${name}` })
}

export async function createCompensationPlan(
  context: MutationContext,
  values: CompensationPlanValues,
): Promise<CompensationPlanRecord> {
  const organizationId = context.actor.organizationId
  await assertNameAvailable(organizationId, values.name)

  const created = await prisma.$transaction(async (tx) => {
    const plan = await tx.compensationPlan.create({
      data: {
        organizationId,
        ...toCreateData(values),
        version: 1,
        isCurrent: true,
        createdBy: context.actor.id,
      },
      select: planSelect,
    })

    await emitAudit(
      {
        organizationId,
        actorId: context.actor.id,
        actorRole: context.actor.roleName,
        action: 'create',
        targetType: 'compensation_plans',
        targetId: plan.id,
        after: toAuditPayload(values, 1),
        reason: context.reason,
        ipAddress: context.meta.ipAddress,
        userAgent: context.meta.userAgent,
      },
      tx,
    )

    return plan
  })

  return toRecord(created)
}

/**
 * PATCH = **สร้างเวอร์ชันใหม่ ไม่ overwrite ของเดิม** (`11` §10/§14)
 * ทั้งชุดอยู่ใน `$transaction` เดียว: ปิดเวอร์ชันเดิม → สร้างเวอร์ชันใหม่ → ย้ายทีมมาผูก → audit
 * คืนแถวเดิมเมื่อไม่มีอะไรเปลี่ยน (ไม่สร้างเวอร์ชันขยะ ไม่ลง audit)
 */
export async function updateCompensationPlan(
  context: MutationContext,
  current: CompensationPlanRecord,
  values: CompensationPlanValues,
): Promise<CompensationPlanRecord> {
  const organizationId = context.actor.organizationId
  if (!current.isCurrent) throw new CompensationError('VERSION_NOT_CURRENT', { detail: `plan=${current.id}` })

  const next = planNextVersion(current, values)
  if (next === null) return current

  await assertNameAvailable(organizationId, next.values.name, current.name)

  const updated = await prisma.$transaction(async (tx) => {
    await tx.compensationPlan.update({
      where: { id: current.id },
      data: {
        isCurrent: false,
        effectiveTo: next.previousEffectiveTo === null ? null : fromIsoDate(next.previousEffectiveTo),
        updatedBy: context.actor.id,
      },
    })

    // เปลี่ยนชื่อ = เปลี่ยนทั้งชุด — ประวัติเวอร์ชันจับกลุ่มด้วย `name` จึงต้องตรงกันทุกแถว
    if (next.values.name !== current.name) {
      await tx.compensationPlan.updateMany({
        where: { organizationId, name: current.name },
        data: { name: next.values.name, updatedBy: context.actor.id },
      })
    }

    const plan = await tx.compensationPlan.create({
      data: {
        organizationId,
        ...toCreateData(next.values),
        version: next.version,
        isCurrent: true,
        createdBy: context.actor.id,
      },
      select: planSelect,
    })

    // ทีมต้องชี้เวอร์ชันปัจจุบันเสมอ — expense ที่ snapshot ไว้แล้วยังอ้างแถวเก่าได้ (`92` §7.1)
    await tx.team.updateMany({
      where: { organizationId, compensationPlanId: current.id },
      data: { compensationPlanId: plan.id, updatedBy: context.actor.id },
    })

    await emitAudit(
      {
        organizationId,
        actorId: context.actor.id,
        actorRole: context.actor.roleName,
        action: 'update',
        targetType: 'compensation_plans',
        targetId: plan.id,
        before: toAuditPayload(current, current.version),
        after: toAuditPayload(next.values, next.version),
        reason: context.reason,
        ipAddress: context.meta.ipAddress,
        userAgent: context.meta.userAgent,
        diffOnly: false,
      },
      tx,
    )

    return plan
  })

  return toRecord(updated)
}

/** จำนวนทีมที่ยังผูกอยู่กับแผนชุดนี้ (ทุกเวอร์ชัน) — ยาม `PLAN_IN_USE` */
export async function countTeamsUsingPlan(organizationId: string, planName: string): Promise<number> {
  return prisma.team.count({
    where: { organizationId, deletedAt: null, compensationPlan: { organizationId, name: planName } },
  })
}

/**
 * ปิด/เปิดใช้งานแผน — `02` §2.4 ไม่มีคอลัมน์ `active` แยก จึงใช้ soft delete (`deleted_at`)
 * ปิดแผนที่มีทีมผูกอยู่ไม่ได้ (`11` §10 — ย้ายทีมไปแผนอื่นก่อน) · ทำทีเดียวทุกเวอร์ชันของชุด
 */
export async function setCompensationPlanActive(
  context: MutationContext,
  current: CompensationPlanRecord,
  isActive: boolean,
): Promise<CompensationPlanRecord> {
  const organizationId = context.actor.organizationId

  if (!isActive) {
    const teamCount = await countTeamsUsingPlan(organizationId, current.name)
    if (teamCount > 0) {
      throw new CompensationError('PLAN_IN_USE', {
        detail: `plan=${current.name} teams=${teamCount}`,
        context: { teamCount },
      })
    }
  }

  const deletedAt = isActive ? null : new Date()

  await prisma.$transaction(async (tx) => {
    await tx.compensationPlan.updateMany({
      where: { organizationId, name: current.name },
      data: { deletedAt, updatedBy: context.actor.id },
    })

    await emitAudit(
      {
        organizationId,
        actorId: context.actor.id,
        actorRole: context.actor.roleName,
        action: isActive ? 'update' : 'delete',
        targetType: 'compensation_plans',
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
