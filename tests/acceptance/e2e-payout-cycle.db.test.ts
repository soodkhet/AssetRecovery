import { PrismaPg } from '@prisma/adapter-pg'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import type { SessionUser } from '@/lib/auth/types'
import { PrismaClient } from '@/lib/generated/prisma/client'

/**
 * **Phase 8.1 — E2E Acceptance ฝั่งรายจ่าย**
 *
 * - `29` §6.2 — เคส `closed_fail` → ค่าตอบแทน → อนุมัติครบสาย → รอบจ่ายเงิน → ไฟล์โอน → บัญชี + WHT
 * - `29` §6.3 — QC ตีกลับก่อน expense อนุมัติ ⇒ ไม่มี Revenue ให้ต้องแก้ย้อนหลัง แล้ว resubmit
 *   ⇒ รายการเดิม `superseded` + รายการใหม่แทน ⇒ Revenue เกิด**ครั้งเดียว**ตอนอนุมัติรอบใหม่
 * - `29` §18 (Open Item) — เงินทดรองครบ 5 สถานะ `pending_approval/approved/overdue/cleared/rejected`
 *
 * จุดเชื่อมของ Integration Checklist (`29` §7) ที่ไฟล์นี้ครอบ:
 *  Case → Expense · Expense → Compensation Approval · Expense → Payout · Payout → Accounting (WHT)
 *
 * เดินผ่าน **service จริงทุกก้าว** — ห้าม insert ข้ามขั้นเพื่อให้ผ่าน
 * ⚠️ ต้องตั้ง `DATABASE_URL = TEST_DATABASE_URL` **ก่อน** import service (กับดัก 2026-08-14)
 */

const storage = new Map<string, Uint8Array>()

vi.mock('@/lib/payout/payment-file-storage', async () => {
  const actual = await vi.importActual<typeof import('@/lib/payout/payment-file-storage')>(
    '@/lib/payout/payment-file-storage',
  )
  return {
    ...actual,
    uploadPaymentFile: async (input: { path: string; bytes: Uint8Array }) => {
      if (storage.has(input.path)) throw new Error(`ไฟล์ ${input.path} มีอยู่แล้ว (ห้าม overwrite)`)
      storage.set(input.path, input.bytes)
    },
    downloadPaymentFile: async (path: string) => {
      const bytes = storage.get(path)
      if (bytes === undefined) throw new Error(`ไม่พบไฟล์ ${path}`)
      return bytes
    },
  }
})

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
  console.warn('[e2e-payout-cycle.db.test] ข้ามเทสต์ระดับ DB — ไม่มี TEST_DATABASE_URL (ดู .env.example)')
}

const ORG_ID = '00000000-0000-4000-8000-0000000081b0'
const ROLE_ADMIN = '00000000-0000-4000-8000-0000000081b1'
const ROLE_MANAGER = '00000000-0000-4000-8000-0000000081b2'
const ROLE_FINANCE = '00000000-0000-4000-8000-0000000081b3'
const ROLE_AGENT = '00000000-0000-4000-8000-0000000081b4'
const ADMIN_ID = '00000000-0000-4000-8000-0000000081b5'
const MANAGER_ID = '00000000-0000-4000-8000-0000000081b6'
const FINANCE_ID = '00000000-0000-4000-8000-0000000081b7'
const AGENT_ID = '00000000-0000-4000-8000-0000000081b8'
const TEAM_ID = '00000000-0000-4000-8000-0000000081b9'
const PLAN_ID = '00000000-0000-4000-8000-0000000081ba'
const TEMPLATE_ID = '00000000-0000-4000-8000-0000000081bb'
const BANK_ACCOUNT_ID = '00000000-0000-4000-8000-0000000081bc'
const MATRIX_ID = '00000000-0000-4000-8000-0000000081bd'
const PAYEE_ID = '00000000-0000-4000-8000-0000000081be'
const TAX_PROFILE_ID = '00000000-0000-4000-8000-0000000081bf'
const COMPANY_ID = '00000000-0000-4000-8000-0000000081c0'
const FORMAT_ID = '00000000-0000-4000-8000-0000000081c1'

const PROVINCE = 'เชียงใหม่'
const RUN = `${process.pid}${Date.now() % 100_000}`

/**
 * แผนค่าตอบแทน: น้ำมันเหมาวันละ 1,500 บาท + เบี้ยเลี้ยงวันละ 500 บาท
 * ⇒ พิสูจน์ว่าเกณฑ์ขั้นต่ำ WHT 1,000 บาท คิด**ต่อรายการ** (`22` §6.9) — น้ำมันถูกหัก เบี้ยเลี้ยงไม่ถูกหัก
 */
const FUEL_SATANG = 150_000
const ALLOWANCE_SATANG = 50_000
/** Payee-level 3% ชนะ Plan-level 5% เสมอ (`18` §6.3) */
const PAYEE_WHT_PCT = 3
const FUEL_WHT_SATANG = 4_500

let client: PrismaClient | null = null
let assignments: typeof import('@/lib/assignments/queries')
let field: typeof import('@/lib/field/queries')
let warehouse: typeof import('@/lib/warehouse/queries')
let approvals: typeof import('@/lib/compensation/approval-queries')
let payout: typeof import('@/lib/payout/queries')
let expenses: typeof import('@/lib/expenses/queries')
let wht: typeof import('@/lib/wht/queries')
let advances: typeof import('@/lib/advances/queries')
let overdueJob: typeof import('@/lib/advances/overdue-job')
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

