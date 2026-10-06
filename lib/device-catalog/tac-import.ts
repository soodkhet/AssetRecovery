import { emitAudit } from '@/lib/audit/audit'
import {
  classifyDeviceKind,
  cleanCatalogName,
  normalizeCatalogName,
  planModelUpsert,
  type ExistingModelRow,
} from '@/lib/device-catalog/catalog'
import { tacLabel, type TacRecord } from '@/lib/device-catalog/tac'
import { prisma } from '@/lib/prisma'

/**
 * นำแถว TAC เข้าองค์กร (มติ PO U166 · DEC-017) — ใช้ทั้ง job รายวันและ "นำเข้าไฟล์เอง"
 *
 * - **เพิ่มเฉพาะ TAC ใหม่** — TAC ที่มีอยู่แล้ว (ทั้งจากฐานเดิม/ระบบจำ/ผู้ดูแลผูก) ไม่แตะเลย
 * - แบรนด์/รุ่นของ TAC ใหม่ upsert เข้าแคตตาล็อก Model Phone เดิม (`device_brands`/`device_models`)
 *   จับคู่ด้วยกุญแจชื่อ (ไม่สนตัวพิมพ์/ช่องว่าง) · รุ่นใหม่ `source = tacdb` + `external_id` = กุญแจชื่อจากฐาน TAC
 *   ⇒ ผู้ดูแลแก้ชื่อแล้วรอบหน้ายังจับคู่แถวเดิมได้ · เติมปีที่ออกที่ยังว่าง
 * - **ไม่เขียน `manual_status`** (ของที่ผู้ดูแลปิด/เปิดไว้คงเดิม) · ไม่ทับชื่อที่ผู้ดูแลแก้ (`name_edited_at`)
 * - idempotent: `createMany(skipDuplicates)` บน UNIQUE ทุกตัว ⇒ รันซ้ำ/พร้อมกันไม่เกิดแถวซ้ำ
 * - audit 1 แถวต่อรอบ (สรุปจำนวน + ตัวอย่างชื่อ) · actor = ผู้สั่ง (ปุ่ม/นำเข้าไฟล์) หรือระบบ (job — reason ระบุ job id)
 */

const CHUNK = 5000
/** เก็บรายชื่อรุ่นที่เพิ่มในประวัติได้สูงสุดเท่านี้ (U167) */
export const MAX_ADDED_MODEL_NAMES = 2000

export interface TacImportActor {
  actorId: string | null
  actorRole: string | null
  reason: string
}

export interface TacImportResult {
  tacsAdded: number
  brandsAdded: number
  modelsAdded: number
  modelsUpdated: number
  /** "แบรนด์ รุ่น" ของรุ่นที่สร้างใหม่ (สูงสุด {@link MAX_ADDED_MODEL_NAMES}) */
  addedModels: string[]
}

function chunks<T>(items: readonly T[], size: number): T[][] {
  const result: T[][] = []
  for (let i = 0; i < items.length; i += size) result.push(items.slice(i, i + size))
  return result
}

