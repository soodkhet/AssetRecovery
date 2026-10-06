import { PrismaPg } from '@prisma/adapter-pg'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import type { SessionUser } from '@/lib/auth/types'
import { PrismaClient } from '@/lib/generated/prisma/client'
import { markAdvancePaidOut } from '@/tests/helpers/advance-paid-out'

/**
 * เทสต์ระดับ DB — ใบรับรองแทนใบเสร็จรับเงิน (มติ PO 06/10/2569 U103) + เอกสารเงินทดรอง (U100)
 *  · ออกเลข CRT ต่อเนื่องไม่ซ้ำภายใต้ concurrency (ตัวนับ `substitute_receipt` ของ U102) · `document_number_max_seq` รู้จักตาราง
 *  · ผูกใบเบิกค่าที่พัก (ติ๊ก "ไม่มีใบเสร็จ") / ผูกการเคลียร์เงินทดรอง · CHECK exactly-one (DEC-004)
 *  · เพดานต่อใบ/ต่อคนต่อเดือน (ใบของใบเบิกที่ถูกปฏิเสธไม่นับ) — ทะลุพร้อมกันไม่ได้
 *  · อัปโหลดฉบับเซ็น → เป็นใบเสร็จของใบเบิก · ซ้ำไม่ได้ · ยามอนุมัติ · DB ห้ามแก้ใบที่ออกแล้ว
 *  · scope: เจ้าของ/การเงิน/ผู้จัดการทีม เห็น · คนอื่น 404
 *  · U107: ยกเลิก (เหตุผลบังคับ · ครั้งเดียว · ไม่นับเพดาน · ห้ามลบ · ใบเบิกอนุมัติแล้วยกเลิกไม่ได้) + ออกใบใหม่แทน
 *
 * ⚠️ ต้องตั้ง `DATABASE_URL = TEST_DATABASE_URL` **ก่อน** import service (กับดัก 2026-08-14)
 */

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
if (!url) console.warn('[substitute-receipts.db.test] ข้ามเทสต์ระดับ DB — ไม่มี TEST_DATABASE_URL')

const ORG_ID = '00000000-0000-4000-8000-000000c70000'
const ROLE_FINANCE = '00000000-0000-4000-8000-000000c70001'
const ROLE_AGENT = '00000000-0000-4000-8000-000000c70002'
const FINANCE_ID = '00000000-0000-4000-8000-000000c70003'
const AGENT_ID = '00000000-0000-4000-8000-000000c70004'
const OTHER_ID = '00000000-0000-4000-8000-000000c70005'
const TEAM_ID = '00000000-0000-4000-8000-000000c70006'
const PAYEE_ID = '00000000-0000-4000-8000-000000c70007'
const OTHER_PAYEE_ID = '00000000-0000-4000-8000-000000c70008'
const ADV_ID = '00000000-0000-4000-8000-000000c700a1'
const TAX_PROFILE_ID = '00000000-0000-4000-8000-000000c700b1'

/** วันที่ออกใบคงที่ (ต.ค. 2569 เวลาไทย) — เลข CRT-2569-… */
const AT = new Date('2026-10-06T03:00:00Z')

let client: PrismaClient | null = null
let receipts: typeof import('@/lib/substitute-receipts/queries')
let advances: typeof import('@/lib/advances/queries')
let advanceDocs: typeof import('@/lib/advances/doc-queries')
let fieldExpenses: typeof import('@/lib/field/expense-queries')
let approvals: typeof import('@/lib/compensation/approval-queries')

function db(): PrismaClient {
  if (!url) throw new Error('ไม่มี TEST_DATABASE_URL')
  if (!client) {
    assertLocalTestDatabase(url)
    client = new PrismaClient({ adapter: new PrismaPg({ connectionString: url }) })
  }
  return client
}

const meta = { ipAddress: null, userAgent: null }

function userOf(id: string, capabilities: SessionUser['capabilities'], extra: Partial<SessionUser> = {}): SessionUser {
  return {
    id,
    organizationId: ORG_ID,
    supabaseUid: `uid-${id}`,
    email: `${id}@test.local`,
    fullName: 'ผู้ใช้ U103',
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
    ...extra,
  }
}

const finance = userOf(FINANCE_ID, { approve_advance: 'manage', approve_expense_finance: 'manage' })
/** การเงินฝั่งเงินทดรองอย่างเดียว — ไม่เห็นคิวใบเบิก */
const advanceOnlyFinance = userOf(FINANCE_ID, { approve_advance: 'manage' })
const agent = userOf(
  AGENT_ID,
  { perform_field_work: 'manage', request_advance: 'manage' },
  { roleId: ROLE_AGENT, roleName: 'พนักงานติดตามทรัพย์', roleGroup: 'outsource', teamId: TEAM_ID },
)
const otherAgent = userOf(
  OTHER_ID,
  { perform_field_work: 'manage', request_advance: 'manage' },
  { roleId: ROLE_AGENT, roleName: 'พนักงานติดตามทรัพย์', roleGroup: 'outsource' },
)
const manager = userOf(
  OTHER_ID,
  { approve_expense_manager: 'manage' },
  { scope: { kind: 'team', teamIds: [TEAM_ID], companyId: null, userId: OTHER_ID } },
)

function codeOf(error: unknown): string {
  return (error as { code?: string }).code ?? String(error)
}

async function expectCode(run: () => Promise<unknown>, code: string): Promise<void> {
  await expect(run()).rejects.toSatisfy((error: unknown) => codeOf(error) === code, `ต้องได้ error code ${code}`)
}

let expenseSeq = 0

async function seedHotelExpense(payeeId = PAYEE_ID, status = 'pending_approval', type = 'hotel'): Promise<string> {
  expenseSeq += 1
  const id = `00000000-0000-4c70-8000-${String(expenseSeq).padStart(12, '0')}`
  await db().$executeRawUnsafe(`
    INSERT INTO expenses (id, organization_id, payee_id, expense_type, gross_satang, expense_date, status,
                          calculation_source, created_by)
    VALUES ('${id}', '${ORG_ID}', '${payeeId}', '${type}', 10000, '2026-10-05', '${status}', 'receipt', '${AGENT_ID}')
  `)
  return id
}

