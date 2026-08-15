import { PrismaPg } from '@prisma/adapter-pg'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { SessionUser } from '@/lib/auth/types'
import { PrismaClient } from '@/lib/generated/prisma/client'

/**
 * **Phase 8.1 — E2E Acceptance: `29` §6.1 (Happy Path ฝั่งรายรับ)**
 *
 * เคส `closed_success` → รายได้ → วางบิล → ใบกำกับภาษี → เงินเข้า → บัญชี
 * เดินผ่าน **service จริงทุกก้าว** (ห้าม insert ข้ามขั้นเพื่อให้ผ่าน — DoD ของ task)
 *
 * ครอบจุดเชื่อมของ Integration Checklist (`29` §7) 3 จุด:
 *  - Case → Revenue: snapshot ค่าบริการตอน `accept` เป็นตัวคิดยอด ไม่ใช่เทมเพลตปัจจุบัน
 *  - Billing → Accounting: ส่งบิล ⇒ รายการขาย 1:1 ⇒ ใบกำกับภาษีเลขที่ต่อเนื่อง
 *  - Bank Statement → Cash Receipt: auto-match ⇒ ใบเงินรับ ⇒ รอบวางบิล `paid`
 *
 * ⚠️ ต้องตั้ง `DATABASE_URL = TEST_DATABASE_URL` **ก่อน** import service (กับดัก 2026-08-14)
 * ⚠️ `tax_invoices` ลบไม่ได้ (trigger `02` §13) ⇒ ไฟล์นี้ **ไม่ล้างข้อมูลท้ายรัน** แต่สร้าง
 *    บริษัทไฟแนนซ์ + prefix เลขที่ใหม่ทุกรัน และเคลียร์ "ผู้สมัคร auto-match" ที่ค้างจากรันก่อน
 *    ตอน `beforeAll` (บิลที่ค้างสถานะ `sent` ยอดเท่ากันจะทำให้ auto-match กลายเป็น ambiguous)
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
  console.warn('[e2e-revenue-cycle.db.test] ข้ามเทสต์ระดับ DB — ไม่มี TEST_DATABASE_URL (ดู .env.example)')
}

const ORG_ID = '00000000-0000-4000-8000-0000000081a0'
const ROLE_ADMIN = '00000000-0000-4000-8000-0000000081a1'
const ROLE_MANAGER = '00000000-0000-4000-8000-0000000081a2'
const ROLE_FINANCE = '00000000-0000-4000-8000-0000000081a3'
const ROLE_AGENT = '00000000-0000-4000-8000-0000000081a4'
const ADMIN_ID = '00000000-0000-4000-8000-0000000081a5'
const MANAGER_ID = '00000000-0000-4000-8000-0000000081a6'
const FINANCE_ID = '00000000-0000-4000-8000-0000000081a7'
const AGENT_ID = '00000000-0000-4000-8000-0000000081a8'
const TEAM_ID = '00000000-0000-4000-8000-0000000081a9'
const PLAN_ID = '00000000-0000-4000-8000-0000000081aa'
const TEMPLATE_ID = '00000000-0000-4000-8000-0000000081ab'
const BANK_ACCOUNT_ID = '00000000-0000-4000-8000-0000000081ac'
const MATRIX_ID = '00000000-0000-4000-8000-0000000081ad'
const PAYEE_ID = '00000000-0000-4000-8000-0000000081ae'

const PROVINCE = 'เชียงใหม่'
/** ตัวคั่นข้อมูลของแต่ละรัน — บริษัท/เลขที่ใบกำกับภาษีสร้างใหม่ทุกครั้ง (ลบของเก่าไม่ได้) */
const RUN = `${process.pid}${Date.now() % 100_000}`
const INVOICE_PREFIX = `E81${RUN}`.slice(0, 12)
const RUN_TAX_ID = `9${RUN}`.padEnd(13, '0').slice(0, 13)

/** มูลหนี้ 10,000 บาท × SUCCESS_FEE 10% = 1,000 บาท + VAT 7% = 1,070 บาท */
const DEBT_SATANG = 1_000_000
const GROSS_SATANG = 100_000
const VAT_SATANG = 7_000
const TOTAL_SATANG = 107_000

