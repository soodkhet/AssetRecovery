import { PrismaPg } from '@prisma/adapter-pg'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import type { SessionUser } from '@/lib/auth/types'
import { PrismaClient } from '@/lib/generated/prisma/client'

/**
 * เทสต์ระดับ DB — ค่าตั้งภาษีหัก ณ ที่จ่าย (มติ PO 05/10/2569 UAT U3/U4/U5/U7/U8)
 *
 *  - ค่าเริ่มต้น: ฐาน WHT ไม่รวมค่าที่พัก/เบิกตามใบเสร็จ (A1 — in1 ฐาน ฿1,950 → ฐาน WHT ฿1,350 → หัก 4,050 สตางค์)
 *    + snapshot ค่าตั้งลงรอบจ่าย
 *  - snapshot: เปลี่ยนค่าตั้งหลังสร้างรอบแล้ว รอบเดิมไม่เปลี่ยน · รอบใหม่ใช้ค่าใหม่
 *  - effective date: ค่าตั้งที่วันที่มีผลยังไม่ถึงไม่กระทบรอบที่สร้างวันนี้ · ย้อนหลังไม่ได้
 *  - 40(2) แยกตามประเภททีม: ผู้รับ inhouse ไม่มีอัตรา ⇒ `WHT_40_2_RATE_MISSING` (ฝั่ง outsource ไม่โดน)
 *    · มีอัตรา 2.50% ⇒ หักไม่มีเกณฑ์ · ใบ 50 ทวิ = ภ.ง.ด.1 + สรุปรอบนำส่ง pnd1
 *  - ใบ 50 ทวิ ต่อผู้รับต่อรอบ (ค่าเริ่มต้น) vs ต่อรายการ — ยอดภาษีรวมเท่ากัน · ยกเลิก/ออกแทนได้ทั้งสองแบบ
 *  - U33: การจับคู่ประเภทเงินได้ต่อประเภททีมเป็นค่าตั้ง (40(1)/40(2)/40(8)) · 40(1) = อัตราต่อคน + ภ.ง.ด.1
 *    + 50 ทวิ ระบุ 40(1) · snapshot ลงรอบ · audit มีการจับคู่
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
  console.warn('[wht-policy.db.test] ข้ามเทสต์ระดับ DB — ไม่มี TEST_DATABASE_URL (ดู .env.example)')
}

const ORG_ID = '00000000-0000-4000-8000-0000000057a0'
const ROLE_ID = '00000000-0000-4000-8000-0000000057a1'
const FINANCE_ID = '00000000-0000-4000-8000-0000000057a2'
const AGENT_IN_ID = '00000000-0000-4000-8000-0000000057a3'
const AGENT_OUT_ID = '00000000-0000-4000-8000-0000000057a4'
const TEAM_IN_ID = '00000000-0000-4000-8000-0000000057a5'
const TEAM_OUT_ID = '00000000-0000-4000-8000-0000000057a6'
const TAX_PROFILE_ID = '00000000-0000-4000-8000-0000000057a7'
const PLAN_ID = '00000000-0000-4000-8000-0000000057a8'
const PAYEE_IN_ID = '00000000-0000-4000-8000-0000000057a9'
const PAYEE_OUT_ID = '00000000-0000-4000-8000-0000000057b0'

/** วันสร้างรอบ (ตรึงเวลา) = 05/10/2569 10:00 เวลาไทย · วันตัดรอบ 04/10/2569 */
const NOW = new Date('2026-10-05T03:00:00Z')
const CUTOFF = new Date(Date.UTC(2026, 9, 4))
const PAYMENT_AT = '2026-10-05T04:00:00Z'

let client: PrismaClient | null = null
type PayoutQueries = typeof import('@/lib/payout/queries')
type PolicyQueries = typeof import('@/lib/settings/queries/wht-policy')
type ExpenseQueries = typeof import('@/lib/expenses/queries')
type WhtQueries = typeof import('@/lib/wht/queries')
let payout: PayoutQueries
let policy: PolicyQueries
let expenses: ExpenseQueries
let wht: WhtQueries

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
  supabaseUid: 'uid-finance-57',
  email: 'finance57@test.local',
  fullName: 'การเงิน ค่าตั้งภาษี',
  status: 'active',
  roleId: ROLE_ID,
  roleName: 'การเงิน',
  roleGroup: 'system',
  isSuperadmin: false,
  teamId: null,
  companyId: null,
  capabilities: {
    manage_payout_batch: 'manage',
    manage_wht: 'manage',
    manage_sales_expenses: 'manage',
    manage_wht_policy: 'manage',
  },
  scope: { kind: 'global', teamIds: [], companyId: null, userId: FINANCE_ID },
  loginAt: new Date().toISOString(),
}

const ctx = { actor: finance, meta, now: NOW }
const policyCtx = (reason: string) => ({ actor: finance, meta, reason })

function codeOf(error: unknown): string {
  return (error as { code?: string }).code ?? String(error)
}

async function seedExpense(payeeId: string, type: string, grossSatang: number): Promise<void> {
  await db().$executeRawUnsafe(`
    INSERT INTO expenses (organization_id, payee_id, expense_type, gross_satang, expense_date, status,
                          comp_plan_id, comp_plan_version, receipt_file_url, receipt_file_hash, created_by)
    VALUES ('${ORG_ID}', '${payeeId}', '${type}', ${grossSatang}, '2026-10-03', 'approved',
            '${PLAN_ID}', 1, 'field/receipts/ok.jpg', 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', '${FINANCE_ID}')
  `)
}

/** in1 ตาม A1: คอมมิชชัน 1,000 + น้ำมัน 200 + เบี้ยเลี้ยง 150 + ค่าที่พัก 600 = ฿1,950 */
async function seedIn1(): Promise<void> {
  await seedExpense(PAYEE_IN_ID, 'commission', 100_000)
  await seedExpense(PAYEE_IN_ID, 'fuel', 20_000)
  await seedExpense(PAYEE_IN_ID, 'allowance', 15_000)
  await seedExpense(PAYEE_IN_ID, 'hotel', 60_000)
}

/** จำลองว่าโอนเงินจริงแล้ว (สถานะ completed + วันจ่าย) แล้วให้ไฟล์ 32 sync บัญชี + ใบ 50 ทวิ */
async function completeAndSync(batchId: string): Promise<void> {
  await db().$executeRawUnsafe(`
    UPDATE payout_batches SET status = 'completed', payment_file_generated_at = '${PAYMENT_AT}' WHERE id = '${batchId}'
  `)
  await expenses.syncExpenseRecordsFromPayout(ctx, batchId)
}

async function reset(): Promise<void> {
  const tx = db()
  await tx.$executeRawUnsafe(`ALTER TABLE wht_certificates DISABLE TRIGGER trg_wht_certificates_no_delete`)
  try {
    await tx.$executeRawUnsafe(`DELETE FROM wht_certificates WHERE organization_id = '${ORG_ID}'`)
  } finally {
    await tx.$executeRawUnsafe(`ALTER TABLE wht_certificates ENABLE TRIGGER trg_wht_certificates_no_delete`)
  }
  // staging E-014 — สมุดย่อยยอดเรียกคืนห้ามลบ (trigger) ⇒ ปิดชั่วคราวเฉพาะตอนล้างข้อมูลทดสอบ
  await tx.$executeRawUnsafe(`ALTER TABLE payee_recovery_collections DISABLE TRIGGER trg_payee_recovery_collections_no_delete`)
  try {
    await tx.$executeRawUnsafe(`DELETE FROM payee_recovery_collections WHERE organization_id = '${ORG_ID}'`)
  } finally {
    await tx.$executeRawUnsafe(`ALTER TABLE payee_recovery_collections ENABLE TRIGGER trg_payee_recovery_collections_no_delete`)
  }
  for (const statement of [
    `DELETE FROM payee_recoveries WHERE organization_id = '${ORG_ID}'`,
    `DELETE FROM adjustments WHERE organization_id = '${ORG_ID}'`,
    `DELETE FROM wht_filing_summaries WHERE organization_id = '${ORG_ID}'`,
    `DELETE FROM expense_records WHERE organization_id = '${ORG_ID}'`,
    `DELETE FROM exceptions WHERE organization_id = '${ORG_ID}'`,
    `DELETE FROM payout_batch_items WHERE organization_id = '${ORG_ID}'`,
    `DELETE FROM payout_batches WHERE organization_id = '${ORG_ID}'`,
    `DELETE FROM expenses WHERE organization_id = '${ORG_ID}'`,
    `DELETE FROM wht_policy_history WHERE organization_id = '${ORG_ID}'`,
    `UPDATE payee_profiles SET wht_40_2_pct = NULL, wht_condition = 'withhold', is_verified = true WHERE organization_id = '${ORG_ID}'`,
  ]) {
    await tx.$executeRawUnsafe(statement)
  }
}

