import { PrismaPg } from '@prisma/adapter-pg'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { PrismaClient } from '@/lib/generated/prisma/client'
import type * as FakeUploads from '@/tests/helpers/fake-uploads'

vi.mock('@/lib/uploads/storage', async () => (await import('@/tests/helpers/fake-uploads')).fakeStorageModule())

/**
 * เทสต์ระดับ DB ของ job `purge_debtor_documents` (PDPA — มติ PO 06/10/2569 U97)
 *
 *  · เคสที่ปิดนานกว่าระยะเก็บ ⇒ ลบไฟล์เฉพาะช่องเอกสารลูกหนี้ (สัญญา/บัตร/ชุด/อื่น) · รูปสินค้าไม่แตะ
 *  · แถวเคส/แถวเอกสารคงอยู่ + `purged_at`/`deleted_at` + `cases.debtor_documents_purged_at`
 *  · audit ต่อเคส actor = ระบบ + job id ใน reason · รันซ้ำไม่ลบ/ไม่ audit ซ้ำ (idempotent)
 *  · ยังไม่ครบระยะ/ยังไม่ปิด = ไม่แตะ · ค่าตั้งขององค์กรมีผล · ลบไฟล์ไม่สำเร็จ = ลองใหม่รอบหน้า
 * Storage ใช้ตัวแทน (`tests/helpers/fake-uploads`) — ห้ามยิง Supabase จริง (Rule 07)
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

const ORG_ID = '00000000-0000-4000-8000-0000000097d0'
const ROLE_ID = '00000000-0000-4000-8000-0000000097d1'
const USER_ID = '00000000-0000-4000-8000-0000000097d2'
const COMPANY_ID = '00000000-0000-4000-8000-0000000097d3'

/** 6 ต.ค. 2569 เวลาไทย 09:00 */
const NOW = new Date('2026-10-06T02:00:00.000Z')
const OLD_CLOSE = '2021-03-01T03:00:00Z'
const RECENT_CLOSE = '2024-03-01T03:00:00Z'

let client: PrismaClient | null = null
let job: typeof import('@/lib/cases/debtor-document-purge-job') | null = null
let uploads: typeof FakeUploads | null = null

function db(): PrismaClient {
  if (!url) throw new Error('ไม่มี TEST_DATABASE_URL')
  if (!client) {
    assertLocalTestDatabase(url)
    client = new PrismaClient({ adapter: new PrismaPg({ connectionString: url }) })
  }
  return client
}

function fake(): typeof FakeUploads {
  if (uploads === null) throw new Error('ยังไม่ได้โหลด fake uploads')
  return uploads
}

let seq = 0

async function seedCase(options: {
  status: 'closed_success' | 'closed_fail' | 'rejected' | 'active'
  closedAt?: string | null
  reviewedAt?: string | null
}): Promise<string> {
  seq += 1
  const ref = `PDPA-${seq}-${Date.now()}`
  const rows = await db().$queryRawUnsafe<{ id: string }[]>(`
    INSERT INTO cases (organization_id, case_ref, case_ref_normalized, company_id, source, status, created_by,
                       debtor_name, outcome, closed_at, reviewed_at)
    VALUES ('${ORG_ID}', $$${ref}$$, $$${ref}$$, '${COMPANY_ID}', 'manual', '${options.status}', '${USER_ID}',
            'ลูกหนี้ ${seq}',
            ${options.status === 'closed_success' || options.status === 'closed_fail' ? `'${options.status}'` : 'NULL'},
            ${options.closedAt ? `'${options.closedAt}'` : 'NULL'},
            ${options.reviewedAt ? `'${options.reviewedAt}'` : 'NULL'})
    RETURNING id
  `)
  return rows[0]?.id ?? ''
}

async function seedDocument(caseId: string, slot: string, options: { deleted?: boolean } = {}): Promise<string> {
  seq += 1
  const path = `cases/${caseId}/${slot}/file-${seq}.pdf`
  await db().$executeRawUnsafe(`
    INSERT INTO case_documents (organization_id, case_id, document_type, file_url, file_hash, original_name,
                                mime_type, size_bytes, uploaded_by, deleted_at)
    VALUES ('${ORG_ID}', '${caseId}', '${slot}', '${path}', 'hash-${seq}', 'file-${seq}.pdf',
            'application/pdf', 10, '${USER_ID}', ${options.deleted === true ? 'now()' : 'NULL'})
  `)
  fake().putFakeUpload(path, fake().sampleBytes('pdf', path))
  return path
}

