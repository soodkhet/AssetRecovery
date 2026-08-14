import { PrismaPg } from '@prisma/adapter-pg'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { PrismaClient } from '@/lib/generated/prisma/client'
import type { SessionUser } from '@/lib/auth/types'

/**
 * เทสต์ระดับ DB ของ Phase 2.6 — DoD ตาม `40` §20:
 *  · assign ปกติ / ข้ามทีม / ซ้ำโดยไม่ผ่าน reassign
 *  · reassign 2 สาขา (ยังไม่ accepted = ทันที · accepted แล้ว = คำขอรอความยินยอม ไม่ freeze งาน)
 *  · ยินยอม / ไม่ยินยอม / **timeout job** — reassign สำเร็จต้องรีเซ็ตเป็น assigned + ล้าง accepted_at เสมอ
 *  · **การแข่งกันระหว่าง timeout job กับคำตอบที่มาช้า** (จุดที่ DoD ระบุไว้โดยเฉพาะ)
 *  · ยามหัวหน้าทีมตาม settings §6.4 + ข้อมูลประกอบการตัดสินใจ §6.2 + Kanban §7.5
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
  console.warn('[assignment-workflow.db.test] ข้ามเทสต์ระดับ DB — ไม่มี TEST_DATABASE_URL (ดู .env.example)')
}

const ORG_ID = '00000000-0000-4000-8000-0000000026a0'
const ROLE_MANAGER = '00000000-0000-4000-8000-0000000026a1'
const ROLE_AGENT = '00000000-0000-4000-8000-0000000026a2'
const MANAGER_ID = '00000000-0000-4000-8000-0000000026a3'
const AGENT_A = '00000000-0000-4000-8000-0000000026a4'
const AGENT_B = '00000000-0000-4000-8000-0000000026a5'
const AGENT_C = '00000000-0000-4000-8000-0000000026a6'
const TEAM_A = '00000000-0000-4000-8000-0000000026a7'
const TEAM_B = '00000000-0000-4000-8000-0000000026a8'
const COMPANY_ID = '00000000-0000-4000-8000-0000000026a9'
const TEMPLATE_ID = '00000000-0000-4000-8000-0000000026aa'
const PROVINCE = 'ลำปาง'
const OTHER_PROVINCE = 'พะเยา'

let client: PrismaClient | null = null
type Queries = typeof import('@/lib/assignments/queries')
type AgentQueries = typeof import('@/lib/assignments/agent-queries')
type TimeoutJob = typeof import('@/lib/assignments/timeout-job')
let queries: Queries
let agentQueries: AgentQueries
let timeoutJob: TimeoutJob

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
    fullName: 'ผู้ทดสอบ 2.6',
    status: 'active',
    roleId: ROLE_MANAGER,
    roleName: 'ผู้จัดการทีมติดตามทรัพย์',
    roleGroup: 'inhouse',
    isSuperadmin: false,
    teamId: null,
    companyId: null,
    capabilities: {},
    scope: { kind: 'team', teamIds: [TEAM_A, TEAM_B], companyId: null, userId: overrides.id },
    loginAt: new Date().toISOString(),
    ...overrides,
  }
}

const manager = sessionUser({ id: MANAGER_ID })
const supervisor = sessionUser({
  id: MANAGER_ID,
  roleName: 'หัวหน้าทีมติดตามทรัพย์',
  scope: { kind: 'team', teamIds: [TEAM_A], companyId: null, userId: MANAGER_ID },
})
const agentA = sessionUser({
  id: AGENT_A,
  roleId: ROLE_AGENT,
  roleName: 'พนักงานติดตามทรัพย์',
  teamId: TEAM_A,
  scope: { kind: 'self', teamIds: [], companyId: null, userId: AGENT_A },
})
const agentB = sessionUser({
  id: AGENT_B,
  roleId: ROLE_AGENT,
  roleName: 'พนักงานติดตามทรัพย์',
  teamId: TEAM_A,
  scope: { kind: 'self', teamIds: [], companyId: null, userId: AGENT_B },
})

function codeOf(error: unknown): string {
  return (error as { code?: string }).code ?? String(error)
}

async function expectCode(run: () => Promise<unknown>, code: string): Promise<void> {
  await expect(run()).rejects.toSatisfy(
    (error: unknown) => codeOf(error) === code,
    `ต้องได้ error code ${code}`,
  )
}

async function cleanupCases(): Promise<void> {
  const tx = db()
  await tx.$executeRawUnsafe(`DELETE FROM reassignment_history WHERE organization_id = '${ORG_ID}'`)
  await tx.$executeRawUnsafe(`DELETE FROM pending_reassignments WHERE organization_id = '${ORG_ID}'`)
  await tx.$executeRawUnsafe(`DELETE FROM case_assignments WHERE organization_id = '${ORG_ID}'`)
  await tx.$executeRawUnsafe(`DELETE FROM cases WHERE organization_id = '${ORG_ID}'`)
  await tx.$executeRawUnsafe(`DELETE FROM assignment_policy_settings WHERE organization_id = '${ORG_ID}'`)
}

beforeAll(async () => {
  if (!url) return
  process.env.DATABASE_URL = url
  queries = await import('@/lib/assignments/queries')
  agentQueries = await import('@/lib/assignments/agent-queries')
  timeoutJob = await import('@/lib/assignments/timeout-job')

  const tx = db()
  await tx.$executeRawUnsafe(`
    INSERT INTO organizations (id, name, tax_id, address)
    VALUES ('${ORG_ID}', 'Phase26Test', '9999999999260', 'ที่อยู่ทดสอบ 2.6') ON CONFLICT (id) DO NOTHING
  `)
  await tx.$executeRawUnsafe(`
    INSERT INTO roles (id, organization_id, name, role_group, is_seed) VALUES
      ('${ROLE_MANAGER}', '${ORG_ID}', 'ผู้จัดการทีมติดตามทรัพย์', 'inhouse', false),
      ('${ROLE_AGENT}', '${ORG_ID}', 'พนักงานติดตามทรัพย์', 'inhouse', false)
    ON CONFLICT (id) DO NOTHING
  `)
  // users ต้องมาก่อน teams (`teams.created_by` → users) แล้วค่อย UPDATE team_id ของพนักงานทีหลัง
  await tx.$executeRawUnsafe(`
    INSERT INTO users (id, organization_id, role_id, email, full_name, status) VALUES
      ('${MANAGER_ID}', '${ORG_ID}', '${ROLE_MANAGER}', 'manager26@test.local', 'ผู้จัดการ 2.6', 'active'),
      ('${AGENT_A}', '${ORG_ID}', '${ROLE_AGENT}', 'agent26a@test.local', 'พนักงาน A', 'active'),
      ('${AGENT_B}', '${ORG_ID}', '${ROLE_AGENT}', 'agent26b@test.local', 'พนักงาน B', 'active'),
      ('${AGENT_C}', '${ORG_ID}', '${ROLE_AGENT}', 'agent26c@test.local', 'พนักงาน C', 'active')
    ON CONFLICT (id) DO NOTHING
  `)
  await tx.$executeRawUnsafe(`
    INSERT INTO teams (id, organization_id, name, side, provinces, status, created_by) VALUES
      ('${TEAM_A}', '${ORG_ID}', 'ทีม A 2.6', 'inhouse', ARRAY['${PROVINCE}','${OTHER_PROVINCE}'], 'active', '${MANAGER_ID}'),
      ('${TEAM_B}', '${ORG_ID}', 'ทีม B 2.6', 'outsource', ARRAY['${OTHER_PROVINCE}'], 'active', '${MANAGER_ID}')
    ON CONFLICT (id) DO NOTHING
  `)
  await tx.$executeRawUnsafe(`
    UPDATE users SET team_id = CASE WHEN id = '${AGENT_C}' THEN '${TEAM_B}'::uuid ELSE '${TEAM_A}'::uuid END
    WHERE id IN ('${AGENT_A}', '${AGENT_B}', '${AGENT_C}')
  `)
  await tx.$executeRawUnsafe(`
    INSERT INTO service_fee_templates
      (id, organization_id, name, model, base_satang, rate_pct, basis, charge_on_fail, version, is_current, created_by)
    VALUES ('${TEMPLATE_ID}', '${ORG_ID}', 'เทมเพลต 2.6', 'FLAT', 50000, 0, NULL, false, 1, true, '${MANAGER_ID}')
    ON CONFLICT (id) DO NOTHING
  `)
  await tx.$executeRawUnsafe(`
    INSERT INTO finance_companies (id, organization_id, name, short_name, tax_id, service_fee_template_id, created_by)
    VALUES ('${COMPANY_ID}', '${ORG_ID}', 'ไฟแนนซ์ 2.6', 'T26', '0105512600026', '${TEMPLATE_ID}', '${MANAGER_ID}')
    ON CONFLICT (id) DO NOTHING
  `)
})

afterAll(async () => {
  if (url) await cleanupCases()
  await client?.$disconnect()
})

let caseSeq = 0

/** เคสที่ผ่านการอนุมัติแล้ว (`case.approved` = `ready_to_assign` ของไฟล์ 40) */
async function seedApprovedCase(options?: { teamId?: string; province?: string }): Promise<string> {
  caseSeq += 1
  const caseRef = `AS26-${caseSeq}`
  const rows = await db().$queryRawUnsafe<{ id: string }[]>(`
    INSERT INTO cases (
      organization_id, case_ref, case_ref_normalized, company_id, source, status, created_by,
      debtor_name, addr_province, asset_description, debt_amount_satang, assigned_team_id
    ) VALUES (
      '${ORG_ID}', $$${caseRef}$$, $$${caseRef}$$, '${COMPANY_ID}', 'manual', 'approved', '${MANAGER_ID}',
      'ลูกหนี้ ${caseSeq}', '${options?.province ?? PROVINCE}', 'iPhone 15', 1000000,
      '${options?.teamId ?? TEAM_A}'
    ) RETURNING id
  `)
  return rows[0]?.id ?? ''
}

