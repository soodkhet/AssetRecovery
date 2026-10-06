/**
 * แคตตาล็อก "Model Phone" — แบรนด์/รุ่นเครื่อง (มติ PO U155 → U157 · DEC-016 · `13` §6.18 · `38` §6.2)
 * **pure ล้วน** ใช้ร่วม FE/BE — ห้าม import อะไรที่แตะ DB/เครือข่าย
 *
 * U159 (แทนส่วนกรองของ U157): job ดึงทุกแบรนด์/รุ่นเก็บไว้ · **การแสดงในตัวเลือก** = ค่าที่ผู้ดูแลตั้งด้วยมือ
 * (`manual_status` — ชนะเสมอ) ไม่งั้นตามตัวกรองในค่าตั้ง (แบรนด์ในรายชื่อ + รุ่นที่ออกภายใน N ปีล่าสุด)
 * คำนวณตอนอ่าน ⇒ เปลี่ยนตัวกรองแล้วมีผลทันทีโดยไม่ต้องดึง API และไม่เขียนทับค่าที่ตั้งด้วยมือ
 */

export const DEVICE_ASSET_KINDS = ['smartphone', 'tablet'] as const
export type DeviceAssetKind = (typeof DEVICE_ASSET_KINDS)[number]

export const DEVICE_CATALOG_STATUSES = ['active', 'hidden'] as const
export type DeviceCatalogStatusCode = (typeof DEVICE_CATALOG_STATUSES)[number]

export const DEVICE_CATALOG_SOURCES = ['api', 'manual'] as const
export type DeviceCatalogSourceCode = (typeof DEVICE_CATALOG_SOURCES)[number]

export const DEVICE_CATALOG_STATUS_LABEL: Readonly<Record<DeviceCatalogStatusCode, string>> = {
  active: 'แสดง',
  hidden: 'ไม่แสดง',
}

// ─── ตัวกรองการแสดง (มติ PO U159) ─────────────────────────────────

/**
 * รายชื่อแบรนด์เริ่มต้นของตัวกรอง (มติ PO U159) — ชื่อที่ต้นทางแยกแบรนด์ไว้ (Redmi/POCO ของ Xiaomi ·
 * HMD ของ Nokia · nubia ของ ZTE) ใส่เป็นรายการแยกเพื่อให้จับคู่ชื่อแบรนด์ฝั่ง API ได้ครบ
 */
export const DEFAULT_FILTER_BRANDS: readonly string[] = [
  'Samsung',
  'Apple',
  'OPPO',
  'vivo',
  'Xiaomi',
  'Redmi',
  'POCO',
  'realme',
  'HONOR',
  'Infinix',
  'TECNO',
  'HUAWEI',
  'OnePlus',
  'Google',
  'Nokia',
  'HMD',
  'Motorola',
  'ASUS',
  'Sony',
  'Nothing',
  'ZTE',
  'nubia',
  'itel',
  'Lenovo',
]

/** แสดงรุ่นที่ออกภายใน N ปีล่าสุด — ค่าเริ่มต้น (มติ PO U159) */
export const DEFAULT_RECENT_YEARS = 5
export const MIN_RECENT_YEARS = 1
export const MAX_RECENT_YEARS = 30
export const MAX_FILTER_BRANDS = 100

/** ปี ค.ศ. ตามเวลาไทย (ปีที่ออกของต้นทางเป็น ค.ศ.) */
export function bangkokYear(now: Date): number {
  return new Date(now.getTime() + 7 * 3_600_000).getUTCFullYear()
}

/** ปีที่ออกต่ำสุดที่ผ่านตัวกรอง — "ภายใน N ปีล่าสุด" นับปีนี้ด้วย (N=5 ในปี 2026 ⇒ 2022 ขึ้นไป) */
export function minVisibleReleaseYear(now: Date, recentYears: number): number {
  return bangkokYear(now) - recentYears + 1
}