export async function importTacRecords(
  organizationId: string,
  records: readonly TacRecord[],
  actor: TacImportActor,
): Promise<TacImportResult> {
  const result: TacImportResult = { tacsAdded: 0, brandsAdded: 0, modelsAdded: 0, modelsUpdated: 0, addedModels: [] }

  // ① TAC ที่ยังไม่มี (รวมแถวที่ลบแบบ soft แล้ว — ไม่ฟื้นกลับ)
  const existingTacs = new Set(
    (await prisma.deviceTac.findMany({ where: { organizationId }, select: { tac: true } })).map((row) => row.tac),
  )
  const fresh = records.filter((record) => !existingTacs.has(record.tac))
  if (fresh.length === 0) return result

  // ② แบรนด์
  const brandRows = await prisma.deviceBrand.findMany({ where: { organizationId }, select: { id: true, nameKey: true } })
  const brandIdByKey = new Map(brandRows.map((row) => [row.nameKey, row.id]))
  const newBrands = new Map<string, string>()
  for (const record of fresh) {
    const key = normalizeCatalogName(record.brand)
    if (key !== '' && !brandIdByKey.has(key) && !newBrands.has(key)) newBrands.set(key, cleanCatalogName(record.brand))
  }
  if (newBrands.size > 0) {
    for (const part of chunks([...newBrands.entries()], CHUNK)) {
      const inserted = await prisma.deviceBrand.createMany({
        data: part.map(([nameKey, name]) => ({ organizationId, name, nameKey, source: 'tacdb' as const })),
        skipDuplicates: true,
      })
      result.brandsAdded += inserted.count
    }
    const reloaded = await prisma.deviceBrand.findMany({
      where: { organizationId, nameKey: { in: [...newBrands.keys()] } },
      select: { id: true, nameKey: true },
    })
    for (const row of reloaded) brandIdByKey.set(row.nameKey, row.id)
  }

  // ③ รุ่น — รวมตาม (แบรนด์, กุญแจชื่อ) · ปีที่ออก = ปีแรกสุดที่พบ
  interface Incoming {
    brandId: string
    brandName: string
    name: string
    externalId: string
    releaseYear: number | null
  }
  const incoming = new Map<string, Incoming>()
  for (const record of fresh) {
    const brandId = brandIdByKey.get(normalizeCatalogName(record.brand))
    if (brandId === undefined) continue
    const externalId = normalizeCatalogName(record.model)
    const key = `${brandId}|${externalId}`
    const current = incoming.get(key)
    if (current === undefined) {
      incoming.set(key, { brandId, brandName: record.brand, name: record.model, externalId, releaseYear: record.releaseYear })
    } else if (record.releaseYear !== null && (current.releaseYear === null || record.releaseYear < current.releaseYear)) {
      current.releaseYear = record.releaseYear
    }
  }
  const brandIds = [...new Set([...incoming.values()].map((each) => each.brandId))]
  const existingModels = new Map<string, ExistingModelRow[]>()
  for (const part of chunks(brandIds, 1000)) {
    const rows = await prisma.deviceModel.findMany({
      where: { brandId: { in: part } },
      select: { id: true, brandId: true, externalId: true, nameKey: true, name: true, releaseYear: true, nameEditedAt: true },
    })
    for (const row of rows) {
      const list = existingModels.get(row.brandId) ?? []
      list.push(row)
      existingModels.set(row.brandId, list)
    }
  }

  const toCreate: Array<{
    brandId: string
    name: string
    nameKey: string
    externalId: string
    releaseYear: number | null
    assetKind: 'smartphone' | 'tablet'
    label: string
  }> = []
  const createdKeys = new Set<string>()
  for (const each of incoming.values()) {
    const existing = existingModels.get(each.brandId) ?? []
    const plan = planModelUpsert(existing, { externalId: each.externalId, name: each.name, releaseYear: each.releaseYear })
    if (plan.kind === 'create') {
      const dedupe = `${each.brandId}|${plan.nameKey}`
      if (createdKeys.has(dedupe)) continue
      createdKeys.add(dedupe)
      toCreate.push({
        brandId: each.brandId,
        name: plan.name,
        nameKey: plan.nameKey,
        externalId: each.externalId,
        releaseYear: plan.releaseYear,
        assetKind: classifyDeviceKind(plan.name),
        label: tacLabel(each.brandName, plan.name),
      })
    } else if (plan.kind === 'update') {
      // เติมปีที่ออก/กุญแจต้นทางที่ยังว่าง · เปลี่ยนชื่อเฉพาะที่ผู้ดูแลยังไม่แก้ (planModelUpsert ตัดสิน)
      try {
        await prisma.deviceModel.update({ where: { id: plan.id }, data: plan.data })
        result.modelsUpdated += 1
      } catch {
        // ชนกุญแจ (รันพร้อมกัน) — ข้าม ไม่ทำให้ทั้งรอบล้ม
      }
    }
  }
  for (const part of chunks(toCreate, CHUNK)) {
    const inserted = await prisma.deviceModel.createMany({
      data: part.map(({ label: _label, ...each }) => ({ organizationId, ...each, source: 'tacdb' as const })),
      skipDuplicates: true,
    })
    result.modelsAdded += inserted.count
  }
  result.addedModels = toCreate.slice(0, MAX_ADDED_MODEL_NAMES).map((each) => each.label)

  // ④ id ของรุ่นตามกุญแจต้นทาง → ผูก TAC
  const modelIdByKey = new Map<string, string>()
  for (const part of chunks(brandIds, 1000)) {
    const rows = await prisma.deviceModel.findMany({
      where: { brandId: { in: part } },
      select: { id: true, brandId: true, externalId: true, nameKey: true },
    })
    for (const row of rows) {
      modelIdByKey.set(`${row.brandId}|n:${row.nameKey}`, row.id)
      if (row.externalId !== null) modelIdByKey.set(`${row.brandId}|e:${row.externalId}`, row.id)
    }
  }
  for (const part of chunks(fresh, CHUNK)) {
    const inserted = await prisma.deviceTac.createMany({
      data: part.map((record) => {
        const brandId = brandIdByKey.get(normalizeCatalogName(record.brand))
        const key = normalizeCatalogName(record.model)
        const deviceModelId =
          brandId === undefined
            ? null
            : (modelIdByKey.get(`${brandId}|e:${key}`) ?? modelIdByKey.get(`${brandId}|n:${key}`) ?? null)
        return {
          organizationId,
          tac: record.tac,
          brandName: record.brand,
          modelName: record.model,
          variant: record.variant,
          releaseYear: record.releaseYear,
          source: 'tacdb' as const,
          deviceModelId,
          createdBy: actor.actorId,
        }
      }),
      skipDuplicates: true,
    })
    result.tacsAdded += inserted.count
  }

  await emitAudit({
    organizationId,
    actorId: actor.actorId,
    actorRole: actor.actorRole,
    action: 'create',
    targetType: 'device_tacs',
    targetId: null,
    after: {
      tacs_added: result.tacsAdded,
      brands_added: result.brandsAdded,
      models_added: result.modelsAdded,
      models_updated: result.modelsUpdated,
      sample_models: result.addedModels.slice(0, 50),
    },
    reason: actor.reason,
  })
  return result
}
