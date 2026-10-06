import { PrismaPg } from '@prisma/adapter-pg'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { SessionUser } from '@/lib/auth/types'
import { PrismaClient } from '@/lib/generated/prisma/client'

/**
 * มติ PO 07/10/2569 U134 — รอบจ่าย `completed` แต่ขั้นหลัง commit (บันทึกจ่าย/ออก 50 ทวิ) ล้ม
 * ⇒ ตัวกวาดใน `runSweeperJobs()` ทำต่อให้ครบ · ไม่ซ้ำ · กวาดพร้อมกันไม่ซ้ำ · ตามรอยได้ใน Job Log
 *
 * จำลอง "ล้มหลัง commit" ของจริง: ติด trigger ชั่วคราวที่ `expense_records` (เฉพาะองค์กรของไฟล์นี้)
 * ให้ insert ล้ม ⇒ `completePayoutBatch()` commit สถานะแล้วแต่บันทึกจ่ายไม่เกิด
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

const ORG_ID = '00000000-0000-4000-8000-0000000134a0'
const ROLE_ID = '00000000-0000-4000-8000-0000000134a1'
const USER_ID = '00000000-0000-4000-8000-0000000134a2'
const AGENT_ID = '00000000-0000-4000-8000-0000000134a3'
const PAYEE_ID = '00000000-0000-4000-8000-0000000134a5'
const USER_UID = '00000000-0000-4000-8000-0000000134af'

const PAYMENT_AT = '2026-06-25T03:00:00Z'
/** เวลาที่ตัวกวาดเห็น — เลยช่วงผ่อนผันของรอบที่เพิ่งยืนยันไปแล้ว */
const LATER = (): Date => new Date(Date.now() + 10 * 60 * 1000)

let client: PrismaClient | null = null
type Sweeper = typeof import('@/lib/payout/completion-sweeper')
type PayoutQueries = typeof import('@/lib/payout/queries')
type Registry = typeof import('@/lib/jobs/registry')
let sweeper: Sweeper
let payout: PayoutQueries
let registry: Registry

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
  id: USER_ID,
  organizationId: ORG_ID,
  supabaseUid: USER_UID,
  email: 'finance134@test.local',
  fullName: 'การเงิน U134',
  status: 'active',
  roleId: ROLE_ID,
  roleName: 'การเงิน U134',
  roleGroup: 'system',
  isSuperadmin: false,
  teamId: null,
  companyId: null,
  capabilities: { manage_payout_batch: 'manage', manage_sales_expenses: 'manage' },
  scope: { kind: 'global', teamIds: [], companyId: null, userId: USER_ID },
  loginAt: new Date().toISOString(),
}

let cursor = 0

async function seedFileGeneratedBatch(): Promise<{ batchId: string; itemId: string }> {
  cursor += 1
  const gross = 45_000_00
  const wht = 1_350_00
  const net = gross - wht
  const [batch] = await db().$queryRawUnsafe<{ id: string }[]>(`
    INSERT INTO payout_batches (organization_id, name, side, status, gross_satang, wht_satang, net_satang,
                                payment_file_generated_at, created_by)
    VALUES ('${ORG_ID}', 'PB-U134-${cursor}-${Date.now()}', 'outsource', 'file_generated', ${gross}, ${wht}, ${net},
            '${PAYMENT_AT}', '${USER_ID}')
    RETURNING id
  `)
  const [expense] = await db().$queryRawUnsafe<{ id: string }[]>(`
    INSERT INTO expenses (organization_id, payee_id, expense_type, gross_satang, expense_date, status,
                          receipt_file_url, receipt_file_hash, created_by)
    VALUES ('${ORG_ID}', '${PAYEE_ID}', 'commission', ${gross}, '2026-06-20', 'approved', 'field/receipts/ok.jpg', 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', '${USER_ID}')
    RETURNING id
  `)
  const [item] = await db().$queryRawUnsafe<{ id: string }[]>(`
    INSERT INTO payout_batch_items (organization_id, payout_batch_id, expense_id, payee_id,
                                    gross_satang, wht_satang, net_satang, created_by)
    VALUES ('${ORG_ID}', '${batch?.id}', '${expense?.id}', '${PAYEE_ID}', ${gross}, ${wht}, ${net}, '${USER_ID}')
    RETURNING id
  `)
  return { batchId: batch?.id ?? '', itemId: item?.id ?? '' }
}

