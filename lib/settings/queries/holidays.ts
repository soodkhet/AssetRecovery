import { emitAudit } from '@/lib/audit/audit'
import { Prisma } from '@/lib/generated/prisma/client'
import { prisma } from '@/lib/prisma'
import { SettingsError } from '@/lib/settings/errors'
import { holidayWeekdayLabel, holidayYearBe, holidayYearRange } from '@/lib/settings/holidays'
import {
  toDateOnlyIso,
  toIso,
  type SettingsMutationContext,
  type SettingsTxClient,
} from '@/lib/settings/queries/shared'
import { refreshPendingFilingDueDates, type RefreshedFilingSummary } from '@/lib/settings/queries/wht-policy'
import type { HolidayMutationResultDto, PublicHolidayDto, PublicHolidayListDto } from '@/lib/settings/types'

/**
 * ปฏิทินวันหยุดขององค์กร (มติ PO 06/10/2569 UAT U93 · `13` §6.15) — ชั้น DB
 *
 * - ทุก query กรอง `organization_id` · ลบ = soft delete (`deleted_at`) · วันเดียวกันมีได้แถวเดียวที่ยังไม่ลบ
 *   (partial unique `uniq_public_holidays_active_date` = ตัวบังคับจริงของ `DUPLICATE_HOLIDAY_DATE`)
 * - ทุก mutation อยู่ใน `$transaction` เดียวกับ audit (reason บังคับ — กระทบกำหนดยื่นภาษี) และ
 *   **คิดกำหนดยื่น ภ.ง.ด. ของรอบที่ยัง `pending` ใหม่** (`refreshPendingFilingDueDates()` — แบบเดียวกับที่ U45
 *   ทำตอนเปลี่ยนวิธียื่น) · รอบที่เปลี่ยนจริงลง audit ของรอบนั้นเอง (`wht_filing_summaries` before/after)
 */

const TARGET = 'public_holidays'
const FILING_TARGET = 'wht_filing_summaries'

const holidaySelect = {
  id: true,
  holidayDate: true,
  name: true,
  createdAt: true,
  createdByUser: { select: { fullName: true } },
} as const

type HolidayRow = Prisma.PublicHolidayGetPayload<{ select: typeof holidaySelect }>

function toDto(row: HolidayRow): PublicHolidayDto {
  const holidayDate = toDateOnlyIso(row.holidayDate)
  return {
    id: row.id,
    holidayDate,
    name: row.name,
    yearBe: holidayYearBe(holidayDate),
    weekdayLabel: holidayWeekdayLabel(holidayDate),
    createdByName: row.createdByUser?.fullName ?? null,
    createdAt: toIso(row.createdAt),
  }
}

function auditPayload(dto: PublicHolidayDto): Record<string, unknown> {
  return { holiday_date: dto.holidayDate, name: dto.name }
}

function isUniqueViolation(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002'
}

export async function listHolidays(organizationId: string, yearBe?: number): Promise<PublicHolidayListDto> {
  const range = yearBe === undefined ? null : holidayYearRange(yearBe)
  const [rows, allDates] = await Promise.all([
    prisma.publicHoliday.findMany({
      where: {
        organizationId,
        deletedAt: null,
        ...(range === null ? {} : { holidayDate: { gte: range.from, lte: range.to } }),
      },
      select: holidaySelect,
      orderBy: { holidayDate: 'asc' },
    }),
    prisma.publicHoliday.findMany({
      where: { organizationId, deletedAt: null },
      select: { holidayDate: true },
    }),
  ])
  const years = [...new Set(allDates.map((row) => holidayYearBe(toDateOnlyIso(row.holidayDate))))].sort((a, b) => b - a)
  return { items: rows.map(toDto), years }
}

export async function getHoliday(organizationId: string, holidayId: string): Promise<PublicHolidayDto> {
  const row = await prisma.publicHoliday.findFirst({
    where: { id: holidayId, organizationId, deletedAt: null },
    select: holidaySelect,
  })
  if (row === null) throw new SettingsError('HOLIDAY_NOT_FOUND', { detail: `public_holiday=${holidayId}` })
  return toDto(row)
}

/** คิดกำหนดยื่นของรอบ pending ใหม่ + ลง audit ของแต่ละรอบที่เปลี่ยน (reason เดียวกับการแก้ปฏิทิน) */
async function refreshFilingsWithAudit(
  tx: SettingsTxClient,
  context: SettingsMutationContext,
): Promise<RefreshedFilingSummary[]> {
  const organizationId = context.actor.organizationId
  const refreshed = await refreshPendingFilingDueDates(tx, organizationId)
  for (const change of refreshed) {
    await emitAudit(
      {
        organizationId,
        actorId: context.actor.id,
        actorRole: context.actor.roleName,
        action: 'update',
        targetType: FILING_TARGET,
        targetId: change.summary_id,
        before: { filing_due_date: change.before_filing_due_date, filing_method: change.before_filing_method },
        after: {
          filing_due_date: change.filing_due_date,
          filing_method: change.filing_method,
          period_label: change.period_label,
          source: 'public_holidays',
        },
        reason: context.reason,
        ipAddress: context.meta.ipAddress,
        userAgent: context.meta.userAgent,
        diffOnly: false,
      },
      tx,
    )
  }
  return refreshed
}

function toRefreshedDto(refreshed: readonly RefreshedFilingSummary[]): HolidayMutationResultDto['refreshedFilings'] {
  return refreshed.map((change) => ({
    periodLabel: change.period_label,
    fromDate: change.before_filing_due_date,
    toDate: change.filing_due_date,
  }))
}

