import { emitAudit } from '@/lib/audit/audit'
import { isUniqueViolation } from '@/lib/api/unique-violation'
import type { RequestMeta } from '@/lib/auth/request-meta'
import type { SessionUser } from '@/lib/auth/types'
import {
  buildCatalogMatcher,
  cleanCatalogName,
  deviceSnapshotText,
  isBrandVisible,
  isModelVisible,
  normalizeCatalogName,
  passesRecentYears,
  type CatalogFilter,
  type CatalogMatchEntry,
  type DeviceAssetKind,
  type DeviceCatalogStatusCode,
} from '@/lib/device-catalog/catalog'
import { rapidApiConfigFromEnv } from '@/lib/device-catalog/rapidapi-client'
import type { DeviceBrandListQuery, DeviceModelListQuery } from '@/lib/device-catalog/schemas'
import { getCatalogFilter } from '@/lib/device-catalog/settings-queries'
import type {
  DeviceBrandDto,
  DeviceBrandListDto,
  DeviceCatalogBulkResultDto,
  DeviceCatalogSummaryDto,
  DeviceModelListDto,
  DeviceModelOptionDto,
  DeviceModelRowDto,
} from '@/lib/device-catalog/types'
import type { Prisma } from '@/lib/generated/prisma/client'
import { prisma } from '@/lib/prisma'
import { SettingsError } from '@/lib/settings/errors'

/**
 * ชั้นข้อมูลแคตตาล็อก Model Phone (มติ PO U155 → U159 · `13` §6.18) — กรอง `organization_id` เสมอ
 *
 * การแสดงในตัวเลือก **คำนวณตอนอ่าน** (U159): `manual_status` ที่ผู้ดูแลตั้งชนะเสมอ ไม่งั้นตามตัวกรองในค่าตั้ง
 * (แบรนด์ในรายชื่อ + รุ่นออกภายใน N ปี) · ปิดแบรนด์ = ทุกรุ่นไม่แสดง · ตัว where ด้านล่างต้องตรงกับ
 * `isBrandVisible()`/`isModelVisible()` (pure) เสมอ — เทสต์ DB เทียบสองทางนี้
 *
 * ทุก mutation อยู่ใน `$transaction` เดียวกับ `emitAudit()` · เหตุผลไม่บังคับ (ตารางไม่อ่อนไหว — reason-policy)
 */

export interface DeviceCatalogMutationContext {
  actor: SessionUser
  meta: RequestMeta
  reason: string | null
}

// ─── where ของการแสดง (ต้องตรงกับ pure ใน catalog.ts) ───────────────────

export function brandVisibleWhere(filter: CatalogFilter): Prisma.DeviceBrandWhereInput {
  return { OR: [{ manualStatus: 'active' }, { manualStatus: null, nameKey: { in: [...filter.brandKeys] } }] }
}

export function brandHiddenWhere(filter: CatalogFilter): Prisma.DeviceBrandWhereInput {
  return { OR: [{ manualStatus: 'hidden' }, { manualStatus: null, nameKey: { notIn: [...filter.brandKeys] } }] }
}

/** รุ่นผ่านเงื่อนไขของตัวเอง (ไม่นับแบรนด์) */
function modelSelfVisibleWhere(filter: CatalogFilter): Prisma.DeviceModelWhereInput {
  return {
    OR: [
      { manualStatus: 'active' },
      { manualStatus: null, OR: [{ releaseYear: null }, { releaseYear: { gte: filter.minReleaseYear } }] },
    ],
  }
}

export function modelVisibleWhere(filter: CatalogFilter): Prisma.DeviceModelWhereInput {
  return { AND: [modelSelfVisibleWhere(filter), { brand: brandVisibleWhere(filter) }] }
}

