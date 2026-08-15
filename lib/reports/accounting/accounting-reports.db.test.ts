import { PrismaPg } from '@prisma/adapter-pg'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import type { SessionUser } from '@/lib/auth/types'
import { PrismaClient } from '@/lib/generated/prisma/client'
import { clearReportCache } from '@/lib/reports/cache'
import { findReport } from '@/lib/reports/catalog'
import type { ReportPayload, ReportRow } from '@/lib/reports/payload'
import { resolveReportRange, type ReportRange } from '@/lib/reports/range'

/**
 * เทสต์ระดับ DB ของ **รายงานหมวด A (A1–A4)** — DoD ของ `96` §6-A/§13
 *
 *  - A1: ยอดมาจาก `wht_filing_summaries` ตรง ๆ (ชั้น 4.5 ตัดใบที่ `cancelled` ออกให้แล้ว —
 *    รายงานห้ามรวมยอดจากใบ 50 ทวิ ซ้ำอีกชั้น) · รอบที่เลยกำหนดยื่นขึ้นป้ายเตือน
 *  - A2: ใบกำกับภาษีที่ `cancelled` ไม่ถูกนับในยอด/จำนวนใบ แต่ยังเห็นจำนวนที่ยกเลิก (`31`)
 *  - A3: แสดงทุกเวอร์ชัน + งวดที่ยังไม่เคยส่งออกต้องมีแถวของตัวเอง (`37` §6.2)
 *  - A4: `authorized` แยกจาก `resolved` เสมอ · KPI ตัวบล็อกนับเฉพาะ critical ที่ยัง `open` (`34` §6.3)
 *  - ช่วงเวลา: งวดนอกช่วงที่เลือกต้องไม่หลุดเข้ามา (แปลงช่วงวันที่ → ช่วงงวดบัญชี)
 *  - Permission: **การเงินเรียกหมวด A ต้อง 403** · บัญชีเรียกได้ (`96` §10)
 *
 * ทุกเทสต์เดินผ่าน `runReport()` ตัวจริง ⇒ ครอบทั้งยามสิทธิ์ + คีย์แคช + provider พร้อมกัน
 *
 * ⚠️ ต้องตั้ง `DATABASE_URL = TEST_DATABASE_URL` **ก่อน** import service (กับดัก 2026-08-14)
 * ⚠️ `tax_invoices` ลบไม่ได้ด้วย trigger (`02` §13) ⇒ ตอนล้างข้อมูลเทสต์ต้องปิด trigger ชั่วคราว
 *    (แนวเดียวกับ `handover_lots` ของ 2.13/6.3) และเลขที่ใบต้องไม่ซ้ำข้ามการรัน
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
  console.warn('[accounting-reports.db.test] ข้ามเทสต์ระดับ DB — ไม่มี TEST_DATABASE_URL (ดู .env.example)')
}

const ORG_ID = '00000000-0000-4000-8000-0000000064a0'
const ROLE_ID = '00000000-0000-4000-8000-0000000064a1'
const ACCOUNTING_ID = '00000000-0000-4000-8000-0000000064a2'
const FINANCE_ID = '00000000-0000-4000-8000-0000000064a3'
const COMPANY_A = '00000000-0000-4000-8000-0000000064a4'
const COMPANY_B = '00000000-0000-4000-8000-0000000064a5'

/** วันอ้างอิงของทุกเทสต์ — 15 สิงหาคม 2569 เวลาไทยเที่ยงวัน */
const NOW = new Date('2026-08-15T05:00:00Z')
const RANGE_MONTH = resolveReportRange({ preset: 'this_month' }, NOW)
const RANGE_YEAR = resolveReportRange({ preset: 'this_year' }, NOW)

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
  roleId: ROLE_ID,
  roleGroup: 'system' as const,
  loginAt: NOW.toISOString(),
}

/** ฝ่ายบัญชี — หมวด A ผูกกับ capability สายบัญชีระดับ manage (`25` §7.5) */
const accounting: SessionUser = {
  ...baseUser,
  id: ACCOUNTING_ID,
  supabaseUid: 'uid-accounting-64',
  email: 'accounting64@test.local',
  fullName: 'บัญชี 6.4',
  roleName: 'บัญชี',
  capabilities: { manage_wht: 'manage', manage_accounting_period: 'manage' },
  scope: { kind: 'global', teamIds: [], companyId: null, userId: ACCOUNTING_ID },
}

