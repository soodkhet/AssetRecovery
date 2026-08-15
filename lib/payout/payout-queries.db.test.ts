import { PrismaPg } from '@prisma/adapter-pg'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import type { SessionUser } from '@/lib/auth/types'
import { PrismaClient } from '@/lib/generated/prisma/client'

/**
 * เทสต์ระดับ DB ของ Phase 3.4 — DoD ตาม `17` §16:
 *  · payee ยังไม่ยืนยันอยู่ในรายการ ⇒ `UNVERIFIED_PAYEE_IN_PAYOUT` (reject ทั้งรอบ ไม่สร้าง batch ค้าง)
 *  · สร้างไฟล์โอนซ้ำ ⇒ เตือน `DUPLICATE_PAYMENT_FILE` ก่อน แล้วยืนยันจึงสร้างจริง **โดยใช้ key เดิม**
 *  · ฝั่ง inhouse/outsource ไม่ปนกันในรอบเดียว
 * เพิ่มจากยามของ `13`/`02`:
 *  · `BANK_FILE_NOT_TESTED` — format ที่ยังไม่ผ่านทดสอบ สร้างไฟล์โอนไม่ได้
 *  · 1 รายการเข้าได้รอบเดียว (สองรอบสร้างพร้อมกัน)
 *  · เงินทดรองเข้ารอบจ่ายได้และ **ไม่ถูกหัก WHT** (A4)
 *  · `complete` ข้ามขั้นไม่ได้ + sync จากไฟล์ 35 idempotent
 *
 * ⚠️ ต้องตั้ง `DATABASE_URL = TEST_DATABASE_URL` **ก่อน** import service (กับดัก 2026-08-14)
 * ⚠️ Supabase Storage ถูก mock เป็น in-memory (อัปโหลด path ซ้ำ = โยน) เพื่อพิสูจน์ว่าไฟล์ไม่ทับกัน
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
  console.warn('[payout-queries.db.test] ข้ามเทสต์ระดับ DB — ไม่มี TEST_DATABASE_URL (ดู .env.example)')
}

const ORG_ID = '00000000-0000-4000-8000-0000000034a0'
const ROLE_FINANCE = '00000000-0000-4000-8000-0000000034a1'
const ROLE_AGENT = '00000000-0000-4000-8000-0000000034a2'
const FINANCE_ID = '00000000-0000-4000-8000-0000000034a3'
const AGENT_OUT_ID = '00000000-0000-4000-8000-0000000034a4'
const AGENT_IN_ID = '00000000-0000-4000-8000-0000000034a5'
const TEAM_OUT_ID = '00000000-0000-4000-8000-0000000034a6'
const TEAM_IN_ID = '00000000-0000-4000-8000-0000000034a7'
const TAX_PROFILE_ID = '00000000-0000-4000-8000-0000000034a8'
const PLAN_ID = '00000000-0000-4000-8000-0000000034a9'
const BANK_ACCOUNT_ID = '00000000-0000-4000-8000-0000000034b0'
const FORMAT_OK_ID = '00000000-0000-4000-8000-0000000034b1'
const FORMAT_PENDING_ID = '00000000-0000-4000-8000-0000000034b2'
const PAYEE_OUT_ID = '00000000-0000-4000-8000-0000000034b3'
const PAYEE_IN_ID = '00000000-0000-4000-8000-0000000034b4'

let client: PrismaClient | null = null
type PayoutQueries = typeof import('@/lib/payout/queries')
let payout: PayoutQueries

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
  supabaseUid: 'uid-finance-34',
  email: 'finance34@test.local',
  fullName: 'การเงิน 3.4',
  status: 'active',
  roleId: ROLE_FINANCE,
  roleName: 'การเงิน',
  roleGroup: 'system',
  isSuperadmin: false,
  teamId: null,
  companyId: null,
  capabilities: { manage_payout_batch: 'manage', generate_payment_file: 'manage' },
  scope: { kind: 'global', teamIds: [], companyId: null, userId: FINANCE_ID },
  loginAt: new Date().toISOString(),
}

const ctx = { actor: finance, meta }

function codeOf(error: unknown): string {
  return (error as { code?: string }).code ?? String(error)
}

async function expectCode(run: () => Promise<unknown>, code: string): Promise<void> {
  await expect(run()).rejects.toSatisfy((error: unknown) => codeOf(error) === code, `ต้องได้ error code ${code}`)
}

const CUTOFF = new Date(Date.UTC(2026, 7, 31))

/** รายการค่าตอบแทนที่อนุมัติแล้ว 1 รายการ */
async function seedExpense(input: {
  id: string
  payeeId: string
  grossSatang: number
  expenseDate?: string
  status?: string
}): Promise<void> {
  await db().$executeRawUnsafe(`
    INSERT INTO expenses (id, organization_id, payee_id, expense_type, gross_satang, expense_date,
                          status, comp_plan_id, comp_plan_version, approval_step_current, approval_step_total, created_by)
    VALUES ('${input.id}', '${ORG_ID}', '${input.payeeId}', 'commission', ${input.grossSatang},
            '${input.expenseDate ?? '2026-08-20'}', '${input.status ?? 'approved'}', '${PLAN_ID}', 1, 2, 2, '${FINANCE_ID}')
  `)
}

