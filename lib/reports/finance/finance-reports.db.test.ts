import { PrismaPg } from '@prisma/adapter-pg'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import type { SessionUser } from '@/lib/auth/types'
import { PrismaClient } from '@/lib/generated/prisma/client'
import { clearReportCache } from '@/lib/reports/cache'
import { findReport } from '@/lib/reports/catalog'
import type { ReportPayload, ReportRow } from '@/lib/reports/payload'
import { resolveReportRange } from '@/lib/reports/range'

/**
 * เทสต์ระดับ DB ของ **รายงานหมวด F (F1–F5)** — DoD ของ `96` §13/§14
 *
 *  - F1: Revenue/Cost/Profit ตรงกับไฟล์ 19+17 · drill-down รายเคสรวมแล้วเท่าแถวสรุป (`21` §15)
 *  - F2: จัดกลุ่มรายเดือน (ป้าย พ.ศ.) · % สำเร็จ นับเฉพาะเคสที่ปิดแล้ว · ยอดหลัง adjustment (`20` §9)
 *  - F3: bucket ตรงกับ `due_date` จริง · บิล `draft` ไม่ใช่ลูกหนี้ · WHT ที่ลูกค้าหักถือว่าชำระแล้ว
 *  - F4: ยอดจาก snapshot ของ `payout_batch_items` · รายการเงินทดรอง (A4) ไม่ใช่ค่าตอบแทน
 *  - F5: **due วันนี้ยังไม่ overdue** (นับวันถัดไป) · รายการที่ยังเป็น `approved` ต้องไม่หาย
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
  console.warn('[finance-reports.db.test] ข้ามเทสต์ระดับ DB — ไม่มี TEST_DATABASE_URL (ดู .env.example)')
}

const ORG_ID = '00000000-0000-4000-8000-0000000062a0'
const ROLE_FINANCE = '00000000-0000-4000-8000-0000000062a1'
const FINANCE_ID = '00000000-0000-4000-8000-0000000062a2'
const TEAM_A = '00000000-0000-4000-8000-0000000062a3'
const TEAM_B = '00000000-0000-4000-8000-0000000062a4'
const COMPANY_A = '00000000-0000-4000-8000-0000000062a5'
const COMPANY_B = '00000000-0000-4000-8000-0000000062a6'
const ROLE_AGENT = '00000000-0000-4000-8000-0000000062a7'
const AGENT_A = '00000000-0000-4000-8000-0000000062a8'
const AGENT_B = '00000000-0000-4000-8000-0000000062a9'
const PAYEE_A = '00000000-0000-4000-8000-0000000062b0'
const PAYEE_B = '00000000-0000-4000-8000-0000000062b1'

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

const finance: SessionUser = {
  id: FINANCE_ID,
  organizationId: ORG_ID,
  supabaseUid: 'uid-finance-62',
  email: 'finance62@test.local',
  fullName: 'การเงิน 6.2',
  status: 'active',
  roleId: ROLE_FINANCE,
  roleName: 'การเงิน',
  roleGroup: 'system',
  isSuperadmin: false,
  teamId: null,
  companyId: null,
  // หมวด F ผูกกับ capability ระดับ manage ของฝ่ายการเงิน (`96` §10 · `lib/reports/access.ts`)
  capabilities: { manage_billing: 'manage' },
  scope: { kind: 'global', teamIds: [], companyId: null, userId: FINANCE_ID },
  loginAt: NOW.toISOString(),
}

async function run(reportId: string, params: Record<string, string> = {}): Promise<ReportPayload> {
  const report = findReport(reportId)
  if (report === null) throw new Error(`ไม่รู้จักรายงาน ${reportId}`)
  return runner.runReport(finance, report, { range: RANGE, refresh: true, params, now: NOW })
}

const cell = (row: ReportRow | undefined, key: string): unknown => row?.[key]
const kpiOf = (payload: ReportPayload, key: string): unknown =>
  payload.kpis.find((kpi) => kpi.key === key)?.value

// ── seed helpers ────────────────────────────────────────────────────────────

let seq = 0

async function seedCase(options: {
  companyId?: string
  teamId?: string
  outcome?: 'closed_success' | 'closed_fail'
  closedAt?: string
}): Promise<string> {
  seq += 1
  const caseRef = `RPT62-${seq}-${Date.now()}`
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
      1000000, '${options.teamId ?? TEAM_A}', '${outcome}', '${options.closedAt ?? '2026-08-10T03:00:00Z'}',
      'SUCCESS_FEE', 0, 10, 'debt_amount'
    ) RETURNING id
  `)
  return rows[0]?.id ?? ''
}

async function seedRevenue(
  caseId: string,
  grossSatang: number,
  options: { companyId?: string; revenueDate?: string } = {},
): Promise<string> {
  const vat = Math.round(grossSatang * 0.07)
  const rows = await db().$queryRawUnsafe<{ id: string }[]>(`
    INSERT INTO revenues (organization_id, case_id, company_id, gross_satang, vat_satang, vat_rate_pct_used,
                          total_satang, fee_model_snapshot, vat_mode_snapshot, status, revenue_date, created_by)
    VALUES ('${ORG_ID}', '${caseId}', '${options.companyId ?? COMPANY_A}', ${grossSatang}, ${vat}, 7.00,
            ${grossSatang + vat}, 'SUCCESS_FEE', 'exclude_vat', 'ready_for_billing', '${options.revenueDate ?? '2026-08-10'}',
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
  payeeId?: string
}): Promise<string> {
  const caseId = options.caseId === undefined || options.caseId === null ? 'NULL' : `'${options.caseId}'`
  const rows = await db().$queryRawUnsafe<{ id: string }[]>(`
    INSERT INTO expenses (organization_id, case_id, payee_id, expense_type, gross_satang, expense_date,
                          status, created_by)
    VALUES ('${ORG_ID}', ${caseId}, '${options.payeeId ?? PAYEE_A}', '${options.expenseType ?? 'fuel'}',
            ${options.grossSatang}, '${options.expenseDate ?? '2026-08-10'}',
            '${options.status ?? 'approved'}', '${FINANCE_ID}')
    RETURNING id
  `)
  return rows[0]?.id ?? ''
}

async function seedAdjustment(options: {
  target: 'revenue' | 'expense' | 'billing_batch'
  targetId: string
  amountSatang: number
  adjustmentType: 'increase' | 'decrease'
  status?: 'pending_approval' | 'approved' | 'rejected'
}): Promise<void> {
  const columns: Record<string, string> = {
    revenue: 'revenue_id',
    expense: 'expense_id',
    billing_batch: 'billing_batch_id',
  }
  await db().$executeRawUnsafe(`
    INSERT INTO adjustments (organization_id, adjustment_type, amount_satang, reason, status,
                             ${columns[options.target]}, created_by)
    VALUES ('${ORG_ID}', '${options.adjustmentType}', ${options.amountSatang}, 'เหตุผลทดสอบ 6.2',
            '${options.status ?? 'approved'}', '${options.targetId}', '${FINANCE_ID}')
  `)
}

async function seedBillingBatch(options: {
  totalSatang: number
  dueDate: string
  receivedSatang?: number
  whtSatang?: number
  status?: string
  companyId?: string
}): Promise<string> {
  seq += 1
  const rows = await db().$queryRawUnsafe<{ id: string }[]>(`
    INSERT INTO billing_batches (organization_id, company_id, period, status, total_satang, received_satang,
                                 wht_withheld_by_customer_satang, due_date, created_by)
    VALUES ('${ORG_ID}', '${options.companyId ?? COMPANY_A}', 'รอบทดสอบ ${seq}', '${options.status ?? 'sent'}',
            ${options.totalSatang}, ${options.receivedSatang ?? 0}, ${options.whtSatang ?? 0},
            '${options.dueDate}', '${FINANCE_ID}')
    RETURNING id
  `)
  return rows[0]?.id ?? ''
}

async function seedPayoutBatchWithItems(
  items: readonly {
    payeeId: string
    expenseId?: string
    advanceId?: string
    grossSatang: number
    whtSatang?: number
    netSatang: number
    /** snapshot เงื่อนไขการหัก (U105) — ไม่ส่ง = NULL (รายการเก่า) */
    whtCondition?: 'withhold' | 'pay_always' | 'pay_once'
  }[],
  /** snapshot ค่าตั้งฐาน WHT ของรอบ (U3/U8) — ไม่ส่ง = รอบก่อนมีค่าตั้ง (NULL) */
  whtBaseExpenseTypes?: readonly string[],
): Promise<void> {
  seq += 1
  const gross = items.reduce((sum, item) => sum + item.grossSatang, 0)
  const wht = items.reduce((sum, item) => sum + (item.whtSatang ?? 0), 0)
  const net = items.reduce((sum, item) => sum + item.netSatang, 0)
  const batch = await db().$queryRawUnsafe<{ id: string }[]>(`
    INSERT INTO payout_batches (organization_id, name, side, status, gross_satang, wht_satang, net_satang, created_by,
                                wht_base_expense_types, wht_certificate_mode, wht_income_type_mode)
    VALUES ('${ORG_ID}', 'รอบจ่ายทดสอบ ${seq}', 'inhouse', 'completed', ${gross}, ${wht}, ${net}, '${FINANCE_ID}',
            ${whtBaseExpenseTypes === undefined ? 'NULL' : `ARRAY[${whtBaseExpenseTypes.map((type) => `'${type}'`).join(',')}]::expense_type[]`},
            ${whtBaseExpenseTypes === undefined ? 'NULL' : `'per_payee_batch'`},
            ${whtBaseExpenseTypes === undefined ? 'NULL' : `'all_40_8'`})
    RETURNING id
  `)
  const batchId = batch[0]?.id ?? ''

  for (const item of items) {
    await db().$executeRawUnsafe(`
      INSERT INTO payout_batch_items (organization_id, payout_batch_id, expense_id, advance_id, payee_id,
                                      gross_satang, wht_satang, net_satang, wht_condition, created_by)
      VALUES ('${ORG_ID}', '${batchId}', ${item.expenseId === undefined ? 'NULL' : `'${item.expenseId}'`},
              ${item.advanceId === undefined ? 'NULL' : `'${item.advanceId}'`}, '${item.payeeId}',
              ${item.grossSatang}, ${item.whtSatang ?? 0}, ${item.netSatang},
              ${item.whtCondition === undefined ? 'NULL' : `'${item.whtCondition}'`}, '${FINANCE_ID}')
    `)
  }
}

