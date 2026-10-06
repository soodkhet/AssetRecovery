import { PrismaPg } from '@prisma/adapter-pg'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import type { SessionUser } from '@/lib/auth/types'
import { PrismaClient } from '@/lib/generated/prisma/client'

/**
 * เทสต์ระดับ DB ของ Phase 4.1 — DoD ของไฟล์ 30 + 34 + interceptor Period Lock
 *
 *  - `30` §16: Readiness ครบ 3 เงื่อนไข (critical / reconcile / billing-revenue) + ห้าม force ข้าม
 *  - `30` §16: ปลดล็อกโดยไม่ใช่ผู้บริหาร ⇒ `UNLOCK_REQUIRES_EXECUTIVE` · ผู้บริหารได้ + audit `unlock`
 *  - `34` §16: authorize สำเร็จ (status → `authorized` ทันที) / ไม่กรอกเหตุผล ⇒ reject /
 *    **ไม่สืบทอดข้ามรอบ** (รอบใหม่ = record ใหม่ ไม่ยก authorized เดิมมา) / สรุปแยก `authorized` จาก `resolved`
 *  - Period Lock guard: write ของสายการเงินในงวดที่ `locked` ⇒ `PERIOD_LOCKED_DIRECT_EDIT`
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
  console.warn('[accounting.db.test] ข้ามเทสต์ระดับ DB — ไม่มี TEST_DATABASE_URL (ดู .env.example)')
}

const ORG_ID = '00000000-0000-4000-8000-0000000041a0'
const ROLE_ACCOUNTING = '00000000-0000-4000-8000-0000000041a1'
const ROLE_EXEC = '00000000-0000-4000-8000-0000000041a2'
const ACCOUNTING_ID = '00000000-0000-4000-8000-0000000041a3'
const EXEC_ID = '00000000-0000-4000-8000-0000000041a4'
const TEAM_ID = '00000000-0000-4000-8000-0000000041a5'
const COMPANY_A = '00000000-0000-4000-8000-0000000041a6'
const PAYEE_ID = '00000000-0000-4000-8000-0000000041a7'
const AGENT_ID = '00000000-0000-4000-8000-0000000041a8'
const ROLE_AGENT = '00000000-0000-4000-8000-0000000041a9'
const BANK_ACCOUNT_ID = '00000000-0000-4000-8000-0000000041aa'

let client: PrismaClient | null = null
type AccountingQueries = typeof import('@/lib/accounting/queries')
type ClaimQueries = typeof import('@/lib/claims/queries')
type RevenueQueries = typeof import('@/lib/revenue/queries')
let accounting: AccountingQueries
let claims: ClaimQueries
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

/** บัญชี — จัดการรอบ/exception ได้ แต่ **ไม่มี** `unlock_period`/`authorize_exception` */
const accountant: SessionUser = {
  id: ACCOUNTING_ID,
  organizationId: ORG_ID,
  supabaseUid: 'uid-acc-41',
  email: 'accounting41@test.local',
  fullName: 'บัญชี 4.1',
  status: 'active',
  roleId: ROLE_ACCOUNTING,
  roleName: 'บัญชี',
  roleGroup: 'system',
  isSuperadmin: false,
  teamId: null,
  companyId: null,
  capabilities: {
    manage_accounting_period: 'manage',
    manage_exceptions: 'manage',
    manage_billing: 'manage',
    approve_expense_finance: 'manage',
  },
  scope: { kind: 'global', teamIds: [], companyId: null, userId: ACCOUNTING_ID },
  loginAt: new Date().toISOString(),
}

/** ผู้บริหาร — ถือ `unlock_period` + `authorize_exception` (capability ที่ล็อกไว้ให้ผู้บริหาร) */
const executive: SessionUser = {
  ...accountant,
  id: EXEC_ID,
  supabaseUid: 'uid-exec-41',
  email: 'exec41@test.local',
  fullName: 'ผู้บริหาร 4.1',
  roleId: ROLE_EXEC,
  roleName: 'บริหาร',
  capabilities: { unlock_period: 'manage', authorize_exception: 'manage', manage_accounting_period: 'manage' },
  scope: { kind: 'global', teamIds: [], companyId: null, userId: EXEC_ID },
}

const ctx = (actor: SessionUser = accountant) => ({ actor, meta })

function codeOf(error: unknown): string {
  return (error as { code?: string }).code ?? String(error)
}

async function expectCode(run: () => Promise<unknown>, code: string): Promise<void> {
  await expect(run()).rejects.toSatisfy((error: unknown) => codeOf(error) === code, `ต้องได้ error code ${code}`)
}

// ── seed helpers ────────────────────────────────────────────────────────────

/** งวด 8/2569 = สิงหาคม 2026 (ปฏิทินไทย) — ทุกเทสต์อ้างงวดนี้ */
const YEAR_BE = 2569
const MONTH = 8
const PERIOD_LABEL = 'สิงหาคม 2569'
const IN_PERIOD = new Date('2026-08-20T03:00:00Z')

async function seedPeriod(status: 'collecting' | 'sent_to_accountant' | 'locked' = 'collecting'): Promise<string> {
  const rows = await db().$queryRawUnsafe<{ id: string }[]>(`
    INSERT INTO accounting_periods (organization_id, period_label, year_be, month, status, created_by)
    VALUES ('${ORG_ID}', '${PERIOD_LABEL}', ${YEAR_BE}, ${MONTH}, '${status}', '${ACCOUNTING_ID}')
    RETURNING id
  `)
  return rows[0]?.id ?? ''
}

