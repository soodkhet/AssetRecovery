import { PrismaPg } from '@prisma/adapter-pg'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import type { SessionUser } from '@/lib/auth/types'
import { PrismaClient } from '@/lib/generated/prisma/client'
import { clearReportCache } from '@/lib/reports/cache'
import { findReport } from '@/lib/reports/catalog'
import type { ReportPayload, ReportRow } from '@/lib/reports/payload'
import { resolveReportRange } from '@/lib/reports/range'

/**
 * เทสต์ระดับ DB ของ **รายงานหมวด O (O1–O5)** — DoD ของ `96` §13/§14
 *
 *  - O1: เคส open ไม่ถูกนับใน success/fail (% คิดจากเคสที่ปิดแล้วเท่านั้น)
 *  - O2: TAT ข้ามเดือนนับ calendar days ถูกต้อง · เกณฑ์ SLA มาจากค่าตั้งองค์กร (D18) ไม่ hardcode
 *  - O3: นับเคสไม่ซ้ำ · งานที่โอนออกไปแล้วไม่เป็นภาระของคนเดิม
 *  - O4: `created_at + slaAlertHours < now` (ครบพอดียังไม่เกิน) · เคสที่ปิดแล้วไม่อยู่ในรายงาน
 *  - O5: ยอดตามสถานะเครื่อง ณ ปัจจุบัน + ส่งมอบแล้วนับจากล็อตที่ยืนยันในช่วง
 *  - Permission: **ผู้จัดการเห็นเฉพาะทีมตัวเอง** · **การเงินเรียกหมวด O ต้อง 403**
 *
 * ทุกเทสต์เดินผ่าน `runReport()` ตัวจริง ⇒ ครอบทั้งยามสิทธิ์ + คีย์แคช + provider พร้อมกัน
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
  console.warn('[operations-reports.db.test] ข้ามเทสต์ระดับ DB — ไม่มี TEST_DATABASE_URL (ดู .env.example)')
}

const ORG_ID = '00000000-0000-4000-8000-0000000063a0'
const ROLE_MANAGER = '00000000-0000-4000-8000-0000000063a1'
const MANAGER_ID = '00000000-0000-4000-8000-0000000063a2'
const TEAM_A = '00000000-0000-4000-8000-0000000063a3'
const TEAM_B = '00000000-0000-4000-8000-0000000063a4'
const COMPANY_A = '00000000-0000-4000-8000-0000000063a5'
const COMPANY_B = '00000000-0000-4000-8000-0000000063a6'
const ROLE_AGENT = '00000000-0000-4000-8000-0000000063a7'
const AGENT_A = '00000000-0000-4000-8000-0000000063a8'
const AGENT_B = '00000000-0000-4000-8000-0000000063a9'
const EXEC_ID = '00000000-0000-4000-8000-0000000063b0'
const FINANCE_ID = '00000000-0000-4000-8000-0000000063b1'

/** วันอ้างอิงของทุกเทสต์ — 15 สิงหาคม 2569 เวลาไทยเที่ยงวัน */
const NOW = new Date('2026-08-15T05:00:00Z')
const RANGE = resolveReportRange({ preset: 'this_month' }, NOW)

let client: PrismaClient | null = null
type RunModule = typeof import('@/lib/reports/run')
let runner: RunModule

function db(): PrismaClient {
  if (!url) throw new Error('ไม่มี TEST_DATABASE_URL')
  if (!client) {
    assertLocalTestDatabase(url)
    client = new PrismaClient({ adapter: new PrismaPg({ connectionString: url }) })
  }
  return client
}

const baseUser = {
  organizationId: ORG_ID,
  status: 'active' as const,
  isSuperadmin: false,
  companyId: null,
  loginAt: NOW.toISOString(),
}

/** ฝ่ายบริหาร — เห็นทุกทีม (`96` §10) */
const exec: SessionUser = {
  ...baseUser,
  id: EXEC_ID,
  supabaseUid: 'uid-exec-63',
  email: 'exec63@test.local',
  fullName: 'ผู้บริหาร 6.3',
  roleId: ROLE_MANAGER,
  roleName: 'ผู้บริหาร',
  roleGroup: 'system',
  teamId: null,
  capabilities: { approve_expense_executive: 'manage' },
  scope: { kind: 'global', teamIds: [], companyId: null, userId: EXEC_ID },
}

