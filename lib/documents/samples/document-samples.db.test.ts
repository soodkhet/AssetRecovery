import { randomUUID } from 'node:crypto'
import { PrismaPg } from '@prisma/adapter-pg'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { extractPdfText } from '@/components/pdf/extract-text'
import { DOCUMENT_SAMPLE_TYPES } from '@/lib/documents/samples/catalog'
import { DOCUMENT_NUMBER_TYPES } from '@/lib/document-numbering/format'
import { PrismaClient } from '@/lib/generated/prisma/client'
import { setDocumentSeries } from '@/tests/helpers/document-series'

/**
 * ตัวอย่างเอกสารทั้งหมด (มติ PO U104) — ระดับ DB จริง
 *
 *  - เปิดรายการ + เรนเดอร์ตัวอย่าง **ทุกชนิด** แล้ว `document_number_series` ไม่เปลี่ยนเลยสักแถว (current_seq/ปี/เลขล่าสุด)
 *    และไม่สร้างแถวชุดเลขใหม่ให้ชนิดที่ยังไม่เคยออก
 *  - เลขตัวอย่าง = เลขถัดไปตามค่าตั้งปัจจุบัน
 *  - หัวเอกสาร = ข้อมูลองค์กรจริง · **ไม่มีข้อมูลจริงอื่น** (บริษัทไฟแนนซ์/ผู้ใช้ในฐาน) ปนในตัวอย่าง
 */

const url = process.env.TEST_DATABASE_URL
const suite = url ? describe : describe.skip
if (!url) console.warn('[document-samples.db.test] ข้ามเทสต์ระดับ DB — ไม่มี TEST_DATABASE_URL')

function assertLocalTestDatabase(connectionString: string): void {
  const parsed = new URL(connectionString)
  const isLocal = ['localhost', '127.0.0.1', '::1', 'postgres'].includes(parsed.hostname)
  if (!isLocal || !parsed.pathname.includes('test')) {
    throw new Error(`TEST_DATABASE_URL ต้องเป็น DB ทดสอบบนเครื่อง/CI เท่านั้น (host=${parsed.hostname}) — Rule 07`)
  }
}

let client: PrismaClient | null = null
function db(): PrismaClient {
  if (!url) throw new Error('ไม่มี TEST_DATABASE_URL')
  if (!client) {
    assertLocalTestDatabase(url)
    client = new PrismaClient({ adapter: new PrismaPg({ connectionString: url }) })
  }
  return client
}

const RUN = `${process.pid}${Date.now()}`
const ORG_TAX_ID = `${RUN}1`.slice(-13).padStart(13, '7')
const ORG_NAME = `บริษัท องค์กรหัวเอกสาร ${RUN.slice(-5)} จำกัด`
const REAL_COMPANY = `บริษัท ลูกค้าจริงในฐาน ${RUN.slice(-5)} จำกัด`
const REAL_COMPANY_TAX_ID = `${RUN}2`.slice(-13).padStart(13, '6')
const REAL_USER = `ผู้ใช้จริงในฐาน ${RUN.slice(-5)}`
/** 06/10/2569 10:00 ไทย */
const AS_OF = new Date('2026-10-06T03:00:00Z')

let orgId = ''

interface SeriesSnapshot {
  doc_type: string
  current_seq: number
  current_year: number | null
  last_issued_number: string | null
  updated_at: Date
}

async function seriesSnapshot(): Promise<SeriesSnapshot[]> {
  return db().$queryRawUnsafe<SeriesSnapshot[]>(
    `SELECT doc_type::text, current_seq, current_year, last_issued_number, updated_at
       FROM document_number_series WHERE organization_id = $1::uuid ORDER BY doc_type`,
    orgId,
  )
}

