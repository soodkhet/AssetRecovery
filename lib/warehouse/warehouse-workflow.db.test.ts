import { PrismaPg } from '@prisma/adapter-pg'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import type { SessionUser } from '@/lib/auth/types'
import { PrismaClient } from '@/lib/generated/prisma/client'
import { putFakeUpload, resetFakeUploads, sampleBytes, sha256Of, uploadTestState } from '@/tests/helpers/fake-uploads'
import { settleFieldDaysToday } from '@/tests/helpers/field-day'
import { assetListQuerySchema, lotListQuerySchema } from '@/lib/warehouse/schemas'

// UAT Q13 — server ตรวจไฟล์ที่อัปโหลดเอง: เทสต์ไม่ยิง Storage จริง (Rule 07) · ดู tests/helpers/fake-uploads.ts
vi.mock('@/lib/uploads/storage', async () => (await import('@/tests/helpers/fake-uploads')).fakeStorageModule())
vi.mock('@/lib/uploads/verify', async () => (await import('@/tests/helpers/fake-uploads')).fakeVerifyModule())


/**
 * เทสต์ระดับ DB ของ Phase 2.13 — DoD ตาม `44` §17
 *  · asset auto-create hook เมื่อเคส → `closed_success` (idempotent · §6.1)
 *  · T01/T03/T04 รับเข้าคลัง — IMEI ตรง/ไม่ตรงแต่รับต่อได้ (เตือน) / ตีกลับ + รับใหม่
 *  · T05/T06/T07/T08 สร้างล็อต — 1 บริษัท/ล็อต, ห้ามว่าง, สถานะเริ่มต้นตามชนิด
 *  · **T11/T12/T13** ยืนยันส่งมอบ = `$transaction` 4 ขั้น — ครบ / ล้มแล้ว rollback ทั้งชุด /
 *    expense ยังไม่อนุมัติ → Revenue ยังไม่เกิด
 *  · T14 ล็อต confirmed แก้ไม่ได้ (ทั้งชั้น service และ trigger ระดับ DB) · T15 scope บริษัท
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
if (!url) {
  console.warn('[warehouse-workflow.db.test] ข้ามเทสต์ระดับ DB — ไม่มี TEST_DATABASE_URL (ดู .env.example)')
}

const ORG_ID = '00000000-0000-4000-8000-0000000213a0'
const ROLE_MANAGER = '00000000-0000-4000-8000-0000000213a1'
const ROLE_AGENT = '00000000-0000-4000-8000-0000000213a2'
const ROLE_ADMIN = '00000000-0000-4000-8000-0000000213a3'
const MANAGER_ID = '00000000-0000-4000-8000-0000000213a4'
const AGENT_ID = '00000000-0000-4000-8000-0000000213a5'
const ADMIN_ID = '00000000-0000-4000-8000-0000000213a6'
const COMPANY_USER_ID = '00000000-0000-4000-8000-0000000213a7'
const TEAM_ID = '00000000-0000-4000-8000-0000000213a8'
const PLAN_ID = '00000000-0000-4000-8000-0000000213a9'
const TEMPLATE_ID = '00000000-0000-4000-8000-0000000213aa'
const COMPANY_A = '00000000-0000-4000-8000-0000000213ab'
const COMPANY_B = '00000000-0000-4000-8000-0000000213ac'
/** ทีมที่ไม่มีอยู่ใน scope ของ `manager` — ใช้ยิง filter นอกขอบเขต (ไม่ต้อง seed) */
const OTHER_TEAM_ID = '00000000-0000-4000-8000-0000000213ad'
const PROVINCE = 'ลำพูน'
const DAY_1 = '2026-09-01'

const SIGNED_DOC = 'https://storage.test/handover-lots/signed-doc.pdf'
const DELIVERY_PROOF = 'https://storage.test/handover-lots/delivery-proof.jpg'

let client: PrismaClient | null = null
type FieldQueries = typeof import('@/lib/field/queries')
type AssignmentQueries = typeof import('@/lib/assignments/queries')
type WarehouseQueries = typeof import('@/lib/warehouse/queries')
let field: FieldQueries
let assignments: AssignmentQueries
let warehouse: WarehouseQueries

function db(): PrismaClient {
  if (!url) throw new Error('ไม่มี TEST_DATABASE_URL')
  if (!client) {
    assertLocalTestDatabase(url)
    client = new PrismaClient({ adapter: new PrismaPg({ connectionString: url }) })
  }
  return client
}

const meta = { ipAddress: null, userAgent: null }

function sessionUser(overrides: Partial<SessionUser> & Pick<SessionUser, 'id'>): SessionUser {
  return {
    organizationId: ORG_ID,
    supabaseUid: `uid-${overrides.id}`,
    email: `${overrides.id}@test.local`,
    fullName: 'ผู้ทดสอบ 2.13',
    status: 'active',
    roleId: ROLE_AGENT,
    roleName: 'พนักงานติดตามทรัพย์',
    roleGroup: 'inhouse',
    isSuperadmin: false,
    teamId: TEAM_ID,
    companyId: null,
    capabilities: {},
    scope: { kind: 'self', teamIds: [], companyId: null, userId: overrides.id },
    loginAt: new Date().toISOString(),
    ...overrides,
  }
}

const manager = sessionUser({
  id: MANAGER_ID,
  roleId: ROLE_MANAGER,
  roleName: 'เจ้าหน้าที่อนุมัติเคส',
  teamId: null,
  scope: { kind: 'team', teamIds: [TEAM_ID], companyId: null, userId: MANAGER_ID },
})
const agent = sessionUser({ id: AGENT_ID })
/** ธุรการคลัง — เห็นทุกแถวในองค์กร (`44` §13) */
const admin = sessionUser({
  id: ADMIN_ID,
  roleId: ROLE_ADMIN,
  roleName: 'ธุรการ',
  roleGroup: 'system',
  teamId: null,
  scope: { kind: 'global', teamIds: [], companyId: null, userId: ADMIN_ID },
})
/** Company User ของบริษัท A — เห็นเฉพาะบริษัทตัวเอง (T15) */
const companyUser = sessionUser({
  id: COMPANY_USER_ID,
  roleId: ROLE_ADMIN,
  roleName: 'ผู้ใช้บริษัทไฟแนนซ์',
  roleGroup: 'finance_company',
  teamId: null,
  companyId: COMPANY_A,
  scope: { kind: 'company', teamIds: [], companyId: COMPANY_A, userId: COMPANY_USER_ID },
})

const MEDIA = { photos: ['p1.jpg'], videos: ['v1.mp4'], productPhotos: ['pp1.jpg'] }
const ctx = (actor: SessionUser) => ({ actor, meta })

function codeOf(error: unknown): string {
  return (error as { code?: string }).code ?? String(error)
}

async function expectCode(run: () => Promise<unknown>, code: string): Promise<void> {
  await expect(run()).rejects.toSatisfy((error: unknown) => codeOf(error) === code, `ต้องได้ error code ${code}`)
}

async function cleanupCases(): Promise<void> {
  const tx = db()
  // ล็อตที่ยืนยันแล้วถูก trigger กัน DELETE (`02` §13) — ปิด trigger เฉพาะตอนล้างข้อมูลเทสต์
  await tx.$executeRawUnsafe(`ALTER TABLE handover_lots DISABLE TRIGGER trg_handover_lots_confirmed_no_delete`)
  try {
    await tx.$executeRawUnsafe(`DELETE FROM revenues WHERE organization_id = '${ORG_ID}'`)
    await tx.$executeRawUnsafe(`UPDATE expenses SET superseded_by_expense_id = NULL WHERE organization_id = '${ORG_ID}'`)
    await tx.$executeRawUnsafe(`DELETE FROM expenses WHERE organization_id = '${ORG_ID}'`)
    await tx.$executeRawUnsafe(`DELETE FROM field_day_settlements WHERE organization_id = '${ORG_ID}'`)
    await tx.$executeRawUnsafe(`DELETE FROM assets WHERE organization_id = '${ORG_ID}'`)
    await tx.$executeRawUnsafe(`DELETE FROM handover_lots WHERE organization_id = '${ORG_ID}'`)
    await tx.$executeRawUnsafe(`DELETE FROM jobs WHERE organization_id = '${ORG_ID}'`)
    await tx.$executeRawUnsafe(`DELETE FROM notifications WHERE organization_id = '${ORG_ID}'`)
    await tx.$executeRawUnsafe(`DELETE FROM close_case_drafts WHERE organization_id = '${ORG_ID}'`)
    await tx.$executeRawUnsafe(`DELETE FROM travel_origins WHERE organization_id = '${ORG_ID}'`)
    await tx.$executeRawUnsafe(`DELETE FROM check_ins WHERE organization_id = '${ORG_ID}'`)
    await tx.$executeRawUnsafe(`DELETE FROM case_evidences WHERE organization_id = '${ORG_ID}'`)
    await tx.$executeRawUnsafe(`DELETE FROM case_assignments WHERE organization_id = '${ORG_ID}'`)
    await tx.$executeRawUnsafe(`DELETE FROM cases WHERE organization_id = '${ORG_ID}'`)
  } finally {
    await tx.$executeRawUnsafe(`ALTER TABLE handover_lots ENABLE TRIGGER trg_handover_lots_confirmed_no_delete`)
  }
}

