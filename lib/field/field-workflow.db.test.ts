import { PrismaPg } from '@prisma/adapter-pg'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import type { SessionUser } from '@/lib/auth/types'
import { PrismaClient } from '@/lib/generated/prisma/client'

/**
 * เทสต์ระดับ DB ของ Phase 2.8 — DoD ตาม `41` §19/§20:
 *  · flow เต็ม: รับงาน → จัดวัน → เช็คอิน → ปิดงาน (สถานะ/เคส/หลักฐาน/audit ตรงทุกขั้น)
 *  · ลำดับงานต่อวัน: วันว่าง = 1 · วันมีเคสอยู่ 2 = 3 · ลากสลับ = recompute ทั้งวัน
 *  · validation ครบทุก error code ของ §12 ที่อยู่ใน scope ชุดนี้
 *  · draft: บันทึก → autoload → ลบทันทีที่ปิดงานสำเร็จ · travel_origin ไม่ auto-fill ข้ามเคส
 *  · scope: เคสของเพื่อนร่วมทีมแก้ไม่ได้ (read-only ตาม §11) แต่ดูรายละเอียดเต็มได้ (§7.3)
 *
 * ⚠️ เรียก service จริงซึ่ง import `@/lib/prisma` ⇒ ต้องตั้ง `DATABASE_URL = TEST_DATABASE_URL`
 * **ก่อน** import แบบ dynamic (กับดัก 2026-08-14 ใน REUSE_INDEX)
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
  console.warn('[field-workflow.db.test] ข้ามเทสต์ระดับ DB — ไม่มี TEST_DATABASE_URL (ดู .env.example)')
}

const ORG_ID = '00000000-0000-4000-8000-0000000028a0'
const ROLE_MANAGER = '00000000-0000-4000-8000-0000000028a1'
const ROLE_AGENT = '00000000-0000-4000-8000-0000000028a2'
const MANAGER_ID = '00000000-0000-4000-8000-0000000028a3'
const AGENT_A = '00000000-0000-4000-8000-0000000028a4'
const AGENT_B = '00000000-0000-4000-8000-0000000028a5'
const AGENT_FLAT = '00000000-0000-4000-8000-0000000028a6'
const TEAM_PER_KM = '00000000-0000-4000-8000-0000000028a7'
const TEAM_DAILY_FLAT = '00000000-0000-4000-8000-0000000028a8'
const COMPANY_ID = '00000000-0000-4000-8000-0000000028a9'
const TEMPLATE_ID = '00000000-0000-4000-8000-0000000028aa'
const PLAN_PER_KM = '00000000-0000-4000-8000-0000000028ab'
const PLAN_DAILY_FLAT = '00000000-0000-4000-8000-0000000028ac'
const PROVINCE = 'ลำพูน'

const DAY_1 = '2026-09-01'
const DAY_2 = '2026-09-02'

let client: PrismaClient | null = null
type FieldQueries = typeof import('@/lib/field/queries')
type AssignmentQueries = typeof import('@/lib/assignments/queries')
let field: FieldQueries
let assignments: AssignmentQueries

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
    fullName: 'ผู้ทดสอบ 2.8',
    status: 'active',
    roleId: ROLE_AGENT,
    roleName: 'พนักงานติดตามทรัพย์',
    roleGroup: 'inhouse',
    isSuperadmin: false,
    teamId: TEAM_PER_KM,
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
  roleName: 'ผู้จัดการทีมติดตามทรัพย์',
  teamId: null,
  scope: { kind: 'team', teamIds: [TEAM_PER_KM, TEAM_DAILY_FLAT], companyId: null, userId: MANAGER_ID },
})
const agentA = sessionUser({ id: AGENT_A })
const agentB = sessionUser({ id: AGENT_B })
const agentFlat = sessionUser({ id: AGENT_FLAT, teamId: TEAM_DAILY_FLAT })

function codeOf(error: unknown): string {
  return (error as { code?: string }).code ?? String(error)
}

async function expectCode(run: () => Promise<unknown>, code: string): Promise<void> {
  await expect(run()).rejects.toSatisfy((error: unknown) => codeOf(error) === code, `ต้องได้ error code ${code}`)
}

const MEDIA = { photos: ['p1.jpg'], videos: ['v1.mp4'], productPhotos: ['pp1.jpg'] }

async function cleanupCases(): Promise<void> {
  const tx = db()
  await tx.$executeRawUnsafe(`DELETE FROM close_case_drafts WHERE organization_id = '${ORG_ID}'`)
  await tx.$executeRawUnsafe(`DELETE FROM travel_origins WHERE organization_id = '${ORG_ID}'`)
  await tx.$executeRawUnsafe(`DELETE FROM check_ins WHERE organization_id = '${ORG_ID}'`)
  await tx.$executeRawUnsafe(`DELETE FROM case_evidences WHERE organization_id = '${ORG_ID}'`)
  await tx.$executeRawUnsafe(`DELETE FROM pending_reassignments WHERE organization_id = '${ORG_ID}'`)
  await tx.$executeRawUnsafe(`DELETE FROM case_assignments WHERE organization_id = '${ORG_ID}'`)
  await tx.$executeRawUnsafe(`DELETE FROM cases WHERE organization_id = '${ORG_ID}'`)
}

beforeAll(async () => {
  if (!url) return
  process.env.DATABASE_URL = url
  field = await import('@/lib/field/queries')
  assignments = await import('@/lib/assignments/queries')

  const tx = db()
  await tx.$executeRawUnsafe(`
    INSERT INTO organizations (id, name, tax_id, address)
    VALUES ('${ORG_ID}', 'Phase28Test', '9999999999280', 'ที่อยู่ทดสอบ 2.8') ON CONFLICT (id) DO NOTHING
  `)
  await tx.$executeRawUnsafe(`
    INSERT INTO roles (id, organization_id, name, role_group, is_seed) VALUES
      ('${ROLE_MANAGER}', '${ORG_ID}', 'ผู้จัดการทีมติดตามทรัพย์', 'inhouse', false),
      ('${ROLE_AGENT}', '${ORG_ID}', 'พนักงานติดตามทรัพย์', 'inhouse', false)
    ON CONFLICT (id) DO NOTHING
  `)
  await tx.$executeRawUnsafe(`
    INSERT INTO users (id, organization_id, role_id, email, full_name, status) VALUES
      ('${MANAGER_ID}', '${ORG_ID}', '${ROLE_MANAGER}', 'manager28@test.local', 'ผู้จัดการ 2.8', 'active'),
      ('${AGENT_A}', '${ORG_ID}', '${ROLE_AGENT}', 'agent28a@test.local', 'พนักงาน A 2.8', 'active'),
      ('${AGENT_B}', '${ORG_ID}', '${ROLE_AGENT}', 'agent28b@test.local', 'พนักงาน B 2.8', 'active'),
      ('${AGENT_FLAT}', '${ORG_ID}', '${ROLE_AGENT}', 'agent28f@test.local', 'พนักงาน F 2.8', 'active')
    ON CONFLICT (id) DO NOTHING
  `)
  // แผนค่าตอบแทน 2 โหมด — PER_KM บังคับจุดเริ่มเดินทาง / DAILY_FLAT ไม่บังคับ (`41` §12 · `11` §7.1)
  await tx.$executeRawUnsafe(`
    INSERT INTO compensation_plans
      (id, organization_id, name, side, fuel_mode, fuel_rate_per_km_satang, fuel_daily_flat_satang,
       allowance_satang, commission_satang, no_success_fee_satang, version, effective_from, is_current, created_by)
    VALUES
      ('${PLAN_PER_KM}', '${ORG_ID}', 'แผน PER_KM 2.8', 'inhouse', 'PER_KM', 500, NULL,
       20000, 150000, 50000, 1, DATE '2026-01-01', true, '${MANAGER_ID}'),
      ('${PLAN_DAILY_FLAT}', '${ORG_ID}', 'แผน DAILY_FLAT 2.8', 'inhouse', 'DAILY_FLAT', NULL, 30000,
       20000, 150000, 50000, 1, DATE '2026-01-01', true, '${MANAGER_ID}')
    ON CONFLICT (id) DO NOTHING
  `)
  await tx.$executeRawUnsafe(`
    INSERT INTO teams (id, organization_id, name, side, provinces, status, compensation_plan_id, created_by) VALUES
      ('${TEAM_PER_KM}', '${ORG_ID}', 'ทีมคิดตามระยะ 2.8', 'inhouse', ARRAY['${PROVINCE}'], 'active', '${PLAN_PER_KM}', '${MANAGER_ID}'),
      ('${TEAM_DAILY_FLAT}', '${ORG_ID}', 'ทีมเหมารายวัน 2.8', 'inhouse', ARRAY['${PROVINCE}'], 'active', '${PLAN_DAILY_FLAT}', '${MANAGER_ID}')
    ON CONFLICT (id) DO NOTHING
  `)
  await tx.$executeRawUnsafe(`
    UPDATE users SET team_id = CASE WHEN id = '${AGENT_FLAT}' THEN '${TEAM_DAILY_FLAT}'::uuid ELSE '${TEAM_PER_KM}'::uuid END
    WHERE id IN ('${AGENT_A}', '${AGENT_B}', '${AGENT_FLAT}')
  `)
  await tx.$executeRawUnsafe(`
    INSERT INTO service_fee_templates
      (id, organization_id, name, model, base_satang, rate_pct, basis, charge_on_fail, version, is_current, created_by)
    VALUES ('${TEMPLATE_ID}', '${ORG_ID}', 'เทมเพลต 2.8', 'FLAT', 50000, 0, NULL, false, 1, true, '${MANAGER_ID}')
    ON CONFLICT (id) DO NOTHING
  `)
  await tx.$executeRawUnsafe(`
    INSERT INTO finance_companies (id, organization_id, name, short_name, tax_id, service_fee_template_id, created_by)
    VALUES ('${COMPANY_ID}', '${ORG_ID}', 'ไฟแนนซ์ 2.8', 'T28', '0105512800028', '${TEMPLATE_ID}', '${MANAGER_ID}')
    ON CONFLICT (id) DO NOTHING
  `)
})

afterAll(async () => {
  if (url) await cleanupCases()
  await client?.$disconnect()
})

let caseSeq = 0

async function seedApprovedCase(teamId: string = TEAM_PER_KM): Promise<string> {
  caseSeq += 1
  const caseRef = `FL28-${caseSeq}`
  const rows = await db().$queryRawUnsafe<{ id: string }[]>(`
    INSERT INTO cases (
      organization_id, case_ref, case_ref_normalized, company_id, source, status, created_by,
      debtor_name, addr_province, addr_district, asset_description, debt_amount_satang, assigned_team_id
    ) VALUES (
      '${ORG_ID}', $$${caseRef}$$, $$${caseRef}$$, '${COMPANY_ID}', 'manual', 'approved', '${MANAGER_ID}',
      'ลูกหนี้ ${caseSeq}', '${PROVINCE}', 'เมือง', 'iPhone 15', 1000000, '${teamId}'
    ) RETURNING id
  `)
  return rows[0]?.id ?? ''
}

/** เคสที่พนักงานกดรับแล้ว (พร้อมจัดวัน) */
async function seedAcceptedCase(agent: SessionUser = agentA, teamId: string = TEAM_PER_KM): Promise<string> {
  const caseId = await seedApprovedCase(teamId)
  await assignments.assignCase(manager, caseId, { agentId: agent.id }, { actor: manager, meta })
  await field.acceptFieldCase(agent, caseId, { actor: agent, meta })
  return caseId
}

