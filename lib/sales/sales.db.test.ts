import { PrismaPg } from '@prisma/adapter-pg'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { SessionUser } from '@/lib/auth/types'
import { PrismaClient } from '@/lib/generated/prisma/client'
import { toBangkokDateOnly } from '@/lib/revenue/revenue'
import { buildTaxInvoiceDoc } from '@/lib/sales/sales'

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

/**
 * รอบวางบิลใหม่ 1 รอบ (เดือนไม่ซ้ำกันในไฟล์เทสต์) + รายได้ 1 ใบ — คืน id ของรอบและป้ายงวด
 * รายได้ทุกใบผูกเคสเดียวกัน ⇒ ใช้ `tracking_round` ไม่ซ้ำกัน (partial unique `uniq_revenues_active_case_round` — UAT R6-E)
 */
async function seedBilling(
  options: { status?: string; grossSatang?: number; vatSatang?: number; company?: string } = {},
): Promise<{ id: string; period: string }> {
  const month = MONTHS[monthCursor % 12] ?? 'มกราคม'
  const yearBe = 2569 + Math.floor(monthCursor / 12)
  monthCursor += 1
  // จับค่าไว้ก่อน await — seedBilling ถูกเรียกพร้อมกันได้ (เทสต์ออกเลขพร้อมกัน)
  const trackingRound = monthCursor
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
    INSERT INTO revenues (organization_id, case_id, company_id, billing_batch_id, tracking_round, gross_satang, vat_satang,
                          vat_rate_pct_used, total_satang, fee_model_snapshot, vat_mode_snapshot, status, revenue_date, created_by)
    VALUES ('${ORG_ID}', '${caseId}', '${company}', '${id}', ${trackingRound}, ${gross}, ${vat}, 7.00, ${gross + vat},
            'SUCCESS_FEE', 'exclude_vat', 'billed', '2026-06-25', '${ACCOUNTING_ID}')
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

async function setPeriodStatusOf(period: string, status: 'locked' | 'collecting'): Promise<void> {
  const [month = '', yearText = ''] = period.split(' ')
  const monthIndex = MONTHS.indexOf(month as (typeof MONTHS)[number]) + 1
  const tx = db()
  // งวดที่ `locked` อยู่แล้ว (ของค้างจากรอบรันก่อน) ถูก trigger แช่แข็ง (`02` §13)
  // — fixture ต้องล็อก/ปลดซ้ำได้ ⇒ ปิดยามเฉพาะตอนตั้งค่าเทสต์
  await tx.$executeRawUnsafe(`ALTER TABLE accounting_periods DISABLE TRIGGER trg_accounting_periods_locked`)
  try {
    await tx.$executeRawUnsafe(`
      UPDATE accounting_periods SET status = '${status}'
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


// ── เงินรับ (ไฟล์ 35 เป็นผู้สร้างจริง — เทสต์ insert ตรงเพื่อแยกขอบเขต) ─────────

/** วันนี้ตามปฏิทินไทย (เที่ยงคืน UTC แบบคอลัมน์ DATE) — ตัวเดียวกับที่ service ใช้ตัดสินวันที่ล่วงหน้า */
const TODAY = toBangkokDateOnly(new Date())

/** เงินรับ 1 รายการของรอบ (default = รับเต็มยอดวันนี้) — คืน id */
async function seedReceipt(
  batchId: string,
  options: { amountSatang?: number; whtSatang?: number; receivedDate?: Date } = {},
): Promise<string> {
  const record = await sales.syncSalesRecordFromBilling(ctx, batchId)
  const received = (options.receivedDate ?? TODAY).toISOString().slice(0, 10)
  const rows = await db().$queryRawUnsafe<{ id: string }[]>(`
    INSERT INTO cash_receipts (organization_id, period_id, billing_batch_id, amount_satang,
                               wht_withheld_by_customer_satang, received_date, created_by)
    VALUES ('${ORG_ID}', '${record?.periodId ?? ''}', '${batchId}', ${options.amountSatang ?? 1_284_000},
            ${options.whtSatang ?? 0}, '${received}', '${ACCOUNTING_ID}')
    RETURNING id
  `)
  return rows[0]?.id ?? ''
}

/** ส่งบิลแล้ว + เงินรับเต็มยอด — ทางลัดของเทสต์ที่สนใจแค่เลขที่/ยาม */
async function seedReceivedBilling(options: { company?: string; receivedDate?: Date } = {}): Promise<{
  batch: { id: string; period: string }
  receiptId: string
}> {
  const batch = await seedBilling({ status: 'sent', ...(options.company === undefined ? {} : { company: options.company }) })
  const receiptId = await seedReceipt(batch.id, options.receivedDate === undefined ? {} : { receivedDate: options.receivedDate })
  return { batch, receiptId }
}

beforeAll(async () => {
  if (!url) return
  // อัตรา VAT ของ org ทดสอบ: 7% ถึง 30/06/2027 · 10% ตั้งแต่ 01/07/2027 (กรณีอัตราเปลี่ยน — U96 #9) · idempotent ข้ามรัน
  await db().$executeRawUnsafe(`
    INSERT INTO vat_rate_history (organization_id, rate_pct, effective_from, effective_to, created_by)
    SELECT '${ORG_ID}', 7.00, '2020-01-01', '2027-06-30', '${ACCOUNTING_ID}'
     WHERE NOT EXISTS (SELECT 1 FROM vat_rate_history WHERE organization_id = '${ORG_ID}' AND effective_from = '2020-01-01')
  `)
  await db().$executeRawUnsafe(`
    INSERT INTO vat_rate_history (organization_id, rate_pct, effective_from, effective_to, created_by)
    SELECT '${ORG_ID}', 10.00, '2027-07-01', NULL, '${ACCOUNTING_ID}'
     WHERE NOT EXISTS (SELECT 1 FROM vat_rate_history WHERE organization_id = '${ORG_ID}' AND effective_from = '2027-07-01')
  `)
  // งวดของวันนี้ต้องเปิด (รันก่อน ๆ อาจล็อกค้าง)
  const todayPeriod = `${MONTHS[TODAY.getUTCMonth()] ?? ''} ${TODAY.getUTCFullYear() + 543}`
  await setPeriodStatusOf(todayPeriod, 'collecting')
})

suite('มติ PO U95 — วางบิล ⇒ ใบแจ้งหนี้ (ไม่ใช่เอกสารภาษี)', () => {
  it('ส่งบิลแล้วไม่มีใบกำกับภาษีเกิด · ใบแจ้งหนี้ PDF อ่านยอดจากรายได้ + ข้อความไม่ใช่ใบกำกับ · draft ออกไม่ได้', async () => {
    const { getBillingInvoiceSource } = await import('@/lib/revenue/billing-invoice-queries')
    const { buildBillingInvoiceDoc } = await import('@/lib/revenue/billing-invoice')
    const before = await db().organization.findUniqueOrThrow({ where: { id: ORG_ID }, select: { taxInvoiceSeq: true } })
    const batch = await seedBilling()
    await revenue.sendBillingBatch(billingCtx, batch.id, { reason: billingCtx.reason })

    expect(await db().taxInvoice.count({ where: { salesRecord: { billingBatchId: batch.id } } })).toBe(0)
    const after = await db().organization.findUniqueOrThrow({ where: { id: ORG_ID }, select: { taxInvoiceSeq: true } })
    expect(after.taxInvoiceSeq, 'ใบแจ้งหนี้ไม่เดินเลขใบกำกับภาษี').toBe(before.taxInvoiceSeq)

    const doc = buildBillingInvoiceDoc(await getBillingInvoiceSource(accountant, batch.id))
    expect(doc.amounts).toEqual({ totalBeforeVatSatang: 1_200_000, vatSatang: 84_000, totalSatang: 1_284_000 })
    expect(doc.notTaxInvoiceNote).toContain('เอกสารนี้ไม่ใช่ใบกำกับภาษี')
    expect(doc.lines).toHaveLength(1)

    const draft = await seedBilling()
    await expectCode(() => getBillingInvoiceSource(accountant, draft.id), 'BILLING_BATCH_INVALID_STATUS')
  })

  it('BUG-164 — ผู้ขาย/ผู้ซื้อบนใบแจ้งหนี้ = snapshot ตอนส่งรอบ · แก้ชื่อ/ที่อยู่ภายหลังใบเดิมไม่เปลี่ยน · snapshot แก้ไม่ได้', async () => {
    const { getBillingInvoiceSource } = await import('@/lib/revenue/billing-invoice-queries')
    const company = await db().financeCompany.findUniqueOrThrow({
      where: { id: companyId },
      select: { name: true, address: true, taxId: true },
    })
    const org = await db().organization.findUniqueOrThrow({ where: { id: ORG_ID }, select: { name: true } })
    const batch = await seedBilling()
    const draftRow = await db().billingBatch.findUniqueOrThrow({ where: { id: batch.id }, select: { buyerName: true } })
    expect(draftRow.buyerName, 'รอบร่างยังไม่มี snapshot').toBeNull()
    await revenue.sendBillingBatch(billingCtx, batch.id, { reason: billingCtx.reason })

    const sentRow = await db().billingBatch.findUniqueOrThrow({
      where: { id: batch.id },
      select: { buyerName: true, buyerTaxId: true, sellerName: true },
    })
    expect(sentRow).toEqual({ buyerName: company.name, buyerTaxId: company.taxId, sellerName: org.name })

    try {
      await db().financeCompany.update({
        where: { id: companyId },
        data: { name: `${company.name} (เปลี่ยนชื่อ)`, address: 'ที่อยู่ใหม่หลังส่งบิล' },
      })
      await db().organization.update({ where: { id: ORG_ID }, data: { name: `${org.name} (ใหม่)` } })

      const source = await getBillingInvoiceSource(accountant, batch.id)
      expect(source.buyer.name).toBe(company.name)
      expect(source.buyer.address).toBe(company.address ?? '')
      expect(source.seller.name).toBe(org.name)

      // ยาม DB — snapshot ของรอบที่ส่งแล้วแก้ไม่ได้
      await expect(
        db().billingBatch.update({ where: { id: batch.id }, data: { buyerName: 'แก้ทับ' } }),
      ).rejects.toThrow(/BILLING_PARTY_SNAPSHOT_IMMUTABLE/)
    } finally {
      await db().financeCompany.update({ where: { id: companyId }, data: { name: company.name, address: company.address } })
      await db().organization.update({ where: { id: ORG_ID }, data: { name: org.name } })
    }
  })
})

suite('มติ PO U95 — รับเงิน ⇒ ใบเสร็จรับเงิน/ใบกำกับภาษี', () => {
  it('ออกจากเงินรับ: เลขชุดเดิม · วันที่ = วันรับเงิน · ยอดตามที่รับ (รวมภาษีที่ลูกค้าหัก) · ออกซ้ำไม่ได้', async () => {
    await setNumbering({ seq: 0 })
    const batch = await seedBilling({ status: 'sent' })
    const receiptId = await seedReceipt(batch.id, { amountSatang: 1_248_000, whtSatang: 36_000 })

    const invoice = await sales.issueTaxInvoice(ctx, { cashReceiptId: receiptId })
    expect(sequenceOf(invoice.invoiceNumber)).toBe(1)
    expect(invoice.invoiceNumber.startsWith(PREFIX)).toBe(true)
    expect(invoice.docKind).toBe('receipt_tax_invoice')
    expect(invoice.docTitle).toBe('ใบเสร็จรับเงิน/ใบกำกับภาษี')
    expect(invoice.invoiceDate).toBe(TODAY.toISOString())
    expect(invoice).toMatchObject({ totalBeforeVatSatang: 1_200_000, vatSatang: 84_000, totalSatang: 1_284_000 })
    expect(invoice.vatRatePctUsed).toBe('7')

    const receipts = await sales.listCashReceipts(accountant, {})
    expect(receipts.items.find((item) => item.id === receiptId)?.taxInvoice?.invoiceNumber).toBe(invoice.invoiceNumber)

    await expectCode(() => sales.issueTaxInvoice(ctx, { cashReceiptId: receiptId }), 'TAX_INVOICE_ALREADY_ISSUED')

    const audit = await db().auditLog.findFirst({ where: { targetType: 'tax_invoices', targetId: invoice.id } })
    expect(audit?.reason).toContain('ใบเสร็จรับเงิน/ใบกำกับภาษี')
  })

  it('รับเงินบางส่วน 2 ครั้ง ⇒ 2 ใบตามยอดที่รับ ผลรวมเท่าใบแจ้งหนี้ · ใบที่สามไม่มียอดให้ออก', async () => {
    await setNumbering({ seq: 40 })
    const batch = await seedBilling({ status: 'sent' })
    const first = await sales.issueTaxInvoice(ctx, { cashReceiptId: await seedReceipt(batch.id, { amountSatang: 500_000 }) })
    expect(first).toMatchObject({ totalBeforeVatSatang: 467_290, vatSatang: 32_710, totalSatang: 500_000 })

    const second = await sales.issueTaxInvoice(ctx, { cashReceiptId: await seedReceipt(batch.id, { amountSatang: 784_000 }) })
    expect(first.totalBeforeVatSatang + second.totalBeforeVatSatang).toBe(1_200_000)
    expect(first.vatSatang + second.vatSatang).toBe(84_000)

    await expectCode(
      async () => sales.issueTaxInvoice(ctx, { cashReceiptId: await seedReceipt(batch.id, { amountSatang: 100 }) }),
      'TAX_INVOICE_NOTHING_TO_INVOICE',
    )
  })

  it('U96 #9 — อัตรา VAT เปลี่ยนระหว่างวางบิล (7%) กับรับเงิน (10%) ⇒ ใบใช้อัตรา ณ วันรับเงิน + snapshot อัตราใหม่', async () => {
    await setNumbering({ seq: 900 })
    const batch = await seedBilling({ status: 'sent' })
    const received = new Date(Date.UTC(2027, 6, 5))
    const receiptId = await seedReceipt(batch.id, { amountSatang: 1_320_000, receivedDate: received })

    const invoice = await sales.issueTaxInvoice(ctx, { cashReceiptId: receiptId }, new Date(Date.UTC(2027, 6, 6, 3)))
    expect(invoice).toMatchObject({ totalBeforeVatSatang: 1_200_000, vatSatang: 120_000, totalSatang: 1_320_000 })
    expect(invoice.vatRatePctUsed).toBe('10')
    expect(invoice.invoiceDate).toBe(received.toISOString())
    const revenueRate = await db().revenue.findFirst({ where: { billingBatchId: batch.id }, select: { vatRatePctUsed: true } })
    expect(revenueRate?.vatRatePctUsed.toString(), 'snapshot รายได้ตอนวางบิลไม่ถูกแก้').toBe('7')
    await setNumbering({ seq: 0 })
  })

  it('U96 #3 — บริษัทโหมด no_vat ⇒ ออกไม่ได้ TAX_INVOICE_NO_VAT_COMPANY (ไม่กินเลขที่)', async () => {
    await setNumbering({ seq: 60 })
    const batch = await seedBilling({ status: 'sent' })
    await db().$executeRawUnsafe(`UPDATE revenues SET vat_mode_snapshot = 'no_vat' WHERE billing_batch_id = '${batch.id}'`)
    const receiptId = await seedReceipt(batch.id)
    await expectCode(() => sales.issueTaxInvoice(ctx, { cashReceiptId: receiptId }), 'TAX_INVOICE_NO_VAT_COMPANY')
    const org = await db().organization.findUniqueOrThrow({ where: { id: ORG_ID }, select: { taxInvoiceSeq: true } })
    expect(org.taxInvoiceSeq).toBe(60)
  })

  it('U96 #7 — วันที่ล่วงหน้า / ก่อนวันที่ของเลขก่อนหน้า ⇒ ปฏิเสธพร้อมข้อความชัดเจน', async () => {
    await setNumbering({ seq: 80 })
    const { receiptId } = await seedReceivedBilling()
    const tomorrow = new Date(TODAY.getTime() + 86_400_000)
    await expectCode(
      () => sales.issueTaxInvoice(ctx, { cashReceiptId: receiptId, invoiceDate: tomorrow }),
      'TAX_INVOICE_DATE_IN_FUTURE',
    )
    const today = await sales.issueTaxInvoice(ctx, { cashReceiptId: receiptId })
    expect(sequenceOf(today.invoiceNumber)).toBe(81)

    // เงินรับย้อนหลัง 3 วัน (รับก่อนแต่จับคู่ทีหลัง) ⇒ ลงวันที่ก่อนเลข 081 ไม่ได้
    const older = await seedReceivedBilling({ receivedDate: new Date(TODAY.getTime() - 3 * 86_400_000) })
    let message = ''
    try {
      await sales.issueTaxInvoice(ctx, { cashReceiptId: older.receiptId })
    } catch (error) {
      expect(codeOf(error)).toBe('TAX_INVOICE_DATE_OUT_OF_SEQUENCE')
      message = (error as { userMessage: string }).userMessage
    }
    expect(message).toContain(today.invoiceNumber)
    // เลือกวันที่เอกสาร = วันนี้ (ไม่ก่อนใบล่าสุด · ไม่ก่อนวันรับเงิน) ⇒ ออกได้
    const fixed = await sales.issueTaxInvoice(ctx, { cashReceiptId: older.receiptId, invoiceDate: TODAY })
    expect(sequenceOf(fixed.invoiceNumber)).toBe(82)
  })

  it('U96 #4 — snapshot ผู้ซื้อ/ผู้ขายบนใบ: แก้บริษัท/องค์กรภายหลัง PDF ใบเดิมไม่เปลี่ยน · แก้ snapshot ที่ DB ไม่ได้', async () => {
    await setNumbering({ seq: 120 })
    const company = await db().$queryRawUnsafe<{ id: string }[]>(`
      INSERT INTO finance_companies (organization_id, name, short_name, tax_id, address, vat_mode, payment_due_days, created_by)
      VALUES ('${ORG_ID}', 'ไฟแนนซ์ snapshot (${RUN})', 'SNP', '${RUN_TAX_ID.slice(0, 12)}${RUN_TAX_ID.endsWith('5') ? '6' : '5'}',
              '5 ถนนเดิม', 'exclude_vat', 30, '${ACCOUNTING_ID}')
      RETURNING id
    `)
    const companyRef = company[0]?.id ?? ''
    const { receiptId } = await seedReceivedBilling({ company: companyRef })
    const invoice = await sales.issueTaxInvoice(ctx, { cashReceiptId: receiptId })

    await db().$executeRawUnsafe(`UPDATE finance_companies SET name = 'ชื่อใหม่', address = '9 ถนนใหม่' WHERE id = '${companyRef}'`)
    await db().$executeRawUnsafe(`UPDATE organizations SET address = 'ที่อยู่องค์กรใหม่' WHERE id = '${ORG_ID}'`)
    try {
      const source = await sales.getTaxInvoiceDocSource(accountant, invoice.id)
      expect(source.buyer.name).toBe(`ไฟแนนซ์ snapshot (${RUN})`)
      expect(source.buyer.address).toBe('5 ถนนเดิม')
      expect(source.seller.address).toBe('ที่อยู่ทดสอบ 4.3 กรุงเทพฯ')
      expect((await sales.listTaxInvoices(accountant, { companyId: companyRef })).items[0]?.companyName).toBe(
        `ไฟแนนซ์ snapshot (${RUN})`,
      )
    } finally {
      await db().$executeRawUnsafe(`UPDATE organizations SET address = 'ที่อยู่ทดสอบ 4.3 กรุงเทพฯ' WHERE id = '${ORG_ID}'`)
    }
    await expect(
      db().$executeRawUnsafe(`UPDATE tax_invoices SET buyer_name = 'แก้' WHERE id = '${invoice.id}'`),
    ).rejects.toThrow(/TAX_INVOICE_IMMUTABLE/)
  })

  it('U96 #8 — ยกเลิกแล้วออกใหม่จากเงินรับเดิม ⇒ ใบแทนพิมพ์ "ออกแทนฉบับเลขที่ … ลงวันที่ … เนื่องจาก …" · เลขไม่ recycle', async () => {
    await setNumbering({ seq: 4 })
    const { receiptId } = await seedReceivedBilling()
    const fifth = await sales.issueTaxInvoice(ctx, { cashReceiptId: receiptId })
    expect(fifth.invoiceNumber.endsWith('0005')).toBe(true)

    await expectCode(() => sales.cancelTaxInvoice(ctx, fifth.id, { reason: '   ' }), 'CANCEL_REQUIRES_REASON')
    const cancelled = await sales.cancelTaxInvoice(ctx, fifth.id, { reason: 'ที่อยู่ผู้ซื้อผิด' })
    expect(cancelled.status).toBe('cancelled')
    await expectCode(() => sales.cancelTaxInvoice(ctx, fifth.id, { reason: 'ซ้ำ' }), 'TAX_INVOICE_INVALID_STATUS')

    const sixth = await sales.issueTaxInvoice(ctx, { cashReceiptId: receiptId })
    expect(sixth.invoiceNumber.endsWith('0006')).toBe(true)
    expect(sixth.replacesInvoiceNumber).toBe(fifth.invoiceNumber)
    const doc = buildTaxInvoiceDoc(await sales.getTaxInvoiceDocSource(accountant, sixth.id))
    expect(doc.replacementNote).toMatch(new RegExp(`^ออกแทนฉบับเลขที่ ${fifth.invoiceNumber} ลงวันที่ \\d{2}/\\d{2}/25\\d{2} เนื่องจาก ที่อยู่ผู้ซื้อผิด$`))

    // ใบเดิมยังอยู่ครบ — ยกเลิก ≠ ลบ (`02` §13)
    const history = await db().taxInvoice.findMany({ where: { cashReceiptId: receiptId }, orderBy: { invoiceNumber: 'asc' } })
    expect(history.map((row) => row.status)).toEqual(['cancelled', 'active'])
  })

  it('U95 — เปลี่ยนการจับคู่เงินรับที่ออกใบแล้วไม่ได้ · ใบที่ยกเลิกแล้วคงอยู่เมื่อเงินรับถูกถอน (ลิงก์เป็น NULL)', async () => {
    await setNumbering({ seq: 140 })
    const { receiptId } = await seedReceivedBilling()
    const invoice = await sales.issueTaxInvoice(ctx, { cashReceiptId: receiptId })
    await expect(db().$executeRawUnsafe(`DELETE FROM cash_receipts WHERE id = '${receiptId}'`)).rejects.toThrow(
      /TAX_INVOICE_IMMUTABLE/,
    )
    await sales.cancelTaxInvoice(ctx, invoice.id, { reason: 'จับคู่เงินรับผิดรอบ' })
    await db().$executeRawUnsafe(`DELETE FROM cash_receipts WHERE id = '${receiptId}'`)
    const after = await db().taxInvoice.findUniqueOrThrow({ where: { id: invoice.id } })
    expect(after).toMatchObject({ status: 'cancelled', cashReceiptId: null, invoiceNumber: invoice.invoiceNumber })
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
    const { receiptId } = await seedReceivedBilling({ company: broken[0]?.id ?? '' })
    await expectCode(() => sales.issueTaxInvoice(ctx, { cashReceiptId: receiptId }), 'TAX_INVOICE_FIELD_MISSING')
    const org = await db().organization.findUniqueOrThrow({ where: { id: ORG_ID }, select: { taxInvoiceSeq: true } })
    expect(org.taxInvoiceSeq, 'ตรวจฟิลด์ก่อนเดินเลข ⇒ เลขที่ต้องไม่ขยับ').toBe(20)
  })

  it('DoD: ออกพร้อมกัน 4 คำขอ (คนละเงินรับ) ⇒ เลขไม่ซ้ำและไม่ขาดช่วง', async () => {
    await setNumbering({ seq: 100 })
    const receipts = await Promise.all([0, 1, 2, 3].map(async () => (await seedReceivedBilling()).receiptId))
    const issued = await Promise.all(receipts.map((cashReceiptId) => sales.issueTaxInvoice(ctx, { cashReceiptId })))
    const sequences = issued.map((invoice) => sequenceOf(invoice.invoiceNumber)).sort((a, b) => a - b)
    expect(sequences).toEqual([101, 102, 103, 104])
  })

  it('ออกใบของ**เงินรับเดียวกัน**พร้อมกัน ⇒ ได้ใบเดียว อีกคน TAX_INVOICE_ALREADY_ISSUED · เลขของคนแพ้ rollback', async () => {
    await setNumbering({ seq: 200 })
    const { receiptId } = await seedReceivedBilling()
    const results = await Promise.allSettled([
      sales.issueTaxInvoice(ctx, { cashReceiptId: receiptId }),
      sales.issueTaxInvoice(ctx, { cashReceiptId: receiptId }),
    ])
    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1)
    const loser = results.find((result) => result.status === 'rejected')
    expect(codeOf((loser as PromiseRejectedResult).reason)).toBe('TAX_INVOICE_ALREADY_ISSUED')

    const invoices = await db().taxInvoice.findMany({ where: { cashReceiptId: receiptId }, select: { invoiceNumber: true } })
    expect(invoices).toHaveLength(1)
    const following = await sales.issueTaxInvoice(ctx, { cashReceiptId: (await seedReceivedBilling()).receiptId })
    expect(sequenceOf(following.invoiceNumber)).toBe(sequenceOf(invoices[0]?.invoiceNumber ?? '') + 1)
  })

  it('รับเงินบางส่วนของรอบเดียวกันพร้อมกัน 2 คำขอ ⇒ ยอดไม่ซ้อน (ต่อคิวที่ตัวเดินเลข) ผลรวมไม่เกินใบแจ้งหนี้', async () => {
    await setNumbering({ seq: 220 })
    const batch = await seedBilling({ status: 'sent' })
    const [a, b] = await Promise.all([
      seedReceipt(batch.id, { amountSatang: 800_000 }),
      seedReceipt(batch.id, { amountSatang: 800_000 }),
    ])
    const issued = await Promise.all([a, b].map((cashReceiptId) => sales.issueTaxInvoice(ctx, { cashReceiptId })))
    expect(issued.reduce((sum, invoice) => sum + invoice.totalSatang, 0)).toBe(1_284_000)
    expect(issued.reduce((sum, invoice) => sum + invoice.vatSatang, 0)).toBe(84_000)
  })

  it('โหมด yearly_reset ข้ามปี ⇒ กลับไปเริ่ม 0001 พร้อม prefix ปี พ.ศ. ใหม่ (`31` §16)', async () => {
    await setPeriodStatusOf('มกราคม 2570', 'collecting')
    await setNumbering({ seq: 37, mode: 'yearly_reset', lastResetYear: 2569 })
    const { receiptId } = await seedReceivedBilling({ receivedDate: new Date(Date.UTC(2027, 0, 1)) })
    const invoice = await sales.issueTaxInvoice(ctx, { cashReceiptId: receiptId }, new Date(Date.UTC(2027, 0, 2, 3)))
    expect(invoice.invoiceNumber).toBe(`${PREFIX}-2570-0001`)
    await setNumbering({ seq: 0 })
  })

  it('ใบกำกับแบบเดิม (ก่อน U95) ที่ยกเลิกแล้ว ⇒ ออกแทนด้วยยอด/อัตราเดิม + ข้อความใบแทน · เงินรับของรอบนั้นไม่ต้องออกซ้ำ', async () => {
    await setNumbering({ seq: 300 })
    const batch = await seedBilling({ status: 'sent' })
    const record = await sales.syncSalesRecordFromBilling(ctx, batch.id)
    // จำลองใบเดิมก่อน U95 (ออกตอนวางบิล)
    const legacy = await db().$queryRawUnsafe<{ id: string }[]>(`
      INSERT INTO tax_invoices (organization_id, sales_record_id, doc_kind, invoice_number, invoice_date, buyer_branch_code,
        seller_branch_code, amount_before_vat_satang, vat_satang, total_satang, vat_rate_pct_used, seller_name, seller_tax_id,
        seller_address, buyer_name, buyer_tax_id, buyer_address, delivery_format, description, created_by)
      VALUES ('${ORG_ID}', '${record?.id ?? ''}', 'tax_invoice', '${PREFIX}-LEGACY-${RUN}', '${TODAY.toISOString().slice(0, 10)}',
        '00000', '00000', 1200000, 84000, 1284000, 7.00, 'Phase43Test', '9999999994300', 'ที่อยู่ทดสอบ 4.3 กรุงเทพฯ',
        'ไฟแนนซ์เดิม', '${RUN_TAX_ID}', '1 ถนนสีลม', 'paper_pdf', 'ค่าบริการติดตามทรัพย์ รอบเดือน ${batch.period}', '${ACCOUNTING_ID}')
      RETURNING id
    `)
    const legacyId = legacy[0]?.id ?? ''
    const receiptId = await seedReceipt(batch.id)
    await expectCode(() => sales.issueTaxInvoice(ctx, { cashReceiptId: receiptId }), 'TAX_INVOICE_NOTHING_TO_INVOICE')
    expect((await sales.listCashReceipts(accountant, {})).items.find((item) => item.id === receiptId)?.coveredByLegacyInvoice).toBe(true)

    await expectCode(() => sales.issueTaxInvoice(ctx, { replacesInvoiceId: legacyId }), 'TAX_INVOICE_INVALID_STATUS')
    await sales.cancelTaxInvoice(ctx, legacyId, { reason: 'เลขผู้เสียภาษีผิด' })
    const replacement = await sales.issueTaxInvoice(ctx, { replacesInvoiceId: legacyId })
    expect(replacement).toMatchObject({ docKind: 'tax_invoice', totalSatang: 1_284_000, replacesInvoiceNumber: `${PREFIX}-LEGACY-${RUN}` })
    await expectCode(() => sales.issueTaxInvoice(ctx, { replacesInvoiceId: legacyId }), 'TAX_INVOICE_ALREADY_ISSUED')
  })
})

suite('มติ PO U77/U82 (ม.86/4) — สาขาผู้ซื้อ/ผู้ขาย snapshot ตอนออกใบ', () => {
  it('ใบพิมพ์สาขาตอนออก · บริษัทเปลี่ยนสาขาภายหลังใบเดิมไม่เปลี่ยน · ใบใหม่ใช้ค่าใหม่ · แก้ snapshot ไม่ได้', async () => {
    await setNumbering({ seq: 500 })
    const branchCompany = await db().$queryRawUnsafe<{ id: string }[]>(`
      INSERT INTO finance_companies (organization_id, name, short_name, tax_id, branch_code, address, vat_mode,
                                     payment_due_days, created_by)
      VALUES ('${ORG_ID}', 'ไฟแนนซ์สาขา (${RUN})', 'BR', '${RUN_TAX_ID.slice(0, 12)}${RUN_TAX_ID.endsWith('7') ? '8' : '7'}', '00003', '7 ถนนสาทร',
              'exclude_vat', 30, '${ACCOUNTING_ID}')
      RETURNING id
    `)
    const company = branchCompany[0]?.id ?? ''

    const first = await sales.issueTaxInvoice(ctx, { cashReceiptId: (await seedReceivedBilling({ company })).receiptId })
    const firstSource = await sales.getTaxInvoiceDocSource(accountant, first.id)
    expect(firstSource.buyerBranchCode).toBe('00003')
    expect(buildTaxInvoiceDoc(firstSource).buyer.branchLabel).toBe('สาขาที่ 00003')

    await db().$executeRawUnsafe(`UPDATE finance_companies SET branch_code = '00000' WHERE id = '${company}'`)
    expect((await sales.getTaxInvoiceDocSource(accountant, first.id)).buyerBranchCode).toBe('00003')

    const second = await sales.issueTaxInvoice(ctx, { cashReceiptId: (await seedReceivedBilling({ company })).receiptId })
    expect((await sales.getTaxInvoiceDocSource(accountant, second.id)).buyerBranchCode).toBe('00000')

    await expect(
      db().$executeRawUnsafe(`UPDATE tax_invoices SET buyer_branch_code = '00009' WHERE id = '${first.id}'`),
    ).rejects.toThrow(/TAX_INVOICE_IMMUTABLE/)
  })

  it('สาขาผู้ขาย: ค่าตั้งองค์กร → snapshot บนใบ · แก้ค่าภายหลังใบเดิมไม่เปลี่ยน · audit + เหตุผล', async () => {
    const { updateSellerBranch } = await import('@/lib/settings/queries/seller-branch')
    await setNumbering({ seq: 700 })
    await db().$executeRawUnsafe(`UPDATE organizations SET branch_code = '00000' WHERE id = '${ORG_ID}'`)
    await updateSellerBranch({ actor: accountant, meta, reason: 'ออกใบกำกับจากสาขาที่ 2 (เทสต์ U82)' }, '00002')

    const invoice = await sales.issueTaxInvoice(ctx, { cashReceiptId: (await seedReceivedBilling()).receiptId })
    expect((await sales.getTaxInvoiceDocSource(accountant, invoice.id)).sellerBranchCode).toBe('00002')

    await updateSellerBranch({ actor: accountant, meta, reason: 'กลับไปออกที่สำนักงานใหญ่ (เทสต์ U82)' }, '00000')
    expect((await sales.getTaxInvoiceDocSource(accountant, invoice.id)).sellerBranchCode).toBe('00002')
    await expect(
      db().$executeRawUnsafe(`UPDATE tax_invoices SET seller_branch_code = '00000' WHERE id = '${invoice.id}'`),
    ).rejects.toThrow(/TAX_INVOICE_IMMUTABLE/)
    await setNumbering({ seq: 0 })
  })
})

suite('Phase 4.3 — ยาม immutable + period lock', () => {
  it('งวดของวันที่เอกสารถูกล็อก ⇒ ออกไม่ได้ (`PERIOD_LOCKED_DIRECT_EDIT`)', async () => {
    await setNumbering({ seq: 260 })
    const lockedDay = new Date(Date.UTC(2026, 1, 15))
    await setPeriodStatusOf('กุมภาพันธ์ 2569', 'collecting')
    const { receiptId } = await seedReceivedBilling({ receivedDate: lockedDay })
    // สร้างแถวงวดก่อนล็อก (ยามอ่านงวดตามวันที่เอกสาร)
    const { ensurePeriodForDate } = await import('@/lib/accounting/queries')
    await ensurePeriodForDate(ctx, lockedDay)
    await setPeriodStatusOf('กุมภาพันธ์ 2569', 'locked')
    try {
      await expectCode(() => sales.issueTaxInvoice(ctx, { cashReceiptId: receiptId }), 'PERIOD_LOCKED_DIRECT_EDIT')
    } finally {
      await setPeriodStatusOf('กุมภาพันธ์ 2569', 'collecting')
    }
  })

  it('ใบลบไม่ได้ทุกกรณี และใบที่ยกเลิกแล้วห้าม reverse (trigger ระดับ DB · `02` §13)', async () => {
    await setNumbering({ seq: 300 + 50 })
    const invoice = await sales.issueTaxInvoice(ctx, { cashReceiptId: (await seedReceivedBilling()).receiptId })
    await expect(db().$executeRawUnsafe(`DELETE FROM tax_invoices WHERE id = '${invoice.id}'`)).rejects.toThrow(
      /TAX_INVOICE_IMMUTABLE/,
    )
    await expect(
      db().$executeRawUnsafe(`UPDATE tax_invoices SET total_satang = 1 WHERE id = '${invoice.id}'`),
    ).rejects.toThrow(/TAX_INVOICE_IMMUTABLE/)
    await sales.cancelTaxInvoice(ctx, invoice.id, { reason: 'ทดสอบยาม immutable' })
    await expect(
      db().$executeRawUnsafe(`UPDATE tax_invoices SET status = 'active' WHERE id = '${invoice.id}'`),
    ).rejects.toThrow(/TAX_INVOICE_IMMUTABLE/)
  })
})

suite('Phase 4.3 — เงินรับอ่านอย่างเดียว (`31` §6.3)', () => {
  it('รายการที่ไฟล์ 35 สร้างไว้ ⇒ แสดงผู้จ่าย/ยอด/Bank Ref/สถานะจับคู่ครบ · ยังไม่ออกใบ = รอออก', async () => {
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
    expect(row?.taxInvoice).toBeNull()
    expect(receipts.awaitingTaxInvoiceCount).toBeGreaterThanOrEqual(1)
  })
})
