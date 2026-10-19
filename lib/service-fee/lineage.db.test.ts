import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { PrismaPg } from '@prisma/adapter-pg'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import type { SessionUser } from '@/lib/auth/types'
import { PrismaClient } from '@/lib/generated/prisma/client'

/**
 * mytester7 S7-AG2-05 (review Rule 07) — สายเวอร์ชันเทมเพลตค่าบริการ (`lineage_id`) ระดับฐานจริง
 *  · backfill ของ migration `20261019100100_service_fee_template_lineage`: เวอร์ชันถัดไปชี้ id ของเวอร์ชันแรก
 *  · unique (organization_id, lineage_id, version) — เลขเวอร์ชันซ้ำในสายเดียวกันไม่ได้แม้ชื่อต่างกัน
 *  · service: แก้แล้วเปลี่ยนชื่อ ⇒ เวอร์ชันใหม่ชื่อใหม่ในสายเดิม · ชื่อเวอร์ชันเดิมไม่ถูกทับ
 *
 * ⚠️ ตั้ง `DATABASE_URL = TEST_DATABASE_URL` ก่อน import service · รัน `pnpm db:deploy:test` ก่อน
 */

const url = process.env.TEST_DATABASE_URL
const suite = url ? describe : describe.skip

const ORG_ID = '00000000-0000-4000-8000-0000000d7050'
const ROLE_ID = '00000000-0000-4000-8000-0000000d7051'
const USER_ID = '00000000-0000-4000-8000-0000000d7052'

function assertLocalTestDatabase(connectionString: string): void {
  const parsed = new URL(connectionString)
  if (!['localhost', '127.0.0.1', '::1', 'postgres'].includes(parsed.hostname) || !parsed.pathname.includes('test')) {
    throw new Error('TEST_DATABASE_URL ต้องเป็น DB ทดสอบบนเครื่อง/CI เท่านั้น — Rule 07')
  }
}

let client: PrismaClient | null = null
let serviceFee: typeof import('@/lib/service-fee/queries')

function db(): PrismaClient {
  if (!url) throw new Error('ไม่มี TEST_DATABASE_URL')
  if (!client) {
    assertLocalTestDatabase(url)
    client = new PrismaClient({ adapter: new PrismaPg({ connectionString: url }) })
  }
  return client
}

const admin: SessionUser = {
  id: USER_ID,
  organizationId: ORG_ID,
  supabaseUid: 'uid-sf-lineage',
  email: 'sf-lineage@test.local',
  fullName: 'ผู้ดูแลค่าบริการ',
  status: 'active',
  roleId: ROLE_ID,
  roleName: 'Superadmin',
  roleGroup: 'system',
  isSuperadmin: true,
  teamId: null,
  companyId: null,
  capabilities: {},
  scope: { kind: 'global', teamIds: [], companyId: null, userId: USER_ID },
  loginAt: new Date().toISOString(),
}

const ctx = { actor: admin, meta: { ipAddress: null, userAgent: null }, reason: 'ทดสอบสายเวอร์ชัน' }

/** คำสั่ง backfill จากไฟล์ migration จริง — จำกัดเฉพาะองค์กรทดสอบ (ไม่แตะข้อมูลของชุดทดสอบอื่นในฐานเดียวกัน) */
function backfillSqlForTestOrg(): string {
  const sql = readFileSync(
    join(process.cwd(), 'prisma/migrations/20261019100100_service_fee_template_lineage/migration.sql'),
    'utf8',
  )
  const start = sql.indexOf('UPDATE "service_fee_templates"')
  const end = sql.indexOf(';', start)
  if (start < 0 || end < 0) throw new Error('ไม่พบคำสั่ง backfill ใน migration')
  return `${sql.slice(start, end)} AND t."organization_id" = '${ORG_ID}'`
}

async function insertRaw(name: string, version: number, lineageId: string | null = null): Promise<string> {
  const rows = await db().$queryRawUnsafe<{ id: string }[]>(`
    INSERT INTO service_fee_templates
      (organization_id, name, model, base_satang, rate_pct, basis, version, is_current, lineage_id, created_by)
    VALUES ('${ORG_ID}', $$${name}$$, 'FLAT', 125000, 0, NULL, ${version}, false,
            ${lineageId === null ? 'NULL' : `'${lineageId}'`}, '${USER_ID}')
    RETURNING id
  `)
  return rows[0]?.id ?? ''
}

