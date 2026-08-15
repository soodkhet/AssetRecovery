import { PrismaPg } from '@prisma/adapter-pg'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import type { SessionUser } from '@/lib/auth/types'
import { PrismaClient } from '@/lib/generated/prisma/client'
import { clearReportCache } from '@/lib/reports/cache'
import { findReport } from '@/lib/reports/catalog'
import { TREND_MONTHS } from '@/lib/reports/executive/kpi-summary-report'
import type { ReportPayload, ReportRow } from '@/lib/reports/payload'
import { resolveReportRange, type ReportRange } from '@/lib/reports/range'

/**
 * เทสต์ระดับ DB ของ **Executive Dashboard (E1–E3)** — DoD ของ `96` §6-E/§13/§14
 *
 *  - E1: KPI 6 ตัวคิดจากช่วงที่เลือก + badge เทียบช่วงก่อนหน้า · ตารางเป็นเทรนด์ 12 เดือน ·
 *    AR ค้างรับเป็นยอด ณ วันที่ (บิล `draft` ไม่ใช่ลูกหนี้) · ทุกยอดตรงกับ F1/F3/O1 เพราะใช้ตัวโหลดชุดเดียวกัน
 *  - E2: คะแนนรายบริษัท (เคส/%สำเร็จ/รายได้/กำไร/margin/AR/เทรนด์) · เรียงตามรายได้
 *  - E3: คะแนนรายทีม (ประเภท/จำนวนคน/เคส/%สำเร็จ/TAT/ต้นทุน/กำไร) · TAT คิดจากเคสที่ปิดในช่วง
 *  - Permission (`96` §14): **การเงินเรียก E1/E2/E3 ต้อง 403** · ผู้บริหารเรียกได้
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
  console.warn('[executive-reports.db.test] ข้ามเทสต์ระดับ DB — ไม่มี TEST_DATABASE_URL (ดู .env.example)')
}

const ORG_ID = '00000000-0000-4000-8000-0000000065a0'
const ROLE_EXEC = '00000000-0000-4000-8000-0000000065a1'
const ROLE_AGENT = '00000000-0000-4000-8000-0000000065a2'
const EXEC_ID = '00000000-0000-4000-8000-0000000065a3'
const FINANCE_ID = '00000000-0000-4000-8000-0000000065a4'
const TEAM_A = '00000000-0000-4000-8000-0000000065a5'
const TEAM_B = '00000000-0000-4000-8000-0000000065a6'
const COMPANY_A = '00000000-0000-4000-8000-0000000065a7'
const COMPANY_B = '00000000-0000-4000-8000-0000000065a8'
const AGENT_A = '00000000-0000-4000-8000-0000000065a9'
const AGENT_B = '00000000-0000-4000-8000-0000000065b0'
const PAYEE_A = '00000000-0000-4000-8000-0000000065b1'

/** วันอ้างอิงของทุกเทสต์ — 15 สิงหาคม 2569 เวลาไทยเที่ยงวัน */
const NOW = new Date('2026-08-15T05:00:00Z')
const RANGE_MONTH = resolveReportRange({ preset: 'this_month' }, NOW)

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
  teamId: null,
  roleGroup: 'system' as const,
  loginAt: NOW.toISOString(),
}

/** ผู้บริหาร — หมวด E ผูกกับ capability ที่ล็อกไว้กับบริหารเท่านั้น (`25` §7.4 "✅ only") */
const executive: SessionUser = {
  ...baseUser,
  id: EXEC_ID,
  roleId: ROLE_EXEC,
  supabaseUid: 'uid-exec-65',
  email: 'exec65@test.local',
  fullName: 'ผู้บริหาร 6.5',
  roleName: 'ผู้บริหาร',
  capabilities: { unlock_period: 'manage', approve_expense_executive: 'manage' },
  scope: { kind: 'global', teamIds: [], companyId: null, userId: EXEC_ID },
}