/** เคสที่จัดวันแล้ว + เช็คอิน 1 จุด + มีจุดเริ่มเดินทาง (พร้อมปิดงาน) */
async function seedReadyToClose(
  agent: SessionUser = agentA,
  teamId: string = TEAM_PER_KM,
  date: string = DAY_1,
): Promise<string> {
  const caseId = await seedAcceptedCase(agent, teamId)
  await field.scheduleFieldCase(agent, caseId, { scheduleDate: new Date(`${date}T00:00:00.000Z`) }, { actor: agent, meta })
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
    { actor: agent, meta },
  )
  await field.recordCheckin(
    agent,
    caseId,
    { latitude: 18.5801, longitude: 99.0031, checkinType: 'address' },
    { actor: agent, meta },
  )
  return caseId
}

suite('Phase 2.8 — flow เต็ม รับงาน → จัดวัน → เช็คอิน → ปิดงาน (`41` §9 · §20)', () => {
  beforeEach(cleanupCases)

  it('เดินครบทุกขั้นแล้วสถานะ/เคส/หลักฐาน/audit ตรงตามสเปค', async () => {
    const caseId = await seedApprovedCase()
    await assignments.assignCase(manager, caseId, { agentId: AGENT_A }, { actor: manager, meta })

    const accepted = await field.acceptFieldCase(agentA, caseId, { actor: agentA, meta })
    expect(accepted.status).toBe('accepted_unscheduled')
    expect(accepted.group).toBe('accepted')

    const scheduled = await field.scheduleFieldCase(
      agentA,
      caseId,
      { scheduleDate: new Date(`${DAY_1}T00:00:00.000Z`) },
      { actor: agentA, meta },
    )
    expect(scheduled.status).toBe('scheduled')
    expect(scheduled.scheduleDate).toBe(DAY_1)
    expect(scheduled.scheduleOrder).toBe(1)
    expect((await db().case.findUniqueOrThrow({ where: { id: caseId } })).status).toBe('active')

    await field.saveCloseDraft(
      agentA,
      caseId,
      {
        outcome: 'closed_success',
        ...MEDIA,
        travelOrigin: { latitude: 18.58, longitude: 99.0, source: 'gps_auto' },
      },
      { actor: agentA, meta },
    )
    const checkin = await field.recordCheckin(
      agentA,
      caseId,
      { latitude: 18.5801, longitude: 99.0031, checkinType: 'address' },
      { actor: agentA, meta },
    )
    expect(checkin.checkinCount).toBe(1)

    const closed = await field.closeFieldCase(
      agentA,
      caseId,
      { outcome: 'closed_success', ...MEDIA },
      { actor: agentA, meta },
    )
    expect(closed.status).toBe('closed_success')
    expect(closed.group).toBe('closed')
    // Phase 2.9 — ปิดงานสร้างรายการเบิกในทรานแซกชันเดียวกัน (`41` §6.6) ⇒ มี event ของรายการเบิกด้วย
    expect(closed.events).toEqual(['case.closed_success', 'expense.case_bound_created'])

    const caseRow = await db().case.findUniqueOrThrow({ where: { id: caseId } })
    expect(caseRow.status).toBe('closed_success')
    expect(caseRow.outcome).toBe('closed_success')
    expect(caseRow.closedAt).not.toBeNull()

    // หลักฐาน + snapshot จุดเริ่มเดินทาง ณ เวลา submit (`92` §7.1)
    const evidence = await db().caseEvidence.findFirstOrThrow({ where: { caseId } })
    expect(evidence.outcome).toBe('closed_success')
    expect(evidence.photos).toEqual(MEDIA.photos)
    expect(evidence.videos).toEqual(MEDIA.videos)
    expect(evidence.productPhotos).toEqual(MEDIA.productPhotos)
    expect(evidence.travelOriginLat?.toNumber()).toBeCloseTo(18.58, 4)

    // draft ถูกลบทันทีที่ปิดงานสำเร็จ (`41` §6.5)
    expect(await db().closeCaseDraft.count({ where: { caseId } })).toBe(0)

    const audit = await db().auditLog.findFirst({
      where: { organizationId: ORG_ID, targetType: 'case_assignments', targetId: closed.assignmentId },
      orderBy: { createdAt: 'desc' },
    })
    expect(audit?.action).toBe('status_change')
    expect(audit?.actorId).toBe(AGENT_A)
  })

  it('เคสไม่สำเร็จปิดได้โดยไม่ต้องมีรูปสินค้า (§20)', async () => {
    const caseId = await seedReadyToClose()
    const closed = await field.closeFieldCase(
      agentA,
      caseId,
      { outcome: 'closed_fail', photos: ['p.jpg'], videos: ['v.mp4'], productPhotos: [] },
      { actor: agentA, meta },
    )
    expect(closed.status).toBe('closed_fail')
    expect(closed.events).toEqual(['case.closed_fail', 'expense.case_bound_created'])
    expect((await db().case.findUniqueOrThrow({ where: { id: caseId } })).status).toBe('closed_fail')
  })

  it('ข้ามขั้นไม่ได้: จัดวันก่อนกดรับ / เช็คอินก่อนจัดวัน / ปิดงานซ้ำ', async () => {
    const caseId = await seedApprovedCase()
    await assignments.assignCase(manager, caseId, { agentId: AGENT_A }, { actor: manager, meta })

    await expectCode(
      () =>
        field.scheduleFieldCase(
          agentA,
          caseId,
          { scheduleDate: new Date(`${DAY_1}T00:00:00.000Z`) },
          { actor: agentA, meta },
        ),
      'ASSIGNMENT_INVALID_STATUS',
    )

    await field.acceptFieldCase(agentA, caseId, { actor: agentA, meta })
    await expectCode(
      () =>
        field.recordCheckin(agentA, caseId, { latitude: 18.5, longitude: 99.0, checkinType: 'address' }, {
          actor: agentA,
          meta,
        }),
      'ASSIGNMENT_INVALID_STATUS',
    )

    const ready = await seedReadyToClose()
    await field.closeFieldCase(agentA, ready, { outcome: 'closed_fail', ...MEDIA }, { actor: agentA, meta })
    await expectCode(
      () => field.closeFieldCase(agentA, ready, { outcome: 'closed_fail', ...MEDIA }, { actor: agentA, meta }),
      'ASSIGNMENT_INVALID_STATUS',
    )
  })
})

