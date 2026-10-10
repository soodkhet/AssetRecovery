import { PrismaPg } from '@prisma/adapter-pg'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { SessionUser } from '@/lib/auth/types'
import { PrismaClient } from '@/lib/generated/prisma/client'
import { INCOME_TYPE_TEXT_CORPORATE } from '@/lib/settings/wht-policy'

/**
 * เทสต์ระดับ DB ของ Phase 4.5 — DoD ของไฟล์ 33
 *
 *  - `33` §9: รอบจ่าย `completed` ⇒ ออกใบ 50 ทวิ อัตโนมัติ **เฉพาะรายการที่หักภาษีจริง**
 *    (เงินทดรอง `wht = 0` ไม่ออก) · เรียกซ้ำไม่ออกซ้ำ (idempotent)
 *  - `33` §16: แยก ภ.ง.ด.3/53 ถูกประเภทเมื่อมีทั้งบุคคลธรรมดาและนิติบุคคลในรอบเดียวกัน
 *  - `33` §16: ยกเลิกไม่กรอกเหตุผล ⇒ `WHT_CANCEL_REQUIRES_REASON`
 *  - `33` §16: **ยอดใบที่ยกเลิกหายจาก pnd3/pnd53 ทันที** แต่แถวยังอยู่ (`02` §13 ห้ามลบ)
 *  - `33` §10: ยกเลิกพร้อมออกใบแทน ⇒ ใบใหม่ได้เลขถัดไป + `replaces_certificate_id` trace 2 ทาง
 *  - `33` §11: เลยกำหนดนำส่ง ⇒ `FILING_OVERDUE_WARNING` เดินทางมากับ envelope (เตือน ไม่ block)
 *  - D11: เดินเลขภายใต้ `FOR UPDATE` — ออกใบพร้อมกัน 2 คำขอต้องได้เลขต่างกันและไม่ขาดช่วง
 *  - Period Lock: งวด `locked` ⇒ ยกเลิกใบไม่ได้ แต่ **mark-filed ยังทำได้** (กำหนดยื่นอยู่หลังปิดงวด)
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
  console.warn('[wht.db.test] ข้ามเทสต์ระดับ DB — ไม่มี TEST_DATABASE_URL (ดู .env.example)')
}

const ORG_ID = '00000000-0000-4000-8000-0000000045a0'
const ROLE_ID = '00000000-0000-4000-8000-0000000045a1'
const USER_ID = '00000000-0000-4000-8000-0000000045a2'
const AGENT_ID = '00000000-0000-4000-8000-0000000045a3'
const VENDOR_ID = '00000000-0000-4000-8000-0000000045a4'
const TEAM_ID = '00000000-0000-4000-8000-0000000045a5'
const PAYEE_PERSON_ID = '00000000-0000-4000-8000-0000000045a6'
const PAYEE_COMPANY_ID = '00000000-0000-4000-8000-0000000045a7'
const TAX_PROFILE_PND53_ID = '00000000-0000-4000-8000-0000000045a8'

/** วันจ่ายจริงของทุกรอบในไฟล์นี้ — 25/06/2569 เวลาไทย ⇒ งวด "มิถุนายน 2569" */
const PAYMENT_AT = '2026-06-25T03:00:00Z'

let client: PrismaClient | null = null
type ExpenseQueries = typeof import('@/lib/expenses/queries')
type WhtQueries = typeof import('@/lib/wht/queries')
type WhtSummaryJob = typeof import('@/lib/wht/summary-job')
let expenses: ExpenseQueries
let wht: WhtQueries
let summaryJob: WhtSummaryJob

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
  id: USER_ID,
  organizationId: ORG_ID,
  supabaseUid: 'uid-acc-45',
  email: 'accounting45@test.local',
  fullName: 'บัญชี 4.5',
  status: 'active',
  roleId: ROLE_ID,
  roleName: 'บัญชี',
  roleGroup: 'system',
  isSuperadmin: false,
  teamId: null,
  companyId: null,
  capabilities: {
    manage_sales_expenses: 'manage',
    map_cost_center: 'manage',
    manage_wht: 'manage',
    manage_accounting_period: 'manage',
  },
  scope: { kind: 'global', teamIds: [], companyId: null, userId: USER_ID },
  loginAt: new Date().toISOString(),
}

const ctx = { actor: accountant, meta }

function codeOf(error: unknown): string {
  return (error as { code?: string }).code ?? String(error)
}

async function expectCode(run: () => Promise<unknown>, code: string): Promise<void> {
  await expect(run()).rejects.toSatisfy((error: unknown) => codeOf(error) === code, `ต้องได้ error code ${code}`)
}

// ── seed helpers ────────────────────────────────────────────────────────────

let batchCursor = 0

interface SeedItem {
  payeeId: string
  gross: number
  wht: number
  /** `null` = รายการเงินทดรองจ่าย (A4 — ไม่มี expense ต้นทาง ไม่หัก WHT) */
  taxProfileId?: string | null
}

/** รอบจ่าย 1 รอบ + รายการตามที่ระบุ — คืน id ของรอบและรายการในรอบ */
async function seedBatch(items: readonly SeedItem[]): Promise<{ batchId: string; batchName: string }> {
  batchCursor += 1
  const name = `PB-4.5-${batchCursor}`
  const gross = items.reduce((sum, item) => sum + item.gross, 0)
  const whtTotal = items.reduce((sum, item) => sum + item.wht, 0)

  const batchRows = await db().$queryRawUnsafe<{ id: string }[]>(`
    INSERT INTO payout_batches (organization_id, name, side, status, gross_satang, wht_satang, net_satang,
                                payment_file_generated_at, created_by)
    VALUES ('${ORG_ID}', '${name}', 'outsource', 'completed', ${gross}, ${whtTotal}, ${gross - whtTotal},
            '${PAYMENT_AT}', '${USER_ID}')
    RETURNING id
  `)
  const batchId = batchRows[0]?.id ?? ''

  for (const item of items) {
    const expenseRows = await db().$queryRawUnsafe<{ id: string }[]>(`
      INSERT INTO expenses (organization_id, payee_id, expense_type, gross_satang, expense_date, status,
                            receipt_file_url, receipt_file_hash, created_by)
      VALUES ('${ORG_ID}', '${item.payeeId}', 'commission', ${item.gross}, '2026-06-20', 'approved',
              'field/receipts/ok.jpg', 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', '${USER_ID}')
      RETURNING id
    `)
    const profile = item.taxProfileId === undefined || item.taxProfileId === null ? 'NULL' : `'${item.taxProfileId}'`
    await db().$executeRawUnsafe(`
      INSERT INTO payout_batch_items (organization_id, payout_batch_id, expense_id, payee_id,
                                      gross_satang, wht_satang, net_satang, tax_profile_id, created_by)
      VALUES ('${ORG_ID}', '${batchId}', '${expenseRows[0]?.id}', '${item.payeeId}',
              ${item.gross}, ${item.wht}, ${item.gross - item.wht}, ${profile}, '${USER_ID}')
    `)
  }

  return { batchId, batchName: name }
}

async function setPeriodStatus(status: string): Promise<void> {
  const tx = db()
  // งวดที่ `locked` ถูก trigger แช่แข็งไว้ (`02` §13) — fixture ต้องปลดกลับได้ ⇒ ปิดยามเฉพาะตอนตั้งค่าเทสต์
  await tx.$executeRawUnsafe(`ALTER TABLE accounting_periods DISABLE TRIGGER trg_accounting_periods_locked`)
  try {
    await tx.$executeRawUnsafe(`
      UPDATE accounting_periods SET status = '${status}'
      WHERE organization_id = '${ORG_ID}' AND year_be = 2569 AND month = 6
    `)
  } finally {
    await tx.$executeRawUnsafe(`ALTER TABLE accounting_periods ENABLE TRIGGER trg_accounting_periods_locked`)
  }
}