beforeAll(async () => {
  if (!url) return
  process.env.DATABASE_URL = url
  payout = await import('@/lib/payout/queries')
  policy = await import('@/lib/settings/queries/wht-policy')
  expenses = await import('@/lib/expenses/queries')
  wht = await import('@/lib/wht/queries')

  const tx = db()
  await tx.$executeRawUnsafe(`
    INSERT INTO organizations (id, name, tax_id, address)
    VALUES ('${ORG_ID}', 'WhtPolicyTest', '9999999995700', 'ที่อยู่ทดสอบค่าตั้งภาษี') ON CONFLICT (id) DO NOTHING
  `)
  await tx.$executeRawUnsafe(`
    INSERT INTO roles (id, organization_id, name, role_group, is_seed)
    VALUES ('${ROLE_ID}', '${ORG_ID}', 'การเงิน 57', 'system', false) ON CONFLICT (id) DO NOTHING
  `)
  await tx.$executeRawUnsafe(`
    INSERT INTO users (id, organization_id, role_id, email, full_name, status) VALUES
      ('${FINANCE_ID}', '${ORG_ID}', '${ROLE_ID}', 'finance57@test.local', 'การเงิน ค่าตั้งภาษี', 'active'),
      ('${AGENT_IN_ID}', '${ORG_ID}', '${ROLE_ID}', 'in57@test.local', 'อินหนึ่ง ในบ้าน', 'active'),
      ('${AGENT_OUT_ID}', '${ORG_ID}', '${ROLE_ID}', 'out57@test.local', 'เอาท์หนึ่ง นอกบ้าน', 'active')
    ON CONFLICT (id) DO NOTHING
  `)
  await tx.$executeRawUnsafe(`
    INSERT INTO teams (id, organization_id, name, side, provinces, status, created_by) VALUES
      ('${TEAM_IN_ID}', '${ORG_ID}', 'ทีมใน 57', 'inhouse', ARRAY['เชียงใหม่'], 'active', '${FINANCE_ID}'),
      ('${TEAM_OUT_ID}', '${ORG_ID}', 'ทีมนอก 57', 'outsource', ARRAY['ลำพูน'], 'active', '${FINANCE_ID}')
    ON CONFLICT (id) DO NOTHING
  `)
  await tx.$executeRawUnsafe(`UPDATE users SET team_id = '${TEAM_IN_ID}' WHERE id = '${AGENT_IN_ID}'`)
  await tx.$executeRawUnsafe(`UPDATE users SET team_id = '${TEAM_OUT_ID}' WHERE id = '${AGENT_OUT_ID}'`)
  await tx.$executeRawUnsafe(`
    INSERT INTO tax_profiles (id, organization_id, name, wht_pct, wht_basis, wht_min_threshold_satang, created_by)
    VALUES ('${TAX_PROFILE_ID}', '${ORG_ID}', 'ค่าจ้างทำของ 3% (57)', 3.00, 'before_vat', 100000, '${FINANCE_ID}')
    ON CONFLICT (id) DO NOTHING
  `)
  await tx.$executeRawUnsafe(`
    INSERT INTO compensation_plans (id, organization_id, name, side, fuel_mode, fuel_rate_per_km_satang,
                                    allowance_satang, commission_satang, wht_pct, version, effective_from, created_by)
    VALUES ('${PLAN_ID}', '${ORG_ID}', 'แผน 57', 'inhouse', 'PER_KM', 500, 30000, 150000, 3.00, 1, '2026-01-01', '${FINANCE_ID}')
    ON CONFLICT (id) DO NOTHING
  `)
  await tx.$executeRawUnsafe(`
    INSERT INTO payee_profiles (id, organization_id, user_id, payee_type, tax_profile_id, bank_name,
                                account_name, account_number, national_id, is_verified, created_by) VALUES
      ('${PAYEE_IN_ID}', '${ORG_ID}', '${AGENT_IN_ID}', 'individual', '${TAX_PROFILE_ID}', 'ธนาคารกสิกรไทย',
       'อินหนึ่ง ในบ้าน', '1234567890', '1100000005701', true, '${FINANCE_ID}'),
      ('${PAYEE_OUT_ID}', '${ORG_ID}', '${AGENT_OUT_ID}', 'individual', '${TAX_PROFILE_ID}', 'ธนาคารไทยพาณิชย์',
       'เอาท์หนึ่ง นอกบ้าน', '9876543210', '1100000005702', true, '${FINANCE_ID}')
    ON CONFLICT (id) DO NOTHING
  `)
})

afterAll(async () => {
  if (url) await reset()
  await client?.$disconnect()
})

beforeEach(async () => {
  if (url) await reset()
})

