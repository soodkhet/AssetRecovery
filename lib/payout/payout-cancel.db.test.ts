import { PrismaPg } from '@prisma/adapter-pg'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import type { SessionUser } from '@/lib/auth/types'
import { PrismaClient } from '@/lib/generated/prisma/client'

/**
 * เทสต์ระดับ DB — มติ PO 05/10/2569 (UAT U67): ยกเลิกรอบจ่าย
 *  · ยกเลิกแล้วรายการเบิก/เงินทดรองกลับไปรอจ่าย · รอบใหม่ดึงเข้าได้ครั้งเดียว (ไม่หาย ไม่ซ้ำ)
 *  · ยอดหักคืนเงินทดรองกลับเป็นค้าง (U30) แล้วรอบใหม่หักได้ครั้งเดียว
 *  · สร้างไฟล์โอนแล้วต้องยืนยันว่ายังไม่ส่งธนาคาร · key เดิมคงไว้ รอบใหม่ได้ key ใหม่ · ดาวน์โหลดไฟล์เดิมไม่ได้
 *  · โอนแล้ว (completed) ยกเลิกไม่ได้ · 50 ทวิ ของรอบนั้นยัง active และนับยอดตามเดิม · ยาม DB กันอีกชั้น
 *  · ไม่มีเหตุผล → CANCEL_REQUIRES_REASON · ยกเลิกแล้วทำ action อื่นต่อไม่ได้ · audit before/after
 *  · แข่งกัน: ยกเลิกพร้อมสร้างไฟล์โอน → ผู้ชนะคนเดียว สถานะไม่เพี้ยน
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
if (!url) console.warn('[payout-cancel.db.test] ข้ามเทสต์ระดับ DB — ไม่มี TEST_DATABASE_URL')

const ORG_ID = '00000000-0000-4000-8000-000000e67000'
const ROLE_FINANCE = '00000000-0000-4000-8000-000000e67001'
const ROLE_AGENT = '00000000-0000-4000-8000-000000e67002'
const FINANCE_ID = '00000000-0000-4000-8000-000000e67003'
const AGENT_ID = '00000000-0000-4000-8000-000000e67004'
const TEAM_ID = '00000000-0000-4000-8000-000000e67005'
const TAX_PROFILE_ID = '00000000-0000-4000-8000-000000e67006'
const PLAN_ID = '00000000-0000-4000-8000-000000e67007'
const BANK_ACCOUNT_ID = '00000000-0000-4000-8000-000000e67008'
const FORMAT_ID = '00000000-0000-4000-8000-000000e67009'
const PAYEE_ID = '00000000-0000-4000-8000-000000e6700a'
const ADV_ID = '00000000-0000-4000-8000-000000e670a1'
const ADV_PAY_ID = '00000000-0000-4000-8000-000000e670a2'

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

const finance: SessionUser = {
  id: FINANCE_ID,
  organizationId: ORG_ID,
  supabaseUid: `uid-${FINANCE_ID}`,
  email: 'finance-u67@test.local',
  fullName: 'การเงิน U67',
  status: 'active',
  roleId: ROLE_FINANCE,
  roleName: 'การเงิน',
  roleGroup: 'system',
  isSuperadmin: false,
  teamId: null,
  companyId: null,
  capabilities: { manage_payout_batch: 'manage', generate_payment_file: 'manage', approve_advance: 'manage' },
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
const REASON = 'ดึงรายการผิดวันตัดรอบ ต้องสร้างใหม่'

let expenseSeq = 0
async function seedExpense(grossSatang: number): Promise<string> {
  expenseSeq += 1
  const id = `00000000-0000-4e67-8000-${String(expenseSeq).padStart(12, '0')}`
  await db().$executeRawUnsafe(`
    INSERT INTO expenses (id, organization_id, payee_id, expense_type, gross_satang, expense_date,
                          status, comp_plan_id, comp_plan_version, approval_step_current, approval_step_total, created_by)
    VALUES ('${id}', '${ORG_ID}', '${PAYEE_ID}', 'commission', ${grossSatang},
            '2026-08-20', 'approved', '${PLAN_ID}', 1, 2, 2, '${FINANCE_ID}')
  `)
  return id
}

async function seedApprovedAdvance(id: string, approvedSatang: number): Promise<void> {
  await db().$executeRawUnsafe(`
    INSERT INTO advances (id, organization_id, payee_id, requested_satang, approved_satang, purpose,
                          due_clear_date, status, approved_at, approved_by, created_by)
    VALUES ('${id}', '${ORG_ID}', '${PAYEE_ID}', ${approvedSatang}, ${approvedSatang}, 'ค่าเดินทางล่วงหน้า U67',
            '2026-12-31', 'approved', '2026-08-20T03:00:00Z', '${FINANCE_ID}', '${AGENT_ID}')
  `)
}

/** เงินทดรองที่ถูกจ่ายในรอบก่อนแล้ว (กันไม่ให้ถูกดึงเข้ารอบใหม่) แล้วเคลียร์ ใช้ ฿2,450 จาก ฿3,000 → คืน ฿550 */
async function settledAdvanceWithOffset(): Promise<void> {
  await seedApprovedAdvance(ADV_ID, 300_000)
  // ทำเหมือนจ่ายออกไปแล้วในรอบอื่น — ชี้ไปที่รายการของรอบที่โอนจริงแล้วในอดีต (`completed` — มติ PO U74: รอบที่ยังไม่โอนเคลียร์ไม่ได้)
  const paidBatch = await db().payoutBatch.create({
    data: { organizationId: ORG_ID, name: 'รอบเก่า U67', side: 'outsource', status: 'completed', createdBy: FINANCE_ID },
  })
  const paidItem = await db().payoutBatchItem.create({
    data: {
      organizationId: ORG_ID,
      payoutBatchId: paidBatch.id,
      advanceId: ADV_ID,
      payeeId: PAYEE_ID,
      grossSatang: 300_000,
      netSatang: 300_000,
      createdBy: FINANCE_ID,
    },
  })
  await db().advance.update({ where: { id: ADV_ID }, data: { payoutBatchItemId: paidItem.id } })
  await advances.settleAdvance(ctx, ADV_ID, { usedSatang: 245_000, receiptFileUrl: null, note: null })
}