async function junePeriodId(): Promise<string> {
  const rows = await db().$queryRawUnsafe<{ id: string }[]>(`
    SELECT id FROM accounting_periods WHERE organization_id = '${ORG_ID}' AND year_be = 2569 AND month = 6
  `)
  return rows[0]?.id ?? ''
}

/**
 * ล้างข้อมูลขององค์กรทดสอบก่อนเริ่ม — ยอดของรอบและลำดับเลขที่เป็นค่าสะสม
 * (บทเรียน Phase 3.5: ฐานทดสอบสะสมจนเลขเอกสาร/ยอดชนกันเมื่อรันซ้ำ)
 *
 * ⚠️ `audit_logs` **ลบไม่ได้** (immutable `02` §13 — DB trigger ปฏิเสธ DELETE) จึงสะสมได้
 *    ⇒ ทุก assertion ที่แตะ audit ต้องเป็นแบบ "อย่างน้อย"/"ล่าสุด" ไม่ใช่จำนวนเป๊ะ
 */
async function resetOrgData(): Promise<void> {
  const tx = db()
  // ใบ 50 ทวิ ลบไม่ได้ด้วย trigger (`02` §13 — เลขที่ห้ามขาดช่วง) — ปิดเฉพาะตอนล้างข้อมูลเทสต์
  await tx.$executeRawUnsafe(`ALTER TABLE wht_certificates DISABLE TRIGGER trg_wht_certificates_no_delete`)
  try {
    for (const statement of [
      `DELETE FROM wht_certificates WHERE organization_id = '${ORG_ID}'`,
      `DELETE FROM wht_filing_summaries WHERE organization_id = '${ORG_ID}'`,
      `DELETE FROM expense_records WHERE organization_id = '${ORG_ID}'`,
      `DELETE FROM exceptions WHERE organization_id = '${ORG_ID}'`,
      `DELETE FROM payout_batch_items WHERE organization_id = '${ORG_ID}'`,
      `DELETE FROM expenses WHERE organization_id = '${ORG_ID}'`,
      `DELETE FROM payout_batches WHERE organization_id = '${ORG_ID}'`,
      // ค่าตั้งวิธียื่น (U45) ที่เทสต์เพิ่ม — ห้ามค้างข้ามรอบรัน (วันกำหนดของงวดถัดไปจะเพี้ยน)
      `DELETE FROM wht_policy_history WHERE organization_id = '${ORG_ID}'`,
      // ปฏิทินวันหยุด (U93) ที่เทสต์เพิ่ม — กำหนดยื่นของงวดถัดไปจะเลื่อนถ้าค้าง
      `DELETE FROM public_holidays WHERE organization_id = '${ORG_ID}'`,
      `DELETE FROM accounting_periods WHERE organization_id = '${ORG_ID}'`,
    ]) {
      await tx.$executeRawUnsafe(statement)
    }
  } finally {
    await tx.$executeRawUnsafe(`ALTER TABLE wht_certificates ENABLE TRIGGER trg_wht_certificates_no_delete`)
  }
}

beforeAll(async () => {
  if (!url) return
  process.env.DATABASE_URL = url
  expenses = await import('@/lib/expenses/queries')
  wht = await import('@/lib/wht/queries')
  summaryJob = await import('@/lib/wht/summary-job')

  const tx = db()
  await tx.$executeRawUnsafe(`
    INSERT INTO organizations (id, name, tax_id, address, vat_registered)
    VALUES ('${ORG_ID}', 'Phase45Test', '9999999994500', 'ที่อยู่ทดสอบ 4.5 กรุงเทพฯ', true)
    ON CONFLICT (id) DO NOTHING
  `)
  await tx.$executeRawUnsafe(`
    INSERT INTO roles (id, organization_id, name, role_group, is_seed)
    VALUES ('${ROLE_ID}', '${ORG_ID}', 'บัญชี 4.5', 'system', false) ON CONFLICT (id) DO NOTHING
  `)
  await tx.$executeRawUnsafe(`
    INSERT INTO users (id, organization_id, role_id, email, full_name, status)
    VALUES ('${USER_ID}', '${ORG_ID}', '${ROLE_ID}', 'accounting45@test.local', 'บัญชี 4.5', 'active'),
           ('${AGENT_ID}', '${ORG_ID}', '${ROLE_ID}', 'agent45@test.local', 'ประยุทธ์ บุญมี', 'active'),
           ('${VENDOR_ID}', '${ORG_ID}', '${ROLE_ID}', 'vendor45@test.local', 'บริษัท เร็วดี จำกัด', 'active')
    ON CONFLICT (id) DO NOTHING
  `)
  await tx.$executeRawUnsafe(`
    INSERT INTO teams (id, organization_id, name, side, provinces, status, created_by)
    VALUES ('${TEAM_ID}', '${ORG_ID}', 'ทีมทดสอบ 4.5', 'outsource', ARRAY['เชียงใหม่'], 'active', '${USER_ID}')
    ON CONFLICT (id) DO NOTHING
  `)
  await tx.$executeRawUnsafe(`
    INSERT INTO tax_profiles (id, organization_id, name, wht_pct, income_type, filing_form, created_by)
    VALUES ('${TAX_PROFILE_PND53_ID}', '${ORG_ID}', 'นิติบุคคล 4.5', 3.00, 'ค่าบริการ มาตรา 40(8)', 'PND53', '${USER_ID}')
    ON CONFLICT (id) DO NOTHING
  `)
  await tx.$executeRawUnsafe(`
    INSERT INTO payee_profiles (id, organization_id, user_id, payee_type, national_id, is_verified, created_by, legal_name)
    VALUES ('${PAYEE_PERSON_ID}', '${ORG_ID}', '${AGENT_ID}', 'individual', '3100000001234', true, '${USER_ID}', NULL),
           ('${PAYEE_COMPANY_ID}', '${ORG_ID}', '${VENDOR_ID}', 'corporate', '0105560099999', true, '${USER_ID}',
            'บริษัท เร็วดี จำกัด')
    ON CONFLICT (id) DO NOTHING
  `)

  await resetOrgData()
})

afterAll(async () => {
  await client?.$disconnect()
})

