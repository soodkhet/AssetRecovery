import { PrismaPg } from '@prisma/adapter-pg'
import type { NextRequest } from 'next/server'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  COMPANY_ADMIN_ROLE_NAME,
  COMPANY_MANAGER_ROLE_NAME,
  COMPANY_SUPERVISOR_ROLE_NAME,
} from '@/lib/auth/constants'
import type { SessionUser } from '@/lib/auth/types'
import { bangkokBusinessDate } from '@/lib/field/expense-queries'
import { PrismaClient } from '@/lib/generated/prisma/client'
import type { CapabilityAccessLevel } from '@/lib/generated/prisma/enums'
import type {
  PortalArAgingDto,
  PortalBillingBatchDto,
  PortalRevenueSummaryDto,
  PortalTaxInvoiceDto,
} from '@/lib/portal/serializers'
import { DEFAULT_ROLE_CAPABILITIES } from '@/lib/roles/default-matrix'

/**
 * เทสต์ระดับ DB ของ API การเงินในพอร์ทัล (Portal-P5 · `97` §6.2/§6.3/§6.5/§17/§20 · มติ U6/O43 D7/D9/O44)
 *
 * - CO1 เห็นเฉพาะของ CO1 · รอบวางบิล `draft` ไม่แสดงและไม่นับในยอดใด ๆ
 * - ยอดค้าง (รายการ + AR aging) **เท่ากับ AR ภายใน** (`getArAging`) ของบริษัทเดียวกัน — สูตรเดียว
 *   (`arOutstandingSatang` หัก WHT ที่ลูกค้าหักแล้ว)
 * - หัวหน้า/แอดมินบริษัท (ค่าเริ่มต้นไม่มี `portal_finance`) / ผู้ใช้ภายใน ⇒ 403 + audit `access_denied`
 * - ดาวน์โหลดใบกำกับของ CO2 ด้วยผู้ใช้ CO1 ⇒ 403 · ของตัวเอง ⇒ PDF จริง + audit `export`
 *
 * ⚠️ ต้องตั้ง `DATABASE_URL = TEST_DATABASE_URL` **ก่อน** import service (กับดัก 2026-08-14)
 */

const getRawSessionUserMock = vi.hoisted(() => vi.fn())
vi.mock('@/lib/auth/session', () => ({ getRawSessionUser: getRawSessionUserMock, requireSession: vi.fn() }))

const url = process.env.TEST_DATABASE_URL

function assertLocalTestDatabase(connectionString: string): void {
  const parsed = new URL(connectionString)
  const isLocal = ['localhost', '127.0.0.1', '::1', 'postgres'].includes(parsed.hostname)
  if (!isLocal || !parsed.pathname.includes('test')) {
    throw new Error(`TEST_DATABASE_URL ต้องเป็น DB ทดสอบบนเครื่อง/CI เท่านั้น (host=${parsed.hostname}) — Rule 07`)
  }
}

const suite = url ? describe : describe.skip
if (!url) console.warn('[portal-finance-routes.db.test] ข้ามเทสต์ระดับ DB — ไม่มี TEST_DATABASE_URL')

const ORG_ID = '00000000-0000-4000-8000-0000000975a0'
const ROLE_FINANCE = '00000000-0000-4000-8000-0000000975a1'
const ROLE_CO_MANAGER = '00000000-0000-4000-8000-0000000975a2'
const ROLE_CO_SUPERVISOR = '00000000-0000-4000-8000-0000000975a3'
const ROLE_CO_ADMIN = '00000000-0000-4000-8000-0000000975a4'
const FINANCE_ID = '00000000-0000-4000-8000-0000000975b0'
const CO1_MANAGER_ID = '00000000-0000-4000-8000-0000000975b1'
const CO1_SUPERVISOR_ID = '00000000-0000-4000-8000-0000000975b2'
const CO1_ADMIN_ID = '00000000-0000-4000-8000-0000000975b3'
const CO2_MANAGER_ID = '00000000-0000-4000-8000-0000000975b4'
const CO1 = '00000000-0000-4000-8000-0000000975c1'
const CO2 = '00000000-0000-4000-8000-0000000975c2'

const MS_PER_DAY = 86_400_000
/** วันนี้ตามปฏิทินไทย (date-only) — route ใช้ `new Date()` จริง ⇒ fixture อิงวันนี้ */
const TODAY = bangkokBusinessDate(new Date())
const dayOffset = (days: number): string => new Date(TODAY.getTime() + days * MS_PER_DAY).toISOString().slice(0, 10)

let client: PrismaClient | null = null

function db(): PrismaClient {
  if (!url) throw new Error('ไม่มี TEST_DATABASE_URL')
  if (!client) {
    assertLocalTestDatabase(url)
    client = new PrismaClient({ adapter: new PrismaPg({ connectionString: url }) })
  }
  return client
}

type Routes = {
  billing: typeof import('@/app/api/portal/billing-batches/route')
  invoices: typeof import('@/app/api/portal/tax-invoices/route')
  download: typeof import('@/app/api/portal/tax-invoices/[id]/download/route')
  revenue: typeof import('@/app/api/portal/reports/revenue-summary/route')
  aging: typeof import('@/app/api/portal/reports/ar-aging/route')
  dashboard: typeof import('@/app/api/portal/dashboard/route')
  revenueQueries: typeof import('@/lib/revenue/queries')
  providers: typeof import('@/lib/reports/finance/providers')
  documented: typeof import('@/lib/portal/documented-amounts')
}
let routes: Routes

function defaultCapabilities(roleName: string): Record<string, CapabilityAccessLevel> {
  const caps: Record<string, CapabilityAccessLevel> = {}
  for (const grant of DEFAULT_ROLE_CAPABILITIES) {
    if (grant.role.name === roleName && grant.role.roleGroup === 'finance_company') caps[grant.capabilityCode] = grant.level
  }
  return caps
}

function companyUser(id: string, roleId: string, roleName: string, companyId: string): SessionUser {
  return {
    id,
    organizationId: ORG_ID,
    supabaseUid: `uid-${id}`,
    email: null,
    fullName: `${roleName} ทดสอบ`,
    status: 'active',
    roleId,
    roleName,
    roleGroup: 'finance_company',
    isSuperadmin: false,
    teamId: null,
    companyId,
    capabilities: defaultCapabilities(roleName),
    scope: { kind: 'company', teamIds: [], companyId, userId: id },
    loginAt: new Date().toISOString(),
  }
}

const CO1_MANAGER = companyUser(CO1_MANAGER_ID, ROLE_CO_MANAGER, COMPANY_MANAGER_ROLE_NAME, CO1)
const CO1_SUPERVISOR = companyUser(CO1_SUPERVISOR_ID, ROLE_CO_SUPERVISOR, COMPANY_SUPERVISOR_ROLE_NAME, CO1)
const CO1_ADMIN = companyUser(CO1_ADMIN_ID, ROLE_CO_ADMIN, COMPANY_ADMIN_ROLE_NAME, CO1)
const CO2_MANAGER = companyUser(CO2_MANAGER_ID, ROLE_CO_MANAGER, COMPANY_MANAGER_ROLE_NAME, CO2)
const INTERNAL_FINANCE: SessionUser = {
  ...companyUser(FINANCE_ID, ROLE_FINANCE, 'การเงิน P5', CO1),
  roleGroup: 'system',
  companyId: null,
  // ผู้ใช้ภายในต่อให้ถือ portal_* ก็เข้าพอร์ทัลไม่ได้ (D2/D11)
  capabilities: { manage_billing: 'manage', portal_finance: 'view', portal_download: 'view' },
  scope: { kind: 'global', teamIds: [], companyId: null, userId: FINANCE_ID },
}