beforeAll(async () => {
  if (!url) return
  process.env.DATABASE_URL = url
  field = await import('@/lib/field/queries')
  assignments = await import('@/lib/assignments/queries')
  warehouse = await import('@/lib/warehouse/queries')

  const tx = db()
  await tx.$executeRawUnsafe(`
    INSERT INTO organizations (id, name, tax_id, address)
    VALUES ('${ORG_ID}', 'Phase213Test', '9999999992130', 'ที่อยู่ทดสอบ 2.13') ON CONFLICT (id) DO NOTHING
  `)
  await tx.$executeRawUnsafe(`
    INSERT INTO roles (id, organization_id, name, role_group, is_seed) VALUES
      ('${ROLE_MANAGER}', '${ORG_ID}', 'เจ้าหน้าที่อนุมัติเคส 2.13', 'inhouse', false),
      ('${ROLE_AGENT}', '${ORG_ID}', 'พนักงานติดตามทรัพย์', 'inhouse', false),
      ('${ROLE_ADMIN}', '${ORG_ID}', 'ธุรการคลัง 2.13', 'system', false)
    ON CONFLICT (id) DO NOTHING
  `)
  // ผู้รับงานต้องเป็น role พนักงานติดตามทรัพย์จริง (UAT BUG-039) — แก้ชื่อแถวเก่าใน DB ทดสอบที่ค้างจากรอบก่อน
  await tx.$executeRawUnsafe(`UPDATE roles SET name = 'พนักงานติดตามทรัพย์' WHERE id = '${ROLE_AGENT}'`)
  await tx.$executeRawUnsafe(`
    INSERT INTO users (id, organization_id, role_id, email, full_name, status) VALUES
      ('${MANAGER_ID}', '${ORG_ID}', '${ROLE_MANAGER}', 'approver213@test.local', 'ผู้อนุมัติเคส 2.13', 'active'),
      ('${AGENT_ID}', '${ORG_ID}', '${ROLE_AGENT}', 'agent213@test.local', 'พนักงาน 2.13', 'active'),
      ('${ADMIN_ID}', '${ORG_ID}', '${ROLE_ADMIN}', 'admin213@test.local', 'ธุรการ 2.13', 'active'),
      ('${COMPANY_USER_ID}', '${ORG_ID}', '${ROLE_ADMIN}', 'company213@test.local', 'ผู้ใช้บริษัท 2.13', 'active')
    ON CONFLICT (id) DO NOTHING
  `)
  // DAILY_FLAT = ไม่แตะ Google Distance Matrix เลย (เทสต์นี้ไม่ได้ทดสอบสูตรน้ำมัน)
  await tx.$executeRawUnsafe(`
    INSERT INTO compensation_plans
      (id, organization_id, name, side, fuel_mode, fuel_daily_flat_satang, allowance_satang,
       commission_satang, no_success_fee_satang, version, effective_from, is_current, created_by)
    VALUES ('${PLAN_ID}', '${ORG_ID}', 'แผนเหมารายวัน 2.13', 'inhouse', 'DAILY_FLAT', 30000, 20000,
            150000, 50000, 1, DATE '2026-01-01', true, '${MANAGER_ID}')
    ON CONFLICT (id) DO NOTHING
  `)
  await tx.$executeRawUnsafe(`
    INSERT INTO teams (id, organization_id, name, side, provinces, status, compensation_plan_id, created_by) VALUES
      ('${TEAM_ID}', '${ORG_ID}', 'ทีมทดสอบคลัง 2.13', 'inhouse', ARRAY['${PROVINCE}'], 'active', '${PLAN_ID}', '${MANAGER_ID}'),
      ('${OTHER_TEAM_ID}', '${ORG_ID}', 'ทีมนอก scope 2.13', 'inhouse', ARRAY['${PROVINCE}'], 'active', '${PLAN_ID}', '${MANAGER_ID}')
    ON CONFLICT (id) DO NOTHING
  `)
  await tx.$executeRawUnsafe(`UPDATE users SET team_id = '${TEAM_ID}' WHERE id = '${AGENT_ID}'`)
  await tx.$executeRawUnsafe(`
    INSERT INTO service_fee_templates
      (id, organization_id, name, model, base_satang, rate_pct, basis, charge_on_fail, version, is_current, created_by)
    VALUES ('${TEMPLATE_ID}', '${ORG_ID}', 'เทมเพลต 2.13', 'FLAT', 50000, 0, NULL, false, 1, true, '${MANAGER_ID}')
    ON CONFLICT (id) DO NOTHING
  `)
  await tx.$executeRawUnsafe(`
    INSERT INTO finance_companies (id, organization_id, name, short_name, tax_id, service_fee_template_id, created_by) VALUES
      ('${COMPANY_A}', '${ORG_ID}', 'ไฟแนนซ์ A 2.13', 'A13', '0105512130001', '${TEMPLATE_ID}', '${MANAGER_ID}'),
      ('${COMPANY_B}', '${ORG_ID}', 'ไฟแนนซ์ B 2.13', 'B13', '0105512130002', '${TEMPLATE_ID}', '${MANAGER_ID}')
    ON CONFLICT (id) DO NOTHING
  `)
  // ผู้ใช้บริษัทต้องผูก company หลังบริษัทถูกสร้างแล้ว
  await tx.$executeRawUnsafe(`UPDATE users SET company_id = '${COMPANY_A}' WHERE id = '${COMPANY_USER_ID}'`)
  // Phase 3.6 — step 4 คิด VAT จริงแล้ว ⇒ องค์กรทดสอบต้องมีอัตราครอบวันปิดงาน (ห้าม fallback 7%)
  await tx.$executeRawUnsafe(`
    INSERT INTO vat_rate_history (organization_id, rate_pct, effective_from, effective_to, created_by)
    VALUES ('${ORG_ID}', 7.00, '2020-01-01', NULL, '${MANAGER_ID}')
    ON CONFLICT DO NOTHING
  `)
})

afterAll(async () => {
  if (url) await cleanupCases()
  await client?.$disconnect()
})

let caseSeq = 0

/** เคสที่ approved แล้ว + มี snapshot ค่าบริการ (เกต Revenue ต้องใช้ · `10` §9.2) */
async function seedApprovedCase(companyId: string, imei: string): Promise<string> {
  caseSeq += 1
  const caseRef = `WH13-${caseSeq}-${Date.now()}`
  const rows = await db().$queryRawUnsafe<{ id: string }[]>(`
    INSERT INTO cases (
      organization_id, case_ref, case_ref_normalized, company_id, source, status, created_by,
      debtor_name, addr_province, addr_district, asset_kind, asset_description, imei,
      debt_amount_satang, assigned_team_id,
      service_fee_template_id, service_fee_model_snapshot, service_fee_base_satang, service_fee_charge_on_fail
    ) VALUES (
      '${ORG_ID}', $$${caseRef}$$, $$${caseRef}$$, '${companyId}', 'manual', 'approved', '${MANAGER_ID}',
      'ลูกหนี้ ${caseSeq}', '${PROVINCE}', 'เมือง', 'smartphone', 'iPhone 15 สีดำ', '${imei}',
      1000000, '${TEAM_ID}',
      '${TEMPLATE_ID}', 'FLAT', 50000, false
    ) RETURNING id
  `)
  return rows[0]?.id ?? ''
}

/** ปิดงานสำเร็จ → hook สร้าง asset `pending_intake` ให้อัตโนมัติ (`44` §6.1) */
async function seedClosedSuccessCase(companyId = COMPANY_A, imei = `35500000000${String(1000 + caseSeq)}`): Promise<{
  caseId: string
  assetId: string
  imei: string
}> {
  const caseId = await seedApprovedCase(companyId, imei)
  await assignments.assignCase(manager, caseId, { agentId: agent.id }, ctx(manager))
  await field.acceptFieldCase(agent, caseId, ctx(agent))
  await field.scheduleFieldCase(agent, caseId, { scheduleDate: new Date(`${DAY_1}T00:00:00.000Z`) }, ctx(agent))
  await field.saveCloseDraft(
    agent,
    caseId,
    {
      outcome: null,
      photos: [],
      videos: [],
      productPhotos: [],
      travelOrigin: { latitude: 18.58, longitude: 99.0, source: 'gps_auto' },
    },
    ctx(agent),
  )
  await field.recordCheckin(
    agent,
    caseId,
    { latitude: 18.5801, longitude: 99.0031, checkinType: 'address' },
    ctx(agent),
  )
  await field.closeFieldCase(agent, caseId, { outcome: 'closed_success', ...MEDIA }, ctx(agent))
  // UAT Q21 — วันลงพื้นที่ต้องถูก settle (job รายวัน) ก่อนเกตรายได้จะผ่าน
  await settleFieldDaysToday(ORG_ID)

  const asset = await db().asset.findFirstOrThrow({ where: { caseId }, select: { id: true } })
  return { caseId, assetId: asset.id, imei }
}

const intakeInput = (imeiActual: string | null) => ({
  imeiActual,
  serialActual: null,
  condition: 'normal' as const,
  conditionNote: null,
  photos: ['front.jpg', 'back.jpg'],
})

/** รับเข้าคลังจนพร้อมจัดล็อต */
async function seedInCustody(companyId = COMPANY_A): Promise<{ caseId: string; assetId: string }> {
  const seeded = await seedClosedSuccessCase(companyId)
  await warehouse.intakeAsset(admin, seeded.assetId, intakeInput(seeded.imei), ctx(admin))
  return { caseId: seeded.caseId, assetId: seeded.assetId }
}

/**
 * Final Test ด่าน 1 (Phase 8.3) — `19` §6.1 หมายเหตุ DEC-006/D6:
 * เคสที่ **ไม่มี expense เลย** + `closed_fail` + model คิดเงินกรณี fail ⇒ Revenue ต้องเกิด
 * **ทันทีที่เคสเข้าสถานะ terminal** · เดิมผู้เรียก `tryCreateRevenue()` มีแค่ lot confirm กับ
 * expense approve ⇒ สายนี้ไม่มี trigger ไหนยิงเลย (กฎ pure ถูกต้องแต่ไม่มีเส้นทาง runtime)
 */