suite('Phase 4.5 — ออกใบ 50 ทวิ อัตโนมัติจากรอบจ่าย (`33` §9 · §16)', () => {
  it('ออกใบเฉพาะรายการที่หักภาษีจริง + แยกแบบถูกประเภท + เรียกซ้ำไม่ออกซ้ำ', async () => {
    await setPeriodStatus('collecting')
    const seeded = await seedBatch([
      { payeeId: PAYEE_PERSON_ID, gross: 45_000_00, wht: 1_350_00 },
      { payeeId: PAYEE_COMPANY_ID, gross: 12_000_00, wht: 360_00, taxProfileId: TAX_PROFILE_PND53_ID },
      // เงินทดรองจ่าย/ยอดต่ำกว่าเกณฑ์ — ไม่หักภาษี ⇒ ไม่มีใบรับรอง
      { payeeId: PAYEE_PERSON_ID, gross: 600_00, wht: 0 },
    ])

    // sync บัญชีค่าใช้จ่ายเป็นตัวเรียกใบ 50 ทวิ ต่อให้เอง (`33` §9 ต่อจากไฟล์ 32)
    await expenses.syncExpenseRecordsFromPayout(ctx, seeded.batchId)

    const issued = await db().whtCertificate.findMany({
      where: { organizationId: ORG_ID, expenseRecord: { payoutBatchItem: { payoutBatchId: seeded.batchId } } },
      orderBy: { certificateNumber: 'asc' },
    })
    expect(issued).toHaveLength(2)
    expect(issued.map((row) => row.filingForm).sort()).toEqual(['PND3', 'PND53'])
    expect(issued.every((row) => row.status === 'active')).toBe(true)
    expect(issued.every((row) => row.certificateNumber.startsWith('WHT-2569-'))).toBe(true)
    // ประเภทเงินได้มาจาก Tax Profile ที่ snapshot ไว้ (นิติบุคคล) ไม่ใช่ค่า default ของบุคคลธรรมดา
    // นิติบุคคล (มติ PO U96 #2) — ข้อความ Tax Profile ที่อ้าง "มาตรา 40" ถูกแทนด้วยหมวดค่าบริการ (ม.3 เตรส)
    const juristic = issued.find((row) => row.filingForm === 'PND53')
    expect(juristic?.incomeType).toBe(INCOME_TYPE_TEXT_CORPORATE)
    expect(juristic?.whtSatang).toBe(360_00)

    // เรียกซ้ำ (เส้นทางกระทบยอดธนาคารรันซ้ำได้) ⇒ จำนวนใบต้องเท่าเดิม
    await expenses.syncExpenseRecordsFromPayout(ctx, seeded.batchId)
    const again = await db().whtCertificate.count({
      where: { organizationId: ORG_ID, expenseRecord: { payoutBatchItem: { payoutBatchId: seeded.batchId } } },
    })
    expect(again).toBe(2)

    // audit ของการออกใบต้องมีครบทุกฉบับ (`33` §13)
    const audits = await db().auditLog.count({
      where: { organizationId: ORG_ID, targetType: 'wht_certificates', action: 'create' },
    })
    expect(audits).toBeGreaterThanOrEqual(2)
  })

  it('สรุปรอบนำส่งเกิดเอง: due date = 15 ของเดือนถัดไป + แยกยอด pnd3/pnd53', async () => {
    const summaries = await wht.listWhtFilingSummaries(accountant, {}, new Date('2026-07-02T03:00:00Z'))
    const june = summaries.items.find((item) => item.periodLabel === 'มิถุนายน 2569')

    expect(june).toBeDefined()
    expect(june?.filingDueDate).toBe('2026-07-15T00:00:00.000Z')
    expect(june?.pnd3Satang).toBe(1_350_00)
    expect(june?.pnd53Satang).toBe(360_00)
    expect(june?.status).toBe('pending')
    expect(june?.daysRemaining).toBe(13)
    expect(summaries.warning).toBeNull()
  })

  it('U45 — ตั้งวิธียื่นเป็นกระดาษ ⇒ รอบที่ยังไม่ยื่นเลื่อนกำหนดเป็นวันที่ 7 + ป้าย + audit · กลับเป็นออนไลน์ได้', async () => {
    const settings = await import('@/lib/settings/queries/wht-policy')
    const policyNow = new Date('2026-06-20T03:00:00Z')
    const base = {
      baseExpenseTypes: ['commission', 'no_success_fee', 'fuel', 'allowance'] as const,
      certificateMode: 'per_payee_batch' as const,
      incomeTypeMode: 'all_40_8' as const,
      issueZeroRate402Certificate: true,
      inhouseIncomeCategory: 'sec_40_2' as const,
      outsourceIncomeCategory: 'sec_40_8' as const,
      allowGrossUpConditions: false,
    }
    const paper = await settings.createWhtPolicy(
      { actor: accountant, meta, reason: 'สำนักงานบัญชียื่นแบบกระดาษ' },
      { ...base, baseExpenseTypes: [...base.baseExpenseTypes], filingMethod: 'paper', effectiveFrom: new Date('2026-07-01T00:00:00Z') },
      policyNow,
    )
    expect(paper.filingMethod).toBe('paper')
    try {
      const summaries = await wht.listWhtFilingSummaries(accountant, {}, new Date('2026-07-02T03:00:00Z'))
      const june = summaries.items.find((item) => item.periodLabel === 'มิถุนายน 2569')
      expect(june?.filingDueDate).toBe('2026-07-07T00:00:00.000Z')
      expect(june?.filingMethod).toBe('paper')
      expect(june?.filingMethodLabel).toBe('(ยื่นแบบกระดาษ)')
      expect(june?.daysRemaining).toBe(5)

      const audit = await db().auditLog.findFirst({
        where: { organizationId: ORG_ID, targetType: 'wht_policy_history', targetId: paper.id },
        select: { afterData: true, reason: true },
      })
      expect(audit?.reason).toBe('สำนักงานบัญชียื่นแบบกระดาษ')
      expect(JSON.stringify(audit?.afterData)).toContain('"filing_method":"paper"')
      expect(JSON.stringify(audit?.afterData)).toContain('refreshed_filing_summaries')
    } finally {
      // กลับเป็นออนไลน์ (insert-only — เพิ่มชุดใหม่) ⇒ วันกำหนดกลับเป็น 15 · เทสต์ถัดไปเห็นค่าเดิม
      await settings.createWhtPolicy(
        { actor: accountant, meta, reason: 'กลับไปยื่นออนไลน์' },
        { ...base, baseExpenseTypes: [...base.baseExpenseTypes], filingMethod: 'online', effectiveFrom: new Date('2026-07-01T00:00:00Z') },
        policyNow,
      )
    }
    const back = await wht.listWhtFilingSummaries(accountant, {}, new Date('2026-07-02T03:00:00Z'))
    expect(back.items.find((item) => item.periodLabel === 'มิถุนายน 2569')?.filingDueDate).toBe('2026-07-15T00:00:00.000Z')
  })

  it('U93 — เพิ่มวันหยุดตรงกำหนดยื่น ⇒ รอบ pending เลื่อนเป็นวันทำการถัดไป + ป้าย + audit · ลบ ⇒ กลับ', async () => {
    const holidays = await import('@/lib/settings/queries/holidays')
    const now = new Date('2026-07-02T03:00:00Z')
    const june = async () =>
      (await wht.listWhtFilingSummaries(accountant, {}, now)).items.find((item) => item.periodLabel === 'มิถุนายน 2569')
    const hctx = (reason: string) => ({ actor: accountant, meta, reason })

    // 1) เพิ่ม 15/07/2569 (พุธ) ⇒ เลื่อนเป็นพฤหัส 16/07/2569
    const added = await holidays.createHoliday(hctx('ประกาศวันหยุดพิเศษ'), {
      holidayDate: new Date('2026-07-15T00:00:00Z'),
      name: 'วันหยุดพิเศษทดสอบ',
    })
    expect(added.created[0]?.holidayDate).toBe('2026-07-15')
    expect(added.created[0]?.yearBe).toBe(2569)
    expect(added.refreshedFilings).toEqual([{ periodLabel: 'มิถุนายน 2569', fromDate: '2026-07-15', toDate: '2026-07-16' }])
    let row = await june()
    expect(row?.filingDueDate).toBe('2026-07-16T00:00:00.000Z')
    expect(row?.filingNominalDueDate).toBe('2026-07-15T00:00:00.000Z')
    expect(row?.filingDueLabel).toBe('15/07/2569 → 16/07/2569 (เลื่อนจากวันหยุด) (ยื่นออนไลน์)')
    expect(row?.daysRemaining).toBe(14)

    const holidayAudit = await db().auditLog.findFirst({
      where: { organizationId: ORG_ID, targetType: 'public_holidays', targetId: added.created[0]?.id, action: 'create' },
      select: { reason: true, afterData: true, actorId: true },
    })
    expect(holidayAudit?.reason).toBe('ประกาศวันหยุดพิเศษ')
    expect(holidayAudit?.actorId).toBe(USER_ID)
    expect(JSON.stringify(holidayAudit?.afterData)).toContain('"holiday_date":"2026-07-15"')
    const filingAudit = await db().auditLog.findFirst({
      where: { organizationId: ORG_ID, targetType: 'wht_filing_summaries', targetId: row?.id, action: 'update' },
      orderBy: { createdAt: 'desc' },
      select: { reason: true, beforeData: true, afterData: true },
    })
    expect(filingAudit?.reason).toBe('ประกาศวันหยุดพิเศษ')
    expect(JSON.stringify(filingAudit?.beforeData)).toContain('2026-07-15')
    expect(JSON.stringify(filingAudit?.afterData)).toContain('2026-07-16')

    // 2) วันซ้ำ ⇒ DUPLICATE_HOLIDAY_DATE
    await expectCode(
      () => holidays.createHoliday(hctx('เพิ่มซ้ำโดยไม่ตั้งใจ'), { holidayDate: new Date('2026-07-15T00:00:00Z'), name: 'ซ้ำ' }),
      'DUPLICATE_HOLIDAY_DATE',
    )

    // 3) นำเข้า 16/07 (ใหม่) + 15/07 (มีอยู่แล้ว ⇒ ข้าม) ⇒ เลื่อนต่อเป็นศุกร์ 17/07/2569
    const imported = await holidays.importHolidays(hctx('นำเข้าวันหยุดต่อเนื่อง'), [
      { holidayDate: new Date('2026-07-16T00:00:00Z'), name: 'วันหยุดต่อเนื่อง' },
      { holidayDate: new Date('2026-07-15T00:00:00Z'), name: 'ซ้ำในชุดนำเข้า' },
    ])
    expect(imported.created.map((item) => item.holidayDate)).toEqual(['2026-07-16'])
    expect(imported.skippedDates).toEqual(['2026-07-15'])
    expect((await june())?.filingDueDate).toBe('2026-07-17T00:00:00.000Z')
    const listed = await holidays.listHolidays(ORG_ID, 2569)
    expect(listed.items.map((item) => `${item.holidayDate} ${item.weekdayLabel}`)).toEqual([
      '2026-07-15 พุธ',
      '2026-07-16 พฤหัสบดี',
    ])
    expect(listed.years).toEqual([2569])
    expect((await holidays.listHolidays(ORG_ID, 2570)).items).toEqual([])

    // 4) ลบ 15/07 ⇒ วันตามปฏิทินเป็นวันทำการอีกครั้ง ⇒ กลับเป็น 15/07/2569 (ไม่แสดงการเลื่อน)
    const first = await holidays.getHoliday(ORG_ID, added.created[0]?.id ?? '')
    const removed = await holidays.deleteHoliday(hctx('ใส่วันผิด'), first)
    expect(removed.refreshedFilings[0]?.toDate).toBe('2026-07-15')
    row = await june()
    expect(row?.filingDueDate).toBe('2026-07-15T00:00:00.000Z')
    expect(row?.filingNominalDueDate).toBeNull()
    expect(row?.filingDueLabel).toBe('15/07/2569 (ยื่นออนไลน์)')
    const deleteAudit = await db().auditLog.findFirst({
      where: { organizationId: ORG_ID, targetType: 'public_holidays', targetId: first.id, action: 'delete' },
      select: { reason: true },
    })
    expect(deleteAudit?.reason).toBe('ใส่วันผิด')
    // แถวยังอยู่ (soft delete) · หาไม่เจอจาก API · ลบซ้ำไม่ได้
    const softDeleted = await db().publicHoliday.findUnique({ where: { id: first.id }, select: { deletedAt: true } })
    expect(softDeleted?.deletedAt).not.toBeNull()
    await expectCode(() => holidays.getHoliday(ORG_ID, first.id), 'HOLIDAY_NOT_FOUND')

    // 5) ลบ 16/07 ⇒ ไม่กระทบกำหนดยื่น (ไม่มีรอบเปลี่ยน) · เพิ่ม 15/07 ใหม่หลังลบได้ (partial unique)
    const second = listed.items[1]
    if (second === undefined) throw new Error('ไม่พบวันหยุดที่นำเข้า')
    const removedSecond = await holidays.deleteHoliday(hctx('ยกเลิกวันหยุดต่อเนื่อง'), second)
    expect(removedSecond.refreshedFilings).toEqual([])
    const again = await holidays.createHoliday(hctx('เพิ่มกลับหลังลบ'), {
      holidayDate: new Date('2026-07-15T00:00:00Z'),
      name: 'เพิ่มกลับ',
    })
    expect(again.created).toHaveLength(1)
    await holidays.deleteHoliday(hctx('คืนค่าเทสต์'), again.created[0] as NonNullable<(typeof again.created)[0]>)
    expect((await june())?.filingDueDate).toBe('2026-07-15T00:00:00.000Z')
  })

  it('U93 — ออกใบ/คิดสรุปรอบใหม่ใช้ปฏิทินวันหยุดด้วย (refreshFilingSummary)', async () => {
    const holidays = await import('@/lib/settings/queries/holidays')
    const added = await holidays.createHoliday(
      { actor: accountant, meta, reason: 'ทดสอบคิดสรุปรอบใหม่' },
      { holidayDate: new Date('2026-07-15T00:00:00Z'), name: 'วันหยุดทดสอบ' },
    )
    try {
      // คืนกำหนดยื่นเป็นค่าเดิมด้วยมือ แล้วให้ตัวคิดสรุปรอบ (เส้นทางออก/ยกเลิกใบ) คำนวณเอง
      const period = await db().accountingPeriod.findFirstOrThrow({
        where: { organizationId: ORG_ID, yearBe: 2569, month: 6 },
        select: { id: true, periodLabel: true },
      })
      await db().whtFilingSummary.update({ where: { periodId: period.id }, data: { filingDueDate: new Date('2026-07-15T00:00:00Z') } })
      const { prisma } = await import('@/lib/prisma')
      await wht.refreshFilingSummary(prisma, {
        organizationId: ORG_ID,
        periodId: period.id,
        periodLabel: period.periodLabel,
        yearBe: 2569,
        month: 6,
      })
      const summary = await db().whtFilingSummary.findUniqueOrThrow({ where: { periodId: period.id } })
      expect(summary.filingDueDate.toISOString()).toBe('2026-07-16T00:00:00.000Z')
    } finally {
      const current = added.created[0]
      if (current !== undefined) await holidays.deleteHoliday({ actor: accountant, meta, reason: 'คืนค่าเทสต์' }, current)
    }
  })

  it('เลยกำหนดแล้วยังไม่ยื่น ⇒ FILING_OVERDUE_WARNING (เตือน ไม่ block — ยังคืนรายการปกติ)', async () => {
    const late = await wht.listWhtFilingSummaries(accountant, {}, new Date('2026-07-22T03:00:00Z'))
    expect(late.items.length).toBeGreaterThan(0)
    expect(late.warning?.code).toBe('FILING_OVERDUE_WARNING')
    expect(late.pending?.isOverdue).toBe(true)
  })
})

