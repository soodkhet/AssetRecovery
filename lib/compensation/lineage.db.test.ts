import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { PrismaPg } from '@prisma/adapter-pg'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import type { SessionUser } from '@/lib/auth/types'
import type { CompensationPlanValues } from '@/lib/compensation/plan'
import { PrismaClient } from '@/lib/generated/prisma/client'

/**
 * mytester7 FX2 — สายเวอร์ชันแผนค่าตอบแทน (`lineage_id`) ระดับฐานจริง
 *  · backfill ของ migration `20261019110000_compensation_plan_lineage`: เวอร์ชันถัดไปชี้ id ของเวอร์ชันแรก
 *  · unique (organization_id, lineage_id, version) — เลขเวอร์ชันซ้ำในสายเดียวกันไม่ได้แม้ชื่อต่างกัน
 *  · service: แก้แล้วเปลี่ยนชื่อ ⇒ เวอร์ชันใหม่ชื่อใหม่ในสายเดิม · ชื่อเวอร์ชันเดิมไม่ถูกทับ · ประวัติครบ
 *  · snapshot รายการเบิก (`resolvePlanSnapshot`) หาเวอร์ชันที่มีผล ณ วันนั้นข้ามชื่อได้ (`92` §7.1)
 *
 * ⚠️ ตั้ง `DATABASE_URL = TEST_DATABASE_URL` ก่อน import service · รัน `pnpm db:deploy:test` ก่อน
 */

const url = process.env.TEST_DATABASE_URL
const suite = url ? describe : describe.skip

const ORG_ID = '00000000-0000-4000-8000-0000000f2050'
const ROLE_ID = '00000000-0000-4000-8000-0000000f2051'
const USER_ID = '00000000-0000-4000-8000-0000000f2052'

function assertLocalTestDatabase(connectionString: string): void {
  const parsed = new URL(connectionString)
  if (!['localhost', '127.0.0.1', '::1', 'postgres'].includes(parsed.hostname) || !parsed.pathname.includes('test')) {
    throw new Error('TEST_DATABASE_URL ต้องเป็น DB ทดสอบบนเครื่อง/CI เท่านั้น — Rule 07')
  }
}

let client: PrismaClient | null = null
let compensation: typeof import('@/lib/compensation/queries')
let expenseQueries: typeof import('@/lib/field/expense-queries')
let appPrisma: typeof import('@/lib/prisma').prisma

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
  supabaseUid: 'uid-comp-lineage',
  email: 'comp-lineage@test.local',
  fullName: 'ผู้ดูแลแผนค่าตอบแทน',
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

const BASE_VALUES: CompensationPlanValues = {
  name: 'แผนภาคสนาม 2569',
  side: 'inhouse',
  fuelMode: 'DAILY_FLAT',
  fuelRatePerKmSatang: null,
  fuelMaxPerCaseSatang: null,
  fuelDailyFlatSatang: 30_000,
  allowanceSatang: 20_000,
  commissionSatang: 150_000,
  noSuccessFeeSatang: 50_000,
  hotelMaxPerNightSatang: null,
  hotelReceiptRequired: false,
  whtPct: 3,
  effectiveFrom: '2026-01-01',
}

/** คำสั่ง backfill จากไฟล์ migration จริง — จำกัดเฉพาะองค์กรทดสอบ (ไม่แตะข้อมูลของชุดทดสอบอื่นในฐานเดียวกัน) */
function backfillSqlForTestOrg(): string {
  const sql = readFileSync(
    join(process.cwd(), 'prisma/migrations/20261019110000_compensation_plan_lineage/migration.sql'),
    'utf8',
  )
  const start = sql.indexOf('UPDATE "compensation_plans"')
  const end = sql.indexOf(';', start)
  if (start < 0 || end < 0) throw new Error('ไม่พบคำสั่ง backfill ใน migration')
  return `${sql.slice(start, end)} AND t."organization_id" = '${ORG_ID}'`
}

async function insertRaw(name: string, version: number, lineageId: string | null = null): Promise<string> {
  const rows = await db().$queryRawUnsafe<{ id: string }[]>(`
    INSERT INTO compensation_plans
      (organization_id, name, side, fuel_mode, fuel_daily_flat_satang, allowance_satang,
       commission_satang, no_success_fee_satang, wht_pct, version, effective_from, is_current, lineage_id, created_by)
    VALUES ('${ORG_ID}', $$${name}$$, 'inhouse', 'DAILY_FLAT', 30000, 20000, 150000, 50000, 3.00, ${version},
            DATE '2026-01-01', false, ${lineageId === null ? 'NULL' : `'${lineageId}'`}, '${USER_ID}')
    RETURNING id
  `)
  return rows[0]?.id ?? ''
}

async function cleanup(): Promise<void> {
  await db().$executeRawUnsafe(`DELETE FROM compensation_plans WHERE organization_id = '${ORG_ID}'`)
}