suite('Phase 8.3 — Revenue ของ `closed_fail` ที่ไม่มี expense (DEC-006/D6)', () => {
  beforeEach(cleanupCases)

  async function closeFailWithoutExpense(chargeOnFail: boolean): Promise<string> {
    caseSeq += 1
    const caseRef = `WH83-${caseSeq}-${Date.now()}`
    const rows = await db().$queryRawUnsafe<{ id: string }[]>(`
      INSERT INTO cases (
        organization_id, case_ref, case_ref_normalized, company_id, source, status, created_by,
        debtor_name, addr_province, addr_district, asset_kind, asset_description, imei,
        debt_amount_satang, assigned_team_id,
        service_fee_template_id, service_fee_model_snapshot, service_fee_base_satang, service_fee_charge_on_fail
      ) VALUES (
        '${ORG_ID}', $$${caseRef}$$, $$${caseRef}$$, '${COMPANY_A}', 'manual', 'approved', '${MANAGER_ID}',
        'ลูกหนี้ ${caseSeq}', '${PROVINCE}', 'เมือง', 'smartphone', 'iPhone 15 สีดำ', '3559000000${String(2000 + caseSeq)}',
        1000000, '${TEAM_ID}',
        '${TEMPLATE_ID}', 'FLAT', 50000, ${chargeOnFail}
      ) RETURNING id
    `)
    const caseId = rows[0]?.id ?? ''

    // ทีมไม่ผูกแผนค่าตอบแทน ⇒ `generateCaseExpenses()` คืนรายการว่าง = เคสไม่มี expense เลย
    await db().$executeRawUnsafe(`UPDATE teams SET compensation_plan_id = NULL WHERE id = '${TEAM_ID}'`)
    try {
      await assignments.assignCase(manager, caseId, { agentId: agent.id }, ctx(manager))
      await field.acceptFieldCase(agent, caseId, ctx(agent))
      await field.scheduleFieldCase(agent, caseId, { scheduleDate: new Date(`${DAY_1}T00:00:00.000Z`) }, ctx(agent))
      await field.saveCloseDraft(
        agent,
        caseId,
        {
          outcome: null,
          photos: [],
          videos: [],
          productPhotos: [],
          travelOrigin: { latitude: 18.58, longitude: 99.0, source: 'gps_auto' },
        },
        ctx(agent),
      )
      await field.recordCheckin(agent, caseId, { latitude: 18.5801, longitude: 99.0031, checkinType: 'address' }, ctx(agent))
      await field.closeFieldCase(agent, caseId, { outcome: 'closed_fail', failReason: 'debtor_not_found', ...MEDIA }, ctx(agent))
      // UAT Q21 — รายได้เกิดเมื่อ job รายวัน settle วันลงพื้นที่ (ทีมไม่ผูกแผน ⇒ settle ยอด 0 ไม่มี expense)
      await settleFieldDaysToday(ORG_ID)
    } finally {
      await db().$executeRawUnsafe(`UPDATE teams SET compensation_plan_id = '${PLAN_ID}' WHERE id = '${TEAM_ID}'`)
    }
    return caseId
  }

  it('`charge_on_fail = true` → Revenue เกิดเมื่อวันลงพื้นที่ settle แล้ว (ไม่ต้องรอ expense/คลัง)', async () => {
    const caseId = await closeFailWithoutExpense(true)

    expect(await db().expense.count({ where: { caseId } })).toBe(0)
    const revenues = await db().revenue.findMany({ where: { caseId } })
    expect(revenues).toHaveLength(1)
    expect(revenues[0]?.grossSatang).toBe(50_000)
    // `closed_fail` ไม่ผ่านคลัง ⇒ ต้องไม่มีเครื่องรอรับเข้าเลย (`19` §6.1)
    expect(await db().asset.count({ where: { caseId } })).toBe(0)
  })

  it('`charge_on_fail = false` → ไม่เกิด Revenue (`model_excludes_fail`)', async () => {
    const caseId = await closeFailWithoutExpense(false)
    expect(await db().revenue.count({ where: { caseId } })).toBe(0)
  })
})

suite('Phase 2.13 — Asset auto-create hook (`44` §6.1)', () => {
  beforeEach(cleanupCases)

  it('ปิดงานสำเร็จ = เกิดเครื่องรอรับเข้าคลังพร้อม snapshot จากเคส', async () => {
    const { caseId, imei } = await seedClosedSuccessCase()
    const asset = await db().asset.findFirstOrThrow({ where: { caseId } })

    expect(asset.assetStatus).toBe('pending_intake')
    expect(asset.imeiContract).toBe(imei)
    expect(asset.deviceDesc).toBe('iPhone 15 สีดำ')
    expect(asset.companyId).toBe(COMPANY_A)
    expect(asset.receivedAt).toBeNull()
    expect(asset.closedAt).toBeInstanceOf(Date)
  })

  it('ปิดงานไม่สำเร็จ = ไม่มีเครื่องเข้าคลัง (`closed_fail` ไม่ผ่านคลัง)', async () => {
    const caseId = await seedApprovedCase(COMPANY_A, '355000000009999')
    await assignments.assignCase(manager, caseId, { agentId: agent.id }, ctx(manager))
    await field.acceptFieldCase(agent, caseId, ctx(agent))
    await field.scheduleFieldCase(agent, caseId, { scheduleDate: new Date(`${DAY_1}T00:00:00.000Z`) }, ctx(agent))
    await field.saveCloseDraft(
      agent,
      caseId,
      {
        outcome: null,
        photos: [],
        videos: [],
        productPhotos: [],
        travelOrigin: { latitude: 18.58, longitude: 99.0, source: 'gps_auto' },
      },
      ctx(agent),
    )
    await field.recordCheckin(agent, caseId, { latitude: 18.58, longitude: 99.0, checkinType: 'address' }, ctx(agent))
    await field.closeFieldCase(
      agent,
      caseId,
      { outcome: 'closed_fail', failReason: 'debtor_not_found', photos: ['p.jpg'], videos: ['v.mp4'], productPhotos: [] },
      ctx(agent),
    )

    expect(await db().asset.count({ where: { caseId } })).toBe(0)
  })

  it('idempotent — ส่งหลักฐานใหม่หลังถูกตีกลับไม่สร้างเครื่องใบที่สอง (`41` §10.1)', async () => {
    const { caseId, assetId } = await seedClosedSuccessCase()
    await field.rejectFieldEvidence(manager, caseId, { reason: 'รูปสินค้าไม่ชัด ขอถ่ายใหม่' }, ctx(manager))
    await field.resubmitCloseCase(
      agent,
      caseId,
      { photos: ['p1.jpg', 'p2.jpg'], videos: ['v1.mp4'], productPhotos: ['pp1.jpg'], audioUrl: null },
      ctx(agent),
    )

    const assets = await db().asset.findMany({ where: { caseId } })
    expect(assets).toHaveLength(1)
    expect(assets[0]?.id).toBe(assetId)
  })
})

