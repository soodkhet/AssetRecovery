import { PrismaPg } from '@prisma/adapter-pg'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { SessionUser } from '@/lib/auth/types'
import { PrismaClient } from '@/lib/generated/prisma/client'

/**
 * เทสต์ระดับ DB ของ Phase 4.4 — DoD ของไฟล์ 32 + 36
 *
 *  - `32` §16: รอบจ่ายที่ยัง `file_generated` ⇒ **ยังไม่ sync** เข้าบัญชีค่าใช้จ่าย
 *  - `32` §6.1: `completed` ⇒ sync 1 payout item = 1 expense record (เรียกซ้ำไม่สร้างซ้ำ)
 *  - `32` §6.3/§9: รายการที่บังคับใบเสร็จแต่ไม่มีไฟล์ ⇒ `incomplete` + เกิด exception ของไฟล์ 34
 *  - `32` §10/§11: แก้ Cost Center ของรายการ manual ได้ + audit มี `reason` · ศูนย์ต้นทุนมั่ว ⇒ 404
 *  - Period Lock: งวดที่ `locked` ⇒ map Cost Center ไม่ได้ (`PERIOD_LOCKED_DIRECT_EDIT`)
 *  - `36` §15: สร้าง/ตอบข้อซักถาม — ตอบแล้ว `is_resolved = true` + ตอบซ้ำไม่ได้
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
  console.warn('[expenses.db.test] ข้ามเทสต์ระดับ DB — ไม่มี TEST_DATABASE_URL (ดู .env.example)')
}

const ORG_ID = '00000000-0000-4000-8000-0000000044a0'
const ROLE_ID = '00000000-0000-4000-8000-0000000044a1'
const USER_ID = '00000000-0000-4000-8000-0000000044a2'
const AGENT_ID = '00000000-0000-4000-8000-0000000044a3'
const TEAM_ID = '00000000-0000-4000-8000-0000000044a4'
const PAYEE_ID = '00000000-0000-4000-8000-0000000044a5'
const COST_CENTER_ID = '00000000-0000-4000-8000-0000000044a6'
const MISSING_COST_CENTER_ID = '00000000-0000-4000-8000-0000000044ff'

/** วันจ่ายจริงของทุกรอบในไฟล์นี้ — 25/06/2569 เวลาไทย ⇒ งวด "มิถุนายน 2569" */
const PAYMENT_AT = '2026-06-25T03:00:00Z'

let client: PrismaClient | null = null
type ExpenseQueries = typeof import('@/lib/expenses/queries')
type QuestionQueries = typeof import('@/lib/accounting/question-queries')
let expenses: ExpenseQueries
let questions: QuestionQueries

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
  supabaseUid: 'uid-acc-44',
  email: 'accounting44@test.local',
  fullName: 'บัญชี 4.4',
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
    manage_accountant_questions: 'manage',
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

/**
 * รอบจ่าย 1 รอบ + รายการเบิก 1 ใบ (ประเภทกำหนดได้) — คืน id ของรอบและรายการในรอบ
 * `receipt = null` ที่ประเภทบังคับใบเสร็จ ⇒ เอกสารไม่ครบ (`32` §6.3)
 */
async function seedBatch(
  options: { status?: string; expenseType?: string; receipt?: string | null; gross?: number; wht?: number } = {},
): Promise<{ batchId: string; itemId: string; batchName: string }> {
  batchCursor += 1
  const name = `PB-4.4-${batchCursor}`
  const gross = options.gross ?? 45_000_00
  const wht = options.wht ?? 1_350_00
  const net = gross - wht
  const receipt = options.receipt === undefined ? 'field/receipts/ok.jpg' : options.receipt

  const batchRows = await db().$queryRawUnsafe<{ id: string }[]>(`
    INSERT INTO payout_batches (organization_id, name, side, status, gross_satang, wht_satang, net_satang,
                                payment_file_generated_at, created_by)
    VALUES ('${ORG_ID}', '${name}', 'outsource', '${options.status ?? 'completed'}', ${gross}, ${wht}, ${net},
            '${PAYMENT_AT}', '${USER_ID}')
    RETURNING id
  `)
  const batchId = batchRows[0]?.id ?? ''

  const expenseRows = await db().$queryRawUnsafe<{ id: string }[]>(`
    INSERT INTO expenses (organization_id, payee_id, expense_type, gross_satang, expense_date, status,
                          receipt_file_url, created_by)
    VALUES ('${ORG_ID}', '${PAYEE_ID}', '${options.expenseType ?? 'commission'}', ${gross}, '2026-06-20',
            'approved', ${receipt === null ? 'NULL' : `'${receipt}'`}, '${USER_ID}')
    RETURNING id
  `)
  const expenseId = expenseRows[0]?.id ?? ''

  const itemRows = await db().$queryRawUnsafe<{ id: string }[]>(`
    INSERT INTO payout_batch_items (organization_id, payout_batch_id, expense_id, payee_id,
                                    gross_satang, wht_satang, net_satang, created_by)
    VALUES ('${ORG_ID}', '${batchId}', '${expenseId}', '${PAYEE_ID}', ${gross}, ${wht}, ${net}, '${USER_ID}')
    RETURNING id
  `)

  return { batchId, itemId: itemRows[0]?.id ?? '', batchName: name }
}