/** ผู้จัดการทีม A — หมวด O ผูกกับ capability ของสายติดตามทรัพย์ (`25` §7.2) + scope ระดับทีม */
const manager: SessionUser = {
  ...baseUser,
  id: MANAGER_ID,
  supabaseUid: 'uid-manager-63',
  email: 'manager63@test.local',
  fullName: 'ผู้จัดการ 6.3',
  roleId: ROLE_MANAGER,
  roleName: 'ผู้จัดการทีม',
  roleGroup: 'inhouse',
  teamId: TEAM_A,
  capabilities: { assign_case: 'manage' },
  scope: { kind: 'team', teamIds: [TEAM_A], companyId: null, userId: MANAGER_ID },
}

/** ผู้จัดการที่ยังไม่ถูกผูกกับทีมใดเลย — ต้องเห็น "ว่าง" ไม่ใช่ "ทุกทีม" (`96` §10) */
const managerWithoutTeam: SessionUser = {
  ...manager,
  scope: { kind: 'team', teamIds: [], companyId: null, userId: MANAGER_ID },
}

/** ฝ่ายการเงิน — ไม่มีสิทธิ์หมวด O ตาม §10 */
const finance: SessionUser = {
  ...baseUser,
  id: FINANCE_ID,
  supabaseUid: 'uid-finance-63',
  email: 'finance63@test.local',
  fullName: 'การเงิน 6.3',
  roleId: ROLE_MANAGER,
  roleName: 'การเงิน',
  roleGroup: 'system',
  teamId: null,
  capabilities: { manage_billing: 'manage' },
  scope: { kind: 'global', teamIds: [], companyId: null, userId: FINANCE_ID },
}

async function run(
  reportId: string,
  params: Record<string, string> = {},
  user: SessionUser = exec,
): Promise<ReportPayload> {
  const report = findReport(reportId)
  if (report === null) throw new Error(`ไม่รู้จักรายงาน ${reportId}`)
  return runner.runReport(user, report, { range: RANGE, refresh: true, params, now: NOW })
}

const rowBy = (payload: ReportPayload, key: string, value: string): ReportRow | undefined =>
  payload.rows.find((row) => row[key] === value)
const kpiOf = (payload: ReportPayload, key: string): unknown => payload.kpis.find((kpi) => kpi.key === key)?.value

// ── seed helpers ────────────────────────────────────────────────────────────

let seq = 0

async function seedCase(options: {
  companyId?: string
  teamId?: string | null
  status?: 'active' | 'approved' | 'pending_review' | 'closed_success' | 'closed_fail' | 'draft' | 'rejected'
  createdAt?: string
  closedAt?: string | null
  projectedRevenueSatang?: number | null
}): Promise<string> {
  seq += 1
  const caseRef = `OPS63-${seq}-${Date.now()}`
  const status = options.status ?? 'closed_success'
  const closed = status === 'closed_success' || status === 'closed_fail'
  const teamId = options.teamId === null ? 'NULL' : `'${options.teamId ?? TEAM_A}'`
  const closedAt = options.closedAt === null ? 'NULL' : `'${options.closedAt ?? '2026-08-10T03:00:00Z'}'`
  const projected =
    options.projectedRevenueSatang === null || options.projectedRevenueSatang === undefined
      ? 'NULL'
      : String(options.projectedRevenueSatang)

  const rows = await db().$queryRawUnsafe<{ id: string }[]>(`
    INSERT INTO cases (
      organization_id, case_ref, case_ref_normalized, company_id, source, status, created_by, created_at,
      debtor_name, addr_province, addr_district, asset_kind, asset_description,
      debt_amount_satang, assigned_team_id, outcome, closed_at, projected_revenue_satang
    ) VALUES (
      '${ORG_ID}', $$${caseRef}$$, $$${caseRef}$$, '${options.companyId ?? COMPANY_A}', 'manual',
      '${status}', '${EXEC_ID}', '${options.createdAt ?? '2026-08-05T03:00:00Z'}',
      'ลูกหนี้ ${seq}', 'เชียงใหม่', 'เมือง', 'smartphone', 'iPhone 15',
      1000000, ${teamId}, ${closed ? `'${status}'` : 'NULL'}, ${closed ? closedAt : 'NULL'}, ${projected}
    ) RETURNING id
  `)
  return rows[0]?.id ?? ''
}

