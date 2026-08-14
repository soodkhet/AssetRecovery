import { PrismaPg } from '@prisma/adapter-pg'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import type { SessionUser } from '@/lib/auth/types'
import { clearDistanceCache } from '@/lib/field/distance-provider'
import { PrismaClient } from '@/lib/generated/prisma/client'

/**
 * เทสต์ระดับ DB ของ Phase 2.9 — DoD ตาม `41` §19/§20 + มติ PO 14/08/2569 (D10):
 *  · ปิดงานสร้างรายการเบิกอัตโนมัติ — สำเร็จ = `pending_warehouse_confirm` / ไม่สำเร็จ = `pending_approval`
 *  · ระยะทางรวมทุกช่วงตามลำดับเวลา · เพดาน `max_per_case` ตัดยอด · `DAILY_FLAT` ไม่เรียก Distance Matrix เลย
 *  · D10: ไม่มี `GOOGLE_MAPS_API_KEY` = ปิดงานสำเร็จ + ไม่มีรายการ fuel + ตั้ง job แล้ว job สร้างให้ทีหลัง (idempotent)
 *  · 2 เส้นทางตีกลับห้ามสลับ (`41` §10.1): `reject_evidence`+`resubmit_close` / `reject_expense`+`resubmit_expense`
 *  · เบิกที่พัก: 3 ฟิลด์บังคับ + ผู้พักร่วมนอกทีมถูกปฏิเสธ · สรุปรายได้ตามแผนที่ snapshot ไว้
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
  console.warn('[field-expense.db.test] ข้ามเทสต์ระดับ DB — ไม่มี TEST_DATABASE_URL (ดู .env.example)')
}

const ORG_ID = '00000000-0000-4000-8000-0000000029a0'
const ROLE_MANAGER = '00000000-0000-4000-8000-0000000029a1'
const ROLE_AGENT = '00000000-0000-4000-8000-0000000029a2'
const MANAGER_ID = '00000000-0000-4000-8000-0000000029a3'
const AGENT_A = '00000000-0000-4000-8000-0000000029a4'
const AGENT_B = '00000000-0000-4000-8000-0000000029a5'
const AGENT_FLAT = '00000000-0000-4000-8000-0000000029a6'
const TEAM_PER_KM = '00000000-0000-4000-8000-0000000029a7'
const TEAM_DAILY_FLAT = '00000000-0000-4000-8000-0000000029a8'
const TEAM_CAPPED = '00000000-0000-4000-8000-0000000029a9'
const COMPANY_ID = '00000000-0000-4000-8000-0000000029aa'
const TEMPLATE_ID = '00000000-0000-4000-8000-0000000029ab'
const PLAN_PER_KM = '00000000-0000-4000-8000-0000000029ac'
const PLAN_DAILY_FLAT = '00000000-0000-4000-8000-0000000029ad'
const PLAN_CAPPED = '00000000-0000-4000-8000-0000000029ae'
const AGENT_CAPPED = '00000000-0000-4000-8000-0000000029af'
const PROVINCE = 'ลำพูน'
const DAY_1 = '2026-09-01'

/** ฿5.00/กม. · เบี้ยเลี้ยง ฿200/วัน · คอม ฿1,500 · เบี้ยเสี่ยง ฿500 */
const RATE_PER_KM_SATANG = 500
const ALLOWANCE_SATANG = 20_000
const COMMISSION_SATANG = 150_000
const NO_SUCCESS_FEE_SATANG = 50_000
const DAILY_FLAT_SATANG = 30_000
const CAP_SATANG = 40_000

let client: PrismaClient | null = null
type FieldQueries = typeof import('@/lib/field/queries')
type ExpenseQueries = typeof import('@/lib/field/expense-queries')
type AssignmentQueries = typeof import('@/lib/assignments/queries')
type FuelJob = typeof import('@/lib/field/fuel-distance-job')
let field: FieldQueries
let expenses: ExpenseQueries
let assignments: AssignmentQueries
let fuelJob: FuelJob

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
    fullName: 'ผู้ทดสอบ 2.9',
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
  roleName: 'เจ้าหน้าที่อนุมัติเคส',
  teamId: null,
  scope: { kind: 'team', teamIds: [TEAM_PER_KM, TEAM_DAILY_FLAT, TEAM_CAPPED], companyId: null, userId: MANAGER_ID },
})
const agentA = sessionUser({ id: AGENT_A })
const agentB = sessionUser({ id: AGENT_B })
const agentFlat = sessionUser({ id: AGENT_FLAT, teamId: TEAM_DAILY_FLAT })
const agentCapped = sessionUser({ id: AGENT_CAPPED, teamId: TEAM_CAPPED })

