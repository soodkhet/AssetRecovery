import { PrismaPg } from '@prisma/adapter-pg'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import type { SessionUser } from '@/lib/auth/types'
import { PrismaClient } from '@/lib/generated/prisma/client'
import { putFakeUpload, resetFakeUploads, sampleBytes, sha256Of, uploadTestState } from '@/tests/helpers/fake-uploads'

vi.mock('@/lib/uploads/storage', async () => (await import('@/tests/helpers/fake-uploads')).fakeStorageModule())

/**
 * เทสต์ระดับ DB ของใบลดหนี้ (มติ PO 05/10/2569 U14 + มติบัญชี B1)
 *
 *  - บันทึก B1 (ลด 100 + VAT 7) → อัตรา snapshot จากใบกำกับเดิม · total คิดที่ server · audit มี reason
 *  - VAT ตามเอกสาร ±1 สตางค์ · เกิน ⇒ `CREDIT_NOTE_VAT_MISMATCH`
 *  - ห้ามเกินยอดใบกำกับ (service + trigger DB) · เลขที่ซ้ำ ⇒ 409 · ยกเลิกแล้วบันทึกเลขเดิมใหม่ได้
 *  - ยกเลิกต้องมีเหตุผล · ยกเลิกซ้ำไม่ได้ · ลบไม่ได้ (trigger) · ยอดคืนเมื่อยกเลิก
 *  - วันที่ออกอยู่ในงวดที่ล็อก ⇒ `PERIOD_LOCKED_DIRECT_EDIT` · ก่อนวันที่ใบกำกับ ⇒ ปฏิเสธ
 *  - Adjustment ลดยอดที่อนุมัติแล้ว ⇒ "รอใบลดหนี้" จนกว่าจะบันทึกใบที่อ้างถึง
 *  - ฟังก์ชันให้ portal นับเฉพาะ active · ไฟล์สแกนตรวจ prefix + เก็บ SHA-256
 *
 * ⚠️ `tax_invoices`/`credit_notes` ลบไม่ได้ ⇒ บริษัทไฟแนนซ์ + prefix เลขที่ใหม่ทุกรัน
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
if (!url) console.warn('[credit-notes.db.test] ข้ามเทสต์ระดับ DB — ไม่มี TEST_DATABASE_URL')

const ORG_ID = '00000000-0000-4000-8000-0000000c4a00'
const ROLE_ID = '00000000-0000-4000-8000-0000000c4a01'
const ACCOUNTING_ID = '00000000-0000-4000-8000-0000000c4a02'
const TEAM_ID = '00000000-0000-4000-8000-0000000c4a03'

const RUN = `${process.pid}${Date.now() % 100_000}`
const PREFIX = `C${RUN}`
const RUN_TAX_ID = RUN.padEnd(13, '1').slice(0, 13)

/** งวดที่ล็อก (มี.ค. 2570 = 2027-03) — ใบกำกับออกก่อนหน้า ใบลดหนี้ลงวันในงวดนี้ต้องโดนปฏิเสธ */
const LOCKED_YEAR_BE = 2570
const LOCKED_MONTH = 3

let client: PrismaClient | null = null
let credit: typeof import('@/lib/credit-notes/queries')
let sales: typeof import('@/lib/sales/queries')

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
  supabaseUid: 'uid-acc-cn',
  email: 'accounting-cn@test.local',
  fullName: 'บัญชี ใบลดหนี้',
  status: 'active',
  roleId: ROLE_ID,
  roleName: 'บัญชี',
  roleGroup: 'system',
  isSuperadmin: false,
  teamId: null,
  companyId: null,
  capabilities: { manage_tax_invoice: 'manage', manage_sales_expenses: 'manage' },
  scope: { kind: 'global', teamIds: [], companyId: null, userId: ACCOUNTING_ID },
  loginAt: new Date().toISOString(),
}

const ctx = { actor: accountant, meta }

function codeOf(error: unknown): string {
  return (error as { code?: string }).code ?? String(error)
}

async function expectCode(run: () => Promise<unknown>, code: string): Promise<void> {
  await expect(run()).rejects.toSatisfy((error: unknown) => codeOf(error) === code, `ต้องได้ error code ${code}`)
}

const day = (iso: string) => new Date(`${iso}T00:00:00Z`)

let companyId = ''
let caseId = ''
let cursor = 0
let numberCursor = 0

/** เลขที่ใบลดหนี้ไม่ซ้ำต่อรัน */
function nextNumber(): string {
  numberCursor += 1
  return `CN-${RUN}-${numberCursor}`
}

interface Seeded {
  invoiceId: string
  invoiceNumber: string
  billingBatchId: string
  revenueId: string
}

