import { PrismaPg } from '@prisma/adapter-pg'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import type { SessionUser } from '@/lib/auth/types'
import { CSV_BOM } from '@/lib/exports/csv'
import { PrismaClient } from '@/lib/generated/prisma/client'
import { putFakeUpload, resetFakeUploads, sampleBytes, uploadTestState } from '@/tests/helpers/fake-uploads'

vi.mock('@/lib/uploads/storage', async () => (await import('@/tests/helpers/fake-uploads')).fakeStorageModule())
vi.mock('@/lib/uploads/verify', async () => (await import('@/tests/helpers/fake-uploads')).fakeVerifyModule())

/** ที่เก็บไฟล์ Accounting Pack จำลอง — path → ไบต์ (ตรวจเนื้อไฟล์ 10/11 ได้จริงโดยไม่ยิง Storage) */
const packStorage = new Map<string, Uint8Array>()
vi.mock('@/lib/exports/pack-storage', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/exports/pack-storage')>()
  return {
    ...actual,
    uploadPackFile: async (input: { path: string; bytes: Uint8Array }) => {
      packStorage.set(input.path, input.bytes)
    },
    removePackFiles: async () => [],
    downloadPackFile: async (path: string) => packStorage.get(path) ?? new Uint8Array(),
  }
})

/**
 * เทสต์ระดับ DB ของมติ PO 05/10/2569 U40 (50 ทวิ ที่ลูกค้าหักเรา) + U41 (เงินรับรอตรวจสอบ)
 *
 * U40
 *  - จับคู่เงินรับที่ลูกค้าหักภาษี ⇒ เกิดรายการ "รอ 50 ทวิ จากลูกค้า" อัตโนมัติ (ยอด/ลูกค้า/รอบวางบิล/เงินรับ) + audit
 *  - บันทึกรับหนังสือ: ไฟล์บังคับและตรวจที่ server · `pending → received` · audit · ข้อยกเว้นที่ผูกไว้ถูกแก้ไขแล้ว
 *  - ยอดในหนังสือไม่ตรงยอดที่ถูกหัก ⇒ บันทึกได้ + `warnings` (ไม่บล็อก)
 *  - รับซ้ำ ⇒ `CUSTOMER_WHT_INVALID_STATUS` · เลขที่ซ้ำลูกค้าเดียวกัน ⇒ `CUSTOMER_WHT_NUMBER_DUPLICATE`
 *  - ข้ามองค์กร ⇒ `CUSTOMER_WHT_NOT_FOUND` · รายการไม่รั่ว
 *  - เปลี่ยนการจับคู่ ⇒ รายการรอ 50 ทวิ ของเงินรับเดิมถูกถอน (soft delete + audit)
 * U41
 *  - `unmatched → suspense`: ไม่สร้างเงินรับ · ยอดรับ/ยอดค้างของรอบวางบิล (AR) ไม่เปลี่ยน · audit มีเหตุผล
 *  - จับคู่ภายหลัง: เหตุผลบังคับ · สำเร็จแล้วสร้างเงินรับ + AR ลด
 *  - คืนเงินผู้โอน: วันที่ + หลักฐาน + เหตุผล · terminal
 *  - Readiness: ไม่บล็อก แต่เตือนยอดเงินรับรอตรวจสอบ/50 ทวิ ค้าง · งวดล็อก ⇒ `PERIOD_LOCKED_DIRECT_EDIT`
 *  - Export Pack: `10_Customer_WHT.csv` + `11_Suspense_Receipts.csv` มีแถวของงวดจริง
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
  console.warn('[customer-wht.db.test] ข้ามเทสต์ระดับ DB — ไม่มี TEST_DATABASE_URL (ดู .env.example)')
}

const ORG_ID = '00000000-0000-4000-8000-000000040a00'
const OTHER_ORG_ID = '00000000-0000-4000-8000-000000040b00'
const ROLE_ID = '00000000-0000-4000-8000-000000040a01'
const OTHER_ROLE_ID = '00000000-0000-4000-8000-000000040b01'
const USER_ID = '00000000-0000-4000-8000-000000040a02'
const OTHER_USER_ID = '00000000-0000-4000-8000-000000040b02'
const COMPANY_A = '00000000-0000-4000-8000-000000040a03'
const BANK_ACCOUNT_ID = '00000000-0000-4000-8000-000000040a04'
const BILLING_A = '00000000-0000-4000-8000-000000040a05'
const BILLING_B = '00000000-0000-4000-8000-000000040a06'

let client: PrismaClient | null = null
let recon: typeof import('@/lib/bank-recon/queries')
let customerWht: typeof import('@/lib/customer-wht/queries')
let accounting: typeof import('@/lib/accounting/queries')
let exportsApi: typeof import('@/lib/exports/queries')

function db(): PrismaClient {
  if (!url) throw new Error('ไม่มี TEST_DATABASE_URL')
  if (!client) {
    assertLocalTestDatabase(url)
    client = new PrismaClient({ adapter: new PrismaPg({ connectionString: url }) })
  }
  return client
}

const meta = { ipAddress: null, userAgent: null }

function userOf(id: string, organizationId: string, roleId: string): SessionUser {
  return {
    id,
    organizationId,
    supabaseUid: `uid-${id}`,
    email: `${id.slice(-6)}@test.local`,
    fullName: 'บัญชี U40',
    status: 'active',
    roleId,
    roleName: 'บัญชี',
    roleGroup: 'system',
    isSuperadmin: false,
    teamId: null,
    companyId: null,
    capabilities: {
      manage_bank_reconciliation: 'manage',
      manage_accounting_period: 'manage',
      manage_customer_wht: 'manage',
      export_accounting_pack: 'manage',
    },
    scope: { kind: 'global', teamIds: [], companyId: null, userId: id },
    loginAt: new Date().toISOString(),
  }
}

const accountant = userOf(USER_ID, ORG_ID, ROLE_ID)
const outsider = userOf(OTHER_USER_ID, OTHER_ORG_ID, OTHER_ROLE_ID)
const ctx = { actor: accountant, meta }
const outsiderCtx = { actor: outsider, meta }

function codeOf(error: unknown): string {
  return (error as { code?: string }).code ?? String(error)
}

async function expectCode(run: () => Promise<unknown>, code: string): Promise<void> {
  await expect(run()).rejects.toSatisfy((error: unknown) => codeOf(error) === code, `ต้องได้ error code ${code}`)
}

const HEADER = 'วันที่,รายละเอียด,เลขที่อ้างอิง,เงินเข้า,เงินออก'
const csvOf = (...lines: string[]): string => [HEADER, ...lines].join('\n')

/** รอบวางบิลที่ส่งแล้ว · `whtSatang` = ยอดที่ลูกค้าจะหัก (ยอดทางเลือก total − wht ของตัวจับคู่ — A1) */
async function seedBilling(id: string, totalSatang: number, options: { whtSatang?: number; period?: string } = {}) {
  await db().$executeRawUnsafe(`
    INSERT INTO billing_batches (id, organization_id, company_id, period, status, total_satang,
                                 wht_withheld_by_customer_satang, due_date, sent_at, created_by)
    VALUES ('${id}', '${ORG_ID}', '${COMPANY_A}', '${options.period ?? `2569-${id.slice(-2)}`}', 'sent',
            ${totalSatang}, ${options.whtSatang ?? 0}, '2026-08-31', '2026-08-01T03:00:00Z', '${USER_ID}')
  `)
}

