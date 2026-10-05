import { randomUUID } from 'node:crypto'
import { PrismaPg } from '@prisma/adapter-pg'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { PrismaClient } from '@/lib/generated/prisma/client'
import { parseBillingBatchNumber } from '@/lib/revenue/billing-batch-number'

/**
 * ตัวเดินเลขรอบวางบิล `BL-<พ.ศ.>-NNN` ระดับ DB (มติ PO U76 · migration `20261005200000_billing_batch_number`)
 *
 *  - INSERT โดยไม่ส่งเลข ⇒ trigger ใส่ให้ตามปี พ.ศ. ของ created_at (เวลาไทย) · ลำดับ 3 หลัก
 *  - สร้างพร้อมกันหลายทรานแซกชันในองค์กรเดียว ⇒ เลขไม่ซ้ำ ไม่ข้าม
 *  - ทรานแซกชันล้ม ⇒ ตัวนับ rollback (ไม่มีช่องว่าง)
 *  - ขึ้นปีใหม่ (เวลาไทย) ⇒ รีเซ็ตเป็น 001 · รอบย้อนปีต่อจากเลขสูงสุดของปีนั้น · องค์กรอื่นนับแยก
 *  - แก้เลขของรอบที่ออกแล้วไม่ได้
 *
 * ⚠️ สร้างองค์กรใหม่ทุกรัน ⇒ ตัวนับเริ่มที่ 0 เสมอ ไม่ชนข้อมูลรันก่อน
 */

const url = process.env.TEST_DATABASE_URL
const suite = url ? describe : describe.skip
if (!url) console.warn('[billing-batch-number.db.test] ข้ามเทสต์ระดับ DB — ไม่มี TEST_DATABASE_URL')

function assertLocalTestDatabase(connectionString: string): void {
  const parsed = new URL(connectionString)
  const isLocal = ['localhost', '127.0.0.1', '::1', 'postgres'].includes(parsed.hostname)
  if (!isLocal || !parsed.pathname.includes('test')) {
    throw new Error(`TEST_DATABASE_URL ต้องเป็น DB ทดสอบบนเครื่อง/CI เท่านั้น (host=${parsed.hostname}) — Rule 07`)
  }
}

let client: PrismaClient | null = null
function db(): PrismaClient {
  if (!url) throw new Error('ไม่มี TEST_DATABASE_URL')
  if (!client) {
    assertLocalTestDatabase(url)
    client = new PrismaClient({ adapter: new PrismaPg({ connectionString: url }) })
  }
  return client
}

const RUN = `${process.pid}${Date.now()}`
const taxId = (salt: number): string => `${RUN}${salt}`.slice(-13).padStart(13, '7')

interface Org {
  orgId: string
  userId: string
  companyId: string
}

let orgA: Org
let orgB: Org
let periodCursor = 0

async function seedOrg(salt: number): Promise<Org> {
  const orgId = randomUUID()
  const roleId = randomUUID()
  const userId = randomUUID()
  await db().$executeRawUnsafe(`
    INSERT INTO organizations (id, name, tax_id, address) VALUES ('${orgId}', 'BillingNumberTest', '${taxId(salt)}', 'กรุงเทพฯ')
  `)
  await db().$executeRawUnsafe(`
    INSERT INTO roles (id, organization_id, name, role_group, is_seed) VALUES ('${roleId}', '${orgId}', 'การเงิน BL', 'system', false)
  `)
  await db().$executeRawUnsafe(`
    INSERT INTO users (id, organization_id, role_id, email, full_name, status)
    VALUES ('${userId}', '${orgId}', '${roleId}', 'bl-${orgId}@test.local', 'การเงิน BL', 'active')
  `)
  const company = await db().$queryRawUnsafe<{ id: string }[]>(`
    INSERT INTO finance_companies (organization_id, name, short_name, tax_id, address, vat_mode, payment_due_days, created_by)
    VALUES ('${orgId}', 'ไฟแนนซ์ BL ${salt}', 'FBL', '${taxId(salt + 50)}', 'กรุงเทพฯ', 'exclude_vat', 30, '${userId}')
    RETURNING id
  `)
  return { orgId, userId, companyId: company[0]?.id ?? '' }
}