/** เขียนตรง ๆ ไม่ใช้ NOT — NOT บนคอลัมน์ NULL ให้ผล NULL แล้วแถวหลุด */
export function modelHiddenWhere(filter: CatalogFilter): Prisma.DeviceModelWhereInput {
  return {
    OR: [
      { brand: brandHiddenWhere(filter) },
      { manualStatus: 'hidden' },
      { manualStatus: null, releaseYear: { lt: filter.minReleaseYear } },
    ],
  }
}

// ─── mapper ───────────────────────────────────────────────────────

const modelSelect = {
  id: true,
  brandId: true,
  assetKind: true,
  name: true,
  manualStatus: true,
  source: true,
  releaseYear: true,
  nameEditedAt: true,
  createdAt: true,
  updatedAt: true,
  brand: { select: { name: true, nameKey: true, manualStatus: true } },
} satisfies Prisma.DeviceModelSelect

type ModelRow = Prisma.DeviceModelGetPayload<{ select: typeof modelSelect }>

function toModelDto(row: ModelRow, filter: CatalogFilter): DeviceModelRowDto {
  const brandVisible = isBrandVisible(row.brand, filter)
  return {
    id: row.id,
    brandId: row.brandId,
    brandName: row.brand.name,
    brandVisible,
    assetKind: row.assetKind,
    name: row.name,
    visible: isModelVisible(row, brandVisible, filter),
    filterVisible: passesRecentYears(row.releaseYear, filter),
    manualStatus: row.manualStatus,
    source: row.source,
    releaseYear: row.releaseYear,
    nameEdited: row.nameEditedAt !== null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  }
}

/** คำค้นหลายคำ — ทุกคำต้องเจอในชื่อแบรนด์หรือชื่อรุ่น ("samsung s24" เจอ Samsung Galaxy S24) */
function modelSearchWhere(q: string | undefined): Prisma.DeviceModelWhereInput {
  const tokens = (q ?? '').split(/\s+/).filter((token) => token !== '')
  if (tokens.length === 0) return {}
  return {
    AND: tokens.map((token) => ({
      OR: [
        { name: { contains: token, mode: 'insensitive' as const } },
        { nameKey: { contains: normalizeCatalogName(token) } },
        { brand: { name: { contains: token, mode: 'insensitive' as const } } },
      ],
    })),
  }
}

function auditBase(context: DeviceCatalogMutationContext) {
  return {
    organizationId: context.actor.organizationId,
    actorId: context.actor.id,
    actorRole: context.actor.roleName,
    reason: context.reason,
    ipAddress: context.meta.ipAddress,
    userAgent: context.meta.userAgent,
  }
}

// ─── อ่าน (หน้า Model Phone) ──────────────────────────────────────

export async function listDeviceBrands(organizationId: string, query: DeviceBrandListQuery): Promise<DeviceBrandListDto> {
  const filter = await getCatalogFilter(organizationId)
  const where: Prisma.DeviceBrandWhereInput = {
    organizationId,
    deletedAt: null,
    AND: [
      query.visibility === 'visible'
        ? brandVisibleWhere(filter)
        : query.visibility === 'hidden'
          ? brandHiddenWhere(filter)
          : query.visibility === 'manual'
            ? { manualStatus: { not: null } }
            : {},
      query.q === undefined || query.q === ''
        ? {}
        : {
            OR: [
              { name: { contains: query.q, mode: 'insensitive' } },
              { nameKey: { contains: normalizeCatalogName(query.q) } },
            ],
          },
    ],
  }
  const [rows, total] = await Promise.all([
    prisma.deviceBrand.findMany({
      where,
      orderBy: { name: 'asc' },
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
      select: { id: true, name: true, nameKey: true, manualStatus: true, source: true, lastSyncedAt: true },
    }),
    prisma.deviceBrand.count({ where }),
  ])
  const ids = rows.map((row) => row.id)
  const [allCounts, visibleCounts] =
    ids.length === 0
      ? [[], []]
      : await Promise.all([
          prisma.deviceModel.groupBy({ by: ['brandId'], where: { brandId: { in: ids }, deletedAt: null }, _count: { _all: true } }),
          prisma.deviceModel.groupBy({
            by: ['brandId'],
            where: { brandId: { in: ids }, deletedAt: null, ...modelSelfVisibleWhere(filter) },
            _count: { _all: true },
          }),
        ])
  const items: DeviceBrandDto[] = rows.map((row) => ({
    id: row.id,
    name: row.name,
    visible: isBrandVisible(row, filter),
    filterVisible: filter.brandKeys.has(row.nameKey),
    manualStatus: row.manualStatus,
    source: row.source,
    modelCount: allCounts.find((group) => group.brandId === row.id)?._count._all ?? 0,
    visibleModelCount: visibleCounts.find((group) => group.brandId === row.id)?._count._all ?? 0,
    lastSyncedAt: row.lastSyncedAt?.toISOString() ?? null,
  }))
  return { items, total, page: query.page, pageSize: query.pageSize }
}

