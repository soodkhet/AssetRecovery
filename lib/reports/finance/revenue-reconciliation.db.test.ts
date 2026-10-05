import { randomUUID } from 'node:crypto'
import { PrismaPg } from '@prisma/adapter-pg'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { SessionUser } from '@/lib/auth/types'
import { PrismaClient } from '@/lib/generated/prisma/client'
import { clearReportCache } from '@/lib/reports/cache'
import { findReport } from '@/lib/reports/catalog'
import type { ReportPayload } from '@/lib/reports/payload'
import { resolveReportRange } from '@/lib/reports/range'

/**
 * U44 (มติ PO 05/10/2569) — บรรทัดกระทบยอด F2 ↔ ใบกำกับภาษี ระดับ DB ผ่าน `runReport()` ตัวจริง
 *
 * ใบลดหนี้ลบไม่ได้ (trigger immutable) ⇒ ไฟล์นี้ใช้**องค์กรใหม่ทุกครั้งที่รัน** แทนการ cleanup
 * (แนวเดียวกับ `credit-notes.db.test.ts`) · ⚠️ ตั้ง `DATABASE_URL` ก่อน import service
 */

const url = process.env.TEST_DATABASE_URL
const suite = url ? describe : describe.skip

const ORG_ID = randomUUID()
const ROLE_ID = randomUUID()
const USER_ID = randomUUID()
const TEAM_ID = randomUUID()
const COMPANY_ID = randomUUID()
const NOW = new Date('2026-08-15T05:00:00Z')
const RANGE = resolveReportRange({ preset: 'this_month' }, NOW)
const TAG = ORG_ID.slice(0, 8)

let client: PrismaClient | null = null
let runner: typeof import('@/lib/reports/run')

function db(): PrismaClient {
  if (!url) throw new Error('ไม่มี TEST_DATABASE_URL')
  if (!client) {
    const parsed = new URL(url)
    if (!['localhost', '127.0.0.1', '::1', 'postgres'].includes(parsed.hostname) || !parsed.pathname.includes('test')) {
      throw new Error('TEST_DATABASE_URL ต้องเป็น DB ทดสอบบนเครื่องเท่านั้น')
    }
    client = new PrismaClient({ adapter: new PrismaPg({ connectionString: url }) })
  }
  return client
}

const finance: SessionUser = {
  id: USER_ID,
  organizationId: ORG_ID,
  supabaseUid: `uid-${TAG}`,
  email: `recon-${TAG}@test.local`,
  fullName: 'การเงิน กระทบยอด',
  status: 'active',
  roleId: ROLE_ID,
  roleName: 'การเงิน',
  roleGroup: 'system',
  isSuperadmin: false,
  teamId: null,
  companyId: null,
  capabilities: { manage_billing: 'manage' },
  scope: { kind: 'global', teamIds: [], companyId: null, userId: USER_ID },
  loginAt: NOW.toISOString(),
}

async function run(): Promise<ReportPayload> {
  const report = findReport('revenue-summary')
  if (report === null) throw new Error('ไม่รู้จักรายงาน')
  // refresh มี cooldown 5 นาที ⇒ ล้างแคชเองทุกครั้งที่ข้อมูลเปลี่ยน
  await clearReportCache()
  return runner.runReport(finance, report, { range: RANGE, refresh: true, params: { groupBy: 'company' }, now: NOW })
}

let seq = 0
async function seedRevenue(grossSatang: number, billingBatchId: string | null): Promise<string> {
  seq += 1
  const caseRef = `RCN-${TAG}-${seq}`
  const cases = await db().$queryRawUnsafe<{ id: string }[]>(`
    INSERT INTO cases (organization_id, case_ref, case_ref_normalized, company_id, source, status, created_by,
                       debtor_name, addr_province, addr_district, asset_kind, asset_description, debt_amount_satang,
                       assigned_team_id, outcome, closed_at, service_fee_model_snapshot, service_fee_base_satang,
                       service_fee_rate_pct, service_fee_basis_snapshot)
    VALUES ('${ORG_ID}', '${caseRef}', '${caseRef}', '${COMPANY_ID}', 'manual', 'closed_success', '${USER_ID}',
            'ลูกหนี้ ${seq}', 'เชียงใหม่', 'เมือง', 'smartphone', 'iPhone', 1000000, '${TEAM_ID}', 'closed_success',
            '2026-08-10T03:00:00Z', 'SUCCESS_FEE', 0, 10, 'debt_amount')
    RETURNING id
  `)
  const vat = Math.round(grossSatang * 0.07)
  const rows = await db().$queryRawUnsafe<{ id: string }[]>(`
    INSERT INTO revenues (organization_id, case_id, company_id, billing_batch_id, gross_satang, vat_satang, vat_rate_pct_used,
                          total_satang, fee_model_snapshot, vat_mode_snapshot, status, revenue_date, created_by)
    VALUES ('${ORG_ID}', '${cases[0]?.id ?? ''}', '${COMPANY_ID}', ${billingBatchId === null ? 'NULL' : `'${billingBatchId}'`},
            ${grossSatang}, ${vat}, 7.00, ${grossSatang + vat}, 'SUCCESS_FEE', 'exclude_vat',
            '${billingBatchId === null ? 'ready_for_billing' : 'billed'}', '2026-08-10', '${USER_ID}')
    RETURNING id
  `)
  return rows[0]?.id ?? ''
}

