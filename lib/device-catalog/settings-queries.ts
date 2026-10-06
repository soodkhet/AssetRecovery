import { emitAudit } from '@/lib/audit/audit'
import {
  DEFAULT_FILTER_BRANDS,
  DEFAULT_RECENT_YEARS,
  buildCatalogFilter,
  type CatalogFilter,
} from '@/lib/device-catalog/catalog'
import {
  DEFAULT_CAPACITY_OPTIONS,
  DEFAULT_COLOR_OPTIONS,
  DEFAULT_STALE_ALERT_DAYS,
} from '@/lib/device-catalog/device-attributes'
import type { Prisma } from '@/lib/generated/prisma/client'
import type { DeviceCatalogMutationContext } from '@/lib/device-catalog/queries'
import type { DeviceCatalogSettingsDto, DeviceCatalogSettingsValues } from '@/lib/device-catalog/types'
import { prisma } from '@/lib/prisma'

/**
 * ค่าตั้งของ Model Phone (มติ PO U159 · U166 · U167 · `13` §6.18) — **1 record ต่อองค์กร**
 * ตัวกรองการแสดง + ตัวเลือกความจุ/สีของฟอร์มรับเคส + จำนวนวันเตือนแหล่งข้อมูลหยุดอัปเดต
 *
 * GET ไม่เขียน DB: ยังไม่มีแถว = ค่าเริ่มต้น (รายชื่อแบรนด์ {@link DEFAULT_FILTER_BRANDS} + 5 ปีล่าสุด)
 * บันทึกแล้วการแสดงคำนวณใหม่ทันที (คำนวณตอนอ่าน) — ไม่ดึง API และไม่แตะค่าที่ผู้ดูแลตั้งด้วยมือ
 */

const TARGET = 'device_catalog_settings'

export function defaultDeviceCatalogSettings(): DeviceCatalogSettingsValues {
  return {
    brandNames: [...DEFAULT_FILTER_BRANDS],
    recentYears: DEFAULT_RECENT_YEARS,
    capacityOptions: [...DEFAULT_CAPACITY_OPTIONS],
    colorOptions: [...DEFAULT_COLOR_OPTIONS],
    staleAlertDays: DEFAULT_STALE_ALERT_DAYS,
  }
}

const SETTINGS_SELECT = {
  brandNames: true,
  recentYears: true,
  capacityOptions: true,
  colorOptions: true,
  staleAlertDays: true,
  updatedAt: true,
} satisfies Prisma.DeviceCatalogSettingsSelect

type SettingsRow = Prisma.DeviceCatalogSettingsGetPayload<{ select: typeof SETTINGS_SELECT }>

function toDto(row: SettingsRow): DeviceCatalogSettingsDto {
  return {
    brandNames: row.brandNames,
    recentYears: row.recentYears,
    capacityOptions: row.capacityOptions,
    colorOptions: row.colorOptions,
    staleAlertDays: row.staleAlertDays,
    updatedAt: row.updatedAt.toISOString(),
  }
}

export async function getDeviceCatalogSettings(organizationId: string): Promise<DeviceCatalogSettingsDto> {
  const row = await prisma.deviceCatalogSettings.findUnique({ where: { organizationId }, select: SETTINGS_SELECT })
  if (row === null) return { ...defaultDeviceCatalogSettings(), updatedAt: null }
  return toDto(row)
}

/**
 * เขียนสถานะการอัปเดต TAC (U166/U167) — ยังไม่มีแถวค่าตั้ง = สร้างด้วยค่าเริ่มต้นของโค้ด (ไม่ใช่ค่าว่างของ DB)
 * ไม่ลง audit: เป็นสถานะของ job (ประวัติทุกรอบอยู่ที่ `device_tac_updates`)
 */
export async function saveTacSyncState(
  organizationId: string,
  data: {
    tacEtag?: string | null
    tacCheckedAt?: Date
    tacImportedAt?: Date
    tacSourceSha?: string | null
    tacSourceUpdatedAt?: Date | null
  },
): Promise<void> {
  await prisma.deviceCatalogSettings.upsert({
    where: { organizationId },
    create: { organizationId, ...defaultDeviceCatalogSettings(), ...data },
    update: data,
  })
}

/** ตัวกรองที่ใช้คำนวณการแสดง ณ เวลานี้ */
export async function getCatalogFilter(organizationId: string, now: Date = new Date()): Promise<CatalogFilter> {
  const settings = await getDeviceCatalogSettings(organizationId)
  return buildCatalogFilter(settings.brandNames, settings.recentYears, now)
}

export async function updateDeviceCatalogSettings(
  context: DeviceCatalogMutationContext,
  current: DeviceCatalogSettingsDto,
  values: DeviceCatalogSettingsValues,
): Promise<DeviceCatalogSettingsDto> {
  const organizationId = context.actor.organizationId
  const row = await prisma.$transaction(async (tx) => {
    const saved = await tx.deviceCatalogSettings.upsert({
      where: { organizationId },
      create: { organizationId, ...values, updatedBy: context.actor.id },
      update: { ...values, updatedBy: context.actor.id },
      select: SETTINGS_SELECT,
    })
    await emitAudit(
      {
        organizationId,
        actorId: context.actor.id,
        actorRole: context.actor.roleName,
        action: current.updatedAt === null ? 'create' : 'update',
        targetType: TARGET,
        targetId: organizationId,
        before: {
          brand_names: current.brandNames,
          recent_years: current.recentYears,
          capacity_options: current.capacityOptions,
          color_options: current.colorOptions,
          stale_alert_days: current.staleAlertDays,
        },
        after: {
          brand_names: values.brandNames,
          recent_years: values.recentYears,
          capacity_options: values.capacityOptions,
          color_options: values.colorOptions,
          stale_alert_days: values.staleAlertDays,
        },
        reason: context.reason,
        ipAddress: context.meta.ipAddress,
        userAgent: context.meta.userAgent,
      },
      tx,
    )
    return saved
  })
  return toDto(row)
}
