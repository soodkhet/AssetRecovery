import { PrismaPg } from '@prisma/adapter-pg'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { SessionUser } from '@/lib/auth/types'
import { PrismaClient } from '@/lib/generated/prisma/client'

/**
 * เทสต์ระดับ DB ของ Phase 4.3 — DoD ของไฟล์ 31
 *
 *  - `31` §6.1: รอบวางบิลถูกส่งบิล ⇒ เกิด Sales Record 1:1 (เรียกซ้ำไม่สร้างซ้ำ)
 *  - `31` §16: ออกใบกำกับภาษีที่ฟิลด์บังคับไม่ครบ ⇒ `TAX_INVOICE_FIELD_MISSING`
 *  - `31` §16: ยกเลิกไม่ระบุเหตุผล ⇒ `CANCEL_REQUIRES_REASON`
 *  - **DoD 4.3**: ยกเลิกใบเลขที่ 005 แล้วออกใหม่ ⇒ ได้ 006 (เลขเดิมไม่ recycle)
 *  - **DoD 4.3**: ออกพร้อมกันหลายคำขอ ⇒ เลขไม่ซ้ำ ไม่ขาดช่วง (`INVOICE_NUMBER_GAP`)
 *  - `31` §16: โหมด `yearly_reset` ข้ามปี ⇒ กลับไปเริ่ม 0001 พร้อม prefix ปีใหม่
 *  - `02` §13: ใบที่ยกเลิกแล้วห้ามแก้/ห้าม reverse · ใบกำกับภาษีลบไม่ได้ทุกกรณี (trigger ระดับ DB)
 *  - Period Lock: งวดที่ `locked` ⇒ ออก/ยกเลิกใบกำกับภาษีไม่ได้ (`PERIOD_LOCKED_DIRECT_EDIT`)
 *  - `31` §6.3: เงินรับอ่านได้จากรายการที่ไฟล์ 35 สร้างไว้ (โมดูลนี้ไม่มีทางสร้างเอง)
 *
 * ⚠️ ต้องตั้ง `DATABASE_URL = TEST_DATABASE_URL` **ก่อน** import service (กับดัก 2026-08-14)
 * ⚠️ `tax_invoices` ลบไม่ได้ (trigger) ⇒ เทสต์สร้าง **บริษัทไฟแนนซ์ใหม่ทุกครั้งที่รัน** และใช้
 *    prefix เลขที่เฉพาะรัน เพื่อไม่ให้ข้อมูลค้างจากรันก่อนชนกับ unique `invoice_number`
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
  console.warn('[sales.db.test] ข้ามเทสต์ระดับ DB — ไม่มี TEST_DATABASE_URL (ดู .env.example)')
}

const ORG_ID = '00000000-0000-4000-8000-0000000043a0'
const ROLE_ACCOUNTING = '00000000-0000-4000-8000-0000000043a1'
const ACCOUNTING_ID = '00000000-0000-4000-8000-0000000043a2'
const TEAM_ID = '00000000-0000-4000-8000-0000000043a3'
const BANK_ACCOUNT_ID = '00000000-0000-4000-8000-0000000043a4'

/** prefix เฉพาะรัน — กันชนกับใบกำกับภาษีที่ค้างจากรันก่อน (ลบไม่ได้ตาม `02` §13) */
const RUN = `${process.pid}${Date.now() % 100_000}`
const PREFIX = `T${RUN}`
/** เลขผู้เสียภาษี 13 หลักเฉพาะรัน — unique `(organization_id, tax_id)` ของ `finance_companies` */
const RUN_TAX_ID = RUN.padEnd(13, '0').slice(0, 13)
/** เลขผู้เสียภาษีที่ **ไม่ถูกต้อง** (ไม่ใช่ตัวเลข 13 หลัก) — ใช้ทดสอบ `TAX_INVOICE_FIELD_MISSING` */
const BAD_TAX_ID = `BAD${RUN}`.slice(0, 13)

const MONTHS = [
  'มกราคม',
  'กุมภาพันธ์',
  'มีนาคม',
  'เมษายน',
  'พฤษภาคม',
  'มิถุนายน',
  'กรกฎาคม',
  'สิงหาคม',
  'กันยายน',
  'ตุลาคม',
  'พฤศจิกายน',
  'ธันวาคม',
] as const