suite('Phase 2.13 — รับเข้าคลัง / ตีกลับ (`44` §8.2 · §17 T01–T04)', () => {
  beforeEach(cleanupCases)

  it('T01 — IMEI ตรง + สภาพปกติ = in_custody และไม่มีคำเตือน', async () => {
    const { assetId, imei } = await seedClosedSuccessCase()
    const result = await warehouse.intakeAsset(admin, assetId, intakeInput(imei), ctx(admin))

    expect(result.asset.assetStatus).toBe('in_custody')
    expect(result.warning).toBeUndefined()
    expect(result.events).toEqual(['asset.intake_confirmed'])
    const stored = await db().asset.findUniqueOrThrow({ where: { id: assetId } })
    expect(stored.imeiActual).toBe(imei)
    expect(stored.receivedAt).not.toBeNull()
  })

  it('UAT Q14 (BUG-055) — คลังรับเข้า = หลักฐานปิดงานเคสสำเร็จผ่านอัตโนมัติ แล้วตีกลับไม่ได้', async () => {
    const { caseId, assetId, imei } = await seedClosedSuccessCase()
    expect((await db().caseEvidence.findFirstOrThrow({ where: { caseId } })).status).toBe('pending')

    await warehouse.intakeAsset(admin, assetId, intakeInput(imei), ctx(admin))

    const evidence = await db().caseEvidence.findFirstOrThrow({ where: { caseId } })
    expect(evidence.status).toBe('approved')
    expect(evidence.reviewedBy).toBe(admin.id)
    expect(evidence.reviewedAt).not.toBeNull()
    const audit = await db().auditLog.findFirst({ where: { targetType: 'case_evidences', targetId: evidence.id } })
    expect(audit?.action).toBe('approve')

    await expectCode(
      () => field.rejectFieldEvidence(manager, caseId, { reason: 'ขอรูปเพิ่มอีกชุด' }, ctx(manager)),
      'EVIDENCE_REJECT_AFTER_FINAL',
    )
  })

  it('T03 — IMEI ไม่ตรงก็รับเข้าได้ แต่ต้องเตือนและบันทึกค่าที่ตรวจจริงไว้', async () => {
    const { assetId, imei } = await seedClosedSuccessCase()
    const result = await warehouse.intakeAsset(admin, assetId, intakeInput('355000000000999'), ctx(admin))

    expect(result.asset.assetStatus).toBe('in_custody')
    expect(result.warning?.code).toBe('IMEI_MISMATCH')
    const stored = await db().asset.findUniqueOrThrow({ where: { id: assetId } })
    expect(stored.imeiActual).toBe('355000000000999')
    expect(stored.imeiContract).toBe(imei)
  })

  it('T02 — สภาพชำรุดโดยไม่กรอกรายละเอียด = INTAKE_MISSING_NOTE (ไม่มีอะไรถูกเขียน)', async () => {
    const { assetId, imei } = await seedClosedSuccessCase()
    await expectCode(
      () =>
        warehouse.intakeAsset(
          admin,
          assetId,
          { ...intakeInput(imei), condition: 'damaged', conditionNote: '  ' },
          ctx(admin),
        ),
      'INTAKE_MISSING_NOTE',
    )
    expect((await db().asset.findUniqueOrThrow({ where: { id: assetId } })).assetStatus).toBe('pending_intake')
  })

  it('T04 — ตีกลับต้องมีเหตุผล แล้วรับใหม่ได้ (retry ลง event เพิ่ม)', async () => {
    const { assetId, imei } = await seedClosedSuccessCase()

    await expectCode(
      () => warehouse.rejectAssetIntake(admin, assetId, { rejectReason: '   ' }, ctx(admin)),
      'REJECT_MISSING_REASON',
    )

    const rejected = await warehouse.rejectAssetIntake(
      admin,
      assetId,
      { rejectReason: 'IMEI บนเครื่องไม่ตรงกับสัญญา' },
      ctx(admin),
    )
    expect(rejected.assetStatus).toBe('intake_rejected')
    expect(rejected.rejectReason).toBe('IMEI บนเครื่องไม่ตรงกับสัญญา')
    expect(rejected.rejectedAt).not.toBeNull()

    const retried = await warehouse.intakeAsset(admin, assetId, intakeInput(imei), ctx(admin))
    expect(retried.asset.assetStatus).toBe('in_custody')
    expect(retried.events).toEqual(['asset.intake_retry', 'asset.intake_confirmed'])
    // ข้อมูลการตีกลับรอบก่อนถูกล้าง — เครื่องกลับเข้าคลังแล้ว
    const stored = await db().asset.findUniqueOrThrow({ where: { id: assetId } })
    expect(stored.rejectReason).toBeNull()
    expect(stored.rejectedAt).toBeNull()
  })

  it('รับเข้าคลังซ้ำสองรอบไม่ได้ = ASSET_INVALID_STATUS', async () => {
    const { assetId, imei } = await seedClosedSuccessCase()
    await warehouse.intakeAsset(admin, assetId, intakeInput(imei), ctx(admin))
    await expectCode(() => warehouse.intakeAsset(admin, assetId, intakeInput(imei), ctx(admin)), 'ASSET_INVALID_STATUS')
  })
})

suite('Phase 2.13 — สร้างล็อตส่งมอบ (`44` §17 T05–T08)', () => {
  beforeEach(cleanupCases)

  const lotInput = (assetIds: string[], type: 'finance_pickup' | 'we_deliver', companyId = COMPANY_A) => ({
    companyId,
    assetIds,
    type,
    scheduledAt: '2026-09-10T03:00:00.000Z',
    contactPerson: type === 'finance_pickup' ? 'คุณวิภา ฝ่ายติดตามทรัพย์' : null,
    deliveryAddr: type === 'we_deliver' ? '99 ถนนทดสอบ กรุงเทพฯ' : null,
    trackingNo: null,
    note: null,
  })

  it('T07 — finance_pickup → pending_attach (แท็บ "รอส่งมอบ") + เลขล็อต/ใบส่งมอบเป็น พ.ศ.', async () => {
    const { assetId } = await seedInCustody()
    const lot = await warehouse.createLot(admin, lotInput([assetId], 'finance_pickup'), ctx(admin))

    expect(lot.status).toBe('pending_attach')
    expect(lot.tab).toBe('pending_handover')
    expect(lot.lotNumber).toMatch(/^LOT-25\d{2}-\d{3,}$/)
    expect(lot.docRef).toMatch(/^DLV-25\d{2}-\d{3,}$/)
    expect(lot.assetCount).toBe(1)
    expect((await db().asset.findUniqueOrThrow({ where: { id: assetId } })).assetStatus).toBe('handover_pending')
  })

  it('T08 — we_deliver → pending_delivery_proof (ย้ายไปแท็บ "ส่งมอบแล้ว" ทันที)', async () => {
    const { assetId } = await seedInCustody()
    const lot = await warehouse.createLot(admin, lotInput([assetId], 'we_deliver'), ctx(admin))

    expect(lot.status).toBe('pending_delivery_proof')
    expect(lot.tab).toBe('handed_over')
  })

  it('T05 — เลือกเครื่องต่างบริษัท = MIXED_COMPANY_LOT (ไม่มีล็อตเกิดขึ้น)', async () => {
    const a = await seedInCustody(COMPANY_A)
    const b = await seedInCustody(COMPANY_B)

    await expectCode(
      () => warehouse.createLot(admin, lotInput([a.assetId, b.assetId], 'finance_pickup'), ctx(admin)),
      'MIXED_COMPANY_LOT',
    )
    expect(await db().handoverLot.count({ where: { organizationId: ORG_ID } })).toBe(0)
    expect((await db().asset.findUniqueOrThrow({ where: { id: a.assetId } })).assetStatus).toBe('in_custody')
  })

  it('T06 — ไม่เลือกเครื่องเลย = EMPTY_LOT', async () => {
    await expectCode(() => warehouse.createLot(admin, lotInput([], 'finance_pickup'), ctx(admin)), 'EMPTY_LOT')
  })

  it('เครื่องที่ยังไม่รับเข้าคลัง = ASSET_NOT_IN_CUSTODY · เครื่องที่อยู่ในล็อตแล้ว = ASSET_ALREADY_IN_LOT', async () => {
    const pending = await seedClosedSuccessCase()
    await expectCode(
      () => warehouse.createLot(admin, lotInput([pending.assetId], 'finance_pickup'), ctx(admin)),
      'ASSET_NOT_IN_CUSTODY',
    )

    // Final Test ด่าน 1 — เดิม assert เป็น `ASSET_NOT_IN_CUSTODY` (ไม่ตรงกับหัวข้อเทสต์เอง)
    // เพราะยามสถานะถูกเช็คก่อน ⇒ ผู้ใช้ไม่ได้เลขล็อตเดิมติดมาตามที่ `44` §12 สั่ง
    const inLot = await seedInCustody()
    const firstLot = await warehouse.createLot(admin, lotInput([inLot.assetId], 'finance_pickup'), ctx(admin))
    await expect(
      warehouse.createLot(admin, lotInput([inLot.assetId], 'finance_pickup'), ctx(admin)),
    ).rejects.toMatchObject({
      code: 'ASSET_ALREADY_IN_LOT',
      context: { lotNumbers: [firstLot.lotNumber] },
    })
  })

  it('ค้นล็อตด้วยเลขล็อต / IMEI / ชื่อลูกหนี้ได้ (`44` §8.4) — IMEI ต้อง exact ห้าม fuzzy (§6.5)', async () => {
    const { assetId } = await seedInCustody()
    const lot = await warehouse.createLot(admin, lotInput([assetId], 'finance_pickup'), ctx(admin))
    const asset = await db().asset.findUniqueOrThrow({
      where: { id: assetId },
      select: { imeiContract: true, debtorName: true },
    })
    const imei = asset.imeiContract ?? ''
    const found = async (search: string) =>
      (await warehouse.listLots(admin, lotListQuerySchema.parse({ search }))).items.map((item) => item.id)

    expect(await found(lot.lotNumber)).toEqual([lot.id])
    expect(await found(lot.docRef)).toEqual([lot.id])
    expect(await found(imei)).toEqual([lot.id])
    expect(await found(asset.debtorName)).toEqual([lot.id])
    // IMEI ที่พิมพ์ไม่ครบ 15 หลัก = ไม่ตรง (ห้าม prefix match)
    expect(await found(imei.slice(0, 14))).toEqual([])
  })

  it('เลขล็อต/ใบส่งมอบไม่ซ้ำกันข้ามล็อต (`44` §6.2)', async () => {
    const first = await seedInCustody()
    const second = await seedInCustody()
    const lot1 = await warehouse.createLot(admin, lotInput([first.assetId], 'finance_pickup'), ctx(admin))
    const lot2 = await warehouse.createLot(admin, lotInput([second.assetId], 'finance_pickup'), ctx(admin))

    expect(lot1.lotNumber).not.toBe(lot2.lotNumber)
    expect(lot1.docRef).not.toBe(lot2.docRef)
  })
})