/** รอบวางบิล (ส่งแล้ว) + รายได้ 1 ใบ (12,000 + VAT 7% = 12,840 บาท) → รายการขาย → ใบกำกับภาษี */
async function seedInvoice(invoiceDate = '2026-09-15'): Promise<Seeded> {
  cursor += 1
  const period = `มกราคม ${2580 + cursor}`
  const gross = 1_200_000
  const vat = 84_000
  const batch = await db().$queryRawUnsafe<{ id: string }[]>(`
    INSERT INTO billing_batches (organization_id, company_id, period, status, total_satang, due_date, created_by)
    VALUES ('${ORG_ID}', '${companyId}', $$${period}$$, 'sent', ${gross + vat}, '2026-12-31', '${ACCOUNTING_ID}')
    RETURNING id
  `)
  const billingBatchId = batch[0]?.id ?? ''
  const revenue = await db().$queryRawUnsafe<{ id: string }[]>(`
    INSERT INTO revenues (organization_id, case_id, company_id, billing_batch_id, tracking_round, gross_satang, vat_satang,
                          vat_rate_pct_used, total_satang, fee_model_snapshot, vat_mode_snapshot, status, revenue_date, created_by)
    VALUES ('${ORG_ID}', '${caseId}', '${companyId}', '${billingBatchId}', ${cursor}, ${gross}, ${vat}, 7.00, ${gross + vat},
            'SUCCESS_FEE', 'exclude_vat', 'billed', '2026-06-25', '${ACCOUNTING_ID}')
    RETURNING id
  `)
  const record = await sales.syncSalesRecordFromBilling(ctx, billingBatchId)
  // มติ PO U95 — ใบกำกับออกตอนรับเงิน ⇒ เงินรับเต็มยอดของรอบ (ไฟล์ 35 เป็นผู้สร้างจริง — insert ตรงเพื่อแยกขอบเขต)
  const receipt = await db().$queryRawUnsafe<{ id: string }[]>(`
    INSERT INTO cash_receipts (organization_id, period_id, billing_batch_id, amount_satang, received_date, created_by)
    VALUES ('${ORG_ID}', '${record?.periodId ?? ''}', '${billingBatchId}', ${gross + vat}, '${invoiceDate}', '${ACCOUNTING_ID}')
    RETURNING id
  `)
  const invoice = await sales.issueTaxInvoice(ctx, { cashReceiptId: receipt[0]?.id ?? '' })
  return { invoiceId: invoice.id, invoiceNumber: invoice.invoiceNumber, billingBatchId, revenueId: revenue[0]?.id ?? '' }
}

function input(seeded: Seeded, overrides: Record<string, unknown> = {}) {
  return {
    taxInvoiceId: seeded.invoiceId,
    creditNoteNumber: nextNumber(),
    issueDate: day('2026-10-05'),
    amountBeforeVatSatang: 10_000,
    reason: 'ลดค่าบริการหลังออกใบกำกับ',
    ...overrides,
  }
}

async function seedAdjustment(
  revenueId: string,
  options: { type?: 'increase' | 'decrease'; status?: string; amount?: number } = {},
) {
  const rows = await db().$queryRawUnsafe<{ id: string }[]>(`
    INSERT INTO adjustments (organization_id, adjustment_type, amount_satang, reason, status, revenue_id,
                             approved_by, approved_at, created_by)
    VALUES ('${ORG_ID}', '${options.type ?? 'decrease'}', ${options.amount ?? 10000}, 'ปรับค่าบริการ C1', '${options.status ?? 'approved'}',
            '${revenueId}', '${ACCOUNTING_ID}', now(), '${ACCOUNTING_ID}')
    RETURNING id
  `)
  return rows[0]?.id ?? ''
}

beforeAll(async () => {
  if (!url) return
  process.env.DATABASE_URL = url
  credit = await import('@/lib/credit-notes/queries')
  sales = await import('@/lib/sales/queries')

  const tx = db()
  await tx.$executeRawUnsafe(`
    INSERT INTO organizations (id, name, tax_id, address, vat_registered, tax_invoice_prefix)
    VALUES ('${ORG_ID}', 'CreditNoteTest', '9999999994301', 'ที่อยู่ทดสอบ ใบลดหนี้ กรุงเทพฯ', true, '${PREFIX}')
    ON CONFLICT (id) DO NOTHING
  `)
  await tx.$executeRawUnsafe(`
    UPDATE organizations SET tax_invoice_prefix = '${PREFIX}', tax_invoice_seq = 0,
           tax_invoice_numbering_mode = 'continuous', tax_invoice_digit_length = 4, tax_invoice_last_reset_year = NULL
     WHERE id = '${ORG_ID}'
  `)
  await tx.$executeRawUnsafe(`
    INSERT INTO roles (id, organization_id, name, role_group, is_seed)
    VALUES ('${ROLE_ID}', '${ORG_ID}', 'บัญชี CN', 'system', false) ON CONFLICT (id) DO NOTHING
  `)
  await tx.$executeRawUnsafe(`
    INSERT INTO users (id, organization_id, role_id, email, full_name, status)
    VALUES ('${ACCOUNTING_ID}', '${ORG_ID}', '${ROLE_ID}', 'accounting-cn@test.local', 'บัญชี ใบลดหนี้', 'active')
    ON CONFLICT (id) DO NOTHING
  `)
  // อัตรา VAT ณ วันรับเงิน (มติ PO U96 #9 — ใบเสร็จรับเงิน/ใบกำกับภาษีอ่าน `vat_rate_history`) · idempotent ข้ามรัน
  await tx.$executeRawUnsafe(`
    INSERT INTO vat_rate_history (organization_id, rate_pct, effective_from, effective_to, created_by)
    SELECT '${ORG_ID}', 7.00, '2020-01-01', NULL, '${ACCOUNTING_ID}'
     WHERE NOT EXISTS (SELECT 1 FROM vat_rate_history WHERE organization_id = '${ORG_ID}')
  `)
  await tx.$executeRawUnsafe(`
    INSERT INTO teams (id, organization_id, name, side, provinces, status, created_by)
    VALUES ('${TEAM_ID}', '${ORG_ID}', 'ทีม CN', 'outsource', ARRAY['เชียงใหม่'], 'active', '${ACCOUNTING_ID}')
    ON CONFLICT (id) DO NOTHING
  `)
  await tx.$executeRawUnsafe(`
    INSERT INTO accounting_periods (organization_id, period_label, year_be, month, status, created_by)
    VALUES ('${ORG_ID}', 'มีนาคม ${LOCKED_YEAR_BE}', ${LOCKED_YEAR_BE}, ${LOCKED_MONTH}, 'locked', '${ACCOUNTING_ID}')
    ON CONFLICT DO NOTHING
  `)

  const company = await tx.$queryRawUnsafe<{ id: string }[]>(`
    INSERT INTO finance_companies (organization_id, name, short_name, tax_id, address, vat_mode, payment_due_days, created_by)
    VALUES ('${ORG_ID}', 'ไฟแนนซ์ CN (${RUN})', 'FCN', '${RUN_TAX_ID}', '1 ถนนสีลม กรุงเทพฯ', 'exclude_vat', 30,
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
    VALUES ('${ORG_ID}', $$CN-${RUN}$$, $$CN-${RUN}$$, '${companyId}', 'manual', 'closed_success',
            '${ACCOUNTING_ID}', 'ลูกหนี้ CN', 'เชียงใหม่', 'เมือง', 'smartphone', 'iPhone 15',
            1000000, '${TEAM_ID}', 'closed_success', '2026-06-25T03:00:00Z',
            'SUCCESS_FEE', 0, 10, 'debt_amount', false)
    RETURNING id
  `)
  caseId = seededCase[0]?.id ?? ''
})

