import { PrismaPg } from '@prisma/adapter-pg'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { PrismaClient } from '@/lib/generated/prisma/client'
import {
  clearReportCache,
  invalidateOrganizationReportCache,
  reportCacheComputedAt,
  requestReportRefresh,
  withReportCache,
  type ReportCacheKey,
} from '@/lib/reports/cache'
import { postgresReportCacheStore } from '@/lib/reports/cache-store'

/**
 * แคชรายงานใน Postgres — มติ PO 05/10/2569 (UAT U9)
 *
 * สิ่งที่ต้องพิสูจน์ (แทนการรันหลาย instance จริง: ทุก instance อ่าน/เขียนตารางเดียวกัน
 * ⇒ ถ้าล้างแถวใน DB แล้วอ่านใหม่ได้ค่าใหม่ = instance อื่นก็ได้ค่าใหม่):
 *  · ล้างแคชขององค์กรแล้วอ่านใหม่ได้ค่าใหม่ · องค์กรอื่นไม่โดน
 *  · เขียนพร้อมกันหลายคำขอ (upsert) ไม่ชน unique · ค่าที่คำนวณทีหลังชนะ
 *  · แถวหมดอายุถูกลบตอนอ่าน/เขียน · cooldown ปุ่มรีเฟรชนับร่วมกัน (กดพร้อมกันผ่านได้ครั้งเดียว)
 */

const url = process.env.TEST_DATABASE_URL

function assertLocalTestDatabase(connectionString: string): void {
  const parsed = new URL(connectionString)
  const isLocal = ['localhost', '127.0.0.1', '::1', 'postgres'].includes(parsed.hostname)
  if (!isLocal || !parsed.pathname.includes('test')) {
    throw new Error(`TEST_DATABASE_URL ต้องเป็น DB ทดสอบบนเครื่อง/CI เท่านั้น (host=${parsed.hostname}) — Rule 07`)
  }
}

const suite = url ? describe : describe.skip
if (!url) {
  console.warn('[cache-store.db.test] ข้ามเทสต์ระดับ DB — ไม่มี TEST_DATABASE_URL (ดู .env.example)')
}

const ORG_A = '00000000-0000-4000-8000-0000000096a0'
const ORG_B = '00000000-0000-4000-8000-0000000096b0'
const NOW = new Date('2026-10-05T03:00:00Z')

let client: PrismaClient | null = null

function db(): PrismaClient {
  if (!url) throw new Error('ไม่มี TEST_DATABASE_URL')
  if (!client) {
    assertLocalTestDatabase(url)
    client = new PrismaClient({ adapter: new PrismaPg({ connectionString: url }) })
  }
  return client
}

function keyOf(organizationId: string, suffix: string): ReportCacheKey {
  return { organizationId, key: `${organizationId}:report:${suffix}` }
}

async function rowCount(organizationId: string): Promise<number> {
  return db().reportCacheEntry.count({ where: { organizationId } })
}

beforeAll(async () => {
  if (!url) return
  process.env.DATABASE_URL = url
  await db().$executeRawUnsafe(`
    INSERT INTO organizations (id, name, tax_id, address) VALUES
      ('${ORG_A}', 'U9CacheA', '9999999996001', 'ที่อยู่ทดสอบ U9 A'),
      ('${ORG_B}', 'U9CacheB', '9999999996002', 'ที่อยู่ทดสอบ U9 B')
    ON CONFLICT (id) DO NOTHING
  `)
})

beforeEach(async () => {
  if (!url) return
  await db().reportCacheEntry.deleteMany({ where: { organizationId: { in: [ORG_A, ORG_B] } } })
})

afterAll(async () => {
  if (!url) return
  await db().$executeRawUnsafe(`DELETE FROM organizations WHERE id IN ('${ORG_A}', '${ORG_B}')`)
  await client?.$disconnect()
})