const agent = sessionUser({ id: AGENT_ID, capabilities: { request_advance: 'manage' } })
const manager = sessionUser({
  id: MANAGER_ID,
  roleId: ROLE_MANAGER,
  roleName: 'ผู้จัดการทีมติดตามทรัพย์',
  teamId: null,
  capabilities: { approve_expense_manager: 'manage', approve_case: 'manage', assign_case: 'manage' },
  scope: { kind: 'team', teamIds: [TEAM_ID], companyId: null, userId: MANAGER_ID },
})
const finance = sessionUser({
  id: FINANCE_ID,
  roleId: ROLE_FINANCE,
  roleName: 'การเงิน',
  roleGroup: 'system',
  teamId: null,
  capabilities: {
    approve_expense_finance: 'manage',
    manage_payout_batch: 'manage',
    generate_payment_file: 'manage',
    manage_sales_expenses: 'manage',
    approve_advance: 'manage',
  },
  scope: { kind: 'global', teamIds: [], companyId: null, userId: FINANCE_ID },
})
const admin = sessionUser({
  id: ADMIN_ID,
  roleId: ROLE_ADMIN,
  roleName: 'ธุรการ',
  roleGroup: 'system',
  teamId: null,
  capabilities: { record_admin_data: 'manage', approve_case: 'manage', manage_warehouse: 'manage' },
  scope: { kind: 'global', teamIds: [], companyId: null, userId: ADMIN_ID },
})

const ctx = (actor: SessionUser) => ({ actor, meta })

function codeOf(error: unknown): string {
  return (error as { code?: string }).code ?? String(error)
}

async function expectCode(run: () => Promise<unknown>, code: string): Promise<void> {
  await expect(run()).rejects.toSatisfy((error: unknown) => codeOf(error) === code, `ต้องได้ error code ${code}`)
}

/**
 * **นาฬิกาของเทสต์ถูกตรึงไว้** ที่ `01:30 น. วันที่ 16/08/2569 เวลาไทย` (= `2026-08-15T18:30:00Z`)
 *
 * เหตุผลที่ต้องตรึง และตรึงไว้ตรงจุดนี้ (บั๊ก CI 2026-08-16 — ห้ามย้ายออกนอกช่วงนี้):
 * ช่วง **00:00–07:00 น. เวลาไทย** คือช่วงเดียวที่ "วันไทย" เดินไปก่อน "วัน UTC" แล้ว (16/08 ไทย
 * ยังเป็น 15/08 UTC) — ระบบเขียน `expense_date` ด้วยวัน**ไทย** (`bangkokBusinessDate()` ตาม Rule 01)
 * ⇒ fixture ที่คิดวันตัดรอบจากวัน **UTC** จะได้ 15/08 แล้วกรองรายการของวันที่ 16/08 หลุดทั้งหมด
 * จนได้ `NO_ITEMS_TO_PAY` — เทสต์เดิมใช้ `new Date()` จึงเขียว 17 ชั่วโมงและแดง 7 ชั่วโมงต่อวัน
 * (CI รอบ `ea3cc5a` รัน 02:19 น. เวลาไทย → แดง 2 เคส)
 *
 * ตรึงเวลาไว้ในช่วงนี้ = ทุกเครื่องทุกเวลารันแล้วได้ผลเดียวกัน **และ**ทดสอบขอบวันของจริงทุกครั้ง
 * (ตรึงนอกช่วงนี้เมื่อไร เทสต์จะเขียวโดยไม่ได้พิสูจน์อะไรอีกเลย — มียาม `assertClockPinned()` กันไว้)
 */
const FROZEN_NOW = new Date('2026-08-15T18:30:00.000Z')

/**
 * วันตัดรอบ = วัน**ไทย**ของ `FROZEN_NOW` แบบ date-only เที่ยงคืน **UTC** — ฐานเดียวกับที่
 * `dateOnlySchema()` ส่งเข้ามาจาก API จริง และเดียวกับที่ระบบเขียนคอลัมน์ `DATE` (`lib/api/validation.ts`)
 */
const CUTOFF_DATE = new Date('2026-08-16T00:00:00.000Z')

/** ยามของ fixture เอง — เวลาที่ตรึงต้องอยู่ในช่วงที่วันไทยกับวัน UTC ไม่ตรงกันจริง ๆ */
function assertClockPinned(): void {
  const utcDay = FROZEN_NOW.toISOString().slice(0, 10)
  const bangkokDay = new Date(FROZEN_NOW.getTime() + 7 * 60 * 60 * 1000).toISOString().slice(0, 10)
  if (utcDay === bangkokDay) {
    throw new Error(
      `FROZEN_NOW ต้องอยู่ในช่วง 00:00–07:00 น. เวลาไทย (วันไทย ${bangkokDay} ต้องต่างจากวัน UTC ${utcDay}) — ` +
        'ไม่งั้นเทสต์นี้เลิกพิสูจน์ขอบวันตัดรอบ ดูหมายเหตุที่ FROZEN_NOW',
    )
  }
  if (CUTOFF_DATE.toISOString() !== `${bangkokDay}T00:00:00.000Z`) {
    throw new Error(`CUTOFF_DATE ต้องเป็นเที่ยงคืน UTC ของวันไทยที่ตรึงไว้ (${bangkokDay})`)
  }
}

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

let caseSeq = 0

/** เคสที่ผ่าน `approved` แล้ว (snapshot ค่าบริการครบ) — จุดตั้งต้นของงานภาคสนาม */
async function seedApprovedCase(): Promise<string> {
  caseSeq += 1
  const caseRef = `E2E81B-${caseSeq}-${RUN}`
  const imei = `35582${RUN}${caseSeq}`.slice(0, 15).padEnd(15, '0')
  const rows = await db().$queryRawUnsafe<{ id: string }[]>(`
    INSERT INTO cases (
      organization_id, case_ref, case_ref_normalized, company_id, source, status, created_by,
      debtor_name, addr_province, addr_district, asset_kind, asset_description, imei,
      debt_amount_satang, assigned_team_id,
      service_fee_template_id, service_fee_model_snapshot, service_fee_base_satang, service_fee_rate_pct,
      service_fee_basis_snapshot, service_fee_charge_on_fail
    ) VALUES (
      '${ORG_ID}', $$${caseRef}$$, $$${caseRef}$$, '${COMPANY_ID}', 'manual', 'approved', '${ADMIN_ID}',
      'ลูกหนี้ ${caseSeq}', '${PROVINCE}', 'เมือง', 'smartphone', 'iPhone 15', '${imei}',
      1000000, '${TEAM_ID}',
      '${TEMPLATE_ID}', 'SUCCESS_FEE', 0, 10.00, 'debt_amount', false
    ) RETURNING id
  `)
  return rows[0]?.id ?? ''
}