function line(amountSatang: number, description = 'ค่าผ่านทางพิเศษ ด่านบางนา') {
  return { lineDate: new Date('2026-10-03T00:00:00Z'), description, amountSatang, note: null }
}

async function issueFor(expenseId: string, amounts: number[], payeeId = PAYEE_ID, at = AT) {
  return db().$transaction((tx) =>
    receipts.issueSubstituteReceipt(tx as never, { actor: agent, meta }, {
      organizationId: ORG_ID,
      payeeId,
      link: { kind: 'expense', expenseId },
      lines: amounts.map((amount) => line(amount)),
      at,
    }),
  )
}

async function reset(): Promise<void> {
  const tx = db()
  // ใบที่ยกเลิกแล้วลบไม่ได้ด้วย trigger (มติ PO U107) — ปิดเฉพาะตอนล้างข้อมูลเทสต์
  await tx.$executeRawUnsafe(`ALTER TABLE substitute_receipts DISABLE TRIGGER trg_substitute_receipts_guard_delete`)
  try {
    await tx.$executeRawUnsafe(`DELETE FROM substitute_receipts WHERE organization_id = '${ORG_ID}'`)
  } finally {
    await tx.$executeRawUnsafe(`ALTER TABLE substitute_receipts ENABLE TRIGGER trg_substitute_receipts_guard_delete`)
  }
  await tx.$executeRawUnsafe(`DELETE FROM advance_returns WHERE organization_id = '${ORG_ID}'`)
  await tx.$executeRawUnsafe(`DELETE FROM payout_batch_items WHERE organization_id = '${ORG_ID}'`)
  await tx.$executeRawUnsafe(`DELETE FROM payout_batches WHERE organization_id = '${ORG_ID}'`)
  await tx.$executeRawUnsafe(`DELETE FROM expenses WHERE organization_id = '${ORG_ID}'`)
  await tx.$executeRawUnsafe(`DELETE FROM advances WHERE organization_id = '${ORG_ID}'`)
  await tx.$executeRawUnsafe(`DELETE FROM finance_policy_settings WHERE organization_id = '${ORG_ID}'`)
  await tx.$executeRawUnsafe(`DELETE FROM document_number_series WHERE organization_id = '${ORG_ID}'`)
  await tx.$executeRawUnsafe(`UPDATE payee_profiles SET tax_profile_id = NULL WHERE organization_id = '${ORG_ID}'`)
}