beforeEach(() => {
  resetFakeUploads()
})

afterAll(async () => {
  await client?.$disconnect()
})

suite('ใบลดหนี้ — บันทึก (มติ U14/B1)', () => {
  it('B1: ลด 100 บาท ⇒ VAT 7 จากอัตราใบกำกับเดิม · total 107 · audit มีเหตุผล', async () => {
    const seeded = await seedInvoice()
    const note = await credit.createCreditNote(ctx, input(seeded))
    expect(note).toMatchObject({
      amountBeforeVatSatang: 10_000,
      vatSatang: 700,
      totalSatang: 10_700,
      vatRatePctUsed: '7',
      status: 'active',
      invoiceNumber: seeded.invoiceNumber,
    })

    const audit = await db().auditLog.findFirst({ where: { targetType: 'credit_notes', targetId: note.id } })
    expect(audit?.action).toBe('create')
    expect(audit?.reason ?? '').toContain(note.creditNoteNumber)
  })

  it('VAT ตามเอกสาร ±1 สตางค์รับได้ · ต่างเกินนั้น ⇒ CREDIT_NOTE_VAT_MISMATCH', async () => {
    const seeded = await seedInvoice()
    const ok = await credit.createCreditNote(ctx, input(seeded, { vatSatang: 701 }))
    expect(ok.totalSatang).toBe(10_701)
    await expectCode(() => credit.createCreditNote(ctx, input(seeded, { vatSatang: 702 })), 'CREDIT_NOTE_VAT_MISMATCH')
  })

  it('ยอดรวมห้ามเกินใบกำกับ (service) — และ trigger DB กันการ insert ตรง', async () => {
    const seeded = await seedInvoice()
    await credit.createCreditNote(ctx, input(seeded, { amountBeforeVatSatang: 1_000_000 }))
    await expectCode(
      () => credit.createCreditNote(ctx, input(seeded, { amountBeforeVatSatang: 200_001 })),
      'CREDIT_NOTE_EXCEEDS_INVOICE',
    )
    await expect(
      db().$executeRawUnsafe(`
        INSERT INTO credit_notes (organization_id, tax_invoice_id, credit_note_number, issue_date,
                                  amount_before_vat_satang, vat_satang, total_satang, vat_rate_pct_used, reason, created_by, buyer_branch_code)
        VALUES ('${ORG_ID}', '${seeded.invoiceId}', '${nextNumber()}', '2026-10-05', 300000, 21000, 321000, 7, 'ตรง', '${ACCOUNTING_ID}', '00000')
      `),
    ).rejects.toThrow(/CREDIT_NOTE_EXCEEDS_INVOICE/)

    // ลดได้พอดียอดคงเหลือ
    const last = await credit.createCreditNote(ctx, input(seeded, { amountBeforeVatSatang: 200_000 }))
    expect(last.totalSatang).toBe(214_000)
    expect((await credit.sumCreditNotesForInvoice(seeded.invoiceId)).totalSatang).toBe(1_284_000)
  })

  it('CHECK: total ต้องเท่ากับ ก่อน VAT + VAT ที่ระดับ DB', async () => {
    const seeded = await seedInvoice()
    await expect(
      db().$executeRawUnsafe(`
        INSERT INTO credit_notes (organization_id, tax_invoice_id, credit_note_number, issue_date,
                                  amount_before_vat_satang, vat_satang, total_satang, vat_rate_pct_used, reason, created_by, buyer_branch_code)
        VALUES ('${ORG_ID}', '${seeded.invoiceId}', '${nextNumber()}', '2026-10-05', 100, 7, 999, 7, 'ตรง', '${ACCOUNTING_ID}', '00000')
      `),
    ).rejects.toThrow(/chk_credit_notes_total|check constraint/i)
  })

  it('เลขที่ซ้ำกับใบ active ⇒ 409 · ยกเลิกใบเดิมแล้วบันทึกเลขเดิมใหม่ได้', async () => {
    const seeded = await seedInvoice()
    const number = nextNumber()
    const first = await credit.createCreditNote(ctx, input(seeded, { creditNoteNumber: number }))
    await expectCode(
      () => credit.createCreditNote(ctx, input(seeded, { creditNoteNumber: number })),
      'CREDIT_NOTE_NUMBER_DUPLICATE',
    )
    await credit.cancelCreditNote(ctx, first.id, { reason: 'กรอกยอดผิด' })
    const again = await credit.createCreditNote(ctx, input(seeded, { creditNoteNumber: number }))
    expect(again.creditNoteNumber).toBe(number)
  })

  it('วันที่ก่อนใบกำกับ ⇒ ปฏิเสธ · ใบกำกับที่ยกเลิกแล้ว ⇒ TAX_INVOICE_INVALID_STATUS', async () => {
    const seeded = await seedInvoice('2026-09-15')
    await expectCode(
      () => credit.createCreditNote(ctx, input(seeded, { issueDate: day('2026-09-14') })),
      'CREDIT_NOTE_DATE_BEFORE_INVOICE',
    )
    await sales.cancelTaxInvoice(ctx, seeded.invoiceId, { reason: 'ออกผิด' })
    await expectCode(() => credit.createCreditNote(ctx, input(seeded)), 'TAX_INVOICE_INVALID_STATUS')
  })

  it('วันที่ออกอยู่ในงวดที่ล็อก ⇒ PERIOD_LOCKED_DIRECT_EDIT', async () => {
    const seeded = await seedInvoice('2026-09-15')
    await expectCode(
      () => credit.createCreditNote(ctx, input(seeded, { issueDate: day('2027-03-10') })),
      'PERIOD_LOCKED_DIRECT_EDIT',
    )
  })

  it('ใบกำกับนอก org ⇒ TAX_INVOICE_NOT_FOUND (ไม่ leak)', async () => {
    const seeded = await seedInvoice()
    const outsider: SessionUser = { ...accountant, organizationId: '00000000-0000-4000-8000-0000000c4aff' }
    await expectCode(() => credit.createCreditNote({ actor: outsider, meta }, input(seeded)), 'TAX_INVOICE_NOT_FOUND')
  })
})