const MEDIA = { photos: ['p1.jpg'], videos: ['v1.mp4'], productPhotos: ['pp1.jpg'] }

function codeOf(error: unknown): string {
  return (error as { code?: string }).code ?? String(error)
}

async function expectCode(run: () => Promise<unknown>, code: string): Promise<void> {
  await expect(run()).rejects.toSatisfy((error: unknown) => codeOf(error) === code, `ต้องได้ error code ${code}`)
}

/** stub ของ Google Distance Matrix — คืนระยะทางเท่ากันทุกช่วง */
function stubDistanceMatrix(metersPerLeg: number): ReturnType<typeof vi.fn> {
  const fetchMock = vi.fn(
    async () =>
      new Response(
        JSON.stringify({ status: 'OK', rows: [{ elements: [{ status: 'OK', distance: { value: metersPerLeg } }] }] }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      ),
  )
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

async function cleanupCases(): Promise<void> {
  const tx = db()
  // `audit_logs` ลบไม่ได้เด็ดขาด (`02` §13 — trigger ระดับ DB) จึงปล่อยค้างไว้ตามกติกา
  await tx.$executeRawUnsafe(`UPDATE expenses SET superseded_by_expense_id = NULL WHERE organization_id = '${ORG_ID}'`)
  await tx.$executeRawUnsafe(`DELETE FROM expenses WHERE organization_id = '${ORG_ID}'`)
  await tx.$executeRawUnsafe(`DELETE FROM jobs WHERE organization_id = '${ORG_ID}'`)
  await tx.$executeRawUnsafe(`DELETE FROM notifications WHERE organization_id = '${ORG_ID}'`)
  await tx.$executeRawUnsafe(`DELETE FROM close_case_drafts WHERE organization_id = '${ORG_ID}'`)
  await tx.$executeRawUnsafe(`DELETE FROM travel_origins WHERE organization_id = '${ORG_ID}'`)
  await tx.$executeRawUnsafe(`DELETE FROM check_ins WHERE organization_id = '${ORG_ID}'`)
  await tx.$executeRawUnsafe(`DELETE FROM case_evidences WHERE organization_id = '${ORG_ID}'`)
  await tx.$executeRawUnsafe(`DELETE FROM pending_reassignments WHERE organization_id = '${ORG_ID}'`)
  await tx.$executeRawUnsafe(`DELETE FROM case_assignments WHERE organization_id = '${ORG_ID}'`)
  await tx.$executeRawUnsafe(`DELETE FROM cases WHERE organization_id = '${ORG_ID}'`)
  clearDistanceCache()
}

beforeAll(async () => {
  if (!url) return
  process.env.DATABASE_URL = url
  process.env.GOOGLE_MAPS_API_KEY = 'test-key-2-9'
  field = await import('@/lib/field/queries')
  expenses = await import('@/lib/field/expense-queries')
  assignments = await import('@/lib/assignments/queries')
  fuelJob = await import('@/lib/field/fuel-distance-job')

  const tx = db()
  await tx.$executeRawUnsafe(`
    INSERT INTO organizations (id, name, tax_id, address)
    VALUES ('${ORG_ID}', 'Phase29Test', '9999999999290', 'ที่อยู่ทดสอบ 2.9') ON CONFLICT (id) DO NOTHING
  `)
  await tx.$executeRawUnsafe(`
    INSERT INTO roles (id, organization_id, name, role_group, is_seed) VALUES
      ('${ROLE_MANAGER}', '${ORG_ID}', 'เจ้าหน้าที่อนุมัติเคส', 'inhouse', false),
      ('${ROLE_AGENT}', '${ORG_ID}', 'พนักงานติดตามทรัพย์', 'inhouse', false)
    ON CONFLICT (id) DO NOTHING
  `)
  await tx.$executeRawUnsafe(`
    INSERT INTO users (id, organization_id, role_id, email, full_name, status) VALUES
      ('${MANAGER_ID}', '${ORG_ID}', '${ROLE_MANAGER}', 'approver29@test.local', 'ผู้อนุมัติเคส 2.9', 'active'),
      ('${AGENT_A}', '${ORG_ID}', '${ROLE_AGENT}', 'agent29a@test.local', 'พนักงาน A 2.9', 'active'),
      ('${AGENT_B}', '${ORG_ID}', '${ROLE_AGENT}', 'agent29b@test.local', 'พนักงาน B 2.9', 'active'),
      ('${AGENT_FLAT}', '${ORG_ID}', '${ROLE_AGENT}', 'agent29f@test.local', 'พนักงาน F 2.9', 'active'),
      ('${AGENT_CAPPED}', '${ORG_ID}', '${ROLE_AGENT}', 'agent29c@test.local', 'พนักงาน C 2.9', 'active')
    ON CONFLICT (id) DO NOTHING
  `)
  await tx.$executeRawUnsafe(`
    INSERT INTO compensation_plans
      (id, organization_id, name, side, fuel_mode, fuel_rate_per_km_satang, fuel_max_per_case_satang,
       fuel_daily_flat_satang, allowance_satang, commission_satang, no_success_fee_satang,
       version, effective_from, is_current, created_by)
    VALUES
      ('${PLAN_PER_KM}', '${ORG_ID}', 'แผน PER_KM 2.9', 'inhouse', 'PER_KM', ${RATE_PER_KM_SATANG}, NULL, NULL,
       ${ALLOWANCE_SATANG}, ${COMMISSION_SATANG}, ${NO_SUCCESS_FEE_SATANG}, 1, DATE '2026-01-01', true, '${MANAGER_ID}'),
      ('${PLAN_DAILY_FLAT}', '${ORG_ID}', 'แผน DAILY_FLAT 2.9', 'inhouse', 'DAILY_FLAT', NULL, NULL, ${DAILY_FLAT_SATANG},
       ${ALLOWANCE_SATANG}, ${COMMISSION_SATANG}, ${NO_SUCCESS_FEE_SATANG}, 1, DATE '2026-01-01', true, '${MANAGER_ID}'),
      ('${PLAN_CAPPED}', '${ORG_ID}', 'แผน PER_KM มีเพดาน 2.9', 'inhouse', 'PER_KM', ${RATE_PER_KM_SATANG}, ${CAP_SATANG}, NULL,
       ${ALLOWANCE_SATANG}, ${COMMISSION_SATANG}, ${NO_SUCCESS_FEE_SATANG}, 1, DATE '2026-01-01', true, '${MANAGER_ID}')
    ON CONFLICT (id) DO NOTHING
  `)
  await tx.$executeRawUnsafe(`
    INSERT INTO teams (id, organization_id, name, side, provinces, status, compensation_plan_id, created_by) VALUES
      ('${TEAM_PER_KM}', '${ORG_ID}', 'ทีมคิดตามระยะ 2.9', 'inhouse', ARRAY['${PROVINCE}'], 'active', '${PLAN_PER_KM}', '${MANAGER_ID}'),
      ('${TEAM_DAILY_FLAT}', '${ORG_ID}', 'ทีมเหมารายวัน 2.9', 'inhouse', ARRAY['${PROVINCE}'], 'active', '${PLAN_DAILY_FLAT}', '${MANAGER_ID}'),
      ('${TEAM_CAPPED}', '${ORG_ID}', 'ทีมมีเพดานน้ำมัน 2.9', 'inhouse', ARRAY['${PROVINCE}'], 'active', '${PLAN_CAPPED}', '${MANAGER_ID}')
    ON CONFLICT (id) DO NOTHING
  `)
  await tx.$executeRawUnsafe(`
    UPDATE users SET team_id = CASE
      WHEN id = '${AGENT_FLAT}' THEN '${TEAM_DAILY_FLAT}'::uuid
      WHEN id = '${AGENT_CAPPED}' THEN '${TEAM_CAPPED}'::uuid
      ELSE '${TEAM_PER_KM}'::uuid END
    WHERE id IN ('${AGENT_A}', '${AGENT_B}', '${AGENT_FLAT}', '${AGENT_CAPPED}')
  `)
  await tx.$executeRawUnsafe(`
    INSERT INTO service_fee_templates
      (id, organization_id, name, model, base_satang, rate_pct, basis, charge_on_fail, version, is_current, created_by)
    VALUES ('${TEMPLATE_ID}', '${ORG_ID}', 'เทมเพลต 2.9', 'FLAT', 50000, 0, NULL, false, 1, true, '${MANAGER_ID}')
    ON CONFLICT (id) DO NOTHING
  `)
  await tx.$executeRawUnsafe(`
    INSERT INTO finance_companies (id, organization_id, name, short_name, tax_id, service_fee_template_id, created_by)
    VALUES ('${COMPANY_ID}', '${ORG_ID}', 'ไฟแนนซ์ 2.9', 'T29', '0105512900029', '${TEMPLATE_ID}', '${MANAGER_ID}')
    ON CONFLICT (id) DO NOTHING
  `)
})

afterAll(async () => {
  if (url) {
    await cleanupCases()
    await db().$executeRawUnsafe(`DELETE FROM payee_profiles WHERE organization_id = '${ORG_ID}'`)
  }
  await client?.$disconnect()
  vi.unstubAllGlobals()
})

afterEach(() => {
  vi.unstubAllGlobals()
})

let caseSeq = 0

async function seedApprovedCase(teamId: string): Promise<string> {
  caseSeq += 1
  const caseRef = `FL29-${caseSeq}`
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

/** เคสพร้อมปิดงาน: รับงาน → จัดวัน → จุดเริ่มเดินทาง → เช็คอิน n จุด */
async function seedReadyToClose(
  agent: SessionUser = agentA,
  teamId: string = TEAM_PER_KM,
  checkins: Array<{ latitude: number; longitude: number }> = [{ latitude: 18.5801, longitude: 99.0031 }],
): Promise<string> {
  const caseId = await seedApprovedCase(teamId)
  await assignments.assignCase(manager, caseId, { agentId: agent.id }, { actor: manager, meta })
  await field.acceptFieldCase(agent, caseId, { actor: agent, meta })
  await field.scheduleFieldCase(
    agent,
    caseId,
    { scheduleDate: new Date(`${DAY_1}T00:00:00.000Z`) },
    { actor: agent, meta },
  )
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
  for (const point of checkins) {
    await field.recordCheckin(
      agent,
      caseId,
      { latitude: point.latitude, longitude: point.longitude, checkinType: 'address' },
      { actor: agent, meta },
    )
  }
  return caseId
}

async function expensesOf(caseId: string) {
  return await db().expense.findMany({ where: { caseId }, orderBy: { expenseType: 'asc' } })
}

suite('Phase 2.9 — รายการเบิกอัตโนมัติตอนปิดงาน (`41` §6.6 · §20)', () => {
  beforeEach(cleanupCases)

  it('PER_KM: ระยะทางรวมทุกช่วงตามลำดับเวลา → fuel ตามสูตร `22` §6.1 + allowance ต่อวัน', async () => {
    const fetchMock = stubDistanceMatrix(6_000)
    const caseId = await seedReadyToClose(agentA, TEAM_PER_KM, [
      { latitude: 18.5801, longitude: 99.0031 },
      { latitude: 18.6002, longitude: 99.0102 },
    ])

    await field.closeFieldCase(agentA, caseId, { outcome: 'closed_success', ...MEDIA }, { actor: agentA, meta })

    // 2 เช็คอิน = 2 ช่วง (origin→1, 1→2) × 6 กม. = 12.00 กม. × ฿5 = ฿60.00
    expect(fetchMock).toHaveBeenCalledTimes(2)
    const rows = await expensesOf(caseId)
    const fuel = rows.find((row) => row.expenseType === 'fuel')
    const allowance = rows.find((row) => row.expenseType === 'allowance')

    expect(fuel?.grossSatang).toBe(6_000)
    expect(fuel?.distanceKm?.toString()).toBe('12')
    expect(fuel?.calculationSource).toBe('compensation_plan')
    expect(fuel?.compPlanId).toBe(PLAN_PER_KM)
    expect(fuel?.compPlanVersion).toBe(1)
    expect(allowance?.grossSatang).toBe(ALLOWANCE_SATANG)
    expect(allowance?.distanceKm).toBeNull()
  })

  it('เคสสำเร็จ = รายการเบิกรอคลังยืนยันเสมอ ห้ามข้ามไป pending_approval (`41` §20)', async () => {
    stubDistanceMatrix(1_000)
    const caseId = await seedReadyToClose()
    await field.closeFieldCase(agentA, caseId, { outcome: 'closed_success', ...MEDIA }, { actor: agentA, meta })

    const rows = await expensesOf(caseId)
    expect(rows).toHaveLength(2)
    expect(rows.every((row) => row.status === 'pending_warehouse_confirm')).toBe(true)
  })

  it('เคสไม่สำเร็จ = เข้าคิวอนุมัติทันที (`41` §20)', async () => {
    stubDistanceMatrix(1_000)
    const caseId = await seedReadyToClose()
    await field.closeFieldCase(
      agentA,
      caseId,
      { outcome: 'closed_fail', photos: ['p.jpg'], videos: ['v.mp4'], productPhotos: [] },
      { actor: agentA, meta },
    )

    const rows = await expensesOf(caseId)
    expect(rows.every((row) => row.status === 'pending_approval')).toBe(true)
  })

  it('ยอดน้ำมันชนเพดาน max_per_case = ตัดที่เพดาน (`41` §20)', async () => {
    stubDistanceMatrix(120_000)
    const caseId = await seedReadyToClose(agentCapped, TEAM_CAPPED)
    await field.closeFieldCase(agentCapped, caseId, { outcome: 'closed_success', ...MEDIA }, { actor: agentCapped, meta })

    const fuel = (await expensesOf(caseId)).find((row) => row.expenseType === 'fuel')
    // 120 กม. × ฿5 = ฿600 แต่เพดาน ฿400
    expect(fuel?.grossSatang).toBe(CAP_SATANG)
    expect(fuel?.distanceKm?.toString()).toBe('120')
  })

  it('ทีม DAILY_FLAT ไม่เรียก Distance Matrix เลยแม้แต่ครั้งเดียว (`41` §20)', async () => {
    const fetchMock = stubDistanceMatrix(9_999)
    const caseId = await seedReadyToClose(agentFlat, TEAM_DAILY_FLAT)
    await field.closeFieldCase(agentFlat, caseId, { outcome: 'closed_success', ...MEDIA }, { actor: agentFlat, meta })

    expect(fetchMock).not.toHaveBeenCalled()
    const fuel = (await expensesOf(caseId)).find((row) => row.expenseType === 'fuel')
    expect(fuel?.grossSatang).toBe(DAILY_FLAT_SATANG)
    expect(fuel?.distanceKm).toBeNull()
  })
})

suite('Phase 2.9 — D10: Google Maps ใช้ไม่ได้ตอนปิดงาน', () => {
  beforeEach(cleanupCases)

  it('ปิดงานสำเร็จเสมอ + ไม่มีรายการ fuel + ตั้ง job ไว้ แล้ว job สร้างให้ทีหลัง (ไม่ซ้ำ)', async () => {
    // ยิง 500 ทุกครั้ง = ปลายทางล่ม (retry แล้วยังไม่ได้)
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('down', { status: 500 })),
    )
    const caseId = await seedReadyToClose()
    const closed = await field.closeFieldCase(
      agentA,
      caseId,
      { outcome: 'closed_success', ...MEDIA },
      { actor: agentA, meta },
    )

    // ปิดงานต้องสำเร็จ — ห้ามล้มเพราะปลายทางภายนอก
    expect(closed.status).toBe('closed_success')
    const afterClose = await expensesOf(caseId)
    expect(afterClose.map((row) => row.expenseType)).toEqual(['allowance'])

    const assignmentId = afterClose[0]?.assignmentId ?? ''
    const job = await db().job.findFirstOrThrow({ where: { jobType: 'fuel_distance_retry', organizationId: ORG_ID } })
    expect(job.status).toBe('pending')
    expect((job.payload as { assignmentId?: string }).assignmentId).toBe(assignmentId)

    // ปลายทางกลับมา — job คำนวณแล้วสร้างรายการ fuel ที่ค้างไว้
    stubDistanceMatrix(10_000)
    const first = await fuelJob.runFuelDistanceRetryJob({ organizationId: ORG_ID })
    expect(first.created).toBe(1)

    const fuel = (await expensesOf(caseId)).find((row) => row.expenseType === 'fuel')
    expect(fuel?.grossSatang).toBe(5_000)
    expect(fuel?.status).toBe('pending_warehouse_confirm')

    // รันซ้ำต้องไม่สร้างรายการซ้ำ (`91` §17 — job ต้อง idempotent)
    const second = await fuelJob.runFuelDistanceRetryJob({ organizationId: ORG_ID })
    expect(second.created).toBe(0)
    expect((await expensesOf(caseId)).filter((row) => row.expenseType === 'fuel')).toHaveLength(1)
  })

  it('ยอดที่คำนวณได้เป็น 0 = ไม่สร้าง record (DEC-006/D6)', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('down', { status: 500 })),
    )
    const caseId = await seedReadyToClose()
    await field.closeFieldCase(agentA, caseId, { outcome: 'closed_success', ...MEDIA }, { actor: agentA, meta })

    // ระยะทาง 0 เมตร ⇒ ยอด 0 ⇒ ไม่มีแถว fuel
    stubDistanceMatrix(0)
    const result = await fuelJob.runFuelDistanceRetryJob({ organizationId: ORG_ID })
    expect(result.created).toBe(0)
    expect(result.skippedZero).toBe(1)
    expect((await expensesOf(caseId)).filter((row) => row.expenseType === 'fuel')).toHaveLength(0)
  })
})