beforeAll(async () => {
  if (!url) return
  process.env.DATABASE_URL = url
  receipts = await import('@/lib/substitute-receipts/queries')
  advances = await import('@/lib/advances/queries')
  advanceDocs = await import('@/lib/advances/doc-queries')
  fieldExpenses = await import('@/lib/field/expense-queries')
  approvals = await import('@/lib/compensation/approval-queries')

  const tx = db()
  await tx.$executeRawUnsafe(`
    INSERT INTO organizations (id, name, tax_id, address)
    VALUES ('${ORG_ID}', 'U103Test', '9999999990103', 'ที่อยู่ทดสอบ U103') ON CONFLICT (id) DO NOTHING
  `)
  await tx.$executeRawUnsafe(`
    INSERT INTO roles (id, organization_id, name, role_group, is_seed) VALUES
      ('${ROLE_FINANCE}', '${ORG_ID}', 'การเงิน U103', 'system', false),
      ('${ROLE_AGENT}', '${ORG_ID}', 'พนักงานติดตามทรัพย์ U103', 'outsource', false)
    ON CONFLICT (id) DO NOTHING
  `)
  await tx.$executeRawUnsafe(`
    INSERT INTO users (id, organization_id, role_id, email, full_name, phone, status) VALUES
      ('${FINANCE_ID}', '${ORG_ID}', '${ROLE_FINANCE}', 'finance-u103@test.local', 'การเงิน U103', NULL, 'active'),
      ('${AGENT_ID}', '${ORG_ID}', '${ROLE_AGENT}', 'agent-u103@test.local', 'สมชาย ไม่มีใบเสร็จ', '0812345678', 'active'),
      ('${OTHER_ID}', '${ORG_ID}', '${ROLE_AGENT}', 'other-u103@test.local', 'คนอื่น U103', NULL, 'active')
    ON CONFLICT (id) DO NOTHING
  `)
  await tx.$executeRawUnsafe(`
    INSERT INTO teams (id, organization_id, name, side, provinces, status, created_by)
    VALUES ('${TEAM_ID}', '${ORG_ID}', 'ทีม U103', 'outsource', ARRAY['ชลบุรี'], 'active', '${FINANCE_ID}')
    ON CONFLICT (id) DO NOTHING
  `)
  await tx.$executeRawUnsafe(`UPDATE users SET team_id = '${TEAM_ID}' WHERE id = '${AGENT_ID}'`)
  await tx.$executeRawUnsafe(`
    INSERT INTO payee_profiles (id, organization_id, user_id, payee_type, national_id, address_detail,
                                address_province, address_postal_code, is_verified, created_by) VALUES
      ('${PAYEE_ID}', '${ORG_ID}', '${AGENT_ID}', 'individual', '1100100100011', '99/1', 'ชลบุรี', '20110', true, '${FINANCE_ID}'),
      ('${OTHER_PAYEE_ID}', '${ORG_ID}', '${OTHER_ID}', 'individual', NULL, NULL, NULL, NULL, true, '${FINANCE_ID}')
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

suite('เลข CRT', () => {
  it('ออกต่อเนื่องไม่ซ้ำภายใต้ concurrency (10 คำขอพร้อมกัน — คนละผู้จ่าย/คนละใบเบิก)', async () => {
    const expenseIds = await Promise.all(
      Array.from({ length: 10 }, (_, index) => seedHotelExpense(index % 2 === 0 ? PAYEE_ID : OTHER_PAYEE_ID)),
    )
    const issued = await Promise.all(
      expenseIds.map((id, index) => issueFor(id, [1_000], index % 2 === 0 ? PAYEE_ID : OTHER_PAYEE_ID)),
    )
    const numbers = issued.map((row) => row.receiptNumber).sort()
    expect(numbers).toEqual(Array.from({ length: 10 }, (_, index) => `CRT-2569-${String(index + 1).padStart(4, '0')}`))

    const max = await db().$queryRawUnsafe<{ max: number }[]>(
      `SELECT document_number_max_seq('${ORG_ID}'::uuid, 'substitute_receipt', 'CRT-2569-') AS max`,
    )
    expect(Number(max[0]?.max)).toBe(10)
  })

  it('ยอดรวม = ผลรวมบรรทัด · บรรทัดเรียงลำดับ · audit การออกใบ', async () => {
    const expenseId = await seedHotelExpense()
    const issued = await issueFor(expenseId, [7_000, 4_000, 6_000])
    expect(issued.totalSatang).toBe(17_000)
    const lines = await db().substituteReceiptLine.findMany({
      where: { substituteReceiptId: issued.id },
      orderBy: { lineNo: 'asc' },
    })
    expect(lines.map((row) => [row.lineNo, row.amountSatang])).toEqual([
      [1, 7_000],
      [2, 4_000],
      [3, 6_000],
    ])
    const audit = await db().auditLog.findFirst({ where: { targetType: 'substitute_receipts', targetId: issued.id } })
    expect(audit?.action).toBe('create')
  })
})

suite('ยามระดับ DB', () => {
  it('ผูกได้อย่างใดอย่างหนึ่งเท่านั้น (ไม่ผูกเลย = ผิด CHECK)', async () => {
    await expect(
      db().$executeRawUnsafe(`
        INSERT INTO substitute_receipts (organization_id, receipt_number, payee_id, issue_date, total_satang, created_by, updated_at)
        VALUES ('${ORG_ID}', 'CRT-X-1', '${PAYEE_ID}', '2026-10-06', 100, '${AGENT_ID}', NOW())
      `),
    ).rejects.toThrow(/chk_substitute_receipts_exactly_one_link/)
  })

  it('ออกแล้วแก้ยอดไม่ได้ · ใบเบิกเดียวมีได้ใบเดียว', async () => {
    const expenseId = await seedHotelExpense()
    const issued = await issueFor(expenseId, [5_000])
    await expect(
      db().$executeRawUnsafe(`UPDATE substitute_receipts SET total_satang = 1 WHERE id = '${issued.id}'`),
    ).rejects.toThrow(/แก้ไขไม่ได้/)
    await expect(issueFor(expenseId, [1_000])).rejects.toThrow()
  })
})

suite('เพดานต่อใบ / ต่อคนต่อเดือน (ค่าเริ่มต้น ฿500 / ฿3,000)', () => {
  it('ต่อใบ: ฿500 ผ่าน · ฿500.01 บล็อก', async () => {
    await issueFor(await seedHotelExpense(), [30_000, 20_000])
    await expectCode(() => issueFor(seedHotelExpenseSync(), [50_001]), 'SUBSTITUTE_RECEIPT_EXCEEDS_LIMIT')
  })

  it('ต่อเดือน: ครบ ฿3,000 แล้วใบถัดไปบล็อก · ใบของใบเบิกที่ถูกปฏิเสธไม่นับ · เดือนถัดไปเริ่มใหม่', async () => {
    const ids: string[] = []
    for (let index = 0; index < 6; index += 1) {
      const id = await seedHotelExpense()
      ids.push(id)
      await issueFor(id, [50_000])
    }
    const next = await seedHotelExpense()
    await expectCode(() => issueFor(next, [100]), 'SUBSTITUTE_RECEIPT_EXCEEDS_LIMIT')

    await db().expense.update({ where: { id: ids[0] ?? '' }, data: { status: 'rejected' } })
    await expect(issueFor(next, [50_000])).resolves.toMatchObject({ totalSatang: 50_000 })

    // พฤศจิกายน = เดือนใหม่
    await expect(issueFor(await seedHotelExpense(), [50_000], PAYEE_ID, new Date('2026-11-02T03:00:00Z'))).resolves.toBeTruthy()
    // ผู้จ่ายคนอื่นไม่ถูกนับรวม
    await expect(issueFor(await seedHotelExpense(OTHER_PAYEE_ID), [50_000], OTHER_PAYEE_ID)).resolves.toBeTruthy()
  })

  it('ค่าตั้งขององค์กรมีผลทันที', async () => {
    await db().financePolicySettings.create({
      data: { organizationId: ORG_ID, substituteReceiptMaxPerDocSatang: 10_000, substituteReceiptMaxPerMonthSatang: 15_000 },
    })
    await expectCode(() => issueFor(seedHotelExpenseSync(), [10_001]), 'SUBSTITUTE_RECEIPT_EXCEEDS_LIMIT')
    await issueFor(await seedHotelExpense(), [10_000])
    await expectCode(async () => issueFor(await seedHotelExpense(), [5_001]), 'SUBSTITUTE_RECEIPT_EXCEEDS_LIMIT')
  })

  it('คำขอพร้อมกันของผู้จ่ายคนเดียวทะลุเพดานต่อเดือนไม่ได้ (6 × ฿500 + 4 พร้อมกัน → ผ่านเท่าที่เหลือ)', async () => {
    const ids = await Promise.all(Array.from({ length: 8 }, () => seedHotelExpense()))
    const results = await Promise.allSettled(ids.map((id) => issueFor(id, [50_000])))
    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(6)
    const total = await db().substituteReceipt.aggregate({ where: { organizationId: ORG_ID }, _sum: { totalSatang: true } })
    expect(total._sum.totalSatang).toBe(300_000)
  })
})

/** id ใบเบิกสำหรับกรณีที่คาดว่าโดนเพดาน — ไม่ต้องมีแถวจริง (ยามเพดานตรวจก่อน INSERT ใบรับรองเสมอ) */
function seedHotelExpenseSync(): string {
  expenseSeq += 1
  return `00000000-0000-4c70-9000-${String(expenseSeq).padStart(12, '0')}`
}

suite('ใบเบิกค่าที่พัก "ไม่มีใบเสร็จ"', () => {
  it('ส่งคำขอเบิกพร้อมรายการ → ใบเบิก (ยังไม่มีไฟล์ใบเสร็จ) + ใบรับรอง CRT รอฉบับเซ็น', async () => {
    const created = await fieldExpenses.submitHotelClaim(
      agent,
      {
        expenseDate: new Date('2026-10-05T00:00:00Z'),
        amountSatang: 11_000,
        receiptFileUrl: null,
        substituteReceipt: { lines: [line(7_000), line(4_000, 'ค่ารถจักรยานยนต์รับจ้าง')] },
        sharedWithUserId: null,
        note: null,
      },
      { actor: agent, meta },
    )
    expect(created.receiptFileUrl).toBeNull()
    expect(created.substituteReceipt).toMatchObject({ status: 'pending_signature', totalSatang: 11_000 })
    expect(created.substituteReceipt?.receiptNumber).toMatch(/^CRT-\d{4}-0001$/)
  })

  it('ไม่มีทั้งใบเสร็จและรายการ = HOTEL_CLAIM_FIELD_REQUIRED', async () => {
    await expectCode(
      () =>
        fieldExpenses.submitHotelClaim(
          agent,
          { expenseDate: new Date('2026-10-05T00:00:00Z'), amountSatang: 11_000, receiptFileUrl: null, sharedWithUserId: null, note: null },
          { actor: agent, meta },
        ),
      'HOTEL_CLAIM_FIELD_REQUIRED',
    )
  })
})

suite('อัปโหลดฉบับเซ็น + ยามอนุมัติ', () => {
  it('ก่อนเซ็น = อนุมัติไม่ได้ · เซ็นแล้ว = ไฟล์เป็นใบเสร็จของใบเบิก · อัปโหลดซ้ำไม่ได้', async () => {
    const expenseId = await seedHotelExpense()
    const issued = await issueFor(expenseId, [9_000])
    await expectCode(() => receipts.assertExpenseSubstituteReceiptSigned(db() as never, expenseId), 'SUBSTITUTE_RECEIPT_NOT_SIGNED')

    const path = `substitute-receipts/${issued.id}/signed/11111111-1111-4111-8111-111111111111.pdf`
    const signed = await receipts.attachSignedSubstituteReceipt({ actor: agent, meta }, issued.id, { signedFilePath: path })
    expect(signed.status).toBe('signed')
    const expense = await db().expense.findUniqueOrThrow({ where: { id: expenseId } })
    expect(expense.receiptFileUrl).toBe(path)
    expect(expense.receiptFileHash).toHaveLength(64)
    await expect(receipts.assertExpenseSubstituteReceiptSigned(db() as never, expenseId)).resolves.toBeUndefined()

    await expectCode(
      () => receipts.attachSignedSubstituteReceipt({ actor: agent, meta }, issued.id, { signedFilePath: path }),
      'SUBSTITUTE_RECEIPT_ALREADY_SIGNED',
    )
    await expect(
      db().$executeRawUnsafe(`UPDATE substitute_receipts SET signed_file_path = 'x' WHERE id = '${issued.id}'`),
    ).rejects.toThrow(/เปลี่ยนไฟล์ไม่ได้/)
  })

  it('คนอื่นอัปโหลดแทนไม่ได้ (ไม่ leak) · ผู้จัดการทีมดูได้แต่อัปโหลดไม่ได้', async () => {
    const issued = await issueFor(await seedHotelExpense(), [9_000])
    const path = `substitute-receipts/${issued.id}/signed/22222222-2222-4222-8222-222222222222.pdf`
    await expectCode(
      () => receipts.attachSignedSubstituteReceipt({ actor: otherAgent, meta }, issued.id, { signedFilePath: path }),
      'SUBSTITUTE_RECEIPT_NOT_FOUND',
    )
    await expectCode(
      () => receipts.attachSignedSubstituteReceipt({ actor: manager, meta }, issued.id, { signedFilePath: path }),
      'SUBSTITUTE_RECEIPT_NOT_FOUND',
    )
  })
})

suite('scope การเห็นใบรับรอง (PDF)', () => {
  it('ใบของใบเบิก: เจ้าของ · การเงินขั้นอนุมัติ · ผู้จัดการทีม เห็น · คนอื่น/การเงินฝั่งเงินทดรอง 404', async () => {
    const issued = await issueFor(await seedHotelExpense(), [9_000])
    await expect(receipts.getSubstituteReceiptSource(agent, issued.id)).resolves.toMatchObject({ receiptNumber: issued.receiptNumber })
    await expect(receipts.getSubstituteReceiptSource(finance, issued.id)).resolves.toBeTruthy()
    await expect(receipts.getSubstituteReceiptSource(manager, issued.id)).resolves.toBeTruthy()
    await expectCode(() => receipts.getSubstituteReceiptSource(otherAgent, issued.id), 'SUBSTITUTE_RECEIPT_NOT_FOUND')
    await expectCode(() => receipts.getSubstituteReceiptSource(advanceOnlyFinance, issued.id), 'SUBSTITUTE_RECEIPT_NOT_FOUND')
  })
})

suite('เคลียร์เงินทดรอง "ไม่มีใบเสร็จ" + เอกสารเงินทดรอง', () => {
  async function seedPaidAdvance(): Promise<void> {
    await db().$executeRawUnsafe(`
      INSERT INTO advances (id, organization_id, payee_id, requested_satang, approved_satang, purpose,
                            due_clear_date, status, approved_at, approved_by, created_by)
      VALUES ('${ADV_ID}', '${ORG_ID}', '${PAYEE_ID}', 300000, 300000, 'ค่าเดินทาง U103',
              '2026-12-31', 'approved', '2026-10-01T03:00:00Z', '${FINANCE_ID}', '${AGENT_ID}')
    `)
    await markAdvancePaidOut(db(), { organizationId: ORG_ID, advanceId: ADV_ID, actorId: FINANCE_ID })
  }

  it('เคลียร์ยอดพร้อมรายการ → CRT ผูกเงินทดรอง · ใบเบิก/ใบรับคืน: เจ้าของ+การเงินเห็น คนอื่น 404', async () => {
    await seedPaidAdvance()
    const settled = await advances.settleAdvance({ actor: agent, meta }, ADV_ID, {
      usedSatang: 250_000,
      receiptFileUrl: null,
      note: null,
      returnMethod: 'separate',
      substituteReceipt: { lines: [line(7_000), line(4_000, 'ค่ารถจักรยานยนต์รับจ้าง')] },
    })
    expect(settled.substituteReceipt).toMatchObject({ status: 'pending_signature', totalSatang: 11_000 })
    const crt = await db().substituteReceipt.findFirstOrThrow({ where: { advanceId: ADV_ID } })
    expect(crt.expenseId).toBeNull()

    // การเงินฝั่งเงินทดรองเห็นใบของเงินทดรอง
    await expect(receipts.getSubstituteReceiptSource(advanceOnlyFinance, crt.id)).resolves.toBeTruthy()

    const source = await advanceDocs.getAdvanceRequestDocSource(agent, ADV_ID)
    expect(source).toMatchObject({ status: 'cleared', substituteReceiptNumber: crt.receiptNumber })
    await expect(advanceDocs.getAdvanceRequestDocSource(finance, ADV_ID)).resolves.toBeTruthy()
    await expectCode(() => advanceDocs.getAdvanceRequestDocSource(otherAgent, ADV_ID), 'ADVANCE_NOT_FOUND')

    // รับคืนแยก ฿500 → ใบรับคืน RAV
    await advances.recordAdvanceSeparateReturn({ actor: finance, meta }, ADV_ID, {
      channel: 'cash',
      amountSatang: 50_000,
      receivedDate: new Date('2026-10-08T00:00:00Z'),
      evidenceFilePath: `advances/${ADV_ID}/returns/33333333-3333-4333-8333-333333333333.jpg`,
      note: null,
    })
    const returnRow = await db().advanceReturn.findFirstOrThrow({ where: { advanceId: ADV_ID } })
    const returnDoc = await advanceDocs.getAdvanceReturnDocSource(agent, ADV_ID, returnRow.id)
    expect(returnDoc).toMatchObject({ returnNumber: returnRow.returnNumber, amountSatang: 50_000, collectedBeforeSatang: 0 })
    await expectCode(() => advanceDocs.getAdvanceReturnDocSource(otherAgent, ADV_ID, returnRow.id), 'ADVANCE_NOT_FOUND')
    await expectCode(
      () => advanceDocs.getAdvanceReturnDocSource(finance, ADV_ID, '00000000-0000-4000-8000-0000000000ff'),
      'ADVANCE_NOT_FOUND',
    )
  })
})

suite('U107 — ยกเลิกใบรับรองแทนใบเสร็จ + ออกใบใหม่แทน (มติ PO 06/10/2569)', () => {
  const ctxOf = (actor: SessionUser) => ({ actor, meta })

  it('เหตุผลบังคับ (CANCEL_REQUIRES_REASON) · ยกเลิกแล้วเก็บใบเดิม + เวลา/ผู้ยกเลิก/เหตุผล + audit · ยกเลิกซ้ำไม่ได้', async () => {
    const issued = await issueFor(await seedHotelExpense(), [10_000])
    await expectCode(() => receipts.cancelSubstituteReceipt(ctxOf(agent), issued.id, { reason: '   ' }), 'CANCEL_REQUIRES_REASON')
    await expectCode(() => receipts.cancelSubstituteReceipt(ctxOf(agent), issued.id, {}), 'CANCEL_REQUIRES_REASON')

    const cancelled = await receipts.cancelSubstituteReceipt(ctxOf(agent), issued.id, { reason: 'กรอกรายการผิดวัน' })
    expect(cancelled).toMatchObject({ status: 'cancelled', cancelReason: 'กรอกรายการผิดวัน' })
    expect(cancelled.cancelledAt).not.toBeNull()
    const row = await db().substituteReceipt.findUniqueOrThrow({ where: { id: issued.id } })
    expect(row).toMatchObject({ status: 'cancelled', cancelledBy: AGENT_ID, deletedAt: null })

    const audit = await db().auditLog.findFirstOrThrow({
      where: { targetType: 'substitute_receipts', targetId: issued.id, action: 'status_change' },
    })
    expect(audit.reason).toBe('กรอกรายการผิดวัน')
    expect(audit.afterData).toMatchObject({ status: 'cancelled', events: ['substitute_receipt.cancelled'] })

    await expectCode(
      () => receipts.cancelSubstituteReceipt(ctxOf(finance), issued.id, { reason: 'ยกเลิกซ้ำอีกครั้ง' }),
      'SUBSTITUTE_RECEIPT_NOT_CANCELLABLE',
    )
    // PDF ยังพิมพ์ได้ (ใบเดิมห้ามลบ) พร้อมข้อมูลการยกเลิก
    const source = receipts.toSubstituteReceiptDocSource(await receipts.getSubstituteReceiptSource(agent, issued.id))
    expect(source.cancellation?.reason).toBe('กรอกรายการผิดวัน')
  })

  it('ใบที่ยกเลิกไม่นับเพดานต่อเดือน: ใช้เต็ม ฿3,000 → ยกเลิกใบ ฿500 → ออกได้อีก ฿500', async () => {
    const issuedIds: string[] = []
    for (let index = 0; index < 6; index += 1) issuedIds.push((await issueFor(await seedHotelExpense(), [50_000])).id)
    await expectCode(() => issueFor(seedHotelExpenseSync(), [100]), 'SUBSTITUTE_RECEIPT_EXCEEDS_LIMIT')
    await receipts.cancelSubstituteReceipt(ctxOf(finance), issuedIds[0]!, { reason: 'ได้ใบเสร็จจริงมาแล้ว' })
    await expect(issueFor(await seedHotelExpense(), [50_000])).resolves.toMatchObject({ totalSatang: 50_000 })
  })

  it('ใบเบิกอนุมัติจ่ายแล้ว ⇒ ยกเลิก/ออกใหม่ไม่ได้ (SUBSTITUTE_RECEIPT_NOT_CANCELLABLE) แม้เป็นการเงิน', async () => {
    const expenseId = await seedHotelExpense()
    const issued = await issueFor(expenseId, [10_000])
    await db().$executeRawUnsafe(`UPDATE expenses SET status = 'approved' WHERE id = '${expenseId}'`)
    await expectCode(
      () => receipts.cancelSubstituteReceipt(ctxOf(finance), issued.id, { reason: 'ขอยกเลิกหลังอนุมัติ' }),
      'SUBSTITUTE_RECEIPT_NOT_CANCELLABLE',
    )
    expect((await db().substituteReceipt.findUniqueOrThrow({ where: { id: issued.id } })).status).toBe('pending_signature')
  })

  it('สิทธิ์: เจ้าของ/การเงิน ยกเลิกได้ · ผู้จัดการทีม/คนอื่น 404 (ไม่ leak) · เงินทดรอง: เจ้าของยกเลิกเองไม่ได้', async () => {
    const issued = await issueFor(await seedHotelExpense(), [10_000])
    await expectCode(
      () => receipts.cancelSubstituteReceipt(ctxOf(manager), issued.id, { reason: 'ผู้จัดการขอยกเลิก' }),
      'SUBSTITUTE_RECEIPT_NOT_FOUND',
    )
    await expectCode(
      () => receipts.cancelSubstituteReceipt(ctxOf(otherAgent), issued.id, { reason: 'คนอื่นขอยกเลิก' }),
      'SUBSTITUTE_RECEIPT_NOT_FOUND',
    )
    await expect(
      receipts.cancelSubstituteReceipt(ctxOf(finance), issued.id, { reason: 'การเงินตรวจพบรายการซ้ำ' }),
    ).resolves.toMatchObject({ status: 'cancelled' })

    await db().$executeRawUnsafe(`
      INSERT INTO advances (id, organization_id, payee_id, requested_satang, approved_satang, used_satang, purpose,
                            due_clear_date, status, approved_at, approved_by, cleared_at, return_method, created_by)
      VALUES ('${ADV_ID}', '${ORG_ID}', '${PAYEE_ID}', 300000, 300000, 250000, 'ค่าเดินทาง U107',
              '2026-12-31', 'cleared', '2026-10-01T03:00:00Z', '${FINANCE_ID}', '2026-10-05T03:00:00Z', 'separate', '${AGENT_ID}')
    `)
    const advanceCrt = await db().$transaction((tx) =>
      receipts.issueSubstituteReceipt(tx as never, ctxOf(agent), {
        organizationId: ORG_ID,
        payeeId: PAYEE_ID,
        link: { kind: 'advance', advanceId: ADV_ID },
        lines: [line(11_000)],
        at: AT,
      }),
    )
    await expectCode(
      () => receipts.cancelSubstituteReceipt(ctxOf(agent), advanceCrt.id, { reason: 'เจ้าของขอยกเลิกเอง' }),
      'SUBSTITUTE_RECEIPT_NOT_FOUND',
    )
    await expect(
      receipts.cancelSubstituteReceipt(ctxOf(advanceOnlyFinance), advanceCrt.id, { reason: 'การเงินยกเลิกใบเคลียร์ยอด' }),
    ).resolves.toMatchObject({ status: 'cancelled' })
    // ออกใบใหม่แทนให้เงินทดรองเดิม (ยอดไม่เกินยอดใช้จริง)
    const reissued = await receipts.reissueSubstituteReceipt(ctxOf(advanceOnlyFinance), advanceCrt.id, [line(12_000)])
    expect(reissued).toMatchObject({ status: 'pending_signature', totalSatang: 12_000 })
    expect(await db().substituteReceipt.count({ where: { advanceId: ADV_ID } })).toBe(2)
  })

  it('ยกเลิกหลังอัปโหลดฉบับเซ็น ⇒ ล้างใบเสร็จของใบเบิก + ยามอนุมัติปัด → ออกใบใหม่แทน (เลขใหม่ ผูกใบเบิกเดิม) → เซ็นแล้วอนุมัติได้', async () => {
    const expenseId = await seedHotelExpense()
    const issued = await issueFor(expenseId, [10_000])
    const path = `substitute-receipts/${issued.id}/signed/44444444-4444-4444-8444-444444444444.pdf`
    await receipts.attachSignedSubstituteReceipt(ctxOf(agent), issued.id, { signedFilePath: path })

    await receipts.cancelSubstituteReceipt(ctxOf(agent), issued.id, { reason: 'เซ็นผิดช่อง ต้องออกใหม่' })
    const cancelledRow = await db().substituteReceipt.findUniqueOrThrow({ where: { id: issued.id } })
    expect(cancelledRow.signedFilePath).toBe(path) // ไฟล์เดิมเก็บไว้เป็นหลักฐาน
    expect((await db().expense.findUniqueOrThrow({ where: { id: expenseId } })).receiptFileUrl).toBeNull()
    await expectCode(() => receipts.assertExpenseSubstituteReceiptSigned(db() as never, expenseId), 'SUBSTITUTE_RECEIPT_NOT_SIGNED')
    await expectCode(
      () => receipts.attachSignedSubstituteReceipt(ctxOf(agent), issued.id, { signedFilePath: path }),
      'SUBSTITUTE_RECEIPT_ALREADY_SIGNED',
    )

    // ยอดใบใหม่ของค่าที่พักต้องเท่ายอดเบิก
    await expectCode(
      () => receipts.reissueSubstituteReceipt(ctxOf(agent), issued.id, [line(9_000)]),
      'SUBSTITUTE_RECEIPT_REISSUE_NOT_ALLOWED',
    )
    const reissued = await receipts.reissueSubstituteReceipt(ctxOf(agent), issued.id, [line(6_000), line(4_000)])
    expect(reissued.receiptNumber).not.toBe(issued.receiptNumber)
    expect(reissued).toMatchObject({ status: 'pending_signature', totalSatang: 10_000 })
    const reissueAudit = await db().auditLog.findFirstOrThrow({
      where: { targetType: 'substitute_receipts', targetId: reissued.id, action: 'update' },
    })
    expect(reissueAudit.afterData).toMatchObject({ replaces_receipt_number: issued.receiptNumber })

    // มีใบที่ใช้งานอยู่แล้ว ⇒ ออกซ้ำจากใบเดิมไม่ได้ · ใบใหม่ยังไม่ยกเลิก ⇒ ออกแทนจากใบใหม่ไม่ได้
    await expectCode(
      () => receipts.reissueSubstituteReceipt(ctxOf(agent), issued.id, [line(10_000)]),
      'SUBSTITUTE_RECEIPT_REISSUE_NOT_ALLOWED',
    )
    await expectCode(
      () => receipts.reissueSubstituteReceipt(ctxOf(agent), reissued.id, [line(10_000)]),
      'SUBSTITUTE_RECEIPT_REISSUE_NOT_ALLOWED',
    )

    // DTO ของใบเบิกแสดงใบที่ใช้งานอยู่ (ไม่ใช่ใบที่ยกเลิก)
    const rows = await db().substituteReceipt.findMany({ where: { expenseId }, select: receipts.substituteReceiptRefSelect })
    expect(receipts.substituteReceiptRefOf(rows)?.id).toBe(reissued.id)

    const newPath = `substitute-receipts/${reissued.id}/signed/55555555-5555-4555-8555-555555555555.pdf`
    await receipts.attachSignedSubstituteReceipt(ctxOf(agent), reissued.id, { signedFilePath: newPath })
    await expect(receipts.assertExpenseSubstituteReceiptSigned(db() as never, expenseId)).resolves.toBeUndefined()
  })

  it('ยาม DB: ยกเลิกแล้วแก้/คืนสถานะ/ลบไม่ได้ · ใบที่ออกแล้ว soft delete ไม่ได้ · ข้อมูลยกเลิกต้องครบ · unique ใบใช้งานต่อรายการ', async () => {
    const expenseId = await seedHotelExpense()
    const issued = await issueFor(expenseId, [10_000])
    await expect(
      db().$executeRawUnsafe(`UPDATE substitute_receipts SET deleted_at = now() WHERE id = '${issued.id}'`),
    ).rejects.toThrow(/ห้ามลบ/)
    await expect(
      db().$executeRawUnsafe(`UPDATE substitute_receipts SET status = 'cancelled' WHERE id = '${issued.id}'`),
    ).rejects.toThrow(/chk_substitute_receipts_cancel_shape/)

    await receipts.cancelSubstituteReceipt(ctxOf(finance), issued.id, { reason: 'ยกเลิกเพื่อทดสอบยาม' })
    await expect(
      db().$executeRawUnsafe(`UPDATE substitute_receipts SET status = 'pending_signature' WHERE id = '${issued.id}'`),
    ).rejects.toThrow(/ถูกยกเลิกแล้ว/)
    await expect(
      db().$executeRawUnsafe(`UPDATE substitute_receipts SET cancel_reason = 'แก้เหตุผล' WHERE id = '${issued.id}'`),
    ).rejects.toThrow(/ถูกยกเลิกแล้ว/)
    await expect(db().$executeRawUnsafe(`DELETE FROM substitute_receipts WHERE id = '${issued.id}'`)).rejects.toThrow(
      /ห้ามลบ/,
    )

    // ใบใช้งานได้ไม่เกิน 1 ใบต่อใบเบิก (ใบที่ยกเลิกไม่นับ)
    await issueFor(expenseId, [10_000])
    await expect(issueFor(expenseId, [10_000])).rejects.toThrow()
  })
})

suite('U117 — ออกใบใหม่แทน: ดึงรายการเดิม · "ออกแทนเลขที่" · การ์ดยังเห็นใบที่ยกเลิก · ปฏิเสธใบเบิกค่าที่พักถาวร', () => {
  const ctxOf = (actor: SessionUser) => ({ actor, meta })

  it('รายละเอียดใบ (บรรทัด) ให้ฟอร์มออกใบใหม่ตั้งต้น · นอก scope 404', async () => {
    const expenseId = await seedHotelExpense()
    const issued = await issueFor(expenseId, [6_000, 4_000])
    await receipts.cancelSubstituteReceipt(ctxOf(agent), issued.id, { reason: 'กรอกวันที่ผิด ขอออกใหม่' })
    const detail = await receipts.getSubstituteReceiptDetail(agent, issued.id)
    expect(detail).toMatchObject({ receiptNumber: issued.receiptNumber, status: 'cancelled', totalSatang: 10_000 })
    expect(detail.lines.map((entry) => [entry.lineDate, entry.amountSatang])).toEqual([
      ['2026-10-03', 6_000],
      ['2026-10-03', 4_000],
    ])
    await expectCode(() => receipts.getSubstituteReceiptDetail(otherAgent, issued.id), 'SUBSTITUTE_RECEIPT_NOT_FOUND')
  })

  it('ใบใหม่เก็บเลขใบที่แทน · PDF พิมพ์ "ออกแทนเลขที่" · การ์ดแสดงใบใหม่ + ใบที่ยกเลิก · แทนได้ครั้งเดียว/แก้ไม่ได้ (DB)', async () => {
    const expenseId = await seedHotelExpense()
    const issued = await issueFor(expenseId, [10_000])
    await receipts.cancelSubstituteReceipt(ctxOf(agent), issued.id, { reason: 'เซ็นผิดช่อง ต้องออกใหม่' })
    const reissued = await receipts.reissueSubstituteReceipt(ctxOf(agent), issued.id, [line(10_000)])
    expect(reissued.replacesReceiptNumber).toBe(issued.receiptNumber)
    const row = await db().substituteReceipt.findUniqueOrThrow({ where: { id: reissued.id } })
    expect(row.replacesReceiptId).toBe(issued.id)

    const rows = await db().substituteReceipt.findMany({ where: { expenseId }, select: receipts.substituteReceiptRefSelect })
    const ref = receipts.substituteReceiptRefOf(rows)
    expect(ref).toMatchObject({ id: reissued.id, replacesReceiptNumber: issued.receiptNumber })
    expect(ref?.cancelledHistory).toEqual([
      expect.objectContaining({ id: issued.id, receiptNumber: issued.receiptNumber, cancelReason: 'เซ็นผิดช่อง ต้องออกใหม่' }),
    ])

    const source = receipts.toSubstituteReceiptDocSource(await receipts.getSubstituteReceiptSource(agent, reissued.id))
    expect(source.replacesReceiptNumber).toBe(issued.receiptNumber)
    const first = receipts.toSubstituteReceiptDocSource(await receipts.getSubstituteReceiptSource(agent, issued.id))
    expect(first.replacesReceiptNumber).toBeNull()

    // ใบใหม่ถูกยกเลิก → ออกแทนต่อได้ (ใบละครั้ง) · ใบเดิมออกแทนซ้ำไม่ได้
    await receipts.cancelSubstituteReceipt(ctxOf(agent), reissued.id, { reason: 'ยอดผิด ขอออกใหม่อีกครั้ง' })
    await expectCode(
      () => receipts.reissueSubstituteReceipt(ctxOf(agent), issued.id, [line(10_000)]),
      'SUBSTITUTE_RECEIPT_REISSUE_NOT_ALLOWED',
    )
    const third = await receipts.reissueSubstituteReceipt(ctxOf(agent), reissued.id, [line(10_000)])
    expect(third.replacesReceiptNumber).toBe(reissued.receiptNumber)
    expect(third.cancelledHistory.map((entry) => entry.id)).toEqual(
      expect.arrayContaining([issued.id, reissued.id]),
    )

    await expect(
      db().$executeRawUnsafe(`UPDATE substitute_receipts SET replaces_receipt_id = NULL WHERE id = '${third.id}'`),
    ).rejects.toThrow(/แก้ไขไม่ได้/)
    await expect(
      db().$executeRawUnsafe(`UPDATE substitute_receipts SET replaces_receipt_id = id WHERE id = '${issued.id}'`),
    ).rejects.toThrow()
  })

  it('ปฏิเสธถาวรใบเบิกค่าที่พัก: เหตุผลบังคับ · audit · ใบรับรองที่ผูกไม่นับเพดานอีก · ต้องแก้ไข/ไม่ใช่ค่าที่พัก = ทำไม่ได้', async () => {
    // DTO ของคิวอนุมัติต้องรู้อัตรา WHT ของผู้รับ
    await db().$executeRawUnsafe(`
      INSERT INTO tax_profiles (id, organization_id, name, wht_pct, wht_basis, wht_min_threshold_satang, created_by)
      VALUES ('${TAX_PROFILE_ID}', '${ORG_ID}', 'บุคคลธรรมดา 3% U117', 3.00, 'before_vat', 100000, '${FINANCE_ID}')
      ON CONFLICT (id) DO NOTHING
    `)
    await db().$executeRawUnsafe(`UPDATE payee_profiles SET tax_profile_id = '${TAX_PROFILE_ID}' WHERE id = '${PAYEE_ID}'`)
    const ids: string[] = []
    for (let index = 0; index < 6; index += 1) {
      const id = await seedHotelExpense()
      ids.push(id)
      await issueFor(id, [50_000])
    }
    const next = await seedHotelExpense()
    await expectCode(() => issueFor(next, [50_000]), 'SUBSTITUTE_RECEIPT_EXCEEDS_LIMIT')
    const target = ids[0] ?? ''

    await expectCode(
      () => approvals.rejectExpensePermanently(ctxOf(finance), target, { reason: '' }),
      'REJECT_REASON_REQUIRED',
    )
    const result = await approvals.rejectExpensePermanently(ctxOf(finance), target, {
      reason: 'ไม่ได้ค้างคืนจริงตามวันที่เบิก',
    })
    expect(result.expense.status).toBe('rejected')
    const audit = await db().auditLog.findFirstOrThrow({
      where: { targetType: 'expenses', targetId: target, action: 'reject' },
      orderBy: { createdAt: 'desc' },
    })
    expect(audit.reason).toBe('ไม่ได้ค้างคืนจริงตามวันที่เบิก')
    expect(audit.afterData).toMatchObject({ status: 'rejected', permanent: true })

    // ใบรับรองของใบเบิกที่ถูกปฏิเสธยังอยู่ (ไม่ถูกยกเลิก) แต่ไม่นับเพดานต่อเดือน ⇒ ออกใบถัดไปได้
    await expect(issueFor(next, [50_000])).resolves.toMatchObject({ totalSatang: 50_000 })

    // terminal — ปฏิเสธ/ตีกลับซ้ำไม่ได้
    await expectCode(
      () => approvals.rejectExpensePermanently(ctxOf(finance), target, { reason: 'กดซ้ำอีกครั้งหนึ่ง' }),
      'EXPENSE_INVALID_STATUS',
    )
    // `23` §6.3: needs_revision → rejected ไม่อยู่ในเส้นสถานะ
    const revision = await seedHotelExpense(PAYEE_ID, 'needs_revision')
    await expectCode(
      () => approvals.rejectExpensePermanently(ctxOf(finance), revision, { reason: 'ปฏิเสธใบที่รอแก้ไข' }),
      'EXPENSE_INVALID_STATUS',
    )
    // เฉพาะใบเบิกค่าที่พัก
    const receiptClaim = await seedHotelExpense(PAYEE_ID, 'pending_approval', 'receipt')
    await expectCode(
      () => approvals.rejectExpensePermanently(ctxOf(finance), receiptClaim, { reason: 'ปฏิเสธใบเบิกทั่วไป' }),
      'EXPENSE_INVALID_STATUS',
    )
    // คนอื่น (ไม่มีสิทธิ์เห็นใบเบิก) ⇒ 404 ไม่ leak
    const another = await seedHotelExpense()
    await expectCode(
      () => approvals.rejectExpensePermanently(ctxOf(otherAgent), another, { reason: 'ไม่ใช่ผู้อนุมัติ' }),
      'EXPENSE_NOT_FOUND',
    )
  })
})
