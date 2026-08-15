import { toBangkokParts } from '@/lib/format/datetime'

/**
 * แคชรายวันของรายงานกำไร (`21` §9 · §17 "refresh รายวัน (เที่ยงคืน) + ปุ่มรีเฟรชตอนนี้")
 *
 * ### ทำไมเป็น in-memory ไม่ใช่ตารางในฐานข้อมูล
 * `21` §7 ระบุชัดว่ารายงานนี้ **ไม่มี entity ของตัวเอง** และ §18 เปิดให้เลือกกลไกแคชได้อิสระ
 * "โดยไม่กระทบ business logic" ⇒ แคชอยู่ในหน่วยความจำของ process ล้วน ไม่มี migration ใหม่
 * (แคชหายเมื่อ process รีสตาร์ต = คำนวณใหม่ ผลลัพธ์เท่าเดิมเสมอเพราะเป็นการอ่านอย่างเดียว)
 *
 * ### กติกา
 * - **หมดอายุเที่ยงคืนตามเวลาไทย** ไม่ใช่ TTL แบบนับถอยหลัง — รายงานของวันใหม่ต้องเป็นข้อมูลใหม่
 * - **`refresh = true` ข้ามแคชเสมอ** แล้วเขียนทับค่าที่แคชไว้ (ปุ่ม "รีเฟรชตอนนี้")
 * - อ่านอย่างเดียว ⇒ ไม่มี audit (`21` §13) และ idempotent โดยธรรมชาติ: คิดใหม่กี่ครั้งก็ได้ค่าเดิม
 * - คีย์ต้องมี `organization_id` เสมอ (multi-tenant — ห้ามให้องค์กรหนึ่งเห็นแคชของอีกองค์กร)
 */

interface CacheEntry<T> {
  value: T
  /** instant ที่ค่าหมดอายุ (เที่ยงคืนถัดไปตามเวลาไทย) */
  expiresAt: number
  /** instant ที่คำนวณค่านี้ — ส่งกลับให้ UI บอกผู้ใช้ว่า "ข้อมูล ณ เวลา…" */
  computedAt: Date
}

const store = new Map<string, CacheEntry<unknown>>()

/** เที่ยงคืนถัดไปตามปฏิทินไทย (UTC+7) — ขอบหมดอายุของแคชรายวัน */
export function nextBangkokMidnight(now: Date): Date {
  const parts = toBangkokParts(now)
  if (parts === null) throw new RangeError('nextBangkokMidnight: เวลาไม่ถูกต้อง')
  // เที่ยงคืนวันถัดไปตามเวลาไทย = 17:00Z ของวันก่อนหน้า ⇒ คิดจาก UTC ของวันไทยตรง ๆ
  const startOfNextThaiDay = Date.UTC(parts.year, parts.month - 1, parts.day + 1)
  return new Date(startOfNextThaiDay - 7 * 60 * 60 * 1000)
}

export interface CachedResult<T> {
  value: T
  /** เวลาที่ค่านี้ถูกคำนวณจริง (ISO UTC) */
  computedAt: Date
  /** `true` = ได้จากแคช · `false` = คำนวณสด (ครั้งแรกของวัน หรือกดรีเฟรช) */
  fromCache: boolean
}

/**
 * อ่านจากแคช ถ้าไม่มี/หมดอายุ/ถูกสั่ง refresh ⇒ เรียก `compute()` แล้วเก็บลงแคช
 * (`compute` ถูกเรียกอย่างมากครั้งเดียวต่อการเรียกฟังก์ชันนี้)
 */
export async function withDailyCache<T>(
  key: string,
  options: { refresh: boolean; now: Date },
  compute: () => Promise<T>,
): Promise<CachedResult<T>> {
  const cached = store.get(key) as CacheEntry<T> | undefined
  if (!options.refresh && cached !== undefined && cached.expiresAt > options.now.getTime()) {
    return { value: cached.value, computedAt: cached.computedAt, fromCache: true }
  }

  const value = await compute()
  store.set(key, {
    value,
    expiresAt: nextBangkokMidnight(options.now).getTime(),
    computedAt: options.now,
  })
  return { value, computedAt: options.now, fromCache: false }
}

/** ล้างแคชทั้งหมด — ใช้ในเทสต์เท่านั้น (โปรดักชันปล่อยให้หมดอายุเองตามรอบวัน) */
export function clearReportCache(): void {
  store.clear()
}
