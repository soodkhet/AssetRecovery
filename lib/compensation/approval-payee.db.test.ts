import { PrismaPg } from '@prisma/adapter-pg'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import type { SessionUser } from '@/lib/auth/types'
import { PrismaClient } from '@/lib/generated/prisma/client'
import type { PayeeFieldsInput } from '@/lib/payees/schemas'

/**
 * เทสต์ระดับ DB ของ Phase 3.2 — DoD ตาม `16` §16 + `18` §9/§16:
 *  · **`18`**: verified → แก้ธนาคาร ⇒ unverified อัตโนมัติ · ยืนยันไม่ครบ ⇒ `REQUIRED_MISSING`
 *    · policy `require_payee_id_document` ⇒ `PAYEE_ID_DOCUMENT_REQUIRED` · ชื่อบัญชีไม่ตรง = **เตือนไม่บล็อก**
 *    · 1 User = 1 Payee (`PAYEE_ALREADY_EXISTS`) · พนักงานเห็นเฉพาะของตัวเอง
 *  · **`16`**: อนุมัติข้ามขั้น ⇒ `APPROVAL_STEP_OUT_OF_ORDER` · เดินครบสาย ⇒ `approved`
 *    · ตีกลับที่ขั้นใดก็ตาม ⇒ กลับขั้น 1 + ล้างรอยประทับทุกขั้น · capability ผิดขั้น ⇒ 403
 *    · SoD เปิด ⇒ คนเดิมอนุมัติ 2 ขั้นไม่ได้ · WHT ใน DTO = **Payee ชนะ Plan** (`18` §6.3)
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
  console.warn('[approval-payee.db.test] ข้ามเทสต์ระดับ DB — ไม่มี TEST_DATABASE_URL (ดู .env.example)')
}

const ORG_ID = '00000000-0000-4000-8000-0000000032a0'
const ROLE_MANAGER = '00000000-0000-4000-8000-0000000032a1'
const ROLE_FINANCE = '00000000-0000-4000-8000-0000000032a2'
const ROLE_AGENT = '00000000-0000-4000-8000-0000000032a3'
const MANAGER_ID = '00000000-0000-4000-8000-0000000032a4'
const FINANCE_ID = '00000000-0000-4000-8000-0000000032a5'
const FINANCE_2_ID = '00000000-0000-4000-8000-0000000032a6'
const AGENT_ID = '00000000-0000-4000-8000-0000000032a7'
const AGENT_2_ID = '00000000-0000-4000-8000-0000000032a8'
const TEAM_ID = '00000000-0000-4000-8000-0000000032a9'
const OTHER_TEAM_ID = '00000000-0000-4000-8000-0000000032b0'
const PLAN_ID = '00000000-0000-4000-8000-0000000032aa'
const TAX_PROFILE_ID = '00000000-0000-4000-8000-0000000032ab'
const MATRIX_2_STEP = '00000000-0000-4000-8000-0000000032ac'
const MATRIX_SOD = '00000000-0000-4000-8000-0000000032ad'
const COMPANY_ID = '00000000-0000-4000-8000-0000000032ae'
const TEMPLATE_ID = '00000000-0000-4000-8000-0000000032af'

/** ชื่อ role ตาม seed (`07` §5) — สายอนุมัติอ้างชื่อเหล่านี้ (`13` §6.2) */
const MANAGER_ROLE = 'ผู้จัดการทีมติดตามทรัพย์'
const FINANCE_ROLE = 'การเงิน'

let client: PrismaClient | null = null
type PayeeQueries = typeof import('@/lib/payees/queries')
type ApprovalQueries = typeof import('@/lib/compensation/approval-queries')
type FieldExpenseQueries = typeof import('@/lib/field/expense-queries')
let payees: PayeeQueries
let approvals: ApprovalQueries
let fieldExpenses: FieldExpenseQueries

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
    fullName: 'ผู้ทดสอบ 3.2',
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