suite('Phase 4.5 — ยกเลิก/ออกใบแทน (`33` §10 · §16)', () => {
  it('ยกเลิกไม่กรอกเหตุผล ⇒ WHT_CANCEL_REQUIRES_REASON และใบยัง active', async () => {
    await setPeriodStatus('collecting')
    const seeded = await seedBatch([{ payeeId: PAYEE_PERSON_ID, gross: 20_000_00, wht: 600_00 }])
    await expenses.syncExpenseRecordsFromPayout(ctx, seeded.batchId)
    const certificate = await db().whtCertificate.findFirstOrThrow({
      where: { expenseRecord: { payoutBatchItem: { payoutBatchId: seeded.batchId } } },
    })

    await expectCode(
      () => wht.cancelWhtCertificate(ctx, certificate.id, { reason: '   ', reissue: false }),
      'WHT_CANCEL_REQUIRES_REASON',
    )
    const untouched = await db().whtCertificate.findUniqueOrThrow({ where: { id: certificate.id } })
    expect(untouched.status).toBe('active')
  })

  it('ยกเลิก ⇒ ยอดหายจาก pnd3/pnd53 แต่แถวยังอยู่ (ห้ามลบ) · ยกเลิกซ้ำไม่ได้', async () => {
    await setPeriodStatus('collecting')
    const periodId = await junePeriodId()
    const before = await db().whtFilingSummary.findUniqueOrThrow({ where: { periodId } })

    const seeded = await seedBatch([{ payeeId: PAYEE_PERSON_ID, gross: 30_000_00, wht: 900_00 }])
    await expenses.syncExpenseRecordsFromPayout(ctx, seeded.batchId)
    const certificate = await db().whtCertificate.findFirstOrThrow({
      where: { expenseRecord: { payoutBatchItem: { payoutBatchId: seeded.batchId } } },
    })

    const withNew = await db().whtFilingSummary.findUniqueOrThrow({ where: { periodId } })
    expect(withNew.pnd3Satang).toBe(before.pnd3Satang + 900_00)

    const { cancelled, replacement } = await wht.cancelWhtCertificate(ctx, certificate.id, {
      reason: 'ฐานหักผิด',
      reissue: false,
    })
    expect(cancelled.status).toBe('cancelled')
    expect(cancelled.cancelReason).toBe('ฐานหักผิด')
    expect(replacement).toBeNull()

    const afterCancel = await db().whtFilingSummary.findUniqueOrThrow({ where: { periodId } })
    expect(afterCancel.pnd3Satang).toBe(before.pnd3Satang)

    // ใบต้องยังอยู่พร้อมเลขที่เดิม (`02` §13 immutable) และยกเลิกซ้ำไม่ได้
    const stored = await db().whtCertificate.findUniqueOrThrow({ where: { id: certificate.id } })
    expect(stored.certificateNumber).toBe(certificate.certificateNumber)
    await expectCode(
      () => wht.cancelWhtCertificate(ctx, certificate.id, { reason: 'ยกเลิกซ้ำ', reissue: false }),
      'WHT_CERTIFICATE_INVALID_STATUS',
    )
  })

  it('ยกเลิกพร้อมออกใบแทน ⇒ ใบใหม่เลขถัดไป + trace กลับฉบับเดิม + ยอดของรอบเท่าเดิม', async () => {
    await setPeriodStatus('collecting')
    const periodId = await junePeriodId()
    const seeded = await seedBatch([
      { payeeId: PAYEE_COMPANY_ID, gross: 11_000_00, wht: 330_00, taxProfileId: TAX_PROFILE_PND53_ID },
    ])
    await expenses.syncExpenseRecordsFromPayout(ctx, seeded.batchId)
    const original = await db().whtCertificate.findFirstOrThrow({
      where: { expenseRecord: { payoutBatchItem: { payoutBatchId: seeded.batchId } } },
    })
    const beforeTotal = (await db().whtFilingSummary.findUniqueOrThrow({ where: { periodId } })).pnd53Satang

    const { cancelled, replacement } = await wht.cancelWhtCertificate(ctx, original.id, {
      reason: 'ข้อมูลผู้ถูกหักผิด',
      reissue: true,
    })

    expect(cancelled.status).toBe('cancelled')
    expect(replacement).not.toBeNull()
    expect(replacement?.certificateNumber).not.toBe(original.certificateNumber)
    expect(replacement?.replacesCertificateId).toBe(original.id)
    expect(replacement?.replacesCertificateNumber).toBe(original.certificateNumber)
    expect(replacement?.whtSatang).toBe(330_00)

    const afterTotal = (await db().whtFilingSummary.findUniqueOrThrow({ where: { periodId } })).pnd53Satang
    expect(afterTotal).toBe(beforeTotal)

    // sync ซ้ำหลังออกใบแทนแล้วต้องไม่ออกใบที่ 3
    await expenses.syncExpenseRecordsFromPayout(ctx, seeded.batchId)
    const total = await db().whtCertificate.count({
      where: { expenseRecord: { payoutBatchItem: { payoutBatchId: seeded.batchId } } },
    })
    expect(total).toBe(2)
  })

  it('ใบที่ถูกยกเลิกแล้ว sync รอบเดิมซ้ำ ⇒ ออกใบแทนให้อัตโนมัติพร้อมอ้างกลับ (`33` §9)', async () => {
    await setPeriodStatus('collecting')
    const seeded = await seedBatch([{ payeeId: PAYEE_PERSON_ID, gross: 25_000_00, wht: 750_00 }])
    await expenses.syncExpenseRecordsFromPayout(ctx, seeded.batchId)
    const original = await db().whtCertificate.findFirstOrThrow({
      where: { expenseRecord: { payoutBatchItem: { payoutBatchId: seeded.batchId } } },
    })
    await wht.cancelWhtCertificate(ctx, original.id, { reason: 'พิมพ์ผิด', reissue: false })

    const issued = await wht.syncWhtCertificatesFromPayout(ctx, seeded.batchId)
    expect(issued).toHaveLength(1)
    expect(issued[0]?.status).toBe('active')
    expect(issued[0]?.replacesCertificateId).toBe(original.id)
  })
})