suite('ฐาน WHT + snapshot (U3/U8)', () => {
  it('(ก) ค่าเริ่มต้น — A1: in1 ฐาน ฿1,950 → ฐาน WHT ฿1,350 → หัก 4,050 สตางค์ · ค่าที่พักจ่ายเต็ม · snapshot ค่าตั้ง', async () => {
    await seedIn1()
    const { batch } = await payout.createPayoutBatch(ctx, { side: 'inhouse', cutoffDate: CUTOFF, name: null })

    expect(batch.grossSatang).toBe(195_000)
    expect(batch.whtSatang).toBe(4050)
    expect(batch.netSatang).toBe(190_950)
    expect(batch.whtPolicy).toEqual({
      baseExpenseTypes: ['commission', 'no_success_fee', 'fuel', 'allowance'],
      certificateMode: 'per_payee_batch',
      incomeTypeMode: 'all_40_8',
      issueZeroRate402Certificate: true,
      inhouseIncomeCategory: 'sec_40_2',
      outsourceIncomeCategory: 'sec_40_8',
      thresholdScope: 'monthly_cumulative',
      allowGrossUpConditions: false,
    })
    const hotel = batch.items.find((item) => item.grossSatang === 60_000)!
    expect(hotel.whtBaseIncluded).toBe(false)
    expect(hotel.whtSatang).toBe(0)
    expect(hotel.netSatang).toBe(60_000)
    expect(batch.items.filter((item) => item.whtBaseIncluded)).toHaveLength(3)
    expect(batch.items.every((item) => item.whtIncomeCategory === 'sec_40_8')).toBe(true)

    const row = await db().payoutBatch.findUniqueOrThrow({ where: { id: batch.id } })
    expect(row.whtPolicyId).toBeNull() // ยังไม่เคยตั้ง = ค่าเริ่มต้นตามมติ
    expect(row.whtCertificateMode).toBe('per_payee_batch')
  })

  it('(ฉ) เปลี่ยนค่าตั้งหลังสร้างรอบแล้ว — รอบเดิมไม่เปลี่ยน · รอบใหม่ใช้ค่าใหม่ (ชี้แถวค่าตั้ง)', async () => {
    await seedIn1()
    const first = await payout.createPayoutBatch(ctx, { side: 'inhouse', cutoffDate: CUTOFF, name: null })

    const created = await policy.createWhtPolicy(
      policyCtx('ทดลองให้ค่าที่พักอยู่ในฐาน และออกใบต่อรายการ'),
      {
        effectiveFrom: new Date(Date.UTC(2026, 9, 5)),
        baseExpenseTypes: ['commission', 'no_success_fee', 'fuel', 'allowance', 'hotel'],
        certificateMode: 'per_item',
        incomeTypeMode: 'all_40_8',
        issueZeroRate402Certificate: true,
        inhouseIncomeCategory: 'sec_40_2',
        outsourceIncomeCategory: 'sec_40_8',
        allowGrossUpConditions: false,
        filingMethod: 'online',
      },
      NOW,
    )

    const before = await payout.getPayoutBatch(finance, first.batch.id)
    expect(before.whtSatang).toBe(4050)
    expect(before.whtPolicy?.certificateMode).toBe('per_payee_batch')
    expect(before.items.find((item) => item.grossSatang === 60_000)?.whtBaseIncluded).toBe(false)

    await seedIn1()
    const second = await payout.createPayoutBatch(ctx, { side: 'inhouse', cutoffDate: CUTOFF, name: 'รอบที่สอง' })
    expect(second.batch.whtSatang).toBe(5850) // 1,950 × 3%
    expect(second.batch.whtPolicy?.certificateMode).toBe('per_item')
    const row = await db().payoutBatch.findUniqueOrThrow({ where: { id: second.batch.id } })
    expect(row.whtPolicyId).toBe(created.id)

    // audit มี before/after + reason
    const audit = await db().auditLog.findFirstOrThrow({
      where: { organizationId: ORG_ID, targetType: 'wht_policy_history', targetId: created.id },
    })
    expect(audit.reason).toBe('ทดลองให้ค่าที่พักอยู่ในฐาน และออกใบต่อรายการ')
    expect(audit.beforeData).toMatchObject({ certificate_mode: 'per_payee_batch' })
    expect(audit.afterData).toMatchObject({ certificate_mode: 'per_item', effective_from: '2026-10-05' })
  })

  it('(ช) วันที่มีผลยังไม่ถึง ⇒ รอบที่สร้างวันนี้ใช้ค่าเดิม · ย้อนหลัง ⇒ WHT_POLICY_EFFECTIVE_DATE_PAST', async () => {
    await policy.createWhtPolicy(
      policyCtx('เตรียมค่าตั้งเดือนหน้า'),
      {
        effectiveFrom: new Date(Date.UTC(2026, 10, 1)),
        baseExpenseTypes: ['commission', 'no_success_fee', 'fuel', 'allowance', 'hotel'],
        certificateMode: 'per_item',
        incomeTypeMode: 'all_40_8',
        issueZeroRate402Certificate: true,
        inhouseIncomeCategory: 'sec_40_2',
        outsourceIncomeCategory: 'sec_40_8',
        allowGrossUpConditions: false,
        filingMethod: 'online',
      },
      NOW,
    )
    await seedIn1()
    const { batch } = await payout.createPayoutBatch(ctx, { side: 'inhouse', cutoffDate: CUTOFF, name: null })
    expect(batch.whtSatang).toBe(4050)
    expect(batch.whtPolicy?.certificateMode).toBe('per_payee_batch')

    const overview = await policy.getWhtPolicyOverview(ORG_ID, NOW)
    expect(overview.isDefault).toBe(true)
    expect(overview.history).toHaveLength(1)
    expect(overview.history[0]?.isCurrent).toBe(false)

    await expect(
      policy.createWhtPolicy(
        policyCtx('ย้อนหลัง'),
        { effectiveFrom: new Date(Date.UTC(2026, 9, 4)), ...overview.defaults },
        NOW,
      ),
    ).rejects.toSatisfy((error: unknown) => codeOf(error) === 'WHT_POLICY_EFFECTIVE_DATE_PAST')
  })
})

suite('ประเภทเงินได้ 40(2) (U5/U7)', () => {
  async function useByTeamSide(): Promise<void> {
    await policy.createWhtPolicy(
      policyCtx('ให้ inhouse เป็น 40(2) ตามสัญญาจ้าง'),
      {
        effectiveFrom: new Date(Date.UTC(2026, 9, 5)),
        baseExpenseTypes: ['commission', 'no_success_fee', 'fuel', 'allowance'],
        certificateMode: 'per_payee_batch',
        incomeTypeMode: 'by_team_side',
        issueZeroRate402Certificate: true,
        inhouseIncomeCategory: 'sec_40_2',
        outsourceIncomeCategory: 'sec_40_8',
        allowGrossUpConditions: false,
        filingMethod: 'online',
      },
      NOW,
    )
  }

  it('(ง) ผู้รับ inhouse ไม่มีอัตรา 40(2) ⇒ ปัดพร้อมรายชื่อ · ฝั่ง outsource (40(8)) สร้างได้ตามปกติ', async () => {
    await useByTeamSide()
    await seedIn1()
    await seedExpense(PAYEE_OUT_ID, 'commission', 200_000)

    const error = await payout
      .createPayoutBatch(ctx, { side: 'inhouse', cutoffDate: CUTOFF, name: null })
      .catch((caught: unknown) => caught)
    expect(codeOf(error)).toBe('WHT_40_2_RATE_MISSING')
    expect((error as { context?: { payees?: string[] } }).context?.payees).toEqual(['อินหนึ่ง ในบ้าน'])
    expect(await db().payoutBatch.count({ where: { organizationId: ORG_ID } })).toBe(0)

    const outsource = await payout.createPayoutBatch(ctx, { side: 'outsource', cutoffDate: CUTOFF, name: null })
    expect(outsource.batch.whtSatang).toBe(6000)
    expect(outsource.batch.items[0]?.whtIncomeCategory).toBe('sec_40_8')
  })

  it('(ค) อัตรา 2.50% ⇒ หักจากฐาน (ไม่มีเกณฑ์) · ใบ 50 ทวิ ภ.ง.ด.1 ประเภทเงินได้ 40(2) · สรุปรอบนำส่ง pnd1', async () => {
    await useByTeamSide()
    await db().$executeRawUnsafe(`UPDATE payee_profiles SET wht_40_2_pct = 2.50 WHERE id = '${PAYEE_IN_ID}'`)
    // ฐาน ฿500 (ต่ำกว่า ฿1,000) ก็ยังหัก เพราะ 40(2) ไม่มีเกณฑ์
    await seedExpense(PAYEE_IN_ID, 'commission', 30_000)
    await seedExpense(PAYEE_IN_ID, 'fuel', 20_000)
    await seedExpense(PAYEE_IN_ID, 'hotel', 60_000)

    const { batch } = await payout.createPayoutBatch(ctx, { side: 'inhouse', cutoffDate: CUTOFF, name: null })
    expect(batch.whtSatang).toBe(1250)
    expect(batch.items.every((item) => item.whtIncomeCategory === 'sec_40_2')).toBe(true)
    expect(batch.items.find((item) => item.grossSatang === 30_000)?.whtPctSnapshot).toBe(2.5)

    await completeAndSync(batch.id)
    const certificates = await wht.listWhtCertificates(finance, {})
    expect(certificates.items).toHaveLength(1)
    expect(certificates.items[0]).toMatchObject({
      filingForm: 'PND1',
      incomeType: 'ค่าธรรมเนียม ค่านายหน้า มาตรา 40(2)',
      grossSatang: 50_000,
      whtSatang: 1250,
      issueMode: 'per_payee_batch',
    })
    expect(certificates.summary.pnd1Satang).toBe(1250)
    const filing = await db().whtFilingSummary.findFirstOrThrow({ where: { organizationId: ORG_ID } })
    expect(filing.pnd1Satang).toBe(1250)
    expect(filing.pnd3Satang).toBe(0)
  })
})

