import { PrismaPg } from '@prisma/adapter-pg'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import type { SessionUser } from '@/lib/auth/types'
import { PrismaClient } from '@/lib/generated/prisma/client'
import { clearReportCache } from '@/lib/reports/cache'

/**
 * เทสต์ระดับ DB ของ Phase 3.8 — DoD ของไฟล์ 21 + 14:
 *  - `21` §16: เคส `closed_fail` ที่มีต้นทุนแต่ไม่มีรายได้ **ลด margin จริง** ไม่ถูกกรองทิ้ง
 *  - `22` §6.12: `revenue = 0` ⇒ `marginPct = null` (ห้ามหารศูนย์) · ใช้ยอด**ก่อน VAT**
 *  - `21` §4: ต้นทุนตรง 4 ชนิดเท่านั้น (ค่าที่พัก/manual ไม่เข้ารายงาน) · expense ต้อง `approved`
 *  - `20` §9: ยอดของ record ต้นทางต้องเป็นยอด**หลัง adjustment ที่ approved** (`netAfterAdjustments`)
 *  - `21` §17: แคชรายวัน + `refresh` คำนวณสด — idempotent (ค่าเท่าเดิมเสมอ)
 *  - `21` §15: drill-down สอดคล้องกับยอดสรุป
 *  - `14` §6.1/§16: KPI 4 ตัวตรงกับข้อมูลจริงในไฟล์ต้นทาง + exception เรียง critical ก่อน
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
  console.warn('[reports.db.test] ข้ามเทสต์ระดับ DB — ไม่มี TEST_DATABASE_URL (ดู .env.example)')
}

const ORG_ID = '00000000-0000-4000-8000-0000000038a0'
const ROLE_FINANCE = '00000000-0000-4000-8000-0000000038a1'
const FINANCE_ID = '00000000-0000-4000-8000-0000000038a2'
const TEAM_A = '00000000-0000-4000-8000-0000000038a3'
const TEAM_B = '00000000-0000-4000-8000-0000000038a4'
const COMPANY_A = '00000000-0000-4000-8000-0000000038a5'
const COMPANY_B = '00000000-0000-4000-8000-0000000038a6'
const PAYEE_ID = '00000000-0000-4000-8000-0000000038a7'
const AGENT_ID = '00000000-0000-4000-8000-0000000038a8'
const ROLE_AGENT = '00000000-0000-4000-8000-0000000038a9'
const PERIOD_ID = '00000000-0000-4000-8000-0000000038b0'

/** วันอ้างอิงของทุกเทสต์ — สิงหาคม 2569 (เวลาไทย) */
const NOW = new Date('2026-08-15T05:00:00Z')

let client: PrismaClient | null = null
type ReportQueries = typeof import('@/lib/reports/queries')
let reports: ReportQueries

function db(): PrismaClient {
  if (!url) throw new Error('ไม่มี TEST_DATABASE_URL')
  if (!client) {
    assertLocalTestDatabase(url)
    client = new PrismaClient({ adapter: new PrismaPg({ connectionString: url }) })
  }
  return client
}

const finance: SessionUser = {
  id: FINANCE_ID,
  organizationId: ORG_ID,
  supabaseUid: 'uid-finance-38',
  email: 'finance38@test.local',
  fullName: 'การเงิน 3.8',
  status: 'active',
  roleId: ROLE_FINANCE,
  roleName: 'การเงิน',
  roleGroup: 'system',
  isSuperadmin: false,
  teamId: null,
  companyId: null,
  capabilities: { view_finance_dashboard: 'view' },
  scope: { kind: 'global', teamIds: [], companyId: null, userId: FINANCE_ID },
  loginAt: NOW.toISOString(),
}

const query = (overrides: Partial<Parameters<ReportQueries['getProfitability']>[1]> = {}) => ({
  dimension: 'company' as const,
  period: 'month' as const,
  refresh: true,
  ...overrides,
})

// ── seed helpers ────────────────────────────────────────────────────────────

let seq = 0

