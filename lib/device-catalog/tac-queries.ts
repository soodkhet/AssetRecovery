import { emitAudit, type AuditClient } from '@/lib/audit/audit'
import { classifyDeviceKind, deviceSnapshotText } from '@/lib/device-catalog/catalog'
import { DEVICE_TAC_SYNC_JOB_TYPE } from '@/lib/device-catalog/permissions'
import type { DeviceCatalogMutationContext } from '@/lib/device-catalog/queries'
import { splitBrandModelText, tacLabel, tacOfImei, TAC_LENGTH } from '@/lib/device-catalog/tac'
import type { DeviceTacBindInput, DeviceTacListQuery } from '@/lib/device-catalog/schemas'
import type {
  DeviceCatalogSyncRequestDto,
  DeviceTacHistoryDto,
  DeviceTacListDto,
  DeviceTacLookupDto,
  DeviceTacRowDto,
  DeviceTacUpdateDto,
} from '@/lib/device-catalog/types'
import type { Prisma } from '@/lib/generated/prisma/client'
import { enqueueJob } from '@/lib/jobs/engine'
import { prisma } from '@/lib/prisma'
import { SettingsError } from '@/lib/settings/errors'

/**
 * ชั้นข้อมูลฐาน TAC (มติ PO U166 · U167 · DEC-017 · `13` §6.18 · `38` §6.2) — กรอง `organization_id` เสมอ
 *
 * - ฟอร์มรับเคส: {@link lookupDeviceTac} — IMEI → TAC 8 หลัก → ยี่ห้อ/รุ่น (+ รุ่นในแคตตาล็อกที่ผูก)
 * - ระบบจำ: {@link learnDeviceTacFromCase} — TAC ที่ยังไม่มี + ผู้ใช้เลือก/พิมพ์รุ่นเอง ⇒ แถว `learned` (ไม่ทับแถวเดิม)
 * - ผู้ดูแล: ค้นหา/ผูก TAC เอง ({@link bindDeviceTac} — `manual` ทับได้ทุกแหล่ง เพราะเป็นการตัดสินของผู้ดูแล)
 * - ประวัติ (U167): {@link getDeviceTacHistory}
 */

const TAC_ROW_SELECT = {
  id: true,
  tac: true,
  brandName: true,
  modelName: true,
  variant: true,
  releaseYear: true,
  source: true,
  deviceModelId: true,
  createdAt: true,
  deviceModel: { select: { name: true, brand: { select: { name: true } } } },
  createdByUser: { select: { fullName: true } },
} satisfies Prisma.DeviceTacSelect

type TacRow = Prisma.DeviceTacGetPayload<{ select: typeof TAC_ROW_SELECT }>

function toTacRow(row: TacRow): DeviceTacRowDto {
  return {
    id: row.id,
    tac: row.tac,
    brandName: row.brandName,
    modelName: row.modelName,
    variant: row.variant,
    releaseYear: row.releaseYear,
    source: row.source,
    deviceModelId: row.deviceModelId,
    deviceModelLabel: row.deviceModel === null ? null : deviceSnapshotText(row.deviceModel.brand.name, row.deviceModel.name),
    createdAt: row.createdAt.toISOString(),
    createdByName: row.createdByUser?.fullName ?? null,
  }
}

// ─── ฟอร์มรับเคส ──────────────────────────────────────────────────

/** IMEI (ผ่าน `parseImei()` แล้ว) → ยี่ห้อ/รุ่นจากฐาน TAC · ไม่พบ = `found: false` (ฟอร์มให้เลือก/พิมพ์เอง) */
export async function lookupDeviceTac(organizationId: string, imei: string): Promise<DeviceTacLookupDto> {
  const tac = tacOfImei(imei) ?? ''
  const row = await prisma.deviceTac.findFirst({
    where: { organizationId, tac, deletedAt: null },
    select: {
      brandName: true,
      modelName: true,
      variant: true,
      releaseYear: true,
      source: true,
      deviceModelId: true,
      deviceModel: { select: { name: true, assetKind: true, deletedAt: true, brand: { select: { name: true, deletedAt: true } } } },
    },
  })
  if (row === null) {
    return {
      tac,
      found: false,
      brandName: null,
      modelName: null,
      variant: null,
      releaseYear: null,
      source: null,
      deviceModelId: null,
      assetKind: null,
      label: null,
    }
  }
  const model = row.deviceModel !== null && row.deviceModel.deletedAt === null && row.deviceModel.brand.deletedAt === null ? row.deviceModel : null
  return {
    tac,
    found: true,
    brandName: row.brandName,
    modelName: row.modelName,
    variant: row.variant,
    releaseYear: row.releaseYear,
    source: row.source,
    deviceModelId: model === null ? null : row.deviceModelId,
    assetKind: model?.assetKind ?? classifyDeviceKind(row.modelName),
    // ข้อความตามรุ่นในแคตตาล็อก (ผู้ดูแลอาจแก้ชื่อ) — ไม่ผูก = ตามแถว TAC
    label: model === null ? tacLabel(row.brandName, row.modelName) : deviceSnapshotText(model.brand.name, model.name),
  }
}

