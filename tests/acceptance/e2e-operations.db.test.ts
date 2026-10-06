import { randomUUID } from 'node:crypto'
import { PrismaPg } from '@prisma/adapter-pg'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import type { SessionUser } from '@/lib/auth/types'
import { toInputDate } from '@/lib/format/datetime'
import { PrismaClient } from '@/lib/generated/prisma/client'
import { settleFieldDaysToday } from '@/tests/helpers/field-day'

// เทสต์ไม่ยิง Storage จริง (Rule 07 · 0-common ของ Final Test) — ดู tests/helpers/fake-uploads.ts
vi.mock('@/lib/uploads/storage', async () => (await import('@/tests/helpers/fake-uploads')).fakeStorageModule())
vi.mock('@/lib/uploads/verify', async () => (await import('@/tests/helpers/fake-uploads')).fakeVerifyModule())

/**
 * **Final Test ด่าน 1 — Ops E2E: เคส → มอบหมาย → ภาคสนาม → คลัง → ส่งมอบ** (`29` §7 · `38`/`40`/`41`/`44`)
 *
 * เดินผ่าน **service จริงทุกก้าว** (ไม่ insert ข้ามขั้น) — ต่อจาก `e2e-revenue-cycle` ที่เน้นฝั่งรายรับ
 * ไฟล์นี้เน้นจุดที่ฝั่งปฏิบัติการยังไม่มีเทสต์เดินต่อกันครบสาย:
 *  - นำเข้าเคส (ช่อง "IMEI หรือ Serial" U54/U24) + สร้างทีละเคส
 *  - snapshot ค่าบริการ **ตอน `approved` ไม่ใช่ตอนสร้าง** (`10` §9.2 · `92` §7.1) — เปลี่ยนเทมเพลตระหว่างร่างกับรับเคส
 *  - เบิกที่พัก + เพดานต่อคืน (U89) + "พักร่วมกับ" หัวหน้าทีมในทีมเดียวกัน (U28)
 *  - รับเข้าคลังด้วย IMEI ที่มีตัวคั่น (`parseImei()` U24) · ล็อต we_deliver · ล็อตยืนยันแล้วแนบเอกสารไม่ได้
 *  - Revenue เกิดครั้งเดียวเมื่อ expense approved **และ** lot confirmed · `closed_fail` ไม่ผ่านคลังไม่เกิดรายได้
 *  - ระยะเก็บเอกสารลูกหนี้ (U97) ลบเฉพาะไฟล์ลูกหนี้ ไม่แตะข้อมูลการเงิน/คลัง
 *
 * ⚠️ ต้องตั้ง `DATABASE_URL = TEST_DATABASE_URL` **ก่อน** import service (กับดัก 2026-08-14)
 * ⚠️ ล็อต confirmed / รายได้ลบไม่ได้ (`02` §13) ⇒ ไม่ล้างท้ายรัน แต่สร้างบริษัทไฟแนนซ์ + เลขสัญญาใหม่ทุกรัน
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
  console.warn('[e2e-operations.db.test] ข้ามเทสต์ระดับ DB — ไม่มี TEST_DATABASE_URL (ดู .env.example)')
}

const ORG_ID = '00000000-0000-4000-8000-0000000f1a00'
const ROLE_ADMIN = '00000000-0000-4000-8000-0000000f1a01'
const ROLE_MANAGER = '00000000-0000-4000-8000-0000000f1a02'
const ROLE_FINANCE = '00000000-0000-4000-8000-0000000f1a03'
const ROLE_AGENT = '00000000-0000-4000-8000-0000000f1a04'
const ROLE_LEAD = '00000000-0000-4000-8000-0000000f1a05'
const ADMIN_ID = '00000000-0000-4000-8000-0000000f1a06'
const MANAGER_ID = '00000000-0000-4000-8000-0000000f1a07'
const FINANCE_ID = '00000000-0000-4000-8000-0000000f1a08'
/** พนักงานใหม่ทุกรัน — job แถวรายวัน (DEC-012) settle ต่อคน-ต่อวัน ⇒ รันซ้ำวันเดียวกันต้องไม่ชนวันของรันก่อน */
const AGENT_ID = randomUUID()
const LEAD_ID = '00000000-0000-4000-8000-0000000f1a0a'
const TEAM_ID = '00000000-0000-4000-8000-0000000f1a0b'
const PLAN_ID = '00000000-0000-4000-8000-0000000f1a0c'
const TEMPLATE_V1 = '00000000-0000-4000-8000-0000000f1a0d'
const TEMPLATE_V2 = '00000000-0000-4000-8000-0000000f1a0e'
const MATRIX_ID = '00000000-0000-4000-8000-0000000f1a0f'
const PAYEE_ID = randomUUID()