/** เดินงานภาคสนามจนถึงก่อนกดปิดงาน (รับงาน → จัดวัน → ต้นทาง → เช็คอิน) */
async function driveFieldWork(caseId: string): Promise<void> {
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
  await field.recordCheckin(agent, caseId, { latitude: 18.58, longitude: 99.0, checkinType: 'address' }, ctx(agent))
}

/** อนุมัติรายการเบิกครบทั้งสาย (ผู้จัดการ → การเงิน) — คืนจำนวนเคสที่เข้าเงื่อนไข Revenue */
async function approveAllSteps(expenseIds: readonly string[]): Promise<number> {
  let eligible = 0
  for (const id of expenseIds) {
    await approvals.approveCompensationExpense(ctx(manager), id, {})
    const done = await approvals.approveCompensationExpense(ctx(finance), id, { step: 2 })
    expect(done.expense.status).toBe('approved')
    eligible += done.revenueEligibleCaseIds.length
  }
  return eligible
}

async function cleanup(): Promise<void> {
  const tx = db()
  await tx.$executeRawUnsafe(`ALTER TABLE handover_lots DISABLE TRIGGER trg_handover_lots_confirmed_no_delete`)
  // ใบ 50 ทวิ ลบไม่ได้ด้วย trigger (`02` §13 — เลขที่ห้ามขาดช่วง) — ปิดเฉพาะตอนล้างข้อมูลเทสต์
  await tx.$executeRawUnsafe(`ALTER TABLE wht_certificates DISABLE TRIGGER trg_wht_certificates_no_delete`)
  try {
    // ⚠️ ต้องล้างรายการเดินบัญชี **ก่อน** รอบจ่ายเงิน — FK `matched_payout_id` เป็น ON DELETE SET NULL
    //    การลบรอบจ่ายทิ้งก่อนจึงทำให้แถวที่ `auto_matched` ชน CHECK `bank_tx_status_fk_shape`
    await tx.$executeRawUnsafe(`DELETE FROM bank_transaction_allocations WHERE organization_id = '${ORG_ID}'`)
    await tx.$executeRawUnsafe(`DELETE FROM cash_receipts WHERE organization_id = '${ORG_ID}'`)
    await tx.$executeRawUnsafe(`DELETE FROM bank_transactions WHERE organization_id = '${ORG_ID}'`)
    await tx.$executeRawUnsafe(`DELETE FROM wht_certificates WHERE organization_id = '${ORG_ID}'`)
    await tx.$executeRawUnsafe(`DELETE FROM wht_filing_summaries WHERE organization_id = '${ORG_ID}'`)
    await tx.$executeRawUnsafe(`DELETE FROM expense_records WHERE organization_id = '${ORG_ID}'`)
    await tx.$executeRawUnsafe(`UPDATE expenses SET payout_batch_item_id = NULL WHERE organization_id = '${ORG_ID}'`)
    await tx.$executeRawUnsafe(`UPDATE advances SET payout_batch_item_id = NULL WHERE organization_id = '${ORG_ID}'`)
    await tx.$executeRawUnsafe(`DELETE FROM payout_batch_items WHERE organization_id = '${ORG_ID}'`)
    await tx.$executeRawUnsafe(`DELETE FROM payout_batches WHERE organization_id = '${ORG_ID}'`)
    await tx.$executeRawUnsafe(`DELETE FROM advances WHERE organization_id = '${ORG_ID}'`)
    await tx.$executeRawUnsafe(`DELETE FROM revenues WHERE organization_id = '${ORG_ID}'`)
    await tx.$executeRawUnsafe(`UPDATE expenses SET superseded_by_expense_id = NULL WHERE organization_id = '${ORG_ID}'`)
    await tx.$executeRawUnsafe(`DELETE FROM expenses WHERE organization_id = '${ORG_ID}'`)
    await tx.$executeRawUnsafe(`DELETE FROM assets WHERE organization_id = '${ORG_ID}'`)
    await tx.$executeRawUnsafe(`DELETE FROM handover_lots WHERE organization_id = '${ORG_ID}'`)
    await tx.$executeRawUnsafe(`DELETE FROM jobs WHERE organization_id = '${ORG_ID}'`)
    await tx.$executeRawUnsafe(`DELETE FROM notifications WHERE organization_id = '${ORG_ID}'`)
    await tx.$executeRawUnsafe(`DELETE FROM close_case_drafts WHERE organization_id = '${ORG_ID}'`)
    await tx.$executeRawUnsafe(`DELETE FROM travel_origins WHERE organization_id = '${ORG_ID}'`)
    await tx.$executeRawUnsafe(`DELETE FROM check_ins WHERE organization_id = '${ORG_ID}'`)
    await tx.$executeRawUnsafe(`DELETE FROM case_evidences WHERE organization_id = '${ORG_ID}'`)
    await tx.$executeRawUnsafe(`DELETE FROM case_assignments WHERE organization_id = '${ORG_ID}'`)
    await tx.$executeRawUnsafe(`DELETE FROM cases WHERE organization_id = '${ORG_ID}'`)
    // เทสต์ยามผู้รับเงินสลับสถานะ verified ⇒ คืนค่าเริ่มต้นทุกครั้ง ไม่งั้นเทสต์ถัดไปตกโดยไม่รู้สาเหตุ
    await tx.$executeRawUnsafe(`UPDATE payee_profiles SET is_verified = true WHERE id = '${PAYEE_ID}'`)
    await tx.$executeRawUnsafe(`DELETE FROM accounting_periods WHERE organization_id = '${ORG_ID}'`)
  } finally {
    await tx.$executeRawUnsafe(`ALTER TABLE wht_certificates ENABLE TRIGGER trg_wht_certificates_no_delete`)
    await tx.$executeRawUnsafe(`ALTER TABLE handover_lots ENABLE TRIGGER trg_handover_lots_confirmed_no_delete`)
  }
  storage.clear()
}