async function seedAssignment(options: {
  caseId: string
  agentId?: string
  teamId?: string
  status?: 'pending_accept' | 'scheduled' | 'closed_success' | 'closed_fail' | 'reassigned_away'
  createdAt?: string
}): Promise<void> {
  await db().$executeRawUnsafe(`
    INSERT INTO case_assignments (organization_id, case_id, agent_id, team_id, status, created_by, created_at)
    VALUES ('${ORG_ID}', '${options.caseId}', '${options.agentId ?? AGENT_A}', '${options.teamId ?? TEAM_A}',
            '${options.status ?? 'scheduled'}', '${EXEC_ID}', '${options.createdAt ?? '2026-08-05T03:00:00Z'}')
  `)
}

async function seedLot(options: { companyId?: string; confirmedAt: string | null }): Promise<string> {
  seq += 1
  const pending = options.confirmedAt === null
  // `lot_number`/`doc_ref` เป็น UNIQUE **ทั้งตาราง** (`02` §9) ⇒ ต้องไม่ซ้ำข้ามการรันเทสต์
  const suffix = `${seq}-${Date.now()}`
  const rows = await db().$queryRawUnsafe<{ id: string }[]>(`
    INSERT INTO handover_lots (organization_id, company_id, lot_number, doc_ref, type, status,
                               confirmed_at, confirmed_by, created_by)
    VALUES ('${ORG_ID}', '${options.companyId ?? COMPANY_A}', 'LOT-2569-63${suffix}', 'DLV-2569-63${suffix}',
            'we_deliver', '${pending ? 'pending_attach' : 'confirmed'}',
            ${pending ? 'NULL' : `'${options.confirmedAt}'`}, ${pending ? 'NULL' : `'${EXEC_ID}'`}, '${EXEC_ID}')
    RETURNING id
  `)
  return rows[0]?.id ?? ''
}

async function seedAsset(options: {
  caseId: string
  companyId?: string
  assetStatus: 'pending_intake' | 'intake_rejected' | 'in_custody' | 'handover_pending' | 'handed_over'
  lotId?: string
}): Promise<void> {
  seq += 1
  await db().$executeRawUnsafe(`
    INSERT INTO assets (organization_id, case_id, company_id, lot_id, case_ref, debtor_name, device_desc,
                        imei_contract, asset_status, closed_at, created_by)
    VALUES ('${ORG_ID}', '${options.caseId}', '${options.companyId ?? COMPANY_A}',
            ${options.lotId === undefined ? 'NULL' : `'${options.lotId}'`},
            'OPS63-ASSET-${seq}', 'ลูกหนี้ ${seq}', 'iPhone 15', '86000000000${String(seq).padStart(4, '0')}',
            '${options.assetStatus}', '2026-08-10T03:00:00Z', '${EXEC_ID}')
  `)
}

async function setSlaAlertHours(hours: number): Promise<void> {
  await db().$executeRawUnsafe(`
    INSERT INTO assignment_policy_settings (organization_id, sla_alert_hours)
    VALUES ('${ORG_ID}', ${hours})
    ON CONFLICT (organization_id) DO UPDATE SET sla_alert_hours = ${hours}
  `)
}

async function cleanup(): Promise<void> {
  const tx = db()
  // ล็อตที่ยืนยันแล้วถูก trigger กัน DELETE (`02` §13) — ปิด trigger เฉพาะตอนล้างข้อมูลเทสต์ (แนวเดียวกับ 2.13)
  await tx.$executeRawUnsafe(`ALTER TABLE handover_lots DISABLE TRIGGER trg_handover_lots_confirmed_no_delete`)
  try {
    await tx.$executeRawUnsafe(`DELETE FROM assets WHERE organization_id = '${ORG_ID}'`)
    await tx.$executeRawUnsafe(`DELETE FROM handover_lots WHERE organization_id = '${ORG_ID}'`)
    await tx.$executeRawUnsafe(`DELETE FROM case_assignments WHERE organization_id = '${ORG_ID}'`)
    await tx.$executeRawUnsafe(`DELETE FROM cases WHERE organization_id = '${ORG_ID}'`)
    await tx.$executeRawUnsafe(`DELETE FROM assignment_policy_settings WHERE organization_id = '${ORG_ID}'`)
  } finally {
    await tx.$executeRawUnsafe(`ALTER TABLE handover_lots ENABLE TRIGGER trg_handover_lots_confirmed_no_delete`)
  }
  clearReportCache()
}