suite('Phase 2.6 — assign / accept (`40` §8 · §20)', () => {
  beforeEach(cleanupCases)

  it('มอบหมายปกติ: สถานะเป็น assigned + บันทึกผู้มอบหมาย/เวลา + ลง audit', async () => {
    const caseId = await seedApprovedCase()
    const result = await queries.assignCase(manager, caseId, { agentId: AGENT_A }, { actor: manager, meta })

    expect(result.state).toBe('assigned')
    expect(result.agentId).toBe(AGENT_A)
    expect(result.acceptedAt).toBeNull()
    expect(result.events).toEqual(['assignment.created'])

    const audit = await db().auditLog.findFirst({
      where: { organizationId: ORG_ID, targetType: 'case_assignments', targetId: result.assignmentId },
    })
    expect(audit?.actorId).toBe(MANAGER_ID)
    expect(audit?.action).toBe('create')
  })

  it('มอบหมายข้ามทีม = ASSIGNMENT_TEAM_MISMATCH (แม้ผู้จัดการดูแลทีมนั้นด้วย)', async () => {
    const caseId = await seedApprovedCase({ teamId: TEAM_A })
    await expectCode(
      () => queries.assignCase(manager, caseId, { agentId: AGENT_C }, { actor: manager, meta }),
      'ASSIGNMENT_TEAM_MISMATCH',
    )
  })

  it('มอบหมายซ้ำโดยไม่ผ่าน reassign = ASSIGNMENT_ALREADY_EXISTS', async () => {
    const caseId = await seedApprovedCase()
    await queries.assignCase(manager, caseId, { agentId: AGENT_A }, { actor: manager, meta })
    await expectCode(
      () => queries.assignCase(manager, caseId, { agentId: AGENT_B }, { actor: manager, meta }),
      'ASSIGNMENT_ALREADY_EXISTS',
    )
  })

  it('พนักงานกดรับงานได้เฉพาะเคสของตัวเอง แล้วสถานะเป็น accepted', async () => {
    const caseId = await seedApprovedCase()
    await queries.assignCase(manager, caseId, { agentId: AGENT_A }, { actor: manager, meta })

    await expectCode(() => queries.acceptAssignment(agentB, caseId, { actor: agentB, meta }), 'CASE_NOT_FOUND')

    const accepted = await queries.acceptAssignment(agentA, caseId, { actor: agentA, meta })
    expect(accepted.state).toBe('accepted')
    expect(accepted.acceptedAt).not.toBeNull()

    // กดรับซ้ำไม่ได้ (สถานะเปลี่ยนไปแล้ว)
    await expectCode(
      () => queries.acceptAssignment(agentA, caseId, { actor: agentA, meta }),
      'ASSIGNMENT_INVALID_STATUS',
    )
  })
})