suite('ใบลดหนี้ — ยกเลิก', () => {
  it('ต้องมีเหตุผล · ยกเลิกซ้ำไม่ได้ · ลบไม่ได้ · ยอดคืนให้ใบกำกับ · audit before/after', async () => {
    const seeded = await seedInvoice()
    const note = await credit.createCreditNote(ctx, input(seeded))
    await expectCode(() => credit.cancelCreditNote(ctx, note.id, { reason: '   ' }), 'CANCEL_REQUIRES_REASON')

    const cancelled = await credit.cancelCreditNote(ctx, note.id, { reason: 'สำนักงานบัญชียกเลิกเอกสาร' })
    expect(cancelled.status).toBe('cancelled')
    expect(cancelled.cancelReason).toBe('สำนักงานบัญชียกเลิกเอกสาร')
    await expectCode(() => credit.cancelCreditNote(ctx, note.id, { reason: 'ซ้ำ' }), 'CREDIT_NOTE_INVALID_STATUS')

    await expect(db().$executeRawUnsafe(`DELETE FROM credit_notes WHERE id = '${note.id}'`)).rejects.toThrow(
      /CREDIT_NOTE_IMMUTABLE/,
    )
    await expect(
      db().$executeRawUnsafe(`UPDATE credit_notes SET status = 'active', cancel_reason = NULL WHERE id = '${note.id}'`),
    ).rejects.toThrow(/CREDIT_NOTE_IMMUTABLE/)

    expect(await credit.sumCreditNotesForInvoice(seeded.invoiceId)).toEqual({
      amountBeforeVatSatang: 0,
      vatSatang: 0,
      totalSatang: 0,
      count: 0,
    })

    const audit = await db().auditLog.findFirst({
      where: { targetType: 'credit_notes', targetId: note.id, action: 'status_change' },
    })
    expect(audit?.reason).toBe('สำนักงานบัญชียกเลิกเอกสาร')
  })

  it('ใบ active แก้ยอดตรงไม่ได้ (trigger) — แก้ได้ทางเดียวคือยกเลิก', async () => {
    const seeded = await seedInvoice()
    const note = await credit.createCreditNote(ctx, input(seeded))
    await expect(
      db().$executeRawUnsafe(`UPDATE credit_notes SET amount_before_vat_satang = 1 WHERE id = '${note.id}'`),
    ).rejects.toThrow(/CREDIT_NOTE_IMMUTABLE/)
  })
})

