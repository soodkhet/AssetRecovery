import { PrismaPg } from '@prisma/adapter-pg'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import type { SessionUser } from '@/lib/auth/types'
import { PrismaClient } from '@/lib/generated/prisma/client'

/**
 * เทสต์ระดับ DB — มติ PO 05/10/2569 (UAT U74): ห้ามเคลียร์ยอดเงินทดรองขณะอยู่ในรอบจ่ายที่ยังไม่โอนจริง
 *  · draft / file_generated → ปฏิเสธ `ADVANCE_IN_PENDING_PAYOUT` (ข้อความบอกชื่อรอบ) · DTO บอกรอบที่บล็อก
 *  · รอบ completed → เคลียร์ได้ (ยอดคืนหักกลบรอบถัดไปตาม U30)
 *  · รอบถูกยกเลิก (U67) → เงินทดรองหลุดจากรอบ · รอบใหม่ดึงได้ แล้วบล็อกด้วยชื่อรอบใหม่
 *  · race: เคลียร์ยอด ↔ สร้างรอบจ่าย / ยกเลิกรอบ — ไม่มีทางได้ "เคลียร์แล้ว + ยังอยู่ในรอบที่ยังไม่โอน"
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
if (!url) console.warn('[advance-settle-payout.db.test] ข้ามเทสต์ระดับ DB — ไม่มี TEST_DATABASE_URL')

const ORG_ID = '00000000-0000-4000-8000-000000e74000'
const ROLE_FINANCE = '00000000-0000-4000-8000-000000e74001'
const ROLE_AGENT = '00000000-0000-4000-8000-000000e74002'
const FINANCE_ID = '00000000-0000-4000-8000-000000e74003'
const AGENT_ID = '00000000-0000-4000-8000-000000e74004'
const TEAM_ID = '00000000-0000-4000-8000-000000e74005'
const TAX_PROFILE_ID = '00000000-0000-4000-8000-000000e74006'
const PLAN_ID = '00000000-0000-4000-8000-000000e74007'
const BANK_ACCOUNT_ID = '00000000-0000-4000-8000-000000e74008'
const FORMAT_ID = '00000000-0000-4000-8000-000000e74009'
const PAYEE_ID = '00000000-0000-4000-8000-000000e7400a'
const ADV_ID = '00000000-0000-4000-8000-000000e740a1'

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
    fullName: 'การเงิน U74',
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
    VALUES ('${ORG_ID}', 'U74Test', '9999999997474', 'ที่อยู่ทดสอบ U74') ON CONFLICT (id) DO NOTHING
  `)
  await tx.$executeRawUnsafe(`
    INSERT INTO roles (id, organization_id, name, role_group, is_seed) VALUES
      ('${ROLE_FINANCE}', '${ORG_ID}', 'การเงิน U74', 'system', false),
      ('${ROLE_AGENT}', '${ORG_ID}', 'พนักงานติดตามทรัพย์ U74', 'outsource', false)
    ON CONFLICT (id) DO NOTHING
  `)
  await tx.$executeRawUnsafe(`
    INSERT INTO users (id, organization_id, role_id, email, full_name, phone, status) VALUES
      ('${FINANCE_ID}', '${ORG_ID}', '${ROLE_FINANCE}', 'finance-u74@test.local', 'การเงิน U74', NULL, 'active'),
      ('${AGENT_ID}', '${ORG_ID}', '${ROLE_AGENT}', 'agent-u74@test.local', 'สมชาย คืนเงิน', '0812345678', 'active')
    ON CONFLICT (id) DO NOTHING
  `)
  await tx.$executeRawUnsafe(`
    INSERT INTO teams (id, organization_id, name, side, provinces, status, created_by)
    VALUES ('${TEAM_ID}', '${ORG_ID}', 'ทีมนอก U74', 'outsource', ARRAY['ลำพูน'], 'active', '${FINANCE_ID}')
    ON CONFLICT (id) DO NOTHING
  `)
  await tx.$executeRawUnsafe(`UPDATE users SET team_id = '${TEAM_ID}' WHERE id = '${AGENT_ID}'`)
  await tx.$executeRawUnsafe(`
    INSERT INTO tax_profiles (id, organization_id, name, wht_pct, wht_basis, wht_min_threshold_satang, created_by)
    VALUES ('${TAX_PROFILE_ID}', '${ORG_ID}', 'ค่าจ้างทำของ 3% (U74)', 3.00, 'before_vat', 100000, '${FINANCE_ID}')
    ON CONFLICT (id) DO NOTHING
  `)
  await tx.$executeRawUnsafe(`
    INSERT INTO compensation_plans (id, organization_id, name, side, fuel_mode, fuel_rate_per_km_satang,
                                    allowance_satang, commission_satang, wht_pct, version, effective_from, created_by)
    VALUES ('${PLAN_ID}', '${ORG_ID}', 'แผน U74', 'outsource', 'PER_KM', 500, 30000, 150000, 3.00, 1, '2026-01-01', '${FINANCE_ID}')
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
    VALUES ('${BANK_ACCOUNT_ID}', '${ORG_ID}', 'ธนาคารกรุงเทพ', 'บริษัท ทดสอบ U74 จำกัด', '1112223330', 'pay', '${FINANCE_ID}')
    ON CONFLICT (id) DO NOTHING
  `)
  await tx.$executeRawUnsafe(`
    INSERT INTO bank_file_formats (id, organization_id, purpose, bank_code, bank_name, file_type, encoding, column_mapping, test_status, created_by)
    VALUES ('${FORMAT_ID}', '${ORG_ID}', 'payment', '002', 'ธนาคารกรุงเทพ', 'CSV', 'UTF-8',
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

const CUTOFF = new Date(Date.UTC(2026, 7, 31))
const BATCH_NAME = 'รอบจ่ายทดสอบ U74'

/** เงินทดรองที่อนุมัติแล้ว ยังไม่ถูกจ่ายออก ⇒ สร้างรอบจ่ายจะดึงเข้าเป็นรายการจ่าย */
async function seedApprovedAdvance(id: string = ADV_ID, approvedSatang = 300_000): Promise<void> {
  await db().$executeRawUnsafe(`
    INSERT INTO advances (id, organization_id, payee_id, requested_satang, approved_satang, purpose,
                          due_clear_date, status, approved_at, approved_by, created_by)
    VALUES ('${id}', '${ORG_ID}', '${PAYEE_ID}', ${approvedSatang}, ${approvedSatang}, 'ค่าเดินทางล่วงหน้า U74',
            '2026-12-31', 'approved', '2026-08-20T03:00:00Z', '${FINANCE_ID}', '${AGENT_ID}')
  `)
}

