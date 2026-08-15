import { PrismaPg } from '@prisma/adapter-pg'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import type { SessionUser } from '@/lib/auth/types'
import { PrismaClient } from '@/lib/generated/prisma/client'

/**
 * เทสต์ระดับ DB ของ Phase 4.2 — DoD ของไฟล์ 35
 *
 *  - `35` §16: auto-match สำเร็จ (ยอดตรง + ในช่วง tolerance) ⇒ `auto_matched` + ผูก FK
 *  - **DoD 4.2**: มีผู้สมัคร > 1 ⇒ **ไม่จับคู่** ปล่อยเป็น `unmatched`
 *  - `35` §16: manual match ยอดไม่ตรงโดยไม่กรอกหมายเหตุ ⇒ `MATCH_NOTE_REQUIRED`
 *  - `35` §16: `unmatched_resolved` ⇒ FK ทั้งคู่ยังเป็น null + audit มีเหตุผล
 *  - `35` §9 trigger 2 ทาง: จับคู่บิล ⇒ Cash Receipt + ยอดรับของรอบวางบิลขยับ ·
 *    จับคู่รอบจ่าย ⇒ payout `completed`
 *  - `35` §11 `ALREADY_MATCHED`: เตือนก่อน ไม่เปลี่ยนอะไร · ยืนยันแล้วเปลี่ยนได้ + เงินรับเดิมถูกถอน
 *  - Rule 09: นำเข้าไฟล์เดิมซ้ำต้องไม่นับเงินซ้ำ
 *  - Period Lock: งวดที่ `locked` ⇒ `PERIOD_LOCKED_DIRECT_EDIT` ทั้งนำเข้าและจับคู่
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
  console.warn('[bank-recon.db.test] ข้ามเทสต์ระดับ DB — ไม่มี TEST_DATABASE_URL (ดู .env.example)')
}

const ORG_ID = '00000000-0000-4000-8000-0000000042a0'
const ROLE_ACCOUNTING = '00000000-0000-4000-8000-0000000042a1'
const ACCOUNTING_ID = '00000000-0000-4000-8000-0000000042a2'
const COMPANY_A = '00000000-0000-4000-8000-0000000042a3'
const BANK_ACCOUNT_ID = '00000000-0000-4000-8000-0000000042a4'
const BILLING_A = '00000000-0000-4000-8000-0000000042a5'
const BILLING_B = '00000000-0000-4000-8000-0000000042a6'
const PAYOUT_A = '00000000-0000-4000-8000-0000000042a7'

let client: PrismaClient | null = null
type BankReconQueries = typeof import('@/lib/bank-recon/queries')
let recon: BankReconQueries

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
  id: ACCOUNTING_ID,
  organizationId: ORG_ID,
  supabaseUid: 'uid-acc-42',
  email: 'accounting42@test.local',
  fullName: 'บัญชี 4.2',
  status: 'active',
  roleId: ROLE_ACCOUNTING,
  roleName: 'บัญชี',
  roleGroup: 'system',
  isSuperadmin: false,
  teamId: null,
  companyId: null,
  capabilities: { manage_bank_reconciliation: 'manage', manage_accounting_period: 'manage' },
  scope: { kind: 'global', teamIds: [], companyId: null, userId: ACCOUNTING_ID },
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

const HEADER = 'วันที่,รายละเอียด,เลขที่อ้างอิง,เงินเข้า,เงินออก'

function csvOf(...lines: string[]): string {
  return [HEADER, ...lines].join('\n')
}

/** รอบวางบิลที่ส่งบิลแล้ว — ยอดรวม 8,025.00 บาท (802500 satang) */
async function seedBilling(
  id: string,
  totalSatang: number,
  options: { sentAt?: string; whtSatang?: number; period?: string } = {},
): Promise<void> {
  const sentAt = options.sentAt ?? '2026-08-01T03:00:00Z'
  await db().$executeRawUnsafe(`
    INSERT INTO billing_batches (id, organization_id, company_id, period, status, total_satang,
                                 wht_withheld_by_customer_satang, due_date, sent_at, created_by)
    VALUES ('${id}', '${ORG_ID}', '${COMPANY_A}', '${options.period ?? `รอบ ${id.slice(-4)}`}', 'sent',
            ${totalSatang}, ${options.whtSatang ?? 0}, '2026-08-31', '${sentAt}', '${ACCOUNTING_ID}')
  `)
}