/** การเงิน — จัดการ payee ได้เต็ม + เป็นผู้อนุมัติขั้นการเงิน (`25` §7.2) */
const finance = sessionUser({
  id: FINANCE_ID,
  roleId: ROLE_FINANCE,
  roleName: FINANCE_ROLE,
  roleGroup: 'system',
  teamId: null,
  capabilities: { manage_payee_profile: 'manage', approve_expense_finance: 'manage' },
  scope: { kind: 'global', teamIds: [], companyId: null, userId: FINANCE_ID },
})
const finance2 = sessionUser({
  id: FINANCE_2_ID,
  roleId: ROLE_FINANCE,
  roleName: FINANCE_ROLE,
  roleGroup: 'system',
  teamId: null,
  capabilities: { manage_payee_profile: 'manage', approve_expense_finance: 'manage' },
  scope: { kind: 'global', teamIds: [], companyId: null, userId: FINANCE_2_ID },
})
/** ผู้จัดการทีม — อนุมัติขั้น 1 เฉพาะทีมตัวเอง (`16` §10) */
const manager = sessionUser({
  id: MANAGER_ID,
  roleId: ROLE_MANAGER,
  roleName: MANAGER_ROLE,
  teamId: null,
  capabilities: { approve_expense_manager: 'manage' },
  scope: { kind: 'team', teamIds: [TEAM_ID], companyId: null, userId: MANAGER_ID },
})
/** พนักงานภาคสนาม — ถือ payee ระดับ `view` เห็นเฉพาะของตัวเอง (`18` §12) */
const agent = sessionUser({ id: AGENT_ID, capabilities: { manage_payee_profile: 'view' } })

const ctx = (actor: SessionUser, reason = 'ทดสอบ Phase 3.2 — ปรับข้อมูลผู้รับเงิน') => ({ actor, meta, reason })

function codeOf(error: unknown): string {
  return (error as { code?: string }).code ?? String(error)
}

async function expectCode(run: () => Promise<unknown>, code: string): Promise<void> {
  await expect(run()).rejects.toSatisfy((error: unknown) => codeOf(error) === code, `ต้องได้ error code ${code}`)
}

const BANK: PayeeFieldsInput = {
  payeeType: 'individual',
  taxProfileId: TAX_PROFILE_ID,
  nationalId: '1234567890123',
  bankName: 'กสิกรไทย',
  accountName: 'พนักงาน 3.2',
  accountNumber: '1234567890',
  idDocumentUrl: null,
}

async function resetPayees(): Promise<void> {
  const tx = db()
  // `audit_logs` ลบไม่ได้แม้ในเทสต์ (immutable ระดับ DB — `02` §13) ⇒ ยืนยันโดยกรองด้วย `target_id` แทน
  await tx.$executeRawUnsafe(`DELETE FROM expenses WHERE organization_id = '${ORG_ID}'`)
  await tx.$executeRawUnsafe(`DELETE FROM case_assignments WHERE organization_id = '${ORG_ID}'`)
  await tx.$executeRawUnsafe(`DELETE FROM cases WHERE organization_id = '${ORG_ID}'`)
  await tx.$executeRawUnsafe(`DELETE FROM payee_profiles WHERE organization_id = '${ORG_ID}'`)
  await tx.$executeRawUnsafe(
    `UPDATE finance_policy_settings SET require_payee_id_document = false WHERE organization_id = '${ORG_ID}'`,
  )
}

