import { emitAudit } from '@/lib/audit/audit'
import { isUniqueViolation } from '@/lib/api/unique-violation'
import {
  classifyDeviceKind,
  cleanCatalogName,
  normalizeCatalogName,
  pickBrandsToSync,
  planModelUpsert,
  stripBrandPrefix,
  type ExistingModelRow,
} from '@/lib/device-catalog/catalog'
import {
  DeviceSpecsApiError,
  DeviceSpecsQuotaError,
  createRapidApiDeviceSpecsClient,
  rapidApiConfigFromEnv,
  type DeviceSpecsClient,
  type RemoteModel,
} from '@/lib/device-catalog/rapidapi-client'
import { prisma } from '@/lib/prisma'

/**
 * Job `device_catalog_sync` — แคตตาล็อก "Model Phone" (มติ PO U155 → U157 → U159 · DEC-016 · `91` §6.1)
 * รายวันหลังเที่ยงคืนเวลาไทย + ผู้ดูแลสั่ง "ดึงข้อมูลตอนนี้" ได้
 *
 * ### ดึงทุกแบรนด์/ทุกรุ่นเก็บไว้ (U157/U159)
 * job **ไม่ตัดสินการแสดง** — การแสดงคำนวณตอนอ่านจากตัวกรองในค่าตั้ง + ค่าที่ผู้ดูแลตั้งด้วยมือ
 * ⇒ รุ่นใหม่ของแบรนด์ในรายชื่อแสดงทันทีที่บันทึก · ของที่ผู้ดูแลปิด/เปิดไว้ job ไม่เขียนทับ
 * ① `GET brands` 1 ครั้ง → แบรนด์ใหม่ (ทุกองค์กร)
 * ② เลือกแบรนด์ที่จะดึงรายการรุ่นรอบนี้ตาม {@link pickBrandsToSync}: ยังไม่เคยดึงก่อน (ดึงครบครั้งแรก — **resume ได้**
 *    ถ้าโควตาหมดกลางทาง เพราะแบรนด์ที่ดึงแล้วมี `last_synced_at`) แล้วค่อยหมุนแบรนด์ที่ดึงนานที่สุด
 * ③ `GET models/{brand}` 1 ครั้งต่อแบรนด์ → เพิ่มรุ่นใหม่ · จัดประเภทมือถือ/แท็บเล็ตจากชื่อรุ่น
 *
 * ### ประหยัดโควตา (RapidAPI BASIC ฟรี)
 * ต้นทางไม่มี endpoint "รุ่นใหม่ตั้งแต่…" ⇒ ต่ำสุดที่ทำได้ = 1 + จำนวนแบรนด์ที่เลือก · จำกัดต่อรอบด้วย `maxRequests`
 * (คืนละ {@link DEFAULT_NIGHTLY_MAX_REQUESTS} · สั่งเอง {@link MANUAL_MAX_REQUESTS}) และหยุดเมื่อ header โควตาที่เหลือ
 * ≤ {@link QUOTA_RESERVE}
 *
 * ### ไม่เขียนทับการตั้งด้วยมือ
 * job ไม่เขียน `manual_status` เลย (ทั้งแถวใหม่และแถวเดิม) · ไม่ทับชื่อรุ่นที่ผู้ดูแลแก้ (`name_edited_at`)
 *
 * ### idempotent
 * จับคู่ด้วย external id → ชื่อ (ไม่สนตัวพิมพ์/ช่องว่าง) · `createMany(skipDuplicates)` บน UNIQUE
 * `(brand_id, name_key)` / `(brand_id, external_id)` ⇒ รันซ้ำ/พร้อมกันไม่เกิดแถวซ้ำ
 *
 * ### โควตาหมด / ไม่มี key
 * 429 = บันทึกในผลลัพธ์ (`quotaExceeded`) แล้ว**จบแบบสำเร็จ** — ของที่ดึงแล้วคงอยู่ รอบหน้าทำต่อ · ตัวเลือกเดิมใช้ได้
 * ไม่ตั้ง `RAPIDAPI_KEY` = ข้าม (`skipped: true` + เหตุผลใน Job Log) · error อื่น (5xx/เครือข่าย) โยนต่อ ⇒ retry ตามระบบเดิม
 *
 * actor = ระบบ (`actor_id = NULL`) ⇒ `reason` ระบุ job id (`90` §13) · audit 1 แถวต่อแบรนด์ที่มีรุ่นเพิ่ม (สรุปชื่อรุ่น)
 */