suite('แคชรายงานใน Postgres (UAT U9)', () => {
  it('เก็บลง DB แล้วอ่านซ้ำได้จากแคช · ค่า JSON กลับมาครบ', async () => {
    const payload = { rows: [{ name: 'ทีม ก', amountSatang: 10050, ratio: null }], note: 'ทดสอบ' }
    const first = await withReportCache(keyOf(ORG_A, 'f1:x'), { mode: 'daily', refresh: false, now: NOW }, async () => payload)
    const second = await withReportCache(
      keyOf(ORG_A, 'f1:x'),
      { mode: 'daily', refresh: false, now: new Date(NOW.getTime() + 60_000) },
      async () => ({ rows: [], note: 'ไม่ควรถูกเรียก' }),
    )
    expect(first.fromCache).toBe(false)
    expect(second.fromCache).toBe(true)
    expect(second.value).toEqual(payload)
    expect(second.computedAt.toISOString()).toBe(NOW.toISOString())
    expect(await rowCount(ORG_A)).toBe(1)
  })

  it('ล้างแคชขององค์กร ⇒ อ่านใหม่ได้ค่าใหม่ · องค์กรอื่นไม่โดน · ครอบคีย์ profit ด้วย', async () => {
    const opts = { mode: 'daily', refresh: false, now: NOW } as const
    await withReportCache(keyOf(ORG_A, 'f1:x'), opts, async () => 'A-old')
    await withReportCache({ organizationId: ORG_A, key: `profit:${ORG_A}:all|all:company:m` }, opts, async () => 'P-old')
    await withReportCache(keyOf(ORG_B, 'f1:x'), opts, async () => 'B-old')

    expect(await invalidateOrganizationReportCache(ORG_A)).toBe(2)
    expect(await rowCount(ORG_A)).toBe(0)

    const later = { ...opts, now: new Date(NOW.getTime() + 60_000) }
    expect((await withReportCache(keyOf(ORG_A, 'f1:x'), later, async () => 'A-new')).value).toBe('A-new')
    expect((await withReportCache(keyOf(ORG_B, 'f1:x'), later, async () => 'B-new')).value).toBe('B-old')
  })

  it('คีย์เดียวกันคนละองค์กร = คนละแถว (ห้ามรั่วข้ามองค์กร) · คีย์ไม่ผูกองค์กรถูกปฏิเสธ', async () => {
    const opts = { mode: 'hourly', refresh: false, now: NOW } as const
    const sharedKey = `${ORG_A}:report:f1:x`
    await withReportCache({ organizationId: ORG_A, key: sharedKey }, opts, async () => 'A')
    await expect(
      withReportCache({ organizationId: ORG_B, key: sharedKey }, opts, async () => 'B'),
    ).rejects.toThrow(RangeError)
    expect(await reportCacheComputedAt({ organizationId: ORG_B, key: sharedKey }, NOW)).toBeNull()
  })

  it('refresh พร้อมกันหลายคำขอ ⇒ upsert ไม่ชน unique · เหลือแถวเดียว', async () => {
    const results = await Promise.all(
      Array.from({ length: 8 }, (_, index) =>
        withReportCache(
          keyOf(ORG_A, 'race'),
          { mode: 'daily', refresh: true, now: new Date(NOW.getTime() + index) },
          async () => `v${index}`,
        ),
      ),
    )
    expect(results.every((result) => !result.fromCache)).toBe(true)
    expect(await rowCount(ORG_A)).toBe(1)
    const row = await db().reportCacheEntry.findFirstOrThrow({ where: { organizationId: ORG_A } })
    // ค่าที่คำนวณทีหลังสุดชนะเสมอ ไม่ว่าคำขอไหนเขียนเสร็จก่อน
    expect(row.payload).toBe('v7')
    expect(row.computedAt.toISOString()).toBe(new Date(NOW.getTime() + 7).toISOString())
  })

  it('ค่าที่คำนวณก่อนไม่เขียนทับค่าที่ใหม่กว่า', async () => {
    const newer = new Date(NOW.getTime() + 10_000)
    const expiresAt = new Date(NOW.getTime() + 3_600_000)
    await postgresReportCacheStore.put(ORG_A, `${ORG_A}:report:o`, { value: 'new', computedAt: newer, expiresAt }, NOW)
    await postgresReportCacheStore.put(ORG_A, `${ORG_A}:report:o`, { value: 'old', computedAt: NOW, expiresAt }, NOW)
    expect((await postgresReportCacheStore.get(ORG_A, `${ORG_A}:report:o`, NOW))?.value).toBe('new')
  })

  it('แถวหมดอายุ: อ่านเจอ = ลบทิ้งแล้วคำนวณใหม่ · เขียนครั้งถัดไปกวาดแถวหมดอายุขององค์กร', async () => {
    await withReportCache(keyOf(ORG_A, 'h1'), { mode: 'hourly', refresh: false, now: NOW }, async () => 'h1')
    await withReportCache(keyOf(ORG_A, 'h2'), { mode: 'hourly', refresh: false, now: NOW }, async () => 'h2')
    await withReportCache(keyOf(ORG_B, 'h1'), { mode: 'hourly', refresh: false, now: NOW }, async () => 'b')
    const nextHour = new Date(NOW.getTime() + 3_600_000)

    const reread = await withReportCache(keyOf(ORG_A, 'h1'), { mode: 'hourly', refresh: false, now: nextHour }, async () => 'h1-new')
    expect(reread).toMatchObject({ fromCache: false, value: 'h1-new' })
    // h2 ที่หมดอายุถูกกวาดตอนเขียน h1 ใหม่ · องค์กร B ไม่ถูกแตะ
    expect(await rowCount(ORG_A)).toBe(1)
    expect(await rowCount(ORG_B)).toBe(1)
  })

  it('ปุ่มรีเฟรชกดพร้อมกัน (จำลองหลาย instance) ⇒ ผ่านได้ครั้งเดียว · cooldown ไม่ถูกลบโดยการล้างแคช', async () => {
    const prefix = `${ORG_A}:report:f1:`
    await withReportCache(keyOf(ORG_A, 'f1:x'), { mode: 'daily', refresh: false, now: NOW }, async () => 'A')

    const outcomes = await Promise.all(Array.from({ length: 5 }, () => requestReportRefresh(ORG_A, prefix, NOW)))
    expect(outcomes.filter((outcome) => outcome.allowed)).toHaveLength(1)
    expect(outcomes.find((outcome) => outcome.allowed)?.invalidated).toBe(1)

    await invalidateOrganizationReportCache(ORG_A)
    const again = await requestReportRefresh(ORG_A, prefix, new Date(NOW.getTime() + 60_000))
    expect(again.allowed).toBe(false)
    expect(again.availableAt.toISOString()).toBe(new Date(NOW.getTime() + 5 * 60_000).toISOString())

    const afterCooldown = await requestReportRefresh(ORG_A, prefix, new Date(NOW.getTime() + 5 * 60_000 + 1))
    expect(afterCooldown.allowed).toBe(true)
  })

  it('clearReportCache (เทสต์) ล้างทุกแถว', async () => {
    await withReportCache(keyOf(ORG_A, 'c'), { mode: 'daily', refresh: false, now: NOW }, async () => 1)
    await clearReportCache()
    expect(await rowCount(ORG_A)).toBe(0)
  })
})