/** รอบจ่ายที่สร้างไฟล์โอนแล้ว — ยอดสุทธิ 120,000.00 บาท */
async function seedPayout(id: string, netSatang: number): Promise<void> {
  await db().$executeRawUnsafe(`
    INSERT INTO payout_batches (id, organization_id, name, side, status, gross_satang, wht_satang, net_satang,
                                bank_account_id, payment_file_generated_at, created_by)
    VALUES ('${id}', '${ORG_ID}', 'PB-2569-08-001', 'outsource', 'file_generated', ${netSatang}, 0, ${netSatang},
            '${BANK_ACCOUNT_ID}', '2026-08-01T03:00:00Z', '${ACCOUNTING_ID}')
  `)
}

async function lockPeriodOfAugust(): Promise<void> {
  await db().$executeRawUnsafe(`
    UPDATE accounting_periods SET status = 'locked'
    WHERE organization_id = '${ORG_ID}' AND year_be = 2569 AND month = 8
  `)
}

async function transactionsOf(): Promise<
  { id: string; matchStatus: string; matchedBillingId: string | null; matchedPayoutId: string | null; amountSatang: number; matchNote: string | null }[]
> {
  return db().bankTransaction.findMany({
    where: { organizationId: ORG_ID },
    select: {
      id: true,
      matchStatus: true,
      matchedBillingId: true,
      matchedPayoutId: true,
      amountSatang: true,
      matchNote: true,
    },
    orderBy: { amountSatang: 'desc' },
  })
}

async function cleanup(): Promise<void> {
  const tx = db()
  await tx.$executeRawUnsafe(`DELETE FROM cash_receipts WHERE organization_id = '${ORG_ID}'`)
  await tx.$executeRawUnsafe(`DELETE FROM bank_transactions WHERE organization_id = '${ORG_ID}'`)
  await tx.$executeRawUnsafe(`DELETE FROM billing_batches WHERE organization_id = '${ORG_ID}'`)
  await tx.$executeRawUnsafe(`DELETE FROM payout_batches WHERE organization_id = '${ORG_ID}'`)
  await tx.$executeRawUnsafe(`DELETE FROM accounting_periods WHERE organization_id = '${ORG_ID}'`)
}

beforeAll(async () => {
  if (!url) return
  process.env.DATABASE_URL = url
  recon = await import('@/lib/bank-recon/queries')

  const tx = db()
  await tx.$executeRawUnsafe(`
    INSERT INTO organizations (id, name, tax_id, address)
    VALUES ('${ORG_ID}', 'Phase42Test', '9999999994200', 'ที่อยู่ทดสอบ 4.2') ON CONFLICT (id) DO NOTHING
  `)
  await tx.$executeRawUnsafe(`
    INSERT INTO roles (id, organization_id, name, role_group, is_seed)
    VALUES ('${ROLE_ACCOUNTING}', '${ORG_ID}', 'บัญชี 4.2', 'system', false) ON CONFLICT (id) DO NOTHING
  `)
  await tx.$executeRawUnsafe(`
    INSERT INTO users (id, organization_id, role_id, email, full_name, status)
    VALUES ('${ACCOUNTING_ID}', '${ORG_ID}', '${ROLE_ACCOUNTING}', 'accounting42@test.local', 'บัญชี 4.2', 'active')
    ON CONFLICT (id) DO NOTHING
  `)
  await tx.$executeRawUnsafe(`
    INSERT INTO finance_companies (id, organization_id, name, short_name, tax_id, vat_mode,
                                   payment_due_days, created_by)
    VALUES ('${COMPANY_A}', '${ORG_ID}', 'ไฟแนนซ์ A 4.2', 'A42', '0105512420001', 'exclude_vat', 30, '${ACCOUNTING_ID}')
    ON CONFLICT (id) DO NOTHING
  `)
  await tx.$executeRawUnsafe(`
    INSERT INTO bank_accounts (id, organization_id, bank_name, account_name, account_number, usage,
                               auto_match_tolerance_days, created_by)
    VALUES ('${BANK_ACCOUNT_ID}', '${ORG_ID}', 'ธนาคารกสิกรไทย', 'บริษัท 4.2', '2223334440', 'both', 7,
            '${ACCOUNTING_ID}')
    ON CONFLICT (id) DO NOTHING
  `)
  await cleanup()
})