export const DEVICE_CATALOG_SYNC_JOB_TYPE = 'device_catalog_sync'
export const DEFAULT_NIGHTLY_MAX_REQUESTS = 20
export const MANUAL_MAX_REQUESTS = 200
export const QUOTA_RESERVE = 5
export const MISSING_KEY_REASON = 'ยังไม่ได้ตั้งค่า RAPIDAPI_KEY — ข้ามการดึงรุ่นเครื่อง (ตัวเลือกเดิมยังใช้ได้)'
export const QUOTA_EXCEEDED_REASON = 'โควตาแหล่งข้อมูลรุ่นเครื่องหมด — หยุดรอบนี้ ของที่ดึงแล้วคงอยู่ รอบถัดไปดึงต่อจากที่ค้าง'

export interface DeviceCatalogSyncOptions {
  organizationId?: string
  jobId?: string
  now?: Date
  /** ไม่ส่ง = สร้างจาก env · `null` = ไม่มี key (ข้าม) — เทสต์ส่ง mock เสมอ */
  client?: DeviceSpecsClient | null
  /** จำนวน request สูงสุดของรอบนี้ (รวม `GET brands`) */
  maxRequests?: number
}

export interface DeviceCatalogSyncResult {
  skipped: boolean
  skipReason?: string
  quotaExceeded: boolean
  organizations: number
  remoteBrands: number
  brandsCreated: number
  brandsSynced: number
  /** แบรนด์ที่ยังไม่เคยดึงรายการรุ่นเลย (เหลือของการดึงครบครั้งแรก) หลังจบรอบนี้ */
  brandsPendingFirstSync: number
  modelsCreated: number
  modelsUpdated: number
  modelsUnchanged: number
  requests: number
  quotaRemaining: number | null
}

function emptyResult(): DeviceCatalogSyncResult {
  return {
    skipped: false,
    quotaExceeded: false,
    organizations: 0,
    remoteBrands: 0,
    brandsCreated: 0,
    brandsSynced: 0,
    brandsPendingFirstSync: 0,
    modelsCreated: 0,
    modelsUpdated: 0,
    modelsUnchanged: 0,
    requests: 0,
    quotaRemaining: null,
  }
}

function resolveClient(option: DeviceSpecsClient | null | undefined): DeviceSpecsClient | null {
  if (option !== undefined) return option
  const config = rapidApiConfigFromEnv()
  return config === null ? null : createRapidApiDeviceSpecsClient(config)
}

/** จำนวน request ที่ payload ของ job ขอ (ผู้ดูแลสั่งเอง) — นอกช่วง = ค่าคืนละครั้ง */
export function maxRequestsFromPayload(payload: unknown): number {
  if (payload !== null && typeof payload === 'object' && !Array.isArray(payload)) {
    const value = (payload as Record<string, unknown>)['maxRequests']
    if (typeof value === 'number' && Number.isInteger(value) && value >= 1 && value <= MANUAL_MAX_REQUESTS) return value
  }
  return DEFAULT_NIGHTLY_MAX_REQUESTS
}