async function setPeriodStatus(status: string): Promise<void> {
  await db().$executeRawUnsafe(`
    UPDATE accounting_periods SET status = '${status}'
    WHERE organization_id = '${ORG_ID}' AND year_be = 2569 AND month = 6
  `)
}

beforeAll(async () => {
  if (!url) return
  process.env.DATABASE_URL = url
  expenses = await import('@/lib/expenses/queries')
  questions = await import('@/lib/accounting/question-queries')

  const tx = db()
  await tx.$executeRawUnsafe(`
    INSERT INTO organizations (id, name, tax_id, address, vat_registered)
    VALUES ('${ORG_ID}', 'Phase44Test', '9999999994400', 'ที่อยู่ทดสอบ 4.4 กรุงเทพฯ', true)
    ON CONFLICT (id) DO NOTHING
  `)
  await tx.$executeRawUnsafe(`
    INSERT INTO roles (id, organization_id, name, role_group, is_seed)
    VALUES ('${ROLE_ID}', '${ORG_ID}', 'บัญชี 4.4', 'system', false) ON CONFLICT (id) DO NOTHING
  `)
  await tx.$executeRawUnsafe(`
    INSERT INTO users (id, organization_id, role_id, email, full_name, status)
    VALUES ('${USER_ID}', '${ORG_ID}', '${ROLE_ID}', 'accounting44@test.local', 'บัญชี 4.4', 'active'),
           ('${AGENT_ID}', '${ORG_ID}', '${ROLE_ID}', 'agent44@test.local', 'ประยุทธ์ บุญมี', 'active')
    ON CONFLICT (id) DO NOTHING
  `)
  await tx.$executeRawUnsafe(`
    INSERT INTO teams (id, organization_id, name, side, provinces, status, created_by)
    VALUES ('${TEAM_ID}', '${ORG_ID}', 'ทีมทดสอบ 4.4', 'outsource', ARRAY['เชียงใหม่'], 'active', '${USER_ID}')
    ON CONFLICT (id) DO NOTHING
  `)
  await tx.$executeRawUnsafe(`
    INSERT INTO payee_profiles (id, organization_id, user_id, payee_type, is_verified, created_by)
    VALUES ('${PAYEE_ID}', '${ORG_ID}', '${AGENT_ID}', 'individual', true, '${USER_ID}')
    ON CONFLICT (id) DO NOTHING
  `)
  await tx.$executeRawUnsafe(`
    INSERT INTO cost_centers (id, organization_id, code, name, is_active, created_by)
    VALUES ('${COST_CENTER_ID}', '${ORG_ID}', 'CC-001', 'ส่วนกลางสำนักงาน', true, '${USER_ID}')
    ON CONFLICT (id) DO NOTHING
  `)
})

afterAll(async () => {
  await client?.$disconnect()
})

