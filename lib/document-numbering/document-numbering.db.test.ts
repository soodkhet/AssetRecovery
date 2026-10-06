import { randomUUID } from 'node:crypto'
import { PrismaPg } from '@prisma/adapter-pg'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { SessionUser } from '@/lib/auth/types'
import {
  DOCUMENT_NUMBER_DEFAULTS,
  DOCUMENT_NUMBER_TYPES,
  formatDocumentNumber,
  type DocumentNumberFormat,
} from '@/lib/document-numbering/format'
import { PrismaClient } from '@/lib/generated/prisma/client'
import type { DocumentNumberType } from '@/lib/generated/prisma/enums'
import { setDocumentSeries } from '@/tests/helpers/document-series'

/**
 * เลขที่เอกสารตั้งค่าได้ทุกชนิด (มติ PO 06/10/2569 U102) — ระดับ DB จริง
 *
 *  - SQL (`format_document_number` / `ensure_document_number_series`) ตรงกับ pure module ทุก option
 *  - ยิงพร้อมกัน 20 ทรานแซกชันต่อชนิด ⇒ เลข 1..20 ไม่ซ้ำ ไม่ขาด · ล้ม = ตัวนับ rollback
 *  - รีเซ็ตรายปี/ลงวันที่ย้อนปี ⇒ ต่อจากเลขสูงสุดที่มีจริงของปีนั้น (หลักเดียวกับตอนย้ายตัวนับเดิม)
 *  - เอกสารภาษีล็อกรูปแบบหลังออกฉบับแรก · ชนิดอื่นเปลี่ยนคำนำหน้าแล้วฉบับถัดไปใช้รูปแบบใหม่
 *  - ตั้งเลขถัดไปต่ำกว่าเลขที่ใช้แล้วไม่ได้ · ทุกการเปลี่ยนมีเหตุผล + audit
 *
 * ⚠️ สร้างองค์กรใหม่ทุกรัน ⇒ ตัวนับเริ่ม 0 เสมอ ไม่ชนข้อมูลรันก่อน
 */

const url = process.env.TEST_DATABASE_URL
const suite = url ? describe : describe.skip
if (!url) console.warn('[document-numbering.db.test] ข้ามเทสต์ระดับ DB — ไม่มี TEST_DATABASE_URL')

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

type Queries = typeof import('@/lib/document-numbering/queries')
let queries: Queries

const RUN = `${process.pid}${Date.now()}`
const taxId = (salt: number): string => `${RUN}${salt}`.slice(-13).padStart(13, '8')

/** 14/08/2569 10:00 ไทย · 05/01/2570 10:00 ไทย */
const IN_2569 = new Date('2026-08-14T03:00:00Z')
const IN_2570 = new Date('2027-01-05T03:00:00Z')
const CONCURRENT = 20

let orgId = ''
let userId = ''
let actor: SessionUser
const meta = { ipAddress: null, userAgent: null }

async function seedOrg(salt: number): Promise<{ orgId: string; userId: string; roleId: string }> {
  const org = randomUUID()
  const role = randomUUID()
  const user = randomUUID()
  await db().$executeRawUnsafe(
    `INSERT INTO organizations (id, name, tax_id, address) VALUES ($1::uuid, 'DocNumberTest', $2, 'กรุงเทพฯ')`,
    org,
    taxId(salt),
  )
  await db().$executeRawUnsafe(
    `INSERT INTO roles (id, organization_id, name, role_group, is_seed) VALUES ($1::uuid, $2::uuid, 'Superadmin เลขเอกสาร', 'system', false)`,
    role,
    org,
  )
  await db().$executeRawUnsafe(
    `INSERT INTO users (id, organization_id, role_id, email, full_name, status)
     VALUES ($1::uuid, $2::uuid, $3::uuid, $4, 'ผู้ดูแลเลขเอกสาร', 'active')`,
    user,
    org,
    role,
    `docnum-${user}@test.local`,
  )
  return { orgId: org, userId: user, roleId: role }
}

function issue(docType: DocumentNumberType, at: Date, organizationId = orgId) {
  return db().$transaction((tx) => queries.nextDocumentNumber(tx, organizationId, docType, at))
}

function codeOf(error: unknown): string {
  return (error as { code?: string }).code ?? String(error)
}

async function expectCode(run: () => Promise<unknown>, code: string): Promise<void> {
  let caught: unknown = null
  try {
    await run()
  } catch (error) {
    caught = error
  }
  expect(caught, `ต้อง throw ${code}`).not.toBeNull()
  expect(codeOf(caught)).toBe(code)
}