beforeAll(async () => {
  if (!url) return
  assertClockPinned()
  // ตรึงเฉพาะ `Date` — ห้ามตรึง timer จริง (`setTimeout`/`setInterval`) ไม่งั้น pool ของ pg ค้าง
  // `shouldAdvanceTime` ให้เวลายังเดินหน้าตามจริง ⇒ ลำดับเหตุการณ์ในรอบเดียวกันยังเรียงถูก
  vi.useFakeTimers({ toFake: ['Date'], shouldAdvanceTime: true })
  vi.setSystemTime(FROZEN_NOW)
  process.env.DATABASE_URL = url
  assignments = await import('@/lib/assignments/queries')
  field = await import('@/lib/field/queries')
  warehouse = await import('@/lib/warehouse/queries')
  approvals = await import('@/lib/compensation/approval-queries')
  payout = await import('@/lib/payout/queries')
  expenses = await import('@/lib/expenses/queries')
  wht = await import('@/lib/wht/queries')
  advances = await import('@/lib/advances/queries')
  overdueJob = await import('@/lib/advances/overdue-job')
  recon = await import('@/lib/bank-recon/queries')

  const tx = db()
  await tx.$executeRawUnsafe(`
    INSERT INTO organizations (id, name, tax_id, address)
    VALUES ('${ORG_ID}', 'E2E 8.1 รายจ่าย', '9999999998120', 'ที่อยู่ทดสอบ 8.1 ข') ON CONFLICT (id) DO NOTHING
  `)
  await tx.$executeRawUnsafe(`
    INSERT INTO roles (id, organization_id, name, role_group, is_seed) VALUES
      ('${ROLE_ADMIN}', '${ORG_ID}', 'ธุรการ 8.1ข', 'system', false),
      ('${ROLE_MANAGER}', '${ORG_ID}', 'ผู้จัดการทีม 8.1ข', 'inhouse', false),
      ('${ROLE_FINANCE}', '${ORG_ID}', 'การเงิน 8.1ข', 'system', false),
      ('${ROLE_AGENT}', '${ORG_ID}', 'พนักงานติดตามทรัพย์ 8.1ข', 'inhouse', false)
    ON CONFLICT (id) DO NOTHING
  `)
  await tx.$executeRawUnsafe(`
    INSERT INTO users (id, organization_id, role_id, email, full_name, status) VALUES
      ('${ADMIN_ID}', '${ORG_ID}', '${ROLE_ADMIN}', 'admin81b@test.local', 'ธุรการ 8.1ข', 'active'),
      ('${MANAGER_ID}', '${ORG_ID}', '${ROLE_MANAGER}', 'manager81b@test.local', 'ผู้จัดการ 8.1ข', 'active'),
      ('${FINANCE_ID}', '${ORG_ID}', '${ROLE_FINANCE}', 'finance81b@test.local', 'การเงิน 8.1ข', 'active'),
      ('${AGENT_ID}', '${ORG_ID}', '${ROLE_AGENT}', 'agent81b@test.local', 'พนักงาน 8.1ข', 'active')
    ON CONFLICT (id) DO NOTHING
  `)
  await tx.$executeRawUnsafe(`
    INSERT INTO compensation_plans
      (id, organization_id, name, side, fuel_mode, fuel_daily_flat_satang, allowance_satang,
       commission_satang, no_success_fee_satang, wht_pct, version, effective_from, is_current, created_by)
    VALUES ('${PLAN_ID}', '${ORG_ID}', 'แผนเหมารายวัน 8.1ข', 'inhouse', 'DAILY_FLAT', ${FUEL_SATANG},
            ${ALLOWANCE_SATANG}, 150000, 50000, 5.00, 1, DATE '2026-01-01', true, '${ADMIN_ID}')
    ON CONFLICT (id) DO NOTHING
  `)
  await tx.$executeRawUnsafe(`
    INSERT INTO teams (id, organization_id, name, side, provinces, status, compensation_plan_id, created_by)
    VALUES ('${TEAM_ID}', '${ORG_ID}', 'ทีมทดสอบ 8.1ข', 'inhouse', ARRAY['${PROVINCE}'], 'active',
            '${PLAN_ID}', '${ADMIN_ID}')
    ON CONFLICT (id) DO NOTHING
  `)
  await tx.$executeRawUnsafe(`UPDATE users SET team_id = '${TEAM_ID}' WHERE id = '${AGENT_ID}'`)
  await tx.$executeRawUnsafe(`
    INSERT INTO service_fee_templates
      (id, organization_id, name, model, base_satang, rate_pct, basis, charge_on_fail, version, is_current, created_by)
    VALUES ('${TEMPLATE_ID}', '${ORG_ID}', 'เทมเพลต 8.1ข', 'SUCCESS_FEE', 0, 10.00, 'debt_amount', false,
            1, true, '${ADMIN_ID}')
    ON CONFLICT (id) DO NOTHING
  `)
  await tx.$executeRawUnsafe(`
    INSERT INTO finance_companies (id, organization_id, name, short_name, tax_id, address, vat_mode,
                                   payment_due_days, service_fee_template_id, created_by)
    VALUES ('${COMPANY_ID}', '${ORG_ID}', 'ไฟแนนซ์ 8.1ข', 'B81', '0105512810002', '3 ถนนทดสอบ กรุงเทพฯ',
            'exclude_vat', 30, '${TEMPLATE_ID}', '${ADMIN_ID}')
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
    VALUES ('${MATRIX_ID}', '${ORG_ID}', 'สายอนุมัติมาตรฐาน 8.1ข', NULL,
            ARRAY['ผู้จัดการทีมติดตามทรัพย์', 'การเงิน'], true, '${ADMIN_ID}')
    ON CONFLICT (id) DO NOTHING
  `)
  await tx.$executeRawUnsafe(`
    INSERT INTO finance_policy_settings (organization_id, require_payee_id_document,
                                         advance_max_amount_per_request_satang)
    VALUES ('${ORG_ID}', false, 5000000) ON CONFLICT (organization_id) DO NOTHING
  `)
  // Payee-level 3% (ชนะ Plan-level 5%) · เกณฑ์ขั้นต่ำ 1,000 บาท · ฐาน before_vat (`22` §6.9)
  await tx.$executeRawUnsafe(`
    INSERT INTO tax_profiles (id, organization_id, name, wht_pct, wht_basis, wht_min_threshold_satang, created_by)
    VALUES ('${TAX_PROFILE_ID}', '${ORG_ID}', 'บุคคลธรรมดา 3% 8.1ข', ${PAYEE_WHT_PCT}.00, 'before_vat', 100000,
            '${ADMIN_ID}')
    ON CONFLICT (id) DO NOTHING
  `)
  await tx.$executeRawUnsafe(`
    INSERT INTO payee_profiles (id, organization_id, user_id, payee_type, tax_profile_id, bank_name, account_name,
                                account_number, national_id, is_verified, created_by)
    VALUES ('${PAYEE_ID}', '${ORG_ID}', '${AGENT_ID}', 'individual', '${TAX_PROFILE_ID}', 'ธนาคารกรุงเทพ',
            'พนักงาน 8.1ข', '1234567890', '1234512345123', true, '${ADMIN_ID}')
    ON CONFLICT (id) DO NOTHING
  `)
  await tx.$executeRawUnsafe(`
    INSERT INTO bank_accounts (id, organization_id, bank_name, account_name, account_number, usage,
                               auto_match_tolerance_days, created_by)
    VALUES ('${BANK_ACCOUNT_ID}', '${ORG_ID}', 'ธนาคารกรุงเทพ', 'บริษัททดสอบ 8.1ข', '7771112220', 'both', 7,
            '${ADMIN_ID}')
    ON CONFLICT (id) DO NOTHING
  `)
  await tx.$executeRawUnsafe(`
    INSERT INTO bank_file_formats (id, organization_id, bank_name, file_type, encoding, column_mapping,
                                   test_status, created_by)
    VALUES ('${FORMAT_ID}', '${ORG_ID}', 'ธนาคารกรุงเทพ', 'CSV', 'UTF-8',
            'receiving_bank_code,receiving_account_no,receiving_account_name,amount,transfer_date,reference_no',
            'passed', '${ADMIN_ID}')
    ON CONFLICT (id) DO NOTHING
  `)
  await cleanup()
})

