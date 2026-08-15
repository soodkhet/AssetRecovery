import { PrismaPg } from '@prisma/adapter-pg'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import type { SessionUser } from '@/lib/auth/types'
import { PrismaClient } from '@/lib/generated/prisma/client'

/**
 * เทสต์ระดับ DB ของ Phase 3.7 — DoD ของไฟล์ 20:
 *  - §16 เคส 1: การเงินอนุมัติรายการของรอบ `locked` ⇒ `INSUFFICIENT_APPROVAL_LEVEL`
 *  - §16 เคส 2: สร้างโดยไม่กรอกเหตุผล ⇒ `REASON_REQUIRED`
 *  - §16 เคส 3: ปฏิเสธโดยไม่กรอกเหตุผล ⇒ `REJECTION_REASON_REQUIRED`
 *  - DEC-004: CHECK `adjustments_one_target` (exactly-one) บังคับจริงระดับ DB
 *  - §6.2/§7.1: snapshot `period_status_at_target` ณ ตอนสร้าง แล้วใช้ตัดสินระดับอนุมัติ
 *    (collecting = การเงินคนเดียว · sent_to_accountant = การเงิน + บริหาร · locked = บริหาร + audit แยก)
 *  - §6.1: ไม่แตะ source record เลย
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
  console.warn('[adjustments.db.test] ข้ามเทสต์ระดับ DB — ไม่มี TEST_DATABASE_URL (ดู .env.example)')
}

const ORG_ID = '00000000-0000-4000-8000-0000000037a0'
const ROLE_FINANCE = '00000000-0000-4000-8000-0000000037a1'
const ROLE_EXEC = '00000000-0000-4000-8000-0000000037a2'
const FINANCE_ID = '00000000-0000-4000-8000-0000000037a3'
const EXEC_ID = '00000000-0000-4000-8000-0000000037a4'
const TEAM_ID = '00000000-0000-4000-8000-0000000037a5'
const COMPANY_A = '00000000-0000-4000-8000-0000000037a6'
const PAYEE_ID = '00000000-0000-4000-8000-0000000037a7'
const AGENT_ID = '00000000-0000-4000-8000-0000000037a8'
const ROLE_AGENT = '00000000-0000-4000-8000-0000000037a9'

let client: PrismaClient | null = null
type AdjustmentQueries = typeof import('@/lib/adjustments/queries')
let adjustments: AdjustmentQueries

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
  supabaseUid: 'uid-finance-37',
  email: 'finance37@test.local',
  fullName: 'การเงิน 3.7',
  status: 'active',
  roleId: ROLE_FINANCE,
  roleName: 'การเงิน',
  roleGroup: 'system',
  isSuperadmin: false,
  teamId: null,
  companyId: null,
  capabilities: { create_adjustment: 'manage', approve_adjustment: 'manage', manage_billing: 'manage' },
  scope: { kind: 'global', teamIds: [], companyId: null, userId: FINANCE_ID },
  loginAt: new Date().toISOString(),
}

/** ผู้บริหาร — ถือ `approve_adjustment_locked` (1 ใน 9 capability ที่ล็อกไว้) */
const executive: SessionUser = {
  ...finance,
  id: EXEC_ID,
  supabaseUid: 'uid-exec-37',
  email: 'exec37@test.local',
  fullName: 'ผู้บริหาร 3.7',
  roleId: ROLE_EXEC,
  roleName: 'บริหาร',
  capabilities: { approve_adjustment: 'manage', approve_adjustment_locked: 'manage' },
  scope: { kind: 'global', teamIds: [], companyId: null, userId: EXEC_ID },
}

const ctx = (actor: SessionUser = finance) => ({ actor, meta })

function codeOf(error: unknown): string {
  return (error as { code?: string }).code ?? String(error)
}

async function expectCode(run: () => Promise<unknown>, code: string): Promise<void> {
  await expect(run()).rejects.toSatisfy((error: unknown) => codeOf(error) === code, `ต้องได้ error code ${code}`)
}

// ── seed helpers ────────────────────────────────────────────────────────────

let seq = 0