beforeAll(async () => {
  if (!url) return
  process.env.DATABASE_URL = url
  payees = await import('@/lib/payees/queries')
  approvals = await import('@/lib/compensation/approval-queries')
  fieldExpenses = await import('@/lib/field/expense-queries')

  const tx = db()
  await tx.$executeRawUnsafe(`
    INSERT INTO organizations (id, name, tax_id, address)
    VALUES ('${ORG_ID}', 'Phase32Test', '9999999993200', 'ที่อยู่ทดสอบ 3.2') ON CONFLICT (id) DO NOTHING
  `)
  await tx.$executeRawUnsafe(`
    INSERT INTO roles (id, organization_id, name, role_group, is_seed) VALUES
      ('${ROLE_MANAGER}', '${ORG_ID}', '${MANAGER_ROLE}', 'inhouse', false),
      ('${ROLE_FINANCE}', '${ORG_ID}', '${FINANCE_ROLE}', 'system', false),
      ('${ROLE_AGENT}', '${ORG_ID}', 'พนักงานติดตามทรัพย์ 3.2', 'inhouse', false)
    ON CONFLICT (id) DO NOTHING
  `)
  await tx.$executeRawUnsafe(`
    INSERT INTO users (id, organization_id, role_id, email, full_name, status) VALUES
      ('${MANAGER_ID}', '${ORG_ID}', '${ROLE_MANAGER}', 'manager32@test.local', 'ผู้จัดการ 3.2', 'active'),
      ('${FINANCE_ID}', '${ORG_ID}', '${ROLE_FINANCE}', 'finance32@test.local', 'การเงิน 3.2', 'active'),
      ('${FINANCE_2_ID}', '${ORG_ID}', '${ROLE_FINANCE}', 'finance32b@test.local', 'การเงินสอง 3.2', 'active'),
      ('${AGENT_ID}', '${ORG_ID}', '${ROLE_AGENT}', 'agent32@test.local', 'พนักงาน 3.2', 'active'),
      ('${AGENT_2_ID}', '${ORG_ID}', '${ROLE_AGENT}', 'agent32b@test.local', 'พนักงานสอง 3.2', 'active')
    ON CONFLICT (id) DO NOTHING
  `)
  // แผนค่าตอบแทนตั้ง WHT 3% — ใช้พิสูจน์ว่า Tax Profile ของ payee (1%) ชนะ (`18` §6.3)
  await tx.$executeRawUnsafe(`
    INSERT INTO compensation_plans
      (id, organization_id, name, side, fuel_mode, fuel_daily_flat_satang, allowance_satang,
       commission_satang, no_success_fee_satang, wht_pct, version, effective_from, is_current, created_by)
    VALUES ('${PLAN_ID}', '${ORG_ID}', 'แผนทดสอบ 3.2', 'inhouse', 'DAILY_FLAT', 30000, 20000,
            150000, 50000, 3.00, 1, DATE '2026-01-01', true, '${MANAGER_ID}')
    ON CONFLICT (id) DO NOTHING
  `)
  await tx.$executeRawUnsafe(`
    INSERT INTO tax_profiles (id, organization_id, name, wht_pct, wht_basis, wht_min_threshold_satang, created_by)
    VALUES ('${TAX_PROFILE_ID}', '${ORG_ID}', 'บุคคลธรรมดา 1% (3.2)', 1.00, 'before_vat', 100000, '${FINANCE_ID}')
    ON CONFLICT (id) DO NOTHING
  `)
  await tx.$executeRawUnsafe(`
    INSERT INTO teams (id, organization_id, name, side, provinces, status, compensation_plan_id, created_by) VALUES
      ('${TEAM_ID}', '${ORG_ID}', 'ทีมทดสอบ 3.2', 'inhouse', ARRAY['ลำพูน'], 'active', '${PLAN_ID}', '${MANAGER_ID}'),
      ('${OTHER_TEAM_ID}', '${ORG_ID}', 'ทีมนอก scope 3.2', 'inhouse', ARRAY['ลำพูน'], 'active', '${PLAN_ID}', '${MANAGER_ID}')
    ON CONFLICT (id) DO NOTHING
  `)
  await tx.$executeRawUnsafe(`UPDATE users SET team_id = '${TEAM_ID}' WHERE id IN ('${AGENT_ID}', '${AGENT_2_ID}')`)
  await tx.$executeRawUnsafe(`
    INSERT INTO service_fee_templates
      (id, organization_id, name, model, base_satang, rate_pct, basis, charge_on_fail, version, is_current, created_by)
    VALUES ('${TEMPLATE_ID}', '${ORG_ID}', 'เทมเพลต 3.2', 'FLAT', 50000, 0, NULL, false, 1, true, '${MANAGER_ID}')
    ON CONFLICT (id) DO NOTHING
  `)
  await tx.$executeRawUnsafe(`
    INSERT INTO finance_companies (id, organization_id, name, short_name, tax_id, service_fee_template_id, created_by)
    VALUES ('${COMPANY_ID}', '${ORG_ID}', 'ไฟแนนซ์ 3.2', 'F32', '0105512320001', '${TEMPLATE_ID}', '${MANAGER_ID}')
    ON CONFLICT (id) DO NOTHING
  `)
  // สาย 2 ขั้น ผู้จัดการ → การเงิน (`16` §6.1) · สาย SoD ใช้เฉพาะเทสต์แยกหน้าที่
  await tx.$executeRawUnsafe(`
    INSERT INTO approval_matrices
      (id, organization_id, condition, condition_threshold_satang, approval_flow, enforce_segregation_of_duties, created_by)
    VALUES
      ('${MATRIX_2_STEP}', '${ORG_ID}', 'ปกติไม่เกินเพดาน 3.2', NULL,
       ARRAY['${MANAGER_ROLE}', '${FINANCE_ROLE}'], false, '${FINANCE_ID}')
    ON CONFLICT (id) DO NOTHING
  `)
  await tx.$executeRawUnsafe(`
    INSERT INTO finance_policy_settings (organization_id, require_payee_id_document)
    VALUES ('${ORG_ID}', false) ON CONFLICT (organization_id) DO NOTHING
  `)
})