suite('ใบลดหนี้ — Adjustment "รอใบลดหนี้" + ฟังก์ชันให้ portal', () => {
  it('Adjustment ลดยอดที่อนุมัติแล้ว ⇒ รอใบลดหนี้ จนกว่าจะบันทึกใบที่อ้างถึง', async () => {
    const seeded = await seedInvoice()
    const adjustmentId = await seedAdjustment(seeded.revenueId)

    const before = await credit.listAdjustmentsAwaitingCreditNote(accountant)
    expect(before.find((row) => row.adjustmentId === adjustmentId)).toMatchObject({
      taxInvoiceId: seeded.invoiceId,
      billingBatchId: seeded.billingBatchId,
    })

    const note = await credit.createCreditNote(ctx, input(seeded, { adjustmentId }))
    expect(note.adjustmentId).toBe(adjustmentId)
    const after = await credit.listAdjustmentsAwaitingCreditNote(accountant)
    expect(after.some((row) => row.adjustmentId === adjustmentId)).toBe(false)

    // Adjustment เดิมมีใบลดหนี้แล้ว อ้างซ้ำไม่ได้
    await expectCode(
      () => credit.createCreditNote(ctx, input(seeded, { adjustmentId })),
      'CREDIT_NOTE_ADJUSTMENT_MISMATCH',
    )
  })

  it('ใบลดหนี้อ้าง Adjustment เพิ่มยอด / ยังไม่อนุมัติ ⇒ CREDIT_NOTE_ADJUSTMENT_MISMATCH · เพิ่มยอดขึ้นป้าย "รอใบเพิ่มหนี้" (U19)', async () => {
    const seeded = await seedInvoice()
    const increase = await seedAdjustment(seeded.revenueId, { type: 'increase' })
    const pending = await seedAdjustment(seeded.revenueId, { status: 'pending_approval' })
    await expectCode(
      () => credit.createCreditNote(ctx, input(seeded, { adjustmentId: increase })),
      'CREDIT_NOTE_ADJUSTMENT_MISMATCH',
    )
    await expectCode(
      () => credit.createCreditNote(ctx, input(seeded, { adjustmentId: pending })),
      'CREDIT_NOTE_ADJUSTMENT_MISMATCH',
    )
    const awaiting = await credit.listAdjustmentsAwaitingCreditNote(accountant)
    expect(awaiting.some((row) => row.adjustmentId === pending)).toBe(false)
    expect(awaiting.find((row) => row.adjustmentId === increase)).toMatchObject({ noteType: 'debit', label: 'รอใบเพิ่มหนี้' })
  })

  it('sumCreditNotesForInvoice / creditNotesForBillingBatch นับเฉพาะ active', async () => {
    const seeded = await seedInvoice()
    const keep = await credit.createCreditNote(ctx, input(seeded, { amountBeforeVatSatang: 10_000 }))
    const drop = await credit.createCreditNote(ctx, input(seeded, { amountBeforeVatSatang: 20_000 }))
    await credit.cancelCreditNote(ctx, drop.id, { reason: 'บันทึกซ้ำ' })

    expect(await credit.sumCreditNotesForInvoice(seeded.invoiceId, { organizationId: ORG_ID })).toEqual({
      amountBeforeVatSatang: 10_000,
      vatSatang: 700,
      totalSatang: 10_700,
      count: 1,
    })
    expect(
      await credit.sumCreditNotesForInvoice(seeded.invoiceId, { organizationId: '00000000-0000-4000-8000-0000000c4aff' }),
    ).toMatchObject({ count: 0 })

    const list = await credit.creditNotesForBillingBatch(seeded.billingBatchId)
    expect(list.map((row) => row.id)).toEqual([keep.id])
    expect(list[0]).toMatchObject({ invoiceNumber: seeded.invoiceNumber, totalSatang: 10_700 })

    const register = await credit.listCreditNotes(accountant, { taxInvoiceId: seeded.invoiceId })
    expect(register.items).toHaveLength(2)
  })
})

suite('ใบลดหนี้ — ไฟล์สแกน', () => {
  it('ไฟล์ใต้ prefix ของใบกำกับ ⇒ ตรวจจริงแล้วเก็บ SHA-256 · นอก prefix ⇒ UPLOAD_PATH_OUT_OF_SCOPE', async () => {
    const seeded = await seedInvoice()
    uploadTestState.realVerify = true
    const path = `tax-invoices/${seeded.invoiceId}/credit-notes/11111111-1111-4111-8111-111111111111.pdf`
    const bytes = sampleBytes('pdf', RUN)
    putFakeUpload(path, bytes)

    const note = await credit.createCreditNote(ctx, input(seeded, { filePath: path }))
    expect(note.filePath).toBe(path)
    const row = await db().creditNote.findUniqueOrThrow({ where: { id: note.id } })
    expect(row.fileSha256).toBe(sha256Of(bytes))

    await expectCode(
      () =>
        credit.createCreditNote(
          ctx,
          input(seeded, { filePath: `tax-invoices/00000000-0000-4000-8000-000000000000/credit-notes/x.pdf` }),
        ),
      'UPLOAD_PATH_OUT_OF_SCOPE',
    )
  })
})