function request(path: string): NextRequest {
  const full = `http://localhost${path}`
  return Object.assign(new Request(full), { nextUrl: new URL(full) }) as unknown as NextRequest
}

const params = (id: string) => ({ params: Promise.resolve({ id }) })

async function dataOf<T>(response: Response): Promise<T> {
  expect(response.status).toBe(200)
  return ((await response.json()) as { data: T }).data
}

async function codeOf(response: Response): Promise<string | undefined> {
  return ((await response.json()) as { error?: { code?: string } }).error?.code
}

/** deep-scan: ห้ามมีฟิลด์ภายในหลุดออกพอร์ทัล */
const FORBIDDEN_KEYS = new Set([
  'organizationId',
  'companyId',
  'companyName',
  'createdBy',
  'createdByName',
  'whtWithheldByCustomerSatang',
  'vatModes',
  'revenueCount',
  'revenues',
  'daysOverdue',
  'cancelReason',
  'cancelledBy',
  'salesRecordId',
  'billingBatchId',
  'columns',
  'note',
  'kpis',
  '__key',
  'imei',
  'imeiContract',
  'teamId',
  // ใบลดหนี้ (มติ U14): เหตุผลภายใน/ไฟล์สแกน/Adjustment ต้นเหตุ/ผู้ยกเลิก ห้ามหลุด
  'reason',
  'filePath',
  'fileSha256',
  'adjustmentId',
  'vatRatePctUsed',
  'cancelledAt',
])

function forbiddenKeysIn(value: unknown, path = '$'): string[] {
  if (Array.isArray(value)) return value.flatMap((item, index) => forbiddenKeysIn(item, `${path}[${index}]`))
  if (value === null || typeof value !== 'object') return []
  return Object.entries(value).flatMap(([key, child]) => [
    ...(FORBIDDEN_KEYS.has(key) ? [`${path}.${key}`] : []),
    ...forbiddenKeysIn(child, `${path}.${key}`),
  ])
}

async function auditsSince(since: Date, action: string, actorId: string) {
  return db().auditLog.findMany({
    where: { organizationId: ORG_ID, action: action as 'export', actorId, createdAt: { gte: since } },
    orderBy: { createdAt: 'asc' },
  })
}

// ── seed ────────────────────────────────────────────────────────────────────

let seq = 0
const RUN = Date.now().toString(36)

async function seedCase(companyId: string, outcome: 'closed_success' | 'closed_fail'): Promise<string> {
  seq += 1
  const caseRef = `P5-${RUN}-${seq}`
  const rows = await db().$queryRawUnsafe<{ id: string }[]>(`
    INSERT INTO cases (
      organization_id, case_ref, case_ref_normalized, company_id, source, status, created_by,
      debtor_name, addr_province, addr_district, asset_kind, asset_description,
      debt_amount_satang, outcome, closed_at,
      service_fee_model_snapshot, service_fee_base_satang, service_fee_rate_pct, service_fee_basis_snapshot
    ) VALUES (
      '${ORG_ID}', $$${caseRef}$$, $$${caseRef}$$, '${companyId}', 'manual', '${outcome}', '${FINANCE_ID}',
      'ลูกหนี้ ${seq}', 'เชียงใหม่', 'เมือง', 'smartphone', 'iPhone 15',
      1000000, '${outcome}', NOW(), 'SUCCESS_FEE', 0, 10, 'debt_amount'
    ) RETURNING id
  `)
  return rows[0]?.id ?? ''
}

async function seedBatch(options: {
  companyId: string
  status: 'draft' | 'sent' | 'partially_paid' | 'paid'
  totalSatang: number
  receivedSatang?: number
  whtSatang?: number
  dueDate: string
}): Promise<string> {
  seq += 1
  const rows = await db().$queryRawUnsafe<{ id: string }[]>(`
    INSERT INTO billing_batches (organization_id, company_id, period, status, total_satang, received_satang,
                                 wht_withheld_by_customer_satang, due_date, sent_at, created_by)
    VALUES ('${ORG_ID}', '${options.companyId}', 'รอบ P5 ${seq}', '${options.status}', ${options.totalSatang},
            ${options.receivedSatang ?? 0}, ${options.whtSatang ?? 0}, '${options.dueDate}',
            ${options.status === 'draft' ? 'NULL' : 'NOW()'}, '${FINANCE_ID}')
    RETURNING id
  `)
  return rows[0]?.id ?? ''
}

async function seedRevenue(caseId: string, companyId: string, grossSatang: number, batchId: string | null): Promise<string> {
  const vat = Math.round((grossSatang * 7) / 100)
  const rows = await db().$queryRawUnsafe<{ id: string }[]>(`
    INSERT INTO revenues (organization_id, case_id, company_id, billing_batch_id, gross_satang, vat_satang,
                          vat_rate_pct_used, total_satang, fee_model_snapshot, vat_mode_snapshot, status,
                          revenue_date, created_by)
    VALUES ('${ORG_ID}', '${caseId}', '${companyId}', ${batchId === null ? 'NULL' : `'${batchId}'`}, ${grossSatang},
            ${vat}, 7.00, ${grossSatang + vat}, 'SUCCESS_FEE', 'exclude_vat',
            '${batchId === null ? 'ready_for_billing' : 'billed'}', '${dayOffset(0)}', '${FINANCE_ID}')
    RETURNING id
  `)
  return rows[0]?.id ?? ''
}

/** รายการปรับปรุงภายในที่อนุมัติแล้ว (ยังไม่มีใบลดหนี้) — พอร์ทัลต้องไม่สะท้อน (มติ U14) */
async function seedApprovedDecrease(target: 'revenue_id' | 'billing_batch_id', targetId: string, amountSatang: number): Promise<void> {
  await db().$executeRawUnsafe(`
    INSERT INTO adjustments (organization_id, adjustment_type, amount_satang, reason, status, ${target}, created_by)
    VALUES ('${ORG_ID}', 'decrease', ${amountSatang}, 'ปรับลดภายในทดสอบ U14', 'approved', '${targetId}', '${FINANCE_ID}')
  `)
}

let periodId = ''

/** ใบลดหนี้ active (เลขที่จากสำนักงานบัญชี) — trigger DB ตรวจยอดไม่เกินใบกำกับ */
async function seedCreditNote(options: {
  invoiceId: string
  beforeVatSatang: number
  vatSatang: number
  adjustmentId?: string
}): Promise<string> {
  seq += 1
  const rows = await db().$queryRawUnsafe<{ id: string }[]>(`
    INSERT INTO credit_notes (organization_id, tax_invoice_id, adjustment_id, credit_note_number, issue_date,
                              amount_before_vat_satang, vat_satang, total_satang, vat_rate_pct_used, reason,
                              file_path, created_by, buyer_branch_code)
    VALUES ('${ORG_ID}', '${options.invoiceId}', ${options.adjustmentId === undefined ? 'NULL' : `'${options.adjustmentId}'`},
            'CNP5-${RUN}-${seq}', '${dayOffset(0)}', ${options.beforeVatSatang}, ${options.vatSatang},
            ${options.beforeVatSatang + options.vatSatang}, 7.00, $$เหตุผลลดหนี้ภายใน$$,
            'tax-invoices/secret/credit-notes/scan.pdf', '${FINANCE_ID}', '00000')
    RETURNING id
  `)
  return rows[0]?.id ?? ''
}