export async function listDeviceModels(organizationId: string, query: DeviceModelListQuery): Promise<DeviceModelListDto> {
  const filter = await getCatalogFilter(organizationId)
  const where: Prisma.DeviceModelWhereInput = {
    organizationId,
    deletedAt: null,
    brand: { deletedAt: null },
    ...(query.assetKind === 'all' ? {} : { assetKind: query.assetKind }),
    ...(query.brandId === undefined ? {} : { brandId: query.brandId }),
    AND: [
      query.visibility === 'visible'
        ? modelVisibleWhere(filter)
        : query.visibility === 'hidden'
          ? modelHiddenWhere(filter)
          : query.visibility === 'manual'
            ? { manualStatus: { not: null } }
            : {},
      modelSearchWhere(query.q),
    ],
  }
  const [rows, total] = await Promise.all([
    prisma.deviceModel.findMany({
      where,
      orderBy: [{ brand: { name: 'asc' } }, { releaseYear: { sort: 'desc', nulls: 'last' } }, { name: 'asc' }],
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
      select: modelSelect,
    }),
    prisma.deviceModel.count({ where }),
  ])
  return { items: rows.map((row) => toModelDto(row, filter)), total, page: query.page, pageSize: query.pageSize }
}

export async function getDeviceCatalogSummary(organizationId: string): Promise<DeviceCatalogSummaryDto> {
  const filter = await getCatalogFilter(organizationId)
  const [brandCount, visibleBrandCount, modelCount, visibleModelCount, brandsPendingFirstSync, lastJob] = await Promise.all([
    prisma.deviceBrand.count({ where: { organizationId, deletedAt: null } }),
    prisma.deviceBrand.count({ where: { organizationId, deletedAt: null, ...brandVisibleWhere(filter) } }),
    prisma.deviceModel.count({ where: { organizationId, deletedAt: null } }),
    prisma.deviceModel.count({ where: { organizationId, deletedAt: null, brand: { deletedAt: null }, ...modelVisibleWhere(filter) } }),
    prisma.deviceBrand.count({ where: { organizationId, deletedAt: null, externalId: { not: null }, lastSyncedAt: null } }),
    prisma.job.findFirst({
      where: { jobType: 'device_catalog_sync', OR: [{ organizationId }, { organizationId: null }] },
      orderBy: { createdAt: 'desc' },
      select: { status: true, completedAt: true, result: true },
    }),
  ])
  const result = lastJob?.result
  return {
    brandCount,
    visibleBrandCount,
    modelCount,
    visibleModelCount,
    brandsPendingFirstSync,
    minReleaseYear: filter.minReleaseYear,
    lastJob:
      lastJob === null
        ? null
        : {
            status: lastJob.status,
            finishedAt: lastJob.completedAt?.toISOString() ?? null,
            result:
              result !== null && typeof result === 'object' && !Array.isArray(result)
                ? (result as Record<string, unknown>)
                : null,
          },
    apiConfigured: rapidApiConfigFromEnv() !== null,
  }
}