let client: PrismaClient | null = null
type SalesQueries = typeof import('@/lib/sales/queries')
type RevenueQueries = typeof import('@/lib/revenue/queries')
let sales: SalesQueries
let revenue: RevenueQueries

function db(): PrismaClient {
  if (!url) throw new Error('ไม่มี TEST_DATABASE_URL')
  if (!client) {
    assertLocalTestDatabase(url)
    client = new PrismaClient({ adapter: new PrismaPg({ connectionString: url }) })
  }
  return client
}

const meta = { ipAddress: null, userAgent: null }

const accountant: SessionUser = {
  id: ACCOUNTING_ID,
  organizationId: ORG_ID,
  supabaseUid: 'uid-acc-43',
  email: 'accounting43@test.local',
  fullName: 'บัญชี 4.3',
  status: 'active',
  roleId: ROLE_ACCOUNTING,
  roleName: 'บัญชี',
  roleGroup: 'system',
  isSuperadmin: false,
  teamId: null,
  companyId: null,
  capabilities: {
    manage_tax_invoice: 'manage',
    manage_sales_expenses: 'manage',
    manage_accounting_period: 'manage',
    manage_billing: 'manage',
  },
  scope: { kind: 'global', teamIds: [], companyId: null, userId: ACCOUNTING_ID },
  loginAt: new Date().toISOString(),
}

const ctx = { actor: accountant, meta }
const billingCtx = { actor: accountant, meta, reason: 'ส่งบิลตามรอบ (เทสต์ 4.3)' }

function codeOf(error: unknown): string {
  return (error as { code?: string }).code ?? String(error)
}

async function expectCode(run: () => Promise<unknown>, code: string): Promise<void> {
  await expect(run()).rejects.toSatisfy((error: unknown) => codeOf(error) === code, `ต้องได้ error code ${code}`)
}

/** ตัวเลขลำดับท้ายเลขที่ใบกำกับภาษี (`<prefix>-0006` ⇒ 6) */
function sequenceOf(invoiceNumber: string): number {
  const running = invoiceNumber.split('-').at(-1) ?? ''
  return Number.parseInt(running, 10)
}

// ── seed helpers ────────────────────────────────────────────────────────────

let companyId = ''
let caseId = ''
let monthCursor = 0

/** รอบวางบิลใหม่ 1 รอบ (เดือนไม่ซ้ำกันในไฟล์เทสต์) + รายได้ 1 ใบ — คืน id ของรอบและป้ายงวด */
async function seedBilling(
  options: { status?: string; grossSatang?: number; vatSatang?: number; company?: string } = {},
): Promise<{ id: string; period: string }> {
  const month = MONTHS[monthCursor % 12] ?? 'มกราคม'
  const yearBe = 2569 + Math.floor(monthCursor / 12)
  monthCursor += 1
  const period = `${month} ${yearBe}`
  const gross = options.grossSatang ?? 1_200_000
  const vat = options.vatSatang ?? 84_000
  const company = options.company ?? companyId

  const rows = await db().$queryRawUnsafe<{ id: string }[]>(`
    INSERT INTO billing_batches (organization_id, company_id, period, status, total_satang, due_date, created_by)
    VALUES ('${ORG_ID}', '${company}', $$${period}$$, '${options.status ?? 'draft'}', ${gross + vat},
            '2026-12-31', '${ACCOUNTING_ID}')
    RETURNING id
  `)
  const id = rows[0]?.id ?? ''

  await db().$executeRawUnsafe(`
    INSERT INTO revenues (organization_id, case_id, company_id, billing_batch_id, gross_satang, vat_satang,
                          vat_rate_pct_used, total_satang, fee_model_snapshot, status, revenue_date, created_by)
    VALUES ('${ORG_ID}', '${caseId}', '${company}', '${id}', ${gross}, ${vat}, 7.00, ${gross + vat},
            'SUCCESS_FEE', 'billed', '2026-06-25', '${ACCOUNTING_ID}')
  `)

  return { id, period }
}