async function cancelCreditNoteRow(id: string): Promise<void> {
  await db().$executeRawUnsafe(`
    UPDATE credit_notes SET status = 'cancelled', cancel_reason = $$ออกผิด$$, cancelled_by = '${FINANCE_ID}',
                            cancelled_at = NOW()
    WHERE id = '${id}'
  `)
}

async function seedInvoice(options: {
  batchId: string
  companyId: string
  totalSatang: number
  cancelled?: boolean
}): Promise<string> {
  seq += 1
  const beforeVat = Math.round((options.totalSatang * 100) / 107)
  const sales = await db().$queryRawUnsafe<{ id: string }[]>(`
    INSERT INTO sales_records (organization_id, period_id, billing_batch_id, company_id,
                               total_before_vat_satang, vat_satang, total_satang, created_by)
    VALUES ('${ORG_ID}', '${periodId}', '${options.batchId}', '${options.companyId}',
            ${beforeVat}, ${options.totalSatang - beforeVat}, ${options.totalSatang}, '${FINANCE_ID}')
    RETURNING id
  `)
  const cancelled = options.cancelled === true
  const rows = await db().$queryRawUnsafe<{ id: string }[]>(`
    INSERT INTO tax_invoices (organization_id, sales_record_id, invoice_number, invoice_date, buyer_branch_code, seller_branch_code, status,
                              cancel_reason, cancelled_by, cancelled_at, created_by)
    VALUES ('${ORG_ID}', '${sales[0]?.id}', 'INVP5-${RUN}-${seq}', '${dayOffset(0)}', '00000', '00000',
            '${cancelled ? 'cancelled' : 'active'}',
            ${cancelled ? `$$ยกเลิกในเทสต์$$, '${FINANCE_ID}', NOW()` : 'NULL, NULL, NULL'}, '${FINANCE_ID}')
    RETURNING id
  `)
  return rows[0]?.id ?? ''
}

async function cleanup(): Promise<void> {
  const tx = db()
  // ใบกำกับห้ามลบที่ระดับ DB (`02` §13) — ปิด trigger ชั่วคราวเฉพาะการล้าง fixture ของเทสต์ (แบบเดียวกับ accounting-reports.db.test)
  // ใบลดหนี้ห้ามลบเช่นกัน (ยกเลิกเท่านั้น) — ปิด trigger ชั่วคราวเฉพาะการล้าง fixture
  await tx.$executeRawUnsafe(`ALTER TABLE credit_notes DISABLE TRIGGER trg_credit_notes_no_delete`)
  try {
    await tx.$executeRawUnsafe(`DELETE FROM credit_notes WHERE organization_id = '${ORG_ID}'`)
  } finally {
    await tx.$executeRawUnsafe(`ALTER TABLE credit_notes ENABLE TRIGGER trg_credit_notes_no_delete`)
  }
  await tx.$executeRawUnsafe(`ALTER TABLE tax_invoices DISABLE TRIGGER trg_tax_invoices_no_delete`)
  try {
    await tx.$executeRawUnsafe(`DELETE FROM tax_invoices WHERE organization_id = '${ORG_ID}'`)
  } finally {
    await tx.$executeRawUnsafe(`ALTER TABLE tax_invoices ENABLE TRIGGER trg_tax_invoices_no_delete`)
  }
  await tx.$executeRawUnsafe(`DELETE FROM sales_records WHERE organization_id = '${ORG_ID}'`)
  await tx.$executeRawUnsafe(`DELETE FROM accounting_periods WHERE organization_id = '${ORG_ID}'`)
  await tx.$executeRawUnsafe(`DELETE FROM adjustments WHERE organization_id = '${ORG_ID}'`)
  await tx.$executeRawUnsafe(`DELETE FROM revenues WHERE organization_id = '${ORG_ID}'`)
  await tx.$executeRawUnsafe(`DELETE FROM billing_batches WHERE organization_id = '${ORG_ID}'`)
  await tx.$executeRawUnsafe(`DELETE FROM cases WHERE organization_id = '${ORG_ID}'`)
}

interface Fixture {
  co1Sent: string
  co1Partial: string
  co1Paid: string
  co1Draft: string
  co1InvoiceActive: string
  co1InvoiceCancelled: string
  co1InvoiceOnDraft: string
  co2Invoice: string
}
let fx: Fixture

async function seedFixture(): Promise<Fixture> {
  const periods = await db().$queryRawUnsafe<{ id: string }[]>(`
    INSERT INTO accounting_periods (organization_id, period_label, year_be, month, status, created_by)
    VALUES ('${ORG_ID}', 'งวดทดสอบ P5', 2569, 10, 'collecting', '${FINANCE_ID}') RETURNING id
  `)
  periodId = periods[0]?.id ?? ''

  // CO1: ค้างเต็ม · ชำระบางส่วน + ลูกค้าหัก WHT · ชำระครบ (รวม WHT) · draft (ห้ามแสดง/นับ)
  const co1Sent = await seedBatch({ companyId: CO1, status: 'sent', totalSatang: 1_070_000, dueDate: dayOffset(-10) })
  const co1Partial = await seedBatch({
    companyId: CO1,
    status: 'partially_paid',
    totalSatang: 2_140_000,
    receivedSatang: 1_000_000,
    whtSatang: 60_000,
    dueDate: dayOffset(-45),
  })
  const co1Paid = await seedBatch({
    companyId: CO1,
    status: 'paid',
    totalSatang: 535_000,
    receivedSatang: 520_000,
    whtSatang: 15_000,
    dueDate: dayOffset(-100),
  })
  const co1Draft = await seedBatch({ companyId: CO1, status: 'draft', totalSatang: 999_900, dueDate: dayOffset(-120) })
  const co2Sent = await seedBatch({ companyId: CO2, status: 'sent', totalSatang: 777_700, dueDate: dayOffset(-5) })

  // รายได้: นับเฉพาะที่อยู่ในรอบ sent ขึ้นไปของ CO1
  await seedRevenue(await seedCase(CO1, 'closed_success'), CO1, 1_000_000, co1Sent)
  await seedRevenue(await seedCase(CO1, 'closed_fail'), CO1, 500_000, co1Draft)
  await seedRevenue(await seedCase(CO1, 'closed_success'), CO1, 300_000, null)
  await seedRevenue(await seedCase(CO2, 'closed_success'), CO2, 400_000, co2Sent)

  return {
    co1Sent,
    co1Partial,
    co1Paid,
    co1Draft,
    co1InvoiceActive: await seedInvoice({ batchId: co1Sent, companyId: CO1, totalSatang: 1_070_000 }),
    co1InvoiceCancelled: await seedInvoice({ batchId: co1Partial, companyId: CO1, totalSatang: 2_140_000, cancelled: true }),
    co1InvoiceOnDraft: await seedInvoice({ batchId: co1Draft, companyId: CO1, totalSatang: 999_900 }),
    co2Invoice: await seedInvoice({ batchId: co2Sent, companyId: CO2, totalSatang: 777_700 }),
  }
}