suite('มติ PO U18–U21 — ใบเพิ่มหนี้ · บล็อกยกเลิกใบกำกับ · เตือนยอด · Export 09 (fixer X4)', () => {
  it('U18: ยกเลิกใบกำกับที่มีใบลดหนี้/ใบเพิ่มหนี้ active ⇒ TAX_INVOICE_HAS_ACTIVE_NOTES บอกเลขเอกสาร · ยกเลิกเอกสารก่อนแล้วยกเลิกใบกำกับได้', async () => {
    const seeded = await seedInvoice()
    const cn = await credit.createCreditNote(ctx, input(seeded))
    const dn = await credit.createCreditNote(ctx, input(seeded, { noteType: 'debit', creditNoteNumber: `DN-${RUN}-u18` }))

    const error = await sales.cancelTaxInvoice(ctx, seeded.invoiceId, { reason: 'ออกผิด' }).catch((caught: unknown) => caught)
    expect(codeOf(error)).toBe('TAX_INVOICE_HAS_ACTIVE_NOTES')
    const message = (error as { userMessage?: string }).userMessage ?? ''
    expect(message).toContain(`ใบลดหนี้ ${cn.creditNoteNumber}`)
    expect(message).toContain(`ใบเพิ่มหนี้ ${dn.creditNoteNumber}`)
    expect((await db().taxInvoice.findUniqueOrThrow({ where: { id: seeded.invoiceId } })).status).toBe('active')

    await credit.cancelCreditNote(ctx, cn.id, { reason: 'ยกเลิกก่อนยกเลิกใบกำกับ' })
    await expectCode(() => sales.cancelTaxInvoice(ctx, seeded.invoiceId, { reason: 'ออกผิด' }), 'TAX_INVOICE_HAS_ACTIVE_NOTES')
    await credit.cancelCreditNote(ctx, dn.id, { reason: 'ยกเลิกก่อนยกเลิกใบกำกับ' })
    const cancelled = await sales.cancelTaxInvoice(ctx, seeded.invoiceId, { reason: 'ออกผิด' })
    expect(cancelled.status).toBe('cancelled')
  })

  it('U19: ใบเพิ่มหนี้ — VAT อัตราเดิม · ไม่มีเพดาน · ผูก Adjustment เพิ่มยอด · ป้ายรอหาย · เลขซ้ำต่อชนิด · ยกเลิกได้', async () => {
    const seeded = await seedInvoice()
    const increase = await seedAdjustment(seeded.revenueId, { type: 'increase', amount: 2_000_000 })
    const decrease = await seedAdjustment(seeded.revenueId, { type: 'decrease' })

    // ใบเพิ่มหนี้อ้าง Adjustment ลดยอดไม่ได้
    await expectCode(
      () => credit.createCreditNote(ctx, input(seeded, { noteType: 'debit', adjustmentId: decrease })),
      'CREDIT_NOTE_ADJUSTMENT_MISMATCH',
    )

    const number = `X-${RUN}-dn`
    // ยอดเกินใบกำกับ (12,000) ได้ — ใบเพิ่มหนี้ไม่มีเพดาน
    const dn = await credit.createCreditNote(
      ctx,
      input(seeded, { noteType: 'debit', creditNoteNumber: number, amountBeforeVatSatang: 2_000_000, adjustmentId: increase }),
    )
    expect(dn).toMatchObject({
      noteType: 'debit',
      noteTypeLabel: 'ใบเพิ่มหนี้',
      vatSatang: 140_000,
      totalSatang: 2_140_000,
      vatRatePctUsed: '7',
      warnings: [],
    })
    const awaiting = await credit.listAdjustmentsAwaitingCreditNote(accountant)
    expect(awaiting.some((row) => row.adjustmentId === increase)).toBe(false)
    expect(awaiting.find((row) => row.adjustmentId === decrease)).toMatchObject({ noteType: 'credit', label: 'รอใบลดหนี้' })

    // เลขเดียวกันคนละชนิดได้ · ชนิดเดียวกันซ้ำ ⇒ 409
    const cn = await credit.createCreditNote(ctx, input(seeded, { creditNoteNumber: number }))
    expect(cn.noteType).toBe('credit')
    await expectCode(
      () => credit.createCreditNote(ctx, input(seeded, { noteType: 'debit', creditNoteNumber: number })),
      'CREDIT_NOTE_NUMBER_DUPLICATE',
    )

    expect(await credit.sumCreditNotesForInvoice(seeded.invoiceId, { noteType: 'debit' })).toMatchObject({
      totalSatang: 2_140_000,
      count: 1,
    })
    expect(await credit.sumCreditNotesForInvoice(seeded.invoiceId)).toMatchObject({ totalSatang: 10_700, count: 1 })

    const cancelled = await credit.cancelCreditNote(ctx, dn.id, { reason: 'บันทึกผิด' })
    expect(cancelled).toMatchObject({ status: 'cancelled', noteType: 'debit' })
    const after = await credit.listAdjustmentsAwaitingCreditNote(accountant)
    expect(after.find((row) => row.adjustmentId === increase)).toMatchObject({ noteType: 'debit' })

    // note_type แก้ไม่ได้ (trigger)
    await expect(
      db().$executeRawUnsafe(`UPDATE credit_notes SET note_type = 'debit' WHERE id = '${cn.id}'`),
    ).rejects.toThrow(/CREDIT_NOTE_IMMUTABLE/)
  })

  it('U20: ใบเพิ่มหนี้ลงวันในงวดที่ล็อก ⇒ PERIOD_LOCKED_DIRECT_EDIT', async () => {
    const seeded = await seedInvoice()
    await expectCode(
      () => credit.createCreditNote(ctx, input(seeded, { noteType: 'debit', issueDate: day('2027-03-10') })),
      'PERIOD_LOCKED_DIRECT_EDIT',
    )
  })

  it('U19 portal: ยอดตามเอกสาร = ใบกำกับ − ใบลดหนี้ + ใบเพิ่มหนี้ · กราฟรายได้รวมเท่ายอดก่อน VAT ตามเอกสาร', async () => {
    const seeded = await seedInvoice()
    await credit.createCreditNote(ctx, input(seeded, { amountBeforeVatSatang: 10_000 }))
    const increase = await seedAdjustment(seeded.revenueId, { type: 'increase', amount: 50_000 })
    await credit.createCreditNote(
      ctx,
      input(seeded, { noteType: 'debit', amountBeforeVatSatang: 50_000, adjustmentId: increase }),
    )
    const documented = await import('@/lib/portal/documented-amounts')
    const amounts = await documented.documentedBillingAmounts(ORG_ID, { billingBatchId: seeded.billingBatchId })
    expect(amounts).toMatchObject({
      invoiced: { beforeVatSatang: 1_200_000, vatSatang: 84_000, totalSatang: 1_284_000 },
      creditNotes: { beforeVatSatang: 10_000, vatSatang: 700, totalSatang: 10_700 },
      debitNotes: { beforeVatSatang: 50_000, vatSatang: 3_500, totalSatang: 53_500 },
      documented: { beforeVatSatang: 1_240_000, vatSatang: 86_800, totalSatang: 1_326_800 },
    })
    const revenue = await documented.documentedRevenueAmounts(ORG_ID, [seeded.billingBatchId])
    expect(revenue.get(seeded.revenueId)).toBe(1_240_000)
  })

  it('U21: ยอดก่อน VAT ไม่ตรง Adjustment ⇒ บันทึกได้ + warnings + audit amount_matches_adjustment=false · ตรง ⇒ ไม่มีคำเตือน', async () => {
    const seeded = await seedInvoice()
    const mismatch = await seedAdjustment(seeded.revenueId, { amount: 10_000 })
    const note = await credit.createCreditNote(ctx, input(seeded, { adjustmentId: mismatch, amountBeforeVatSatang: 12_000 }))
    expect(note.warnings).toHaveLength(1)
    expect(note.warnings[0]).toContain('ไม่เท่ากับยอดรายการปรับปรุง')
    const audit = await db().auditLog.findFirst({ where: { targetType: 'credit_notes', targetId: note.id, action: 'create' } })
    expect(audit?.afterData).toMatchObject({ amount_matches_adjustment: false, adjustment_amount_satang: 10_000, note_type: 'credit' })

    const exact = await seedAdjustment(seeded.revenueId, { amount: 10_000 })
    const ok = await credit.createCreditNote(ctx, input(seeded, { adjustmentId: exact, amountBeforeVatSatang: 10_000 }))
    expect(ok.warnings).toEqual([])
    const okAudit = await db().auditLog.findFirst({ where: { targetType: 'credit_notes', targetId: ok.id, action: 'create' } })
    expect(okAudit?.afterData).toMatchObject({ amount_matches_adjustment: true })
  })

  it('U21 + U96 #9: ใบเสร็จรับเงิน/ใบกำกับภาษีใช้อัตราบนใบ · ใบแบบเดิมหลายอัตรา (ไม่มีอัตราบนใบ) ⇒ CREDIT_NOTE_VAT_MISMATCH', async () => {
    const seeded = await seedInvoice()
    await db().$executeRawUnsafe(`
      INSERT INTO revenues (organization_id, case_id, company_id, billing_batch_id, tracking_round, gross_satang, vat_satang,
                            vat_rate_pct_used, total_satang, fee_model_snapshot, vat_mode_snapshot, status, revenue_date, created_by)
      VALUES ('${ORG_ID}', '${caseId}', '${companyId}', '${seeded.billingBatchId}', ${900 + cursor}, 100000, 10000, 10.00,
              110000, 'SUCCESS_FEE', 'exclude_vat', 'billed', '2026-06-26', '${ACCOUNTING_ID}')
    `)
    // ใบเสร็จรับเงิน/ใบกำกับภาษีมีอัตราเดียวบนใบ (ณ วันรับเงิน) ⇒ ใบลดหนี้คิดจากอัตรานั้น ไม่ดูรายได้ของรอบ
    const note = await credit.createCreditNote(ctx, input(seeded))
    expect(note.vatRatePctUsed).toBe('7')

    // ใบกำกับแบบเดิม (ก่อน U95) ที่รอบมีหลายอัตรา ⇒ ไม่มีอัตราบนใบ ⇒ ยังปฏิเสธพร้อมข้อความเดิม
    const salesRecordId = (await db().salesRecord.findUniqueOrThrow({ where: { billingBatchId: seeded.billingBatchId } })).id
    const legacy = await db().$queryRawUnsafe<{ id: string }[]>(`
      INSERT INTO tax_invoices (organization_id, sales_record_id, doc_kind, invoice_number, invoice_date, buyer_branch_code,
        seller_branch_code, amount_before_vat_satang, vat_satang, total_satang, vat_rate_pct_used, seller_name, seller_tax_id,
        seller_address, buyer_name, buyer_tax_id, buyer_address, delivery_format, description, created_by)
      VALUES ('${ORG_ID}', '${salesRecordId}', 'tax_invoice', '${PREFIX}-LEGACY-${cursor}', '2026-09-15', '00000', '00000',
        1300000, 94000, 1394000, NULL, 'CreditNoteTest', '9999999994301', 'กรุงเทพฯ', 'ไฟแนนซ์', '1234567890123', 'กรุงเทพฯ',
        'paper_pdf', 'ค่าบริการติดตามทรัพย์', '${ACCOUNTING_ID}')
      RETURNING id
    `)
    const error = await credit
      .createCreditNote(ctx, input({ ...seeded, invoiceId: legacy[0]?.id ?? '' }))
      .catch((caught: unknown) => caught)
    expect(codeOf(error)).toBe('CREDIT_NOTE_VAT_MISMATCH')
    const message = (error as { userMessage?: string }).userMessage ?? ''
    expect(message).toContain('หลายอัตรา')
    expect(message).toContain('ติดต่อผู้ดูแลระบบ')
  })

  it('U21 Export: 09_Credit_Notes.csv มีใบลดหนี้ (CN) + ใบเพิ่มหนี้ (DN) ของรอบ · adjustment_ref ชี้เลขในไฟล์ 07', async () => {
    const seeded = await seedInvoice()
    const decrease = await seedAdjustment(seeded.revenueId)
    const cn = await credit.createCreditNote(ctx, input(seeded, { adjustmentId: decrease }))
    const dn = await credit.createCreditNote(ctx, input(seeded, { noteType: 'debit', amountBeforeVatSatang: 5_000 }))
    await credit.cancelCreditNote(ctx, dn.id, { reason: 'บันทึกผิด' })

    const { buildCreditNotePackFile } = await import('@/lib/exports/queries')
    const csv = await buildCreditNotePackFile(ORG_ID, 2569, 10)
    const lines = csv.slice(1).split('\r\n')
    expect(csv.charCodeAt(0)).toBe(0xfeff)
    expect(lines[0]).toBe(
      'document_type,number,issue_date,tax_invoice_ref,company,amount_before_vat_baht,vat_baht,total_baht,reason,status,adjustment_ref,company_branch',
    )
    const cnLine = lines.find((line) => line.startsWith(`CN,${cn.creditNoteNumber},`)) ?? ''
    expect(cnLine).toMatch(
      new RegExp(`^CN,${cn.creditNoteNumber},05/10/2569,${seeded.invoiceNumber},.+,100\\.00,7\\.00,107\\.00,.+,active,ADJ-2569-06-\\d{3},สำนักงานใหญ่$`),
    )
    const dnLine = lines.find((line) => line.startsWith(`DN,${dn.creditNoteNumber},`)) ?? ''
    expect(dnLine).toMatch(/,50\.00,3\.50,53\.50,.+,cancelled,-,สำนักงานใหญ่$/)
  })
})