suite('Phase 2.9 — 2 เส้นทางตีกลับ (`41` §10.1 ห้ามสลับ)', () => {
  beforeEach(cleanupCases)

  async function closeSuccessfully(): Promise<string> {
    stubDistanceMatrix(2_000)
    const caseId = await seedReadyToClose()
    await field.closeFieldCase(agentA, caseId, { outcome: 'closed_success', ...MEDIA }, { actor: agentA, meta })
    return caseId
  }

  it('reject_evidence → needs_revision โดย tracking_round ไม่เพิ่ม (`41` §20)', async () => {
    const caseId = await closeSuccessfully()
    const before = await db().caseAssignment.findFirstOrThrow({ where: { caseId } })

    const rejected = await field.rejectFieldEvidence(
      manager,
      caseId,
      { reason: 'ภาพหลักฐานไม่ชัด ตรวจสอบไม่ได้' },
      { actor: manager, meta },
    )

    expect(rejected.status).toBe('needs_revision')
    const after = await db().caseAssignment.findFirstOrThrow({ where: { id: before.id } })
    expect(after.trackingRound).toBe(before.trackingRound)
    const evidence = await db().caseEvidence.findFirstOrThrow({ where: { caseId }, orderBy: { submittedAt: 'desc' } })
    expect(evidence.status).toBe('rejected')
    expect(evidence.rejectReason).toBe('ภาพหลักฐานไม่ชัด ตรวจสอบไม่ได้')
  })

  it('resubmit_close โดยไม่แก้สื่อเลย = ปฏิเสธ (`41` §8)', async () => {
    const caseId = await closeSuccessfully()
    await field.rejectFieldEvidence(manager, caseId, { reason: 'ภาพไม่ชัดพอ' }, { actor: manager, meta })

    await expectCode(
      () => field.resubmitCloseCase(agentA, caseId, { ...MEDIA }, { actor: agentA, meta }),
      'CLOSE_NO_EVIDENCE_REVISION',
    )
  })

  it('resubmit_close → รายการเบิกเดิม superseded + สร้างชุดใหม่ ไม่ซ้ำไม่หาย (DoD)', async () => {
    const caseId = await closeSuccessfully()
    const before = await expensesOf(caseId)
    expect(before).toHaveLength(2)

    await field.rejectFieldEvidence(manager, caseId, { reason: 'ขอภาพเพิ่มอีกมุม' }, { actor: manager, meta })

    // ล้าง cache ระยะทางก่อน เพื่อให้รอบใหม่ยิง API จริง (ปกติช่วงเดิมใช้ค่าที่ cache ไว้ — ตั้งใจ)
    clearDistanceCache()
    stubDistanceMatrix(3_000)
    const resubmitted = await field.resubmitCloseCase(
      agentA,
      caseId,
      { photos: ['p1.jpg', 'p2-new.jpg'], videos: ['v1.mp4'], productPhotos: ['pp1.jpg'] },
      { actor: agentA, meta },
    )

    // สถานะกลับเป็น outcome เดิม (ห้ามเปลี่ยน outcome) และไม่เพิ่มรอบติดตาม
    expect(resubmitted.status).toBe('closed_success')
    const assignment = await db().caseAssignment.findFirstOrThrow({ where: { caseId } })
    expect(assignment.trackingRound).toBe(1)

    const all = await db().expense.findMany({ where: { caseId } })
    const superseded = all.filter((row) => row.status === 'superseded')
    const active = all.filter((row) => row.status !== 'superseded')

    expect(superseded).toHaveLength(2)
    expect(active).toHaveLength(2)
    // ไม่หาย: ของเดิมยังอยู่ครบและถูกผูกไปยังรายการใหม่
    expect(superseded.every((row) => row.supersededByExpenseId !== null)).toBe(true)
    expect(before.map((row) => row.id).sort()).toEqual(superseded.map((row) => row.id).sort())
    // ไม่ซ้ำ: ชุดใหม่มีชนิดละ 1 รายการ และคิดจากระยะทางใหม่ (3 กม. × ฿5 = ฿15)
    expect(active.map((row) => row.expenseType).sort()).toEqual(['allowance', 'fuel'])
    expect(active.find((row) => row.expenseType === 'fuel')?.grossSatang).toBe(1_500)
  })

  it('reject_expense แตะแค่รายการเบิก ไม่กระทบ assignment_status (`41` §20)', async () => {
    const caseId = await closeSuccessfully()
    // ผ่านขั้นคลังแล้วจึงตีกลับเอกสารได้ (`23` §6.3)
    await db().expense.updateMany({ where: { caseId }, data: { status: 'pending_approval' } })
    const target = (await expensesOf(caseId))[0]

    const rejected = await expenses.rejectFieldExpense(
      manager,
      target?.id ?? '',
      { reason: 'ใบเสร็จไม่ชัด อ่านยอดไม่ออก' },
      { actor: manager, meta },
    )

    expect(rejected.status).toBe('needs_revision')
    expect(rejected.rejectReason).toBe('ใบเสร็จไม่ชัด อ่านยอดไม่ออก')
    const assignment = await db().caseAssignment.findFirstOrThrow({ where: { caseId } })
    expect(assignment.status).toBe('closed_success')
  })

  it('resubmit_expense: เจ้าของแก้ได้ · คนอื่นแก้ไม่ได้ · กลับเข้า pending_approval ไม่ผ่านคลังซ้ำ', async () => {
    const caseId = await closeSuccessfully()
    await db().expense.updateMany({ where: { caseId }, data: { status: 'needs_revision' } })
    const target = (await expensesOf(caseId))[0]

    // พนักงานคนอื่นแก้แทนไม่ได้ (`41` §20) — ตอบแบบไม่ leak ว่ารายการนี้มีจริง
    await expectCode(
      () => expenses.resubmitFieldExpense(agentB, target?.id ?? '', {}, { actor: agentB, meta }),
      'EXPENSE_NOT_FOUND',
    )

    const resubmitted = await expenses.resubmitFieldExpense(
      agentA,
      target?.id ?? '',
      { note: 'แนบใบเสร็จใหม่แล้ว' },
      { actor: agentA, meta },
    )
    expect(resubmitted.status).toBe('pending_approval')
    expect(resubmitted.rejectReason).toBeNull()
  })
})