beforeAll(async () => {
  if (!url) return
  process.env.DATABASE_URL = url
  routes = {
    billing: await import('@/app/api/portal/billing-batches/route'),
    invoices: await import('@/app/api/portal/tax-invoices/route'),
    download: await import('@/app/api/portal/tax-invoices/[id]/download/route'),
    revenue: await import('@/app/api/portal/reports/revenue-summary/route'),
    aging: await import('@/app/api/portal/reports/ar-aging/route'),
    dashboard: await import('@/app/api/portal/dashboard/route'),
    revenueQueries: await import('@/lib/revenue/queries'),
    providers: await import('@/lib/reports/finance/providers'),
    documented: await import('@/lib/portal/documented-amounts'),
  }

  const tx = db()
  await tx.$executeRawUnsafe(`
    INSERT INTO organizations (id, name, tax_id, address)
    VALUES ('${ORG_ID}', 'PortalP5Test', '9999999997500', 'ที่อยู่ทดสอบ P5') ON CONFLICT (id) DO NOTHING
  `)
  await tx.$executeRawUnsafe(`
    INSERT INTO roles (id, organization_id, name, role_group, is_seed) VALUES
      ('${ROLE_FINANCE}', '${ORG_ID}', 'การเงิน P5', 'system', false),
      ('${ROLE_CO_MANAGER}', '${ORG_ID}', '${COMPANY_MANAGER_ROLE_NAME}', 'finance_company', false),
      ('${ROLE_CO_SUPERVISOR}', '${ORG_ID}', '${COMPANY_SUPERVISOR_ROLE_NAME}', 'finance_company', false),
      ('${ROLE_CO_ADMIN}', '${ORG_ID}', '${COMPANY_ADMIN_ROLE_NAME}', 'finance_company', false)
    ON CONFLICT (id) DO NOTHING
  `)
  await tx.$executeRawUnsafe(`
    INSERT INTO users (id, organization_id, role_id, email, full_name, status) VALUES
      ('${FINANCE_ID}', '${ORG_ID}', '${ROLE_FINANCE}', 'finance-p5@test.local', 'การเงิน P5', 'active')
    ON CONFLICT (id) DO NOTHING
  `)
  await tx.$executeRawUnsafe(`
    INSERT INTO finance_companies (id, organization_id, name, short_name, tax_id, vat_mode, payment_due_days,
                                   address, created_by) VALUES
      ('${CO1}', '${ORG_ID}', 'ไฟแนนซ์หนึ่ง P5', 'CO1P5', '0105512975001', 'exclude_vat', 30, '1 ถ.สีลม', '${FINANCE_ID}'),
      ('${CO2}', '${ORG_ID}', 'ไฟแนนซ์สอง P5', 'CO2P5', '0105512975002', 'exclude_vat', 30, '2 ถ.สาทร', '${FINANCE_ID}')
    ON CONFLICT (id) DO NOTHING
  `)
  await tx.$executeRawUnsafe(`
    INSERT INTO users (id, organization_id, role_id, email, full_name, status, company_id) VALUES
      ('${CO1_MANAGER_ID}', '${ORG_ID}', '${ROLE_CO_MANAGER}', 'co1-mgr-p5@test.local', 'ผู้จัดการ CO1', 'active', '${CO1}'),
      ('${CO1_SUPERVISOR_ID}', '${ORG_ID}', '${ROLE_CO_SUPERVISOR}', 'co1-sup-p5@test.local', 'หัวหน้า CO1', 'active', '${CO1}'),
      ('${CO1_ADMIN_ID}', '${ORG_ID}', '${ROLE_CO_ADMIN}', 'co1-adm-p5@test.local', 'แอดมิน CO1', 'active', '${CO1}'),
      ('${CO2_MANAGER_ID}', '${ORG_ID}', '${ROLE_CO_MANAGER}', 'co2-mgr-p5@test.local', 'ผู้จัดการ CO2', 'active', '${CO2}')
    ON CONFLICT (id) DO NOTHING
  `)
  await cleanup()
})

afterAll(async () => {
  if (url) await cleanup()
  await client?.$disconnect()
})

beforeEach(async () => {
  if (!url) return
  getRawSessionUserMock.mockReset()
  await cleanup()
  fx = await seedFixture()
})

const as = (user: SessionUser): void => {
  getRawSessionUserMock.mockResolvedValue(user)
}

// ════════════════════════════════════════════════════════════════════════════

suite('GET /api/portal/billing-batches', () => {
  it('CO1 เห็นเฉพาะรอบของ CO1 ที่ sent ขึ้นไป — draft ไม่แสดง (§20 Billing draft ถูกกรอง)', async () => {
    as(CO1_MANAGER)
    const items = await dataOf<PortalBillingBatchDto[]>(await routes.billing.GET(request('/api/portal/billing-batches'), undefined))

    expect(items.map((item) => item.id).sort()).toEqual([fx.co1Sent, fx.co1Partial, fx.co1Paid].sort())
    expect(items.map((item) => item.id)).not.toContain(fx.co1Draft)
    expect(items.every((item) => item.statusDisplay.code !== ('draft' as string))).toBe(true)

    const partial = items.find((item) => item.id === fx.co1Partial)
    // ยอดค้าง = ยอดบิล − รับแล้ว − WHT ที่ลูกค้าหัก (O44)
    expect(partial).toMatchObject({ totalSatang: 2_140_000, receivedSatang: 1_000_000, outstandingSatang: 1_080_000 })
    expect(partial?.statusDisplay.code).toBe('partially_paid')
    expect(items.find((item) => item.id === fx.co1Paid)?.outstandingSatang).toBe(0)
    expect(forbiddenKeysIn(items)).toEqual([])
  })

  it('CO2 ไม่เห็นรอบของ CO1', async () => {
    as(CO2_MANAGER)
    const items = await dataOf<PortalBillingBatchDto[]>(await routes.billing.GET(request('/api/portal/billing-batches'), undefined))
    expect(items).toHaveLength(1)
    expect(items.map((item) => item.id)).not.toContain(fx.co1Sent)
  })

  it('ยอดค้างรวมเท่ากับ AR ภายใน (getArAging) ของบริษัทเดียวกัน — ไม่รวม draft', async () => {
    as(CO1_MANAGER)
    const items = await dataOf<PortalBillingBatchDto[]>(await routes.billing.GET(request('/api/portal/billing-batches'), undefined))
    const internal = await routes.revenueQueries.getArAging(INTERNAL_FINANCE, { companyId: CO1 })

    const portalOutstanding = items.reduce((sum, item) => sum + Math.max(0, item.outstandingSatang), 0)
    expect(portalOutstanding).toBe(1_070_000 + 1_080_000)
    expect(portalOutstanding).toBe(internal.totalOutstandingSatang)
  })

  it('หัวหน้า/แอดมินบริษัท (ค่าเริ่มต้นไม่มี portal_finance) ⇒ 403 + audit access_denied (§20 สิทธิ์ตามหมวด)', async () => {
    for (const user of [CO1_SUPERVISOR, CO1_ADMIN]) {
      const since = new Date(Date.now() - 1000)
      as(user)
      const response = await routes.billing.GET(request('/api/portal/billing-batches'), undefined)
      expect(response.status).toBe(403)
      expect(await codeOf(response)).toBe('PERMISSION_DENIED')
      const audits = await auditsSince(since, 'access_denied', user.id)
      expect(audits.length).toBeGreaterThanOrEqual(1)
      expect(audits.at(-1)?.afterData).toMatchObject({ section: 'finance', cause: 'missing_capability' })
    }
  })

  it('ผู้ใช้ภายใน (แม้ถือ portal_finance) ⇒ 403 + audit (D2/D11)', async () => {
    const since = new Date(Date.now() - 1000)
    as(INTERNAL_FINANCE)
    const responses = await Promise.all([
      routes.billing.GET(request('/api/portal/billing-batches'), undefined),
      routes.invoices.GET(request('/api/portal/tax-invoices'), undefined),
      routes.revenue.GET(request('/api/portal/reports/revenue-summary'), undefined),
      routes.aging.GET(request('/api/portal/reports/ar-aging'), undefined),
      routes.download.GET(request(`/api/portal/tax-invoices/${fx.co1InvoiceActive}/download`), params(fx.co1InvoiceActive)),
    ])
    for (const response of responses) expect(response.status).toBe(403)
    const audits = await auditsSince(since, 'access_denied', FINANCE_ID)
    expect(audits.length).toBeGreaterThanOrEqual(5)
  })
})

