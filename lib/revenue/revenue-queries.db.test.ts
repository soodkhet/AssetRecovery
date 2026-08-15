import { PrismaPg } from '@prisma/adapter-pg'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import type { SessionUser } from '@/lib/auth/types'
import { PrismaClient } from '@/lib/generated/prisma/client'

/**
 * เทสต์ระดับ DB ของ Phase 3.6 — DoD ตาม `19` §16 **ครบทั้ง 8 เคส**:
 *  1. VAT คิดถูกตามอัตรา ณ วันนั้น
 *  2. เปลี่ยนอัตรา VAT ไม่กระทบใบเก่า (snapshot `vat_rate_pct_used`)
 *  3. แก้ Revenue ที่ billed แล้ว ⇒ `EDIT_BILLED_REVENUE`
 *  4. `closed_success` ที่ expense ยังไม่ approved ⇒ ยังไม่มี Revenue
 *  5. `closed_fail` + expense approved + `charge_on_fail` ⇒ Revenue เกิด (ไม่ผ่านคลัง)
 *  6. `closed_success` + expense approved + lot confirmed ⇒ Revenue เกิด
 *  7. lot ยังไม่ confirmed ⇒ ยังไม่เกิด (Warehouse gate)
 *  8. เคสถูกตีกลับก่อนถึงจุดนั้น ⇒ ไม่มี Revenue เลย
 *  + DEC-006/D6: เคส **ไม่มี expense** ก็ยังติด Warehouse gate
 * และกติกาของรอบวางบิล: `NO_REVENUE_TO_BILL` · 1 บริษัท/งวด · ส่งซ้ำไม่ได้ · ลบได้เฉพาะ draft ·
 * AR Aging ตาม bucket ของ `13` · hook รับชำระของไฟล์ 35 (idempotent)
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
  console.warn('[revenue-queries.db.test] ข้ามเทสต์ระดับ DB — ไม่มี TEST_DATABASE_URL (ดู .env.example)')
}

const ORG_ID = '00000000-0000-4000-8000-0000000036a0'
const ROLE_FINANCE = '00000000-0000-4000-8000-0000000036a1'
const ROLE_COMPANY = '00000000-0000-4000-8000-0000000036a2'
const FINANCE_ID = '00000000-0000-4000-8000-0000000036a3'
const COMPANY_USER_ID = '00000000-0000-4000-8000-0000000036a4'
const TEAM_ID = '00000000-0000-4000-8000-0000000036a5'
const COMPANY_A = '00000000-0000-4000-8000-0000000036a6'
const COMPANY_B = '00000000-0000-4000-8000-0000000036a7'
const COMPANY_NOVAT = '00000000-0000-4000-8000-0000000036a8'
const PAYEE_ID = '00000000-0000-4000-8000-0000000036a9'
const AGENT_ID = '00000000-0000-4000-8000-0000000036b0'
const ROLE_AGENT = '00000000-0000-4000-8000-0000000036b1'
const CYCLE_AR_ID = '00000000-0000-4000-8000-0000000036b2'

let client: PrismaClient | null = null
type RevenueQueries = typeof import('@/lib/revenue/queries')
type RevenueService = typeof import('@/lib/warehouse/revenue-service')
let revenue: RevenueQueries
let service: RevenueService
/** client ตัวเดียวกับที่ service ใช้ (ต่อ extension แล้ว) — ต้องใช้ตัวนี้เรียก `tryCreateRevenue()` */
let appPrisma: typeof import('@/lib/prisma').prisma

function db(): PrismaClient {
  if (!url) throw new Error('ไม่มี TEST_DATABASE_URL')
  if (!client) {
    assertLocalTestDatabase(url)
    client = new PrismaClient({ adapter: new PrismaPg({ connectionString: url }) })
  }
  return client
}

const meta = { ipAddress: null, userAgent: null }

const finance: SessionUser = {
  id: FINANCE_ID,
  organizationId: ORG_ID,
  supabaseUid: 'uid-finance-36',
  email: 'finance36@test.local',
  fullName: 'การเงิน 3.6',
  status: 'active',
  roleId: ROLE_FINANCE,
  roleName: 'การเงิน',
  roleGroup: 'system',
  isSuperadmin: false,
  teamId: null,
  companyId: null,
  capabilities: { manage_billing: 'manage' },
  scope: { kind: 'global', teamIds: [], companyId: null, userId: FINANCE_ID },
  loginAt: new Date().toISOString(),
}

/** ผู้ใช้ฝั่งบริษัทไฟแนนซ์ A — ต้องเห็นเฉพาะของบริษัทตัวเอง (`25` §7) */
const companyUser: SessionUser = {
  ...finance,
  id: COMPANY_USER_ID,
  supabaseUid: 'uid-company-36',
  email: 'company36@test.local',
  fullName: 'ผู้ใช้บริษัท A',
  roleId: ROLE_COMPANY,
  roleName: 'ผู้ใช้บริษัทไฟแนนซ์',
  roleGroup: 'finance_company',
  companyId: COMPANY_A,
  capabilities: { view_own_company_data: 'view' },
  scope: { kind: 'company', teamIds: [], companyId: COMPANY_A, userId: COMPANY_USER_ID },
}

const ctx = (reason = 'ทดสอบรอบวางบิล 3.6') => ({ actor: finance, meta, reason })

function codeOf(error: unknown): string {
  return (error as { code?: string }).code ?? String(error)
}