async function seedAdvance(input: { id: string; payeeId: string; satang: number }): Promise<void> {
  await db().$executeRawUnsafe(`
    INSERT INTO advances (id, organization_id, payee_id, requested_satang, approved_satang, purpose,
                          due_clear_date, status, approved_at, created_by)
    VALUES ('${input.id}', '${ORG_ID}', '${input.payeeId}', ${input.satang}, ${input.satang},
            'ค่าเดินทางล่วงหน้า', '2026-09-15', 'approved', '2026-08-20T03:00:00Z', '${FINANCE_ID}')
  `)
}

const generateInput = {
  bankAccountId: BANK_ACCOUNT_ID,
  bankFileFormatId: FORMAT_OK_ID,
  confirmDuplicate: false,
  reason: 'สร้างไฟล์โอนรอบจ่ายประจำเดือน',
}

async function reset(): Promise<void> {
  const tx = db()
  storage.clear()
  // Phase 4.4/4.5 — รอบที่ `completed` ผลิตบัญชีค่าใช้จ่าย (+ exception) และใบ 50 ทวิ ต้องล้างก่อน FK
  // ใบ 50 ทวิ ลบไม่ได้ด้วย trigger (`02` §13 — เลขที่ห้ามขาดช่วง) — ปิดเฉพาะตอนล้างข้อมูลเทสต์
  await tx.$executeRawUnsafe(`ALTER TABLE wht_certificates DISABLE TRIGGER trg_wht_certificates_no_delete`)
  try {
    await tx.$executeRawUnsafe(`DELETE FROM wht_certificates WHERE organization_id = '${ORG_ID}'`)
  } finally {
    await tx.$executeRawUnsafe(`ALTER TABLE wht_certificates ENABLE TRIGGER trg_wht_certificates_no_delete`)
  }
  await tx.$executeRawUnsafe(`DELETE FROM wht_filing_summaries WHERE organization_id = '${ORG_ID}'`)
  await tx.$executeRawUnsafe(`DELETE FROM expense_records WHERE organization_id = '${ORG_ID}'`)
  await tx.$executeRawUnsafe(`DELETE FROM exceptions WHERE organization_id = '${ORG_ID}'`)
  await tx.$executeRawUnsafe(`DELETE FROM payout_batch_items WHERE organization_id = '${ORG_ID}'`)
  await tx.$executeRawUnsafe(`DELETE FROM payout_batches WHERE organization_id = '${ORG_ID}'`)
  await tx.$executeRawUnsafe(`DELETE FROM expenses WHERE organization_id = '${ORG_ID}'`)
  await tx.$executeRawUnsafe(`DELETE FROM advances WHERE organization_id = '${ORG_ID}'`)
  // คืนทั้ง `is_verified` และ `tax_profile_id` — เทสต์ WHT fallback ถอด Tax Profile ออกชั่วคราว
  await tx.$executeRawUnsafe(
    `UPDATE payee_profiles SET is_verified = true, tax_profile_id = '${TAX_PROFILE_ID}' WHERE organization_id = '${ORG_ID}'`,
  )
  await tx.$executeRawUnsafe(
    `UPDATE bank_file_formats SET test_status = 'passed' WHERE id = '${FORMAT_OK_ID}'`,
  )
}

