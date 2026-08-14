/**
 * before/after diff util ของ audit (`90` §13, §16 — "แก้ข้อมูลสำคัญ → มี audit before/after")
 *
 * หน้าที่ 3 อย่าง (pure ทั้งหมด — ห้าม import อะไรที่แตะ DB):
 *  1. แปลงค่าที่ JSONB เก็บไม่ได้ให้เก็บได้ (Date → ISO UTC, Prisma Decimal/BigInt → string)
 *  2. ปิดบังค่าอ่อนไหวไม่ให้ตกไปอยู่ใน audit ตลอด 5 ปี (`90` §6.2 PDPA)
 *  3. ตัดให้เหลือเฉพาะ field ที่เปลี่ยนจริง (row ใหญ่ ๆ ไม่งั้น audit บวมและอ่านไม่ออก)
 */

export type AuditJsonValue = string | number | boolean | null | AuditJsonValue[] | { [key: string]: AuditJsonValue }

export type AuditJsonRecord = Record<string, AuditJsonValue>

/** ค่าที่ห้ามเก็บลง audit เด็ดขาด — เก็บเป็น marker แทนค่าจริง */
export const REDACTED_MARKER = '[redacted]'

/** ชื่อ field (normalize แล้ว) ที่ต้องปิดบังเสมอ ไม่ว่าอยู่ชั้นไหนของ object */
const REDACTED_FIELDS = new Set([
  'password',
  'passwordhash',
  'newpassword',
  'currentpassword',
  'token',
  'accesstoken',
  'refreshtoken',
  'idtoken',
  'apikey',
  'secret',
  'servicerolekey',
  'anonkey',
  'authorization',
  'cookie',
])

/** field ที่เปลี่ยนทุกครั้งอยู่แล้วจนไม่มีความหมายในการ diff */
const DEFAULT_IGNORED_FIELDS = ['updatedAt', 'updated_at']

/** ตัด `_` และ case ทิ้ง เพื่อให้ snake_case (DB) กับ camelCase (โค้ด) เทียบกันได้ */
export function normalizeFieldName(field: string): string {
  return field.replace(/_/g, '').toLowerCase()
}

/**
 * object ธรรมดา (row จาก Prisma / literal) เท่านั้น — instance ของคลาส เช่น Decimal ไม่นับ
 * ไม่งั้น Decimal จะถูกกาง property ภายในออกมาเป็น `{ s, e, d }` แทนที่จะเป็นตัวเลข
 */
function isPlainRecord(value: unknown): value is Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false
  const proto: unknown = Object.getPrototypeOf(value)
  return proto === Object.prototype || proto === null
}

/** Prisma Decimal / object อื่นที่มี toString ของตัวเอง (ไม่ใช่ Object.prototype.toString) */
function hasCustomToString(value: object): value is { toString(): string } {
  const fn = (value as { toString?: unknown }).toString
  return typeof fn === 'function' && fn !== Object.prototype.toString
}

/**
 * แปลงค่าใด ๆ ให้เป็นค่าที่ JSONB เก็บได้ + ปิดบัง field อ่อนไหว
 * - `undefined` → `null` (JSONB ไม่มี undefined)
 * - `Date` → ISO 8601 UTC (Rule 01 — เก็บ UTC เสมอ)
 * - `bigint` / `Decimal` → string (กันความละเอียดหาย)
 * - `Uint8Array`/`Buffer` → marker (ไม่เก็บไฟล์ลง audit)
 */