beforeAll(async () => {
  if (!url) return
  process.env.DATABASE_URL = url
  runner = await import('@/lib/reports/run')

  const tx = db()
  await tx.$executeRawUnsafe(`
    INSERT INTO organizations (id, name, tax_id, address)
    VALUES ('${ORG_ID}', 'Phase63Test', '9999999996300', 'ที่อยู่ทดสอบ 6.3') ON CONFLICT (id) DO NOTHING
  `)
  await tx.$executeRawUnsafe(`
    INSERT INTO roles (id, organization_id, name, role_group, is_seed) VALUES
      ('${ROLE_MANAGER}', '${ORG_ID}', 'ผู้จัดการ 6.3', 'system', false),
      ('${ROLE_AGENT}', '${ORG_ID}', 'พนักงาน 6.3', 'outsource', false)
    ON CONFLICT (id) DO NOTHING
  `)
  await tx.$executeRawUnsafe(`
    INSERT INTO users (id, organization_id, role_id, email, full_name, status) VALUES
      ('${EXEC_ID}', '${ORG_ID}', '${ROLE_MANAGER}', 'exec63@test.local', 'ผู้บริหาร 6.3', 'active'),
      ('${MANAGER_ID}', '${ORG_ID}', '${ROLE_MANAGER}', 'manager63@test.local', 'ผู้จัดการ 6.3', 'active'),
      ('${FINANCE_ID}', '${ORG_ID}', '${ROLE_MANAGER}', 'finance63@test.local', 'การเงิน 6.3', 'active')
    ON CONFLICT (id) DO NOTHING
  `)
  await tx.$executeRawUnsafe(`
    INSERT INTO teams (id, organization_id, name, side, provinces, status, created_by) VALUES
      ('${TEAM_A}', '${ORG_ID}', 'ทีม A 6.3', 'inhouse', ARRAY['เชียงใหม่'], 'active', '${EXEC_ID}'),
      ('${TEAM_B}', '${ORG_ID}', 'ทีม B 6.3', 'outsource', ARRAY['ลำพูน'], 'active', '${EXEC_ID}')
    ON CONFLICT (id) DO NOTHING
  `)
  await tx.$executeRawUnsafe(`
    INSERT INTO users (id, organization_id, role_id, email, full_name, status, team_id) VALUES
      ('${AGENT_A}', '${ORG_ID}', '${ROLE_AGENT}', 'agent63a@test.local', 'สมชาย 6.3', 'active', '${TEAM_A}'),
      ('${AGENT_B}', '${ORG_ID}', '${ROLE_AGENT}', 'agent63b@test.local', 'สมหญิง 6.3', 'active', '${TEAM_B}')
    ON CONFLICT (id) DO NOTHING
  `)
  await tx.$executeRawUnsafe(`
    INSERT INTO finance_companies (id, organization_id, name, short_name, tax_id, vat_mode,
                                   payment_due_days, created_by) VALUES
      ('${COMPANY_A}', '${ORG_ID}', 'ไฟแนนซ์ A 6.3', 'A63', '0105512630001', 'exclude_vat', 30, '${EXEC_ID}'),
      ('${COMPANY_B}', '${ORG_ID}', 'ไฟแนนซ์ B 6.3', 'B63', '0105512630002', 'exclude_vat', 30, '${EXEC_ID}')
    ON CONFLICT (id) DO NOTHING
  `)
  await cleanup()
})

afterAll(async () => {
  if (url) await cleanup()
  await client?.$disconnect()
})

beforeEach(async () => {
  if (url) await cleanup()
})

// ════════════════════════════════════════════════════════════════════════════