suite('Phase 2.13 — ยืนยันส่งมอบ = $transaction 4 ขั้น (`44` §11 · §17 T09–T14)', () => {
  beforeEach(cleanupCases)

  async function seedPendingLot(type: 'finance_pickup' | 'we_deliver' = 'finance_pickup'): Promise<{
    caseId: string
    assetId: string
    lotId: string
  }> {
    const { caseId, assetId } = await seedInCustody()
    const lot = await warehouse.createLot(
      admin,
      {
        companyId: COMPANY_A,
        assetIds: [assetId],
        type,
        scheduledAt: null,
        contactPerson: null,
        deliveryAddr: type === 'we_deliver' ? '99 ถนนทดสอบ' : null,
        trackingNo: null,
        note: null,
      },
      ctx(admin),
    )
    return { caseId, assetId, lotId: lot.id }
  }

  const confirmInput = (overrides: Partial<{ signedDocUrl: string | null; deliveryProofUrl: string | null }> = {}) => ({
    deliveredAt: null,
    signedDocUrl: SIGNED_DOC,
    deliveryProofUrl: null,
    ...overrides,
  })

  it('T09 — ยืนยันโดยไม่แนบใบเซ็นรับ = LOT_MISSING_SIGNED_DOC (ล็อตไม่ขยับ)', async () => {
    const { lotId } = await seedPendingLot()
    await expectCode(
      () => warehouse.confirmLot(admin, lotId, confirmInput({ signedDocUrl: null }), ctx(admin)),
      'LOT_MISSING_SIGNED_DOC',
    )
    expect((await db().handoverLot.findUniqueOrThrow({ where: { id: lotId } })).status).toBe('pending_attach')
  })

  it('we_deliver ที่ขาดหลักฐานจัดส่ง = LOT_MISSING_DELIVERY_PROOF', async () => {
    const { lotId } = await seedPendingLot('we_deliver')
    await expectCode(() => warehouse.confirmLot(admin, lotId, confirmInput(), ctx(admin)), 'LOT_MISSING_DELIVERY_PROOF')
  })

  it('T10 — แนบครบแล้วยืนยัน: เครื่อง → handed_over + expense ปลดล็อกในทรานแซกชันเดียวกัน', async () => {
    const { caseId, assetId, lotId } = await seedPendingLot('we_deliver')
    const before = await db().expense.findMany({ where: { caseId }, select: { id: true, status: true } })
    expect(before.length).toBeGreaterThan(0)
    expect(before.every((row) => row.status === 'pending_warehouse_confirm')).toBe(true)

    const result = await warehouse.confirmLot(
      admin,
      lotId,
      confirmInput({ deliveryProofUrl: DELIVERY_PROOF }),
      ctx(admin),
    )

    expect(result.lot.status).toBe('confirmed')
    expect(result.lot.confirmedAt).not.toBeNull()
    expect(result.assetIdsHandedOver).toEqual([assetId])
    expect([...result.expenseIdsUnlocked].sort()).toEqual(before.map((row) => row.id).sort())
    expect(result.events).toEqual(['lot.doc_attached', 'lot.confirmed'])

    expect((await db().asset.findUniqueOrThrow({ where: { id: assetId } })).assetStatus).toBe('handed_over')
    const after = await db().expense.findMany({ where: { caseId }, select: { status: true } })
    expect(after.every((row) => row.status === 'pending_approval')).toBe(true)

    const audit = await db().auditLog.findFirst({
      where: { targetType: 'handover_lots', targetId: lotId, action: 'confirm' },
      orderBy: { createdAt: 'desc' },
    })
    expect(audit).not.toBeNull()
  })

  it('T13 — ล็อต confirmed แต่ expense ยังไม่อนุมัติ → Revenue ยังไม่เกิด', async () => {
    const { caseId, lotId } = await seedPendingLot()
    const result = await warehouse.confirmLot(admin, lotId, confirmInput(), ctx(admin))

    expect(result.revenueEligibleCaseIds).toEqual([])
    expect(result.revenueIdsCreated).toEqual([])
    expect(await db().revenue.count({ where: { caseId } })).toBe(0)
    // UAT BUG-104 — audit เก็บเหตุผลที่ข้ามการสร้างรายได้ต่อเคส
    const audit = await db().auditLog.findFirstOrThrow({
      where: { targetType: 'handover_lots', targetId: lotId, action: 'confirm' },
      orderBy: { createdAt: 'desc' },
    })
    expect(audit.afterData).toMatchObject({
      revenueByCase: [{ caseId, result: 'skipped', reason: 'expense_not_approved' }],
    })
  })

  it('T12 — expense อนุมัติแล้ว + ล็อต confirmed = เคสเข้าเงื่อนไขสร้าง Revenue', async () => {
    const { caseId, lotId } = await seedPendingLot()
    await db().$executeRawUnsafe(`UPDATE expenses SET status = 'approved' WHERE case_id = '${caseId}'`)

    const result = await warehouse.confirmLot(admin, lotId, confirmInput(), ctx(admin))

    expect(result.revenueEligibleCaseIds).toEqual([caseId])
    // Phase 3.6 เสียบ RevenueService ตัวจริงแล้ว ⇒ ต้องได้แถว `revenues` จริงพร้อม snapshot VAT
    expect(result.revenueIdsCreated).toHaveLength(1)
    const created = await db().revenue.findFirstOrThrow({ where: { caseId } })
    expect(created.status).toBe('ready_for_billing')
    const audit = await db().auditLog.findFirstOrThrow({
      where: { targetType: 'handover_lots', targetId: lotId, action: 'confirm' },
      orderBy: { createdAt: 'desc' },
    })
    expect(audit.afterData).toMatchObject({ revenueByCase: [{ caseId, result: 'created', revenueId: created.id }] })
    expect(created.vatRatePctUsed.toNumber()).toBe(7)
  })

  it('🔑 DEC-006/D6 — เคสที่ไม่มี expense เลย ก็ต้องรอคลังยืนยันก่อนจึงเข้าเงื่อนไข', async () => {
    const { caseId, assetId } = await seedInCustody()
    await db().$executeRawUnsafe(`DELETE FROM expenses WHERE case_id = '${caseId}'`)

    const lot = await warehouse.createLot(
      admin,
      {
        companyId: COMPANY_A,
        assetIds: [assetId],
        type: 'finance_pickup',
        scheduledAt: null,
        contactPerson: null,
        deliveryAddr: null,
        trackingNo: null,
        note: null,
      },
      ctx(admin),
    )

    const result = await warehouse.confirmLot(admin, lot.id, confirmInput(), ctx(admin))
    expect(result.expenseIdsUnlocked).toEqual([])
    expect(result.revenueEligibleCaseIds).toEqual([caseId])
    expect(result.revenueIdsCreated).toHaveLength(1)
  })

  it('T11 — step 2 ล้ม = rollback ทั้งชุด (CONFIRM_TRANSACTION_FAILED)', async () => {
    const { caseId, assetId, lotId } = await seedPendingLot()

    // จำลอง DB fail ตอนปลดล็อก expense (step 2) ด้วย trigger ชั่วคราว
    await db().$executeRawUnsafe(`
      CREATE OR REPLACE FUNCTION test_fail_expense_unlock() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN RAISE EXCEPTION 'จำลอง DB fail ใน step 2 ของ 44 §11'; END $$
    `)
    await db().$executeRawUnsafe(`
      CREATE TRIGGER trg_test_fail_expense_unlock BEFORE UPDATE ON expenses
      FOR EACH ROW WHEN (OLD.status = 'pending_warehouse_confirm' AND NEW.status = 'pending_approval')
      EXECUTE FUNCTION test_fail_expense_unlock()
    `)

    try {
      await expectCode(
        () => warehouse.confirmLot(admin, lotId, confirmInput(), ctx(admin)),
        'CONFIRM_TRANSACTION_FAILED',
      )
    } finally {
      await db().$executeRawUnsafe(`DROP TRIGGER IF EXISTS trg_test_fail_expense_unlock ON expenses`)
      await db().$executeRawUnsafe(`DROP FUNCTION IF EXISTS test_fail_expense_unlock()`)
    }

    // ทุกอย่างต้องกลับเป็นเหมือนก่อนกดยืนยัน — ไม่มีขั้นไหนค้างครึ่งทาง
    const lot = await db().handoverLot.findUniqueOrThrow({ where: { id: lotId } })
    expect(lot.status).toBe('pending_attach')
    expect(lot.confirmedAt).toBeNull()
    expect(lot.signedDocUrl).toBeNull()
    expect((await db().asset.findUniqueOrThrow({ where: { id: assetId } })).assetStatus).toBe('handover_pending')
    const expenses = await db().expense.findMany({ where: { caseId }, select: { status: true } })
    expect(expenses.every((row) => row.status === 'pending_warehouse_confirm')).toBe(true)
  })

  it('T14 — ล็อตที่ยืนยันแล้วแตะไม่ได้ ทั้งชั้น service และ trigger ระดับ DB', async () => {
    const { lotId } = await seedPendingLot()
    await warehouse.confirmLot(admin, lotId, confirmInput(), ctx(admin))

    await expectCode(() => warehouse.confirmLot(admin, lotId, confirmInput(), ctx(admin)), 'LOT_ALREADY_CONFIRMED')
    await expect(
      db().$executeRawUnsafe(`UPDATE handover_lots SET note = 'แก้ย้อนหลัง' WHERE id = '${lotId}'`),
    ).rejects.toThrowError(/LOT_ALREADY_CONFIRMED/)
  })
})

