import { PrismaPg } from '@prisma/adapter-pg'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { SessionUser } from '@/lib/auth/types'
import { PrismaClient } from '@/lib/generated/prisma/client'
import { lotCompanySummaryQuerySchema, lotListQuerySchema } from '@/lib/warehouse/schemas'

/**
 * มติ PO U142 — แท็บ "ส่งมอบแล้ว" จัดกลุ่มตามบริษัท (ระดับ DB)
 *  · ยอดหัวกลุ่ม aggregate ที่ DB ตามตัวกรอง + scope (ไม่ใช่นับจากหน้าที่โหลด)
 *  · ขอบเดือน/วันตามเวลาไทย (00:30 น. ไทยของวันที่ 1 = เดือนใหม่ · 00:30 น. ไทยของวันที่ 1 เดือนถัดไป = หลุด)
 *  · "วันส่งมอบ" ของล็อตที่ยังรอหลักฐาน = กำหนดส่ง
 *  · Company User เห็นเฉพาะบริษัทตัวเอง (ส่ง companyId ของบริษัทอื่นมาก็ไม่เห็น)
 *  · แบ่งหน้าจริงต่อบริษัท
 *
 * ⚠️ ต้องตั้ง `DATABASE_URL = TEST_DATABASE_URL` **ก่อน** import service (กับดัก 2026-08-14)
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
if (!url) console.warn('[delivered-lot-groups.db.test] ข้ามเทสต์ระดับ DB — ไม่มี TEST_DATABASE_URL')

const ORG_ID = '00000000-0000-4000-8000-000000142a00'
const ROLE_ID = '00000000-0000-4000-8000-000000142a01'
const ADMIN_ID = '00000000-0000-4000-8000-000000142a02'
const COMPANY_USER_ID = '00000000-0000-4000-8000-000000142a03'
const TEMPLATE_ID = '00000000-0000-4000-8000-000000142a04'
const COMPANY_A = '00000000-0000-4000-8000-000000142a0a'
const COMPANY_B = '00000000-0000-4000-8000-000000142a0b'

let client: PrismaClient | null = null
let warehouse: typeof import('@/lib/warehouse/queries')

function db(): PrismaClient {
  if (!url) throw new Error('ไม่มี TEST_DATABASE_URL')
  if (!client) {
    assertLocalTestDatabase(url)
    client = new PrismaClient({ adapter: new PrismaPg({ connectionString: url }) })
  }
  return client
}

function sessionUser(overrides: Partial<SessionUser> & Pick<SessionUser, 'id'>): SessionUser {
  return {
    organizationId: ORG_ID,
    supabaseUid: `uid-${overrides.id}`,
    email: `${overrides.id}@test.local`,
    fullName: 'ผู้ทดสอบ U142',
    status: 'active',
    roleId: ROLE_ID,
    roleName: 'ธุรการ',
    roleGroup: 'system',
    isSuperadmin: false,
    teamId: null,
    companyId: null,
    capabilities: {},
    scope: { kind: 'global', teamIds: [], companyId: null, userId: overrides.id },
    loginAt: new Date().toISOString(),
    ...overrides,
  }
}

const admin = sessionUser({ id: ADMIN_ID })
const companyUser = sessionUser({
  id: COMPANY_USER_ID,
  roleName: 'ผู้ใช้บริษัทไฟแนนซ์',
  roleGroup: 'finance_company',
  companyId: COMPANY_A,
  scope: { kind: 'company', teamIds: [], companyId: COMPANY_A, userId: COMPANY_USER_ID },
})

const DELIVERED_TAB = 'pending_delivery_proof,confirmed'
const OCTOBER = { handedOverFrom: '2026-10-01', handedOverTo: '2026-10-31' }

let seq = 0
const lotIds: Record<string, string> = {}

/** ล็อตตรง ๆ ใน DB + เครื่อง `assetCount` เครื่อง (แต่ละเครื่องมีเคสของตัวเอง) */
async function seedLot(
  key: string,
  companyId: string,
  fields: { status: 'pending_attach' | 'pending_delivery_proof' | 'confirmed'; deliveredAt?: string; scheduledAt?: string },
  assetCount: number,
): Promise<void> {
  seq += 1
  const type = fields.status === 'pending_attach' ? 'finance_pickup' : 'we_deliver'
  const confirmed = fields.status === 'confirmed'
  const rows = await db().$queryRawUnsafe<{ id: string }[]>(`
    INSERT INTO handover_lots
      (organization_id, company_id, lot_number, doc_ref, type, status, scheduled_at, delivered_at,
       confirmed_at, confirmed_by, signed_doc_url, delivery_proof_url, created_by, created_at)
    VALUES ('${ORG_ID}', '${companyId}', 'LOT-U142-${String(seq).padStart(3, '0')}', 'DLV-U142-${String(seq).padStart(3, '0')}',
      '${type}', '${fields.status}',
      ${fields.scheduledAt === undefined ? 'NULL' : `'${fields.scheduledAt}'`},
      ${fields.deliveredAt === undefined ? 'NULL' : `'${fields.deliveredAt}'`},
      ${confirmed ? `'${fields.deliveredAt ?? '2026-10-10T00:00:00Z'}'` : 'NULL'},
      ${confirmed ? `'${ADMIN_ID}'` : 'NULL'},
      ${confirmed ? `'https://storage.test/signed.pdf'` : 'NULL'},
      ${confirmed ? `'https://storage.test/proof.jpg'` : 'NULL'},
      '${ADMIN_ID}', '2026-09-01T00:00:00Z')
    RETURNING id
  `)
  const lotId = rows[0]?.id ?? ''
  lotIds[key] = lotId

  for (let index = 0; index < assetCount; index += 1) {
    seq += 1
    const caseRef = `U142-${seq}`
    const imei = `3551420000${String(10000 + seq)}`.slice(0, 15)
    const cases = await db().$queryRawUnsafe<{ id: string }[]>(`
      INSERT INTO cases (
        organization_id, case_ref, case_ref_normalized, company_id, source, status, created_by,
        debtor_name, addr_province, addr_district, asset_kind, asset_description, imei, debt_amount_satang
      ) VALUES (
        '${ORG_ID}', '${caseRef}', '${caseRef}', '${companyId}', 'manual', 'approved', '${ADMIN_ID}',
        'ลูกหนี้ ${seq}', 'ลำพูน', 'เมือง', 'smartphone', 'iPhone', '${imei}', 100000
      ) RETURNING id
    `)
    await db().$executeRawUnsafe(`
      INSERT INTO assets (organization_id, case_id, company_id, lot_id, case_ref, debtor_name, device_desc,
        imei_contract, asset_status, closed_at, created_by)
      VALUES ('${ORG_ID}', '${cases[0]?.id ?? ''}', '${companyId}', '${lotId}', '${caseRef}', 'ลูกหนี้ ${seq}', 'iPhone',
        '${imei}', '${confirmed ? 'handed_over' : 'handover_pending'}', '2026-09-01T00:00:00Z', '${ADMIN_ID}')
    `)
  }
}