suite('Phase 2.8 — หลักฐานบังคับตาม outcome (`41` §12 · §20)', () => {
  beforeEach(cleanupCases)

  it('ไม่เลือก outcome = CLOSE_OUTCOME_REQUIRED', async () => {
    const caseId = await seedReadyToClose()
    await expectCode(
      () => field.closeFieldCase(agentA, caseId, { outcome: null, ...MEDIA }, { actor: agentA, meta }),
      'CLOSE_OUTCOME_REQUIRED',
    )
  })

  it('ไม่มีเช็คอิน = CLOSE_CHECKIN_REQUIRED', async () => {
    const caseId = await seedAcceptedCase()
    await field.scheduleFieldCase(
      agentA,
      caseId,
      { scheduleDate: new Date(`${DAY_1}T00:00:00.000Z`) },
      { actor: agentA, meta },
    )
    await field.saveCloseDraft(
      agentA,
      caseId,
      {
        outcome: 'closed_success',
        ...MEDIA,
        travelOrigin: { latitude: 18.58, longitude: 99.0, source: 'gps_auto' },
      },
      { actor: agentA, meta },
    )
    await expectCode(
      () => field.closeFieldCase(agentA, caseId, { outcome: 'closed_success', ...MEDIA }, { actor: agentA, meta }),
      'CLOSE_CHECKIN_REQUIRED',
    )
  })

  it('ไม่มีรูป/วิดีโอ = CLOSE_PHOTO_REQUIRED / CLOSE_VIDEO_REQUIRED', async () => {
    const caseId = await seedReadyToClose()
    await expectCode(
      () =>
        field.closeFieldCase(
          agentA,
          caseId,
          { outcome: 'closed_fail', photos: [], videos: ['v.mp4'], productPhotos: [] },
          { actor: agentA, meta },
        ),
      'CLOSE_PHOTO_REQUIRED',
    )
    await expectCode(
      () =>
        field.closeFieldCase(
          agentA,
          caseId,
          { outcome: 'closed_fail', photos: ['p.jpg'], videos: [], productPhotos: [] },
          { actor: agentA, meta },
        ),
      'CLOSE_VIDEO_REQUIRED',
    )
  })

  it('ปิดสำเร็จโดยไม่มีรูปสินค้า = CLOSE_PRODUCT_PHOTO_REQUIRED (§20)', async () => {
    const caseId = await seedReadyToClose()
    await expectCode(
      () =>
        field.closeFieldCase(
          agentA,
          caseId,
          { outcome: 'closed_success', photos: ['p.jpg'], videos: ['v.mp4'], productPhotos: [] },
          { actor: agentA, meta },
        ),
      'CLOSE_PRODUCT_PHOTO_REQUIRED',
    )
  })

  it('ทีม PER_KM ไม่มีจุดเริ่มเดินทาง = CLOSE_TRAVEL_ORIGIN_REQUIRED · ทีม DAILY_FLAT ปิดได้เลย (§20)', async () => {
    const perKm = await seedAcceptedCase(agentA, TEAM_PER_KM)
    await field.scheduleFieldCase(
      agentA,
      perKm,
      { scheduleDate: new Date(`${DAY_1}T00:00:00.000Z`) },
      { actor: agentA, meta },
    )
    await field.recordCheckin(
      agentA,
      perKm,
      { latitude: 18.58, longitude: 99.0, checkinType: 'address' },
      { actor: agentA, meta },
    )
    await expectCode(
      () => field.closeFieldCase(agentA, perKm, { outcome: 'closed_fail', ...MEDIA }, { actor: agentA, meta }),
      'CLOSE_TRAVEL_ORIGIN_REQUIRED',
    )

    const flat = await seedAcceptedCase(agentFlat, TEAM_DAILY_FLAT)
    await field.scheduleFieldCase(
      agentFlat,
      flat,
      { scheduleDate: new Date(`${DAY_1}T00:00:00.000Z`) },
      { actor: agentFlat, meta },
    )
    await field.recordCheckin(
      agentFlat,
      flat,
      { latitude: 18.58, longitude: 99.0, checkinType: 'address' },
      { actor: agentFlat, meta },
    )
    const closed = await field.closeFieldCase(
      agentFlat,
      flat,
      { outcome: 'closed_fail', ...MEDIA },
      { actor: agentFlat, meta },
    )
    expect(closed.status).toBe('closed_fail')
  })

  it('เช็คอินด้วยพิกัดที่ไม่ได้มาจากอุปกรณ์จริง = CHECKIN_GPS_PERMISSION_DENIED (§11)', async () => {
    const caseId = await seedReadyToClose()
    await expectCode(
      () => field.recordCheckin(agentA, caseId, { latitude: 0, longitude: 0, checkinType: 'address' }, {
        actor: agentA,
        meta,
      }),
      'CHECKIN_GPS_PERMISSION_DENIED',
    )
  })
})