// ─── ตัวเลือกของฟอร์มรับเคส ───────────────────────────────────────

/**
 * ค้นหารุ่นสำหรับ combobox ในฟอร์มรับเคส — เฉพาะรายการที่แสดง (แบรนด์แสดง + รุ่นแสดง)
 * ไม่มีผล/เรียกไม่สำเร็จ ฟอร์มยังให้ "ระบุเอง" ได้เสมอ
 */
export async function searchDeviceModelOptions(
  organizationId: string,
  params: { assetKind?: DeviceAssetKind | undefined; q: string; limit: number },
): Promise<DeviceModelOptionDto[]> {
  const filter = await getCatalogFilter(organizationId)
  const rows = await prisma.deviceModel.findMany({
    where: {
      organizationId,
      deletedAt: null,
      brand: { deletedAt: null },
      ...(params.assetKind === undefined ? {} : { assetKind: params.assetKind }),
      AND: [modelVisibleWhere(filter), modelSearchWhere(params.q)],
    },
    orderBy: [{ releaseYear: { sort: 'desc', nulls: 'last' } }, { brand: { name: 'asc' } }, { name: 'asc' }],
    take: params.limit,
    select: { id: true, name: true, brand: { select: { name: true } } },
  })
  return rows.map((row) => ({
    id: row.id,
    brandName: row.brand.name,
    name: row.name,
    label: deviceSnapshotText(row.brand.name, row.name),
  }))
}

// ─── เขียน: แบรนด์ ────────────────────────────────────────────────

export async function createManualDeviceBrand(
  context: DeviceCatalogMutationContext,
  values: { name: string },
): Promise<{ id: string; name: string }> {
  const organizationId = context.actor.organizationId
  const name = cleanCatalogName(values.name)
  const nameKey = normalizeCatalogName(name)
  const duplicate = await prisma.deviceBrand.findUnique({
    where: { organizationId_nameKey: { organizationId, nameKey } },
    select: { id: true },
  })
  if (duplicate !== null) throw new SettingsError('DUPLICATE_DEVICE_CATALOG_ITEM', { detail: `brand=${nameKey}` })
  try {
    return await prisma.$transaction(async (tx) => {
      // แบรนด์ที่ผู้ดูแลเพิ่มเอง = ตั้งให้แสดงด้วยมือ (ไม่ขึ้นกับรายชื่อของตัวกรอง)
      const row = await tx.deviceBrand.create({
        data: { organizationId, name, nameKey, manualStatus: 'active', source: 'manual', createdBy: context.actor.id },
        select: { id: true, name: true },
      })
      await emitAudit(
        {
          ...auditBase(context),
          action: 'create',
          targetType: 'device_brands',
          targetId: row.id,
          after: { name, manual_status: 'active', source: 'manual' },
        },
        tx,
      )
      return row
    })
  } catch (error) {
    if (isUniqueViolation(error)) throw new SettingsError('DUPLICATE_DEVICE_CATALOG_ITEM', { detail: 'race' })
    throw error
  }
}