afterAll(async () => {
  if (url) {
    await resetPayees()
    await db().$executeRawUnsafe(`DELETE FROM approval_matrices WHERE organization_id = '${ORG_ID}'`)
  }
  await client?.$disconnect()
})

beforeEach(async () => {
  if (url) await resetPayees()
})

async function seedPayee(userId: string, patch: Partial<PayeeFieldsInput> = {}): Promise<string> {
  const created = await payees.createPayee(ctx(finance), { userId, ...BANK, ...patch })
  return created.payee.id
}

let caseSeq = 0

/** เคส + งาน + รายการเบิกที่รออนุมัติขั้น 1 (สถานะหลังคลังยืนยันแล้ว — `23` §6.3) */
async function seedPendingExpense(payeeId: string, grossSatang = 500_000): Promise<string> {
  caseSeq += 1
  const caseRef = `CMP32-${caseSeq}-${Date.now()}`
  const tx = db()
  const cases = await tx.$queryRawUnsafe<{ id: string }[]>(`
    INSERT INTO cases (
      organization_id, case_ref, case_ref_normalized, company_id, source, status, created_by,
      debtor_name, addr_province, addr_district, asset_kind, asset_description,
      debt_amount_satang, assigned_team_id, outcome
    ) VALUES (
      '${ORG_ID}', $$${caseRef}$$, $$${caseRef}$$, '${COMPANY_ID}', 'manual', 'closed_success', '${MANAGER_ID}',
      'ลูกหนี้ ${caseSeq}', 'ลำพูน', 'เมือง', 'smartphone', 'iPhone 15',
      1000000, '${TEAM_ID}', 'closed_success'
    ) RETURNING id
  `)
  const caseId = cases[0]?.id ?? ''
  const assignmentRows = await tx.$queryRawUnsafe<{ id: string }[]>(`
    INSERT INTO case_assignments (organization_id, case_id, agent_id, team_id, status, created_by)
    VALUES ('${ORG_ID}', '${caseId}', '${AGENT_ID}', '${TEAM_ID}', 'closed_success', '${MANAGER_ID}')
    RETURNING id
  `)
  const expenses = await tx.$queryRawUnsafe<{ id: string }[]>(`
    INSERT INTO expenses (
      organization_id, case_id, assignment_id, payee_id, expense_type, gross_satang, expense_date,
      status, comp_plan_id, comp_plan_version, calculation_source, created_by
    ) VALUES (
      '${ORG_ID}', '${caseId}', '${assignmentRows[0]?.id}', '${payeeId}', 'commission', ${grossSatang},
      DATE '2026-08-10', 'pending_approval', '${PLAN_ID}', 1, 'compensation_plan', '${MANAGER_ID}'
    ) RETURNING id
  `)
  return expenses[0]?.id ?? ''
}

