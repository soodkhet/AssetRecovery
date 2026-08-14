import { PrismaPg } from '@prisma/adapter-pg'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { PrismaClient } from '@/lib/generated/prisma/client'
import { normalizeCaseRef } from '@/lib/cases/case-ref'

/**
 * เทสต์ระดับ DB จริงของ Phase 2.2 — DoD ของ task:
 *  · `38` §11 กันเลขที่สัญญาซ้ำ **ภายใต้ concurrency 3 ช่องทาง** (manual/import/api ยิงพร้อมกัน)
 *    → ต้องสำเร็จแค่ 1 ราย ที่เหลือชนกับ unique index `uniq_cases_company_case_ref`
 *  · normalize ไม่ตัด dash/underscore ⇒ เลขที่ต่างกันจริงยังสร้างได้ (`38` §20)
 *  · `38` §11 เคสจาก API ที่ข้อมูลไม่ครบต้องสร้าง draft ได้ (คอลัมน์ required ของ §6 ต้อง NULL ได้)
 *
 * ต่างจากเทสต์ DB ตัวอื่นตรงที่ **ต้อง commit จริง** (race ข้าม transaction ทดสอบใน tx เดียวไม่ได้)
 * จึงเก็บกวาดด้วยการลบ fixture ใน `afterAll` — ไม่มีการเขียน `audit_logs` ในเทสต์นี้จึงลบได้หมด
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
  console.warn('[case-duplicate.db.test] ข้ามเทสต์ระดับ DB — ไม่มี TEST_DATABASE_URL (ดู .env.example)')
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

const ORG_ID = '00000000-0000-0000-0000-0000000022a0'
const ROLE_ID = '00000000-0000-0000-0000-0000000022a1'
const USER_ID = '00000000-0000-0000-0000-0000000022a2'
const COMPANY_A = '00000000-0000-0000-0000-0000000022a3'
const COMPANY_B = '00000000-0000-0000-0000-0000000022a4'

/**
 * ล้างเฉพาะ `cases` — **ห้ามลบ `users`**: FK `audit_logs.actor_id` ทำให้ Postgres ยิง UPDATE ใส่
 * `audit_logs` ซึ่งโดน trigger immutable ปฏิเสธทันที (กับดัก 2026-08-14 ใน REUSE_INDEX)
 * org/role/user/company ของ fixture จึงถูกทิ้งไว้และ insert แบบ idempotent
 */
async function cleanupCases(): Promise<void> {
  if (!url) return
  await db().$executeRawUnsafe(`DELETE FROM cases WHERE organization_id = '${ORG_ID}'`)
}

beforeAll(async () => {
  if (!url) return
  const tx = db()
  await tx.$executeRawUnsafe(`
    INSERT INTO organizations (id, name, tax_id, address)
    VALUES ('${ORG_ID}', 'Phase22Test', '9999999999922', 'ที่อยู่ทดสอบ')
    ON CONFLICT (id) DO NOTHING
  `)
  await tx.$executeRawUnsafe(`
    INSERT INTO roles (id, organization_id, name, role_group, is_seed)
    VALUES ('${ROLE_ID}', '${ORG_ID}', 'ทดสอบธุรการ', 'system', false)
    ON CONFLICT (id) DO NOTHING
  `)
  await tx.$executeRawUnsafe(`
    INSERT INTO users (id, organization_id, role_id, email, full_name, status)
    VALUES ('${USER_ID}', '${ORG_ID}', '${ROLE_ID}', 'phase22@test.local', 'ธุรการทดสอบ', 'active')
    ON CONFLICT (id) DO NOTHING
  `)
  const companies: Array<[string, string]> = [
    [COMPANY_A, '0105512300022'],
    [COMPANY_B, '0105512300023'],
  ]
  for (const [id, taxId] of companies) {
    await tx.$executeRawUnsafe(`
      INSERT INTO finance_companies (id, organization_id, name, short_name, tax_id, created_by)
      VALUES ('${id}', '${ORG_ID}', 'ไฟแนนซ์ทดสอบ ${id.slice(-2)}', 'T${id.slice(-2)}', '${taxId}', '${USER_ID}')
      ON CONFLICT (id) DO NOTHING
    `)
  }
  await cleanupCases()
})