suite('เกณฑ์ ฿1,000 สะสมต่อผู้รับต่อเดือน (staging E-054)', () => {
  it('ค่าเริ่มต้นสะสมต่อเดือน: รอบแรก ฿600 ไม่หัก · รอบที่สองในเดือน ฿500 ⇒ หัก 3% ของ ฿1,100 · ใบ 50 ทวิ เงินได้ ฿1,100', async () => {
    await seedExpense(PAYEE_IN_ID, 'commission', 60_000)
    const first = await payout.createPayoutBatch(ctx, { side: 'inhouse', cutoffDate: CUTOFF, name: null })
    expect(first.batch.whtSatang).toBe(0)
    expect(first.batch.whtPolicy?.thresholdScope).toBe('monthly_cumulative')
    await completeAndSync(first.batch.id)

    await seedExpense(PAYEE_IN_ID, 'commission', 50_000)
    const second = await payout.createPayoutBatch(ctx, { side: 'inhouse', cutoffDate: CUTOFF, name: null })
    expect(second.batch.whtSatang).toBe(3_300)
    expect(second.batch.netSatang).toBe(46_700)
    expect(second.batch.items[0]?.whtCarriedBaseSatang).toBe(60_000)
    await completeAndSync(second.batch.id)

    const certificates = await wht.listWhtCertificates(finance, {})
    expect(certificates.items).toHaveLength(1)
    expect(certificates.items[0]).toMatchObject({ grossSatang: 110_000, whtSatang: 3_300, filingForm: 'PND3' })

    // รอบที่สามในเดือน — ถึงเกณฑ์แล้ว ⇒ หักตามปกติ ไม่ยกฐานซ้ำ
    await seedExpense(PAYEE_IN_ID, 'commission', 20_000)
    const third = await payout.createPayoutBatch(ctx, { side: 'inhouse', cutoffDate: CUTOFF, name: null })
    expect(third.batch.whtSatang).toBe(600)
    expect(third.batch.items[0]?.whtCarriedBaseSatang).toBe(0)
  })

  it('ค่าตั้ง "ต่อรอบจ่าย" ⇒ รอบที่สอง ฿500 ไม่หัก (พฤติกรรมเดิม)', async () => {
    await policy.createWhtPolicy(
      policyCtx('ให้นักบัญชีเลือกนับเกณฑ์ต่อรอบจ่าย'),
      {
        effectiveFrom: new Date(Date.UTC(2026, 9, 5)),
        baseExpenseTypes: ['commission', 'no_success_fee', 'fuel', 'allowance'],
        certificateMode: 'per_payee_batch',
        incomeTypeMode: 'all_40_8',
        issueZeroRate402Certificate: true,
        inhouseIncomeCategory: 'sec_40_2',
        outsourceIncomeCategory: 'sec_40_8',
        allowGrossUpConditions: false,
        thresholdScope: 'per_batch',
        filingMethod: 'online',
      },
      NOW,
    )
    await seedExpense(PAYEE_IN_ID, 'commission', 60_000)
    const first = await payout.createPayoutBatch(ctx, { side: 'inhouse', cutoffDate: CUTOFF, name: null })
    await completeAndSync(first.batch.id)
    await seedExpense(PAYEE_IN_ID, 'commission', 50_000)
    const second = await payout.createPayoutBatch(ctx, { side: 'inhouse', cutoffDate: CUTOFF, name: null })
    expect(second.batch.whtSatang).toBe(0)
    expect(second.batch.whtPolicy?.thresholdScope).toBe('per_batch')
  })

  it('รอบที่ถูกยกเลิกไม่นับเป็นยอดสะสม', async () => {
    await seedExpense(PAYEE_IN_ID, 'commission', 60_000)
    const first = await payout.createPayoutBatch(ctx, { side: 'inhouse', cutoffDate: CUTOFF, name: null })
    await db().$executeRawUnsafe(`
      UPDATE payout_batches
         SET status = 'cancelled', cancel_reason = 'ทดสอบยกเลิก', cancelled_at = now(), cancelled_by = '${FINANCE_ID}'
       WHERE id = '${first.batch.id}'
    `)
    await seedExpense(PAYEE_IN_ID, 'commission', 50_000)
    const second = await payout.createPayoutBatch(ctx, { side: 'inhouse', cutoffDate: CUTOFF, name: null })
    expect(second.batch.whtSatang).toBe(0)
  })
})

suite('ยอดเรียกคืนจากผู้รับ (staging E-014)', () => {
  /** Adjustment ลดยอดรายการเบิก (อนุมัติแล้ว) — ยิง hook ของการอนุมัติครบโดยตรง */
  async function approvedDecrease(expenseId: string, amountSatang: number): Promise<string | null> {
    const rows = await db().$queryRawUnsafe<{ id: string }[]>(`
      INSERT INTO adjustments (organization_id, expense_id, adjustment_type, amount_satang, reason, status, created_by)
      VALUES ('${ORG_ID}', '${expenseId}', 'decrease', ${amountSatang}, 'ค่าคอมคิดเกิน (เทสต์ E-014)', 'approved', '${FINANCE_ID}')
      RETURNING id::text AS id
    `)
    const { createRecoveryForApprovedAdjustment } = await import('@/lib/payout/recoveries')
    return createRecoveryForApprovedAdjustment(db() as unknown as Parameters<typeof createRecoveryForApprovedAdjustment>[0], {
      organizationId: ORG_ID,
      adjustmentId: rows[0]!.id,
      adjustmentType: 'decrease',
      expenseId,
      amountSatang,
      actorId: FINANCE_ID,
      actorRole: 'การเงิน',
      reason: 'ค่าคอมคิดเกิน (เทสต์ E-014)',
      meta,
    })
  }

  it('ลดยอดรายการที่จ่ายแล้ว ⇒ เกิดยอดเรียกคืน · รอบถัดไปหักจากยอดโอน (หลัง WHT) · ยกเลิกรอบ ⇒ กลับเป็นค้าง', async () => {
    await seedExpense(PAYEE_IN_ID, 'commission', 150_000)
    const first = await payout.createPayoutBatch(ctx, { side: 'inhouse', cutoffDate: CUTOFF, name: null })
    const paidExpenseId = (await db().expense.findFirstOrThrow({ where: { organizationId: ORG_ID } })).id

    // ยังไม่จ่ายจริง ⇒ ไม่เกิดยอดเรียกคืน
    expect(await approvedDecrease(paidExpenseId, 20_000)).toBeNull()
    await completeAndSync(first.batch.id)
    const recoveryId = await approvedDecrease(paidExpenseId, 20_000)
    expect(recoveryId).not.toBeNull()

    await seedExpense(PAYEE_IN_ID, 'commission', 150_000)
    const second = await payout.createPayoutBatch(ctx, { side: 'inhouse', cutoffDate: CUTOFF, name: null })
    // WHT/net ไม่เปลี่ยน · ยอดโอนลดลงเท่ายอดเรียกคืน
    expect(second.batch.recoveryOffsetSatang).toBe(20_000)
    expect(second.batch.transferSatang).toBe(second.batch.netSatang - 20_000)
    expect(second.batch.items[0]?.recoveryOffsetSatang).toBe(20_000)

    await payout.cancelPayoutBatch(ctx, second.batch.id, { reason: 'ทดสอบยกเลิกรอบ', confirmFileNotSent: true })
    const collections = await db().payeeRecoveryCollection.findMany({ where: { recoveryId: recoveryId! } })
    expect(collections).toHaveLength(1)
    expect(collections[0]?.reversedAt).not.toBeNull()

    // รอบใหม่หักได้อีกครั้ง (ยอดกลับเป็นค้าง) — ไม่ซ้ำ ไม่หาย
    const third = await payout.createPayoutBatch(ctx, { side: 'inhouse', cutoffDate: CUTOFF, name: null })
    expect(third.batch.recoveryOffsetSatang).toBe(20_000)
  })

  it('ยอดรอบถัดไปน้อยกว่ายอดเรียกคืน ⇒ หักเท่าที่มี ยกส่วนที่เหลือไปรอบถัดไป · ยอดโอนไม่ติดลบ', async () => {
    await seedExpense(PAYEE_IN_ID, 'commission', 50_000)
    const first = await payout.createPayoutBatch(ctx, { side: 'inhouse', cutoffDate: CUTOFF, name: null })
    await completeAndSync(first.batch.id)
    const paidExpenseId = (await db().expense.findFirstOrThrow({ where: { organizationId: ORG_ID } })).id
    await approvedDecrease(paidExpenseId, 40_000)

    await seedExpense(PAYEE_IN_ID, 'fuel', 30_000)
    const second = await payout.createPayoutBatch(ctx, { side: 'inhouse', cutoffDate: CUTOFF, name: null })
    expect(second.batch.transferSatang).toBe(0)
    expect(second.batch.recoveryOffsetSatang).toBe(second.batch.netSatang)
    const { recoveryOutstandingByPayee } = await import('@/lib/payout/recoveries')
    expect((await recoveryOutstandingByPayee(ORG_ID, [PAYEE_IN_ID])).get(PAYEE_IN_ID)).toBe(40_000 - second.batch.netSatang)
  })
})