suite('UAT Q13 (BUG-037/050 · หนี้ #1) — server ตรวจไฟล์เอกสารล็อต + รูปรับเข้าคลัง', () => {
  beforeEach(async () => {
    await cleanupCases()
    resetFakeUploads()
  })
  afterAll(resetFakeUploads)

  async function seedLot(): Promise<string> {
    const { assetId } = await seedInCustody()
    const lot = await warehouse.createLot(
      admin,
      {
        companyId: COMPANY_A,
        assetIds: [assetId],
        type: 'finance_pickup',
        scheduledAt: null,
        contactPerson: null,
        deliveryAddr: null,
        trackingNo: null,
        note: null,
      },
      ctx(admin),
    )
    return lot.id
  }

  it('แนบเอกสารผ่าน API = เก็บ hash ของ server · แนบใหม่เป็นเวอร์ชันใหม่ (ไฟล์เดิมยังอยู่) · confirm ใช้ hash เดิม', async () => {
    const lotId = await seedLot()
    uploadTestState.realVerify = true
    const v1 = `handover-lots/${lotId}/signed-doc/v1.pdf`
    const v2 = `handover-lots/${lotId}/signed-doc/v2.jpg`
    putFakeUpload(v1, sampleBytes('pdf', 'v1'))
    putFakeUpload(v2, sampleBytes('jpeg', 'v2'))

    const first = await warehouse.attachLotDocument(admin, lotId, { document: 'signed_doc', fileUrl: v1 }, ctx(admin))
    expect(first.signedDocUrl).toBe(v1)
    await warehouse.attachLotDocument(
      admin,
      lotId,
      { document: 'signed_doc', fileUrl: v2, fileHash: sha256Of(sampleBytes('jpeg', 'v2')) },
      ctx(admin),
    )
    const stored = await db().handoverLot.findUniqueOrThrow({ where: { id: lotId } })
    expect(stored.signedDocUrl).toBe(v2)
    expect(stored.signedDocHash).toBe(sha256Of(sampleBytes('jpeg', 'v2')))
    const audits = await db().auditLog.findMany({ where: { targetType: 'handover_lots', targetId: lotId, action: 'update' } })
    expect(audits).toHaveLength(2)

    await warehouse.confirmLot(admin, lotId, { deliveredAt: null, signedDocUrl: null, deliveryProofUrl: null }, ctx(admin))
    const confirmed = await db().handoverLot.findUniqueOrThrow({ where: { id: lotId } })
    expect(confirmed.status).toBe('confirmed')
    expect(confirmed.signedDocHash).toBe(sha256Of(sampleBytes('jpeg', 'v2')))

    // ล็อต confirmed แล้วแนบไม่ได้
    await expectCode(
      () => warehouse.attachLotDocument(admin, lotId, { document: 'signed_doc', fileUrl: v1 }, ctx(admin)),
      'LOT_ALREADY_CONFIRMED',
    )
  })

  it('ไฟล์ไม่มีจริง / นอกล็อต / ไม่ใช่ PDF-รูป / hash ไม่ตรง = ปฏิเสธ และล็อตไม่ขยับ', async () => {
    const lotId = await seedLot()
    uploadTestState.realVerify = true
    const good = `handover-lots/${lotId}/signed-doc/a.pdf`
    putFakeUpload(good, sampleBytes('pdf'))
    putFakeUpload(`handover-lots/${lotId}/signed-doc/fake.pdf`, sampleBytes('text'))
    const attach = (fileUrl: string, fileHash?: string) => () =>
      warehouse.attachLotDocument(admin, lotId, { document: 'signed_doc', fileUrl, fileHash }, ctx(admin))

    await expectCode(attach(`handover-lots/${lotId}/signed-doc/missing.pdf`), 'UPLOAD_FILE_NOT_FOUND')
    await expectCode(attach('handover-lots/other-lot/signed-doc/a.pdf'), 'UPLOAD_PATH_OUT_OF_SCOPE')
    await expectCode(attach(`handover-lots/${lotId}/delivery-proof/a.pdf`), 'UPLOAD_PATH_OUT_OF_SCOPE')
    await expectCode(attach(`handover-lots/${lotId}/signed-doc/fake.pdf`), 'UPLOAD_FILE_TYPE_INVALID')
    await expectCode(attach(good, 'f'.repeat(64)), 'UPLOAD_HASH_MISMATCH')
    // confirm พร้อม url ที่ยังไม่ผ่านการตรวจก็ต้องตรวจเหมือนกัน
    await expectCode(
      () =>
        warehouse.confirmLot(
          admin,
          lotId,
          { deliveredAt: null, signedDocUrl: `handover-lots/${lotId}/signed-doc/missing.pdf`, deliveryProofUrl: null },
          ctx(admin),
        ),
      'UPLOAD_FILE_NOT_FOUND',
    )
    const lot = await db().handoverLot.findUniqueOrThrow({ where: { id: lotId } })
    expect(lot.signedDocUrl).toBeNull()
    expect(lot.status).toBe('pending_attach')
  })

  it('รูปรับเข้าคลัง: ต้องอยู่ใต้ assets/<assetId>/intake/ และเป็นรูปจริง — hash เก็บที่ photo_hashes', async () => {
    const { assetId, imei } = await seedClosedSuccessCase()
    uploadTestState.realVerify = true
    const photo = `assets/${assetId}/intake/front/k-front.jpg`
    putFakeUpload(photo, sampleBytes('jpeg', 'front'))
    putFakeUpload(`assets/${assetId}/intake/back/k-back.jpg`, sampleBytes('text'))

    await expectCode(
      () =>
        warehouse.intakeAsset(admin, assetId, { ...intakeInput(imei), photos: [`assets/${assetId}/intake/back/k-back.jpg`] }, ctx(admin)),
      'UPLOAD_FILE_TYPE_INVALID',
    )
    await expectCode(
      () => warehouse.intakeAsset(admin, assetId, { ...intakeInput(imei), photos: ['assets/other/intake/front/x.jpg'] }, ctx(admin)),
      'UPLOAD_PATH_OUT_OF_SCOPE',
    )
    await warehouse.intakeAsset(admin, assetId, { ...intakeInput(imei), photos: [photo] }, ctx(admin))
    const asset = await db().asset.findUniqueOrThrow({ where: { id: assetId } })
    expect(asset.photoHashes).toEqual({
      [photo]: { sha256: sha256Of(sampleBytes('jpeg', 'front')), mimeType: 'image/jpeg', sizeBytes: sampleBytes('jpeg', 'front').length },
    })
  })
})

suite('Phase 2.13 — scope ระดับแถว (`44` §13 · §17 T15)', () => {
  beforeEach(cleanupCases)

  it('T15 — Company User เห็นเฉพาะเครื่องของบริษัทตัวเอง และเปิดของบริษัทอื่นไม่ได้', async () => {
    const mine = await seedInCustody(COMPANY_A)
    const others = await seedInCustody(COMPANY_B)

    const list = await warehouse.listAssets(companyUser, assetListQuerySchema.parse({}))
    expect(list.items.map((item) => item.id)).toEqual([mine.assetId])

    // ไม่พบ vs ไม่มีสิทธิ์ ต้องได้ code เดียวกัน (ห้าม leak ว่ามีเครื่องของบริษัทอื่นอยู่จริง)
    await expectCode(() => warehouse.getAsset(companyUser, others.assetId), 'ASSET_NOT_FOUND')
  })

  it('T15 — filter ที่ผู้เรียกส่งมาต้องทับ scope ไม่ได้ (`?companyId=` ของบริษัทอื่น = ไม่เห็นอะไรเลย)', async () => {
    const mine = await seedInCustody(COMPANY_A)
    const theirs = await seedInCustody(COMPANY_B)
    await warehouse.createLot(
      admin,
      {
        companyId: COMPANY_B,
        assetIds: [theirs.assetId],
        type: 'finance_pickup',
        scheduledAt: null,
        contactPerson: null,
        deliveryAddr: null,
        trackingNo: null,
        note: null,
      },
      ctx(admin),
    )

    // เครื่อง: Company User ของ A ส่ง companyId=B มาเอง — ต้องได้ 0 ไม่ใช่ของบริษัท B
    const crossCompany = await warehouse.listAssets(
      companyUser,
      assetListQuerySchema.parse({ companyId: COMPANY_B }),
    )
    expect(crossCompany.items).toEqual([])
    expect(crossCompany.total).toBe(0)

    // ล็อต: ทางเดียวกัน — ล็อตของบริษัท B ต้องไม่โผล่
    const crossLots = await warehouse.listLots(companyUser, lotListQuerySchema.parse({ companyId: COMPANY_B }))
    expect(crossLots.total).toBe(0)

    // filter ที่อยู่ในขอบเขตตัวเองยังทำงานปกติ
    const own = await warehouse.listAssets(companyUser, assetListQuerySchema.parse({ companyId: COMPANY_A }))
    expect(own.items.map((item) => item.id)).toEqual([mine.assetId])
  })

  it('T15 — ผู้จัดการทีมส่ง `teamId` ของทีมอื่นมาเอง ก็ยังไม่เห็นเครื่องของทีมนั้น', async () => {
    const mine = await seedInCustody(COMPANY_A)
    const outside = await seedInCustody(COMPANY_A)
    // ย้ายเคสของเครื่องตัวที่สองไปทีมที่ manager ไม่ได้ดูแล (seed ผูก TEAM_ID ให้ทุกเคส)
    await db().$executeRawUnsafe(
      `UPDATE cases SET assigned_team_id = '${OTHER_TEAM_ID}' WHERE id = '${outside.caseId}'`,
    )

    // ทีมตัวเองยังกรองได้ปกติ
    const own = await warehouse.listAssets(manager, assetListQuerySchema.parse({ teamId: TEAM_ID }))
    expect(own.items.map((item) => item.id)).toEqual([mine.assetId])

    // ทีมอื่น = 0 (filter ต้องไม่ทับ `case` ของ scope) · ธุรการที่เห็นทุกแถวยังกรองเจอตามปกติ
    expect((await warehouse.listAssets(manager, assetListQuerySchema.parse({ teamId: OTHER_TEAM_ID }))).total).toBe(0)
    expect((await warehouse.listAssets(admin, assetListQuerySchema.parse({ teamId: OTHER_TEAM_ID }))).total).toBe(1)
  })

  it('ธุรการเห็นทุกบริษัท และล็อตถูกกรองตาม scope เดียวกัน', async () => {
    const mine = await seedInCustody(COMPANY_A)
    await seedInCustody(COMPANY_B)
    await warehouse.createLot(
      admin,
      {
        companyId: COMPANY_A,
        assetIds: [mine.assetId],
        type: 'finance_pickup',
        scheduledAt: null,
        contactPerson: null,
        deliveryAddr: null,
        trackingNo: null,
        note: null,
      },
      ctx(admin),
    )

    expect((await warehouse.listAssets(admin, assetListQuerySchema.parse({}))).total).toBe(2)
    expect((await warehouse.listLots(admin, lotListQuerySchema.parse({}))).total).toBe(1)
    expect((await warehouse.listLots(companyUser, lotListQuerySchema.parse({}))).total).toBe(1)
  })

  /**
   * Final Test ด่าน 4 (Phase 8.3) — T15 เดิมพิสูจน์แค่ **แถว** ที่เห็น
   * แต่แถวที่เห็นยังพก `agentName`/`teamName`/`imeiActual` ออกไปด้วย ซึ่ง `97` §6.1 ห้ามไว้ตรงตัว
   */
  it('Company User ต้องไม่เห็นชื่อพนักงาน/ทีม/IMEI ที่ตรวจจริง (`97` §6.1)', async () => {
    const mine = await seedInCustody(COMPANY_A)

    // ธุรการเห็นครบ = ยืนยันว่าข้อมูลมีอยู่จริงในแถวนั้น (ไม่ใช่ null เพราะ fixture ว่าง)
    const asAdmin = await warehouse.getAsset(admin, mine.assetId)
    expect(asAdmin.agentName).not.toBeNull()
    expect(asAdmin.teamName).not.toBeNull()
    expect(asAdmin.imeiActual).not.toBeNull()

    const detail = await warehouse.getAsset(companyUser, mine.assetId)
    expect(detail.agentId).toBeNull()
    expect(detail.agentName).toBeNull()
    expect(detail.teamId).toBeNull()
    expect(detail.teamName).toBeNull()
    expect(detail.imeiActual).toBeNull()
    expect(detail.serialActual).toBeNull()
    expect(detail.rejectedByName).toBeNull()
    // IMEI ตามสัญญาเป็นข้อมูลที่บริษัทส่งมาเอง (`38` §6.1) — ยังต้องเห็น
    expect(detail.imeiContract).toBe(asAdmin.imeiContract)

    const [listItem] = (await warehouse.listAssets(companyUser, assetListQuerySchema.parse({}))).items
    expect(listItem?.agentName).toBeNull()
    expect(listItem?.imeiActual).toBeNull()
  })

  it('เครื่องในล็อตที่เปิดจากฝั่งบริษัทก็ต้องถูกตัดฟิลด์ภายในเหมือนกัน', async () => {
    const mine = await seedInCustody(COMPANY_A)
    const lot = await warehouse.createLot(
      admin,
      {
        companyId: COMPANY_A,
        assetIds: [mine.assetId],
        type: 'finance_pickup',
        scheduledAt: null,
        contactPerson: null,
        deliveryAddr: null,
        trackingNo: null,
        note: null,
      },
      ctx(admin),
    )

    const asCompany = await warehouse.getLot(companyUser, lot.id)
    expect(asCompany.assets.map((asset) => asset.agentName)).toEqual([null])
    expect(asCompany.assets.map((asset) => asset.imeiActual)).toEqual([null])

    const asAdmin = await warehouse.getLot(admin, lot.id)
    expect(asAdmin.assets[0]?.agentName).not.toBeNull()
  })
})