async function run(jobId = 'job-pdpa-1') {
  if (job === null) throw new Error('ยังไม่ได้โหลด job')
  return job.runPurgeDebtorDocumentsJob({ organizationId: ORG_ID, now: NOW, jobId })
}

async function cleanup(): Promise<void> {
  await db().$executeRawUnsafe(`DELETE FROM case_documents WHERE organization_id = '${ORG_ID}'`)
  await db().$executeRawUnsafe(`DELETE FROM cases WHERE organization_id = '${ORG_ID}'`)
  await db().$executeRawUnsafe(`DELETE FROM data_retention_settings WHERE organization_id = '${ORG_ID}'`)
}

beforeAll(async () => {
  if (!url) return
  process.env.DATABASE_URL = url
  job = await import('@/lib/cases/debtor-document-purge-job')
  uploads = await import('@/tests/helpers/fake-uploads')

  const tx = db()
  await tx.$executeRawUnsafe(`
    INSERT INTO organizations (id, name, tax_id, address)
    VALUES ('${ORG_ID}', 'U97Pdpa', '9999999997970', 'ที่อยู่ทดสอบ U97') ON CONFLICT (id) DO NOTHING
  `)
  await tx.$executeRawUnsafe(`
    INSERT INTO roles (id, organization_id, name, role_group, is_seed)
    VALUES ('${ROLE_ID}', '${ORG_ID}', 'ธุรการ U97', 'system', false) ON CONFLICT (id) DO NOTHING
  `)
  await tx.$executeRawUnsafe(`
    INSERT INTO users (id, organization_id, role_id, email, full_name, status)
    VALUES ('${USER_ID}', '${ORG_ID}', '${ROLE_ID}', 'pdpa97@test.local', 'ธุรการ U97', 'active')
    ON CONFLICT (id) DO NOTHING
  `)
  await tx.$executeRawUnsafe(`
    INSERT INTO finance_companies (id, organization_id, name, short_name, tax_id, vat_mode, created_by)
    VALUES ('${COMPANY_ID}', '${ORG_ID}', 'ไฟแนนซ์ U97', 'U97', '0105512497001', 'exclude_vat', '${USER_ID}')
    ON CONFLICT (id) DO NOTHING
  `)
  await cleanup()
})

beforeEach(async () => {
  if (!url) return
  fake().resetFakeUploads()
  await cleanup()
})

afterEach(() => uploads?.resetFakeUploads())

afterAll(async () => {
  if (url) await cleanup()
  await client?.$disconnect()
})