async function advanceOutstanding(id: string = ADV_ID): Promise<number> {
  const list = await advances.listAdvances(finance, { status: 'all' })
  const found = list.find((row) => row.id === id)
  if (found === undefined) throw new Error(`ไม่พบ ${id}`)
  return found.returnOutstandingSatang
}

function createBatch() {
  return payout.createPayoutBatch(ctx, { side: 'outsource', cutoffDate: CUTOFF, name: null })
}

function generate(batchId: string) {
  return payout.generatePaymentFile(ctx, batchId, {
    bankAccountId: BANK_ACCOUNT_ID,
    bankFileFormatId: FORMAT_ID,
    confirmDuplicate: false,
    reason: 'สร้างไฟล์โอน U67',
  })
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
  await tx.$executeRawUnsafe(`DELETE FROM wht_filing_summaries WHERE organization_id = '${ORG_ID}'`)
  await tx.$executeRawUnsafe(`DELETE FROM advance_returns WHERE organization_id = '${ORG_ID}'`)
  await tx.$executeRawUnsafe(`DELETE FROM expense_records WHERE organization_id = '${ORG_ID}'`)
  await tx.$executeRawUnsafe(`DELETE FROM exceptions WHERE organization_id = '${ORG_ID}'`)
  await tx.$executeRawUnsafe(`UPDATE expenses SET payout_batch_item_id = NULL WHERE organization_id = '${ORG_ID}'`)
  await tx.$executeRawUnsafe(`UPDATE advances SET payout_batch_item_id = NULL WHERE organization_id = '${ORG_ID}'`)
  await tx.$executeRawUnsafe(`DELETE FROM payout_batch_items WHERE organization_id = '${ORG_ID}'`)
  // trigger ของรอบที่ยกเลิกเป็น BEFORE UPDATE เท่านั้น ⇒ DELETE ตอนล้างข้อมูลเทสต์ผ่านได้
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
    VALUES ('${ORG_ID}', 'U67Test', '9999999996767', 'ที่อยู่ทดสอบ U67') ON CONFLICT (id) DO NOTHING
  `)
  await tx.$executeRawUnsafe(`
    INSERT INTO roles (id, organization_id, name, role_group, is_seed) VALUES
      ('${ROLE_FINANCE}', '${ORG_ID}', 'การเงิน U67', 'system', false),
      ('${ROLE_AGENT}', '${ORG_ID}', 'พนักงานติดตามทรัพย์ U67', 'outsource', false)
    ON CONFLICT (id) DO NOTHING
  `)
  await tx.$executeRawUnsafe(`
    INSERT INTO users (id, organization_id, role_id, email, full_name, phone, status) VALUES
      ('${FINANCE_ID}', '${ORG_ID}', '${ROLE_FINANCE}', 'finance-u67@test.local', 'การเงิน U67', NULL, 'active'),
      ('${AGENT_ID}', '${ORG_ID}', '${ROLE_AGENT}', 'agent-u67@test.local', 'สมชาย ยกเลิก', '0812345678', 'active')
    ON CONFLICT (id) DO NOTHING
  `)
  await tx.$executeRawUnsafe(`
    INSERT INTO teams (id, organization_id, name, side, provinces, status, created_by)
    VALUES ('${TEAM_ID}', '${ORG_ID}', 'ทีมนอก U67', 'outsource', ARRAY['ลำพูน'], 'active', '${FINANCE_ID}')
    ON CONFLICT (id) DO NOTHING
  `)
  await tx.$executeRawUnsafe(`UPDATE users SET team_id = '${TEAM_ID}' WHERE id = '${AGENT_ID}'`)
  await tx.$executeRawUnsafe(`
    INSERT INTO tax_profiles (id, organization_id, name, wht_pct, wht_basis, wht_min_threshold_satang, created_by)
    VALUES ('${TAX_PROFILE_ID}', '${ORG_ID}', 'ค่าจ้างทำของ 3% (U67)', 3.00, 'before_vat', 100000, '${FINANCE_ID}')
    ON CONFLICT (id) DO NOTHING
  `)
  await tx.$executeRawUnsafe(`
    INSERT INTO compensation_plans (id, organization_id, name, side, fuel_mode, fuel_rate_per_km_satang,
                                    allowance_satang, commission_satang, wht_pct, version, effective_from, created_by)
    VALUES ('${PLAN_ID}', '${ORG_ID}', 'แผน U67', 'outsource', 'PER_KM', 500, 30000, 150000, 3.00, 1, '2026-01-01', '${FINANCE_ID}')
    ON CONFLICT (id) DO NOTHING
  `)
  await tx.$executeRawUnsafe(`
    INSERT INTO payee_profiles (id, organization_id, user_id, payee_type, tax_profile_id, bank_name,
                                account_name, account_number, national_id, is_verified, created_by)
    VALUES ('${PAYEE_ID}', '${ORG_ID}', '${AGENT_ID}', 'individual', '${TAX_PROFILE_ID}', 'ธนาคารกสิกรไทย',
            'สมชาย ยกเลิก', '1234567890', '1234567890123', true, '${FINANCE_ID}')
    ON CONFLICT (id) DO NOTHING
  `)
  await tx.$executeRawUnsafe(`
    INSERT INTO bank_accounts (id, organization_id, bank_name, account_name, account_number, usage, created_by)
    VALUES ('${BANK_ACCOUNT_ID}', '${ORG_ID}', 'ธนาคารกรุงเทพ', 'บริษัท ทดสอบ U67 จำกัด', '1112223367', 'pay', '${FINANCE_ID}')
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

suite('ยกเลิกรอบจ่ายก่อนสร้างไฟล์โอน', () => {
  it('รายการเบิก + เงินทดรองจ่ายกลับไปรอจ่าย · รอบใหม่ดึงเข้าได้ครั้งเดียว · ประวัติรอบเดิมคงอยู่', async () => {
    const expenseId = await seedExpense(500_000)
    await seedApprovedAdvance(ADV_PAY_ID, 200_000)
    const { batch } = await createBatch()
    expect(batch.itemCount).toBe(2)

    const outcome = await payout.cancelPayoutBatch(ctx, batch.id, { reason: REASON, confirmFileNotSent: false })
    expect(outcome.batch.status).toBe('cancelled')
    expect(outcome.batch.cancelReason).toBe(REASON)
    expect(outcome.batch.cancelledByName).toBe('การเงิน U67')
    expect(outcome.batch.cancelledAt).not.toBeNull()
    expect(outcome.releasedExpenseCount).toBe(1)
    expect(outcome.releasedAdvanceCount).toBe(1)

    // ต้นทางกลับไปรอจ่าย (approved + ไม่ผูกรายการรอบจ่าย)
    const expense = await db().expense.findUniqueOrThrow({ where: { id: expenseId } })
    expect(expense.status).toBe('approved')
    expect(expense.payoutBatchItemId).toBeNull()
    const advance = await db().advance.findUniqueOrThrow({ where: { id: ADV_PAY_ID } })
    expect(advance.status).toBe('approved')
    expect(advance.payoutBatchItemId).toBeNull()
    // รายการของรอบที่ยกเลิกคงไว้เป็นประวัติ (snapshot)
    expect(await db().payoutBatchItem.count({ where: { payoutBatchId: batch.id } })).toBe(2)

    // รอบใหม่ดึงเข้าได้ครบ ยอดเท่าเดิม
    const next = await createBatch()
    expect(next.batch.itemCount).toBe(2)
    expect(next.batch.grossSatang).toBe(batch.grossSatang)
    expect(next.batch.netSatang).toBe(batch.netSatang)
    // …และครั้งเดียว — สร้างอีกรอบไม่มีอะไรเหลือให้ดึง
    await expectCode(() => createBatch(), 'NO_ITEMS_TO_PAY')
  })

  it('ยอดหักคืนเงินทดรองกลับเป็นค้าง ไม่หาย · รอบใหม่หักได้ครั้งเดียว', async () => {
    await settledAdvanceWithOffset()
    await seedExpense(500_000)
    const { batch } = await createBatch()
    expect(batch.advanceOffsetSatang).toBe(55_000)
    expect(await advanceOutstanding()).toBe(0)

    const outcome = await payout.cancelPayoutBatch(ctx, batch.id, { reason: REASON, confirmFileNotSent: false })
    expect(outcome.reversedAdvanceOffsetCount).toBe(1)
    expect(await advanceOutstanding()).toBe(55_000)

    const reversed = await db().advanceReturn.findFirstOrThrow({ where: { organizationId: ORG_ID, payoutBatchId: batch.id } })
    expect(reversed.reversedAt).not.toBeNull()
    expect(reversed.reversalReason).toContain(REASON)

    const next = await createBatch()
    expect(next.batch.advanceOffsetSatang).toBe(55_000)
    expect(await advanceOutstanding()).toBe(0)
  })

  it('ไม่มีเหตุผล → CANCEL_REQUIRES_REASON และไม่มีอะไรเปลี่ยน', async () => {
    await seedExpense(500_000)
    const { batch } = await createBatch()
    await expectCode(() => payout.cancelPayoutBatch(ctx, batch.id, { reason: '  ', confirmFileNotSent: false }), 'CANCEL_REQUIRES_REASON')
    const row = await db().payoutBatch.findUniqueOrThrow({ where: { id: batch.id } })
    expect(row.status).toBe('checking')
  })

  it('audit เก็บ before/after + เหตุผล + รายการที่ปลด', async () => {
    const expenseId = await seedExpense(500_000)
    const { batch } = await createBatch()
    await payout.cancelPayoutBatch(ctx, batch.id, { reason: REASON, confirmFileNotSent: false })

    const log = await db().auditLog.findFirstOrThrow({
      where: { organizationId: ORG_ID, targetType: 'payout_batches', targetId: batch.id, action: 'status_change' },
    })
    expect(log.reason).toBe(REASON)
    expect(log.actorId).toBe(FINANCE_ID)
    expect((log.beforeData as { status: string }).status).toBe('checking')
    const after = log.afterData as { status: string; released_expense_ids: string[] }
    expect(after.status).toBe('cancelled')
    expect(after.released_expense_ids).toEqual([expenseId])
  })

  it('ยกเลิกแล้วเป็น terminal — ยกเลิกซ้ำ/สร้างไฟล์/ยืนยันจ่าย/sync ธนาคาร ไม่ได้', async () => {
    await seedExpense(500_000)
    const { batch } = await createBatch()
    await payout.cancelPayoutBatch(ctx, batch.id, { reason: REASON, confirmFileNotSent: false })

    await expectCode(
      () => payout.cancelPayoutBatch(ctx, batch.id, { reason: REASON, confirmFileNotSent: false }),
      'PAYOUT_BATCH_INVALID_STATUS',
    )
    await expectCode(() => generate(batch.id), 'PAYOUT_BATCH_INVALID_STATUS')
    await expectCode(() => payout.completePayoutBatch(ctx, batch.id, { reason: 'ยืนยันจ่ายเงินแล้ว' }), 'PAYOUT_BATCH_INVALID_STATUS')
    await expectCode(
      () =>
        payout.syncPayoutBatchCompleted({
          organizationId: ORG_ID,
          batchId: batch.id,
          bankTransactionId: '00000000-0000-4000-8000-000000e670f1',
          actorId: null,
          actorRole: 'system',
        }),
      'PAYOUT_BATCH_INVALID_STATUS',
    )

    // ยาม DB อีกชั้น — แก้สถานะรอบที่ยกเลิกตรง ๆ ไม่ได้
    await expect(
      db().$executeRawUnsafe(`UPDATE payout_batches SET status = 'checking' WHERE id = '${batch.id}'`),
    ).rejects.toThrow(/PAYOUT_BATCH_CANCELLED_IMMUTABLE|check/i)
  })
})

suite('ยกเลิกรอบที่สร้างไฟล์โอนแล้ว (ยังไม่โอน)', () => {
  it('ต้องยืนยันว่ายังไม่ส่งไฟล์ · key เดิมคงไว้ · ไฟล์เดิมดาวน์โหลดไม่ได้ · รอบใหม่ได้ key ใหม่', async () => {
    await seedExpense(500_000)
    const { batch } = await createBatch()
    const { result } = await generate(batch.id)
    const oldKey = result.batch.idempotencyKey
    expect(oldKey).not.toBeNull()

    await expectCode(
      () => payout.cancelPayoutBatch(ctx, batch.id, { reason: REASON, confirmFileNotSent: false }),
      'PAYOUT_CANCEL_FILE_CONFIRM_REQUIRED',
    )
    const cancelled = await payout.cancelPayoutBatch(ctx, batch.id, { reason: REASON, confirmFileNotSent: true })
    expect(cancelled.batch.status).toBe('cancelled')
    expect(cancelled.batch.idempotencyKey).toBe(oldKey)

    await expectCode(() => payout.readPaymentFile(finance, batch.id), 'PAYOUT_BATCH_INVALID_STATUS')

    const next = await createBatch()
    const nextFile = await generate(next.batch.id)
    expect(nextFile.result.batch.idempotencyKey).not.toBeNull()
    expect(nextFile.result.batch.idempotencyKey).not.toBe(oldKey)
  })

  it('แข่งกัน: ยกเลิกพร้อมสร้างไฟล์โอน → ผู้ชนะคนเดียว สถานะสอดคล้องกัน', async () => {
    await seedExpense(500_000)
    const { batch } = await createBatch()

    const [cancelResult, generateResult] = await Promise.allSettled([
      payout.cancelPayoutBatch(ctx, batch.id, { reason: REASON, confirmFileNotSent: false }),
      generate(batch.id),
    ])
    const succeeded = [cancelResult, generateResult].filter((entry) => entry.status === 'fulfilled')
    expect(succeeded).toHaveLength(1)

    const row = await db().payoutBatch.findUniqueOrThrow({ where: { id: batch.id } })
    if (cancelResult.status === 'fulfilled') {
      // ยกเลิกชนะ ⇒ ไม่มีแถวชี้ไฟล์โอน (ไฟล์ที่อัปโหลดไปเป็นไฟล์กำพร้า) · สร้างไฟล์ถูกปฏิเสธ
      expect(row.status).toBe('cancelled')
      expect(row.paymentFileGeneratedAt).toBeNull()
      expect(codeOf((generateResult as PromiseRejectedResult).reason)).toBe('PAYOUT_BATCH_INVALID_STATUS')
    } else {
      // สร้างไฟล์ชนะ ⇒ การยกเลิกต้องได้ยามยืนยันไฟล์ (เพราะเห็นสถานะหลังสร้างไฟล์แล้ว)
      expect(row.status).toBe('file_generated')
      expect(codeOf(cancelResult.reason)).toBe('PAYOUT_CANCEL_FILE_CONFIRM_REQUIRED')
    }
  })
})

suite('รอบที่โอนแล้วยกเลิกไม่ได้ · 50 ทวิ ไม่ถูกกระทบ', () => {
  it('completed → PAYOUT_BATCH_ALREADY_PAID · 50 ทวิ ยัง active และยอด ภ.ง.ด. คงเดิม · ยาม DB', async () => {
    await seedExpense(500_000)
    const { batch } = await createBatch()
    await generate(batch.id)
    await payout.completePayoutBatch(ctx, batch.id, { reason: 'ธนาคารตัดโอนครบแล้ว' })

    const certsBefore = await db().whtCertificate.findMany({
      where: { organizationId: ORG_ID },
      select: { id: true, status: true, whtSatang: true },
    })
    expect(certsBefore.length).toBeGreaterThan(0)
    const filingBefore = await db().whtFilingSummary.findMany({ where: { organizationId: ORG_ID } })

    await expectCode(
      () => payout.cancelPayoutBatch(ctx, batch.id, { reason: REASON, confirmFileNotSent: true }),
      'PAYOUT_BATCH_ALREADY_PAID',
    )

    const certsAfter = await db().whtCertificate.findMany({
      where: { organizationId: ORG_ID },
      select: { id: true, status: true, whtSatang: true },
    })
    expect(certsAfter).toEqual(certsBefore)
    expect(certsAfter.every((cert) => cert.status === 'active')).toBe(true)
    expect(await db().whtFilingSummary.findMany({ where: { organizationId: ORG_ID } })).toEqual(filingBefore)
    expect(await db().expense.count({ where: { organizationId: ORG_ID, payoutBatchItemId: null } })).toBe(0)

    // ยาม DB อีกชั้น — completed → cancelled ตรง ๆ ไม่ได้
    await expect(
      db().$executeRawUnsafe(`
        UPDATE payout_batches SET status = 'cancelled', cancelled_at = now(),
               cancelled_by = '${FINANCE_ID}', cancel_reason = 'ทดสอบ' WHERE id = '${batch.id}'`),
    ).rejects.toThrow(/PAYOUT_BATCH_ALREADY_PAID/)
  })

  it('CHECK: สถานะ cancelled ต้องมีข้อมูลการยกเลิกครบ', async () => {
    await seedExpense(500_000)
    const { batch } = await createBatch()
    await expect(
      db().$executeRawUnsafe(`UPDATE payout_batches SET status = 'cancelled' WHERE id = '${batch.id}'`),
    ).rejects.toThrow(/chk_payout_batches_cancelled_fields/)
  })
})