async function expectCode(run: () => Promise<unknown>, code: string): Promise<void> {
  await expect(run()).rejects.toSatisfy((error: unknown) => codeOf(error) === code, `ต้องได้ error code ${code}`)
}

// ── seed helpers ────────────────────────────────────────────────────────────

let seq = 0

interface SeedCaseInput {
  companyId?: string
  outcome?: 'closed_success' | 'closed_fail' | null
  closedAt?: string
  model?: 'SUCCESS_FEE' | 'FLAT' | 'HYBRID'
  baseSatang?: number
  ratePct?: number
  basis?: 'debt_amount' | 'asset_value' | null
  chargeOnFail?: boolean
  debtAmountSatang?: number | null
  assetValueSatang?: number | null
  status?: string
}

/** เคสพร้อม snapshot ค่าบริการ (`10` §9.2) — ค่าเริ่มต้น: SUCCESS_FEE 10% ของมูลหนี้ 10,000 บาท */
async function seedCase(input: SeedCaseInput = {}): Promise<string> {
  seq += 1
  const caseRef = `REV36-${seq}-${Date.now()}`
  const outcome = input.outcome === undefined ? 'closed_success' : input.outcome
  const closedAt = input.closedAt ?? '2026-08-20T03:00:00Z'
  const rows = await db().$queryRawUnsafe<{ id: string }[]>(`
    INSERT INTO cases (
      organization_id, case_ref, case_ref_normalized, company_id, source, status, created_by,
      debtor_name, addr_province, addr_district, asset_kind, asset_description,
      debt_amount_satang, asset_value_satang, assigned_team_id, outcome, closed_at,
      service_fee_model_snapshot, service_fee_base_satang, service_fee_rate_pct,
      service_fee_basis_snapshot, service_fee_charge_on_fail
    ) VALUES (
      '${ORG_ID}', $$${caseRef}$$, $$${caseRef}$$, '${input.companyId ?? COMPANY_A}', 'manual',
      '${input.status ?? 'closed_success'}', '${FINANCE_ID}',
      'ลูกหนี้ ${seq}', 'เชียงใหม่', 'เมือง', 'smartphone', 'iPhone 15',
      ${input.debtAmountSatang === undefined ? 1000000 : (input.debtAmountSatang ?? 'NULL')},
      ${input.assetValueSatang === undefined ? 'NULL' : (input.assetValueSatang ?? 'NULL')},
      '${TEAM_ID}',
      ${outcome === null ? 'NULL' : `'${outcome}'`}, '${closedAt}',
      '${input.model ?? 'SUCCESS_FEE'}', ${input.baseSatang ?? 0}, ${input.ratePct ?? 10},
      ${input.basis === undefined ? `'debt_amount'` : input.basis === null ? 'NULL' : `'${input.basis}'`},
      ${input.chargeOnFail ?? false}
    ) RETURNING id
  `)
  return rows[0]?.id ?? ''
}

async function seedExpense(caseId: string, status: string): Promise<void> {
  await db().$executeRawUnsafe(`
    INSERT INTO expenses (organization_id, case_id, payee_id, expense_type, gross_satang, expense_date, status, created_by)
    VALUES ('${ORG_ID}', '${caseId}', '${PAYEE_ID}', 'commission', 150000, '2026-08-20', '${status}', '${FINANCE_ID}')
  `)
}

/** เครื่องของเคส + ล็อต (ระบุ `lotStatus = null` = ยังไม่เข้าล็อต) */
async function seedAssetInLot(caseId: string, lotStatus: string | null, companyId = COMPANY_A): Promise<void> {
  seq += 1
  let lotId = 'NULL'
  if (lotStatus !== null) {
    // ล็อตที่ `confirmed` **ลบไม่ได้** (trigger `02` §13) ⇒ เลขล็อตจากรันก่อน ๆ ค้างในฐานทดสอบตลอด
    // ⇒ suffix ต้องมีเอนโทรปีพอ ไม่งั้นชน `handover_lots_lot_number_key` แบบสุ่ม (เดิมใช้ ms 3 หลัก)
    const suffix = `${seq}-${Date.now()}-${process.pid}`
    const lot = await db().$queryRawUnsafe<{ id: string }[]>(`
      INSERT INTO handover_lots (organization_id, company_id, lot_number, doc_ref, type, status, created_by)
      VALUES ('${ORG_ID}', '${companyId}', 'LOT-2569-${suffix}', 'DLV-2569-${suffix}',
              'finance_pickup', '${lotStatus}', '${FINANCE_ID}')
      RETURNING id
    `)
    lotId = `'${lot[0]?.id ?? ''}'`
  }
  await db().$executeRawUnsafe(`
    INSERT INTO assets (organization_id, case_id, company_id, lot_id, case_ref, debtor_name, device_desc,
                        serial_contract, asset_status, closed_at, created_by)
    SELECT '${ORG_ID}', '${caseId}', '${companyId}', ${lotId}, case_ref, 'ลูกหนี้', 'iPhone 15',
           'SN36-${seq}', '${lotStatus === 'confirmed' ? 'handed_over' : 'in_custody'}', NOW(), '${FINANCE_ID}'
    FROM cases WHERE id = '${caseId}'
  `)
}

/** เรียก RevenueService ตรง ๆ เหมือนที่ lot confirm / expense approved เรียก (step 4) */
async function runRevenue(caseIds: string[]) {
  return service.tryCreateRevenue(appPrisma, { organizationId: ORG_ID, caseIds, actorId: FINANCE_ID })
}