export async function runDeviceCatalogSyncJob(options: DeviceCatalogSyncOptions = {}): Promise<DeviceCatalogSyncResult> {
  const now = options.now ?? new Date()
  const jobRef = options.jobId ?? DEVICE_CATALOG_SYNC_JOB_TYPE
  const maxRequests = options.maxRequests ?? DEFAULT_NIGHTLY_MAX_REQUESTS
  const result = emptyResult()
  const reason = `งานเบื้องหลัง ${DEVICE_CATALOG_SYNC_JOB_TYPE} (${jobRef}) ดึงรุ่นเครื่องจากแหล่งข้อมูลภายนอก`

  const client = resolveClient(options.client)
  if (client === null) {
    console.warn(`[${DEVICE_CATALOG_SYNC_JOB_TYPE}] ${MISSING_KEY_REASON}`)
    return { ...result, skipped: true, skipReason: MISSING_KEY_REASON }
  }

  const organizations = await prisma.organization.findMany({
    where: options.organizationId === undefined ? {} : { id: options.organizationId },
    select: { id: true },
  })
  result.organizations = organizations.length
  const orgIds = organizations.map((org) => org.id)

  const finish = async (): Promise<DeviceCatalogSyncResult> => {
    result.requests = client.requestCount()
    result.quotaRemaining = client.quotaRemaining()
    result.brandsPendingFirstSync = await prisma.deviceBrand.count({
      where: { organizationId: { in: orgIds }, externalId: { not: null }, lastSyncedAt: null, deletedAt: null },
    })
    if (result.quotaExceeded) console.warn(`[${DEVICE_CATALOG_SYNC_JOB_TYPE}] ${QUOTA_EXCEEDED_REASON}`)
    return result
  }
  if (orgIds.length === 0) return finish()

  const quotaLow = (): boolean => {
    const remaining = client.quotaRemaining()
    return remaining !== null && remaining <= QUOTA_RESERVE
  }

  // ① แบรนด์ทั้งหมดจากต้นทาง (1 request)
  let remoteBrands: string[]
  try {
    remoteBrands = await client.listBrands()
  } catch (error) {
    if (error instanceof DeviceSpecsQuotaError) {
      result.quotaExceeded = true
      return finish()
    }
    throw error
  }
  result.remoteBrands = remoteBrands.length
  for (const organizationId of orgIds) {
    result.brandsCreated += await ensureRemoteBrands(organizationId, remoteBrands, reason)
  }

  // ② เลือกแบรนด์ของรอบนี้ — รวมทุกองค์กรด้วยชื่อฝั่งต้นทาง (เรียก API ครั้งเดียวต่อแบรนด์)
  const brandRows = await prisma.deviceBrand.findMany({
    where: { organizationId: { in: orgIds }, externalId: { not: null }, deletedAt: null },
    select: { id: true, organizationId: true, name: true, externalId: true, lastSyncedAt: true },
  })
  type BrandGroup = { externalId: string; name: string; lastSyncedAt: Date | null; rows: typeof brandRows }
  const groups = new Map<string, BrandGroup>()
  for (const row of brandRows) {
    const externalId = row.externalId ?? ''
    const group: BrandGroup = groups.get(externalId) ?? { externalId, name: row.name, lastSyncedAt: row.lastSyncedAt, rows: [] }
    group.rows.push(row)
    // องค์กรใดยังไม่เคยดึง = ถือว่ายังไม่เคยดึง · นอกนั้นใช้ครั้งที่เก่าสุด
    if (row.lastSyncedAt === null || (group.lastSyncedAt !== null && row.lastSyncedAt < group.lastSyncedAt)) {
      group.lastSyncedAt = row.lastSyncedAt
    }
    groups.set(externalId, group)
  }
  const budget = Math.max(0, maxRequests - client.requestCount())
  const picked = pickBrandsToSync([...groups.values()], budget)

  // ③ รายการรุ่นต่อแบรนด์ (1 request ต่อแบรนด์)
  for (const group of picked) {
    if (quotaLow()) {
      result.quotaExceeded = true
      break
    }
    let models: RemoteModel[]
    try {
      models = await client.listModels(group.externalId)
    } catch (error) {
      if (error instanceof DeviceSpecsQuotaError) {
        result.quotaExceeded = true
        break
      }
      // ต้นทางไม่มีแบรนด์นี้แล้ว — ถือว่าดึงแล้ว (ไม่ถามซ้ำทุกคืน) · error อื่นโยนต่อให้ retry
      if (!(error instanceof DeviceSpecsApiError && error.status === 404)) throw error
      models = []
    }
    for (const row of group.rows) {
      const tally = await upsertBrandModels(row.organizationId, row.id, row.name, models, reason)
      result.modelsCreated += tally.created
      result.modelsUpdated += tally.updated
      result.modelsUnchanged += tally.unchanged
    }
    await prisma.deviceBrand.updateMany({
      where: { id: { in: group.rows.map((row) => row.id) } },
      data: { lastSyncedAt: now },
    })
    result.brandsSynced += 1
  }

  return finish()
}

/** สร้างแบรนด์จากต้นทางที่ยังไม่มี — แบรนด์เดิม (รวมที่ตั้งด้วยมือ/เพิ่มเอง) ไม่แตะค่าที่ตั้ง/ชื่อ · เติมชื่อฝั่ง API ถ้ายังว่าง */
async function ensureRemoteBrands(organizationId: string, remoteBrands: readonly string[], reason: string): Promise<number> {
  const existing = await prisma.deviceBrand.findMany({
    where: { organizationId },
    select: { id: true, nameKey: true, externalId: true },
  })
  const byKey = new Map(existing.map((row) => [row.nameKey, row]))
  const toCreate: Array<{ name: string; nameKey: string; externalId: string }> = []
  for (const remote of remoteBrands) {
    const name = cleanCatalogName(remote)
    const nameKey = normalizeCatalogName(name)
    if (nameKey === '') continue
    const row = byKey.get(nameKey)
    if (row === undefined) {
      if (!toCreate.some((each) => each.nameKey === nameKey)) toCreate.push({ name, nameKey, externalId: remote })
    } else if (row.externalId === null) {
      // แบรนด์ที่ผู้ดูแลเพิ่มเองแล้วต้นทางมีชื่อตรงกัน ⇒ ผูกชื่อฝั่ง API ให้ดึงรุ่นได้ (ค่าที่ตั้งคงเดิม)
      await prisma.deviceBrand.update({ where: { id: row.id }, data: { externalId: remote } })
      row.externalId = remote
    }
  }
  if (toCreate.length === 0) return 0

  return prisma.$transaction(async (tx) => {
    const inserted = await tx.deviceBrand.createMany({
      data: toCreate.map((each) => ({ organizationId, ...each, source: 'api' as const })),
      skipDuplicates: true,
    })
    if (inserted.count > 0) {
      await emitAudit(
        {
          organizationId,
          actorId: null,
          actorRole: null,
          action: 'create',
          targetType: 'device_brands',
          targetId: null,
          after: { count: inserted.count, brands: toCreate.map((each) => each.name), source: 'api' },
          reason,
        },
        tx,
      )
    }
    return inserted.count
  })
}