/** แก้ชื่อ / ตั้งการแสดงด้วยมือของแบรนด์ (`null` = กลับไปตามตัวกรอง) */
export async function updateDeviceBrand(
  context: DeviceCatalogMutationContext,
  brandId: string,
  values: { name?: string | undefined; manualStatus?: DeviceCatalogStatusCode | null | undefined },
): Promise<{ id: string; name: string; manualStatus: DeviceCatalogStatusCode | null }> {
  const organizationId = context.actor.organizationId
  const brand = await prisma.deviceBrand.findFirst({
    where: { id: brandId, organizationId, deletedAt: null },
    select: { id: true, name: true, manualStatus: true },
  })
  if (brand === null) throw new SettingsError('DEVICE_CATALOG_ITEM_NOT_FOUND', { detail: `device_brand=${brandId}` })

  const data: Prisma.DeviceBrandUpdateInput = {}
  const before: Record<string, unknown> = {}
  const after: Record<string, unknown> = {}
  if (values.name !== undefined && cleanCatalogName(values.name) !== brand.name) {
    const name = cleanCatalogName(values.name)
    const nameKey = normalizeCatalogName(name)
    const clash = await prisma.deviceBrand.findUnique({
      where: { organizationId_nameKey: { organizationId, nameKey } },
      select: { id: true },
    })
    if (clash !== null && clash.id !== brandId) {
      throw new SettingsError('DUPLICATE_DEVICE_CATALOG_ITEM', { detail: `brand=${nameKey}` })
    }
    data.name = name
    data.nameKey = nameKey
    before.name = brand.name
    after.name = name
  }
  if (values.manualStatus !== undefined && values.manualStatus !== brand.manualStatus) {
    data.manualStatus = values.manualStatus
    before.manual_status = brand.manualStatus
    after.manual_status = values.manualStatus
  }
  if (Object.keys(after).length === 0) return brand

  try {
    return await prisma.$transaction(async (tx) => {
      const updated = await tx.deviceBrand.update({
        where: { id: brandId },
        data: { ...data, updatedBy: context.actor.id },
        select: { id: true, name: true, manualStatus: true },
      })
      await emitAudit(
        {
          ...auditBase(context),
          action: Object.keys(after).length === 1 && 'manual_status' in after ? 'status_change' : 'update',
          targetType: 'device_brands',
          targetId: brandId,
          before,
          after,
        },
        tx,
      )
      return updated
    })
  } catch (error) {
    if (isUniqueViolation(error)) throw new SettingsError('DUPLICATE_DEVICE_CATALOG_ITEM', { detail: 'race' })
    throw error
  }
}

// ─── เขียน: รุ่น ──────────────────────────────────────────────────

async function findModel(organizationId: string, modelId: string): Promise<ModelRow> {
  const row = await prisma.deviceModel.findFirst({
    where: { id: modelId, organizationId, deletedAt: null },
    select: modelSelect,
  })
  if (row === null) throw new SettingsError('DEVICE_CATALOG_ITEM_NOT_FOUND', { detail: `device_model=${modelId}` })
  return row
}

/** เพิ่มรุ่นเอง (manual) ใต้แบรนด์ที่มีอยู่ — ตั้งให้แสดงด้วยมือ (ไม่ขึ้นกับตัวกรองปี) */
export async function createManualDeviceModel(
  context: DeviceCatalogMutationContext,
  values: { brandId: string; assetKind: DeviceAssetKind; name: string; releaseYear?: number | null | undefined },
): Promise<DeviceModelRowDto> {
  const organizationId = context.actor.organizationId
  const brand = await prisma.deviceBrand.findFirst({
    where: { id: values.brandId, organizationId, deletedAt: null },
    select: { id: true, name: true },
  })
  if (brand === null) throw new SettingsError('DEVICE_CATALOG_ITEM_NOT_FOUND', { detail: `device_brand=${values.brandId}` })
  const name = cleanCatalogName(values.name)
  const nameKey = normalizeCatalogName(name)
  const duplicate = await prisma.deviceModel.findUnique({
    where: { brandId_nameKey: { brandId: brand.id, nameKey } },
    select: { id: true },
  })
  if (duplicate !== null) throw new SettingsError('DUPLICATE_DEVICE_CATALOG_ITEM', { detail: `model=${nameKey}` })

  const filter = await getCatalogFilter(organizationId)
  try {
    return await prisma.$transaction(async (tx) => {
      const created = await tx.deviceModel.create({
        data: {
          organizationId,
          brandId: brand.id,
          assetKind: values.assetKind,
          name,
          nameKey,
          manualStatus: 'active',
          source: 'manual',
          releaseYear: values.releaseYear ?? null,
          createdBy: context.actor.id,
        },
        select: modelSelect,
      })
      await emitAudit(
        {
          ...auditBase(context),
          action: 'create',
          targetType: 'device_models',
          targetId: created.id,
          after: {
            brand: brand.name,
            asset_kind: values.assetKind,
            name,
            release_year: values.releaseYear ?? null,
            manual_status: 'active',
            source: 'manual',
          },
        },
        tx,
      )
      return toModelDto(created, filter)
    })
  } catch (error) {
    if (isUniqueViolation(error)) throw new SettingsError('DUPLICATE_DEVICE_CATALOG_ITEM', { detail: 'race' })
    throw error
  }
}

