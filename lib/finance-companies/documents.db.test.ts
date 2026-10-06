import { PrismaPg } from '@prisma/adapter-pg'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import type { SessionUser } from '@/lib/auth/types'
import { PrismaClient } from '@/lib/generated/prisma/client'
import type * as FakeUploads from '@/tests/helpers/fake-uploads'

vi.mock('@/lib/uploads/storage', async () => (await import('@/tests/helpers/fake-uploads')).fakeStorageModule())

/**
 * เทสต์ระดับ DB — มติ PO U132 (เอกสารบริษัทไฟแนนซ์) + U133 (ขอบเขตรอบบิล/รอบจ่าย)
 *
 *  · U132: แนบ/แทนที่ = เวอร์ชันใหม่ (ไฟล์เดิมคงอยู่) · ชนิดเดี่ยวซ้ำ/แทนที่ซ้อน = VERSION_CONFLICT (รวมพร้อมกัน)
 *    · DB ห้ามแก้/ลบ · คำเตือน · ผู้ใช้บริษัทถูกปฏิเสธ · signed URL ลง audit · แถวไฟล์ 17 ของ Export Pack
 *  · U133: ขอบเขตห้ามซ้อน (รวมสร้างพร้อมกัน) · รายบริษัทผูก junction · แก้รอบเดิมไม่ชนตัวเอง
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

const ORG_ID = '00000000-0000-4000-8000-0000001320a0'
const ROLE_ID = '00000000-0000-4000-8000-0000001320a1'
const USER_ID = '00000000-0000-4000-8000-0000001320a2'
const COMPANY_A = '00000000-0000-4000-8000-0000001320c1'
const COMPANY_B = '00000000-0000-4000-8000-0000001320c2'

let client: PrismaClient | null = null
let docs: typeof import('@/lib/finance-companies/document-queries')
let companies: typeof import('@/lib/finance-companies/queries')
let cycles: typeof import('@/lib/settings/queries/cycles')
let exportsQ: typeof import('@/lib/exports/queries')
let access: typeof import('@/lib/uploads/access')
let personal: typeof import('@/lib/uploads/personal-data')
let uploads: typeof FakeUploads

function db(): PrismaClient {
  if (!url) throw new Error('ไม่มี TEST_DATABASE_URL')
  if (!client) {
    assertLocalTestDatabase(url)
    client = new PrismaClient({ adapter: new PrismaPg({ connectionString: url }) })
  }
  return client
}

const superadmin: SessionUser = {
  id: USER_ID,
  organizationId: ORG_ID,
  supabaseUid: 'uid-u132',
  email: 'superadmin-u132@test.local',
  fullName: 'Superadmin U132',
  status: 'active',
  roleId: ROLE_ID,
  roleName: 'Superadmin',
  roleGroup: 'system',
  isSuperadmin: true,
  teamId: null,
  companyId: null,
  capabilities: {},
  scope: { kind: 'global', teamIds: [], companyId: null, userId: USER_ID },
  loginAt: new Date().toISOString(),
}

const companyUser: SessionUser = {
  ...superadmin,
  id: '00000000-0000-4000-8000-0000001320a9',
  roleName: 'ผู้ใช้บริษัท',
  roleGroup: 'finance_company',
  isSuperadmin: false,
  companyId: COMPANY_A,
  capabilities: { view_master_data: 'view' },
  scope: { kind: 'company', teamIds: [], companyId: COMPANY_A, userId: '00000000-0000-4000-8000-0000001320a9' },
}

const meta = { ipAddress: null, userAgent: null }
const ctx = (reason: string) => ({ actor: superadmin, meta, reason })

function codeOf(error: unknown): string {
  return (error as { code?: string }).code ?? String(error)
}

const docPath = (segment: string, key: string, company = COMPANY_A) =>
  `finance-companies/${company}/documents/${segment}/${key}.pdf`

function putPdf(path: string): void {
  uploads.putFakeUpload(path, uploads.sampleBytes('pdf', path))
}

async function reset(): Promise<void> {
  const tx = db()
  // เอกสารบริษัทลบไม่ได้ด้วย trigger (เก็บทุกเวอร์ชัน) — ปิดเฉพาะตอนล้างข้อมูลเทสต์
  await tx.$executeRawUnsafe(`ALTER TABLE finance_company_documents DISABLE TRIGGER trg_finance_company_documents_immutable`)
  try {
    await tx.$executeRawUnsafe(`DELETE FROM finance_company_documents WHERE organization_id = '${ORG_ID}'`)
  } finally {
    await tx.$executeRawUnsafe(`ALTER TABLE finance_company_documents ENABLE TRIGGER trg_finance_company_documents_immutable`)
  }
  await tx.$executeRawUnsafe(`DELETE FROM billing_payout_cycles WHERE organization_id = '${ORG_ID}'`)
  await tx.$executeRawUnsafe(`UPDATE finance_companies SET vat_registered = true WHERE organization_id = '${ORG_ID}'`)
}

beforeAll(async () => {
  if (!url) return
  process.env.DATABASE_URL = url
  docs = await import('@/lib/finance-companies/document-queries')
  companies = await import('@/lib/finance-companies/queries')
  cycles = await import('@/lib/settings/queries/cycles')
  exportsQ = await import('@/lib/exports/queries')
  access = await import('@/lib/uploads/access')
  personal = await import('@/lib/uploads/personal-data')
  uploads = await import('@/tests/helpers/fake-uploads')

  await db().$executeRawUnsafe(`
    INSERT INTO organizations (id, name, tax_id, address, vat_registered)
    VALUES ('${ORG_ID}', 'U132 Org', '9999999913201', 'ที่อยู่ทดสอบ', true) ON CONFLICT (id) DO NOTHING
  `)
  await db().$executeRawUnsafe(`
    INSERT INTO roles (id, organization_id, name, role_group, is_seed)
    VALUES ('${ROLE_ID}', '${ORG_ID}', 'Superadmin U132', 'system', false) ON CONFLICT (id) DO NOTHING
  `)
  await db().$executeRawUnsafe(`
    INSERT INTO users (id, organization_id, role_id, email, full_name, status)
    VALUES ('${USER_ID}', '${ORG_ID}', '${ROLE_ID}', 'superadmin-u132@test.local', 'Superadmin U132', 'active')
    ON CONFLICT (id) DO NOTHING
  `)
  await db().$executeRawUnsafe(`
    INSERT INTO finance_companies (id, organization_id, name, short_name, tax_id, created_by, updated_at)
    VALUES ('${COMPANY_A}', '${ORG_ID}', 'บจก. เอ ลิสซิ่ง (U132)', 'A', '0105555013201', '${USER_ID}', NOW()),
           ('${COMPANY_B}', '${ORG_ID}', 'บจก. บี แคปปิตอล (U132)', 'B', '0105555013202', '${USER_ID}', NOW())
    ON CONFLICT (id) DO NOTHING
  `)
})

beforeEach(async () => {
  if (!url) return
  uploads.resetFakeUploads()
  uploads.uploadTestState.realVerify = true
  await reset()
})

afterAll(async () => {
  if (url) await reset()
  await client?.$disconnect()
})

const NOW = new Date('2026-10-07T05:00:00Z')

suite('มติ PO U132 — เอกสารบริษัทไฟแนนซ์', () => {
  it('แนบหนังสือรับรอง → แทนที่เป็นเวอร์ชัน 2 (ไฟล์เดิมยังอยู่) + SHA-256 + audit พร้อมเหตุผล', async () => {
    const p1 = docPath('certificate', '11111111-1111-4111-8111-000000000001')
    putPdf(p1)
    const v1 = await docs.createCompanyDocument(ctx('แนบหนังสือรับรองครั้งแรก'), COMPANY_A, {
      documentType: 'company_certificate',
      title: 'ไม่ควรถูกเก็บ',
      issuedDate: new Date(Date.UTC(2026, 0, 10)),
      path: p1,
      originalName: 'cert-2569.pdf',
      replacesDocumentId: null,
      reason: 'แนบหนังสือรับรองครั้งแรก',
    })
    expect(v1).toMatchObject({ version: 1, title: null, issuedDate: '2026-01-10', isCurrent: true })
    expect(v1.fileSha256).toBe(uploads.sha256Of(uploads.sampleBytes('pdf', p1)))

    const p2 = docPath('certificate', '11111111-1111-4111-8111-000000000002')
    putPdf(p2)
    const v2 = await docs.createCompanyDocument(ctx('หนังสือรับรองฉบับใหม่'), COMPANY_A, {
      documentType: 'company_certificate',
      title: null,
      issuedDate: new Date(Date.UTC(2026, 8, 1)),
      path: p2,
      originalName: 'cert-2569-09.pdf',
      replacesDocumentId: v1.id,
      reason: 'หนังสือรับรองฉบับใหม่',
    })
    expect(v2.version).toBe(2)

    const list = await docs.listCompanyDocuments(superadmin, COMPANY_A, NOW)
    expect(list.documents.map((doc) => [doc.version, doc.isCurrent])).toEqual([
      [2, true],
      [1, false],
    ])
    // ภ.พ.20 ยังไม่มี (บริษัทจด VAT) · หนังสือรับรองฉบับปัจจุบันยังไม่เกิน 6 เดือน
    expect(list.warnings.map((warning) => warning.kind)).toEqual(['missing_vat_registration'])

    const audits = await db().$queryRawUnsafe<{ reason: string; after_data: Record<string, unknown> }[]>(`
      SELECT reason, after_data FROM audit_logs
      WHERE organization_id = '${ORG_ID}' AND target_type = 'finance_company_documents'
        AND target_id IN ('${v1.id}', '${v2.id}') ORDER BY created_at
    `)
    expect(audits.map((row) => row.reason)).toEqual(['แนบหนังสือรับรองครั้งแรก', 'หนังสือรับรองฉบับใหม่'])
    expect(audits[1]?.after_data).toMatchObject({ version: 2, replaces_document_id: v1.id, file_path: p2 })
  })

  it('ชนิดเดี่ยวแนบซ้ำโดยไม่แทนที่ / แทนที่เวอร์ชันที่ถูกแทนที่แล้ว / แทนที่พร้อมกัน ⇒ VERSION_CONFLICT (ได้สายเดียว)', async () => {
    const paths = ['01', '02', '03', '04', '05'].map((n) => docPath('vat-registration', `22222222-2222-4222-8222-0000000000${n}`))
    for (const path of paths) putPdf(path)
    const input = (path: string, replacesDocumentId: string | null) => ({
      documentType: 'vat_registration' as const,
      title: null,
      issuedDate: null,
      path,
      originalName: 'pp20.pdf',
      replacesDocumentId,
      reason: 'แนบ ภ.พ.20 ของบริษัท',
    })
    const v1 = await docs.createCompanyDocument(ctx('แนบ ภ.พ.20'), COMPANY_A, input(paths[0] ?? '', null))
    await expect(docs.createCompanyDocument(ctx('แนบ ภ.พ.20'), COMPANY_A, input(paths[1] ?? '', null))).rejects.toMatchObject({
      code: 'COMPANY_DOCUMENT_VERSION_CONFLICT',
    })

    const results = await Promise.allSettled([
      docs.createCompanyDocument(ctx('แนบ ภ.พ.20 ใหม่'), COMPANY_A, input(paths[2] ?? '', v1.id)),
      docs.createCompanyDocument(ctx('แนบ ภ.พ.20 ใหม่'), COMPANY_A, input(paths[3] ?? '', v1.id)),
    ])
    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1)
    const rejected = results.find((result) => result.status === 'rejected')
    expect(rejected?.status === 'rejected' ? codeOf(rejected.reason) : '').toBe('COMPANY_DOCUMENT_VERSION_CONFLICT')

    // อ้างเวอร์ชันที่ถูกแทนที่ไปแล้ว
    await expect(docs.createCompanyDocument(ctx('แนบ ภ.พ.20'), COMPANY_A, input(paths[4] ?? '', v1.id))).rejects.toMatchObject({
      code: 'COMPANY_DOCUMENT_VERSION_CONFLICT',
    })
    // อ้างเอกสารของบริษัทอื่น
    putPdf(docPath('vat-registration', '22222222-2222-4222-8222-000000000009', COMPANY_B))
    await expect(
      docs.createCompanyDocument(ctx('แนบ ภ.พ.20'), COMPANY_B, {
        ...input(docPath('vat-registration', '22222222-2222-4222-8222-000000000009', COMPANY_B), v1.id),
      }),
    ).rejects.toMatchObject({ code: 'COMPANY_DOCUMENT_NOT_FOUND' })
  })

  it('"อื่น ๆ" มีได้หลายสาย · แทนที่โดยไม่กรอกชื่อ = ใช้ชื่อเดิม · path ของบริษัทอื่น/ชนิดอื่นถูกปฏิเสธ', async () => {
    const p1 = docPath('other', '33333333-3333-4333-8333-000000000001')
    const p2 = docPath('other', '33333333-3333-4333-8333-000000000002')
    const p3 = docPath('other', '33333333-3333-4333-8333-000000000003')
    for (const path of [p1, p2, p3]) putPdf(path)
    const base = { documentType: 'other' as const, issuedDate: null, originalName: 'x.pdf', reason: 'แนบเอกสารอื่น' }
    const a = await docs.createCompanyDocument(ctx('แนบเอกสารอื่น'), COMPANY_A, { ...base, title: 'หนังสือมอบอำนาจ', path: p1, replacesDocumentId: null })
    await docs.createCompanyDocument(ctx('แนบเอกสารอื่น'), COMPANY_A, { ...base, title: 'บัตรผู้มีอำนาจ', path: p2, replacesDocumentId: null })
    const a2 = await docs.createCompanyDocument(ctx('แนบเอกสารอื่น'), COMPANY_A, { ...base, title: null, path: p3, replacesDocumentId: a.id })
    expect(a2).toMatchObject({ version: 2, title: 'หนังสือมอบอำนาจ' })

    const foreign = docPath('other', '33333333-3333-4333-8333-000000000004', COMPANY_B)
    putPdf(foreign)
    await expect(
      docs.createCompanyDocument(ctx('แนบเอกสารอื่น'), COMPANY_A, { ...base, title: 'ข้ามบริษัท', path: foreign, replacesDocumentId: null }),
    ).rejects.toMatchObject({ code: 'UPLOAD_PATH_OUT_OF_SCOPE' })
  })

  it('DB ห้ามแก้/ลบเอกสาร (เก็บทุกเวอร์ชัน)', async () => {
    const path = docPath('bank-book', '44444444-4444-4444-8444-000000000001')
    putPdf(path)
    const doc = await docs.createCompanyDocument(ctx('แนบสมุดบัญชี'), COMPANY_A, {
      documentType: 'bank_book',
      title: null,
      issuedDate: null,
      path,
      originalName: 'book.pdf',
      replacesDocumentId: null,
      reason: 'แนบสมุดบัญชี',
    })
    await expect(
      db().$executeRawUnsafe(`UPDATE finance_company_documents SET original_name = 'x' WHERE id = '${doc.id}'`),
    ).rejects.toThrow(/COMPANY_DOCUMENT_IMMUTABLE/)
    await expect(db().$executeRawUnsafe(`DELETE FROM finance_company_documents WHERE id = '${doc.id}'`)).rejects.toThrow(
      /COMPANY_DOCUMENT_IMMUTABLE/,
    )
  })

  it('คำเตือนบนรายการบริษัท: หนังสือรับรองเกิน 6 เดือน · ไม่จด VAT ไม่เตือน ภ.พ.20 · ผู้ใช้บริษัทไม่ได้รับคำเตือน', async () => {
    const path = docPath('certificate', '55555555-5555-4555-8555-000000000001')
    putPdf(path)
    await docs.createCompanyDocument(ctx('แนบหนังสือรับรอง'), COMPANY_A, {
      documentType: 'company_certificate',
      title: null,
      issuedDate: new Date(Date.UTC(2025, 11, 1)),
      path,
      originalName: 'old.pdf',
      replacesDocumentId: null,
      reason: 'แนบหนังสือรับรอง',
    })
    await db().$executeRawUnsafe(`UPDATE finance_companies SET vat_registered = false WHERE id = '${COMPANY_B}'`)
    const map = await docs.companyDocumentWarningsFor(
      ORG_ID,
      [
        { id: COMPANY_A, vatRegistered: true },
        { id: COMPANY_B, vatRegistered: false },
      ],
      NOW,
    )
    expect(map.get(COMPANY_A)?.map((w) => w.kind)).toEqual(['certificate_outdated', 'missing_vat_registration'])
    expect(map.get(COMPANY_B)?.map((w) => w.kind)).toEqual(['missing_certificate'])

    const list = await companies.listFinanceCompanies(superadmin, { status: 'all' })
    expect(list.find((company) => company.id === COMPANY_A)?.documentWarnings.length).toBe(2)
    const own = await companies.listFinanceCompanies(companyUser, { status: 'all' })
    expect(own.every((company) => company.documentWarnings.length === 0)).toBe(true)
  })

  it('ผู้ใช้บริษัท (พอร์ทัล) ไม่เห็นเอกสาร · เปิดไฟล์ = signed URL + audit "view"', async () => {
    await expect(docs.listCompanyDocuments(companyUser, COMPANY_A)).rejects.toMatchObject({ code: 'PERMISSION_DENIED' })
    const path = docPath('contract', '66666666-6666-4666-8666-000000000001')
    await expect(access.authorizeDownload(companyUser, path)).rejects.toMatchObject({ code: 'PERMISSION_DENIED' })
    await expect(access.authorizeDownload(superadmin, path)).resolves.toBeUndefined()

    const audit = personal.buildPersonalFileViewAudit({
      actor: superadmin,
      path,
      ipAddress: null,
      userAgent: null,
    })
    expect(audit).toMatchObject({ action: 'view', targetType: 'finance_companies', targetId: COMPANY_A, reason: 'เปิดดูเอกสารบริษัทไฟแนนซ์' })
  })

  it('แถวไฟล์ 17 ของ Export Pack — เวอร์ชันปัจจุบัน + บริษัทที่ไม่มีเอกสารได้แถวคำเตือน', async () => {
    const p1 = docPath('certificate', '77777777-7777-4777-8777-000000000001')
    const p2 = docPath('certificate', '77777777-7777-4777-8777-000000000002')
    putPdf(p1)
    putPdf(p2)
    const base = { documentType: 'company_certificate' as const, title: null, originalName: 'c.pdf', reason: 'แนบหนังสือรับรอง' }
    const v1 = await docs.createCompanyDocument(ctx('แนบหนังสือรับรอง'), COMPANY_A, {
      ...base,
      issuedDate: new Date(Date.UTC(2026, 0, 1)),
      path: p1,
      replacesDocumentId: null,
    })
    await docs.createCompanyDocument(ctx('แนบหนังสือรับรอง'), COMPANY_A, {
      ...base,
      issuedDate: new Date(Date.UTC(2026, 8, 1)),
      path: p2,
      replacesDocumentId: v1.id,
    })
    const rows = await exportsQ.companyDocumentExportRows(ORG_ID, NOW)
    const a = rows.filter((row) => row.companyName.includes('เอ ลิสซิ่ง'))
    expect(a).toHaveLength(1)
    expect(a[0]).toMatchObject({ documentType: 'company_certificate', version: 2, warnings: ['ยังไม่มี ภ.พ.20 ของบริษัท'] })
    const b = rows.filter((row) => row.companyName.includes('บี แคปปิตอล'))
    expect(b).toEqual([expect.objectContaining({ documentType: null, version: null })])
    expect(b[0]?.warnings).toContain('ยังไม่มีหนังสือรับรองบริษัท')
  })
})

const cycleBase = {
  cutoffRuleType: 'month_end' as const,
  cutoffDates: [],
  cutoffText: null,
  dueRuleType: 'net_days' as const,
  dueRuleValue: 30,
}

suite('มติ PO U133 — ขอบเขตรอบบิล/รอบจ่าย', () => {
  it('รายบริษัทผูก junction · บริษัทเดียวกันอยู่ 2 รอบ = CYCLE_SCOPE_OVERLAP · ทุกบริษัทซ้อนกับรายบริษัท', async () => {
    const a = await cycles.createCycle(ctx('รอบบิลบริษัทเอ'), {
      ...cycleBase,
      name: 'AR เอ',
      type: 'AR',
      scopeKind: 'selected_companies',
      companyIds: [COMPANY_A],
    })
    expect(a.companies).toEqual([{ id: COMPANY_A, name: 'บจก. เอ ลิสซิ่ง (U132)' }])

    await expect(
      cycles.createCycle(ctx('รอบบิลซ้อน'), { ...cycleBase, name: 'AR ซ้อน', type: 'AR', scopeKind: 'selected_companies', companyIds: [COMPANY_A, COMPANY_B] }),
    ).rejects.toMatchObject({ code: 'CYCLE_SCOPE_OVERLAP' })
    await expect(
      cycles.createCycle(ctx('รอบบิลทั้งหมด'), { ...cycleBase, name: 'AR ทั้งหมด', type: 'AR', scopeKind: 'all_companies', companyIds: [] }),
    ).rejects.toMatchObject({ code: 'CYCLE_SCOPE_OVERLAP' })

    const b = await cycles.createCycle(ctx('รอบบิลบริษัทบี'), {
      ...cycleBase,
      name: 'AR บี',
      type: 'AR',
      scopeKind: 'selected_companies',
      companyIds: [COMPANY_B],
    })
    // แก้รอบเดิม (ไม่ชนตัวเอง) — ย้ายบี → เอ ชนรอบเอ
    await expect(
      cycles.updateCycle(ctx('ย้ายบริษัท'), b, { ...cycleBase, name: 'AR บี', type: 'AR', scopeKind: 'selected_companies', companyIds: [COMPANY_A] }),
    ).rejects.toMatchObject({ code: 'CYCLE_SCOPE_OVERLAP' })
    const same = await cycles.updateCycle(ctx('แก้วันครบกำหนด'), b, {
      ...cycleBase,
      dueRuleValue: 45,
      name: 'AR บี',
      type: 'AR',
      scopeKind: 'selected_companies',
      companyIds: [COMPANY_B],
    })
    expect(same.dueRuleValue).toBe(45)

    // ปิดใช้งานรอบเอแล้ว รอบใหม่ของเอสร้างได้
    await cycles.deleteCycle(ctx('เลิกใช้รอบเอ'), a)
    await expect(
      cycles.createCycle(ctx('รอบบิลเอใหม่'), { ...cycleBase, name: 'AR เอ ใหม่', type: 'AR', scopeKind: 'selected_companies', companyIds: [COMPANY_A] }),
    ).resolves.toMatchObject({ scopeKind: 'selected_companies' })
  })

  it('รอบจ่าย: In-house + Outsource อยู่คู่กันได้ · ทุกทีมซ้อน · สร้างพร้อมกันฝั่งเดียวกันได้รอบเดียว', async () => {
    await cycles.createCycle(ctx('รอบจ่ายใน'), { ...cycleBase, name: 'AP ใน', type: 'AP', scopeKind: 'inhouse', companyIds: [] })
    await expect(
      cycles.createCycle(ctx('รอบจ่ายทุกทีม'), { ...cycleBase, name: 'AP ทุกทีม', type: 'AP', scopeKind: 'all_teams', companyIds: [] }),
    ).rejects.toMatchObject({ code: 'CYCLE_SCOPE_OVERLAP' })

    const results = await Promise.allSettled([
      cycles.createCycle(ctx('รอบจ่ายนอก'), { ...cycleBase, name: 'AP นอก 1', type: 'AP', scopeKind: 'outsource', companyIds: [] }),
      cycles.createCycle(ctx('รอบจ่ายนอก'), { ...cycleBase, name: 'AP นอก 2', type: 'AP', scopeKind: 'outsource', companyIds: [] }),
    ])
    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1)
    const rejected = results.find((result) => result.status === 'rejected')
    expect(rejected?.status === 'rejected' ? codeOf(rejected.reason) : '').toBe('CYCLE_SCOPE_OVERLAP')
  })

  it('บริษัทที่ไม่มีในองค์กร = COMPANY_NOT_FOUND · DB ปฏิเสธขอบเขตไม่เข้าคู่ชนิด', async () => {
    await expect(
      cycles.createCycle(ctx('รอบบิลบริษัทแปลก'), {
        ...cycleBase,
        name: 'AR แปลก',
        type: 'AR',
        scopeKind: 'selected_companies',
        companyIds: ['00000000-0000-4000-8000-00000013ffff'],
      }),
    ).rejects.toMatchObject({ code: 'COMPANY_NOT_FOUND' })
    await expect(
      db().$executeRawUnsafe(`
        INSERT INTO billing_payout_cycles (organization_id, name, type, cutoff_rule_type, cutoff_dates, due_rule_type, due_rule_value, due_rule, scope_kind, created_by, updated_at)
        VALUES ('${ORG_ID}', 'ผิดชนิด', 'AR', 'month_end', '{}', 'net_days', 30, 'Net 30 วัน', 'inhouse', '${USER_ID}', NOW())
      `),
    ).rejects.toThrow(/cycles_scope_matches_type/)
  })
})