async function upsertBrandModels(
  organizationId: string,
  brandId: string,
  brandName: string,
  models: readonly RemoteModel[],
  reason: string,
): Promise<{ created: number; updated: number; unchanged: number }> {
  const tally = { created: 0, updated: 0, unchanged: 0 }
  const existing: ExistingModelRow[] = await prisma.deviceModel.findMany({
    where: { brandId },
    select: { id: true, externalId: true, nameKey: true, name: true, releaseYear: true, nameEditedAt: true },
  })
  const toCreate: Array<{
    name: string
    nameKey: string
    externalId: string | null
    releaseYear: number | null
    assetKind: 'smartphone' | 'tablet'
  }> = []

  for (const remote of models) {
    const name = stripBrandPrefix(brandName, remote.name)
    // ต้นทางไม่มีรหัสรุ่น ⇒ ใช้ชื่อรุ่นฝั่งต้นทางเป็นรหัส — ผู้ดูแลเปลี่ยนชื่อแล้วรอบหน้ายังจับคู่แถวเดิมได้
    const externalId = remote.externalId ?? remote.name
    const plan = planModelUpsert(existing, { externalId, name, releaseYear: remote.releaseYear })
    if (plan.kind === 'unchanged') {
      tally.unchanged += 1
      continue
    }
    if (plan.kind === 'create') {
      if (toCreate.some((each) => each.nameKey === plan.nameKey || each.externalId === plan.externalId)) {
        tally.unchanged += 1
        continue
      }
      toCreate.push({
        name: plan.name,
        nameKey: plan.nameKey,
        externalId: plan.externalId,
        releaseYear: plan.releaseYear,
        assetKind: classifyDeviceKind(plan.name),
      })
      continue
    }
    try {
      await prisma.$transaction(async (tx) => {
        const before = await tx.deviceModel.findUniqueOrThrow({
          where: { id: plan.id },
          select: { name: true, externalId: true, releaseYear: true },
        })
        await tx.deviceModel.update({ where: { id: plan.id }, data: plan.data })
        await emitAudit(
          {
            organizationId,
            actorId: null,
            actorRole: null,
            action: 'update',
            targetType: 'device_models',
            targetId: plan.id,
            before,
            after: { ...before, ...plan.data },
            reason,
          },
          tx,
        )
      })
      const row = existing.find((each) => each.id === plan.id)
      if (row !== undefined) Object.assign(row, plan.data)
      tally.updated += 1
    } catch (error) {
      if (!isUniqueViolation(error)) throw error
      tally.unchanged += 1
    }
  }

  if (toCreate.length > 0) {
    tally.created = await prisma.$transaction(async (tx) => {
      // U159 — ไม่ตั้ง manual_status (การแสดงตามตัวกรอง) · skipDuplicates = รันพร้อมกันไม่เกิดแถวซ้ำ
      const inserted = await tx.deviceModel.createMany({
        data: toCreate.map((each) => ({ organizationId, brandId, ...each, source: 'api' as const })),
        skipDuplicates: true,
      })
      if (inserted.count > 0) {
        await emitAudit(
          {
            organizationId,
            actorId: null,
            actorRole: null,
            action: 'create',
            targetType: 'device_models',
            targetId: null,
            after: { brand: brandName, brand_id: brandId, count: inserted.count, models: toCreate.map((each) => each.name) },
            reason,
          },
          tx,
        )
      }
      return inserted.count
    })
    tally.unchanged += toCreate.length - tally.created
  }
  return tally
}
