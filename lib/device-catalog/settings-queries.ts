import { emitAudit } from '@/lib/audit/audit'
import {
  DEFAULT_FILTER_BRANDS,
  DEFAULT_RECENT_YEARS,
  buildCatalogFilter,
  type CatalogFilter,
} from '@/lib/device-catalog/catalog'
import type { DeviceCatalogMutationContext } from '@/lib/device-catalog/queries'
import type { DeviceCatalogSettingsDto, DeviceCatalogSettingsValues } from '@/lib/device-catalog/types'
import { prisma } from '@/lib/prisma'

/**
 * ค่าตั้งตัวกรองของ Model Phone (มติ PO U159 · `13` §6.18) — **1 record ต่อองค์กร**
 *
 * GET ไม่เขียน DB: ยังไม่มีแถว = ค่าเริ่มต้น (รายชื่อแบรนด์ {@link DEFAULT_FILTER_BRANDS} + 5 ปีล่าสุด)
 * บันทึกแล้วการแสดงคำนวณใหม่ทันที (คำนวณตอนอ่าน) — ไม่ดึง API และไม่แตะค่าที่ผู้ดูแลตั้งด้วยมือ
 */

const TARGET = 'device_catalog_settings'

export function defaultDeviceCatalogSettings(): DeviceCatalogSettingsValues {
  return { brandNames: [...DEFAULT_FILTER_BRANDS], recentYears: DEFAULT_RECENT_YEARS }
}

export async function getDeviceCatalogSettings(organizationId: string): Promise<DeviceCatalogSettingsDto> {
  const row = await prisma.deviceCatalogSettings.findUnique({
    where: { organizationId },
    select: { brandNames: true, recentYears: true, updatedAt: true },
  })
  if (row === null) return { ...defaultDeviceCatalogSettings(), updatedAt: null }
  return { brandNames: row.brandNames, recentYears: row.recentYears, updatedAt: row.updatedAt.toISOString() }
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
      select: { brandNames: true, recentYears: true, updatedAt: true },
    })
    await emitAudit(
      {
        organizationId,
        actorId: context.actor.id,
        actorRole: context.actor.roleName,
        action: current.updatedAt === null ? 'create' : 'update',
        targetType: TARGET,
        targetId: organizationId,
        before: { brand_names: current.brandNames, recent_years: current.recentYears },
        after: { brand_names: values.brandNames, recent_years: values.recentYears },
        reason: context.reason,
        ipAddress: context.meta.ipAddress,
        userAgent: context.meta.userAgent,
      },
      tx,
    )
    return saved
  })
  return { brandNames: row.brandNames, recentYears: row.recentYears, updatedAt: row.updatedAt.toISOString() }
}