afterAll(async () => {
  if (url) await cleanup()
  await client?.$disconnect()
})

beforeEach(async () => {
  if (url) await cleanup()
})

suite('Phase 4.2 — นำเข้า statement + auto-match (`35` §6.2)', () => {
  it('ยอดตรงเป๊ะ + ในช่วง tolerance + ผู้สมัครรายเดียว ⇒ auto_matched + สร้าง Cash Receipt', async () => {
    await seedBilling(BILLING_A, 802500)

    const result = await recon.importStatement(ctx, {
      bankAccountId: BANK_ACCOUNT_ID,
      fileName: 'kbank-08-2569.csv',
      csv: csvOf('05/08/2569,โอนเข้าจากไฟแนนซ์ A,KBANK-TRX-001,"8,025.00",'),
    })

    expect(result.imported).toBe(1)
    expect(result.autoMatched).toBe(1)

    const [transaction] = await transactionsOf()
    expect(transaction?.matchStatus).toBe('auto_matched')
    expect(transaction?.matchedBillingId).toBe(BILLING_A)
    expect(transaction?.amountSatang).toBe(802500)

    const receipts = await db().cashReceipt.findMany({ where: { organizationId: ORG_ID } })
    expect(receipts).toHaveLength(1)
    expect(receipts[0]?.amountSatang).toBe(802500)
    expect(receipts[0]?.bankTransactionId).toBe(transaction?.id)

    const billing = await db().billingBatch.findUniqueOrThrow({ where: { id: BILLING_A } })
    expect(billing.receivedSatang).toBe(802500)
    expect(billing.status).toBe('paid')
  })

  it('**ผู้สมัคร 2 รายยอดเท่ากัน ⇒ ไม่จับคู่** (DoD 4.2)', async () => {
    await seedBilling(BILLING_A, 802500, { period: 'รอบ A' })
    await seedBilling(BILLING_B, 802500, { period: 'รอบ B' })

    const result = await recon.importStatement(ctx, {
      bankAccountId: BANK_ACCOUNT_ID,
      fileName: 'ambiguous.csv',
      csv: csvOf('05/08/2569,โอนเข้าไม่ระบุที่มา,KBANK-TRX-009,"8,025.00",'),
    })

    expect(result.autoMatched).toBe(0)
    const [transaction] = await transactionsOf()
    expect(transaction?.matchStatus).toBe('unmatched')
    expect(transaction?.matchedBillingId).toBeNull()
    expect(await db().cashReceipt.count({ where: { organizationId: ORG_ID } })).toBe(0)
  })

  it('เกิน tolerance ⇒ ไม่จับคู่อัตโนมัติ', async () => {
    await seedBilling(BILLING_A, 802500, { sentAt: '2026-08-01T03:00:00Z' })

    const result = await recon.importStatement(ctx, {
      bankAccountId: BANK_ACCOUNT_ID,
      fileName: 'late.csv',
      csv: csvOf('20/08/2569,โอนเข้าช้ากว่ากำหนด,KBANK-TRX-010,"8,025.00",'),
    })

    expect(result.autoMatched).toBe(0)
  })

  it('A1 — ลูกค้าหัก WHT ก่อนโอน: ยอด total − wht ยัง auto-match ได้', async () => {
    await seedBilling(BILLING_A, 802500, { whtSatang: 22500 })

    const result = await recon.importStatement(ctx, {
      bankAccountId: BANK_ACCOUNT_ID,
      fileName: 'wht.csv',
      csv: csvOf('05/08/2569,โอนเข้าหลังหัก ณ ที่จ่าย,KBANK-TRX-011,"7,800.00",'),
    })

    expect(result.autoMatched).toBe(1)
    const billing = await db().billingBatch.findUniqueOrThrow({ where: { id: BILLING_A } })
    // ยอดรับ 780,000 + WHT ที่ลูกค้าหักไว้ 22,500 = เต็มยอด ⇒ ปิดรอบเป็น paid
    expect(billing.receivedSatang).toBe(780000)
    expect(billing.status).toBe('paid')

    // ใบเงินรับต้องเก็บเครดิตภาษีที่ลูกค้าหักไว้ด้วย ไม่ใช่ 0 (`31` §8 — แท็บเงินรับแสดงคอลัมน์นี้)
    const receipt = await db().cashReceipt.findFirstOrThrow({ where: { organizationId: ORG_ID } })
    expect(receipt.amountSatang).toBe(780000)
    expect(receipt.whtWithheldByCustomerSatang).toBe(22500)
  })

  it('รับเต็มจำนวน ⇒ ใบเงินรับไม่บันทึก WHT ที่ลูกค้าหัก (ห้ามเดาส่วนต่าง)', async () => {
    await seedBilling(BILLING_A, 802500)

    await recon.importStatement(ctx, {
      bankAccountId: BANK_ACCOUNT_ID,
      fileName: 'full.csv',
      csv: csvOf('05/08/2569,โอนเข้าเต็มจำนวน,KBANK-TRX-012,"8,025.00",'),
    })

    const receipt = await db().cashReceipt.findFirstOrThrow({ where: { organizationId: ORG_ID } })
    expect(receipt.amountSatang).toBe(802500)
    expect(receipt.whtWithheldByCustomerSatang).toBe(0)
  })

  it('เงินออกจับกับรอบจ่าย ⇒ payout เปลี่ยนเป็น completed (`17` §9)', async () => {
    await seedPayout(PAYOUT_A, 12000000)

    const result = await recon.importStatement(ctx, {
      bankAccountId: BANK_ACCOUNT_ID,
      fileName: 'payout.csv',
      csv: csvOf('02/08/2569,จ่ายรอบ PB-2569-08-001,KBANK-TRX-002,,"120,000.00"'),
    })

    expect(result.autoMatched).toBe(1)
    const [transaction] = await transactionsOf()
    expect(transaction?.amountSatang).toBe(-12000000)
    expect(transaction?.matchedPayoutId).toBe(PAYOUT_A)

    const payout = await db().payoutBatch.findUniqueOrThrow({ where: { id: PAYOUT_A } })
    expect(payout.status).toBe('completed')
  })

  it('นำเข้าไฟล์เดิมซ้ำ ⇒ ไม่สร้างแถวซ้ำ ไม่นับเงินซ้ำ (Rule 09)', async () => {
    await seedBilling(BILLING_A, 802500)
    const csv = csvOf('05/08/2569,โอนเข้าจากไฟแนนซ์ A,KBANK-TRX-001,"8,025.00",')

    await recon.importStatement(ctx, { bankAccountId: BANK_ACCOUNT_ID, fileName: 'a.csv', csv })
    const second = await recon.importStatement(ctx, { bankAccountId: BANK_ACCOUNT_ID, fileName: 'a.csv', csv })

    expect(second.imported).toBe(0)
    expect(second.duplicates).toBe(1)
    expect(await db().bankTransaction.count({ where: { organizationId: ORG_ID } })).toBe(1)
    expect(await db().cashReceipt.count({ where: { organizationId: ORG_ID } })).toBe(1)
  })

  it('นำเข้าไฟล์เดิม **พร้อมกัน** สองคำขอ ⇒ ยังไม่นับเงินซ้ำ (`uniq_bank_tx_statement_row`)', async () => {
    await seedBilling(BILLING_A, 802500)
    const csv = csvOf('05/08/2569,โอนเข้าจากไฟแนนซ์ A,KBANK-TRX-001,"8,025.00",')

    // ด่านกันซ้ำชั้น app เป็น read-then-insert ⇒ ทั้งสองฝั่งอ่านชุดเดิมก่อนที่อีกฝั่งจะ insert
    // ⇒ ผ่านด่านทั้งคู่ → เงินเข้าถูกนับซ้ำ ถ้าไม่มี unique index ระดับ DB คุมไว้
    const settled = await Promise.allSettled([
      recon.importStatement(ctx, { bankAccountId: BANK_ACCOUNT_ID, fileName: 'a.csv', csv }),
      recon.importStatement(ctx, { bankAccountId: BANK_ACCOUNT_ID, fileName: 'a.csv', csv }),
    ])
    expect(settled.filter((outcome) => outcome.status === 'fulfilled').length).toBeGreaterThanOrEqual(1)

    expect(await db().bankTransaction.count({ where: { organizationId: ORG_ID } })).toBe(1)
    expect(await db().cashReceipt.count({ where: { organizationId: ORG_ID } })).toBe(1)
  })

  it('แถวที่อ่านไม่ออกถูกข้าม + ไฟล์ที่ไม่มีแถวใช้ได้เลย ⇒ STATEMENT_FILE_INVALID', async () => {
    const result = await recon.importStatement(ctx, {
      bankAccountId: BANK_ACCOUNT_ID,
      fileName: 'mixed.csv',
      csv: csvOf('ยอดยกมา,,,,', '05/08/2569,ค่าธรรมเนียมรายเดือน,FEE-01,,35.00'),
    })
    expect(result.imported).toBe(1)
    expect(result.skippedRows).toHaveLength(1)

    await expectCode(
      () =>
        recon.importStatement(ctx, {
          bankAccountId: BANK_ACCOUNT_ID,
          fileName: 'empty.csv',
          csv: csvOf('ยอดยกมา,,,,'),
        }),
      'STATEMENT_FILE_INVALID',
    )
  })
})