async function cleanup(): Promise<void> {
  await db().$executeRawUnsafe(`DELETE FROM service_fee_templates WHERE organization_id = '${ORG_ID}'`)
}

suite('สายเวอร์ชันเทมเพลตค่าบริการ lineage_id (mytester7 S7-AG2-05)', () => {
  beforeAll(async () => {
    process.env.DATABASE_URL = url
    serviceFee = await import('@/lib/service-fee/queries')
    await db().$executeRawUnsafe(`
      INSERT INTO organizations (id, name, tax_id, address)
      VALUES ('${ORG_ID}', 'SfLineage', '9999999970500', 'ที่อยู่ทดสอบ lineage') ON CONFLICT (id) DO NOTHING
    `)
    await db().$executeRawUnsafe(`
      INSERT INTO roles (id, organization_id, name, role_group, is_seed)
      VALUES ('${ROLE_ID}', '${ORG_ID}', 'ผู้ดูแล lineage', 'system', false) ON CONFLICT (id) DO NOTHING
    `)
    await db().$executeRawUnsafe(`
      INSERT INTO users (id, organization_id, role_id, email, full_name, status)
      VALUES ('${USER_ID}', '${ORG_ID}', '${ROLE_ID}', 'sf-lineage@test.local', 'ผู้ดูแลค่าบริการ', 'active')
      ON CONFLICT (id) DO NOTHING
    `)
  })

  beforeEach(cleanup)

  afterAll(async () => {
    if (url) await cleanup()
    await client?.$disconnect()
  })

  it('backfill: เวอร์ชันถัดไปของชื่อเดียวกันชี้ id ของเวอร์ชันแรก · เวอร์ชันแรก/เทมเพลตเดี่ยวคง NULL', async () => {
    const v1 = await insertRaw('เหมาจ่าย 1,250', 1)
    const v2 = await insertRaw('เหมาจ่าย 1,250', 2)
    const v3 = await insertRaw('เหมาจ่าย 1,250', 3)
    const single = await insertRaw('อัตราสำเร็จ 10%', 1)

    await db().$executeRawUnsafe(backfillSqlForTestOrg())

    const rows = await db().serviceFeeTemplate.findMany({
      where: { organizationId: ORG_ID },
      select: { id: true, lineageId: true },
    })
    const lineageOf = (id: string) => rows.find((row) => row.id === id)?.lineageId
    expect(lineageOf(v1)).toBeNull()
    expect(lineageOf(v2)).toBe(v1)
    expect(lineageOf(v3)).toBe(v1)
    expect(lineageOf(single)).toBeNull()
  })

  it('unique (organization_id, lineage_id, version): เลขเวอร์ชันซ้ำในสายเดียวกันไม่ได้ แม้ชื่อต่างกัน', async () => {
    const v1 = await insertRaw('สาย A', 1)
    await insertRaw('สาย A (ชื่อใหม่)', 2, v1)
    await expect(insertRaw('สาย A (อีกชื่อ)', 2, v1)).rejects.toThrow(/uniq_service_fee_templates_org_lineage_version/)
    // คนละสาย เลขเวอร์ชันเดียวกันได้
    const other = await insertRaw('สาย B', 1)
    await expect(insertRaw('สาย B (ชื่อใหม่)', 2, other)).resolves.toBeTypeOf('string')
  })

  it('FX review L1 — สร้างเทมเพลตชื่อ X พร้อมกับเปลี่ยนชื่ออีกสายเป็น X ⇒ สำเร็จได้ทางเดียว อีกทาง DUPLICATE_TEMPLATE_NAME', async () => {
    const base = { model: 'FLAT' as const, baseSatang: 125_000, ratePct: 0, basis: null, failFeeSatang: null }
    const other = await serviceFee.createServiceFeeTemplate(ctx, { ...base, name: 'เทมเพลตเดิมของอีกสาย' })
    const current = await serviceFee.getServiceFeeTemplate(ORG_ID, other.id)
    // เปลี่ยนชื่อเริ่มก่อน (มีอ่านสายก่อนตรวจชื่อ) แล้วสร้างตามมาในจังหวะที่การตรวจนอกทรานแซกชันของทั้งคู่ยังไม่เห็นกัน
    const renaming = serviceFee.updateServiceFeeTemplate(ctx, current, { ...base, baseSatang: 150_000, name: 'ชื่อแข่งกัน' })
    await new Promise((resolve) => setImmediate(resolve))
    const results = await Promise.allSettled([
      serviceFee.createServiceFeeTemplate(ctx, { ...base, name: 'ชื่อแข่งกัน' }),
      renaming,
    ])
    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1)
    const rejected = results.find((result) => result.status === 'rejected')
    expect(rejected?.status === 'rejected' ? rejected.reason : null).toMatchObject({ code: 'DUPLICATE_TEMPLATE_NAME' })
    const lineages = await db().serviceFeeTemplate.findMany({
      where: { organizationId: ORG_ID, name: 'ชื่อแข่งกัน' },
      select: { id: true, lineageId: true },
    })
    expect(new Set(lineages.map((row) => row.lineageId ?? row.id)).size).toBe(1)
  })

  it('service: แก้แล้วเปลี่ยนชื่อ ⇒ เวอร์ชันใหม่ชื่อใหม่ในสายเดิม · ชื่อ v1 ไม่ถูกทับ · ประวัติครบทุกชื่อ', async () => {
    const created = await serviceFee.createServiceFeeTemplate(ctx, {
      name: 'เหมาจ่าย 1,250 บาท/เคส',
      model: 'FLAT',
      baseSatang: 125_000,
      ratePct: 0,
      basis: null,
      failFeeSatang: null,
    })
    const v1 = await serviceFee.getServiceFeeTemplate(ORG_ID, created.id)
    const v2 = await serviceFee.updateServiceFeeTemplate(ctx, v1, {
      name: 'เหมาจ่าย 1,500 บาท/เคส',
      model: 'FLAT',
      baseSatang: 150_000,
      ratePct: 0,
      basis: null,
      failFeeSatang: null,
    })
    const v3 = await serviceFee.updateServiceFeeTemplate(ctx, await serviceFee.getServiceFeeTemplate(ORG_ID, v2.id), {
      name: 'เหมาจ่าย 1,750 บาท/เคส',
      model: 'FLAT',
      baseSatang: 175_000,
      ratePct: 0,
      basis: null,
      failFeeSatang: null,
    })

    const rows = await db().serviceFeeTemplate.findMany({
      where: { organizationId: ORG_ID },
      select: { id: true, name: true, version: true, lineageId: true, isCurrent: true },
      orderBy: { version: 'asc' },
    })
    expect(rows.map((row) => [row.version, row.name, row.lineageId, row.isCurrent])).toEqual([
      [1, 'เหมาจ่าย 1,250 บาท/เคส', null, false],
      [2, 'เหมาจ่าย 1,500 บาท/เคส', created.id, false],
      [3, 'เหมาจ่าย 1,750 บาท/เคส', created.id, true],
    ])

    const history = await serviceFee.listServiceFeeTemplateVersions(ORG_ID, v3.id)
    expect(history.map((row) => row.name)).toEqual([
      'เหมาจ่าย 1,750 บาท/เคส',
      'เหมาจ่าย 1,500 บาท/เคส',
      'เหมาจ่าย 1,250 บาท/เคส',
    ])

    // ชื่อของเวอร์ชันแรก (lineage_id = NULL) ในสายอื่นต้องถูกนับว่าซ้ำ — ตัวกรอง "ไม่อยู่ในสายนี้" ต้อง null-safe
    const other = await serviceFee.createServiceFeeTemplate(ctx, {
      name: 'เทมเพลตอีกชุด',
      model: 'FLAT',
      baseSatang: 100_000,
      ratePct: 0,
      basis: null,
      failFeeSatang: null,
    })
    await expect(
      serviceFee.updateServiceFeeTemplate(ctx, await serviceFee.getServiceFeeTemplate(ORG_ID, other.id), {
        name: 'เหมาจ่าย 1,250 บาท/เคส',
        model: 'FLAT',
        baseSatang: 100_000,
        ratePct: 0,
        basis: null,
        failFeeSatang: null,
      }),
    ).rejects.toMatchObject({ code: 'DUPLICATE_TEMPLATE_NAME' })
  })
})