async function insertHoliday(
  tx: SettingsTxClient,
  context: SettingsMutationContext,
  values: { holidayDate: Date; name: string },
  source: 'manual' | 'import',
): Promise<PublicHolidayDto> {
  const row = await tx.publicHoliday.create({
    data: {
      organizationId: context.actor.organizationId,
      holidayDate: values.holidayDate,
      name: values.name.trim(),
      createdBy: context.actor.id,
    },
    select: holidaySelect,
  })
  const dto = toDto(row)
  await emitAudit(
    {
      organizationId: context.actor.organizationId,
      actorId: context.actor.id,
      actorRole: context.actor.roleName,
      action: 'create',
      targetType: TARGET,
      targetId: row.id,
      after: { ...auditPayload(dto), source },
      reason: context.reason,
      ipAddress: context.meta.ipAddress,
      userAgent: context.meta.userAgent,
    },
    tx,
  )
  return dto
}

export async function createHoliday(
  context: SettingsMutationContext,
  values: { holidayDate: Date; name: string },
): Promise<HolidayMutationResultDto> {
  const organizationId = context.actor.organizationId
  const existing = await prisma.publicHoliday.findFirst({
    where: { organizationId, holidayDate: values.holidayDate, deletedAt: null },
    select: { id: true },
  })
  if (existing !== null) {
    throw new SettingsError('DUPLICATE_HOLIDAY_DATE', { detail: `holiday_date=${toDateOnlyIso(values.holidayDate)}` })
  }

  try {
    return await prisma.$transaction(async (tx) => {
      const created = await insertHoliday(tx, context, values, 'manual')
      const refreshed = await refreshFilingsWithAudit(tx, context)
      return { created: [created], skippedDates: [], deleted: null, refreshedFilings: toRefreshedDto(refreshed) }
    })
  } catch (error) {
    // ชนกับคำขอที่เพิ่มวันเดียวกันพร้อมกัน — partial unique ปฏิเสธ
    if (isUniqueViolation(error)) {
      throw new SettingsError('DUPLICATE_HOLIDAY_DATE', { detail: `holiday_date=${toDateOnlyIso(values.holidayDate)}` })
    }
    throw error
  }
}

/** นำเข้าหลายวันทีเดียว — วันที่มีอยู่แล้วในปฏิทิน**ข้าม** (คืนใน `skippedDates`) ไม่ปฏิเสธทั้งชุด */
export async function importHolidays(
  context: SettingsMutationContext,
  items: readonly { holidayDate: Date; name: string }[],
): Promise<HolidayMutationResultDto> {
  const organizationId = context.actor.organizationId
  try {
    return await importInTransaction(context, organizationId, items)
  } catch (error) {
    // คำขออื่นเพิ่มวันเดียวกันแทรกเข้ามาระหว่างทาง — ทั้งชุด rollback ให้ผู้ใช้กดนำเข้าใหม่ (วันที่ซ้ำจะถูกข้าม)
    if (isUniqueViolation(error)) throw new SettingsError('DUPLICATE_HOLIDAY_DATE', { detail: 'import' })
    throw error
  }
}

async function importInTransaction(
  context: SettingsMutationContext,
  organizationId: string,
  items: readonly { holidayDate: Date; name: string }[],
): Promise<HolidayMutationResultDto> {
  return prisma.$transaction(async (tx) => {
    const existing = await tx.publicHoliday.findMany({
      where: { organizationId, deletedAt: null, holidayDate: { in: items.map((item) => item.holidayDate) } },
      select: { holidayDate: true },
    })
    const taken = new Set(existing.map((row) => toDateOnlyIso(row.holidayDate)))
    const created: PublicHolidayDto[] = []
    const skippedDates: string[] = []
    for (const item of items) {
      const key = toDateOnlyIso(item.holidayDate)
      if (taken.has(key)) {
        skippedDates.push(key)
        continue
      }
      taken.add(key)
      created.push(await insertHoliday(tx, context, item, 'import'))
    }
    const refreshed = created.length === 0 ? [] : await refreshFilingsWithAudit(tx, context)
    return { created, skippedDates, deleted: null, refreshedFilings: toRefreshedDto(refreshed) }
  })
}

export async function deleteHoliday(
  context: SettingsMutationContext,
  current: PublicHolidayDto,
  now: Date = new Date(),
): Promise<HolidayMutationResultDto> {
  const organizationId = context.actor.organizationId
  return prisma.$transaction(async (tx) => {
    const claimed = await tx.publicHoliday.updateMany({
      where: { id: current.id, organizationId, deletedAt: null },
      data: { deletedAt: now, updatedBy: context.actor.id },
    })
    if (claimed.count === 0) throw new SettingsError('HOLIDAY_NOT_FOUND', { detail: `public_holiday=${current.id}` })

    await emitAudit(
      {
        organizationId,
        actorId: context.actor.id,
        actorRole: context.actor.roleName,
        action: 'delete',
        targetType: TARGET,
        targetId: current.id,
        before: auditPayload(current),
        after: { deleted_at: now.toISOString() },
        reason: context.reason,
        ipAddress: context.meta.ipAddress,
        userAgent: context.meta.userAgent,
        diffOnly: false,
      },
      tx,
    )
    const refreshed = await refreshFilingsWithAudit(tx, context)
    return { created: [], skippedDates: [], deleted: current, refreshedFilings: toRefreshedDto(refreshed) }
  })
}