/** ฝ่ายการเงิน — ไม่มีสิทธิ์หมวด E ตาม §10/§14 (ต้อง 403 ไม่ใช่เห็นตัวเลขว่าง) */
const finance: SessionUser = {
  ...baseUser,
  id: FINANCE_ID,
  roleId: ROLE_EXEC,
  supabaseUid: 'uid-finance-65',
  email: 'finance65@test.local',
  fullName: 'การเงิน 6.5',
  roleName: 'การเงิน',
  capabilities: { manage_billing: 'manage', manage_payout_batch: 'manage' },
  scope: { kind: 'global', teamIds: [], companyId: null, userId: FINANCE_ID },
}

async function run(
  reportId: string,
  user: SessionUser = executive,
  range: ReportRange = RANGE_MONTH,
): Promise<ReportPayload> {
  const report = findReport(reportId)
  if (report === null) throw new Error(`ไม่รู้จักรายงาน ${reportId}`)
  return runner.runReport(user, report, { range, refresh: true, params: {}, now: NOW })
}

const rowBy = (payload: ReportPayload, key: string, value: string): ReportRow | undefined =>
  payload.rows.find((row) => row[key] === value)
const kpiOf = (payload: ReportPayload, key: string): unknown => payload.kpis.find((kpi) => kpi.key === key)?.value

// ── seed helpers ────────────────────────────────────────────────────────────

let seq = 0

async function seedCase(options: {
  companyId?: string
  teamId?: string
  createdAt: string
  /** ไม่ระบุ = เคสที่ยังไม่ปิด (นับใน "เคสทั้งหมด" แต่ไม่เข้าตัวหารของ % สำเร็จ) */
  outcome?: 'closed_success' | 'closed_fail'
  closedAt?: string
}): Promise<string> {
  seq += 1
  const caseRef = `RPT65-${seq}-${Date.now()}`
  const closed = options.outcome !== undefined
  const rows = await db().$queryRawUnsafe<{ id: string }[]>(`
    INSERT INTO cases (
      organization_id, case_ref, case_ref_normalized, company_id, source, status, created_by, created_at,
      debtor_name, addr_province, addr_district, asset_kind, asset_description,
      debt_amount_satang, assigned_team_id, outcome, closed_at,
      service_fee_model_snapshot, service_fee_base_satang, service_fee_rate_pct, service_fee_basis_snapshot
    ) VALUES (
      '${ORG_ID}', $$${caseRef}$$, $$${caseRef}$$, '${options.companyId ?? COMPANY_A}', 'manual',
      '${closed ? options.outcome : 'active'}', '${EXEC_ID}', '${options.createdAt}',
      'ลูกหนี้ ${seq}', 'เชียงใหม่', 'เมือง', 'smartphone', 'iPhone 15',
      1000000, '${options.teamId ?? TEAM_A}',
      ${closed ? `'${options.outcome}'` : 'NULL'},
      ${options.closedAt === undefined ? 'NULL' : `'${options.closedAt}'`},
      'SUCCESS_FEE', 0, 10, 'debt_amount'
    ) RETURNING id
  `)
  return rows[0]?.id ?? ''
}

async function seedRevenue(
  caseId: string,
  grossSatang: number,
  options: { companyId?: string; revenueDate: string },
): Promise<void> {
  const vat = Math.round(grossSatang * 0.07)
  await db().$executeRawUnsafe(`
    INSERT INTO revenues (organization_id, case_id, company_id, gross_satang, vat_satang, vat_rate_pct_used,
                          total_satang, fee_model_snapshot, status, revenue_date, created_by)
    VALUES ('${ORG_ID}', '${caseId}', '${options.companyId ?? COMPANY_A}', ${grossSatang}, ${vat}, 7.00,
            ${grossSatang + vat}, 'SUCCESS_FEE', 'ready_for_billing', '${options.revenueDate}', '${EXEC_ID}')
  `)
}

async function seedExpense(options: { caseId: string; grossSatang: number; expenseDate: string }): Promise<void> {
  await db().$executeRawUnsafe(`
    INSERT INTO expenses (organization_id, case_id, payee_id, expense_type, gross_satang, expense_date,
                          status, created_by)
    VALUES ('${ORG_ID}', '${options.caseId}', '${PAYEE_A}', 'fuel', ${options.grossSatang},
            '${options.expenseDate}', 'approved', '${EXEC_ID}')
  `)
}

