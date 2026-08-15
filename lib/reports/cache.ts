import { toBangkokParts } from '@/lib/format/datetime'
import type { ReportCacheMode } from '@/lib/reports/catalog'

/**
 * แคชของรายงาน 3 โหมดตาม `96` §8 (daily / hourly / realtime) + ปุ่ม "รีเฟรชตอนนี้"
 *
 * ### ทำไมเป็น in-memory ไม่ใช่ตารางในฐานข้อมูล
 * `96` §8 กำหนดแค่ "นโยบายความสด" ไม่ได้กำหนดกลไก และ `21` §7/§18 (รายงานตัวแรกของระบบ
 * ที่ทำไปแล้วใน Phase 3.8) ระบุชัดว่ารายงาน **ไม่มี entity ของตัวเอง** ⇒ ไม่มีตาราง `report_cache`
 * ใน `02` และการเพิ่มตารางใหม่ต้องแก้ schema SSOT ซึ่งต้องมีมติก่อน (Rule 02)
 * ⇒ Phase 6.1 คงกลไกเดิมของ 3.8 ไว้ทั้งหมด: แคชอยู่ในหน่วยความจำของ process
 * (แคชหายเมื่อ process รีสตาร์ต = คำนวณใหม่ ผลลัพธ์เท่าเดิมเสมอเพราะเป็นการอ่านอย่างเดียว)
 * — จุดสลับกลไกอยู่ที่ไฟล์นี้ไฟล์เดียว ผู้เรียกทุกคนเห็นแค่ `withReportCache()`
 *
 * ### กติกา
 * - **`daily` หมดอายุเที่ยงคืนตามเวลาไทย** ไม่ใช่ TTL นับถอยหลัง (รายงานของวันใหม่ต้องเป็นข้อมูลใหม่)
 * - **`hourly` หมดอายุต้นชั่วโมงถัดไป** · **`realtime` ไม่แคชเลย** (คำนวณสดทุกครั้ง)
 * - `refresh = true` ข้ามแคชแล้วเขียนทับ — แต่มี **cooldown 5 นาทีต่อคีย์** (E14) กันกดรัวจน DB ตาย
 * - อ่านอย่างเดียว ⇒ ไม่มี audit (`21` §13) และ idempotent โดยธรรมชาติ
 * - คีย์ต้องขึ้นต้นด้วย `organization_id` เสมอ (multi-tenant — ห้ามให้องค์กรหนึ่งเห็นแคชของอีกองค์กร)
 */

interface CacheEntry<T> {
  value: T
  /** instant ที่ค่าหมดอายุ — `null` = ไม่มีวันหมดอายุด้วยตัวเอง (ไม่ใช้กับ `realtime`) */
  expiresAt: number | null
  /** instant ที่คำนวณค่านี้ — ส่งกลับให้ UI บอกผู้ใช้ว่า "ข้อมูล ณ เวลา…" */
  computedAt: Date
}

const store = new Map<string, CacheEntry<unknown>>()

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
 * แล้วเก็บลงแคช · `compute` ถูกเรียกอย่างมากครั้งเดียวต่อการเรียกฟังก์ชันนี้
 */
export async function withReportCache<T>(
  key: string,
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

  const cached = store.get(key) as CacheEntry<T> | undefined
  const fresh = cached !== undefined && (cached.expiresAt === null || cached.expiresAt > now.getTime())
  const cooldownUntil = cached === undefined ? null : new Date(cached.computedAt.getTime() + REPORT_REFRESH_COOLDOWN_MS)
  const throttled =
    (options.cooldown ?? false) && refresh && cooldownUntil !== null && cooldownUntil.getTime() > now.getTime()

  if (cached !== undefined && (!refresh || throttled) && fresh) {
    return {
      value: cached.value,
      computedAt: cached.computedAt,
      fromCache: true,
      mode,
      expiresAt: cached.expiresAt === null ? null : new Date(cached.expiresAt),
      stale: staleAt(cached.computedAt, now),
      refreshAvailableAt: cooldownUntil,
      refreshThrottled: throttled,
    }
  }

  const value = await compute()
  const expiresAt = reportCacheExpiry(mode, now)
  store.set(key, { value, expiresAt: expiresAt === null ? null : expiresAt.getTime(), computedAt: now })
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
  key: string,
  options: { refresh: boolean; now: Date },
  compute: () => Promise<T>,
): Promise<CachedResult<T>> {
  return withReportCache(key, { mode: 'daily', refresh: options.refresh, now: options.now }, compute)
}

/**
 * ทิ้งแคชทุกคีย์ที่ขึ้นต้นด้วย prefix (ใช้กับ endpoint รีเฟรช — คีย์ของรายงานหนึ่งมีได้หลายตัวตามฟิลเตอร์)
 * คืนจำนวนคีย์ที่ถูกทิ้ง · **prefix ต้องขึ้นต้นด้วย `organization_id`** ไม่งั้นจะล้างข้ามองค์กร
 */
export function invalidateReportCache(prefix: string): number {
  let removed = 0
  for (const key of [...store.keys()]) {
    if (key.startsWith(prefix)) {
      store.delete(key)
      removed += 1
    }
  }
  return removed
}

/** เวลาที่คำนวณค่าล่าสุดของคีย์ (ไม่ทำให้ค่าถูกคำนวณใหม่) — ใช้เช็ค cooldown ก่อนล้างแคช */
export function reportCacheComputedAt(key: string): Date | null {
  return store.get(key)?.computedAt ?? null
}

/** prefix → instant ที่เพิ่งสั่งรีเฟรชไป (คุม cooldown ระดับรายงาน ไม่ใช่ระดับคีย์ฟิลเตอร์) */
const refreshedAt = new Map<string, number>()

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
 * ให้คำขอ GET ครั้งถัดไปคำนวณสด · ติด cooldown 5 นาทีต่อรายงานต่อองค์กร (E14)
 */
export function requestReportRefresh(prefix: string, now: Date): ReportRefreshResult {
  const last = refreshedAt.get(prefix)
  if (last !== undefined && now.getTime() - last < REPORT_REFRESH_COOLDOWN_MS) {
    return { allowed: false, invalidated: 0, availableAt: new Date(last + REPORT_REFRESH_COOLDOWN_MS) }
  }
  refreshedAt.set(prefix, now.getTime())
  return {
    allowed: true,
    invalidated: invalidateReportCache(prefix),
    availableAt: new Date(now.getTime() + REPORT_REFRESH_COOLDOWN_MS),
  }
}

/** ล้างแคชทั้งหมด — ใช้ในเทสต์เท่านั้น (โปรดักชันปล่อยให้หมดอายุเองตามรอบ) */
export function clearReportCache(): void {
  store.clear()
  refreshedAt.clear()
}