/** รายได้ 1 ใบของเคสที่ปิดแล้ว — `revenue_date` คุมว่ารายการอยู่งวดบัญชีไหน */
async function seedRevenue(revenueDate = '2026-08-20'): Promise<string> {
  seq += 1
  const caseRef = `ADJ37-${seq}-${Date.now()}`
  const rows = await db().$queryRawUnsafe<{ id: string }[]>(`
    WITH new_case AS (
      INSERT INTO cases (
        organization_id, case_ref, case_ref_normalized, company_id, source, status, created_by,
        debtor_name, addr_province, addr_district, asset_kind, asset_description,
        debt_amount_satang, assigned_team_id, outcome, closed_at,
        service_fee_model_snapshot, service_fee_base_satang, service_fee_rate_pct, service_fee_basis_snapshot
      ) VALUES (
        '${ORG_ID}', $$${caseRef}$$, $$${caseRef}$$, '${COMPANY_A}', 'manual', 'closed_success', '${FINANCE_ID}',
        'ลูกหนี้ ${seq}', 'เชียงใหม่', 'เมือง', 'smartphone', 'iPhone 15',
        1000000, '${TEAM_ID}', 'closed_success', '${revenueDate}T03:00:00Z',
        'SUCCESS_FEE', 0, 10, 'debt_amount'
      ) RETURNING id
    )
    INSERT INTO revenues (organization_id, case_id, company_id, gross_satang, vat_satang, vat_rate_pct_used,
                          total_satang, fee_model_snapshot, status, revenue_date, created_by)
    SELECT '${ORG_ID}', id, '${COMPANY_A}', 100000, 7000, 7.00, 107000, 'SUCCESS_FEE', 'ready_for_billing',
           '${revenueDate}', '${FINANCE_ID}'
    FROM new_case
    RETURNING id
  `)
  return rows[0]?.id ?? ''
}

async function seedExpense(): Promise<string> {
  const rows = await db().$queryRawUnsafe<{ id: string }[]>(`
    INSERT INTO expenses (organization_id, payee_id, expense_type, gross_satang, expense_date, status, created_by)
    VALUES ('${ORG_ID}', '${PAYEE_ID}', 'commission', 150000, '2026-08-20', 'approved', '${FINANCE_ID}')
    RETURNING id
  `)
  return rows[0]?.id ?? ''
}

/** งวดบัญชีของเดือน 8/2569 (สิงหาคม 2026) ตามสถานะที่ต้องการทดสอบ */
async function seedPeriod(status: 'collecting' | 'sent_to_accountant' | 'locked'): Promise<void> {
  await db().$executeRawUnsafe(`
    INSERT INTO accounting_periods (organization_id, period_label, year_be, month, status, created_by)
    VALUES ('${ORG_ID}', 'สิงหาคม 2569', 2569, 8, '${status}', '${FINANCE_ID}')
  `)
}

async function auditRows(adjustmentId: string) {
  return db().auditLog.findMany({
    where: { organizationId: ORG_ID, targetType: 'adjustments', targetId: adjustmentId },
    select: { action: true, actorRole: true, reason: true, afterData: true },
    orderBy: { createdAt: 'asc' },
  })
}

async function cleanup(): Promise<void> {
  // `audit_logs` ลบไม่ได้แม้ในเทสต์ (immutable 2 ชั้น — `02` §13) ⇒ assertion อ้าง `target_id` ที่ไม่ซ้ำ
  const tx = db()
  await tx.$executeRawUnsafe(`DELETE FROM adjustments WHERE organization_id = '${ORG_ID}'`)
  await tx.$executeRawUnsafe(`DELETE FROM revenues WHERE organization_id = '${ORG_ID}'`)
  await tx.$executeRawUnsafe(`DELETE FROM billing_batches WHERE organization_id = '${ORG_ID}'`)
  await tx.$executeRawUnsafe(`DELETE FROM expenses WHERE organization_id = '${ORG_ID}'`)
  await tx.$executeRawUnsafe(`DELETE FROM cases WHERE organization_id = '${ORG_ID}'`)
  await tx.$executeRawUnsafe(`DELETE FROM accounting_periods WHERE organization_id = '${ORG_ID}'`)
}