beforeAll(async () => {
  if (!url) return
  process.env.DATABASE_URL = url
  payout = await import('@/lib/payout/queries')

  const tx = db()
  await tx.$executeRawUnsafe(`
    INSERT INTO organizations (id, name, tax_id, address)
    VALUES ('${ORG_ID}', 'Phase34Test', '9999999993400', 'ที่อยู่ทดสอบ 3.4') ON CONFLICT (id) DO NOTHING
  `)
  await tx.$executeRawUnsafe(`
    INSERT INTO roles (id, organization_id, name, role_group, is_seed) VALUES
      ('${ROLE_FINANCE}', '${ORG_ID}', 'การเงิน 3.4', 'system', false),
      ('${ROLE_AGENT}', '${ORG_ID}', 'พนักงานติดตามทรัพย์ 3.4', 'outsource', false)
    ON CONFLICT (id) DO NOTHING
  `)
  await tx.$executeRawUnsafe(`
    INSERT INTO users (id, organization_id, role_id, email, full_name, phone, status) VALUES
      ('${FINANCE_ID}', '${ORG_ID}', '${ROLE_FINANCE}', 'finance34@test.local', 'การเงิน 3.4', NULL, 'active'),
      ('${AGENT_OUT_ID}', '${ORG_ID}', '${ROLE_AGENT}', 'out34@test.local', 'สมชาย นอกบ้าน', '0812345678', 'active'),
      ('${AGENT_IN_ID}', '${ORG_ID}', '${ROLE_AGENT}', 'in34@test.local', 'สมหญิง ในบ้าน', '0898765432', 'active')
    ON CONFLICT (id) DO NOTHING
  `)
  await tx.$executeRawUnsafe(`
    INSERT INTO teams (id, organization_id, name, side, provinces, status, created_by) VALUES
      ('${TEAM_OUT_ID}', '${ORG_ID}', 'ทีมนอก 3.4', 'outsource', ARRAY['ลำพูน'], 'active', '${FINANCE_ID}'),
      ('${TEAM_IN_ID}', '${ORG_ID}', 'ทีมใน 3.4', 'inhouse', ARRAY['เชียงใหม่'], 'active', '${FINANCE_ID}')
    ON CONFLICT (id) DO NOTHING
  `)
  await tx.$executeRawUnsafe(`UPDATE users SET team_id = '${TEAM_OUT_ID}' WHERE id = '${AGENT_OUT_ID}'`)
  await tx.$executeRawUnsafe(`UPDATE users SET team_id = '${TEAM_IN_ID}' WHERE id = '${AGENT_IN_ID}'`)
  await tx.$executeRawUnsafe(`
    INSERT INTO tax_profiles (id, organization_id, name, wht_pct, wht_basis, wht_min_threshold_satang, created_by)
    VALUES ('${TAX_PROFILE_ID}', '${ORG_ID}', 'ค่าจ้างทำของ 3% (3.4)', 3.00, 'before_vat', 100000, '${FINANCE_ID}')
    ON CONFLICT (id) DO NOTHING
  `)
  await tx.$executeRawUnsafe(`
    INSERT INTO compensation_plans (id, organization_id, name, side, fuel_mode, fuel_rate_per_km_satang,
                                    allowance_satang, commission_satang, wht_pct, version, effective_from, created_by)
    VALUES ('${PLAN_ID}', '${ORG_ID}', 'แผน 3.4', 'outsource', 'PER_KM', 500, 30000, 150000, 3.00, 1, '2026-01-01', '${FINANCE_ID}')
    ON CONFLICT (id) DO NOTHING
  `)
  await tx.$executeRawUnsafe(`
    INSERT INTO payee_profiles (id, organization_id, user_id, payee_type, tax_profile_id, bank_name,
                                account_name, account_number, national_id, is_verified, created_by) VALUES
      ('${PAYEE_OUT_ID}', '${ORG_ID}', '${AGENT_OUT_ID}', 'individual', '${TAX_PROFILE_ID}', 'ธนาคารกสิกรไทย',
       'สมชาย นอกบ้าน', '1234567890', '1234567890123', true, '${FINANCE_ID}'),
      ('${PAYEE_IN_ID}', '${ORG_ID}', '${AGENT_IN_ID}', 'individual', '${TAX_PROFILE_ID}', 'ธนาคารไทยพาณิชย์',
       'สมหญิง ในบ้าน', '9876543210', '9876543210123', true, '${FINANCE_ID}')
    ON CONFLICT (id) DO NOTHING
  `)
  await tx.$executeRawUnsafe(`
    INSERT INTO bank_accounts (id, organization_id, bank_name, account_name, account_number, usage, created_by)
    VALUES ('${BANK_ACCOUNT_ID}', '${ORG_ID}', 'ธนาคารกรุงเทพ', 'บริษัท แอสเซท รีคัฟเวอรี่ จำกัด', '1112223334', 'pay', '${FINANCE_ID}')
    ON CONFLICT (id) DO NOTHING
  `)
  await tx.$executeRawUnsafe(`
    INSERT INTO bank_file_formats (id, organization_id, bank_name, file_type, encoding, column_mapping, test_status, created_by) VALUES
      ('${FORMAT_OK_ID}', '${ORG_ID}', 'ธนาคารกรุงเทพ', 'CSV', 'UTF-8',
       'receiving_bank_code,receiving_account_no,receiving_account_name,amount,transfer_date,reference_no', 'passed', '${FINANCE_ID}'),
      ('${FORMAT_PENDING_ID}', '${ORG_ID}', 'ธนาคารทดสอบ', 'CSV', 'UTF-8',
       'receiving_bank_code,receiving_account_no,receiving_account_name,amount', 'pending', '${FINANCE_ID}')
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

suite('batch builder (`17` §9)', () => {
  it('ดึงเฉพาะรายการ approved ของฝั่งที่เลือก + คิด WHT + ปิดท้ายที่สถานะ checking', async () => {
    await seedExpense({ id: '00000000-0000-4000-8000-0000000034c1', payeeId: PAYEE_OUT_ID, grossSatang: 500_000 })
    await seedExpense({ id: '00000000-0000-4000-8000-0000000034c2', payeeId: PAYEE_IN_ID, grossSatang: 300_000 })

    const { batch } = await payout.createPayoutBatch(ctx, { side: 'outsource', cutoffDate: CUTOFF, name: null })

    expect(batch.status).toBe('checking')
    expect(batch.itemCount).toBe(1)
    // 5,000 บาท × 3% = 150 บาท ⇒ net 4,850 บาท (`22` §6.9/§6.10)
    expect(batch.grossSatang).toBe(500_000)
    expect(batch.whtSatang).toBe(15_000)
    expect(batch.netSatang).toBe(485_000)
    expect(batch.items[0]?.whtPctSnapshot).toBe(3)
    expect(batch.items[0]?.taxProfileId).toBe(TAX_PROFILE_ID)
    expect(batch.name).toBe('รอบจ่าย Outsource ตัดรอบ 31/08/2569')
  })

  /**
   * `18` §6.3 · Rule 01 — Payee ที่ยังไม่ผูก Tax Profile ถูกคิดด้วยอัตราของ Plan ได้
   * **แต่ต้องเตือนกลับเสมอ** (`WHT_RATE_FALLBACK_TO_PLAN` — เตือนไม่บล็อก · มติ PO รีวิว Phase 3)
   */
  it('Payee ไม่มี Tax Profile ⇒ ใช้อัตราของแผนได้ แต่ต้องได้ warning กลับมาด้วย', async () => {
    await db().$executeRawUnsafe(`UPDATE payee_profiles SET tax_profile_id = NULL WHERE id = '${PAYEE_OUT_ID}'`)
    await seedExpense({ id: '00000000-0000-4000-8000-0000000034c8', payeeId: PAYEE_OUT_ID, grossSatang: 500_000 })

    const { batch, warning } = await payout.createPayoutBatch(ctx, {
      side: 'outsource',
      cutoffDate: CUTOFF,
      name: null,
    })

    // รอบยังถูกสร้างจริง (เตือน ไม่บล็อก) และคิดด้วยอัตราของแผน 3% เท่าเดิม
    expect(batch.status).toBe('checking')
    expect(batch.whtSatang).toBe(15_000)
    expect(batch.items[0]?.taxProfileId).toBeNull()

    expect(warning?.code).toBe('WHT_RATE_FALLBACK_TO_PLAN')
    expect(warning?.message).toContain('สมชาย นอกบ้าน')
  })

  it('Payee ที่มี Tax Profile ครบ ⇒ ไม่มี warning', async () => {
    await seedExpense({ id: '00000000-0000-4000-8000-0000000034c9', payeeId: PAYEE_OUT_ID, grossSatang: 500_000 })
    const { warning } = await payout.createPayoutBatch(ctx, { side: 'outsource', cutoffDate: CUTOFF, name: null })
    expect(warning).toBeUndefined()
  })

  it('รายการที่ถูกดึงเข้ารอบแล้วไม่ถูกดึงซ้ำในรอบถัดไป', async () => {
    await seedExpense({ id: '00000000-0000-4000-8000-0000000034c3', payeeId: PAYEE_OUT_ID, grossSatang: 500_000 })
    await payout.createPayoutBatch(ctx, { side: 'outsource', cutoffDate: CUTOFF, name: null })

    await expectCode(
      () => payout.createPayoutBatch(ctx, { side: 'outsource', cutoffDate: CUTOFF, name: null }),
      'NO_ITEMS_TO_PAY',
    )
  })

  it('รายการหลังวันตัดรอบไม่เข้ารอบนี้', async () => {
    await seedExpense({
      id: '00000000-0000-4000-8000-0000000034c4',
      payeeId: PAYEE_OUT_ID,
      grossSatang: 500_000,
      expenseDate: '2026-09-05',
    })
    await expectCode(
      () => payout.createPayoutBatch(ctx, { side: 'outsource', cutoffDate: CUTOFF, name: null }),
      'NO_ITEMS_TO_PAY',
    )
  })

  it('รายการที่ยังไม่อนุมัติไม่เข้ารอบ', async () => {
    await seedExpense({
      id: '00000000-0000-4000-8000-0000000034c5',
      payeeId: PAYEE_OUT_ID,
      grossSatang: 500_000,
      status: 'pending_approval',
    })
    await expectCode(
      () => payout.createPayoutBatch(ctx, { side: 'outsource', cutoffDate: CUTOFF, name: null }),
      'NO_ITEMS_TO_PAY',
    )
  })

  it('เงินทดรองเข้ารอบจ่ายได้ และไม่ถูกหัก WHT (A4 — ไม่ใช่เงินได้)', async () => {
    await seedAdvance({ id: '00000000-0000-4000-8000-0000000034c6', payeeId: PAYEE_OUT_ID, satang: 200_000 })

    const { batch } = await payout.createPayoutBatch(ctx, { side: 'outsource', cutoffDate: CUTOFF, name: null })

    expect(batch.itemCount).toBe(1)
    expect(batch.items[0]?.source).toBe('advance')
    expect(batch.whtSatang).toBe(0)
    expect(batch.netSatang).toBe(200_000)

    const advance = await db().advance.findFirst({
      where: { id: '00000000-0000-4000-8000-0000000034c6' },
      select: { payoutBatchItemId: true },
    })
    expect(advance?.payoutBatchItemId).toBe(batch.items[0]?.id)
  })

  it('สองรอบสร้างพร้อมกัน — รายการเดียวกันเข้าได้รอบเดียว', async () => {
    await seedExpense({ id: '00000000-0000-4000-8000-0000000034c7', payeeId: PAYEE_OUT_ID, grossSatang: 500_000 })

    const results = await Promise.allSettled([
      payout.createPayoutBatch(ctx, { side: 'outsource', cutoffDate: CUTOFF, name: null }),
      payout.createPayoutBatch(ctx, { side: 'outsource', cutoffDate: CUTOFF, name: null }),
    ])
    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1)

    const items = await db().payoutBatchItem.findMany({ where: { organizationId: ORG_ID }, select: { id: true } })
    expect(items).toHaveLength(1)
  })
})

suite('ยามก่อนสร้างรอบ (`17` §10/§11 · `18` §10)', () => {
  it('payee ยังไม่ยืนยัน → UNVERIFIED_PAYEE_IN_PAYOUT และไม่มี batch ค้าง', async () => {
    await db().$executeRawUnsafe(`UPDATE payee_profiles SET is_verified = false WHERE id = '${PAYEE_OUT_ID}'`)
    await seedExpense({ id: '00000000-0000-4000-8000-0000000034d1', payeeId: PAYEE_OUT_ID, grossSatang: 500_000 })

    await expectCode(
      () => payout.createPayoutBatch(ctx, { side: 'outsource', cutoffDate: CUTOFF, name: null }),
      'UNVERIFIED_PAYEE_IN_PAYOUT',
    )
    const batches = await db().payoutBatch.findMany({ where: { organizationId: ORG_ID }, select: { id: true } })
    expect(batches).toHaveLength(0)
  })

  it('รอบ inhouse ไม่ดึงรายการฝั่ง outsource มาปน (`17` §6.1)', async () => {
    await seedExpense({ id: '00000000-0000-4000-8000-0000000034d2', payeeId: PAYEE_OUT_ID, grossSatang: 500_000 })
    await seedExpense({ id: '00000000-0000-4000-8000-0000000034d3', payeeId: PAYEE_IN_ID, grossSatang: 300_000 })

    const { batch } = await payout.createPayoutBatch(ctx, { side: 'inhouse', cutoffDate: CUTOFF, name: null })
    expect(batch.itemCount).toBe(1)
    expect(batch.items[0]?.payeeId).toBe(PAYEE_IN_ID)
    expect(batch.side).toBe('inhouse')
  })
})

suite('ไฟล์โอนเงิน + idempotency (`17` §6.3/§16 · `13` §6.8)', () => {
  async function batchWithOneItem(): Promise<string> {
    await seedExpense({ id: '00000000-0000-4000-8000-0000000034e1', payeeId: PAYEE_OUT_ID, grossSatang: 500_000 })
    const { batch } = await payout.createPayoutBatch(ctx, { side: 'outsource', cutoffDate: CUTOFF, name: null })
    return batch.id
  }

  it('format ที่ยังไม่ผ่านทดสอบ → BANK_FILE_NOT_TESTED (gate ของ 1.10)', async () => {
    const batchId = await batchWithOneItem()
    await expectCode(
      () => payout.generatePaymentFile(ctx, batchId, { ...generateInput, bankFileFormatId: FORMAT_PENDING_ID }),
      'BANK_FILE_NOT_TESTED',
    )
  })

  it('สร้างครั้งแรก: ได้ idempotency key + สถานะ file_generated + ไฟล์มีเนื้อจริง', async () => {
    const batchId = await batchWithOneItem()
    const outcome = await payout.generatePaymentFile(ctx, batchId, generateInput)

    expect(outcome.warning).toBeUndefined()
    expect(outcome.result.generated).toBe(true)
    expect(outcome.result.batch.status).toBe('file_generated')
    expect(outcome.result.batch.idempotencyKey).toMatch(/^PB-OUT-\d{8}-[0-9A-Z]+$/)
    expect(outcome.result.rowCount).toBe(1)

    const file = await payout.readPaymentFile(finance, batchId)
    const text = new TextDecoder().decode(file.bytes)
    // รหัสธนาคารกสิกร 004 · เลขบัญชี · ยอดโอน = net (4,850.00 หลังหัก WHT)
    expect(text).toContain('004,1234567890,')
    expect(text).toContain('4850.00')
    expect(file.fileName).toBe(`${outcome.result.batch.idempotencyKey}-v1.csv`)
  })

  it('ยิงซ้ำโดยไม่ยืนยัน → เตือน DUPLICATE_PAYMENT_FILE และยังไม่สร้างไฟล์ใหม่', async () => {
    const batchId = await batchWithOneItem()
    const first = await payout.generatePaymentFile(ctx, batchId, generateInput)

    const second = await payout.generatePaymentFile(ctx, batchId, generateInput)
    expect(second.result.generated).toBe(false)
    expect(second.warning?.code).toBe('DUPLICATE_PAYMENT_FILE')
    expect(second.warning?.message).toContain('สร้างไฟล์โอนไปแล้วเมื่อ')
    expect(second.result.previousGeneratedAt).toBe(first.result.batch.paymentFileGeneratedAt)
    expect(storage.size).toBe(1)
  })

  it('ยืนยันแล้วสร้างซ้ำได้ — key เดิม ไฟล์เวอร์ชันใหม่ ไม่ทับของเดิม', async () => {
    const batchId = await batchWithOneItem()
    const first = await payout.generatePaymentFile(ctx, batchId, generateInput)

    const again = await payout.generatePaymentFile(ctx, batchId, { ...generateInput, confirmDuplicate: true })
    expect(again.result.generated).toBe(true)
    expect(again.result.batch.idempotencyKey).toBe(first.result.batch.idempotencyKey)
    expect(again.result.fileName).toBe(`${first.result.batch.idempotencyKey}-v2.csv`)
    expect(again.warning?.code).toBe('DUPLICATE_PAYMENT_FILE')
    // ไฟล์เดิมยังอยู่ครบ (ห้าม overwrite — Rule 04)
    expect(storage.size).toBe(2)
  })

  it('audit ของการสร้างไฟล์โอนเก็บ key + hash + เหตุผล (`17` §13)', async () => {
    const batchId = await batchWithOneItem()
    const outcome = await payout.generatePaymentFile(ctx, batchId, generateInput)

    const log = await db().auditLog.findFirst({
      where: { organizationId: ORG_ID, targetType: 'payout_batches', targetId: batchId, action: 'export' },
      select: { afterData: true, reason: true },
    })
    const after = log?.afterData as Record<string, unknown>
    expect(after.idempotency_key).toBe(outcome.result.batch.idempotencyKey)
    expect(after.payment_file_sha256).toBe(outcome.result.fileHash)
    expect(log?.reason).toBe(generateInput.reason)
  })

  it('ยังไม่เคยสร้างไฟล์ → ดาวน์โหลดไม่ได้ (PAYMENT_FILE_NOT_GENERATED)', async () => {
    const batchId = await batchWithOneItem()
    await expectCode(() => payout.readPaymentFile(finance, batchId), 'PAYMENT_FILE_NOT_GENERATED')
  })
})

suite('ยืนยันจ่ายสำเร็จ (`17` §9 · `23` §6.6)', () => {
  async function generatedBatch(): Promise<string> {
    await seedExpense({ id: '00000000-0000-4000-8000-0000000034f1', payeeId: PAYEE_OUT_ID, grossSatang: 500_000 })
    const { batch } = await payout.createPayoutBatch(ctx, { side: 'outsource', cutoffDate: CUTOFF, name: null })
    await payout.generatePaymentFile(ctx, batch.id, generateInput)
    return batch.id
  }

  it('ข้ามขั้นไม่ได้ — ยังไม่สร้างไฟล์โอนก็ยืนยันไม่ได้', async () => {
    await seedExpense({ id: '00000000-0000-4000-8000-0000000034f2', payeeId: PAYEE_OUT_ID, grossSatang: 500_000 })
    const { batch } = await payout.createPayoutBatch(ctx, { side: 'outsource', cutoffDate: CUTOFF, name: null })

    await expectCode(
      () => payout.completePayoutBatch(ctx, batch.id, { reason: 'ยืนยันจ่ายเงินเรียบร้อย' }),
      'PAYOUT_BATCH_INVALID_STATUS',
    )
  })

  it('file_generated → completed พร้อม audit ที่ระบุผู้ยืนยัน', async () => {
    const batchId = await generatedBatch()
    const done = await payout.completePayoutBatch(ctx, batchId, { reason: 'ธนาคารตัดโอนครบทุกรายการแล้ว' })
    expect(done.status).toBe('completed')

    const log = await db().auditLog.findFirst({
      where: { organizationId: ORG_ID, targetId: batchId, action: 'confirm' },
      select: { actorId: true, reason: true },
    })
    expect(log?.actorId).toBe(FINANCE_ID)
    expect(log?.reason).toBe('ธนาคารตัดโอนครบทุกรายการแล้ว')
  })

  it('sync จากไฟล์ 35 (Phase 4.2) — รันซ้ำได้ ไม่เปลี่ยนซ้ำ (idempotent)', async () => {
    const batchId = await generatedBatch()
    const input = {
      organizationId: ORG_ID,
      batchId,
      bankTransactionId: '00000000-0000-4000-8000-0000000034f9',
      actorId: null,
      actorRole: 'system',
    }

    expect(await payout.syncPayoutBatchCompleted(input)).toBe('completed')
    expect(await payout.syncPayoutBatchCompleted(input)).toBe('completed')

    const logs = await db().auditLog.findMany({
      where: { organizationId: ORG_ID, targetId: batchId, action: 'confirm' },
      select: { id: true },
    })
    expect(logs).toHaveLength(1)
  })
})
