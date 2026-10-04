import { toBangkokParts } from '@/lib/format/datetime'
import { postgresReportCacheStore, type ReportCacheStore } from '@/lib/reports/cache-store'
import type { ReportCacheMode } from '@/lib/reports/catalog'

/**
 * แคชของรายงาน 3 โหมดตาม `96` §8 (daily / hourly / realtime) + ปุ่ม "รีเฟรชตอนนี้"
 *
 * ### เก็บที่ไหน — มติ PO 05/10/2569 (UAT U9)
 * เดิม (Phase 3.8/6.1) แคชอยู่ในหน่วยความจำของ process ⇒ บน Vercel หลาย instance การล้างแคช
 * (หลังอนุมัติ Adjustment — BUG-128) มีผลแค่ instance เดียว · ตอนนี้เก็บในตาราง `report_cache_entries`
 * ของ Postgres (`02` v4.16 · ผ่าน `lib/reports/cache-store.ts`) — ล้างครั้งเดียวทุก instance เห็นทันที
 * ผู้เรียกทุกคนยังเห็นแค่ `withReportCache()` / `withDailyCache()` เหมือนเดิม
 *
 * ### กติกา
 * - **`daily` หมดอายุเที่ยงคืนตามเวลาไทย** ไม่ใช่ TTL นับถอยหลัง (รายงานของวันใหม่ต้องเป็นข้อมูลใหม่)
 * - **`hourly` หมดอายุต้นชั่วโมงถัดไป** · **`realtime` ไม่แคชเลย** (คำนวณสดทุกครั้ง)
 * - `refresh = true` ข้ามแคชแล้วเขียนทับ — แต่มี **cooldown 5 นาทีต่อคีย์** (E14) กันกดรัวจน DB ตาย
 * - อ่านอย่างเดียว ⇒ ไม่มี audit (`21` §13) และ idempotent โดยธรรมชาติ
 * - ทุกแถวผูก `organization_id` และคีย์ต้องขึ้นต้นด้วย `<org>:` หรือ `profit:<org>:` (ตรวจที่ `assertScopedKey`)
 * - คีย์ต้องรวมมิติ scope ของผู้เรียก (ทีม/บริษัท) — ผู้ใช้ต่างขอบเขตห้ามได้แคชก้อนเดียวกัน
 * - ค่าที่แคชต้องเป็น JSON ล้วน (เก็บเป็น JSONB — `Date` จะกลายเป็นสตริง)
 */

/** คีย์แคช = องค์กร + คีย์เต็ม */
export interface ReportCacheKey {
  readonly organizationId: string
  readonly key: string
}

let activeStore: ReportCacheStore = postgresReportCacheStore

/**
 * สลับที่เก็บแคช — **เทสต์ unit ที่ไม่มี DB เท่านั้น** (ใช้คู่กับ `createMemoryReportCacheStore()`)
 * คืนที่เก็บเดิมเพื่อคืนค่าหลังเทสต์
 */
export function setReportCacheStore(store: ReportCacheStore): ReportCacheStore {
  const previous = activeStore
  activeStore = store
  return previous
}

/** กันคีย์ที่ไม่ผูกองค์กร — prefix ที่ยอมรับ: `<org>:` (รายงาน 17 ตัว) · `profit:<org>:` (กำไรขั้นต้น) */
function assertScopedKey({ organizationId, key }: ReportCacheKey): void {
  if (organizationId === '' || !(key.startsWith(`${organizationId}:`) || key.startsWith(`profit:${organizationId}:`))) {
    throw new RangeError(`report cache: คีย์ไม่ผูกองค์กร (${key})`)
  }
}

/** ระยะห้ามกดรีเฟรชซ้ำต่อคีย์ (E14 — "ปุ่มรีเฟรช cooldown 5 นาที/รายงาน") */
export const REPORT_REFRESH_COOLDOWN_MS = 5 * 60 * 1000

const MS_PER_HOUR = 60 * 60 * 1000

/** เที่ยงคืนถัดไปตามปฏิทินไทย (UTC+7) — ขอบหมดอายุของแคชรายวัน */
export function nextBangkokMidnight(now: Date): Date {
  const parts = toBangkokParts(now)
  if (parts === null) throw new RangeError('nextBangkokMidnight: เวลาไม่ถูกต้อง')
  // เที่ยงคืนวันถัดไปตามเวลาไทย = 17:00Z ของวันก่อนหน้า ⇒ คิดจาก UTC ของวันไทยตรง ๆ
  const startOfNextThaiDay = Date.UTC(parts.year, parts.month - 1, parts.day + 1)
  return new Date(startOfNextThaiDay - 7 * 60 * 60 * 1000)
}