export interface CatalogFilter {
  /** `normalizeCatalogName()` ของรายชื่อแบรนด์ในค่าตั้ง */
  brandKeys: ReadonlySet<string>
  minReleaseYear: number
}

export function buildCatalogFilter(brandNames: readonly string[], recentYears: number, now: Date): CatalogFilter {
  return {
    brandKeys: new Set(brandNames.map((name) => normalizeCatalogName(name)).filter((key) => key !== '')),
    minReleaseYear: minVisibleReleaseYear(now, recentYears),
  }
}

/** แบรนด์แสดงไหม — ตั้งด้วยมือชนะ · ไม่ตั้ง = อยู่ในรายชื่อของตัวกรอง */
export function isBrandVisible(brand: { manualStatus: DeviceCatalogStatusCode | null; nameKey: string }, filter: CatalogFilter): boolean {
  if (brand.manualStatus !== null) return brand.manualStatus === 'active'
  return filter.brandKeys.has(brand.nameKey)
}

/** รุ่นผ่านตัวกรองปีไหม — ไม่ทราบปี (ต้นทางไม่ให้มา) = ผ่าน */
export function passesRecentYears(releaseYear: number | null, filter: CatalogFilter): boolean {
  return releaseYear === null || releaseYear >= filter.minReleaseYear
}

/**
 * รุ่นแสดงในตัวเลือกไหม — แบรนด์ต้องแสดง (ปิดแบรนด์ = ทุกรุ่นไม่แสดง) และ
 * รุ่นตั้งด้วยมือชนะ · ไม่ตั้ง = ผ่านตัวกรองปี
 */
export function isModelVisible(
  model: { manualStatus: DeviceCatalogStatusCode | null; releaseYear: number | null },
  brandVisible: boolean,
  filter: CatalogFilter,
): boolean {
  if (!brandVisible) return false
  if (model.manualStatus !== null) return model.manualStatus === 'active'
  return passesRecentYears(model.releaseYear, filter)
}

/** ทำความสะอาดรายชื่อแบรนด์จากฟอร์มตั้งค่า — ตัดว่าง/ซ้ำ (ไม่สนตัวพิมพ์/ช่องว่าง) คงลำดับเดิม */
export function cleanBrandList(values: readonly string[]): string[] {
  const seen = new Set<string>()
  const result: string[] = []
  for (const raw of values) {
    const name = cleanCatalogName(raw)
    const key = normalizeCatalogName(name)
    if (key === '' || seen.has(key)) continue
    seen.add(key)
    result.push(name)
  }
  return result
}

/** ข้อความหลายบรรทัด/คั่นจุลภาค → รายชื่อแบรนด์ (ฟอร์มตั้งค่า) */
export function parseBrandListText(text: string): string[] {
  return cleanBrandList(text.split(/[\n,]+/))
}

export const DEVICE_CATALOG_SOURCE_LABEL: Readonly<Record<DeviceCatalogSourceCode, string>> = {
  api: 'ดึงอัตโนมัติ',
  manual: 'เพิ่มเอง',
}

/**
 * กุญแจเทียบชื่อ — ไม่สนตัวพิมพ์/ช่องว่าง/ขีด/ขีดล่าง/จุด (จับคู่ข้อความนำเข้า · กันชื่อซ้ำ) · NFKC กันอักขระเต็มความกว้าง
 * `"Galaxy  S24 Ultra"` = `"galaxys24ultra"` = `"GALAXY-S24-ULTRA"`
 */
export function normalizeCatalogName(value: string): string {
  return value.normalize('NFKC').toLowerCase().replace(/[\s\-_.]+/g, '')
}

/** ตัดช่องว่างซ้อน/หัวท้าย — ชื่อที่เก็บ/แสดง */
export function cleanCatalogName(value: string): string {
  return value.normalize('NFKC').replace(/\s+/g, ' ').trim()
}