suite('O1 — อัตราความสำเร็จ', () => {
  it('เคส open ไม่ถูกนับใน success/fail — % คิดจากเคสที่ปิดแล้วเท่านั้น (`96` §14)', async () => {
    await seedCase({ status: 'closed_success' })
    await seedCase({ status: 'closed_success' })
    await seedCase({ status: 'closed_fail' })
    await seedCase({ status: 'active', closedAt: null })

    const payload = await run('success-rate', { dimension: 'team' })

    expect(payload.range.label).toBe('สิงหาคม 2569')
    const row = rowBy(payload, 'group', 'ทีม A 6.3')
    expect(row).toMatchObject({ caseCount: 4, successCount: 2, failCount: 1, openCount: 1, successPct: 66.7 })
    expect(kpiOf(payload, 'successPct')).toBe(66.7)
  })

  it('มิติรายบริษัทไฟแนนซ์แยกแถวตามบริษัทจริง', async () => {
    await seedCase({ companyId: COMPANY_A, status: 'closed_success' })
    await seedCase({ companyId: COMPANY_B, status: 'closed_fail', teamId: TEAM_B })

    const payload = await run('success-rate', { dimension: 'company' })

    expect(payload.rows).toHaveLength(2)
    expect(rowBy(payload, 'group', 'ไฟแนนซ์ A 6.3')).toMatchObject({ successCount: 1, successPct: 100 })
    expect(rowBy(payload, 'group', 'ไฟแนนซ์ B 6.3')).toMatchObject({ failCount: 1, successPct: 0 })
  })

  it('ผู้จัดการเห็นเฉพาะทีมตัวเอง ไม่เห็นทีมอื่น (`96` §14)', async () => {
    await seedCase({ teamId: TEAM_A, status: 'closed_success' })
    await seedCase({ teamId: TEAM_B, status: 'closed_fail' })

    const asExec = await run('success-rate', { dimension: 'team' }, exec)
    const asManager = await run('success-rate', { dimension: 'team' }, manager)

    expect(asExec.rows).toHaveLength(2)
    expect(asManager.rows).toHaveLength(1)
    expect(asManager.rows[0]?.group).toBe('ทีม A 6.3')
    expect(asManager.totalRow?.caseCount).toBe(1)
  })

  it('ผู้จัดการที่ยังไม่มีทีม = ผลลัพธ์ว่าง ห้ามตีความว่าเห็นทุกทีม', async () => {
    await seedCase({ teamId: TEAM_A, status: 'closed_success' })

    const payload = await run('success-rate', { dimension: 'team' }, managerWithoutTeam)

    expect(payload.rows).toHaveLength(0)
    expect(payload.totalRow?.caseCount).toBe(0)
  })

  it('การเงินเรียกรายงานหมวด O ต้อง 403 (`96` §10)', async () => {
    await expect(run('success-rate', {}, finance)).rejects.toThrow(/PERMISSION_DENIED/)
  })
})

suite('O2 — ประสิทธิภาพทีม / SLA', () => {
  it('TAT ข้ามเดือนนับ calendar days รวมวันหยุด (`96` §14)', async () => {
    // รับเคส 31 ก.ค. → ปิด 3 ส.ค. = 3 วันเต็ม (ข้ามเดือน + สุดสัปดาห์)
    await seedCase({
      status: 'closed_success',
      createdAt: '2026-07-31T03:00:00Z',
      closedAt: '2026-08-03T03:00:00Z',
    })

    const payload = await run('team-performance')

    expect(rowBy(payload, 'team', 'ทีม A 6.3')).toMatchObject({
      caseCount: 1,
      avgTatDays: 3,
      minTatDays: 3,
      maxTatDays: 3,
    })
  })

  it('เกณฑ์ SLA อ่านจากค่าตั้งองค์กร (D18) — เปลี่ยนค่าแล้วผลเปลี่ยนตาม', async () => {
    // TAT = 4 วัน (96 ชั่วโมง)
    await seedCase({
      status: 'closed_success',
      createdAt: '2026-08-05T03:00:00Z',
      closedAt: '2026-08-09T03:00:00Z',
    })

    // ค่าเริ่มต้น 72 ชม. (ยังไม่มีแถวค่าตั้ง) ⇒ เกิน SLA
    const byDefault = await run('team-performance')
    expect(rowBy(byDefault, 'team', 'ทีม A 6.3')).toMatchObject({ withinSla: 0, overSla: 1 })

    await setSlaAlertHours(120)
    clearReportCache()
    const relaxed = await run('team-performance')
    expect(rowBy(relaxed, 'team', 'ทีม A 6.3')).toMatchObject({ withinSla: 1, overSla: 0 })
    expect(kpiOf(relaxed, 'withinSlaPct')).toBe(100)
  })

  it('เคสที่ยังไม่ปิดไม่อยู่ในรายงานนี้ (ไม่มี TAT ให้คำนวณ)', async () => {
    await seedCase({ status: 'active', closedAt: null })

    const payload = await run('team-performance')

    expect(payload.rows).toHaveLength(0)
    expect(payload.totalRow?.avgTatDays).toBeNull()
  })
})

