import { PrismaPg } from '@prisma/adapter-pg'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import type { SessionUser } from '@/lib/auth/types'
import { PrismaClient } from '@/lib/generated/prisma/client'
import type { PayoutTxClient } from '@/lib/payout/queries'
import { markAdvancePaidOut } from '@/tests/helpers/advance-paid-out'

/**
 * เทสต์ระดับ DB — มติ PO 05/10/2569 (UAT U30 · BUG-109 · A6): ปิดยอดคืนเงินทดรอง
 *  · เคลียร์ (ค่าเริ่มต้นหักกลบ) → รอบจ่ายหักหลัง WHT → ยอดโอนลด · gross/WHT/net ไม่เปลี่ยน · ไฟล์โอนมีบรรทัดหัก
 *  · ยอดสุทธิไม่พอ → หักเท่าที่มี ยกยอดไปรอบถัดไป (฿550 / ฿300 → หัก ฿300 ยก ฿250)
 *  · กลับรายการ (รอบจ่ายถูกยกเลิก/รายการถูกตัดออก) → ยอดกลับเป็นค้าง ไม่หาย ไม่ซ้ำ
 *  · เปลี่ยนเป็นรับคืนแยกก่อนสร้างรอบ → รอบไม่หัก · รับคืนแยกแล้วไม่ถูกหักซ้ำ/รับซ้ำไม่ได้
 *  · idempotency key ของรอบจ่ายเดิมยังผ่าน · ยาม DB (trigger) กันยอดสะสมเกิน/แก้แถว
 *  · สิทธิ์: ไม่ใช่การเงิน → ไม่พบรายการ (ไม่ leak)
 *
 * ⚠️ ต้องตั้ง `DATABASE_URL = TEST_DATABASE_URL` **ก่อน** import service (กับดัก 2026-08-14)
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
vi.mock('@/lib/uploads/storage', async () => (await import('@/tests/helpers/fake-uploads')).fakeStorageModule())
vi.mock('@/lib/uploads/verify', async () => (await import('@/tests/helpers/fake-uploads')).fakeVerifyModule())

const url = process.env.TEST_DATABASE_URL

function assertLocalTestDatabase(connectionString: string): void {
  const parsed = new URL(connectionString)
  const isLocal = ['localhost', '127.0.0.1', '::1', 'postgres'].includes(parsed.hostname)
  if (!isLocal || !parsed.pathname.includes('test')) {
    throw new Error(`TEST_DATABASE_URL ต้องเป็น DB ทดสอบบนเครื่อง/CI เท่านั้น (host=${parsed.hostname}) — Rule 07`)
  }
}

const suite = url ? describe : describe.skip
if (!url) console.warn('[advance-return.db.test] ข้ามเทสต์ระดับ DB — ไม่มี TEST_DATABASE_URL')

const ORG_ID = '00000000-0000-4000-8000-000000e30000'
const ROLE_FINANCE = '00000000-0000-4000-8000-000000e30001'
const ROLE_AGENT = '00000000-0000-4000-8000-000000e30002'
const FINANCE_ID = '00000000-0000-4000-8000-000000e30003'
const AGENT_ID = '00000000-0000-4000-8000-000000e30004'
const TEAM_ID = '00000000-0000-4000-8000-000000e30005'
const TAX_PROFILE_ID = '00000000-0000-4000-8000-000000e30006'
const PLAN_ID = '00000000-0000-4000-8000-000000e30007'
const BANK_ACCOUNT_ID = '00000000-0000-4000-8000-000000e30008'
const FORMAT_ID = '00000000-0000-4000-8000-000000e30009'
const PAYEE_ID = '00000000-0000-4000-8000-000000e3000a'
const ADV_ID = '00000000-0000-4000-8000-000000e300a1'
const ADV2_ID = '00000000-0000-4000-8000-000000e300a2'

let client: PrismaClient | null = null
let advances: typeof import('@/lib/advances/queries')
let payout: typeof import('@/lib/payout/queries')

function db(): PrismaClient {
  if (!url) throw new Error('ไม่มี TEST_DATABASE_URL')
  if (!client) {
    assertLocalTestDatabase(url)
    client = new PrismaClient({ adapter: new PrismaPg({ connectionString: url }) })
  }
  return client
}

const meta = { ipAddress: null, userAgent: null }

function userOf(id: string, capabilities: SessionUser['capabilities']): SessionUser {
  return {
    id,
    organizationId: ORG_ID,
    supabaseUid: `uid-${id}`,
    email: `${id}@test.local`,
    fullName: 'การเงิน U30',
    status: 'active',
    roleId: ROLE_FINANCE,
    roleName: 'การเงิน',
    roleGroup: 'system',
    isSuperadmin: false,
    teamId: null,
    companyId: null,
    capabilities,
    scope: { kind: 'global', teamIds: [], companyId: null, userId: id },
    loginAt: new Date().toISOString(),
  }
}

const finance = userOf(FINANCE_ID, {
  manage_payout_batch: 'manage',
  generate_payment_file: 'manage',
  approve_advance: 'manage',
})
const ctx = { actor: finance, meta }
/** เจ้าของเงินทดรอง (ผู้ขอ) — ไม่มีสิทธิ์การเงิน */
const agentCtx = { actor: { ...userOf(AGENT_ID, { request_advance: 'manage' }), roleId: ROLE_AGENT }, meta }