async function importOne(line: string, fileName: string): Promise<string> {
  await recon.importStatement(ctx, { bankAccountId: BANK_ACCOUNT_ID, fileName, csv: csvOf(line) })
  const row = await db().bankTransaction.findFirstOrThrow({
    where: { organizationId: ORG_ID },
    orderBy: { createdAt: 'desc' },
    select: { id: true },
  })
  return row.id
}

/** เงิน CO1 แบบ UAT A8: บิล 3,991.10 ลูกค้าหัก 3% = 111.90 ⇒ เข้าจริง 3,879.20 */
async function seedWithheldReceipt(): Promise<{ txId: string; certificateId: string }> {
  await seedBilling(BILLING_A, 399110, { whtSatang: 11190 })
  const txId = await importOne('05/08/2569,โอนเข้า CO1 หลังหัก ณ ที่จ่าย,KBANK-U40-1,"3,879.20",', 'u40.csv')
  const cert = await db().customerWhtCertificate.findFirstOrThrow({
    where: { organizationId: ORG_ID, deletedAt: null },
    select: { id: true },
  })
  return { txId, certificateId: cert.id }
}

async function auditOf(targetType: string, targetId: string): Promise<{ action: string; reason: string | null }[]> {
  return db().$queryRawUnsafe(`
    SELECT action::text AS action, reason FROM audit_logs
    WHERE organization_id = '${ORG_ID}' AND target_type = '${targetType}' AND target_id = '${targetId}'
    ORDER BY created_at ASC
  `)
}

async function augustPeriodId(): Promise<string> {
  const period = await db().accountingPeriod.findFirstOrThrow({
    where: { organizationId: ORG_ID, yearBe: 2569, month: 8 },
    select: { id: true },
  })
  return period.id
}