/** ส่วนของ client ที่การจำ TAC ใช้ — รับ `tx` ของ `$transaction` ของการบันทึกเคสได้ */
type LearnClient = Pick<Omit<typeof prisma, '$connect' | '$disconnect' | '$on' | '$transaction' | '$extends'>, 'deviceTac' | 'deviceModel'> &
  AuditClient

/**
 * ระบบจำ TAC → รุ่น จากงานจริง (มติ PO U166) — เรียกในทรานแซกชันเดียวกับการบันทึกเคส (ฟอร์ม)
 * จำเฉพาะเมื่อ: IMEI 15 หลัก · TAC นี้**ยังไม่มีแถว** (ไม่ทับฐาน TAC/ที่จำไว้/ที่ผู้ดูแลผูก) · มีรุ่นที่เลือกจากรายการ
 * หรือข้อความ "ยี่ห้อ รุ่น" ที่แยกได้ · คืน `true` เมื่อจำใหม่
 */
export async function learnDeviceTacFromCase(
  client: LearnClient,
  input: {
    organizationId: string
    imei: string | null
    deviceModelId: string | null
    text: string | null
    caseId: string
    actorId: string
    actorRole: string
  },
): Promise<boolean> {
  const tac = tacOfImei(input.imei)
  if (tac === null) return false
  const existing = await client.deviceTac.findFirst({ where: { organizationId: input.organizationId, tac }, select: { id: true } })
  if (existing !== null) return false

  let brandName: string
  let modelName: string
  let releaseYear: number | null = null
  let deviceModelId: string | null = null
  if (input.deviceModelId !== null) {
    const model = await client.deviceModel.findFirst({
      where: { id: input.deviceModelId, organizationId: input.organizationId, deletedAt: null },
      select: { id: true, name: true, releaseYear: true, brand: { select: { name: true } } },
    })
    if (model === null) return false
    brandName = model.brand.name
    modelName = model.name
    releaseYear = model.releaseYear
    deviceModelId = model.id
  } else {
    const split = splitBrandModelText(input.text)
    if (split === null) return false
    brandName = split.brand
    modelName = split.model
  }

  const created = await client.deviceTac.createMany({
    data: [
      {
        organizationId: input.organizationId,
        tac,
        brandName,
        modelName,
        releaseYear,
        source: 'learned',
        deviceModelId,
        createdBy: input.actorId,
      },
    ],
    skipDuplicates: true,
  })
  if (created.count === 0) return false
  await emitAudit(
    {
      organizationId: input.organizationId,
      actorId: input.actorId,
      actorRole: input.actorRole,
      action: 'create',
      targetType: 'device_tacs',
      targetId: null,
      after: { tac, brand_name: brandName, model_name: modelName, device_model_id: deviceModelId, source: 'learned', case_id: input.caseId },
      reason: 'ระบบจำยี่ห้อ/รุ่นจาก IMEI ที่ผู้ใช้เลือกตอนบันทึกเคส',
    },
    client,
  )
  return true
}

// ─── หน้า Model Phone: แท็บ TAC ───────────────────────────────────