suite('เลขที่เอกสาร — ชุดเลขกลาง document_number_series (มติ PO U102)', () => {
  beforeAll(async () => {
    process.env.DATABASE_URL = url
    queries = await import('@/lib/document-numbering/queries')
    const seeded = await seedOrg(1)
    orgId = seeded.orgId
    userId = seeded.userId
    actor = {
      id: userId,
      organizationId: orgId,
      supabaseUid: `uid-${userId}`,
      email: null,
      fullName: 'ผู้ดูแลเลขเอกสาร',
      status: 'active',
      roleId: seeded.roleId,
      roleName: 'Superadmin',
      roleGroup: 'system',
      isSuperadmin: true,
      teamId: null,
      companyId: null,
      capabilities: {},
      scope: { kind: 'global', teamIds: [], companyId: null, userId },
      loginAt: new Date().toISOString(),
    }
  })

  afterAll(async () => {
    await client?.$disconnect()
  })

  it('ค่าเริ่มต้นใน SQL ตรงกับ pure module ครบทุกชนิด', async () => {
    const fresh = await seedOrg(2)
    for (const docType of DOCUMENT_NUMBER_TYPES) {
      await db().$queryRawUnsafe(
        `SELECT ensure_document_number_series($1::uuid, $2::document_number_type)::text`,
        fresh.orgId,
        docType,
      )
    }
    const rows = await db().documentNumberSeries.findMany({ where: { organizationId: fresh.orgId } })
    expect(rows).toHaveLength(DOCUMENT_NUMBER_TYPES.length)
    for (const row of rows) {
      const expected = DOCUMENT_NUMBER_DEFAULTS[row.docType]
      expect({ prefix: row.prefix, includeYear: row.includeYear, digits: row.digits, resetYearly: row.resetYearly }).toEqual(
        expected,
      )
      expect(row.currentSeq).toBe(0)
    }
  })

  it('SQL format_document_number ตรงกับ formatDocumentNumber ทุก option (รวมเกินจำนวนหลัก)', async () => {
    const cases: Array<[DocumentNumberFormat, number, number]> = [
      [{ prefix: 'INV', includeYear: false, digits: 4, resetYearly: false }, 13, 2569],
      [{ prefix: 'RAV', includeYear: true, digits: 4, resetYearly: true }, 1, 2570],
      [{ prefix: '', includeYear: true, digits: 3, resetYearly: true }, 7, 2569],
      [{ prefix: '', includeYear: false, digits: 8, resetYearly: false }, 7, 2569],
      [{ prefix: 'TAX-INV', includeYear: true, digits: 3, resetYearly: false }, 12345, 2569],
    ]
    for (const [format, seq, year] of cases) {
      const rows = await db().$queryRawUnsafe<{ value: string }[]>(
        `SELECT format_document_number($1, $2, $3, $4, $5) AS value`,
        format.prefix,
        format.includeYear,
        format.digits,
        year,
        seq,
      )
      expect(rows[0]?.value).toBe(formatDocumentNumber(format, seq, year))
    }
  })

  for (const docType of DOCUMENT_NUMBER_TYPES) {
    it(`${docType}: ยิงพร้อมกัน ${CONCURRENT} ทรานแซกชัน ⇒ เลข 1..${CONCURRENT} ไม่ซ้ำ ไม่ขาด`, async () => {
      const results = await Promise.all(Array.from({ length: CONCURRENT }, () => issue(docType, IN_2569)))
      const sequences = results.map((result) => result.sequence).sort((a, b) => a - b)
      expect(sequences).toEqual(Array.from({ length: CONCURRENT }, (_, index) => index + 1))
      expect(new Set(results.map((result) => result.number)).size).toBe(CONCURRENT)
      const format = DOCUMENT_NUMBER_DEFAULTS[docType]
      expect(results.map((result) => result.number).sort()).toEqual(
        sequences.map((sequence) => formatDocumentNumber(format, sequence, 2569)).sort(),
      )
    })
  }

  it('ทรานแซกชันล้ม ⇒ ตัวนับ rollback เลขถัดไปไม่ขาด', async () => {
    const before = await issue('substitute_receipt', IN_2569)
    await expect(
      db().$transaction(async (tx) => {
        await queries.nextDocumentNumber(tx, orgId, 'substitute_receipt', IN_2569)
        throw new Error('rollback')
      }),
    ).rejects.toThrow('rollback')
    const after = await issue('substitute_receipt', IN_2569)
    expect(after.sequence).toBe(before.sequence + 1)
  })

  it('รีเซ็ตรายปี: ขึ้นปีใหม่เริ่ม 1 · โหมดต่อเนื่องข้ามปีนับต่อ', async () => {
    const year = await seedOrg(3)
    expect((await issue('advance_return', IN_2569, year.orgId)).number).toBe('RAV-2569-0001')
    expect((await issue('advance_return', IN_2570, year.orgId)).number).toBe('RAV-2570-0001')
    expect((await issue('tax_invoice', IN_2569, year.orgId)).number).toBe('INV-0001')
    expect((await issue('tax_invoice', IN_2570, year.orgId)).number).toBe('INV-0002')
  })

  it('ลงวันที่ย้อนปี/ขึ้นปีใหม่ ⇒ ต่อจากเลขสูงสุดที่มีจริงของปีนั้น และไม่ดึงตัวนับปีปัจจุบันถอยหลัง', async () => {
    const back = await seedOrg(4)
    // รอบวางบิลมีเลขของปี 2569 อยู่แล้ว 3 ใบ (เทียบสถานการณ์ย้ายตัวนับจากข้อมูลเดิม)
    const company = await db().$queryRawUnsafe<{ id: string }[]>(
      `INSERT INTO finance_companies (organization_id, name, short_name, tax_id, address, vat_mode, created_by)
       VALUES ($1::uuid, 'ไฟแนนซ์เลขเอกสาร', 'FDN', $2, 'กรุงเทพฯ', 'exclude_vat', $3::uuid) RETURNING id`,
      back.orgId,
      taxId(40),
      back.userId,
    )
    for (const [index, number] of ['BL-2569-001', 'BL-2569-002', 'BL-2569-007'].entries()) {
      await db().$executeRawUnsafe(
        `INSERT INTO billing_batches (organization_id, company_id, period, due_date, created_by, batch_number, created_at)
         VALUES ($1::uuid, $2::uuid, $3, '2026-12-31', $4::uuid, $5, '2026-06-01T03:00:00Z')`,
        back.orgId,
        company[0]?.id ?? '',
        `งวดย้อน ${RUN}-${index}`,
        back.userId,
        number,
      )
    }
    await setDocumentSeries(db(), back.orgId, 'billing_batch', { currentSeq: 4, currentYear: 2570 })
    // ย้อนไปปี 2569 ⇒ ต่อจาก 007 · ตัวนับปี 2570 ไม่ขยับ
    expect((await issue('billing_batch', IN_2569, back.orgId)).number).toBe('BL-2569-008')
    expect((await issue('billing_batch', IN_2570, back.orgId)).number).toBe('BL-2570-005')
  })

  it('เปลี่ยนคำนำหน้าเอกสารอื่น (LOT) ⇒ เลขถัดไปใช้รูปแบบใหม่ต่อจากลำดับเดิม + audit มีเหตุผล', async () => {
    const lots = await seedOrg(5)
    const localActor: SessionUser = { ...actor, id: lots.userId, organizationId: lots.orgId, roleId: lots.roleId }
    expect((await issue('handover_lot', IN_2569, lots.orgId)).number).toBe('LOT-2569-001')

    const updated = await queries.updateDocumentNumbering(
      { actor: localActor, meta, reason: 'เปลี่ยนคำนำหน้าเลขล็อตตามระบบคลังใหม่' },
      'handover_lot',
      { prefix: 'HL', includeYear: true, digits: 4, resetYearly: true },
      IN_2569,
    )
    expect(updated.nextNumberPreview).toBe('HL-2569-0002')
    expect((await issue('handover_lot', IN_2569, lots.orgId)).number).toBe('HL-2569-0002')

    const audits = await db().auditLog.findMany({
      where: { organizationId: lots.orgId, targetType: 'document_number_series' },
    })
    expect(audits).toHaveLength(1)
    expect(audits[0]?.reason).toBe('เปลี่ยนคำนำหน้าเลขล็อตตามระบบคลังใหม่')
    expect(audits[0]?.beforeData).toMatchObject({ prefix: 'LOT', digits: 3 })
    expect(audits[0]?.afterData).toMatchObject({ prefix: 'HL', digits: 4 })
  })

  it('ตั้งเลขถัดไป: ต่ำกว่า/เท่าเลขที่ใช้แล้ว ⇒ NUMBERING_SEQ_BELOW_ISSUED · สูงกว่า ⇒ ฉบับถัดไปได้เลขนั้น', async () => {
    const pv = await seedOrg(6)
    const localActor: SessionUser = { ...actor, id: pv.userId, organizationId: pv.orgId, roleId: pv.roleId }
    const context = { actor: localActor, meta, reason: 'ต่อเลขจากสมุดใบสำคัญจ่ายเดิม' }
    for (let index = 0; index < 5; index += 1) await issue('payment_voucher', IN_2569, pv.orgId)
    const format = DOCUMENT_NUMBER_DEFAULTS.payment_voucher

    await expectCode(
      () => queries.updateDocumentNumbering(context, 'payment_voucher', { ...format, nextSequence: 5 }, IN_2569),
      'NUMBERING_SEQ_BELOW_ISSUED',
    )
    // เลขที่มีอยู่จริงในรูปแบบใหม่ก็ต้องกันด้วย (กันชนเลขชุดเก่า)
    await db().$executeRawUnsafe(
      `UPDATE document_number_series SET current_seq = 0 WHERE organization_id = $1::uuid AND doc_type = 'payment_voucher'`,
      pv.orgId,
    )
    const updated = await queries.updateDocumentNumbering(
      context,
      'payment_voucher',
      { ...format, nextSequence: 501 },
      IN_2569,
    )
    expect(updated.minNextSequence).toBe(501)
    expect((await issue('payment_voucher', IN_2569, pv.orgId)).number).toBe('PV-2569-0501')
  })

  it('เอกสารภาษี (ใบกำกับภาษี/50 ทวิ): เปลี่ยนรูปแบบได้ก่อนออกฉบับแรก · หลังออกแล้วล็อก · ตั้งเลขเองไม่ได้', async () => {
    const tax = await seedOrg(7)
    const localActor: SessionUser = { ...actor, id: tax.userId, organizationId: tax.orgId, roleId: tax.roleId }
    const context = { actor: localActor, meta, reason: 'ตั้งรูปแบบเลขที่ใบกำกับภาษีครั้งแรก' }

    for (const docType of ['tax_invoice', 'wht_certificate'] as const) {
      const before = await queries.updateDocumentNumbering(
        context,
        docType,
        { prefix: 'TX', includeYear: true, digits: 5, resetYearly: true },
        IN_2569,
      )
      expect(before.formatLocked).toBe(false)
      expect(before.nextNumberPreview).toBe('TX-2569-00001')

      await expectCode(
        () =>
          queries.updateDocumentNumbering(
            context,
            docType,
            { prefix: 'TX', includeYear: true, digits: 5, resetYearly: true, nextSequence: 10 },
            IN_2569,
          ),
        'NUMBERING_SEQ_NOT_EDITABLE',
      )

      expect((await issue(docType, IN_2569, tax.orgId)).number).toBe('TX-2569-00001')
      await expectCode(
        () =>
          queries.updateDocumentNumbering(
            context,
            docType,
            { prefix: 'TY', includeYear: true, digits: 5, resetYearly: true },
            IN_2569,
          ),
        'NUMBERING_FORMAT_LOCKED',
      )
      // บันทึกค่าเดิมซ้ำ (ไม่เปลี่ยนรูปแบบ) ไม่ถูกปฏิเสธ
      const same = await queries.updateDocumentNumbering(
        context,
        docType,
        { prefix: 'TX', includeYear: true, digits: 5, resetYearly: true },
        IN_2569,
      )
      expect(same.formatLocked).toBe(true)
    }

    const listed = await queries.listDocumentNumbering(tax.orgId, IN_2569)
    expect(listed.map((row) => row.docType)).toEqual([...DOCUMENT_NUMBER_TYPES])
    expect(listed.find((row) => row.docType === 'tax_invoice')).toMatchObject({
      formatLocked: true,
      lastIssuedNumber: 'TX-2569-00001',
      nextNumberPreview: 'TX-2569-00002',
    })
    expect(listed.find((row) => row.docType === 'advance')).toMatchObject({
      formatLocked: false,
      lastIssuedNumber: null,
      nextNumberPreview: 'ADV-2569-0001',
    })
  })

  it('CHECK ของตาราง: รีเซ็ตรายปีต้องมีปี · คำนำหน้าผิดรูปแบบ ⇒ DB ปฏิเสธ', async () => {
    const check = await seedOrg(8)
    await expect(
      setDocumentSeries(db(), check.orgId, 'advance', { includeYear: false, resetYearly: true }),
    ).rejects.toThrow()
    await expect(setDocumentSeries(db(), check.orgId, 'advance', { prefix: 'adv-' })).rejects.toThrow()
  })
})