/** ทำให้การเขียนบันทึกจ่ายขององค์กรนี้ล้ม = จำลองขั้นหลัง commit พัง (DB สะดุด/ถูกตัดกลางคัน) */
async function breakExpenseRecords(): Promise<void> {
  await db().$executeRawUnsafe(`
    CREATE OR REPLACE FUNCTION u134_fail_expense_records() RETURNS trigger LANGUAGE plpgsql AS $$
    BEGIN RAISE EXCEPTION 'U134 จำลองขั้นหลัง commit ล้ม'; END; $$
  `)
  await db().$executeRawUnsafe(`DROP TRIGGER IF EXISTS trg_u134_fail_expense_records ON expense_records`)
  await db().$executeRawUnsafe(`
    CREATE TRIGGER trg_u134_fail_expense_records BEFORE INSERT ON expense_records
    FOR EACH ROW WHEN (NEW.organization_id = '${ORG_ID}') EXECUTE FUNCTION u134_fail_expense_records()
  `)
}

async function healExpenseRecords(): Promise<void> {
  await db().$executeRawUnsafe(`DROP TRIGGER IF EXISTS trg_u134_fail_expense_records ON expense_records`)
}

async function completeWithBrokenPostSteps(): Promise<{ batchId: string; itemId: string }> {
  const seeded = await seedFileGeneratedBatch()
  await breakExpenseRecords()
  try {
    // ขั้นหลัง commit ล้ม ⇒ ไม่โยนต่อ (รอบจ่ายสำเร็จจริงแล้ว) — ตัวกวาดรับช่วงต่อ
    await payout.completePayoutBatch({ actor: finance, meta }, seeded.batchId, { reason: 'ธนาคารยืนยันโอนสำเร็จ (U134)' })
  } finally {
    await healExpenseRecords()
  }
  return seeded
}

async function stateOf(seeded: { batchId: string; itemId: string }) {
  const batch = await db().payoutBatch.findUniqueOrThrow({
    where: { id: seeded.batchId },
    select: { status: true, postCompletionSyncedAt: true },
  })
  const records = await db().expenseRecord.findMany({ where: { payoutBatchItemId: seeded.itemId }, select: { id: true } })
  const certificates = await db().whtCertificate.count({
    where: { expenseRecordId: { in: records.map((row) => row.id) } },
  })
  const jobs = await db().job.findMany({
    where: { organizationId: ORG_ID, jobType: 'payout_completion_repair', payload: { path: ['batchId'], equals: seeded.batchId } },
    select: { id: true, status: true, result: true },
  })
  return { batch, records: records.length, certificates, jobs }
}

beforeAll(async () => {
  if (!url) return
  process.env.DATABASE_URL = url
  sweeper = await import('@/lib/payout/completion-sweeper')
  payout = await import('@/lib/payout/queries')
  registry = await import('@/lib/jobs/registry')

  const tx = db()
  await tx.$executeRawUnsafe(`
    INSERT INTO organizations (id, name, tax_id, address, vat_registered)
    VALUES ('${ORG_ID}', 'U134Test', '9999999913400', 'ที่อยู่ทดสอบ U134 กรุงเทพฯ', true)
    ON CONFLICT (id) DO NOTHING
  `)
  await tx.$executeRawUnsafe(`
    INSERT INTO roles (id, organization_id, name, role_group, is_seed)
    VALUES ('${ROLE_ID}', '${ORG_ID}', 'การเงิน U134', 'system', false) ON CONFLICT (id) DO NOTHING
  `)
  await tx.$executeRawUnsafe(`
    INSERT INTO users (id, organization_id, role_id, email, full_name, status, supabase_uid)
    VALUES ('${USER_ID}', '${ORG_ID}', '${ROLE_ID}', 'finance134@test.local', 'การเงิน U134', 'active', '${USER_UID}'),
           ('${AGENT_ID}', '${ORG_ID}', '${ROLE_ID}', 'agent134@test.local', 'สมชาย ใจดี', 'active', NULL)
    ON CONFLICT (id) DO NOTHING
  `)
  await tx.$executeRawUnsafe(`
    INSERT INTO payee_profiles (id, organization_id, user_id, payee_type, is_verified, created_by)
    VALUES ('${PAYEE_ID}', '${ORG_ID}', '${AGENT_ID}', 'individual', true, '${USER_ID}')
    ON CONFLICT (id) DO NOTHING
  `)
})

afterAll(async () => {
  if (url) await healExpenseRecords()
  await client?.$disconnect()
})