async function seedAdjustment(revenueId: string, type: 'increase' | 'decrease', amount: number): Promise<string> {
  const rows = await db().$queryRawUnsafe<{ id: string }[]>(`
    INSERT INTO adjustments (organization_id, adjustment_type, amount_satang, reason, status, revenue_id,
                             approved_by, approved_at, created_by)
    VALUES ('${ORG_ID}', '${type}', ${amount}, 'ปรับค่าบริการ', 'approved', '${revenueId}', '${USER_ID}', now(), '${USER_ID}')
    RETURNING id
  `)
  return rows[0]?.id ?? ''
}

async function seedNote(invoiceId: string, type: 'credit' | 'debit', amount: number, adjustmentId: string | null): Promise<void> {
  seq += 1
  const vat = Math.round(amount * 0.07)
  await db().$executeRawUnsafe(`
    INSERT INTO credit_notes (organization_id, tax_invoice_id, note_type, adjustment_id, credit_note_number, issue_date,
                              amount_before_vat_satang, vat_satang, total_satang, vat_rate_pct_used, reason, created_by)
    VALUES ('${ORG_ID}', '${invoiceId}', '${type}', ${adjustmentId === null ? 'NULL' : `'${adjustmentId}'`},
            'CN-${TAG}-${seq}', '2026-08-20', ${amount}, ${vat}, ${amount + vat}, 7, 'เอกสารทดสอบ', '${USER_ID}')
  `)
}

let invoiceId = ''
let billingBatchId = ''
const revenueIds: string[] = []

beforeAll(async () => {
  if (!url) return
  process.env.DATABASE_URL = url
  runner = await import('@/lib/reports/run')
  const tx = db()
  await tx.$executeRawUnsafe(
    `INSERT INTO organizations (id, name, tax_id, address) VALUES ('${ORG_ID}', 'Recon ${TAG}', '99${Date.now().toString().slice(-11)}', 'ที่อยู่ทดสอบ')`,
  )
  await tx.$executeRawUnsafe(
    `INSERT INTO roles (id, organization_id, name, role_group, is_seed) VALUES ('${ROLE_ID}', '${ORG_ID}', 'การเงิน ${TAG}', 'system', false)`,
  )
  await tx.$executeRawUnsafe(
    `INSERT INTO users (id, organization_id, role_id, email, full_name, status) VALUES ('${USER_ID}', '${ORG_ID}', '${ROLE_ID}', 'recon-${TAG}@test.local', 'การเงิน กระทบยอด', 'active')`,
  )
  await tx.$executeRawUnsafe(
    `INSERT INTO teams (id, organization_id, name, side, provinces, status, created_by) VALUES ('${TEAM_ID}', '${ORG_ID}', 'ทีม ${TAG}', 'inhouse', ARRAY['เชียงใหม่'], 'active', '${USER_ID}')`,
  )
  await tx.$executeRawUnsafe(`
    INSERT INTO finance_companies (id, organization_id, name, short_name, tax_id, vat_mode, payment_due_days, created_by)
    VALUES ('${COMPANY_ID}', '${ORG_ID}', 'ไฟแนนซ์ ${TAG}', 'R${TAG.slice(0, 3)}', '01${Date.now().toString().slice(-11)}', 'exclude_vat', 30, '${USER_ID}')
  `)
  const period = await tx.$queryRawUnsafe<{ id: string }[]>(`
    INSERT INTO accounting_periods (organization_id, period_label, year_be, month, status, created_by)
    VALUES ('${ORG_ID}', 'สิงหาคม 2569', 2569, 8, 'collecting', '${USER_ID}') RETURNING id
  `)
  const batch = await tx.$queryRawUnsafe<{ id: string }[]>(`
    INSERT INTO billing_batches (organization_id, company_id, period, status, total_satang, due_date, created_by)
    VALUES ('${ORG_ID}', '${COMPANY_ID}', 'สิงหาคม 2569', 'sent', 399110, '2026-09-30', '${USER_ID}') RETURNING id
  `)
  billingBatchId = batch[0]?.id ?? ''
  // เคส UAT C1/C2/C4 รวม 373000 ในใบกำกับเดียว
  for (const gross of [124_000, 124_000, 125_000]) revenueIds.push(await seedRevenue(gross, billingBatchId))
  const sales = await tx.$queryRawUnsafe<{ id: string }[]>(`
    INSERT INTO sales_records (organization_id, period_id, billing_batch_id, company_id, total_before_vat_satang, vat_satang, total_satang, created_by)
    VALUES ('${ORG_ID}', '${period[0]?.id ?? ''}', '${billingBatchId}', '${COMPANY_ID}', 373000, 26110, 399110, '${USER_ID}') RETURNING id
  `)
  const invoice = await tx.$queryRawUnsafe<{ id: string }[]>(`
    INSERT INTO tax_invoices (organization_id, sales_record_id, invoice_number, invoice_date, buyer_branch_code, created_by)
    VALUES ('${ORG_ID}', '${sales[0]?.id ?? ''}', 'INV-${TAG}', '2026-08-12', '00000', '${USER_ID}') RETURNING id
  `)
  invoiceId = invoice[0]?.id ?? ''
})