/** เคส 1 ใบ — คุมบริษัท/ทีม/ผลลัพธ์ได้ (เคสไม่สำเร็จก็ใช้ตัวนี้ แค่ไม่สร้าง revenue ให้) */
async function seedCase(options: {
  companyId?: string
  teamId?: string
  outcome?: 'closed_success' | 'closed_fail'
}): Promise<string> {
  seq += 1
  const caseRef = `RPT38-${seq}-${Date.now()}`
  const outcome = options.outcome ?? 'closed_success'
  const rows = await db().$queryRawUnsafe<{ id: string }[]>(`
    INSERT INTO cases (
      organization_id, case_ref, case_ref_normalized, company_id, source, status, created_by,
      debtor_name, addr_province, addr_district, asset_kind, asset_description,
      debt_amount_satang, assigned_team_id, outcome, closed_at,
      service_fee_model_snapshot, service_fee_base_satang, service_fee_rate_pct, service_fee_basis_snapshot
    ) VALUES (
      '${ORG_ID}', $$${caseRef}$$, $$${caseRef}$$, '${options.companyId ?? COMPANY_A}', 'manual',
      '${outcome}', '${FINANCE_ID}',
      'ลูกหนี้ ${seq}', 'เชียงใหม่', 'เมือง', 'smartphone', 'iPhone 15',
      1000000, '${options.teamId ?? TEAM_A}', '${outcome}', '2026-08-10T03:00:00Z',
      'SUCCESS_FEE', 0, 10, 'debt_amount'
    ) RETURNING id
  `)
  return rows[0]?.id ?? ''
}

/** รายได้ของเคส — `grossSatang` คือยอด**ก่อน VAT** ซึ่งเป็นตัวที่รายงานใช้ (`22` §6.12) */
async function seedRevenue(
  caseId: string,
  grossSatang: number,
  options: { companyId?: string; revenueDate?: string } = {},
): Promise<string> {
  const vat = Math.round(grossSatang * 0.07)
  const rows = await db().$queryRawUnsafe<{ id: string }[]>(`
    INSERT INTO revenues (organization_id, case_id, company_id, gross_satang, vat_satang, vat_rate_pct_used,
                          total_satang, fee_model_snapshot, status, revenue_date, created_by)
    VALUES ('${ORG_ID}', '${caseId}', '${options.companyId ?? COMPANY_A}', ${grossSatang}, ${vat}, 7.00,
            ${grossSatang + vat}, 'SUCCESS_FEE', 'ready_for_billing', '${options.revenueDate ?? '2026-08-10'}',
            '${FINANCE_ID}')
    RETURNING id
  `)
  return rows[0]?.id ?? ''
}

async function seedExpense(options: {
  caseId?: string | null
  grossSatang: number
  expenseType?: string
  status?: string
  expenseDate?: string
}): Promise<string> {
  const caseId = options.caseId === undefined || options.caseId === null ? 'NULL' : `'${options.caseId}'`
  const rows = await db().$queryRawUnsafe<{ id: string }[]>(`
    INSERT INTO expenses (organization_id, case_id, payee_id, expense_type, gross_satang, expense_date,
                          status, created_by)
    VALUES ('${ORG_ID}', ${caseId}, '${PAYEE_ID}', '${options.expenseType ?? 'fuel'}', ${options.grossSatang},
            '${options.expenseDate ?? '2026-08-10'}', '${options.status ?? 'approved'}', '${FINANCE_ID}')
    RETURNING id
  `)
  return rows[0]?.id ?? ''
}

async function seedAdjustment(options: {
  target: 'revenue' | 'expense' | 'billing_batch' | 'payout_batch'
  targetId: string
  amountSatang: number
  adjustmentType: 'increase' | 'decrease'
  status?: 'pending_approval' | 'approved' | 'rejected'
}): Promise<void> {
  const columns: Record<string, string> = {
    revenue: 'revenue_id',
    expense: 'expense_id',
    billing_batch: 'billing_batch_id',
    payout_batch: 'payout_batch_id',
  }
  await db().$executeRawUnsafe(`
    INSERT INTO adjustments (organization_id, adjustment_type, amount_satang, reason, status,
                             ${columns[options.target]}, created_by)
    VALUES ('${ORG_ID}', '${options.adjustmentType}', ${options.amountSatang}, 'เหตุผลทดสอบ 3.8',
            '${options.status ?? 'approved'}', '${options.targetId}', '${FINANCE_ID}')
  `)
}