suite('Phase 2.6 — reassign 2 สาขา (`40` §9 · §11 · §20)', () => {
  beforeEach(cleanupCases)

  it('ยังไม่กดรับ: เปลี่ยนทันที + ลง reassignment_history (consented, was_accepted=false)', async () => {
    const caseId = await seedApprovedCase()
    await queries.assignCase(manager, caseId, { agentId: AGENT_A }, { actor: manager, meta })

    const result = await queries.reassignCase(
      manager,
      caseId,
      { agentId: AGENT_B, reason: 'ย้ายพื้นที่รับผิดชอบ' },
      { actor: manager, meta },
    )
    expect(result.state).toBe('assigned')
    expect(result.agentId).toBe(AGENT_B)
    expect(result.pendingReassignment).toBeNull()

    const history = await db().reassignmentHistory.findMany({ where: { caseId } })
    expect(history).toHaveLength(1)
    expect(history[0]?.resolution).toBe('consented')
    expect(history[0]?.wasAcceptedBeforeReassign).toBe(false)
    expect(history[0]?.pendingReassignmentId).toBeNull()

    // ไม่มีคำขอรอความยินยอมเกิดขึ้นเลยในสาขานี้
    expect(await db().pendingReassignment.count({ where: { caseId } })).toBe(0)
  })

  it('ไม่กรอกเหตุผล = ASSIGNMENT_REASON_REQUIRED', async () => {
    const caseId = await seedApprovedCase()
    await queries.assignCase(manager, caseId, { agentId: AGENT_A }, { actor: manager, meta })
    await expectCode(
      () => queries.reassignCase(manager, caseId, { agentId: AGENT_B, reason: '   ' }, { actor: manager, meta }),
      'ASSIGNMENT_REASON_REQUIRED',
    )
  })

  it('กดรับแล้ว: สร้างคำขอรอความยินยอม — เคสยังเป็นของคนเดิมและไม่ถูก freeze', async () => {
    const caseId = await seedApprovedCase()
    await queries.assignCase(manager, caseId, { agentId: AGENT_A }, { actor: manager, meta })
    await queries.acceptAssignment(agentA, caseId, { actor: agentA, meta })

    const result = await queries.reassignCase(
      manager,
      caseId,
      { agentId: AGENT_B, reason: 'ลูกค้าขอเปลี่ยนคน' },
      { actor: manager, meta },
    )

    expect(result.state).toBe('accepted')
    expect(result.agentId).toBe(AGENT_A)
    expect(result.acceptedAt).not.toBeNull()
    expect(result.pendingReassignment?.newAgentId).toBe(AGENT_B)
    expect(result.events).toEqual(['assignment.reassignment_requested'])

    // ส่งคำขอซ้ำระหว่างที่คำขอเดิมยังรอผลไม่ได้ (partial unique เป็นตัวบังคับจริง)
    await expectCode(
      () =>
        queries.reassignCase(manager, caseId, { agentId: AGENT_B, reason: 'ขอซ้ำ' }, { actor: manager, meta }),
      'REASSIGNMENT_ALREADY_PENDING',
    )
  })

  it('ยินยอม: เปลี่ยนคนทันที ล้าง accepted_at และรีเซ็ตกลับ assigned', async () => {
    const caseId = await seedApprovedCase()
    await queries.assignCase(manager, caseId, { agentId: AGENT_A }, { actor: manager, meta })
    await queries.acceptAssignment(agentA, caseId, { actor: agentA, meta })
    await queries.reassignCase(
      manager,
      caseId,
      { agentId: AGENT_B, reason: 'สลับพื้นที่' },
      { actor: manager, meta },
    )

    const result = await queries.respondReassignment(agentA, caseId, { decision: 'consent' }, { actor: agentA, meta })
    expect(result.state).toBe('assigned')
    expect(result.agentId).toBe(AGENT_B)
    expect(result.acceptedAt).toBeNull()

    const history = await db().reassignmentHistory.findFirst({ where: { caseId } })
    expect(history?.resolution).toBe('consented')
    expect(history?.wasAcceptedBeforeReassign).toBe(true)
    expect(await db().pendingReassignment.count({ where: { caseId, status: 'consented' } })).toBe(1)
  })

  it('ไม่ยินยอม: ต้องมีเหตุผล และเคสไม่เปลี่ยนแปลงอะไรเลย', async () => {
    const caseId = await seedApprovedCase()
    await queries.assignCase(manager, caseId, { agentId: AGENT_A }, { actor: manager, meta })
    await queries.acceptAssignment(agentA, caseId, { actor: agentA, meta })
    await queries.reassignCase(manager, caseId, { agentId: AGENT_B, reason: 'สลับงาน' }, { actor: manager, meta })

    await expectCode(
      () => queries.respondReassignment(agentA, caseId, { decision: 'decline' }, { actor: agentA, meta }),
      'DECLINE_REASON_REQUIRED',
    )

    const result = await queries.respondReassignment(
      agentA,
      caseId,
      { decision: 'decline', declineReason: 'กำลังลงพื้นที่เคสนี้อยู่' },
      { actor: agentA, meta },
    )
    expect(result.state).toBe('accepted')
    expect(result.agentId).toBe(AGENT_A)
    expect(result.acceptedAt).not.toBeNull()
    expect(await db().reassignmentHistory.count({ where: { caseId } })).toBe(0)

    const pending = await db().pendingReassignment.findFirst({ where: { caseId } })
    expect(pending?.status).toBe('declined')
    expect(pending?.declineReason).toBe('กำลังลงพื้นที่เคสนี้อยู่')
  })

  it('คนอื่นตอบคำขอแทนไม่ได้ = PERMISSION_DENIED', async () => {
    const caseId = await seedApprovedCase()
    await queries.assignCase(manager, caseId, { agentId: AGENT_A }, { actor: manager, meta })
    await queries.acceptAssignment(agentA, caseId, { actor: agentA, meta })
    await queries.reassignCase(manager, caseId, { agentId: AGENT_B, reason: 'สลับงาน' }, { actor: manager, meta })

    // ผู้จัดการเห็นเคสได้ (scope ทีม) แต่ไม่ใช่ผู้ถือเคส ⇒ ตอบแทนไม่ได้
    await expectCode(
      () => queries.respondReassignment(manager, caseId, { decision: 'consent' }, { actor: manager, meta }),
      'PERMISSION_DENIED',
    )
  })
})