beforeAll(async () => {
  if (!url) return
  process.env.DATABASE_URL = url
  adjustments = await import('@/lib/adjustments/queries')

  const tx = db()
  await tx.$executeRawUnsafe(`
    INSERT INTO organizations (id, name, tax_id, address)
    VALUES ('${ORG_ID}', 'Phase37Test', '9999999993700', 'ที่อยู่ทดสอบ 3.7') ON CONFLICT (id) DO NOTHING
  `)
  await tx.$executeRawUnsafe(`
    INSERT INTO roles (id, organization_id, name, role_group, is_seed) VALUES
      ('${ROLE_FINANCE}', '${ORG_ID}', 'การเงิน 3.7', 'system', false),
      ('${ROLE_EXEC}', '${ORG_ID}', 'บริหาร 3.7', 'system', false),
      ('${ROLE_AGENT}', '${ORG_ID}', 'พนักงาน 3.7', 'outsource', false)
    ON CONFLICT (id) DO NOTHING
  `)
  await tx.$executeRawUnsafe(`
    INSERT INTO users (id, organization_id, role_id, email, full_name, status) VALUES
      ('${FINANCE_ID}', '${ORG_ID}', '${ROLE_FINANCE}', 'finance37@test.local', 'การเงิน 3.7', 'active'),
      ('${EXEC_ID}', '${ORG_ID}', '${ROLE_EXEC}', 'exec37@test.local', 'ผู้บริหาร 3.7', 'active'),
      ('${AGENT_ID}', '${ORG_ID}', '${ROLE_AGENT}', 'agent37@test.local', 'พนักงาน 3.7', 'active')
    ON CONFLICT (id) DO NOTHING
  `)
  await tx.$executeRawUnsafe(`
    INSERT INTO teams (id, organization_id, name, side, provinces, status, created_by)
    VALUES ('${TEAM_ID}', '${ORG_ID}', 'ทีม 3.7', 'outsource', ARRAY['เชียงใหม่'], 'active', '${FINANCE_ID}')
    ON CONFLICT (id) DO NOTHING
  `)
  await tx.$executeRawUnsafe(`
    INSERT INTO payee_profiles (id, organization_id, user_id, payee_type, bank_name, account_name,
                                account_number, national_id, is_verified, created_by)
    VALUES ('${PAYEE_ID}', '${ORG_ID}', '${AGENT_ID}', 'individual', 'ธนาคารกสิกรไทย', 'พนักงาน 3.7',
            '1234509870', '1234509870123', true, '${FINANCE_ID}')
    ON CONFLICT (id) DO NOTHING
  `)
  await tx.$executeRawUnsafe(`
    INSERT INTO finance_companies (id, organization_id, name, short_name, tax_id, vat_mode,
                                   payment_due_days, created_by)
    VALUES ('${COMPANY_A}', '${ORG_ID}', 'ไฟแนนซ์ A 3.7', 'A37', '0105512370001', 'exclude_vat', 30, '${FINANCE_ID}')
    ON CONFLICT (id) DO NOTHING
  `)
  await cleanup()
})

afterAll(async () => {
  if (url) await cleanup()
  await client?.$disconnect()
})

// ════════════════════════════════════════════════════════════════════════════