/** ตั้งค่าตัวเดินเลขของ organization โดยตรง (ระบบไม่เปิดให้แก้ผ่าน API — `13` §6.12) */
async function setNumbering(
  options: { seq?: number; mode?: 'continuous' | 'yearly_reset'; lastResetYear?: number | null } = {},
): Promise<void> {
  const lastResetYear = options.lastResetYear === undefined ? 'NULL' : (options.lastResetYear ?? 'NULL')
  await db().$executeRawUnsafe(`
    UPDATE organizations
       SET tax_invoice_seq = ${options.seq ?? 0},
           tax_invoice_prefix = '${PREFIX}',
           tax_invoice_numbering_mode = '${options.mode ?? 'continuous'}',
           tax_invoice_digit_length = 4,
           tax_invoice_last_reset_year = ${lastResetYear}
     WHERE id = '${ORG_ID}'
  `)
}

async function lockPeriodOf(period: string): Promise<void> {
  const [month = '', yearText = ''] = period.split(' ')
  const monthIndex = MONTHS.indexOf(month as (typeof MONTHS)[number]) + 1
  const tx = db()
  // งวดที่ `locked` อยู่แล้ว (ของค้างจากรอบรันก่อน) ถูก trigger แช่แข็ง (`02` §13)
  // — fixture ต้องล็อกซ้ำได้ ⇒ ปิดยามเฉพาะตอนตั้งค่าเทสต์
  await tx.$executeRawUnsafe(`ALTER TABLE accounting_periods DISABLE TRIGGER trg_accounting_periods_locked`)
  try {
    await tx.$executeRawUnsafe(`
      UPDATE accounting_periods SET status = 'locked'
      WHERE organization_id = '${ORG_ID}' AND year_be = ${Number.parseInt(yearText, 10)} AND month = ${monthIndex}
    `)
  } finally {
    await tx.$executeRawUnsafe(`ALTER TABLE accounting_periods ENABLE TRIGGER trg_accounting_periods_locked`)
  }
}

beforeAll(async () => {
  if (!url) return
  process.env.DATABASE_URL = url
  sales = await import('@/lib/sales/queries')
  revenue = await import('@/lib/revenue/queries')

  const tx = db()
  await tx.$executeRawUnsafe(`
    INSERT INTO organizations (id, name, tax_id, address, vat_registered, tax_invoice_prefix)
    VALUES ('${ORG_ID}', 'Phase43Test', '9999999994300', 'ที่อยู่ทดสอบ 4.3 กรุงเทพฯ', true, '${PREFIX}')
    ON CONFLICT (id) DO NOTHING
  `)
  await tx.$executeRawUnsafe(`
    INSERT INTO roles (id, organization_id, name, role_group, is_seed)
    VALUES ('${ROLE_ACCOUNTING}', '${ORG_ID}', 'บัญชี 4.3', 'system', false) ON CONFLICT (id) DO NOTHING
  `)
  await tx.$executeRawUnsafe(`
    INSERT INTO users (id, organization_id, role_id, email, full_name, status)
    VALUES ('${ACCOUNTING_ID}', '${ORG_ID}', '${ROLE_ACCOUNTING}', 'accounting43@test.local', 'บัญชี 4.3', 'active')
    ON CONFLICT (id) DO NOTHING
  `)
  await tx.$executeRawUnsafe(`
    INSERT INTO teams (id, organization_id, name, side, provinces, status, created_by)
    VALUES ('${TEAM_ID}', '${ORG_ID}', 'ทีมทดสอบ 4.3', 'outsource', ARRAY['เชียงใหม่'], 'active', '${ACCOUNTING_ID}')
    ON CONFLICT (id) DO NOTHING
  `)
  await tx.$executeRawUnsafe(`
    INSERT INTO bank_accounts (id, organization_id, bank_name, account_name, account_number, usage,
                               auto_match_tolerance_days, created_by)
    VALUES ('${BANK_ACCOUNT_ID}', '${ORG_ID}', 'ธนาคารกสิกรไทย', 'บริษัท 4.3', '3334445550', 'both', 7,
            '${ACCOUNTING_ID}')
    ON CONFLICT (id) DO NOTHING
  `)

  // บริษัทไฟแนนซ์ **ใหม่ทุกครั้งที่รัน** — ข้อมูลของรันก่อนลบไม่ได้ (tax_invoices immutable)
  const company = await tx.$queryRawUnsafe<{ id: string }[]>(`
    INSERT INTO finance_companies (organization_id, name, short_name, tax_id, address, vat_mode,
                                   payment_due_days, created_by)
    VALUES ('${ORG_ID}', 'ไฟแนนซ์ 4.3 (${RUN})', 'F43', '${RUN_TAX_ID}', '1 ถนนสีลม กรุงเทพฯ', 'exclude_vat', 30,
            '${ACCOUNTING_ID}')
    RETURNING id
  `)
  companyId = company[0]?.id ?? ''

  const seededCase = await tx.$queryRawUnsafe<{ id: string }[]>(`
    INSERT INTO cases (organization_id, case_ref, case_ref_normalized, company_id, source, status, created_by,
                       debtor_name, addr_province, addr_district, asset_kind, asset_description,
                       debt_amount_satang, assigned_team_id, outcome, closed_at,
                       service_fee_model_snapshot, service_fee_base_satang, service_fee_rate_pct,
                       service_fee_basis_snapshot, service_fee_charge_on_fail)
    VALUES ('${ORG_ID}', $$SALES43-${RUN}$$, $$SALES43-${RUN}$$, '${companyId}', 'manual', 'closed_success',
            '${ACCOUNTING_ID}', 'ลูกหนี้ 4.3', 'เชียงใหม่', 'เมือง', 'smartphone', 'iPhone 15',
            1000000, '${TEAM_ID}', 'closed_success', '2026-06-25T03:00:00Z',
            'SUCCESS_FEE', 0, 10, 'debt_amount', false)
    RETURNING id
  `)
  caseId = seededCase[0]?.id ?? ''

  await setNumbering()
})