suite('Phase 2.8 — ลำดับงานต่อวัน (`41` §8 · §20)', () => {
  beforeEach(cleanupCases)

  it('วันว่าง = ลำดับ 1 · วันที่มีเคสอยู่ 2 = ลำดับ 3', async () => {
    const first = await seedAcceptedCase()
    const second = await seedAcceptedCase()
    const third = await seedAcceptedCase()
    const scheduleDate = new Date(`${DAY_1}T00:00:00.000Z`)

    expect(
      (await field.scheduleFieldCase(agentA, first, { scheduleDate }, { actor: agentA, meta })).scheduleOrder,
    ).toBe(1)
    expect(
      (await field.scheduleFieldCase(agentA, second, { scheduleDate }, { actor: agentA, meta })).scheduleOrder,
    ).toBe(2)
    expect(
      (await field.scheduleFieldCase(agentA, third, { scheduleDate }, { actor: agentA, meta })).scheduleOrder,
    ).toBe(3)
  })

  it('ลากเคสลำดับ 3 มาไว้ที่ 1 = ลำดับใหม่ทั้งวัน (§20)', async () => {
    const ids: string[] = []
    const scheduleDate = new Date(`${DAY_1}T00:00:00.000Z`)
    for (let index = 0; index < 3; index += 1) {
      const caseId = await seedAcceptedCase()
      await field.scheduleFieldCase(agentA, caseId, { scheduleDate }, { actor: agentA, meta })
      ids.push(caseId)
    }

    const [a = '', b = '', c = ''] = ids
    const result = await field.reorderFieldSchedules(
      agentA,
      { date: scheduleDate, orderedCaseIds: [c, a, b] },
      { actor: agentA, meta },
    )
    expect(result.items.map((item) => item.caseId)).toEqual([c, a, b])

    const rows = await db().caseAssignment.findMany({
      where: { caseId: { in: ids } },
      select: { caseId: true, scheduleOrder: true },
    })
    const orderOf = new Map(rows.map((row) => [row.caseId, row.scheduleOrder]))
    expect(orderOf.get(c)).toBe(1)
    expect(orderOf.get(a)).toBe(2)
    expect(orderOf.get(b)).toBe(3)
  })

  it('ส่งลำดับไม่ครบทุกเคสของวันนั้น = REQUIRED_MISSING', async () => {
    const scheduleDate = new Date(`${DAY_1}T00:00:00.000Z`)
    const first = await seedAcceptedCase()
    const second = await seedAcceptedCase()
    await field.scheduleFieldCase(agentA, first, { scheduleDate }, { actor: agentA, meta })
    await field.scheduleFieldCase(agentA, second, { scheduleDate }, { actor: agentA, meta })

    await expectCode(
      () =>
        field.reorderFieldSchedules(agentA, { date: scheduleDate, orderedCaseIds: [first] }, { actor: agentA, meta }),
      'REQUIRED_MISSING',
    )
  })

  it('เคสคนละวันไม่ปนลำดับกัน', async () => {
    const day1Case = await seedAcceptedCase()
    const day2Case = await seedAcceptedCase()
    await field.scheduleFieldCase(
      agentA,
      day1Case,
      { scheduleDate: new Date(`${DAY_1}T00:00:00.000Z`) },
      { actor: agentA, meta },
    )
    const second = await field.scheduleFieldCase(
      agentA,
      day2Case,
      { scheduleDate: new Date(`${DAY_2}T00:00:00.000Z`) },
      { actor: agentA, meta },
    )
    expect(second.scheduleOrder).toBe(1)
    expect(second.scheduleDate).toBe(DAY_2)
  })
})

