import { PrismaPg } from '@prisma/adapter-pg'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { advanceExcessSource } from '@/lib/advances/advance'
import type { SessionUser } from '@/lib/auth/types'
import { PrismaClient } from '@/lib/generated/prisma/client'
import { markAdvancePaidOut } from '@/tests/helpers/advance-paid-out'

vi.mock('@/lib/uploads/storage', async () => (await import('@/tests/helpers/fake-uploads')).fakeStorageModule())
vi.mock('@/lib/uploads/verify', async () => (await import('@/tests/helpers/fake-uploads')).fakeVerifyModule())

/**
 * mytester DO-07 (มติ 13/10/2569) — ช่อง "อ้างอิงเคส (ไม่บังคับ)" ของเงินทดรอง (`advances.case_id`)
 *  · อ้างอิงเคสที่ผู้รับเงินรับผิดชอบอยู่ได้ ⇒ DTO มีเลขเคส + audit มี `case_id`
 *  · เคสของคนอื่น / งานปิดแล้ว / เคสถูกลบ ⇒ `CASE_NOT_FOUND` (404 ไม่ leak) และไม่มีแถวเงินทดรองเกิด
 *  · ขอแทนผู้อื่น: เคสต้องเป็นของผู้รับเงิน (ไม่ใช่ของผู้บันทึก)
 *  · ตัวเลือกเคสของฟอร์ม = งานค้างของตัวเองเท่านั้น
 *  · ใช้เกินยอด ⇒ คำขอเบิกส่วนเกินมีเลขเคสในหมายเหตุ แต่ **ไม่ผูก `expenses.case_id`** (ไม่ค้างเกตรายได้ของเคส)
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
if (!url) console.warn('[advance-case-ref.db.test] ข้ามเทสต์ระดับ DB — ไม่มี TEST_DATABASE_URL (ดู .env.example)')

const ORG_ID = '00000000-0000-4000-8000-0000000d0700'
const ROLE_FINANCE = '00000000-0000-4000-8000-0000000d0701'
const ROLE_AGENT = '00000000-0000-4000-8000-0000000d0702'
const FINANCE_ID = '00000000-0000-4000-8000-0000000d0703'
const AGENT_ID = '00000000-0000-4000-8000-0000000d0704'
const AGENT_2_ID = '00000000-0000-4000-8000-0000000d0705'
const TEAM_ID = '00000000-0000-4000-8000-0000000d0706'
const TEMPLATE_ID = '00000000-0000-4000-8000-0000000d0707'
const COMPANY_ID = '00000000-0000-4000-8000-0000000d0708'

let client: PrismaClient | null = null
let advances: typeof import('@/lib/advances/queries')

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
    fullName: 'ผู้ทดสอบ DO-07',
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

const finance = sessionUser({
  id: FINANCE_ID,
  roleId: ROLE_FINANCE,
  roleName: 'การเงิน',
  roleGroup: 'system',
  teamId: null,
  capabilities: { approve_advance: 'manage', request_advance: 'view' },
  scope: { kind: 'global', teamIds: [], companyId: null, userId: FINANCE_ID },
})
const agent = sessionUser({ id: AGENT_ID, capabilities: { request_advance: 'manage' } })
const agent2 = sessionUser({ id: AGENT_2_ID, capabilities: { request_advance: 'manage' } })
const ctx = (actor: SessionUser) => ({ actor, meta })

function input(caseId: string | null, payeeId: string | null = null) {
  return {
    requestedSatang: 300_000,
    purpose: 'เดินทางไปติดตามทรัพย์ต่างจังหวัด',
    payeeId,
    caseId,
    dueClearDate: new Date(`${new Date(Date.now() + 7 * 86_400_000).toISOString().slice(0, 10)}T00:00:00Z`),
  }
}

async function expectCode(run: () => Promise<unknown>, code: string): Promise<void> {
  await expect(run()).rejects.toSatisfy(
    (error: unknown) => (error as { code?: string }).code === code,
    `ต้องได้ error code ${code}`,
  )
}

let caseSeq = 0

/** เคส + งานของพนักงาน (สถานะงานกำหนดได้) — คืน id เคส + เลขสัญญา */
async function seedCase(agentId: string, assignmentStatus: string): Promise<{ id: string; caseRef: string }> {
  caseSeq += 1
  const caseRef = `DO07-${caseSeq}-${Date.now()}`
  const rows = await db().$queryRawUnsafe<{ id: string }[]>(`
    INSERT INTO cases (
      organization_id, case_ref, case_ref_normalized, company_id, source, status, created_by,
      debtor_name, addr_province, addr_district, asset_kind, asset_description, debt_amount_satang, assigned_team_id
    ) VALUES (
      '${ORG_ID}', $$${caseRef}$$, $$${caseRef}$$, '${COMPANY_ID}', 'manual', 'active', '${FINANCE_ID}',
      'ลูกหนี้ ${caseSeq}', 'ลำพูน', 'เมือง', 'smartphone', 'iPhone 15', 1000000, '${TEAM_ID}'
    ) RETURNING id
  `)
  const id = rows[0]?.id ?? ''
  await db().$executeRawUnsafe(`
    INSERT INTO case_assignments (organization_id, case_id, agent_id, team_id, status, created_by)
    VALUES ('${ORG_ID}', '${id}', '${agentId}', '${TEAM_ID}', '${assignmentStatus}', '${FINANCE_ID}')
  `)
  return { id, caseRef }
}