async function seedAdvance(options: {
  payeeId: string
  approvedSatang: number
  dueClearDate: string
  status?: 'approved' | 'overdue'
}): Promise<string> {
  seq += 1
  const rows = await db().$queryRawUnsafe<{ id: string }[]>(`
    INSERT INTO advances (organization_id, payee_id, requested_satang, approved_satang, used_satang, status,
                          purpose, due_clear_date, approved_by, approved_at, created_by)
    VALUES ('${ORG_ID}', '${options.payeeId}', ${options.approvedSatang}, ${options.approvedSatang}, 0,
            '${options.status ?? 'overdue'}', 'ค่าเดินทางทดสอบ ${seq}', '${options.dueClearDate}',
            '${FINANCE_ID}', '2026-07-01T03:00:00Z', '${FINANCE_ID}')
    RETURNING id
  `)
  return rows[0]?.id ?? ''
}

async function cleanup(): Promise<void> {
  const tx = db()
  await tx.$executeRawUnsafe(`DELETE FROM adjustments WHERE organization_id = '${ORG_ID}'`)
  await tx.$executeRawUnsafe(`DELETE FROM payout_batch_items WHERE organization_id = '${ORG_ID}'`)
  await tx.$executeRawUnsafe(`DELETE FROM payout_batches WHERE organization_id = '${ORG_ID}'`)
  await tx.$executeRawUnsafe(`DELETE FROM advances WHERE organization_id = '${ORG_ID}'`)
  await tx.$executeRawUnsafe(`DELETE FROM revenues WHERE organization_id = '${ORG_ID}'`)
  await tx.$executeRawUnsafe(`DELETE FROM billing_batches WHERE organization_id = '${ORG_ID}'`)
  await tx.$executeRawUnsafe(`DELETE FROM expenses WHERE organization_id = '${ORG_ID}'`)
  await tx.$executeRawUnsafe(`DELETE FROM cases WHERE organization_id = '${ORG_ID}'`)
  await clearReportCache()
}