/** ข้อความ snapshot ที่เก็บลงเคส (`cases.asset_description`) เมื่อเลือกจากรายการ */
export function deviceSnapshotText(brandName: string, modelName: string): string {
  const brand = cleanCatalogName(brandName)
  const model = cleanCatalogName(modelName)
  return normalizeCatalogName(model).startsWith(normalizeCatalogName(brand)) ? model : `${brand} ${model}`
}

/**
 * ชื่อรุ่นจาก API บางตัวมีชื่อแบรนด์นำหน้า ("Samsung Galaxy S24") — ตัดออกให้เหลือชื่อรุ่น (ตัดแล้วว่าง = คงเดิม)
 */
export function stripBrandPrefix(brandName: string, modelName: string): string {
  const model = cleanCatalogName(modelName)
  const brand = cleanCatalogName(brandName)
  if (model.toLowerCase().startsWith(`${brand.toLowerCase()} `)) {
    const rest = model.slice(brand.length).trim()
    if (rest !== '') return rest
  }
  return model
}

/** ชื่อที่บ่งว่าเป็นแท็บเล็ต — ต้นทางไม่แยกประเภท ⇒ จัดประเภทจากชื่อรุ่น (ผู้ดูแลแก้ได้) */
const TABLET_PATTERN = /\b(ipad\w*|tab\d*|tablet|slate|\w*pad\d*)\b/i

/** จัดประเภททรัพย์จากชื่อรุ่น — ไม่กรองทิ้ง (U157): ไม่ใช่แท็บเล็ต = มือถือ */
export function classifyDeviceKind(modelName: string): DeviceAssetKind {
  return TABLET_PATTERN.test(modelName) ? 'tablet' : 'smartphone'
}

/** ปี ค.ศ. 4 หลักตัวแรกในข้อความ ("2023, February 01") — ไม่เจอ/นอกช่วง 1990–2100 = `null` */
export function extractReleaseYear(value: string | null | undefined): number | null {
  if (value === null || value === undefined) return null
  const match = /\b(199\d|20\d{2})\b/.exec(value)
  if (match === null) return null
  const year = Number(match[1])
  return year >= 1990 && year <= 2100 ? year : null
}

// ─── จับคู่ข้อความนำเข้า/ฟอร์มกับแคตตาล็อก ─────────────────────────────

export interface CatalogMatchEntry {
  modelId: string
  assetKind: DeviceAssetKind
  brandName: string
  modelName: string
}

/**
 * ตัวจับคู่ "แบรนด์ + รุ่น" หรือ "รุ่นเฉย ๆ" → รุ่นในแคตตาล็อก (เฉพาะรายการที่เปิดอยู่ที่ส่งเข้ามา)
 * ชื่อเดียวกันหลายรุ่น (ข้ามแบรนด์) ⇒ ไม่จับคู่ (กำกวม — เก็บข้อความตามเดิม)
 */
export function buildCatalogMatcher(
  entries: readonly CatalogMatchEntry[],
): (text: string, assetKind: DeviceAssetKind | null) => CatalogMatchEntry | null {
  const index = new Map<string, CatalogMatchEntry[]>()
  const add = (key: string, entry: CatalogMatchEntry): void => {
    if (key === '') return
    const list = index.get(key) ?? []
    if (!list.some((each) => each.modelId === entry.modelId)) list.push(entry)
    index.set(key, list)
  }
  for (const entry of entries) {
    add(normalizeCatalogName(`${entry.brandName}${entry.modelName}`), entry)
    add(normalizeCatalogName(entry.modelName), entry)
  }
  return (text, assetKind) => {
    const candidates = (index.get(normalizeCatalogName(text)) ?? []).filter(
      (entry) => assetKind === null || entry.assetKind === assetKind,
    )
    return candidates.length === 1 ? (candidates[0] ?? null) : null
  }
}

// ─── วางแผน upsert ของ job (pure) ───────────────────────────────────

export interface ExistingModelRow {
  id: string
  externalId: string | null
  nameKey: string
  name: string
  releaseYear: number | null
  nameEditedAt: Date | null
}

