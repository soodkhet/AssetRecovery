import { PrismaPg } from '@prisma/adapter-pg'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import type { SessionUser } from '@/lib/auth/types'
import { PrismaClient } from '@/lib/generated/prisma/client'

/**
 * **Phase 8.1 — E2E Acceptance: ปิดงวดบัญชี**
 *
 * - `29` §6.5 — Full Monthly Close: เก็บรายการทั้งเดือน → ตรวจความพร้อม (critical เปิดอยู่ = ไม่ผ่าน)
 *   → แก้ข้อยกเว้น → ส่งสำนักงานบัญชี → Export Pack → ถาม/ตอบ → Executive ปิดงวด
 * - `29` §6.4 — งวด `locked` แก้ตรงไม่ได้ (`PERIOD_LOCKED_DIRECT_EDIT`) ต้องผ่าน Adjustment
 *   ที่ **Executive เท่านั้น**อนุมัติได้ และยอดสุทธิในรายงานขยับโดยไม่แตะ Revenue ต้นฉบับ
 *
 * จุดเชื่อมของ Integration Checklist (`29` §7) ที่ไฟล์นี้ครอบ:
 *  ทุกรายการ → Period Lock · ทุกรายการ → Export (critical บล็อกได้จริง)
 *
 * เดินผ่าน **service จริงทุกก้าว** — รายได้ที่ใช้เป็นเป้าหมาย Adjustment เกิดจากสายงานจริง
 * (`closed_fail` + `charge_on_fail` ⇒ Revenue ไม่ผ่านคลังตาม DEC-006/D6 · `19` §6.1)
 *
 * ⚠️ ต้องตั้ง `DATABASE_URL = TEST_DATABASE_URL` **ก่อน** import service (กับดัก 2026-08-14)
 */

/** ที่เก็บไฟล์จำลองของ bucket `accounting-packs` */
const storage = new Map<string, Uint8Array>()