afterAll(async () => {
  if (url) await cleanup()
  await client?.$disconnect()
  vi.useRealTimers()
})

beforeEach(async () => {
  if (url) await cleanup()
})

// ════════════════════════════════════════════════════════════════════════════

suite('Phase 8.1 — E2E `29` §6.2: ปิดงานไม่สำเร็จ → ค่าตอบแทน → จ่ายเงิน → บัญชี', () => {
  it('เดินครบ 5 ขั้น — สูตร `22` §6.1–6.4 · WHT ต่อรายการ · idempotency ไฟล์โอน · sync บัญชี', async () => {
    // ── ขั้น 1: ปิดงานไม่สำเร็จ ⇒ ค่าน้ำมัน/เบี้ยเลี้ยงเกิดเอง (`41` §6.6) ──
    const caseId = await seedApprovedCase()
    await driveFieldWork(caseId)
    await field.closeFieldCase(
      agent,
      caseId,
      { outcome: 'closed_fail', photos: ['p1.jpg'], videos: ['v1.mp4'], productPhotos: [] },
      ctx(agent),
    )

    const created = await db().expense.findMany({
      where: { caseId, deletedAt: null },
      select: { id: true, expenseType: true, grossSatang: true, status: true, payeeId: true },
      orderBy: { grossSatang: 'asc' },
    })
    expect(created.map((row) => row.expenseType)).toEqual(['allowance', 'fuel'])
    expect(created.map((row) => row.grossSatang)).toEqual([ALLOWANCE_SATANG, FUEL_SATANG])
    // `closed_fail` ไม่ผ่านคลัง ⇒ เข้าคิวอนุมัติทันที (ไม่ใช่ `pending_warehouse_confirm`)
    expect(created.every((row) => row.status === 'pending_approval')).toBe(true)
    expect(created.every((row) => row.payeeId === PAYEE_ID)).toBe(true)
    expect(await db().asset.count({ where: { caseId } })).toBe(0)

    // ── ขั้น 2: อนุมัติครบสาย (`16` §6.1) ─────────────────────────────────
    // ขั้นเดียวยังไม่พอ — สายมี 2 ขั้น รายการต้องยังไม่ `approved`
    const [first] = created
    const step1 = await approvals.approveCompensationExpense(ctx(manager), first?.id ?? '', {})
    const halfway = await db().expense.findUniqueOrThrow({ where: { id: first?.id ?? '' } })
    // จุดเชื่อม `29` §7 (Expense → Compensation Approval): สถานะกลางทางต้องเป็นค่าใน enum ของ `02` §3
    // ไม่ใช่สถานะแปลกปลอมที่โมดูลอนุมัติคิดเอง (`23` §6.5)
    expect(halfway.status).toBe('pending_finance_approval')
    expect(step1.events).not.toContain('expense.approved')
    expect(step1.revenueEligibleCaseIds).toEqual([])

    await approvals.approveCompensationExpense(ctx(finance), first?.id ?? '', { step: 2 })
    await approveAllSteps(created.slice(1).map((row) => row.id))
    const approved = await db().expense.findMany({ where: { caseId }, select: { status: true } })
    expect(approved.every((row) => row.status === 'approved')).toBe(true)
    // `closed_fail` + SUCCESS_FEE (ไม่เก็บค่าบริการเมื่อไม่สำเร็จ) ⇒ ไม่มีรายได้ (`19` §6.1)
    expect(await db().revenue.count({ where: { caseId } })).toBe(0)

    // ── ขั้น 3: รวมเข้ารอบจ่ายเงิน (`17`) ─────────────────────────────────
    // วันตัดรอบ = วันไทยของนาฬิกาที่ตรึงไว้ (ดู `FROZEN_NOW`) ⇒ ต้องเก็บรายการของวันนี้ครบ
    const cutoffDate = CUTOFF_DATE
    const { batch } = await payout.createPayoutBatch(ctx(finance), {
      side: 'inhouse',
      cutoffDate,
      name: null,
    })
    expect(batch.itemCount).toBe(2)
    expect(batch.grossSatang).toBe(FUEL_SATANG + ALLOWANCE_SATANG)
    // Payee-level ชนะ Plan-level + เกณฑ์ขั้นต่ำคิดต่อรายการ ⇒ หักเฉพาะค่าน้ำมัน
    expect(batch.whtSatang).toBe(FUEL_WHT_SATANG)
    expect(batch.netSatang).toBe(FUEL_SATANG + ALLOWANCE_SATANG - FUEL_WHT_SATANG)

    const items = await db().payoutBatchItem.findMany({
      where: { payoutBatchId: batch.id },
      select: { grossSatang: true, whtSatang: true, whtPctSnapshot: true, taxProfileId: true },
      orderBy: { grossSatang: 'asc' },
    })
    expect(items.map((row) => row.whtSatang)).toEqual([0, FUEL_WHT_SATANG])
    expect(items.every((row) => row.taxProfileId === TAX_PROFILE_ID)).toBe(true)
    expect(items.every((row) => row.whtPctSnapshot?.toNumber() === PAYEE_WHT_PCT)).toBe(true)

    // รายการที่ถูกดึงเข้ารอบแล้วไม่กลับมาเป็นผู้สมัครของรอบถัดไป
    await expectCode(
      () => payout.createPayoutBatch(ctx(finance), { side: 'inhouse', cutoffDate, name: null }),
      'NO_ITEMS_TO_PAY',
    )

    // ── ขั้น 4: ไฟล์โอน + idempotency (`17` §6.3) ─────────────────────────
    const generateInput = {
      bankAccountId: BANK_ACCOUNT_ID,
      bankFileFormatId: FORMAT_ID,
      confirmDuplicate: false,
      reason: 'สร้างไฟล์โอนรอบทดสอบ E2E',
    }
    const firstFile = await payout.generatePaymentFile(ctx(finance), batch.id, generateInput)
    expect(firstFile.result.generated).toBe(true)
    expect(firstFile.result.rowCount).toBe(2)
    expect(firstFile.result.fileHash).toMatch(/^[a-f0-9]{64}$/)

    const withKey = await db().payoutBatch.findUniqueOrThrow({ where: { id: batch.id } })
    expect(withKey.idempotencyKey).not.toBeNull()
    expect(withKey.status).toBe('file_generated')

    // สร้างซ้ำโดยไม่ยืนยัน = เตือน ไม่สร้างไฟล์ใหม่ และ **ห้ามเปลี่ยน idempotency_key**
    const duplicate = await payout.generatePaymentFile(ctx(finance), batch.id, generateInput)
    expect(duplicate.result.generated).toBe(false)
    expect(duplicate.warning?.code).toBe('DUPLICATE_PAYMENT_FILE')
    expect(storage.size).toBe(1)

    const confirmed = await payout.generatePaymentFile(ctx(finance), batch.id, {
      ...generateInput,
      confirmDuplicate: true,
    })
    expect(confirmed.result.generated).toBe(true)
    expect(storage.size).toBe(2)
    const afterRegenerate = await db().payoutBatch.findUniqueOrThrow({ where: { id: batch.id } })
    expect(afterRegenerate.idempotencyKey).toBe(withKey.idempotencyKey)

    // ── ขั้น 5: ปิดรอบ ⇒ บันทึกบัญชี (ไฟล์ 32) + ใบ 50 ทวิ (ไฟล์ 33) ──────
    const done = await payout.completePayoutBatch(ctx(finance), batch.id, {
      reason: 'ธนาคารตัดโอนครบทุกรายการแล้ว',
    })
    expect(done.status).toBe('completed')

    const records = await db().expenseRecord.findMany({ where: { organizationId: ORG_ID } })
    expect(records).toHaveLength(2)
    expect(records.reduce((sum, row) => sum + row.whtSatang, 0)).toBe(FUEL_WHT_SATANG)

    const certificates = await wht.listWhtCertificates(finance, {})
    expect(certificates.items).toHaveLength(1)
    expect(certificates.items[0]?.whtSatang).toBe(FUEL_WHT_SATANG)
    expect(certificates.items[0]?.grossSatang).toBe(FUEL_SATANG)
    expect(certificates.items[0]?.status).toBe('active')

    // เรียก sync ซ้ำ (เช่น job เก็บตก) ต้องไม่สร้างเอกสารซ้ำ
    await expenses.syncExpenseRecordsFromPayout(ctx(finance), batch.id)
    expect(await db().expenseRecord.count({ where: { organizationId: ORG_ID } })).toBe(2)
    expect(await db().whtCertificate.count({ where: { organizationId: ORG_ID } })).toBe(1)
  })
})