suite('Phase 4.5 — เลขที่ (D11) · mark-filed · Period Lock', () => {
  it('ออกใบพร้อมกัน 2 คำขอ ⇒ เลขที่ไม่ซ้ำและเรียงต่อเนื่อง (ล็อกในทรานแซกชันเดียวกับ insert)', async () => {
    await setPeriodStatus('collecting')
    const [first, second] = await Promise.all([
      seedBatch([{ payeeId: PAYEE_PERSON_ID, gross: 10_000_00, wht: 300_00 }]),
      seedBatch([{ payeeId: PAYEE_PERSON_ID, gross: 10_000_00, wht: 300_00 }]),
    ])
    await Promise.all([
      expenses.syncExpenseRecordsFromPayout(ctx, first.batchId),
      expenses.syncExpenseRecordsFromPayout(ctx, second.batchId),
    ])

    const numbers = (
      await db().whtCertificate.findMany({
        where: {
          expenseRecord: { payoutBatchItem: { payoutBatchId: { in: [first.batchId, second.batchId] } } },
        },
        select: { certificateNumber: true },
      })
    ).map((row) => row.certificateNumber)

    expect(numbers).toHaveLength(2)
    expect(new Set(numbers).size).toBe(2)

    // สองคำขอที่แข่งกันต้องได้เลข **ติดกัน** (ไม่ข้ามเลข ไม่ซ้ำ)
    const pair = numbers.map((number) => Number(number.replace('WHT-2569-', ''))).sort((a, b) => a - b)
    expect((pair[1] ?? 0) - (pair[0] ?? 0)).toBe(1)

    // เลขที่เป็น UNIQUE **ต่อองค์กร** (มติ PO U102 — ตัวนับเลขเอกสารแยกต่อองค์กร) ⇒ ตรวจไม่มีเลขซ้ำภายในองค์กร
    const all = await db().whtCertificate.findMany({
      where: { organizationId: ORG_ID, certificateNumber: { startsWith: 'WHT-2569-' } },
      select: { certificateNumber: true },
    })
    expect(new Set(all.map((row) => row.certificateNumber)).size).toBe(all.length)
  })

  it('mark-filed: pending → filed + audit มีเหตุผล · ทำซ้ำ ⇒ WHT_FILING_ALREADY_FILED', async () => {
    const periodId = await junePeriodId()
    const summary = await db().whtFilingSummary.findUniqueOrThrow({ where: { periodId } })

    // staging E-015 — ก่อนสิ้นเดือนของงวด (มิ.ย. 2569) Mark ไม่ได้ และไม่เปลี่ยนสถานะ · 00:00 วันที่ 1 ก.ค. (เวลาไทย) ได้
    const juneEnd = new Date('2026-06-30T16:59:59Z')
    await expectCode(
      () => wht.markWhtFilingFiled(ctx, summary.id, { reason: 'ยื่นก่อนสิ้นเดือน' }, juneEnd),
      'PERIOD_NOT_ENDED',
    )
    expect((await db().whtFilingSummary.findUniqueOrThrow({ where: { id: summary.id } })).status).toBe('pending')

    const filed = await wht.markWhtFilingFiled(ctx, summary.id, { reason: 'ยื่นผ่าน e-Filing เลขที่ 2569-0001' })
    expect(filed.status).toBe('filed')
    expect(filed.filedAt).not.toBeNull()
    expect(filed.filedByName).toBe('บัญชี 4.5')

    const audit = await db().auditLog.findFirst({
      where: { targetType: 'wht_filing_summaries', targetId: summary.id, action: 'status_change' },
      orderBy: { createdAt: 'desc' },
    })
    expect(audit?.reason).toContain('e-Filing')

    await expectCode(
      () => wht.markWhtFilingFiled(ctx, summary.id, { reason: 'ยื่นซ้ำ' }),
      'WHT_FILING_ALREADY_FILED',
    )
  })

  it('งวด locked ⇒ ยกเลิกใบไม่ได้ (PERIOD_LOCKED_DIRECT_EDIT) แต่ mark-filed ยังทำได้', async () => {
    await setPeriodStatus('collecting')
    const seeded = await seedBatch([{ payeeId: PAYEE_PERSON_ID, gross: 40_000_00, wht: 1_200_00 }])
    await expenses.syncExpenseRecordsFromPayout(ctx, seeded.batchId)
    const certificate = await db().whtCertificate.findFirstOrThrow({
      where: { expenseRecord: { payoutBatchItem: { payoutBatchId: seeded.batchId } } },
    })

    await setPeriodStatus('locked')
    await expectCode(
      () => wht.cancelWhtCertificate(ctx, certificate.id, { reason: 'ขอแก้หลังปิดงวด', reissue: false }),
      'PERIOD_LOCKED_DIRECT_EDIT',
    )

    // กำหนดยื่นคือวันที่ 15 ของเดือนถัดไป — งวดถูกล็อกไปแล้วก็ยังต้อง mark ได้
    const periodId = await junePeriodId()
    await db().whtFilingSummary.update({
      where: { periodId },
      data: { status: 'pending', filedAt: null, filedBy: null, supplementaryRequiredAt: null },
    })
    const summary = await db().whtFilingSummary.findUniqueOrThrow({ where: { periodId } })
    const filed = await wht.markWhtFilingFiled(ctx, summary.id, { reason: 'ยื่นแล้วหลังปิดงวด' })
    expect(filed.status).toBe('filed')

    await setPeriodStatus('collecting')
  })

  it('ทะเบียนใบ 50 ทวิ: กรองตามสถานะ/แบบได้ และยอดสรุปไม่รวมใบที่ยกเลิก', async () => {
    const all = await wht.listWhtCertificates(accountant, {})
    const cancelledOnly = await wht.listWhtCertificates(accountant, { status: 'cancelled' })
    const pnd53 = await wht.listWhtCertificates(accountant, { filingForm: 'PND53' })

    expect(all.items.length).toBeGreaterThan(cancelledOnly.items.length)
    expect(cancelledOnly.items.every((item) => item.status === 'cancelled')).toBe(true)
    expect(cancelledOnly.summary.pnd3Satang).toBe(0)
    expect(cancelledOnly.summary.pnd53Satang).toBe(0)
    expect(pnd53.items.every((item) => item.filingForm === 'PND53')).toBe(true)
    expect(all.summary.pnd3Satang + all.summary.pnd53Satang).toBeGreaterThan(0)

    // staging E-052 — กรองตามรอบจ่าย: ได้เฉพาะใบของรอบนั้น · รอบที่ไม่มีอยู่ = ว่าง
    const batchId = all.items[0]?.payoutBatchId
    expect(batchId).toBeDefined()
    const ofBatch = await wht.listWhtCertificates(accountant, { payoutBatchId: batchId })
    expect(ofBatch.items.length).toBeGreaterThan(0)
    expect(ofBatch.items.every((item) => item.payoutBatchId === batchId)).toBe(true)
    expect(
      (await wht.listWhtCertificates(accountant, { payoutBatchId: '00000000-0000-4000-8000-0000000e0529' })).items,
    ).toEqual([])
  })

  it('ข้อมูลใบสำหรับ PDF: ผู้จ่าย = องค์กร · ผู้ถูกหัก = payee (เลขผู้เสียภาษีจากโปรไฟล์)', async () => {
    const certificate = await db().whtCertificate.findFirstOrThrow({
      where: { organizationId: ORG_ID, status: 'active', payeeId: PAYEE_COMPANY_ID },
    })
    const source = await wht.getWhtCertificateDocSource(accountant, certificate.id)

    expect(source.payer.taxId).toBe('9999999994500')
    expect(source.payee.name).toBe('บริษัท เร็วดี จำกัด')
    expect(source.payee.taxId).toBe('0105560099999')
    expect(source.filingForm).toBe('PND53')
  })

  it('Final Test ด่าน 3 — sync พร้อมกันสองทาง ⇒ ใบ 50 ทวิ ยังใบเดียวต่อรายการ (ยอด ภ.ง.ด. ไม่เกินจริง)', async () => {
    await setPeriodStatus('collecting')
    const seeded = await seedBatch([{ payeeId: PAYEE_PERSON_ID, gross: 25_000_00, wht: 750_00 }])

    // รอบจ่ายเป็น `completed` ได้ 2 ทาง (ยืนยันด้วยมือ `17` §9 กับการจับคู่กระทบยอดธนาคารไฟล์ 35)
    // ⇒ ทั้งสองทางเรียก sync ได้พร้อมกันสำหรับรอบเดียวกัน
    const results = await Promise.allSettled([
      expenses.syncExpenseRecordsFromPayout(ctx, seeded.batchId),
      expenses.syncExpenseRecordsFromPayout(ctx, seeded.batchId),
    ])
    expect(results.filter((result) => result.status === 'rejected')).toEqual([])

    const certificates = await db().whtCertificate.findMany({
      where: {
        organizationId: ORG_ID,
        expenseRecord: { payoutBatchItem: { payoutBatchId: seeded.batchId } },
      },
      select: { status: true },
    })
    expect(certificates.filter((row) => row.status === 'active')).toHaveLength(1)
    expect(certificates).toHaveLength(1)
  })

  it('Final Test ด่าน 6 — งานเบื้องหลังสรุปรอบนำส่งต้องไม่เขียนทับงวดที่ปิดไปแล้ว', async () => {
    await setPeriodStatus('collecting')
    const periodId = await junePeriodId()
    // รอบนี้ถูก mark filed ในเทสต์ก่อนหน้า — รอบ filed ไม่ถูกคิดใหม่อีกแล้ว (`33` §7.2) ⇒ ทดสอบกับรอบ pending
    const filedBefore = await db().whtFilingSummary.findUniqueOrThrow({ where: { periodId } })
    await db().whtFilingSummary.update({
      where: { periodId },
      data: { status: 'pending', filedAt: null, supplementaryRequiredAt: null },
    })
    const seeded = await seedBatch([{ payeeId: PAYEE_PERSON_ID, gross: 30_000_00, wht: 900_00 }])
    await expenses.syncExpenseRecordsFromPayout(ctx, seeded.batchId)
    const real = (await db().whtFilingSummary.findUniqueOrThrow({ where: { periodId } })).pnd3Satang

    // ปักยอดปลอมไว้ — ถ้า job ยังทำงานกับงวดที่ปิดแล้ว ยอดนี้จะถูกคำนวณทับกลับเป็นของจริง
    // (เท่ากับแก้ข้อมูลงวดที่ล็อกโดยไม่ผ่าน Adjustment — `30`/`20`)
    for (const closed of ['locked', 'sent_to_accountant'] as const) {
      await db().whtFilingSummary.update({ where: { periodId }, data: { pnd3Satang: 1 } })
      await setPeriodStatus(closed)

      const skipped = await summaryJob.runWhtSummaryJob({ organizationId: ORG_ID, periodId })
      expect(skipped.refreshed).toBe(0)
      expect(skipped.periodIds).toEqual([])
      expect((await db().whtFilingSummary.findUniqueOrThrow({ where: { periodId } })).pnd3Satang).toBe(1)
    }

    // งวดที่ยังเปิดอยู่ต้องยังคำนวณให้ตามปกติ (ยามนี้ไม่ได้ปิดงานทิ้งทั้งตัว)
    await setPeriodStatus('collecting')
    const refreshed = await summaryJob.runWhtSummaryJob({ organizationId: ORG_ID, periodId })
    expect(refreshed.refreshed).toBe(1)
    expect((await db().whtFilingSummary.findUniqueOrThrow({ where: { periodId } })).pnd3Satang).toBe(real)
    await db().whtFilingSummary.update({
      where: { periodId },
      data: { status: filedBefore.status, filedAt: filedBefore.filedAt },
    })
  })

  it('อ้าง id ที่ไม่มีในองค์กร ⇒ 404 ไม่ leak (WHT_CERTIFICATE_NOT_FOUND / WHT_FILING_SUMMARY_NOT_FOUND)', async () => {
    const missing = '00000000-0000-4000-8000-0000000045ff'
    await expectCode(() => wht.getWhtCertificateDocSource(accountant, missing), 'WHT_CERTIFICATE_NOT_FOUND')
    await expectCode(
      () => wht.markWhtFilingFiled(ctx, missing, { reason: 'ทดสอบ' }),
      'WHT_FILING_SUMMARY_NOT_FOUND',
    )
  })
})