afterAll(async () => {
  await client?.$disconnect()
})

suite('Phase 4.3 — Sales Record sync จากรอบวางบิล (`31` §6.1)', () => {
  it('ส่งบิลจริง (ไฟล์ 19) ⇒ เกิดรายการขาย 1:1 พร้อมยอดจาก snapshot ของรายได้', async () => {
    const batch = await seedBilling()
    await revenue.sendBillingBatch(billingCtx, batch.id, { reason: billingCtx.reason })

    const rows = await db().salesRecord.findMany({ where: { billingBatchId: batch.id } })
    expect(rows).toHaveLength(1)
    expect(rows[0]?.totalBeforeVatSatang).toBe(1_200_000)
    expect(rows[0]?.vatSatang).toBe(84_000)
    expect(rows[0]?.totalSatang).toBe(1_284_000)

    // เรียกซ้ำ (เช่น job เก็บตก) ต้องไม่สร้างซ้ำ — unique `billing_batch_id`
    await sales.syncSalesRecordFromBilling(ctx, batch.id)
    expect(await db().salesRecord.count({ where: { billingBatchId: batch.id } })).toBe(1)
  })

  it('รอบที่ยัง draft ไม่ใช่ "ขาย" ⇒ ไม่สร้างรายการขาย', async () => {
    const batch = await seedBilling()
    expect(await sales.syncSalesRecordFromBilling(ctx, batch.id)).toBeNull()
    expect(await db().salesRecord.count({ where: { billingBatchId: batch.id } })).toBe(0)
  })
})