async function reset(): Promise<void> {
  const tx = db()
  for (const table of [
    'notifications',
    'notification_outbox',
    'payout_batch_items',
    'payout_batches',
    'advances',
    'expenses',
    'case_assignments',
    'cases',
    'payee_profiles',
  ]) {
    await tx.$executeRawUnsafe(`DELETE FROM ${table} WHERE organization_id = '${ORG_ID}'`)
  }
}

beforeAll(async () => {
  if (!url) return
  process.env.DATABASE_URL = url
  advances = await import('@/lib/advances/queries')
  const tx = db()
  await tx.$executeRawUnsafe(`
    INSERT INTO organizations (id, name, tax_id, address)
    VALUES ('${ORG_ID}', 'DO07Test', '9999999907000', 'ที่อยู่ทดสอบ DO-07') ON CONFLICT (id) DO NOTHING
  `)
  await tx.$executeRawUnsafe(`
    INSERT INTO roles (id, organization_id, name, role_group, is_seed) VALUES
      ('${ROLE_FINANCE}', '${ORG_ID}', 'การเงิน DO07', 'system', false),
      ('${ROLE_AGENT}', '${ORG_ID}', 'พนักงาน DO07', 'inhouse', false)
    ON CONFLICT (id) DO NOTHING
  `)
  await tx.$executeRawUnsafe(`
    INSERT INTO users (id, organization_id, role_id, email, full_name, status) VALUES
      ('${FINANCE_ID}', '${ORG_ID}', '${ROLE_FINANCE}', 'finance-do07@test.local', 'การเงิน DO07', 'active'),
      ('${AGENT_ID}', '${ORG_ID}', '${ROLE_AGENT}', 'agent-do07@test.local', 'พนักงาน DO07', 'active'),
      ('${AGENT_2_ID}', '${ORG_ID}', '${ROLE_AGENT}', 'agent2-do07@test.local', 'พนักงานสอง DO07', 'active')
    ON CONFLICT (id) DO NOTHING
  `)
  await tx.$executeRawUnsafe(`
    INSERT INTO teams (id, organization_id, name, side, provinces, status, created_by)
    VALUES ('${TEAM_ID}', '${ORG_ID}', 'ทีม DO07', 'inhouse', ARRAY['ลำพูน'], 'active', '${FINANCE_ID}')
    ON CONFLICT (id) DO NOTHING
  `)
  await tx.$executeRawUnsafe(`UPDATE users SET team_id = '${TEAM_ID}' WHERE id IN ('${AGENT_ID}', '${AGENT_2_ID}')`)
  await tx.$executeRawUnsafe(`
    INSERT INTO finance_policy_settings (organization_id) VALUES ('${ORG_ID}') ON CONFLICT (organization_id) DO NOTHING
  `)
  await tx.$executeRawUnsafe(`
    INSERT INTO service_fee_templates
      (id, organization_id, name, model, base_satang, rate_pct, basis, fail_fee_satang, version, is_current, created_by)
    VALUES ('${TEMPLATE_ID}', '${ORG_ID}', 'เทมเพลต DO07', 'FLAT', 50000, 0, NULL, NULL, 1, true, '${FINANCE_ID}')
    ON CONFLICT (id) DO NOTHING
  `)
  await tx.$executeRawUnsafe(`
    INSERT INTO finance_companies (id, organization_id, name, short_name, tax_id, service_fee_template_id, created_by)
    VALUES ('${COMPANY_ID}', '${ORG_ID}', 'ไฟแนนซ์ DO07', 'D07', '0105512307001', '${TEMPLATE_ID}', '${FINANCE_ID}')
    ON CONFLICT (id) DO NOTHING
  `)
})

afterAll(async () => {
  if (url) await reset()
  await client?.$disconnect()
})

beforeEach(async () => {
  if (url) await reset()
})