async function seedBillingBatch(options: {
  totalSatang: number
  receivedSatang?: number
  whtSatang?: number
  status?: string
  period?: string
}): Promise<string> {
  seq += 1
  const rows = await db().$queryRawUnsafe<{ id: string }[]>(`
    INSERT INTO billing_batches (organization_id, company_id, period, status, total_satang, received_satang,
                                 wht_withheld_by_customer_satang, due_date, created_by)
    VALUES ('${ORG_ID}', '${COMPANY_A}', 'รอบทดสอบ ${seq}', '${options.status ?? 'sent'}',
            ${options.totalSatang}, ${options.receivedSatang ?? 0}, ${options.whtSatang ?? 0},
            '2026-09-30', '${FINANCE_ID}')
    RETURNING id
  `)
  return rows[0]?.id ?? ''
}

async function seedPayoutBatch(options: { netSatang: number; status?: string }): Promise<string> {
  seq += 1
  const rows = await db().$queryRawUnsafe<{ id: string }[]>(`
    INSERT INTO payout_batches (organization_id, name, side, status, gross_satang, wht_satang, net_satang, created_by)
    VALUES ('${ORG_ID}', 'รอบจ่ายทดสอบ ${seq}', 'inhouse', '${options.status ?? 'draft'}',
            ${options.netSatang}, 0, ${options.netSatang}, '${FINANCE_ID}')
    RETURNING id
  `)
  return rows[0]?.id ?? ''
}

async function seedException(options: {
  level: 'critical' | 'warning' | 'info'
  sourceModule: string
  status?: 'open' | 'resolved' | 'authorized'
}): Promise<void> {
  seq += 1
  await db().$executeRawUnsafe(`
    INSERT INTO exceptions (organization_id, period_id, level, status, title, description, source_module, created_by)
    VALUES ('${ORG_ID}', '${PERIOD_ID}', '${options.level}', '${options.status ?? 'open'}',
            'ปัญหาทดสอบ ${seq}', 'รายละเอียดปัญหา ${seq}', '${options.sourceModule}', '${FINANCE_ID}')
  `)
}

async function cleanup(): Promise<void> {
  const tx = db()
  await tx.$executeRawUnsafe(`DELETE FROM adjustments WHERE organization_id = '${ORG_ID}'`)
  await tx.$executeRawUnsafe(`DELETE FROM exceptions WHERE organization_id = '${ORG_ID}'`)
  await tx.$executeRawUnsafe(`DELETE FROM revenues WHERE organization_id = '${ORG_ID}'`)
  await tx.$executeRawUnsafe(`DELETE FROM billing_batches WHERE organization_id = '${ORG_ID}'`)
  await tx.$executeRawUnsafe(`DELETE FROM payout_batches WHERE organization_id = '${ORG_ID}'`)
  await tx.$executeRawUnsafe(`DELETE FROM expenses WHERE organization_id = '${ORG_ID}'`)
  await tx.$executeRawUnsafe(`DELETE FROM cases WHERE organization_id = '${ORG_ID}'`)
  clearReportCache()
}