suite('Phase 4.3 — ออก/ยกเลิกใบกำกับภาษี (`31` §9.1 · §16)', () => {
  it('ออกใบแรกได้เลขที่ตามตัวเดินเลข + รายการขายชี้ไปที่ใบที่ active', async () => {
    await setNumbering({ seq: 0 })
    const batch = await seedBilling({ status: 'sent' })
    const record = await sales.syncSalesRecordFromBilling(ctx, batch.id)
    expect(record).not.toBeNull()

    const invoice = await sales.issueTaxInvoice(ctx, { salesRecordId: record?.id ?? '' })
    expect(sequenceOf(invoice.invoiceNumber)).toBe(1)
    expect(invoice.status).toBe('active')
    expect(invoice.totalSatang).toBe(1_284_000)

    const list = await sales.listSalesRecords(accountant, { periodId: record?.periodId })
    expect(list.items.find((item) => item.id === record?.id)?.activeTaxInvoice?.invoiceNumber).toBe(
      invoice.invoiceNumber,
    )

    // ออกซ้ำให้รายการขายเดิมไม่ได้ ต้องยกเลิกใบเดิมก่อน (`31` §10)
    await expectCode(
      () => sales.issueTaxInvoice(ctx, { salesRecordId: record?.id ?? '' }),
      'TAX_INVOICE_ALREADY_ISSUED',
    )
  })

  it('ผู้ซื้อไม่มีเลขประจำตัวผู้เสียภาษีที่ถูกต้อง ⇒ TAX_INVOICE_FIELD_MISSING (ไม่กินเลขที่)', async () => {
    await setNumbering({ seq: 20 })
    const broken = await db().$queryRawUnsafe<{ id: string }[]>(`
      INSERT INTO finance_companies (organization_id, name, short_name, tax_id, address, vat_mode,
                                     payment_due_days, created_by)
      VALUES ('${ORG_ID}', 'ไฟแนนซ์ไม่มีเลขภาษี (${RUN})', 'BAD', '${BAD_TAX_ID}', '9 ถนนสาทร', 'exclude_vat', 30,
              '${ACCOUNTING_ID}')
      RETURNING id
    `)
    const batch = await seedBilling({ status: 'sent', company: broken[0]?.id ?? '' })
    const record = await sales.syncSalesRecordFromBilling(ctx, batch.id)

    await expectCode(
      () => sales.issueTaxInvoice(ctx, { salesRecordId: record?.id ?? '' }),
      'TAX_INVOICE_FIELD_MISSING',
    )

    const org = await db().organization.findUniqueOrThrow({ where: { id: ORG_ID }, select: { taxInvoiceSeq: true } })
    expect(org.taxInvoiceSeq, 'ตรวจฟิลด์ก่อนเดินเลข ⇒ เลขที่ต้องไม่ขยับ').toBe(20)
  })

  it('DoD: ยกเลิกใบเลขที่ 005 แล้วออกใหม่ ⇒ ได้ 006 (เลขเดิมไม่ recycle)', async () => {
    await setNumbering({ seq: 4 })
    const batch = await seedBilling({ status: 'sent' })
    const record = await sales.syncSalesRecordFromBilling(ctx, batch.id)

    const fifth = await sales.issueTaxInvoice(ctx, { salesRecordId: record?.id ?? '' })
    expect(sequenceOf(fifth.invoiceNumber)).toBe(5)
    expect(fifth.invoiceNumber.endsWith('0005')).toBe(true)

    await expectCode(() => sales.cancelTaxInvoice(ctx, fifth.id, { reason: '   ' }), 'CANCEL_REQUIRES_REASON')

    const cancelled = await sales.cancelTaxInvoice(ctx, fifth.id, { reason: 'ออกผิดบริษัท' })
    expect(cancelled.status).toBe('cancelled')
    expect(cancelled.cancelReason).toBe('ออกผิดบริษัท')
    expect(cancelled.cancelledByName).toBe('บัญชี 4.3')

    // ยกเลิกซ้ำไม่ได้ (terminal)
    await expectCode(
      () => sales.cancelTaxInvoice(ctx, fifth.id, { reason: 'ยกเลิกซ้ำ' }),
      'TAX_INVOICE_INVALID_STATUS',
    )

    const sixth = await sales.issueTaxInvoice(ctx, { salesRecordId: record?.id ?? '' })
    expect(sequenceOf(sixth.invoiceNumber)).toBe(6)
    expect(sixth.invoiceNumber.endsWith('0006')).toBe(true)

    // ใบเดิมยังอยู่ครบพร้อมเลขที่เดิม — ยกเลิก ≠ ลบ (`02` §13)
    const history = await db().taxInvoice.findMany({
      where: { salesRecordId: record?.id ?? '' },
      select: { invoiceNumber: true, status: true },
      orderBy: { invoiceNumber: 'asc' },
    })
    expect(history.map((row) => row.status)).toEqual(['cancelled', 'active'])
  })

  it('DoD: ออกพร้อมกัน 4 คำขอ ⇒ เลขไม่ซ้ำและไม่ขาดช่วง', async () => {
    await setNumbering({ seq: 100 })
    const records = await Promise.all(
      [0, 1, 2, 3].map(async () => {
        const batch = await seedBilling({ status: 'sent' })
        return sales.syncSalesRecordFromBilling(ctx, batch.id)
      }),
    )

    const issued = await Promise.all(
      records.map((record) => sales.issueTaxInvoice(ctx, { salesRecordId: record?.id ?? '' })),
    )
    const sequences = issued.map((invoice) => sequenceOf(invoice.invoiceNumber)).sort((a, b) => a - b)
    expect(sequences).toEqual([101, 102, 103, 104])
    expect(new Set(issued.map((invoice) => invoice.invoiceNumber)).size).toBe(4)
  })

  it('Final Test ด่าน 2 — ออกใบของ**รายการขายเดียวกัน**พร้อมกัน ⇒ ได้ใบเดียว อีกคน `TAX_INVOICE_ALREADY_ISSUED`', async () => {
    await setNumbering({ seq: 200 })
    const batch = await seedBilling({ status: 'sent' })
    const record = await sales.syncSalesRecordFromBilling(ctx, batch.id)
    const salesRecordId = record?.id ?? ''

    // ดับเบิลคลิก / retry / เปิดสองแท็บ — `assertIssuable()` อ่านสถานะนอก transaction จึงผ่านทั้งคู่
    // ถ้าไม่มี unique ระดับ DB จะได้ใบ active 2 ใบ 2 เลขที่ ⇒ ทะเบียนภาษีขายนับซ้ำ ยื่น ภ.พ.30 เกิน
    const results = await Promise.allSettled([
      sales.issueTaxInvoice(ctx, { salesRecordId }),
      sales.issueTaxInvoice(ctx, { salesRecordId }),
    ])

    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1)
    const loser = results.find((result) => result.status === 'rejected')
    expect(codeOf((loser as PromiseRejectedResult).reason)).toBe('TAX_INVOICE_ALREADY_ISSUED')

    const invoices = await db().taxInvoice.findMany({
      where: { salesRecordId },
      select: { status: true, invoiceNumber: true },
    })
    expect(invoices).toHaveLength(1)
    expect(invoices[0]?.status).toBe('active')
    // เลขของคนที่แพ้ต้อง rollback ไปด้วย ⇒ ใบถัดไปได้เลขต่อเนื่อง ไม่ขาดช่วง (`31` §16)
    const next = await sales.syncSalesRecordFromBilling(ctx, (await seedBilling({ status: 'sent' })).id)
    const following = await sales.issueTaxInvoice(ctx, { salesRecordId: next?.id ?? '' })
    expect(sequenceOf(following.invoiceNumber)).toBe(sequenceOf(invoices[0]?.invoiceNumber ?? '') + 1)
  })

  it('โหมด yearly_reset ข้ามปี ⇒ กลับไปเริ่ม 0001 พร้อม prefix ปี พ.ศ. ใหม่ (`31` §16)', async () => {
    await setNumbering({ seq: 37, mode: 'yearly_reset', lastResetYear: 2569 })
    const batch = await seedBilling({ status: 'sent' })
    const record = await sales.syncSalesRecordFromBilling(ctx, batch.id)

    const invoice = await sales.issueTaxInvoice(ctx, {
      salesRecordId: record?.id ?? '',
      // 01/01/2027 ค.ศ. = 2570 พ.ศ.
      invoiceDate: new Date(Date.UTC(2027, 0, 1)),
    })
    expect(invoice.invoiceNumber).toBe(`${PREFIX}-2570-0001`)
    await setNumbering({ seq: 0 })
  })
})