vi.mock('@/lib/exports/pack-storage', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/exports/pack-storage')>()
  return {
    ...actual,
    uploadPackFile: async (input: { path: string; bytes: Uint8Array }) => {
      // `upsert: false` ของจริง — เขียนทับ path เดิมไม่ได้เด็ดขาด (Rule 09)
      if (storage.has(input.path)) throw new Error(`ไฟล์ซ้ำ: ${input.path}`)
      storage.set(input.path, input.bytes)
    },
    downloadPackFile: async (path: string) => {
      const bytes = storage.get(path)
      if (bytes === undefined) throw new Error(`ไม่พบไฟล์: ${path}`)
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
  console.warn('[e2e-monthly-close.db.test] ข้ามเทสต์ระดับ DB — ไม่มี TEST_DATABASE_URL (ดู .env.example)')
}

const ORG_ID = '00000000-0000-4000-8000-0000000081d0'
const ROLE_ADMIN = '00000000-0000-4000-8000-0000000081d1'
const ROLE_MANAGER = '00000000-0000-4000-8000-0000000081d2'
const ROLE_FINANCE = '00000000-0000-4000-8000-0000000081d3'
const ROLE_AGENT = '00000000-0000-4000-8000-0000000081d4'
const ROLE_EXEC = '00000000-0000-4000-8000-0000000081d5'
const ADMIN_ID = '00000000-0000-4000-8000-0000000081d6'
const MANAGER_ID = '00000000-0000-4000-8000-0000000081d7'
const FINANCE_ID = '00000000-0000-4000-8000-0000000081d8'
const AGENT_ID = '00000000-0000-4000-8000-0000000081d9'
const EXEC_ID = '00000000-0000-4000-8000-0000000081da'
const TEAM_ID = '00000000-0000-4000-8000-0000000081db'
const PLAN_ID = '00000000-0000-4000-8000-0000000081dc'
const TEMPLATE_ID = '00000000-0000-4000-8000-0000000081dd'
const MATRIX_ID = '00000000-0000-4000-8000-0000000081de'
const PAYEE_ID = '00000000-0000-4000-8000-0000000081df'
const COMPANY_ID = '00000000-0000-4000-8000-0000000081e0'

const PROVINCE = 'เชียงใหม่'
const RUN = `${process.pid}${Date.now() % 100_000}`

/** เทมเพลต FLAT 1,000 บาท + เก็บค่าบริการแม้ปิดไม่สำเร็จ ⇒ Revenue ไม่ต้องผ่านคลัง (DEC-006/D6) */
const FEE_BASE_SATANG = 100_000
const FEE_VAT_SATANG = 7_000
const FEE_TOTAL_SATANG = 107_000
/** ยอดปรับปรุงของ `29` §6.4 — VAT คิดผิดอัตรา ต้องปรับลด 1,000 บาท */
const ADJUST_SATANG = 100_000

let client: PrismaClient | null = null
let assignments: typeof import('@/lib/assignments/queries')
let field: typeof import('@/lib/field/queries')
let approvals: typeof import('@/lib/compensation/approval-queries')
let revenue: typeof import('@/lib/revenue/queries')
let accounting: typeof import('@/lib/accounting/queries')
let questions: typeof import('@/lib/accounting/question-queries')
let exports_: typeof import('@/lib/exports/queries')
let adjustments: typeof import('@/lib/adjustments/queries')
let reports: typeof import('@/lib/reports/queries')

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
const manager = sessionUser({
  id: MANAGER_ID,
  roleId: ROLE_MANAGER,
  roleName: 'ผู้จัดการทีมติดตามทรัพย์',
  teamId: null,
  capabilities: { approve_expense_manager: 'manage', assign_case: 'manage', approve_case: 'manage' },
  scope: { kind: 'team', teamIds: [TEAM_ID], companyId: null, userId: MANAGER_ID },
})
/** บัญชี/การเงิน — ปิดงวดได้ แต่ **อนุมัติ Adjustment ของงวดที่ล็อกแล้วไม่ได้** */
const finance = sessionUser({
  id: FINANCE_ID,
  roleId: ROLE_FINANCE,
  roleName: 'การเงิน',
  roleGroup: 'system',
  teamId: null,
  capabilities: {
    approve_expense_finance: 'manage',
    manage_billing: 'manage',
    manage_accounting_period: 'manage',
    manage_exception: 'manage',
    authorize_exception: 'manage',
    manage_export: 'manage',
    manage_accountant_questions: 'manage',
    approve_adjustment: 'manage',
    view_profit_report: 'view',
  },
  scope: { kind: 'global', teamIds: [], companyId: null, userId: FINANCE_ID },
})
/** ผู้บริหาร — ตัวเดียวที่อนุมัติ Adjustment ของงวด `locked` ได้ (`20` §6 · `13` §6.11) */
const executive = sessionUser({
  id: EXEC_ID,
  roleId: ROLE_EXEC,
  roleName: 'บริหาร',
  roleGroup: 'system',
  teamId: null,
  capabilities: {
    approve_adjustment: 'manage',
    approve_adjustment_locked: 'manage',
    manage_accounting_period: 'manage',
    unlock_period: 'manage',
    view_profit_report: 'view',
  },
  scope: { kind: 'global', teamIds: [], companyId: null, userId: EXEC_ID },
})
const ctx = (actor: SessionUser) => ({ actor, meta })

function codeOf(error: unknown): string {
  return (error as { code?: string }).code ?? String(error)
}

async function expectCode(run: () => Promise<unknown>, code: string): Promise<void> {
  await expect(run()).rejects.toSatisfy((error: unknown) => codeOf(error) === code, `ต้องได้ error code ${code}`)
}

let caseSeq = 0

/** เคส `approved` + snapshot FLAT/charge_on_fail — ปิดไม่สำเร็จก็ยังมีรายได้ (`22` §6.6) */
async function seedApprovedCase(): Promise<string> {
  caseSeq += 1
  const caseRef = `E2E81D-${caseSeq}-${RUN}`
  const rows = await db().$queryRawUnsafe<{ id: string }[]>(`
    INSERT INTO cases (
      organization_id, case_ref, case_ref_normalized, company_id, source, status, created_by,
      debtor_name, addr_province, addr_district, asset_kind, asset_description, imei,
      debt_amount_satang, assigned_team_id,
      service_fee_template_id, service_fee_model_snapshot, service_fee_base_satang, service_fee_rate_pct,
      service_fee_basis_snapshot, service_fee_charge_on_fail
    ) VALUES (
      '${ORG_ID}', $$${caseRef}$$, $$${caseRef}$$, '${COMPANY_ID}', 'manual', 'approved', '${ADMIN_ID}',
      'ลูกหนี้ ${caseSeq}', '${PROVINCE}', 'เมือง', 'smartphone', 'iPhone 15',
      '${`35583${RUN}${caseSeq}`.slice(0, 15).padEnd(15, '0')}',
      1000000, '${TEAM_ID}',
      '${TEMPLATE_ID}', 'FLAT', ${FEE_BASE_SATANG}, 0, NULL, true
    ) RETURNING id
  `)
  return rows[0]?.id ?? ''
}

/**
 * เดินสายจริงจนได้ **รายได้ 1 ใบ** ที่พร้อมวางบิล:
 * รับงาน → จัดวัน → เช็คอิน → ปิดงานไม่สำเร็จ → อนุมัติค่าตอบแทนครบสาย ⇒ Revenue เกิด
 */
async function produceRevenue(): Promise<{ caseId: string; revenueId: string; revenueDate: Date }> {
  const caseId = await seedApprovedCase()
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
  await field.closeFieldCase(
    agent,
    caseId,
    { outcome: 'closed_fail', photos: ['p1.jpg'], videos: ['v1.mp4'], productPhotos: [] },
    ctx(agent),
  )

  const pending = await db().expense.findMany({ where: { caseId }, select: { id: true } })
  for (const row of pending) {
    await approvals.approveCompensationExpense(ctx(manager), row.id, {})
    await approvals.approveCompensationExpense(ctx(finance), row.id, { step: 2 })
  }

  const row = await db().revenue.findFirstOrThrow({ where: { caseId } })
  expect(row.grossSatang).toBe(FEE_BASE_SATANG)
  expect(row.vatSatang).toBe(FEE_VAT_SATANG)
  return { caseId, revenueId: row.id, revenueDate: row.revenueDate }
}

/** รวมรายได้เข้ารอบวางบิล — ไม่ทำ = readiness ตกที่ `billing_revenue_sync` (`30` §6.2) */
async function billAll(cutoffDate: Date): Promise<string> {
  const batch = await revenue.createBillingBatch({ actor: finance, meta, reason: 'วางบิลรอบปิดงวด' }, {
    companyId: COMPANY_ID,
    cutoffDate,
    cycleId: null,
    reason: 'วางบิลรอบปิดงวด',
  })
  return batch.id
}

async function periodIdOf(at: Date): Promise<string> {
  const period = await accounting.ensurePeriodForDate(ctx(finance), at)
  return period.id
}

async function cleanup(): Promise<void> {
  const tx = db()
  // ชุดที่ส่งสำนักงานบัญชีแล้วลบไม่ได้ด้วย trigger (`02` §13) — ปิดเฉพาะตอนล้างข้อมูลเทสต์
  await tx.$executeRawUnsafe(`ALTER TABLE export_records DISABLE TRIGGER trg_export_records_no_delete`)
  try {
    await tx.$executeRawUnsafe(`DELETE FROM export_records WHERE organization_id = '${ORG_ID}'`)
    await tx.$executeRawUnsafe(`DELETE FROM accountant_questions WHERE organization_id = '${ORG_ID}'`)
    await tx.$executeRawUnsafe(`DELETE FROM exceptions WHERE organization_id = '${ORG_ID}'`)
    await tx.$executeRawUnsafe(`DELETE FROM adjustments WHERE organization_id = '${ORG_ID}'`)
    await tx.$executeRawUnsafe(`DELETE FROM revenues WHERE organization_id = '${ORG_ID}'`)
    await tx.$executeRawUnsafe(`DELETE FROM billing_batches WHERE organization_id = '${ORG_ID}'`)
    await tx.$executeRawUnsafe(
      `UPDATE expenses SET superseded_by_expense_id = NULL WHERE organization_id = '${ORG_ID}'`,
    )
    await tx.$executeRawUnsafe(`DELETE FROM expenses WHERE organization_id = '${ORG_ID}'`)
    await tx.$executeRawUnsafe(`DELETE FROM jobs WHERE organization_id = '${ORG_ID}'`)
    await tx.$executeRawUnsafe(`DELETE FROM notifications WHERE organization_id = '${ORG_ID}'`)
    await tx.$executeRawUnsafe(`DELETE FROM close_case_drafts WHERE organization_id = '${ORG_ID}'`)
    await tx.$executeRawUnsafe(`DELETE FROM travel_origins WHERE organization_id = '${ORG_ID}'`)
    await tx.$executeRawUnsafe(`DELETE FROM check_ins WHERE organization_id = '${ORG_ID}'`)
    await tx.$executeRawUnsafe(`DELETE FROM case_evidences WHERE organization_id = '${ORG_ID}'`)
    await tx.$executeRawUnsafe(`DELETE FROM case_assignments WHERE organization_id = '${ORG_ID}'`)
    await tx.$executeRawUnsafe(`DELETE FROM cases WHERE organization_id = '${ORG_ID}'`)
    await tx.$executeRawUnsafe(`DELETE FROM accounting_periods WHERE organization_id = '${ORG_ID}'`)
  } finally {
    await tx.$executeRawUnsafe(`ALTER TABLE export_records ENABLE TRIGGER trg_export_records_no_delete`)
  }
  storage.clear()
}

beforeAll(async () => {
  if (!url) return
  process.env.DATABASE_URL = url
  assignments = await import('@/lib/assignments/queries')
  field = await import('@/lib/field/queries')
  approvals = await import('@/lib/compensation/approval-queries')
  revenue = await import('@/lib/revenue/queries')
  accounting = await import('@/lib/accounting/queries')
  questions = await import('@/lib/accounting/question-queries')
  exports_ = await import('@/lib/exports/queries')
  adjustments = await import('@/lib/adjustments/queries')
  reports = await import('@/lib/reports/queries')

  const tx = db()
  await tx.$executeRawUnsafe(`
    INSERT INTO organizations (id, name, tax_id, address, vat_registered)
    VALUES ('${ORG_ID}', 'E2E 8.1 ปิดงวด', '9999999998140', 'ที่อยู่ทดสอบ 8.1 ง', true)
    ON CONFLICT (id) DO NOTHING
  `)
  await tx.$executeRawUnsafe(`
    INSERT INTO roles (id, organization_id, name, role_group, is_seed) VALUES
      ('${ROLE_ADMIN}', '${ORG_ID}', 'ธุรการ 8.1ง', 'system', false),
      ('${ROLE_MANAGER}', '${ORG_ID}', 'ผู้จัดการทีม 8.1ง', 'inhouse', false),
      ('${ROLE_FINANCE}', '${ORG_ID}', 'การเงิน 8.1ง', 'system', false),
      ('${ROLE_AGENT}', '${ORG_ID}', 'พนักงานติดตามทรัพย์ 8.1ง', 'inhouse', false),
      ('${ROLE_EXEC}', '${ORG_ID}', 'บริหาร 8.1ง', 'system', false)
    ON CONFLICT (id) DO NOTHING
  `)
  await tx.$executeRawUnsafe(`
    INSERT INTO users (id, organization_id, role_id, email, full_name, status) VALUES
      ('${ADMIN_ID}', '${ORG_ID}', '${ROLE_ADMIN}', 'admin81d@test.local', 'ธุรการ 8.1ง', 'active'),
      ('${MANAGER_ID}', '${ORG_ID}', '${ROLE_MANAGER}', 'manager81d@test.local', 'ผู้จัดการ 8.1ง', 'active'),
      ('${FINANCE_ID}', '${ORG_ID}', '${ROLE_FINANCE}', 'finance81d@test.local', 'การเงิน 8.1ง', 'active'),
      ('${AGENT_ID}', '${ORG_ID}', '${ROLE_AGENT}', 'agent81d@test.local', 'พนักงาน 8.1ง', 'active'),
      ('${EXEC_ID}', '${ORG_ID}', '${ROLE_EXEC}', 'exec81d@test.local', 'ผู้บริหาร 8.1ง', 'active')
    ON CONFLICT (id) DO NOTHING
  `)
  await tx.$executeRawUnsafe(`
    INSERT INTO compensation_plans
      (id, organization_id, name, side, fuel_mode, fuel_daily_flat_satang, allowance_satang,
       commission_satang, no_success_fee_satang, wht_pct, version, effective_from, is_current, created_by)
    VALUES ('${PLAN_ID}', '${ORG_ID}', 'แผนเหมารายวัน 8.1ง', 'inhouse', 'DAILY_FLAT', 30000, 20000,
            150000, 50000, 3.00, 1, DATE '2026-01-01', true, '${ADMIN_ID}')
    ON CONFLICT (id) DO NOTHING
  `)
  await tx.$executeRawUnsafe(`
    INSERT INTO teams (id, organization_id, name, side, provinces, status, compensation_plan_id, created_by)
    VALUES ('${TEAM_ID}', '${ORG_ID}', 'ทีมทดสอบ 8.1ง', 'inhouse', ARRAY['${PROVINCE}'], 'active',
            '${PLAN_ID}', '${ADMIN_ID}')
    ON CONFLICT (id) DO NOTHING
  `)
  await tx.$executeRawUnsafe(`UPDATE users SET team_id = '${TEAM_ID}' WHERE id = '${AGENT_ID}'`)
  await tx.$executeRawUnsafe(`
    INSERT INTO service_fee_templates
      (id, organization_id, name, model, base_satang, rate_pct, basis, charge_on_fail, version, is_current, created_by)
    VALUES ('${TEMPLATE_ID}', '${ORG_ID}', 'เทมเพลตเหมาจ่าย 8.1ง', 'FLAT', ${FEE_BASE_SATANG}, 0, NULL, true,
            1, true, '${ADMIN_ID}')
    ON CONFLICT (id) DO NOTHING
  `)
  await tx.$executeRawUnsafe(`
    INSERT INTO finance_companies (id, organization_id, name, short_name, tax_id, address, vat_mode,
                                   payment_due_days, service_fee_template_id, created_by)
    VALUES ('${COMPANY_ID}', '${ORG_ID}', 'ไฟแนนซ์ 8.1ง', 'D81', '0105512810004', '4 ถนนทดสอบ กรุงเทพฯ',
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
    VALUES ('${MATRIX_ID}', '${ORG_ID}', 'สายอนุมัติมาตรฐาน 8.1ง', NULL,
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
    VALUES ('${PAYEE_ID}', '${ORG_ID}', '${AGENT_ID}', 'individual', 'ธนาคารกรุงไทย', 'พนักงาน 8.1ง',
            '5551112220', '5551112223334', true, '${ADMIN_ID}')
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

suite('Phase 8.1 — E2E `29` §6.5: ปิดงวดบัญชีสมบูรณ์', () => {
  it('critical เปิดอยู่ = ทั้งตรวจความพร้อมและส่งออกถูกบล็อก · แก้แล้วเดินครบถึง locked', async () => {
    const { revenueDate } = await produceRevenue()
    await billAll(revenueDate)
    const periodId = await periodIdOf(revenueDate)

    // ── ขั้น 2: ตรวจความพร้อมขณะมี Critical Exception เปิดอยู่ (ไฟล์ 34) ──
    const critical = await accounting.createException(ctx(finance), {
      periodId,
      level: 'critical',
      title: 'ใบเสร็จค่าน้ำมันหาย',
      description: 'รายการค่าน้ำมันของรอบนี้ยังไม่มีเอกสารประกอบ ต้องตามให้ครบก่อนส่งบัญชี',
      sourceModule: 'expenses',
      sourceRef: null,
    })
    expect(critical.status).toBe('open')

    const blocked = await accounting.getPeriodReadiness(finance, periodId)
    expect(blocked.ready).toBe(false)
    expect(blocked.checks.find((check) => check.key === 'no_critical_exception')?.passed).toBe(false)
    await expectCode(
      () => accounting.sendPeriod(ctx(finance), periodId, { reason: 'ส่งงวดให้สำนักงานบัญชี' }),
      'NOT_READY_CRITICAL_OPEN',
    )
    // จุดเชื่อม `29` §7 — critical ที่ยังเปิดอยู่ต้องบล็อก Export ได้จริง (`34`/`37`)
    await expectCode(() => exports_.createExportPack(ctx(finance), { periodId }), 'EXPORT_BLOCKED_CRITICAL')
    expect(storage.size).toBe(0)

    // ── ขั้น 3: แก้ข้อยกเว้นจนหมด critical ⇒ ตรวจความพร้อมผ่าน ─────────────
    await accounting.resolveException(ctx(finance), critical.id, {
      resolutionNote: 'ได้ใบเสร็จตัวจริงจากพนักงานแล้ว แนบเข้าระบบเรียบร้อย',
    })
    const ready = await accounting.getPeriodReadiness(finance, periodId)
    expect(ready.ready).toBe(true)
    expect(ready.checks.every((check) => check.passed)).toBe(true)

    // ── ขั้น 4–5: Export Pack + ส่งสำนักงานบัญชี (ไฟล์ 37/30) ─────────────
    const sent = await accounting.sendPeriod(ctx(finance), periodId, { reason: 'ส่งงวดให้สำนักงานบัญชี' })
    expect(sent.status).toBe('sent_to_accountant')

    const pack = await exports_.createExportPack(ctx(finance), { periodId })
    expect(pack.version).toBe(1)
    expect(pack.fileHash).toMatch(/^[a-f0-9]{64}$/)
    expect(pack.status).toBe('generated')
    expect(storage.size).toBeGreaterThan(0)

    // ส่งออกซ้ำ = **เวอร์ชันใหม่ ห้ามทับของเดิม** (Rule 09 · `37`)
    const second = await exports_.createExportPack(ctx(finance), { periodId })
    expect(second.version).toBe(2)
    expect(second.id).not.toBe(pack.id)
    expect((await exports_.listExportHistory(finance, { periodId })).items).toHaveLength(2)

    // ── ขั้น 6: สำนักงานบัญชีถามกลับ → บัญชีตอบ (ไฟล์ 36) ────────────────
    const question = await questions.createAccountantQuestion(ctx(finance), {
      periodId,
      questionText: 'ค่าบริการรายการนี้บันทึกเป็นรายได้เดือนไหน',
    })
    expect(question.status).toBe('open')
    const answered = await questions.answerAccountantQuestion(ctx(finance), question.id, {
      answerText: 'บันทึกตามวันปิดเคส ซึ่งอยู่ในงวดนี้',
    })
    expect(answered.status).toBe('answered')

    // ── ขั้น 7: ผู้บริหารยืนยันปิดงวด ⇒ locked ────────────────────────────
    const locked = await accounting.lockPeriod(ctx(executive), periodId, { reason: 'ตรวจครบแล้ว ปิดงวด' })
    expect(locked.status).toBe('locked')
    expect(locked.lockedAt).not.toBeNull()
  })
})

// ════════════════════════════════════════════════════════════════════════════

suite('Phase 8.1 — E2E `29` §6.4: งวด locked → แก้ย้อนหลังผ่าน Adjustment', () => {
  it('แก้ตรงไม่ได้ (`PERIOD_LOCKED_DIRECT_EDIT`) · Executive เท่านั้นอนุมัติ · ยอดสุทธิขยับโดยไม่แตะต้นฉบับ', async () => {
    const { revenueId, revenueDate } = await produceRevenue()
    await billAll(revenueDate)
    const periodId = await periodIdOf(revenueDate)

    // ── ขั้น 1: ปิดงวดจนถึง locked ────────────────────────────────────────
    await accounting.sendPeriod(ctx(finance), periodId, { reason: 'ส่งงวดให้สำนักงานบัญชี' })
    await accounting.lockPeriod(ctx(executive), periodId, { reason: 'ปิดงวดตามรอบ' })

    // ── ขั้น 2: แก้ตรงไม่ได้ทุกช่องทาง (`30`/`20` · `13` §6.11) ────────────
    const secondCase = await seedApprovedCase()
    await assignments.assignCase(manager, secondCase, { agentId: AGENT_ID }, ctx(manager))
    await field.acceptFieldCase(agent, secondCase, ctx(agent))
    await field.scheduleFieldCase(agent, secondCase, { scheduleDate: new Date('2026-09-02T00:00:00.000Z') }, ctx(agent))
    await field.saveCloseDraft(
      agent,
      secondCase,
      {
        outcome: null,
        photos: [],
        videos: [],
        productPhotos: [],
        travelOrigin: { latitude: 18.58, longitude: 99.0, source: 'gps_auto' },
      },
      ctx(agent),
    )
    await field.recordCheckin(agent, secondCase, { latitude: 18.58, longitude: 99.0, checkinType: 'address' }, ctx(agent))
    await field.closeFieldCase(
      agent,
      secondCase,
      { outcome: 'closed_fail', photos: ['p1.jpg'], videos: ['v1.mp4'], productPhotos: [] },
      ctx(agent),
    )
    const lockedExpense = await db().expense.findFirstOrThrow({ where: { caseId: secondCase } })
    await expectCode(
      () => approvals.approveCompensationExpense(ctx(manager), lockedExpense.id, {}),
      'PERIOD_LOCKED_DIRECT_EDIT',
    )
    await expectCode(
      () =>
        revenue.createBillingBatch({ actor: finance, meta, reason: 'พยายามวางบิลในงวดที่ล็อกแล้ว' }, {
          companyId: COMPANY_ID,
          cutoffDate: revenueDate,
          cycleId: null,
          reason: 'พยายามวางบิลในงวดที่ล็อกแล้ว',
        }),
      'PERIOD_LOCKED_DIRECT_EDIT',
    )

    // ── ขั้น 3: สร้าง Adjustment อ้าง Revenue เดิม ────────────────────────
    const targets = await adjustments.listAdjustmentTargets(finance, { targetType: 'revenue', q: '' })
    const target = targets.find((row) => row.targetId === revenueId)
    expect(target?.periodStatusAtTarget).toBe('locked')
    expect(target?.directEditBlocked).toBe(true)
    expect(target?.requiredApproverRoles).toEqual(['บริหาร'])

    const adjustment = await adjustments.createAdjustment(ctx(finance), {
      targetType: 'revenue',
      targetId: revenueId,
      adjustmentType: 'decrease',
      amountSatang: ADJUST_SATANG,
      reason: 'คิด VAT ผิดอัตราในงวดที่ปิดไปแล้ว ต้องปรับลดรายได้',
    })
    expect(adjustment.status).toBe('pending_approval')
    expect(adjustment.periodStatusAtTarget).toBe('locked')

    // ── ขั้น 4: การเงินอนุมัติไม่ได้ — ต้อง Executive เท่านั้น ──────────────
    await expectCode(
      () => adjustments.approveAdjustment(ctx(finance), adjustment.id, { note: 'ขออนุมัติแทน' }),
      'INSUFFICIENT_APPROVAL_LEVEL',
    )
    expect((await db().adjustment.findUniqueOrThrow({ where: { id: adjustment.id } })).status).toBe('pending_approval')

    const approved = await adjustments.approveAdjustment(ctx(executive), adjustment.id, {
      note: 'ตรวจเอกสารแล้ว อนุมัติปรับปรุงย้อนหลัง',
    })
    expect(approved.status).toBe('approved')

    // ── ขั้น 5: Revenue ต้นฉบับต้องไม่ถูกแตะ · ยอดสุทธิในรายงานลดลงจริง ───
    const original = await db().revenue.findUniqueOrThrow({ where: { id: revenueId } })
    expect(original.grossSatang).toBe(FEE_BASE_SATANG)
    expect(original.totalSatang).toBe(FEE_TOTAL_SATANG)

    const report = await reports.getProfitability(finance, {
      dimension: 'company',
      period: 'month',
      asOf: revenueDate,
      refresh: true,
    })
    const companyRow = report.rows.find((row) => row.key === COMPANY_ID)
    expect(companyRow?.revenueSatang).toBe(FEE_BASE_SATANG - ADJUST_SATANG)
  })
})