beforeAll(async () => {
  if (!url) return
  process.env.DATABASE_URL = url
  reports = await import('@/lib/reports/queries')

  const tx = db()
  await tx.$executeRawUnsafe(`
    INSERT INTO organizations (id, name, tax_id, address)
    VALUES ('${ORG_ID}', 'Phase38Test', '9999999993800', 'ที่อยู่ทดสอบ 3.8') ON CONFLICT (id) DO NOTHING
  `)
  await tx.$executeRawUnsafe(`
    INSERT INTO roles (id, organization_id, name, role_group, is_seed) VALUES
      ('${ROLE_FINANCE}', '${ORG_ID}', 'การเงิน 3.8', 'system', false),
      ('${ROLE_AGENT}', '${ORG_ID}', 'พนักงาน 3.8', 'outsource', false)
    ON CONFLICT (id) DO NOTHING
  `)
  await tx.$executeRawUnsafe(`
    INSERT INTO users (id, organization_id, role_id, email, full_name, status) VALUES
      ('${FINANCE_ID}', '${ORG_ID}', '${ROLE_FINANCE}', 'finance38@test.local', 'การเงิน 3.8', 'active'),
      ('${AGENT_ID}', '${ORG_ID}', '${ROLE_AGENT}', 'agent38@test.local', 'พนักงาน 3.8', 'active')
    ON CONFLICT (id) DO NOTHING
  `)
  await tx.$executeRawUnsafe(`
    INSERT INTO teams (id, organization_id, name, side, provinces, status, created_by) VALUES
      ('${TEAM_A}', '${ORG_ID}', 'ทีม A 3.8', 'inhouse', ARRAY['เชียงใหม่'], 'active', '${FINANCE_ID}'),
      ('${TEAM_B}', '${ORG_ID}', 'ทีม B 3.8', 'outsource', ARRAY['ลำพูน'], 'active', '${FINANCE_ID}')
    ON CONFLICT (id) DO NOTHING
  `)
  await tx.$executeRawUnsafe(`
    INSERT INTO payee_profiles (id, organization_id, user_id, payee_type, bank_name, account_name,
                                account_number, national_id, is_verified, created_by)
    VALUES ('${PAYEE_ID}', '${ORG_ID}', '${AGENT_ID}', 'individual', 'ธนาคารกสิกรไทย', 'พนักงาน 3.8',
            '1234509880', '1234509880123', true, '${FINANCE_ID}')
    ON CONFLICT (id) DO NOTHING
  `)
  await tx.$executeRawUnsafe(`
    INSERT INTO finance_companies (id, organization_id, name, short_name, tax_id, vat_mode,
                                   payment_due_days, created_by) VALUES
      ('${COMPANY_A}', '${ORG_ID}', 'ไฟแนนซ์ A 3.8', 'A38', '0105512380001', 'exclude_vat', 30, '${FINANCE_ID}'),
      ('${COMPANY_B}', '${ORG_ID}', 'ไฟแนนซ์ B 3.8', 'B38', '0105512380002', 'exclude_vat', 30, '${FINANCE_ID}')
    ON CONFLICT (id) DO NOTHING
  `)
  await tx.$executeRawUnsafe(`
    INSERT INTO accounting_periods (id, organization_id, period_label, year_be, month, status, created_by)
    VALUES ('${PERIOD_ID}', '${ORG_ID}', 'สิงหาคม 2569', 2569, 8, 'collecting', '${FINANCE_ID}')
    ON CONFLICT (id) DO NOTHING
  `)
  await cleanup()
})

afterAll(async () => {
  if (url) {
    await cleanup()
    await db().$executeRawUnsafe(`DELETE FROM accounting_periods WHERE organization_id = '${ORG_ID}'`)
  }
  await client?.$disconnect()
})

beforeEach(async () => {
  if (url) await cleanup()
})

// ════════════════════════════════════════════════════════════════════════════