async function cleanup(): Promise<void> {
  const tx = db()
  await tx.$executeRawUnsafe(`ALTER TABLE handover_lots DISABLE TRIGGER trg_handover_lots_confirmed_no_delete`)
  try {
    await tx.$executeRawUnsafe(`DELETE FROM assets WHERE organization_id = '${ORG_ID}'`)
    await tx.$executeRawUnsafe(`DELETE FROM handover_lots WHERE organization_id = '${ORG_ID}'`)
    await tx.$executeRawUnsafe(`DELETE FROM cases WHERE organization_id = '${ORG_ID}'`)
  } finally {
    await tx.$executeRawUnsafe(`ALTER TABLE handover_lots ENABLE TRIGGER trg_handover_lots_confirmed_no_delete`)
  }
}

beforeAll(async () => {
  if (!url) return
  process.env.DATABASE_URL = url
  warehouse = await import('@/lib/warehouse/queries')
  const tx = db()
  await tx.$executeRawUnsafe(`
    INSERT INTO organizations (id, name, tax_id, address)
    VALUES ('${ORG_ID}', 'U142Test', '9999999991420', 'ที่อยู่ทดสอบ U142') ON CONFLICT (id) DO NOTHING
  `)
  await tx.$executeRawUnsafe(`
    INSERT INTO roles (id, organization_id, name, role_group, is_seed)
    VALUES ('${ROLE_ID}', '${ORG_ID}', 'ธุรการคลัง U142', 'system', false) ON CONFLICT (id) DO NOTHING
  `)
  await tx.$executeRawUnsafe(`
    INSERT INTO users (id, organization_id, role_id, email, full_name, status) VALUES
      ('${ADMIN_ID}', '${ORG_ID}', '${ROLE_ID}', 'admin142@test.local', 'ธุรการ U142', 'active'),
      ('${COMPANY_USER_ID}', '${ORG_ID}', '${ROLE_ID}', 'company142@test.local', 'ผู้ใช้บริษัท U142', 'active')
    ON CONFLICT (id) DO NOTHING
  `)
  await tx.$executeRawUnsafe(`
    INSERT INTO service_fee_templates
      (id, organization_id, name, model, base_satang, rate_pct, basis, fail_fee_satang, version, is_current, created_by)
    VALUES ('${TEMPLATE_ID}', '${ORG_ID}', 'เทมเพลต U142', 'FLAT', 50000, 0, NULL, NULL, 1, true, '${ADMIN_ID}')
    ON CONFLICT (id) DO NOTHING
  `)
  await tx.$executeRawUnsafe(`
    INSERT INTO finance_companies (id, organization_id, name, short_name, tax_id, service_fee_template_id, created_by) VALUES
      ('${COMPANY_A}', '${ORG_ID}', 'ไฟแนนซ์ ก U142', 'A142', '0105514200001', '${TEMPLATE_ID}', '${ADMIN_ID}'),
      ('${COMPANY_B}', '${ORG_ID}', 'ไฟแนนซ์ ข U142', 'B142', '0105514200002', '${TEMPLATE_ID}', '${ADMIN_ID}')
    ON CONFLICT (id) DO NOTHING
  `)
  await tx.$executeRawUnsafe(`UPDATE users SET company_id = '${COMPANY_A}' WHERE id = '${COMPANY_USER_ID}'`)

  await cleanup()
  // 01/10/2569 00:30 น. ไทย — ยังเป็น 30/09 ตาม UTC แต่ต้องนับเป็นเดือน ต.ค.
  await seedLot('aEarlyOct', COMPANY_A, { status: 'confirmed', deliveredAt: '2026-09-30T17:30:00Z' }, 2)
  // รอหลักฐาน — ไม่มีวันส่งมอบจริง ใช้กำหนดส่ง 15/10
  await seedLot('aPending', COMPANY_A, { status: 'pending_delivery_proof', scheduledAt: '2026-10-15T03:00:00Z' }, 1)
  // 01/11/2569 00:30 น. ไทย — ยังเป็น 31/10 ตาม UTC แต่ต้องหลุดจากเดือน ต.ค.
  await seedLot('aNov', COMPANY_A, { status: 'confirmed', deliveredAt: '2026-10-31T17:30:00Z' }, 4)
  // แท็บอื่น (รอส่งมอบ) — ห้ามนับ
  await seedLot('aWaiting', COMPANY_A, { status: 'pending_attach', scheduledAt: '2026-10-20T03:00:00Z' }, 1)
  await seedLot('bOct', COMPANY_B, { status: 'confirmed', deliveredAt: '2026-10-10T05:00:00Z' }, 3)
})