export interface IncomingModel {
  externalId: string | null
  name: string
  releaseYear: number | null
}

export type ModelUpsertPlan =
  | { kind: 'create'; name: string; nameKey: string; externalId: string | null; releaseYear: number | null }
  | {
      kind: 'update'
      id: string
      data: { name?: string; nameKey?: string; externalId?: string; releaseYear?: number }
    }
  | { kind: 'unchanged'; id: string }

/**
 * ตัดสินว่ารุ่นที่ดึงมาต้อง สร้างใหม่ / เติมข้อมูล / ไม่ต้องทำอะไร — หัวใจของ idempotency
 *
 * - จับคู่ด้วย `external_id` ก่อน แล้วค่อยชื่อ (ไม่สนตัวพิมพ์/ช่องว่าง)
 * - **ไม่แตะค่าที่ผู้ดูแลตั้งด้วยมือ** (`manual_status` — U159) · **ไม่ทับชื่อที่ผู้ดูแลแก้** (`name_edited_at`)
 * - เติม external id / ปีที่ออกที่ยังว่าง · ชื่อจากต้นทางเปลี่ยน (ผู้ดูแลยังไม่แก้) = อัปเดตชื่อ
 */
export function planModelUpsert(existing: readonly ExistingModelRow[], incoming: IncomingModel): ModelUpsertPlan {
  const name = cleanCatalogName(incoming.name)
  const nameKey = normalizeCatalogName(name)
  const match =
    (incoming.externalId === null ? undefined : existing.find((row) => row.externalId === incoming.externalId)) ??
    existing.find((row) => row.nameKey === nameKey)

  if (match === undefined) {
    return { kind: 'create', name, nameKey, externalId: incoming.externalId, releaseYear: incoming.releaseYear }
  }

  const data: { name?: string; nameKey?: string; externalId?: string; releaseYear?: number } = {}
  if (match.externalId === null && incoming.externalId !== null) data.externalId = incoming.externalId
  if (match.releaseYear === null && incoming.releaseYear !== null) data.releaseYear = incoming.releaseYear
  if (
    match.nameEditedAt === null &&
    match.name !== name &&
    // ชื่อใหม่ชนกับรุ่นอื่นในแบรนด์เดียวกัน ⇒ คงชื่อเดิม (UNIQUE brand+name_key)
    !existing.some((row) => row.id !== match.id && row.nameKey === nameKey)
  ) {
    data.name = name
    data.nameKey = nameKey
  }
  return Object.keys(data).length === 0 ? { kind: 'unchanged', id: match.id } : { kind: 'update', id: match.id, data }
}

/**
 * ลำดับแบรนด์ที่ job ดึงรายการรุ่นในรอบนี้ (ประหยัดโควตา — U157):
 * ① แบรนด์ที่ยังไม่เคยดึง (`lastSyncedAt = null` — การดึงครบครั้งแรก resume ต่อจากที่ค้าง) ตามชื่อ
 * ② แบรนด์ที่ดึงนานที่สุด (หมุนเวียนหารุ่นใหม่) · แบรนด์เพิ่มเอง (ไม่มีชื่อฝั่ง API) ไม่ถูกดึง
 * จำกัดจำนวนตาม `budget` (จำนวน request ที่เหลือของรอบ)
 */
export function pickBrandsToSync<T extends { externalId: string | null; lastSyncedAt: Date | null; name: string }>(
  brands: readonly T[],
  budget: number,
): T[] {
  if (budget <= 0) return []
  const remote = brands.filter((brand) => brand.externalId !== null)
  const never = remote.filter((brand) => brand.lastSyncedAt === null).sort((a, b) => a.name.localeCompare(b.name))
  const synced = remote
    .filter((brand) => brand.lastSyncedAt !== null)
    .sort((a, b) => (a.lastSyncedAt?.getTime() ?? 0) - (b.lastSyncedAt?.getTime() ?? 0))
  return [...never, ...synced].slice(0, budget)
}