suite('Profitability — สูตรและมิติ (`21` §6.1 · `22` §6.12)', () => {
  it('รวมรายได้ (ก่อน VAT) และต้นทุนตรงตามมิติบริษัท', async () => {
    const caseA = await seedCase({ companyId: COMPANY_A })
    await seedRevenue(caseA, 100_000_00, { companyId: COMPANY_A })
    await seedExpense({ caseId: caseA, grossSatang: 40_000_00, expenseType: 'fuel' })
    await seedExpense({ caseId: caseA, grossSatang: 10_000_00, expenseType: 'allowance' })

    const report = await reports.getProfitability(finance, query(), NOW)

    expect(report.periodLabel).toBe('สิงหาคม 2569')
    expect(report.rows).toHaveLength(1)
    expect(report.rows[0]).toMatchObject({
      key: COMPANY_A,
      label: 'ไฟแนนซ์ A 3.8',
      revenueSatang: 100_000_00, // ยอดก่อน VAT — VAT 7% ไม่ถูกนับเป็นรายได้
      directCostSatang: 50_000_00,
      grossProfitSatang: 50_000_00,
      marginPct: 50,
    })
  })

  it('มิติทีม — แยกตามทีมที่รับผิดชอบเคส', async () => {
    const caseA = await seedCase({ teamId: TEAM_A })
    const caseB = await seedCase({ teamId: TEAM_B })
    await seedRevenue(caseA, 100_000_00)
    await seedRevenue(caseB, 60_000_00)
    await seedExpense({ caseId: caseA, grossSatang: 20_000_00 })
    await seedExpense({ caseId: caseB, grossSatang: 30_000_00 })

    const report = await reports.getProfitability(finance, query({ dimension: 'team' }), NOW)

    expect(report.rows.map((row) => row.label)).toEqual(['ทีม A 3.8', 'ทีม B 3.8'])
    expect(report.rows.find((row) => row.key === TEAM_B)).toMatchObject({
      revenueSatang: 60_000_00,
      directCostSatang: 30_000_00,
      marginPct: 50,
    })
  })

  it('`21` §16 — เคส closed_fail ที่มีต้นทุนแต่ไม่มีรายได้ ลด margin จริง (ไม่ถูกกรองทิ้ง)', async () => {
    const success = await seedCase({ teamId: TEAM_A })
    await seedRevenue(success, 100_000_00)
    await seedExpense({ caseId: success, grossSatang: 20_000_00 })

    const withoutFail = await reports.getProfitability(finance, query({ dimension: 'team' }), NOW)
    expect(withoutFail.total.marginPct).toBe(80)

    const failed = await seedCase({ teamId: TEAM_A, outcome: 'closed_fail' })
    await seedExpense({ caseId: failed, grossSatang: 15_000_00, expenseType: 'fuel' })
    await seedExpense({ caseId: failed, grossSatang: 5_000_00, expenseType: 'no_success_fee' })

    const withFail = await reports.getProfitability(finance, query({ dimension: 'team' }), NOW)
    expect(withFail.total.directCostSatang).toBe(40_000_00)
    expect(withFail.total.marginPct).toBe(60)
    expect(withFail.rows[0]?.costCaseCount).toBe(2)
    expect(withFail.rows[0]?.revenueCaseCount).toBe(1)
  })

  it('มิติที่มีแต่ต้นทุน (ไม่มีรายได้เลย) ⇒ `marginPct = null` ห้ามหารศูนย์', async () => {
    const failed = await seedCase({ companyId: COMPANY_B, outcome: 'closed_fail' })
    await seedExpense({ caseId: failed, grossSatang: 8_000_00 })

    const report = await reports.getProfitability(finance, query(), NOW)

    expect(report.rows[0]).toMatchObject({ key: COMPANY_B, revenueSatang: 0, marginPct: null })
    expect(report.rows[0]?.grossProfitSatang).toBe(-8_000_00)
    expect(report.total.marginPct).toBeNull()
  })

  it('`21` §4 — ค่าที่พัก/manual ไม่ใช่ต้นทุนตรง และรายการที่ยังไม่อนุมัติไม่นับ', async () => {
    const caseA = await seedCase({})
    await seedRevenue(caseA, 50_000_00)
    await seedExpense({ caseId: caseA, grossSatang: 10_000_00, expenseType: 'fuel' })
    await seedExpense({ caseId: caseA, grossSatang: 3_000_00, expenseType: 'hotel' })
    await seedExpense({ caseId: caseA, grossSatang: 2_000_00, expenseType: 'manual' })
    await seedExpense({ caseId: caseA, grossSatang: 9_000_00, expenseType: 'fuel', status: 'pending_approval' })
    await seedExpense({ caseId: caseA, grossSatang: 7_000_00, expenseType: 'commission', status: 'superseded' })
    await seedExpense({ caseId: null, grossSatang: 4_000_00, expenseType: 'allowance' })

    const report = await reports.getProfitability(finance, query(), NOW)

    expect(report.total.directCostSatang).toBe(10_000_00)
  })

  it('นับเฉพาะรายการในช่วงเวลาที่เลือก (เดือน/ไตรมาส/ปี)', async () => {
    const caseA = await seedCase({})
    await seedRevenue(caseA, 30_000_00, { revenueDate: '2026-08-10' })
    const caseJuly = await seedCase({})
    await seedRevenue(caseJuly, 70_000_00, { revenueDate: '2026-07-20' })
    await seedExpense({ caseId: caseJuly, grossSatang: 5_000_00, expenseDate: '2026-07-20' })

    const month = await reports.getProfitability(finance, query(), NOW)
    expect(month.total.revenueSatang).toBe(30_000_00)
    expect(month.total.directCostSatang).toBe(0)

    const quarter = await reports.getProfitability(finance, query({ period: 'quarter' }), NOW)
    expect(quarter.periodLabel).toBe('ไตรมาส 3/2569')
    expect(quarter.total.revenueSatang).toBe(100_000_00)
    expect(quarter.total.directCostSatang).toBe(5_000_00)

    const year = await reports.getProfitability(finance, query({ period: 'year' }), NOW)
    expect(year.periodLabel).toBe('ปี 2569')
    expect(year.total.revenueSatang).toBe(100_000_00)
  })
})