// ════════════════════════════════════════════════════════════════════════════
// มติ PO 03/10/2569 (UAT Q21 · DEC-012) — ค่าน้ำมันเหมา/เบี้ยเลี้ยงวันละครั้งต่อพนักงาน กระจายทุกเคส
// แผนของทีมนี้: DAILY_FLAT ฿300/วัน + เบี้ยเลี้ยง ฿200/วัน
// ════════════════════════════════════════════════════════════════════════════

suite('UAT Q21 — job `daily_field_allowance` (รายวันต่อพนักงาน · เกตรายได้รอ settle)', () => {
  beforeEach(cleanupCases)

  const todayIso = () => new Date(Date.now() + 7 * 3_600_000).toISOString().slice(0, 10)

  /** เคส approved → รับงาน → เช็คอิน 1 จุด (ยังไม่ปิดงาน) */
  async function fieldWork(chargeOnFail = false): Promise<string> {
    const caseId = await seedApprovedCase(COMPANY_A, `3557000000${String(3000 + caseSeq)}`)
    if (chargeOnFail) {
      await db().$executeRawUnsafe(`UPDATE cases SET service_fee_charge_on_fail = true WHERE id = '${caseId}'`)
    }
    await assignments.assignCase(manager, caseId, { agentId: agent.id }, ctx(manager))
    await field.acceptFieldCase(agent, caseId, ctx(agent))
    await field.scheduleFieldCase(agent, caseId, { scheduleDate: new Date(`${DAY_1}T00:00:00.000Z`) }, ctx(agent))
    await field.saveCloseDraft(
      agent,
      caseId,
      {
        outcome: null,
        photos: [],
        videos: [],
        productPhotos: [],
        travelOrigin: { latitude: 18.58, longitude: 99.0, source: 'gps_auto' },
      },
      ctx(agent),
    )
    await field.recordCheckin(agent, caseId, { latitude: 18.5801, longitude: 99.0031, checkinType: 'address' }, ctx(agent))
    return caseId
  }

  async function closeFail(caseId: string): Promise<void> {
    await field.closeFieldCase(agent, caseId, { outcome: 'closed_fail', failReason: 'debtor_not_found', ...MEDIA }, ctx(agent))
  }

  const dailyRows = (caseIds: string[]) =>
    db().expense.findMany({
      where: { caseId: { in: caseIds }, fieldDaySettlementId: { not: null } },
      orderBy: [{ expenseType: 'asc' }, { grossSatang: 'desc' }],
    })

  it('2 เคสวันเดียว → ชนิดละ 2 แถว รวม = D · วันยังไม่จบ cron ไม่แตะ · dev trigger ระบุวันได้ · รันซ้ำไม่เพิ่ม · รายได้รอ settle + อนุมัติครบ', async () => {
    const job = await import('@/lib/field/daily-allowance-job')
    const engine = await import('@/lib/jobs/engine')
    const revenue = await import('@/lib/warehouse/revenue-service')
    const { prisma } = await import('@/lib/prisma')
    type RevenueTx = Parameters<typeof revenue.tryCreateRevenue>[0]

    const c1 = await fieldWork(true)
    const c2 = await fieldWork()
    await closeFail(c1)
    await closeFail(c2)

    // ปิดงานไม่สร้าง fuel เหมา/เบี้ยเลี้ยงแล้ว · รายได้ยังไม่เกิดเพราะวันลงพื้นที่ยังไม่ settle
    expect(await dailyRows([c1, c2])).toEqual([])
    expect(
      await db().expense.count({ where: { caseId: { in: [c1, c2] }, expenseType: { in: ['fuel', 'allowance'] } } }),
    ).toBe(0)
    expect(await db().revenue.count({ where: { caseId: c1 } })).toBe(0)
    const blocked = await prisma.$transaction((tx) =>
      revenue.tryCreateRevenue(tx as unknown as RevenueTx, { organizationId: ORG_ID, caseIds: [c1], actorId: MANAGER_ID }),
    )
    expect(blocked.skipped).toEqual([{ caseId: c1, reason: 'field_days_not_settled' }])

    // cron (ไม่ระบุวัน) ประมวลผลเฉพาะวันที่จบแล้ว — เช็คอินวันนี้ยังไม่ถูกแตะ
    const early = await job.runDailyFieldAllowanceJob({ organizationId: ORG_ID })
    expect(early.settled).toBe(0)

    // dev trigger ส่ง date = วันนี้ ผ่านตัวรันงานกลาง (ธง devTrigger เท่านั้นที่ทำให้ date มีผล)
    const { job: queued } = await engine.enqueueJob({
      organizationId: ORG_ID,
      jobType: 'daily_field_allowance',
      payload: { date: todayIso(), devTrigger: true },
      idempotencyKey: `test:q21:${Date.now()}`,
    })
    expect(await engine.runJobById(queued.id)).toBe('completed')
    const done = await db().job.findUniqueOrThrow({ where: { id: queued.id } })
    expect(done.result).toMatchObject({ settled: 1, expensesCreated: 4 })

    const rows = await dailyRows([c1, c2])
    // orderBy enum ของ Postgres = ลำดับประกาศ (fuel มาก่อน allowance)
    expect(rows.map((row) => [row.expenseType, row.grossSatang])).toEqual([
      ['fuel', 15_000],
      ['fuel', 15_000],
      ['allowance', 10_000],
      ['allowance', 10_000],
    ])
    expect(new Set(rows.map((row) => row.caseId))).toEqual(new Set([c1, c2]))
    expect(rows.every((row) => row.status === 'pending_approval' && row.compPlanId === PLAN_ID)).toBe(true)
    expect(rows.every((row) => row.expenseDate.toISOString().slice(0, 10) === todayIso())).toBe(true)

    const settlement = await db().fieldDaySettlement.findFirstOrThrow({
      where: { organizationId: ORG_ID, agentId: AGENT_ID },
    })
    expect(settlement).toMatchObject({
      fuelTotalSatang: 30_000,
      allowanceTotalSatang: 20_000,
      caseCount: 2,
      jobId: queued.id,
    })
    const sumOf = (type: string) =>
      rows.filter((row) => row.expenseType === type).reduce((sum, row) => sum + row.grossSatang, 0)
    expect(sumOf('fuel')).toBe(settlement.fuelTotalSatang)
    expect(sumOf('allowance')).toBe(settlement.allowanceTotalSatang)
    const audit = await db().auditLog.findFirst({ where: { targetType: 'field_day_settlements', targetId: settlement.id } })
    expect(audit?.actorId).toBeNull()
    expect(audit?.reason).toContain(`[job:${queued.id}]`)

    // รันซ้ำ = ไม่เพิ่มอะไรเลย (idempotent ต่อ พนักงาน×วัน)
    const again = await job.runDailyFieldAllowanceJob({ organizationId: ORG_ID, date: todayIso() })
    expect(again.settled).toBe(0)
    expect(await dailyRows([c1, c2])).toHaveLength(4)

    // settle แล้วแต่แถวรายวันยังไม่อนุมัติ ⇒ รายได้ยังไม่เกิด · อนุมัติครบ ⇒ เกิดครั้งเดียว
    expect(await db().revenue.count({ where: { caseId: c1 } })).toBe(0)
    await db().$executeRawUnsafe(`UPDATE expenses SET status = 'approved' WHERE case_id = '${c1}'`)
    const created = await prisma.$transaction((tx) =>
      revenue.tryCreateRevenue(tx as unknown as RevenueTx, { organizationId: ORG_ID, caseIds: [c1], actorId: MANAGER_ID }),
    )
    expect(created.revenueIdsCreated).toHaveLength(1)
  })

  it('cron เก็บวันที่จบแล้ว (เมื่อวาน) โดยไม่ต้องระบุวัน · date ในงานที่ไม่ใช่ dev trigger ไม่มีผล', async () => {
    const job = await import('@/lib/field/daily-allowance-job')
    const registry = await import('@/lib/jobs/registry')

    const c1 = await fieldWork()
    await db().$executeRawUnsafe(
      `UPDATE check_ins SET checked_in_at = checked_in_at - interval '1 day' WHERE case_id = '${c1}'`,
    )
    expect(registry.devSettleDateOf({ payload: { date: '2026-01-01' } })).toEqual({})
    expect(registry.devSettleDateOf({ payload: { date: '2026-01-01', devTrigger: true } })).toEqual({ date: '2026-01-01' })

    const result = await job.runDailyFieldAllowanceJob({ organizationId: ORG_ID })
    expect(result.settled).toBe(1)
    const rows = await dailyRows([c1])
    expect(rows.map((row) => row.expenseType).sort()).toEqual(['allowance', 'fuel'])
    // เคสยังไม่ปิดงาน ⇒ เข้าคิวอนุมัติ (ยังไม่มีทรัพย์ให้รอคลัง)
    expect(rows.every((row) => row.status === 'pending_approval')).toBe(true)
    const yesterday = new Date(Date.now() + 7 * 3_600_000 - 86_400_000).toISOString().slice(0, 10)
    expect(rows.every((row) => row.expenseDate.toISOString().slice(0, 10) === yesterday)).toBe(true)

    // ปิดงานทีหลัง: ไม่สร้างเบี้ยเลี้ยง/น้ำมันเหมาซ้ำ
    await closeFail(c1)
    expect(await db().expense.count({ where: { caseId: c1, expenseType: { in: ['fuel', 'allowance'] } } })).toBe(2)
  })

  it('เคสสำเร็จที่ล็อต confirmed ไปแล้วก่อน settle → แถวรายวันเข้า pending_approval (ไม่ค้างรอคลัง)', async () => {
    const job = await import('@/lib/field/daily-allowance-job')
    const { caseId, assetId } = await seedInCustody()
    const lot = await warehouse.createLot(
      admin,
      {
        companyId: COMPANY_A,
        assetIds: [assetId],
        type: 'finance_pickup',
        scheduledAt: null,
        contactPerson: null,
        deliveryAddr: null,
        trackingNo: null,
        note: null,
      },
      ctx(admin),
    )
    await warehouse.confirmLot(
      admin,
      lot.id,
      { deliveredAt: null, signedDocUrl: SIGNED_DOC, deliveryProofUrl: DELIVERY_PROOF },
      ctx(admin),
    )

    // จำลอง "settle หลังล็อต confirmed": ล้างผลการ settle ของ helper แล้วรันใหม่
    await db().$executeRawUnsafe(
      `DELETE FROM expenses WHERE field_day_settlement_id IS NOT NULL AND organization_id = '${ORG_ID}'`,
    )
    await db().$executeRawUnsafe(`DELETE FROM field_day_settlements WHERE organization_id = '${ORG_ID}'`)
    await job.runDailyFieldAllowanceJob({ organizationId: ORG_ID, date: todayIso() })

    const rows = await dailyRows([caseId])
    expect(rows).toHaveLength(2)
    expect(rows.every((row) => row.status === 'pending_approval')).toBe(true)
  })

  /**
   * มติ PO 05/10/2569 U25 (BUG-093 · ปิดช่องเทสต์ตามมติ O23) — วันที่อยู่ในงวดที่ปิดแล้ว:
   * ข้ามเหมือนเดิม (ไม่ settle ข้ามงวด · ไม่มีแถว settlement/expense) แต่แจ้งผู้ถือสิทธิ์สร้างรายการปรับปรุง
   * พร้อมยอดที่คำนวณไว้ (สูตรเดียวกับวันปกติ) · job รันซ้ำวันเดิมไม่แจ้งซ้ำ
   */
  it('งวดปิดแล้ว → period_locked ไม่ settle · แจ้งการเงินพร้อมยอด · รันซ้ำไม่แจ้งซ้ำ', async () => {
    const job = await import('@/lib/field/daily-allowance-job')
    const { fmtDate } = await import('@/lib/format/datetime')
    const ROLE_FINANCE = '00000000-0000-4000-8000-0000000213b0'
    const FINANCE_ID = '00000000-0000-4000-8000-0000000213b1'
    const today = todayIso()
    const [year = '0', month = '0'] = today.split('-')
    const tx = db()

    await tx.$executeRawUnsafe(`
      INSERT INTO roles (id, organization_id, name, role_group, is_seed)
      VALUES ('${ROLE_FINANCE}', '${ORG_ID}', 'การเงิน 2.13', 'system', false) ON CONFLICT (id) DO NOTHING
    `)
    await tx.$executeRawUnsafe(`
      INSERT INTO users (id, organization_id, role_id, email, full_name, status)
      VALUES ('${FINANCE_ID}', '${ORG_ID}', '${ROLE_FINANCE}', 'finance213@test.local', 'การเงิน 2.13', 'active')
      ON CONFLICT (id) DO NOTHING
    `)
    await tx.$executeRawUnsafe(
      `INSERT INTO capabilities (code, label, module) VALUES ('create_adjustment', 'สร้าง Adjustment', 'adjustment') ON CONFLICT (code) DO NOTHING`,
    )
    await tx.$executeRawUnsafe(`
      INSERT INTO role_capabilities (role_id, capability_id, access_level)
      SELECT '${ROLE_FINANCE}', id, 'manage' FROM capabilities WHERE code = 'create_adjustment' ON CONFLICT DO NOTHING
    `)
    await tx.$executeRawUnsafe(`
      INSERT INTO accounting_periods (organization_id, period_label, year_be, month, status, created_by)
      VALUES ('${ORG_ID}', 'งวดทดสอบ U25', ${Number(year) + 543}, ${Number(month)}, 'locked', '${FINANCE_ID}')
    `)
    try {
      const c1 = await fieldWork()
      const c2 = await fieldWork()

      const first = await job.runDailyFieldAllowanceJob({ organizationId: ORG_ID, date: today })
      expect(first).toMatchObject({ settled: 0, periodLocked: 1, periodLockedNotified: 1, expensesCreated: 0 })
      expect(await db().fieldDaySettlement.count({ where: { organizationId: ORG_ID } })).toBe(0)
      expect(await dailyRows([c1, c2])).toEqual([])

      const notices = await db().notification.findMany({
        where: { organizationId: ORG_ID, eventCode: 'field_allowance.period_locked' },
      })
      // ผู้รับ = ผู้ถือสิทธิ์สร้างรายการปรับปรุงเท่านั้น (พนักงาน/ผู้จัดการ/ธุรการคลังไม่ได้)
      expect(notices.map((row) => row.userId)).toEqual([FINANCE_ID])
      // แผน DAILY_FLAT: น้ำมัน 300 + เบี้ยเลี้ยง 200 ต่อวัน (กระจาย 2 เคส แต่ยอดวันเดียวกัน)
      expect(notices[0]?.body).toBe(
        `วันที่ ${fmtDate(new Date(`${today}T00:00:00.000Z`))} คำนวณเข้างวดไม่ได้เพราะงวดบัญชีปิดแล้ว — พนักงาน 2.13 2 เคส ` +
          'ค่าน้ำมัน ฿300.00 เบี้ยเลี้ยง ฿200.00 รวม ฿500.00 กรุณาทำรายการปรับปรุง',
      )
      expect(notices[0]?.linkPath).toBe('/finance?tab=adjustment')

      // รันซ้ำ (cron คืนถัดไป) — ยังข้ามวันเดิม แต่ไม่แจ้งซ้ำ
      const again = await job.runDailyFieldAllowanceJob({ organizationId: ORG_ID, date: today })
      expect(again).toMatchObject({ settled: 0, periodLocked: 1, periodLockedNotified: 0 })
      expect(
        await db().notification.count({ where: { organizationId: ORG_ID, eventCode: 'field_allowance.period_locked' } }),
      ).toBe(1)
    } finally {
      await tx.$executeRawUnsafe(`DELETE FROM accounting_periods WHERE organization_id = '${ORG_ID}'`)
      await tx.$executeRawUnsafe(`DELETE FROM role_capabilities WHERE role_id = '${ROLE_FINANCE}'`)
    }
  })
})