suite('Phase 4.3 — ยาม immutable + period lock', () => {
  it('งวดที่ locked ⇒ ออกใบกำกับภาษีไม่ได้ (`PERIOD_LOCKED_DIRECT_EDIT`)', async () => {
    await setNumbering({ seq: 200 })
    const batch = await seedBilling({ status: 'sent' })
    const record = await sales.syncSalesRecordFromBilling(ctx, batch.id)
    await lockPeriodOf(batch.period)

    // วันที่ออกเอกสารอยู่ในงวดที่ล็อก ⇒ โดนยามของ `13` §6.11
    const [month = '', yearText = ''] = batch.period.split(' ')
    const monthIndex = MONTHS.indexOf(month as (typeof MONTHS)[number])
    const insidePeriod = new Date(Date.UTC(Number.parseInt(yearText, 10) - 543, monthIndex, 15))

    await expectCode(
      () => sales.issueTaxInvoice(ctx, { salesRecordId: record?.id ?? '', invoiceDate: insidePeriod }),
      'PERIOD_LOCKED_DIRECT_EDIT',
    )
  })

  it('ใบกำกับภาษีลบไม่ได้ทุกกรณี และใบที่ยกเลิกแล้วห้าม reverse (trigger ระดับ DB · `02` §13)', async () => {
    await setNumbering({ seq: 300 })
    const batch = await seedBilling({ status: 'sent' })
    const record = await sales.syncSalesRecordFromBilling(ctx, batch.id)
    const invoice = await sales.issueTaxInvoice(ctx, { salesRecordId: record?.id ?? '' })

    await expect(
      db().$executeRawUnsafe(`DELETE FROM tax_invoices WHERE id = '${invoice.id}'`),
      'ใบที่ active ก็ลบไม่ได้ — ลบ = เลขที่ขาดช่วง',
    ).rejects.toThrow(/TAX_INVOICE_IMMUTABLE/)

    await expect(
      db().$executeRawUnsafe(`UPDATE tax_invoices SET invoice_number = 'HACKED' WHERE id = '${invoice.id}'`),
    ).rejects.toThrow(/TAX_INVOICE_IMMUTABLE/)

    await sales.cancelTaxInvoice(ctx, invoice.id, { reason: 'ทดสอบยาม immutable' })

    await expect(
      db().$executeRawUnsafe(`UPDATE tax_invoices SET status = 'active' WHERE id = '${invoice.id}'`),
      'reverse cancel ต้องถูกปฏิเสธที่ระดับ DB',
    ).rejects.toThrow(/TAX_INVOICE_IMMUTABLE/)
  })
})