/** INSERT รอบวางบิล 1 ใบ (ไม่ส่งเลข) แล้วคืนเลขที่ trigger ใส่ให้ — `createdAt` = ISO UTC */
async function insertBatch(org: Org, createdAt?: string, runner: Pick<PrismaClient, '$queryRawUnsafe'> = db()): Promise<string> {
  periodCursor += 1
  const createdCol = createdAt === undefined ? '' : ', created_at'
  const createdVal = createdAt === undefined ? '' : `, '${createdAt}'::timestamptz`
  const rows = await runner.$queryRawUnsafe<{ batch_number: string }[]>(`
    INSERT INTO billing_batches (organization_id, company_id, period, due_date, created_by${createdCol})
    VALUES ('${org.orgId}', '${org.companyId}', 'งวดทดสอบ ${RUN}-${periodCursor}', '2026-12-31', '${org.userId}'${createdVal})
    RETURNING batch_number
  `)
  return rows[0]?.batch_number ?? ''
}

suite('เลขรอบวางบิล BL — trigger next_billing_batch_number()', () => {
  beforeAll(async () => {
    orgA = await seedOrg(1)
    orgB = await seedOrg(2)
  })

  afterAll(async () => {
    await client?.$disconnect()
  })

  it('เดินเลขตามปี พ.ศ. เวลาไทย เติมศูนย์ 3 หลัก · องค์กรอื่นนับแยก', async () => {
    expect(await insertBatch(orgA, '2026-03-01T03:00:00Z')).toBe('BL-2569-001')
    expect(await insertBatch(orgA, '2026-03-02T03:00:00Z')).toBe('BL-2569-002')
    expect(await insertBatch(orgB, '2026-03-02T03:00:00Z')).toBe('BL-2569-001')
  })

  it('สร้างพร้อมกัน 12 ทรานแซกชัน ⇒ เลขไม่ซ้ำ ไม่ข้าม', async () => {
    const results = await Promise.all(
      Array.from({ length: 12 }, () =>
        db().$transaction(async (tx) => insertBatch(orgA, '2026-04-01T03:00:00Z', tx)),
      ),
    )
    const sequences = results.map((value) => parseBillingBatchNumber(value)?.sequence ?? -1).sort((a, b) => a - b)
    expect(new Set(results).size).toBe(12)
    expect(sequences).toEqual(Array.from({ length: 12 }, (_, index) => index + 3))
  })

  it('ทรานแซกชันล้ม ⇒ ตัวนับ rollback เลขถัดไปไม่มีช่องว่าง', async () => {
    await expect(
      db().$transaction(async (tx) => {
        await insertBatch(orgB, '2026-05-01T03:00:00Z', tx)
        throw new Error('rollback')
      }),
    ).rejects.toThrow('rollback')
    expect(await insertBatch(orgB, '2026-05-01T03:00:00Z')).toBe('BL-2569-002')
  })

  it('ขึ้นปีใหม่ตามเวลาไทย (00:30 น. 1 ม.ค. = 17:30 UTC วันก่อน) ⇒ รีเซ็ตเป็น 001', async () => {
    expect(await insertBatch(orgB, '2026-12-31T17:30:00Z')).toBe('BL-2570-001')
    expect(await insertBatch(orgB, '2027-01-05T03:00:00Z')).toBe('BL-2570-002')
  })

  it('รอบที่ลงวันย้อนปีต่อจากเลขสูงสุดของปีนั้น และไม่ดึงตัวนับปีปัจจุบันถอยหลัง', async () => {
    expect(await insertBatch(orgB, '2026-06-01T03:00:00Z')).toBe('BL-2569-003')
    expect(await insertBatch(orgB, '2027-02-01T03:00:00Z')).toBe('BL-2570-003')
  })

  it('แก้เลขของรอบที่ออกแล้วไม่ได้', async () => {
    const number = await insertBatch(orgA, '2026-07-01T03:00:00Z')
    await expect(
      db().$executeRawUnsafe(
        `UPDATE billing_batches SET batch_number = 'BL-2569-999' WHERE organization_id = '${orgA.orgId}' AND batch_number = '${number}'`,
      ),
    ).rejects.toThrow()
  })
})