const PROVINCE = 'ลำปาง'
const RUN = `${process.pid}${Date.now() % 100_000}`
const RUN_TAX_ID = `8${RUN}`.padEnd(13, '0').slice(0, 13)
/** IMEI ใหม่ทุกรัน — `uniq_assets_active_imei` กันเครื่องที่ยังไม่ส่งมอบซ้ำ IMEI (รันก่อนที่ล้มกลางทางทิ้งเครื่องค้างไว้) */
const IMEI_OK = `35${RUN}`.padEnd(15, '7').slice(0, 15)
const IMEI_FAIL = `36${RUN}`.padEnd(15, '1').slice(0, 15)
/** IMEI เดิมแต่มีตัวคั่นทั้ง 3 ชนิด (ช่องว่าง/ขีด/จุด) */
const IMEI_OK_SEPARATED = `${IMEI_OK.slice(0, 2)} ${IMEI_OK.slice(2, 8)}-${IMEI_OK.slice(8, 14)}.${IMEI_OK.slice(14)}`

/**
 * มูลหนี้ 10,000 บาท × SUCCESS_FEE (`22` §6.5): เทมเพลต v1 = 10% · v2 = 20%
 * เคสรับตอนบริษัทผูก v2 ⇒ gross 2,000 บาท + VAT 7% (exclude_vat) = 140 บาท ⇒ รวม 2,140 บาท
 */
const DEBT_SATANG = 1_000_000
const GROSS_V2_SATANG = 200_000
const VAT_V2_SATANG = 14_000
const TOTAL_V2_SATANG = 214_000
/** เพดานค่าที่พักต่อคืนของแผน (U89) */
const HOTEL_CAP_SATANG = 80_000

let client: PrismaClient | null = null
let cases: typeof import('@/lib/cases/queries')
let caseSchemas: typeof import('@/lib/cases/schemas')
let caseImport: typeof import('@/lib/cases/import-queries')
let caseStatus: typeof import('@/lib/cases/status-queries')
let assignments: typeof import('@/lib/assignments/queries')
let field: typeof import('@/lib/field/queries')
let fieldExpenses: typeof import('@/lib/field/expense-queries')
let warehouse: typeof import('@/lib/warehouse/queries')
let warehouseSchemas: typeof import('@/lib/warehouse/schemas')
let approvals: typeof import('@/lib/compensation/approval-queries')
let purgeJob: typeof import('@/lib/cases/debtor-document-purge-job')

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
    fullName: 'ผู้ทดสอบ Final 1',
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
  capabilities: { approve_expense_manager: 'manage' },
  scope: { kind: 'team', teamIds: [TEAM_ID], companyId: null, userId: MANAGER_ID },
})
const finance = sessionUser({
  id: FINANCE_ID,
  roleId: ROLE_FINANCE,
  roleName: 'การเงิน',
  roleGroup: 'system',
  teamId: null,
  capabilities: { approve_expense_finance: 'manage' },
  scope: { kind: 'global', teamIds: [], companyId: null, userId: FINANCE_ID },
})
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

let companyId = ''

/** วันที่ (ปฏิทินไทย) ของเวลาหนึ่ง เป็น `Date` เที่ยงคืน UTC — รูปเดียวกับคอลัมน์ `DATE` ที่ Prisma คืนมา */
function bangkokDate(at: Date): string {
  return toInputDate(at)
}

async function codeOf(run: () => Promise<unknown>): Promise<string | null> {
  try {
    await run()
    return null
  } catch (error) {
    return typeof error === 'object' && error !== null && 'code' in error ? String((error as { code: unknown }).code) : 'NO_CODE'
  }
}