let seq = 0

/** รายได้ที่ยังไม่วางบิลของงวด — ทำให้เงื่อนไขที่ 1 ของ Readiness ไม่ผ่าน */
async function seedUnbilledRevenue(revenueDate = '2026-08-20'): Promise<void> {
  seq += 1
  const caseRef = `ACC41-${seq}-${Date.now()}`
  await db().$executeRawUnsafe(`
    WITH new_case AS (
      INSERT INTO cases (
        organization_id, case_ref, case_ref_normalized, company_id, source, status, created_by,
        debtor_name, addr_province, addr_district, asset_kind, asset_description,
        debt_amount_satang, assigned_team_id, outcome, closed_at,
        service_fee_model_snapshot, service_fee_base_satang, service_fee_rate_pct, service_fee_basis_snapshot
      ) VALUES (
        '${ORG_ID}', $$${caseRef}$$, $$${caseRef}$$, '${COMPANY_A}', 'manual', 'closed_success', '${ACCOUNTING_ID}',
        'ลูกหนี้ ${seq}', 'เชียงใหม่', 'เมือง', 'smartphone', 'iPhone 15',
        1000000, '${TEAM_ID}', 'closed_success', '${revenueDate}T03:00:00Z',
        'SUCCESS_FEE', 0, 10, 'debt_amount'
      ) RETURNING id
    )
    INSERT INTO revenues (organization_id, case_id, company_id, gross_satang, vat_satang, vat_rate_pct_used,
                          total_satang, fee_model_snapshot, vat_mode_snapshot, status, revenue_date, created_by)
    SELECT '${ORG_ID}', id, '${COMPANY_A}', 100000, 7000, 7.00, 107000, 'SUCCESS_FEE', 'exclude_vat', 'ready_for_billing',
           '${revenueDate}', '${ACCOUNTING_ID}'
    FROM new_case
  `)
}

/**
 * รอบวางบิลของงวด ส.ค. 2569 แล้วผูกรายได้ที่ยังไม่ผูกรอบทั้งหมดเข้ารอบนี้ (เลขรอบเดินด้วย trigger ของ DB)
 * `totalSatang` ใส่ต่างจากผลรวมรายได้ได้ เพื่อจำลองยอดไม่ตรงจริง
 */
async function seedBillingBatch(status: 'draft' | 'sent', totalSatang: number): Promise<string> {
  const rows = await db().$queryRawUnsafe<{ batch_number: string }[]>(`
    WITH batch AS (
      INSERT INTO billing_batches (organization_id, company_id, period, status, total_satang, due_date, created_by)
      VALUES ('${ORG_ID}', '${COMPANY_A}', 'สิงหาคม 2569', '${status}', ${totalSatang}, '2026-09-30', '${ACCOUNTING_ID}')
      RETURNING id, batch_number
    ), linked AS (
      UPDATE revenues SET billing_batch_id = (SELECT id FROM batch), status = 'billed'
      WHERE organization_id = '${ORG_ID}' AND billing_batch_id IS NULL
      RETURNING id
    )
    SELECT batch_number FROM batch
  `)
  const number = rows[0]?.batch_number
  if (number === undefined) throw new Error('สร้างรอบวางบิลทดสอบไม่สำเร็จ')
  return number
}

/** รายการเดินบัญชีที่ยังไม่จับคู่ — ทำให้เงื่อนไขที่ 2 ไม่ผ่าน */
async function seedUnmatchedBankTransaction(periodId: string): Promise<void> {
  await db().$executeRawUnsafe(`
    INSERT INTO bank_transactions (organization_id, period_id, bank_account_id, transaction_date,
                                   description, amount_satang, match_status, created_by)
    VALUES ('${ORG_ID}', '${periodId}', '${BANK_ACCOUNT_ID}', '2026-08-15',
            'เงินเข้าไม่ทราบที่มา', 500000, 'unmatched', '${ACCOUNTING_ID}')
  `)
}

async function periodAuditRows(periodId: string) {
  return db().auditLog.findMany({
    where: { organizationId: ORG_ID, targetType: 'accounting_periods', targetId: periodId },
    select: { action: true, actorRole: true, reason: true },
    orderBy: { createdAt: 'asc' },
  })
}

async function cleanup(): Promise<void> {
  // `audit_logs` ลบไม่ได้แม้ในเทสต์ (immutable 2 ชั้น — `02` §13) ⇒ assertion อ้าง target_id ที่ไม่ซ้ำ
  const tx = db()
  await tx.$executeRawUnsafe(`DELETE FROM exceptions WHERE organization_id = '${ORG_ID}'`)
  await tx.$executeRawUnsafe(`DELETE FROM bank_transactions WHERE organization_id = '${ORG_ID}'`)
  await tx.$executeRawUnsafe(`DELETE FROM revenues WHERE organization_id = '${ORG_ID}'`)
  await tx.$executeRawUnsafe(`DELETE FROM billing_batches WHERE organization_id = '${ORG_ID}'`)
  await tx.$executeRawUnsafe(`DELETE FROM expenses WHERE organization_id = '${ORG_ID}'`)
  await tx.$executeRawUnsafe(`DELETE FROM cases WHERE organization_id = '${ORG_ID}'`)
  await tx.$executeRawUnsafe(`DELETE FROM accounting_periods WHERE organization_id = '${ORG_ID}'`)
  await tx.$executeRawUnsafe(`DELETE FROM payout_batches WHERE organization_id = '${ORG_ID}'`)
}

