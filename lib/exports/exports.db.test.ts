import { PrismaPg } from '@prisma/adapter-pg'
import { TAX_INVOICE_FIXTURE_COLUMNS, taxInvoiceFixtureValues } from '@/tests/helpers/tax-invoice-fixture'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import type { SessionUser } from '@/lib/auth/types'
import { PrismaClient } from '@/lib/generated/prisma/client'
import { CSV_BOM } from '@/lib/exports/csv'

/**
 * เทสต์ระดับ DB ของ Phase 4.6 — DoD ของไฟล์ 37
 *
 *  - `37` §16: Export ขณะมี critical `open` ⇒ `EXPORT_BLOCKED_CRITICAL` · `authorized` แล้วผ่าน (`34` §11)
 *  - `37` §16: Export ซ้ำรอบเดิม ⇒ version ถัดไป (v1.0 → v1.1) **ไม่ทับของเดิม** และไฟล์เก่ายังอยู่ครบ
 *  - `37` §16: mark-sent ⇒ `sent` + `sent_at` · ข้ามขั้น `generated → accepted` ⇒ `EXPORT_INVALID_STATUS`
 *  - `37` §6.1: ชุดมีไฟล์ 00–16 ครบ (09 = มติ PO U21 · 10/11 = U40/U41 · 12/13 = U57/U68 · 14 = U87 · 00/15/16 = U94) + หน้าปก + `.zip` · `file_hash` = SHA-256 ของ `.zip` จริง
 *  - มติ PO U94: ค่าใช้จ่ายค้างจ่าย · เงินทดรองยกมา/คงเหลือ · ยอดรวมควบคุมตรงกับผลรวมไฟล์ · PDF 50 ทวิ/ใบสำคัญจ่าย/สลิปใน zip · เพดาน
 *  - DEC-006/D10: payee ที่ไม่มีเลขผู้เสียภาษี 13 หลัก ⇒ `EXPORT_PAYEE_TAX_ID_MISSING` (ไม่ปล่อยช่องว่างออกไป)
 *  - `37` §10: ไม่มีทางลบระเบียนเก่า — export ครั้งใหม่เพิ่มแถว ไม่ใช่ update แถวเดิม
 *
 * ⚠️ ต้องตั้ง `DATABASE_URL = TEST_DATABASE_URL` **ก่อน** import service (กับดัก 2026-08-14)
 * ⚠️ Supabase Storage ถูกแทนด้วยที่เก็บในหน่วยความจำ — เทสต์ตรวจ**ไบต์จริงของไฟล์ที่จะอัปโหลด**
 *    (ไม่ยิงเครือข่ายจริง แต่ยังพิสูจน์เนื้อไฟล์/hash ได้ครบ)
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
  console.warn('[exports.db.test] ข้ามเทสต์ระดับ DB — ไม่มี TEST_DATABASE_URL (ดู .env.example)')
}

/** ที่เก็บไฟล์จำลอง — path → ไบต์ (แทน bucket `accounting-packs`) */
const storage = new Map<string, Uint8Array>()
/** จำลอง Storage ปฏิเสธบาง path (เช่น "Invalid key") — คืน true = ล้ม */
let rejectUpload: ((path: string) => boolean) | null = null
/** path ที่ถูกขอให้ลบ (เก็บกวาดหลังล้ม) */
const removed: string[] = []

vi.mock('@/lib/exports/pack-storage', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/exports/pack-storage')>()
  return {
    ...actual,
    uploadPackFile: async (input: { path: string; bytes: Uint8Array }) => {
      // `upsert: false` ของจริง — เขียนทับ path เดิมไม่ได้เด็ดขาด (Rule 09)
      if (storage.has(input.path)) throw new Error(`ไฟล์ซ้ำ: ${input.path}`)
      if (rejectUpload?.(input.path) === true) throw new Error(`Invalid key: ${input.path}`)
      storage.set(input.path, input.bytes)
    },
    removePackFiles: async (paths: readonly string[]) => {
      for (const path of paths) {
        removed.push(path)
        storage.delete(path)
      }
      return []
    },
    downloadPackFile: async (path: string) => {
      const bytes = storage.get(path)
      if (bytes === undefined) throw new Error(`ไม่พบไฟล์: ${path}`)
      return bytes
    },
  }
})

const ORG_ID = '00000000-0000-4000-8000-0000000046a0'
const ROLE_ID = '00000000-0000-4000-8000-0000000046a1'
const USER_ID = '00000000-0000-4000-8000-0000000046a2'
const AGENT_ID = '00000000-0000-4000-8000-0000000046a3'
const NO_TAX_ID_USER = '00000000-0000-4000-8000-0000000046a4'
const PAYEE_ID = '00000000-0000-4000-8000-0000000046a5'
const PAYEE_NO_TAX_ID = '00000000-0000-4000-8000-0000000046a6'
const COMPANY_ID = '00000000-0000-4000-8000-0000000046a7'
const CASE_ID = '00000000-0000-4000-8000-0000000046a8'

/** วันจ่ายจริงของทุกรอบในไฟล์นี้ — 25/06/2569 เวลาไทย ⇒ งวด "มิถุนายน 2569" */
const PAYMENT_AT = '2026-06-25T03:00:00Z'