/** แก้ชื่อ/ประเภท/ปีที่ออก/การแสดงด้วยมือ ของรุ่นเดียว — แก้ชื่อ = job ไม่ทับชื่ออีก (`name_edited_at`) */
export async function updateDeviceModel(
  context: DeviceCatalogMutationContext,
  modelId: string,
  values: {
    name?: string | undefined
    assetKind?: DeviceAssetKind | undefined
    manualStatus?: DeviceCatalogStatusCode | null | undefined
    releaseYear?: number | null | undefined
  },
): Promise<DeviceModelRowDto> {
  const organizationId = context.actor.organizationId
  const current = await findModel(organizationId, modelId)
  const filter = await getCatalogFilter(organizationId)

  const data: Prisma.DeviceModelUpdateInput = {}
  const before: Record<string, unknown> = {}
  const after: Record<string, unknown> = {}
  if (values.name !== undefined && cleanCatalogName(values.name) !== current.name) {
    const name = cleanCatalogName(values.name)
    const nameKey = normalizeCatalogName(name)
    const clash = await prisma.deviceModel.findUnique({
      where: { brandId_nameKey: { brandId: current.brandId, nameKey } },
      select: { id: true },
    })
    if (clash !== null && clash.id !== modelId) {
      throw new SettingsError('DUPLICATE_DEVICE_CATALOG_ITEM', { detail: `model=${nameKey}` })
    }
    data.name = name
    data.nameKey = nameKey
    data.nameEditedAt = new Date()
    before.name = current.name
    after.name = name
  }
  if (values.assetKind !== undefined && values.assetKind !== current.assetKind) {
    data.assetKind = values.assetKind
    before.asset_kind = current.assetKind
    after.asset_kind = values.assetKind
  }
  if (values.releaseYear !== undefined && values.releaseYear !== current.releaseYear) {
    data.releaseYear = values.releaseYear
    before.release_year = current.releaseYear
    after.release_year = values.releaseYear
  }
  if (values.manualStatus !== undefined && values.manualStatus !== current.manualStatus) {
    data.manualStatus = values.manualStatus
    before.manual_status = current.manualStatus
    after.manual_status = values.manualStatus
  }
  if (Object.keys(after).length === 0) return toModelDto(current, filter)

  try {
    return await prisma.$transaction(async (tx) => {
      const updated = await tx.deviceModel.update({
        where: { id: modelId },
        data: { ...data, updatedBy: context.actor.id },
        select: modelSelect,
      })
      await emitAudit(
        {
          ...auditBase(context),
          action: Object.keys(after).length === 1 && 'manual_status' in after ? 'status_change' : 'update',
          targetType: 'device_models',
          targetId: modelId,
          before,
          after,
        },
        tx,
      )
      return toModelDto(updated, filter)
    })
  } catch (error) {
    if (isUniqueViolation(error)) throw new SettingsError('DUPLICATE_DEVICE_CATALOG_ITEM', { detail: 'race' })
    throw error
  }
}