suite('Phase 2.6 — timeout job + การแข่งกับคำตอบที่มาช้า (`40` §8 · §12 · DoD)', () => {
  beforeEach(cleanupCases)

  /** ดัน `expires_at` ให้เลยกำหนดโดยไม่ต้องรอเวลาจริง */
  async function expireLatestRequest(caseId: string): Promise<void> {
    await db().$executeRawUnsafe(`
      UPDATE pending_reassignments
      SET expires_at = NOW() - INTERVAL '1 minute', requested_at = NOW() - INTERVAL '4 hours'
      WHERE case_id = '${caseId}' AND status = 'waiting_consent'
    `)
  }

  async function seedWaitingRequest(): Promise<string> {
    const caseId = await seedApprovedCase()
    await queries.assignCase(manager, caseId, { agentId: AGENT_A }, { actor: manager, meta })
    await queries.acceptAssignment(agentA, caseId, { actor: agentA, meta })
    await queries.reassignCase(
      manager,
      caseId,
      { agentId: AGENT_B, reason: 'พนักงานเดิมติดภารกิจ' },
      { actor: manager, meta },
    )
    return caseId
  }

  it('ไม่ตอบจนหมดเวลา: job มอบให้คนใหม่อัตโนมัติ (timeout_auto) + ล้าง accepted_at', async () => {
    const caseId = await seedWaitingRequest()
    await expireLatestRequest(caseId)

    const result = await timeoutJob.resolveExpiredReassignments({ organizationId: ORG_ID, jobId: 'test-job-1' })
    expect(result.resolved).toBe(1)
    expect(result.caseIds).toContain(caseId)

    const assignments = await db().caseAssignment.findMany({ where: { caseId }, orderBy: { createdAt: 'asc' } })
    expect(assignments).toHaveLength(2)
    expect(assignments[0]?.status).toBe('reassigned')
    expect(assignments[1]?.agentId).toBe(AGENT_B)
    expect(assignments[1]?.status).toBe('pending')
    expect(assignments[1]?.acceptedAt).toBeNull()

    const history = await db().reassignmentHistory.findFirst({ where: { caseId } })
    expect(history?.resolution).toBe('timeout_auto')
    expect(history?.wasAcceptedBeforeReassign).toBe(true)

    // actor = ระบบ ⇒ audit ต้องมี reason ที่ระบุ job id (`90` §13)
    const audit = await db().auditLog.findFirst({
      where: { organizationId: ORG_ID, actorId: null, targetType: 'case_assignments' },
      orderBy: { createdAt: 'desc' },
    })
    expect(audit?.reason).toContain('test-job-1')
  })

  it('job รันซ้ำแล้วผลไม่เปลี่ยน (idempotent — `91` §17)', async () => {
    const caseId = await seedWaitingRequest()
    await expireLatestRequest(caseId)

    await timeoutJob.resolveExpiredReassignments({ organizationId: ORG_ID })
    const second = await timeoutJob.resolveExpiredReassignments({ organizationId: ORG_ID })

    expect(second.due).toBe(0)
    expect(second.resolved).toBe(0)
    expect(await db().caseAssignment.count({ where: { caseId } })).toBe(2)
    expect(await db().reassignmentHistory.count({ where: { caseId } })).toBe(1)
  })

  it('ตอบหลัง job resolve ไปแล้ว = REASSIGNMENT_ALREADY_TIMED_OUT (ไม่เขียนทับผลของ job)', async () => {
    const caseId = await seedWaitingRequest()
    await expireLatestRequest(caseId)
    await timeoutJob.resolveExpiredReassignments({ organizationId: ORG_ID })

    await expectCode(
      () => queries.respondReassignment(agentA, caseId, { decision: 'decline', declineReason: 'ขอไม่ย้าย' }, {
        actor: agentA,
        meta,
      }),
      'REASSIGNMENT_ALREADY_TIMED_OUT',
    )

    const pending = await db().pendingReassignment.findFirst({ where: { caseId } })
    expect(pending?.status).toBe('timeout_auto')
    expect(pending?.declineReason).toBeNull()
    expect(await db().reassignmentHistory.count({ where: { caseId } })).toBe(1)
  })

  it('ตอบหลัง expires_at แต่ job ยังไม่ทันรัน = ปฏิเสธด้วย code เดียวกัน แล้ว job ทำงานต่อได้ปกติ', async () => {
    const caseId = await seedWaitingRequest()
    await expireLatestRequest(caseId)

    await expectCode(
      () => queries.respondReassignment(agentA, caseId, { decision: 'consent' }, { actor: agentA, meta }),
      'REASSIGNMENT_ALREADY_TIMED_OUT',
    )

    const stillWaiting = await db().pendingReassignment.findFirst({ where: { caseId } })
    expect(stillWaiting?.status).toBe('waiting_consent')

    const result = await timeoutJob.resolveExpiredReassignments({ organizationId: ORG_ID })
    expect(result.resolved).toBe(1)
  })

  it('เคสที่ยังไม่หมดเวลา job ต้องไม่แตะ (เคสยังเป็นของคนเดิม)', async () => {
    const caseId = await seedWaitingRequest()

    const result = await timeoutJob.resolveExpiredReassignments({ organizationId: ORG_ID })
    expect(result.due).toBe(0)

    const assignment = await db().caseAssignment.findFirst({ where: { caseId, status: 'accepted' } })
    expect(assignment?.agentId).toBe(AGENT_A)
  })
})