export function toAuditJson(value: unknown, seen: WeakSet<object> = new WeakSet()): AuditJsonValue {
  if (value === null || value === undefined) return null
  if (typeof value === 'string' || typeof value === 'boolean') return value
  if (typeof value === 'number') return Number.isFinite(value) ? value : String(value)
  if (typeof value === 'bigint') return value.toString()
  if (typeof value === 'function' || typeof value === 'symbol') return null
  if (value instanceof Date) return value.toISOString()
  if (ArrayBuffer.isView(value)) return '[binary]'

  if (typeof value === 'object') {
    if (seen.has(value)) return '[circular]'
    seen.add(value)

    if (Array.isArray(value)) return value.map((item) => toAuditJson(item, seen))
    if (isPlainRecord(value)) {
      const out: AuditJsonRecord = {}
      for (const [key, item] of Object.entries(value)) {
        if (item === undefined) continue
        out[key] = REDACTED_FIELDS.has(normalizeFieldName(key)) ? REDACTED_MARKER : toAuditJson(item, seen)
      }
      return out
    }
    // Decimal ของ Prisma มาถึงตรงนี้ — ต้องเป็น string ห้ามเป็น {} เปล่า
    if (hasCustomToString(value)) return value.toString()
    return null
  }

  return null
}

/** แปลง record ทั้งก้อน (undefined → หายไปทั้ง key) — คืน `null` ถ้าไม่ใช่ object */
export function toAuditJsonRecord(value: unknown): AuditJsonRecord | null {
  if (!isPlainRecord(value)) return null
  const json = toAuditJson(value)
  return isPlainRecord(json) ? (json as AuditJsonRecord) : null
}

function jsonEquals(a: AuditJsonValue, b: AuditJsonValue): boolean {
  if (a === b) return true
  if (a === null || b === null) return false
  if (typeof a !== 'object' || typeof b !== 'object') return false
  return JSON.stringify(a) === JSON.stringify(b)
}

export interface AuditDiffOptions {
  /** field ที่ไม่ต้องนับว่าเปลี่ยน (นอกเหนือจาก `updatedAt`/`updated_at` ที่ตัดให้อยู่แล้ว) */
  ignoreFields?: string[]
}

export interface AuditDiff {
  /** เฉพาะ field ที่เปลี่ยน — `null` เมื่อไม่มีค่าก่อนหน้า (เช่น create) */
  before: AuditJsonRecord | null
  after: AuditJsonRecord | null
  /** ชื่อ field ที่เปลี่ยนจริง (ตามชื่อเดิมที่ส่งเข้ามา) เรียง A→Z */
  changedFields: string[]
}

/**
 * เทียบ before/after ทีละ field แล้วคืนเฉพาะส่วนที่เปลี่ยน
 * ค่าที่หายไปฝั่งใดฝั่งหนึ่งจะถูกเก็บเป็น `null` เพื่อให้อ่านออกว่า "เพิ่ม/ลบ field"
 */
export function diffRecords(before: unknown, after: unknown, options: AuditDiffOptions = {}): AuditDiff {
  const beforeJson = toAuditJsonRecord(before)
  const afterJson = toAuditJsonRecord(after)

  const ignored = new Set(
    [...DEFAULT_IGNORED_FIELDS, ...(options.ignoreFields ?? [])].map((field) => normalizeFieldName(field)),
  )

  if (beforeJson === null || afterJson === null) {
    return {
      before: beforeJson,
      after: afterJson,
      changedFields: Object.keys(afterJson ?? beforeJson ?? {})
        .filter((key) => !ignored.has(normalizeFieldName(key)))
        .sort(),
    }
  }

  const keys = [...new Set([...Object.keys(beforeJson), ...Object.keys(afterJson)])]
    .filter((key) => !ignored.has(normalizeFieldName(key)))
    .sort()

  const changedFields: string[] = []
  const beforeChanged: AuditJsonRecord = {}
  const afterChanged: AuditJsonRecord = {}

  for (const key of keys) {
    const prev = beforeJson[key] ?? null
    const next = afterJson[key] ?? null
    if (jsonEquals(prev, next)) continue
    changedFields.push(key)
    beforeChanged[key] = prev
    afterChanged[key] = next
  }

  return { before: beforeChanged, after: afterChanged, changedFields }
}

/** ชื่อ field ที่เปลี่ยน (หรือ field ทั้งหมดของฝั่งที่มีค่า) — ใช้ตัดสิน reason policy */
export function changedFieldNames(before: unknown, after: unknown): string[] {
  return diffRecords(before, after).changedFields
}