suite('Profitability — ยอดหลังปรับปรุง (`20` §9)', () => {
  it('adjustment ที่ approved มีผลกับทั้งรายได้และต้นทุน · pending/rejected ไม่มีผล', async () => {
    const caseA = await seedCase({})
    const revenueId = await seedRevenue(caseA, 100_000_00)
    const expenseId = await seedExpense({ caseId: caseA, grossSatang: 20_000_00 })

    await seedAdjustment({ target: 'revenue', targetId: revenueId, amountSatang: 10_000_00, adjustmentType: 'decrease' })
    await seedAdjustment({ target: 'expense', targetId: expenseId, amountSatang: 5_000_00, adjustmentType: 'increase' })
    await seedAdjustment({
      target: 'revenue',
      targetId: revenueId,
      amountSatang: 90_000_00,
      adjustmentType: 'decrease',
      status: 'pending_approval',
    })
    await seedAdjustment({
      target: 'expense',
      targetId: expenseId,
      amountSatang: 90_000_00,
      adjustmentType: 'increase',
      status: 'rejected',
    })

    const report = await reports.getProfitability(finance, query(), NOW)

    expect(report.total.revenueSatang).toBe(90_000_00)
    expect(report.total.directCostSatang).toBe(25_000_00)
    expect(report.total.grossProfitSatang).toBe(65_000_00)
  })
})

suite('Profitability — แคชรายวัน + รีเฟรช (`21` §17)', () => {
  it('ผลลัพธ์แคชไว้ทั้งวัน · `refresh` เห็นข้อมูลใหม่ · คำนวณซ้ำได้ค่าเดิม (idempotent)', async () => {
    const caseA = await seedCase({})
    await seedRevenue(caseA, 40_000_00)

    const first = await reports.getProfitability(finance, query({ refresh: false }), NOW)
    expect(first.fromCache).toBe(false)
    expect(first.total.revenueSatang).toBe(40_000_00)

    // ข้อมูลใหม่เข้ามาหลังจากนั้น — คำขอปกติยังเห็นค่าที่แคชไว้
    const caseB = await seedCase({})
    await seedRevenue(caseB, 60_000_00)

    const cached = await reports.getProfitability(finance, query({ refresh: false }), NOW)
    expect(cached.fromCache).toBe(true)
    expect(cached.total.revenueSatang).toBe(40_000_00)
    expect(cached.computedAt).toBe(first.computedAt)

    const refreshed = await reports.getProfitability(finance, query({ refresh: true }), NOW)
    expect(refreshed.fromCache).toBe(false)
    expect(refreshed.total.revenueSatang).toBe(100_000_00)

    const again = await reports.getProfitability(finance, query({ refresh: true }), NOW)
    expect(again.total).toEqual(refreshed.total)
    expect(again.rows).toEqual(refreshed.rows)
  })

  it('แคชแยกตามมิติและช่วงเวลา — ไม่ปนกัน', async () => {
    const caseA = await seedCase({ companyId: COMPANY_A, teamId: TEAM_A })
    await seedRevenue(caseA, 20_000_00, { companyId: COMPANY_A })

    const byCompany = await reports.getProfitability(finance, query({ refresh: false }), NOW)
    const byTeam = await reports.getProfitability(finance, query({ dimension: 'team', refresh: false }), NOW)

    expect(byCompany.rows[0]?.key).toBe(COMPANY_A)
    expect(byTeam.rows[0]?.key).toBe(TEAM_A)
  })
})

