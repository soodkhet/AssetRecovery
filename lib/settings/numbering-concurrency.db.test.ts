import { PrismaPg } from '@prisma/adapter-pg'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { PrismaClient } from '@/lib/generated/prisma/client'

/**
 * เทสต์ระดับ DB จริงของ Phase 1.10 — **DoD: เลขที่ใบกำกับภาษีไม่ซ้ำและไม่ข้ามภายใต้ concurrency**
 * (`13` §6.12 · `31` §6.2 · `24` §6.8 `INVOICE_NUMBER_GAP`)
 *
 * ต้องยิงพร้อมกัน **หลายคอนเนกชันจริง** ถึงจะพิสูจน์ได้ว่า `UPDATE ... RETURNING` ล็อกแถวให้
 * (เทสต์ใน transaction เดียวพิสูจน์เรื่องนี้ไม่ได้) ⇒ ไฟล์นี้จึงสร้างองค์กรทดสอบจริงแล้ว
 * **ลบทิ้งใน `afterAll`** — ไม่มีการเขียน `audit_logs` ในเส้นทางนี้ จึงลบข้อมูลทดสอบได้หมดจริง
 *
 * รันเมื่อมี `TEST_DATABASE_URL` เท่านั้น + ต้อง `pnpm db:deploy:test` มาก่อน (Rule 07)
 */

const url = process.env.TEST_DATABASE_URL

function assertLocalTestDatabase(connectionString: string): void {
  const parsed = new URL(connectionString)
  const isLocal = ['localhost', '127.0.0.1', '::1', 'postgres'].includes(parsed.hostname)
  const isTestDb = parsed.pathname.includes('test')
  if (!isLocal || !isTestDb) {
    throw new Error(
      `TEST_DATABASE_URL ต้องเป็น DB ทดสอบบนเครื่อง/CI เท่านั้น (host=${parsed.hostname} db=${parsed.pathname}) — Rule 07`,
    )
  }
}

const suite = url ? describe : describe.skip
if (!url) {
  console.warn('[numbering-concurrency.db.test] ข้ามเทสต์ระดับ DB — ไม่มี TEST_DATABASE_URL (ดู .env.example)')
}

const ORG_ID = '00000000-0000-0000-0000-0000000010a0'
const CONCURRENT_REQUESTS = 20

let client: PrismaClient | null = null
let reserveNextInvoiceNumber:
  | ((organizationId: string, issuedAt: Date, client?: never) => Promise<{ sequence: number; number: string }>)
  | null = null

/** 14/08/2026 = พ.ศ. 2569 · 05/01/2027 = พ.ศ. 2570 (เวลาไทย) */
const IN_2569 = new Date('2026-08-14T03:00:00Z')
const IN_2570 = new Date('2027-01-05T03:00:00Z')

async function resetOrganization(mode: 'continuous' | 'yearly_reset'): Promise<void> {
  await db().$executeRawUnsafe(`
    UPDATE organizations
       SET tax_invoice_numbering_mode = '${mode}',
           tax_invoice_seq = 0,
           tax_invoice_last_reset_year = NULL,
           tax_invoice_prefix = 'INV',
           tax_invoice_digit_length = 4
     WHERE id = '${ORG_ID}'
  `)
}

function db(): PrismaClient {
  if (!url) throw new Error('ไม่มี TEST_DATABASE_URL')
  if (!client) {
    assertLocalTestDatabase(url)
    client = new PrismaClient({ adapter: new PrismaPg({ connectionString: url }) })
  }
  return client
}

beforeAll(async () => {
  if (!url) return
  // `lib/prisma` อ่าน `DATABASE_URL` ตอน import — ชี้ไป DB ทดสอบก่อน แล้วค่อย dynamic import
  // (กับดักใน REUSE_INDEX: vitest ได้รับเฉพาะ `TEST_DATABASE_URL`)
  process.env.DATABASE_URL = url
  const numbering = await import('@/lib/settings/queries/numbering')
  reserveNextInvoiceNumber = numbering.reserveNextInvoiceNumber as typeof reserveNextInvoiceNumber

  await db().$executeRawUnsafe(`DELETE FROM organizations WHERE id = '${ORG_ID}'`)
  await db().$executeRawUnsafe(`
    INSERT INTO organizations (id, name, tax_id, address)
    VALUES ('${ORG_ID}', 'Phase110Numbering', '9999999999110', 'ที่อยู่ทดสอบ')
  `)
})

afterAll(async () => {
  if (url) await db().$executeRawUnsafe(`DELETE FROM organizations WHERE id = '${ORG_ID}'`)
  await client?.$disconnect()
})

function reserve(issuedAt: Date): Promise<{ sequence: number; number: string }> {
  if (!reserveNextInvoiceNumber) throw new Error('ยังไม่ได้โหลด reserveNextInvoiceNumber')
  return reserveNextInvoiceNumber(ORG_ID, issuedAt)
}

suite('Phase 1.10 — เดินเลขใบกำกับภาษีภายใต้ concurrency', () => {
  it(`ยิงพร้อมกัน ${CONCURRENT_REQUESTS} คำขอ ได้เลข 1..${CONCURRENT_REQUESTS} ครบ ไม่ซ้ำ ไม่ข้าม`, async () => {
    await resetOrganization('continuous')

    const results = await Promise.all(
      Array.from({ length: CONCURRENT_REQUESTS }, () => reserve(IN_2569)),
    )
    const sequences = results.map((result) => result.sequence).sort((a, b) => a - b)

    expect(new Set(sequences).size).toBe(CONCURRENT_REQUESTS)
    expect(sequences).toEqual(Array.from({ length: CONCURRENT_REQUESTS }, (_, index) => index + 1))
  })

  it('เลขที่ประกอบแล้วตรงรูปแบบ prefix + เติมศูนย์ตามจำนวนหลัก', async () => {
    await resetOrganization('continuous')
    const first = await reserve(IN_2569)
    expect(first.number).toBe('INV-0001')
  })

  it('โหมด yearly_reset — ปีเดิมเดินต่อพร้อมกันได้ครบ แล้วข้ามปีรีเซ็ตเป็น 1 (ปี พ.ศ.)', async () => {
    await resetOrganization('yearly_reset')

    const inYear = await Promise.all(Array.from({ length: 10 }, () => reserve(IN_2569)))
    expect(inYear.map((result) => result.sequence).sort((a, b) => a - b)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10])
    expect(inYear.every((result) => result.number.startsWith('INV-2569-'))).toBe(true)

    const nextYear = await reserve(IN_2570)
    expect(nextYear.sequence).toBe(1)
    expect(nextYear.number).toBe('INV-2570-0001')
  })

  it('ข้ามปีแล้วยิงพร้อมกัน — รีเซ็ตครั้งเดียว ไม่ใช่ทุกคำขอได้เลข 1', async () => {
    await resetOrganization('yearly_reset')
    await reserve(IN_2569)

    const results = await Promise.all(Array.from({ length: 5 }, () => reserve(IN_2570)))
    expect(results.map((result) => result.sequence).sort((a, b) => a - b)).toEqual([1, 2, 3, 4, 5])
  })

  it('เก็บ last_reset_year เฉพาะโหมด yearly_reset (โหมดต่อเนื่องไม่แตะ)', async () => {
    await resetOrganization('continuous')
    await reserve(IN_2569)

    const rows = await db().$queryRawUnsafe<{ tax_invoice_last_reset_year: number | null }[]>(
      `SELECT tax_invoice_last_reset_year FROM organizations WHERE id = '${ORG_ID}'`,
    )
    expect(rows[0]?.tax_invoice_last_reset_year).toBeNull()
  })
})
