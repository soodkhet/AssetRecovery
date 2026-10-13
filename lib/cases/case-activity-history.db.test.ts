import { PrismaPg } from '@prisma/adapter-pg'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { SessionUser } from '@/lib/auth/types'
import { PrismaClient } from '@/lib/generated/prisma/client'

/**
 * ประวัติเคสมีเหตุการณ์หลังรับเคส (`38` v3.21 — ข้อสังเกต mytester "ประวัติเคสหยุดที่รับเคส")
 *  · `getCase()` ภายใน ⇒ `activityHistory` จาก audit ของงานภาคสนาม (มอบหมาย → รับงาน → จัดวัน → ปิดงานไม่สำเร็จ
 *    → เปลี่ยนผู้รับผิดชอบ) เรียงเวลา · ชื่อพนักงานถูกแปลจาก id · audit ที่ไม่ใช่เหตุการณ์สำคัญ (สลับลำดับ) ไม่แสดง
 *  · ฝั่งบริษัทไฟแนนซ์ ⇒ `activityHistory = []` เสมอ (ไม่หลุดชื่อพนักงาน/เหตุผลภายใน)
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
if (!url) console.warn('[case-activity-history.db.test] ข้ามเทสต์ระดับ DB — ไม่มี TEST_DATABASE_URL (ดู .env.example)')

const ORG_ID = '00000000-0000-4000-8000-0000000ca710'
const ROLE_ID = '00000000-0000-4000-8000-0000000ca711'
const ADMIN_ID = '00000000-0000-4000-8000-0000000ca712'
const AGENT_ID = '00000000-0000-4000-8000-0000000ca713'
const AGENT_2_ID = '00000000-0000-4000-8000-0000000ca714'
const TEAM_ID = '00000000-0000-4000-8000-0000000ca715'
const TEMPLATE_ID = '00000000-0000-4000-8000-0000000ca716'
const COMPANY_ID = '00000000-0000-4000-8000-0000000ca717'

let client: PrismaClient | null = null

function db(): PrismaClient {
  if (!url) throw new Error('ไม่มี TEST_DATABASE_URL')
  if (!client) {
    assertLocalTestDatabase(url)
    client = new PrismaClient({ adapter: new PrismaPg({ connectionString: url }) })
  }
  return client
}

const admin: SessionUser = {
  id: ADMIN_ID,
  organizationId: ORG_ID,
  supabaseUid: 'uid-ca712',
  email: 'admin-ca7@test.local',
  fullName: 'แอดมิน CA7',
  status: 'active',
  roleId: ROLE_ID,
  roleName: 'ทดสอบประวัติเคส',
  roleGroup: 'system',
  isSuperadmin: true,
  teamId: null,
  companyId: null,
  capabilities: {},
  scope: { kind: 'global', teamIds: [], companyId: null, userId: ADMIN_ID },
  loginAt: new Date().toISOString(),
}

async function cleanup(): Promise<void> {
  const tx = db()
  await tx.$executeRawUnsafe(`DELETE FROM case_assignments WHERE organization_id = '${ORG_ID}'`)
  await tx.$executeRawUnsafe(`DELETE FROM cases WHERE organization_id = '${ORG_ID}'`)
}

async function audit(input: {
  action: string
  assignmentId: string
  before?: unknown
  after: unknown
  reason?: string | null
  at: string
}): Promise<void> {
  await db().$executeRawUnsafe(
    `INSERT INTO audit_logs (organization_id, actor_id, actor_role, action, target_type, target_id, before_data, after_data, reason, created_at)
     VALUES ('${ORG_ID}', '${ADMIN_ID}', 'ทดสอบ', '${input.action}', 'case_assignments', '${input.assignmentId}',
             $1::jsonb, $2::jsonb, $3, '${input.at}')`,
    input.before === undefined ? null : JSON.stringify(input.before),
    JSON.stringify(input.after),
    input.reason ?? null,
  )
}

beforeAll(async () => {
  if (!url) return
  process.env.DATABASE_URL = url
  const tx = db()
  await tx.$executeRawUnsafe(`
    INSERT INTO organizations (id, name, tax_id, address)
    VALUES ('${ORG_ID}', 'CaseActivityTest', '9999999971000', 'ที่อยู่ทดสอบ') ON CONFLICT (id) DO NOTHING
  `)
  await tx.$executeRawUnsafe(`
    INSERT INTO roles (id, organization_id, name, role_group, is_seed)
    VALUES ('${ROLE_ID}', '${ORG_ID}', 'ทดสอบประวัติเคส', 'system', false) ON CONFLICT (id) DO NOTHING
  `)
  await tx.$executeRawUnsafe(`
    INSERT INTO users (id, organization_id, role_id, email, full_name, status) VALUES
      ('${ADMIN_ID}', '${ORG_ID}', '${ROLE_ID}', 'admin-ca7@test.local', 'แอดมิน CA7', 'active'),
      ('${AGENT_ID}', '${ORG_ID}', '${ROLE_ID}', 'agent-ca7@test.local', 'สมชาย ภาคสนาม', 'active'),
      ('${AGENT_2_ID}', '${ORG_ID}', '${ROLE_ID}', 'agent2-ca7@test.local', 'สมศรี ภาคสนาม', 'active')
    ON CONFLICT (id) DO NOTHING
  `)
  await tx.$executeRawUnsafe(`
    INSERT INTO teams (id, organization_id, name, side, provinces, status, created_by)
    VALUES ('${TEAM_ID}', '${ORG_ID}', 'ทีม CA7', 'inhouse', ARRAY['ลำพูน'], 'active', '${ADMIN_ID}')
    ON CONFLICT (id) DO NOTHING
  `)
  await tx.$executeRawUnsafe(`
    INSERT INTO service_fee_templates
      (id, organization_id, name, model, base_satang, rate_pct, basis, fail_fee_satang, version, is_current, created_by)
    VALUES ('${TEMPLATE_ID}', '${ORG_ID}', 'เทมเพลต CA7', 'FLAT', 50000, 0, NULL, NULL, 1, true, '${ADMIN_ID}')
    ON CONFLICT (id) DO NOTHING
  `)
  await tx.$executeRawUnsafe(`
    INSERT INTO finance_companies (id, organization_id, name, short_name, tax_id, service_fee_template_id, created_by)
    VALUES ('${COMPANY_ID}', '${ORG_ID}', 'ไฟแนนซ์ CA7', 'CA7', '0105512371001', '${TEMPLATE_ID}', '${ADMIN_ID}')
    ON CONFLICT (id) DO NOTHING
  `)
  await cleanup()
})

afterAll(async () => {
  if (url) await cleanup()
  await client?.$disconnect()
})

suite('ประวัติเคส — เหตุการณ์หลังรับเคส', () => {
  it('ภายในเห็นมอบหมาย → รับงาน → จัดวัน → ปิดไม่สำเร็จ → เปลี่ยนผู้รับผิดชอบ · บริษัทไฟแนนซ์ได้รายการว่าง', async () => {
    const caseRef = `CA7-${Date.now()}`
    const cases = await db().$queryRawUnsafe<{ id: string }[]>(`
      INSERT INTO cases (
        organization_id, case_ref, case_ref_normalized, company_id, source, status, created_by,
        debtor_name, addr_province, addr_district, asset_kind, asset_description, debt_amount_satang, assigned_team_id
      ) VALUES (
        '${ORG_ID}', $$${caseRef}$$, $$${caseRef}$$, '${COMPANY_ID}', 'manual', 'active', '${ADMIN_ID}',
        'ลูกหนี้ CA7', 'ลำพูน', 'เมือง', 'smartphone', 'iPhone 15', 1000000, '${TEAM_ID}'
      ) RETURNING id
    `)
    const caseId = cases[0]?.id ?? ''
    const first = await db().$queryRawUnsafe<{ id: string }[]>(`
      INSERT INTO case_assignments (organization_id, case_id, agent_id, team_id, status, created_by)
      VALUES ('${ORG_ID}', '${caseId}', '${AGENT_ID}', '${TEAM_ID}', 'reassigned_away', '${ADMIN_ID}') RETURNING id
    `)
    const firstId = first[0]?.id ?? ''

    await audit({ action: 'create', assignmentId: firstId, after: { agentId: AGENT_ID, status: 'pending_accept', trackingRound: 1, events: ['assignment.created'] }, at: '2026-10-11T02:00:00Z' })
    await audit({ action: 'status_change', assignmentId: firstId, after: { status: 'accepted_unscheduled', events: ['assignment.accepted'] }, at: '2026-10-11T03:00:00Z' })
    await audit({ action: 'status_change', assignmentId: firstId, after: { status: 'scheduled', scheduledDate: '2026-10-12T00:00:00.000Z', events: ['case.scheduled'] }, at: '2026-10-11T04:00:00Z' })
    await audit({ action: 'update', assignmentId: firstId, after: { events: ['case.reordered'] }, at: '2026-10-11T04:30:00Z' })
    await audit({ action: 'status_change', assignmentId: firstId, after: { status: 'closed_fail', failReason: 'other' }, at: '2026-10-12T05:00:00Z' })
    await audit({
      action: 'update',
      assignmentId: firstId,
      before: { agentId: AGENT_ID, status: 'closed_fail' },
      after: { agentId: AGENT_2_ID, status: 'reassigned_away', newAssignmentId: firstId, events: ['assignment.reassigned'] },
      reason: 'ย้ายพื้นที่รับผิดชอบ',
      at: '2026-10-12T06:00:00Z',
    })

    const { getCase } = await import('@/lib/cases/queries')
    const internal = await getCase(admin, caseId)
    expect(internal.activityHistory.map((entry) => entry.label)).toEqual([
      'มอบหมายงานให้ สมชาย ภาคสนาม',
      'สมชาย ภาคสนาม รับงาน',
      'จัดวันลงพื้นที่ 12/10/2569',
      'ปิดงานไม่สำเร็จ',
      'เปลี่ยนผู้รับผิดชอบ สมชาย ภาคสนาม → สมศรี ภาคสนาม',
    ])
    expect(internal.activityHistory.at(-1)).toMatchObject({ note: 'ย้ายพื้นที่รับผิดชอบ', actorName: 'แอดมิน CA7' })

    const companyUser: SessionUser = {
      ...admin,
      isSuperadmin: false,
      scope: { kind: 'company', teamIds: [], companyId: COMPANY_ID, userId: ADMIN_ID },
    }
    const external = await getCase(companyUser, caseId)
    expect(external.activityHistory).toEqual([])
  })

  it('audit เกินเพดาน ⇒ เหตุการณ์ล่าสุดยังแสดง (ตัดของเก่าทิ้ง ไม่ใช่ของใหม่)', async () => {
    const { getCase, CASE_ACTIVITY_AUDIT_LIMIT } = await import('@/lib/cases/queries')
    const caseRef = `CA7L-${Date.now()}`
    const cases = await db().$queryRawUnsafe<{ id: string }[]>(`
      INSERT INTO cases (
        organization_id, case_ref, case_ref_normalized, company_id, source, status, created_by,
        debtor_name, addr_province, addr_district, asset_kind, asset_description, debt_amount_satang, assigned_team_id
      ) VALUES (
        '${ORG_ID}', $$${caseRef}$$, $$${caseRef}$$, '${COMPANY_ID}', 'manual', 'active', '${ADMIN_ID}',
        'ลูกหนี้ CA7L', 'ลำพูน', 'เมือง', 'smartphone', 'iPhone 15', 1000000, '${TEAM_ID}'
      ) RETURNING id
    `)
    const caseId = cases[0]?.id ?? ''
    const rows = await db().$queryRawUnsafe<{ id: string }[]>(`
      INSERT INTO case_assignments (organization_id, case_id, agent_id, team_id, status, created_by)
      VALUES ('${ORG_ID}', '${caseId}', '${AGENT_ID}', '${TEAM_ID}', 'closed_fail', '${ADMIN_ID}') RETURNING id
    `)
    const assignmentId = rows[0]?.id ?? ''

    await audit({ action: 'create', assignmentId, after: { agentId: AGENT_ID, status: 'pending_accept', trackingRound: 1, events: ['assignment.created'] }, at: '2026-10-01T02:00:00Z' })
    // audit ที่ไม่แสดงบนประวัติ (สลับลำดับ) จำนวนเท่าเพดาน — เก่ากว่าเหตุการณ์ปิดงาน
    await db().$executeRawUnsafe(
      `INSERT INTO audit_logs (organization_id, actor_id, actor_role, action, target_type, target_id, after_data, created_at)
       SELECT '${ORG_ID}', '${ADMIN_ID}', 'ทดสอบ', 'update', 'case_assignments', '${assignmentId}',
              '{"events":["case.reordered"]}'::jsonb, TIMESTAMPTZ '2026-10-02T00:00:00Z' + (n * INTERVAL '1 second')
       FROM generate_series(1, ${CASE_ACTIVITY_AUDIT_LIMIT}) AS n`,
    )
    await audit({ action: 'status_change', assignmentId, after: { status: 'closed_fail', failReason: 'other' }, at: '2026-10-05T05:00:00Z' })

    const internal = await getCase(admin, caseId)
    expect(internal.activityHistory.map((entry) => entry.label)).toContain('ปิดงานไม่สำเร็จ')
    expect(internal.activityHistory.at(-1)?.label).toBe('ปิดงานไม่สำเร็จ')
  })
})