suite('ใบ 50 ทวิ ต่อผู้รับต่อรอบ vs ต่อรายการ (U4)', () => {
  it('(จ) ต่อผู้รับต่อรอบ: 1 ใบ ยอดรวมของรอบ · ยกเลิกพร้อมออกแทนได้ยอดเท่าเดิม · sync ซ้ำไม่ออกซ้ำ', async () => {
    await seedIn1()
    const { batch } = await payout.createPayoutBatch(ctx, { side: 'inhouse', cutoffDate: CUTOFF, name: null })
    await completeAndSync(batch.id)

    const first = await wht.listWhtCertificates(finance, {})
    expect(first.items).toHaveLength(1)
    const certificate = first.items[0]!
    expect(certificate).toMatchObject({ grossSatang: 135_000, whtSatang: 4050, filingForm: 'PND3' })

    const { cancelled, replacement } = await wht.cancelWhtCertificate(
      { actor: finance, meta },
      certificate.id,
      { reason: 'สะกดชื่อผิด', reissue: true },
    )
    expect(cancelled.status).toBe('cancelled')
    expect(replacement).toMatchObject({
      grossSatang: 135_000,
      whtSatang: 4050,
      issueMode: 'per_payee_batch',
      replacesCertificateId: certificate.id,
    })

    await wht.syncWhtCertificatesFromPayout({ actor: finance, meta }, batch.id)
    const all = await db().whtCertificate.findMany({ where: { organizationId: ORG_ID } })
    expect(all).toHaveLength(2)
    expect(all.filter((row) => row.status === 'active')).toHaveLength(1)

    const doc = await wht.getWhtCertificateDocSource(finance, replacement!.id)
    expect(doc.coverage).toEqual({ payoutBatchName: batch.name, itemCount: 4 })
  })

  it('(จ) ต่อรายการ: ใบต่อรายการที่หักภาษี — ยอดภาษีรวมเท่ากับแบบต่อรอบ', async () => {
    await policy.createWhtPolicy(
      policyCtx('ออกใบต่อรายการตามที่สำนักงานบัญชีขอ'),
      {
        effectiveFrom: new Date(Date.UTC(2026, 9, 5)),
        baseExpenseTypes: ['commission', 'no_success_fee', 'fuel', 'allowance'],
        certificateMode: 'per_item',
        incomeTypeMode: 'all_40_8',
        issueZeroRate402Certificate: true,
        inhouseIncomeCategory: 'sec_40_2',
        outsourceIncomeCategory: 'sec_40_8',
        allowGrossUpConditions: false,
        filingMethod: 'online',
      },
      NOW,
    )
    await seedIn1()
    const { batch } = await payout.createPayoutBatch(ctx, { side: 'inhouse', cutoffDate: CUTOFF, name: null })
    await completeAndSync(batch.id)

    const certificates = await wht.listWhtCertificates(finance, {})
    expect(certificates.items).toHaveLength(3)
    expect(certificates.items.every((row) => row.issueMode === 'per_item')).toBe(true)
    expect(certificates.items.reduce((sum, row) => sum + row.whtSatang, 0)).toBe(4050)
  })
})

suite('40(2) อัตรา 0% ออก 50 ทวิ ยอดภาษี 0 (มติ PO 05/10/2569 U16)', () => {
  async function use402(issueZeroRate402Certificate: boolean, reason: string): Promise<void> {
    await policy.createWhtPolicy(
      policyCtx(reason),
      {
        effectiveFrom: new Date(Date.UTC(2026, 9, 5)),
        baseExpenseTypes: ['commission', 'no_success_fee', 'fuel', 'allowance'],
        certificateMode: 'per_payee_batch',
        incomeTypeMode: 'by_team_side',
        issueZeroRate402Certificate,
        inhouseIncomeCategory: 'sec_40_2',
        outsourceIncomeCategory: 'sec_40_8',
        allowGrossUpConditions: false,
        filingMethod: 'online',
      },
      NOW,
    )
  }

  /** in1 เป็น 40(2) อัตรา 0% — คอมมิชชัน 300 + น้ำมัน 200 (ในฐาน) + ค่าที่พัก 600 (นอกฐาน) */
  async function seedZeroRateIn1(): Promise<void> {
    await db().$executeRawUnsafe(`UPDATE payee_profiles SET wht_40_2_pct = 0 WHERE id = '${PAYEE_IN_ID}'`)
    await seedExpense(PAYEE_IN_ID, 'commission', 30_000)
    await seedExpense(PAYEE_IN_ID, 'fuel', 20_000)
    await seedExpense(PAYEE_IN_ID, 'hotel', 60_000)
  }

  it('เปิด (ค่าเริ่มต้น) ⇒ 50 ทวิ 1 ใบ ภาษี 0 เงินได้ = ฐาน · ภ.ง.ด.1 นับราย · 40(8) ต่ำกว่าเกณฑ์ยังไม่ออก · snapshot ลงรอบ', async () => {
    const overview = await policy.getWhtPolicyOverview(ORG_ID, NOW)
    expect(overview.defaults.issueZeroRate402Certificate).toBe(true)
    await use402(true, 'inhouse เป็น 40(2) อัตรา 0% ตามที่สำนักงานบัญชีคำนวณ')
    await seedZeroRateIn1()
    // out1 = 40(8) ฐาน ฿500 ต่ำกว่าเกณฑ์ ฿1,000 — ค่าตั้งนี้ไม่เกี่ยว
    await seedExpense(PAYEE_OUT_ID, 'commission', 50_000)

    const { batch } = await payout.createPayoutBatch(ctx, { side: 'inhouse', cutoffDate: CUTOFF, name: null })
    expect(batch.whtSatang).toBe(0)
    expect(batch.whtPolicy?.issueZeroRate402Certificate).toBe(true)
    const row = await db().payoutBatch.findUniqueOrThrow({ where: { id: batch.id } })
    expect(row.whtIssueZeroRate402Certificate).toBe(true)

    const outsource = await payout.createPayoutBatch(ctx, { side: 'outsource', cutoffDate: CUTOFF, name: null })
    expect(outsource.batch.whtSatang).toBe(0)

    await completeAndSync(batch.id)
    await completeAndSync(outsource.batch.id)

    const certificates = await wht.listWhtCertificates(finance, {})
    expect(certificates.items).toHaveLength(1)
    expect(certificates.items[0]).toMatchObject({
      filingForm: 'PND1',
      incomeType: 'ค่าธรรมเนียม ค่านายหน้า มาตรา 40(2)',
      grossSatang: 50_000,
      whtSatang: 0,
      issueMode: 'per_payee_batch',
    })
    expect(certificates.summary).toMatchObject({ pnd1Count: 1, pnd1GrossSatang: 50_000, pnd1Satang: 0, pnd3Satang: 0 })
    const filing = await db().whtFilingSummary.findFirstOrThrow({ where: { organizationId: ORG_ID } })
    expect(filing.pnd1Satang).toBe(0)

    // sync ซ้ำไม่ออกซ้ำ
    await wht.syncWhtCertificatesFromPayout({ actor: finance, meta }, batch.id)
    expect(await db().whtCertificate.count({ where: { organizationId: ORG_ID } })).toBe(1)
  })

  it('ยกเลิกใบภาษี 0 ⇒ ออกใบแทนได้ยอดเท่าเดิม', async () => {
    await use402(true, 'inhouse เป็น 40(2) อัตรา 0%')
    await seedZeroRateIn1()
    const { batch } = await payout.createPayoutBatch(ctx, { side: 'inhouse', cutoffDate: CUTOFF, name: null })
    await completeAndSync(batch.id)
    const [certificate] = (await wht.listWhtCertificates(finance, {})).items
    const { replacement } = await wht.cancelWhtCertificate({ actor: finance, meta }, certificate!.id, {
      reason: 'สะกดชื่อผิด',
      reissue: true,
    })
    expect(replacement).toMatchObject({ grossSatang: 50_000, whtSatang: 0, filingForm: 'PND1' })
  })

  it('ปิด ⇒ ไม่ออกใบ (พฤติกรรมเดิม) · snapshot false · audit บันทึกค่าตั้ง', async () => {
    await use402(false, 'สำนักงานบัญชีไม่ต้องการใบภาษี 0')
    await seedZeroRateIn1()
    const { batch } = await payout.createPayoutBatch(ctx, { side: 'inhouse', cutoffDate: CUTOFF, name: null })
    expect(batch.whtPolicy?.issueZeroRate402Certificate).toBe(false)
    await completeAndSync(batch.id)
    expect(await db().whtCertificate.count({ where: { organizationId: ORG_ID } })).toBe(0)

    const audit = await db().auditLog.findFirstOrThrow({
      where: { organizationId: ORG_ID, targetType: 'wht_policy_history' },
      orderBy: { createdAt: 'desc' },
    })
    expect(audit.afterData).toMatchObject({ issue_zero_rate_40_2_certificate: false })
    expect(audit.beforeData).toMatchObject({ issue_zero_rate_40_2_certificate: true })
  })

  it('snapshot — ปิดค่าตั้งหลังสร้างรอบแล้ว รอบเดิมยังออกตาม snapshot', async () => {
    await use402(true, 'inhouse เป็น 40(2) อัตรา 0%')
    await seedZeroRateIn1()
    const { batch } = await payout.createPayoutBatch(ctx, { side: 'inhouse', cutoffDate: CUTOFF, name: null })
    await use402(false, 'เปลี่ยนใจ ไม่ออกใบภาษี 0')
    await completeAndSync(batch.id)
    expect(await db().whtCertificate.count({ where: { organizationId: ORG_ID } })).toBe(1)
  })

  it('รอบที่สร้างก่อนมีค่าตั้งนี้ (snapshot NULL) ⇒ ไม่ออก', async () => {
    await use402(true, 'inhouse เป็น 40(2) อัตรา 0%')
    await seedZeroRateIn1()
    const { batch } = await payout.createPayoutBatch(ctx, { side: 'inhouse', cutoffDate: CUTOFF, name: null })
    await db().$executeRawUnsafe(
      `UPDATE payout_batches SET wht_issue_zero_rate_40_2_certificate = NULL WHERE id = '${batch.id}'`,
    )
    await completeAndSync(batch.id)
    expect(await db().whtCertificate.count({ where: { organizationId: ORG_ID } })).toBe(0)
  })
})