async function cleanup(): Promise<void> {
  // `audit_logs` ลบไม่ได้แม้ในเทสต์ (immutable 2 ชั้น — `02` §13) ⇒ ทุก assertion อ้าง `target_id`
  // ของรอบที่เพิ่งสร้าง ซึ่งไม่ซ้ำข้ามเทสต์อยู่แล้ว
  const tx = db()
  await tx.$executeRawUnsafe(`DELETE FROM revenues WHERE organization_id = '${ORG_ID}'`)
  // Phase 4.3: ส่งบิลแล้วเกิด `sales_records` ผูกกับรอบวางบิล (`31` §6.1) ⇒ ต้องล้างก่อนรอบวางบิล
  // (ไฟล์นี้ไม่ได้ออกใบกำกับภาษี จึงไม่มีแถว `tax_invoices` มาขวาง — ใบกำกับภาษีลบไม่ได้ตาม `02` §13)
  await tx.$executeRawUnsafe(`DELETE FROM sales_records WHERE organization_id = '${ORG_ID}'`)
  await tx.$executeRawUnsafe(`DELETE FROM billing_batches WHERE organization_id = '${ORG_ID}'`)
  await tx.$executeRawUnsafe(`DELETE FROM expenses WHERE organization_id = '${ORG_ID}'`)
  await tx.$executeRawUnsafe(`DELETE FROM assets WHERE organization_id = '${ORG_ID}'`)
  /**
   * ล็อตที่ `confirmed` ถูก trigger กัน DELETE (`02` §13) — **ต้องปิด trigger เฉพาะตอนล้างข้อมูลเทสต์**
   * เหมือนที่ `warehouse-workflow.db.test.ts` ทำ
   *
   * ⚠️ เดิมไฟล์นี้ปล่อยล็อต confirmed ค้างไว้ ("ลบไม่ได้ก็ปล่อยไป") ผลคือฐานทดสอบสะสมแถวขึ้นเรื่อย ๆ
   *    (พบตอนรีวิว Phase 3: ค้างอยู่ 1,430 แถว) จนเลขที่เอกสารของรันใหม่ไปชนของเก่า ⇒
   *    `handover_lots_lot_number_key` ล้มแบบสุ่มในไฟล์เทสต์ที่ไม่ได้แก้อะไรเลย
   */
  await tx.$executeRawUnsafe(`ALTER TABLE handover_lots DISABLE TRIGGER trg_handover_lots_confirmed_no_delete`)
  try {
    await tx.$executeRawUnsafe(`DELETE FROM handover_lots WHERE organization_id = '${ORG_ID}'`)
  } finally {
    await tx.$executeRawUnsafe(`ALTER TABLE handover_lots ENABLE TRIGGER trg_handover_lots_confirmed_no_delete`)
  }
  await tx.$executeRawUnsafe(`DELETE FROM cases WHERE organization_id = '${ORG_ID}'`)
}