suite('Phase 4.4 — sync บัญชีค่าใช้จ่ายจากรอบจ่าย (`32` §6.1 · §16)', () => {
  it('รอบที่ยัง file_generated (ยังไม่จ่ายจริง) ⇒ ไม่ sync', async () => {
    const seeded = await seedBatch({ status: 'file_generated' })
    expect(await expenses.syncExpenseRecordsFromPayout(ctx, seeded.batchId)).toEqual([])
    expect(await db().expenseRecord.count({ where: { payoutBatchItemId: seeded.itemId } })).toBe(0)
  })

  it('completed ⇒ 1 payout item = 1 expense record + ยอดเป็น snapshot + เรียกซ้ำไม่สร้างซ้ำ', async () => {
    const seeded = await seedBatch({ gross: 45_000_00, wht: 1_350_00 })
    const created = await expenses.syncExpenseRecordsFromPayout(ctx, seeded.batchId)

    expect(created).toHaveLength(1)
    expect(created[0]?.grossSatang).toBe(45_000_00)
    expect(created[0]?.whtSatang).toBe(1_350_00)
    expect(created[0]?.netSatang).toBe(43_650_00)
    expect(created[0]?.payeeName).toBe('ประยุทธ์ บุญมี')
    expect(created[0]?.category).toBe('คอมมิชชั่น')
    expect(created[0]?.periodLabel).toBe('มิถุนายน 2569')
    expect(created[0]?.documentStatus).toBe('complete')
    expect(created[0]?.costCenterId).toBeNull()

    await expenses.syncExpenseRecordsFromPayout(ctx, seeded.batchId)
    expect(await db().expenseRecord.count({ where: { payoutBatchItemId: seeded.itemId } })).toBe(1)
  })

  it('เอกสารไม่ครบ ⇒ documentStatus = incomplete + ขึ้น exception ของไฟล์ 34 อัตโนมัติ (ครั้งเดียว)', async () => {
    const seeded = await seedBatch({ expenseType: 'hotel', receipt: null })
    const created = await expenses.syncExpenseRecordsFromPayout(ctx, seeded.batchId)
    expect(created[0]?.documentStatus).toBe('incomplete')

    const exceptions = await db().exception.findMany({
      where: { organizationId: ORG_ID, sourceRef: created[0]?.id },
    })
    expect(exceptions).toHaveLength(1)
    expect(exceptions[0]?.level).toBe('warning')
    expect(exceptions[0]?.sourceModule).toBe('expense')
    expect(exceptions[0]?.status).toBe('open')

    // sync ซ้ำต้องไม่สร้าง exception ซ้ำ (job รันซ้ำได้ — `91`)
    await expenses.syncExpenseRecordsFromPayout(ctx, seeded.batchId)
    expect(await db().exception.count({ where: { organizationId: ORG_ID, sourceRef: created[0]?.id } })).toBe(1)
  })

  it('จ่ายจริงผ่านการยืนยันด้วยมือ (ไฟล์ 17) ⇒ บัญชีค่าใช้จ่ายเกิดเองโดยไม่ต้องเรียก sync แยก', async () => {
    const seeded = await seedBatch({ status: 'file_generated' })
    const payout = await import('@/lib/payout/queries')
    await payout.completePayoutBatch({ actor: accountant, meta }, seeded.batchId, {
      reason: 'ธนาคารยืนยันโอนสำเร็จ (เทสต์ 4.4)',
    })

    expect(await db().expenseRecord.count({ where: { payoutBatchItemId: seeded.itemId } })).toBe(1)
  })
})

suite('Phase 4.4 — map Cost Center (`32` §10/§11)', () => {
  it('รายการ manual map ได้ + ลง audit พร้อมเหตุผล', async () => {
    const seeded = await seedBatch()
    const [record] = await expenses.syncExpenseRecordsFromPayout(ctx, seeded.batchId)

    const updated = await expenses.mapExpenseCostCenter(ctx, record?.id ?? '', {
      costCenterId: COST_CENTER_ID,
      reason: 'ค่าคอมมิชชั่นทีมกลาง (เทสต์ 4.4)',
    })
    expect(updated.costCenterId).toBe(COST_CENTER_ID)
    expect(updated.costCenterLabel).toBe('CC-001 — ส่วนกลางสำนักงาน')
    expect(updated.mappingRule).toBe('manual')

    const audit = await db().auditLog.findFirst({
      where: { organizationId: ORG_ID, targetType: 'expense_records', targetId: record?.id, action: 'update' },
      orderBy: { createdAt: 'desc' },
    })
    expect(audit?.reason).toBe('ค่าคอมมิชชั่นทีมกลาง (เทสต์ 4.4)')
  })

  it('ไม่ระบุเหตุผล = ไม่ผ่านนโยบาย audit (`90` §13)', async () => {
    const seeded = await seedBatch()
    const [record] = await expenses.syncExpenseRecordsFromPayout(ctx, seeded.batchId)

    await expect(
      expenses.mapExpenseCostCenter(ctx, record?.id ?? '', { costCenterId: COST_CENTER_ID, reason: '' }),
    ).rejects.toThrow()
  })

  it('ศูนย์ต้นทุนที่ไม่มีอยู่ ⇒ COST_CENTER_NOT_FOUND · รายการที่ไม่มีอยู่ ⇒ EXPENSE_RECORD_NOT_FOUND', async () => {
    const seeded = await seedBatch()
    const [record] = await expenses.syncExpenseRecordsFromPayout(ctx, seeded.batchId)

    await expectCode(
      () =>
        expenses.mapExpenseCostCenter(ctx, record?.id ?? '', {
          costCenterId: MISSING_COST_CENTER_ID,
          reason: 'ทดสอบ',
        }),
      'COST_CENTER_NOT_FOUND',
    )
    await expectCode(
      () =>
        expenses.mapExpenseCostCenter(ctx, MISSING_COST_CENTER_ID, {
          costCenterId: COST_CENTER_ID,
          reason: 'ทดสอบ',
        }),
      'EXPENSE_RECORD_NOT_FOUND',
    )
  })

  it('งวดที่ locked ⇒ map ไม่ได้ ต้องไป Adjustment (`13` §6.11)', async () => {
    const seeded = await seedBatch()
    const [record] = await expenses.syncExpenseRecordsFromPayout(ctx, seeded.batchId)

    await setPeriodStatus('locked')
    try {
      await expectCode(
        () =>
          expenses.mapExpenseCostCenter(ctx, record?.id ?? '', {
            costCenterId: COST_CENTER_ID,
            reason: 'ทดสอบล็อกงวด',
          }),
        'PERIOD_LOCKED_DIRECT_EDIT',
      )
    } finally {
      await setPeriodStatus('collecting')
    }
  })
})

