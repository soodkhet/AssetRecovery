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

/** วันที่ออกใบคงที่ (ต.ค. 2569 เวลาไทย) — เลข CRT-2569-… */
const AT = new Date('2026-10-06T03:00:00Z')

let client: PrismaClient | null = null
let receipts: typeof import('@/lib/substitute-receipts/queries')
let advances: typeof import('@/lib/advances/queries')
let advanceDocs: typeof import('@/lib/advances/doc-queries')
let fieldExpenses: typeof import('@/lib/field/expense-queries')

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

async function seedHotelExpense(payeeId = PAYEE_ID, status = 'pending_approval'): Promise<string> {
  expenseSeq += 1
  const id = `00000000-0000-4c70-8000-${String(expenseSeq).padStart(12, '0')}`
  await db().$executeRawUnsafe(`
    INSERT INTO expenses (id, organization_id, payee_id, expense_type, gross_satang, expense_date, status,
                          calculation_source, created_by)
    VALUES ('${id}', '${ORG_ID}', '${payeeId}', 'hotel', 10000, '2026-10-05', '${status}', 'receipt', '${AGENT_ID}')
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
  await tx.$executeRawUnsafe(`DELETE FROM substitute_receipts WHERE organization_id = '${ORG_ID}'`)
  await tx.$executeRawUnsafe(`DELETE FROM advance_returns WHERE organization_id = '${ORG_ID}'`)
  await tx.$executeRawUnsafe(`DELETE FROM payout_batch_items WHERE organization_id = '${ORG_ID}'`)
  await tx.$executeRawUnsafe(`DELETE FROM payout_batches WHERE organization_id = '${ORG_ID}'`)
  await tx.$executeRawUnsafe(`DELETE FROM expenses WHERE organization_id = '${ORG_ID}'`)
  await tx.$executeRawUnsafe(`DELETE FROM advances WHERE organization_id = '${ORG_ID}'`)
  await tx.$executeRawUnsafe(`DELETE FROM finance_policy_settings WHERE organization_id = '${ORG_ID}'`)
  await tx.$executeRawUnsafe(`DELETE FROM document_number_series WHERE organization_id = '${ORG_ID}'`)
}

beforeAll(async () => {
  if (!url) return
  process.env.DATABASE_URL = url
  receipts = await import('@/lib/substitute-receipts/queries')
  advances = await import('@/lib/advances/queries')
  advanceDocs = await import('@/lib/advances/doc-queries')
  fieldExpenses = await import('@/lib/field/expense-queries')

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