/** ต้นชั่วโมงถัดไป — ขอบหมดอายุของแคชรายชั่วโมง (ชั่วโมงไทยกับ UTC ตรงกันเพราะ offset เป็นชั่วโมงเต็ม) */
export function nextHourBoundary(now: Date): Date {
  return new Date((Math.floor(now.getTime() / MS_PER_HOUR) + 1) * MS_PER_HOUR)
}

/** ขอบหมดอายุตามโหมด — `realtime` คืน `null` (ไม่เก็บแคช) */
export function reportCacheExpiry(mode: ReportCacheMode, now: Date): Date | null {
  switch (mode) {
    case 'daily':
      return nextBangkokMidnight(now)
    case 'hourly':
      return nextHourBoundary(now)
    case 'realtime':
      return null
  }
}

export interface CachedResult<T> {
  value: T
  /** เวลาที่ค่านี้ถูกคำนวณจริง */
  computedAt: Date
  /** `true` = ได้จากแคช · `false` = คำนวณสด (หมดอายุ/ครั้งแรก/กดรีเฟรช/โหมด realtime) */
  fromCache: boolean
  mode: ReportCacheMode
  /** ค่านี้จะหมดอายุเมื่อไร — `null` สำหรับ `realtime` */
  expiresAt: Date | null
  /** เก่าเกิน 24 ชั่วโมง (`96` §12 — UI ต้องขึ้นเวลารีเฟรชล่าสุด + ปุ่มรีเฟรช) */
  stale: boolean
  /** กดรีเฟรชได้อีกครั้งเมื่อไร (E14 cooldown) — `null` = กดได้เลย */
  refreshAvailableAt: Date | null
  /** ผู้ใช้กดรีเฟรชแต่ยังอยู่ในช่วง cooldown ⇒ คืนค่าที่แคชไว้แทน */
  refreshThrottled: boolean
}

const STALE_AFTER_MS = 24 * MS_PER_HOUR

function staleAt(computedAt: Date, now: Date): boolean {
  return now.getTime() - computedAt.getTime() >= STALE_AFTER_MS
}

export interface ReportCacheOptions {
  readonly mode: ReportCacheMode
  readonly refresh: boolean
  readonly now: Date
  /**
   * บังคับ cooldown 5 นาทีกับการกดรีเฟรช (E14) — **ค่าเริ่มต้นปิด**
   *
   * เมนูรายงานของไฟล์ 96 (`runReport()`) เปิดไว้เพื่อกันกดรัว ส่วนรายงานกำไร/แดชบอร์ดของ 3.8
   * ปิดไว้ตาม `21` §17 ที่ระบุว่าปุ่ม "รีเฟรชตอนนี้" ต้องเห็นข้อมูลใหม่ทันที
   */
  readonly cooldown?: boolean
}


/**
 * อ่านจากแคชตามโหมด — ไม่มี/หมดอายุ/ถูกสั่ง refresh (และพ้น cooldown) ⇒ เรียก `compute()`
 * แล้วเขียนทับลงแคช (upsert) · `compute` ถูกเรียกอย่างมากครั้งเดียวต่อการเรียกฟังก์ชันนี้
 */
export async function withReportCache<T>(
  cacheKey: ReportCacheKey,
  options: ReportCacheOptions,
  compute: () => Promise<T>,
): Promise<CachedResult<T>> {
  const { mode, refresh, now } = options

  if (mode === 'realtime') {
    const value = await compute()
    return {
      value,
      computedAt: now,
      fromCache: false,
      mode,
      expiresAt: null,
      stale: false,
      refreshAvailableAt: null,
      refreshThrottled: false,
    }
  }

  assertScopedKey(cacheKey)
  const { organizationId, key } = cacheKey
  const cached = await activeStore.get(organizationId, key, now)
  const cooldownUntil = cached === null ? null : new Date(cached.computedAt.getTime() + REPORT_REFRESH_COOLDOWN_MS)
  const throttled =
    (options.cooldown ?? false) && refresh && cooldownUntil !== null && cooldownUntil.getTime() > now.getTime()

  if (cached !== null && (!refresh || throttled)) {
    return {
      // ค่าใน JSONB เป็นค่าที่ `compute()` ของคีย์เดียวกันคืนไว้ (คีย์ผูกรายงาน/มิติ ⇒ รูปเดียวกัน)
      value: cached.value as T,
      computedAt: cached.computedAt,
      fromCache: true,
      mode,
      expiresAt: cached.expiresAt,
      stale: staleAt(cached.computedAt, now),
      refreshAvailableAt: cooldownUntil,
      refreshThrottled: throttled,
    }
  }

  const value = await compute()
  const expiresAt = reportCacheExpiry(mode, now)
  await activeStore.put(organizationId, key, { value, computedAt: now, expiresAt }, now)
  return {
    value,
    computedAt: now,
    fromCache: false,
    mode,
    expiresAt,
    stale: false,
    refreshAvailableAt: new Date(now.getTime() + REPORT_REFRESH_COOLDOWN_MS),
    refreshThrottled: false,
  }
}