export async function listDeviceTacs(organizationId: string, query: DeviceTacListQuery): Promise<DeviceTacListDto> {
  const q = (query.q ?? '').trim()
  const digits = q.replace(/[\s\-.]/g, '')
  const textTokens = /^\d+$/.test(digits) ? [] : q.split(/\s+/).filter((token) => token !== '')
  const where: Prisma.DeviceTacWhereInput = {
    organizationId,
    deletedAt: null,
    ...(query.source === 'all' ? {} : { source: query.source }),
    ...(/^\d+$/.test(digits) && digits !== '' ? { tac: { startsWith: digits.slice(0, TAC_LENGTH) } } : {}),
    AND: textTokens.map((token) => ({
      OR: [
        { brandName: { contains: token, mode: 'insensitive' as const } },
        { modelName: { contains: token, mode: 'insensitive' as const } },
        { variant: { contains: token, mode: 'insensitive' as const } },
      ],
    })),
  }
  const [rows, total] = await Promise.all([
    prisma.deviceTac.findMany({
      where,
      orderBy: [{ tac: 'asc' }],
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
      select: TAC_ROW_SELECT,
    }),
    prisma.deviceTac.count({ where }),
  ])
  return { items: rows.map(toTacRow), total, page: query.page, pageSize: query.pageSize }
}

/**
 * ผู้ดูแลเพิ่ม/ผูก TAC เอง (มติ PO U166 ชั้นที่ 3) — ผูกกับรุ่นในแคตตาล็อก · TAC เดิมมีอยู่ (ทุกแหล่ง) = แก้เป็นแหล่ง `manual`
 * (การตัดสินของผู้ดูแลชนะ · job ไม่ทับเพราะเพิ่มเฉพาะ TAC ใหม่)
 */
export async function bindDeviceTac(context: DeviceCatalogMutationContext, input: DeviceTacBindInput): Promise<DeviceTacRowDto> {
  const organizationId = context.actor.organizationId
  // schema แปลง/ตรวจรูปแบบ 8 หลักแล้ว (`deviceTacBindSchema`)
  const tac = input.tac
  const model = await prisma.deviceModel.findFirst({
    where: { id: input.deviceModelId, organizationId, deletedAt: null, brand: { deletedAt: null } },
    select: { id: true, name: true, releaseYear: true, brand: { select: { name: true } } },
  })
  if (model === null) throw new SettingsError('DEVICE_CATALOG_ITEM_NOT_FOUND', { detail: `model=${input.deviceModelId}` })

  return prisma.$transaction(async (tx) => {
    const before = await tx.deviceTac.findUnique({
      where: { organizationId_tac: { organizationId, tac } },
      select: { id: true, brandName: true, modelName: true, source: true, deviceModelId: true, deletedAt: true },
    })
    const data = {
      brandName: model.brand.name,
      modelName: model.name,
      releaseYear: model.releaseYear,
      source: 'manual' as const,
      deviceModelId: model.id,
      deletedAt: null,
      updatedBy: context.actor.id,
    }
    const saved = await tx.deviceTac.upsert({
      where: { organizationId_tac: { organizationId, tac } },
      create: { organizationId, tac, ...data, createdBy: context.actor.id },
      update: data,
      select: TAC_ROW_SELECT,
    })
    await emitAudit(
      {
        organizationId,
        actorId: context.actor.id,
        actorRole: context.actor.roleName,
        action: before === null ? 'create' : 'update',
        targetType: 'device_tacs',
        targetId: saved.id,
        before:
          before === null
            ? null
            : { tac, brand_name: before.brandName, model_name: before.modelName, source: before.source, device_model_id: before.deviceModelId },
        after: { tac, brand_name: data.brandName, model_name: data.modelName, source: 'manual', device_model_id: model.id },
        reason: context.reason,
        ipAddress: context.meta.ipAddress,
        userAgent: context.meta.userAgent,
      },
      tx,
    )
    return toTacRow(saved)
  })
}

// ─── ประวัติการอัปเดต (U167) ───────────────────────────────────────

function stringList(value: Prisma.JsonValue): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : []
}

export async function getDeviceTacHistory(organizationId: string, limit = 50): Promise<DeviceTacHistoryDto> {
  const [updates, learned] = await Promise.all([
    prisma.deviceTacUpdate.findMany({
      where: { organizationId },
      orderBy: { createdAt: 'desc' },
      take: limit,
      select: {
        id: true,
        createdAt: true,
        trigger: true,
        status: true,
        sourceSha: true,
        sourceUpdatedAt: true,
        fileRows: true,
        tacsAdded: true,
        brandsAdded: true,
        modelsAdded: true,
        addedModels: true,
        errorMessage: true,
        createdByUser: { select: { fullName: true } },
      },
    }),
    prisma.deviceTac.findMany({
      where: { organizationId, source: 'learned', deletedAt: null },
      orderBy: { createdAt: 'desc' },
      take: limit,
      select: TAC_ROW_SELECT,
    }),
  ])
  return {
    updates: updates.map(
      (row): DeviceTacUpdateDto => ({
        id: row.id,
        createdAt: row.createdAt.toISOString(),
        trigger: row.trigger,
        status: row.status,
        actorName: row.createdByUser?.fullName ?? null,
        sourceSha: row.sourceSha,
        sourceUpdatedAt: row.sourceUpdatedAt?.toISOString() ?? null,
        fileRows: row.fileRows,
        tacsAdded: row.tacsAdded,
        brandsAdded: row.brandsAdded,
        modelsAdded: row.modelsAdded,
        addedModels: stringList(row.addedModels),
        errorMessage: row.errorMessage,
      }),
    ),
    learned: learned.map(toTacRow),
  }
}