let client: PrismaClient | null = null
let cases: typeof import('@/lib/cases/queries')
let caseStatus: typeof import('@/lib/cases/status-queries')
let assignments: typeof import('@/lib/assignments/queries')
let field: typeof import('@/lib/field/queries')
let warehouse: typeof import('@/lib/warehouse/queries')
let approvals: typeof import('@/lib/compensation/approval-queries')
let revenue: typeof import('@/lib/revenue/queries')
let sales: typeof import('@/lib/sales/queries')
let recon: typeof import('@/lib/bank-recon/queries')

function db(): PrismaClient {
  if (!url) throw new Error('ไม่มี TEST_DATABASE_URL')
  if (!client) {
    assertLocalTestDatabase(url)
    client = new PrismaClient({ adapter: new PrismaPg({ connectionString: url }) })
  }
  return client
}

const meta = { ipAddress: null, userAgent: null }

function sessionUser(overrides: Partial<SessionUser> & Pick<SessionUser, 'id'>): SessionUser {
  return {
    organizationId: ORG_ID,
    supabaseUid: `uid-${overrides.id}`,
    email: `${overrides.id}@test.local`,
    fullName: 'ผู้ทดสอบ 8.1',
    status: 'active',
    roleId: ROLE_AGENT,
    roleName: 'พนักงานติดตามทรัพย์',
    roleGroup: 'inhouse',
    isSuperadmin: false,
    teamId: TEAM_ID,
    companyId: null,
    capabilities: {},
    scope: { kind: 'self', teamIds: [], companyId: null, userId: overrides.id },
    loginAt: new Date().toISOString(),
    ...overrides,
  }
}

const agent = sessionUser({ id: AGENT_ID })
/** ผู้จัดการทีม — ขั้นที่ 1 ของสายอนุมัติ (`16` §6.1) */
const manager = sessionUser({
  id: MANAGER_ID,
  roleId: ROLE_MANAGER,
  roleName: 'ผู้จัดการทีมติดตามทรัพย์',
  teamId: null,
  capabilities: { approve_expense_manager: 'manage' },
  scope: { kind: 'team', teamIds: [TEAM_ID], companyId: null, userId: MANAGER_ID },
})
/** การเงิน — ขั้นที่ 2 ของสายอนุมัติ + เจ้าของงานวางบิล/กระทบยอด */
const finance = sessionUser({
  id: FINANCE_ID,
  roleId: ROLE_FINANCE,
  roleName: 'การเงิน',
  roleGroup: 'system',
  teamId: null,
  capabilities: {
    approve_expense_finance: 'manage',
    manage_billing: 'manage',
    manage_tax_invoice: 'manage',
    manage_sales_expenses: 'manage',
    manage_bank_reconciliation: 'manage',
  },
  scope: { kind: 'global', teamIds: [], companyId: null, userId: FINANCE_ID },
})
/** ธุรการรับเคส + คลัง — เห็นทุกแถวในองค์กร */
const admin = sessionUser({
  id: ADMIN_ID,
  roleId: ROLE_ADMIN,
  roleName: 'ธุรการ',
  roleGroup: 'system',
  teamId: null,
  capabilities: {
    record_admin_data: 'manage',
    approve_case: 'manage',
    assign_case: 'manage',
    manage_warehouse: 'manage',
  },
  scope: { kind: 'global', teamIds: [], companyId: null, userId: ADMIN_ID },
})

const ctx = (actor: SessionUser) => ({ actor, meta })
const revenueCtx = (actor: SessionUser, reason: string) => ({ actor, meta, reason })

let companyId = ''

/** `DD/MM/YYYY` พ.ศ. สำหรับไฟล์ statement (Rule 01 — วันบนเอกสารเป็น พ.ศ. เสมอ) */
function beDate(date: Date): string {
  const bangkok = new Date(date.getTime() + 7 * 60 * 60 * 1000)
  const day = String(bangkok.getUTCDate()).padStart(2, '0')
  const month = String(bangkok.getUTCMonth() + 1).padStart(2, '0')
  return `${day}/${month}/${bangkok.getUTCFullYear() + 543}`
}

