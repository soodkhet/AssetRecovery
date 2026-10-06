import { extractReleaseYear } from '@/lib/device-catalog/catalog'

/**
 * HTTP client ของ RapidAPI "Mobile Phone Specs Database" (provider makingdatameaningful — ข้อมูลแบบ GSMArena)
 * — DEC-016 · มติ PO U155 → U157
 *
 * แยกเป็นโมดูลเดียวที่ **mock ได้** (`DeviceSpecsClient`) — job รับ client ผ่านพารามิเตอร์ ⇒ เทสต์ใช้ fixture
 * เท่านั้น **ห้ามเรียก API จริงในเทสต์** · ไม่มีค่า key ใด ๆ ใน repo: อ่านจาก env ตอนรันเท่านั้น
 *
 * env (ผู้ใช้ตั้งเองใน `.env.local` / Vercel):
 *  - `RAPIDAPI_KEY` — บังคับ (ไม่ตั้ง = job ข้ามพร้อมบันทึกเหตุผล)
 *  - `RAPIDAPI_MOBILE_SPECS_HOST` — ไม่บังคับ (ค่าเริ่มต้น {@link DEFAULT_MOBILE_SPECS_HOST})
 *
 * ### endpoint ที่ใช้ (เอกสาร provider: `GET /brands` · `GET /models/{brandName}` · `GET /specifications/...`)
 * ใช้แค่ 2 ตัวแรก — ไม่มี endpoint "รุ่นใหม่ตั้งแต่วันที่" หรือแบ่งหน้า ⇒ จำนวน request ต่ำสุด = 1 (แบรนด์) + 1 ต่อแบรนด์
 * บน RapidAPI บาง listing ครอบ path ด้วย prefix `/gsm/...` ⇒ ลอง path แบบ provider ก่อน ถ้า 404 ค่อยลองแบบ `/gsm`
 * แล้ว**จำแบบที่ใช้ได้**ไว้ตลอดอายุ client (เสียเพิ่มอย่างมาก 1 request ต่อรอบ)
 *
 * ### โควตา (แพ็กเกจ BASIC ฟรี)
 * RapidAPI ส่ง header `x-ratelimit-requests-remaining` กลับมาทุกครั้ง ⇒ เก็บไว้ให้ job หยุดก่อนโควตาหมด
 * 429 = `DeviceSpecsQuotaError` (job บันทึก + ข้าม ไม่ retry)
 */

export const DEFAULT_MOBILE_SPECS_HOST = 'mobile-phone-specs-database.p.rapidapi.com'

/** path ของ endpoint — แบบ provider (เอกสาร) และแบบ RapidAPI ที่มี prefix `/gsm` */
export const MOBILE_SPECS_PATH_STYLES = [
  {
    name: 'provider',
    brands: '/brands',
    models: (brand: string) => `/models/${encodeURIComponent(brand)}`,
  },
  {
    name: 'gsm',
    brands: '/gsm/all-brands',
    models: (brand: string) => `/gsm/get-models-by-brandname/${encodeURIComponent(brand)}`,
  },
] as const

export interface RemoteModel {
  /** รหัสรุ่นฝั่งต้นทาง (ถ้ามี) — ไม่มี = ใช้ชื่อรุ่นเป็นตัวจับคู่ */
  externalId: string | null
  name: string
  /** ปีที่ออก ถ้ารายการรุ่นให้มา — ข้อมูลประกอบเท่านั้น */
  releaseYear: number | null
}

export interface DeviceSpecsClient {
  listBrands(): Promise<string[]>
  listModels(brand: string): Promise<RemoteModel[]>
  /** โควตาที่เหลือจาก header ล่าสุด — ไม่ทราบ = `null` */
  quotaRemaining(): number | null
  /** จำนวน request ที่ยิงไปแล้วในอายุ client นี้ */
  requestCount(): number
}

/** ต้นทางตอบผิดปกติ (5xx/เครือข่าย) — job ปล่อยให้ตัวรันงานกลาง retry/dead letter ตามระบบเดิม */
export class DeviceSpecsApiError extends Error {
  readonly status: number | null
  constructor(message: string, status: number | null) {
    super(message)
    this.name = 'DeviceSpecsApiError'
    this.status = status
  }
}

/** โควตาหมด / ถูกจำกัดอัตรา (429) — job บันทึกแล้ว**ข้าม** (ไม่ใช่ความผิดพลาด · ตัวเลือกเดิมใช้ได้ต่อ) */
export class DeviceSpecsQuotaError extends DeviceSpecsApiError {
  constructor(path: string) {
    super(`แหล่งข้อมูลรุ่นเครื่องแจ้งว่าโควตาหมด/เรียกถี่เกิน (HTTP 429) ที่ ${path}`, 429)
    this.name = 'DeviceSpecsQuotaError'
  }
}

export interface RapidApiConfig {
  apiKey: string
  host: string
}

/** อ่านค่าจาก env — ไม่มี key = `null` (job ข้าม) · ไม่ log ค่า key เด็ดขาด */
export function rapidApiConfigFromEnv(env: Readonly<Record<string, string | undefined>> = process.env): RapidApiConfig | null {
  const apiKey = env['RAPIDAPI_KEY']?.trim() ?? ''
  if (apiKey === '') return null
  const host = env['RAPIDAPI_MOBILE_SPECS_HOST']?.trim() || DEFAULT_MOBILE_SPECS_HOST
  return { apiKey, host }
}