suite('GET /api/portal/tax-invoices', () => {
  it('list ของ CO1 เท่านั้น · active/cancelled แสดงสถานะ · ใบของรอบ draft ไม่แสดง', async () => {
    as(CO1_MANAGER)
    const items = await dataOf<PortalTaxInvoiceDto[]>(await routes.invoices.GET(request('/api/portal/tax-invoices'), undefined))

    expect(items.map((item) => item.id).sort()).toEqual([fx.co1InvoiceActive, fx.co1InvoiceCancelled].sort())
    expect(items.find((item) => item.id === fx.co1InvoiceActive)?.statusDisplay.code).toBe('active')
    expect(items.find((item) => item.id === fx.co1InvoiceCancelled)?.statusDisplay.code).toBe('cancelled')
    expect(items.find((item) => item.id === fx.co1InvoiceActive)).toMatchObject({ totalSatang: 1_070_000 })
    expect(items.map((item) => item.id)).not.toContain(fx.co2Invoice)
    expect(items.map((item) => item.id)).not.toContain(fx.co1InvoiceOnDraft)
    expect(forbiddenKeysIn(items)).toEqual([])
  })
})

suite('GET /api/portal/tax-invoices/:id/download', () => {
  it('ใบของตัวเอง ⇒ PDF จริง (renderer เดียวกับภายใน) + audit export', async () => {
    const since = new Date(Date.now() - 1000)
    as(CO1_MANAGER)
    const response = await routes.download.GET(
      request(`/api/portal/tax-invoices/${fx.co1InvoiceActive}/download`),
      params(fx.co1InvoiceActive),
    )
    expect(response.status).toBe(200)
    expect(response.headers.get('content-type')).toBe('application/pdf')
    expect(response.headers.get('cache-control')).toBe('no-store')
    const bytes = Buffer.from(await response.arrayBuffer())
    expect(bytes.subarray(0, 4).toString('latin1')).toBe('%PDF')

    const audits = await auditsSince(since, 'export', CO1_MANAGER_ID)
    expect(audits).toHaveLength(1)
    expect(audits[0]).toMatchObject({ targetType: 'tax_invoices', targetId: fx.co1InvoiceActive })
    expect(audits[0]?.afterData).toMatchObject({ channel: 'portal', document: 'tax_invoice_pdf' })
  }, 30_000)

  it('ใบของ CO2 ด้วยผู้ใช้ CO1 ⇒ 403 + audit cross_company · id สุ่ม / ใบของรอบ draft ⇒ 403 (ไม่ใช่ 404)', async () => {
    const since = new Date(Date.now() - 1000)
    as(CO1_MANAGER)
    const cross = await routes.download.GET(request(`/api/portal/tax-invoices/${fx.co2Invoice}/download`), params(fx.co2Invoice))
    expect(cross.status).toBe(403)
    expect(await codeOf(cross)).toBe('PERMISSION_DENIED')

    const randomId = '00000000-0000-4000-8000-0000000975ff'
    const random = await routes.download.GET(request(`/api/portal/tax-invoices/${randomId}/download`), params(randomId))
    expect(random.status).toBe(403)
    const garbage = await routes.download.GET(request('/api/portal/tax-invoices/not-a-uuid/download'), params('not-a-uuid'))
    expect(garbage.status).toBe(403)
    const onDraft = await routes.download.GET(
      request(`/api/portal/tax-invoices/${fx.co1InvoiceOnDraft}/download`),
      params(fx.co1InvoiceOnDraft),
    )
    expect(onDraft.status).toBe(403)

    const denied = await auditsSince(since, 'access_denied', CO1_MANAGER_ID)
    const causes = denied.map((row) => (row.afterData as { cause?: string } | null)?.cause)
    expect(causes).toContain('cross_company')
    expect(causes.filter((cause) => cause === 'row_not_found').length).toBeGreaterThanOrEqual(3)
    expect(denied.find((row) => (row.afterData as { cause?: string }).cause === 'cross_company')?.targetId).toBe(fx.co2Invoice)
    // ปฏิเสธแล้วต้องไม่มี audit การดาวน์โหลด (ไฟล์ไม่ถูก render)
    const exported = await auditsSince(since, 'export', CO1_MANAGER_ID)
    expect(exported.filter((row) => row.targetId === fx.co2Invoice || row.targetId === fx.co1InvoiceOnDraft)).toEqual([])
  })

  it('ไม่มี portal_download ⇒ 403 ก่อนแตะแถว', async () => {
    as({ ...CO1_MANAGER, capabilities: { portal_finance: 'view' } })
    const response = await routes.download.GET(
      request(`/api/portal/tax-invoices/${fx.co1InvoiceActive}/download`),
      params(fx.co1InvoiceActive),
    )
    expect(response.status).toBe(403)
  })
})

suite('GET /api/portal/reports/*', () => {
  it('revenue-summary: นับเฉพาะรายได้ในรอบ sent ขึ้นไปของ CO1 · ครบ 6 เดือน · คำนวณสด', async () => {
    as(CO1_MANAGER)
    const dto = await dataOf<PortalRevenueSummaryDto>(
      await routes.revenue.GET(request('/api/portal/reports/revenue-summary'), undefined),
    )
    expect(dto.months).toHaveLength(6)
    // รายได้ในรอบ draft ไม่รั่ว แต่เคส CO1 ที่ปิดไม่สำเร็จในช่วงเข้าตัวหาร % สำเร็จ (มติ PO U55 — นิยามเดียวกับ F2)
    expect(dto.total).toMatchObject({ revenueSatang: 1_000_000, caseCount: 1, successCount: 1, failCount: 1, successPct: 50 })
    expect(dto.months.at(-1)?.revenueSatang).toBe(1_000_000)
    expect(dto.months.slice(0, 5).every((month) => month.revenueSatang === 0)).toBe(true)
    expect(forbiddenKeysIn(dto)).toEqual([])

    // คำนวณสด — ย้าย draft เป็น sent แล้วยอดเปลี่ยนทันที (ไม่มีแคช)
    await db().$executeRawUnsafe(`UPDATE billing_batches SET status = 'sent' WHERE id = '${fx.co1Draft}'`)
    const after = await dataOf<PortalRevenueSummaryDto>(
      await routes.revenue.GET(request('/api/portal/reports/revenue-summary?months=3'), undefined),
    )
    expect(after.months).toHaveLength(3)
    // รอบที่ย้ายมามีใบกำกับ 999,900 (ก่อน VAT 934,486) ⇒ พอร์ทัลนับยอดก่อน VAT ตามใบกำกับ ไม่ใช่ gross ของรายได้ (มติ U14)
    expect(after.total).toMatchObject({ revenueSatang: 1_000_000 + 934_486, caseCount: 2, successCount: 1, failCount: 1 })
  })

  it('revenue-summary: months ผิดรูป ⇒ 400', async () => {
    as(CO1_MANAGER)
    const response = await routes.revenue.GET(request('/api/portal/reports/revenue-summary?months=99'), undefined)
    expect(response.status).toBe(400)
  })

  it('ar-aging: เท่ากับ AR ภายในของบริษัทเดียวกัน · draft ไม่นับ · จัดช่วงตามวันครบกำหนด', async () => {
    as(CO1_MANAGER)
    const dto = await dataOf<PortalArAgingDto>(await routes.aging.GET(request('/api/portal/reports/ar-aging'), undefined))
    const internal = await routes.revenueQueries.getArAging(INTERNAL_FINANCE, { companyId: CO1 })

    expect(dto.totalOutstandingSatang).toBe(2_150_000)
    expect(dto.totalOutstandingSatang).toBe(internal.totalOutstandingSatang)
    expect(dto.buckets.map((bucket) => bucket.outstandingSatang)).toEqual(
      internal.buckets.map((bucket) => bucket.outstandingSatang),
    )
    expect(dto.buckets.map((bucket) => bucket.label)).toEqual(internal.buckets.map((bucket) => bucket.label))
    expect(dto.batchCount).toBe(2)
    expect(forbiddenKeysIn(dto)).toEqual([])

    // CO2 เห็นเฉพาะของตัวเอง
    as(CO2_MANAGER)
    const co2 = await dataOf<PortalArAgingDto>(await routes.aging.GET(request('/api/portal/reports/ar-aging'), undefined))
    expect(co2.totalOutstandingSatang).toBe(777_700)
  })
})