// ════════════════════════════════════════════════════════════════════════════

suite('Phase 8.1 — E2E `29` §6.3: QC ตีกลับก่อนรายได้เกิด แล้ว resubmit', () => {
  it('ตีกลับ ⇒ ไม่มีรายได้ให้แก้ย้อนหลัง · resubmit ⇒ รายการเดิม superseded · รายได้เกิดครั้งเดียว', async () => {
    // ── ขั้น 1: ปิดสำเร็จ ⇒ รายการเบิกถูกล็อกรอคลัง · รายได้ยังไม่เกิด ────
    const caseId = await seedApprovedCase()
    await driveFieldWork(caseId)
    await field.closeFieldCase(
      agent,
      caseId,
      { outcome: 'closed_success', photos: ['p1.jpg'], videos: ['v1.mp4'], productPhotos: ['pp1.jpg'] },
      ctx(agent),
    )

    const round1 = await db().expense.findMany({ where: { caseId }, select: { id: true, status: true } })
    expect(round1.length).toBeGreaterThan(0)
    expect(round1.every((row) => row.status === 'pending_warehouse_confirm')).toBe(true)
    expect(await db().revenue.count({ where: { caseId } })).toBe(0)

    // ── ขั้น 2: เจ้าหน้าที่ตีกลับหลักฐาน (`41` §8) ─────────────────────────
    const rejected = await field.rejectFieldEvidence(
      admin,
      caseId,
      { reason: 'รูปสินค้าไม่ชัด ถ่ายใหม่ให้เห็นหมายเลขเครื่อง' },
      ctx(admin),
    )
    expect(rejected.status).toBe('needs_revision')
    // ยังไม่เคยมีรายได้เกิด ⇒ ไม่มีอะไรต้องกลับรายการ (`29` §6.3 ข้อ 2)
    expect(await db().revenue.count({ where: { caseId } })).toBe(0)

    // ── ขั้น 3: แก้หลักฐานแล้วส่งใหม่ ⇒ รอบเดิม superseded (`41` §10.1) ───
    await field.resubmitCloseCase(
      agent,
      caseId,
      { photos: ['p1-new.jpg', 'p2-new.jpg'], videos: ['v1-new.mp4'], productPhotos: ['pp1-new.jpg'] },
      ctx(agent),
    )

    const afterResubmit = await db().expense.findMany({
      where: { caseId },
      select: { id: true, status: true, supersededByExpenseId: true },
    })
    const superseded = afterResubmit.filter((row) => row.status === 'superseded')
    const active = afterResubmit.filter((row) => row.status !== 'superseded')
    expect(superseded.map((row) => row.id).sort()).toEqual(round1.map((row) => row.id).sort())
    expect(superseded.every((row) => row.supersededByExpenseId !== null)).toBe(true)
    expect(active.length).toBeGreaterThan(0)
    expect(active.every((row) => row.status === 'pending_warehouse_confirm')).toBe(true)
    // outcome ล็อกไว้ตามรอบเดิม — ไม่เปลี่ยนเป็นอย่างอื่น
    expect((await db().case.findUniqueOrThrow({ where: { id: caseId } })).outcome).toBe('closed_success')

    // ── ขั้น 4: คลังยืนยัน + อนุมัติรอบใหม่ ⇒ รายได้เกิด "ครั้งแรก" ครั้งเดียว ─
    const asset = await db().asset.findFirstOrThrow({ where: { caseId } })
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
        companyId: COMPANY_ID,
        assetIds: [asset.id],
        type: 'we_deliver',
        scheduledAt: null,
        contactPerson: null,
        deliveryAddr: '99 ถนนทดสอบ กรุงเทพฯ',
        trackingNo: null,
        note: null,
      },
      ctx(admin),
    )
    await warehouse.confirmLot(
      admin,
      lot.id,
      {
        deliveredAt: null,
        signedDocUrl: 'https://test.local/signed.pdf',
        deliveryProofUrl: 'https://test.local/proof.jpg',
      },
      ctx(admin),
    )

    const eligible = await approveAllSteps(active.map((row) => row.id))
    expect(eligible).toBe(1)
    // รายการที่ถูก supersede ไม่ฉุดเกต และไม่ทำให้เกิดรายได้ซ้ำ
    expect(await db().revenue.count({ where: { caseId } })).toBe(1)
  })
})