suite('Phase 4.3 — เงินรับอ่านอย่างเดียว (`31` §6.3)', () => {
  it('รายการที่ไฟล์ 35 สร้างไว้ ⇒ แสดงผู้จ่าย/ยอด/Bank Ref/สถานะจับคู่ครบ', async () => {
    const batch = await seedBilling({ status: 'sent' })
    const record = await sales.syncSalesRecordFromBilling(ctx, batch.id)
    const periodId = record?.periodId ?? ''

    const bankTx = await db().$queryRawUnsafe<{ id: string }[]>(`
      INSERT INTO bank_transactions (organization_id, period_id, bank_account_id, transaction_date, description,
                                     amount_satang, match_status, matched_billing_id, created_by)
      VALUES ('${ORG_ID}', '${periodId}', '${BANK_ACCOUNT_ID}', '2026-06-28', 'โอนเข้า · อ้างอิง BTR-43-${RUN}',
              1284000, 'auto_matched', '${batch.id}', '${ACCOUNTING_ID}')
      RETURNING id
    `)
    await db().$executeRawUnsafe(`
      INSERT INTO cash_receipts (organization_id, period_id, billing_batch_id, bank_transaction_id, amount_satang,
                                 wht_withheld_by_customer_satang, received_date, created_by)
      VALUES ('${ORG_ID}', '${periodId}', '${batch.id}', '${bankTx[0]?.id ?? ''}', 1284000, 36000, '2026-06-28',
              '${ACCOUNTING_ID}')
    `)

    const receipts = await sales.listCashReceipts(accountant, { periodId })
    const row = receipts.items.find((item) => item.billingBatchId === batch.id)
    expect(row?.payerName).toBe(`ไฟแนนซ์ 4.3 (${RUN})`)
    expect(row?.amountSatang).toBe(1_284_000)
    expect(row?.whtWithheldByCustomerSatang).toBe(36_000)
    expect(row?.bankRef).toBe(`โอนเข้า · อ้างอิง BTR-43-${RUN}`)
    expect(row?.bankMatchStatus).toBe('auto_matched')
    expect(receipts.totalSatang).toBeGreaterThanOrEqual(1_284_000)
  })
})