function certFile(certificateId: string, name = 'scan.pdf'): string {
  const path = `customer-wht/${certificateId}/${name}`
  putFakeUpload(path, sampleBytes('pdf', name))
  return path
}

function refundFile(transactionId: string): string {
  const path = `bank-transactions/${transactionId}/refund/slip.pdf`
  putFakeUpload(path, sampleBytes('pdf', 'refund'))
  return path
}

async function cleanup(): Promise<void> {
  const tx = db()
  // export_records ห้ามลบระดับ DB (immutable) — ปิด trigger เฉพาะตอนเก็บกวาดข้อมูลทดสอบ (แนวเดียวกับ exports.db.test)
  await tx.$executeRawUnsafe(`ALTER TABLE export_records DISABLE TRIGGER trg_export_records_no_delete`)
  try {
    for (const org of [ORG_ID, OTHER_ORG_ID]) {
      await tx.$executeRawUnsafe(`DELETE FROM export_records WHERE organization_id = '${org}'`)
    }
  } finally {
    await tx.$executeRawUnsafe(`ALTER TABLE export_records ENABLE TRIGGER trg_export_records_no_delete`)
  }
  for (const org of [ORG_ID, OTHER_ORG_ID]) {
    await tx.$executeRawUnsafe(`DELETE FROM exceptions WHERE organization_id = '${org}'`)
    await tx.$executeRawUnsafe(`DELETE FROM customer_wht_certificates WHERE organization_id = '${org}'`)
    await tx.$executeRawUnsafe(`DELETE FROM cash_receipts WHERE organization_id = '${org}'`)
    await tx.$executeRawUnsafe(`DELETE FROM bank_transactions WHERE organization_id = '${org}'`)
    await tx.$executeRawUnsafe(`DELETE FROM billing_batches WHERE organization_id = '${org}'`)
    await tx.$executeRawUnsafe(`DELETE FROM accounting_periods WHERE organization_id = '${org}'`)
  }
}

beforeAll(async () => {
  if (!url) return
  process.env.DATABASE_URL = url
  recon = await import('@/lib/bank-recon/queries')
  customerWht = await import('@/lib/customer-wht/queries')
  accounting = await import('@/lib/accounting/queries')
  exportsApi = await import('@/lib/exports/queries')

  const tx = db()
  for (const [org, role, user, taxId] of [
    [ORG_ID, ROLE_ID, USER_ID, '9999999940400'],
    [OTHER_ORG_ID, OTHER_ROLE_ID, OTHER_USER_ID, '9999999940401'],
  ] as const) {
    await tx.$executeRawUnsafe(`
      INSERT INTO organizations (id, name, tax_id, address)
      VALUES ('${org}', 'U40Test ${org.slice(-3)}', '${taxId}', 'ที่อยู่ทดสอบ U40') ON CONFLICT (id) DO NOTHING
    `)
    await tx.$executeRawUnsafe(`
      INSERT INTO roles (id, organization_id, name, role_group, is_seed)
      VALUES ('${role}', '${org}', 'บัญชี U40 ${org.slice(-3)}', 'system', false) ON CONFLICT (id) DO NOTHING
    `)
    await tx.$executeRawUnsafe(`
      INSERT INTO users (id, organization_id, role_id, email, full_name, status)
      VALUES ('${user}', '${org}', '${role}', 'u40-${org.slice(-3)}@test.local', 'บัญชี U40', 'active')
      ON CONFLICT (id) DO NOTHING
    `)
  }
  await tx.$executeRawUnsafe(`
    INSERT INTO finance_companies (id, organization_id, name, short_name, tax_id, vat_mode, payment_due_days, created_by)
    VALUES ('${COMPANY_A}', '${ORG_ID}', 'ไฟแนนซ์ CO1 U40', 'CO1U40', '0105540400001', 'exclude_vat', 30, '${USER_ID}')
    ON CONFLICT (id) DO NOTHING
  `)
  await tx.$executeRawUnsafe(`
    INSERT INTO bank_accounts (id, organization_id, bank_name, account_name, account_number, usage,
                               auto_match_tolerance_days, created_by)
    VALUES ('${BANK_ACCOUNT_ID}', '${ORG_ID}', 'ธนาคารกสิกรไทย', 'บริษัท U40', '4040404040', 'both', 7, '${USER_ID}')
    ON CONFLICT (id) DO NOTHING
  `)
  await cleanup()
})

afterAll(async () => {
  if (url) await cleanup()
  await client?.$disconnect()
})

