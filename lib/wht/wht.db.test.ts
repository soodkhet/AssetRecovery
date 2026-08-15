import { PrismaPg } from '@prisma/adapter-pg'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { SessionUser } from '@/lib/auth/types'
import { PrismaClient } from '@/lib/generated/prisma/client'

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
                            receipt_file_url, created_by)
      VALUES ('${ORG_ID}', '${item.payeeId}', 'commission', ${item.gross}, '2026-06-20', 'approved',
              'field/receipts/ok.jpg', '${USER_ID}')
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
    INSERT INTO payee_profiles (id, organization_id, user_id, payee_type, national_id, is_verified, created_by)
    VALUES ('${PAYEE_PERSON_ID}', '${ORG_ID}', '${AGENT_ID}', 'individual', '3100000001234', true, '${USER_ID}'),
           ('${PAYEE_COMPANY_ID}', '${ORG_ID}', '${VENDOR_ID}', 'corporate', '0105560099999', true, '${USER_ID}')
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
    const juristic = issued.find((row) => row.filingForm === 'PND53')
    expect(juristic?.incomeType).toBe('ค่าบริการ มาตรา 40(8)')
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

    // เลขที่เป็น UNIQUE **ทั้งตาราง** (`02` §9) ⇒ ตรวจว่าไม่มีเลขซ้ำข้ามองค์กรด้วย
    const all = await db().whtCertificate.findMany({
      where: { certificateNumber: { startsWith: 'WHT-2569-' } },
      select: { certificateNumber: true },
    })
    expect(new Set(all.map((row) => row.certificateNumber)).size).toBe(all.length)
  })

  it('mark-filed: pending → filed + audit มีเหตุผล · ทำซ้ำ ⇒ WHT_FILING_ALREADY_FILED', async () => {
    const periodId = await junePeriodId()
    const summary = await db().whtFilingSummary.findUniqueOrThrow({ where: { periodId } })

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
      data: { status: 'pending', filedAt: null, filedBy: null },
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

  it('อ้าง id ที่ไม่มีในองค์กร ⇒ 404 ไม่ leak (WHT_CERTIFICATE_NOT_FOUND / WHT_FILING_SUMMARY_NOT_FOUND)', async () => {
    const missing = '00000000-0000-4000-8000-0000000045ff'
    await expectCode(() => wht.getWhtCertificateDocSource(accountant, missing), 'WHT_CERTIFICATE_NOT_FOUND')
    await expectCode(
      () => wht.markWhtFilingFiled(ctx, missing, { reason: 'ทดสอบ' }),
      'WHT_FILING_SUMMARY_NOT_FOUND',
    )
  })
})
