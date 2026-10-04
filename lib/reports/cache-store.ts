import { prisma } from '@/lib/prisma'

/**
 * ที่เก็บแคชรายงาน — มติ PO 05/10/2569 (UAT U9)
 *
 * เดิมแคชอยู่ในหน่วยความจำของ process ⇒ บน Vercel ที่มีหลาย instance การล้างแคช (เช่นหลังอนุมัติ
 * Adjustment — BUG-128) มีผลแค่ instance เดียว · ตอนนี้เก็บในตาราง `report_cache_entries` (Postgres)
 * ทุก instance อ่าน/ล้างแถวชุดเดียวกัน
 *
 * - ทุกคำสั่ง scope ด้วย `organization_id` เสมอ (คีย์ซ้ำข้ามองค์กรก็เป็นคนละแถว — unique `(org, key)`)
 * - เขียนด้วย `INSERT … ON CONFLICT DO UPDATE` (atomic) ⇒ คำขอพร้อมกันหลายตัวไม่ชน unique และ
 *   ค่าที่ **คำนวณทีหลัง** ชนะเสมอ (ไม่เอาค่าเก่ากว่ามาเขียนทับค่าใหม่)
 * - ไม่มี cleanup job แยก: แถวหมดอายุถูกลบตอนอ่านเจอ + กวาดแถวหมดอายุขององค์กรนั้นทุกครั้งที่เขียน
 *
 * `createMemoryReportCacheStore()` มีไว้ให้เทสต์ unit ที่ไม่มี DB เท่านั้น
 */

export interface StoredReportCacheEntry {
  readonly value: unknown
  readonly computedAt: Date
  readonly expiresAt: Date | null
}

export interface RefreshClaim {
  /** `true` = พ้น cooldown แล้ว (แถว cooldown ถูกเขียนเวลาใหม่) */
  readonly allowed: boolean
  /** กดได้อีกครั้งเมื่อไร */
  readonly availableAt: Date
}

export interface ReportCacheStore {
  /** ค่าที่ยังไม่หมดอายุ ณ `now` — หมดอายุแล้ว = ลบทิ้งแล้วคืน `null` */
  get(organizationId: string, key: string, now: Date): Promise<StoredReportCacheEntry | null>
  /** เขียนทับ (upsert) — ค่าที่ `computedAt` เก่ากว่าค่าที่มีอยู่จะไม่ทับ */
  put(organizationId: string, key: string, entry: StoredReportCacheEntry, now: Date): Promise<void>
  /** ลบทุกคีย์ขององค์กรที่ขึ้นต้นด้วย prefix ใด prefix หนึ่ง — คืนจำนวนแถวที่ลบ */
  deleteByPrefixes(organizationId: string, prefixes: readonly string[]): Promise<number>
  /** จองสิทธิ์รีเฟรชแบบ atomic — ภายใน `cooldownMs` นับจากครั้งก่อน = ไม่อนุญาต */
  claimRefresh(organizationId: string, markerKey: string, now: Date, cooldownMs: number): Promise<RefreshClaim>
  /** ลบทั้งหมด — เทสต์เท่านั้น */
  clear(): Promise<void>
}

function isExpired(expiresAt: Date | null, now: Date): boolean {
  return expiresAt !== null && expiresAt.getTime() <= now.getTime()
}

/** escape อักขระพิเศษของ `LIKE` ให้ prefix ถูกจับแบบตรงตัว */
function likePrefix(prefix: string): string {
  return `${prefix.replace(/[\\%_]/g, (char) => `\\${char}`)}%`
}