let client: PrismaClient | null = null
type ExpenseQueries = typeof import('@/lib/expenses/queries')
type WhtQueries = typeof import('@/lib/wht/queries')
type ExportQueries = typeof import('@/lib/exports/queries')
let expenses: ExpenseQueries
let wht: WhtQueries
let exportsApi: ExportQueries

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
  supabaseUid: 'uid-acc-46',
  email: 'accounting46@test.local',
  fullName: 'บัญชี 4.6',
  status: 'active',
  roleId: ROLE_ID,
  roleName: 'บัญชี',
  roleGroup: 'system',
  isSuperadmin: false,
  teamId: null,
  companyId: null,
  capabilities: {
    manage_sales_expenses: 'manage',
    manage_wht: 'manage',
    manage_accounting_period: 'manage',
    export_accounting_pack: 'manage',
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

const decoder = new TextDecoder()
/** อ่านไฟล์ CSV ต้อง **ไม่** ให้ตัว decode กิน BOM ทิ้ง — BOM คือส่วนหนึ่งของรูปแบบไฟล์ที่ต้องพิสูจน์ */
const rawDecoder = new TextDecoder('utf-8', { ignoreBOM: true })

/** อ่านชื่อไฟล์ทั้งหมดใน .zip จาก central directory (ทางเดียวกับโปรแกรมแตกไฟล์จริง) */
function zipEntryNames(bytes: Uint8Array): string[] {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  const eocd = bytes.length - 22
  const count = view.getUint16(eocd + 10, true)
  let cursor = view.getUint32(eocd + 16, true)

  const names: string[] = []
  for (let index = 0; index < count; index += 1) {
    const nameLength = view.getUint16(cursor + 28, true)
    names.push(decoder.decode(bytes.subarray(cursor + 46, cursor + 46 + nameLength)))
    cursor += 46 + nameLength
  }
  return names
}

function fileAt(path: string): string {
  const bytes = storage.get(path)
  if (bytes === undefined) throw new Error(`ไม่พบไฟล์ ${path}`)
  return rawDecoder.decode(bytes)
}

// ── seed helpers ────────────────────────────────────────────────────────────

let batchCursor = 0

interface SeedItem {
  payeeId: string
  gross: number
  wht: number
}

async function seedCompletedBatch(items: readonly SeedItem[]): Promise<string> {
  batchCursor += 1
  const name = `PB-4.6-${batchCursor}`
  const gross = items.reduce((sum, item) => sum + item.gross, 0)
  const whtTotal = items.reduce((sum, item) => sum + item.wht, 0)

  const rows = await db().$queryRawUnsafe<{ id: string }[]>(`
    INSERT INTO payout_batches (organization_id, name, side, status, gross_satang, wht_satang, net_satang,
                                payment_file_generated_at, idempotency_key, created_by)
    VALUES ('${ORG_ID}', '${name}', 'outsource', 'completed', ${gross}, ${whtTotal}, ${gross - whtTotal},
            '${PAYMENT_AT}', '${name}-KEY', '${USER_ID}')
    RETURNING id
  `)
  const batchId = rows[0]?.id ?? ''
  // เลขใบสำคัญจ่าย = snapshot ที่ระบบออกตอนสร้างไฟล์โอน (มติ PO U102) — รอบจำลองต้องใส่เองต่อผู้รับ
  const payees = [...new Set(items.map((item) => item.payeeId))]
  const voucherOf = (payeeId: string): string =>
    `PV-2569-${String(batchCursor * 100 + payees.indexOf(payeeId) + 1).padStart(4, '0')}`

  for (const item of items) {
    const expenseRows = await db().$queryRawUnsafe<{ id: string }[]>(`
      INSERT INTO expenses (organization_id, case_id, payee_id, expense_type, gross_satang, expense_date, status,
                            receipt_file_url, created_by)
      VALUES ('${ORG_ID}', '${CASE_ID}', '${item.payeeId}', 'commission', ${item.gross}, '2026-06-20', 'approved',
              'field/receipts/ok.jpg', '${USER_ID}')
      RETURNING id
    `)
    await db().$executeRawUnsafe(`
      INSERT INTO payout_batch_items (organization_id, payout_batch_id, expense_id, payee_id,
                                      gross_satang, wht_satang, net_satang, wht_pct_snapshot, voucher_number, created_by)
      VALUES ('${ORG_ID}', '${batchId}', '${expenseRows[0]?.id}', '${item.payeeId}',
              ${item.gross}, ${item.wht}, ${item.gross - item.wht}, 3.00, '${voucherOf(item.payeeId)}', '${USER_ID}')
    `)
  }

  await expenses.syncExpenseRecordsFromPayout(ctx, batchId)
  await wht.syncWhtCertificatesFromPayout(ctx, batchId)
  return batchId
}

async function junePeriodId(): Promise<string> {
  const rows = await db().$queryRawUnsafe<{ id: string }[]>(`
    SELECT id FROM accounting_periods WHERE organization_id = '${ORG_ID}' AND year_be = 2569 AND month = 6
  `)
  return rows[0]?.id ?? ''
}

async function seedException(level: string, status: string): Promise<string> {
  const periodId = await junePeriodId()
  const rows = await db().$queryRawUnsafe<{ id: string }[]>(`
    INSERT INTO exceptions (organization_id, period_id, level, status, title, description, source_module, source_ref,
                            created_by)
    VALUES ('${ORG_ID}', '${periodId}', '${level}', '${status}', 'เอกสารไม่ครบ 4.6', 'รายละเอียดทดสอบ', 'expense',
            'EXP-4.6-0001', '${USER_ID}')
    RETURNING id
  `)
  return rows[0]?.id ?? ''
}

async function seedRevenue(): Promise<void> {
  await db().$executeRawUnsafe(`
    INSERT INTO revenues (organization_id, case_id, company_id, gross_satang, vat_satang, vat_rate_pct_used,
                          total_satang, fee_model_snapshot, vat_mode_snapshot, revenue_date, created_by)
    VALUES ('${ORG_ID}', '${CASE_ID}', '${COMPANY_ID}', 1200000, 84000, 7.00, 1284000, 'FLAT', 'exclude_vat', '2026-06-25',
            '${USER_ID}')
  `)
}

async function resetOrgData(): Promise<void> {
  storage.clear()
  const tx = db()
  // ชุดส่งสำนักงานบัญชี + ใบ 50 ทวิ ลบไม่ได้ด้วย trigger (`02` §13) — ปิดเฉพาะตอนล้างข้อมูลเทสต์
  await tx.$executeRawUnsafe(`ALTER TABLE export_records DISABLE TRIGGER trg_export_records_no_delete`)
  await tx.$executeRawUnsafe(`ALTER TABLE wht_certificates DISABLE TRIGGER trg_wht_certificates_no_delete`)
  await tx.$executeRawUnsafe(`ALTER TABLE tax_invoices DISABLE TRIGGER trg_tax_invoices_no_delete`)
  try {
    for (const statement of [
      `DELETE FROM export_records WHERE organization_id = '${ORG_ID}'`,
      `DELETE FROM wht_certificates WHERE organization_id = '${ORG_ID}'`,
      `DELETE FROM wht_filing_summaries WHERE organization_id = '${ORG_ID}'`,
      `DELETE FROM expense_records WHERE organization_id = '${ORG_ID}'`,
      `DELETE FROM exceptions WHERE organization_id = '${ORG_ID}'`,
      `DELETE FROM tax_invoices WHERE organization_id = '${ORG_ID}'`,
      `DELETE FROM sales_records WHERE organization_id = '${ORG_ID}'`,
      `DELETE FROM payout_batch_items WHERE organization_id = '${ORG_ID}'`,
      // หลังรายการรอบจ่าย — แถวของเงินทดรองในรอบจ่าย (มติ U94 ข้อ 3) ต้องหายก่อน ไม่งั้น FK ตั้งเป็น NULL แล้วชน CHECK
      `DELETE FROM advances WHERE organization_id = '${ORG_ID}'`,
      `DELETE FROM expenses WHERE organization_id = '${ORG_ID}'`,
      `DELETE FROM payout_batches WHERE organization_id = '${ORG_ID}'`,
      `DELETE FROM revenues WHERE organization_id = '${ORG_ID}'`,
      `DELETE FROM billing_batches WHERE organization_id = '${ORG_ID}'`,
      `DELETE FROM accounting_periods WHERE organization_id = '${ORG_ID}'`,
    ]) {
      await tx.$executeRawUnsafe(statement)
    }
  } finally {
    await tx.$executeRawUnsafe(`ALTER TABLE tax_invoices ENABLE TRIGGER trg_tax_invoices_no_delete`)
    await tx.$executeRawUnsafe(`ALTER TABLE wht_certificates ENABLE TRIGGER trg_wht_certificates_no_delete`)
    await tx.$executeRawUnsafe(`ALTER TABLE export_records ENABLE TRIGGER trg_export_records_no_delete`)
  }
}

beforeAll(async () => {
  if (!url) return
  process.env.DATABASE_URL = url
  expenses = await import('@/lib/expenses/queries')
  wht = await import('@/lib/wht/queries')
  exportsApi = await import('@/lib/exports/queries')

  const tx = db()
  await tx.$executeRawUnsafe(`
    INSERT INTO organizations (id, name, tax_id, address, vat_registered)
    VALUES ('${ORG_ID}', 'Phase46Test', '9999999994600', 'ที่อยู่ทดสอบ 4.6 กรุงเทพฯ', true)
    ON CONFLICT (id) DO NOTHING
  `)
  await tx.$executeRawUnsafe(`
    INSERT INTO roles (id, organization_id, name, role_group, is_seed)
    VALUES ('${ROLE_ID}', '${ORG_ID}', 'บัญชี 4.6', 'system', false) ON CONFLICT (id) DO NOTHING
  `)
  await tx.$executeRawUnsafe(`
    INSERT INTO users (id, organization_id, role_id, email, full_name, status)
    VALUES ('${USER_ID}', '${ORG_ID}', '${ROLE_ID}', 'accounting46@test.local', 'บัญชี 4.6', 'active'),
           ('${AGENT_ID}', '${ORG_ID}', '${ROLE_ID}', 'agent46@test.local', 'ประยุทธ์ บุญมี', 'active'),
           ('${NO_TAX_ID_USER}', '${ORG_ID}', '${ROLE_ID}', 'agent46b@test.local', 'สมชาย ไร้เลขภาษี', 'active')
    ON CONFLICT (id) DO NOTHING
  `)
  await tx.$executeRawUnsafe(`
    INSERT INTO payee_profiles (id, organization_id, user_id, payee_type, national_id, is_verified, created_by)
    VALUES ('${PAYEE_ID}', '${ORG_ID}', '${AGENT_ID}', 'individual', '3100000004600', true, '${USER_ID}'),
           ('${PAYEE_NO_TAX_ID}', '${ORG_ID}', '${NO_TAX_ID_USER}', 'individual', NULL, true, '${USER_ID}')
    ON CONFLICT (id) DO NOTHING
  `)
  // มติ PO U94 ข้อ 1 — คำนำหน้า/ที่อยู่ของผู้ถูกหัก (ไฟล์ 05 คอลัมน์ต่อท้าย) · UPDATE แยกเพราะแถวอาจค้างจากรอบรันก่อน
  await tx.$executeRawUnsafe(`
    UPDATE payee_profiles
    SET name_title = 'นาย', address_detail = '12 ม.3', address_subdistrict = 'ป่าแดด',
        address_district = 'เมืองเชียงใหม่', address_province = 'เชียงใหม่', address_postal_code = '50100'
    WHERE id = '${PAYEE_ID}'
  `)
  await tx.$executeRawUnsafe(`
    INSERT INTO finance_companies (id, organization_id, name, short_name, tax_id, address, contact_name,
                                   contact_phone, created_by)
    VALUES ('${COMPANY_ID}', '${ORG_ID}', 'บริษัท สยามไฟแนนซ์ จำกัด', 'SF46', '0105560046000', 'กรุงเทพฯ',
            'คุณเอ', '0800000046', '${USER_ID}')
    ON CONFLICT (id) DO NOTHING
  `)
  await tx.$executeRawUnsafe(`
    INSERT INTO cases (
      id, organization_id, case_ref, case_ref_normalized, company_id, source, status, created_by,
      debtor_name, addr_province, addr_district, asset_kind, asset_description,
      debt_amount_satang, outcome, closed_at
    ) VALUES (
      '${CASE_ID}', '${ORG_ID}', 'SF-2026-04600', 'sf-2026-04600', '${COMPANY_ID}', 'manual', 'closed_success',
      '${USER_ID}', 'ลูกหนี้ทดสอบ 4.6', 'เชียงใหม่', 'เมือง', 'smartphone', 'iPhone ทดสอบ',
      1000000, 'closed_success', '2026-06-20T03:00:00Z'
    ) ON CONFLICT (id) DO NOTHING
  `)

  await resetOrgData()
})

afterAll(async () => {
  await client?.$disconnect()
})

suite('Phase 4.6 — สร้างชุดเอกสารส่งบัญชี (`37` §6.1 · §16)', () => {
  it('ชุดมีไฟล์ 00–16 ครบ + หน้าปก + .zip + PDF 50 ทวิ/ใบสำคัญจ่าย/สลิป · file_hash = SHA-256 ของ .zip จริง', async () => {
    await resetOrgData()
    await seedCompletedBatch([{ payeeId: PAYEE_ID, gross: 850000, wht: 25500 }])
    await seedRevenue()

    const periodId = await junePeriodId()
    const record = await exportsApi.createExportPack(ctx, { periodId })

    expect(record.versionLabel).toBe('v1.0')
    expect(record.status).toBe('generated')
    expect(record.fileCount).toBe(17)
    expect(record.files.map((file) => file.key).sort()).toEqual([
      '00',
      '01',
      '02',
      '03',
      '04',
      '05',
      '06',
      '07',
      '08',
      '09',
      '10',
      '11',
      '12',
      '13',
      '14',
      '15',
      '16',
      'cover',
      'pack',
    ])

    const { sha256Hex } = await import('@/lib/exports/pack-storage')
    const zipPath = [...storage.keys()].find((path) => path.endsWith('.zip')) ?? ''
    const zipBytes = storage.get(zipPath)
    expect(zipBytes).toBeDefined()
    expect(record.fileHash).toBe(sha256Hex(zipBytes ?? new Uint8Array()))
    // เลขที่ 50 ทวิ เดินต่อเนื่องทั้งองค์กร (ไม่ถูกลบ) ⇒ แทนด้วยตัวยึดก่อนเทียบ
    const zipNames = zipEntryNames(zipBytes ?? new Uint8Array())
    const certEntry = zipNames.find((name) => /^wht_certificates\/WHT-2569-\d{3,}\.pdf$/.test(name)) ?? ''
    expect(zipNames.map((name) => (name === certEntry ? 'wht_certificates/<cert>.pdf' : name))).toEqual([
      '00_Cover_Sheet.pdf',
      '00_Control_Totals.csv',
      '01_Revenue.csv',
      '02_Cash_Receipts.csv',
      '03_Expenses.csv',
      '04_Payments.csv',
      '05_WHT_Data.csv',
      '06_Bank_Reconciliation.csv',
      '07_Adjustment_Log.csv',
      '08_Document_Checklist.xlsx',
      '09_Credit_Notes.csv',
      '10_Customer_WHT.csv',
      '11_Suspense_Receipts.csv',
      '12_Tax_Invoices.csv',
      '13_Advance_Returns.csv',
      '14_Unbilled_Revenue.csv',
      '15_Accrued_Expenses.csv',
      '16_Advance_Balance.csv',
      // มติ PO U94 ข้อ 5 — 50 ทวิ ของงวด (ชุดเดียวกับไฟล์ 05) + ใบสำคัญจ่าย/สลิปของรอบที่โอนแล้ว (ชุดเดียวกับไฟล์ 04)
      'wht_certificates/<cert>.pdf',
      'vouchers/PV-PB-4.6-1-KEY.pdf',
      'vouchers/SLIP-PB-4.6-1-KEY.pdf',
    ])
    for (const name of [certEntry, 'vouchers/PV-PB-4.6-1-KEY.pdf', 'vouchers/SLIP-PB-4.6-1-KEY.pdf']) {
      const pdf = zipEntryBytes(zipBytes ?? new Uint8Array(), name)
      expect(decoder.decode(pdf?.subarray(0, 5)), name).toBe('%PDF-')
    }
    // มติ PO 06/10/2569 (U87) — รายได้ของงวดที่ยังไม่ผูกรอบวางบิล ⇒ อยู่ในไฟล์รายได้ค้างรับ
    expect(fileAt([...storage.keys()].find((path) => path.endsWith('14_Unbilled_Revenue.csv')) ?? '')).toBe(
      `${CSV_BOM}case_ref,company,company_tax_id,delivered_date,fee_model,amount_before_vat_baht,vat_baht,total_baht,vat_rate_pct,billing_batch_number\r\n` +
        'SF-2026-04600,บริษัท สยามไฟแนนซ์ จำกัด,0105560046000,25/06/2569,FLAT,12000.00,840.00,12840.00,7.00,-\r\n',
    )
    // มติ PO 05/10/2569 (U40/U41) — รอบนี้ไม่มีรายการ ⇒ มีแต่หัวคอลัมน์
    expect(fileAt([...storage.keys()].find((path) => path.endsWith('10_Customer_WHT.csv')) ?? '')).toBe(
      `${CSV_BOM}received_date,company,company_tax_id,billing_ref,tax_invoice_ref,withheld_baht,cert_no,cert_date,cert_wht_baht,status,billing_batch_number\r\n`,
    )
    expect(fileAt([...storage.keys()].find((path) => path.endsWith('11_Suspense_Receipts.csv')) ?? '')).toBe(
      `${CSV_BOM}bank_txn_date,bank_ref,amount_baht,suspended_date,suspense_reason,status,resolved_ref,resolved_date,refund_reason,billing_batch_number\r\n`,
    )
    // มติ PO 05/10/2569 (U57/U68) — รอบนี้ไม่มีใบกำกับ/รับคืนเงินทดรอง ⇒ มีแต่หัวคอลัมน์ และไม่มีโฟลเดอร์ PDF
    expect(fileAt([...storage.keys()].find((path) => path.endsWith('12_Tax_Invoices.csv')) ?? '')).toBe(
      `${CSV_BOM}invoice_number,invoice_date,company,company_tax_id,amount_before_vat_baht,vat_baht,total_baht,vat_rate_pct,billing_ref,status,cancelled_date,cancel_reason,replaced_by,pdf_file,company_branch,billing_batch_number,document_type,received_date\r\n`,
    )
    expect(fileAt([...storage.keys()].find((path) => path.endsWith('13_Advance_Returns.csv')) ?? '')).toBe(
      `${CSV_BOM}return_date,advance_ref,payee,amount_baht,channel,payout_batch_ref,evidence_file,status,reversed_date,reversal_reason,return_number\r\n`,
    )
    // มติ PO 05/10/2569 (U21) — รอบนี้ไม่มีใบลดหนี้/ใบเพิ่มหนี้ ⇒ มีแต่หัวคอลัมน์
    const creditCsv = fileAt([...storage.keys()].find((path) => path.endsWith('09_Credit_Notes.csv')) ?? '')
    expect(creditCsv).toBe(
      `${CSV_BOM}document_type,number,issue_date,tax_invoice_ref,company,amount_before_vat_baht,vat_baht,total_baht,reason,status,adjustment_ref,company_branch,company_tax_id\r\n`,
    )
  })

  it('เนื้อไฟล์ตรงกับข้อมูลจริงของรอบ (รายได้/ค่าใช้จ่าย/จ่ายจริง/WHT)', async () => {
    const revenuePath = [...storage.keys()].find((path) => path.endsWith('01_Revenue.csv')) ?? ''
    const revenue = fileAt(revenuePath)
    expect(revenue.startsWith(CSV_BOM)).toBe(true)
    expect(revenue).toContain('บริษัท สยามไฟแนนซ์ จำกัด,SF-2026-04600,25/06/2569,12000.00,Y')

    const expenseCsv = fileAt([...storage.keys()].find((path) => path.endsWith('03_Expenses.csv')) ?? '')
    expect(expenseCsv).toContain('ประยุทธ์ บุญมี')
    expect(expenseCsv).toContain('8500.00,255.00,8245.00')

    const paymentCsv = fileAt([...storage.keys()].find((path) => path.endsWith('04_Payments.csv')) ?? '')
    expect(paymentCsv).toContain('PB-4.6-1-KEY,25/06/2569,ประยุทธ์ บุญมี,8245.00,Bank Transfer,PV-2569-0101')

    const whtCsv = fileAt([...storage.keys()].find((path) => path.endsWith('05_WHT_Data.csv')) ?? '')
    expect(whtCsv).toContain('ประยุทธ์ บุญมี,3100000004600,25/06/2569')
    expect(whtCsv).toContain('8500.00,255.00,3.00')
    // มติ PO 05/10/2569 (U15) — filing_form ต่อท้ายสุด ค่าจาก `wht_certificates.filing_form`
    expect(whtCsv).toContain('wht_baht,wht_pct,filing_form,')
    // มติ PO 06/10/2569 (U94 ข้อ 1) — คอลัมน์ผู้ถูกหักต่อท้าย · ค่าจาก snapshot ของใบ (U96 #4)
    expect(whtCsv).toContain('filing_form,payee_title,payee_address,payee_branch,wht_condition,wht_paid_by_payer_baht,status,ref_cert_no\r\n')
    expect(whtCsv).toContain('8500.00,255.00,3.00,PND3,นาย,12 ม.3 ต.ป่าแดด อ.เมืองเชียงใหม่ จ.เชียงใหม่ 50100,-,withhold,0.00,active,-\r\n')
  })

  it('Export ซ้ำรอบเดิม ⇒ v1.1 คนละแถว ไฟล์เดิมยังอยู่ครบ (`37` §16 — ไม่เขียนทับ)', async () => {
    const periodId = await junePeriodId()
    const before = storage.size
    const second = await exportsApi.createExportPack(ctx, { periodId })

    expect(second.version).toBe(2)
    expect(second.versionLabel).toBe('v1.1')
    // ไฟล์ชุดใหม่ถูกเขียนลง path ของ v2 ⇒ ของ v1 ยังอยู่ครบทุกไฟล์
    expect(storage.size).toBe(before * 2)
    expect([...storage.keys()].filter((path) => path.includes('/v1/'))).toHaveLength(before)

    const history = await exportsApi.listExportHistory(accountant, {})
    expect(history.items).toHaveLength(2)
    expect(history.items.map((item) => item.versionLabel)).toEqual(['v1.1', 'v1.0'])
  })

  it('ดาวน์โหลดซ้ำได้ไฟล์เดิมของเวอร์ชันนั้น ไม่ประกอบใหม่', async () => {
    const history = await exportsApi.listExportHistory(accountant, {})
    const first = history.items[1]
    expect(first).toBeDefined()

    const pack = await exportsApi.getExportPackDownload(accountant, first?.id ?? '')
    const { sha256Hex } = await import('@/lib/exports/pack-storage')
    expect(sha256Hex(pack.bytes)).toBe(first?.fileHash)
    expect(pack.fileName).toBe('AccountingPack_มิถุนายน_2569_v1.0.zip')
  })
})

suite('Phase 4.6 — ยามก่อน Export (`37` §10/§11 · `34` §11)', () => {
  it('critical ที่ยัง open ⇒ EXPORT_BLOCKED_CRITICAL · authorized แล้ว export ผ่าน', async () => {
    await resetOrgData()
    await seedCompletedBatch([{ payeeId: PAYEE_ID, gross: 500000, wht: 15000 }])
    const exceptionId = await seedException('critical', 'open')
    const periodId = await junePeriodId()

    await expectCode(() => exportsApi.createExportPack(ctx, { periodId }), 'EXPORT_BLOCKED_CRITICAL')

    await db().$executeRawUnsafe(`
      UPDATE exceptions SET status = 'authorized', authorized_by = '${USER_ID}', authorized_at = now(),
                            authorize_note = 'ผู้บริหารรับความเสี่ยง'
      WHERE id = '${exceptionId}'
    `)
    const record = await exportsApi.createExportPack(ctx, { periodId })
    expect(record.status).toBe('generated')
  })

  it('warning ที่ยัง open ไม่บล็อก แต่ขึ้นในไฟล์ 08 พร้อมสถานะเอกสาร', async () => {
    await resetOrgData()
    await seedCompletedBatch([{ payeeId: PAYEE_ID, gross: 500000, wht: 15000 }])
    await seedException('warning', 'open')
    const periodId = await junePeriodId()

    const record = await exportsApi.createExportPack(ctx, { periodId })
    expect(record.status).toBe('generated')

    const checklist = storage.get([...storage.keys()].find((path) => path.endsWith('.xlsx')) ?? '')
    expect(checklist).toBeDefined()
    expect((checklist ?? new Uint8Array()).length).toBeGreaterThan(1000)
  })

  it('payee ไม่มีเลขผู้เสียภาษี 13 หลัก ⇒ EXPORT_PAYEE_TAX_ID_MISSING (DEC-006/D10)', async () => {
    await resetOrgData()
    await seedCompletedBatch([{ payeeId: PAYEE_NO_TAX_ID, gross: 700000, wht: 21000 }])
    const periodId = await junePeriodId()

    await expectCode(() => exportsApi.createExportPack(ctx, { periodId }), 'EXPORT_PAYEE_TAX_ID_MISSING')
    // ไม่มีไฟล์ไหนถูกอัปโหลดเลยเมื่อยามไม่ผ่าน (ไม่มีชุดครึ่ง ๆ กลาง ๆ ค้างใน bucket)
    expect(storage.size).toBe(0)
  })

  it('ไฟล์กำพร้าจากครั้งที่ล้มกลางทาง ต้องไม่ล็อกรอบนั้นถาวร (`37` §6.2 · Rule 09)', async () => {
    await resetOrgData()
    await seedCompletedBatch([{ payeeId: PAYEE_ID, gross: 500000, wht: 15000 }])
    const periodId = await junePeriodId()

    // จำลองครั้งที่ "อัปโหลดสำเร็จแล้ว tx/audit ล้ม" (หรือสองคนกด Export พร้อมกันแล้วชน
    // `uniq_export_period_version`) — เหลือไฟล์ของ v1 ค้างในถังโดยไม่มีแถวใน `export_records`
    // ⇒ ครั้งถัดไปคิด `version` ได้ 1 เท่าเดิม · ถ้า path ไม่มีชั้น "ครั้งที่พยายาม" คั่นไว้
    // `upsert: false` จะปฏิเสธทุกครั้งไม่มีวันหาย (ทั้งระบบไม่มีโค้ดลบ object ใน storage)
    for (const fileName of ['01_Revenue.csv', '00_Cover_Sheet.pdf']) {
      storage.set(`${ORG_ID}/2569-06/v1/${fileName}`, new Uint8Array([1, 2, 3]))
    }

    const record = await exportsApi.createExportPack(ctx, { periodId })
    expect(record.status).toBe('generated')
    expect(record.version).toBe(1)

    // ไฟล์กำพร้ายังอยู่ครบ (ห้ามเขียนทับของเดิม) และชุดใหม่ไปอยู่คนละ path
    expect(storage.get(`${ORG_ID}/2569-06/v1/01_Revenue.csv`)).toEqual(new Uint8Array([1, 2, 3]))
  })
})

suite('Phase 4.6 — สถานะการส่งมอบ (`37` §9 · §16)', () => {
  it('mark-sent ⇒ sent + บันทึกเวลา · accept ต่อได้ · ข้ามขั้น/ย้อนกลับ ⇒ EXPORT_INVALID_STATUS', async () => {
    await resetOrgData()
    await seedCompletedBatch([{ payeeId: PAYEE_ID, gross: 500000, wht: 15000 }])
    const periodId = await junePeriodId()
    const record = await exportsApi.createExportPack(ctx, { periodId })

    await expectCode(() => exportsApi.acceptExport(ctx, record.id, {}), 'EXPORT_INVALID_STATUS')

    const sent = await exportsApi.markExportSent(ctx, record.id, { note: 'ส่งทางอีเมลถึงสำนักงานบัญชี' })
    expect(sent.status).toBe('sent')
    expect(sent.sentAt).not.toBeNull()
    expect(sent.sentByName).toBe('บัญชี 4.6')

    await expectCode(() => exportsApi.markExportSent(ctx, record.id, {}), 'EXPORT_INVALID_STATUS')

    const accepted = await exportsApi.acceptExport(ctx, record.id, {})
    expect(accepted.status).toBe('accepted')
    expect(accepted.acceptedAt).not.toBeNull()

    await expectCode(() => exportsApi.acceptExport(ctx, record.id, {}), 'EXPORT_INVALID_STATUS')
  })

  it('อ้าง export ขององค์กรอื่น/ไม่มีจริง ⇒ EXPORT_RECORD_NOT_FOUND (ไม่ leak)', async () => {
    await expectCode(
      () => exportsApi.markExportSent(ctx, '00000000-0000-4000-8000-00000000ffff', {}),
      'EXPORT_RECORD_NOT_FOUND',
    )
  })

  it('ทุกครั้งที่ export/เปลี่ยนสถานะมี audit พร้อมเวอร์ชันและรายชื่อไฟล์ (`37` §13)', async () => {
    const rows = await db().$queryRawUnsafe<{ action: string; after_data: unknown }[]>(`
      SELECT action, after_data FROM audit_logs
      WHERE organization_id = '${ORG_ID}' AND target_type = 'export_records'
      ORDER BY created_at DESC LIMIT 10
    `)
    expect(rows.length).toBeGreaterThan(0)
    const exported = rows.find((row) => row.action === 'export')
    expect(exported).toBeDefined()
    const after = exported?.after_data as { version?: string; file_names?: string[]; file_hash?: string } | undefined
    expect(after?.version).toBe('v1.0')
    // หน้าปก + 17 ไฟล์ข้อมูล + PDF 50 ทวิ 1 + ใบสำคัญจ่าย/สลิป 2
    expect(after?.file_names).toHaveLength(21)
    expect(after?.file_hash).toMatch(/^[0-9a-f]{64}$/)
  })
})

suite('Final Test ด่าน 6 — สองคนกดสร้างชุดส่งบัญชีของงวดเดียวกันพร้อมกัน (`37` §6.2)', () => {
  it('ชนกันที่ `uniq_export_period_version` ⇒ คนที่แพ้ได้ `EXPORT_VERSION_CONFLICT` ไม่ใช่ error ดิบ 500', async () => {
    await resetOrgData()
    await seedCompletedBatch([{ payeeId: PAYEE_ID, gross: 500000, wht: 15000 }])
    const periodId = await junePeriodId()

    // เลข version ถูกคิด**นอก** transaction (ต้องใช้ประกอบหน้าปก/ชื่อไฟล์ก่อนอัปโหลด)
    // ⇒ สองคำขอพร้อมกันได้เลขเดียวกันแล้วชน unique — ข้อมูลต้องไม่เสียและต้องตอบด้วย code จาก `24`
    const results = await Promise.allSettled([
      exportsApi.createExportPack(ctx, { periodId }),
      exportsApi.createExportPack(ctx, { periodId }),
    ])

    const winners = results.filter((result) => result.status === 'fulfilled')
    const losers = results.filter((result) => result.status === 'rejected')
    expect(winners).toHaveLength(1)
    expect(losers).toHaveLength(1)
    expect(codeOf((losers[0] as PromiseRejectedResult).reason)).toBe('EXPORT_VERSION_CONFLICT')

    // เหลือแถวเดียวจริง ๆ (ไม่มีเวอร์ชันซ้ำ) และกดใหม่ได้เวอร์ชันถัดไปตามปกติ
    const rows = await db().exportRecord.findMany({ where: { periodId }, select: { version: true } })
    expect(rows.map((row) => row.version)).toEqual([1])

    const retried = await exportsApi.createExportPack(ctx, { periodId })
    expect(retried.version).toBe(2)
    expect(retried.versionLabel).toBe('v1.1')
  })
})

suite('UAT R7cv3-B01 — อัปโหลดเข้าที่เก็บไฟล์ล้มกลางชุด', () => {
  it('key ทุกไฟล์เป็น ASCII · ไฟล์ .zip ใช้เลขรอบ ไม่ใช่ชื่อเดือนภาษาไทย', async () => {
    await resetOrgData()
    await seedCompletedBatch([{ payeeId: PAYEE_ID, gross: 500000, wht: 15000 }])
    const periodId = await junePeriodId()

    const record = await exportsApi.createExportPack(ctx, { periodId })
    const row = await db().exportRecord.findUniqueOrThrow({ where: { id: record.id }, select: { fileUrls: true } })
    const paths = Object.values(row.fileUrls as Record<string, string>)
    // 17 ไฟล์ข้อมูล + หน้าปก + zip (PDF อยู่ใน zip เท่านั้น)
    expect(paths).toHaveLength(19)
    for (const path of paths) expect(path, path).toMatch(/^[A-Za-z0-9!\-_.*'()/]+$/)
    expect(paths.some((path) => path.endsWith('/AccountingPack_2569-06_v1.0.zip'))).toBe(true)
    // ชื่อที่ผู้ใช้เห็น/ได้ตอนดาวน์โหลดยังเป็นภาษาไทย
    expect(record.zipFileName).toBe('AccountingPack_มิถุนายน_2569_v1.0.zip')
    const download = await exportsApi.getExportPackDownload(accountant, record.id)
    expect(download.fileName).toBe('AccountingPack_มิถุนายน_2569_v1.0.zip')
  })

  it('ไฟล์ใดไฟล์หนึ่งล้ม ⇒ EXPORT_STORAGE_FAILED · ลบไฟล์ที่ขึ้นไปแล้ว · ไม่มีแถว/audit · ครั้งถัดไปได้ v1.0', async () => {
    await resetOrgData()
    await seedCompletedBatch([{ payeeId: PAYEE_ID, gross: 500000, wht: 15000 }])
    const periodId = await junePeriodId()
    removed.length = 0
    rejectUpload = (path) => path.endsWith('.zip')

    try {
      await expectCode(() => exportsApi.createExportPack(ctx, { periodId }), 'EXPORT_STORAGE_FAILED')
    } finally {
      rejectUpload = null
    }

    expect(storage.size).toBe(0)
    expect(removed).toHaveLength(18)
    expect(await db().exportRecord.count({ where: { periodId } })).toBe(0)

    const retried = await exportsApi.createExportPack(ctx, { periodId })
    expect(retried.versionLabel).toBe('v1.0')
  })
})

// ── มติ PO 05/10/2569 U57/U68 — 12_Tax_Invoices.csv (+ PDF) · 13_Advance_Returns.csv ─────────

/** อ่านเนื้อไฟล์หนึ่งใน .zip (STORE — ไม่บีบอัด) ผ่าน central directory */
function zipEntryBytes(bytes: Uint8Array, name: string): Uint8Array | null {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  const eocd = bytes.length - 22
  const count = view.getUint16(eocd + 10, true)
  let cursor = view.getUint32(eocd + 16, true)
  for (let index = 0; index < count; index += 1) {
    const size = view.getUint32(cursor + 20, true)
    const nameLength = view.getUint16(cursor + 28, true)
    const extraLength = view.getUint16(cursor + 30, true)
    const commentLength = view.getUint16(cursor + 32, true)
    const offset = view.getUint32(cursor + 42, true)
    const entryName = decoder.decode(bytes.subarray(cursor + 46, cursor + 46 + nameLength))
    if (entryName === name) {
      const localName = view.getUint16(offset + 26, true)
      const localExtra = view.getUint16(offset + 28, true)
      const start = offset + 30 + localName + localExtra
      return bytes.subarray(start, start + size)
    }
    cursor += 46 + nameLength + extraLength + commentLength
  }
  return null
}

let salesCursor = 0

/** รอบวางบิล + รายการขาย (snapshot ยอด) + รายได้ (snapshot อัตรา VAT) — คืน id รายการขาย */
async function seedSales(input: { before: number; vat: number; vatPct: string }): Promise<string> {
  salesCursor += 1
  const periodId = await junePeriodId()
  const billing = await db().$queryRawUnsafe<{ id: string }[]>(`
    INSERT INTO billing_batches (organization_id, company_id, period, due_date, created_by)
    VALUES ('${ORG_ID}', '${COMPANY_ID}', '2569-06-${salesCursor}', '2026-07-31', '${USER_ID}')
    RETURNING id
  `)
  const billingId = billing[0]?.id ?? ''
  await db().$executeRawUnsafe(`
    INSERT INTO revenues (organization_id, case_id, company_id, billing_batch_id, tracking_round, gross_satang,
                          vat_satang, vat_rate_pct_used, total_satang, fee_model_snapshot, vat_mode_snapshot,
                          revenue_date, created_by)
    VALUES ('${ORG_ID}', '${CASE_ID}', '${COMPANY_ID}', '${billingId}', ${100 + salesCursor}, ${input.before},
            ${input.vat}, ${input.vatPct}, ${input.before + input.vat}, 'FLAT', 'exclude_vat', '2026-05-20', '${USER_ID}')
  `)
  const sales = await db().$queryRawUnsafe<{ id: string }[]>(`
    INSERT INTO sales_records (organization_id, period_id, billing_batch_id, company_id, total_before_vat_satang,
                               vat_satang, total_satang, created_by)
    VALUES ('${ORG_ID}', '${periodId}', '${billingId}', '${COMPANY_ID}', ${input.before}, ${input.vat},
            ${input.before + input.vat}, '${USER_ID}')
    RETURNING id
  `)
  return sales[0]?.id ?? ''
}

async function seedInvoice(input: {
  salesId: string
  number: string
  date: string
  createdAt: string
  cancelledAt?: string
  reason?: string
}): Promise<void> {
  const cancelled = input.cancelledAt !== undefined
  await db().$executeRawUnsafe(`
    INSERT INTO tax_invoices (organization_id, sales_record_id, invoice_number, invoice_date, buyer_branch_code, seller_branch_code, status,
                              cancel_reason, cancelled_by, cancelled_at, created_at, created_by, ${TAX_INVOICE_FIXTURE_COLUMNS})
    VALUES ('${ORG_ID}', '${input.salesId}', '${input.number}', '${input.date}', '00000', '00000',
            '${cancelled ? 'cancelled' : 'active'}', ${cancelled ? `'${input.reason ?? ''}'` : 'NULL'},
            ${cancelled ? `'${USER_ID}'` : 'NULL'}, ${cancelled ? `'${input.cancelledAt}'` : 'NULL'},
            '${input.createdAt}', '${USER_ID}', ${taxInvoiceFixtureValues(input.salesId)})
  `)
}

async function seedTaxInvoices(): Promise<void> {
  // ① ใบปกติลงวันที่ในงวด
  const s1 = await seedSales({ before: 373_000, vat: 26_110, vatPct: '7.00' })
  await seedInvoice({ salesId: s1, number: 'INV-T46-0002', date: '2026-06-30', createdAt: '2026-06-30T03:00:00Z' })
  // ② ใบในงวดที่ยกเลิกในงวด + ใบแทนลงวันที่เดือนถัดไป (ใบแทนไม่อยู่ในไฟล์ของงวดนี้)
  const s2 = await seedSales({ before: 800_000, vat: 56_000, vatPct: '7.00' })
  await seedInvoice({
    salesId: s2,
    number: 'INV-T46-0001',
    date: '2026-06-28',
    createdAt: '2026-06-28T03:00:00Z',
    cancelledAt: '2026-06-29T03:00:00Z',
    reason: 'ที่อยู่ผู้ซื้อไม่ถูกต้อง',
  })
  await seedInvoice({ salesId: s2, number: 'INV-T46-0003', date: '2026-07-01', createdAt: '2026-07-01T03:00:00Z' })
  // ③ ใบของงวดก่อนที่ถูกยกเลิกในงวดนี้ (02/06/2569 เวลาไทย) ⇒ อยู่ในไฟล์ · ④ ใบงวดก่อนที่ยังปกติ ⇒ ไม่อยู่
  const s3 = await seedSales({ before: 100_000, vat: 7_000, vatPct: '7.00' })
  await seedInvoice({
    salesId: s3,
    number: 'INV-T46-0000',
    date: '2026-05-31',
    createdAt: '2026-05-31T03:00:00Z',
    cancelledAt: '2026-06-01T18:00:00Z',
    reason: 'ออกซ้ำ',
  })
  const s4 = await seedSales({ before: 50_000, vat: 3_500, vatPct: '7.00' })
  await seedInvoice({ salesId: s4, number: 'INV-T46-0099', date: '2026-05-15', createdAt: '2026-05-15T03:00:00Z' })
}

let advanceCursor = 0

async function seedClearedAdvance(returnSatang: number): Promise<string> {
  advanceCursor += 1
  const rows = await db().$queryRawUnsafe<{ id: string }[]>(`
    INSERT INTO advances (organization_id, payee_id, requested_satang, approved_satang, used_satang,
                          status, purpose, due_clear_date, cleared_at, return_method, created_by)
    VALUES ('${ORG_ID}', '${PAYEE_ID}', ${returnSatang + 100_000}, ${returnSatang + 100_000}, 100000,
            'cleared', 'ทดสอบ U68 #${advanceCursor}', '2026-06-30', '2026-06-05T03:00:00Z', 'payout_offset', '${USER_ID}')
    RETURNING id
  `)
  return rows[0]?.id ?? ''
}

async function firstItemOf(batchId: string): Promise<string> {
  const rows = await db().$queryRawUnsafe<{ id: string }[]>(
    `SELECT id FROM payout_batch_items WHERE payout_batch_id = '${batchId}' ORDER BY created_at LIMIT 1`,
  )
  return rows[0]?.id ?? ''
}

suite('มติ PO U57 — 12_Tax_Invoices.csv + PDF ใบกำกับในโฟลเดอร์ tax_invoices/', () => {
  it('ใบที่ออกในงวด + ใบที่ยกเลิกในงวด · ยอด snapshot · สถานะยกเลิก/ใบแทน · PDF อยู่ใน zip', async () => {
    await resetOrgData()
    await seedCompletedBatch([{ payeeId: PAYEE_ID, gross: 500000, wht: 15000 }])
    await seedTaxInvoices()
    const periodId = await junePeriodId()

    const record = await exportsApi.createExportPack(ctx, { periodId })
    expect(record.fileCount).toBe(17)

    const csv = fileAt([...storage.keys()].find((path) => path.endsWith('12_Tax_Invoices.csv')) ?? '')
    const lines = csv.slice(CSV_BOM.length).split('\r\n')
    // มติ U79 — เลขรอบวางบิล (DB trigger เดินเลข) + มติ U95 ชนิดเอกสาร/วันรับเงิน (ใบแบบเดิม ⇒ ไม่มีวันรับเงิน) ต่อท้ายทุกแถว
    const BATCH_NUMBER_TAIL = /,BL-25\d{2}-\d{3,},ใบกำกับภาษี,-$/
    expect(lines.slice(1, -1).every((line) => BATCH_NUMBER_TAIL.test(line))).toBe(true)
    expect(lines.slice(1, -1).map((line) => line.replace(BATCH_NUMBER_TAIL, ''))).toEqual([
      'INV-T46-0000,31/05/2569,บริษัท สยามไฟแนนซ์ จำกัด,0105560046000,1000.00,70.00,1070.00,7.00,2569-06-3,cancelled,02/06/2569,ออกซ้ำ,-,tax_invoices/INV-T46-0000-CANCELLED.pdf,สำนักงานใหญ่',
      'INV-T46-0001,28/06/2569,บริษัท สยามไฟแนนซ์ จำกัด,0105560046000,8000.00,560.00,8560.00,7.00,2569-06-2,cancelled,29/06/2569,ที่อยู่ผู้ซื้อไม่ถูกต้อง,INV-T46-0003,tax_invoices/INV-T46-0001-CANCELLED.pdf,สำนักงานใหญ่',
      'INV-T46-0002,30/06/2569,บริษัท สยามไฟแนนซ์ จำกัด,0105560046000,3730.00,261.10,3991.10,7.00,2569-06-1,active,-,-,-,tax_invoices/INV-T46-0002.pdf,สำนักงานใหญ่',
    ])

    const zipPath = [...storage.keys()].find((path) => path.endsWith('.zip')) ?? ''
    const zipBytes = storage.get(zipPath) ?? new Uint8Array()
    const names = zipEntryNames(zipBytes)
    expect(names.filter((name) => name.startsWith('tax_invoices/'))).toEqual([
      'tax_invoices/INV-T46-0000-CANCELLED.pdf',
      'tax_invoices/INV-T46-0001-CANCELLED.pdf',
      'tax_invoices/INV-T46-0002.pdf',
    ])
    const pdf = zipEntryBytes(zipBytes, 'tax_invoices/INV-T46-0002.pdf')
    expect(decoder.decode((pdf ?? new Uint8Array()).subarray(0, 5))).toBe('%PDF-')
    // PDF อยู่ใน zip เท่านั้น — ไม่อัปโหลดแยก (17 ไฟล์ข้อมูล + หน้าปก + zip)
    expect([...storage.keys()].filter((path) => path.includes(`/v${record.version}/`))).toHaveLength(19)

    // audit บอกจำนวน PDF ที่แนบ
    const audit = await db().$queryRawUnsafe<
      { after_data: { attachments?: { tax_invoices?: { attached: number } } } }[]
    >(`
      SELECT after_data FROM audit_logs WHERE target_type = 'export_records' AND target_id = '${record.id}'
    `)
    expect(audit[0]?.after_data.attachments?.tax_invoices?.attached).toBe(3)
  })

  it('Export ซ้ำ ⇒ v1.1 ไฟล์ใบกำกับของ v1.0 ยังอยู่ ไม่ถูกทับ', async () => {
    const periodId = await junePeriodId()
    const firstCsvPath = [...storage.keys()].find((path) => path.includes('/v1/') && path.endsWith('12_Tax_Invoices.csv'))
    const before = storage.get(firstCsvPath ?? '')
    const second = await exportsApi.createExportPack(ctx, { periodId })
    expect(second.versionLabel).toBe('v1.1')
    expect(storage.get(firstCsvPath ?? '')).toBe(before)
    // BUG-160 — รายชื่อรอบบอกเวอร์ชันล่าสุดจริง (modal Export ใช้แสดง "ล่าสุด → ชุดถัดไป")
    const { listPeriods } = await import('@/lib/accounting/queries')
    const periods = await listPeriods(ctx, { limit: 36 })
    expect(periods.find((row) => row.id === periodId)?.latestExportVersion).toBe(2)
    const secondCsvPath = [...storage.keys()].find((path) => path.includes('/v2/') && path.endsWith('12_Tax_Invoices.csv'))
    expect(secondCsvPath).toBeDefined()
    expect(secondCsvPath).not.toBe(firstCsvPath)
  })

  it('เกินเพดาน ⇒ แนบเท่าที่ได้ · ใบที่เหลือ pdf_file = - และอยู่ใน NOT_ATTACHED.txt (CSV ยังครบ)', async () => {
    const result = await exportsApi.buildTaxInvoicePackFiles(ORG_ID, 2569, 6, { limit: 1 })
    expect(result.attached).toBe(1)
    expect(result.notAttached).toEqual(['INV-T46-0001', 'INV-T46-0002'])
    expect(result.entries.map((entry) => entry.name)).toEqual([
      'tax_invoices/INV-T46-0000-CANCELLED.pdf',
      'tax_invoices/NOT_ATTACHED.txt',
    ])
    const lines = result.csv.slice(CSV_BOM.length).split('\r\n')
    expect(lines).toHaveLength(5)
    expect(lines[2]).toMatch(/,INV-T46-0003,-,สำนักงานใหญ่,BL-25\d{2}-\d{3,},ใบกำกับภาษี,-$/)

    // เพดานเวลา — นาฬิกาเดินเกินงบตั้งแต่ใบแรก ⇒ ไม่แนบเลยแต่ CSV ครบ
    let tick = 0
    const timed = await exportsApi.buildTaxInvoicePackFiles(ORG_ID, 2569, 6, {
      timeBudgetMs: 10,
      now: () => (tick += 100),
    })
    expect(timed.attached).toBe(0)
    expect(timed.notAttached).toHaveLength(3)
  })
})

suite('มติ PO U68 — 13_Advance_Returns.csv', () => {
  it('หักกลบในรอบจ่าย / รับเงินสด / โอนแล้วกลับรายการ ในงวด · ไม่รวมรับนอกงวดและหักกลบที่ยังไม่จ่าย', async () => {
    await resetOrgData()
    const paidBatch = await seedCompletedBatch([{ payeeId: PAYEE_ID, gross: 500000, wht: 15000 }])
    const paidItem = await firstItemOf(paidBatch)
    const periodId = await junePeriodId()

    // รอบจ่ายที่ยังไม่จ่าย (ไม่มี expense_records) — หักกลบแล้วกลับรายการ ⇒ ไม่เคยมีผล ไม่อยู่ในไฟล์
    const draft = await db().$queryRawUnsafe<{ id: string }[]>(`
      INSERT INTO payout_batches (organization_id, name, side, status, gross_satang, wht_satang, net_satang, created_by)
      VALUES ('${ORG_ID}', 'PB-U68-DRAFT', 'outsource', 'draft', 0, 0, 0, '${USER_ID}') RETURNING id
    `)
    const draftId = draft[0]?.id ?? ''
    const draftExpense = await db().$queryRawUnsafe<{ id: string }[]>(`
      INSERT INTO expenses (organization_id, case_id, payee_id, expense_type, gross_satang, expense_date, status,
                            receipt_file_url, created_by)
      VALUES ('${ORG_ID}', '${CASE_ID}', '${PAYEE_ID}', 'commission', 10000, '2026-06-20', 'approved',
              'field/receipts/ok.jpg', '${USER_ID}') RETURNING id
    `)
    const draftItem = await db().$queryRawUnsafe<{ id: string }[]>(`
      INSERT INTO payout_batch_items (organization_id, payout_batch_id, expense_id, payee_id,
                                      gross_satang, wht_satang, net_satang, created_by)
      VALUES ('${ORG_ID}', '${draftId}', '${draftExpense[0]?.id}', '${PAYEE_ID}', 10000, 0, 10000, '${USER_ID}')
      RETURNING id
    `)

    const adv1 = await seedClearedAdvance(55_000)
    const adv2 = await seedClearedAdvance(200_000)
    const adv3 = await seedClearedAdvance(30_000)
    const adv4 = await seedClearedAdvance(5_000)
    await db().$executeRawUnsafe(`
      INSERT INTO advance_returns (organization_id, advance_id, payee_id, channel, amount_satang, payout_batch_id,
                                   payout_batch_item_id, created_by)
      VALUES ('${ORG_ID}', '${adv1}', '${PAYEE_ID}', 'payout_offset', 55000, '${paidBatch}', '${paidItem}', '${USER_ID}')
    `)
    await db().$executeRawUnsafe(`
      INSERT INTO advance_returns (organization_id, advance_id, payee_id, channel, amount_satang, received_date,
                                   evidence_file_path, created_by)
      VALUES ('${ORG_ID}', '${adv2}', '${PAYEE_ID}', 'cash', 120000, '2026-06-15',
              'advances/${adv2}/returns/receipt-cash.jpg', '${USER_ID}'),
             ('${ORG_ID}', '${adv2}', '${PAYEE_ID}', 'cash', 80000, '2026-07-02',
              'advances/${adv2}/returns/july.jpg', '${USER_ID}')
    `)
    await db().$executeRawUnsafe(`
      INSERT INTO advance_returns (organization_id, advance_id, payee_id, channel, amount_satang, received_date,
                                   evidence_file_path, reversed_at, reversed_by, reversal_reason, created_by)
      VALUES ('${ORG_ID}', '${adv3}', '${PAYEE_ID}', 'bank_transfer', 30000, '2026-06-20',
              'advances/${adv3}/returns/slip.pdf', '2026-06-22T04:00:00Z', '${USER_ID}', 'บันทึกซ้ำ', '${USER_ID}')
    `)
    await db().$executeRawUnsafe(`
      INSERT INTO advance_returns (organization_id, advance_id, payee_id, channel, amount_satang, payout_batch_id,
                                   payout_batch_item_id, reversed_at, reversed_by, reversal_reason, created_by)
      VALUES ('${ORG_ID}', '${adv4}', '${PAYEE_ID}', 'payout_offset', 5000, '${draftId}', '${draftItem[0]?.id}',
              '2026-06-23T04:00:00Z', '${USER_ID}', 'ยกเลิกรอบจ่าย', '${USER_ID}')
    `)

    const advanceRef = await advanceNumbers()
    await exportsApi.createExportPack(ctx, { periodId })
    const csv = fileAt([...storage.keys()].find((path) => path.endsWith('13_Advance_Returns.csv')) ?? '')
    const lines = csv.slice(CSV_BOM.length).split('\r\n')
    // มติ PO O67 · U100 — เลขที่ใบรับคืน (RAV) ต่อท้ายสุด
    expect(lines.slice(1, -1).map((line) => line.replace(/,RAV-\d{4}-\d{4}$/, ''))).toEqual([
      `15/06/2569,${advanceRef(adv2)},ประยุทธ์ บุญมี,1200.00,cash,-,receipt-cash.jpg,active,-,-`,
      `20/06/2569,${advanceRef(adv3)},ประยุทธ์ บุญมี,300.00,bank_transfer,-,slip.pdf,reversed,22/06/2569,บันทึกซ้ำ`,
      `25/06/2569,${advanceRef(adv1)},ประยุทธ์ บุญมี,550.00,payout_offset,PB-4.6-${batchCursor}-KEY,-,active,-,-`,
    ])
    for (const line of lines.slice(1, -1)) expect(line).toMatch(/,RAV-\d{4}-\d{4}$/)
  })
})

suite('มติ PO U87 — 14_Unbilled_Revenue.csv (รายได้ค้างรับ)', () => {
  async function seedRevenueRow(input: {
    round: number
    revenueDate: string
    billing: 'none' | 'draft' | 'sent' | 'deleted_batch'
    deleted?: boolean
  }): Promise<string | null> {
    let billingId: string | null = null
    let batchNumber: string | null = null
    if (input.billing !== 'none') {
      const rows = await db().$queryRawUnsafe<{ id: string; batch_number: string }[]>(`
        INSERT INTO billing_batches (organization_id, company_id, period, status, due_date, created_by, deleted_at)
        VALUES ('${ORG_ID}', '${COMPANY_ID}', 'U87-${input.round}', '${input.billing === 'sent' ? 'sent' : 'draft'}',
                '2026-07-31', '${USER_ID}', ${input.billing === 'deleted_batch' ? 'now()' : 'NULL'})
        RETURNING id, batch_number
      `)
      billingId = rows[0]?.id ?? null
      batchNumber = rows[0]?.batch_number ?? null
    }
    await db().$executeRawUnsafe(`
      INSERT INTO revenues (organization_id, case_id, company_id, billing_batch_id, tracking_round, gross_satang,
                            vat_satang, vat_rate_pct_used, total_satang, fee_model_snapshot, vat_mode_snapshot,
                            revenue_date, created_by, deleted_at)
      VALUES ('${ORG_ID}', '${CASE_ID}', '${COMPANY_ID}', ${billingId === null ? 'NULL' : `'${billingId}'`},
              ${input.round}, ${input.round * 10000}, ${input.round * 700}, 7.00, ${input.round * 10700}, 'HYBRID',
              'exclude_vat', '${input.revenueDate}', '${USER_ID}', ${input.deleted === true ? 'now()' : 'NULL'})
    `)
    return batchNumber
  }

  it('รวมรายได้ในงวด/ยกมาที่ยังไม่อยู่ในรอบที่ส่งแล้ว · ไม่รวมรอบที่ส่งแล้ว งวดถัดไป และรายได้ที่ถูกลบ', async () => {
    await resetOrgData()
    await seedRevenueRow({ round: 1, revenueDate: '2026-06-25', billing: 'none' })
    const draftNumber = await seedRevenueRow({ round: 2, revenueDate: '2026-05-10', billing: 'draft' })
    await seedRevenueRow({ round: 3, revenueDate: '2026-06-10', billing: 'sent' })
    await seedRevenueRow({ round: 4, revenueDate: '2026-07-01', billing: 'none' })
    await seedRevenueRow({ round: 5, revenueDate: '2026-06-12', billing: 'none', deleted: true })
    await seedRevenueRow({ round: 6, revenueDate: '2026-06-15', billing: 'deleted_batch' })

    const csv = await exportsApi.buildUnbilledRevenuePackFile(ORG_ID, 2569, 6)
    const lines = csv.slice(CSV_BOM.length).split('\r\n')
    expect(lines.slice(1, -1)).toEqual([
      `SF-2026-04600,บริษัท สยามไฟแนนซ์ จำกัด,0105560046000,10/05/2569,HYBRID,200.00,14.00,214.00,7.00,${draftNumber ?? ''}`,
      'SF-2026-04600,บริษัท สยามไฟแนนซ์ จำกัด,0105560046000,15/06/2569,HYBRID,600.00,42.00,642.00,7.00,-',
      'SF-2026-04600,บริษัท สยามไฟแนนซ์ จำกัด,0105560046000,25/06/2569,HYBRID,100.00,7.00,107.00,7.00,-',
    ])
  })
})

// ── มติ PO 06/10/2569 U94 ข้อ 2–5 — 15/16/00 + PDF 50 ทวิ/ใบสำคัญจ่ายใน zip ──────────────────

const U94_USER = '00000000-0000-4000-8000-0000000094a1'
const U94_PAYEE = '00000000-0000-4000-8000-0000000094a2'
const U94_TAX_PROFILE = '00000000-0000-4000-8000-0000000094a3'

async function seedU94Payee(): Promise<void> {
  await db().$executeRawUnsafe(`
    INSERT INTO users (id, organization_id, role_id, email, full_name, status)
    VALUES ('${U94_USER}', '${ORG_ID}', '${ROLE_ID}', 'u94@test.local', 'อนุชา ค้างจ่าย', 'active')
    ON CONFLICT (id) DO NOTHING
  `)
  await db().$executeRawUnsafe(`
    INSERT INTO tax_profiles (id, organization_id, name, wht_pct, income_type, filing_form, created_by)
    VALUES ('${U94_TAX_PROFILE}', '${ORG_ID}', 'บุคคล 3% U94', 3.00, 'ค่าจ้างทำของ มาตรา 40(8)', 'PND3', '${USER_ID}')
    ON CONFLICT (id) DO NOTHING
  `)
  await db().$executeRawUnsafe(`
    INSERT INTO payee_profiles (id, organization_id, user_id, payee_type, national_id, is_verified, tax_profile_id, created_by)
    VALUES ('${U94_PAYEE}', '${ORG_ID}', '${U94_USER}', 'individual', '3100000009400', true, '${U94_TAX_PROFILE}', '${USER_ID}')
    ON CONFLICT (id) DO NOTHING
  `)
}

async function seedExpense(input: { gross: number; date: string; status: string; type?: string }): Promise<string> {
  const rows = await db().$queryRawUnsafe<{ id: string }[]>(`
    INSERT INTO expenses (organization_id, case_id, payee_id, expense_type, gross_satang, expense_date, status, created_by)
    VALUES ('${ORG_ID}', '${CASE_ID}', '${U94_PAYEE}', '${input.type ?? 'commission'}', ${input.gross}, '${input.date}',
            '${input.status}', '${USER_ID}')
    RETURNING id
  `)
  return rows[0]?.id ?? ''
}

async function seedBatch(input: { name: string; status: string; paidAt?: string }): Promise<string> {
  const rows = await db().$queryRawUnsafe<{ id: string }[]>(`
    INSERT INTO payout_batches (organization_id, name, side, status, gross_satang, wht_satang, net_satang,
                                payment_file_generated_at, idempotency_key, cancelled_at, cancelled_by, cancel_reason,
                                created_by)
    VALUES ('${ORG_ID}', '${input.name}', 'outsource', '${input.status}', 0, 0, 0,
            ${input.paidAt === undefined ? 'NULL' : `'${input.paidAt}'`}, '${input.name}-KEY',
            ${input.status === 'cancelled' ? `now(), '${USER_ID}', 'ยกเลิกทดสอบ U94'` : 'NULL, NULL, NULL'}, '${USER_ID}')
    RETURNING id
  `)
  return rows[0]?.id ?? ''
}

async function seedItem(input: { batchId: string; expenseId?: string; advanceId?: string; gross: number; wht?: number }): Promise<string> {
  const rows = await db().$queryRawUnsafe<{ id: string }[]>(`
    INSERT INTO payout_batch_items (organization_id, payout_batch_id, expense_id, advance_id, payee_id,
                                    gross_satang, wht_satang, net_satang, created_by)
    VALUES ('${ORG_ID}', '${input.batchId}', ${input.expenseId === undefined ? 'NULL' : `'${input.expenseId}'`},
            ${input.advanceId === undefined ? 'NULL' : `'${input.advanceId}'`}, '${U94_PAYEE}',
            ${input.gross}, ${input.wht ?? 0}, ${input.gross - (input.wht ?? 0)}, '${USER_ID}')
    RETURNING id
  `)
  return rows[0]?.id ?? ''
}

async function seedAdvance(input: { approved: number; used: number; status: string; clearedAt?: string }): Promise<string> {
  const rows = await db().$queryRawUnsafe<{ id: string }[]>(`
    INSERT INTO advances (organization_id, payee_id, requested_satang, approved_satang, used_satang, status, purpose,
                          due_clear_date, approved_at, cleared_at, return_method, created_by)
    VALUES ('${ORG_ID}', '${U94_PAYEE}', ${input.approved}, ${input.approved}, ${input.used}, '${input.status}', 'ทดสอบ U94',
            '2026-07-31', '2026-05-01T03:00:00Z', ${input.clearedAt === undefined ? 'NULL' : `'${input.clearedAt}'`},
            ${input.status === 'cleared' && input.approved > input.used ? `'payout_offset'` : 'NULL'}, '${USER_ID}')
    RETURNING id
  `)
  return rows[0]?.id ?? ''
}

/** เลขที่ใบเบิกเงินทดรองที่ trigger ออกให้ (มติ PO U102) — id → `advance_number` */
async function advanceNumbers(): Promise<(advanceId: string) => string> {
  const rows = await db().$queryRawUnsafe<{ id: string; advance_number: string }[]>(
    `SELECT id, advance_number FROM advances WHERE organization_id = '${ORG_ID}'`,
  )
  const byId = new Map(rows.map((row) => [row.id, row.advance_number]))
  return (advanceId: string) => byId.get(advanceId) ?? '?'
}

function csvRows(csv: string): string[] {
  return csv
    .slice(CSV_BOM.length)
    .split('\r\n')
    .filter((line) => line !== '')
}

suite('มติ PO U94 ข้อ 2 — 15_Accrued_Expenses.csv', () => {
  it('ค้างจ่าย = ทำ/อนุมัติแล้ว วันที่ ≤ สิ้นงวด ยังไม่อยู่ในรอบที่โอนแล้ว · WHT ประมาณด้วยสูตรรอบจ่าย · รอบที่ยังไม่โอนมีเลขรอบ', async () => {
    await resetOrgData()
    await seedU94Payee()
    await seedCompletedBatch([{ payeeId: PAYEE_ID, gross: 500000, wht: 15000 }]) // จ่ายแล้ว ⇒ ไม่อยู่ในไฟล์

    const approved = await seedExpense({ gross: 60_000, date: '2026-06-28', status: 'approved' })
    const pending = await seedExpense({ gross: 50_000, date: '2026-06-30', status: 'pending_approval' })
    const inDraft = await seedExpense({ gross: 200_000, date: '2026-06-15', status: 'approved' })
    const draftBatch = await seedBatch({ name: 'PB-U94-DRAFT', status: 'file_generated' })
    await seedItem({ batchId: draftBatch, expenseId: inDraft, gross: 200_000, wht: 6_000 })
    // รอบที่ยกเลิก ⇒ รายการกลับไปรอจ่าย (ยังค้าง ไม่มีเลขรอบ)
    const cancelledExpense = await seedExpense({ gross: 10_000, date: '2026-06-10', status: 'approved', type: 'hotel' })
    const cancelledBatch = await seedBatch({ name: 'PB-U94-CANCEL', status: 'cancelled' })
    await seedItem({ batchId: cancelledBatch, expenseId: cancelledExpense, gross: 10_000 })
    // ไม่นับ: จ่ายแล้ว (รอบ completed หลังสิ้นงวด — ภาพ ณ เวลาสร้าง) · ปฏิเสธ · งวดถัดไป
    const paidLater = await seedExpense({ gross: 70_000, date: '2026-06-29', status: 'approved' })
    const laterBatch = await seedBatch({ name: 'PB-U94-JULY', status: 'completed', paidAt: '2026-07-05T03:00:00Z' })
    await seedItem({ batchId: laterBatch, expenseId: paidLater, gross: 70_000, wht: 2_100 })
    await seedExpense({ gross: 99_000, date: '2026-06-20', status: 'rejected' })
    await seedExpense({ gross: 88_000, date: '2026-07-01', status: 'approved' })

    const csv = await exportsApi.buildAccruedExpensePackFile(ORG_ID, 2569, 6)
    const rows = csvRows(csv)
    expect(rows[0]).toBe(
      'expense_id,payee,payee_tax_id,category,case_ref,work_date,status,gross_baht,estimated_wht_baht,payout_batch_ref',
    )
    expect(rows.slice(1).map((row) => row.split(',')[0])).toEqual([cancelledExpense, inDraft, approved, pending])
    const byId = new Map(rows.slice(1).map((row) => [row.split(',')[0], row.split(',')] as const))
    // ฐานรวมของผู้รับ (60,000 + 50,000 สตางค์ = ฿1,100 ≥ ฿1,000) ⇒ หัก 3% = ฿33 กระจายตามสัดส่วน · ค่าที่พักไม่อยู่ในฐาน
    expect(byId.get(approved)?.slice(1)).toEqual([
      'อนุชา ค้างจ่าย',
      '3100000009400',
      'คอมมิชชั่น',
      'SF-2026-04600',
      '28/06/2569',
      'approved',
      '600.00',
      '18.00',
      '-',
    ])
    expect(byId.get(pending)?.slice(6)).toEqual(['pending_approval', '500.00', '15.00', '-'])
    expect(byId.get(inDraft)?.slice(6)).toEqual(['approved', '2000.00', '60.00', 'PB-U94-DRAFT-KEY'])
    expect(byId.get(cancelledExpense)?.slice(7)).toEqual(['100.00', '0.00', '-'])
  })
})

suite('มติ PO U94 ข้อ 3 — 16_Advance_Balance.csv', () => {
  it('ยอดยกมา + จ่าย − ใช้/เคลียร์ − คืน (หักกลบ/รับแยก) = คงเหลือ · ใบในงวดถัดไปไม่นับ', async () => {
    await resetOrgData()
    await seedU94Payee()
    // ใบ 1: จ่ายเดือนพฤษภาคม ยังไม่เคลียร์ ⇒ ยกมา 3,000 คงเหลือ 3,000
    const adv1 = await seedAdvance({ approved: 300_000, used: 0, status: 'approved' })
    const may = await seedBatch({ name: 'PB-U94-MAY', status: 'completed', paidAt: '2026-05-20T03:00:00Z' })
    await seedItem({ batchId: may, advanceId: adv1, gross: 300_000 })
    // ใบ 2: จ่าย 10/06 เคลียร์ 15/06 (ใช้ 1,500 คืน 500) · รับเงินสด 200 (20/06) + หักกลบ 300 ในรอบที่โอน 25/06 ⇒ คงเหลือ 0
    const adv2 = await seedAdvance({ approved: 200_000, used: 150_000, status: 'cleared', clearedAt: '2026-06-15T03:00:00Z' })
    const june = await seedBatch({ name: 'PB-U94-JUN', status: 'completed', paidAt: '2026-06-10T03:00:00Z' })
    await seedItem({ batchId: june, advanceId: adv2, gross: 200_000 })
    const offsetBatch = await seedBatch({ name: 'PB-U94-OFF', status: 'completed', paidAt: '2026-06-25T03:00:00Z' })
    const offsetExpense = await seedExpense({ gross: 100_000, date: '2026-06-20', status: 'approved' })
    const offsetItem = await seedItem({ batchId: offsetBatch, expenseId: offsetExpense, gross: 100_000 })
    await db().$executeRawUnsafe(`
      INSERT INTO advance_returns (organization_id, advance_id, payee_id, channel, amount_satang, received_date,
                                   evidence_file_path, created_by)
      VALUES ('${ORG_ID}', '${adv2}', '${U94_PAYEE}', 'cash', 20000, '2026-06-20', 'advances/x/cash.jpg', '${USER_ID}')
    `)
    await db().$executeRawUnsafe(`
      INSERT INTO advance_returns (organization_id, advance_id, payee_id, channel, amount_satang, payout_batch_id,
                                   payout_batch_item_id, created_by)
      VALUES ('${ORG_ID}', '${adv2}', '${U94_PAYEE}', 'payout_offset', 30000, '${offsetBatch}', '${offsetItem}', '${USER_ID}')
    `)
    // ใบ 3: จ่ายและเคลียร์ (ใช้ครบ) เดือนกรกฎาคม ⇒ ไม่มีผลกับงวดมิถุนายน
    // (เงินทดรองที่ยังเปิดอยู่ได้คนละ 1 ใบ — ใบนี้จึงเป็น `cleared`)
    const adv3 = await seedAdvance({ approved: 50_000, used: 50_000, status: 'cleared', clearedAt: '2026-07-10T03:00:00Z' })
    const july = await seedBatch({ name: 'PB-U94-JUL', status: 'completed', paidAt: '2026-07-02T03:00:00Z' })
    await seedItem({ batchId: july, advanceId: adv3, gross: 50_000 })

    const advanceRef = await advanceNumbers()
    const june2569 = csvRows(await exportsApi.buildAdvanceBalancePackFile(ORG_ID, 2569, 6))
    expect(june2569).toEqual([
      'payee,payee_tax_id,opening_baht,paid_baht,cleared_baht,returned_offset_baht,returned_direct_baht,closing_baht,advance_refs',
      `อนุชา ค้างจ่าย,3100000009400,3000.00,2000.00,1500.00,300.00,200.00,3000.00,${[advanceRef(adv1), advanceRef(adv2)].sort().join(' ')}`,
    ])
    // งวดถัดไป: ยกมา = คงเหลือของงวดก่อน (ต่อเนื่อง) + จ่ายใบ 3
    const july2569 = csvRows(await exportsApi.buildAdvanceBalancePackFile(ORG_ID, 2569, 7))
    expect(july2569[1]).toBe(
      `อนุชา ค้างจ่าย,3100000009400,3000.00,500.00,500.00,0.00,0.00,3000.00,${[advanceRef(adv1), advanceRef(adv3)].sort().join(' ')}`,
    )
  })
})

suite('มติ PO U94 ข้อ 4/5 · U96 #15 — ยอดรวมควบคุม · หลักฐานรายจ่าย · PDF ใน zip · เพดาน', () => {
  function packFile(version: number, suffix: string): string {
    const path = [...storage.keys()].find((key) => key.includes(`/v${version}/`) && key.endsWith(suffix)) ?? ''
    return fileAt(path)
  }

  function columnTotal(csv: string, column: string): { rows: number; satang: number } {
    const [header, ...rows] = csvRows(csv)
    const index = (header ?? '').split(',').indexOf(column)
    expect(index, column).toBeGreaterThanOrEqual(0)
    const satang = rows
      .map((row) => row.split(',')[index] ?? '-')
      .map((cell) => (cell === '-' ? 0 : Math.round(Number(cell) * 100)))
      .reduce((sum, value) => sum + value, 0)
    return { rows: rows.length, satang }
  }

  it('00_Control_Totals.csv ตรงกับจำนวนแถว/ผลรวมคอลัมน์ของไฟล์ในชุดเดียวกันทุกบรรทัด · 03 มีหลักฐานรายจ่าย', async () => {
    await resetOrgData()
    await seedU94Payee()
    await seedCompletedBatch([
      { payeeId: PAYEE_ID, gross: 850000, wht: 25500 },
      { payeeId: PAYEE_ID, gross: 120000, wht: 3600 },
    ])
    await seedRevenue()
    await seedExpense({ gross: 60_000, date: '2026-06-28', status: 'approved' })
    const periodId = await junePeriodId()
    const record = await exportsApi.createExportPack(ctx, { periodId })

    const control = csvRows(packFile(record.version, '00_Control_Totals.csv'))
    expect(control[0]).toBe('section,file,item,description,row_count,amount_baht')
    const fileLines = control.slice(1).map((line) => line.split(',')).filter((cells) => cells[0] === 'file')
    // ทุกไฟล์ 01–16 มีบรรทัดควบคุม
    expect(new Set(fileLines.map((cells) => cells[1])).size).toBe(16)
    let checked = 0
    for (const [, fileName, item, , rowCount, amount] of fileLines) {
      if (fileName === undefined || fileName.endsWith('.xlsx') || item === undefined || item.includes('[')) continue
      const total = columnTotal(packFile(record.version, fileName), item)
      expect(total.rows, `${fileName} rows`).toBe(Number(rowCount))
      expect(total.satang, `${fileName}:${item}`).toBe(Math.round(Number(amount) * 100))
      checked += 1
    }
    expect(checked).toBeGreaterThan(25)
    const summary = new Map(
      control
        .slice(1)
        .map((line) => line.split(','))
        .filter((cells) => cells[0] === 'summary')
        .map((cells) => [cells[2], cells[5]] as const),
    )
    expect(summary.get('revenue_before_vat')).toBe('12000.00')
    expect(summary.get('wht_withheld')).toBe('291.00')
    // U114 — ใบทั้งหมดเป็นเงื่อนไข (1) ⇒ บริษัทออกให้ 0 · รวมต้องนำส่ง = หักจากผู้รับ
    expect(summary.get('wht_paid_by_payer')).toBe('0.00')
    expect(summary.get('wht_remit_total')).toBe('291.00')
    expect(summary.get('payout_transfer')).toBe('9409.00')
    expect(summary.get('accrued_expenses')).toBe('600.00')
    expect(summary.get('unbilled_revenue')).toBe('12000.00')

    // U96 #15 — หลักฐานรายจ่ายต่อท้าย: expense_id/วันทำงาน/วันจ่าย/รอบ/ใบสำคัญจ่าย (เลขเดียวกับไฟล์ 04)/เคส/ใบเสร็จ
    const expenses = csvRows(packFile(record.version, '03_Expenses.csv'))
    expect(expenses[0]).toBe(
      'payee,category,gross_baht,wht_baht,net_baht,receipt_in_company_name,expense_id,work_date,payment_date,payout_batch_ref,voucher_ref,case_ref,cost_center,receipt_file,substitute_receipt_number',
    )
    const payments = csvRows(packFile(record.version, '04_Payments.csv'))
    const voucherRef = payments[1]?.split(',')[5]
    for (const row of expenses.slice(1)) {
      const cells = row.split(',')
      expect(cells[6]).toMatch(/^[0-9a-f-]{36}$/)
      // มติ PO U103 — รายการที่ไม่ใช้ใบรับรองแทนใบเสร็จ: `substitute_receipt_number` = `-`
      expect(cells.slice(7)).toEqual(['20/06/2569', '25/06/2569', cells[9], voucherRef, 'SF-2026-04600', '-', 'ok.jpg', '-'])
    }

    // หน้าปกเป็น PDF ที่ประกอบได้ (มีตารางยอดรวมควบคุม — ตรวจเนื้อหาที่ pure test)
    expect(decoder.decode(storage.get([...storage.keys()].find((key) => key.endsWith('00_Cover_Sheet.pdf')) ?? '')?.subarray(0, 5))).toBe('%PDF-')
  })

  it('เพดานร่วมทุกโฟลเดอร์ ⇒ แนบเท่าที่ได้ตามลำดับ (เอกสารภาษีก่อน) · ที่เหลืออยู่ใน NOT_ATTACHED.txt ของโฟลเดอร์ · CSV ครบ', async () => {
    const periodId = await junePeriodId()
    const limited = await exportsApi.createExportPack(ctx, { periodId }, { pdfBudget: { limit: 3 } })
    expect(limited.versionLabel).toBe('v1.1')
    const zip = storage.get([...storage.keys()].find((key) => key.includes('/v2/') && key.endsWith('.zip')) ?? '') ?? new Uint8Array()
    const names = zipEntryNames(zip)
    // 50 ทวิ 2 ใบ (ต่อรายการ) + ใบสำคัญจ่าย 1 ไฟล์ = 3 · สลิปไม่ได้แนบ
    expect(names.filter((name) => name.startsWith('wht_certificates/') && name.endsWith('.pdf'))).toHaveLength(2)
    expect(names).not.toContain('wht_certificates/NOT_ATTACHED.txt')
    const batchRef = (names.find((name) => name.startsWith('vouchers/PV-')) ?? '').replace(/^vouchers\/PV-|\.pdf$/g, '')
    expect(batchRef).toMatch(/^PB-4\.6-\d+-KEY$/)
    expect(names.filter((name) => name.startsWith('vouchers/'))).toEqual([
      `vouchers/PV-${batchRef}.pdf`,
      'vouchers/NOT_ATTACHED.txt',
    ])
    const note = decoder.decode(zipEntryBytes(zip, 'vouchers/NOT_ATTACHED.txt') ?? new Uint8Array())
    expect(note).toContain(`SLIP-${batchRef}`)
    expect(note).toContain('04_Payments.csv')
    // CSV ของงวดยังครบเหมือนชุดก่อน (เพดานไม่ตัดข้อมูล)
    expect(packFile(2, '04_Payments.csv')).toBe(packFile(1, '04_Payments.csv'))

    // version ใหม่ไม่ทับของเดิม — ไฟล์ของ v1 ยังอยู่ครบและไม่เปลี่ยน
    const v1Zip = [...storage.keys()].find((key) => key.includes('/v1/') && key.endsWith('.zip')) ?? ''
    expect(zipEntryNames(storage.get(v1Zip) ?? new Uint8Array())).toContain(`vouchers/SLIP-${batchRef}.pdf`)

    const audit = await db().$queryRawUnsafe<
      { after_data: { attachments?: { vouchers?: { attached: number; not_attached: string[] } } } }[]
    >(`SELECT after_data FROM audit_logs WHERE target_type = 'export_records' AND target_id = '${limited.id}'`)
    expect(audit[0]?.after_data.attachments?.vouchers).toEqual({ attached: 1, not_attached: [`SLIP-${batchRef}`] })
  })

  it('BUG-167 — ประวัติ Export นับเอกสารแนบ = PDF ที่แนบใน zip จริง (จาก audit ตอนสร้าง)', async () => {
    const history = await exportsApi.listExportHistory(accountant, {})
    const byVersion = new Map(history.items.map((item) => [item.version, item]))
    // v2 = เพดาน 3 ไฟล์ (50 ทวิ 2 + ใบสำคัญจ่าย 1) · v1 = ครบ (50 ทวิ 2 + ใบสำคัญจ่าย + สลิป)
    expect(byVersion.get(2)?.attachmentCount).toBe(3)
    expect(byVersion.get(1)?.attachmentCount).toBe(4)
    const v1Zip = [...storage.keys()].find((key) => key.includes('/v1/') && key.endsWith('.zip')) ?? ''
    const pdfs = zipEntryNames(storage.get(v1Zip) ?? new Uint8Array()).filter(
      (name) => name.includes('/') && name.endsWith('.pdf'),
    )
    expect(pdfs).toHaveLength(4)
  })

  it('BUG-168 — wht_certificates/ แนบใบที่ยกเลิกในงวดด้วย (ชื่อลงท้าย -CANCELLED) · 05_WHT_Data.csv ยังมีเฉพาะใบที่มีผล', async () => {
    const certs = await db().$queryRawUnsafe<{ id: string; certificate_number: string }[]>(
      `SELECT id, certificate_number FROM wht_certificates WHERE organization_id = '${ORG_ID}' ORDER BY certificate_number`,
    )
    expect(certs).toHaveLength(2)
    const [cancelled, active] = certs
    await db().$executeRawUnsafe(
      `UPDATE wht_certificates SET status = 'cancelled', cancel_reason = 'ทดสอบ BUG-168', cancelled_by = '${USER_ID}', cancelled_at = now()
        WHERE id = '${cancelled?.id ?? ''}'`,
    )
    const periodId = await junePeriodId()
    const record = await exportsApi.createExportPack(ctx, { periodId })
    const zip =
      storage.get([...storage.keys()].find((key) => key.includes(`/v${record.version}/`) && key.endsWith('.zip')) ?? '') ??
      new Uint8Array()
    const whtNames = zipEntryNames(zip).filter((name) => name.startsWith('wht_certificates/'))
    expect(whtNames).toEqual(
      [
        `wht_certificates/${cancelled?.certificate_number ?? ''}-CANCELLED.pdf`,
        `wht_certificates/${active?.certificate_number ?? ''}.pdf`,
      ].sort(),
    )
    const whtCsv = packFile(record.version, '05_WHT_Data.csv')
    expect(whtCsv).toContain(active?.certificate_number ?? '-')
    expect(whtCsv).not.toContain(cancelled?.certificate_number ?? '-')
  })

  it('U128 — ใบเดือนก่อนที่ส่งชุดแล้วถูกยกเลิกในงวดถัดไป ⇒ ไฟล์ 05 ของงวดถัดไปมีแถวกลับรายการ (ยอดติดลบ · อ้างใบเดิม) + 00 หักกลบ', async () => {
    const [active] = await db().$queryRawUnsafe<{ id: string; certificate_number: string; wht_satang: number; gross_satang: number }[]>(
      `SELECT id, certificate_number, wht_satang, gross_satang FROM wht_certificates
        WHERE organization_id = '${ORG_ID}' AND status = 'active' ORDER BY certificate_number LIMIT 1`,
    )
    if (active === undefined) throw new Error('fixture')
    // ชุดล่าสุดของเดือนมิถุนายน = ส่งให้สำนักงานบัญชีแล้ว (สร้างก่อนการยกเลิก)
    await db().$executeRawUnsafe(`
      UPDATE export_records SET status = 'sent', sent_at = '2026-07-02T03:00:00Z', generated_at = '2026-07-01T03:00:00Z'
       WHERE id = (SELECT id FROM export_records WHERE organization_id = '${ORG_ID}'
                    AND period_id = '${await junePeriodId()}' ORDER BY version DESC LIMIT 1)
    `)
    await db().$executeRawUnsafe(
      `UPDATE wht_certificates SET status = 'cancelled', cancel_reason = 'ทดสอบ U128', cancelled_by = '${USER_ID}',
              cancelled_at = '2026-07-10T03:00:00Z' WHERE id = '${active.id}'`,
    )
    const { ensurePeriodForDate } = await import('@/lib/accounting/queries')
    const july = await ensurePeriodForDate(ctx, new Date('2026-07-10T03:00:00Z'))
    const record = await exportsApi.createExportPack(ctx, { periodId: july.id })

    const fileOf = (suffix: string): string =>
      fileAt(
        [...storage.keys()].find(
          (key) => /\/2569-0?7\//.test(key) && key.includes(`/v${record.version}/`) && key.endsWith(suffix),
        ) ?? '',
      )
    const lines = csvRows(fileOf('05_WHT_Data.csv'))
    const reversal = lines.find((line) => line.startsWith(`${active.certificate_number},`))
    expect(reversal).toBeDefined()
    expect(reversal?.endsWith(`,cancelled,${active.certificate_number}`)).toBe(true)
    expect(reversal).toContain(`,-${(active.gross_satang / 100).toFixed(2)},-${(active.wht_satang / 100).toFixed(2)},`)
    // เดือนที่จ่าย = มิถุนายน ⇒ ไม่มีแถวปกติของใบนี้ในชุดเดือนกรกฎาคม
    expect(lines.filter((line) => line.startsWith(`${active.certificate_number},`))).toHaveLength(1)

    const control = fileOf('00_Control_Totals.csv')
    expect(control).toContain(`,wht_remit_total,ภาษีหัก ณ ที่จ่าย — รวมต้องนำส่ง,1,-${(active.wht_satang / 100).toFixed(2)}`)
  })
})