/** รอบจ่าย (ไม่มีรายการ) สร้างเมื่อ `createdAt` — มติ PO U112 ผูกงวดด้วยวันที่สร้างรอบ */
async function seedPayoutBatch(name: string, status: string, createdAt: string): Promise<string> {
  const rows = await db().$queryRawUnsafe<{ id: string }[]>(`
    INSERT INTO payout_batches (organization_id, name, side, status, gross_satang, wht_satang, net_satang, created_at, created_by)
    VALUES ('${ORG_ID}', '${name}', 'outsource', '${status}', 150000, 0, 150000, '${createdAt}', '${ACCOUNTING_ID}')
    RETURNING id
  `)
  return rows[0]?.id ?? ''
}

beforeAll(async () => {
  if (!url) return
  process.env.DATABASE_URL = url
  accounting = await import('@/lib/accounting/queries')
  claims = await import('@/lib/claims/queries')
  revenue = await import('@/lib/revenue/queries')

  const tx = db()
  await tx.$executeRawUnsafe(`
    INSERT INTO organizations (id, name, tax_id, address)
    VALUES ('${ORG_ID}', 'Phase41Test', '9999999994100', 'ที่อยู่ทดสอบ 4.1') ON CONFLICT (id) DO NOTHING
  `)
  await tx.$executeRawUnsafe(`
    INSERT INTO roles (id, organization_id, name, role_group, is_seed) VALUES
      ('${ROLE_ACCOUNTING}', '${ORG_ID}', 'บัญชี 4.1', 'system', false),
      ('${ROLE_EXEC}', '${ORG_ID}', 'บริหาร 4.1', 'system', false),
      ('${ROLE_AGENT}', '${ORG_ID}', 'พนักงาน 4.1', 'outsource', false)
    ON CONFLICT (id) DO NOTHING
  `)
  await tx.$executeRawUnsafe(`
    INSERT INTO users (id, organization_id, role_id, email, full_name, status) VALUES
      ('${ACCOUNTING_ID}', '${ORG_ID}', '${ROLE_ACCOUNTING}', 'accounting41@test.local', 'บัญชี 4.1', 'active'),
      ('${EXEC_ID}', '${ORG_ID}', '${ROLE_EXEC}', 'exec41@test.local', 'ผู้บริหาร 4.1', 'active'),
      ('${AGENT_ID}', '${ORG_ID}', '${ROLE_AGENT}', 'agent41@test.local', 'พนักงาน 4.1', 'active')
    ON CONFLICT (id) DO NOTHING
  `)
  await tx.$executeRawUnsafe(`
    INSERT INTO teams (id, organization_id, name, side, provinces, status, created_by)
    VALUES ('${TEAM_ID}', '${ORG_ID}', 'ทีม 4.1', 'outsource', ARRAY['เชียงใหม่'], 'active', '${ACCOUNTING_ID}')
    ON CONFLICT (id) DO NOTHING
  `)
  await tx.$executeRawUnsafe(`
    INSERT INTO payee_profiles (id, organization_id, user_id, payee_type, bank_name, account_name,
                                account_number, national_id, is_verified, created_by)
    VALUES ('${PAYEE_ID}', '${ORG_ID}', '${AGENT_ID}', 'individual', 'ธนาคารกสิกรไทย', 'พนักงาน 4.1',
            '1234509871', '1234509871123', true, '${ACCOUNTING_ID}')
    ON CONFLICT (id) DO NOTHING
  `)
  await tx.$executeRawUnsafe(`
    INSERT INTO finance_companies (id, organization_id, name, short_name, tax_id, vat_mode,
                                   payment_due_days, created_by)
    VALUES ('${COMPANY_A}', '${ORG_ID}', 'ไฟแนนซ์ A 4.1', 'A41', '0105512410001', 'exclude_vat', 30, '${ACCOUNTING_ID}')
    ON CONFLICT (id) DO NOTHING
  `)
  await tx.$executeRawUnsafe(`
    INSERT INTO bank_accounts (id, organization_id, bank_name, account_name, account_number, usage, created_by)
    VALUES ('${BANK_ACCOUNT_ID}', '${ORG_ID}', 'ธนาคารกสิกรไทย', 'บริษัท 4.1', '1112223330', 'both', '${ACCOUNTING_ID}')
    ON CONFLICT (id) DO NOTHING
  `)
  await cleanup()
})

afterAll(async () => {
  if (url) await cleanup()
  await client?.$disconnect()
})

// ════════════════════════════════════════════════════════════════════════════