suite('มติ U14/U11 — ยอดตามเอกสารที่ออกจริง (ไม่ใช่ยอดหลัง Adjustment ภายใน)', () => {
  /** สถานการณ์ CO1 จาก UAT: ใบกำกับ 373,000 + VAT 26,110 = 399,110 · รับ 387,920 + ลูกค้าหัก 11,190 · ปรับลดภายใน 10,000 */
  async function seedCo1Scenario(): Promise<{ batchId: string; revenueId: string }> {
    const batchId = await seedBatch({
      companyId: CO1,
      status: 'paid',
      totalSatang: 39_911_000,
      receivedSatang: 38_792_000,
      whtSatang: 1_119_000,
      dueDate: dayOffset(-3),
    })
    const revenueId = await seedRevenue(await seedCase(CO1, 'closed_success'), CO1, 37_300_000, batchId)
    await seedInvoice({ batchId, companyId: CO1, totalSatang: 39_911_000 })
    await seedApprovedDecrease('revenue_id', revenueId, 1_000_000)
    await seedApprovedDecrease('billing_batch_id', batchId, 1_070_000)
    return { batchId, revenueId }
  }

  it('กราฟรายได้ = ยอดก่อน VAT ตามใบกำกับ (373,000) ขณะที่รายงานภายใน F2 ยังหลัง Adjustment (363,000)', async () => {
    await seedCo1Scenario()
    as(CO1_MANAGER)
    const dto = await dataOf<PortalRevenueSummaryDto>(
      await routes.revenue.GET(request('/api/portal/reports/revenue-summary'), undefined),
    )
    // 1,000,000 (รอบ sent เดิม) + 37,300,000 ตามใบกำกับ — ไม่ใช่ 36,300,000
    expect(dto.months.at(-1)?.revenueSatang).toBe(38_300_000)
    expect(dto.total.revenueSatang).toBe(38_300_000)

    // ภายในไม่เปลี่ยน: loader เดิมยังหัก Adjustment ที่อนุมัติแล้ว — รวม Adjustment ระดับรอบวางบิล 1,070,000
    // ที่กระจายลงรายได้ในรอบ (มติ U69) ⇒ 1,000,000 + 37,300,000 − 1,000,000 − 1,070,000
    const now = new Date()
    const internal = await routes.providers.loadRevenueEntries(
      ORG_ID,
      'month',
      { startDate: new Date(now.getTime() - 40 * MS_PER_DAY), endDate: new Date(now.getTime() + MS_PER_DAY) },
      null,
      { companyId: CO1, billingStatuses: ['sent', 'partially_paid', 'paid'] },
    )
    expect(internal.reduce((sum, entry) => sum + entry.revenueSatang, 0)).toBe(36_230_000)
  })

  it('วางบิล: รวม 399,110 = ชำระ 387,920 + ลูกค้าหัก 11,190 + ค้าง 0 · AR aging/dashboard = 0 สำหรับรอบนี้', async () => {
    const { batchId } = await seedCo1Scenario()
    as(CO1_MANAGER)
    const items = await dataOf<PortalBillingBatchDto[]>(await routes.billing.GET(request('/api/portal/billing-batches'), undefined))
    const row = items.find((item) => item.id === batchId)
    expect(row).toMatchObject({
      totalSatang: 39_911_000,
      receivedSatang: 38_792_000,
      customerWhtSatang: 1_119_000,
      outstandingSatang: 0,
    })
    expect((row?.receivedSatang ?? 0) + (row?.customerWhtSatang ?? 0) + (row?.outstandingSatang ?? 0)).toBe(row?.totalSatang)
    expect(forbiddenKeysIn(items)).toEqual([])

    // AR aging ของพอร์ทัลไม่ติดลบจาก Adjustment ภายใน — ยอดเดิม 2,150,000 ไม่เปลี่ยน
    const aging = await dataOf<PortalArAgingDto>(await routes.aging.GET(request('/api/portal/reports/ar-aging'), undefined))
    expect(aging.totalOutstandingSatang).toBe(2_150_000)
    // ภายในยังหลัง Adjustment (รอบนี้ค้าง −10,700 ⇒ ไม่นับในยอดค้าง)
    const internalCompanies = await routes.providers.loadArAgingCompanies(ORG_ID, { companyId: CO1 })
    expect(internalCompanies[0]?.batches.some((batch) => batch.totalSatang === 39_911_000 - 1_070_000)).toBe(true)

    const dashboard = await dataOf<{ arOutstanding?: { outstandingSatang: number } }>(
      await routes.dashboard.GET(request('/api/portal/dashboard'), undefined),
    )
    expect(dashboard.arOutstanding?.outstandingSatang).toBe(1_070_000 + 1_080_000 + 0 + 0)
  })
})