suite('Phase 3.2 — Payee & Tax Profile (`18`)', () => {
  it('§16 แก้บัญชีธนาคารของ payee ที่ยืนยันแล้ว ⇒ กลับเป็น unverified อัตโนมัติ (§9)', async () => {
    const payeeId = await seedPayee(AGENT_ID)
    const verified = await payees.verifyPayee(ctx(finance, 'ตรวจเอกสารครบแล้ว'), payeeId)
    expect(verified.payee.isVerified).toBe(true)
    expect(verified.payee.verifiedByName).toBe('การเงิน 3.2')

    const updated = await payees.updatePayee(ctx(finance, 'พนักงานแจ้งเปลี่ยนเลขบัญชี'), payeeId, {
      ...BANK,
      accountNumber: '9876543210',
    })
    expect(updated.payee.isVerified).toBe(false)
    expect(updated.payee.verifiedAt).toBeNull()
    expect(updated.payee.verifiedByName).toBeNull()
  })

  it('แก้ฟิลด์ที่ไม่กระทบธนาคาร/ภาษี (แนบเอกสาร) ⇒ ยังยืนยันอยู่เหมือนเดิม', async () => {
    const payeeId = await seedPayee(AGENT_ID)
    await payees.verifyPayee(ctx(finance, 'ตรวจเอกสารครบแล้ว'), payeeId)
    const updated = await payees.updatePayee(ctx(finance, 'แนบสำเนาบัตรเพิ่ม'), payeeId, {
      ...BANK,
      idDocumentUrl: 'https://storage.test/payees/id-card.pdf',
    })
    expect(updated.payee.isVerified).toBe(true)
  })

  it('ข้อมูลภาษี/ธนาคารไม่ครบ ⇒ ยืนยันไม่ได้ (`REQUIRED_MISSING`)', async () => {
    const payeeId = await seedPayee(AGENT_ID, { bankName: null, accountNumber: null })
    await expectCode(() => payees.verifyPayee(ctx(finance, 'ลองยืนยันทั้งที่ยังไม่ครบ'), payeeId), 'REQUIRED_MISSING')
  })

  it('`require_payee_id_document = true` + ไม่มีไฟล์แนบ ⇒ `PAYEE_ID_DOCUMENT_REQUIRED` (`13` §6.2.1)', async () => {
    const payeeId = await seedPayee(AGENT_ID)
    await db().$executeRawUnsafe(
      `UPDATE finance_policy_settings SET require_payee_id_document = true WHERE organization_id = '${ORG_ID}'`,
    )
    await expectCode(() => payees.verifyPayee(ctx(finance, 'ยืนยันโดยยังไม่แนบเอกสาร'), payeeId), 'PAYEE_ID_DOCUMENT_REQUIRED')

    const withDoc = await payees.updatePayee(ctx(finance, 'แนบสำเนาบัตรประชาชน'), payeeId, {
      ...BANK,
      idDocumentUrl: 'https://storage.test/payees/id-card.pdf',
    })
    expect(withDoc.payee.idDocumentUrl).not.toBeNull()
    const verified = await payees.verifyPayee(ctx(finance, 'เอกสารครบแล้ว'), payeeId)
    expect(verified.payee.isVerified).toBe(true)
  })

  it('§11 ชื่อบัญชีไม่ตรงชื่อผู้รับเงิน = **เตือน ไม่บล็อก** (`BANK_ACCOUNT_NAME_MISMATCH`)', async () => {
    const created = await payees.createPayee(ctx(finance), {
      userId: AGENT_ID,
      ...BANK,
      accountName: 'คนอื่น ไม่ใช่เจ้าตัว',
    })
    expect(created.warning?.code).toBe('BANK_ACCOUNT_NAME_MISMATCH')
    expect(created.payee.bankAccountNameMatches).toBe(false)

    // เตือนแล้วยังยืนยันได้ตามดุลยพินิจการเงิน (§11 "ไม่ reject")
    const verified = await payees.verifyPayee(ctx(finance, 'ตรวจกับสมุดบัญชีจริงแล้วตรงกัน'), created.payee.id)
    expect(verified.payee.isVerified).toBe(true)
  })

  it('1 User = 1 Payee (`18` §6.1) ⇒ สร้างซ้ำได้ `PAYEE_ALREADY_EXISTS`', async () => {
    await seedPayee(AGENT_ID)
    await expectCode(() => payees.createPayee(ctx(finance), { userId: AGENT_ID, ...BANK }), 'PAYEE_ALREADY_EXISTS')
  })

  it('เลขประจำตัวผู้เสียภาษีผิดรูปแบบ ⇒ `INVALID_TAX_ID_FORMAT` (ตรวจรูปแบบอย่างเดียว ไม่มี checksum)', async () => {
    await expectCode(
      () => payees.createPayee(ctx(finance), { userId: AGENT_ID, ...BANK, nationalId: '123' }),
      'INVALID_TAX_ID_FORMAT',
    )
  })

  it('§12 พนักงานถือสิทธิ์ระดับ `view` ⇒ เห็นเฉพาะของตัวเอง และไม่ได้เลขบัญชีเต็ม', async () => {
    await seedPayee(AGENT_ID)
    await seedPayee(AGENT_2_ID, { accountName: 'พนักงานสอง 3.2', accountNumber: '5555555555' })

    const allRows = await payees.listPayees(finance, { status: 'all' })
    expect(allRows).toHaveLength(2)
    expect(allRows.every((row) => row.accountNumber !== null)).toBe(true)

    const ownRows = await payees.listPayees(agent, { status: 'all' })
    expect(ownRows).toHaveLength(1)
    expect(ownRows[0]?.userId).toBe(AGENT_ID)
    expect(ownRows[0]?.accountNumber).toBeNull()
    expect(ownRows[0]?.accountNumberMasked).toBe('••••••7890')
  })

  it('§13 ทุก mutation ลง audit พร้อม `reason` (ตาราง `payee_profiles` อยู่หมวด bank)', async () => {
    const payeeId = await seedPayee(AGENT_ID)
    await payees.updatePayee(ctx(finance, 'เปลี่ยนธนาคารตามที่พนักงานแจ้ง'), payeeId, {
      ...BANK,
      bankName: 'ไทยพาณิชย์',
    })
    const logs = await db().auditLog.findMany({
      where: { organizationId: ORG_ID, targetType: 'payee_profiles', targetId: payeeId },
      orderBy: { createdAt: 'asc' },
      select: { action: true, reason: true, actorId: true },
    })
    expect(logs.map((log) => log.action)).toEqual(['create', 'update'])
    expect(logs.every((log) => (log.reason ?? '').length > 0)).toBe(true)
    expect(logs.every((log) => log.actorId === FINANCE_ID)).toBe(true)
  })
})