suite('Phase 4.1 — Exception (`34` §16)', () => {
  beforeEach(cleanup)

  const draft = {
    level: 'critical' as const,
    title: 'ใบเสร็จค่าน้ำมันหาย 3 ใบ',
    description: 'รายการเบิกน้ำมันของทีมเชียงใหม่ไม่มีใบเสร็จแนบ',
    sourceModule: 'payout',
    sourceRef: 'PB-2569-001',
  }

  it('authorize สำเร็จ ⇒ status เปลี่ยนเป็น `authorized` ทันที + เก็บเหตุผลลง audit', async () => {
    const periodId = await seedPeriod()
    const created = await accounting.createException(ctx(), { ...draft, periodId }, IN_PERIOD)
    expect(created.status).toBe('open')

    const authorized = await accounting.authorizeException(ctx(executive), created.id, {
      authorizeNote: 'ผู้บริหารรับความเสี่ยงรอบนี้ ใบเสร็จตามมาเดือนหน้า',
    })
    expect(authorized.status).toBe('authorized')
    expect(authorized.authorizeNote).toContain('รับความเสี่ยง')
    expect(authorized.authorizedByName).toBe('ผู้บริหาร 4.1')

    const audits = await db().auditLog.findMany({
      where: { organizationId: ORG_ID, targetType: 'exceptions', targetId: created.id },
      select: { action: true, reason: true, actorRole: true },
      orderBy: { createdAt: 'asc' },
    })
    const authorizeAudit = audits.at(-1)
    expect(authorizeAudit?.actorRole).toBe('บริหาร')
    expect(authorizeAudit?.reason).toContain('รับความเสี่ยง')
  })

  it('authorize โดยไม่กรอกเหตุผล ⇒ AUTHORIZED_EXCEPTION_REASON_REQUIRED (สถานะไม่เปลี่ยน)', async () => {
    const periodId = await seedPeriod()
    const created = await accounting.createException(ctx(), { ...draft, periodId }, IN_PERIOD)

    await expectCode(
      () => accounting.authorizeException(ctx(executive), created.id, { authorizeNote: '   ' }),
      'AUTHORIZED_EXCEPTION_REASON_REQUIRED',
    )

    const after = await db().exception.findUniqueOrThrow({ where: { id: created.id }, select: { status: true } })
    expect(after.status).toBe('open')
  })

  it('resolve แล้วเปลี่ยนสถานะซ้ำไม่ได้ · แก้รายละเอียดหลังปิดก็ไม่ได้ (`23` §6.12)', async () => {
    const periodId = await seedPeriod()
    const created = await accounting.createException(ctx(), { ...draft, periodId }, IN_PERIOD)

    const resolved = await accounting.resolveException(ctx(), created.id, {
      resolutionNote: 'ขอใบเสร็จจากปั๊มมาครบแล้ว แนบเข้าระบบเรียบร้อย',
    })
    expect(resolved.status).toBe('resolved')
    expect(resolved.resolvedByName).toBe('บัญชี 4.1')

    await expectCode(
      () => accounting.authorizeException(ctx(executive), created.id, { authorizeNote: 'ขอข้ามทีหลัง' }),
      'EXCEPTION_INVALID_STATUS',
    )
    await expectCode(
      () => accounting.updateException(ctx(), created.id, { title: 'แก้หัวข้อหลังปิดแล้ว' }),
      'EXCEPTION_INVALID_STATUS',
    )
  })

  it('ไม่สืบทอดข้ามรอบ — ปัญหาเดิมในรอบใหม่เป็น record ใหม่ที่ยัง `open` (`34` §6.3 ข้อ 2)', async () => {
    const augustId = await seedPeriod()
    const august = await accounting.createException(ctx(), { ...draft, periodId: augustId }, IN_PERIOD)
    await accounting.authorizeException(ctx(executive), august.id, { authorizeNote: 'ยกเว้นเฉพาะรอบสิงหาคม' })

    // รอบถัดไป (กันยายน 2569) — ตรวจพบปัญหาเดิมซ้ำ
    const september = await accounting.createException(ctx(), draft, new Date('2026-09-10T03:00:00Z'))
    expect(september.periodId).not.toBe(augustId)
    expect(september.periodLabel).toBe('กันยายน 2569')
    expect(september.status).toBe('open')
    expect(september.authorizeNote).toBeNull()

    // รอบใหม่ต้องยังถูกบล็อกอยู่ — authorized ของเดือนก่อนไม่ปลดให้
    const readiness = await accounting.getPeriodReadiness(accountant, september.periodId)
    expect(readiness.ready).toBe(false)
    expect(readiness.criticalOpen.map((row) => row.id)).toEqual([september.id])

    // ส่วนรอบสิงหาคมไม่ถูกบล็อกด้วย critical ตัวเดิมแล้ว
    const augustReadiness = await accounting.getPeriodReadiness(accountant, augustId)
    expect(augustReadiness.criticalOpen).toEqual([])
  })

  it('สรุปยอดแยก `authorized` ออกจาก `resolved` เสมอ (`34` §16 เคสสุดท้าย)', async () => {
    const periodId = await seedPeriod()
    const a = await accounting.createException(ctx(), { ...draft, periodId }, IN_PERIOD)
    const b = await accounting.createException(
      ctx(),
      { ...draft, periodId, title: 'ที่อยู่ผู้รับเงินไม่ครบ', level: 'warning' },
      IN_PERIOD,
    )
    await accounting.authorizeException(ctx(executive), a.id, { authorizeNote: 'ยอมรับความเสี่ยงรอบนี้' })
    await accounting.resolveException(ctx(), b.id, { resolutionNote: 'แก้ที่ต้นทางแล้ว' })

    const list = await accounting.listExceptions(accountant, { periodId })
    expect(list.summary.authorized.critical).toBe(1)
    expect(list.summary.resolved.warning).toBe(1)
    expect(list.summary.open.total).toBe(0)
    expect(list.summary.blockingCritical).toBe(0)

    // หน้ารอบส่งบัญชี/modal Export ต้องไม่นับรายการที่ปิดแล้วเป็น "วิกฤตเปิดอยู่" (UAT R7cv3-B02)
    const periods = await accounting.listPeriods(ctx(), { limit: 36 }, IN_PERIOD)
    const period = periods.find((row) => row.id === periodId)
    expect(period?.criticalCount).toBe(1)
    expect(period?.blockingCritical).toBe(0)
    expect(period?.openWarningCount).toBe(0)
    expect(period?.latestExportVersion).toBeNull()
  })
})