function codeOf(error: unknown): string {
  return (error as { code?: string }).code ?? String(error)
}

async function expectCode(run: () => Promise<unknown>, code: string): Promise<void> {
  await expect(run()).rejects.toSatisfy((error: unknown) => codeOf(error) === code, `ต้องได้ error code ${code}`)
}

const CUTOFF = new Date(Date.UTC(2026, 7, 31))
let expenseSeq = 0

async function seedExpense(grossSatang: number): Promise<string> {
  expenseSeq += 1
  const id = `00000000-0000-4e30-8000-${String(expenseSeq).padStart(12, '0')}`
  await db().$executeRawUnsafe(`
    INSERT INTO expenses (id, organization_id, payee_id, expense_type, gross_satang, expense_date,
                          status, comp_plan_id, comp_plan_version, approval_step_current, approval_step_total, created_by)
    VALUES ('${id}', '${ORG_ID}', '${PAYEE_ID}', 'commission', ${grossSatang},
            '2026-08-20', 'approved', '${PLAN_ID}', 1, 2, 2, '${FINANCE_ID}')
  `)
  return id
}

/** เงินทดรองที่อนุมัติแล้ว + ถูกจ่ายออกในรอบก่อนแล้ว (ไม่ให้ถูกดึงเข้ารอบใหม่เป็นรายการจ่าย) */
async function seedApprovedAdvance(id: string, approvedSatang: number): Promise<void> {
  await db().$executeRawUnsafe(`
    INSERT INTO advances (id, organization_id, payee_id, requested_satang, approved_satang, purpose,
                          due_clear_date, status, approved_at, approved_by, created_by)
    VALUES ('${id}', '${ORG_ID}', '${PAYEE_ID}', ${approvedSatang}, ${approvedSatang}, 'ค่าเดินทางล่วงหน้า U30',
            '2026-12-31', 'approved', '2026-08-20T03:00:00Z', '${FINANCE_ID}', '${AGENT_ID}')
  `)
  // มติ PO U83 — เคลียร์ได้เฉพาะเงินทดรองที่จ่ายจริงแล้ว (เคยอยู่ในรอบจ่าย completed)
  await markAdvancePaidOut(db(), { organizationId: ORG_ID, advanceId: id, actorId: FINANCE_ID })
}

/** ADV1 ของ UAT: อนุมัติ ฿3,000 ใช้ ฿2,450 → คืน ฿550 */
async function settleAdv1(returnMethod?: 'payout_offset' | 'separate') {
  await seedApprovedAdvance(ADV_ID, 300_000)
  return advances.settleAdvance(ctx, ADV_ID, {
    usedSatang: 245_000,
    receiptFileUrl: null,
    note: null,
    ...(returnMethod === undefined ? {} : { returnMethod }),
  })
}