suite('Phase 2.6 — ยามสิทธิ์ + ข้อมูลประกอบการตัดสินใจ (`40` §6.2 · §6.4 · §7.5)', () => {
  beforeEach(cleanupCases)

  it('หัวหน้าทีมทำ assign ได้เมื่อ settings เปิด (default) และถูกปฏิเสธเมื่อปิด', async () => {
    const caseId = await seedApprovedCase()
    await queries.assignCase(supervisor, caseId, { agentId: AGENT_A }, { actor: supervisor, meta })

    await db().$executeRawUnsafe(`
      INSERT INTO assignment_policy_settings (organization_id, supervisor_can_assign_inhouse)
      VALUES ('${ORG_ID}', false)
      ON CONFLICT (organization_id) DO UPDATE SET supervisor_can_assign_inhouse = false
    `)

    const other = await seedApprovedCase()
    await expectCode(
      () => queries.assignCase(supervisor, other, { agentId: AGENT_A }, { actor: supervisor, meta }),
      'PERMISSION_DENIED',
    )
    // ผู้จัดการไม่ถูกคุมด้วยค่านี้
    await queries.assignCase(manager, other, { agentId: AGENT_B }, { actor: manager, meta })
  })

  it('หัวหน้าทีมเข้าถึงทีมที่ไม่ได้สังกัดไม่ได้ = PERMISSION_DENIED', async () => {
    await expectCode(() => agentQueries.listTeamAgents(supervisor, TEAM_B), 'PERMISSION_DENIED')
  })

  it('active_case_count / success_rate / covered_provinces ตรงกับข้อมูลจริง', async () => {
    const held = await seedApprovedCase()
    await queries.assignCase(manager, held, { agentId: AGENT_A }, { actor: manager, meta })

    const closed = await seedApprovedCase()
    await queries.assignCase(manager, closed, { agentId: AGENT_A }, { actor: manager, meta })
    await db().$executeRawUnsafe(`
      UPDATE cases SET status = 'closed_success', outcome = 'closed_success', closed_at = NOW()
      WHERE id = '${closed}'
    `)

    const result = await agentQueries.listTeamAgents(manager, TEAM_A)
    const agent = result.agents.find((each) => each.agentId === AGENT_A)
    expect(agent?.activeCaseCount).toBe(1)
    expect(agent?.successRate).toBe(50)
    expect(agent?.coveredProvinces).toContain(PROVINCE)

    const idle = result.agents.find((each) => each.agentId === AGENT_B)
    expect(idle?.activeCaseCount).toBe(0)
    expect(idle?.successRate).toBeNull()
  })

  it('Kanban: กรองจังหวัดแล้วคอลัมน์ของพนักงานยังอยู่ (ไม่ซ่อนคอลัมน์)', async () => {
    const inProvince = await seedApprovedCase({ province: PROVINCE })
    await queries.assignCase(manager, inProvince, { agentId: AGENT_A }, { actor: manager, meta })

    const board = await agentQueries.getTeamKanban(manager, TEAM_A, { province: OTHER_PROVINCE })
    expect(board.columns.map((column) => column.agentId)).toEqual(
      expect.arrayContaining([AGENT_A, AGENT_B]),
    )
    const columnA = board.columns.find((column) => column.agentId === AGENT_A)
    expect(columnA?.cases).toHaveLength(0)
    // ตัวเลข workload บนหัวคอลัมน์นับเคสที่ถืออยู่จริง ไม่ใช่จำนวนการ์ดหลังกรอง
    expect(columnA?.activeCaseCount).toBe(1)

    const unfiltered = await agentQueries.getTeamKanban(manager, TEAM_A, {})
    expect(unfiltered.columns.find((column) => column.agentId === AGENT_A)?.cases).toHaveLength(1)
  })

  it('รายการมอบหมายกรองตามสถานะได้ และแสดง badge คำขอที่รอผล', async () => {
    const assigned = await seedApprovedCase()
    await queries.assignCase(manager, assigned, { agentId: AGENT_A }, { actor: manager, meta })

    const accepted = await seedApprovedCase()
    await queries.assignCase(manager, accepted, { agentId: AGENT_B }, { actor: manager, meta })
    await queries.acceptAssignment(agentB, accepted, { actor: agentB, meta })
    await queries.reassignCase(
      manager,
      accepted,
      { agentId: AGENT_A, reason: 'สลับผู้รับผิดชอบ' },
      { actor: manager, meta },
    )

    const list = await queries.listAssignments(manager, { page: 1, limit: 50 })
    const acceptedItem = list.items.find((item) => item.caseId === accepted)
    expect(acceptedItem?.state).toBe('accepted')
    expect(acceptedItem?.pendingReassignment?.newAgentId).toBe(AGENT_A)
    expect(acceptedItem?.teamSide).toBe('inhouse')

    const onlyAssigned = await queries.listAssignments(manager, { page: 1, limit: 50, status: 'assigned' })
    expect(onlyAssigned.items.map((item) => item.caseId)).toEqual([assigned])
    // filter สถานะต้องทำที่ DB — ไม่งั้น total/pagination ไม่ตรงกับรายการที่เห็น
    expect(onlyAssigned.total).toBe(1)

    const readyToAssign = await queries.listAssignments(manager, { page: 1, limit: 50, status: 'ready_to_assign' })
    expect(readyToAssign.items).toHaveLength(0)
    expect(readyToAssign.total).toBe(0)
  })
})