async function seedBillingBatch(options: {
  totalSatang: number
  dueDate: string
  receivedSatang?: number
  status?: string
  companyId?: string
}): Promise<void> {
  seq += 1
  await db().$executeRawUnsafe(`
    INSERT INTO billing_batches (organization_id, company_id, period, status, total_satang, received_satang,
                                 wht_withheld_by_customer_satang, due_date, created_by)
    VALUES ('${ORG_ID}', '${options.companyId ?? COMPANY_A}', 'รอบทดสอบ 6.5-${seq}', '${options.status ?? 'sent'}',
            ${options.totalSatang}, ${options.receivedSatang ?? 0}, 0, '${options.dueDate}', '${EXEC_ID}')
  `)
}

async function cleanup(): Promise<void> {
  const tx = db()
  await tx.$executeRawUnsafe(`DELETE FROM adjustments WHERE organization_id = '${ORG_ID}'`)
  await tx.$executeRawUnsafe(`DELETE FROM revenues WHERE organization_id = '${ORG_ID}'`)
  await tx.$executeRawUnsafe(`DELETE FROM billing_batches WHERE organization_id = '${ORG_ID}'`)
  await tx.$executeRawUnsafe(`DELETE FROM expenses WHERE organization_id = '${ORG_ID}'`)
  await tx.$executeRawUnsafe(`DELETE FROM cases WHERE organization_id = '${ORG_ID}'`)
  clearReportCache()
}

/**
 * ชุดข้อมูลอ้างอิงของทุกเทสต์ (ช่วงที่เลือก = สิงหาคม 2569)
 *
 * | เคส | บริษัท | ทีม | ผล | รายได้ | ต้นทุน |
 * |---|---|---|---|---|---|
 * | A1 (1–5 ส.ค.) | A | A | สำเร็จ | 1,000 | 400 |
 * | A2 (1–11 ส.ค.) | A | A | ไม่สำเร็จ | — | 100 |
 * | B1 (2–4 ส.ค.) | B | B | สำเร็จ | 2,000 | 500 |
 * | เดือนก่อน (ก.ค.) | A | A | สำเร็จ | 800 | 200 |
 * | พ.ย. 2568 | A | A | สำเร็จ | 500 | — |
 */
async function seedScenario(): Promise<void> {
  const caseA1 = await seedCase({
    createdAt: '2026-08-01T03:00:00Z',
    outcome: 'closed_success',
    closedAt: '2026-08-05T03:00:00Z',
  })
  await seedRevenue(caseA1, 1_000_00, { revenueDate: '2026-08-05' })
  await seedExpense({ caseId: caseA1, grossSatang: 400_00, expenseDate: '2026-08-05' })

  const caseA2 = await seedCase({
    createdAt: '2026-08-01T03:00:00Z',
    outcome: 'closed_fail',
    closedAt: '2026-08-11T03:00:00Z',
  })
  await seedExpense({ caseId: caseA2, grossSatang: 100_00, expenseDate: '2026-08-11' })

  const caseB1 = await seedCase({
    companyId: COMPANY_B,
    teamId: TEAM_B,
    createdAt: '2026-08-02T03:00:00Z',
    outcome: 'closed_success',
    closedAt: '2026-08-04T03:00:00Z',
  })
  await seedRevenue(caseB1, 2_000_00, { companyId: COMPANY_B, revenueDate: '2026-08-04' })
  await seedExpense({ caseId: caseB1, grossSatang: 500_00, expenseDate: '2026-08-04' })

  const caseJuly = await seedCase({
    createdAt: '2026-07-10T03:00:00Z',
    outcome: 'closed_success',
    closedAt: '2026-07-20T03:00:00Z',
  })
  await seedRevenue(caseJuly, 800_00, { revenueDate: '2026-07-20' })
  await seedExpense({ caseId: caseJuly, grossSatang: 200_00, expenseDate: '2026-07-20' })

  const caseLastYear = await seedCase({
    createdAt: '2025-11-10T03:00:00Z',
    outcome: 'closed_success',
    closedAt: '2025-11-20T03:00:00Z',
  })
  await seedRevenue(caseLastYear, 500_00, { revenueDate: '2025-11-20' })

  // ลูกหนี้: บริษัท A ค้าง 4,000 · บริษัท B ปิดยอดครบ · บิล draft ไม่ใช่ลูกหนี้ (`19` §9.1)
  await seedBillingBatch({ totalSatang: 5_000_00, receivedSatang: 1_000_00, dueDate: '2026-07-31' })
  await seedBillingBatch({ companyId: COMPANY_B, totalSatang: 2_000_00, receivedSatang: 2_000_00, dueDate: '2026-07-31' })
  await seedBillingBatch({ totalSatang: 9_999_00, dueDate: '2026-08-31', status: 'draft' })
}