suite('Phase 4.4 — รายการและตัวกรอง (`32` §8)', () => {
  it('list คืนยอดรวม + ตัวเลือกศูนย์ต้นทุน + กรองเฉพาะเอกสารไม่ครบได้', async () => {
    const all = await expenses.listExpenseRecords(accountant, {})
    expect(all.items.length).toBeGreaterThan(0)
    expect(all.summary.grossSatang).toBe(all.items.reduce((sum, item) => sum + item.grossSatang, 0))
    expect(all.costCenters.some((option) => option.id === COST_CENTER_ID)).toBe(true)

    const incomplete = await expenses.listExpenseRecords(accountant, { documentStatus: 'incomplete' })
    expect(incomplete.items.every((item) => item.documentStatus === 'incomplete')).toBe(true)
    expect(incomplete.items.length).toBeGreaterThan(0)

    const unmapped = await expenses.listExpenseRecords(accountant, { unmappedOnly: true })
    expect(unmapped.items.every((item) => item.costCenterId === null)).toBe(true)
  })
})

suite('Phase 4.4 — ข้อซักถามจากสำนักงานบัญชี (`36` §15)', () => {
  it('สร้างแล้วเป็น open → ตอบแล้วเป็น answered พร้อมเวลาและผู้ตอบ', async () => {
    const created = await questions.createAccountantQuestion(ctx, {
      questionText: 'เงินเข้า 12,500 บาท วันที่ 22/06/2569 มาจากบริษัทใด',
    })
    expect(created.isResolved).toBe(false)
    expect(created.status).toBe('open')

    const answered = await questions.answerAccountantQuestion(ctx, created.id, {
      answerText: 'เป็นเงินรับจากบริษัท เร็วดี จำกัด — ตั้งรับ AR ให้แล้ว',
    })
    expect(answered.isResolved).toBe(true)
    expect(answered.status).toBe('answered')
    expect(answered.answeredAt).not.toBeNull()
    expect(answered.answeredByName).toBe('บัญชี 4.4')
  })

  it('ตอบซ้ำไม่ได้ ⇒ ACCOUNTANT_QUESTION_ALREADY_ANSWERED · ไม่มีคำถาม ⇒ 404', async () => {
    const created = await questions.createAccountantQuestion(ctx, { questionText: 'คำถามที่ตอบไปแล้ว' })
    await questions.answerAccountantQuestion(ctx, created.id, { answerText: 'ตอบครั้งแรก' })

    await expectCode(
      () => questions.answerAccountantQuestion(ctx, created.id, { answerText: 'ตอบซ้ำ' }),
      'ACCOUNTANT_QUESTION_ALREADY_ANSWERED',
    )
    await expectCode(
      () => questions.answerAccountantQuestion(ctx, MISSING_COST_CENTER_ID, { answerText: 'x' }),
      'ACCOUNTANT_QUESTION_NOT_FOUND',
    )
  })

  it('list เรียงค้างตอบขึ้นก่อน + กรองตามสถานะได้', async () => {
    await questions.createAccountantQuestion(ctx, { questionText: 'คำถามที่ยังไม่ตอบ (เทสต์เรียงลำดับ)' })

    const all = await questions.listAccountantQuestions(accountant, {})
    expect(all.items[0]?.isResolved).toBe(false)
    expect(all.summary.total).toBe(all.summary.open + all.summary.answered)

    const openOnly = await questions.listAccountantQuestions(accountant, { status: 'open' })
    expect(openOnly.items.every((item) => !item.isResolved)).toBe(true)
  })
})