beforeEach(async () => {
  resetFakeUploads()
  packStorage.clear()
  if (url) await cleanup()
})

// ── U40 ──────────────────────────────────────────────────────────────────────

suite('มติ PO U40 — 50 ทวิ ที่ลูกค้าหักเรา', () => {
  it('จับคู่เงินรับที่ลูกค้าหักภาษี ⇒ เกิด "รอ 50 ทวิ จากลูกค้า" อัตโนมัติ (ยอด/ลูกค้า/รอบวางบิล/เงินรับ) + audit', async () => {
    const { txId, certificateId } = await seedWithheldReceipt()

    const receipt = await db().cashReceipt.findFirstOrThrow({ where: { bankTransactionId: txId } })
    expect(receipt.whtWithheldByCustomerSatang).toBe(11190)

    const cert = await db().customerWhtCertificate.findUniqueOrThrow({ where: { id: certificateId } })
    expect(cert.status).toBe('pending')
    expect(cert.withheldSatang).toBe(11190)
    expect(cert.companyId).toBe(COMPANY_A)
    expect(cert.billingBatchId).toBe(BILLING_A)
    expect(cert.cashReceiptId).toBe(receipt.id)
    expect(cert.certificateNumber).toBeNull()

    // AR ปิดเต็ม (ส่วนที่ถูกหักเป็นเครดิตภาษี ไม่ใช่หนี้ค้าง)
    const billing = await db().billingBatch.findUniqueOrThrow({ where: { id: BILLING_A } })
    expect(billing.status).toBe('paid')

    const audits = await auditOf('customer_wht_certificates', certificateId)
    expect(audits.map((row) => row.action)).toEqual(['create'])
    expect(audits[0]?.reason).toContain('รอหนังสือรับรอง 50 ทวิ')

    const list = await customerWht.listCustomerWht(accountant, { limit: 50 })
    expect(list.items).toHaveLength(1)
    expect(list.items[0]).toMatchObject({
      status: 'pending',
      statusLabel: 'รอ 50 ทวิ จากลูกค้า',
      withheldSatang: 11190,
      companyName: 'ไฟแนนซ์ CO1 U40',
      bankTransactionId: txId,
      amountMatches: null,
    })
    expect(list.summary).toMatchObject({ pendingCount: 1, pendingSatang: 11190, receivedCount: 0 })
    expect(list.byCompany).toEqual([
      { companyId: COMPANY_A, companyName: 'ไฟแนนซ์ CO1 U40', pendingCount: 1, pendingSatang: 11190 },
    ])
  })

  it('รับเต็มจำนวน (ไม่ถูกหัก) ⇒ ไม่เกิดรายการรอ 50 ทวิ', async () => {
    await seedBilling(BILLING_A, 399110, { whtSatang: 11190 })
    await importOne('05/08/2569,โอนเข้าเต็มยอด,KBANK-U40-2,"3,991.10",', 'full.csv')
    expect(await db().customerWhtCertificate.count({ where: { organizationId: ORG_ID } })).toBe(0)
  })

  it('บันทึกรับหนังสือ: ไฟล์ตรวจที่ server · received + audit · ข้อยกเว้นที่ผูกไว้ถูกแก้ไขแล้ว', async () => {
    const { certificateId } = await seedWithheldReceipt()
    uploadTestState.realVerify = true
    const periodId = await augustPeriodId()
    await db().$executeRawUnsafe(`
      INSERT INTO exceptions (id, organization_id, period_id, level, status, title, description, source_module, source_ref, created_by)
      VALUES (gen_random_uuid(), '${ORG_ID}', '${periodId}', 'warning', 'open', 'รอ 50 ทวิ CO1', 'รอหนังสือจากลูกค้า',
              'customer_wht', '${certificateId}', '${USER_ID}')
    `)

    // ไฟล์นอก prefix ของรายการ ⇒ ปฏิเสธ (กันผูกไฟล์ของรายการอื่น)
    putFakeUpload('customer-wht/00000000-0000-4000-8000-000000000000/x.pdf', sampleBytes('pdf'))
    await expectCode(
      () =>
        customerWht.receiveCustomerWht(ctx, certificateId, {
          certificateNumber: 'สฟ-2569/0451',
          certificateDate: new Date('2026-08-10T00:00:00Z'),
          whtSatang: 11190,
          filePath: 'customer-wht/00000000-0000-4000-8000-000000000000/x.pdf',
        }),
      'UPLOAD_PATH_OUT_OF_SCOPE',
    )

    const result = await customerWht.receiveCustomerWht(ctx, certificateId, {
      certificateNumber: 'สฟ-2569/0451',
      certificateDate: new Date('2026-08-10T00:00:00Z'),
      whtSatang: 11190,
      grossSatang: 373000,
      filePath: certFile(certificateId),
    })
    expect(result.warnings).toEqual([])
    expect(result.certificate).toMatchObject({
      status: 'received',
      statusLabel: 'ได้รับแล้ว',
      certificateNumber: 'สฟ-2569/0451',
      whtSatang: 11190,
      amountMatches: true,
    })

    const row = await db().customerWhtCertificate.findUniqueOrThrow({ where: { id: certificateId } })
    expect(row.fileSha256).toMatch(/^[0-9a-f]{64}$/)
    expect(row.receivedBy).toBe(USER_ID)

    const audits = await auditOf('customer_wht_certificates', certificateId)
    expect(audits.map((entry) => entry.action)).toEqual(['create', 'status_change'])
    expect(audits[1]?.reason).toContain('สฟ-2569/0451')

    const exception = await db().exception.findFirstOrThrow({ where: { organizationId: ORG_ID } })
    expect(exception.status).toBe('resolved')
    expect(exception.resolutionNote).toContain('สฟ-2569/0451')
  })

  it('ยอดในหนังสือไม่ตรงยอดที่ถูกหัก ⇒ บันทึกได้ + warnings (ไม่บล็อก)', async () => {
    const { certificateId } = await seedWithheldReceipt()
    const result = await customerWht.receiveCustomerWht(ctx, certificateId, {
      certificateNumber: 'สฟ-2569/0452',
      certificateDate: new Date('2026-08-10T00:00:00Z'),
      whtSatang: 11000,
      filePath: certFile(certificateId),
    })
    expect(result.certificate.status).toBe('received')
    expect(result.certificate.amountMatches).toBe(false)
    expect(result.warnings).toHaveLength(1)
    expect(result.warnings[0]).toContain('ไม่ตรง')
  })

  it('รับซ้ำ ⇒ CUSTOMER_WHT_INVALID_STATUS · เลขที่ซ้ำลูกค้าเดียวกัน ⇒ CUSTOMER_WHT_NUMBER_DUPLICATE', async () => {
    const { certificateId } = await seedWithheldReceipt()
    const input = {
      certificateNumber: 'สฟ-2569/0500',
      certificateDate: new Date('2026-08-10T00:00:00Z'),
      whtSatang: 11190,
      filePath: certFile(certificateId),
    }
    await customerWht.receiveCustomerWht(ctx, certificateId, input)
    await expectCode(() => customerWht.receiveCustomerWht(ctx, certificateId, input), 'CUSTOMER_WHT_INVALID_STATUS')

    // รายการที่สองของลูกค้าเดียวกันใช้เลขที่เดิม
    await seedBilling(BILLING_B, 200000, { whtSatang: 6000, period: '2569-09' })
    const tx2 = await importOne('06/08/2569,โอนเข้า CO1 รอบสอง,KBANK-U40-3,"1,940.00",', 'u40-2.csv')
    const second = await db().customerWhtCertificate.findFirstOrThrow({
      where: { organizationId: ORG_ID, cashReceipt: { bankTransactionId: tx2 } },
      select: { id: true },
    })
    await expectCode(
      () =>
        customerWht.receiveCustomerWht(ctx, second.id, {
          ...input,
          whtSatang: 6000,
          filePath: certFile(second.id),
        }),
      'CUSTOMER_WHT_NUMBER_DUPLICATE',
    )
    expect((await db().customerWhtCertificate.findUniqueOrThrow({ where: { id: second.id } })).status).toBe('pending')
  })

  it('ข้ามองค์กร ⇒ CUSTOMER_WHT_NOT_FOUND · รายการไม่รั่ว · id ไม่ใช่ UUID ⇒ NOT_FOUND', async () => {
    const { certificateId } = await seedWithheldReceipt()
    await expectCode(
      () =>
        customerWht.receiveCustomerWht(outsiderCtx, certificateId, {
          certificateNumber: 'X-1',
          certificateDate: new Date('2026-08-10T00:00:00Z'),
          whtSatang: 11190,
          filePath: certFile(certificateId),
        }),
      'CUSTOMER_WHT_NOT_FOUND',
    )
    const list = await customerWht.listCustomerWht(outsider, { limit: 50 })
    expect(list.items).toEqual([])
    expect(list.byCompany).toEqual([])
    await expectCode(() => customerWht.assertCustomerWhtInScope(accountant, 'not-a-uuid'), 'CUSTOMER_WHT_NOT_FOUND')
  })

  it('ตัวกรองสถานะ/อายุค้าง/ลูกค้า', async () => {
    const { certificateId } = await seedWithheldReceipt()
    const now = new Date('2026-12-01T03:00:00Z') // รับเงิน 05/08 ⇒ ค้าง 118 วัน
    expect((await customerWht.listCustomerWht(accountant, { status: 'received', limit: 50 }, now)).items).toEqual([])
    const old = await customerWht.listCustomerWht(accountant, { age: 'over_90', limit: 50 }, now)
    expect(old.items.map((item) => item.id)).toEqual([certificateId])
    expect(old.items[0]?.ageDays).toBe(118)
    expect((await customerWht.listCustomerWht(accountant, { age: '0_30', limit: 50 }, now)).items).toEqual([])
    expect(
      (await customerWht.listCustomerWht(accountant, { companyId: COMPANY_A, limit: 50 }, now)).items,
    ).toHaveLength(1)
  })

  it('เปลี่ยนการจับคู่ ⇒ รายการรอ 50 ทวิ ของเงินรับเดิมถูกถอน (soft delete + audit)', async () => {
    const { txId, certificateId } = await seedWithheldReceipt()
    await seedBilling(BILLING_B, 387920, { period: '2569-10' })
    await recon.matchBankTransaction(ctx, txId, {
      targetKind: 'billing',
      targetId: BILLING_B,
      matchNote: 'จับคู่ผิดรอบ ย้ายไปรอบที่ถูกต้อง',
      confirmRematch: true,
    })
    const cert = await db().customerWhtCertificate.findUniqueOrThrow({ where: { id: certificateId } })
    expect(cert.deletedAt).not.toBeNull()
    expect((await customerWht.listCustomerWht(accountant, { limit: 50 })).items).toEqual([])
    const audits = await auditOf('customer_wht_certificates', certificateId)
    expect(audits.map((entry) => entry.action)).toEqual(['create', 'delete'])
    expect(audits[1]?.reason).toContain('เปลี่ยนการจับคู่')
  })
})