suite('Phase 3.7 — Adjustment: สร้าง + snapshot งวด (`20` §7.1 · §16)', () => {
  beforeEach(cleanup)

  it('สร้างรายการปรับปรุงของรายได้ ⇒ FK ช่องเดียว + snapshot สถานะรอบ + ไม่แตะ source record', async () => {
    const revenueId = await seedRevenue()
    await seedPeriod('collecting')

    const created = await adjustments.createAdjustment(ctx(), {
      targetType: 'revenue',
      targetId: revenueId,
      adjustmentType: 'increase',
      amountSatang: 75_000,
      reason: 'ยอดเดิมคำนวณ % จากฐานผิด ต้องเพิ่ม 750 บาท',
    })

    expect(created.targetType).toBe('revenue')
    expect(created.targetId).toBe(revenueId)
    expect(created.status).toBe('pending_approval')
    expect(created.periodStatusAtTarget).toBe('collecting')
    expect(created.signedSatang).toBe(75_000)
    expect(created.requiredApproverRoles).toEqual(['การเงิน'])

    const row = await db().adjustment.findFirstOrThrow({ where: { id: created.id } })
    expect(row.revenueId).toBe(revenueId)
    expect([row.expenseId, row.billingBatchId, row.payoutBatchId]).toEqual([null, null, null])
    expect(row.amountSatang).toBe(75_000)

    // `20` §6.1 — source record ต้องไม่ถูกแตะเลย
    const revenue = await db().revenue.findFirstOrThrow({ where: { id: revenueId } })
    expect(revenue.grossSatang).toBe(100_000)
    expect(revenue.totalSatang).toBe(107_000)
  })

  it('ยังไม่มีงวดบัญชีของเดือนนั้น ⇒ snapshot `null` และถือเป็น collecting (`13` §6.11)', async () => {
    const revenueId = await seedRevenue()

    const created = await adjustments.createAdjustment(ctx(), {
      targetType: 'revenue',
      targetId: revenueId,
      adjustmentType: 'decrease',
      amountSatang: 5_000,
      reason: 'ปรับลดตามที่ตกลงกับลูกค้า',
    })
    expect(created.periodStatusAtTarget).toBeNull()
    expect(created.requiredApproverRoles).toEqual(['การเงิน'])
  })

  it('เป้าหมายเป็นค่าใช้จ่ายก็ผูก FK คนละช่อง (DEC-004)', async () => {
    const expenseId = await seedExpense()

    const created = await adjustments.createAdjustment(ctx(), {
      targetType: 'expense',
      targetId: expenseId,
      adjustmentType: 'decrease',
      amountSatang: 20_000,
      reason: 'ที่พักจริงต่ำกว่าใบเสร็จที่แนบ',
    })
    const row = await db().adjustment.findFirstOrThrow({ where: { id: created.id } })
    expect(row.expenseId).toBe(expenseId)
    expect([row.revenueId, row.billingBatchId, row.payoutBatchId]).toEqual([null, null, null])
    expect(created.signedSatang).toBe(-20_000)
  })

  it('§16 — ไม่กรอกเหตุผล ⇒ `REASON_REQUIRED` (ไม่มีแถวเกิดขึ้น)', async () => {
    const revenueId = await seedRevenue()
    await expectCode(
      () =>
        adjustments.createAdjustment(ctx(), {
          targetType: 'revenue',
          targetId: revenueId,
          adjustmentType: 'increase',
          amountSatang: 1_000,
          reason: '   ',
        }),
      'REASON_REQUIRED',
    )
    expect(await db().adjustment.count({ where: { organizationId: ORG_ID } })).toBe(0)
  })

  it('อ้างรายการต้นทางที่ไม่มีอยู่ ⇒ `ADJUSTMENT_TARGET_NOT_FOUND`', async () => {
    await expectCode(
      () =>
        adjustments.createAdjustment(ctx(), {
          targetType: 'billing_batch',
          targetId: '00000000-0000-4000-8000-0000000037ff',
          adjustmentType: 'increase',
          amountSatang: 1_000,
          reason: 'ทดสอบเป้าหมายที่ไม่มีอยู่จริง',
        }),
      'ADJUSTMENT_TARGET_NOT_FOUND',
    )
  })

  it('CHECK `adjustments_one_target` บังคับจริงระดับ DB (ใส่ 2 เป้าหมายไม่ผ่าน)', async () => {
    const revenueId = await seedRevenue()
    const expenseId = await seedExpense()
    await expect(
      db().$executeRawUnsafe(`
        INSERT INTO adjustments (organization_id, adjustment_type, amount_satang, reason, revenue_id, expense_id, created_by)
        VALUES ('${ORG_ID}', 'increase', 1000, 'ทดสอบ CHECK', '${revenueId}', '${expenseId}', '${FINANCE_ID}')
      `),
    ).rejects.toThrow(/adjustments_one_target|violates check constraint/i)

    await expect(
      db().$executeRawUnsafe(`
        INSERT INTO adjustments (organization_id, adjustment_type, amount_satang, reason, created_by)
        VALUES ('${ORG_ID}', 'increase', 1000, 'ทดสอบ CHECK ไม่มีเป้าหมาย', '${FINANCE_ID}')
      `),
    ).rejects.toThrow(/adjustments_one_target|violates check constraint/i)
  })
})