afterAll(async () => {
  await cleanupCases()
  await client?.$disconnect()
})

/** insert ตรงตามที่ชั้น service ทำ — `case_ref_normalized` มาจาก `normalizeCaseRef()` เสมอ */
function insertCase(caseRef: string, source: 'manual' | 'import' | 'api', companyId = COMPANY_A): Promise<number> {
  return db().$executeRawUnsafe(`
    INSERT INTO cases (organization_id, case_ref, case_ref_normalized, company_id, source, status, created_by)
    VALUES ('${ORG_ID}', $$${caseRef}$$, $$${normalizeCaseRef(caseRef)}$$, '${companyId}', '${source}', 'draft', '${USER_ID}')
  `)
}

suite('Phase 2.2 — กันเลขที่สัญญาซ้ำระดับ DB (`38` §11)', () => {
  it('3 ช่องทางยิงพร้อมกันด้วยเลขเดียวกัน (ต่างกันแค่ตัวพิมพ์/ช่องว่าง) — สำเร็จแค่ 1', async () => {
    const results = await Promise.allSettled([
      insertCase('SF-2026-0001', 'manual'),
      insertCase('  sf-2026-0001  ', 'import'),
      insertCase('Sf-2026-0001', 'api'),
    ])

    const fulfilled = results.filter((result) => result.status === 'fulfilled')
    const rejected = results.filter((result) => result.status === 'rejected')
    expect(fulfilled).toHaveLength(1)
    expect(rejected).toHaveLength(2)
    for (const failure of rejected) {
      expect(String((failure as PromiseRejectedResult).reason)).toMatch(
        /duplicate key|uniq_cases_company_case_ref/i,
      )
    }

    const rows = await db().$queryRawUnsafe<{ count: bigint }[]>(
      `SELECT COUNT(*) AS count FROM cases WHERE organization_id = '${ORG_ID}' AND case_ref_normalized = 'SF-2026-0001'`,
    )
    expect(Number(rows[0]?.count)).toBe(1)
  })

  it('เลขที่มี dash/underscore ต่างกันไม่ถือว่าซ้ำ (`38` §20)', async () => {
    await expect(insertCase('SF-2026-0002', 'manual')).resolves.toBeGreaterThan(0)
    await expect(insertCase('SF_2026_0002', 'manual')).resolves.toBeGreaterThan(0)
    await expect(insertCase('SF20260002', 'manual')).resolves.toBeGreaterThan(0)
  })

  it('เลขเดียวกันแต่คนละบริษัทไฟแนนซ์ = ไม่ซ้ำ (unique ผูกกับ company_id)', async () => {
    await expect(insertCase('SF-2026-0003', 'manual', COMPANY_A)).resolves.toBeGreaterThan(0)
    await expect(insertCase('SF-2026-0003', 'manual', COMPANY_B)).resolves.toBeGreaterThan(0)
  })

  it('เคสที่ถูก soft delete แล้วยังจองเลขที่สัญญาไว้ (index ไม่ partial — ตรงกับ UNIQUE ของ `02` §6)', async () => {
    await insertCase('SF-2026-0004', 'manual')
    await db().$executeRawUnsafe(
      `UPDATE cases SET deleted_at = NOW() WHERE organization_id = '${ORG_ID}' AND case_ref_normalized = 'SF-2026-0004'`,
    )
    await expect(insertCase('SF-2026-0004', 'manual')).rejects.toThrow(/duplicate key/i)
  })

  it('เคสจาก API ที่ข้อมูลไม่ครบสร้าง draft ได้ (`38` §11/§20)', async () => {
    await expect(insertCase('SF-2026-0005', 'api')).resolves.toBeGreaterThan(0)

    const rows = await db().$queryRawUnsafe<
      { status: string; source: string; debtor_name: string | null; asset_description: string | null }[]
    >(
      `SELECT status, source, debtor_name, asset_description FROM cases
        WHERE organization_id = '${ORG_ID}' AND case_ref_normalized = 'SF-2026-0005'`,
    )
    expect(rows[0]).toEqual({ status: 'draft', source: 'api', debtor_name: null, asset_description: null })
  })
})