suite('U134 — ตัวกวาดขั้นหลังรอบจ่ายสำเร็จ', () => {
  it('ทางปกติ: ยืนยันจ่าย ⇒ บันทึกจ่าย + 50 ทวิ ครบและมาร์คครบทันที · ตัวกวาดไม่มีอะไรต้องทำ', async () => {
    const seeded = await seedFileGeneratedBatch()
    await payout.completePayoutBatch({ actor: finance, meta }, seeded.batchId, { reason: 'ธนาคารยืนยันโอนสำเร็จ (U134)' })

    const state = await stateOf(seeded)
    expect(state.batch.status).toBe('completed')
    expect(state.batch.postCompletionSyncedAt).not.toBeNull()
    expect(state.records).toBe(1)
    expect(state.certificates).toBe(1)

    const swept = await sweeper.runPayoutCompletionSweep({ now: LATER(), organizationId: ORG_ID })
    expect(swept.pending).toBe(0)
    expect((await stateOf(seeded)).jobs).toHaveLength(0)
  })

  it('ล้มหลัง commit ⇒ รอบ completed ค้าง · ตัวกวาดรอบถัดไปทำต่อครบ ไม่ซ้ำ · มีงานใน Job Log', async () => {
    const seeded = await completeWithBrokenPostSteps()

    const broken = await stateOf(seeded)
    expect(broken.batch.status).toBe('completed')
    expect(broken.batch.postCompletionSyncedAt).toBeNull()
    expect(broken.records).toBe(0)

    // ยังอยู่ในช่วงผ่อนผัน ⇒ ไม่แตะ (คำขอเดิมอาจกำลังทำอยู่)
    const early = await sweeper.runPayoutCompletionSweep({ now: new Date(), organizationId: ORG_ID })
    expect(early.pending).toBe(0)

    const sweep = await registry.runSweeperJobs({ now: LATER(), organizationId: ORG_ID })
    expect(sweep.payoutCompletion).toMatchObject({ pending: 1, enqueued: 1, completed: 1, failed: 0 })

    const repaired = await stateOf(seeded)
    expect(repaired.batch.postCompletionSyncedAt).not.toBeNull()
    expect(repaired.records).toBe(1)
    expect(repaired.certificates).toBe(1)
    expect(repaired.jobs).toHaveLength(1)
    expect(repaired.jobs[0]?.status).toBe('completed')
    expect(repaired.jobs[0]?.result).toMatchObject({ batchId: seeded.batchId, marked: true, alreadyDone: false })

    // audit ของบันทึกจ่ายที่ทำต่อ ตามรอยกลับ job ได้
    const record = await db().expenseRecord.findFirstOrThrow({ where: { payoutBatchItemId: seeded.itemId } })
    const audit = await db().auditLog.findFirstOrThrow({ where: { targetType: 'expense_records', targetId: record.id } })
    expect(audit.reason).toContain(repaired.jobs[0]?.id ?? 'ไม่มี job')
    expect(audit.actorId).toBe(USER_ID)

    // กวาดซ้ำ ⇒ ไม่มีอะไรค้าง ไม่สร้างซ้ำ
    const again = await registry.runSweeperJobs({ now: LATER(), organizationId: ORG_ID })
    expect(again.payoutCompletion).toMatchObject({ pending: 0 })
    const after = await stateOf(seeded)
    expect(after.records).toBe(1)
    expect(after.certificates).toBe(1)
    expect(after.jobs).toHaveLength(1)
  })

  it('ตัวกวาด 2 ตัวพร้อมกัน ⇒ งานเดียว · บันทึกจ่าย/50 ทวิ อย่างละหนึ่ง', async () => {
    const seeded = await completeWithBrokenPostSteps()
    const now = LATER()

    await Promise.all([
      sweeper.runPayoutCompletionSweep({ now, organizationId: ORG_ID }),
      sweeper.runPayoutCompletionSweep({ now, organizationId: ORG_ID }),
    ])

    const state = await stateOf(seeded)
    expect(state.batch.postCompletionSyncedAt).not.toBeNull()
    expect(state.records).toBe(1)
    expect(state.certificates).toBe(1)
    expect(state.jobs).toHaveLength(1)
  })

  it('งานทำต่อไม่ออกใบแทนฉบับที่คนยกเลิกไปแล้ว (ออกเฉพาะที่ยังไม่เคยออก)', async () => {
    const seeded = await seedFileGeneratedBatch()
    await payout.completePayoutBatch({ actor: finance, meta }, seeded.batchId, { reason: 'ธนาคารยืนยันโอนสำเร็จ (U134)' })
    const record = await db().expenseRecord.findFirstOrThrow({ where: { payoutBatchItemId: seeded.itemId } })
    // จำลอง: ใบถูกยกเลิก + เครื่องหมายครบหาย (เช่นรอบเก่าก่อน backfill)
    await db().$executeRawUnsafe(`
      UPDATE wht_certificates SET status = 'cancelled', cancel_reason = 'ทดสอบ U134', cancelled_at = now(), cancelled_by = '${USER_ID}'
      WHERE expense_record_id = '${record.id}'
    `)
    await db().$executeRawUnsafe(`UPDATE payout_batches SET post_completion_synced_at = NULL WHERE id = '${seeded.batchId}'`)

    const job = await sweeper.runPayoutCompletionRepair({ jobId: 'test-job', organizationId: ORG_ID, batchId: seeded.batchId })
    expect(job.marked).toBe(true)
    expect(await db().whtCertificate.count({ where: { expenseRecordId: record.id } })).toBe(1)
    expect(await db().whtCertificate.count({ where: { expenseRecordId: record.id, status: 'active' } })).toBe(0)
  })
})
