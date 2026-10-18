import { emitAudit } from '@/lib/audit/audit'
import { Prisma } from '@/lib/generated/prisma/client'
import { prisma } from '@/lib/prisma'
import { SettingsError } from '@/lib/settings/errors'
import { toDateOnlyIso, toIso, type SettingsMutationContext, type SettingsTxClient } from '@/lib/settings/queries/shared'
import type { VatRateDto } from '@/lib/settings/types'
import {
  findOverlappingPeriods,
  formatVatPeriodLabel,
  isPeriodRangeValid,
  resolveVatRateAt,
  sortPeriodsDesc,
  planVatRateAutoClose,
  validateVatRateChange,
  validateVatRateCreate,
  vatRateViolationMessage,
  type VatRateChangeViolation,
  type VatRatePeriod,
  type VatRevenueSpan,
} from '@/lib/settings/vat'

/**
 * อัตรา VAT แบบ effective-dated (`13` §6.5 · `19` §6.3) — ชั้น DB
 *
 * **ห้าม hardcode 7%** (Rule 01): ทุกจุดที่ต้องใช้อัตรา VAT เรียก `resolveVatRate()` ตามวันที่ของ
 * รายการ แล้ว snapshot ค่าที่ได้ลง record (`revenues.vat_rate_used`) — Phase 3.6 ใช้ตัวนี้
 *
 * ห้ามมีช่วงทับกัน (`VAT_RATE_OVERLAP`) — ตรวจทั้ง create และ update
 * มติ D7-01 (mytester7 S7-AG2-02/03): ช่วงที่มีรายได้อ้างห้ามเปลี่ยนอัตรา/ย่นช่วง (`VAT_RATE_IN_USE`) ·
 * ห้ามแก้วันสิ้นสุดย้อนหลังก่อนวันนี้เวลาไทย (`VAT_RATE_END_DATE_PAST`) · ห้ามเกิดช่องว่างใหม่ (`VAT_RATE_GAP`
 * — รวมทำให้วันนี้/อนาคตไม่มีอัตรา: ช่วงล่าสุดต้องเปิดปลาย · เพิ่มช่วงใหม่ = ปิดช่วงเปิดปลายเดิมให้อัตโนมัติ)
 * — กติกาอยู่ใน pure `validateVatRateChange()` ที่นี่แค่หาข้อมูลรายได้มาป้อน
 */

const TARGET = 'vat_rate_history'

const vatSelect = {
  id: true,
  ratePct: true,
  effectiveFrom: true,
  effectiveTo: true,
  note: true,
  createdAt: true,
} as const

type VatRow = Prisma.VatRateHistoryGetPayload<{ select: typeof vatSelect }>

export interface VatRateValues {
  ratePct: number
  effectiveFrom: Date
  effectiveTo: Date | null
  note: string | null
}

function toPeriod(row: VatRow): VatRatePeriod {
  return {
    id: row.id,
    ratePct: row.ratePct.toNumber(),
    effectiveFrom: row.effectiveFrom,
    effectiveTo: row.effectiveTo,
  }
}

function toDto(row: VatRow, currentId: string | null): VatRateDto {
  return {
    id: row.id,
    ratePct: row.ratePct.toNumber(),
    effectiveFrom: toDateOnlyIso(row.effectiveFrom),
    effectiveTo: row.effectiveTo === null ? null : toDateOnlyIso(row.effectiveTo),
    note: row.note,
    isCurrent: row.id === currentId,
    createdAt: toIso(row.createdAt),
  }
}

function toAuditPayload(values: VatRateValues): Record<string, unknown> {
  return {
    rate_pct: values.ratePct,
    effective_from: toDateOnlyIso(values.effectiveFrom),
    effective_to: values.effectiveTo === null ? null : toDateOnlyIso(values.effectiveTo),
    note: values.note,
  }
}

async function loadPeriods(organizationId: string, db: SettingsTxClient = prisma): Promise<VatRow[]> {
  return db.vatRateHistory.findMany({ where: { organizationId }, select: vatSelect })
}

/**
 * ล็อกการแก้ช่วงอัตรา VAT ระดับองค์กรจนจบธุรกรรม (mytester7 review — TOCTOU): ตรวจทับกัน/ช่องว่าง/รายได้อ้าง
 * แล้วบันทึกภายใต้ล็อกเดียวกัน ⇒ สองคำขอพร้อมกันเห็นผลของกันและกันเสมอ ไม่เกิดช่วงทับ/ช่องว่างจากการแข่งกัน
 */