suite('มติ PO U82 (ม.86/4) — ใบลดหนี้/ใบเพิ่มหนี้เก็บสาขาผู้ซื้อตามใบกำกับเดิม', () => {
  it('snapshot จากใบกำกับ (ไม่ใช่ค่าปัจจุบันของบริษัท) · DB บังคับให้ตรงใบกำกับ · แก้ไม่ได้ · ไฟล์ 09 คอลัมน์ต่อท้าย', async () => {
    await db().$executeRawUnsafe(`UPDATE finance_companies SET branch_code = '00004' WHERE id = '${companyId}'`)
    let seeded: Seeded
    try {
      seeded = await seedInvoice()
    } finally {
      // บริษัทย้ายกลับสำนักงานใหญ่หลังออกใบ — ใบลดหนี้ต้องยังอ้างสาขาตามใบกำกับเดิม
      await db().$executeRawUnsafe(`UPDATE finance_companies SET branch_code = '00000' WHERE id = '${companyId}'`)
    }
    const cn = await credit.createCreditNote(ctx, input(seeded))
    expect(cn).toMatchObject({ buyerBranchCode: '00004', buyerBranchLabel: 'สาขาที่ 00004' })
    const dn = await credit.createCreditNote(ctx, input(seeded, { noteType: 'debit', creditNoteNumber: `DN-${RUN}-u82` }))
    expect(dn.buyerBranchCode).toBe('00004')
    expect((await credit.creditNotesByInvoice([seeded.invoiceId])).get(seeded.invoiceId)?.map((row) => row.buyerBranchCode)).toEqual([
      '00004',
      '00004',
    ])

    await expect(
      db().$executeRawUnsafe(`
        INSERT INTO credit_notes (organization_id, tax_invoice_id, credit_note_number, issue_date,
                                  amount_before_vat_satang, vat_satang, total_satang, vat_rate_pct_used, reason, created_by, buyer_branch_code)
        VALUES ('${ORG_ID}', '${seeded.invoiceId}', '${nextNumber()}', '2026-10-05', 100, 7, 107, 7, 'ผิดสาขา', '${ACCOUNTING_ID}', '00000')
      `),
      'สาขาผู้ซื้อไม่ตรงใบกำกับเดิม',
    ).rejects.toThrow(/CREDIT_NOTE_BRANCH_MISMATCH/)
    await expect(
      db().$executeRawUnsafe(`UPDATE credit_notes SET buyer_branch_code = '00000' WHERE id = '${cn.id}'`),
      'snapshot แก้ไม่ได้',
    ).rejects.toThrow(/CREDIT_NOTE_IMMUTABLE/)

    const { buildCreditNotePackFile } = await import('@/lib/exports/queries')
    const lines = (await buildCreditNotePackFile(ORG_ID, 2569, 10)).slice(1).split('\r\n')
    expect(lines.find((line) => line.startsWith(`CN,${cn.creditNoteNumber},`))).toMatch(/,สาขาที่ 00004$/)
  })
})