beforeAll(async () => {
  if (!url) return
  process.env.DATABASE_URL = url
  revenue = await import('@/lib/revenue/queries')
  service = await import('@/lib/warehouse/revenue-service')
  appPrisma = (await import('@/lib/prisma')).prisma

  const tx = db()
  await tx.$executeRawUnsafe(`
    INSERT INTO organizations (id, name, tax_id, address)
    VALUES ('${ORG_ID}', 'Phase36Test', '9999999993600', 'ที่อยู่ทดสอบ 3.6') ON CONFLICT (id) DO NOTHING
  `)
  await tx.$executeRawUnsafe(`
    INSERT INTO roles (id, organization_id, name, role_group, is_seed) VALUES
      ('${ROLE_FINANCE}', '${ORG_ID}', 'การเงิน 3.6', 'system', false),
      ('${ROLE_COMPANY}', '${ORG_ID}', 'ผู้ใช้บริษัท 3.6', 'finance_company', false),
      ('${ROLE_AGENT}', '${ORG_ID}', 'พนักงาน 3.6', 'outsource', false)
    ON CONFLICT (id) DO NOTHING
  `)
  await tx.$executeRawUnsafe(`
    INSERT INTO users (id, organization_id, role_id, email, full_name, status) VALUES
      ('${FINANCE_ID}', '${ORG_ID}', '${ROLE_FINANCE}', 'finance36@test.local', 'การเงิน 3.6', 'active'),
      ('${COMPANY_USER_ID}', '${ORG_ID}', '${ROLE_COMPANY}', 'company36@test.local', 'ผู้ใช้บริษัท A', 'active'),
      ('${AGENT_ID}', '${ORG_ID}', '${ROLE_AGENT}', 'agent36@test.local', 'พนักงาน 3.6', 'active')
    ON CONFLICT (id) DO NOTHING
  `)
  await tx.$executeRawUnsafe(`
    INSERT INTO teams (id, organization_id, name, side, provinces, status, created_by)
    VALUES ('${TEAM_ID}', '${ORG_ID}', 'ทีม 3.6', 'outsource', ARRAY['เชียงใหม่'], 'active', '${FINANCE_ID}')
    ON CONFLICT (id) DO NOTHING
  `)
  await tx.$executeRawUnsafe(`
    INSERT INTO payee_profiles (id, organization_id, user_id, payee_type, bank_name, account_name,
                                account_number, national_id, is_verified, created_by)
    VALUES ('${PAYEE_ID}', '${ORG_ID}', '${AGENT_ID}', 'individual', 'ธนาคารกสิกรไทย', 'พนักงาน 3.6',
            '1234509876', '1234509876123', true, '${FINANCE_ID}')
    ON CONFLICT (id) DO NOTHING
  `)
  await tx.$executeRawUnsafe(`
    INSERT INTO finance_companies (id, organization_id, name, short_name, tax_id, vat_mode,
                                   payment_due_days, created_by) VALUES
      ('${COMPANY_A}', '${ORG_ID}', 'ไฟแนนซ์ A 3.6', 'A36', '0105512360001', 'exclude_vat', 30, '${FINANCE_ID}'),
      ('${COMPANY_B}', '${ORG_ID}', 'ไฟแนนซ์ B 3.6', 'B36', '0105512360002', 'exclude_vat', 45, '${FINANCE_ID}'),
      ('${COMPANY_NOVAT}', '${ORG_ID}', 'ไฟแนนซ์ ไม่คิด VAT 3.6', 'N36', '0105512360003', 'no_vat', 30, '${FINANCE_ID}')
    ON CONFLICT (id) DO NOTHING
  `)
  await tx.$executeRawUnsafe(`UPDATE users SET company_id = '${COMPANY_A}' WHERE id = '${COMPANY_USER_ID}'`)
  // `19` §6.3 — 7% ถึง 30/09/2569 แล้ว 10% ตั้งแต่ 01/10/2569
  await tx.$executeRawUnsafe(`
    INSERT INTO vat_rate_history (organization_id, rate_pct, effective_from, effective_to, created_by) VALUES
      ('${ORG_ID}', 7.00, '2020-01-01', '2026-09-30', '${FINANCE_ID}'),
      ('${ORG_ID}', 10.00, '2026-10-01', NULL, '${FINANCE_ID}')
    ON CONFLICT DO NOTHING
  `)
  await tx.$executeRawUnsafe(`
    INSERT INTO billing_payout_cycles (id, organization_id, name, type, cutoff_rule_type, cutoff_dates,
                                       due_rule_type, due_rule_value, due_rule, scope, created_by)
    VALUES ('${CYCLE_AR_ID}', '${ORG_ID}', 'AR รอบวางบิลหลัก 3.6', 'AR', 'month_end', ARRAY[]::INTEGER[],
            'day_of_next_month', 5, 'วันที่ 5 ของเดือนถัดไป', 'ทุกไฟแนนซ์', '${FINANCE_ID}')
    ON CONFLICT (id) DO NOTHING
  `)
  await cleanup()
})

afterAll(async () => {
  if (url) await cleanup()
  await client?.$disconnect()
})

// ════════════════════════════════════════════════════════════════════════════