suite('Phase 2.9 — เบิกที่พัก + สรุปรายได้ (`41` §6.6 · §7.9 · §7.10)', () => {
  beforeEach(cleanupCases)

  it('เบิกที่พักสำเร็จ = pending_approval ทันที (ไม่ผ่านขั้นคลัง) + auto-mapping เคสวันเดียวกัน', async () => {
    stubDistanceMatrix(1_000)
    await seedReadyToClose()

    const claim = await expenses.submitHotelClaim(
      agentA,
      {
        expenseDate: new Date(`${DAY_1}T00:00:00.000Z`),
        amountSatang: 80_000,
        sharedWithUserId: AGENT_B,
        receiptFileUrl: 'field/receipts/hotel.jpg',
        note: null,
      },
      { actor: agentA, meta },
    )

    expect(claim.status).toBe('pending_approval')
    expect(claim.sharedWithUserId).toBe(AGENT_B)

    const list = await expenses.listFieldExpenses(agentA, { type: 'separate' })
    expect(list.items).toHaveLength(1)
    // เคสที่จัดวันตรงกับวันที่เบิก — ใช้ตรวจสอบเท่านั้น ไม่กระทบยอด
    expect(list.items[0]?.matchedCaseIds.length).toBeGreaterThan(0)
    expect(list.pendingSatang).toBe(80_000)
  })

  it('ผู้พักร่วมนอกทีมถูกปฏิเสธฝั่ง BE แม้ dropdown จะกรองแล้ว (`41` §20)', async () => {
    await expectCode(
      () =>
        expenses.submitHotelClaim(
          agentA,
          {
            expenseDate: new Date(`${DAY_1}T00:00:00.000Z`),
            amountSatang: 80_000,
            sharedWithUserId: AGENT_FLAT,
            receiptFileUrl: 'field/receipts/hotel.jpg',
            note: null,
          },
          { actor: agentA, meta },
        ),
      'HOTEL_CLAIM_INVALID_SHARED_AGENT',
    )
  })

  it('แท็บ "ผูกกับเคส" กับ "เบิกแยก" แยกกันจริง', async () => {
    stubDistanceMatrix(1_000)
    const caseId = await seedReadyToClose()
    await field.closeFieldCase(agentA, caseId, { outcome: 'closed_success', ...MEDIA }, { actor: agentA, meta })
    await expenses.submitHotelClaim(
      agentA,
      {
        expenseDate: new Date(`${DAY_1}T00:00:00.000Z`),
        amountSatang: 50_000,
        sharedWithUserId: null,
        receiptFileUrl: 'field/receipts/h2.jpg',
        note: null,
      },
      { actor: agentA, meta },
    )

    const caseBound = await expenses.listFieldExpenses(agentA, { type: 'caseBound' })
    const separate = await expenses.listFieldExpenses(agentA, { type: 'separate' })

    expect(caseBound.items.map((row) => row.expenseType).sort()).toEqual(['allowance', 'fuel'])
    expect(separate.items.map((row) => row.expenseType)).toEqual(['hotel'])
  })

  it('สรุปรายได้: สำเร็จได้คอมมิชชั่น · ไม่สำเร็จได้เบี้ยเสี่ยง (ค่าจากแผนที่ snapshot ไว้)', async () => {
    stubDistanceMatrix(1_000)
    const successCase = await seedReadyToClose()
    await field.closeFieldCase(agentA, successCase, { outcome: 'closed_success', ...MEDIA }, { actor: agentA, meta })

    const failCase = await seedReadyToClose()
    await field.closeFieldCase(
      agentA,
      failCase,
      { outcome: 'closed_fail', photos: ['p.jpg'], videos: ['v.mp4'], productPhotos: [] },
      { actor: agentA, meta },
    )

    const summary = await expenses.getIncomeSummary(agentA, {})
    expect(summary.successCount).toBe(1)
    expect(summary.failCount).toBe(1)
    expect(summary.commissionSatang).toBe(COMMISSION_SATANG)
    expect(summary.noSuccessFeeSatang).toBe(NO_SUCCESS_FEE_SATANG)
    expect(summary.items).toHaveLength(2)
  })
})