suite('Profitability — drill-down (`21` §15)', () => {
  it('ยอดตรงกับตารางสรุป + แยกต้นทุนตามชนิด + บอกเคสที่ไม่มีรายได้', async () => {
    const success = await seedCase({ companyId: COMPANY_A })
    await seedRevenue(success, 100_000_00, { companyId: COMPANY_A })
    await seedExpense({ caseId: success, grossSatang: 12_000_00, expenseType: 'fuel' })
    await seedExpense({ caseId: success, grossSatang: 3_000_00, expenseType: 'allowance' })
    await seedExpense({ caseId: success, grossSatang: 20_000_00, expenseType: 'commission' })

    const failed = await seedCase({ companyId: COMPANY_A, outcome: 'closed_fail' })
    await seedExpense({ caseId: failed, grossSatang: 5_000_00, expenseType: 'fuel' })
    await seedExpense({ caseId: failed, grossSatang: 1_000_00, expenseType: 'no_success_fee' })

    const summary = await reports.getProfitability(finance, query(), NOW)
    const drill = await reports.getProfitabilityDrilldown(finance, COMPANY_A, query(), NOW)

    expect(drill.revenueSatang).toBe(summary.rows[0]?.revenueSatang)
    expect(drill.directCostSatang).toBe(summary.rows[0]?.directCostSatang)
    expect(drill.marginPct).toBe(summary.rows[0]?.marginPct)
    expect(drill.dimensionLabel).toBe('ไฟแนนซ์ A 3.8')

    expect(drill.costBreakdown.map((row) => [row.expenseType, row.count, row.amountSatang])).toEqual([
      ['fuel', 2, 17_000_00],
      ['allowance', 1, 3_000_00],
      ['commission', 1, 20_000_00],
      ['no_success_fee', 1, 1_000_00],
    ])
    expect(drill.lossMaking).toEqual({ caseCount: 1, costSatang: 6_000_00 })
  })

  it('มิติที่ไม่มีข้อมูลในช่วงเวลานั้น ⇒ 404 (`24` §6.1)', async () => {
    await expect(reports.getProfitabilityDrilldown(finance, COMPANY_B, query(), NOW)).rejects.toSatisfy(
      (error: unknown) => (error as { code?: string }).code === 'COMPANY_NOT_FOUND',
    )
    await expect(
      reports.getProfitabilityDrilldown(finance, TEAM_B, query({ dimension: 'team' }), NOW),
    ).rejects.toSatisfy((error: unknown) => (error as { code?: string }).code === 'TEAM_NOT_FOUND')
  })
})

suite('Dashboard KPI (`14` §6.1/§16)', () => {
  it('KPI 4 ตัวตรงกับข้อมูลจริงในไฟล์ต้นทาง', async () => {
    // เงินรออนุมัติ — นับเฉพาะที่ยังอยู่ในสายอนุมัติ (approved/rejected/superseded ไม่นับ)
    await seedExpense({ caseId: null, grossSatang: 3_000_00, status: 'pending_approval' })
    await seedExpense({ caseId: null, grossSatang: 2_000_00, status: 'pending_finance_approval' })
    await seedExpense({ caseId: null, grossSatang: 9_000_00, status: 'rejected' })
    await seedExpense({ caseId: null, grossSatang: 8_000_00, status: 'superseded' })

    // เงินรอจ่าย — รอบที่ยังไม่ completed
    await seedPayoutBatch({ netSatang: 15_000_00, status: 'draft' })
    await seedPayoutBatch({ netSatang: 25_000_00, status: 'file_generated' })
    await seedPayoutBatch({ netSatang: 99_000_00, status: 'completed' })

    // ยอดค้างรับ — บิลที่ส่งแล้วเท่านั้น (draft ยังไม่ใช่ลูกหนี้) · WHT ที่ลูกค้าหักถือว่ารับแล้ว
    await seedBillingBatch({ totalSatang: 100_000_00, receivedSatang: 30_000_00, status: 'partially_paid' })
    await seedBillingBatch({ totalSatang: 50_000_00, whtSatang: 50_000_00, status: 'paid' })
    await seedBillingBatch({ totalSatang: 77_000_00, status: 'draft' })

    // กำไรขั้นต้นเดือนนี้
    const caseA = await seedCase({})
    await seedRevenue(caseA, 200_000_00)
    await seedExpense({ caseId: caseA, grossSatang: 50_000_00 })

    const dashboard = await reports.getDashboardKpi(finance, { refresh: true }, NOW)
    const kpi = (id: string) => dashboard.kpis.find((item) => item.id === id)

    expect(dashboard.kpis).toHaveLength(4)
    expect(kpi('pending_approval')).toMatchObject({ amountSatang: 5_000_00, hint: '2 รายการ' })
    expect(kpi('pending_payout')).toMatchObject({ amountSatang: 40_000_00, hint: '2 รอบ' })
    expect(kpi('ar_outstanding')?.amountSatang).toBe(70_000_00)
    expect(kpi('gross_profit')).toMatchObject({ amountSatang: 150_000_00, marginPct: 75 })
    expect(dashboard.periodLabel).toBe('สิงหาคม 2569')
  })

  it('ยอดของ KPI คิดหลัง adjustment ที่ approved แล้ว (`20` §9)', async () => {
    const claimId = await seedExpense({ caseId: null, grossSatang: 10_000_00, status: 'pending_approval' })
    const payoutId = await seedPayoutBatch({ netSatang: 20_000_00 })
    const billingId = await seedBillingBatch({ totalSatang: 30_000_00 })

    await seedAdjustment({ target: 'expense', targetId: claimId, amountSatang: 1_000_00, adjustmentType: 'decrease' })
    await seedAdjustment({ target: 'payout_batch', targetId: payoutId, amountSatang: 2_000_00, adjustmentType: 'increase' })
    await seedAdjustment({ target: 'billing_batch', targetId: billingId, amountSatang: 5_000_00, adjustmentType: 'decrease' })

    const dashboard = await reports.getDashboardKpi(finance, { refresh: true }, NOW)
    const kpi = (id: string) => dashboard.kpis.find((item) => item.id === id)

    expect(kpi('pending_approval')?.amountSatang).toBe(9_000_00)
    expect(kpi('pending_payout')?.amountSatang).toBe(22_000_00)
    expect(kpi('ar_outstanding')?.amountSatang).toBe(25_000_00)
  })

  it('ไม่มีข้อมูลเลย ⇒ ศูนย์ทุกการ์ด และ margin เป็น null (ไม่หารศูนย์)', async () => {
    const dashboard = await reports.getDashboardKpi(finance, { refresh: true }, NOW)

    expect(dashboard.kpis.map((item) => item.amountSatang)).toEqual([0, 0, 0, 0])
    expect(dashboard.kpis.find((item) => item.id === 'gross_profit')?.marginPct).toBeNull()
    expect(dashboard.exceptions).toEqual({ critical: 0, warning: 0, info: 0, total: 0 })
  })
})