suite('Phase 4.2 — จับคู่ manual + ปิดรายการ (`35` §6.3–6.4)', () => {
  async function importUnmatched(amount = '"8,000.00"'): Promise<string> {
    const result = await recon.importStatement(ctx, {
      bankAccountId: BANK_ACCOUNT_ID,
      fileName: 'manual.csv',
      csv: csvOf(`05/08/2569,โอนเข้ายอดไม่ตรง,KBANK-TRX-003,${amount},`),
    })
    expect(result.autoMatched).toBe(0)
    const [transaction] = await transactionsOf()
    return transaction?.id ?? ''
  }

  it('ยอดไม่ตรงเป๊ะ ไม่กรอกหมายเหตุ ⇒ MATCH_NOTE_REQUIRED (`35` §16)', async () => {
    await seedBilling(BILLING_A, 802500)
    const id = await importUnmatched()

    await expectCode(
      () =>
        recon.matchBankTransaction(ctx, id, {
          targetKind: 'billing',
          targetId: BILLING_A,
          matchNote: null,
          confirmRematch: false,
        }),
      'MATCH_NOTE_REQUIRED',
    )
  })

  it('ยอดไม่ตรง + หมายเหตุ ⇒ manual_matched + ยอดรับบางส่วน', async () => {
    await seedBilling(BILLING_A, 802500)
    const id = await importUnmatched()

    const { result } = await recon.matchBankTransaction(ctx, id, {
      targetKind: 'billing',
      targetId: BILLING_A,
      matchNote: 'ลูกค้าหักค่าธรรมเนียมโอนก่อนจ่าย',
      confirmRematch: false,
    })

    expect(result?.transaction.matchStatus).toBe('manual_matched')
    expect(result?.effect).toMatchObject({ kind: 'billing', billingStatus: 'partially_paid' })

    const billing = await db().billingBatch.findUniqueOrThrow({ where: { id: BILLING_A } })
    expect(billing.receivedSatang).toBe(800000)
    expect(billing.status).toBe('partially_paid')
  })

  it('เงินเข้าจับกับรอบจ่ายไม่ได้ (ผิดฝั่ง) ⇒ BANK_TRANSACTION_INVALID_STATUS', async () => {
    await seedPayout(PAYOUT_A, 12000000)
    const id = await importUnmatched()

    await expectCode(
      () =>
        recon.matchBankTransaction(ctx, id, {
          targetKind: 'payout',
          targetId: PAYOUT_A,
          matchNote: 'ลองผิดฝั่ง',
          confirmRematch: false,
        }),
      'BANK_TRANSACTION_INVALID_STATUS',
    )
  })

  it('ALREADY_MATCHED — เตือนก่อนโดยไม่เปลี่ยนอะไร แล้วยืนยันจึงเปลี่ยนการจับคู่ + ถอนเงินรับเดิม', async () => {
    await seedBilling(BILLING_A, 802500, { period: 'รอบ A' })
    await seedBilling(BILLING_B, 800000, { period: 'รอบ B', sentAt: '2026-09-01T03:00:00Z' })

    const result = await recon.importStatement(ctx, {
      bankAccountId: BANK_ACCOUNT_ID,
      fileName: 'rematch.csv',
      csv: csvOf('05/08/2569,โอนเข้าจากไฟแนนซ์ A,KBANK-TRX-004,"8,025.00",'),
    })
    expect(result.autoMatched).toBe(1)
    const [transaction] = await transactionsOf()
    const id = transaction?.id ?? ''

    const warned = await recon.matchBankTransaction(ctx, id, {
      targetKind: 'billing',
      targetId: BILLING_B,
      matchNote: null,
      confirmRematch: false,
    })
    expect(warned.result).toBeNull()
    expect(warned.warning?.code).toBe('ALREADY_MATCHED')
    expect((await db().bankTransaction.findUniqueOrThrow({ where: { id } })).matchedBillingId).toBe(BILLING_A)

    // ยืนยันแล้วแต่ไม่ให้เหตุผล ⇒ ยังถูกปฏิเสธ (`35` §10 re-match ต้องมีเหตุผล)
    await expectCode(
      () =>
        recon.matchBankTransaction(ctx, id, {
          targetKind: 'billing',
          targetId: BILLING_B,
          matchNote: null,
          confirmRematch: true,
        }),
      'MATCH_NOTE_REQUIRED',
    )

    const { result: rematched } = await recon.matchBankTransaction(ctx, id, {
      targetKind: 'billing',
      targetId: BILLING_B,
      matchNote: 'จับคู่ผิดรอบ — ย้ายไปรอบ B',
      confirmRematch: true,
    })
    expect(rematched?.transaction.matchedId).toBe(BILLING_B)

    // รอบเดิมต้องถูกลดยอดรับกลับเป็น 0 · รอบใหม่รับเต็มยอดของตัวเอง
    const oldBatch = await db().billingBatch.findUniqueOrThrow({ where: { id: BILLING_A } })
    expect(oldBatch.receivedSatang).toBe(0)
    expect(await db().cashReceipt.count({ where: { organizationId: ORG_ID, billingBatchId: BILLING_A } })).toBe(0)

    const newBatch = await db().billingBatch.findUniqueOrThrow({ where: { id: BILLING_B } })
    expect(newBatch.receivedSatang).toBe(802500)

    const audits = await db().auditLog.findMany({
      where: { organizationId: ORG_ID, targetType: 'bank_transactions', targetId: id },
      select: { action: true, reason: true },
      orderBy: { createdAt: 'asc' },
    })
    expect(audits.map((row) => row.action)).toEqual(['import', 'update', 'update'])
    expect(audits.at(-1)?.reason).toBe('จับคู่ผิดรอบ — ย้ายไปรอบ B')
  })

  it('ปิดรายการโดยไม่จับคู่ ⇒ unmatched_resolved + FK ทั้งคู่ยัง null + audit มีเหตุผล (`35` §16)', async () => {
    const result = await recon.importStatement(ctx, {
      bankAccountId: BANK_ACCOUNT_ID,
      fileName: 'fee.csv',
      csv: csvOf('05/08/2569,ค่าธรรมเนียมรายเดือน,FEE-08,,35.00'),
    })
    expect(result.imported).toBe(1)
    const [transaction] = await transactionsOf()
    const id = transaction?.id ?? ''

    const resolved = await recon.resolveUnmatchedTransaction(ctx, id, {
      matchNote: 'ค่าธรรมเนียมธนาคารรายเดือน — ไม่ใช่รายรับ-จ่ายของระบบ',
    })

    expect(resolved.matchStatus).toBe('unmatched_resolved')
    expect(resolved.matchedKind).toBeNull()

    const row = await db().bankTransaction.findUniqueOrThrow({ where: { id } })
    expect(row.matchedBillingId).toBeNull()
    expect(row.matchedPayoutId).toBeNull()
    expect(row.matchedAdvanceId).toBeNull()
    expect(row.isSplitAllocation).toBe(false)

    const audit = await db().auditLog.findFirst({
      where: { organizationId: ORG_ID, targetType: 'bank_transactions', targetId: id, action: 'status_change' },
      select: { reason: true },
    })
    expect(audit?.reason).toContain('ค่าธรรมเนียมธนาคาร')
  })

  it('ปิดรายการที่จับคู่ไปแล้ว / จับคู่รายการที่ปิดแล้ว ⇒ BANK_TRANSACTION_INVALID_STATUS (terminal)', async () => {
    await seedBilling(BILLING_A, 802500)
    await recon.importStatement(ctx, {
      bankAccountId: BANK_ACCOUNT_ID,
      fileName: 'both.csv',
      csv: csvOf('05/08/2569,โอนเข้าจากไฟแนนซ์ A,KBANK-TRX-005,"8,025.00",', '06/08/2569,ดอกเบี้ยรับ,INT-01,12.00,'),
    })

    const rows = await transactionsOf()
    const matched = rows.find((row) => row.matchStatus === 'auto_matched')
    const interest = rows.find((row) => row.matchStatus === 'unmatched')

    await expectCode(
      () => recon.resolveUnmatchedTransaction(ctx, matched?.id ?? '', { matchNote: 'ขอปิดทั้งที่จับคู่แล้ว' }),
      'BANK_TRANSACTION_INVALID_STATUS',
    )

    await recon.resolveUnmatchedTransaction(ctx, interest?.id ?? '', { matchNote: 'ดอกเบี้ยรับจากธนาคาร' })
    await expectCode(
      () =>
        recon.matchBankTransaction(ctx, interest?.id ?? '', {
          targetKind: 'billing',
          targetId: BILLING_A,
          matchNote: 'ขอจับคู่รายการที่ปิดแล้ว',
          confirmRematch: true,
        }),
      'BANK_TRANSACTION_INVALID_STATUS',
    )
  })

  it('รายการนอกองค์กร ⇒ BANK_TRANSACTION_NOT_FOUND (ไม่ leak)', async () => {
    await expectCode(
      () =>
        recon.matchBankTransaction(ctx, '00000000-0000-4000-8000-0000000042ff', {
          targetKind: 'billing',
          targetId: BILLING_A,
          matchNote: 'x',
          confirmRematch: false,
        }),
      'BANK_TRANSACTION_NOT_FOUND',
    )
  })
})