suite('มติ PO 06/10/2569 (U94 ข้อ 1 · U96 #2/#4/#13) — snapshot คู่สัญญาบนใบ 50 ทวิ', () => {
  it('ออกใบแล้ว snapshot ชื่อ/คำนำหน้า/ที่อยู่/เงื่อนไข · แก้โปรไฟล์ทีหลังใบเดิมไม่เปลี่ยน · DB ห้ามแก้ snapshot', async () => {
    await setPeriodStatus('collecting')
    await db().$executeRawUnsafe(`
      UPDATE payee_profiles
      SET name_title = 'นาย', address_detail = '12 ม.3', address_subdistrict = 'ป่าแดด',
          address_district = 'เมืองเชียงใหม่', address_province = 'เชียงใหม่', address_postal_code = '50100',
          wht_condition = 'pay_once'
      WHERE id = '${PAYEE_PERSON_ID}'
    `)
    // มติ PO U151 — ผู้มีอำนาจลงนามขององค์กร ณ วันออกใบ
    await db().$executeRawUnsafe(
      `UPDATE organizations SET authorized_signer_name = 'นายผู้ลงนาม 50ทวิ', authorized_signer_title = 'กรรมการ' WHERE id = '${ORG_ID}'`,
    )
    try {
      const seeded = await seedBatch([{ payeeId: PAYEE_PERSON_ID, gross: 20_000_00, wht: 600_00 }])
      // มติ PO U105 — ช่อง "ผู้จ่ายเงิน" มาจาก snapshot ของรายการรอบจ่าย (ตัวที่ใช้คิดยอดจริง) ไม่ใช่โปรไฟล์ปัจจุบัน
      await db().$executeRawUnsafe(
        `UPDATE payout_batch_items SET wht_condition = 'pay_once' WHERE payout_batch_id = '${seeded.batchId}'`,
      )
      await expenses.syncExpenseRecordsFromPayout(ctx, seeded.batchId)
      const certificate = await db().whtCertificate.findFirstOrThrow({
        where: { organizationId: ORG_ID, expenseRecord: { payoutBatchItem: { payoutBatchId: seeded.batchId } } },
      })
      expect(certificate.payeeName).toBe('ประยุทธ์ บุญมี')
      expect(certificate.payeeNameTitle).toBe('นาย')
      expect(certificate.payeeAddress).toBe('12 ม.3 ต.ป่าแดด อ.เมืองเชียงใหม่ จ.เชียงใหม่ 50100')
      expect(certificate.payeeBranchCode).toBeNull()
      expect(certificate.whtCondition).toBe('pay_once')
      expect(certificate.payerName).toBe('Phase45Test')
      expect(certificate.payerTaxId).toBe('9999999994500')
      expect(certificate.payerBranchCode).toBe('00000')
      expect(certificate.payerSignerName).toBe('นายผู้ลงนาม 50ทวิ')
      expect(certificate.payerSignerTitle).toBe('กรรมการ')

      // แก้โปรไฟล์ + ข้อมูลองค์กรหลังออกใบ ⇒ ใบเดิม (PDF) ยังเป็นค่าตอนออก
      await db().$executeRawUnsafe(`
        UPDATE payee_profiles SET name_title = 'นาง', address_detail = '99 ถ.ใหม่', wht_condition = 'withhold'
        WHERE id = '${PAYEE_PERSON_ID}'
      `)
      await db().$executeRawUnsafe(
        `UPDATE organizations SET address = 'ย้ายที่อยู่ใหม่', authorized_signer_name = 'คนใหม่' WHERE id = '${ORG_ID}'`,
      )
      const source = await wht.getWhtCertificateDocSource(accountant, certificate.id)
      expect(source.payerSigner).toEqual({ name: 'นายผู้ลงนาม 50ทวิ', title: 'กรรมการ' })
      expect(source.payee.name).toBe('นายประยุทธ์ บุญมี')
      expect(source.payee.address).toBe('12 ม.3 ต.ป่าแดด อ.เมืองเชียงใหม่ จ.เชียงใหม่ 50100')
      expect(source.payee.branchLabel).toBeNull()
      expect(source.payer.address).toBe('ที่อยู่ทดสอบ 4.5 กรุงเทพฯ')
      expect(source.payer.branchLabel).toBe('สำนักงานใหญ่')
      expect(source.whtCondition).toBe('pay_once')
      expect(source.filingSequence).toBeGreaterThanOrEqual(1)

      // ยาม immutable ระดับ DB — snapshot แก้ตรงไม่ได้ (ใบ active แก้ได้ทางเดียวคือยกเลิก)
      await expect(
        db().$executeRawUnsafe(`UPDATE wht_certificates SET payee_address = 'แก้เอง' WHERE id = '${certificate.id}'`),
      ).rejects.toThrow(/WHT_CERTIFICATE_IMMUTABLE/)
      await expect(
        db().$executeRawUnsafe(`UPDATE wht_certificates SET payer_signer_name = 'แก้เอง' WHERE id = '${certificate.id}'`),
      ).rejects.toThrow(/WHT_CERTIFICATE_IMMUTABLE/)
    } finally {
      await db().$executeRawUnsafe(`
        UPDATE payee_profiles
        SET name_title = NULL, address_detail = NULL, address_subdistrict = NULL, address_district = NULL,
            address_province = NULL, address_postal_code = NULL, wht_condition = 'withhold'
        WHERE id = '${PAYEE_PERSON_ID}'
      `)
      await db().$executeRawUnsafe(
        `UPDATE organizations SET address = 'ที่อยู่ทดสอบ 4.5 กรุงเทพฯ', authorized_signer_name = NULL, authorized_signer_title = NULL WHERE id = '${ORG_ID}'`,
      )
    }
  })

  it('นิติบุคคล: ภ.ง.ด.53 + snapshot สาขา + PDF ข้อมูลสาขา/แถวเงินได้ 5 + ลำดับที่ในแบบ', async () => {
    await setPeriodStatus('collecting')
    await db().$executeRawUnsafe(`UPDATE payee_profiles SET branch_code = '00002' WHERE id = '${PAYEE_COMPANY_ID}'`)
    try {
      // Tax Profile ไม่ระบุ (fallback) — นิติบุคคลยังต้องเป็น ภ.ง.ด.53
      const seeded = await seedBatch([{ payeeId: PAYEE_COMPANY_ID, gross: 15_000_00, wht: 450_00 }])
      await expenses.syncExpenseRecordsFromPayout(ctx, seeded.batchId)
      const certificate = await db().whtCertificate.findFirstOrThrow({
        where: { organizationId: ORG_ID, expenseRecord: { payoutBatchItem: { payoutBatchId: seeded.batchId } } },
      })
      expect(certificate.filingForm).toBe('PND53')
      expect(certificate.payeeType).toBe('corporate')
      expect(certificate.payeeBranchCode).toBe('00002')
      expect(certificate.payeeNameTitle).toBeNull()

      const { buildWhtCertificateDoc } = await import('@/lib/wht/wht')
      const doc = buildWhtCertificateDoc(await wht.getWhtCertificateDocSource(accountant, certificate.id))
      expect(doc.payee.branchLabel).toBe('สาขาที่ 00002')
      expect(doc.filingBoxes.find((box) => box.checked)?.label).toBe('(7) ภ.ง.ด.53')
      expect(doc.incomeLines.find((line) => line.grossText !== '')?.no).toBe('5')
      expect(doc.filingSequenceText).not.toBe('—')

      const { renderWhtCertificate } = await import('@/components/pdf/wht-certificate')
      const { extractPdfText } = await import('@/components/pdf/extract-text')
      const text = extractPdfText(new Uint8Array(await renderWhtCertificate(doc))).replace(/\n/g, '')
      expect(text).toContain('ฉบับที่ 1')
      expect(text).toContain('ฉบับที่ 2')
      expect(text).toContain('สาขาที่ 00002')
      expect(text).toContain('สี่ร้อยห้าสิบบาทถ้วน')
    } finally {
      await db().$executeRawUnsafe(`UPDATE payee_profiles SET branch_code = '00000' WHERE id = '${PAYEE_COMPANY_ID}'`)
    }
  })

  it('Final Test ด่าน 3 — รอบที่ mark filed แล้ว ⇒ คิดสรุปใหม่ (ออก/ยกเลิกใบ · job) ไม่แตะยอด/วันกำหนด/วิธียื่น', async () => {
    await setPeriodStatus('collecting')
    const periodId = await junePeriodId()
    const before = await db().whtFilingSummary.findUniqueOrThrow({ where: { periodId } })
    const fakeDue = new Date('2026-07-20T00:00:00Z')
    // จำลองรอบที่บัญชียื่นไปแล้วนอกระบบ — ยอด/วันที่ปักไว้ต้องคงอยู่ (`33` §7.2 "รอบที่ filed แล้วไม่แตะ")
    await db().whtFilingSummary.update({
      where: { periodId },
      data: { status: 'filed', filedAt: new Date(), pnd3Satang: 1, filingDueDate: fakeDue },
    })
    try {
      const { prisma } = await import('@/lib/prisma')
      const period = await db().accountingPeriod.findUniqueOrThrow({ where: { id: periodId }, select: { periodLabel: true } })
      const row = await wht.refreshFilingSummary(prisma, {
        organizationId: ORG_ID,
        periodId,
        periodLabel: period.periodLabel,
        yearBe: 2569,
        month: 6,
      })
      expect(row.pnd3Satang).toBe(1)
      await summaryJob.runWhtSummaryJob({ organizationId: ORG_ID, periodId })

      const after = await db().whtFilingSummary.findUniqueOrThrow({ where: { periodId } })
      expect(after.status).toBe('filed')
      expect(after.pnd3Satang).toBe(1)
      expect(after.filingDueDate.toISOString()).toBe(fakeDue.toISOString())
    } finally {
      await db().whtFilingSummary.update({
        where: { periodId },
        data: {
          status: before.status,
          filedAt: before.filedAt,
          pnd3Satang: before.pnd3Satang,
          filingDueDate: before.filingDueDate,
        },
      })
    }
  })

  it('U127 — ยกเลิก/ออกใบในเดือนที่ยื่นแล้ว ⇒ ธงต้องยื่นเพิ่มเติม + ยอดต่าง + คิวแจ้งบัญชี · ยื่นเพิ่มเติมแล้วล้างธง', async () => {
    await setPeriodStatus('collecting')
    const periodId = await junePeriodId()
    // ผู้รับแจ้งเตือน = ผู้ถือ `manage_wht` (บทบาทบัญชีของเทสต์)
    await db().$executeRawUnsafe(`
      INSERT INTO capabilities (code, label, module) VALUES ('manage_wht', 'ออกหนังสือรับรอง WHT', 'wht')
      ON CONFLICT (code) DO NOTHING
    `)
    await db().$executeRawUnsafe(`
      INSERT INTO role_capabilities (role_id, capability_id, access_level)
      SELECT '${ROLE_ID}', id, 'manage' FROM capabilities WHERE code = 'manage_wht'
      ON CONFLICT DO NOTHING
    `)
    // เริ่มจากรอบที่ยังไม่ยื่น แล้วออกใบ + mark filed ตามจริง
    await db().whtFilingSummary.update({
      where: { periodId },
      data: { status: 'pending', filedAt: null, filedBy: null, supplementaryRequiredAt: null },
    })
    const seeded = await seedBatch([{ payeeId: PAYEE_PERSON_ID, gross: 20_000_00, wht: 600_00 }])
    await expenses.syncExpenseRecordsFromPayout(ctx, seeded.batchId)
    const certificate = await db().whtCertificate.findFirstOrThrow({
      where: { expenseRecord: { payoutBatchItem: { payoutBatchId: seeded.batchId } } },
    })
    const summary = await db().whtFilingSummary.findUniqueOrThrow({ where: { periodId } })
    await wht.markWhtFilingFiled(ctx, summary.id, { reason: 'ยื่น e-Filing 2569-0601' })
    // ยังไม่มีเหตุการณ์หลังยื่น ⇒ ล้างธงไม่ได้
    await expectCode(
      () => wht.markWhtSupplementaryFiled(ctx, summary.id, { reason: 'ยังไม่ต้องยื่น' }),
      'WHT_SUPPLEMENTARY_FILING_NOT_REQUIRED',
    )

    await wht.cancelWhtCertificate(ctx, certificate.id, { reason: 'จ่ายผิดคน', reissue: false })

    const flagged = await db().whtFilingSummary.findUniqueOrThrow({ where: { periodId } })
    expect(flagged.status).toBe('filed')
    expect(flagged.supplementaryRequiredAt).not.toBeNull()
    // ยอดที่ยื่นแล้วไม่ถูกเขียนทับ
    expect(flagged.pnd3Satang).toBe(summary.pnd3Satang)

    const list = await wht.listWhtFilingSummaries(accountant, { periodId })
    const dto = list.items[0]!
    expect(dto.supplementaryRequired).toBe(true)
    expect(dto.supplementaryDiff).toEqual({ pnd1Satang: 0, pnd3Satang: -600_00, pnd53Satang: 0, totalSatang: -600_00 })

    // แจ้งบัญชีผ่านคิว outbox ในทรานแซกชันเดียวกับการยกเลิก
    const queued = await db().notificationOutbox.findMany({
      where: { organizationId: ORG_ID, sourceJobType: 'wht_supplementary_filing' },
    })
    expect(queued.some((row) => JSON.stringify(row.payload).includes(certificate.certificateNumber))).toBe(true)

    // job รายวันไม่ล้าง/ไม่ติดธงเพิ่ม
    await summaryJob.runWhtSummaryJob({ organizationId: ORG_ID, periodId })
    expect((await db().whtFilingSummary.findUniqueOrThrow({ where: { periodId } })).supplementaryRequiredAt).not.toBeNull()

    // ไม่กรอกเหตุผล ⇒ schema ปฏิเสธที่ route (ทดสอบ service ด้วยเหตุผลที่กรอก)
    const cleared = await wht.markWhtSupplementaryFiled(ctx, summary.id, { reason: 'ยื่นเพิ่มเติม 2569-0602' })
    expect(cleared.supplementaryRequired).toBe(false)
    expect(cleared.supplementaryFiledAt).not.toBeNull()
    expect(cleared.pnd3Satang).toBe(summary.pnd3Satang - 600_00)
    const audit = await db().auditLog.findFirst({
      where: { targetType: 'wht_filing_summaries', targetId: summary.id, action: 'update' },
      orderBy: { createdAt: 'desc' },
    })
    expect(audit?.reason).toContain('2569-0602')
    await expectCode(
      () => wht.markWhtSupplementaryFiled(ctx, summary.id, { reason: 'ซ้ำ' }),
      'WHT_SUPPLEMENTARY_FILING_NOT_REQUIRED',
    )

    // ออกใบใหม่ของเดือนที่ยื่นแล้ว (ออกใบแทนผ่าน sync) ⇒ ติดธงอีกครั้ง
    await expenses.syncExpenseRecordsFromPayout(ctx, seeded.batchId)
    const again = await db().whtFilingSummary.findUniqueOrThrow({ where: { periodId } })
    expect(again.supplementaryRequiredAt).not.toBeNull()
    expect(again.pnd3Satang).toBe(summary.pnd3Satang - 600_00)
  })
})
