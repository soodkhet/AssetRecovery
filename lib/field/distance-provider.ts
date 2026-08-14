import { legCacheKey, routeLegs, sumLegMeters, type GeoPoint, type RouteLeg } from '@/lib/field/distance'

/**
 * ตัวคำนวณระยะทางจริงตามถนน (`41` §6.4.2) — **ฝั่ง server เท่านั้น**
 *
 * เฟสแรกใช้ **Google Maps Distance Matrix API** ตามที่ `41` §6.4.2 กำหนด (ไม่ใช่ Haversine เส้นตรง)
 * เรียกเฉพาะตอน `submit_close_case`/`resubmit_close_case` — ไม่เรียก realtime ตอนเช็คอิน
 *
 * กติกาการทำงาน:
 * - **ยิงทีละช่วง** (`origin→จุด1`, `จุด1→จุด2`, …) = 1 element ต่อครั้ง ค่าใช้จ่ายคาดเดาได้
 *   และ cache ต่อช่วงได้จริง (เมทริกซ์เต็ม n×n เสียเงินโดยไม่ได้ใช้)
 * - **cache ในหน่วยความจำต่อ instance** ด้วยพิกัดปัดทศนิยม 5 ตำแหน่ง (~1 ม.)
 * - **retry** เฉพาะความล้มเหลวชั่วคราว (network / 5xx / `OVER_QUERY_LIMIT` / `UNKNOWN_ERROR`)
 * - ไม่มี `GOOGLE_MAPS_API_KEY` หรือปลายทางล่ม ⇒ โยน {@link DistanceUnavailableError}
 *   ผู้เรียกต้องปิดงานต่อให้สำเร็จเสมอแล้วตั้ง job `fuel_distance_retry` (มติ PO 14/08/2569 — D10)
 */

const ENDPOINT = 'https://maps.googleapis.com/maps/api/distancematrix/json'
const MAX_CACHE_ENTRIES = 5_000
const DEFAULT_ATTEMPTS = 3

/** ระยะทางต่อช่วง (เมตร) ที่เคยคำนวณสำเร็จแล้ว — key จาก `legCacheKey()` */
const legCache = new Map<string, number>()

export class DistanceUnavailableError extends Error {
  readonly retryable: boolean

  constructor(message: string, options?: { retryable?: boolean; cause?: unknown }) {
    super(message, { cause: options?.cause })
    this.name = 'DistanceUnavailableError'
    this.retryable = options?.retryable ?? true
  }
}

export interface DistanceProvider {
  /** ระยะทางตามถนนของแต่ละช่วง (เมตร) — ลำดับตรงกับ `legs` ที่ส่งเข้าไป */
  legMeters(legs: readonly RouteLeg[]): Promise<number[]>
}

interface DistanceMatrixResponse {
  status?: string
  error_message?: string
  rows?: Array<{ elements?: Array<{ status?: string; distance?: { value?: number } }> }>
}

const RETRYABLE_STATUS = new Set(['OVER_QUERY_LIMIT', 'UNKNOWN_ERROR', 'OVER_DAILY_LIMIT'])

function coord(point: GeoPoint): string {
  return `${point.latitude},${point.longitude}`
}