suite('Phase 4.2 — Readiness + Period Lock', () => {
  it('unmatched_resolved นับเป็น "ครบ 100%" ของ Readiness (`35` §16 · `30`)', async () => {
    await recon.importStatement(ctx, {
      bankAccountId: BANK_ACCOUNT_ID,
      fileName: 'fee.csv',
      csv: csvOf('05/08/2569,ค่าธรรมเนียมรายเดือน,FEE-09,,35.00'),
    })
    const [transaction] = await transactionsOf()

    // ยาม Readiness ของ 4.1 นับเฉพาะ `unmatched` — ปิดรายการแล้วต้องไม่ค้าง
    expect(await db().bankTransaction.count({ where: { organizationId: ORG_ID, matchStatus: 'unmatched' } })).toBe(1)
    await recon.resolveUnmatchedTransaction(ctx, transaction?.id ?? '', { matchNote: 'ค่าธรรมเนียมธนาคาร' })
    expect(await db().bankTransaction.count({ where: { organizationId: ORG_ID, matchStatus: 'unmatched' } })).toBe(0)
  })

  it('งวดที่ locked ⇒ นำเข้า/จับคู่โดน PERIOD_LOCKED_DIRECT_EDIT (`30` · `13` §6.11)', async () => {
    await seedBilling(BILLING_A, 802500)
    await recon.importStatement(ctx, {
      bankAccountId: BANK_ACCOUNT_ID,
      fileName: 'before-lock.csv',
      csv: csvOf('05/08/2569,โอนเข้าไม่ระบุ,KBANK-TRX-006,"8,000.00",'),
    })
    const [transaction] = await transactionsOf()
    await lockPeriodOfAugust()

    await expectCode(
      () =>
        recon.importStatement(ctx, {
          bankAccountId: BANK_ACCOUNT_ID,
          fileName: 'after-lock.csv',
          csv: csvOf('06/08/2569,โอนเข้าหลังปิดงวด,KBANK-TRX-007,"1,000.00",'),
        }),
      'PERIOD_LOCKED_DIRECT_EDIT',
    )

    await expectCode(
      () =>
        recon.matchBankTransaction(ctx, transaction?.id ?? '', {
          targetKind: 'billing',
          targetId: BILLING_A,
          matchNote: 'จับคู่ย้อนหลังในงวดที่ปิดแล้ว',
          confirmRematch: false,
        }),
      'PERIOD_LOCKED_DIRECT_EDIT',
    )
  })
})