/** ฝ่ายการเงิน — ไม่มีสิทธิ์หมวด A ตาม §10 (ต้อง 403 ไม่ใช่เห็นตัวเลขว่าง) */
const finance: SessionUser = {
  ...baseUser,
  id: FINANCE_ID,
  supabaseUid: 'uid-finance-64',
  email: 'finance64@test.local',
  fullName: 'การเงิน 6.4',
  roleName: 'การเงิน',
  capabilities: { manage_billing: 'manage' },
  scope: { kind: 'global', teamIds: [], companyId: null, userId: FINANCE_ID },
}

async function run(
  reportId: string,
  params: Record<string, string> = {},
  user: SessionUser = accounting,
  range: ReportRange = RANGE_MONTH,
): Promise<ReportPayload> {
  const report = findReport(reportId)
  if (report === null) throw new Error(`ไม่รู้จักรายงาน ${reportId}`)
  return runner.runReport(user, report, { range, refresh: true, params, now: NOW })
}

const rowBy = (payload: ReportPayload, key: string, value: string): ReportRow | undefined =>
  payload.rows.find((row) => row[key] === value)
const kpiOf = (payload: ReportPayload, key: string): unknown => payload.kpis.find((kpi) => kpi.key === key)?.value

// ── seed helpers ────────────────────────────────────────────────────────────

let seq = 0
const RUN = Date.now()

async function seedPeriod(options: { yearBe: number; month: number; label: string }): Promise<string> {
  const rows = await db().$queryRawUnsafe<{ id: string }[]>(`
    INSERT INTO accounting_periods (organization_id, period_label, year_be, month, status, created_by)
    VALUES ('${ORG_ID}', $$${options.label}$$, ${options.yearBe}, ${options.month}, 'collecting', '${ACCOUNTING_ID}')
    RETURNING id
  `)
  return rows[0]?.id ?? ''
}

async function seedFilingSummary(options: {
  periodId: string
  periodLabel: string
  filingDueDate: string
  pnd3Satang: number
  pnd53Satang: number
  status?: 'pending' | 'filed'
}): Promise<void> {
  await db().$executeRawUnsafe(`
    INSERT INTO wht_filing_summaries (organization_id, period_id, period_label, filing_due_date,
                                      pnd3_satang, pnd53_satang, status)
    VALUES ('${ORG_ID}', '${options.periodId}', $$${options.periodLabel}$$, '${options.filingDueDate}',
            ${options.pnd3Satang}, ${options.pnd53Satang}, '${options.status ?? 'pending'}')
  `)
}

/** 1 ใบกำกับภาษี = 1 รอบวางบิล + 1 บันทึกขาย (1:1 ตาม `02` §9) */
async function seedTaxInvoice(options: {
  periodId: string
  companyId?: string
  invoiceDate: string
  beforeVatSatang?: number
  vatSatang?: number
  cancelled?: boolean
}): Promise<void> {
  seq += 1
  const companyId = options.companyId ?? COMPANY_A
  const beforeVat = options.beforeVatSatang ?? 100_000_00
  const vat = options.vatSatang ?? 7_000_00
  const total = beforeVat + vat
  const tx = db()

  const batch = await tx.$queryRawUnsafe<{ id: string }[]>(`
    INSERT INTO billing_batches (organization_id, company_id, period, status, total_satang, due_date, created_by)
    VALUES ('${ORG_ID}', '${companyId}', $$รอบทดสอบ ${RUN}-${seq}$$, 'sent', ${total},
            '${options.invoiceDate}', '${ACCOUNTING_ID}')
    RETURNING id
  `)
  const sales = await tx.$queryRawUnsafe<{ id: string }[]>(`
    INSERT INTO sales_records (organization_id, period_id, billing_batch_id, company_id,
                               total_before_vat_satang, vat_satang, total_satang, created_by)
    VALUES ('${ORG_ID}', '${options.periodId}', '${batch[0]?.id}', '${companyId}',
            ${beforeVat}, ${vat}, ${total}, '${ACCOUNTING_ID}')
    RETURNING id
  `)
  const cancelled = options.cancelled === true
  await tx.$executeRawUnsafe(`
    INSERT INTO tax_invoices (organization_id, sales_record_id, invoice_number, invoice_date, status,
                              cancel_reason, cancelled_by, cancelled_at, created_by)
    VALUES ('${ORG_ID}', '${sales[0]?.id}', 'INV64-${RUN}-${seq}', '${options.invoiceDate}',
            '${cancelled ? 'cancelled' : 'active'}',
            ${cancelled ? `$$ยกเลิกในเทสต์$$, '${ACCOUNTING_ID}', '${options.invoiceDate}T03:00:00Z'` : 'NULL, NULL, NULL'},
            '${ACCOUNTING_ID}')
  `)
}