suite('Phase 3.2 — Compensation Approval หลายขั้น (`16`)', () => {
  it('§16 "อนุมัติข้ามขั้น" ⇒ `APPROVAL_STEP_OUT_OF_ORDER`', async () => {
    const expenseId = await seedPendingExpense(await seedPayee(AGENT_ID))
    await expectCode(
      () => approvals.approveCompensationExpense({ actor: finance, meta }, expenseId, { step: 2 }),
      'APPROVAL_STEP_OUT_OF_ORDER',
    )
  })

  it('เดินครบสาย 2 ขั้น ⇒ `approved` + `expense.approved` + ประวัติครบ 2 แถว', async () => {
    const expenseId = await seedPendingExpense(await seedPayee(AGENT_ID))

    const step1 = await approvals.approveCompensationExpense({ actor: manager, meta }, expenseId, {})
    expect(step1.expense.status).toBe('pending_finance_approval')
    expect(step1.expense.approvalStepCurrent).toBe(2)
    expect(step1.expense.approvalStepTotal).toBe(2)
    expect(step1.events).toEqual([])

    const step2 = await approvals.approveCompensationExpense({ actor: finance, meta }, expenseId, { step: 2 })
    expect(step2.expense.status).toBe('approved')
    expect(step2.events).toEqual(['expense.approved'])
    expect(step2.expense.approvalHistory).toHaveLength(2)
    expect(step2.expense.approvalHistory.map((entry) => entry.action)).toEqual(['approve', 'approve'])

    const row = await db().expense.findUniqueOrThrow({
      where: { id: expenseId },
      select: { managerApprovedBy: true, financeApprovedBy: true, approvalMatrixId: true },
    })
    expect(row.managerApprovedBy).toBe(MANAGER_ID)
    expect(row.financeApprovedBy).toBe(FINANCE_ID)
    // snapshot สายที่ใช้จริงลงรายการ (`92` §7.1)
    expect(row.approvalMatrixId).toBe(MATRIX_2_STEP)
  })

  it('§16 "ตีกลับแล้วเริ่มใหม่" ⇒ กลับขั้น 1 + ล้างรอยประทับทุกขั้น ไม่ resume ที่ขั้น 2', async () => {
    const expenseId = await seedPendingExpense(await seedPayee(AGENT_ID))
    await approvals.approveCompensationExpense({ actor: manager, meta }, expenseId, {})

    const rejected = await approvals.rejectCompensationExpense({ actor: finance, meta }, expenseId, {
      reason: 'ใบเสร็จไม่ชัด กรุณาถ่ายใหม่',
    })
    expect(rejected.expense.status).toBe('needs_revision')
    expect(rejected.expense.approvalStepCurrent).toBe(1)
    expect(rejected.expense.rejectReason).toBe('ใบเสร็จไม่ชัด กรุณาถ่ายใหม่')

    const row = await db().expense.findUniqueOrThrow({
      where: { id: expenseId },
      select: { managerApprovedBy: true, managerApprovedAt: true, financeApprovedBy: true },
    })
    expect(row.managerApprovedBy).toBeNull()
    expect(row.managerApprovedAt).toBeNull()
    expect(row.financeApprovedBy).toBeNull()

    // ส่งใหม่แล้วต้องผ่านขั้น 1 อีกครั้ง — การเงินกดขั้น 2 ตรง ๆ ไม่ได้
    await db().expense.update({ where: { id: expenseId }, data: { status: 'pending_approval' } })
    await expectCode(
      () => approvals.approveCompensationExpense({ actor: finance, meta }, expenseId, { step: 2 }),
      'APPROVAL_STEP_OUT_OF_ORDER',
    )
    const restart = await approvals.approveCompensationExpense({ actor: manager, meta }, expenseId, { step: 1 })
    expect(restart.expense.approvalStepCurrent).toBe(2)
  })

  it('§12 ถือ capability ผิดขั้น ⇒ 403 (การเงินกดขั้นผู้จัดการแทนไม่ได้)', async () => {
    const expenseId = await seedPendingExpense(await seedPayee(AGENT_ID))
    await expectCode(
      () => approvals.approveCompensationExpense({ actor: finance, meta }, expenseId, { step: 1 }),
      'PERMISSION_DENIED',
    )
  })

  it('§11 ตีกลับโดยไม่ระบุเหตุผล ⇒ `REJECT_REASON_REQUIRED`', async () => {
    const expenseId = await seedPendingExpense(await seedPayee(AGENT_ID))
    await expectCode(
      () => approvals.rejectCompensationExpense({ actor: manager, meta }, expenseId, { reason: '   ' }),
      'REJECT_REASON_REQUIRED',
    )
  })

  it('Final Test ด่าน 6 — อนุมัติกับตีกลับพร้อมกัน ⇒ สำเร็จคนเดียว อีกคน `EXPENSE_INVALID_STATUS`', async () => {
    const expenseId = await seedPendingExpense(await seedPayee(AGENT_ID))

    // สถานะถูกอ่าน**นอก** transaction ⇒ ถ้าไม่มียาม optimistic ตอนเขียน คนที่กดทีหลังจะทับผลของคนแรก
    // (ตีกลับถูกพลิกกลับเป็นอนุมัติ · รอยประทับผู้อนุมัติหาย) — `16` §9 + Rule 04
    const results = await Promise.allSettled([
      approvals.approveCompensationExpense({ actor: manager, meta }, expenseId, {}),
      approvals.rejectCompensationExpense({ actor: manager, meta }, expenseId, { reason: 'เอกสารไม่ครบ' }),
    ])

    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1)
    const loser = results.find((result) => result.status === 'rejected')
    expect(loser).toBeDefined()
    expect(codeOf((loser as PromiseRejectedResult).reason)).toBe('EXPENSE_INVALID_STATUS')

    // ผลลัพธ์ใน DB ต้องเป็นของผู้ชนะคนเดียว ไม่มีประวัติซ้อน 2 แถวจากคำสั่งที่แข่งกัน
    const row = await db().expense.findUniqueOrThrow({
      where: { id: expenseId },
      select: { status: true, approvalStepCurrent: true, approvalHistory: true },
    })
    expect(row.approvalHistory as unknown[]).toHaveLength(1)
    if (row.status === 'needs_revision') expect(row.approvalStepCurrent).toBe(1)
    else expect([row.status, row.approvalStepCurrent]).toEqual(['pending_finance_approval', 2])
  })

  it('§10 SoD เปิด ⇒ คนเดิมอนุมัติ 2 ขั้นในรายการเดียวกันไม่ได้', async () => {
    await db().$executeRawUnsafe(`
      INSERT INTO approval_matrices
        (id, organization_id, condition, condition_threshold_satang, approval_flow, enforce_segregation_of_duties, created_by)
      VALUES ('${MATRIX_SOD}', '${ORG_ID}', 'สายแยกหน้าที่ 3.2', 100000,
              ARRAY['${FINANCE_ROLE}', '${FINANCE_ROLE}'], true, '${FINANCE_ID}')
      ON CONFLICT (id) DO NOTHING
    `)
    try {
      // ยอด 50,000 สตางค์ ⇒ ตกสายเพดาน 100,000 (เพดานต่ำสุดที่ยังครอบยอด)
      const expenseId = await seedPendingExpense(await seedPayee(AGENT_ID), 50_000)
      const step1 = await approvals.approveCompensationExpense({ actor: finance, meta }, expenseId, {})
      expect(step1.expense.approvalStepCurrent).toBe(2)

      await expectCode(
        () => approvals.approveCompensationExpense({ actor: finance, meta }, expenseId, { step: 2 }),
        'SEGREGATION_OF_DUTIES_VIOLATION',
      )
      // คนละคนในบทบาทเดียวกันเดินต่อได้
      const step2 = await approvals.approveCompensationExpense({ actor: finance2, meta }, expenseId, { step: 2 })
      expect(step2.expense.status).toBe('approved')
    } finally {
      await db().$executeRawUnsafe(`DELETE FROM approval_matrices WHERE id = '${MATRIX_SOD}'`)
    }
  })

  it('`18` §6.3 — WHT ในรายการใช้ **Tax Profile ของ payee (1%) ชนะแผน (3%)**', async () => {
    const payeeId = await seedPayee(AGENT_ID)
    await seedPendingExpense(payeeId, 500_000)
    const rows = await approvals.listCompensationApprovals(finance, { status: 'all' })
    expect(rows).toHaveLength(1)
    expect(rows[0]?.whtRateSource).toBe('payee')
    expect(rows[0]?.whtPctUsed).toBe(1)
    // 5,000 บาท × 1% = 50 บาท ⇒ net 4,950 บาท (satang เต็มจำนวน — Rule 01)
    expect(rows[0]?.whtSatang).toBe(5_000)
    expect(rows[0]?.netSatang).toBe(495_000)
    expect(rows[0]?.whtWarning).toBeNull()
  })

  it('`18` §6.3 — payee ที่ยังไม่ผูก Tax Profile ตกไปใช้อัตราของแผน **พร้อม warning**', async () => {
    const payeeId = await seedPayee(AGENT_ID, { taxProfileId: null })
    await seedPendingExpense(payeeId, 500_000)
    const rows = await approvals.listCompensationApprovals(finance, { status: 'all' })
    expect(rows[0]?.whtRateSource).toBe('plan')
    expect(rows[0]?.whtPctUsed).toBe(3)
    expect(rows[0]?.whtWarning).not.toBeNull()
  })

  it('§10 ผู้จัดการเห็นเฉพาะรายการของทีมที่ตนดูแล', async () => {
    const payeeId = await seedPayee(AGENT_ID)
    const expenseId = await seedPendingExpense(payeeId)
    expect((await approvals.listCompensationApprovals(manager, { status: 'all' })).map((row) => row.id)).toEqual([
      expenseId,
    ])

    // ย้ายงานไปทีมอื่น ⇒ ผู้จัดการคนเดิมไม่เห็นและกดอนุมัติไม่ได้ (404 แบบไม่ leak)
    await db().$executeRawUnsafe(
      `UPDATE case_assignments SET team_id = '${OTHER_TEAM_ID}' WHERE organization_id = '${ORG_ID}'`,
    )
    expect(await approvals.listCompensationApprovals(manager, { status: 'all' })).toEqual([])
    await expectCode(
      () => approvals.approveCompensationExpense({ actor: manager, meta }, expenseId, {}),
      'EXPENSE_NOT_FOUND',
    )
  })

  /**
   * ทางเข้า `POST /api/field/expenses/:id/reject` เขียนค่าชุดเดียวกับ `PATCH /api/compensation/:id/reject`
   * ⇒ ต้องผ่านยามชุดเดียวกัน ไม่งั้นกลายเป็นประตูหลังของสายอนุมัติทั้งเส้น (พบตอนรีวิว Phase 3)
   */
  it('§10/§12 ตีกลับผ่านทางเข้าฝั่ง field ก็ต้องติด scope ทีม + capability ของขั้นเหมือนกัน', async () => {
    const payeeId = await seedPayee(AGENT_ID)
    const expenseId = await seedPendingExpense(payeeId)
    const rejectInput = { reason: 'ใบเสร็จไม่ชัด ขอให้ถ่ายใหม่' }
    const fieldCtx = { actor: manager, meta }

    // ขั้นที่ 1 เป็นของ Manager และรายการอยู่ในทีมที่ตนดูแล ⇒ ตีกลับได้ตามปกติ
    const rejected = await fieldExpenses.rejectFieldExpense(manager, expenseId, rejectInput, fieldCtx)
    expect(rejected.status).toBe('needs_revision')

    // ย้ายงานไปทีมอื่น ⇒ ต้องได้ `EXPENSE_NOT_FOUND` (ไม่ leak) ไม่ใช่ตีกลับสำเร็จ
    const again = await seedPendingExpense(await seedPayee(AGENT_2_ID))
    await db().$executeRawUnsafe(
      `UPDATE case_assignments SET team_id = '${OTHER_TEAM_ID}' WHERE organization_id = '${ORG_ID}'`,
    )
    await expectCode(
      () => fieldExpenses.rejectFieldExpense(manager, again, rejectInput, fieldCtx),
      'EXPENSE_NOT_FOUND',
    )
  })

  it('รายการที่คลังยังไม่ปล่อย (`pending_warehouse_confirm`) อนุมัติไม่ได้ (`23` §6.3)', async () => {
    const expenseId = await seedPendingExpense(await seedPayee(AGENT_ID))
    await db().expense.update({ where: { id: expenseId }, data: { status: 'pending_warehouse_confirm' } })
    await expectCode(
      () => approvals.approveCompensationExpense({ actor: manager, meta }, expenseId, {}),
      'EXPENSE_INVALID_STATUS',
    )
  })
})
