import { createRequire } from 'node:module'
import { PrismaPg } from '@prisma/adapter-pg'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { PrismaClient } from '@/lib/generated/prisma/client'
import { createPgAdapter } from '@/lib/prisma-adapter'

/**
 * staging S-022 — query ซ้อนบน connection เดียวกันใน `$transaction`
 *
 * Prisma 7 โหลด relation หลายตัวของ operation เดียวด้วย query แยกที่ยิงพร้อมกัน ⇒ ใน transaction
 * (connection เดียว) `pg@8` พ่น DeprecationWarning "client is already executing a query" (จะพังใน pg@9)
 * เทสต์นับ "query ที่ถูกเรียกตอน connection เดียวกันยังมี query ค้างอยู่" ที่ระดับ `pg.Client#query`
 * — ไม่พึ่ง `process.on('warning')` เพราะ `util.deprecate` เตือนครั้งเดียวต่อ process (ไฟล์อื่นอาจกินไปก่อน)
 */

const url = process.env.TEST_DATABASE_URL
const suite = url ? describe : describe.skip
if (!url) console.warn('[prisma-adapter.db.test] ข้ามเทสต์ระดับ DB — ไม่มี TEST_DATABASE_URL (ดู .env.example)')

function assertLocalTestDatabase(connectionString: string): void {
  const parsed = new URL(connectionString)
  const isLocal = ['localhost', '127.0.0.1', '::1', 'postgres'].includes(parsed.hostname)
  if (!isLocal || !parsed.pathname.includes('test')) {
    throw new Error(`TEST_DATABASE_URL ต้องเป็น DB ทดสอบบนเครื่อง/CI เท่านั้น (host=${parsed.hostname}) — Rule 07`)
  }
}

const ORG_ID = '00000000-0000-4000-8000-0000000522a0'

interface PgClientPrototype {
  query: (...args: unknown[]) => unknown
}

/** `pg` ตัวเดียวกับที่ adapter ใช้ (แอปไม่ได้ depend `pg` ตรง) */
const pg = createRequire(createRequire(import.meta.url).resolve('@prisma/adapter-pg'))('pg') as {
  Client: { prototype: PgClientPrototype }
}

let overlaps = 0
const inFlight = new WeakMap<object, number>()
const originalQuery = pg.Client.prototype.query

beforeAll(() => {
  if (!url) return
  assertLocalTestDatabase(url)
  // ติดตั้งก่อนสร้าง connection แรก — ตัวต่อคิวผูก `query` ของ prototype ตอนห่อ connection
  pg.Client.prototype.query = function (this: object, ...args: unknown[]): unknown {
    const result = originalQuery.apply(this, args)
    if (!(result instanceof Promise)) return result
    const current = inFlight.get(this) ?? 0
    if (current > 0) overlaps += 1
    inFlight.set(this, current + 1)
    const done = (): void => {
      inFlight.set(this, (inFlight.get(this) ?? 1) - 1)
    }
    result.then(done, done)
    return result
  }
})

afterAll(() => {
  pg.Client.prototype.query = originalQuery
})

/** operation เดียวที่มี relation 3 ตัว ⇒ Prisma ยิง child query 3 ตัวพร้อมกันบน connection ของ transaction */
async function loadOrgWithRelationsInTransaction(client: PrismaClient): Promise<{ id: string; users: unknown[] } | null> {
  return client.$transaction(async (tx) =>
    tx.organization.findUnique({
      where: { id: ORG_ID },
      include: { users: true, roles: true, teams: true },
    }),
  )
}

suite('createPgAdapter — ไม่ยิง query ซ้อนบน connection ของ transaction (S-022)', () => {
  let plain: PrismaClient
  let serialized: PrismaClient

  beforeAll(async () => {
    if (!url) return
    plain = new PrismaClient({ adapter: new PrismaPg({ connectionString: url }) })
    serialized = new PrismaClient({ adapter: createPgAdapter(url) })
    await plain.$executeRawUnsafe(`
      INSERT INTO organizations (id, name, tax_id, address)
      VALUES ('${ORG_ID}', 'S022Test', '9999999952200', 'ที่อยู่ทดสอบ S-022')
      ON CONFLICT (id) DO NOTHING
    `)
  })

  afterAll(async () => {
    if (!url) return
    await plain.$executeRawUnsafe(`DELETE FROM organizations WHERE id = '${ORG_ID}'`)
    await plain.$disconnect()
    await serialized.$disconnect()
  })

  it('คุมผล: adapter เดิมยิง child query ซ้อนกันใน transaction (เทสต์จับปัญหาได้จริง)', async () => {
    overlaps = 0
    const org = await loadOrgWithRelationsInTransaction(plain)
    expect(org?.id).toBe(ORG_ID)
    expect(overlaps).toBeGreaterThan(0)
  })

  it('createPgAdapter: ผลเหมือนเดิมและไม่มี query ซ้อนเลย', async () => {
    overlaps = 0
    const org = await loadOrgWithRelationsInTransaction(serialized)
    expect(org?.id).toBe(ORG_ID)
    expect(org?.users).toEqual([])
    expect(overlaps).toBe(0)
  })
})