export interface FetchResponseLike {
  ok: boolean
  status: number
  headers: { get(name: string): string | null }
  json(): Promise<unknown>
}

export type FetchLike = (
  input: string,
  init: { headers: Record<string, string>; signal?: AbortSignal },
) => Promise<FetchResponseLike>

const REQUEST_TIMEOUT_MS = 20_000

export function createRapidApiDeviceSpecsClient(
  config: RapidApiConfig,
  fetchImpl: FetchLike = fetch as unknown as FetchLike,
): DeviceSpecsClient {
  let remaining: number | null = null
  let count = 0
  let styleIndex: number | null = null

  async function request(path: string): Promise<FetchResponseLike> {
    count += 1
    let response: FetchResponseLike
    try {
      response = await fetchImpl(`https://${config.host}${path}`, {
        headers: { 'x-rapidapi-key': config.apiKey, 'x-rapidapi-host': config.host },
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      })
    } catch (error) {
      throw new DeviceSpecsApiError(`เรียกแหล่งข้อมูลรุ่นเครื่องไม่สำเร็จ: ${(error as Error).message}`, null)
    }
    const header = response.headers.get('x-ratelimit-requests-remaining')
    if (header !== null && header.trim() !== '' && Number.isFinite(Number(header))) remaining = Number(header)
    if (response.status === 429) throw new DeviceSpecsQuotaError(path)
    return response
  }

  /** เรียกตาม path style ที่ใช้ได้ — ยังไม่รู้ = ลองทีละแบบ ข้ามแบบที่ได้ 404 */
  async function get(pathOf: (style: (typeof MOBILE_SPECS_PATH_STYLES)[number]) => string): Promise<unknown> {
    const order = styleIndex === null ? MOBILE_SPECS_PATH_STYLES.map((_, index) => index) : [styleIndex]
    let lastPath = ''
    for (const index of order) {
      const style = MOBILE_SPECS_PATH_STYLES[index]
      if (style === undefined) continue
      lastPath = pathOf(style)
      const response = await request(lastPath)
      if (response.status === 404 && styleIndex === null) continue
      if (!response.ok) {
        throw new DeviceSpecsApiError(`แหล่งข้อมูลรุ่นเครื่องตอบผิดปกติ (HTTP ${response.status}) ที่ ${lastPath}`, response.status)
      }
      styleIndex = index
      return response.json()
    }
    throw new DeviceSpecsApiError(`ไม่พบ endpoint ของแหล่งข้อมูลรุ่นเครื่อง (HTTP 404) ที่ ${lastPath}`, 404)
  }

  return {
    async listBrands() {
      return parseBrandList(await get((style) => style.brands))
    },
    async listModels(brand) {
      return parseModelList(await get((style) => style.models(brand)))
    },
    quotaRemaining: () => remaining,
    requestCount: () => count,
  }
}

// ─── parser (pure — ทดสอบด้วย fixture) ───────────────────────────────

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

/** รายการจาก response — รับทั้ง array ตรง ๆ และ `{ data: [...] }` / `{ results: [...] }` ฯลฯ */
function listOf(payload: unknown): unknown[] {
  if (Array.isArray(payload)) return payload
  if (isRecord(payload)) {
    for (const key of ['data', 'results', 'items', 'brands', 'models']) {
      const value = payload[key]
      if (Array.isArray(value)) return value
    }
  }
  return []
}

function firstString(record: Record<string, unknown>, keys: readonly string[]): string | null {
  for (const key of keys) {
    const value = record[key]
    if (typeof value === 'string' && value.trim() !== '') return value.trim()
    if (typeof value === 'number' && Number.isFinite(value)) return String(value)
  }
  return null
}

const BRAND_NAME_KEYS = ['brandValue', 'brandName', 'brand', 'name', 'value'] as const
const MODEL_NAME_KEYS = ['modelValue', 'modelName', 'phoneModel', 'model', 'name', 'value'] as const
const MODEL_ID_KEYS = ['phoneCustomId', 'customId', 'modelId', 'phoneId', 'id', 'slug'] as const
const YEAR_KEYS = ['releaseYear', 'year', 'launchAnnounced', 'announced', 'released', 'releaseDate', 'launchDate'] as const

export function parseBrandList(payload: unknown): string[] {
  const names: string[] = []
  for (const item of listOf(payload)) {
    const name = typeof item === 'string' ? item.trim() : isRecord(item) ? firstString(item, BRAND_NAME_KEYS) : null
    if (name !== null && name !== '') names.push(name)
  }
  return names
}

export function parseModelList(payload: unknown): RemoteModel[] {
  const models: RemoteModel[] = []
  for (const item of listOf(payload)) {
    if (typeof item === 'string') {
      if (item.trim() !== '') models.push({ externalId: null, name: item.trim(), releaseYear: null })
      continue
    }
    if (!isRecord(item)) continue
    const name = firstString(item, MODEL_NAME_KEYS)
    if (name === null) continue
    models.push({
      externalId: firstString(item, MODEL_ID_KEYS),
      name,
      releaseYear: extractReleaseYear(firstString(item, YEAR_KEYS)),
    })
  }
  return models
}