/** ตั้งการแสดงด้วยมือหลายรุ่น (`null` = กลับไปตามตัวกรอง) · id นอกองค์กร = ไม่พบ (ไม่แตะอะไรเลย) */
export async function bulkSetDeviceModelManualStatus(
  context: DeviceCatalogMutationContext,
  ids: readonly string[],
  manualStatus: DeviceCatalogStatusCode | null,
): Promise<DeviceCatalogBulkResultDto> {
  const organizationId = context.actor.organizationId
  const uniqueIds = [...new Set(ids)]
  const rows = await prisma.deviceModel.findMany({
    where: { id: { in: uniqueIds }, organizationId, deletedAt: null },
    select: { id: true, manualStatus: true },
  })
  if (rows.length !== uniqueIds.length) throw new SettingsError('DEVICE_CATALOG_ITEM_NOT_FOUND', { detail: 'bulk' })
  const targets = rows.filter((row) => row.manualStatus !== manualStatus)
  if (targets.length === 0) return { updated: 0, unchanged: rows.length }

  let updated = 0
  await prisma.$transaction(async (tx) => {
    for (const row of targets) {
      // conditional update — อีกคนเปลี่ยนไปก่อน (ค่าไม่ตรงที่อ่าน) = ข้าม
      const changed = await tx.deviceModel.updateMany({
        where: { id: row.id, manualStatus: row.manualStatus },
        data: { manualStatus, updatedBy: context.actor.id },
      })
      if (changed.count === 0) continue
      updated += 1
      await emitAudit(
        {
          ...auditBase(context),
          action: 'status_change',
          targetType: 'device_models',
          targetId: row.id,
          before: { manual_status: row.manualStatus },
          after: { manual_status: manualStatus },
        },
        tx,
      )
    }
  })
  return { updated, unchanged: rows.length - updated }
}

// ─── ใช้กับเคส (ฟอร์ม/นำเข้า) ───────────────────────────────────────

export interface DeviceSelection {
  deviceModelId: string | null
  /** ข้อความ snapshot ที่เก็บลง `cases.asset_description` */
  text: string | null
}

/**
 * ตรวจรุ่นที่ฟอร์มเลือกมา — ต้องเป็นรุ่นที่แสดงอยู่ขององค์กรเดียวกัน และประเภททรัพย์ตรงกัน
 * ผ่าน = เก็บ id + ข้อความจากแคตตาล็อก (snapshot) · ไม่ผ่าน (ไม่แสดงแล้ว/ประเภทไม่ตรง) = **ไม่บล็อก**:
 * ทิ้ง id แล้วเก็บข้อความที่ผู้ใช้ส่งมาตามเดิม (มติ PO U155 — ห้ามบล็อกการรับเคส)
 */
export async function resolveDeviceSelection(
  organizationId: string,
  assetKind: DeviceAssetKind | null,
  deviceModelId: string | null,
  text: string | null,
): Promise<DeviceSelection> {
  if (deviceModelId === null) return { deviceModelId: null, text }
  const filter = await getCatalogFilter(organizationId)
  const row = await prisma.deviceModel.findFirst({
    where: {
      id: deviceModelId,
      organizationId,
      deletedAt: null,
      brand: { deletedAt: null },
      ...(assetKind === null ? {} : { assetKind }),
      ...modelVisibleWhere(filter),
    },
    select: { id: true, name: true, brand: { select: { name: true } } },
  })
  if (row === null) return { deviceModelId: null, text }
  return { deviceModelId: row.id, text: deviceSnapshotText(row.brand.name, row.name) }
}

/** ตัวจับคู่ข้อความนำเข้า — โหลดรุ่นที่แสดงอยู่ทั้งองค์กรครั้งเดียวต่อไฟล์ */
export async function loadCatalogMatcher(
  organizationId: string,
): Promise<(text: string, assetKind: DeviceAssetKind | null) => CatalogMatchEntry | null> {
  const filter = await getCatalogFilter(organizationId)
  const rows = await prisma.deviceModel.findMany({
    where: { organizationId, deletedAt: null, brand: { deletedAt: null }, ...modelVisibleWhere(filter) },
    select: { id: true, name: true, assetKind: true, brand: { select: { name: true } } },
  })
  return buildCatalogMatcher(
    rows.map((row) => ({ modelId: row.id, assetKind: row.assetKind, brandName: row.brand.name, modelName: row.name })),
  )
}