suite('มติ U14 (fixer X3) — ใบลดหนี้ active หักยอดตามเอกสารในพอร์ทัล', () => {
  async function portalTotals(user: SessionUser) {
    as(user)
    const [billing, aging, revenue, dashboard, invoices] = await Promise.all([
      routes.billing.GET(request('/api/portal/billing-batches'), undefined).then(dataOf<PortalBillingBatchDto[]>),
      routes.aging.GET(request('/api/portal/reports/ar-aging'), undefined).then(dataOf<PortalArAgingDto>),
      routes.revenue.GET(request('/api/portal/reports/revenue-summary'), undefined).then(dataOf<PortalRevenueSummaryDto>),
      routes.dashboard
        .GET(request('/api/portal/dashboard'), undefined)
        .then(dataOf<{ arOutstanding?: { outstandingSatang: number } }>),
      routes.invoices.GET(request('/api/portal/tax-invoices'), undefined).then(dataOf<PortalTaxInvoiceDto[]>),
    ])
    return { billing, aging, revenue, dashboard, invoices }
  }

  it('ใบลดหนี้ 100.00 + VAT 7.00 ⇒ กราฟเดือนนั้น −10,000 · วางบิล/AR/dashboard −10,700 · ใบกำกับยังยอดหน้าใบ + แสดงใบลดหนี้ · ยกเลิกแล้วยอดกลับ', async () => {
    const creditNoteId = await seedCreditNote({ invoiceId: fx.co1InvoiceActive, beforeVatSatang: 10_000, vatSatang: 700 })
    const t = await portalTotals(CO1_MANAGER)

    expect(t.revenue.months.at(-1)?.revenueSatang).toBe(1_000_000 - 10_000)
    expect(t.revenue.total.revenueSatang).toBe(990_000)
    expect(t.billing.find((item) => item.id === fx.co1Sent)).toMatchObject({
      totalSatang: 1_070_000 - 10_700,
      outstandingSatang: 1_070_000 - 10_700,
    })
    expect(t.aging.totalOutstandingSatang).toBe(2_150_000 - 10_700)
    expect(t.dashboard.arOutstanding?.outstandingSatang).toBe(2_150_000 - 10_700)

    const invoice = t.invoices.find((item) => item.id === fx.co1InvoiceActive)
    expect(invoice).toMatchObject({
      totalBeforeVatSatang: 1_000_000,
      vatSatang: 70_000,
      totalSatang: 1_070_000,
      netBeforeVatSatang: 990_000,
      netVatSatang: 69_300,
      netTotalSatang: 1_059_300,
    })
    expect(invoice?.creditNotes).toHaveLength(1)
    expect(Object.keys(invoice?.creditNotes[0] ?? {}).sort()).toEqual(
      ['amountBeforeVatSatang', 'branchLabel', 'creditNoteNumber', 'id', 'issueDate', 'totalSatang', 'vatSatang'].sort(),
    )
    // มติ PO U82 — สาขาลูกค้าตามใบกำกับเดิม (ข้อความ ไม่ส่งรหัสดิบ)
    expect(invoice?.creditNotes[0]).toMatchObject({
      id: creditNoteId,
      issueDate: dayOffset(0),
      totalSatang: 10_700,
      branchLabel: 'สำนักงานใหญ่',
    })
    expect(t.invoices.find((item) => item.id === fx.co1InvoiceCancelled)?.creditNotes).toEqual([])
    expect(forbiddenKeysIn(t)).toEqual([])
    expect(JSON.stringify(t)).not.toContain('เหตุผลลดหนี้ภายใน')
    expect(JSON.stringify(t)).not.toContain('scan.pdf')

    await cancelCreditNoteRow(creditNoteId)
    const back = await portalTotals(CO1_MANAGER)
    expect(back.revenue.total.revenueSatang).toBe(1_000_000)
    expect(back.billing.find((item) => item.id === fx.co1Sent)?.totalSatang).toBe(1_070_000)
    expect(back.aging.totalOutstandingSatang).toBe(2_150_000)
    expect(back.dashboard.arOutstanding?.outstandingSatang).toBe(2_150_000)
    expect(back.invoices.find((item) => item.id === fx.co1InvoiceActive)).toMatchObject({ creditNotes: [], netTotalSatang: 1_070_000 })
  })

  it('ใบลดหนี้ของบริษัทอื่น (CO2) ไม่กระทบยอดของ CO1 · CO2 เห็นยอดหักของตัวเอง', async () => {
    await seedCreditNote({ invoiceId: fx.co2Invoice, beforeVatSatang: 50_000, vatSatang: 3_500 })
    const co1 = await portalTotals(CO1_MANAGER)
    expect(co1.aging.totalOutstandingSatang).toBe(2_150_000)
    expect(co1.revenue.total.revenueSatang).toBe(1_000_000)
    expect(co1.invoices.every((item) => item.creditNotes.length === 0)).toBe(true)

    as(CO2_MANAGER)
    const co2 = await dataOf<PortalArAgingDto>(await routes.aging.GET(request('/api/portal/reports/ar-aging'), undefined))
    expect(co2.totalOutstandingSatang).toBe(777_700 - 53_500)
  })

  it('documentedAmountsForBatches หลายรอบ: หักเฉพาะรอบที่มีใบลดหนี้ · รอบอื่น creditNotes = 0', async () => {
    await seedCreditNote({ invoiceId: fx.co1InvoiceActive, beforeVatSatang: 20_000, vatSatang: 1_400 })
    const map = await routes.documented.documentedAmountsForBatches(ORG_ID, [fx.co1Sent, fx.co1Partial])
    expect(map.get(fx.co1Sent)?.creditNotes).toEqual({ beforeVatSatang: 20_000, vatSatang: 1_400, totalSatang: 21_400 })
    expect(map.get(fx.co1Sent)?.documented.totalSatang).toBe(1_070_000 - 21_400)
    expect(map.get(fx.co1Partial)?.creditNotes).toEqual({ beforeVatSatang: 0, vatSatang: 0, totalSatang: 0 })
  })

  it('กราฟ: ใบลดหนี้ผูก Adjustment → รายได้ ⇒ หักตรงรายได้ใบนั้น · ไม่ผูก ⇒ กระจายตามสัดส่วน', async () => {
    const batchId = await seedBatch({ companyId: CO1, status: 'sent', totalSatang: 428_000, dueDate: dayOffset(-1) })
    const revA = await seedRevenue(await seedCase(CO1, 'closed_success'), CO1, 100_000, batchId)
    const revB = await seedRevenue(await seedCase(CO1, 'closed_success'), CO1, 300_000, batchId)
    const invoiceId = await seedInvoice({ batchId, companyId: CO1, totalSatang: 428_000 })
    const adjustment = await db().$queryRawUnsafe<{ id: string }[]>(`
      INSERT INTO adjustments (organization_id, adjustment_type, amount_satang, reason, status, revenue_id, created_by)
      VALUES ('${ORG_ID}', 'decrease', 40000, 'ปรับลด X3', 'approved', '${revA}', '${FINANCE_ID}') RETURNING id
    `)
    await seedCreditNote({ invoiceId, beforeVatSatang: 40_000, vatSatang: 2_800, adjustmentId: adjustment[0]?.id })
    await seedCreditNote({ invoiceId, beforeVatSatang: 12_000, vatSatang: 840 })

    const amounts = await routes.documented.documentedRevenueAmounts(ORG_ID, [batchId])
    // ตรง: A 100,000 − 40,000 = 60,000 · จากนั้น 12,000 กระจาย 60,000:300,000 = 2,000:10,000
    expect(amounts.get(revA)).toBe(58_000)
    expect(amounts.get(revB)).toBe(290_000)

    as(CO1_MANAGER)
    const dto = await dataOf<PortalRevenueSummaryDto>(
      await routes.revenue.GET(request('/api/portal/reports/revenue-summary'), undefined),
    )
    expect(dto.total.revenueSatang).toBe(1_000_000 + 400_000 - 52_000)
  })
})

// ════════════════════════════════════════════════════════════════════════════
// โหมด "ดู portal ในฐานะลูกค้า" ของผู้ใช้ภายใน (มติ PO 05/10/2569 U59) + เลขรอบ/จำนวนเคส (U62)
// ════════════════════════════════════════════════════════════════════════════

const OTHER_ORG_ID = '00000000-0000-4000-8000-0000000975d0'
const OTHER_ORG_COMPANY = '00000000-0000-4000-8000-0000000975d1'

/** ผู้ใช้ภายในที่ถือ `view_client_portal_as` (แถวผู้ใช้จริงใน DB — audit อ้าง FK ได้) */
const VIEW_AS_STAFF: SessionUser = {
  ...INTERNAL_FINANCE,
  capabilities: { view_client_portal_as: 'view' },
  // scope แคบ (ทีม) — ดาวน์โหลดใบกำกับต้องยังได้ เพราะโหมดดูแทนบังคับ scope เป็นบริษัทที่เปิดดู
  scope: { kind: 'team', teamIds: [], companyId: null, userId: FINANCE_ID },
}