suite('เงินทดรองอ้างอิงเคส (mytester DO-07)', () => {
  it('อ้างอิงเคสที่ตัวเองรับผิดชอบอยู่ได้ ⇒ DTO/รายการมีเลขเคส · audit บันทึก case_id', async () => {
    const own = await seedCase(AGENT_ID, 'scheduled')
    const created = await advances.createAdvance(ctx(agent), input(own.id))
    expect(created.caseId).toBe(own.id)
    expect(created.caseRef).toBe(own.caseRef)

    const listed = await advances.listAdvances(finance, { status: 'all' })
    expect(listed.find((row) => row.id === created.id)?.caseRef).toBe(own.caseRef)

    const audit = await db().auditLog.findFirstOrThrow({
      where: { organizationId: ORG_ID, targetId: created.id, action: 'create' },
      select: { afterData: true },
    })
    expect(audit.afterData).toMatchObject({ case_id: own.id })
  })

  it('ไม่อ้างอิงเคส (เว้นว่าง) ⇒ caseRef = null เหมือนเดิม', async () => {
    const created = await advances.createAdvance(ctx(agent), input(null))
    expect(created.caseId).toBeNull()
    expect(created.caseRef).toBeNull()
  })

  it('เคสของพนักงานคนอื่น / งานปิดแล้ว / เคสถูกลบ ⇒ CASE_NOT_FOUND และไม่มีเงินทดรองเกิด', async () => {
    const theirs = await seedCase(AGENT_2_ID, 'scheduled')
    const closed = await seedCase(AGENT_ID, 'closed_success')
    const removed = await seedCase(AGENT_ID, 'accepted_unscheduled')
    await db().$executeRawUnsafe(`UPDATE cases SET deleted_at = NOW() WHERE id = '${removed.id}'`)

    for (const target of [theirs, closed, removed]) {
      await expectCode(() => advances.createAdvance(ctx(agent), input(target.id)), 'CASE_NOT_FOUND')
    }
    expect(await db().advance.count({ where: { organizationId: ORG_ID } })).toBe(0)
  })

  it('ขอแทนผู้อื่น: เคสต้องเป็นของผู้รับเงิน — เคสของผู้รับผ่าน · เคสของคนอื่นไม่ผ่าน', async () => {
    const agentCase = await seedCase(AGENT_ID, 'pending_accept')
    const otherCase = await seedCase(AGENT_2_ID, 'scheduled')
    // ให้ผู้รับมี payee ก่อน (ขอให้ตัวเองครั้งแรกสร้าง payee ให้อัตโนมัติ)
    const seeded = await advances.createAdvance(ctx(agent), input(null))
    await advances.rejectAdvance(ctx(finance), seeded.id, { rejectionReason: 'ทดสอบสร้างผู้รับเงิน' })

    const onBehalf = await advances.createAdvance(ctx(finance), input(agentCase.id, seeded.payeeId))
    expect(onBehalf.caseRef).toBe(agentCase.caseRef)
    await expectCode(
      () => advances.createAdvance(ctx(finance), input(otherCase.id, seeded.payeeId)),
      'CASE_NOT_FOUND',
    )
  })

  it('ตัวเลือกเคสของฟอร์ม = งานค้างของตัวเองเท่านั้น (ไม่รวมงานปิด/ของคนอื่น)', async () => {
    const active = await seedCase(AGENT_ID, 'accepted_unscheduled')
    const revision = await seedCase(AGENT_ID, 'needs_revision')
    await seedCase(AGENT_ID, 'closed_fail')
    const theirs = await seedCase(AGENT_2_ID, 'scheduled')

    const options = await advances.listAdvanceCaseOptions(agent)
    expect(options.map((option) => option.caseRef).sort()).toEqual([active.caseRef, revision.caseRef].sort())
    expect((await advances.listAdvanceCaseOptions(agent2)).map((option) => option.caseRef)).toEqual([theirs.caseRef])
  })

  it('ใช้เกินยอด ⇒ คำขอเบิกส่วนเกินมีเลขเคสในหมายเหตุ แต่ไม่ผูก expenses.case_id', async () => {
    const own = await seedCase(AGENT_ID, 'scheduled')
    const created = await advances.createAdvance(ctx(agent), input(own.id))
    await advances.approveAdvance(ctx(finance), created.id, { approvedSatang: null, note: null })
    await markAdvancePaidOut(db(), { organizationId: ORG_ID, advanceId: created.id, actorId: FINANCE_ID })

    const settled = await advances.settleAdvance(ctx(agent), created.id, {
      usedSatang: 350_000,
      receiptFileUrl: `expenses/receipt-do07-${Date.now()}.pdf`,
      note: null,
    })
    expect(settled.excessClaimId).not.toBeNull()
    const claim = await db().expense.findUniqueOrThrow({
      where: { id: settled.excessClaimId ?? '' },
      select: { caseId: true, revisionNote: true },
    })
    expect(claim.caseId).toBeNull()
    expect(advanceExcessSource(claim.revisionNote)).toEqual({ advanceNumber: created.ref, caseRef: own.caseRef })
  })
})