suite('Phase 3.6 — Revenue trigger (`19` §16 ครบ 8 เคส)', () => {
  beforeEach(cleanup)

  it('T4 — closed_success ที่ expense ยังไม่ approved ⇒ ยังไม่มี Revenue', async () => {
    const caseId = await seedCase()
    await seedExpense(caseId, 'pending_warehouse_confirm')
    await seedAssetInLot(caseId, 'confirmed')

    const result = await runRevenue([caseId])
    expect(result.revenueIdsCreated).toEqual([])
    expect(result.skipped).toEqual([{ caseId, reason: 'expense_not_approved' }])
    expect(await db().revenue.count({ where: { caseId } })).toBe(0)
  })

  it('T6 + T1 — closed_success + expense approved + lot confirmed ⇒ Revenue เกิดพร้อม VAT 7%', async () => {
    const caseId = await seedCase()
    await seedExpense(caseId, 'approved')
    await seedAssetInLot(caseId, 'confirmed')

    const result = await runRevenue([caseId])
    expect(result.eligibleCaseIds).toEqual([caseId])
    expect(result.revenueIdsCreated).toHaveLength(1)

    const row = await db().revenue.findFirstOrThrow({ where: { caseId } })
    // มูลหนี้ 10,000 บาท × 10% = 1,000 บาท (100,000 สตางค์) + VAT 7%
    expect(row.grossSatang).toBe(100_000)
    expect(row.vatSatang).toBe(7_000)
    expect(row.totalSatang).toBe(107_000)
    expect(row.vatRatePctUsed.toNumber()).toBe(7)
    expect(row.feeModelSnapshot).toBe('SUCCESS_FEE')
    expect(row.status).toBe('ready_for_billing')
    expect(row.billingBatchId).toBeNull()
    expect(row.revenueDate.toISOString().slice(0, 10)).toBe('2026-08-20')
  })

  it('T7 — lot ยังไม่ confirmed ⇒ ยังไม่เกิด (Warehouse gate)', async () => {
    const caseId = await seedCase()
    await seedExpense(caseId, 'approved')
    await seedAssetInLot(caseId, 'pending_attach')

    const result = await runRevenue([caseId])
    expect(result.skipped).toEqual([{ caseId, reason: 'warehouse_gate' }])
    expect(await db().revenue.count({ where: { caseId } })).toBe(0)
  })

  it('DEC-006/D6 — เคสไม่มี expense เลย ก็ยังติด Warehouse gate แล้วผ่านเมื่อ lot confirmed', async () => {
    const caseId = await seedCase()
    await seedAssetInLot(caseId, 'pending_attach')
    expect((await runRevenue([caseId])).skipped).toEqual([{ caseId, reason: 'warehouse_gate' }])

    await db().$executeRawUnsafe(`
      UPDATE handover_lots SET status = 'confirmed'
      WHERE id = (SELECT lot_id FROM assets WHERE case_id = '${caseId}')
    `)
    expect((await runRevenue([caseId])).revenueIdsCreated).toHaveLength(1)
  })

  it('T5 — closed_fail + expense approved + charge_on_fail ⇒ เกิดโดยไม่ผ่านคลัง', async () => {
    const caseId = await seedCase({
      outcome: 'closed_fail',
      status: 'closed_fail',
      model: 'FLAT',
      baseSatang: 300_000,
      ratePct: 0,
      basis: null,
      chargeOnFail: true,
    })
    await seedExpense(caseId, 'approved')

    const result = await runRevenue([caseId])
    expect(result.revenueIdsCreated).toHaveLength(1)
    const row = await db().revenue.findFirstOrThrow({ where: { caseId } })
    expect(row.grossSatang).toBe(300_000)
    expect(row.feeModelSnapshot).toBe('FLAT')
  })

  it('closed_fail ของ SUCCESS_FEE ไม่เกิดรายได้', async () => {
    const caseId = await seedCase({ outcome: 'closed_fail', status: 'closed_fail' })
    await seedExpense(caseId, 'approved')
    expect((await runRevenue([caseId])).skipped).toEqual([{ caseId, reason: 'model_excludes_fail' }])
  })

  it('T8 — เคสถูกตีกลับก่อน Revenue เกิด ⇒ ไม่มี Revenue เลย (ไม่ต้องย้อนกลับแก้อะไร)', async () => {
    // ตีกลับ = `assignment_status` กลับไป `needs_revision` · ตัวเคสยัง `active` และ **ไม่มี outcome**
    const caseId = await seedCase({ outcome: null, status: 'active' })
    await seedExpense(caseId, 'superseded')
    await seedAssetInLot(caseId, 'confirmed')

    expect((await runRevenue([caseId])).skipped).toEqual([{ caseId, reason: 'no_outcome' }])
    expect(await db().revenue.count({ where: { caseId } })).toBe(0)
  })

  it('idempotent — เรียกซ้ำกี่รอบก็มี Revenue ใบเดียวต่อ (เคส, รอบติดตาม)', async () => {
    const caseId = await seedCase()
    await seedExpense(caseId, 'approved')
    await seedAssetInLot(caseId, 'confirmed')

    await runRevenue([caseId])
    const second = await runRevenue([caseId])
    expect(second.revenueIdsCreated).toEqual([])
    expect(second.skipped).toEqual([{ caseId, reason: 'already_created' }])
    expect(await db().revenue.count({ where: { caseId } })).toBe(1)
  })

  it('T2 — เปลี่ยนอัตรา VAT ไม่กระทบใบเก่า (คิดจาก revenue_date ของใบตัวเอง)', async () => {
    const oldCase = await seedCase({ closedAt: '2026-09-30T03:00:00Z' })
    const newCase = await seedCase({ closedAt: '2026-10-01T03:00:00Z' })
    for (const caseId of [oldCase, newCase]) {
      await seedExpense(caseId, 'approved')
      await seedAssetInLot(caseId, 'confirmed')
    }

    await runRevenue([oldCase, newCase])
    const before = await db().revenue.findFirstOrThrow({ where: { caseId: oldCase } })
    const after = await db().revenue.findFirstOrThrow({ where: { caseId: newCase } })
    expect(before.vatRatePctUsed.toNumber()).toBe(7)
    expect(before.vatSatang).toBe(7_000)
    expect(after.vatRatePctUsed.toNumber()).toBe(10)
    expect(after.vatSatang).toBe(10_000)
  })

  it('บริษัท no_vat ⇒ VAT 0 + snapshot อัตรา 0 (ไม่ใช่อัตราปัจจุบัน)', async () => {
    const caseId = await seedCase({ companyId: COMPANY_NOVAT })
    await seedExpense(caseId, 'approved')
    await seedAssetInLot(caseId, 'confirmed', COMPANY_NOVAT)

    await runRevenue([caseId])
    const row = await db().revenue.findFirstOrThrow({ where: { caseId } })
    expect(row.vatSatang).toBe(0)
    expect(row.totalSatang).toBe(100_000)
    expect(row.vatRatePctUsed.toNumber()).toBe(0)
  })

  it('เคสที่ยังไม่มีฐานคำนวณ ⇒ ข้ามพร้อมเหตุผล `missing_basis` ไม่เดายอดเป็น 0', async () => {
    const caseId = await seedCase({ basis: 'asset_value', assetValueSatang: null })
    await seedExpense(caseId, 'approved')
    await seedAssetInLot(caseId, 'confirmed')

    const result = await runRevenue([caseId])
    expect(result.revenueIdsCreated).toEqual([])
    expect(result.eligibleCaseIds).toEqual([])
    expect(result.skipped).toEqual([{ caseId, reason: 'missing_basis' }])
  })

  it('ไม่มีอัตรา VAT ครอบ revenue_date ⇒ VAT_RATE_NOT_FOUND (ห้าม fallback 7%)', async () => {
    const caseId = await seedCase({ closedAt: '2019-06-01T03:00:00Z' })
    await seedExpense(caseId, 'approved')
    await seedAssetInLot(caseId, 'confirmed')

    await expectCode(() => runRevenue([caseId]), 'VAT_RATE_NOT_FOUND')
    expect(await db().revenue.count({ where: { caseId } })).toBe(0)
  })

  it('หลายเคสในล็อตเดียว — เคสที่ติดด่านไม่ฉุดเคสที่พร้อม', async () => {
    const ready = await seedCase()
    await seedExpense(ready, 'approved')
    await seedAssetInLot(ready, 'confirmed')
    const blocked = await seedCase()
    await seedExpense(blocked, 'pending_approval')
    await seedAssetInLot(blocked, 'confirmed')

    const result = await runRevenue([ready, blocked])
    expect(result.eligibleCaseIds).toEqual([ready])
    expect(result.skipped).toEqual([{ caseId: blocked, reason: 'expense_not_approved' }])
  })
})