afterAll(async () => {
  if (url) await cleanup()
  await client?.$disconnect()
})

suite('มติ PO U142 — แท็บ "ส่งมอบแล้ว" จัดกลุ่มตามบริษัท', () => {
  it('ยอดหัวกลุ่มต่อบริษัทคิดที่ DB ตามเดือน (ขอบเดือนเวลาไทย) + สถานะของแท็บ', async () => {
    const summary = await warehouse.summarizeLotsByCompany(
      admin,
      lotCompanySummaryQuerySchema.parse({ status: DELIVERED_TAB, ...OCTOBER }),
    )
    expect(summary.groups).toEqual([
      { companyId: COMPANY_A, companyName: 'ไฟแนนซ์ ก U142', lotCount: 2, assetCount: 3, pendingLotCount: 1 },
      { companyId: COMPANY_B, companyName: 'ไฟแนนซ์ ข U142', lotCount: 1, assetCount: 3, pendingLotCount: 0 },
    ])
    expect(summary).toMatchObject({ totalLots: 3, totalAssets: 6, totalPendingLots: 1 })

    const november = await warehouse.summarizeLotsByCompany(
      admin,
      lotCompanySummaryQuerySchema.parse({ status: DELIVERED_TAB, handedOverFrom: '2026-11-01', handedOverTo: '2026-11-30' }),
    )
    expect(november.groups).toEqual([
      { companyId: COMPANY_A, companyName: 'ไฟแนนซ์ ก U142', lotCount: 1, assetCount: 4, pendingLotCount: 0 },
    ])
  })

  it('ยอดหัวกลุ่มตรงกับรายการล็อตที่กางดู (ตัวกรองชุดเดียวกัน)', async () => {
    const list = await warehouse.listLots(
      admin,
      lotListQuerySchema.parse({ status: DELIVERED_TAB, companyId: COMPANY_A, ...OCTOBER, limit: 50 }),
    )
    expect(list.total).toBe(2)
    expect(new Set(list.items.map((item) => item.id))).toEqual(new Set([lotIds.aEarlyOct, lotIds.aPending]))
    expect(list.items.reduce((sum, item) => sum + item.assetCount, 0)).toBe(3)
  })

  it('กรองวันเดียวตามเวลาไทย — 01/10 ได้ล็อตที่ส่ง 00:30 น. ไทย · 31/10 ไม่ได้ล็อตที่ส่ง 01/11 00:30 น. ไทย', async () => {
    const firstDay = await warehouse.listLots(
      admin,
      lotListQuerySchema.parse({ status: DELIVERED_TAB, handedOverFrom: '2026-10-01', handedOverTo: '2026-10-01' }),
    )
    expect(firstDay.items.map((item) => item.id)).toEqual([lotIds.aEarlyOct])

    const lastDay = await warehouse.listLots(
      admin,
      lotListQuerySchema.parse({ status: DELIVERED_TAB, handedOverFrom: '2026-10-31', handedOverTo: '2026-10-31' }),
    )
    expect(lastDay.total).toBe(0)
  })

  it('Company User เห็นเฉพาะบริษัทตัวเอง — ส่ง companyId ของบริษัทอื่นมาก็ไม่เห็นอะไร', async () => {
    const own = await warehouse.summarizeLotsByCompany(
      companyUser,
      lotCompanySummaryQuerySchema.parse({ status: DELIVERED_TAB, ...OCTOBER }),
    )
    expect(own.groups.map((group) => group.companyId)).toEqual([COMPANY_A])
    expect(own.totalLots).toBe(2)

    const cross = await warehouse.summarizeLotsByCompany(
      companyUser,
      lotCompanySummaryQuerySchema.parse({ status: DELIVERED_TAB, companyId: COMPANY_B, ...OCTOBER }),
    )
    expect(cross).toEqual({ groups: [], totalLots: 0, totalAssets: 0, totalPendingLots: 0 })
  })

  it('แบ่งหน้าจริงต่อบริษัท — ล็อตที่ยังรอหลักฐานขึ้นก่อน · หน้าไม่ซ้ำกัน · total คงที่', async () => {
    const pageOf = (page: number) =>
      warehouse.listLots(
        admin,
        lotListQuerySchema.parse({ status: DELIVERED_TAB, companyId: COMPANY_A, ...OCTOBER, page, limit: 1 }),
      )
    const [first, second, third] = await Promise.all([pageOf(1), pageOf(2), pageOf(3)])
    expect(first.total).toBe(2)
    expect(second.total).toBe(2)
    expect(first.items.map((item) => item.id)).toEqual([lotIds.aPending])
    expect(second.items.map((item) => item.id)).toEqual([lotIds.aEarlyOct])
    expect(third.items).toEqual([])
  })
})