suite('สายเวอร์ชันแผนค่าตอบแทน lineage_id (mytester7 FX2)', () => {
  beforeAll(async () => {
    process.env.DATABASE_URL = url
    compensation = await import('@/lib/compensation/queries')
    expenseQueries = await import('@/lib/field/expense-queries')
    appPrisma = (await import('@/lib/prisma')).prisma
    await db().$executeRawUnsafe(`
      INSERT INTO organizations (id, name, tax_id, address)
      VALUES ('${ORG_ID}', 'CompLineage', '9999999920500', 'ที่อยู่ทดสอบ lineage') ON CONFLICT (id) DO NOTHING
    `)
    await db().$executeRawUnsafe(`
      INSERT INTO roles (id, organization_id, name, role_group, is_seed)
      VALUES ('${ROLE_ID}', '${ORG_ID}', 'ผู้ดูแล lineage แผน', 'system', false) ON CONFLICT (id) DO NOTHING
    `)
    await db().$executeRawUnsafe(`
      INSERT INTO users (id, organization_id, role_id, email, full_name, status)
      VALUES ('${USER_ID}', '${ORG_ID}', '${ROLE_ID}', 'comp-lineage@test.local', 'ผู้ดูแลแผนค่าตอบแทน', 'active')
      ON CONFLICT (id) DO NOTHING
    `)
  })

  beforeEach(cleanup)

  afterAll(async () => {
    if (url) await cleanup()
    await client?.$disconnect()
  })

  it('backfill: เวอร์ชันถัดไปของชื่อเดียวกันชี้ id ของเวอร์ชันแรก · เวอร์ชันแรก/แผนเดี่ยวคง NULL', async () => {
    const v1 = await insertRaw('แผนเหมารายวัน', 1)
    const v2 = await insertRaw('แผนเหมารายวัน', 2)
    const v3 = await insertRaw('แผนเหมารายวัน', 3)
    const single = await insertRaw('แผนตามระยะทาง', 1)

    await db().$executeRawUnsafe(backfillSqlForTestOrg())

    const rows = await db().compensationPlan.findMany({
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
    await expect(insertRaw('สาย A (อีกชื่อ)', 2, v1)).rejects.toThrow(/uniq_compensation_plans_org_lineage_version/)
    // คนละสาย เลขเวอร์ชันเดียวกันได้
    const other = await insertRaw('สาย B', 1)
    await expect(insertRaw('สาย B (ชื่อใหม่)', 2, other)).resolves.toBeTypeOf('string')
  })

  it('service: แก้แล้วเปลี่ยนชื่อ ⇒ เวอร์ชันใหม่ชื่อใหม่ในสายเดิม · ชื่อ v1 ไม่ถูกทับ · ประวัติครบทุกชื่อ', async () => {
    const created = await compensation.createCompensationPlan(ctx, BASE_VALUES)
    const v1 = await compensation.getCompensationPlan(ORG_ID, created.id)
    const v2 = await compensation.updateCompensationPlan(ctx, v1, {
      ...BASE_VALUES,
      name: 'แผนภาคสนาม 2570',
      commissionSatang: 180_000,
      effectiveFrom: '2026-08-01',
    })
    const v3 = await compensation.updateCompensationPlan(ctx, await compensation.getCompensationPlan(ORG_ID, v2.id), {
      ...BASE_VALUES,
      name: 'แผนภาคสนาม 2571',
      commissionSatang: 200_000,
      effectiveFrom: '2026-10-01',
    })

    const rows = await db().compensationPlan.findMany({
      where: { organizationId: ORG_ID },
      select: { name: true, version: true, lineageId: true, isCurrent: true, commissionSatang: true },
      orderBy: { version: 'asc' },
    })
    expect(rows.map((row) => [row.version, row.name, row.lineageId, row.isCurrent, row.commissionSatang])).toEqual([
      [1, 'แผนภาคสนาม 2569', null, false, 150_000],
      [2, 'แผนภาคสนาม 2570', created.id, false, 180_000],
      [3, 'แผนภาคสนาม 2571', created.id, true, 200_000],
    ])

    const history = await compensation.listCompensationPlanVersions(ORG_ID, v3.id)
    expect(history.map((row) => row.name)).toEqual(['แผนภาคสนาม 2571', 'แผนภาคสนาม 2570', 'แผนภาคสนาม 2569'])

    // ชื่อของเวอร์ชันก่อนหน้าในสายเดียวกันใช้ซ้ำได้ · ชื่อของสายอื่นใช้ไม่ได้
    const other = await compensation.createCompensationPlan(ctx, { ...BASE_VALUES, name: 'แผนอีกชุด' })
    await expect(
      compensation.updateCompensationPlan(ctx, await compensation.getCompensationPlan(ORG_ID, other.id), {
        ...BASE_VALUES,
        name: 'แผนภาคสนาม 2569',
      }),
    ).rejects.toMatchObject({ code: 'DUPLICATE_TEMPLATE_NAME' })
    await expect(
      compensation.updateCompensationPlan(ctx, await compensation.getCompensationPlan(ORG_ID, v3.id), {
        ...BASE_VALUES,
        name: 'แผนภาคสนาม 2569',
        effectiveFrom: '2026-10-01',
      }),
    ).resolves.toMatchObject({ name: 'แผนภาคสนาม 2569', version: 4 })
  })

  it('snapshot รายการเบิก: ทีมชี้เวอร์ชันล่าสุด (ชื่อใหม่) แต่วันที่ย้อนหลังได้เวอร์ชันเดิมของสาย', async () => {
    const created = await compensation.createCompensationPlan(ctx, BASE_VALUES)
    const v2 = await compensation.updateCompensationPlan(ctx, await compensation.getCompensationPlan(ORG_ID, created.id), {
      ...BASE_VALUES,
      name: 'แผนภาคสนาม (ปรับคอม)',
      commissionSatang: 180_000,
      effectiveFrom: '2026-08-01',
    })

    const before = await expenseQueries.resolvePlanSnapshot(appPrisma, {
      organizationId: ORG_ID,
      planId: v2.id,
      onDate: new Date('2026-03-15T00:00:00Z'),
    })
    expect(before).toMatchObject({ planId: created.id, version: 1 })

    const after = await expenseQueries.resolvePlanSnapshot(appPrisma, {
      organizationId: ORG_ID,
      planId: v2.id,
      onDate: new Date('2026-09-01T00:00:00Z'),
    })
    expect(after).toMatchObject({ planId: v2.id, version: 2 })
  })
})