export const postgresReportCacheStore: ReportCacheStore = {
  async get(organizationId, key, now) {
    const row = await prisma.reportCacheEntry.findUnique({
      where: { organizationId_cacheKey: { organizationId, cacheKey: key } },
      select: { id: true, payload: true, computedAt: true, expiresAt: true },
    })
    if (row === null) return null
    if (isExpired(row.expiresAt, now)) {
      // ลบเฉพาะแถวที่ยังหมดอายุอยู่ (อีก instance อาจเพิ่งเขียนค่าใหม่ทับไปแล้ว)
      await prisma.reportCacheEntry.deleteMany({ where: { id: row.id, expiresAt: { lte: now } } })
      return null
    }
    return { value: row.payload, computedAt: row.computedAt, expiresAt: row.expiresAt }
  },

  async put(organizationId, key, entry, now) {
    const payload = JSON.stringify(entry.value ?? null)
    await prisma.$executeRaw`
      INSERT INTO report_cache_entries (organization_id, cache_key, payload, computed_at, expires_at)
      VALUES (${organizationId}::uuid, ${key}, ${payload}::jsonb, ${entry.computedAt}, ${entry.expiresAt})
      ON CONFLICT (organization_id, cache_key) DO UPDATE
        SET payload = EXCLUDED.payload,
            computed_at = EXCLUDED.computed_at,
            expires_at = EXCLUDED.expires_at,
            updated_at = NOW()
        WHERE report_cache_entries.computed_at <= EXCLUDED.computed_at`
    // กวาดแถวหมดอายุขององค์กรนี้ (ไม่มี cleanup job แยก — index `(organization_id, expires_at)`)
    await prisma.reportCacheEntry.deleteMany({ where: { organizationId, expiresAt: { lte: now } } })
  },

  async deleteByPrefixes(organizationId, prefixes) {
    if (prefixes.length === 0) return 0
    let removed = 0
    for (const prefix of prefixes) {
      removed += await prisma.$executeRaw`
        DELETE FROM report_cache_entries
        WHERE organization_id = ${organizationId}::uuid AND cache_key LIKE ${likePrefix(prefix)}`
    }
    return removed
  },

  async claimRefresh(organizationId, markerKey, now, cooldownMs) {
    const threshold = new Date(now.getTime() - cooldownMs)
    const expiresAt = new Date(now.getTime() + cooldownMs)
    // แถว cooldown: computed_at = เวลาที่กดล่าสุด · อัปเดตได้เฉพาะเมื่อพ้น cooldown แล้ว (atomic ใน statement เดียว)
    const claimed = await prisma.$queryRaw<{ computed_at: Date }[]>`
      INSERT INTO report_cache_entries (organization_id, cache_key, payload, computed_at, expires_at)
      VALUES (${organizationId}::uuid, ${markerKey}, NULL, ${now}, ${expiresAt})
      ON CONFLICT (organization_id, cache_key) DO UPDATE
        SET computed_at = EXCLUDED.computed_at, expires_at = EXCLUDED.expires_at, updated_at = NOW()
        WHERE report_cache_entries.computed_at <= ${threshold}
      RETURNING computed_at`
    if (claimed.length > 0) return { allowed: true, availableAt: expiresAt }

    const current = await prisma.reportCacheEntry.findUnique({
      where: { organizationId_cacheKey: { organizationId, cacheKey: markerKey } },
      select: { computedAt: true },
    })
    const last = current?.computedAt ?? now
    return { allowed: false, availableAt: new Date(last.getTime() + cooldownMs) }
  },

  async clear() {
    await prisma.reportCacheEntry.deleteMany({})
  },
}

/** ที่เก็บในหน่วยความจำ — **เทสต์ unit เท่านั้น** (production ใช้ `postgresReportCacheStore` เสมอ) */
export function createMemoryReportCacheStore(): ReportCacheStore {
  const rows = new Map<string, StoredReportCacheEntry>()
  const id = (organizationId: string, key: string): string => `${organizationId}\u0000${key}`

  return {
    async get(organizationId, key, now) {
      const entry = rows.get(id(organizationId, key))
      if (entry === undefined) return null
      if (isExpired(entry.expiresAt, now)) {
        rows.delete(id(organizationId, key))
        return null
      }
      return entry
    },
    async put(organizationId, key, entry) {
      const existing = rows.get(id(organizationId, key))
      if (existing !== undefined && existing.computedAt.getTime() > entry.computedAt.getTime()) return
      // จำลองการเก็บเป็น JSONB — ค่าที่อ่านกลับต้องผ่าน JSON เหมือนของจริง
      rows.set(id(organizationId, key), { ...entry, value: JSON.parse(JSON.stringify(entry.value ?? null)) })
    },
    async deleteByPrefixes(organizationId, prefixes) {
      let removed = 0
      for (const rowId of [...rows.keys()]) {
        const [org, key] = rowId.split('\u0000') as [string, string]
        if (org === organizationId && prefixes.some((prefix) => key.startsWith(prefix))) {
          rows.delete(rowId)
          removed += 1
        }
      }
      return removed
    },
    async claimRefresh(organizationId, markerKey, now, cooldownMs) {
      const existing = rows.get(id(organizationId, markerKey))
      if (existing !== undefined && now.getTime() - existing.computedAt.getTime() < cooldownMs) {
        return { allowed: false, availableAt: new Date(existing.computedAt.getTime() + cooldownMs) }
      }
      const expiresAt = new Date(now.getTime() + cooldownMs)
      rows.set(id(organizationId, markerKey), { value: null, computedAt: now, expiresAt })
      return { allowed: true, availableAt: expiresAt }
    },
    async clear() {
      rows.clear()
    },
  }
}