async function lockVatRates(tx: SettingsTxClient, organizationId: string): Promise<void> {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`${TARGET}:${organizationId}`}))`
}

/** รายการอัตรา VAT ทั้งหมด เรียงใหม่→เก่า พร้อมธงว่าช่วงไหนมีผล "วันนี้" */
export async function listVatRates(organizationId: string, today: Date = new Date()): Promise<VatRateDto[]> {
  const rows = await loadPeriods(organizationId)
  const current = resolveVatRateAt(today, rows.map(toPeriod))
  return sortPeriodsDesc(rows.map((row) => ({ row, effectiveFrom: row.effectiveFrom })))
    .map((entry) => entry.row)
    .map((row) => toDto(row, current?.id ?? null))
}

export async function getVatRate(organizationId: string, rateId: string): Promise<VatRateDto> {
  const row = await prisma.vatRateHistory.findFirst({ where: { id: rateId, organizationId }, select: vatSelect })
  if (!row) throw new SettingsError('VAT_RATE_NOT_FOUND', { detail: `vat_rate=${rateId}` })
  return toDto(row, null)
}

/**
 * **VAT resolver กลาง** — อัตราที่มีผล ณ วันที่หนึ่ง (`19` §6.3)
 * ไม่มีช่วงครอบคลุม = `VAT_RATE_NOT_FOUND` (ห้าม fallback เป็น 7% เงียบ ๆ)
 */
export async function resolveVatRate(organizationId: string, date: Date): Promise<VatRateDto> {
  const rows = await loadPeriods(organizationId)
  const resolved = resolveVatRateAt(date, rows.map(toPeriod))
  if (!resolved) {
    throw new SettingsError('VAT_RATE_NOT_FOUND', { detail: `date=${toDateOnlyIso(date)}` })
  }
  const row = rows.find((entry) => entry.id === resolved.id)
  if (!row) throw new SettingsError('VAT_RATE_NOT_FOUND', { detail: `vat_rate=${resolved.id}` })
  return toDto(row, resolved.id)
}

function assertNoOverlap(
  values: Pick<VatRateValues, 'effectiveFrom' | 'effectiveTo'>,
  existing: readonly VatRow[],
  exceptId?: string,
): void {
  if (!isPeriodRangeValid(values)) {
    throw new SettingsError('VAT_RATE_OVERLAP', {
      detail: `invalid range from=${toDateOnlyIso(values.effectiveFrom)} to=${values.effectiveTo === null ? 'null' : toDateOnlyIso(values.effectiveTo)}`,
    })
  }

  const overlapping = findOverlappingPeriods(values, existing.map(toPeriod), exceptId)
  if (overlapping.length === 0) return

  // ข้อความระบุช่วงที่ทับตามวันสิ้นสุดจริง (mytester7 S7-AG2-04)
  throw new SettingsError('VAT_RATE_OVERLAP', {
    messages: {
      title: 'ช่วงเวลาอัตรา VAT ทับกัน',
      message: `ช่วงวันที่นี้ทับกับ ${overlapping.map(formatVatPeriodLabel).join(', ')} — เลือกวันที่ไม่ทับ (เพิ่มอัตราใหม่ที่เริ่มหลังวันเริ่มของอัตราที่ใช้อยู่ ระบบจะปิดช่วงเดิมให้)`,
    },
    detail: `overlaps=${overlapping.map((period) => period.id).join(',')}`,
    context: {
      overlapping: overlapping.map((period) => ({
        id: period.id,
        ratePct: period.ratePct,
        effectiveFrom: toDateOnlyIso(period.effectiveFrom),
        effectiveTo: period.effectiveTo === null ? null : toDateOnlyIso(period.effectiveTo),
      })),
    },
  })
}

/**
 * วันที่รายได้แรกสุด/ล่าสุดที่ `revenue_date` ตกในช่วงเดิม (ไม่นับที่ลบแล้ว) — `null` = ช่วงนี้ยังไม่มีรายได้อ้าง
 * นับทุกสถานะ (รวมยกเลิก/วางบิลแล้ว) เพราะ snapshot `vat_rate_pct_used` ของทุกแถวอ้างช่วงนี้อยู่
 */
async function revenueSpanOf(
  organizationId: string,
  period: VatRatePeriod,
  db: SettingsTxClient = prisma,
): Promise<VatRevenueSpan | null> {
  const result = await db.revenue.aggregate({
    where: {
      organizationId,
      deletedAt: null,
      revenueDate: { gte: period.effectiveFrom, ...(period.effectiveTo === null ? {} : { lte: period.effectiveTo }) },
    },
    _min: { revenueDate: true },
    _max: { revenueDate: true },
  })
  const first = result._min.revenueDate
  const last = result._max.revenueDate
  return first === null || last === null ? null : { first, last }
}

function throwIfViolation(violation: VatRateChangeViolation | null): void {
  if (violation === null) return
  throw new SettingsError(violation.code, {
    messages: vatRateViolationMessage(violation),
    detail: violation.code === 'VAT_RATE_IN_USE' ? `reason=${violation.reason}` : undefined,
  })
}

export async function createVatRate(
  context: SettingsMutationContext,
  values: VatRateValues,
  now: Date = new Date(),
): Promise<VatRateDto> {
  const organizationId = context.actor.organizationId

  const created = await prisma.$transaction(async (tx) => {
    await lockVatRates(tx, organizationId)
    const existing = await loadPeriods(organizationId, tx)
    const periods = existing.map(toPeriod)
    // มติ D7-01 — เปลี่ยนอัตรา = เพิ่มช่วงใหม่ ⇒ ปิดช่วงเปิดปลายเดิมถึงวันก่อนวันเริ่มใหม่ในธุรกรรมเดียวกัน
    // (ช่วงล่าสุดต้องเปิดปลายเสมอ จึงปิดแยกก่อนไม่ได้ — mytester7 review)
    const autoClose = planVatRateAutoClose(values, periods)
    assertNoOverlap(values, existing, autoClose?.period.id)
    const revenueSpan = autoClose === null ? null : await revenueSpanOf(organizationId, autoClose.period, tx)
    throwIfViolation(validateVatRateCreate({ candidate: values, existing: periods, autoClose, revenueSpan, now }))

    if (autoClose !== null) {
      const closedRow = existing.find((row) => row.id === autoClose.period.id)
      if (!closedRow) throw new SettingsError('VAT_RATE_NOT_FOUND', { detail: `vat_rate=${autoClose.period.id}` })
      await tx.vatRateHistory.update({ where: { id: closedRow.id }, data: { effectiveTo: autoClose.closedTo } })
      const closedValues = {
        ratePct: closedRow.ratePct.toNumber(),
        effectiveFrom: closedRow.effectiveFrom,
        effectiveTo: closedRow.effectiveTo,
        note: closedRow.note,
      }
      await emitAudit(
        {
          organizationId,
          actorId: context.actor.id,
          actorRole: context.actor.roleName,
          action: 'update',
          targetType: TARGET,
          targetId: closedRow.id,
          before: toAuditPayload(closedValues),
          after: { ...toAuditPayload({ ...closedValues, effectiveTo: autoClose.closedTo }), closed_by_new_rate: true },
          reason: context.reason,
          ipAddress: context.meta.ipAddress,
          userAgent: context.meta.userAgent,
        },
        tx,
      )
    }

    const row = await tx.vatRateHistory.create({
      data: {
        organizationId,
        ratePct: new Prisma.Decimal(values.ratePct.toFixed(2)),
        effectiveFrom: values.effectiveFrom,
        effectiveTo: values.effectiveTo,
        note: values.note,
        createdBy: context.actor.id,
      },
      select: vatSelect,
    })

    await emitAudit(
      {
        organizationId,
        actorId: context.actor.id,
        actorRole: context.actor.roleName,
        action: 'create',
        targetType: TARGET,
        targetId: row.id,
        after: toAuditPayload(values),
        reason: context.reason,
        ipAddress: context.meta.ipAddress,
        userAgent: context.meta.userAgent,
      },
      tx,
    )

    return row
  })

  return toDto(created, null)
}

/**
 * แก้อัตรา/ปิดช่วง — `vat_rate_history` ไม่มี `updated_by` (`02` §2.4 insert-only ด้านคอลัมน์)
 * ผู้แก้ตามรอยได้จาก audit log เท่านั้น จึงบังคับ `reason` เสมอ (`13` §6.5/§12)
 */
export async function updateVatRate(
  context: SettingsMutationContext,
  current: VatRateDto,
  values: VatRateValues,
  now: Date = new Date(),
): Promise<VatRateDto> {
  const organizationId = context.actor.organizationId

  const updated = await prisma.$transaction(async (tx) => {
    await lockVatRates(tx, organizationId)
    const existing = await loadPeriods(organizationId, tx)
    assertNoOverlap(values, existing, current.id)
    const currentRow = existing.find((row) => row.id === current.id)
    if (!currentRow) throw new SettingsError('VAT_RATE_NOT_FOUND', { detail: `vat_rate=${current.id}` })
    const currentPeriod = toPeriod(currentRow)
    throwIfViolation(
      validateVatRateChange({
        candidate: values,
        current: currentPeriod,
        existing: existing.map(toPeriod),
        revenueSpan: await revenueSpanOf(organizationId, currentPeriod, tx),
        now,
      }),
    )

    const row = await tx.vatRateHistory.update({
      where: { id: current.id },
      data: {
        ratePct: new Prisma.Decimal(values.ratePct.toFixed(2)),
        effectiveFrom: values.effectiveFrom,
        effectiveTo: values.effectiveTo,
        note: values.note,
      },
      select: vatSelect,
    })

    await emitAudit(
      {
        organizationId,
        actorId: context.actor.id,
        actorRole: context.actor.roleName,
        action: 'update',
        targetType: TARGET,
        targetId: row.id,
        before: {
          rate_pct: current.ratePct,
          effective_from: current.effectiveFrom,
          effective_to: current.effectiveTo,
          note: current.note,
        },
        after: toAuditPayload(values),
        reason: context.reason,
        ipAddress: context.meta.ipAddress,
        userAgent: context.meta.userAgent,
      },
      tx,
    )

    return row
  })

  return toDto(updated, null)
}