suite('O3 — ปริมาณงานรายพนักงาน', () => {
  it('นับเคสไม่ซ้ำและแยกปิดสำเร็จ/ค้างอยู่ตามสถานะงานที่มอบหมาย', async () => {
    const done = await seedCase({ status: 'closed_success' })
    const open = await seedCase({ status: 'active', closedAt: null })
    await seedAssignment({ caseId: done, status: 'closed_success' })
    // มอบหมายซ้ำรอบสองของเคสเดิม — ต้องยังนับเป็น 1 เคส
    await seedAssignment({ caseId: done, status: 'closed_success' })
    await seedAssignment({ caseId: open, status: 'scheduled' })

    const payload = await run('workload')

    expect(rowBy(payload, 'agent', 'สมชาย 6.3')).toMatchObject({
      caseCount: 2,
      successCount: 1,
      openCount: 1,
      successPct: 50,
    })
  })

  it('งานที่ถูกโอนออกไปแล้วไม่นับเป็นภาระของคนเดิม', async () => {
    const caseId = await seedCase({ status: 'active', closedAt: null })
    await seedAssignment({ caseId, agentId: AGENT_A, status: 'reassigned_away' })
    await seedAssignment({ caseId, agentId: AGENT_B, teamId: TEAM_B, status: 'scheduled' })

    const payload = await run('workload')

    expect(payload.rows).toHaveLength(1)
    expect(payload.rows[0]).toMatchObject({ agent: 'สมหญิง 6.3', caseCount: 1, openCount: 1 })
  })

  it('ผู้จัดการเห็นเฉพาะงานของทีมตัวเอง', async () => {
    const a = await seedCase({ status: 'active', closedAt: null })
    const b = await seedCase({ status: 'active', closedAt: null, teamId: TEAM_B })
    await seedAssignment({ caseId: a, agentId: AGENT_A, teamId: TEAM_A })
    await seedAssignment({ caseId: b, agentId: AGENT_B, teamId: TEAM_B })

    const payload = await run('workload', {}, manager)

    expect(payload.rows).toHaveLength(1)
    expect(payload.rows[0]?.agent).toBe('สมชาย 6.3')
  })
})