function settle(context: typeof ctx = ctx) {
  return advances.settleAdvance(context, ADV_ID, { usedSatang: 245_000, receiptFileUrl: null, note: null })
}

function createBatch(name: string = BATCH_NAME) {
  return payout.createPayoutBatch(ctx, { side: 'outsource', cutoffDate: CUTOFF, name })
}

async function getAdvance() {
  const list = await advances.listAdvances(finance, { status: 'all' })
  const found = list.find((row) => row.id === ADV_ID)
  if (found === undefined) throw new Error(`ไม่พบ ${ADV_ID}`)
  return found
}

async function generateFile(batchId: string): Promise<void> {
  await payout.generatePaymentFile(ctx, batchId, {
    bankAccountId: BANK_ACCOUNT_ID,
    bankFileFormatId: FORMAT_ID,
    confirmDuplicate: false,
    reason: 'สร้างไฟล์โอน U74',
  })
}

async function settleError(context: typeof ctx = ctx): Promise<{ code: string; userMessage: string }> {
  try {
    await settle(context)
  } catch (error) {
    return error as { code: string; userMessage: string }
  }
  throw new Error('ต้องถูกปฏิเสธ')
}

/** ค่าคงที่ของ U74 — ไม่มีทางได้ "เคลียร์แล้ว แต่ยังผูกรอบจ่ายที่ยังไม่โอน" */
async function expectInvariant(): Promise<void> {
  const row = await db().advance.findUniqueOrThrow({
    where: { id: ADV_ID },
    select: { status: true, payoutBatchItemId: true },
  })
  if (row.status !== 'cleared' || row.payoutBatchItemId === null) return
  const item = await db().payoutBatchItem.findUniqueOrThrow({
    where: { id: row.payoutBatchItemId },
    select: { payoutBatch: { select: { status: true } } },
  })
  expect(item.payoutBatch.status).toBe('completed')
}