suite('job purge_debtor_documents (มติ PO U97 — PDPA)', () => {
  it('เคสปิดเกิน 5 ปี: ลบเฉพาะไฟล์เอกสารลูกหนี้ · รูปสินค้าไม่แตะ · เก็บแถว + วันที่ลบ · audit actor ระบบ + job id', async () => {
    const caseId = await seedCase({ status: 'closed_success', closedAt: OLD_CLOSE })
    const personal = [
      await seedDocument(caseId, 'contract_doc'),
      await seedDocument(caseId, 'national_id_doc'),
      await seedDocument(caseId, 'bundle_doc'),
      await seedDocument(caseId, 'other_doc'),
      // ผู้ใช้ลบไปก่อนแล้ว แต่ไฟล์ยังอยู่บน Storage ⇒ ต้องลบด้วย
      await seedDocument(caseId, 'contract_doc', { deleted: true }),
    ]
    const photo = await seedDocument(caseId, 'product_photo')

    const result = await run()
    expect(result).toEqual({ casesPurged: 1, filesPurged: 5, filesFailed: 0 })
    expect([...fake().uploadTestState.removed].sort()).toEqual([...personal].sort())
    expect(fake().uploadTestState.files.has(photo)).toBe(true)

    const documents = await db().caseDocument.findMany({ where: { caseId }, orderBy: { fileUrl: 'asc' } })
    expect(documents).toHaveLength(6)
    for (const document of documents) {
      if (document.documentType === 'product_photo') {
        expect(document.purgedAt).toBeNull()
        expect(document.deletedAt).toBeNull()
      } else {
        expect(document.purgedAt?.toISOString()).toBe(NOW.toISOString())
        expect(document.deletedAt).not.toBeNull()
      }
    }

    const row = await db().case.findUnique({ where: { id: caseId } })
    expect(row?.debtorDocumentsPurgedAt?.toISOString()).toBe(NOW.toISOString())
    expect(row?.debtorName).toBe(`ลูกหนี้ ${seq - 6}`)

    const audits = await db().auditLog.findMany({ where: { targetId: caseId, targetType: 'cases', action: 'delete' } })
    expect(audits).toHaveLength(1)
    expect(audits[0]?.actorId).toBeNull()
    expect(audits[0]?.reason).toContain('[job:job-pdpa-1]')
    expect(audits[0]?.afterData).toMatchObject({ files_purged: 5, retention_years: 5 })
  })

  it('รันซ้ำ = ไม่ลบ/ไม่ audit ซ้ำ (idempotent)', async () => {
    const caseId = await seedCase({ status: 'closed_fail', closedAt: OLD_CLOSE })
    await seedDocument(caseId, 'national_id_doc')
    expect((await run('job-a')).filesPurged).toBe(1)
    fake().uploadTestState.removed.length = 0
    expect(await run('job-b')).toEqual({ casesPurged: 0, filesPurged: 0, filesFailed: 0 })
    expect(fake().uploadTestState.removed).toEqual([])
    expect(await db().auditLog.count({ where: { targetId: caseId, action: 'delete' } })).toBe(1)
  })

  it('ยังไม่ครบระยะ / ยังไม่ปิด = ไม่แตะ · เคสไม่รับ (rejected) นับจากวันพิจารณา', async () => {
    const recent = await seedCase({ status: 'closed_success', closedAt: RECENT_CLOSE })
    const active = await seedCase({ status: 'active', closedAt: OLD_CLOSE })
    const rejected = await seedCase({ status: 'rejected', reviewedAt: OLD_CLOSE })
    await seedDocument(recent, 'contract_doc')
    await seedDocument(active, 'contract_doc')
    const rejectedPath = await seedDocument(rejected, 'contract_doc')

    const result = await run()
    expect(result.casesPurged).toBe(1)
    expect(fake().uploadTestState.removed).toEqual([rejectedPath])
    const purged = await db().case.findMany({ where: { organizationId: ORG_ID, debtorDocumentsPurgedAt: { not: null } } })
    expect(purged.map((row) => row.id)).toEqual([rejected])
  })

  it('ค่าตั้งขององค์กรมีผล: ตั้ง 1 ปี ⇒ เคสปิด 2 ปีก่อนถูกลบ', async () => {
    const recent = await seedCase({ status: 'closed_success', closedAt: RECENT_CLOSE })
    await seedDocument(recent, 'contract_doc')
    expect((await run()).casesPurged).toBe(0)

    await db().$executeRawUnsafe(
      `INSERT INTO data_retention_settings (organization_id, debtor_document_retention_years) VALUES ('${ORG_ID}', 1)`,
    )
    expect((await run()).casesPurged).toBe(1)
  })

  it('ลบไฟล์ไม่สำเร็จ ⇒ ไม่มาร์คไฟล์นั้น · รอบถัดไปลองใหม่ได้', async () => {
    const caseId = await seedCase({ status: 'closed_success', closedAt: OLD_CLOSE })
    const ok = await seedDocument(caseId, 'contract_doc')
    const failing = await seedDocument(caseId, 'national_id_doc')
    fake().uploadTestState.failRemove.add(failing)

    expect(await run('job-1')).toEqual({ casesPurged: 1, filesPurged: 1, filesFailed: 1 })
    const pending = await db().caseDocument.findMany({ where: { caseId, purgedAt: null } })
    expect(pending.map((document) => document.fileUrl)).toEqual([failing])

    fake().uploadTestState.failRemove.clear()
    expect(await run('job-2')).toEqual({ casesPurged: 1, filesPurged: 1, filesFailed: 0 })
    expect(fake().uploadTestState.removed).toEqual([ok, failing])
    // วันที่ลบระดับเคสคงเป็นครั้งแรก
    const row = await db().case.findUnique({ where: { id: caseId } })
    expect(row?.debtorDocumentsPurgedAt?.toISOString()).toBe(NOW.toISOString())
  })

  it('DB CHECK: มาร์คว่าลบตามนโยบายโดยไม่มี deleted_at ไม่ได้', async () => {
    const caseId = await seedCase({ status: 'closed_success', closedAt: OLD_CLOSE })
    await seedDocument(caseId, 'contract_doc')
    await expect(
      db().$executeRawUnsafe(`UPDATE case_documents SET purged_at = now() WHERE case_id = '${caseId}'`),
    ).rejects.toThrow(/chk_case_documents_purged_deleted/)
  })
})
