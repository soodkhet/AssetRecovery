import { PrismaPg } from '@prisma/adapter-pg'
import { afterAll, describe, expect, it } from 'vitest'
import { PrismaClient } from '@/lib/generated/prisma/client'

/**
 * เทสต์ระดับ DB จริงของ Phase 1.8 — พิสูจน์ว่ากติกาที่ **ต้องบังคับที่ฐานข้อมูล** ยังอยู่ครบ
 * (ยามชั้น service อยู่ใน `lib/teams/team.ts` + `lib/finance-companies/company.ts` ซึ่งเทสต์แยกแล้ว)
 *
 * ครอบคลุม DoD ของ task:
 *  · `teams` UNIQUE(organization_id, name) — ชื่อทีมซ้ำไม่ได้ (`02` §5)
 *  · `team_managers` N:N — ผู้จัดการคนเดียวอยู่ได้หลายทีม (`09` §7.1/§16)
 *  · `finance_companies` UNIQUE(organization_id, tax_id) — `DUPLICATE_TAX_ID` (`10` §11)
 *  · คอลัมน์ใหม่ตามมติ PO 14/08/2569: `suspended_reason` (nullable) + `default_invoice_delivery_format`
 *    (NOT NULL DEFAULT `paper_pdf`) และ enum `invoice_delivery_format` มีค่า 2 ตัวตาม `02` §3
 *
 * ทุกเคสทำงานใน `$transaction` แล้ว **throw เพื่อ rollback** — ไม่ทิ้งขยะใน DB (กับดักใน REUSE_INDEX)
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
  console.warn('[teams-companies.db.test] ข้ามเทสต์ระดับ DB — ไม่มี TEST_DATABASE_URL (ดู .env.example)')
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

afterAll(async () => {
  await client?.$disconnect()
})

const ROLLBACK = 'rollback-after-assert'
const ORG_ID = '00000000-0000-0000-0000-0000000008a0'
const ROLE_ID = '00000000-0000-0000-0000-0000000008a1'
const USER_ID = '00000000-0000-0000-0000-0000000008a2'
const TEAM_A = '00000000-0000-0000-0000-0000000008a3'
const TEAM_B = '00000000-0000-0000-0000-0000000008a4'

/** ตั้งองค์กร + role + user ขั้นต่ำที่ FK ของ `teams`/`finance_companies` ต้องใช้ */
async function seedFixture(tx: PrismaClient): Promise<void> {
  await tx.$executeRawUnsafe(`
    INSERT INTO organizations (id, name, tax_id, address)
    VALUES ('${ORG_ID}', 'Phase18Test', '9999999999998', 'ที่อยู่ทดสอบ')
  `)
  await tx.$executeRawUnsafe(`
    INSERT INTO roles (id, organization_id, name, role_group, is_seed)
    VALUES ('${ROLE_ID}', '${ORG_ID}', 'ทดสอบหัวหน้าทีม', 'inhouse', false)
  `)
  await tx.$executeRawUnsafe(`
    INSERT INTO users (id, organization_id, role_id, email, full_name, status)
    VALUES ('${USER_ID}', '${ORG_ID}', '${ROLE_ID}', 'phase18@test.local', 'ผู้จัดการทดสอบ', 'active')
  `)
}

async function insertTeam(tx: PrismaClient, id: string, name: string): Promise<void> {
  await tx.$executeRawUnsafe(`
    INSERT INTO teams (id, organization_id, name, side, provinces, status, created_by)
    VALUES ('${id}', '${ORG_ID}', '${name}', 'inhouse', ARRAY['กรุงเทพมหานคร'], 'active', '${USER_ID}')
  `)
}

async function insertCompany(tx: PrismaClient, id: string, taxId: string): Promise<void> {
  await tx.$executeRawUnsafe(`
    INSERT INTO finance_companies (id, organization_id, name, short_name, tax_id, created_by)
    VALUES ('${id}', '${ORG_ID}', 'บริษัททดสอบ ${id}', 'T${id.slice(-2)}', '${taxId}', '${USER_ID}')
  `)
}