suite('U33 — ประเภทเงินได้ต่อประเภททีมเป็นค่าตั้ง + 40(1) (มติ PO 05/10/2569)', () => {
  async function useMapping(
    inhouseIncomeCategory: 'sec_40_1' | 'sec_40_2' | 'sec_40_8',
    outsourceIncomeCategory: 'sec_40_1' | 'sec_40_2' | 'sec_40_8',
    reason: string,
  ) {
    return policy.createWhtPolicy(
      policyCtx(reason),
      {
        effectiveFrom: new Date(Date.UTC(2026, 9, 5)),
        baseExpenseTypes: ['commission', 'no_success_fee', 'fuel', 'allowance'],
        certificateMode: 'per_payee_batch',
        incomeTypeMode: 'by_team_side',
        issueZeroRate402Certificate: true,
        inhouseIncomeCategory,
        outsourceIncomeCategory,
        allowGrossUpConditions: false,
        filingMethod: 'online',
      },
      NOW,
    )
  }

  it('outsource = 40(1) ไม่มีอัตรา ⇒ WHT_40_2_RATE_MISSING · inhouse = 40(8) สร้างได้ (ต่ำกว่าเกณฑ์ไม่หัก)', async () => {
    await useMapping('sec_40_8', 'sec_40_1', 'สำนักงานบัญชีให้ outsource เป็น 40(1)')
    await seedExpense(PAYEE_OUT_ID, 'commission', 50_000)
    await seedExpense(PAYEE_IN_ID, 'commission', 50_000)

    const error = await payout
      .createPayoutBatch(ctx, { side: 'outsource', cutoffDate: CUTOFF, name: null })
      .catch((caught: unknown) => caught)
    expect(codeOf(error)).toBe('WHT_40_2_RATE_MISSING')
    expect((error as { context?: { payees?: string[] } }).context?.payees).toEqual(['เอาท์หนึ่ง นอกบ้าน'])

    const inhouse = await payout.createPayoutBatch(ctx, { side: 'inhouse', cutoffDate: CUTOFF, name: null })
    expect(inhouse.batch.whtSatang).toBe(0)
    expect(inhouse.batch.items[0]?.whtIncomeCategory).toBe('sec_40_8')
  })

  it('outsource = 40(1) อัตรา 3% ⇒ หักไม่มีเกณฑ์ · snapshot การจับคู่ลงรอบ · 50 ทวิ ภ.ง.ด.1 ระบุ 40(1) · pnd1', async () => {
    await useMapping('sec_40_2', 'sec_40_1', 'สำนักงานบัญชีให้ outsource เป็น 40(1)')
    await db().$executeRawUnsafe(`UPDATE payee_profiles SET wht_40_2_pct = 3.00 WHERE id = '${PAYEE_OUT_ID}'`)
    await seedExpense(PAYEE_OUT_ID, 'commission', 50_000)
    await seedExpense(PAYEE_OUT_ID, 'hotel', 20_000)

    const { batch } = await payout.createPayoutBatch(ctx, { side: 'outsource', cutoffDate: CUTOFF, name: null })
    expect(batch.whtSatang).toBe(1500)
    expect(batch.items.every((item) => item.whtIncomeCategory === 'sec_40_1')).toBe(true)
    expect(batch.whtPolicy).toMatchObject({
      incomeTypeMode: 'by_team_side',
      inhouseIncomeCategory: 'sec_40_2',
      outsourceIncomeCategory: 'sec_40_1',
    })
    const row = await db().payoutBatch.findUniqueOrThrow({ where: { id: batch.id } })
    expect(row.whtInhouseIncomeCategory).toBe('sec_40_2')
    expect(row.whtOutsourceIncomeCategory).toBe('sec_40_1')

    await completeAndSync(batch.id)
    const certificates = await wht.listWhtCertificates(finance, {})
    expect(certificates.items).toHaveLength(1)
    expect(certificates.items[0]).toMatchObject({
      filingForm: 'PND1',
      incomeType: 'เงินเดือน ค่าจ้าง เบี้ยเลี้ยง โบนัส ฯลฯ มาตรา 40(1)',
      grossSatang: 50_000,
      whtSatang: 1500,
    })
    expect(certificates.summary.pnd1Satang).toBe(1500)
    const filing = await db().whtFilingSummary.findFirstOrThrow({ where: { organizationId: ORG_ID } })
    expect(filing.pnd1Satang).toBe(1500)
    expect(filing.pnd3Satang).toBe(0)
  })

  it('40(1) อัตรา 0% + ค่าตั้งเปิด ⇒ 50 ทวิ ภาษี 0 นับใน ภ.ง.ด.1', async () => {
    await useMapping('sec_40_1', 'sec_40_8', 'inhouse เป็น 40(1)')
    await db().$executeRawUnsafe(`UPDATE payee_profiles SET wht_40_2_pct = 0 WHERE id = '${PAYEE_IN_ID}'`)
    await seedExpense(PAYEE_IN_ID, 'commission', 40_000)

    const { batch } = await payout.createPayoutBatch(ctx, { side: 'inhouse', cutoffDate: CUTOFF, name: null })
    expect(batch.whtSatang).toBe(0)
    await completeAndSync(batch.id)
    const certificates = await wht.listWhtCertificates(finance, {})
    expect(certificates.items).toHaveLength(1)
    expect(certificates.items[0]).toMatchObject({ filingForm: 'PND1', whtSatang: 0, grossSatang: 40_000 })
  })

  it('เปลี่ยนการจับคู่หลังสร้างรอบ ⇒ รอบเดิมคง snapshot · audit before/after มีการจับคู่ + เหตุผล', async () => {
    await useMapping('sec_40_2', 'sec_40_8', 'ชุดแรก')
    await db().$executeRawUnsafe(`UPDATE payee_profiles SET wht_40_2_pct = 2.00 WHERE id = '${PAYEE_IN_ID}'`)
    await seedExpense(PAYEE_IN_ID, 'commission', 50_000)
    const first = await payout.createPayoutBatch(ctx, { side: 'inhouse', cutoffDate: CUTOFF, name: null })
    expect(first.batch.items[0]?.whtIncomeCategory).toBe('sec_40_2')

    const created = await useMapping('sec_40_1', 'sec_40_2', 'สำนักงานบัญชีเปลี่ยนคำแนะนำ')
    expect(created.inhouseIncomeCategory).toBe('sec_40_1')
    expect(created.outsourceIncomeCategory).toBe('sec_40_2')

    const again = await payout.getPayoutBatch(finance, first.batch.id)
    expect(again.whtPolicy).toMatchObject({ inhouseIncomeCategory: 'sec_40_2', outsourceIncomeCategory: 'sec_40_8' })
    expect(again.items[0]?.whtIncomeCategory).toBe('sec_40_2')

    const audit = await db().auditLog.findFirstOrThrow({
      where: { organizationId: ORG_ID, targetType: 'wht_policy_history', targetId: created.id },
    })
    expect(audit.reason).toBe('สำนักงานบัญชีเปลี่ยนคำแนะนำ')
    expect(audit.beforeData).toMatchObject({ inhouse_income_category: 'sec_40_2', outsource_income_category: 'sec_40_8' })
    expect(audit.afterData).toMatchObject({ inhouse_income_category: 'sec_40_1', outsource_income_category: 'sec_40_2' })
  })
})