async function getAdvance(id: string = ADV_ID) {
  const list = await advances.listAdvances(finance, { status: 'all' })
  const found = list.find((row) => row.id === id)
  if (found === undefined) throw new Error(`ไม่พบ ${id}`)
  return found
}

function createBatch() {
  return payout.createPayoutBatch(ctx, { side: 'outsource', cutoffDate: CUTOFF, name: null })
}

async function reset(): Promise<void> {
  const tx = db()
  storage.clear()
  await tx.$executeRawUnsafe(`ALTER TABLE wht_certificates DISABLE TRIGGER trg_wht_certificates_no_delete`)
  try {
    await tx.$executeRawUnsafe(`DELETE FROM wht_certificates WHERE organization_id = '${ORG_ID}'`)
  } finally {
    await tx.$executeRawUnsafe(`ALTER TABLE wht_certificates ENABLE TRIGGER trg_wht_certificates_no_delete`)
  }
  await tx.$executeRawUnsafe(`DELETE FROM advance_returns WHERE organization_id = '${ORG_ID}'`)
  await tx.$executeRawUnsafe(`DELETE FROM expense_records WHERE organization_id = '${ORG_ID}'`)
  await tx.$executeRawUnsafe(`DELETE FROM exceptions WHERE organization_id = '${ORG_ID}'`)
  await tx.$executeRawUnsafe(`DELETE FROM payout_batch_items WHERE organization_id = '${ORG_ID}'`)
  await tx.$executeRawUnsafe(`DELETE FROM payout_batches WHERE organization_id = '${ORG_ID}'`)
  await tx.$executeRawUnsafe(`DELETE FROM expenses WHERE organization_id = '${ORG_ID}'`)
  await tx.$executeRawUnsafe(`DELETE FROM advances WHERE organization_id = '${ORG_ID}'`)
}