suite('Phase 1.8 — teams / finance_companies ระดับ DB', () => {
  it('ชื่อทีมซ้ำในองค์กรเดียวกันถูกปฏิเสธที่ DB (UNIQUE organization_id, name)', async () => {
    await expect(
      db().$transaction(async (tx) => {
        await seedFixture(tx as PrismaClient)
        await insertTeam(tx as PrismaClient, TEAM_A, 'ทีมกรุงเทพ 1')
        await insertTeam(tx as PrismaClient, TEAM_B, 'ทีมกรุงเทพ 1')
        throw new Error(ROLLBACK)
      }),
    ).rejects.toThrow(/duplicate key|teams_organization_id_name_key/i)
  })

  it('ผู้จัดการคนเดียวผูกได้ 2 ทีม — `team_managers` มี 2 แถว (`09` §16)', async () => {
    let managedTeams: string[] = []

    await expect(
      db().$transaction(async (tx) => {
        await seedFixture(tx as PrismaClient)
        await insertTeam(tx as PrismaClient, TEAM_A, 'ทีมเหนือ')
        await insertTeam(tx as PrismaClient, TEAM_B, 'ทีมใต้')
        await tx.$executeRawUnsafe(`
          INSERT INTO team_managers (team_id, user_id)
          VALUES ('${TEAM_A}', '${USER_ID}'), ('${TEAM_B}', '${USER_ID}')
        `)

        const rows = await tx.$queryRawUnsafe<{ team_id: string }[]>(
          `SELECT team_id FROM team_managers WHERE user_id = '${USER_ID}' ORDER BY team_id`,
        )
        managedTeams = rows.map((row) => row.team_id)
        throw new Error(ROLLBACK)
      }),
    ).rejects.toThrow(ROLLBACK)

    expect(managedTeams).toEqual([TEAM_A, TEAM_B])
  })

  it('tax_id ซ้ำในองค์กรเดียวกันถูกปฏิเสธที่ DB (`10` §11 DUPLICATE_TAX_ID)', async () => {
    await expect(
      db().$transaction(async (tx) => {
        await seedFixture(tx as PrismaClient)
        await insertCompany(tx as PrismaClient, '00000000-0000-0000-0000-0000000008b1', '0105512345678')
        await insertCompany(tx as PrismaClient, '00000000-0000-0000-0000-0000000008b2', '0105512345678')
        throw new Error(ROLLBACK)
      }),
    ).rejects.toThrow(/duplicate key|finance_companies_organization_id_tax_id_key/i)
  })

  it('คอลัมน์ใหม่ตามมติ PO: suspended_reason ว่างได้ · default_invoice_delivery_format ดีฟอลต์ paper_pdf', async () => {
    let row: { status: string; suspended_reason: string | null; default_invoice_delivery_format: string } | undefined

    await expect(
      db().$transaction(async (tx) => {
        await seedFixture(tx as PrismaClient)
        const companyId = '00000000-0000-0000-0000-0000000008b3'
        await insertCompany(tx as PrismaClient, companyId, '0105512345679')

        const rows = await tx.$queryRawUnsafe<typeof row extends undefined ? never[] : (NonNullable<typeof row>)[]>(
          `SELECT status, suspended_reason, default_invoice_delivery_format
             FROM finance_companies WHERE id = '${companyId}'`,
        )
        row = rows[0]

        // ระงับบริษัท → เก็บเหตุผลลงคอลัมน์ได้จริง (ไม่ใช่เก็บแค่ใน audit log)
        await tx.$executeRawUnsafe(`
          UPDATE finance_companies
             SET status = 'suspended', suspended_reason = 'ค้างชำระเกิน 90 วัน'
           WHERE id = '${companyId}'
        `)
        const after = await tx.$queryRawUnsafe<{ suspended_reason: string }[]>(
          `SELECT suspended_reason FROM finance_companies WHERE id = '${companyId}'`,
        )
        expect(after[0]?.suspended_reason).toBe('ค้างชำระเกิน 90 วัน')
        throw new Error(ROLLBACK)
      }),
    ).rejects.toThrow(ROLLBACK)

    expect(row?.status).toBe('active')
    expect(row?.suspended_reason).toBeNull()
    expect(row?.default_invoice_delivery_format).toBe('paper_pdf')
  })

  it('enum `invoice_delivery_format` มีค่า 2 ตัวตาม `02` §3', async () => {
    const rows = await db().$queryRaw<{ enumlabel: string }[]>`
      SELECT enumlabel FROM pg_enum
      WHERE enumtypid = 'invoice_delivery_format'::regtype
      ORDER BY enumsortorder
    `
    expect(rows.map((row) => row.enumlabel)).toEqual(['e_tax_invoice', 'paper_pdf'])
  })
})