afterAll(async () => {
  await client?.$disconnect()
})

const line = (payload: ReportPayload, key: string): number | undefined =>
  payload.reconciliation?.lines.find((row) => row.key === key)?.amountSatang

suite('U44 — บรรทัดกระทบยอด F2 กับใบกำกับภาษี', () => {
  it('Adjustment ลดยอดรอใบลดหนี้: 373000 − 10000 = 363000 ลงพอดี · ออกใบลดหนี้แล้วยังลง · ใบที่ไม่อ้าง Adjustment ⇒ ผลต่าง', async () => {
    const decreaseId = await seedAdjustment(revenueIds[0] ?? '', 'decrease', 10_000)

    const awaiting = await run()
    expect(awaiting.totalRow?.['revenueSatang']).toBe(363_000)
    expect(line(awaiting, 'invoiced')).toBe(373_000)
    expect(line(awaiting, 'awaitingCredit')).toBe(10_000)
    expect(line(awaiting, 'reportTotal')).toBe(363_000)
    expect(awaiting.reconciliation?.balanced).toBe(true)

    // สำนักงานบัญชีออกใบลดหนี้อ้าง Adjustment ⇒ ย้ายบรรทัด
    await seedNote(invoiceId, 'credit', 10_000, decreaseId)
    const documented = await run()
    expect(line(documented, 'creditNotes')).toBe(10_000)
    expect(line(documented, 'awaitingCredit')).toBe(0)
    expect(documented.reconciliation?.balanced).toBe(true)

    // รายได้ที่ยังไม่ออกใบกำกับ แยกบรรทัด ยังลง
    await seedRevenue(50_000, null)
    const withUnbilled = await run()
    expect(line(withUnbilled, 'uninvoiced')).toBe(50_000)
    expect(withUnbilled.reconciliation?.balanced).toBe(true)

    // ใบลดหนี้ที่ไม่อ้าง Adjustment ⇒ รายงานไม่ได้ลด ⇒ แสดงผลต่าง +3000
    await seedNote(invoiceId, 'credit', 3_000, null)
    const unbalanced = await run()
    expect(unbalanced.reconciliation?.balanced).toBe(false)
    expect(unbalanced.reconciliation?.differenceSatang).toBe(3_000)
    expect(line(unbalanced, 'difference')).toBe(3_000)
  })

  it('ผู้ที่เห็นเฉพาะทีมไม่ได้บรรทัดกระทบยอด (เอกสารออกระดับรอบวางบิล)', async () => {
    const report = findReport('revenue-summary')
    if (report === null) throw new Error('ไม่รู้จักรายงาน')
    const teamUser: SessionUser = {
      ...finance,
      roleGroup: 'inhouse',
      teamId: TEAM_ID,
      capabilities: { view_finance_dashboard: 'view', manage_billing: 'manage' },
      scope: { kind: 'team', teamIds: [TEAM_ID], companyId: null, userId: USER_ID },
    }
    const payload = await runner.runReport(teamUser, report, {
      range: RANGE,
      refresh: true,
      params: { groupBy: 'company' },
      now: NOW,
    })
    expect(payload.rows.length).toBeGreaterThan(0)
    expect(payload.reconciliation).toBeNull()
  })
})