suite('U105 — เงื่อนไขการหัก (2)/(3) เป็นค่าตั้ง (มติ PO 06/10/2569)', () => {
  /** ค่าตั้งชุดใหม่ที่มีผลวันสร้างรอบ (ค่าอื่นเท่าค่าเริ่มต้น) */
  async function allowGrossUp(allow: boolean, reason: string) {
    return policy.createWhtPolicy(
      policyCtx(reason),
      {
        effectiveFrom: new Date(Date.UTC(2026, 9, 5)),
        baseExpenseTypes: ['commission', 'no_success_fee', 'fuel', 'allowance'],
        certificateMode: 'per_payee_batch',
        incomeTypeMode: 'all_40_8',
        issueZeroRate402Certificate: true,
        inhouseIncomeCategory: 'sec_40_2',
        outsourceIncomeCategory: 'sec_40_8',
        allowGrossUpConditions: allow,
        filingMethod: 'online',
      },
      NOW,
    )
  }

  async function setCondition(payeeId: string, condition: 'withhold' | 'pay_always' | 'pay_once'): Promise<void> {
    await db().$executeRawUnsafe(`UPDATE payee_profiles SET wht_condition = '${condition}' WHERE id = '${payeeId}'`)
  }

  it('ค่าตั้งปิด (ค่าเริ่มต้น) + ผู้รับตั้ง (2) ⇒ บล็อกสร้างรอบ WHT_CONDITION_NOT_ALLOWED พร้อมรายชื่อ · ไม่มีรอบเกิด', async () => {
    await setCondition(PAYEE_IN_ID, 'pay_always')
    await seedExpense(PAYEE_IN_ID, 'commission', 1_000_000)
    const error = await payout
      .createPayoutBatch(ctx, { side: 'inhouse', cutoffDate: CUTOFF, name: null })
      .catch((caught: unknown) => caught)
    expect(codeOf(error)).toBe('WHT_CONDITION_NOT_ALLOWED')
    expect((error as { context?: { payees?: string[] } }).context?.payees).toEqual(['อินหนึ่ง ในบ้าน'])
    expect(await db().payoutBatch.count({ where: { organizationId: ORG_ID } })).toBe(0)
  })

  it('ค่าตั้งปิด + ผู้รับ (2) ที่มีแต่รายการนอกฐาน ⇒ ไม่บล็อก (ไม่มีภาษีให้คิด)', async () => {
    await setCondition(PAYEE_IN_ID, 'pay_always')
    await seedExpense(PAYEE_IN_ID, 'hotel', 60_000)
    const { batch } = await payout.createPayoutBatch(ctx, { side: 'inhouse', cutoffDate: CUTOFF, name: null })
    expect(batch.whtSatang).toBe(0)
    expect(batch.netSatang).toBe(60_000)
  })

  it('ค่าตั้งเปิด + (2) ออกให้ตลอดไป: ฿10,000 อัตรา 3% ⇒ ภาษี 309.28 · ใบ 50 ทวิ เงินได้ 10,309.28 · ผู้รับได้ 10,000 เต็ม', async () => {
    await allowGrossUp(true, 'เปิดเงื่อนไขออกภาษีให้ตามสัญญาจ้าง')
    await setCondition(PAYEE_IN_ID, 'pay_always')
    await seedExpense(PAYEE_IN_ID, 'commission', 1_000_000)
    const { batch } = await payout.createPayoutBatch(ctx, { side: 'inhouse', cutoffDate: CUTOFF, name: null })

    expect(batch.whtPolicy?.allowGrossUpConditions).toBe(true)
    expect(batch.items[0]).toMatchObject({
      grossSatang: 1_030_928,
      whtSatang: 30_928,
      netSatang: 1_000_000,
      whtCondition: 'pay_always',
    })
    expect(batch).toMatchObject({ grossSatang: 1_030_928, whtSatang: 30_928, netSatang: 1_000_000, transferSatang: 1_000_000 })
    // มติ PO U109 — ยอดของรอบแยก ค่าตอบแทน 10,000 · ภาษีที่บริษัทออกให้ 309.28 · หักผู้รับ 0 (หน้ารายการรอบจ่าย)
    expect(batch).toMatchObject({ compensationSatang: 1_000_000, whtPaidByPayerSatang: 30_928, whtWithheldSatang: 0 })
    const listed = await payout.listPayoutBatches(finance, { status: 'all', side: 'all' })
    expect(listed.find((row) => row.id === batch.id)).toMatchObject({
      compensationSatang: 1_000_000,
      whtPaidByPayerSatang: 30_928,
      whtWithheldSatang: 0,
    })
    const audit = await db().auditLog.findFirstOrThrow({
      where: { organizationId: ORG_ID, targetType: 'payout_batches', targetId: batch.id, action: 'create' },
    })
    expect(audit.afterData).toMatchObject({ wht_allow_gross_up_conditions: true })

    // ปิดค่าตั้งภายหลัง ⇒ รอบเดิมคง snapshot และออกใบ 50 ทวิ ได้ตามยอดเดิม
    await allowGrossUp(false, 'ปิดเงื่อนไขชั่วคราวรอสำนักงานบัญชี')
    await completeAndSync(batch.id)
    const certificates = await wht.listWhtCertificates(finance, {})
    expect(certificates.items).toHaveLength(1)
    expect(certificates.items[0]).toMatchObject({ grossSatang: 1_030_928, whtSatang: 30_928 })
    const certificate = await db().whtCertificate.findFirstOrThrow({ where: { organizationId: ORG_ID } })
    expect(certificate.whtCondition).toBe('pay_always')
    const record = await db().expenseRecord.findFirstOrThrow({ where: { organizationId: ORG_ID } })
    expect(record).toMatchObject({ grossSatang: 1_030_928, whtSatang: 30_928, netSatang: 1_000_000 })
  })

  it('ค่าตั้งเปิด + (3) ออกให้ครั้งเดียว: ภาษี 300.00 · เงินได้บนใบ 10,300.00 · (1) ผู้รับอีกคนหัก 300 ได้ 9,700', async () => {
    await allowGrossUp(true, 'เปิดเงื่อนไขออกภาษีให้ครั้งเดียว')
    await setCondition(PAYEE_OUT_ID, 'pay_once')
    await seedExpense(PAYEE_OUT_ID, 'commission', 1_000_000)
    const once = await payout.createPayoutBatch(ctx, { side: 'outsource', cutoffDate: CUTOFF, name: null })
    expect(once.batch.items[0]).toMatchObject({
      grossSatang: 1_030_000,
      whtSatang: 30_000,
      netSatang: 1_000_000,
      whtCondition: 'pay_once',
    })

    await seedExpense(PAYEE_IN_ID, 'commission', 1_000_000)
    const normal = await payout.createPayoutBatch(ctx, { side: 'inhouse', cutoffDate: CUTOFF, name: null })
    expect(normal.batch.items[0]).toMatchObject({
      grossSatang: 1_000_000,
      whtSatang: 30_000,
      netSatang: 970_000,
      whtCondition: 'withhold',
    })
    // มติ PO U109 — (3) ภาษีที่บริษัทออกให้ 300 แยกจากค่าตอบแทน · (1) ไม่เปลี่ยน (หักผู้รับ 300)
    expect(once.batch).toMatchObject({ compensationSatang: 1_000_000, whtPaidByPayerSatang: 30_000, whtWithheldSatang: 0 })
    expect(normal.batch).toMatchObject({ compensationSatang: 1_000_000, whtPaidByPayerSatang: 0, whtWithheldSatang: 30_000 })
  })

  it('Final ด่าน 2 golden PY-5 — (2) ทบยอด 3% ฐาน 320000 ⇒ ภาษี 9897 · gross 559897 · net/โอน 550000 · ใบ 50 ทวิ เงินได้ 329897', async () => {
    await allowGrossUp(true, 'เปิดเงื่อนไขออกภาษีให้ — Final ด่าน 2')
    await setCondition(PAYEE_OUT_ID, 'pay_always')
    // FT-03 r1 · FT-03 r2 · FT-05 · FT-09 (ในฐาน) + ค่าที่พัก/เบิกส่วนเกิน (นอกฐาน) — `FINAL-coverage.md` H.2
    for (const gross of [15_000, 30_000, 15_000, 100_000, 15_000, 30_000, 15_000, 100_000]) {
      await seedExpense(PAYEE_OUT_ID, gross === 15_000 ? 'allowance' : 'commission', gross)
    }
    for (const gross of [150_000, 25_000, 45_000, 10_000]) await seedExpense(PAYEE_OUT_ID, 'hotel', gross)
    const { batch } = await payout.createPayoutBatch(ctx, { side: 'outsource', cutoffDate: CUTOFF, name: null })

    expect(batch).toMatchObject({ grossSatang: 559_897, whtSatang: 9_897, netSatang: 550_000, transferSatang: 550_000 })
    expect(batch).toMatchObject({ compensationSatang: 550_000, whtPaidByPayerSatang: 9_897, whtWithheldSatang: 0 })
    const shares = batch.items.map((item) => item.whtSatang).filter((wht) => wht > 0).sort((a, b) => a - b)
    expect(shares).toEqual([464, 464, 464, 464, 928, 928, 3092, 3093])

    await completeAndSync(batch.id)
    const certificates = await wht.listWhtCertificates(finance, {})
    expect(certificates.items).toHaveLength(1)
    expect(certificates.items[0]).toMatchObject({ grossSatang: 329_897, whtSatang: 9_897 })
  })

  it('Final ด่าน 2 golden PY-8 — (3) ครั้งเดียว 3% ฐาน 160000 ⇒ ภาษี 4800 · gross 764800 · net 760000', async () => {
    await allowGrossUp(true, 'เปิดเงื่อนไขออกภาษีให้ — Final ด่าน 2')
    await setCondition(PAYEE_OUT_ID, 'pay_once')
    for (const gross of [15_000, 100_000, 15_000, 30_000]) await seedExpense(PAYEE_OUT_ID, 'allowance', gross)
    await seedExpense(PAYEE_OUT_ID, 'hotel', 600_000)
    const { batch } = await payout.createPayoutBatch(ctx, { side: 'outsource', cutoffDate: CUTOFF, name: null })
    expect(batch).toMatchObject({ grossSatang: 764_800, whtSatang: 4_800, netSatang: 760_000 })
    const shares = batch.items.map((item) => item.whtSatang).filter((wht) => wht > 0).sort((a, b) => a - b)
    expect(shares).toEqual([450, 450, 900, 3000])
  })

  it('ฟอร์มผู้รับ: ค่าตั้งปิด ⇒ เปลี่ยนเป็น (2) ไม่ได้ · ค่าเดิม (2) แก้ฟิลด์อื่นได้ · เปิดแล้วเปลี่ยนได้', async () => {
    const payees = await import('@/lib/payees/queries')
    const { payeeUpdateSchema } = await import('@/lib/payees/schemas')
    const payeeAdmin: SessionUser = {
      ...finance,
      capabilities: { ...finance.capabilities, manage_payee_profile: 'manage' },
    }
    const payeeCtx = { actor: payeeAdmin, meta, reason: 'ปรับเงื่อนไขการหักตามสัญญา' }
    const input = (condition: 'withhold' | 'pay_always') =>
      payeeUpdateSchema.parse({
        payeeType: 'individual',
        taxProfileId: TAX_PROFILE_ID,
        nationalId: '1100000005701',
        bankName: 'ธนาคารกสิกรไทย',
        accountName: 'อินหนึ่ง ในบ้าน',
        accountNumber: '1234567890',
        whtCondition: condition,
        reason: 'ปรับเงื่อนไขการหักตามสัญญา',
      })

    expect(await payees.getPayeeWhtConditionPolicy(payeeAdmin, NOW)).toEqual({ allowGrossUpConditions: false })
    const blocked = await payees
      .updatePayee(payeeCtx, PAYEE_IN_ID, input('pay_always'))
      .catch((caught: unknown) => caught)
    expect(codeOf(blocked)).toBe('WHT_CONDITION_NOT_ALLOWED')

    // ตั้งไว้ก่อนปิดค่าตั้ง ⇒ คงค่าเดิมได้ (แก้ฟิลด์อื่นตามปกติ)
    await setCondition(PAYEE_IN_ID, 'pay_always')
    const kept = await payees.updatePayee(payeeCtx, PAYEE_IN_ID, input('pay_always'))
    expect(kept.payee.whtCondition).toBe('pay_always')

    await setCondition(PAYEE_IN_ID, 'withhold')
    await allowGrossUp(true, 'เปิดเงื่อนไขออกภาษีให้')
    const changed = await payees.updatePayee(payeeCtx, PAYEE_IN_ID, input('pay_always'))
    expect(changed.payee.whtCondition).toBe('pay_always')
  })
})