function bahtText(satang: number): string {
  return (satang / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

suite('Phase 8.1 — E2E `29` §6.1: ปิดเคสสำเร็จ → รายได้ → วางบิล → รับเงิน → บัญชี', () => {
  beforeAll(async () => {
    if (!url) return
    process.env.DATABASE_URL = url
    cases = await import('@/lib/cases/queries')
    caseStatus = await import('@/lib/cases/status-queries')
    assignments = await import('@/lib/assignments/queries')
    field = await import('@/lib/field/queries')
    warehouse = await import('@/lib/warehouse/queries')
    approvals = await import('@/lib/compensation/approval-queries')
    revenue = await import('@/lib/revenue/queries')
    sales = await import('@/lib/sales/queries')
    recon = await import('@/lib/bank-recon/queries')

    const tx = db()
    await tx.$executeRawUnsafe(`
      INSERT INTO organizations (id, name, tax_id, address, vat_registered, tax_invoice_prefix,
                                 tax_invoice_digit_length, tax_invoice_numbering_mode)
      VALUES ('${ORG_ID}', 'E2E 8.1 รายรับ', '9999999998110', '1 ถนนทดสอบ กรุงเทพฯ 10110', true,
              '${INVOICE_PREFIX}', 4, 'continuous')
      ON CONFLICT (id) DO NOTHING
    `)
    // เลขที่ใบกำกับภาษีของรันนี้ต้องไม่ทับของรันก่อน (ใบเก่าลบไม่ได้) ⇒ เปลี่ยน prefix + รีเซ็ตตัวเดินเลข
    await tx.$executeRawUnsafe(`
      UPDATE organizations SET tax_invoice_prefix = '${INVOICE_PREFIX}', tax_invoice_seq = 0,
                               tax_invoice_numbering_mode = 'continuous', tax_invoice_digit_length = 4
       WHERE id = '${ORG_ID}'
    `)
    await tx.$executeRawUnsafe(`
      INSERT INTO roles (id, organization_id, name, role_group, is_seed) VALUES
        ('${ROLE_ADMIN}', '${ORG_ID}', 'ธุรการ 8.1', 'system', false),
        ('${ROLE_MANAGER}', '${ORG_ID}', 'ผู้จัดการทีม 8.1', 'inhouse', false),
        ('${ROLE_FINANCE}', '${ORG_ID}', 'การเงิน 8.1', 'system', false),
        ('${ROLE_AGENT}', '${ORG_ID}', 'พนักงานติดตามทรัพย์ 8.1', 'inhouse', false)
      ON CONFLICT (id) DO NOTHING
    `)
    await tx.$executeRawUnsafe(`
      INSERT INTO users (id, organization_id, role_id, email, full_name, status) VALUES
        ('${ADMIN_ID}', '${ORG_ID}', '${ROLE_ADMIN}', 'admin81a@test.local', 'ธุรการ 8.1', 'active'),
        ('${MANAGER_ID}', '${ORG_ID}', '${ROLE_MANAGER}', 'manager81a@test.local', 'ผู้จัดการ 8.1', 'active'),
        ('${FINANCE_ID}', '${ORG_ID}', '${ROLE_FINANCE}', 'finance81a@test.local', 'การเงิน 8.1', 'active'),
        ('${AGENT_ID}', '${ORG_ID}', '${ROLE_AGENT}', 'agent81a@test.local', 'พนักงาน 8.1', 'active')
      ON CONFLICT (id) DO NOTHING
    `)
    // DAILY_FLAT = ไม่เรียก Distance Matrix (ไฟล์นี้ไม่ได้ทดสอบสูตรน้ำมัน — อยู่ที่ 8.1 ฝั่งรายจ่าย)
    await tx.$executeRawUnsafe(`
      INSERT INTO compensation_plans
        (id, organization_id, name, side, fuel_mode, fuel_daily_flat_satang, allowance_satang,
         commission_satang, no_success_fee_satang, wht_pct, version, effective_from, is_current, created_by)
      VALUES ('${PLAN_ID}', '${ORG_ID}', 'แผนเหมารายวัน 8.1', 'inhouse', 'DAILY_FLAT', 30000, 20000,
              150000, 50000, 3.00, 1, DATE '2026-01-01', true, '${ADMIN_ID}')
      ON CONFLICT (id) DO NOTHING
    `)
    await tx.$executeRawUnsafe(`
      INSERT INTO teams (id, organization_id, name, side, provinces, status, compensation_plan_id, created_by)
      VALUES ('${TEAM_ID}', '${ORG_ID}', 'ทีมทดสอบ 8.1', 'inhouse', ARRAY['${PROVINCE}'], 'active',
              '${PLAN_ID}', '${ADMIN_ID}')
      ON CONFLICT (id) DO NOTHING
    `)
    await tx.$executeRawUnsafe(`UPDATE users SET team_id = '${TEAM_ID}' WHERE id = '${AGENT_ID}'`)
    // SUCCESS_FEE 10% ของมูลหนี้ (`22` §6.5) — เก็บค่าบริการเมื่อปิดสำเร็จเท่านั้น
    await tx.$executeRawUnsafe(`
      INSERT INTO service_fee_templates
        (id, organization_id, name, model, base_satang, rate_pct, basis, charge_on_fail, version, is_current, created_by)
      VALUES ('${TEMPLATE_ID}', '${ORG_ID}', 'เทมเพลตสำเร็จ 8.1', 'SUCCESS_FEE', 0, 10.00, 'debt_amount', false,
              1, true, '${ADMIN_ID}')
      ON CONFLICT (id) DO NOTHING
    `)
    await tx.$executeRawUnsafe(`
      INSERT INTO vat_rate_history (organization_id, rate_pct, effective_from, effective_to, created_by)
      VALUES ('${ORG_ID}', 7.00, '2020-01-01', NULL, '${ADMIN_ID}')
      ON CONFLICT DO NOTHING
    `)
    await tx.$executeRawUnsafe(`
      INSERT INTO approval_matrices
        (id, organization_id, condition, condition_threshold_satang, approval_flow,
         enforce_segregation_of_duties, created_by)
      VALUES ('${MATRIX_ID}', '${ORG_ID}', 'สายอนุมัติมาตรฐาน 8.1', NULL,
              ARRAY['ผู้จัดการทีมติดตามทรัพย์', 'การเงิน'], true, '${ADMIN_ID}')
      ON CONFLICT (id) DO NOTHING
    `)
    await tx.$executeRawUnsafe(`
      INSERT INTO finance_policy_settings (organization_id, require_payee_id_document)
      VALUES ('${ORG_ID}', false) ON CONFLICT (organization_id) DO NOTHING
    `)
    await tx.$executeRawUnsafe(`
      INSERT INTO payee_profiles (id, organization_id, user_id, payee_type, bank_name, account_name,
                                  account_number, national_id, is_verified, created_by)
      VALUES ('${PAYEE_ID}', '${ORG_ID}', '${AGENT_ID}', 'individual', 'ธนาคารกสิกรไทย', 'พนักงาน 8.1',
              '1112223330', '1112223334445', true, '${ADMIN_ID}')
      ON CONFLICT (id) DO NOTHING
    `)
    await tx.$executeRawUnsafe(`
      INSERT INTO bank_accounts (id, organization_id, bank_name, account_name, account_number, usage,
                                 auto_match_tolerance_days, created_by)
      VALUES ('${BANK_ACCOUNT_ID}', '${ORG_ID}', 'ธนาคารกสิกรไทย', 'บริษัททดสอบ 8.1', '8881112220', 'both', 7,
              '${ADMIN_ID}')
      ON CONFLICT (id) DO NOTHING
    `)

    // ผู้สมัคร auto-match ที่ค้างจากรันก่อน (ยอดเท่ากันเป๊ะ) จะทำให้รอบนี้กลายเป็น `ambiguous`
    await tx.$executeRawUnsafe(`DELETE FROM bank_transaction_allocations WHERE organization_id = '${ORG_ID}'`)
    await tx.$executeRawUnsafe(`DELETE FROM bank_transactions WHERE organization_id = '${ORG_ID}'`)
    await tx.$executeRawUnsafe(`
      UPDATE billing_batches SET status = 'paid'
       WHERE organization_id = '${ORG_ID}' AND status IN ('draft', 'sent', 'partially_paid')
    `)

    // บริษัทไฟแนนซ์ใหม่ทุกรัน — ใบกำกับภาษีของรันก่อนลบไม่ได้ (`02` §13)
    const company = await tx.$queryRawUnsafe<{ id: string }[]>(`
      INSERT INTO finance_companies (organization_id, name, short_name, tax_id, address, vat_mode,
                                     payment_due_days, service_fee_template_id, created_by)
      VALUES ('${ORG_ID}', 'ไฟแนนซ์ E2E (${RUN})', 'E81', '${RUN_TAX_ID}', '2 ถนนสีลม กรุงเทพฯ 10500',
              'exclude_vat', 30, '${TEMPLATE_ID}', '${ADMIN_ID}')
      RETURNING id
    `)
    companyId = company[0]?.id ?? ''
  })

  afterAll(async () => {
    await client?.$disconnect()
  })

  it('เดินครบทั้ง 4 ขั้นของ `29` §6.1 — ยอดถูกตาม `22` §6.5/§6.8 และเอกสารต่อกันครบสาย', async () => {
    // ── ขั้น 0: รับเคสเข้าระบบ (ไฟล์ 38) ──────────────────────────────────
    const caseRef = `E2E81A-${RUN}`
    const created = await cases.createCase(
      {
        caseRef,
        financeCompanyId: companyId,
        sourceChannel: 'manual',
        debtorName: 'สมชาย ทดสอบรายรับ',
        debtorNationality: 'TH',
        debtorNationalId: '1234567890123',
        debtorPhoneMobile: '0812345678',
        addressCurrent: { detail: '99/1 หมู่ 2', province: PROVINCE, district: 'เมือง' },
        addressIdCard: { detail: '99/1 หมู่ 2', province: PROVINCE, district: 'เมือง' },
        assetType: 'smartphone',
        assetBrandModel: 'iPhone 15 สีดำ',
        assetImeiSerial: `35581${RUN}`.slice(0, 15).padEnd(15, '0'),
        outstandingDebtSatang: DEBT_SATANG,
      },
      ctx(admin),
    )
    const caseId = created.id
    for (const slot of ['contract_doc', 'national_id_doc', 'product_photo'] as const) {
      await cases.addCaseDocument(
        admin,
        caseId,
        {
          documentType: slot,
          fileUrl: `https://test.local/${slot}.pdf`,
          fileHash: 'a'.repeat(64),
          originalName: `${slot}.pdf`,
          mimeType: 'application/pdf',
          sizeBytes: 1024,
        },
        ctx(admin),
      )
    }

    await caseStatus.changeCaseStatus(admin, caseId, { action: 'review' }, ctx(admin))
    const accepted = await caseStatus.changeCaseStatus(
      admin,
      caseId,
      { action: 'accept', teamId: TEAM_ID },
      ctx(admin),
    )
    expect(accepted.case.status).toBe('approved')

    // จุดเชื่อม `29` §7 (Case → Revenue): ค่าบริการถูก **snapshot ตอน approved** (`10` §9.2)
    const snapshot = await db().case.findUniqueOrThrow({
      where: { id: caseId },
      select: {
        serviceFeeTemplateId: true,
        serviceFeeModelSnapshot: true,
        serviceFeeRatePct: true,
        serviceFeeBasisSnapshot: true,
      },
    })
    expect(snapshot.serviceFeeTemplateId).toBe(TEMPLATE_ID)
    expect(snapshot.serviceFeeModelSnapshot).toBe('SUCCESS_FEE')
    expect(snapshot.serviceFeeRatePct?.toNumber()).toBe(10)
    expect(snapshot.serviceFeeBasisSnapshot).toBe('debt_amount')

    // ── ขั้น 1: ภาคสนามปิดงานสำเร็จ (ไฟล์ 40/41) ──────────────────────────
    await assignments.assignCase(manager, caseId, { agentId: AGENT_ID }, ctx(manager))
    await field.acceptFieldCase(agent, caseId, ctx(agent))
    await field.scheduleFieldCase(agent, caseId, { scheduleDate: new Date('2026-09-01T00:00:00.000Z') }, ctx(agent))
    await field.saveCloseDraft(
      agent,
      caseId,
      {
        outcome: null,
        photos: [],
        videos: [],
        productPhotos: [],
        travelOrigin: { latitude: 18.58, longitude: 99.0, source: 'gps_auto' },
      },
      ctx(agent),
    )
    await field.recordCheckin(agent, caseId, { latitude: 18.5801, longitude: 99.0031, checkinType: 'address' }, ctx(agent))
    await field.closeFieldCase(
      agent,
      caseId,
      { outcome: 'closed_success', photos: ['p1.jpg'], videos: ['v1.mp4'], productPhotos: ['pp1.jpg'] },
      ctx(agent),
    )

    // ปิดสำเร็จ = เครื่องเข้าคลังรอรับ + รายการเบิกถูกล็อกไว้ก่อน (`44` §6.1 · `19` §6.1)
    const asset = await db().asset.findFirstOrThrow({ where: { caseId } })
    expect(asset.assetStatus).toBe('pending_intake')
    const lockedExpenses = await db().expense.findMany({ where: { caseId }, select: { id: true, status: true } })
    expect(lockedExpenses.length).toBeGreaterThan(0)
    expect(lockedExpenses.every((row) => row.status === 'pending_warehouse_confirm')).toBe(true)
    expect(await db().revenue.count({ where: { caseId } })).toBe(0)

    // ── ขั้น 1 (ต่อ): คลังรับเข้า → จัดล็อต → ยืนยันส่งมอบ (ไฟล์ 44) ────────
    await warehouse.intakeAsset(
      admin,
      asset.id,
      {
        imeiActual: asset.imeiContract,
        serialActual: null,
        condition: 'normal',
        conditionNote: null,
        photos: ['front.jpg'],
      },
      ctx(admin),
    )
    const lot = await warehouse.createLot(
      admin,
      {
        companyId,
        assetIds: [asset.id],
        type: 'finance_pickup',
        scheduledAt: '2026-09-10T03:00:00.000Z',
        contactPerson: 'คุณวิภา ฝ่ายติดตามทรัพย์',
        deliveryAddr: null,
        trackingNo: null,
        note: null,
      },
      ctx(admin),
    )
    const confirmed = await warehouse.confirmLot(
      admin,
      lot.id,
      { deliveredAt: null, signedDocUrl: 'https://test.local/signed.pdf', deliveryProofUrl: null },
      ctx(admin),
    )
    expect(confirmed.lot.status).toBe('confirmed')
    // ล็อต confirmed ปลดล็อก expense แต่ยังไม่อนุมัติ ⇒ **Revenue ยังไม่เกิด** (`19` §6.1)
    expect(confirmed.revenueIdsCreated).toEqual([])
    expect(await db().revenue.count({ where: { caseId } })).toBe(0)

    // ── ขั้น 1 (จบ): อนุมัติรายการเบิกครบสาย ⇒ Revenue เกิดครั้งเดียว ──────
    const pending = await db().expense.findMany({ where: { caseId }, select: { id: true } })
    let revenueCreated = 0
    for (const row of pending) {
      await approvals.approveCompensationExpense(ctx(manager), row.id, {})
      const finished = await approvals.approveCompensationExpense(ctx(finance), row.id, { step: 2 })
      expect(finished.expense.status).toBe('approved')
      revenueCreated += finished.revenueEligibleCaseIds.length
    }
    expect(revenueCreated).toBe(1)

    const revenueRow = await db().revenue.findFirstOrThrow({ where: { caseId } })
    expect(revenueRow.grossSatang).toBe(GROSS_SATANG)
    expect(revenueRow.vatSatang).toBe(VAT_SATANG)
    expect(revenueRow.totalSatang).toBe(TOTAL_SATANG)
    expect(revenueRow.vatRatePctUsed.toNumber()).toBe(7)
    expect(revenueRow.feeModelSnapshot).toBe('SUCCESS_FEE')
    expect(revenueRow.status).toBe('ready_for_billing')

    // ── ขั้น 2: รอบตัดบิล (ไฟล์ 19) ───────────────────────────────────────
    const cutoffDate = revenueRow.revenueDate
    const batch = await revenue.createBillingBatch(revenueCtx(finance, 'วางบิลรอบทดสอบ E2E'), {
      companyId,
      cutoffDate,
      cycleId: null,
      reason: 'วางบิลรอบทดสอบ E2E',
    })
    expect(batch.status).toBe('draft')
    expect(batch.revenueCount).toBe(1)
    expect(batch.totalSatang).toBe(TOTAL_SATANG)
    expect(batch.revenues.every((row) => row.status === 'billed')).toBe(true)

    // ── ขั้น 3: ส่งบิล ⇒ รายการขาย 1:1 ⇒ ใบกำกับภาษี (ไฟล์ 31) ────────────
    const sent = await revenue.sendBillingBatch(revenueCtx(finance, 'ส่งใบวางบิลให้ไฟแนนซ์'), batch.id, {
      reason: 'ส่งใบวางบิลให้ไฟแนนซ์',
    })
    expect(sent.status).toBe('sent')

    const salesRecords = await db().salesRecord.findMany({ where: { billingBatchId: batch.id } })
    expect(salesRecords).toHaveLength(1)
    expect(salesRecords[0]?.totalBeforeVatSatang).toBe(GROSS_SATANG)
    expect(salesRecords[0]?.vatSatang).toBe(VAT_SATANG)
    expect(salesRecords[0]?.totalSatang).toBe(TOTAL_SATANG)

    const invoice = await sales.issueTaxInvoice(ctx(finance), { salesRecordId: salesRecords[0]?.id ?? '' })
    expect(invoice.status).toBe('active')
    expect(invoice.invoiceNumber).toBe(`${INVOICE_PREFIX}-0001`)
    expect(invoice.totalSatang).toBe(TOTAL_SATANG)

    // จุดเชื่อม `29` §7 (Billing → Accounting): เลขที่ **เดินหน้าอย่างเดียว ห้าม recycle**
    // ยกเลิกใบ 0001 แล้วออกใหม่ ⇒ ต้องได้ 0002 (`31` §9.1 · ใบที่ยกเลิกยังอยู่ในสารบบ)
    const cancelled = await sales.cancelTaxInvoice(ctx(finance), invoice.id, {
      reason: 'พิมพ์ที่อยู่ผู้ซื้อผิด ต้องออกใบใหม่',
    })
    expect(cancelled.status).toBe('cancelled')
    const reissued = await sales.issueTaxInvoice(ctx(finance), { salesRecordId: salesRecords[0]?.id ?? '' })
    expect(reissued.invoiceNumber).toBe(`${INVOICE_PREFIX}-0002`)
    expect(reissued.status).toBe('active')
    expect(reissued.totalSatang).toBe(TOTAL_SATANG)

    // ── ขั้น 4: เงินเข้า ⇒ auto-match ⇒ ใบเงินรับ ⇒ บิล paid (ไฟล์ 35/31) ──
    const statementDate = beDate(new Date(Date.now() + 24 * 60 * 60 * 1000))
    const imported = await recon.importStatement(ctx(finance), {
      bankAccountId: BANK_ACCOUNT_ID,
      fileName: `statement-${RUN}.csv`,
      csv: [
        'วันที่,รายละเอียด,เลขที่อ้างอิง,เงินเข้า,เงินออก',
        `${statementDate},โอนเข้าจากไฟแนนซ์ E2E,TRX-${RUN},"${bahtText(TOTAL_SATANG)}",`,
      ].join('\n'),
    })
    expect(imported.imported).toBe(1)
    expect(imported.autoMatched).toBe(1)

    const transaction = await db().bankTransaction.findFirstOrThrow({
      // schema ไม่มีคอลัมน์ `reference` แยก — เลขอ้างอิงธนาคารถูกรวมไว้ใน `description`
      where: { organizationId: ORG_ID, description: { contains: `TRX-${RUN}` } },
    })
    expect(transaction.matchStatus).toBe('auto_matched')
    expect(transaction.matchedBillingId).toBe(batch.id)

    const receipts = await db().cashReceipt.findMany({ where: { billingBatchId: batch.id } })
    expect(receipts).toHaveLength(1)
    expect(receipts[0]?.amountSatang).toBe(TOTAL_SATANG)

    const paid = await db().billingBatch.findUniqueOrThrow({ where: { id: batch.id } })
    expect(paid.status).toBe('paid')
    expect(paid.receivedSatang).toBe(TOTAL_SATANG)
    expect((await revenue.getArAging(finance, {})).totalOutstandingSatang).toBe(0)
  })
})