// ════════════════════════════════════════════════════════════════════════════

/** เคสพร้อมวางบิล 1 ใบ (คืนยอด total) */
async function seedBillableRevenue(companyId = COMPANY_A, closedAt = '2026-08-20T03:00:00Z'): Promise<string> {
  const caseId = await seedCase({ companyId, closedAt })
  await seedExpense(caseId, 'approved')
  await seedAssetInLot(caseId, 'confirmed', companyId)
  await runRevenue([caseId])
  return caseId
}

const CUTOFF = new Date(Date.UTC(2026, 7, 31))

suite('Phase 3.6 — Billing Batch (`19` §9/§10/§11)', () => {
  beforeEach(cleanup)

  it('สร้างรอบวางบิล = รวมรายได้ของบริษัทในงวด + เปลี่ยนสถานะเป็น billed', async () => {
    await seedBillableRevenue()
    await seedBillableRevenue()

    const batch = await revenue.createBillingBatch(ctx(), {
      companyId: COMPANY_A,
      cutoffDate: CUTOFF,
      cycleId: null,
      reason: 'วางบิลรอบสิงหาคม',
    })

    expect(batch.period).toBe('สิงหาคม 2569')
    expect(batch.status).toBe('draft')
    expect(batch.revenueCount).toBe(2)
    expect(batch.totalSatang).toBe(214_000)
    expect(batch.outstandingSatang).toBe(214_000)
    // ไม่ระบุรอบบิล ⇒ Net 30 วันจาก `payment_due_days` ของบริษัท (31/08 + 30 = 30/09)
    expect(batch.dueDate).toBe('2026-09-30')
    expect(batch.revenues.every((row) => row.status === 'billed')).toBe(true)
  })

  it('เลือกรอบบิล AR ⇒ วันครบกำหนดมาจาก due_rule ของรอบนั้น (วันที่ 5 ของเดือนถัดไป)', async () => {
    await seedBillableRevenue()
    const batch = await revenue.createBillingBatch(ctx(), {
      companyId: COMPANY_A,
      cutoffDate: CUTOFF,
      cycleId: CYCLE_AR_ID,
      reason: 'วางบิลตามรอบ AR',
    })
    expect(batch.dueDate).toBe('2026-09-05')
  })

  it('`NO_REVENUE_TO_BILL` — ไม่มีรายได้ที่พร้อมวางบิลในงวด', async () => {
    await expectCode(
      () =>
        revenue.createBillingBatch(ctx(), {
          companyId: COMPANY_A,
          cutoffDate: CUTOFF,
          cycleId: null,
          reason: 'วางบิลรอบว่าง',
        }),
      'NO_REVENUE_TO_BILL',
    )
    expect(await db().billingBatch.count({ where: { organizationId: ORG_ID } })).toBe(0)
  })

  it('รายได้ของอีกบริษัทไม่ถูกดึงเข้ารอบ (1 รอบ = 1 บริษัท)', async () => {
    await seedBillableRevenue(COMPANY_A)
    await seedBillableRevenue(COMPANY_B)

    const batch = await revenue.createBillingBatch(ctx(), {
      companyId: COMPANY_A,
      cutoffDate: CUTOFF,
      cycleId: null,
      reason: 'วางบิลเฉพาะ A',
    })
    expect(batch.revenueCount).toBe(1)
    expect(batch.revenues.every((row) => row.companyId === COMPANY_A)).toBe(true)
  })

  it('รายได้นอกงวด (เดือนก่อนหน้า) ไม่ถูกดึงเข้ารอบเดือนนี้', async () => {
    await seedBillableRevenue(COMPANY_A, '2026-07-20T03:00:00Z')
    await expectCode(
      () =>
        revenue.createBillingBatch(ctx(), {
          companyId: COMPANY_A,
          cutoffDate: CUTOFF,
          cycleId: null,
          reason: 'วางบิลรอบสิงหาคม',
        }),
      'NO_REVENUE_TO_BILL',
    )
  })

  it('1 บริษัท 1 งวด = 1 รอบ — สร้างซ้ำงวดเดิมไม่ได้', async () => {
    await seedBillableRevenue()
    await revenue.createBillingBatch(ctx(), {
      companyId: COMPANY_A,
      cutoffDate: CUTOFF,
      cycleId: null,
      reason: 'วางบิลรอบสิงหาคม',
    })
    await seedBillableRevenue()
    await expectCode(
      () =>
        revenue.createBillingBatch(ctx(), {
          companyId: COMPANY_A,
          cutoffDate: CUTOFF,
          cycleId: null,
          reason: 'วางบิลรอบสิงหาคมซ้ำ',
        }),
      'BILLING_BATCH_INVALID_STATUS',
    )
  })

  it('ส่งบิล draft → sent + ลง audit พร้อม reason · ส่งซ้ำไม่ได้', async () => {
    await seedBillableRevenue()
    const created = await revenue.createBillingBatch(ctx(), {
      companyId: COMPANY_A,
      cutoffDate: CUTOFF,
      cycleId: null,
      reason: 'วางบิลรอบสิงหาคม',
    })

    const sent = await revenue.sendBillingBatch(
      { actor: finance, meta, reason: 'ส่งใบวางบิลให้ไฟแนนซ์ A' },
      created.id,
      { reason: 'ส่งใบวางบิลให้ไฟแนนซ์ A' },
    )
    expect(sent.status).toBe('sent')
    expect(sent.sentAt).not.toBeNull()

    const audit = await db().auditLog.findFirst({
      where: { targetType: 'billing_batches', targetId: created.id, action: 'status_change' },
    })
    expect(audit?.reason).toBe('ส่งใบวางบิลให้ไฟแนนซ์ A')

    await expectCode(
      () =>
        revenue.sendBillingBatch({ actor: finance, meta, reason: 'ส่งซ้ำ' }, created.id, { reason: 'ส่งซ้ำ' }),
      'BILLING_BATCH_INVALID_STATUS',
    )
  })

  it('T3 — แก้ยอด Revenue ที่อยู่ในรอบที่ส่งแล้ว ⇒ EDIT_BILLED_REVENUE (รอบ draft ยังแก้ได้)', async () => {
    await seedBillableRevenue()
    const created = await revenue.createBillingBatch(ctx(), {
      companyId: COMPANY_A,
      cutoffDate: CUTOFF,
      cycleId: null,
      reason: 'วางบิลรอบสิงหาคม',
    })
    const revenueId = created.revenues[0]?.id ?? ''
    await expect(revenue.assertRevenueAmountEditable(finance, revenueId)).resolves.toBeUndefined()

    await revenue.sendBillingBatch({ actor: finance, meta, reason: 'ส่งใบวางบิล' }, created.id, {
      reason: 'ส่งใบวางบิล',
    })
    await expectCode(() => revenue.assertRevenueAmountEditable(finance, revenueId), 'EDIT_BILLED_REVENUE')
  })

  it('`19` §10 — ลบได้เฉพาะ draft และรายได้ถูกปล่อยกลับเป็น ready_for_billing', async () => {
    await seedBillableRevenue()
    const created = await revenue.createBillingBatch(ctx(), {
      companyId: COMPANY_A,
      cutoffDate: CUTOFF,
      cycleId: null,
      reason: 'วางบิลรอบสิงหาคม',
    })

    const deleted = await revenue.deleteBillingBatch(
      { actor: finance, meta, reason: 'ยกเลิกรอบเพราะยอดไม่ตรง' },
      created.id,
      { reason: 'ยกเลิกรอบเพราะยอดไม่ตรง' },
    )
    expect(deleted.revenueIdsReleased).toHaveLength(1)

    const released = await db().revenue.findFirstOrThrow({ where: { id: deleted.revenueIdsReleased[0] } })
    expect(released.status).toBe('ready_for_billing')
    expect(released.billingBatchId).toBeNull()
    expect(await revenue.listBillingBatches(finance, { status: 'all' })).toHaveLength(0)
  })

  it('ลบรอบที่ส่งไปแล้วไม่ได้', async () => {
    await seedBillableRevenue()
    const created = await revenue.createBillingBatch(ctx(), {
      companyId: COMPANY_A,
      cutoffDate: CUTOFF,
      cycleId: null,
      reason: 'วางบิลรอบสิงหาคม',
    })
    await revenue.sendBillingBatch({ actor: finance, meta, reason: 'ส่งใบวางบิล' }, created.id, {
      reason: 'ส่งใบวางบิล',
    })

    await expectCode(
      () =>
        revenue.deleteBillingBatch({ actor: finance, meta, reason: 'ขอลบทีหลัง' }, created.id, {
          reason: 'ขอลบทีหลัง',
        }),
      'BILLING_BATCH_INVALID_STATUS',
    )
  })

  it('scope — ผู้ใช้บริษัท A เห็นเฉพาะรายได้/รอบของตัวเอง และเปิดของบริษัทอื่นไม่ได้', async () => {
    await seedBillableRevenue(COMPANY_A)
    await seedBillableRevenue(COMPANY_B)
    const batchB = await revenue.createBillingBatch(ctx(), {
      companyId: COMPANY_B,
      cutoffDate: CUTOFF,
      cycleId: null,
      reason: 'วางบิล B',
    })

    const visible = await revenue.listRevenues(companyUser, { status: 'all', unbilledOnly: false })
    expect(visible).toHaveLength(1)
    expect(visible[0]?.companyId).toBe(COMPANY_A)

    expect(await revenue.listBillingBatches(companyUser, { status: 'all' })).toHaveLength(0)
    await expectCode(() => revenue.getBillingBatch(companyUser, batchB.id), 'BILLING_BATCH_NOT_FOUND')
  })

  it('ตัวกรอง unbilledOnly — รายการรายได้ดิบที่ยังไม่ถูกรวมเข้ารอบ (`19` §8)', async () => {
    await seedBillableRevenue()
    await revenue.createBillingBatch(ctx(), {
      companyId: COMPANY_A,
      cutoffDate: CUTOFF,
      cycleId: null,
      reason: 'วางบิลรอบสิงหาคม',
    })
    await seedBillableRevenue()

    expect(await revenue.listRevenues(finance, { status: 'all', unbilledOnly: true })).toHaveLength(1)
    expect(await revenue.listRevenues(finance, { status: 'all', unbilledOnly: false })).toHaveLength(2)
  })
})