suite('มติ PO U74 — เคลียร์ยอดขณะอยู่ในรอบจ่ายที่ยังไม่โอน', () => {
  it('รอบที่เพิ่งสร้าง (checking) → ปฏิเสธ ADVANCE_IN_PENDING_PAYOUT บอกชื่อรอบ · ไม่มีอะไรเปลี่ยน · DTO บอกรอบที่บล็อก', async () => {
    await seedApprovedAdvance()
    const { batch } = await createBatch()
    expect(batch.itemCount).toBe(1)

    const error = await settleError()
    expect(error.code).toBe('ADVANCE_IN_PENDING_PAYOUT')
    expect(error.userMessage).toContain(BATCH_NAME)

    // เจ้าของคำขอ (หน้า Field Tracker) ก็โดนกติกาเดียวกัน
    expect((await settleError(agentCtx)).code).toBe('ADVANCE_IN_PENDING_PAYOUT')

    const adv = await getAdvance()
    expect(adv.status).toBe('approved')
    expect(adv.usedSatang).toBe(0)
    expect(adv.payoutBatch).toEqual({ id: batch.id, name: BATCH_NAME, status: 'checking' })
    expect(await db().expense.count({ where: { organizationId: ORG_ID } })).toBe(0)
  })

  it('รอบ file_generated ยังบล็อก → ยืนยันโอนสำเร็จ (completed) แล้วเคลียร์ได้', async () => {
    await seedApprovedAdvance()
    const { batch } = await createBatch()
    await generateFile(batch.id)
    expect((await settleError()).code).toBe('ADVANCE_IN_PENDING_PAYOUT')

    await payout.completePayoutBatch(ctx, batch.id, { reason: 'ธนาคารตัดโอนครบแล้ว' })
    expect((await getAdvance()).payoutBatch?.status).toBe('completed')

    const settled = await settle()
    expect(settled.status).toBe('cleared')
    expect(settled.returnSatang).toBe(55_000)
    expect(settled.returnMethod).toBe('payout_offset')
    // เคลียร์แล้วยังชี้รอบที่จ่ายเงินทดรองออก (ประวัติ)
    expect(settled.payoutBatch?.id).toBe(batch.id)
    await expectInvariant()
  })

  it('ยกเลิกรอบ (U67) → หลุดจากรอบ · รอบใหม่ดึงได้ แล้วบล็อกด้วยชื่อรอบใหม่ · completed แล้วเคลียร์ได้', async () => {
    await seedApprovedAdvance()
    const first = await createBatch('รอบแรก U74')
    await payout.cancelPayoutBatch(ctx, first.batch.id, { reason: 'ยกเลิกรอบทดสอบ U74', confirmFileNotSent: false })
    expect((await getAdvance()).payoutBatch).toBeNull()

    const second = await createBatch('รอบใหม่ U74')
    expect(second.batch.itemCount).toBe(1)
    const error = await settleError()
    expect(error.code).toBe('ADVANCE_IN_PENDING_PAYOUT')
    expect(error.userMessage).toContain('รอบใหม่ U74')

    await generateFile(second.batch.id)
    await payout.completePayoutBatch(ctx, second.batch.id, { reason: 'โอนครบ' })
    expect((await settle()).status).toBe('cleared')
  })

  it('race: เคลียร์ยอด ↔ สร้างรอบจ่าย พร้อมกัน — ฝั่งใดฝั่งหนึ่งชนะ ไม่มีสถานะผสม', async () => {
    for (let round = 0; round < 5; round += 1) {
      await reset()
      await seedApprovedAdvance()
      const [settled, created] = await Promise.allSettled([settle(), createBatch(`รอบแข่ง ${round}`)])
      const adv = await db().advance.findUniqueOrThrow({ where: { id: ADV_ID } })
      if (settled.status === 'fulfilled') {
        // เคลียร์ชนะ ⇒ รอบจ่ายดึงเงินทดรองที่เคลียร์แล้วไม่ได้ (ไม่มีรายการอื่น ⇒ สร้างรอบไม่สำเร็จ)
        expect(adv.status).toBe('cleared')
        expect(adv.payoutBatchItemId).toBeNull()
        expect(created.status).toBe('rejected')
      } else {
        expect(codeOf(settled.reason)).toBe('ADVANCE_IN_PENDING_PAYOUT')
        expect(created.status).toBe('fulfilled')
        expect(adv.status).toBe('approved')
        expect(adv.payoutBatchItemId).not.toBeNull()
      }
      await expectInvariant()
    }
  })

  it('race: เคลียร์ยอด ↔ ยกเลิกรอบ พร้อมกัน — เคลียร์สำเร็จได้เฉพาะเมื่อหลุดจากรอบแล้ว', async () => {
    for (let round = 0; round < 5; round += 1) {
      await reset()
      await seedApprovedAdvance()
      const { batch } = await createBatch(`รอบยกเลิกแข่ง ${round}`)
      const [settled, cancelled] = await Promise.allSettled([
        settle(),
        payout.cancelPayoutBatch(ctx, batch.id, { reason: 'ยกเลิกแข่ง U74', confirmFileNotSent: false }),
      ])
      expect(cancelled.status).toBe('fulfilled')
      const adv = await db().advance.findUniqueOrThrow({ where: { id: ADV_ID } })
      expect(adv.payoutBatchItemId).toBeNull()
      if (settled.status === 'fulfilled') expect(adv.status).toBe('cleared')
      else {
        expect(codeOf(settled.reason)).toBe('ADVANCE_IN_PENDING_PAYOUT')
        expect(adv.status).toBe('approved')
      }
      await expectInvariant()
    }
  })
})