suite('Phase 2.8 — draft + จุดเริ่มเดินทาง (`41` §6.4.1 · §6.5 · §20)', () => {
  beforeEach(cleanupCases)

  it('บันทึก draft แล้วเปิดใหม่เห็นของเดิมครบ (autoload)', async () => {
    const caseId = await seedReadyToClose()
    await field.saveCloseDraft(
      agentA,
      caseId,
      { outcome: 'closed_success', photos: ['p1.jpg', 'p2.jpg'], videos: [], productPhotos: [], note: 'ทำต่อพรุ่งนี้' },
      { actor: agentA, meta },
    )

    const detail = await field.getFieldCase(agentA, caseId)
    expect(detail.draft?.outcome).toBe('closed_success')
    expect(detail.draft?.photos).toEqual(['p1.jpg', 'p2.jpg'])
    expect(detail.draft?.note).toBe('ทำต่อพรุ่งนี้')
    expect(detail.hasDraft).toBe(true)
    expect(detail.checkins).toHaveLength(1)
  })

  it('ลากปรับตำแหน่งจุดเริ่มเดินทางได้ และไม่กระทบเช็คอิน (§20)', async () => {
    const caseId = await seedReadyToClose()
    const before = await field.getFieldCase(agentA, caseId)
    expect(before.travelOrigin?.source).toBe('gps_auto')

    await field.saveCloseDraft(
      agentA,
      caseId,
      {
        outcome: null,
        photos: [],
        videos: [],
        productPhotos: [],
        travelOrigin: { latitude: 18.6, longitude: 99.1, source: 'manual_adjusted' },
      },
      { actor: agentA, meta },
    )

    const after = await field.getFieldCase(agentA, caseId)
    expect(after.travelOrigin?.source).toBe('manual_adjusted')
    expect(after.travelOrigin?.latitude).toBeCloseTo(18.6, 4)
    expect(after.checkins).toHaveLength(1)
    expect(after.checkins[0]?.latitude).toBeCloseTo(before.checkins[0]?.latitude ?? 0, 6)
  })

  it('เคสที่ 2 ของวันไม่ auto-fill จุดเริ่มเดินทางจากเคสแรก (§6.4.1 · §20)', async () => {
    await seedReadyToClose()
    const second = await seedAcceptedCase()
    await field.scheduleFieldCase(
      agentA,
      second,
      { scheduleDate: new Date(`${DAY_1}T00:00:00.000Z`) },
      { actor: agentA, meta },
    )

    const detail = await field.getFieldCase(agentA, second)
    expect(detail.travelOrigin).toBeNull()
  })

  it('เช็คอินหลายจุดได้ และแก้/ลบไม่ได้ (insert-only)', async () => {
    const caseId = await seedReadyToClose()
    await field.recordCheckin(
      agentA,
      caseId,
      { latitude: 18.59, longitude: 99.01, checkinType: 'workplace' },
      { actor: agentA, meta },
    )
    const detail = await field.getFieldCase(agentA, caseId)
    expect(detail.checkins).toHaveLength(2)
    expect(detail.checkins.map((row) => row.checkinType)).toEqual(['address', 'workplace'])
  })
})