beforeAll(async () => {
  if (!url) return
  process.env.DATABASE_URL = url
  runner = await import('@/lib/reports/run')

  const tx = db()
  await tx.$executeRawUnsafe(`
    INSERT INTO organizations (id, name, tax_id, address)
    VALUES ('${ORG_ID}', 'Phase62Test', '9999999996200', 'ที่อยู่ทดสอบ 6.2') ON CONFLICT (id) DO NOTHING
  `)
  await tx.$executeRawUnsafe(`
    INSERT INTO roles (id, organization_id, name, role_group, is_seed) VALUES
      ('${ROLE_FINANCE}', '${ORG_ID}', 'การเงิน 6.2', 'system', false),
      ('${ROLE_AGENT}', '${ORG_ID}', 'พนักงาน 6.2', 'outsource', false)
    ON CONFLICT (id) DO NOTHING
  `)
  await tx.$executeRawUnsafe(`
    INSERT INTO users (id, organization_id, role_id, email, full_name, status) VALUES
      ('${FINANCE_ID}', '${ORG_ID}', '${ROLE_FINANCE}', 'finance62@test.local', 'การเงิน 6.2', 'active')
    ON CONFLICT (id) DO NOTHING
  `)
  await tx.$executeRawUnsafe(`
    INSERT INTO teams (id, organization_id, name, side, provinces, status, created_by) VALUES
      ('${TEAM_A}', '${ORG_ID}', 'ทีม A 6.2', 'inhouse', ARRAY['เชียงใหม่'], 'active', '${FINANCE_ID}'),
      ('${TEAM_B}', '${ORG_ID}', 'ทีม B 6.2', 'outsource', ARRAY['ลำพูน'], 'active', '${FINANCE_ID}')
    ON CONFLICT (id) DO NOTHING
  `)
  await tx.$executeRawUnsafe(`
    INSERT INTO users (id, organization_id, role_id, email, full_name, status, team_id) VALUES
      ('${AGENT_A}', '${ORG_ID}', '${ROLE_AGENT}', 'agent62a@test.local', 'สมชาย 6.2', 'active', '${TEAM_A}'),
      ('${AGENT_B}', '${ORG_ID}', '${ROLE_AGENT}', 'agent62b@test.local', 'สมหญิง 6.2', 'active', '${TEAM_B}')
    ON CONFLICT (id) DO NOTHING
  `)
  await tx.$executeRawUnsafe(`
    INSERT INTO payee_profiles (id, organization_id, user_id, payee_type, bank_name, account_name,
                                account_number, national_id, is_verified, created_by) VALUES
      ('${PAYEE_A}', '${ORG_ID}', '${AGENT_A}', 'individual', 'ธนาคารกสิกรไทย', 'สมชาย 6.2',
       '1234509620', '1234509620123', true, '${FINANCE_ID}'),
      ('${PAYEE_B}', '${ORG_ID}', '${AGENT_B}', 'individual', 'ธนาคารกสิกรไทย', 'สมหญิง 6.2',
       '1234509621', '1234509620124', true, '${FINANCE_ID}')
    ON CONFLICT (id) DO NOTHING
  `)
  await tx.$executeRawUnsafe(`
    INSERT INTO finance_companies (id, organization_id, name, short_name, tax_id, vat_mode,
                                   payment_due_days, created_by) VALUES
      ('${COMPANY_A}', '${ORG_ID}', 'ไฟแนนซ์ A 6.2', 'A62', '0105512620001', 'exclude_vat', 30, '${FINANCE_ID}'),
      ('${COMPANY_B}', '${ORG_ID}', 'ไฟแนนซ์ B 6.2', 'B62', '0105512620002', 'exclude_vat', 30, '${FINANCE_ID}')
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

suite('F1 — กำไรขั้นต้น', () => {
  it('รวมรายได้ก่อน VAT + ต้นทุนตรงตามมิติบริษัท และมี badge MoM เทียบเดือนก่อน', async () => {
    const caseA = await seedCase({ companyId: COMPANY_A })
    await seedRevenue(caseA, 100_000_00)
    await seedExpense({ caseId: caseA, grossSatang: 40_000_00, expenseType: 'fuel' })
    // เดือนก่อนหน้า — ฐานของ MoM
    const previous = await seedCase({ companyId: COMPANY_A })
    await seedRevenue(previous, 50_000_00, { revenueDate: '2026-07-10' })

    const payload = await run('gross-profit', { dimension: 'company' })

    expect(payload.range.label).toBe('สิงหาคม 2569')
    expect(payload.rows).toHaveLength(1)
    expect(payload.rows[0]).toMatchObject({
      revenueSatang: 100_000_00,
      directCostSatang: 40_000_00,
      grossProfitSatang: 60_000_00,
      marginPct: 60,
    })
    expect(payload.kpis.find((kpi) => kpi.key === 'revenue')?.mom).toMatchObject({
      previous: 50_000_00,
      changePct: 100,
    })
  })

  it('drill-down รายเคส — ยอดรวมเท่ากับแถวสรุปของมิตินั้น (`21` §15)', async () => {
    const caseA = await seedCase({ companyId: COMPANY_A })
    const caseB = await seedCase({ companyId: COMPANY_A, outcome: 'closed_fail' })
    await seedRevenue(caseA, 80_000_00)
    await seedExpense({ caseId: caseA, grossSatang: 20_000_00 })
    // เคสปิดไม่สำเร็จ: มีแต่ต้นทุน — ต้องอยู่ใน drill-down ด้วย
    await seedExpense({ caseId: caseB, grossSatang: 5_000_00, expenseType: 'no_success_fee' })

    const summary = await run('gross-profit', { dimension: 'company' })
    const drilldown = await run('gross-profit', { dimension: 'company', dimensionId: COMPANY_A })

    expect(drilldown.rows).toHaveLength(2)
    expect(drilldown.totalRow?.['grossProfitSatang']).toBe(cell(summary.rows[0], 'grossProfitSatang'))
    expect(drilldown.rows.map((row) => row['grossProfitSatang'])).toEqual([60_000_00, -5_000_00])
  })

  it('มิติที่ไม่มีข้อมูลในช่วงเวลา = 404 COMPANY_NOT_FOUND (ไม่คืนตารางเปล่าหลอก ๆ)', async () => {
    await expect(run('gross-profit', { dimension: 'company', dimensionId: COMPANY_B })).rejects.toThrow(
      /COMPANY_NOT_FOUND/,
    )
  })
})

suite('F2 — สรุปรายได้', () => {
  it('จัดกลุ่มรายเดือนด้วยป้าย พ.ศ. · % สำเร็จ นับเฉพาะเคสที่ปิดแล้ว', async () => {
    const success = await seedCase({ outcome: 'closed_success' })
    const failed = await seedCase({ outcome: 'closed_fail' })
    await seedRevenue(success, 60_000_00)
    await seedRevenue(failed, 10_000_00)

    const payload = await run('revenue-summary', { groupBy: 'month' })

    expect(payload.rows).toHaveLength(1)
    expect(payload.rows[0]).toMatchObject({
      group: 'สิงหาคม 2569',
      revenueSatang: 70_000_00,
      caseCount: 2,
      successCount: 1,
      failCount: 1,
      successPct: 50,
      revenuePerCaseSatang: 35_000_00,
    })
  })

  it('U55 — เคสปิดไม่สำเร็จ (ไม่มีรายได้) เข้าตัวหาร % สำเร็จตามวันที่ปิด · ปิดนอกช่วงไม่นับ', async () => {
    const success = await seedCase({ outcome: 'closed_success' })
    await seedRevenue(success, 70_000_00)
    await seedCase({ outcome: 'closed_fail' })
    // ปิด 31/07 23:30 เวลาไทย = นอกช่วงเดือนสิงหาคม
    await seedCase({ outcome: 'closed_fail', closedAt: '2026-07-31T16:30:00Z' })

    const payload = await run('revenue-summary', { groupBy: 'company' })

    expect(payload.rows).toHaveLength(1)
    expect(payload.rows[0]).toMatchObject({
      revenueSatang: 70_000_00,
      caseCount: 1,
      successCount: 1,
      failCount: 1,
      successPct: 50,
      revenuePerCaseSatang: 70_000_00,
    })
  })

  it('ยอดต้องเป็นยอดหลัง adjustment ที่ approved เท่านั้น (`20` §9)', async () => {
    const caseA = await seedCase({})
    const revenueId = await seedRevenue(caseA, 100_000_00)
    await seedAdjustment({ target: 'revenue', targetId: revenueId, amountSatang: 10_000_00, adjustmentType: 'decrease' })
    await seedAdjustment({
      target: 'revenue',
      targetId: revenueId,
      amountSatang: 50_000_00,
      adjustmentType: 'increase',
      status: 'pending_approval',
    })

    const payload = await run('revenue-summary', { groupBy: 'company' })

    expect(payload.rows[0]?.['revenueSatang']).toBe(90_000_00)
    expect(kpiOf(payload, 'revenue')).toBe(90_000_00)
  })
})

suite('F3 — อายุหนี้ลูกค้า', () => {
  it('`96` §13 — ยอดลงช่องตาม due_date จริง และบิล draft ยังไม่ใช่ลูกหนี้', async () => {
    await seedBillingBatch({ totalSatang: 100_000_00, dueDate: '2026-08-01' }) // เลย 14 วัน → 0-30
    await seedBillingBatch({ totalSatang: 30_000_00, dueDate: '2026-06-10' }) // เลย 66 วัน → 61-90
    await seedBillingBatch({ totalSatang: 999_999_00, dueDate: '2026-06-10', status: 'draft' })

    const payload = await run('ar-aging')

    expect(payload.columns.map((column) => column.header)).toContain('61-90 วัน')
    expect(payload.rows[0]).toMatchObject({
      outstandingSatang: 130_000_00,
      bucket0: 100_000_00,
      bucket2: 30_000_00,
      batchCount: 2,
    })
    expect(kpiOf(payload, 'over60')).toBe(30_000_00)
    expect(kpiOf(payload, 'over90')).toBe(0)
  })

  it('WHT ที่ลูกค้าหักไว้ถือว่าชำระแล้ว — บิลที่รับครบไม่ค้าง', async () => {
    await seedBillingBatch({
      totalSatang: 107_000_00,
      dueDate: '2026-07-01',
      receivedSatang: 104_000_00,
      whtSatang: 3_000_00,
    })

    const payload = await run('ar-aging')

    expect(payload.rows).toEqual([])
    expect(kpiOf(payload, 'outstanding')).toBe(0)
  })
})

suite('F4 — สรุปค่าตอบแทน', () => {
  it('รายทีม: นับคน/เคสไม่ซ้ำ และไม่รวมรายการเงินทดรองที่จ่ายผ่านรอบเดียวกัน (A4)', async () => {
    const caseA = await seedCase({ teamId: TEAM_A })
    const commission = await seedExpense({
      caseId: caseA,
      grossSatang: 50_000_00,
      expenseType: 'commission',
      payeeId: PAYEE_A,
    })
    const fuel = await seedExpense({ caseId: caseA, grossSatang: 2_000_00, expenseType: 'fuel', payeeId: PAYEE_A })
    const advance = await seedAdvance({ payeeId: PAYEE_B, approvedSatang: 9_999_00, dueClearDate: '2026-09-30' })

    await seedPayoutBatchWithItems([
      { payeeId: PAYEE_A, expenseId: commission, grossSatang: 50_000_00, whtSatang: 1_500_00, netSatang: 48_500_00 },
      { payeeId: PAYEE_A, expenseId: fuel, grossSatang: 2_000_00, netSatang: 2_000_00 },
      { payeeId: PAYEE_B, advanceId: advance, grossSatang: 9_999_00, netSatang: 9_999_00 },
    ])

    const payload = await run('compensation', { groupBy: 'team' })

    expect(payload.rows).toHaveLength(1)
    expect(payload.rows[0]).toMatchObject({
      group: 'ทีม A 6.2',
      teamSide: 'Inhouse',
      memberCount: 1,
      caseCount: 1,
      grossSatang: 52_000_00,
      whtSatang: 1_500_00,
      netSatang: 50_500_00,
    })
    expect(kpiOf(payload, 'compensation')).toBe(52_000_00)
  })

  it('รายพนักงาน: แยกช่องตามชนิดรายการเบิก และใช้ Net ที่ snapshot ไว้', async () => {
    const caseA = await seedCase({ teamId: TEAM_A })
    const commission = await seedExpense({
      caseId: caseA,
      grossSatang: 30_000_00,
      expenseType: 'commission',
      payeeId: PAYEE_A,
    })
    const allowance = await seedExpense({
      caseId: caseA,
      grossSatang: 1_000_00,
      expenseType: 'allowance',
      payeeId: PAYEE_A,
    })
    await seedPayoutBatchWithItems([
      { payeeId: PAYEE_A, expenseId: commission, grossSatang: 30_000_00, whtSatang: 900_00, netSatang: 29_100_00 },
      { payeeId: PAYEE_A, expenseId: allowance, grossSatang: 1_000_00, netSatang: 1_000_00 },
    ])

    const payload = await run('compensation', { groupBy: 'employee' })

    expect(payload.rows[0]).toMatchObject({
      group: 'สมชาย 6.2',
      teamName: 'ทีม A 6.2',
      commissionSatang: 30_000_00,
      allowanceSatang: 1_000_00,
      fuelSatang: 0,
      grossSatang: 31_000_00,
      netSatang: 30_100_00,
    })
  })
})

suite('F4 — ค่าใช้จ่ายตามใบเสร็จแยกคอลัมน์ (มติ PO U53)', () => {
  it('รอบที่ snapshot ค่าตั้งไว้: ค่าที่พัก/เบิกตามใบเสร็จลงช่องค่าใช้จ่าย ไม่ใช่ค่าตอบแทน · Gross รวมเท่าเดิม', async () => {
    const caseA = await seedCase({ teamId: TEAM_A })
    const commission = await seedExpense({ caseId: caseA, grossSatang: 20_000_00, expenseType: 'commission', payeeId: PAYEE_A })
    const hotel = await seedExpense({ caseId: null, grossSatang: 800_00, expenseType: 'hotel', payeeId: PAYEE_A })
    const receipt = await seedExpense({ caseId: null, grossSatang: 300_00, expenseType: 'receipt', payeeId: PAYEE_A })
    await seedPayoutBatchWithItems(
      [
        { payeeId: PAYEE_A, expenseId: commission, grossSatang: 20_000_00, whtSatang: 600_00, netSatang: 19_400_00 },
        { payeeId: PAYEE_A, expenseId: hotel, grossSatang: 800_00, netSatang: 800_00 },
        { payeeId: PAYEE_A, expenseId: receipt, grossSatang: 300_00, netSatang: 300_00 },
      ],
      ['commission', 'no_success_fee', 'fuel', 'allowance'],
    )

    const team = await run('compensation', { groupBy: 'team' })
    expect(team.rows[0]).toMatchObject({
      compensationSatang: 20_000_00,
      receiptSatang: 1_100_00,
      grossSatang: 21_100_00,
      netSatang: 20_500_00,
    })
    expect(kpiOf(team, 'compensation')).toBe(20_000_00)
    expect(kpiOf(team, 'receipt')).toBe(1_100_00)

    const employee = await run('compensation', { groupBy: 'employee' })
    expect(employee.rows[0]).toMatchObject({ commissionSatang: 20_000_00, otherSatang: 0, receiptSatang: 1_100_00 })
  })

  it('รอบก่อนมีค่าตั้ง (snapshot NULL) ⇒ ทุกชนิดอยู่ในฐานตามพฤติกรรมเดิม — ไม่ใช้ค่าตั้งปัจจุบันตีความย้อนหลัง', async () => {
    const hotel = await seedExpense({ caseId: null, grossSatang: 800_00, expenseType: 'hotel', payeeId: PAYEE_A })
    await seedPayoutBatchWithItems([{ payeeId: PAYEE_A, expenseId: hotel, grossSatang: 800_00, netSatang: 800_00 }])

    const team = await run('compensation', { groupBy: 'team' })
    expect(team.rows[0]).toMatchObject({ compensationSatang: 800_00, receiptSatang: 0, grossSatang: 800_00 })
  })
})

suite('F4 — ภาษีที่บริษัทออกให้แยกคอลัมน์ (มติ PO U109)', () => {
  it('เงื่อนไข (1)/(2)/(3) ปนกัน: ค่าตอบแทน = เงินได้จริง · ภาษีที่บริษัทออกให้แยกช่อง · WHT = ที่หักจากผู้รับ', async () => {
    const caseA = await seedCase({ teamId: TEAM_A })
    const caseA2 = await seedCase({ teamId: TEAM_A })
    const caseB = await seedCase({ teamId: TEAM_B })
    const c1 = await seedExpense({ caseId: caseA, grossSatang: 10_000_00, expenseType: 'commission', payeeId: PAYEE_A })
    const c2 = await seedExpense({ caseId: caseA2, grossSatang: 10_000_00, expenseType: 'commission', payeeId: PAYEE_A })
    const c3 = await seedExpense({ caseId: caseB, grossSatang: 10_000_00, expenseType: 'commission', payeeId: PAYEE_B })
    // เงินได้ ฿10,000 อัตรา 3%: (1) หัก 300 · (2) ออกให้ตลอดไป 309.28 · (3) ออกให้ครั้งเดียว 300
    await seedPayoutBatchWithItems([
      { payeeId: PAYEE_A, expenseId: c1, grossSatang: 10_000_00, whtSatang: 300_00, netSatang: 9_700_00, whtCondition: 'withhold' },
      { payeeId: PAYEE_A, expenseId: c2, grossSatang: 10_309_28, whtSatang: 309_28, netSatang: 10_000_00, whtCondition: 'pay_always' },
      { payeeId: PAYEE_B, expenseId: c3, grossSatang: 10_300_00, whtSatang: 300_00, netSatang: 10_000_00, whtCondition: 'pay_once' },
    ])

    const employee = await run('compensation', { groupBy: 'employee' })
    const byName = (name: string) => employee.rows.find((row) => row['group'] === name)
    expect(byName('สมชาย 6.2')).toMatchObject({
      commissionSatang: 20_000_00,
      whtPaidByPayerSatang: 309_28,
      grossSatang: 20_309_28,
      whtSatang: 300_00,
      netSatang: 19_700_00,
    })
    expect(byName('สมหญิง 6.2')).toMatchObject({
      commissionSatang: 10_000_00,
      whtPaidByPayerSatang: 300_00,
      whtSatang: 0,
      netSatang: 10_000_00,
    })

    const team = await run('compensation', { groupBy: 'team' })
    expect(team.totalRow).toMatchObject({
      compensationSatang: 30_000_00,
      whtPaidByPayerSatang: 609_28,
      grossSatang: 30_609_28,
      whtSatang: 300_00,
      netSatang: 29_700_00,
    })
    expect(kpiOf(team, 'compensation')).toBe(30_000_00)
    expect(kpiOf(team, 'whtPaidByPayer')).toBe(609_28)
    expect(kpiOf(team, 'wht')).toBe(300_00)
    expect(kpiOf(team, 'net')).toBe(29_700_00)
  })
})

suite('F5 — อายุเงินทดรองคงค้าง (มติ U96 #18)', () => {
  it('ยังไม่เคลียร์: ครบกำหนดวันนี้ยังไม่เกินกำหนด · ของวันก่อนหน้าเกิน — ทั้งสองใบอยู่ในรายงาน ไม่หาย ไม่ซ้ำ', async () => {
    await seedAdvance({ payeeId: PAYEE_A, approvedSatang: 5_000_00, dueClearDate: '2026-08-15', status: 'approved' })
    await seedAdvance({
      payeeId: PAYEE_B,
      approvedSatang: 8_000_00,
      dueClearDate: '2026-08-10',
      status: 'approved',
    })

    const payload = await run('advance-overdue')

    expect(payload.rows).toHaveLength(2)
    const byPayee = new Map(payload.rows.map((row) => [row['payeeName'], row]))
    expect(byPayee.get('สมหญิง 6.2')).toMatchObject({
      teamName: 'ทีม B 6.2',
      approvedSatang: 8_000_00,
      outstandingSatang: 8_000_00,
      // job ยังไม่พลิกสถานะ แต่รายงานต้องเห็น (ตัดสินจากวันครบกำหนดจริง)
      statusLabel: 'เกินกำหนดเคลียร์ 5 วัน',
    })
    expect(byPayee.get('สมชาย 6.2')?.['statusLabel']).toBe('อนุมัติแล้ว — รอเคลียร์ยอด')
    expect(kpiOf(payload, 'amount')).toBe(13_000_00)
    expect(kpiOf(payload, 'overdueAmount')).toBe(8_000_00)
    expect(kpiOf(payload, 'count')).toBe(2)
  })

  it('เคลียร์แล้วคืนบางส่วน: คงค้าง = ยอดคืน − ที่ได้คืน (ไม่นับแถวที่กลับรายการ) · อายุจากวันจ่ายของรอบที่โอนแล้ว · รายพนักงาน', async () => {
    const advanceId = await seedAdvance({ payeeId: PAYEE_A, approvedSatang: 5_000_00, dueClearDate: '2026-07-20' })
    await seedPayoutBatchWithItems([{ payeeId: PAYEE_A, advanceId, grossSatang: 5_000_00, netSatang: 5_000_00 }])
    await db().$executeRawUnsafe(
      `UPDATE payout_batches SET payment_file_generated_at = '2026-05-10T03:00:00Z' WHERE organization_id = '${ORG_ID}'`,
    )
    await db().$executeRawUnsafe(
      `UPDATE advances SET status = 'cleared', used_satang = 300000, return_method = 'separate', cleared_at = now() WHERE id = '${advanceId}'`,
    )
    for (const [amount, reversed] of [[50_000, false], [70_000, true]] as const) {
      await db().$executeRawUnsafe(`
        INSERT INTO advance_returns (organization_id, advance_id, payee_id, channel, amount_satang, received_date,
                                     evidence_file_path, reversed_at, reversed_by, reversal_reason, created_by)
        VALUES ('${ORG_ID}', '${advanceId}', '${PAYEE_A}', 'cash', ${amount}, '2026-08-01', 'advance-returns/x.pdf',
                ${reversed ? `now(), '${FINANCE_ID}', 'บันทึกผิด'` : 'NULL, NULL, NULL'}, '${FINANCE_ID}')
      `)
    }

    const payload = await run('advance-overdue')
    expect(payload.rows).toHaveLength(1)
    expect(payload.rows[0]).toMatchObject({
      paidAt: '2026-05-10T03:00:00.000Z',
      approvedSatang: 5_000_00,
      usedSatang: 3_000_00,
      returnedSatang: 500_00,
      outstandingSatang: 1_500_00,
      ageDays: 97,
      bucketLabel: '90+ วัน',
      statusLabel: 'เคลียร์ยอดแล้ว — รอรับคืนยอดคงเหลือ',
    })

    const byPayee = await run('advance-overdue', { groupBy: 'payee' })
    expect(byPayee.rows[0]).toMatchObject({ advanceCount: 1, outstandingSatang: 1_500_00, bucket3: 1_500_00 })
  })
})