async function createReadyCase(caseRef: string, imeiSerial: string): Promise<string> {
  const created = await cases.createCase(
    caseSchemas.caseCreateSchema.parse({
      caseRef,
      financeCompanyId: companyId,
      debtorName: 'สมหญิง ทดสอบปฏิบัติการ',
      debtorNationality: 'TH',
      debtorNationalId: '1234567890123',
      debtorPhoneMobile: '0812345678',
      addressCurrent: { detail: '12 หมู่ 3', province: PROVINCE, district: 'เมืองลำปาง' },
      addressIdCard: { detail: '12 หมู่ 3', province: PROVINCE, district: 'เมืองลำปาง' },
      assetType: 'smartphone',
      assetBrandModel: 'Samsung A55',
      assetImeiSerial: imeiSerial,
      assetCapacity: '128GB',
      assetColor: 'ดำ',
      outstandingDebtSatang: DEBT_SATANG,
    }),
    ctx(admin),
  )
  for (const slot of ['contract_doc', 'national_id_doc', 'product_photo'] as const) {
    await cases.addCaseDocument(
      admin,
      created.id,
      {
        documentType: slot,
        fileUrl: `cases/${created.id}/${slot}/${RUN}.pdf`,
        fileHash: 'c'.repeat(64),
        originalName: `${slot}.pdf`,
        mimeType: 'application/pdf',
        sizeBytes: 2048,
      },
      ctx(admin),
    )
  }
  return created.id
}

/** มอบหมาย → รับงาน → จัดวัน → เช็คอิน (พร้อมปิดงาน) */
async function fieldReady(caseId: string): Promise<void> {
  await assignments.assignCase(manager, caseId, { agentId: AGENT_ID }, ctx(manager))
  await field.acceptFieldCase(agent, caseId, ctx(agent))
  await field.scheduleFieldCase(agent, caseId, { scheduleDate: new Date(`${bangkokDate(new Date())}T00:00:00.000Z`) }, ctx(agent))
  await field.saveCloseDraft(
    agent,
    caseId,
    { outcome: null, photos: [], videos: [], productPhotos: [], travelOrigin: { latitude: 18.29, longitude: 99.49, source: 'gps_auto' } },
    ctx(agent),
  )
  await field.recordCheckin(agent, caseId, { latitude: 18.2901, longitude: 99.4931, checkinType: 'address' }, ctx(agent))
}

async function approveAllCaseExpenses(caseId: string): Promise<number> {
  const rows = await db().expense.findMany({ where: { caseId, deletedAt: null }, select: { id: true } })
  let revenueEligible = 0
  for (const row of rows) {
    await approvals.approveCompensationExpense(ctx(manager), row.id, {})
    const finished = await approvals.approveCompensationExpense(ctx(finance), row.id, { step: 2 })
    expect(finished.expense.status).toBe('approved')
    revenueEligible += finished.revenueEligibleCaseIds.length
  }
  return revenueEligible
}