suite('Phase 2.8 — รายการงาน 4 กลุ่ม + มุมมองทีม (`41` §7.2/§7.3/§7.5/§7.11 · §20)', () => {
  beforeEach(cleanupCases)

  it('เคสเดินไปตามกลุ่มของแท็บทีละขั้น', async () => {
    const caseId = await seedApprovedCase()
    await assignments.assignCase(manager, caseId, { agentId: AGENT_A }, { actor: manager, meta })
    expect((await field.listFieldCases(agentA, { status: 'pending_accept', view: 'own' })).items).toHaveLength(1)

    await field.acceptFieldCase(agentA, caseId, { actor: agentA, meta })
    expect((await field.listFieldCases(agentA, { status: 'pending_accept', view: 'own' })).items).toHaveLength(0)
    expect((await field.listFieldCases(agentA, { status: 'accepted', view: 'own' })).items).toHaveLength(1)

    await field.scheduleFieldCase(
      agentA,
      caseId,
      { scheduleDate: new Date(`${DAY_1}T00:00:00.000Z`) },
      { actor: agentA, meta },
    )
    expect((await field.listFieldCases(agentA, { status: 'tracking', view: 'own' })).items).toHaveLength(1)
  })

  it('การ์ดรอรับงานแสดงคอมมิชชั่น/เบี้ยเสี่ยงของทีม (§6.8 — เห็นก่อนกดรับ)', async () => {
    const caseId = await seedApprovedCase()
    await assignments.assignCase(manager, caseId, { agentId: AGENT_A }, { actor: manager, meta })

    const [item] = (await field.listFieldCases(agentA, { status: 'pending_accept', view: 'own' })).items
    expect(item?.commissionSatang).toBe(150000)
    expect(item?.noSuccessFeeSatang).toBe(50000)
  })

  it('มุมมองของฉันไม่เห็นเคสเพื่อน แต่มุมมองทีมเห็นครบและเป็น read-only (§7.3 · §20)', async () => {
    await seedAcceptedCase(agentB)

    expect((await field.listFieldCases(agentA, { status: 'accepted', view: 'own' })).items).toHaveLength(0)

    const teamView = await field.listFieldCases(agentA, { status: 'accepted', view: 'team' })
    expect(teamView.readOnly).toBe(true)
    expect(teamView.items).toHaveLength(1)
    // เห็นรายละเอียดเต็ม ไม่ปิดบัง (§20 "มุมมองทีมเห็นข้อมูลเต็ม")
    expect(teamView.items[0]?.debtorName).not.toBeNull()
    expect(teamView.items[0]?.agentId).toBe(AGENT_B)
  })

  it('แก้เคสของเพื่อนร่วมทีมไม่ได้ = ASSIGNMENT_NOT_FOUND (มุมมองทีม read-only เสมอ)', async () => {
    const caseId = await seedAcceptedCase(agentB)
    await expectCode(
      () =>
        field.scheduleFieldCase(
          agentA,
          caseId,
          { scheduleDate: new Date(`${DAY_1}T00:00:00.000Z`) },
          { actor: agentA, meta },
        ),
      'ASSIGNMENT_NOT_FOUND',
    )
    // แต่ยังเปิดดูรายละเอียดเต็มได้ (§7.3)
    expect((await field.getFieldCase(agentA, caseId)).agentId).toBe(AGENT_B)
  })

  it('เคสที่ปิดแล้วอยู่กลุ่ม "จบงาน" พร้อมวันเวลาปิดงาน (§7.11)', async () => {
    const caseId = await seedReadyToClose()
    await field.closeFieldCase(agentA, caseId, { outcome: 'closed_fail', ...MEDIA }, { actor: agentA, meta })

    const closed = await field.listFieldCases(agentA, { status: 'closed', view: 'own' })
    expect(closed.items).toHaveLength(1)
    expect(closed.items[0]?.status).toBe('closed_fail')
    expect(closed.items[0]?.closedAt).not.toBeNull()
  })
})