// ── U41 ──────────────────────────────────────────────────────────────────────

suite('มติ PO U41 — เงินรับรอตรวจสอบ', () => {
  it('unmatched → suspense: ไม่สร้างเงินรับ · AR ของรอบวางบิลไม่เปลี่ยน · audit มีเหตุผล', async () => {
    await seedBilling(BILLING_A, 802500)
    const txId = await importOne('05/08/2569,โอนเข้าไม่ระบุผู้โอน,KBANK-U41-1,123.45,', 'u41.csv')
    const before = await db().billingBatch.findUniqueOrThrow({ where: { id: BILLING_A } })

    const dto = await recon.moveToSuspense(ctx, txId, { reason: 'โอนเข้าไม่ระบุผู้โอน รอสอบถามธนาคาร' })
    expect(dto.matchStatus).toBe('suspense')
    expect(dto.matchStatusLabel).toBe('เงินรับรอตรวจสอบ')
    expect(dto.suspenseNote).toBe('โอนเข้าไม่ระบุผู้โอน รอสอบถามธนาคาร')
    expect(dto.matchedId).toBeNull()

    expect(await db().cashReceipt.count({ where: { organizationId: ORG_ID } })).toBe(0)
    const after = await db().billingBatch.findUniqueOrThrow({ where: { id: BILLING_A } })
    expect(after.receivedSatang).toBe(before.receivedSatang)
    expect(after.status).toBe(before.status)

    const audits = await auditOf('bank_transactions', txId)
    expect(audits.at(-1)).toEqual({ action: 'status_change', reason: 'โอนเข้าไม่ระบุผู้โอน รอสอบถามธนาคาร' })

    const list = await recon.listBankTransactions(accountant, { limit: 50 })
    expect(list.summary).toMatchObject({ suspense: 1, suspenseOutstandingCount: 1, suspenseOutstandingSatang: 12345 })
  })

  it('เงินออก / ไม่มีเหตุผล / รายการที่จับคู่แล้ว ⇒ ปฏิเสธ', async () => {
    const outId = await importOne('05/08/2569,ค่าธรรมเนียม,FEE-U41,,35.00', 'fee.csv')
    await expectCode(() => recon.moveToSuspense(ctx, outId, { reason: 'ไม่ทราบ' }), 'BANK_TRANSACTION_INVALID_STATUS')

    const inId = await importOne('06/08/2569,โอนเข้าไม่ระบุ,KBANK-U41-2,500.00,', 'in.csv')
    await expectCode(() => recon.moveToSuspense(ctx, inId, { reason: '   ' }), 'MATCH_NOTE_REQUIRED')

    await recon.moveToSuspense(ctx, inId, { reason: 'ไม่ทราบที่มา' })
    await expectCode(() => recon.moveToSuspense(ctx, inId, { reason: 'ซ้ำ' }), 'BANK_TRANSACTION_INVALID_STATUS')
    await expectCode(
      () => recon.resolveUnmatchedTransaction(ctx, inId, { matchNote: 'ปิด' }),
      'BANK_TRANSACTION_INVALID_STATUS',
    )
    // ข้ามองค์กร ⇒ ไม่พบ (ไม่ leak)
    await expectCode(() => recon.moveToSuspense(outsiderCtx, inId, { reason: 'x' }), 'BANK_TRANSACTION_NOT_FOUND')
  })

  it('ทราบที่มาภายหลัง: จับคู่ไม่มีเหตุผล ⇒ MATCH_NOTE_REQUIRED · มีเหตุผล ⇒ manual_matched + เงินรับ + AR ลด', async () => {
    await seedBilling(BILLING_A, 50000)
    const txId = await importOne('20/08/2569,โอนเข้าไม่ระบุ,KBANK-U41-3,500.00,', 'late.csv')
    // ยอดตรงแต่เกิน tolerance ⇒ ไม่ auto-match → ย้ายเป็นเงินรอตรวจสอบ
    await recon.moveToSuspense(ctx, txId, { reason: 'ยังไม่ทราบว่าลูกค้ารายใดโอน' })

    await expectCode(
      () =>
        recon.matchBankTransaction(ctx, txId, {
          targetKind: 'billing',
          targetId: BILLING_A,
          matchNote: null,
          confirmRematch: false,
        }),
      'MATCH_NOTE_REQUIRED',
    )

    const result = await recon.matchBankTransaction(ctx, txId, {
      targetKind: 'billing',
      targetId: BILLING_A,
      matchNote: 'ลูกค้ายืนยันทางอีเมลว่าเป็นค่าบริการรอบนี้',
      confirmRematch: false,
    })
    expect(result.warning).toBeUndefined()
    expect(result.result?.transaction.matchStatus).toBe('manual_matched')
    // ประวัติว่าเคยรอตรวจสอบยังอยู่
    expect(result.result?.transaction.suspenseNote).toBe('ยังไม่ทราบว่าลูกค้ารายใดโอน')

    const billing = await db().billingBatch.findUniqueOrThrow({ where: { id: BILLING_A } })
    expect(billing.receivedSatang).toBe(50000)
    expect(billing.status).toBe('paid')
    expect(await db().cashReceipt.count({ where: { organizationId: ORG_ID, bankTransactionId: txId } })).toBe(1)
  })

  it('คืนเงินผู้โอน: หลักฐานตรวจที่ server · suspense_refunded · จับคู่/คืนซ้ำไม่ได้', async () => {
    await seedBilling(BILLING_A, 50000)
    const txId = await importOne('20/08/2569,โอนเข้าผิดบัญชี,KBANK-U41-4,500.00,', 'refund.csv')

    // ยังไม่ใช่เงินรอตรวจสอบ ⇒ คืนไม่ได้
    await expectCode(
      () =>
        recon.refundSuspense(ctx, txId, {
          refundDate: new Date('2026-08-22T00:00:00Z'),
          reason: 'โอนผิด',
          filePath: refundFile(txId),
        }),
      'BANK_TRANSACTION_INVALID_STATUS',
    )
    await recon.moveToSuspense(ctx, txId, { reason: 'ผู้โอนแจ้งว่าโอนผิดบัญชี' })

    uploadTestState.realVerify = true
    await expectCode(
      () =>
        recon.refundSuspense(ctx, txId, {
          refundDate: new Date('2026-08-22T00:00:00Z'),
          reason: 'คืนตามคำขอ',
          filePath: `bank-transactions/${txId}/refund/missing.pdf`,
        }),
      'UPLOAD_FILE_NOT_FOUND',
    )

    const dto = await recon.refundSuspense(ctx, txId, {
      refundDate: new Date('2026-08-22T00:00:00Z'),
      reason: 'คืนตามคำขอพร้อมสำเนาสลิป',
      filePath: refundFile(txId),
    })
    expect(dto.matchStatus).toBe('suspense_refunded')
    expect(dto.refundNote).toBe('คืนตามคำขอพร้อมสำเนาสลิป')
    expect(dto.refundDate).toBe('2026-08-22T00:00:00.000Z')
    expect(await db().cashReceipt.count({ where: { organizationId: ORG_ID } })).toBe(0)

    await expectCode(
      () =>
        recon.matchBankTransaction(ctx, txId, {
          targetKind: 'billing',
          targetId: BILLING_A,
          matchNote: 'จับคู่หลังคืนเงิน',
          confirmRematch: false,
        }),
      'BANK_TRANSACTION_INVALID_STATUS',
    )
    await expectCode(
      () =>
        recon.refundSuspense(ctx, txId, {
          refundDate: new Date('2026-08-22T00:00:00Z'),
          reason: 'ซ้ำ',
          filePath: refundFile(txId),
        }),
      'BANK_TRANSACTION_INVALID_STATUS',
    )
    const audits = await auditOf('bank_transactions', txId)
    expect(audits.at(-1)?.reason).toBe('คืนเงินผู้โอน — คืนตามคำขอพร้อมสำเนาสลิป')
  })

  it('Readiness: เงินรับรอตรวจสอบไม่บล็อก แต่เตือน · 50 ทวิ ค้างเตือน', async () => {
    await seedWithheldReceipt()
    const txId = await importOne('07/08/2569,โอนเข้าไม่ระบุ,KBANK-U41-5,123.45,', 'r.csv')
    await recon.moveToSuspense(ctx, txId, { reason: 'ไม่ทราบที่มา' })

    const readiness = await accounting.getPeriodReadiness(accountant, await augustPeriodId())
    expect(readiness.unmatchedBankCount).toBe(0)
    expect(readiness.checks.find((check) => check.key === 'bank_reconcile')?.passed).toBe(true)
    expect(readiness.warnings.some((warning) => warning.includes('เงินรับรอตรวจสอบคงค้าง 1 รายการ'))).toBe(true)
    expect(readiness.warnings.some((warning) => warning.includes('50 ทวิ จากลูกค้า 1 รายการ'))).toBe(true)
  })

  it('งวดที่ locked ⇒ ย้ายเป็นเงินรอตรวจสอบโดน PERIOD_LOCKED_DIRECT_EDIT', async () => {
    const txId = await importOne('08/08/2569,โอนเข้าไม่ระบุ,KBANK-U41-6,100.00,', 'lock.csv')
    await db().$executeRawUnsafe(
      `UPDATE accounting_periods SET status = 'locked' WHERE organization_id = '${ORG_ID}' AND year_be = 2569 AND month = 8`,
    )
    await expectCode(() => recon.moveToSuspense(ctx, txId, { reason: 'ไม่ทราบที่มา' }), 'PERIOD_LOCKED_DIRECT_EDIT')
  })
})