suite('ตัวอย่างเอกสารทั้งหมด — ไม่เดินเลข · ไม่มีข้อมูลจริง (มติ PO U104)', () => {
  beforeAll(async () => {
    process.env.DATABASE_URL = url
    orgId = randomUUID()
    const userId = randomUUID()
    const roleId = randomUUID()
    await db().$executeRawUnsafe(
      `INSERT INTO organizations (id, name, tax_id, address, phone) VALUES ($1::uuid, $2, $3, '1 ถนนองค์กร กรุงเทพมหานคร 10110', '02-111-2222')`,
      orgId,
      ORG_NAME,
      ORG_TAX_ID,
    )
    await db().$executeRawUnsafe(
      `INSERT INTO roles (id, organization_id, name, role_group, is_seed) VALUES ($1::uuid, $2::uuid, 'บัญชี ตัวอย่างเอกสาร', 'system', false)`,
      roleId,
      orgId,
    )
    await db().$executeRawUnsafe(
      `INSERT INTO users (id, organization_id, role_id, email, full_name, status) VALUES ($1::uuid, $2::uuid, $3::uuid, $4, $5, 'active')`,
      userId,
      orgId,
      roleId,
      `samples-${userId}@test.local`,
      REAL_USER,
    )
    await db().$executeRawUnsafe(
      `INSERT INTO finance_companies (id, organization_id, name, short_name, tax_id, vat_mode, payment_due_days, created_by)
       VALUES ($1::uuid, $2::uuid, $3, 'REAL', $4, 'exclude_vat', 30, $5::uuid)`,
      randomUUID(),
      orgId,
      REAL_COMPANY,
      REAL_COMPANY_TAX_ID,
      userId,
    )
    // ชุดเลขที่เคยออกแล้ว 3 ชนิด (ตัวนับไม่ใช่ 0) — ชนิดอื่นยังไม่มีแถว
    await setDocumentSeries(db(), orgId, 'tax_invoice', { currentSeq: 41 })
    await setDocumentSeries(db(), orgId, 'billing_batch', { currentSeq: 6, currentYear: 2569 })
    await setDocumentSeries(db(), orgId, 'advance', { prefix: 'ADVX', currentSeq: 11, currentYear: 2569 })
  })

  afterAll(async () => {
    await client?.$disconnect()
  })

  it('รายการ + PDF ทุกชนิด: ตัวนับไม่เดิน ไม่สร้างแถวใหม่ · เลขตัวอย่าง = เลขถัดไป · หัวเอกสารจริง · ไม่มีข้อมูลจริงอื่น', async () => {
    const { listDocumentSamples, loadDocumentSampleContext } = await import('@/lib/documents/samples/queries')
    const { renderDocumentSample } = await import('@/components/pdf/document-samples')

    const before = await seriesSnapshot()
    expect(before.map((row) => row.doc_type)).toEqual(['advance', 'billing_batch', 'tax_invoice'])

    const list = await listDocumentSamples(orgId, AS_OF)
    expect(list.find((item) => item.type === 'receipt-tax-invoice')?.sampleNumber).toBe('INV-0042')
    expect(list.find((item) => item.type === 'billing-invoice')?.sampleNumber).toBe('BL-2569-007')
    expect(list.find((item) => item.type === 'advance-request')?.sampleNumber).toBe('ADVX-2569-0012')
    // ชนิดที่ยังไม่เคยออก ⇒ เลข 1 ของรูปแบบเริ่มต้น
    expect(list.find((item) => item.type === 'payment-voucher')?.sampleNumber).toBe('PV-2569-0001')

    const context = await loadDocumentSampleContext(orgId, AS_OF)
    expect(Object.keys(context.numbers).sort()).toEqual([...DOCUMENT_NUMBER_TYPES].sort())
    expect(context.letterhead.nameTh).toBe(ORG_NAME)

    for (const type of DOCUMENT_SAMPLE_TYPES) {
      const pdf = await renderDocumentSample(type, context)
      const text = extractPdfText(new Uint8Array(pdf)).replace(/\n/g, '')
      expect(text, type).toContain(ORG_NAME)
      expect(text, type).not.toContain(REAL_COMPANY)
      expect(text, type).not.toContain(REAL_COMPANY_TAX_ID)
      expect(text, type).not.toContain(REAL_USER)
    }

    const after = await seriesSnapshot()
    expect(after).toEqual(before)
  }, 120_000)
})