// ════════════════════════════════════════════════════════════════════════════

suite('Phase 3.6 — AR Aging + รับชำระ (`19` §6.4/§9.2)', () => {
  beforeEach(cleanup)

  async function seedSentBatch(companyId = COMPANY_A): Promise<string> {
    await seedBillableRevenue(companyId)
    const created = await revenue.createBillingBatch(ctx(), {
      companyId,
      cutoffDate: CUTOFF,
      cycleId: null,
      reason: 'วางบิลรอบสิงหาคม',
    })
    await revenue.sendBillingBatch({ actor: finance, meta, reason: 'ส่งใบวางบิล' }, created.id, {
      reason: 'ส่งใบวางบิล',
    })
    return created.id
  }

  it('บิลที่ยัง draft ไม่นับเป็นลูกหนี้ — ส่งแล้วจึงเข้ารายงาน', async () => {
    await seedBillableRevenue()
    const created = await revenue.createBillingBatch(ctx(), {
      companyId: COMPANY_A,
      cutoffDate: CUTOFF,
      cycleId: null,
      reason: 'วางบิลรอบสิงหาคม',
    })
    expect((await revenue.getArAging(finance, {})).totalOutstandingSatang).toBe(0)

    await revenue.sendBillingBatch({ actor: finance, meta, reason: 'ส่งใบวางบิล' }, created.id, {
      reason: 'ส่งใบวางบิล',
    })
    const report = await revenue.getArAging(finance, {})
    expect(report.totalOutstandingSatang).toBe(107_000)
    expect(report.companies[0]?.companyId).toBe(COMPANY_A)
  })

  it('ช่วงอายุหนี้มาจาก `ar_aging_buckets` ของ `13` (ค่าเริ่มต้น 30/60/90) — เลย 100 วันตกช่วงสุดท้าย', async () => {
    await seedSentBatch()
    // ครบกำหนด 30/09/2569 · ดูรายงาน 09/01/2570 = เลยกำหนด 101 วัน
    const report = await revenue.getArAging(finance, { asOf: new Date(Date.UTC(2027, 0, 9)) })
    expect(report.buckets).toHaveLength(4)
    expect(report.buckets[3]?.label).toBe('90+ วัน')
    expect(report.buckets[3]?.outstandingSatang).toBe(107_000)
    expect(report.buckets[0]?.outstandingSatang).toBe(0)
  })

  it('ยังไม่ถึงกำหนดชำระ = อยู่ช่วงแรกเสมอ', async () => {
    await seedSentBatch()
    const report = await revenue.getArAging(finance, { asOf: new Date(Date.UTC(2026, 8, 1)) })
    expect(report.buckets[0]?.outstandingSatang).toBe(107_000)
  })

  it('hook ไฟล์ 35 — รับบางส่วน ⇒ partially_paid · รับครบ ⇒ paid · ยิงซ้ำ idempotent', async () => {
    const batchId = await seedSentBatch()

    const partial = await revenue.applyBillingReceipt({
      organizationId: ORG_ID,
      batchId,
      receivedSatang: 50_000,
      sourceRef: 'BANKTX-001',
      actorId: null,
      actorRole: 'system',
    })
    expect(partial.status).toBe('partially_paid')
    expect(partial.outstandingSatang).toBe(57_000)

    // ยิงซ้ำด้วยยอดเดิม = ไม่เปลี่ยนอะไรและไม่ลง audit ซ้ำ
    const auditBefore = await db().auditLog.count({ where: { targetId: batchId, action: 'update' } })
    await revenue.applyBillingReceipt({
      organizationId: ORG_ID,
      batchId,
      receivedSatang: 50_000,
      sourceRef: 'BANKTX-001',
      actorId: null,
      actorRole: 'system',
    })
    expect(await db().auditLog.count({ where: { targetId: batchId, action: 'update' } })).toBe(auditBefore)

    const full = await revenue.applyBillingReceipt({
      organizationId: ORG_ID,
      batchId,
      receivedSatang: 107_000,
      sourceRef: 'BANKTX-002',
      actorId: null,
      actorRole: 'system',
    })
    expect(full.status).toBe('paid')
    expect(full.outstandingSatang).toBe(0)
    expect((await revenue.getArAging(finance, {})).totalOutstandingSatang).toBe(0)
  })

  it('A1 — ลูกค้าหัก WHT ไว้ ถือว่ารับครบ (ไม่ค้างเป็นหนี้ตลอดกาล)', async () => {
    const batchId = await seedSentBatch()
    const result = await revenue.applyBillingReceipt({
      organizationId: ORG_ID,
      batchId,
      receivedSatang: 104_000,
      whtWithheldByCustomerSatang: 3_000,
      sourceRef: 'BANKTX-003',
      actorId: null,
      actorRole: 'system',
    })
    expect(result.status).toBe('paid')
    expect((await revenue.getArAging(finance, {})).totalOutstandingSatang).toBe(0)
  })
})