suite('Phase 4.1 — Readiness Check + ปิด/ปลดล็อกงวด (`30` §16)', () => {
  beforeEach(cleanup)

  const reason = { reason: 'ตรวจสอบข้อมูลครบแล้วตามรอบเดือนสิงหาคม 2569' }

  it('มี critical เปิดอยู่ ⇒ ส่งงวดไม่ได้ (NOT_READY_CRITICAL_OPEN)', async () => {
    const periodId = await seedPeriod()
    await accounting.createException(
      ctx(),
      {
        periodId,
        level: 'critical',
        title: 'เอกสารภาษีไม่ครบ',
        description: 'ใบกำกับภาษีขาด 2 ใบ',
        sourceModule: 'billing',
        sourceRef: null,
      },
      IN_PERIOD,
    )

    await expectCode(() => accounting.sendPeriod(ctx(), periodId, reason), 'NOT_READY_CRITICAL_OPEN')

    const period = await db().accountingPeriod.findUniqueOrThrow({
      where: { id: periodId },
      select: { status: true },
    })
    expect(period.status).toBe('collecting')
  })

  it('ยังมีรายการเดินบัญชีไม่จับคู่ ⇒ NOT_READY_RECONCILE_INCOMPLETE', async () => {
    const periodId = await seedPeriod()
    await seedUnmatchedBankTransaction(periodId)

    const readiness = await accounting.getPeriodReadiness(accountant, periodId)
    expect(readiness.unmatchedBankCount).toBe(1)
    await expectCode(() => accounting.sendPeriod(ctx(), periodId, reason), 'NOT_READY_RECONCILE_INCOMPLETE')
  })

  it('มติ PO U87: มีรายได้ที่ยังไม่วางบิลในงวด ⇒ เตือนรายได้ค้างรับ แต่ส่งงวดได้', async () => {
    const periodId = await seedPeriod()
    await seedUnbilledRevenue()
    await seedUnbilledRevenue('2026-07-15') // ยกมาจากงวดก่อน — ยังค้างรับอยู่ก็ต้องนับ
    await seedUnbilledRevenue('2026-09-02') // งวดถัดไป — ไม่นับ

    const readiness = await accounting.getPeriodReadiness(accountant, periodId)
    expect(readiness.billingMismatches).toEqual([])
    expect(readiness.ready).toBe(true)
    expect(readiness.unbilledRevenue).toMatchObject({ count: 2, totalSatang: 214000, inDraftCount: 0 })
    expect(readiness.warnings.some((warning) => warning.startsWith('มีรายได้ค้างรับยังไม่วางบิล 2 รายการ ฿2,140.00'))).toBe(
      true,
    )

    const sent = await accounting.sendPeriod(ctx(), periodId, reason)
    expect(sent.status).toBe('sent_to_accountant')
  })

  it('มติ PO U87: ยอดรอบวางบิลไม่ตรงกับรายได้ในรอบจริง ⇒ ยังบล็อก NOT_READY_BILLING_REVENUE_MISMATCH', async () => {
    const periodId = await seedPeriod()
    await seedUnbilledRevenue()
    const batchNumber = await seedBillingBatch('sent', 99999)

    const readiness = await accounting.getPeriodReadiness(accountant, periodId)
    expect(readiness.billingMismatches).toEqual([
      expect.objectContaining({ batchNumber, reason: 'total_mismatch', batchTotalSatang: 99999, revenueTotalSatang: 107000 }),
    ])
    expect(readiness.unbilledRevenue.count).toBe(0)
    await expectCode(() => accounting.sendPeriod(ctx(), periodId, reason), 'NOT_READY_BILLING_REVENUE_MISMATCH')
  })

  it('BUG-160: รอบวางบิลร่างค้าง ⇒ เตือน (ไม่บล็อก) + รายได้ในรอบร่างนับเป็นรายได้ค้างรับ', async () => {
    const periodId = await seedPeriod()
    await seedUnbilledRevenue()
    const batchNumber = await seedBillingBatch('draft', 107000)

    const readiness = await accounting.getPeriodReadiness(accountant, periodId)
    expect(readiness.ready).toBe(true)
    expect(readiness.draftBillingBatches).toEqual({ count: 1, totalSatang: 107000, batchNumbers: [batchNumber] })
    expect(readiness.unbilledRevenue).toMatchObject({ count: 1, inDraftCount: 1 })
    expect(readiness.warnings.some((warning) => warning.includes(`รอบวางบิลร่างที่ยังไม่ส่งลูกค้า 1 รอบ (${batchNumber})`))).toBe(
      true,
    )
  })

  it('warning ค้างอยู่ก็ปิดงวดได้ แต่ต้องมีข้อความเตือน (`30` §6.2)', async () => {
    const periodId = await seedPeriod()
    await accounting.createException(
      ctx(),
      {
        periodId,
        level: 'warning',
        title: 'ที่อยู่ผู้รับเงินไม่ครบ',
        description: 'กรอกที่อยู่ไม่ครบ 2 ราย',
        sourceModule: 'payout',
        sourceRef: null,
      },
      IN_PERIOD,
    )

    const readiness = await accounting.getPeriodReadiness(accountant, periodId)
    expect(readiness.ready).toBe(true)
    expect(readiness.warnings).toHaveLength(1)

    const sent = await accounting.sendPeriod(ctx(), periodId, reason)
    expect(sent.status).toBe('sent_to_accountant')
    expect(sent.exportReady).toBe(true)
    expect(sent.sentByName).toBe('บัญชี 4.1')
  })

  it('มติ PO U51: ส่ง/ล็อกก่อนสิ้นเดือน (31/08 23:59 น. ไทย) ⇒ PERIOD_NOT_ENDED · 01/09 00:00 น. ทำได้', async () => {
    const beforeMidnight = new Date('2026-08-31T16:59:00Z') // 31/08/2569 23:59 น.
    const midnight = new Date('2026-08-31T17:00:00Z') // 01/09/2569 00:00 น.

    const periodId = await seedPeriod()
    const early = await accounting.getPeriodReadiness(accountant, periodId, beforeMidnight)
    expect(early.ready).toBe(false)
    expect(early.checks[0]).toMatchObject({ key: 'period_ended', passed: false })
    await expectCode(() => accounting.sendPeriod(ctx(), periodId, reason, beforeMidnight), 'PERIOD_NOT_ENDED')
    const still = await db().accountingPeriod.findUniqueOrThrow({ where: { id: periodId }, select: { status: true } })
    expect(still.status).toBe('collecting')

    const sent = await accounting.sendPeriod(ctx(), periodId, reason, midnight)
    expect(sent.status).toBe('sent_to_accountant')
    expect(sent.periodEnded).toBe(true)
    expect(sent.closeAvailableFrom).toBe('2026-08-31T17:00:00.000Z')

    await expectCode(() => accounting.lockPeriod(ctx(), periodId, reason, beforeMidnight), 'PERIOD_NOT_ENDED')
    const locked = await accounting.lockPeriod(ctx(), periodId, reason, midnight)
    expect(locked.status).toBe('locked')
  })

  it('มติ PO U112: รอบจ่ายของงวดยังไม่ completed/cancelled ⇒ ส่ง/ล็อกไม่ได้ (PERIOD_HAS_OPEN_PAYOUTS) · ปิดรอบแล้วทำได้', async () => {
    const after = new Date('2026-09-02T03:00:00Z')
    const periodId = await seedPeriod()
    // 01/08/2569 00:30 น. ไทย = 31/07 ค.ศ. UTC — ต้องนับเป็นงวด ส.ค. (ปฏิทินไทย)
    const open = await seedPayoutBatch('รอบจ่ายค้าง ส.ค.', 'file_generated', '2026-07-31T17:30:00Z')
    // รอบที่จ่ายแล้ว/ยกเลิก/อยู่งวดอื่น ไม่บล็อก
    await seedPayoutBatch('รอบจ่ายสำเร็จ', 'completed', '2026-08-10T03:00:00Z')
    await seedPayoutBatch('รอบงวด ก.ย.', 'draft', '2026-08-31T17:00:00Z')

    const readiness = await accounting.getPeriodReadiness(accountant, periodId, after)
    expect(readiness.ready).toBe(false)
    expect(readiness.checks.find((check) => check.key === 'no_open_payouts')).toMatchObject({ passed: false })
    expect(readiness.openPayoutBatches.map((batch) => batch.name)).toEqual(['รอบจ่ายค้าง ส.ค.'])
    await expectCode(() => accounting.sendPeriod(ctx(), periodId, reason, after), 'PERIOD_HAS_OPEN_PAYOUTS')

    await db().$executeRawUnsafe(`UPDATE payout_batches SET status = 'completed' WHERE id = '${open}'`)
    const sent = await accounting.sendPeriod(ctx(), periodId, reason, after)
    expect(sent.status).toBe('sent_to_accountant')

    // รอบจ่ายค้างที่เกิดหลังส่งแล้ว (งวดยังไม่ล็อก) ⇒ ล็อกไม่ได้ — ทางลัด dev (วันจำลอง) ก็ผ่านยามเดียวกัน
    const late = await seedPayoutBatch('รอบจ่ายตกค้าง', 'checking', '2026-08-25T03:00:00Z')
    await expectCode(() => accounting.lockPeriod(ctx(), periodId, reason, after), 'PERIOD_HAS_OPEN_PAYOUTS')
    await expectCode(
      () => accounting.lockPeriod(ctx(), periodId, reason, new Date('2026-08-20T03:00:00Z'), { simulatedNow: after }),
      'PERIOD_HAS_OPEN_PAYOUTS',
    )
    await db().$executeRawUnsafe(`UPDATE payout_batches SET status = 'cancelled', cancelled_at = now(), cancelled_by = '${ACCOUNTING_ID}', cancel_reason = 'ทดสอบ' WHERE id = '${late}'`)
    const locked = await accounting.lockPeriod(ctx(), periodId, reason, after)
    expect(locked.status).toBe('locked')
  })

  it('Final Test ด่าน 6 — กดส่ง/ล็อกงวดพร้อมกัน 2 คำขอ ⇒ เปลี่ยนสถานะได้ครั้งเดียว · อีกคำขอ PERIOD_INVALID_STATUS · audit แถวเดียว', async () => {
    const after = new Date('2026-09-02T03:00:00Z')
    const periodId = await seedPeriod()

    const sends = await Promise.allSettled([
      accounting.sendPeriod(ctx(), periodId, reason, after),
      accounting.sendPeriod(ctx(), periodId, reason, after),
    ])
    expect(sends.filter((r) => r.status === 'fulfilled')).toHaveLength(1)
    const sendRejected = sends.filter((r): r is PromiseRejectedResult => r.status === 'rejected')
    expect(sendRejected.map((r) => codeOf(r.reason))).toEqual(['PERIOD_INVALID_STATUS'])

    const locks = await Promise.allSettled([
      accounting.lockPeriod(ctx(), periodId, reason, after),
      accounting.lockPeriod(ctx(), periodId, reason, after),
    ])
    expect(locks.filter((r) => r.status === 'fulfilled')).toHaveLength(1)
    const lockRejected = locks.filter((r): r is PromiseRejectedResult => r.status === 'rejected')
    expect(lockRejected.map((r) => codeOf(r.reason))).toEqual(['PERIOD_INVALID_STATUS'])

    const audits = await db().auditLog.findMany({
      where: { organizationId: ORG_ID, targetType: 'accounting_periods', targetId: periodId },
      select: { action: true },
    })
    expect(audits.filter((a) => a.action === 'lock')).toHaveLength(1)
    expect(audits.filter((a) => a.action === 'status_change')).toHaveLength(1)
  })

  it('มติ PO U65: ทางลัด dev ส่ง/ล็อกด้วยวันจำลอง — ผ่านยามสิ้นเดือน · เวลาที่บันทึกเป็นเวลาจริง · audit ติด [จำลองวันที่]', async () => {
    const realNow = new Date('2026-08-20T03:00:00Z') // 20/08/2569 — งวด ส.ค. ยังไม่สิ้นเดือน
    const simulation = { simulatedNow: new Date('2026-09-01T05:00:00Z') } // 01/09/2569 เที่ยงวันไทย

    const periodId = await seedPeriod()
    await expectCode(() => accounting.sendPeriod(ctx(), periodId, reason, realNow), 'PERIOD_NOT_ENDED')

    const sent = await accounting.sendPeriod(ctx(), periodId, reason, realNow, simulation)
    expect(sent.status).toBe('sent_to_accountant')
    const locked = await accounting.lockPeriod(ctx(), periodId, reason, realNow, simulation)
    expect(locked.status).toBe('locked')

    const row = await db().accountingPeriod.findUniqueOrThrow({
      where: { id: periodId },
      select: { sentAt: true, lockedAt: true },
    })
    expect(row.sentAt?.toISOString()).toBe(realNow.toISOString())
    expect(row.lockedAt?.toISOString()).toBe(realNow.toISOString())

    const audits = await db().auditLog.findMany({
      where: { organizationId: ORG_ID, targetType: 'accounting_periods', targetId: periodId },
      select: { action: true, reason: true, afterData: true },
      orderBy: { createdAt: 'asc' },
    })
    expect(audits.map((audit) => audit.action)).toEqual(['status_change', 'lock'])
    for (const audit of audits) {
      expect(audit.reason).toBe(`${reason.reason} [จำลองวันที่ 01/09/2569]`)
      expect(audit.afterData).toMatchObject({ simulated_as_of: '[จำลองวันที่ 01/09/2569]' })
    }
  })

  it('มติ PO U65: production ไม่อ่านวันจำลองเลย (กันชั้นที่สองต่อจาก route 404)', async () => {
    vi.stubEnv('NODE_ENV', 'production')
    try {
      const periodId = await seedPeriod()
      await expectCode(
        () =>
          accounting.sendPeriod(ctx(), periodId, reason, new Date('2026-08-20T03:00:00Z'), {
            simulatedNow: new Date('2026-09-01T05:00:00Z'),
          }),
        'PERIOD_NOT_ENDED',
      )
    } finally {
      vi.unstubAllEnvs()
    }
  })

  it('ปลดล็อกโดยบัญชี ⇒ UNLOCK_REQUIRES_EXECUTIVE · ผู้บริหารทำได้และกลับไป sent_to_accountant', async () => {
    const periodId = await seedPeriod('sent_to_accountant')
    const locked = await accounting.lockPeriod(ctx(), periodId, reason)
    expect(locked.status).toBe('locked')

    await expectCode(
      () => accounting.unlockPeriod(ctx(), periodId, { reason: 'ขอแก้ยอดเพิ่ม' }),
      'UNLOCK_REQUIRES_EXECUTIVE',
    )

    const unlocked = await accounting.unlockPeriod(ctx(executive), periodId, {
      reason: 'พบรายการตกหล่นของไฟแนนซ์ A ต้องแก้ผ่าน Adjustment',
    })
    expect(unlocked.status).toBe('sent_to_accountant')
    expect(unlocked.lockedAt).toBeNull()

    const audits = await periodAuditRows(periodId)
    expect(audits.map((row) => row.action)).toEqual(['lock', 'unlock'])
    expect(audits.at(-1)?.reason).toContain('Adjustment')
    expect(audits.at(-1)?.actorRole).toBe('บริหาร')
  })

  it('ข้ามขั้น collecting → locked ไม่ได้ (`23` §6.13)', async () => {
    const periodId = await seedPeriod()
    await expectCode(() => accounting.lockPeriod(ctx(), periodId, reason), 'PERIOD_INVALID_STATUS')
  })

  it('บัญชีส่งบัญชีรอบที่ `locked` ไม่ได้ — กันปลดล็อกอ้อมโดยไม่ผ่านผู้บริหาร (`30` §10)', async () => {
    const periodId = await seedPeriod('sent_to_accountant')
    await accounting.lockPeriod(ctx(), periodId, reason)

    await expectCode(() => accounting.sendPeriod(ctx(), periodId, reason), 'PERIOD_INVALID_STATUS')

    // รอบต้องยังปิดอยู่จริง และ `locked_at` ต้องไม่ถูกทิ้งค้างไว้แบบสถานะไม่ตรง
    const after = await db().accountingPeriod.findUniqueOrThrow({ where: { id: periodId } })
    expect(after.status).toBe('locked')
    expect(after.lockedAt).not.toBeNull()
  })

  it('ผู้บริหารปลดล็อกรอบที่ยัง `collecting` ไม่ได้ — กันข้าม Readiness Check (`24` §6.7)', async () => {
    const periodId = await seedPeriod()

    await expectCode(
      () => accounting.unlockPeriod(ctx(executive), periodId, { reason: 'ขอส่งเลยไม่ต้องเช็ค' }),
      'PERIOD_INVALID_STATUS',
    )

    const after = await db().accountingPeriod.findUniqueOrThrow({ where: { id: periodId } })
    expect(after.status).toBe('collecting')
    expect(after.sentAt).toBeNull()
  })
})

