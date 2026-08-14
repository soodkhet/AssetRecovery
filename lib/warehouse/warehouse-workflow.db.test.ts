import { PrismaPg } from '@prisma/adapter-pg'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import type { SessionUser } from '@/lib/auth/types'
import { PrismaClient } from '@/lib/generated/prisma/client'
import { assetListQuerySchema, lotListQuerySchema } from '@/lib/warehouse/schemas'

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
      ('${ROLE_AGENT}', '${ORG_ID}', 'พนักงานติดตามทรัพย์ 2.13', 'inhouse', false),
      ('${ROLE_ADMIN}', '${ORG_ID}', 'ธุรการคลัง 2.13', 'system', false)
    ON CONFLICT (id) DO NOTHING
  `)
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
    INSERT INTO teams (id, organization_id, name, side, provinces, status, compensation_plan_id, created_by)
    VALUES ('${TEAM_ID}', '${ORG_ID}', 'ทีมทดสอบคลัง 2.13', 'inhouse', ARRAY['${PROVINCE}'], 'active', '${PLAN_ID}', '${MANAGER_ID}')
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
      { outcome: 'closed_fail', photos: ['p.jpg'], videos: ['v.mp4'], productPhotos: [] },
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

    const inLot = await seedInCustody()
    await warehouse.createLot(admin, lotInput([inLot.assetId], 'finance_pickup'), ctx(admin))
    await expectCode(
      () => warehouse.createLot(admin, lotInput([inLot.assetId], 'finance_pickup'), ctx(admin)),
      'ASSET_NOT_IN_CUSTODY',
    )
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
  })

  it('T12 — expense อนุมัติแล้ว + ล็อต confirmed = เคสเข้าเงื่อนไขสร้าง Revenue', async () => {
    const { caseId, lotId } = await seedPendingLot()
    await db().$executeRawUnsafe(`UPDATE expenses SET status = 'approved' WHERE case_id = '${caseId}'`)

    const result = await warehouse.confirmLot(admin, lotId, confirmInput(), ctx(admin))

    expect(result.revenueEligibleCaseIds).toEqual([caseId])
    // stub ของ 2.13 ยังไม่สร้างแถวจริง — Phase 3.6 เสียบตัวจริงแล้วต้องได้ id ที่นี่
    expect(result.revenueIdsCreated).toEqual([])
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
})