const asQuery = (path: string, companyId: string): string => `${path}${path.includes('?') ? '&' : '?'}as=${companyId}`

suite('โหมดดู portal ในฐานะลูกค้า (มติ U59)', () => {
  beforeAll(async () => {
    if (!url) return
    await db().$executeRawUnsafe(`
      INSERT INTO organizations (id, name, tax_id, address)
      VALUES ('${OTHER_ORG_ID}', 'PortalViewAsOtherOrg', '9999999997599', 'ที่อยู่องค์กรอื่น') ON CONFLICT (id) DO NOTHING
    `)
    await db().$executeRawUnsafe(`
      INSERT INTO finance_companies (id, organization_id, name, short_name, tax_id, vat_mode, payment_due_days,
                                     address, created_by)
      VALUES ('${OTHER_ORG_COMPANY}', '${OTHER_ORG_ID}', 'ไฟแนนซ์องค์กรอื่น', 'OTHERORG', '0105512975099',
              'exclude_vat', 30, '9 ถ.อื่น', '${FINANCE_ID}')
      ON CONFLICT (id) DO NOTHING
    `)
  })

  it('ผู้ใช้ภายในที่มีสิทธิ์ เห็นข้อมูลของ CO1 เท่ากับผู้จัดการ CO1 ทุกหมวด · มีเลขรอบ/จำนวนเคส (U62)', async () => {
    as(CO1_MANAGER)
    const own = await dataOf<PortalBillingBatchDto[]>(await routes.billing.GET(request('/api/portal/billing-batches'), undefined))
    const ownInvoices = await dataOf<PortalTaxInvoiceDto[]>(await routes.invoices.GET(request('/api/portal/tax-invoices'), undefined))

    as(VIEW_AS_STAFF)
    const viewed = await dataOf<PortalBillingBatchDto[]>(
      await routes.billing.GET(request(asQuery('/api/portal/billing-batches', CO1)), undefined),
    )
    expect(viewed).toEqual(own)
    expect(viewed.map((item) => item.id)).not.toContain(fx.co1Draft)
    // จำนวนเคส = รายได้ที่ผูกรอบ · เลขรอบ = เลขจริง BL-<พ.ศ.>-NNN จาก DB (มติ U76 — ไม่ขึ้นกับรูปแบบรอบเดือน)
    expect(viewed.find((item) => item.id === fx.co1Sent)?.caseCount).toBe(1)
    expect(viewed.find((item) => item.id === fx.co1Partial)?.caseCount).toBe(0)
    expect(viewed.every((item) => /^BL-25\d{2}-\d{3,}$/.test(item.batchNumber))).toBe(true)

    const invoices = await dataOf<PortalTaxInvoiceDto[]>(
      await routes.invoices.GET(request(asQuery('/api/portal/tax-invoices', CO1)), undefined),
    )
    expect(invoices).toEqual(ownInvoices)
    const dashboard = await routes.dashboard.GET(request(asQuery('/api/portal/dashboard', CO1)), undefined)
    expect(dashboard.status).toBe(200)
    const aging = await routes.aging.GET(request(asQuery('/api/portal/reports/ar-aging', CO1)), undefined)
    expect(aging.status).toBe(200)
  })

  it('ดาวน์โหลดได้ + audit export ระบุผู้ดูภายใน + บริษัท + โหมด view_as · แถวของบริษัทอื่นยังรั่วไม่ได้', async () => {
    const since = new Date(Date.now() - 1000)
    as(VIEW_AS_STAFF)
    const ok = await routes.download.GET(
      request(asQuery(`/api/portal/tax-invoices/${fx.co1InvoiceActive}/download`, CO1)),
      params(fx.co1InvoiceActive),
    )
    expect(ok.status).toBe(200)
    expect(ok.headers.get('content-type')).toBe('application/pdf')
    const exported = await auditsSince(since, 'export', FINANCE_ID)
    expect(exported).toHaveLength(1)
    expect(exported[0]).toMatchObject({ actorId: FINANCE_ID, targetId: fx.co1InvoiceActive })
    expect(exported[0]?.afterData).toMatchObject({ channel: 'portal', company_id: CO1, mode: 'view_as', view_as: true })

    // ดูในฐานะ CO1 แต่ขอใบของ CO2 ⇒ 403 cross_company (ขอบเขตยังเป็นบริษัทที่เปิดดูเท่านั้น)
    const cross = await routes.download.GET(
      request(asQuery(`/api/portal/tax-invoices/${fx.co2Invoice}/download`, CO1)),
      params(fx.co2Invoice),
    )
    expect(cross.status).toBe(403)
    const denied = await auditsSince(since, 'access_denied', FINANCE_ID)
    expect(denied.at(-1)?.afterData).toMatchObject({ cause: 'cross_company', mode: 'view_as', view_as_company_id: CO1 })
  }, 30_000)

  it('ไม่มีสิทธิ์ / ผู้ใช้บริษัทส่ง as / บริษัทข้าม org / id มั่ว ⇒ 403 + audit access_denied', async () => {
    const cases: { user: SessionUser; companyId: string; cause: string }[] = [
      { user: INTERNAL_FINANCE, companyId: CO1, cause: 'view_as_missing_capability' },
      { user: CO1_MANAGER, companyId: CO2, cause: 'view_as_by_company_user' },
      { user: CO1_MANAGER, companyId: CO1, cause: 'view_as_by_company_user' },
      { user: VIEW_AS_STAFF, companyId: OTHER_ORG_COMPANY, cause: 'view_as_company_not_found' },
      { user: VIEW_AS_STAFF, companyId: '00000000-0000-4000-8000-0000000975ee', cause: 'view_as_company_not_found' },
      { user: VIEW_AS_STAFF, companyId: 'not-a-uuid', cause: 'view_as_company_not_found' },
    ]
    for (const each of cases) {
      const since = new Date(Date.now() - 1000)
      as(each.user)
      const response = await routes.billing.GET(request(asQuery('/api/portal/billing-batches', each.companyId)), undefined)
      expect(response.status, each.cause).toBe(403)
      expect(await codeOf(response)).toBe('PERMISSION_DENIED')
      const audits = await auditsSince(since, 'access_denied', each.user.id)
      expect(audits.at(-1)?.afterData, each.cause).toMatchObject({ cause: each.cause, mode: 'view_as' })
    }
  })

  it('บริษัทถูกระงับ ⇒ ผู้ใช้บริษัทเข้าไม่ได้ แต่ผู้ใช้ภายในยังเปิดดูได้ (ช่วยลูกค้า)', async () => {
    await db().$executeRawUnsafe(`UPDATE finance_companies SET status = 'suspended' WHERE id = '${CO2}'`)
    try {
      as(CO2_MANAGER)
      const blocked = await routes.billing.GET(request('/api/portal/billing-batches'), undefined)
      expect(await codeOf(blocked)).toBe('COMPANY_SUSPENDED')

      as(VIEW_AS_STAFF)
      const items = await dataOf<PortalBillingBatchDto[]>(
        await routes.billing.GET(request(asQuery('/api/portal/billing-batches', CO2)), undefined),
      )
      expect(items).toHaveLength(1)
    } finally {
      await db().$executeRawUnsafe(`UPDATE finance_companies SET status = 'active' WHERE id = '${CO2}'`)
    }
  })
})