async function seedExportRecord(options: {
  periodId: string
  version: number
  status: 'generated' | 'sent' | 'accepted'
  sentAt?: string | null
  mainFiles?: number
}): Promise<void> {
  const files = Object.fromEntries(
    Array.from({ length: options.mainFiles ?? 8 }, (_, index) => [String(index + 1).padStart(2, '0'), 'path.csv']),
  )
  const sentAt = options.sentAt ?? (options.status === 'generated' ? null : '2026-08-03T02:15:00Z')
  await db().$executeRawUnsafe(`
    INSERT INTO export_records (organization_id, period_id, version, status, file_urls, file_hash,
                                generated_by, sent_at, sent_by)
    VALUES ('${ORG_ID}', '${options.periodId}', ${options.version}, '${options.status}',
            $$${JSON.stringify({ ...files, cover: 'cover.pdf', pack: 'pack.zip' })}$$::jsonb,
            'hash-${options.version}', '${ACCOUNTING_ID}',
            ${sentAt === null ? 'NULL' : `'${sentAt}'`}, ${sentAt === null ? 'NULL' : `'${ACCOUNTING_ID}'`})
  `)
}

async function seedException(options: {
  periodId: string
  level: 'info' | 'warning' | 'critical'
  status: 'open' | 'resolved' | 'authorized'
}): Promise<void> {
  seq += 1
  const authorized = options.status === 'authorized'
  const resolved = options.status === 'resolved'
  await db().$executeRawUnsafe(`
    INSERT INTO exceptions (organization_id, period_id, level, status, title, description, source_module,
                            resolved_by, resolved_at, resolution_note,
                            authorized_by, authorized_at, authorize_note, created_by)
    VALUES ('${ORG_ID}', '${options.periodId}', '${options.level}', '${options.status}',
            $$ข้อยกเว้น ${seq}$$, $$รายละเอียด ${seq}$$, 'billing',
            ${resolved ? `'${ACCOUNTING_ID}', '2026-08-10T03:00:00Z', $$แก้แล้ว$$` : 'NULL, NULL, NULL'},
            ${authorized ? `'${ACCOUNTING_ID}', '2026-08-10T03:00:00Z', $$ผู้บริหารรับความเสี่ยง$$` : 'NULL, NULL, NULL'},
            '${ACCOUNTING_ID}')
  `)
}