suite('Dashboard — Exceptions (`14` §6.2/§8)', () => {
  it('เรียง critical ก่อน + นับตามระดับ + ลิงก์กลับต้นทาง', async () => {
    await seedException({ level: 'info', sourceModule: 'billing' })
    await seedException({ level: 'critical', sourceModule: 'bank' })
    await seedException({ level: 'warning', sourceModule: 'payout' })

    const list = await reports.getExceptions(finance, { level: 'all', status: 'open' })

    expect(list.rows.map((row) => row.level)).toEqual(['critical', 'warning', 'info'])
    expect(list.counts).toEqual({ critical: 1, warning: 1, info: 1, total: 3 })
    expect(list.rows[0]).toMatchObject({ link: '/accounting', periodLabel: 'สิงหาคม 2569' })
    expect(list.rows.find((row) => row.sourceModule === 'payout')?.link).toBe('/finance?tab=payout')
    expect(list.rows.find((row) => row.sourceModule === 'billing')?.sourceModuleLabel).toBe('วางบิล (19)')
  })

  it('ค่าเริ่มต้นแสดงเฉพาะที่ยังเปิดอยู่ · กรองตามระดับได้', async () => {
    await seedException({ level: 'critical', sourceModule: 'billing' })
    await seedException({ level: 'critical', sourceModule: 'billing', status: 'resolved' })
    await seedException({ level: 'warning', sourceModule: 'billing' })

    const open = await reports.getExceptions(finance, { level: 'all', status: 'open' })
    expect(open.counts.total).toBe(2)

    const criticalOnly = await reports.getExceptions(finance, { level: 'critical', status: 'all' })
    expect(criticalOnly.counts).toEqual({ critical: 2, warning: 0, info: 0, total: 2 })
  })

  it('exception ที่ยังเปิดอยู่ถูกนับในแดชบอร์ด (ตัวบล็อก Export Accounting Pack)', async () => {
    await seedException({ level: 'critical', sourceModule: 'bank' })
    await seedException({ level: 'warning', sourceModule: 'payout' })
    await seedException({ level: 'critical', sourceModule: 'wht', status: 'authorized' })

    const dashboard = await reports.getDashboardKpi(finance, { refresh: true }, NOW)
    expect(dashboard.exceptions).toEqual({ critical: 1, warning: 1, info: 0, total: 2 })
  })
})