// ════════════════════════════════════════════════════════════════════════════

suite('Phase 8.1 — E2E เงินทดรอง 5 สถานะ (`29` §18 Open Item · `15` §9.2/§10)', () => {
  const DUE_DATE = new Date('2026-12-31T00:00:00.000Z')
  const AFTER_DUE = new Date('2027-01-15T03:00:00.000Z')

  it('pending_approval → approved → overdue → cleared และเส้น rejected + ห้ามเบิกซ้อน', async () => {
    // pending_approval — พนักงานขอเบิกเอง (ผูก payee ของตัวเองอัตโนมัติ)
    const requested = await advances.createAdvance(ctx(agent), {
      requestedSatang: 300_000,
      purpose: 'ค่าเดินทางลงพื้นที่ต่างจังหวัด 3 วัน',
      dueClearDate: DUE_DATE,
      payeeId: null,
    })
    expect(requested.status).toBe('pending_approval')
    expect(requested.requestedSatang).toBe(300_000)

    // approved — การเงินอนุมัติ (ปรับลดยอดได้ ห้ามเกินยอดที่ขอ)
    const approved = await advances.approveAdvance(ctx(finance), requested.id, {
      approvedSatang: 250_000,
      note: 'อนุมัติตามงบเดินทางจริง',
    })
    expect(approved.status).toBe('approved')
    expect(approved.approvedSatang).toBe(250_000)

    // ห้ามเบิกซ้อน — `approved`/`overdue` = ยังไม่เคลียร์ (`15` §9.2 · partial unique ของ `02` §6)
    await expectCode(
      () =>
        advances.createAdvance(ctx(agent), {
          requestedSatang: 100_000,
          purpose: 'ขอเบิกซ้อนระหว่างรอบเดิมยังค้าง',
          dueClearDate: DUE_DATE,
          payeeId: null,
        }),
      'ADVANCE_PENDING_SETTLEMENT',
    )

    // overdue — background job เท่านั้น (ไม่มีปุ่มให้กด `15` §10) + idempotent
    const marked = await overdueJob.runAdvanceOverdueJob({ organizationId: ORG_ID, now: AFTER_DUE })
    expect(marked.marked).toBe(1)
    expect((await db().advance.findUniqueOrThrow({ where: { id: requested.id } })).status).toBe('overdue')
    expect((await overdueJob.runAdvanceOverdueJob({ organizationId: ORG_ID, now: AFTER_DUE })).marked).toBe(0)

    // cleared — เคลียร์ยอด ยอดคืนมาจาก generated column ของ DB (ห้ามคำนวณเอง)
    const cleared = await advances.settleAdvance(ctx(finance), requested.id, {
      usedSatang: 180_000,
      receiptFileUrl: 'https://test.local/receipt.pdf',
      note: 'คืนเงินสดส่วนที่เหลือแล้ว',
    })
    expect(cleared.status).toBe('cleared')
    expect(cleared.usedSatang).toBe(180_000)
    expect((await db().advance.findUniqueOrThrow({ where: { id: requested.id } })).returnSatang).toBe(70_000)

    // rejected — รายการใหม่ (รอบเดิมเคลียร์แล้วจึงขอได้) ปฏิเสธต้องมีเหตุผลเสมอ
    const second = await advances.createAdvance(ctx(agent), {
      requestedSatang: 120_000,
      purpose: 'ค่าเดินทางรอบถัดไป',
      dueClearDate: DUE_DATE,
      payeeId: null,
    })
    await expectCode(
      () => advances.rejectAdvance(ctx(finance), second.id, { rejectionReason: '   ' }),
      'REJECTION_REASON_REQUIRED',
    )
    const rejectedAdvance = await advances.rejectAdvance(ctx(finance), second.id, {
      rejectionReason: 'ยอดคงเหลือของงวดไม่พอ ให้ขอใหม่เดือนหน้า',
    })
    expect(rejectedAdvance.status).toBe('rejected')

    const all = await advances.listAdvances(finance, { status: 'all', payeeId: PAYEE_ID })
    expect(all.map((row) => row.status).sort()).toEqual(['cleared', 'rejected'])
  })
})