suite('Phase 3.7 — ระดับอนุมัติตาม `period_status_at_target` (`20` §6.2 · §16)', () => {
  beforeEach(cleanup)

  async function newAdjustment(period: 'collecting' | 'sent_to_accountant' | 'locked' | null) {
    const revenueId = await seedRevenue()
    if (period !== null) await seedPeriod(period)
    return adjustments.createAdjustment(ctx(), {
      targetType: 'revenue',
      targetId: revenueId,
      adjustmentType: 'increase',
      amountSatang: 50_000,
      reason: 'ปรับยอดตามเอกสารที่ตรวจสอบใหม่',
    })
  }

  it('รอบ collecting — การเงินอนุมัติเองได้ทันที', async () => {
    const created = await newAdjustment('collecting')
    const approved = await adjustments.approveAdjustment(ctx(), created.id, { note: '' })

    expect(approved.status).toBe('approved')
    expect(approved.approvedByName).toBe('การเงิน 3.7')
    expect(approved.approvedRoles).toEqual(['การเงิน'])
    expect(approved.missingApproverRoles).toEqual([])
  })

  it('รอบ sent_to_accountant — การเงินอนุมัติแล้วยังรอผู้บริหาร แล้วจึงครบ', async () => {
    const created = await newAdjustment('sent_to_accountant')
    expect(created.requiredApproverRoles).toEqual(['การเงิน', 'บริหาร'])

    const afterFinance = await adjustments.approveAdjustment(ctx(), created.id, { note: 'ตรวจเอกสารครบแล้ว' })
    expect(afterFinance.status).toBe('pending_approval')
    expect(afterFinance.approvedRoles).toEqual(['การเงิน'])
    expect(afterFinance.missingApproverRoles).toEqual(['บริหาร'])

    // การเงินกดซ้ำไม่ทำให้ครบ (คิวเป็นของอีกบทบาท)
    await expectCode(
      () => adjustments.approveAdjustment(ctx(), created.id, { note: '' }),
      'ADJUSTMENT_INVALID_STATUS',
    )

    const afterExec = await adjustments.approveAdjustment(ctx(executive), created.id, { note: 'อนุมัติ' })
    expect(afterExec.status).toBe('approved')
    expect(afterExec.approvedRoles).toEqual(['การเงิน', 'บริหาร'])
    expect(afterExec.approvedByName).toBe('ผู้บริหาร 3.7')
  })

  it('§16 เคส 1 — รอบ locked: การเงินอนุมัติไม่ได้ ⇒ `INSUFFICIENT_APPROVAL_LEVEL` (สถานะไม่เปลี่ยน)', async () => {
    const created = await newAdjustment('locked')
    expect(created.periodStatusAtTarget).toBe('locked')
    expect(created.requiredApproverRoles).toEqual(['บริหาร'])

    await expectCode(
      () => adjustments.approveAdjustment(ctx(), created.id, { note: '' }),
      'INSUFFICIENT_APPROVAL_LEVEL',
    )
    const row = await db().adjustment.findFirstOrThrow({ where: { id: created.id } })
    expect(row.status).toBe('pending_approval')
    expect(row.approvedBy).toBeNull()
  })

  it('รอบ locked — ผู้บริหารอนุมัติได้ และมี audit log แยกอีกใบ (`20` §6.2)', async () => {
    const created = await newAdjustment('locked')
    const approved = await adjustments.approveAdjustment(ctx(executive), created.id, { note: 'อนุมัติกรณีจำเป็น' })
    expect(approved.status).toBe('approved')

    const logs = await auditRows(created.id)
    expect(logs.map((log) => log.action)).toEqual(['create', 'approve', 'unlock'])
    const separate = logs[2]
    expect(separate?.actorRole).toBe('บริหาร')
    expect(separate?.reason).toContain('รอบบัญชีที่ปิดแล้ว')
  })

  it('งวดถูกปิดหลังสร้างรายการ — ระดับอนุมัติยังยึด snapshot เดิม (`92` §7.1)', async () => {
    const created = await newAdjustment('collecting')
    await db().$executeRawUnsafe(
      `UPDATE accounting_periods SET status = 'locked' WHERE organization_id = '${ORG_ID}'`,
    )

    const approved = await adjustments.approveAdjustment(ctx(), created.id, { note: '' })
    expect(approved.status).toBe('approved')
    expect(approved.periodStatusAtTarget).toBe('collecting')
  })

  it('อนุมัติซ้ำหลังจบแล้ว ⇒ `ADJUSTMENT_INVALID_STATUS` · รายการที่ไม่มีอยู่ ⇒ `ADJUSTMENT_NOT_FOUND`', async () => {
    const created = await newAdjustment('collecting')
    await adjustments.approveAdjustment(ctx(), created.id, { note: '' })

    await expectCode(() => adjustments.approveAdjustment(ctx(), created.id, { note: '' }), 'ADJUSTMENT_INVALID_STATUS')
    await expectCode(
      () => adjustments.approveAdjustment(ctx(), '00000000-0000-4000-8000-0000000037fe', { note: '' }),
      'ADJUSTMENT_NOT_FOUND',
    )
  })
})

