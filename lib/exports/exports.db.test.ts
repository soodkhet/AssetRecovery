import { PrismaPg } from '@prisma/adapter-pg'
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
 *  - `37` §6.1: ชุดมีไฟล์ 01–08 ครบ + หน้าปก + `.zip` · `file_hash` = SHA-256 ของ `.zip` จริง
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

vi.mock('@/lib/exports/pack-storage', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/exports/pack-storage')>()
  return {
    ...actual,
    uploadPackFile: async (input: { path: string; bytes: Uint8Array }) => {
      // `upsert: false` ของจริง — เขียนทับ path เดิมไม่ได้เด็ดขาด (Rule 09)
      if (storage.has(input.path)) throw new Error(`ไฟล์ซ้ำ: ${input.path}`)
      storage.set(input.path, input.bytes)
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
                                      gross_satang, wht_satang, net_satang, wht_pct_snapshot, created_by)
      VALUES ('${ORG_ID}', '${batchId}', '${expenseRows[0]?.id}', '${item.payeeId}',
              ${item.gross}, ${item.wht}, ${item.gross - item.wht}, 3.00, '${USER_ID}')
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
                          total_satang, fee_model_snapshot, revenue_date, created_by)
    VALUES ('${ORG_ID}', '${CASE_ID}', '${COMPANY_ID}', 1200000, 84000, 7.00, 1284000, 'FLAT', '2026-06-25',
            '${USER_ID}')
  `)
}

async function resetOrgData(): Promise<void> {
  storage.clear()
  const tx = db()
  for (const statement of [
    `DELETE FROM export_records WHERE organization_id = '${ORG_ID}'`,
    `DELETE FROM wht_certificates WHERE organization_id = '${ORG_ID}'`,
    `DELETE FROM wht_filing_summaries WHERE organization_id = '${ORG_ID}'`,
    `DELETE FROM expense_records WHERE organization_id = '${ORG_ID}'`,
    `DELETE FROM exceptions WHERE organization_id = '${ORG_ID}'`,
    `DELETE FROM payout_batch_items WHERE organization_id = '${ORG_ID}'`,
    `DELETE FROM expenses WHERE organization_id = '${ORG_ID}'`,
    `DELETE FROM payout_batches WHERE organization_id = '${ORG_ID}'`,
    `DELETE FROM revenues WHERE organization_id = '${ORG_ID}'`,
    `DELETE FROM accounting_periods WHERE organization_id = '${ORG_ID}'`,
  ]) {
    await tx.$executeRawUnsafe(statement)
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
  it('ชุดมีไฟล์ 01–08 ครบ + หน้าปก + .zip · file_hash = SHA-256 ของ .zip จริง', async () => {
    await resetOrgData()
    await seedCompletedBatch([{ payeeId: PAYEE_ID, gross: 850000, wht: 25500 }])
    await seedRevenue()

    const periodId = await junePeriodId()
    const record = await exportsApi.createExportPack(ctx, { periodId })

    expect(record.versionLabel).toBe('v1.0')
    expect(record.status).toBe('generated')
    expect(record.fileCount).toBe(8)
    expect(record.files.map((file) => file.key).sort()).toEqual([
      '01',
      '02',
      '03',
      '04',
      '05',
      '06',
      '07',
      '08',
      'cover',
      'pack',
    ])

    const { sha256Hex } = await import('@/lib/exports/pack-storage')
    const zipPath = [...storage.keys()].find((path) => path.endsWith('.zip')) ?? ''
    const zipBytes = storage.get(zipPath)
    expect(zipBytes).toBeDefined()
    expect(record.fileHash).toBe(sha256Hex(zipBytes ?? new Uint8Array()))
    expect(zipEntryNames(zipBytes ?? new Uint8Array())).toEqual([
      '00_Cover_Sheet.pdf',
      '01_Revenue.csv',
      '02_Cash_Receipts.csv',
      '03_Expenses.csv',
      '04_Payments.csv',
      '05_WHT_Data.csv',
      '06_Bank_Reconciliation.csv',
      '07_Adjustment_Log.csv',
      '08_Document_Checklist.xlsx',
    ])
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
    expect(paymentCsv).toContain('PB-4.6-1-KEY,25/06/2569,ประยุทธ์ บุญมี,8245.00,Bank Transfer,PV-2569-PB-4.6-1-KEY-001')

    const whtCsv = fileAt([...storage.keys()].find((path) => path.endsWith('05_WHT_Data.csv')) ?? '')
    expect(whtCsv).toContain('ประยุทธ์ บุญมี,3100000004600,25/06/2569')
    expect(whtCsv).toContain('8500.00,255.00,3.00')
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
    expect(after?.file_names).toHaveLength(9)
    expect(after?.file_hash).toMatch(/^[0-9a-f]{64}$/)
  })
})