async function fetchLegMeters(leg: RouteLeg, apiKey: string, fetchImpl: typeof fetch): Promise<number> {
  const url = new URL(ENDPOINT)
  url.searchParams.set('origins', coord(leg.from))
  url.searchParams.set('destinations', coord(leg.to))
  url.searchParams.set('mode', 'driving')
  url.searchParams.set('units', 'metric')
  url.searchParams.set('key', apiKey)

  let response: Response
  try {
    response = await fetchImpl(url, { method: 'GET' })
  } catch (cause) {
    throw new DistanceUnavailableError('เรียก Google Distance Matrix ไม่สำเร็จ (network)', { cause })
  }

  if (!response.ok) {
    // 4xx = key/สิทธิ์ผิด (ลองใหม่ก็ไม่หาย) · 5xx = ปลายทางล่มชั่วคราว
    throw new DistanceUnavailableError(`Google Distance Matrix ตอบ HTTP ${response.status}`, {
      retryable: response.status >= 500,
    })
  }

  const body = (await response.json()) as DistanceMatrixResponse
  if (body.status !== 'OK') {
    throw new DistanceUnavailableError(`Google Distance Matrix status=${body.status ?? 'UNKNOWN'}`, {
      retryable: RETRYABLE_STATUS.has(body.status ?? ''),
    })
  }

  const element = body.rows?.[0]?.elements?.[0]
  // ไม่มีเส้นทางรถวิ่งได้ระหว่าง 2 จุด (จุดซ้ำกัน/คนละฝั่งน้ำ) — retry อีกกี่รอบก็ได้ผลเดิม
  // ⇒ นับเป็น 0 เมตรของช่วงนั้น ดีกว่าค้าง `fuel_distance_retry` ถาวรจนไม่มีรายการเบิกเลย
  if (element?.status === 'ZERO_RESULTS') return 0
  if (element?.status !== 'OK' || typeof element.distance?.value !== 'number') {
    throw new DistanceUnavailableError(`ช่วงเส้นทางคำนวณไม่ได้ (element=${element?.status ?? 'MISSING'})`, {
      retryable: RETRYABLE_STATUS.has(element?.status ?? ''),
    })
  }
  return element.distance.value
}

export interface GoogleProviderOptions {
  fetchImpl?: typeof fetch
  attempts?: number
  /** หน่วง ms ระหว่าง retry (เทสต์ส่ง 0) */
  backoffMs?: number
}

export function googleDistanceProvider(apiKey: string, options: GoogleProviderOptions = {}): DistanceProvider {
  const fetchImpl = options.fetchImpl ?? fetch
  const attempts = options.attempts ?? DEFAULT_ATTEMPTS
  const backoffMs = options.backoffMs ?? 250

  const withRetry = async (leg: RouteLeg): Promise<number> => {
    let lastError: unknown
    for (let attempt = 1; attempt <= attempts; attempt += 1) {
      try {
        return await fetchLegMeters(leg, apiKey, fetchImpl)
      } catch (error) {
        lastError = error
        const retryable = error instanceof DistanceUnavailableError ? error.retryable : false
        if (!retryable || attempt === attempts) break
        if (backoffMs > 0) await new Promise((resolve) => setTimeout(resolve, backoffMs * attempt))
      }
    }
    throw lastError instanceof Error ? lastError : new DistanceUnavailableError('คำนวณระยะทางไม่สำเร็จ')
  }

  return {
    async legMeters(legs) {
      const results: number[] = []
      for (const leg of legs) {
        const key = legCacheKey(leg)
        const cached = legCache.get(key)
        if (cached !== undefined) {
          results.push(cached)
          continue
        }
        const meters = await withRetry(leg)
        if (legCache.size >= MAX_CACHE_ENTRIES) legCache.clear()
        legCache.set(key, meters)
        results.push(meters)
      }
      return results
    },
  }
}

/** provider ตาม env — ยังไม่ใส่ `GOOGLE_MAPS_API_KEY` = `null` (ไม่ throw ตอน boot) */
export function getDistanceProvider(options: GoogleProviderOptions = {}): DistanceProvider | null {
  const apiKey = process.env.GOOGLE_MAPS_API_KEY?.trim()
  if (apiKey === undefined || apiKey === '') return null
  return googleDistanceProvider(apiKey, options)
}

/**
 * ระยะทางรวมของเส้นทาง (เมตร) — จุดน้อยกว่า 2 จุด = 0 เมตร (ไม่ต้องเรียก API)
 * โยน {@link DistanceUnavailableError} เมื่อยังไม่ตั้ง key หรือปลายทางใช้ไม่ได้
 */
export async function resolveRouteMeters(
  points: readonly GeoPoint[],
  provider: DistanceProvider | null = getDistanceProvider(),
): Promise<number> {
  const legs = routeLegs(points)
  if (legs.length === 0) return 0
  if (provider === null) {
    throw new DistanceUnavailableError('ยังไม่ได้ตั้งค่า GOOGLE_MAPS_API_KEY — คำนวณระยะทางไม่ได้')
  }
  return sumLegMeters(await provider.legMeters(legs))
}

/** ล้าง cache — ใช้ในเทสต์เท่านั้น */
export function clearDistanceCache(): void {
  legCache.clear()
}