suite('Phase 3.7 — ปฏิเสธ (`20` §14 v2.1 · §16 เคส 3)', () => {
  beforeEach(cleanup)

  it('ไม่กรอกเหตุผล ⇒ `REJECTION_REASON_REQUIRED` (สถานะไม่เปลี่ยน)', async () => {
    const revenueId = await seedRevenue()
    const created = await adjustments.createAdjustment(ctx(), {
      targetType: 'revenue',
      targetId: revenueId,
      adjustmentType: 'decrease',
      amountSatang: 10_000,
      reason: 'ปรับลดตามผลตรวจสอบ',
    })

    await expectCode(
      () => adjustments.rejectAdjustment(ctx(), created.id, { rejectionReason: ' ' }),
      'REJECTION_REASON_REQUIRED',
    )
    const row = await db().adjustment.findFirstOrThrow({ where: { id: created.id } })
    expect(row.status).toBe('pending_approval')
  })

  it('ปฏิเสธสำเร็จเป็น terminal + เหตุผลลง audit (`23` §6.9)', async () => {
    const revenueId = await seedRevenue()
    const created = await adjustments.createAdjustment(ctx(), {
      targetType: 'revenue',
      targetId: revenueId,
      adjustmentType: 'increase',
      amountSatang: 10_000,
      reason: 'ขอเพิ่มยอดตามที่แจ้ง',
    })

    const rejected = await adjustments.rejectAdjustment(ctx(), created.id, {
      rejectionReason: 'เอกสารประกอบไม่ครบ ให้ยื่นใหม่',
    })
    expect(rejected.status).toBe('rejected')
    expect(rejected.rejectionReason).toBe('เอกสารประกอบไม่ครบ ให้ยื่นใหม่')

    await expectCode(
      () => adjustments.approveAdjustment(ctx(), created.id, { note: '' }),
      'ADJUSTMENT_INVALID_STATUS',
    )

    const logs = await auditRows(created.id)
    expect(logs.map((log) => log.action)).toEqual(['create', 'reject'])
    expect(logs[1]?.reason).toBe('เอกสารประกอบไม่ครบ ให้ยื่นใหม่')
  })
})

suite('Phase 3.7 — ตัวเลือกเป้าหมาย + รายการ (`20` §8)', () => {
  beforeEach(cleanup)

  it('ค้นเป้าหมายด้วยเลขที่อ้างอิง แล้วได้สถานะรอบ + ระดับอนุมัติที่ต้องใช้มาด้วย', async () => {
    const revenueId = await seedRevenue()
    await seedPeriod('locked')
    const caseRef = (
      await db().revenue.findFirstOrThrow({ where: { id: revenueId }, select: { case: { select: { caseRef: true } } } })
    ).case.caseRef

    const targets = await adjustments.listAdjustmentTargets(finance, { targetType: 'revenue', q: caseRef })
    expect(targets).toHaveLength(1)
    expect(targets[0]?.targetId).toBe(revenueId)
    expect(targets[0]?.periodStatusAtTarget).toBe('locked')
    expect(targets[0]?.requiredApproverRoles).toEqual(['บริหาร'])
    // รอบ locked ⇒ แก้ต้นทางตรงไม่ได้ ต้องใช้ Adjustment 100% (`13` §6.11)
    expect(targets[0]?.directEditBlocked).toBe(true)

    const none = await adjustments.listAdjustmentTargets(finance, { targetType: 'revenue', q: 'ไม่มีเลขนี้' })
    expect(none).toEqual([])
  })

  it('รายการกรองตามสถานะและชนิดเป้าหมายได้', async () => {
    const revenueId = await seedRevenue()
    const expenseId = await seedExpense()
    await adjustments.createAdjustment(ctx(), {
      targetType: 'revenue',
      targetId: revenueId,
      adjustmentType: 'increase',
      amountSatang: 1_000,
      reason: 'ปรับยอดรายได้ตามเอกสาร',
    })
    const onExpense = await adjustments.createAdjustment(ctx(), {
      targetType: 'expense',
      targetId: expenseId,
      adjustmentType: 'decrease',
      amountSatang: 2_000,
      reason: 'ปรับลดค่าใช้จ่ายตามใบเสร็จจริง',
    })
    await adjustments.rejectAdjustment(ctx(), onExpense.id, { rejectionReason: 'ยอดไม่ตรงกับใบเสร็จ' })

    expect(await adjustments.listAdjustments(finance, { status: 'all' })).toHaveLength(2)
    expect(await adjustments.listAdjustments(finance, { status: 'rejected' })).toHaveLength(1)
    const onlyRevenue = await adjustments.listAdjustments(finance, { status: 'all', targetType: 'revenue' })
    expect(onlyRevenue.map((row) => row.targetId)).toEqual([revenueId])
  })
})