suite('O4 — เคสค้างเกิน SLA', () => {
  it('ครบเกณฑ์พอดียังไม่ขึ้นรายงาน — เกินแล้วจึงขึ้น พร้อมยอดประมาณการรายได้', async () => {
    // เกณฑ์เริ่มต้น 72 ชม. · NOW = 15/08 12:00 น. ไทย
    await seedCase({ status: 'active', closedAt: null, createdAt: '2026-08-12T05:00:00Z' }) // ครบ 72 ชม. พอดี
    await seedCase({
      status: 'active',
      closedAt: null,
      createdAt: '2026-08-10T05:00:00Z',
      projectedRevenueSatang: 250_000_00,
    })

    const payload = await run('sla-breach')

    expect(payload.rows).toHaveLength(1)
    expect(payload.rows[0]).toMatchObject({ overdueDays: 2, projectedRevenueSatang: 250_000_00 })
    expect(kpiOf(payload, 'breachCount')).toBe(1)
    expect(kpiOf(payload, 'projectedRevenue')).toBe(250_000_00)
  })

  it('เคสที่ปิดแล้วไม่อยู่ในรายงาน แม้จะเก่ากว่าเกณฑ์', async () => {
    await seedCase({ status: 'closed_success', createdAt: '2026-06-01T03:00:00Z' })
    await seedCase({ status: 'draft', closedAt: null, createdAt: '2026-06-01T03:00:00Z' })

    const payload = await run('sla-breach')

    expect(payload.rows).toHaveLength(0)
    expect(payload.totalRow).toBeNull()
  })

  it('แสดงพนักงานที่ถือเคสอยู่จริง (ไม่ใช่คนที่โอนงานออกไปแล้ว) และกรองตามทีมของผู้เรียก', async () => {
    const caseId = await seedCase({ status: 'active', closedAt: null, createdAt: '2026-08-01T03:00:00Z' })
    await seedAssignment({ caseId, agentId: AGENT_A, status: 'reassigned_away', createdAt: '2026-08-01T04:00:00Z' })
    await seedAssignment({ caseId, agentId: AGENT_B, teamId: TEAM_B, createdAt: '2026-08-02T04:00:00Z' })
    await seedCase({ status: 'active', closedAt: null, createdAt: '2026-08-01T03:00:00Z', teamId: TEAM_B })

    const asExec = await run('sla-breach', {}, exec)
    expect(asExec.rows).toHaveLength(2)
    expect(asExec.rows.map((row) => row.agent)).toContain('สมหญิง 6.3')

    const asManager = await run('sla-breach', {}, manager)
    expect(asManager.rows).toHaveLength(1)
  })
})

suite('O5 — สรุปคลังสินค้า', () => {
  it('นับตามสถานะเครื่อง ณ ปัจจุบัน · เครื่องที่ถูกปฏิเสธไม่ถูกนับ', async () => {
    const caseId = await seedCase({ status: 'closed_success' })
    await seedAsset({ caseId, assetStatus: 'pending_intake' })
    await seedAsset({ caseId, assetStatus: 'in_custody' })
    await seedAsset({ caseId, assetStatus: 'in_custody' })
    await seedAsset({ caseId, assetStatus: 'handover_pending' })
    await seedAsset({ caseId, assetStatus: 'intake_rejected' })

    const payload = await run('warehouse-summary')

    expect(rowBy(payload, 'company', 'ไฟแนนซ์ A 6.3')).toMatchObject({
      pendingIntake: 1,
      inCustody: 2,
      handoverPending: 1,
      handedOverInRange: 0,
    })
    expect(kpiOf(payload, 'inCustody')).toBe(2)
  })

  it('ส่งมอบแล้วนับจากล็อตที่ยืนยันภายในช่วงที่เลือกเท่านั้น (`44` §11)', async () => {
    const caseId = await seedCase({ status: 'closed_success' })
    const inRange = await seedLot({ confirmedAt: '2026-08-10T03:00:00Z' })
    const beforeRange = await seedLot({ confirmedAt: '2026-07-10T03:00:00Z' })
    await seedAsset({ caseId, assetStatus: 'handed_over', lotId: inRange })
    await seedAsset({ caseId, assetStatus: 'handed_over', lotId: beforeRange })

    const payload = await run('warehouse-summary')

    expect(rowBy(payload, 'company', 'ไฟแนนซ์ A 6.3')?.handedOverInRange).toBe(1)
    expect(kpiOf(payload, 'handedOver')).toBe(1)
  })

  it('ผู้จัดการเห็นเฉพาะเครื่องของเคสในทีมตัวเอง', async () => {
    const mine = await seedCase({ status: 'closed_success', teamId: TEAM_A })
    const other = await seedCase({ status: 'closed_success', teamId: TEAM_B, companyId: COMPANY_B })
    await seedAsset({ caseId: mine, assetStatus: 'in_custody' })
    await seedAsset({ caseId: other, companyId: COMPANY_B, assetStatus: 'in_custody' })

    const payload = await run('warehouse-summary', {}, manager)

    expect(payload.rows).toHaveLength(1)
    expect(payload.rows[0]?.company).toBe('ไฟแนนซ์ A 6.3')
    expect(payload.totalRow?.inCustody).toBe(1)
  })
})