async function cleanup(): Promise<void> {
  const tx = db()
  // ใบกำกับภาษี/ชุดส่งสำนักงานบัญชี ลบไม่ได้ด้วย trigger (`02` §13) — ปิดเฉพาะตอนล้างข้อมูลเทสต์
  await tx.$executeRawUnsafe(`ALTER TABLE tax_invoices DISABLE TRIGGER trg_tax_invoices_no_delete`)
  await tx.$executeRawUnsafe(`ALTER TABLE export_records DISABLE TRIGGER trg_export_records_no_delete`)
  try {
    await tx.$executeRawUnsafe(`DELETE FROM tax_invoices WHERE organization_id = '${ORG_ID}'`)
    await tx.$executeRawUnsafe(`DELETE FROM sales_records WHERE organization_id = '${ORG_ID}'`)
    await tx.$executeRawUnsafe(`DELETE FROM billing_batches WHERE organization_id = '${ORG_ID}'`)
    await tx.$executeRawUnsafe(`DELETE FROM exceptions WHERE organization_id = '${ORG_ID}'`)
    await tx.$executeRawUnsafe(`DELETE FROM export_records WHERE organization_id = '${ORG_ID}'`)
    await tx.$executeRawUnsafe(`DELETE FROM wht_filing_summaries WHERE organization_id = '${ORG_ID}'`)
    await tx.$executeRawUnsafe(`DELETE FROM accounting_periods WHERE organization_id = '${ORG_ID}'`)
  } finally {
    await tx.$executeRawUnsafe(`ALTER TABLE export_records ENABLE TRIGGER trg_export_records_no_delete`)
    await tx.$executeRawUnsafe(`ALTER TABLE tax_invoices ENABLE TRIGGER trg_tax_invoices_no_delete`)
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
    VALUES ('${ORG_ID}', 'Phase64Test', '9999999996400', 'ที่อยู่ทดสอบ 6.4') ON CONFLICT (id) DO NOTHING
  `)
  await tx.$executeRawUnsafe(`
    INSERT INTO roles (id, organization_id, name, role_group, is_seed)
    VALUES ('${ROLE_ID}', '${ORG_ID}', 'บัญชี 6.4', 'system', false) ON CONFLICT (id) DO NOTHING
  `)
  await tx.$executeRawUnsafe(`
    INSERT INTO users (id, organization_id, role_id, email, full_name, status) VALUES
      ('${ACCOUNTING_ID}', '${ORG_ID}', '${ROLE_ID}', 'accounting64@test.local', 'บัญชี 6.4', 'active'),
      ('${FINANCE_ID}', '${ORG_ID}', '${ROLE_ID}', 'finance64@test.local', 'การเงิน 6.4', 'active')
    ON CONFLICT (id) DO NOTHING
  `)
  await tx.$executeRawUnsafe(`
    INSERT INTO finance_companies (id, organization_id, name, short_name, tax_id, vat_mode,
                                   payment_due_days, created_by) VALUES
      ('${COMPANY_A}', '${ORG_ID}', 'ไฟแนนซ์ A 6.4', 'A64', '0105512640001', 'exclude_vat', 30, '${ACCOUNTING_ID}'),
      ('${COMPANY_B}', '${ORG_ID}', 'ไฟแนนซ์ B 6.4', 'B64', '0105512640002', 'exclude_vat', 30, '${ACCOUNTING_ID}')
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

suite('A1 — สรุป WHT รายเดือน', () => {
  it('ยอดตรงกับสรุปรอบนำส่งที่บันทึกไว้ (รายงานไม่รวมยอดจากใบ 50 ทวิ เอง)', async () => {
    const period = await seedPeriod({ yearBe: 2569, month: 8, label: 'สิงหาคม 2569' })
    await seedFilingSummary({
      periodId: period,
      periodLabel: 'สิงหาคม 2569',
      filingDueDate: '2026-09-15',
      pnd3Satang: 14_800_00,
      pnd53Satang: 3_600_00,
    })

    const payload = await run('wht-summary')

    expect(payload.range.label).toBe('สิงหาคม 2569')
    expect(rowBy(payload, 'period', 'สิงหาคม 2569')).toMatchObject({
      pnd3Satang: 14_800_00,
      pnd53Satang: 3_600_00,
      totalSatang: 18_400_00,
      filingDueDate: '2026-09-15',
      statusLabel: 'รอยื่นแบบ',
    })
    expect(kpiOf(payload, 'total')).toBe(18_400_00)
  })

  it('งวดนอกช่วงที่เลือกไม่หลุดเข้ามา — เลือกทั้งปีจึงเห็นครบ', async () => {
    const july = await seedPeriod({ yearBe: 2569, month: 7, label: 'กรกฎาคม 2569' })
    const august = await seedPeriod({ yearBe: 2569, month: 8, label: 'สิงหาคม 2569' })
    await seedFilingSummary({
      periodId: july,
      periodLabel: 'กรกฎาคม 2569',
      filingDueDate: '2026-08-15',
      pnd3Satang: 1_000_00,
      pnd53Satang: 0,
    })
    await seedFilingSummary({
      periodId: august,
      periodLabel: 'สิงหาคม 2569',
      filingDueDate: '2026-09-15',
      pnd3Satang: 2_000_00,
      pnd53Satang: 0,
    })

    const monthly = await run('wht-summary')
    expect(monthly.rows.map((row) => row.period)).toEqual(['สิงหาคม 2569'])

    const yearly = await run('wht-summary', {}, accounting, RANGE_YEAR)
    expect(yearly.rows.map((row) => row.period)).toEqual(['กรกฎาคม 2569', 'สิงหาคม 2569'])
    expect(kpiOf(yearly, 'total')).toBe(3_000_00)
  })

  it('รอบที่ยังไม่ยื่นและเลยกำหนดแล้วขึ้นป้ายเตือน (ยื่นแล้วไม่ขึ้นไม่ว่าจะช้าแค่ไหน)', async () => {
    const overdue = await seedPeriod({ yearBe: 2569, month: 6, label: 'มิถุนายน 2569' })
    const filedLate = await seedPeriod({ yearBe: 2569, month: 5, label: 'พฤษภาคม 2569' })
    await seedFilingSummary({
      periodId: overdue,
      periodLabel: 'มิถุนายน 2569',
      filingDueDate: '2026-07-15',
      pnd3Satang: 500_00,
      pnd53Satang: 0,
      status: 'pending',
    })
    await seedFilingSummary({
      periodId: filedLate,
      periodLabel: 'พฤษภาคม 2569',
      filingDueDate: '2026-06-15',
      pnd3Satang: 400_00,
      pnd53Satang: 0,
      status: 'filed',
    })

    const payload = await run('wht-summary', {}, accounting, RANGE_YEAR)

    expect(rowBy(payload, 'period', 'มิถุนายน 2569')?.statusLabel).toBe('รอยื่นแบบ (เลยกำหนด)')
    expect(rowBy(payload, 'period', 'พฤษภาคม 2569')?.statusLabel).toBe('ยื่นแล้ว')
    expect(kpiOf(payload, 'pending')).toBe(1)
  })
})

suite('A2 — สรุปใบกำกับภาษี', () => {
  it('ใบที่ยกเลิกไม่ถูกนับในยอดและจำนวนใบ แต่ยังเห็นจำนวนที่ยกเลิก (`31`)', async () => {
    const period = await seedPeriod({ yearBe: 2569, month: 8, label: 'สิงหาคม 2569' })
    await seedTaxInvoice({ periodId: period, invoiceDate: '2026-08-05' })
    await seedTaxInvoice({ periodId: period, invoiceDate: '2026-08-06', cancelled: true })

    const payload = await run('tax-invoice', { dimension: 'month' })

    expect(rowBy(payload, 'group', 'สิงหาคม 2569')).toMatchObject({
      invoiceCount: 1,
      beforeVatSatang: 100_000_00,
      vatSatang: 7_000_00,
      totalSatang: 107_000_00,
      cancelledCount: 1,
    })
    expect(kpiOf(payload, 'net')).toBe(107_000_00)
  })

  it('ยอด VAT มาจาก snapshot ของบันทึกขาย ไม่ได้คิด 7% ใหม่', async () => {
    const period = await seedPeriod({ yearBe: 2569, month: 8, label: 'สิงหาคม 2569' })
    // อัตราสมมุติ 10% (บันทึกไว้ตอนออกใบ) — รายงานต้องคืนตัวเลขนี้ ไม่ใช่ 7% ของยอดก่อน VAT
    await seedTaxInvoice({ periodId: period, invoiceDate: '2026-08-05', beforeVatSatang: 100_00, vatSatang: 10_00 })

    const payload = await run('tax-invoice', { dimension: 'month' })
    expect(rowBy(payload, 'group', 'สิงหาคม 2569')).toMatchObject({ vatSatang: 10_00, totalSatang: 110_00 })
  })

  it('มิติรายบริษัทแยกแถวตามบริษัทจริง · ใบนอกช่วงวันที่ไม่ถูกนับ', async () => {
    const period = await seedPeriod({ yearBe: 2569, month: 8, label: 'สิงหาคม 2569' })
    await seedTaxInvoice({ periodId: period, companyId: COMPANY_A, invoiceDate: '2026-08-05' })
    await seedTaxInvoice({ periodId: period, companyId: COMPANY_B, invoiceDate: '2026-08-07' })
    // นอกช่วง "เดือนนี้"
    await seedTaxInvoice({ periodId: period, companyId: COMPANY_A, invoiceDate: '2026-07-31' })

    const payload = await run('tax-invoice', { dimension: 'company' })

    expect(payload.rows).toHaveLength(2)
    expect(rowBy(payload, 'group', 'ไฟแนนซ์ A 6.4')).toMatchObject({ invoiceCount: 1 })
    expect(kpiOf(payload, 'invoiceCount')).toBe(2)
  })
})

suite('A3 — สถานะส่งออกชุดข้อมูลบัญชี', () => {
  it('แสดงทุกเวอร์ชันของงวดเดียวกัน (ส่งซ้ำไม่ทับของเดิม) + นับเฉพาะไฟล์หลัก 01–08', async () => {
    const period = await seedPeriod({ yearBe: 2569, month: 8, label: 'สิงหาคม 2569' })
    await seedExportRecord({ periodId: period, version: 1, status: 'accepted' })
    await seedExportRecord({ periodId: period, version: 2, status: 'sent' })

    const payload = await run('export-history')

    expect(payload.rows.map((row) => row.version)).toEqual(['v1.1', 'v1.0'])
    // หน้าปก (`cover`) และไฟล์ .zip (`pack`) ไม่นับเป็นไฟล์ข้อมูล
    expect(payload.rows[0]).toMatchObject({ fileCount: 8, statusLabel: 'ส่งสำนักงานบัญชีแล้ว', sentBy: 'บัญชี 6.4' })
    expect(kpiOf(payload, 'periods')).toBe(1)
    expect(kpiOf(payload, 'accepted')).toBe(1)
  })

  it('งวดที่ยังไม่เคยส่งออกต้องมีแถว "ยังไม่ส่งออก" (ไม่ใช่หายไปจากรายงาน)', async () => {
    const july = await seedPeriod({ yearBe: 2569, month: 7, label: 'กรกฎาคม 2569' })
    await seedPeriod({ yearBe: 2569, month: 8, label: 'สิงหาคม 2569' })
    await seedExportRecord({ periodId: july, version: 1, status: 'sent' })

    const payload = await run('export-history', {}, accounting, RANGE_YEAR)

    expect(payload.rows.map((row) => row.period)).toEqual(['สิงหาคม 2569', 'กรกฎาคม 2569'])
    expect(rowBy(payload, 'period', 'สิงหาคม 2569')).toMatchObject({
      version: null,
      statusLabel: 'ยังไม่ส่งออก',
      fileCount: null,
      attachmentCount: null,
    })
    expect(kpiOf(payload, 'notExported')).toBe(1)
    expect(kpiOf(payload, 'sent')).toBe(1)
  })
})

suite('A4 — สรุปข้อยกเว้นรายงวด', () => {
  it('`authorized` ไม่ถูกนับปนกับ `resolved` และไม่นับเป็นตัวบล็อก (`34` §6.3)', async () => {
    const period = await seedPeriod({ yearBe: 2569, month: 8, label: 'สิงหาคม 2569' })
    await seedException({ periodId: period, level: 'critical', status: 'open' })
    await seedException({ periodId: period, level: 'critical', status: 'authorized' })
    await seedException({ periodId: period, level: 'warning', status: 'resolved' })
    await seedException({ periodId: period, level: 'info', status: 'open' })

    const payload = await run('exception-summary')

    expect(rowBy(payload, 'period', 'สิงหาคม 2569')).toMatchObject({
      critical: 2,
      warning: 1,
      info: 1,
      resolved: 1,
      authorized: 1,
      open: 2,
    })
    expect(kpiOf(payload, 'blockingCritical')).toBe(1)
    expect(kpiOf(payload, 'authorized')).toBe(1)
    expect(kpiOf(payload, 'resolved')).toBe(1)
  })

  it('งวดที่ไม่มีข้อยกเว้นเลยยังมีแถวยอด 0 · ข้อยกเว้นของงวดนอกช่วงไม่ปนเข้ามา', async () => {
    const july = await seedPeriod({ yearBe: 2569, month: 7, label: 'กรกฎาคม 2569' })
    await seedPeriod({ yearBe: 2569, month: 8, label: 'สิงหาคม 2569' })
    await seedException({ periodId: july, level: 'critical', status: 'open' })

    const monthly = await run('exception-summary')
    expect(monthly.rows).toHaveLength(1)
    expect(monthly.rows[0]).toMatchObject({ period: 'สิงหาคม 2569', critical: 0, open: 0 })

    const yearly = await run('exception-summary', {}, accounting, RANGE_YEAR)
    expect(rowBy(yearly, 'period', 'กรกฎาคม 2569')).toMatchObject({ critical: 1, open: 1 })
    expect(kpiOf(yearly, 'blockingCritical')).toBe(1)
  })
})

suite('สิทธิ์ของหมวด A (`96` §10)', () => {
  it('การเงินเรียกรายงานหมวด A ต้อง 403 ทุกตัว', async () => {
    for (const reportId of ['wht-summary', 'tax-invoice', 'export-history', 'exception-summary']) {
      await expect(run(reportId, {}, finance), reportId).rejects.toThrow(/PERMISSION_DENIED/)
    }
  })

  it('บัญชีเรียกได้ครบทั้ง 4 ตัว (ข้อมูลว่างก็ต้องเป็นตารางว่าง ไม่ใช่ error)', async () => {
    for (const reportId of ['wht-summary', 'tax-invoice', 'export-history', 'exception-summary']) {
      const payload = await run(reportId)
      expect(payload.rows, reportId).toHaveLength(0)
      expect(payload.cache.mode, reportId).toBe('realtime')
    }
  })
})