/**
 * แคชรายวัน — ทางเข้าเดิมของ Phase 3.8 (ไฟล์ 14/21) ที่ยังใช้อยู่ทั้งระบบ
 * เป็นเพียง wrapper บาง ๆ ของ `withReportCache()` โหมด `daily` เพื่อไม่ให้มีสองกลไกซ้อนกัน
 */
export async function withDailyCache<T>(
  cacheKey: ReportCacheKey,
  options: { refresh: boolean; now: Date },
  compute: () => Promise<T>,
): Promise<CachedResult<T>> {
  return withReportCache(cacheKey, { mode: 'daily', refresh: options.refresh, now: options.now }, compute)
}

/**
 * ทิ้งแคชทุกคีย์ขององค์กรที่ขึ้นต้นด้วย prefix (ใช้กับ endpoint รีเฟรช — คีย์ของรายงานหนึ่งมีได้หลายตัวตามฟิลเตอร์)
 * คืนจำนวนคีย์ที่ถูกทิ้ง · ลบเฉพาะแถวของ `organizationId` เท่านั้น (ไม่มีทางล้างข้ามองค์กร)
 */
export async function invalidateReportCache(organizationId: string, prefix: string): Promise<number> {
  return activeStore.deleteByPrefixes(organizationId, [prefix])
}

/**
 * ทิ้งแคชรายงาน **ทุกตัวขององค์กรหนึ่ง** — เรียกหลังเหตุการณ์ที่เปลี่ยนตัวเลขย้อนหลังของงวดที่ปิดไปแล้ว
 * (Adjustment ได้รับอนุมัติ — UAT BUG-128) เพื่อไม่ให้ผู้บริหารเห็นยอดเก่าจนหมดวัน
 *
 * ครอบคีย์ทั้ง 2 รูปแบบที่ระบบใช้: `<org>:report:…` (รายงาน 17 ตัว) และ `profit:<org>:…` (กำไรขั้นต้น)
 * ไม่แตะ cooldown ของปุ่มรีเฟรช (ไม่ใช่การกดของผู้ใช้) · ลบแถวใน DB ⇒ มีผลทุก instance ทันที (UAT U9)
 */
export async function invalidateOrganizationReportCache(organizationId: string): Promise<number> {
  return activeStore.deleteByPrefixes(organizationId, [`${organizationId}:`, `profit:${organizationId}:`])
}

/** เวลาที่คำนวณค่าล่าสุดของคีย์ (ไม่ทำให้ค่าถูกคำนวณใหม่) — `null` = ไม่มี/หมดอายุแล้ว */
export async function reportCacheComputedAt(cacheKey: ReportCacheKey, now: Date = new Date()): Promise<Date | null> {
  const entry = await activeStore.get(cacheKey.organizationId, cacheKey.key, now)
  return entry?.computedAt ?? null
}

/** คีย์ของแถวคุม cooldown ระดับรายงาน — ไม่ขึ้นต้นด้วย `<org>:` ⇒ การล้างแคชไม่ลบ cooldown ทิ้ง */
function refreshMarkerKey(prefix: string): string {
  return `refresh-cooldown:${prefix}`
}

export interface ReportRefreshResult {
  /** พ้น cooldown แล้วจึงล้างแคชให้จริง */
  readonly allowed: boolean
  /** จำนวนคีย์ที่ถูกล้าง (0 เมื่อยังอยู่ใน cooldown หรือไม่เคยมีแคช) */
  readonly invalidated: number
  /** กดได้อีกครั้งเมื่อไร */
  readonly availableAt: Date
}

/**
 * สั่งรีเฟรชรายงานหนึ่งตัว (endpoint `POST /api/reports/:id/refresh`) — ล้างแคชทุกฟิลเตอร์ของรายงานนั้น
 * ให้คำขอ GET ครั้งถัดไปคำนวณสด · ติด cooldown 5 นาทีต่อรายงานต่อองค์กร (E14) — นับร่วมทุก instance
 */
export async function requestReportRefresh(
  organizationId: string,
  prefix: string,
  now: Date,
): Promise<ReportRefreshResult> {
  assertScopedKey({ organizationId, key: prefix })
  const claim = await activeStore.claimRefresh(organizationId, refreshMarkerKey(prefix), now, REPORT_REFRESH_COOLDOWN_MS)
  if (!claim.allowed) return { allowed: false, invalidated: 0, availableAt: claim.availableAt }
  return {
    allowed: true,
    invalidated: await activeStore.deleteByPrefixes(organizationId, [prefix]),
    availableAt: claim.availableAt,
  }
}

/** ล้างแคชทั้งหมด (ทุกองค์กร รวม cooldown) — ใช้ในเทสต์เท่านั้น (โปรดักชันปล่อยให้หมดอายุเองตามรอบ) */
export async function clearReportCache(): Promise<void> {
  await activeStore.clear()
}