beforeAll(async () => {
  if (!url) return
  process.env.DATABASE_URL = url
  runner = await import('@/lib/reports/run')

  const tx = db()
  await tx.$executeRawUnsafe(`
    INSERT INTO organizations (id, name, tax_id, address)
    VALUES ('${ORG_ID}', 'Phase65Test', '9999999996500', 'ที่อยู่ทดสอบ 6.5') ON CONFLICT (id) DO NOTHING
  `)
  await tx.$executeRawUnsafe(`
    INSERT INTO roles (id, organization_id, name, role_group, is_seed) VALUES
      ('${ROLE_EXEC}', '${ORG_ID}', 'ผู้บริหาร 6.5', 'system', false),
      ('${ROLE_AGENT}', '${ORG_ID}', 'พนักงาน 6.5', 'outsource', false)
    ON CONFLICT (id) DO NOTHING
  `)
  await tx.$executeRawUnsafe(`
    INSERT INTO users (id, organization_id, role_id, email, full_name, status) VALUES
      ('${EXEC_ID}', '${ORG_ID}', '${ROLE_EXEC}', 'exec65@test.local', 'ผู้บริหาร 6.5', 'active'),
      ('${FINANCE_ID}', '${ORG_ID}', '${ROLE_EXEC}', 'finance65@test.local', 'การเงิน 6.5', 'active')
    ON CONFLICT (id) DO NOTHING
  `)
  await tx.$executeRawUnsafe(`
    INSERT INTO teams (id, organization_id, name, side, provinces, status, created_by) VALUES
      ('${TEAM_A}', '${ORG_ID}', 'ทีม A 6.5', 'inhouse', ARRAY['เชียงใหม่'], 'active', '${EXEC_ID}'),
      ('${TEAM_B}', '${ORG_ID}', 'ทีม B 6.5', 'outsource', ARRAY['ลำพูน'], 'active', '${EXEC_ID}')
    ON CONFLICT (id) DO NOTHING
  `)
  await tx.$executeRawUnsafe(`
    INSERT INTO users (id, organization_id, role_id, email, full_name, status, team_id) VALUES
      ('${AGENT_A}', '${ORG_ID}', '${ROLE_AGENT}', 'agent65a@test.local', 'สมชาย 6.5', 'active', '${TEAM_A}'),
      ('${AGENT_B}', '${ORG_ID}', '${ROLE_AGENT}', 'agent65b@test.local', 'สมหญิง 6.5', 'active', '${TEAM_B}')
    ON CONFLICT (id) DO NOTHING
  `)
  await tx.$executeRawUnsafe(`
    INSERT INTO payee_profiles (id, organization_id, user_id, payee_type, bank_name, account_name,
                                account_number, national_id, is_verified, created_by) VALUES
      ('${PAYEE_A}', '${ORG_ID}', '${AGENT_A}', 'individual', 'ธนาคารกสิกรไทย', 'สมชาย 6.5',
       '1234509650', '1234509650123', true, '${EXEC_ID}')
    ON CONFLICT (id) DO NOTHING
  `)
  await tx.$executeRawUnsafe(`
    INSERT INTO finance_companies (id, organization_id, name, short_name, tax_id, vat_mode,
                                   payment_due_days, created_by) VALUES
      ('${COMPANY_A}', '${ORG_ID}', 'ไฟแนนซ์ A 6.5', 'A65', '0105512650001', 'exclude_vat', 30, '${EXEC_ID}'),
      ('${COMPANY_B}', '${ORG_ID}', 'ไฟแนนซ์ B 6.5', 'B65', '0105512650002', 'exclude_vat', 30, '${EXEC_ID}')
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

suite('E1 — KPI ภาพรวม', () => {
  it('KPI 6 ตัวคิดจากช่วงที่เลือก (รายได้/กำไร/margin/เคส/%สำเร็จ/AR)', async () => {
    await seedScenario()

    const payload = await run('kpi-summary')

    expect(payload.report.code).toBe('E1')
    expect(payload.range.label).toBe('สิงหาคม 2569')
    expect(kpiOf(payload, 'revenue')).toBe(3_000_00)
    expect(kpiOf(payload, 'grossProfit')).toBe(2_000_00)
    expect(kpiOf(payload, 'marginPct')).toBeCloseTo(66.67, 1)
    expect(kpiOf(payload, 'caseCount')).toBe(3)
    // สำเร็จ 2 จากเคสที่ปิดแล้ว 3 (เคสของเดือนก่อนไม่เข้าช่วงนี้)
    expect(kpiOf(payload, 'successPct')).toBe(66.7)
    // AR = บิลที่ส่งแล้วและยังค้าง (5,000 − 1,000) · บิล draft และบิลที่ปิดยอดครบไม่นับ
    expect(kpiOf(payload, 'arOutstanding')).toBe(4_000_00)
  })

  it('badge MoM เทียบกับเดือนก่อนหน้าที่มีข้อมูลจริง', async () => {
    await seedScenario()

    const payload = await run('kpi-summary')
    const revenue = payload.kpis.find((kpi) => kpi.key === 'revenue')

    // เดือนก่อน (ก.ค.) รายได้ 800 → 3,000 = +275%
    expect(revenue?.mom).toMatchObject({ previous: 800_00, changePct: 275, direction: 'up' })
  })

  it('ตารางเป็นเทรนด์ 12 เดือนย้อนหลังถึงเดือนของช่วงที่เลือก และมีเดือนที่ข้ามปีอยู่ด้วย', async () => {
    await seedScenario()

    const payload = await run('kpi-summary')

    expect(payload.rows).toHaveLength(TREND_MONTHS)
    expect(payload.rows[0]?.['month']).toBe('กันยายน 2568')
    expect(payload.rows.at(-1)).toMatchObject({
      month: 'สิงหาคม 2569',
      revenueSatang: 3_000_00,
      directCostSatang: 1_000_00,
      grossProfitSatang: 2_000_00,
      caseCount: 3,
      successCount: 2,
      failCount: 1,
    })
    expect(rowBy(payload, 'month', 'กรกฎาคม 2569')).toMatchObject({ revenueSatang: 800_00, caseCount: 1 })
    // เดือนที่มีรายได้แต่ไม่มีเคสในเดือนนั้นก็ต้องมีแถวของตัวเอง (เดือนว่างไม่หายจากกราฟ)
    expect(rowBy(payload, 'month', 'พฤศจิกายน 2568')).toMatchObject({ revenueSatang: 500_00, successPct: 100 })
    expect(rowBy(payload, 'month', 'ตุลาคม 2568')).toMatchObject({ revenueSatang: 0, marginPct: null })
  })

  it('เคสที่ยังไม่ปิดนับใน "เคสทั้งหมด" แต่ไม่เข้าตัวหารของ % สำเร็จ (`96` §13 O1)', async () => {
    await seedCase({ createdAt: '2026-08-03T03:00:00Z' })
    await seedCase({ createdAt: '2026-08-03T03:00:00Z', outcome: 'closed_success', closedAt: '2026-08-06T03:00:00Z' })

    const payload = await run('kpi-summary')

    expect(kpiOf(payload, 'caseCount')).toBe(2)
    expect(kpiOf(payload, 'successPct')).toBe(100)
  })

  it('`96` §14 — การเงินเรียก E1 ต้อง 403', async () => {
    await expect(run('kpi-summary', finance)).rejects.toMatchObject({ code: 'PERMISSION_DENIED' })
  })
})

suite('E2 — Scorecard รายบริษัทไฟแนนซ์', () => {
  it('แต่ละบริษัทได้เคส/%สำเร็จ/รายได้/กำไร/margin/AR/เทรนด์ของตัวเอง และเรียงตามรายได้', async () => {
    await seedScenario()

    const payload = await run('company-scorecard')

    expect(payload.rows.map((row) => row['company'])).toEqual(['ไฟแนนซ์ B 6.5', 'ไฟแนนซ์ A 6.5'])
    expect(rowBy(payload, 'company', 'ไฟแนนซ์ A 6.5')).toMatchObject({
      caseCount: 2,
      successPct: 50,
      revenueSatang: 1_000_00,
      grossProfitSatang: 500_00,
      marginPct: 50,
      arOutstandingSatang: 4_000_00,
      // เดือนก่อนบริษัท A มีรายได้ 800 → 1,000 = +25%
      revenueTrendPct: 25,
    })
    expect(rowBy(payload, 'company', 'ไฟแนนซ์ B 6.5')).toMatchObject({
      caseCount: 1,
      successPct: 100,
      revenueSatang: 2_000_00,
      grossProfitSatang: 1_500_00,
      arOutstandingSatang: 0,
      // เดือนก่อนไม่มีรายได้เลย ⇒ เทียบไม่ได้ = N/A (ห้ามหารศูนย์)
      revenueTrendPct: null,
    })
  })

  it('ยอดรวมท้ายตารางเท่ากับ KPI ของ E1 ในช่วงเดียวกัน (ตัวเลขสองรายงานห้ามขัดกัน)', async () => {
    await seedScenario()

    const [company, kpi] = await Promise.all([run('company-scorecard'), run('kpi-summary')])

    expect(company.totalRow).toMatchObject({ revenueSatang: 3_000_00, grossProfitSatang: 2_000_00, caseCount: 3 })
    expect(company.totalRow?.['revenueSatang']).toBe(kpiOf(kpi, 'revenue'))
    expect(company.totalRow?.['arOutstandingSatang']).toBe(kpiOf(kpi, 'arOutstanding'))
  })

  it('`96` §14 — การเงินเรียก E2 ต้อง 403', async () => {
    await expect(run('company-scorecard', finance)).rejects.toMatchObject({ code: 'PERMISSION_DENIED' })
  })
})

suite('E3 — Scorecard รายทีม', () => {
  it('แต่ละทีมได้ประเภท/จำนวนคน/เคส/%สำเร็จ/TAT/ต้นทุน/กำไรของตัวเอง', async () => {
    await seedScenario()

    const payload = await run('team-scorecard')

    expect(rowBy(payload, 'team', 'ทีม A 6.5')).toMatchObject({
      side: 'Inhouse',
      memberCount: 1,
      caseCount: 2,
      successPct: 50,
      // TAT = (4 วัน + 10 วัน) ÷ 2 — นับเป็นวันตามปฏิทินรวมวันหยุด
      avgTatDays: 7,
      directCostSatang: 500_00,
      grossProfitSatang: 500_00,
    })
    expect(rowBy(payload, 'team', 'ทีม B 6.5')).toMatchObject({
      side: 'Outsource',
      memberCount: 1,
      caseCount: 1,
      successPct: 100,
      avgTatDays: 2,
      directCostSatang: 500_00,
      grossProfitSatang: 1_500_00,
    })
    // เรียงตามกำไรขั้นต้น
    expect(payload.rows[0]?.['team']).toBe('ทีม B 6.5')
  })

  it('ทีมที่ไม่มีเคสปิดในช่วงนี้ได้ TAT = "—" ไม่ใช่ 0 วัน', async () => {
    await seedCase({ teamId: TEAM_B, createdAt: '2026-08-02T03:00:00Z' })

    const payload = await run('team-scorecard')

    expect(rowBy(payload, 'team', 'ทีม B 6.5')).toMatchObject({ caseCount: 1, avgTatDays: null, successPct: null })
  })

  it('`96` §14 — การเงินเรียก E3 ต้อง 403', async () => {
    await expect(run('team-scorecard', finance)).rejects.toMatchObject({ code: 'PERMISSION_DENIED' })
  })
})