suite('Final Test ด่าน 1 — Ops E2E: เคส → มอบหมาย → ภาคสนาม → คลัง → ส่งมอบ', () => {
  beforeAll(async () => {
    if (!url) return
    process.env.DATABASE_URL = url
    cases = await import('@/lib/cases/queries')
    caseSchemas = await import('@/lib/cases/schemas')
    caseImport = await import('@/lib/cases/import-queries')
    caseStatus = await import('@/lib/cases/status-queries')
    assignments = await import('@/lib/assignments/queries')
    field = await import('@/lib/field/queries')
    fieldExpenses = await import('@/lib/field/expense-queries')
    warehouse = await import('@/lib/warehouse/queries')
    warehouseSchemas = await import('@/lib/warehouse/schemas')
    approvals = await import('@/lib/compensation/approval-queries')
    purgeJob = await import('@/lib/cases/debtor-document-purge-job')

    const tx = db()
    await tx.$executeRawUnsafe(`
      INSERT INTO organizations (id, name, tax_id, address, vat_registered)
      VALUES ('${ORG_ID}', 'Final 1 ปฏิบัติการ', '9999999998111', '1 ถนนทดสอบ ลำปาง 52000', true)
      ON CONFLICT (id) DO NOTHING
    `)
    await tx.$executeRawUnsafe(`
      INSERT INTO roles (id, organization_id, name, role_group, is_seed) VALUES
        ('${ROLE_ADMIN}', '${ORG_ID}', 'ธุรการ F1', 'system', false),
        ('${ROLE_MANAGER}', '${ORG_ID}', 'ผู้จัดการทีมติดตามทรัพย์', 'inhouse', false),
        ('${ROLE_FINANCE}', '${ORG_ID}', 'การเงิน', 'system', false),
        ('${ROLE_AGENT}', '${ORG_ID}', 'พนักงานติดตามทรัพย์', 'inhouse', false),
        ('${ROLE_LEAD}', '${ORG_ID}', 'หัวหน้าทีม F1', 'inhouse', false)
      ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name
    `)
    await tx.$executeRawUnsafe(`
      INSERT INTO users (id, organization_id, role_id, email, full_name, status) VALUES
        ('${ADMIN_ID}', '${ORG_ID}', '${ROLE_ADMIN}', 'admin-f1@test.local', 'ธุรการ F1', 'active'),
        ('${MANAGER_ID}', '${ORG_ID}', '${ROLE_MANAGER}', 'manager-f1@test.local', 'ผู้จัดการ F1', 'active'),
        ('${FINANCE_ID}', '${ORG_ID}', '${ROLE_FINANCE}', 'finance-f1@test.local', 'การเงิน F1', 'active'),
        ('${AGENT_ID}', '${ORG_ID}', '${ROLE_AGENT}', 'agent-f1-${RUN}@test.local', 'พนักงาน F1', 'active'),
        ('${LEAD_ID}', '${ORG_ID}', '${ROLE_LEAD}', 'lead-f1@test.local', 'หัวหน้าทีม F1', 'active')
      ON CONFLICT (id) DO NOTHING
    `)
    // DAILY_FLAT (ไม่เรียก Distance Matrix) + เพดานค่าที่พัก 800 บาท/คืน (U89)
    await tx.$executeRawUnsafe(`
      INSERT INTO compensation_plans
        (id, organization_id, name, side, fuel_mode, fuel_daily_flat_satang, allowance_satang,
         commission_satang, no_success_fee_satang, wht_pct, hotel_max_per_night_satang, version,
         effective_from, is_current, created_by)
      VALUES ('${PLAN_ID}', '${ORG_ID}', 'แผนเหมารายวัน F1', 'inhouse', 'DAILY_FLAT', 30000, 20000,
              150000, 50000, 3.00, ${HOTEL_CAP_SATANG}, 1, DATE '2026-01-01', true, '${ADMIN_ID}')
      ON CONFLICT (id) DO NOTHING
    `)
    await tx.$executeRawUnsafe(`
      INSERT INTO teams (id, organization_id, name, side, provinces, status, compensation_plan_id, created_by)
      VALUES ('${TEAM_ID}', '${ORG_ID}', 'ทีมลำปาง F1', 'inhouse', ARRAY['${PROVINCE}'], 'active', '${PLAN_ID}', '${ADMIN_ID}')
      ON CONFLICT (id) DO NOTHING
    `)
    await tx.$executeRawUnsafe(`UPDATE users SET team_id = '${TEAM_ID}' WHERE id IN ('${AGENT_ID}', '${LEAD_ID}')`)
    await tx.$executeRawUnsafe(`
      INSERT INTO service_fee_templates
        (id, organization_id, name, model, base_satang, rate_pct, basis, fail_fee_satang, version, is_current, created_by)
      VALUES
        ('${TEMPLATE_V1}', '${ORG_ID}', 'เทมเพลต F1 v1', 'SUCCESS_FEE', 0, 10.00, 'debt_amount', NULL, 1, false, '${ADMIN_ID}'),
        ('${TEMPLATE_V2}', '${ORG_ID}', 'เทมเพลต F1 v2', 'SUCCESS_FEE', 0, 20.00, 'debt_amount', NULL, 2, true, '${ADMIN_ID}')
      ON CONFLICT (id) DO NOTHING
    `)
    await tx.$executeRawUnsafe(`
      INSERT INTO vat_rate_history (organization_id, rate_pct, effective_from, effective_to, created_by)
      SELECT '${ORG_ID}', 7.00, DATE '2020-01-01', NULL, '${ADMIN_ID}'
      WHERE NOT EXISTS (SELECT 1 FROM vat_rate_history WHERE organization_id = '${ORG_ID}')
    `)
    await tx.$executeRawUnsafe(`
      INSERT INTO approval_matrices
        (id, organization_id, condition, condition_threshold_satang, approval_flow_role_ids, enforce_segregation_of_duties, created_by)
      VALUES ('${MATRIX_ID}', '${ORG_ID}', 'สายอนุมัติ F1', NULL,
              ARRAY['${ROLE_MANAGER}', '${ROLE_FINANCE}']::uuid[], true, '${ADMIN_ID}')
      ON CONFLICT (id) DO UPDATE SET approval_flow_role_ids = EXCLUDED.approval_flow_role_ids, deleted_at = NULL
    `)
    await tx.$executeRawUnsafe(`
      INSERT INTO finance_policy_settings (organization_id, require_payee_id_document)
      VALUES ('${ORG_ID}', false) ON CONFLICT (organization_id) DO NOTHING
    `)
    await tx.$executeRawUnsafe(`
      INSERT INTO payee_profiles (id, organization_id, user_id, payee_type, bank_name, account_name,
                                  account_number, national_id, is_verified, created_by)
      VALUES ('${PAYEE_ID}', '${ORG_ID}', '${AGENT_ID}', 'individual', 'ธนาคารกรุงไทย', 'พนักงาน F1',
              '4445556660', '1445556667778', true, '${ADMIN_ID}')
      ON CONFLICT (id) DO NOTHING
    `)
    // บริษัทไฟแนนซ์ใหม่ทุกรัน (ล็อต/รายได้ของรันก่อนลบไม่ได้) — ผูกเทมเพลต v1 ตอนสร้างเคส
    const company = await tx.$queryRawUnsafe<{ id: string }[]>(`
      INSERT INTO finance_companies (organization_id, name, short_name, tax_id, address, vat_mode,
                                     service_fee_template_id, created_by)
      VALUES ('${ORG_ID}', 'ไฟแนนซ์ Final 1 (${RUN})', 'F1', '${RUN_TAX_ID}', '9 ถนนทดสอบ ลำปาง 52000',
              'exclude_vat', '${TEMPLATE_V1}', '${ADMIN_ID}')
      RETURNING id
    `)
    companyId = company[0]?.id ?? ''
  })

  afterAll(async () => {
    await client?.$disconnect()
  })

  it('นำเข้าเคส: ช่อง "IMEI หรือ Serial" ตัดได้เฉพาะช่องว่าง/ขีด/จุด → 15 หลัก · อักขระอื่น = แถวตก · มีตัวอักษร = Serial (U24/U54)', async () => {
    const result = await caseImport.importCases(
      caseSchemas.caseImportSchema.parse({
        financeCompanyId: companyId,
        dryRun: false,
        rows: [
          { 'เลขที่สัญญา': `F1I-${RUN}-1`, 'IMEI / Serial': '35 6938-03.5643809', 'มูลหนี้คงเหลือ': '10,000' },
          { 'เลขที่สัญญา': `F1I-${RUN}-2`, 'IMEI / Serial': '35-693803/564380-9' },
          { 'เลขที่สัญญา': `F1I-${RUN}-3`, 'IMEI / Serial': '3569380356438' },
          { 'เลขที่สัญญา': `F1I-${RUN}-4`, 'IMEI / Serial': 'R58N12ABCDE' },
        ],
      }),
      ctx(admin),
    )
    expect(result.rows.map((row) => row.status)).toEqual(['created', 'failed', 'failed', 'created'])
    const stored = await db().case.findMany({
      where: { organizationId: ORG_ID, companyId, source: 'import' },
      select: { caseRef: true, imei: true, serialNo: true, status: true, debtAmountSatang: true },
      orderBy: { caseRef: 'asc' },
    })
    expect(stored).toEqual([
      { caseRef: `F1I-${RUN}-1`, imei: '356938035643809', serialNo: null, status: 'draft', debtAmountSatang: 1_000_000 },
      { caseRef: `F1I-${RUN}-4`, imei: null, serialNo: 'R58N12ABCDE', status: 'draft', debtAmountSatang: null },
    ])
  })

  it('Happy path เต็มสาย + snapshot ค่าบริการตอน approved + ที่พัก U89/U28 + คลัง + ล็อต we_deliver + Revenue ครั้งเดียว + PDPA U97', async () => {
    // ── 1) ส่งเคสทีละเคส (IMEI มีตัวคั่น) — บริษัทผูกเทมเพลต v1 ตอนสร้าง ───────────
    const caseId = await createReadyCase(`F1-${RUN}-OK`, IMEI_OK_SEPARATED)
    const draft = await db().case.findUniqueOrThrow({
      where: { id: caseId },
      select: { imei: true, serviceFeeTemplateId: true, serviceFeeRatePct: true },
    })
    expect(draft.imei).toBe(IMEI_OK)
    // ยังไม่ approved ⇒ ยังไม่มี snapshot
    expect(draft.serviceFeeTemplateId).toBeNull()
    expect(draft.serviceFeeRatePct).toBeNull()

    // เจรจาสัญญาใหม่ระหว่างเคสรอตรวจ ⇒ บริษัทย้ายไปเทมเพลต v2 ก่อนรับเคส
    await caseStatus.changeCaseStatus(admin, caseId, { action: 'review' }, ctx(admin))
    await db().$executeRawUnsafe(`UPDATE finance_companies SET service_fee_template_id = '${TEMPLATE_V2}' WHERE id = '${companyId}'`)
    const accepted = await caseStatus.changeCaseStatus(admin, caseId, { action: 'accept', teamId: TEAM_ID }, ctx(admin))
    expect(accepted.case.status).toBe('approved')
    // ย้ายกลับ v1 หลังรับเคส ⇒ snapshot ไม่ขยับ
    await db().$executeRawUnsafe(`UPDATE finance_companies SET service_fee_template_id = '${TEMPLATE_V1}' WHERE id = '${companyId}'`)
    const snapshot = await db().case.findUniqueOrThrow({
      where: { id: caseId },
      select: { serviceFeeTemplateId: true, serviceFeeModelSnapshot: true, serviceFeeRatePct: true },
    })
    expect(snapshot.serviceFeeTemplateId).toBe(TEMPLATE_V2)
    expect(snapshot.serviceFeeModelSnapshot).toBe('SUCCESS_FEE')
    expect(snapshot.serviceFeeRatePct?.toNumber()).toBe(20)

    // ── 2) มอบหมาย → รับงาน → ลงพื้นที่ ─────────────────────────────────────
    await fieldReady(caseId)

    // ค่าที่พัก: เพดานต่อคืน (U89) คิดต่อห้อง · พักร่วมกับหัวหน้าทีมในทีมเดียวกันได้ (U28)
    const today = new Date(`${bangkokDate(new Date())}T00:00:00.000Z`)
    const hotelInput = (amountSatang: number) => ({
      expenseDate: today,
      amountSatang,
      sharedWithUserId: LEAD_ID,
      receiptFileUrl: `field/receipts/${RUN}.jpg`,
      note: null,
    })
    expect(await codeOf(() => fieldExpenses.submitHotelClaim(agent, hotelInput(HOTEL_CAP_SATANG + 1), ctx(agent)))).toBe(
      'HOTEL_CLAIM_EXCEEDS_CAP',
    )
    const hotel = await fieldExpenses.submitHotelClaim(agent, hotelInput(HOTEL_CAP_SATANG), ctx(agent))
    expect(hotel.status).toBe('pending_approval')
    expect(hotel.sharedWithUserId).toBe(LEAD_ID)
    expect((await field.listFieldTeammates(agent)).map((row) => row.id)).toContain(LEAD_ID)

    // ── 3) ปิดงานสำเร็จ + หลักฐาน → แถวรายวันจาก job (DEC-012) ─────────────────
    const closed = await field.closeFieldCase(
      agent,
      caseId,
      { outcome: 'closed_success', photos: ['p1.jpg'], videos: ['v1.mp4'], productPhotos: ['pp1.jpg'] },
      ctx(agent),
    )
    expect(closed.status).toBe('closed_success')
    const closedRow = await db().case.findUniqueOrThrow({ where: { id: caseId }, select: { status: true, closedAt: true } })
    expect(closedRow.status).toBe('closed_success')
    expect(closedRow.closedAt).not.toBeNull()
    await settleFieldDaysToday(ORG_ID)

    const caseExpenses = await db().expense.findMany({ where: { caseId, deletedAt: null }, select: { expenseType: true, status: true } })
    expect(caseExpenses.map((row) => row.expenseType).sort()).toEqual(['allowance', 'commission', 'fuel'])
    expect(caseExpenses.every((row) => row.status === 'pending_warehouse_confirm')).toBe(true)
    // ค่าที่พักไม่ผูกเคส ⇒ ไม่ติดเกตคลัง
    expect((await db().expense.findUniqueOrThrow({ where: { id: hotel.id } })).status).toBe('pending_approval')

    // ── 4) คลังรับเข้า: IMEI ผิดรูปแบบ = ปฏิเสธ · มีตัวคั่น = ตัดแล้วตรงสัญญา ──────
    const asset = await db().asset.findFirstOrThrow({ where: { caseId } })
    expect(asset.assetStatus).toBe('pending_intake')
    expect(asset.imeiContract).toBe(IMEI_OK)
    for (const bad of [IMEI_OK.slice(0, 14), `${IMEI_OK}1`, `${IMEI_OK.slice(0, 14)}O`, `${IMEI_OK.slice(0, 7)}/${IMEI_OK.slice(7)}`]) {
      expect(
        warehouseSchemas.assetIntakeSchema.safeParse({ imeiActual: bad, condition: 'normal', photos: ['f.jpg'] }).success,
      ).toBe(false)
    }
    await warehouse.intakeAsset(
      admin,
      asset.id,
      warehouseSchemas.assetIntakeSchema.parse({
        imeiActual: IMEI_OK_SEPARATED,
        serialActual: null,
        condition: 'normal',
        conditionNote: null,
        photos: ['front.jpg'],
        colorCapacityMatched: true,
      }),
      ctx(admin),
    )
    const inCustody = await db().asset.findUniqueOrThrow({ where: { id: asset.id } })
    expect(inCustody.assetStatus).toBe('in_custody')
    expect(inCustody.imeiActual).toBe(IMEI_OK)

    // ── 5) ล็อต we_deliver (1 ล็อต = 1 บริษัท) → แนบเอกสาร → ยืนยัน ───────────────
    const lot = await warehouse.createLot(
      admin,
      {
        companyId,
        assetIds: [asset.id],
        type: 'we_deliver',
        scheduledAt: null,
        contactPerson: 'คุณกานดา',
        deliveryAddr: '9 ถนนทดสอบ ลำปาง 52000',
        trackingNo: 'TH0001F1',
        note: null,
      },
      ctx(admin),
    )
    expect(lot.status).toBe('pending_delivery_proof')
    const beYear = Number(bangkokDate(new Date()).slice(0, 4)) + 543
    expect(lot.lotNumber).toMatch(new RegExp(`^LOT-${beYear}-\\d{3,}$`))
    expect(lot.docRef).toMatch(new RegExp(`^DLV-${beYear}-\\d{3,}$`))

    const signed = `handover-lots/${lot.id}/signed_doc/${RUN}.pdf`
    const proof = `handover-lots/${lot.id}/delivery_proof/${RUN}.jpg`
    expect(
      await codeOf(() =>
        warehouse.confirmLot(admin, lot.id, { deliveredAt: null, signedDocUrl: signed, deliveryProofUrl: null }, ctx(admin)),
      ),
    ).toBe('LOT_MISSING_DELIVERY_PROOF')
    await warehouse.attachLotDocument(admin, lot.id, { document: 'delivery_proof', fileUrl: proof }, ctx(admin))
    const confirmed = await warehouse.confirmLot(
      admin,
      lot.id,
      { deliveredAt: null, signedDocUrl: signed, deliveryProofUrl: null },
      ctx(admin),
    )
    expect(confirmed.lot.status).toBe('confirmed')
    expect(confirmed.assetIdsHandedOver).toEqual([asset.id])
    expect(confirmed.expenseIdsUnlocked).toHaveLength(3)
    // expense ยังไม่อนุมัติ ⇒ ยังไม่มีรายได้ (`19` §6.1)
    expect(confirmed.revenueIdsCreated).toEqual([])
    const lotRow = await db().handoverLot.findUniqueOrThrow({ where: { id: lot.id } })
    expect(lotRow.letterheadSnapshot).toMatchObject({ name: 'Final 1 ปฏิบัติการ' })
    expect(lotRow.deliveryProofHash).toMatch(/^[0-9a-f]{64}$/)
    expect(lotRow.signedDocHash).toMatch(/^[0-9a-f]{64}$/)
    expect((await db().asset.findUniqueOrThrow({ where: { id: asset.id } })).assetStatus).toBe('handed_over')

    // ล็อต confirmed = terminal: แนบเอกสารใหม่/ยืนยันซ้ำไม่ได้
    expect(
      await codeOf(() =>
        warehouse.attachLotDocument(
          admin,
          lot.id,
          { document: 'signed_doc', fileUrl: `handover-lots/${lot.id}/signed_doc/${RUN}-v2.pdf` },
          ctx(admin),
        ),
      ),
    ).toBe('LOT_ALREADY_CONFIRMED')
    expect(
      await codeOf(() =>
        warehouse.confirmLot(admin, lot.id, { deliveredAt: null, signedDocUrl: signed, deliveryProofUrl: null }, ctx(admin)),
      ),
    ).toBe('LOT_ALREADY_CONFIRMED')

    // ── 6) อนุมัติรายการเบิกครบสาย ⇒ Revenue เกิดครั้งเดียว ตาม snapshot v2 ─────────
    expect(await approveAllCaseExpenses(caseId)).toBe(1)
    const revenues = await db().revenue.findMany({ where: { caseId } })
    expect(revenues).toHaveLength(1)
    const revenue = revenues[0]
    expect(revenue?.grossSatang).toBe(GROSS_V2_SATANG)
    expect(revenue?.vatSatang).toBe(VAT_V2_SATANG)
    expect(revenue?.totalSatang).toBe(TOTAL_V2_SATANG)
    expect(revenue?.feeModelSnapshot).toBe('SUCCESS_FEE')
    expect(revenue?.vatRatePctUsed.toNumber()).toBe(7)

    // ── 7) PDPA U97: ครบระยะเก็บแล้ว job ลบเฉพาะไฟล์เอกสารลูกหนี้ ─────────────────
    const farFuture = new Date((closedRow.closedAt ?? new Date()).getTime() + 6 * 366 * 24 * 60 * 60 * 1000)
    await purgeJob.runPurgeDebtorDocumentsJob({ organizationId: ORG_ID, now: farFuture, jobId: `final1-pdpa-${RUN}` })
    const documents = await db().caseDocument.findMany({ where: { caseId }, select: { documentType: true, purgedAt: true } })
    for (const document of documents) {
      if (document.documentType === 'product_photo') expect(document.purgedAt).toBeNull()
      else expect(document.purgedAt).not.toBeNull()
    }
    // ข้อมูลเคส/คลัง/การเงินไม่ถูกแตะ
    expect((await db().case.findUniqueOrThrow({ where: { id: caseId } })).status).toBe('closed_success')
    expect(await db().revenue.count({ where: { caseId } })).toBe(1)
    expect(await db().expense.count({ where: { caseId, status: 'approved' } })).toBe(3)
    expect((await db().asset.findUniqueOrThrow({ where: { id: asset.id } })).assetStatus).toBe('handed_over')
    const lotAfter = await db().handoverLot.findUniqueOrThrow({ where: { id: lot.id } })
    expect(lotAfter.signedDocUrl).toBe(signed)
    expect(lotAfter.deliveryProofUrl).toBe(proof)
    expect(await db().caseEvidence.count({ where: { caseId } })).toBeGreaterThan(0)
  })

  it('closed_fail (SUCCESS_FEE): ไม่เกิดเครื่องเข้าคลัง ไม่มีล็อต และไม่เกิด Revenue แม้ expense อนุมัติครบ (`19` §6.1 · `44` §11)', async () => {
    const caseId = await createReadyCase(`F1-${RUN}-FAIL`, IMEI_FAIL)
    await caseStatus.changeCaseStatus(admin, caseId, { action: 'review' }, ctx(admin))
    await caseStatus.changeCaseStatus(admin, caseId, { action: 'accept', teamId: TEAM_ID }, ctx(admin))
    await fieldReady(caseId)
    await field.closeFieldCase(
      agent,
      caseId,
      {
        outcome: 'closed_fail',
        failReason: 'other',
        failReasonDetail: 'ลูกหนี้ย้ายออกไม่ทราบที่อยู่',
        photos: ['p.jpg'],
        videos: ['v.mp4'],
        productPhotos: [],
      },
      ctx(agent),
    )
    await settleFieldDaysToday(ORG_ID)

    expect(await db().asset.count({ where: { caseId } })).toBe(0)
    const rows = await db().expense.findMany({ where: { caseId, deletedAt: null }, select: { status: true } })
    expect(rows.length).toBeGreaterThan(0)
    // ไม่สำเร็จ = เข้าคิวอนุมัติทันที (ไม่รอคลัง)
    expect(rows.every((row) => row.status === 'pending_approval')).toBe(true)
    expect(await approveAllCaseExpenses(caseId)).toBe(0)
    expect(await db().revenue.count({ where: { caseId } })).toBe(0)
  })
})