// ════════════════════════════════════════════════════════════════════════════

suite('Phase 8.1 — E2E จุดเชื่อม `29` §7: Expense → Payout (verified) · Bank Statement → Payout completed', () => {
  it('payee ที่ยังไม่ยืนยันบล็อกทั้งรอบ · ยืนยันแล้วเงินออกจาก statement ปิดรอบ + ลงบัญชีให้เอง', async () => {
    const caseId = await seedApprovedCase()
    await driveFieldWork(caseId)
    await field.closeFieldCase(
      agent,
      caseId,
      { outcome: 'closed_fail', photos: ['p1.jpg'], videos: ['v1.mp4'], productPhotos: [] },
      ctx(agent),
    )
    const pending = await db().expense.findMany({ where: { caseId }, select: { id: true } })
    await approveAllSteps(pending.map((row) => row.id))

    // ผู้รับเงินยังไม่ยืนยัน ⇒ **ทั้งรอบ**สร้างไม่ได้ (`17` §10)
    await db().$executeRawUnsafe(`UPDATE payee_profiles SET is_verified = false WHERE id = '${PAYEE_ID}'`)
    const cutoffDate = CUTOFF_DATE
    await expectCode(
      () => payout.createPayoutBatch(ctx(finance), { side: 'inhouse', cutoffDate, name: null }),
      'UNVERIFIED_PAYEE_IN_PAYOUT',
    )
    expect(await db().payoutBatch.count({ where: { organizationId: ORG_ID } })).toBe(0)

    await db().$executeRawUnsafe(`UPDATE payee_profiles SET is_verified = true WHERE id = '${PAYEE_ID}'`)
    const { batch } = await payout.createPayoutBatch(ctx(finance), { side: 'inhouse', cutoffDate, name: null })
    await payout.generatePaymentFile(ctx(finance), batch.id, {
      bankAccountId: BANK_ACCOUNT_ID,
      bankFileFormatId: FORMAT_ID,
      confirmDuplicate: false,
      reason: 'สร้างไฟล์โอนรอบทดสอบ E2E',
    })

    // เงินออกจาก statement (ยอดลบ = ฝั่งจ่าย) ⇒ จับคู่รอบจ่าย ⇒ ปิดรอบ + sync บัญชีให้เอง (`35` §6.2)
    // ธนาคารตัดเงินวันถัดจากวันตัดรอบ — ผูกกับ `CUTOFF_DATE` ไม่ใช่นาฬิกาเครื่อง (fixture ต้อง deterministic)
    const statementDate = beDate(new Date(CUTOFF_DATE.getTime() + 24 * 60 * 60 * 1000))
    const imported = await recon.importStatement(ctx(finance), {
      bankAccountId: BANK_ACCOUNT_ID,
      fileName: `payout-${RUN}.csv`,
      csv: [
        'วันที่,รายละเอียด,เลขที่อ้างอิง,เงินเข้า,เงินออก',
        `${statementDate},โอนค่าตอบแทนทีมงาน,PAYOUT-${RUN},,"${bahtText(batch.netSatang)}"`,
      ].join('\n'),
    })
    expect(imported.imported).toBe(1)
    expect(imported.autoMatched).toBe(1)

    const completed = await db().payoutBatch.findUniqueOrThrow({ where: { id: batch.id } })
    expect(completed.status).toBe('completed')
    expect(await db().expenseRecord.count({ where: { organizationId: ORG_ID } })).toBe(2)
    expect(await db().whtCertificate.count({ where: { organizationId: ORG_ID } })).toBe(1)
  })
})