suite('Phase 4.1 — Period Lock guard (`13` §6.11 · interceptor)', () => {
  beforeEach(cleanup)

  it('งวด locked ⇒ บันทึกรายการเบิกของงวดนั้นไม่ได้ (PERIOD_LOCKED_DIRECT_EDIT)', async () => {
    await seedPeriod('locked')

    await expectCode(
      () =>
        claims.createManualClaim(ctx(), {
          claimType: 'manual',
          grossSatang: 250_00,
          expenseDate: new Date('2026-08-20T00:00:00Z'),
          payeeId: null,
          receiptFileUrl: null,
          note: 'ค่าเดินทางเพิ่มเติม',
        }),
      'PERIOD_LOCKED_DIRECT_EDIT',
    )
  })

  it('งวด locked ⇒ สร้างรอบวางบิลของงวดนั้นไม่ได้', async () => {
    await seedPeriod('locked')
    await seedUnbilledRevenue()

    await expectCode(
      () =>
        revenue.createBillingBatch(
          { actor: accountant, meta, reason: 'วางบิลรอบสิงหาคม' },
          {
            companyId: COMPANY_A,
            cutoffDate: new Date('2026-08-31T00:00:00Z'),
            cycleId: null,
            reason: 'วางบิลรอบสิงหาคม',
          },
        ),
      'PERIOD_LOCKED_DIRECT_EDIT',
    )
  })

  it('งวด collecting/ยังไม่เปิดรอบ ⇒ เขียนได้ตามปกติ (ไม่บล็อกเกินจำเป็น)', async () => {
    await seedPeriod('collecting')

    const created = await claims.createManualClaim(ctx(), {
      claimType: 'manual',
      grossSatang: 250_00,
      expenseDate: new Date('2026-08-20T00:00:00Z'),
      payeeId: null,
      receiptFileUrl: null,
      note: 'ค่าเดินทางเพิ่มเติม',
    })
    expect(created.id).toBeTruthy()

    // งวดกันยายนยังไม่เปิด (periodStatus = null) ⇒ นโยบายถือเป็น collecting ⇒ ผ่าน
    const nextMonth = await claims.createManualClaim(ctx(), {
      claimType: 'manual',
      grossSatang: 100_00,
      expenseDate: new Date('2026-09-05T00:00:00Z'),
      payeeId: null,
      receiptFileUrl: null,
      note: 'ค่าเดินทางเดือนถัดไป',
    })
    expect(nextMonth.id).toBeTruthy()
  })

  /**
   * มติ PO 2026-08-15 — `sent_to_accountant` = `directEdit: 'limited'` (`13` §6.11)
   * บล็อกเฉพาะการเขียนที่กระทบยอดที่ส่งไปแล้ว ส่วนงานจัดหมวดที่ไม่ขยับตัวเลขยังทำได้
   */
  it('งวด sent_to_accountant ⇒ การเขียนที่กระทบยอดโดนบล็อก (PERIOD_LOCKED_DIRECT_EDIT)', async () => {
    await seedPeriod('sent_to_accountant')

    await expectCode(
      () =>
        claims.createManualClaim(ctx(), {
          claimType: 'manual',
          grossSatang: 250_00,
          expenseDate: new Date('2026-08-20T00:00:00Z'),
          payeeId: null,
          receiptFileUrl: null,
          note: 'ค่าเดินทางเพิ่มเติม',
        }),
      'PERIOD_LOCKED_DIRECT_EDIT',
    )
  })

  it('งวด sent_to_accountant ⇒ สร้างรอบวางบิลของงวดนั้นไม่ได้ (กระทบยอด)', async () => {
    await seedPeriod('sent_to_accountant')
    await seedUnbilledRevenue()

    await expectCode(
      () =>
        revenue.createBillingBatch(
          { actor: accountant, meta, reason: 'วางบิลรอบสิงหาคม' },
          {
            companyId: COMPANY_A,
            cutoffDate: new Date('2026-08-31T00:00:00Z'),
            cycleId: null,
            reason: 'วางบิลรอบสิงหาคม',
          },
        ),
      'PERIOD_LOCKED_DIRECT_EDIT',
    )
  })
})