// ─── สั่งงาน (ปุ่ม "อัปเดตตอนนี้" / "นำเข้าไฟล์เอง") ─────────────────

/**
 * ตั้งงาน `device_tac_sync` ขององค์กรผู้สั่ง — คีย์กันซ้ำต่อชั่วโมง (ไทย) ⇒ กดรัวได้งานเดิม
 * (บังคับดึงใหม่/นำเข้าไฟล์ใช้คีย์ของตัวเอง) · ผู้สั่งลง payload ฝั่ง server เท่านั้น
 */
export async function requestDeviceTacUpdate(
  context: DeviceCatalogMutationContext,
  input: { force: boolean } | { filePath: string },
  now: Date = new Date(),
): Promise<DeviceCatalogSyncRequestDto> {
  const organizationId = context.actor.organizationId
  const hour = new Date(now.getTime() + 7 * 3_600_000).toISOString().slice(0, 13)
  const isFile = 'filePath' in input
  const kind = isFile ? `file:${input.filePath}` : input.force ? 'force' : 'manual'
  const { job, duplicate } = await enqueueJob({
    organizationId,
    jobType: DEVICE_TAC_SYNC_JOB_TYPE,
    idempotencyKey: `manual:${DEVICE_TAC_SYNC_JOB_TYPE}:${organizationId}:${kind}:${isFile ? '' : hour}`,
    payload: isFile
      ? { trigger: 'file', filePath: input.filePath, actorId: context.actor.id, actorRole: context.actor.roleName }
      : { trigger: 'manual', force: input.force, actorId: context.actor.id, actorRole: context.actor.roleName },
    createdBy: context.actor.id,
    actorRole: context.actor.roleName,
    reason: context.reason ?? (isFile ? 'ผู้ดูแลนำเข้าไฟล์ TAC เอง' : 'ผู้ดูแลสั่งอัปเดตฐาน TAC จากหน้า Model Phone'),
  })
  return { jobId: job.id, duplicate }
}

/** path ของไฟล์ TAC ที่อัปโหลดต้องเป็นขององค์กรผู้สั่งเท่านั้น */
export function isOwnTacFilePath(organizationId: string, path: string): boolean {
  return path.startsWith(`organization/${organizationId}/device-tac/`) && !path.includes('..')
}

/** ยี่ห้อ/รุ่นจาก TAC ของ IMEI หลายเครื่อง (นำเข้า CSV — โหลดครั้งเดียวต่อไฟล์) · key = TAC 8 หลัก */
export async function loadTacLabels(
  organizationId: string,
  imeis: readonly string[],
): Promise<Map<string, { brandName: string; label: string; deviceModelId: string | null }>> {
  const tacs = [...new Set(imeis.map((imei) => tacOfImei(imei)).filter((tac): tac is string => tac !== null))]
  const result = new Map<string, { brandName: string; label: string; deviceModelId: string | null }>()
  if (tacs.length === 0) return result
  const rows = await prisma.deviceTac.findMany({
    where: { organizationId, tac: { in: tacs }, deletedAt: null },
    select: {
      tac: true,
      brandName: true,
      modelName: true,
      deviceModelId: true,
      deviceModel: { select: { name: true, deletedAt: true, brand: { select: { name: true } } } },
    },
  })
  for (const row of rows) {
    const model = row.deviceModel !== null && row.deviceModel.deletedAt === null ? row.deviceModel : null
    result.set(row.tac, {
      brandName: row.brandName,
      label: model === null ? tacLabel(row.brandName, row.modelName) : deviceSnapshotText(model.brand.name, model.name),
      deviceModelId: model === null ? null : row.deviceModelId,
    })
  }
  return result
}