beforeAll(async () => {
  if (!url) return
  process.env.DATABASE_URL = url
  advances = await import('@/lib/advances/queries')
  payout = await import('@/lib/payout/queries')

  const tx = db()
  await tx.$executeRawUnsafe(`
    INSERT INTO organizations (id, name, tax_id, address)
    VALUES ('${ORG_ID}', 'U30Test', '9999999993030', 'ที่อยู่ทดสอบ U30') ON CONFLICT (id) DO NOTHING
  `)
  await tx.$executeRawUnsafe(`
    INSERT INTO roles (id, organization_id, name, role_group, is_seed) VALUES
      ('${ROLE_FINANCE}', '${ORG_ID}', 'การเงิน U30', 'system', false),
      ('${ROLE_AGENT}', '${ORG_ID}', 'พนักงานติดตามทรัพย์ U30', 'outsource', false)
    ON CONFLICT (id) DO NOTHING
  `)
  await tx.$executeRawUnsafe(`
    INSERT INTO users (id, organization_id, role_id, email, full_name, phone, status) VALUES
      ('${FINANCE_ID}', '${ORG_ID}', '${ROLE_FINANCE}', 'finance-u30@test.local', 'การเงิน U30', NULL, 'active'),
      ('${AGENT_ID}', '${ORG_ID}', '${ROLE_AGENT}', 'agent-u30@test.local', 'สมชาย คืนเงิน', '0812345678', 'active')
    ON CONFLICT (id) DO NOTHING
  `)
  await tx.$executeRawUnsafe(`
    INSERT INTO teams (id, organization_id, name, side, provinces, status, created_by)
    VALUES ('${TEAM_ID}', '${ORG_ID}', 'ทีมนอก U30', 'outsource', ARRAY['ลำพูน'], 'active', '${FINANCE_ID}')
    ON CONFLICT (id) DO NOTHING
  `)
  await tx.$executeRawUnsafe(`UPDATE users SET team_id = '${TEAM_ID}' WHERE id = '${AGENT_ID}'`)
  await tx.$executeRawUnsafe(`
    INSERT INTO tax_profiles (id, organization_id, name, wht_pct, wht_basis, wht_min_threshold_satang, created_by)
    VALUES ('${TAX_PROFILE_ID}', '${ORG_ID}', 'ค่าจ้างทำของ 3% (U30)', 3.00, 'before_vat', 100000, '${FINANCE_ID}')
    ON CONFLICT (id) DO NOTHING
  `)
  await tx.$executeRawUnsafe(`
    INSERT INTO compensation_plans (id, organization_id, name, side, fuel_mode, fuel_rate_per_km_satang,
                                    allowance_satang, commission_satang, wht_pct, version, effective_from, created_by)
    VALUES ('${PLAN_ID}', '${ORG_ID}', 'แผน U30', 'outsource', 'PER_KM', 500, 30000, 150000, 3.00, 1, '2026-01-01', '${FINANCE_ID}')
    ON CONFLICT (id) DO NOTHING
  `)
  await tx.$executeRawUnsafe(`
    INSERT INTO payee_profiles (id, organization_id, user_id, payee_type, tax_profile_id, bank_name,
                                account_name, account_number, national_id, is_verified, created_by)
    VALUES ('${PAYEE_ID}', '${ORG_ID}', '${AGENT_ID}', 'individual', '${TAX_PROFILE_ID}', 'ธนาคารกสิกรไทย',
            'สมชาย คืนเงิน', '1234567890', '1234567890123', true, '${FINANCE_ID}')
    ON CONFLICT (id) DO NOTHING
  `)
  await tx.$executeRawUnsafe(`
    INSERT INTO bank_accounts (id, organization_id, bank_name, account_name, account_number, usage, created_by)
    VALUES ('${BANK_ACCOUNT_ID}', '${ORG_ID}', 'ธนาคารกรุงเทพ', 'บริษัท ทดสอบ U30 จำกัด', '1112223330', 'pay', '${FINANCE_ID}')
    ON CONFLICT (id) DO NOTHING
  `)
  await tx.$executeRawUnsafe(`
    INSERT INTO bank_file_formats (id, organization_id, bank_name, file_type, encoding, column_mapping, test_status, created_by)
    VALUES ('${FORMAT_ID}', '${ORG_ID}', 'ธนาคารกรุงเทพ', 'CSV', 'UTF-8',
            'receiving_account_no,amount,reference_no,remark', 'passed', '${FINANCE_ID}')
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

suite('เคลียร์ยอด → หักกลบในรอบจ่าย (หลัง WHT)', () => {
  it('ค่าเริ่มต้น = หักกลบ · ยอดค้าง ฿550', async () => {
    const settled = await settleAdv1()
    expect(settled.returnSatang).toBe(55_000)
    expect(settled.returnMethod).toBe('payout_offset')
    expect(settled.returnOutstandingSatang).toBe(55_000)
    expect(settled.returnState).toBe('pending_offset')
  })

  it('ใช้พอดี/ใช้เกิน → ไม่มีวิธีคืน (ไม่มีอะไรต้องปิด)', async () => {
    await seedApprovedAdvance(ADV_ID, 300_000)
    const settled = await advances.settleAdvance(ctx, ADV_ID, {
      usedSatang: 300_000,
      returnMethod: 'separate',
      receiptFileUrl: null,
      note: null,
    })
    expect(settled.returnMethod).toBeNull()
    expect(settled.returnState).toBe('none')
  })

  it('รอบจ่าย: gross/WHT/net ไม่เปลี่ยน · หัก ฿550 · ยอดโอน ฿4,300 · ปิดยอดคืน · ไฟล์โอนมีบรรทัดหัก', async () => {
    await settleAdv1()
    await seedExpense(500_000)

    const { batch } = await createBatch()
    // WHT 3% ของ ฿5,000 = ฿150 — เท่ากับรอบที่ไม่มีการหัก (ฐาน WHT ไม่กระทบ)
    expect(batch.grossSatang).toBe(500_000)
    expect(batch.whtSatang).toBe(15_000)
    expect(batch.netSatang).toBe(485_000)
    expect(batch.advanceOffsetSatang).toBe(55_000)
    expect(batch.transferSatang).toBe(430_000)
    expect(batch.items[0]?.whtSatang).toBe(15_000)
    expect(batch.items[0]?.advanceOffsetSatang).toBe(55_000)
    expect(batch.items[0]?.advanceOffsets.map((offset) => offset.advanceRef)).toEqual(['ADV-00000000'])

    const adv = await getAdvance()
    expect(adv.returnOutstandingSatang).toBe(0)
    expect(adv.returnState).toBe('closed')
    expect(adv.returns[0]?.channel).toBe('payout_offset')
    expect(adv.returns[0]?.payoutBatchId).toBe(batch.id)

    const { result } = await payout.generatePaymentFile(ctx, batch.id, {
      bankAccountId: BANK_ACCOUNT_ID,
      bankFileFormatId: FORMAT_ID,
      confirmDuplicate: false,
      reason: 'สร้างไฟล์โอน U30',
    })
    const text = new TextDecoder().decode(storage.values().next().value)
    expect(result.rowCount).toBe(1)
    expect(text).toContain('1234567890,4300.00,')
    expect(text).toContain('หักคืนเงินทดรอง ADV-00000000')

    // idempotency ของรอบเดิมยังเหมือนเดิม — ยิงซ้ำไม่ยืนยัน = เตือน DUPLICATE_PAYMENT_FILE + key เดิม
    const again = await payout.generatePaymentFile(ctx, batch.id, {
      bankAccountId: BANK_ACCOUNT_ID,
      bankFileFormatId: FORMAT_ID,
      confirmDuplicate: false,
      reason: 'สร้างซ้ำ',
    })
    expect(again.warning?.code).toBe('DUPLICATE_PAYMENT_FILE')
    expect(again.result.generated).toBe(false)
    expect(again.result.batch.idempotencyKey).toBe(result.batch.idempotencyKey)
  })

  it('รอบถัดไปไม่หักซ้ำเมื่อคืนครบแล้ว', async () => {
    await settleAdv1()
    await seedExpense(500_000)
    await createBatch()
    await seedExpense(200_000)
    const { batch } = await createBatch()
    expect(batch.advanceOffsetSatang).toBe(0)
    expect(batch.transferSatang).toBe(batch.netSatang)
  })

  it('ยอดสุทธิไม่พอ: คืน ฿550 รอบได้ ฿300 → หัก ฿300 โอน ฿0 ยก ฿250 → รอบถัดไปหัก ฿250', async () => {
    await settleAdv1()
    await seedExpense(30_000) // ต่ำกว่าเกณฑ์ ฿1,000 ⇒ ไม่หัก WHT ⇒ สุทธิ ฿300

    const first = await createBatch()
    expect(first.batch.netSatang).toBe(30_000)
    expect(first.batch.advanceOffsetSatang).toBe(30_000)
    expect(first.batch.transferSatang).toBe(0)
    expect((await getAdvance()).returnOutstandingSatang).toBe(25_000)

    await seedExpense(100_000)
    const second = await createBatch()
    expect(second.batch.advanceOffsetSatang).toBe(25_000)
    expect(second.batch.transferSatang).toBe(second.batch.netSatang - 25_000)
    const adv = await getAdvance()
    expect(adv.returnOutstandingSatang).toBe(0)
    expect(adv.returns.filter((entry) => entry.reversedAt === null)).toHaveLength(2)
  })

  it('หลายเงินทดรองของคนเดียว: หักใบที่เคลียร์ก่อนก่อน', async () => {
    await settleAdv1()
    await seedApprovedAdvance(ADV2_ID, 100_000)
    await advances.settleAdvance(ctx, ADV2_ID, { usedSatang: 60_000, receiptFileUrl: null, note: null })
    await seedExpense(60_000) // ไม่ถึงเกณฑ์ ⇒ สุทธิ ฿600

    const { batch } = await createBatch()
    expect(batch.advanceOffsetSatang).toBe(60_000)
    expect((await getAdvance(ADV_ID)).returnOutstandingSatang).toBe(0)
    expect((await getAdvance(ADV2_ID)).returnOutstandingSatang).toBe(35_000)
  })
})

suite('กลับรายการ (รอบจ่ายถูกยกเลิก/รายการถูกตัดออก)', () => {
  it('ยอดหักกลับเป็นค้าง ไม่หาย · เรียกซ้ำไม่กลับซ้ำ · รอบใหม่หักได้ครั้งเดียว', async () => {
    await settleAdv1()
    await seedExpense(500_000)
    const { batch } = await createBatch()
    expect((await getAdvance()).returnOutstandingSatang).toBe(0)

    const itemIds = batch.items.map((entry) => entry.id)
    const release = (reason: string) =>
      db().$transaction((tx) =>
        // client ของเทสต์เป็นอินสแตนซ์แยก (ชนิดเดียวกันแต่ generic ต่าง) — ใช้แทน tx ของแอปได้
        payout.releasePayoutAdvanceOffsets(tx as unknown as PayoutTxClient, {
          organizationId: ORG_ID,
          payoutBatchItemIds: itemIds,
          actorId: FINANCE_ID,
          actorRole: 'การเงิน',
          reason,
          meta,
        }),
      )
    expect(await release('ยกเลิกรอบจ่ายเพราะสร้างผิดวันตัดรอบ')).toBe(1)
    expect(await release('เรียกซ้ำ')).toBe(0)

    const adv = await getAdvance()
    expect(adv.returnOutstandingSatang).toBe(55_000)
    expect(adv.returns[0]?.reversalReason).toBe('ยกเลิกรอบจ่ายเพราะสร้างผิดวันตัดรอบ')

    const audit = await db().auditLog.findFirst({
      where: { organizationId: ORG_ID, targetType: 'advance_returns', action: 'status_change' },
    })
    expect(audit?.reason).toBe('ยกเลิกรอบจ่ายเพราะสร้างผิดวันตัดรอบ')

    await seedExpense(200_000)
    const next = await createBatch()
    expect(next.batch.advanceOffsetSatang).toBe(55_000)
    expect((await getAdvance()).returnOutstandingSatang).toBe(0)
  })
})

suite('รับคืนแยก', () => {
  const evidence = `advances/${ADV_ID}/returns/11111111-1111-4111-8111-111111111111.pdf`

  it('เปลี่ยนเป็นรับคืนแยกก่อนสร้างรอบ → รอบไม่หัก · บันทึกรับคืนแล้วปิดยอด · ไม่ถูกหัก/รับซ้ำ', async () => {
    await settleAdv1()
    const changed = await advances.changeAdvanceReturnMethod(ctx, ADV_ID, {
      returnMethod: 'separate',
      reason: 'ผู้รับขอคืนเป็นเงินสด',
    })
    expect(changed.returnState).toBe('pending_separate')
    const audit = await db().auditLog.findFirst({
      where: { organizationId: ORG_ID, targetType: 'advances', targetId: ADV_ID, action: 'update' },
    })
    expect(audit?.reason).toBe('ผู้รับขอคืนเป็นเงินสด')

    await seedExpense(500_000)
    const first = await createBatch()
    expect(first.batch.advanceOffsetSatang).toBe(0)

    await expectCode(
      () =>
        advances.recordAdvanceSeparateReturn(ctx, ADV_ID, {
          channel: 'cash',
          amountSatang: 55_001,
          receivedDate: new Date(Date.UTC(2026, 9, 5)),
          evidenceFilePath: evidence,
          note: null,
        }),
      'ADVANCE_RETURN_EXCEEDS_OUTSTANDING',
    )

    const closed = await advances.recordAdvanceSeparateReturn(ctx, ADV_ID, {
      channel: 'cash',
      amountSatang: 55_000,
      receivedDate: new Date(Date.UTC(2026, 9, 5)),
      evidenceFilePath: evidence,
      note: 'รับเงินสดที่สำนักงาน',
    })
    expect(closed.returnOutstandingSatang).toBe(0)
    expect(closed.returnState).toBe('closed')
    expect(closed.returns[0]?.channel).toBe('cash')
    expect(closed.returns[0]?.receivedDate).toBe('2026-10-05')

    await expectCode(
      () =>
        advances.recordAdvanceSeparateReturn(ctx, ADV_ID, {
          channel: 'cash',
          amountSatang: 1,
          receivedDate: new Date(Date.UTC(2026, 9, 5)),
          evidenceFilePath: evidence,
          note: null,
        }),
      'ADVANCE_INVALID_STATUS',
    )
    // กลับไปเป็นหักกลบไม่ได้แล้ว (ไม่มียอดค้าง)
    await expectCode(
      () => advances.changeAdvanceReturnMethod(ctx, ADV_ID, { returnMethod: 'payout_offset', reason: 'ลองเปลี่ยนกลับ' }),
      'ADVANCE_INVALID_STATUS',
    )

    await seedExpense(100_000)
    expect((await createBatch()).batch.advanceOffsetSatang).toBe(0)
  })

  it('รับคืนแยกขณะยังเป็นหักกลบ → ADVANCE_INVALID_STATUS', async () => {
    await settleAdv1()
    await expectCode(
      () =>
        advances.recordAdvanceSeparateReturn(ctx, ADV_ID, {
          channel: 'bank_transfer',
          amountSatang: 55_000,
          receivedDate: new Date(Date.UTC(2026, 9, 5)),
          evidenceFilePath: evidence,
          note: null,
        }),
      'ADVANCE_INVALID_STATUS',
    )
  })

  it('ยอดถูกหักในรอบจ่ายครบแล้ว → เปลี่ยนวิธีคืนไม่ได้ (เปลี่ยนได้เฉพาะก่อนรอบที่จะหักถูกสร้าง)', async () => {
    await settleAdv1()
    await seedExpense(500_000)
    await createBatch()
    await expectCode(
      () => advances.changeAdvanceReturnMethod(ctx, ADV_ID, { returnMethod: 'separate', reason: 'เปลี่ยนหลังสร้างรอบ' }),
      'ADVANCE_INVALID_STATUS',
    )
  })

  it('ไม่ใช่การเงิน (เจ้าของเงินทดรอง) → ADVANCE_NOT_FOUND ทั้งสองทาง', async () => {
    await settleAdv1()
    await expectCode(
      () => advances.changeAdvanceReturnMethod(agentCtx, ADV_ID, { returnMethod: 'separate', reason: 'ขอเปลี่ยนเอง' }),
      'ADVANCE_NOT_FOUND',
    )
    await expectCode(
      () =>
        advances.recordAdvanceSeparateReturn(agentCtx, ADV_ID, {
          channel: 'cash',
          amountSatang: 55_000,
          receivedDate: new Date(Date.UTC(2026, 9, 5)),
          evidenceFilePath: evidence,
          note: null,
        }),
      'ADVANCE_NOT_FOUND',
    )
  })
})

suite('ยามระดับ DB (trigger/CHECK)', () => {
  it('ยอดสะสมเกินยอดคืน / แก้ยอดแถวเดิม / เงินทดรองยังไม่เคลียร์ → ถูกปฏิเสธ', async () => {
    await settleAdv1()
    const insert = (amount: number, advanceId = ADV_ID) =>
      db().$executeRawUnsafe(`
        INSERT INTO advance_returns (organization_id, advance_id, payee_id, channel, amount_satang,
                                     received_date, evidence_file_path, created_by)
        VALUES ('${ORG_ID}', '${advanceId}', '${PAYEE_ID}', 'cash', ${amount}, '2026-10-05', 'x.pdf', '${FINANCE_ID}')`)
    await expect(insert(55_001)).rejects.toThrow()
    await insert(50_000)
    await expect(insert(5_001)).rejects.toThrow()
    await expect(
      db().$executeRawUnsafe(`UPDATE advance_returns SET amount_satang = 1 WHERE advance_id = '${ADV_ID}'`),
    ).rejects.toThrow()

    await seedApprovedAdvance(ADV2_ID, 100_000)
    await expect(insert(1, ADV2_ID)).rejects.toThrow()
  })
})