// ── Export Pack ─────────────────────────────────────────────────────────────

suite('มติ PO U40/U41 — Export Pack 10_Customer_WHT.csv + 11_Suspense_Receipts.csv', () => {
  it('ไฟล์ 10 มีภาษีที่ลูกค้าหัก + สถานะหนังสือ · ไฟล์ 11 มีเงินรับรอตรวจสอบของงวด · 06 แสดง enum suspense', async () => {
    await seedWithheldReceipt()
    const txId = await importOne('09/08/2569,โอนเข้าไม่ระบุผู้โอน,KBANK-U41-7,123.45,', 'x.csv')
    await recon.moveToSuspense(ctx, txId, { reason: 'ไม่ทราบที่มา' })

    const record = await exportsApi.createExportPack(ctx, { periodId: await augustPeriodId() })
    expect(record.fileCount).toBe(14)

    const decoder = new TextDecoder()
    const fileText = (suffix: string): string =>
      decoder.decode(packStorage.get([...packStorage.keys()].find((path) => path.endsWith(suffix)) ?? '') ?? new Uint8Array())

    const customer = fileText('10_Customer_WHT.csv').slice(CSV_BOM.length).split('\r\n')
    // มติ U79 — `billing_ref` คงเป็นรอบเดือน · เลขรอบจริง BL-<พ.ศ.>-NNN อยู่คอลัมน์ต่อท้าย
    expect(customer[1]).toMatch(/^05\/08\/2569,ไฟแนนซ์ CO1 U40,0105540400001,2569-05,-,111\.90,-,-,-,pending,BL-25\d{2}-\d{3,}$/)

    const suspense = fileText('11_Suspense_Receipts.csv').slice(CSV_BOM.length).split('\r\n')
    expect(suspense).toHaveLength(3)
    expect(suspense[1]).toMatch(/^09\/08\/2569,โอนเข้าไม่ระบุผู้โอน[^,]*,123\.45,\d{2}\/\d{2}\/25\d{2},ไม่ทราบที่มา,suspense,-,-,-,-$/)

    expect(fileText('06_Bank_Reconciliation.csv')).toContain(',suspense,-\r\n')
  })
})
