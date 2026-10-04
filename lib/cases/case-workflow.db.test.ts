import { PrismaPg } from '@prisma/adapter-pg'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { PrismaClient } from '@/lib/generated/prisma/client'
import type { SessionUser } from '@/lib/auth/types'
import { CaseError } from '@/lib/cases/errors'
import type { CaseStatusChangeInput } from '@/lib/cases/schemas'

/**
 * เทสต์ระดับ DB ของ Phase 2.3 — DoD ของ task (`38` §20 + `10` §9.2):
 *  · **snapshot ค่าบริการเกิดตอน `approved` และไม่เปลี่ยนเมื่อแก้เทมเพลตทีหลัง**
 *  · recycle: อนุมัติแล้ว `tracking_round` +1 ทุกรอบ ไม่จำกัดจำนวนรอบ + ลง `recycle_requests` ครบ
 *  · ไม่อนุมัติ → กลับ `closed_fail` เดิม รอบไม่ขยับ
 *  · gate ความครบถ้วนก่อนขึ้น `pending_review` (`38` §9/§12)
 *
 * ⚠️ ไฟล์นี้เรียก **service จริง** (`changeCaseStatus`) ซึ่ง import `@/lib/prisma` ⇒ ต้องตั้ง
 * `DATABASE_URL = TEST_DATABASE_URL` **ก่อน** import แบบ dynamic (กับดัก 2026-08-14 ใน REUSE_INDEX)
 * เทสต์นี้ commit จริง (audit ลบไม่ได้ตาม `02` §13) — fixture อื่นถูกล้างใน `afterAll`
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
  console.warn('[case-workflow.db.test] ข้ามเทสต์ระดับ DB — ไม่มี TEST_DATABASE_URL (ดู .env.example)')
}

const ORG_ID = '00000000-0000-4000-8000-0000000023a0'
const ROLE_ID = '00000000-0000-4000-8000-0000000023a1'
const USER_ID = '00000000-0000-4000-8000-0000000023a2'
const COMPANY_ID = '00000000-0000-4000-8000-0000000023a3'
const TEMPLATE_V1 = '00000000-0000-4000-8000-0000000023a4'
const TEMPLATE_V2 = '00000000-0000-4000-8000-0000000023a5'
const TEAM_ID = '00000000-0000-4000-8000-0000000023a6'
const PROVINCE = 'เชียงใหม่'
// ⚠️ UUID ของ fixture ต้องเป็นรูปแบบ v4 จริง — `z.uuid()` (Zod 4) ปฏิเสธ UUID ที่ nibble เวอร์ชันเป็น 0

let client: PrismaClient | null = null
type StatusQueries = typeof import('@/lib/cases/status-queries')
let service: StatusQueries

function db(): PrismaClient {
  if (!url) throw new Error('ไม่มี TEST_DATABASE_URL')
  if (!client) {
    assertLocalTestDatabase(url)
    client = new PrismaClient({ adapter: new PrismaPg({ connectionString: url }) })
  }
  return client
}

/** Superadmin เทียม — capability ต่อ action ตรวจจาก object นี้ ไม่ต้องผูก role_capabilities จริง */
const actor: SessionUser = {
  id: USER_ID,
  organizationId: ORG_ID,
  supabaseUid: 'test-uid-23',
  email: 'phase23v2@test.local',
  fullName: 'ผู้ทดสอบ 2.3',
  status: 'active',
  roleId: ROLE_ID,
  roleName: 'ทดสอบอนุมัติเคส',
  roleGroup: 'system',
  isSuperadmin: true,
  teamId: null,
  companyId: null,
  capabilities: {},
  scope: { kind: 'global', teamIds: [], companyId: null, userId: USER_ID },
  loginAt: new Date().toISOString(),
}

const meta = { ipAddress: null, userAgent: null }

/** ตัวช่วยให้ payload ถูกตรวจชนิดตาม schema เดียวกับ API */
function change(input: CaseStatusChangeInput): CaseStatusChangeInput {
  return input
}

async function cleanup(): Promise<void> {
  if (!url) return
  const tx = db()
  await tx.$executeRawUnsafe(`DELETE FROM recycle_requests WHERE organization_id = '${ORG_ID}'`)
  await tx.$executeRawUnsafe(`DELETE FROM cases WHERE organization_id = '${ORG_ID}'`)
  await tx.$executeRawUnsafe(`DELETE FROM finance_companies WHERE organization_id = '${ORG_ID}'`)
  await tx.$executeRawUnsafe(`DELETE FROM service_fee_templates WHERE organization_id = '${ORG_ID}'`)
  await tx.$executeRawUnsafe(`DELETE FROM teams WHERE organization_id = '${ORG_ID}'`)
}

beforeAll(async () => {
  if (!url) return
  process.env.DATABASE_URL = url
  service = await import('@/lib/cases/status-queries')

  const tx = db()
  await tx.$executeRawUnsafe(`
    INSERT INTO organizations (id, name, tax_id, address)
    VALUES ('${ORG_ID}', 'Phase23Test', '9999999999293', 'ที่อยู่ทดสอบ') ON CONFLICT (id) DO NOTHING
  `)
  await tx.$executeRawUnsafe(`
    INSERT INTO roles (id, organization_id, name, role_group, is_seed)
    VALUES ('${ROLE_ID}', '${ORG_ID}', 'ทดสอบอนุมัติเคส', 'system', false) ON CONFLICT (id) DO NOTHING
  `)
  await tx.$executeRawUnsafe(`
    INSERT INTO users (id, organization_id, role_id, email, full_name, status)
    VALUES ('${USER_ID}', '${ORG_ID}', '${ROLE_ID}', 'phase23v2@test.local', 'ผู้ทดสอบ 2.3', 'active')
    ON CONFLICT (id) DO NOTHING
  `)
  await cleanup()

  // เทมเพลตค่าบริการ v1 = HYBRID base 500 บาท + 15% ของมูลหนี้ (`38` §20)
  await tx.$executeRawUnsafe(`
    INSERT INTO service_fee_templates
      (id, organization_id, name, model, base_satang, rate_pct, basis, charge_on_fail, version, is_current, created_by)
    VALUES ('${TEMPLATE_V1}', '${ORG_ID}', 'เทมเพลตทดสอบ 2.3', 'HYBRID', 50000, 15.00, 'debt_amount', false, 1, true, '${USER_ID}')
  `)
  await tx.$executeRawUnsafe(`
    INSERT INTO finance_companies (id, organization_id, name, short_name, tax_id, service_fee_template_id, created_by)
    VALUES ('${COMPANY_ID}', '${ORG_ID}', 'ไฟแนนซ์ทดสอบ 2.3', 'T23', '0105512300023', '${TEMPLATE_V1}', '${USER_ID}')
  `)
  await tx.$executeRawUnsafe(`
    INSERT INTO teams (id, organization_id, name, side, provinces, status, created_by)
    VALUES ('${TEAM_ID}', '${ORG_ID}', 'ทีมทดสอบ 2.3', 'inhouse', ARRAY['${PROVINCE}'], 'active', '${USER_ID}')
  `)
})

afterAll(async () => {
  await cleanup()
  await client?.$disconnect()
})

/** เคสที่ข้อมูล required ครบตาม `38` §6.1–6.2 (เอกสารเติมทีหลังตาม `withDocuments`) */
async function seedCase(
  caseRef: string,
  options: { withDocuments: boolean | 'bundle' | 'no_photo'; status?: string },
): Promise<string> {
  const rows = await db().$queryRawUnsafe<{ id: string }[]>(`
    INSERT INTO cases (
      organization_id, case_ref, case_ref_normalized, company_id, source, status, created_by,
      debtor_name, debtor_nationality, debtor_national_id, debtor_phone_mobile,
      addr_province, addr_detail, id_card_addr_province, id_card_addr_detail,
      asset_kind, asset_description, imei, debt_amount_satang, asset_value_satang
    ) VALUES (
      '${ORG_ID}', $$${caseRef}$$, $$${caseRef.toUpperCase()}$$, '${COMPANY_ID}', 'manual',
      '${options.status ?? 'draft'}', '${USER_ID}',
      'สมชาย ทดสอบ', 'TH', '1234567890123', '0812345678',
      '${PROVINCE}', '99/1 หมู่ 2', '${PROVINCE}', '99/1 หมู่ 2',
      'smartphone', 'iPhone 15', '123456789012345', 1000000, 800000
    ) RETURNING id
  `)
  const caseId = rows[0]?.id
  if (caseId === undefined) throw new Error('seedCase ไม่ได้ id กลับมา')

  if (options.withDocuments !== false) {
    // `bundle` = เอกสารชุดเดียว (สแกนรวมเล่ม — มติ PO 04/10/2569) ไม่มีสัญญา/บัตร/รูปสินค้าแยก
    // `no_photo` = สัญญา + บัตรประชาชน ไม่มีรูปสินค้า (ทดสอบติ๊ก "รูปสินค้ารวมอยู่ในไฟล์สัญญาแล้ว" — v3.4)
    const slots =
      options.withDocuments === 'bundle'
        ? ['bundle_doc']
        : options.withDocuments === 'no_photo'
          ? ['contract_doc', 'national_id_doc']
          : ['contract_doc', 'national_id_doc', 'product_photo']
    for (const [index, slot] of slots.entries()) {
      await db().$executeRawUnsafe(`
        INSERT INTO case_documents
          (organization_id, case_id, document_type, file_url, file_hash, original_name, mime_type, size_bytes, uploaded_by)
        VALUES ('${ORG_ID}', '${caseId}', '${slot}', 'https://test/${index}', '${'a'.repeat(64)}',
                '${slot}.pdf', 'application/pdf', 1024, '${USER_ID}')
      `)
    }
  }
  return caseId
}

async function caseRow(caseId: string) {
  const rows = await db().$queryRawUnsafe<
    Array<{
      status: string
      tracking_round: number
      outcome: string | null
      service_fee_template_id: string | null
      service_fee_model_snapshot: string | null
      service_fee_base_satang: number | null
      service_fee_rate_pct: string | null
      projected_revenue_satang: number | null
      assigned_team_id: string | null
      suggested_team_id: string | null
    }>
  >(`SELECT status, tracking_round, outcome, service_fee_template_id, service_fee_model_snapshot,
            service_fee_base_satang, service_fee_rate_pct::text, projected_revenue_satang,
            assigned_team_id, suggested_team_id
       FROM cases WHERE id = '${caseId}'`)
  return rows[0]
}

suite('Phase 2.3 — state machine + snapshot + recycle (DB จริง)', () => {
  it('draft → pending_review เสนอทีมจากจังหวัด + คำนวณประมาณการรายได้ (ยังไม่ snapshot)', async () => {
    const caseId = await seedCase('SF-2026-2301', { withDocuments: true })

    const result = await service.changeCaseStatus(actor, caseId, change({ action: 'review' }), {
      actor,
      meta,
    })
    expect(result.case.status).toBe('pending_review')
    expect(result.suggestion?.suggestedTeamId).toBe(TEAM_ID)

    const row = await caseRow(caseId)
    expect(row?.suggested_team_id).toBe(TEAM_ID)
    // HYBRID: base 50,000 + 15% ของ 1,000,000 = 200,000 สตางค์ (`38` §20)
    expect(row?.projected_revenue_satang).toBe(200_000)
    expect(row?.service_fee_template_id).toBeNull()
    expect(row?.service_fee_model_snapshot).toBeNull()

    // UAT BUG-034 — หน้าจอได้ข้อความอ่านง่าย (ชื่อเทมเพลต) ส่วนค่าดิบยังเก็บ template id ไว้ trace
    const { getCase } = await import('@/lib/cases/queries')
    const detail = await getCase(actor, caseId)
    expect(detail.projectedRevenueSource).toContain(`template=${TEMPLATE_V1}`)
    expect(detail.projectedRevenueSourceLabel).toBe('เทมเพลต "เทมเพลตทดสอบ 2.3" v1 · Hybrid: ฿500.00 + 15% ของมูลหนี้')
  })

  it('เอกสาร required ไม่ครบ → CASE_DOCUMENT_INCOMPLETE (ไม่เปลี่ยนสถานะ)', async () => {
    const caseId = await seedCase('SF-2026-2302', { withDocuments: false })

    await expect(
      service.changeCaseStatus(actor, caseId, change({ action: 'review' }), { actor, meta }),
    ).rejects.toMatchObject({ code: 'CASE_DOCUMENT_INCOMPLETE' })
    expect((await caseRow(caseId))?.status).toBe('draft')
  })

  it('accept → approved + **snapshot ค่าบริการ** และไม่เปลี่ยนเมื่อบริษัทย้ายไปเทมเพลตใหม่ (`10` §9.2)', async () => {
    const caseId = await seedCase('SF-2026-2303', { withDocuments: true })
    await service.changeCaseStatus(actor, caseId, change({ action: 'review' }), { actor, meta })
    await service.changeCaseStatus(actor, caseId, change({ action: 'accept', teamId: TEAM_ID }), { actor, meta })

    const approved = await caseRow(caseId)
    expect(approved?.status).toBe('approved')
    expect(approved?.assigned_team_id).toBe(TEAM_ID)
    expect(approved?.service_fee_template_id).toBe(TEMPLATE_V1)
    expect(approved?.service_fee_model_snapshot).toBe('HYBRID')
    expect(approved?.service_fee_base_satang).toBe(50_000)
    expect(Number(approved?.service_fee_rate_pct)).toBe(15)

    // เจรจาสัญญาใหม่ → เทมเพลตเวอร์ชันใหม่ + ย้ายบริษัทมาผูกเวอร์ชันนี้ (pattern ของ Phase 1.7)
    await db().$executeRawUnsafe(`
      INSERT INTO service_fee_templates
        (id, organization_id, name, model, base_satang, rate_pct, basis, charge_on_fail, version, is_current, created_by)
      VALUES ('${TEMPLATE_V2}', '${ORG_ID}', 'เทมเพลตทดสอบ 2.3', 'FLAT', 999900, 0, NULL, true, 2, true, '${USER_ID}')
    `)
    await db().$executeRawUnsafe(
      `UPDATE finance_companies SET service_fee_template_id = '${TEMPLATE_V2}' WHERE id = '${COMPANY_ID}'`,
    )

    const afterTemplateChange = await caseRow(caseId)
    expect(afterTemplateChange?.service_fee_template_id).toBe(TEMPLATE_V1)
    expect(afterTemplateChange?.service_fee_model_snapshot).toBe('HYBRID')
    expect(afterTemplateChange?.service_fee_base_satang).toBe(50_000)

    // คืนค่าให้เทสต์ถัดไปใช้เทมเพลต v1 เหมือนเดิม
    await db().$executeRawUnsafe(
      `UPDATE finance_companies SET service_fee_template_id = '${TEMPLATE_V1}' WHERE id = '${COMPANY_ID}'`,
    )
  })

  it('เอกสารชุดเดียว: ส่งตรวจได้โดยไม่มีสัญญา/บัตร/รูปแยก · รับเคสต้องติ๊กยืนยัน + audit เก็บการยืนยัน (มติ PO 04/10/2569)', async () => {
    const caseId = await seedCase('SF-2026-2340', { withDocuments: 'bundle' })
    const reviewed = await service.changeCaseStatus(actor, caseId, change({ action: 'review' }), { actor, meta })
    expect(reviewed.case.status).toBe('pending_review')

    await expect(
      service.changeCaseStatus(actor, caseId, change({ action: 'accept', teamId: TEAM_ID }), { actor, meta }),
    ).rejects.toMatchObject({ code: 'CASE_BUNDLE_CONFIRMATION_REQUIRED' })
    await expect(
      service.changeCaseStatus(
        actor,
        caseId,
        change({ action: 'accept', teamId: TEAM_ID, bundleDocumentsConfirmed: false }),
        { actor, meta },
      ),
    ).rejects.toMatchObject({ code: 'CASE_BUNDLE_CONFIRMATION_REQUIRED' })
    expect((await caseRow(caseId))?.status).toBe('pending_review')

    await service.changeCaseStatus(
      actor,
      caseId,
      change({ action: 'accept', teamId: TEAM_ID, bundleDocumentsConfirmed: true }),
      { actor, meta },
    )
    expect((await caseRow(caseId))?.status).toBe('approved')
    const audits = await db().$queryRawUnsafe<Array<{ after_data: Record<string, unknown> | null }>>(
      `SELECT after_data FROM audit_logs WHERE target_id = '${caseId}' AND action = 'approve'`,
    )
    expect(audits[0]?.after_data).toMatchObject({ documentMode: 'bundle', bundleDocumentsConfirmed: true })
  })

  it('แนบเอกสารปนสองโหมดถูกปัดก่อนแตะ Storage — CASE_DOCUMENT_MODE_CONFLICT ทั้งสองทิศ', async () => {
    const { addCaseDocument } = await import('@/lib/cases/queries')
    const upload = (caseId: string, documentType: 'bundle_doc' | 'contract_doc') => ({
      documentType,
      fileUrl: `cases/${caseId}/${documentType}/x-scan.pdf`,
      originalName: 'scan.pdf',
      mimeType: 'application/pdf',
      sizeBytes: 1024,
    })
    const bundleCase = await seedCase('SF-2026-2342', { withDocuments: 'bundle' })
    await expect(
      addCaseDocument(actor, bundleCase, upload(bundleCase, 'contract_doc'), { actor, meta }),
    ).rejects.toMatchObject({ code: 'CASE_DOCUMENT_MODE_CONFLICT' })

    const separateCase = await seedCase('SF-2026-2343', { withDocuments: true })
    await expect(
      addCaseDocument(actor, separateCase, upload(separateCase, 'bundle_doc'), { actor, meta }),
    ).rejects.toMatchObject({ code: 'CASE_DOCUMENT_MODE_CONFLICT' })
  })

  // ── v3.4 มติ PO 04/10/2569 — ติ๊กรูปสินค้า / จำโหมด / ลบเอกสาร ─────────────────

  it('ติ๊ก "รูปสินค้ารวมอยู่ในไฟล์สัญญาแล้ว": ไม่ติ๊ก = ส่งตรวจไม่ผ่าน · ติ๊ก = ผ่าน + จำค่า + audit', async () => {
    const { updateCase, getCase } = await import('@/lib/cases/queries')
    const caseId = await seedCase('SF-2026-2350', { withDocuments: 'no_photo' })
    await expect(
      service.changeCaseStatus(actor, caseId, change({ action: 'review' }), { actor, meta }),
    ).rejects.toMatchObject({ code: 'CASE_DOCUMENT_INCOMPLETE', context: { missing: ['product_photo'] } })

    await updateCase(actor, caseId, { productPhotoInContract: true }, { actor, meta })
    const reopened = await getCase(actor, caseId)
    expect(reopened.productPhotoInContract).toBe(true)
    expect(reopened.readiness.missingDocuments).toEqual([])
    const updateAudit = await db().$queryRawUnsafe<Array<{ before_data: Record<string, unknown>; after_data: Record<string, unknown> }>>(
      `SELECT before_data, after_data FROM audit_logs WHERE target_id = '${caseId}' AND action = 'update'`,
    )
    expect(updateAudit[0]?.before_data).toMatchObject({ productPhotoInContract: false })
    expect(updateAudit[0]?.after_data).toMatchObject({ productPhotoInContract: true })

    await service.changeCaseStatus(actor, caseId, change({ action: 'review' }), { actor, meta })
    await service.changeCaseStatus(actor, caseId, change({ action: 'accept', teamId: TEAM_ID }), { actor, meta })
    expect((await caseRow(caseId))?.status).toBe('approved')
    const approve = await db().$queryRawUnsafe<Array<{ after_data: Record<string, unknown> | null }>>(
      `SELECT after_data FROM audit_logs WHERE target_id = '${caseId}' AND action = 'approve'`,
    )
    expect(approve[0]?.after_data).toMatchObject({ productPhotoInContract: true })
  })

  it('จำโหมดเอกสาร: สร้างเคสร่างโหมดชุด → เปิดใหม่ได้โหมดชุด + ขาด "เอกสารชุด" · CHECK ปัดค่านอกรายการ', async () => {
    const { createCase, getCase } = await import('@/lib/cases/queries')
    const { caseCreateSchema } = await import('@/lib/cases/schemas')
    const created = await createCase(
      caseCreateSchema.parse({ caseRef: 'SF-2026-2351', financeCompanyId: COMPANY_ID, documentMode: 'bundle' }),
      { actor, meta },
    )
    const reopened = await getCase(actor, created.id)
    expect(reopened.documentMode).toBe('bundle')
    expect(reopened.readiness.missingDocuments).toEqual(['bundle_doc'])

    await expect(
      db().$executeRawUnsafe(`UPDATE cases SET document_mode = 'mixed' WHERE id = '${created.id}'`),
    ).rejects.toThrow(/chk_cases_document_mode/)
  })

  it('ลบเอกสาร: soft-delete (แถว + file_url ยังอยู่ ไม่แตะ Storage) + audit before/after + เหตุผลมาตรฐาน', async () => {
    const { deleteCaseDocument, CASE_DOCUMENT_DELETE_DEFAULT_REASON } = await import('@/lib/cases/queries')
    const caseId = await seedCase('SF-2026-2352', { withDocuments: true })
    const [target] = await db().$queryRawUnsafe<Array<{ id: string; file_url: string }>>(
      `SELECT id, file_url FROM case_documents WHERE case_id = '${caseId}' AND document_type = 'contract_doc'`,
    )
    if (target === undefined) throw new Error('ไม่พบเอกสารที่ seed')

    const detail = await deleteCaseDocument(actor, caseId, target.id, { actor, meta })
    expect(detail.documents.map((document) => document.documentType)).not.toContain('contract_doc')
    expect(detail.readiness.missingDocuments).toEqual(['contract_doc'])

    const [row] = await db().$queryRawUnsafe<Array<{ deleted_at: Date | null; file_url: string }>>(
      `SELECT deleted_at, file_url FROM case_documents WHERE id = '${target.id}'`,
    )
    expect(row?.deleted_at).not.toBeNull()
    expect(row?.file_url).toBe(target.file_url)

    const [audit] = await db().$queryRawUnsafe<
      Array<{ before_data: Record<string, unknown>; after_data: Record<string, unknown>; reason: string; target_type: string }>
    >(`SELECT before_data, after_data, reason, target_type FROM audit_logs WHERE target_id = '${target.id}' AND action = 'delete'`)
    expect(audit?.target_type).toBe('case_documents')
    expect(audit?.reason).toBe(CASE_DOCUMENT_DELETE_DEFAULT_REASON)
    expect(audit?.before_data).toMatchObject({ caseId, documentType: 'contract_doc', deletedAt: null })
    expect(audit?.after_data).toMatchObject({ caseId, documentType: 'contract_doc', storageFileKept: true })
    expect(audit?.after_data.deletedAt).toEqual(expect.any(String))

    // ลบซ้ำ = ไม่พบเอกสาร
    await expect(deleteCaseDocument(actor, caseId, target.id, { actor, meta })).rejects.toMatchObject({
      code: 'CASE_DOCUMENT_NOT_FOUND',
    })
  })

  it('ลบเอกสารได้เฉพาะ ร่าง/ขอข้อมูลเพิ่ม — ส่งตรวจ/อนุมัติแล้ว CASE_DOCUMENT_DELETE_NOT_ALLOWED · เอกสารเคสอื่น = ไม่พบ', async () => {
    const { deleteCaseDocument } = await import('@/lib/cases/queries')
    const firstDoc = async (caseId: string) => {
      const [document] = await db().$queryRawUnsafe<Array<{ id: string }>>(
        `SELECT id FROM case_documents WHERE case_id = '${caseId}' ORDER BY document_type LIMIT 1`,
      )
      if (document === undefined) throw new Error('ไม่พบเอกสารที่ seed')
      return document.id
    }
    for (const status of ['pending_review', 'approved']) {
      const caseId = await seedCase(`SF-2026-2353-${status}`, { withDocuments: true, status })
      await expect(
        deleteCaseDocument(actor, caseId, await firstDoc(caseId), { actor, meta, reason: 'แนบผิด' }),
      ).rejects.toMatchObject({ code: 'CASE_DOCUMENT_DELETE_NOT_ALLOWED' })
    }

    const needInfo = await seedCase('SF-2026-2354', { withDocuments: true, status: 'need_info' })
    const deleted = await deleteCaseDocument(actor, needInfo, await firstDoc(needInfo), { actor, meta, reason: 'ไฟล์ไม่ชัด' })
    expect(deleted.documents).toHaveLength(2)

    const other = await seedCase('SF-2026-2355', { withDocuments: true })
    await expect(
      deleteCaseDocument(actor, needInfo, await firstDoc(other), { actor, meta }),
    ).rejects.toMatchObject({ code: 'CASE_DOCUMENT_NOT_FOUND' })
  })

  it('ลบสัญญา/บัตรแยกประเภทออกหมดแล้ว สลับเป็นโหมดชุดได้ (ก่อนลบ = CASE_DOCUMENT_MODE_CONFLICT)', async () => {
    const { deleteCaseDocument, updateCase } = await import('@/lib/cases/queries')
    const caseId = await seedCase('SF-2026-2356', { withDocuments: true })
    await expect(updateCase(actor, caseId, { documentMode: 'bundle' }, { actor, meta })).rejects.toMatchObject({
      code: 'CASE_DOCUMENT_MODE_CONFLICT',
    })

    const separate = await db().$queryRawUnsafe<Array<{ id: string }>>(
      `SELECT id FROM case_documents WHERE case_id = '${caseId}' AND document_type IN ('contract_doc', 'national_id_doc')`,
    )
    for (const document of separate) await deleteCaseDocument(actor, caseId, document.id, { actor, meta })

    const switched = await updateCase(actor, caseId, { documentMode: 'bundle' }, { actor, meta })
    expect(switched.documentMode).toBe('bundle')
    expect(switched.readiness.missingDocuments).toEqual(['bundle_doc'])
  })

  it('เคสแยกประเภทเดิมรับเคสได้โดยไม่ต้องยืนยันเอกสารชุด และ audit ไม่มีฟิลด์ชุด', async () => {
    const caseId = await seedCase('SF-2026-2341', { withDocuments: true })
    await service.changeCaseStatus(actor, caseId, change({ action: 'review' }), { actor, meta })
    await service.changeCaseStatus(actor, caseId, change({ action: 'accept', teamId: TEAM_ID }), { actor, meta })
    expect((await caseRow(caseId))?.status).toBe('approved')
    const audits = await db().$queryRawUnsafe<Array<{ after_data: Record<string, unknown> | null }>>(
      `SELECT after_data FROM audit_logs WHERE target_id = '${caseId}' AND action = 'approve'`,
    )
    expect(audits[0]?.after_data).not.toHaveProperty('bundleDocumentsConfirmed')
  })

  it('ไม่รับเคสต้องมีเหตุผล และเมื่อมีเหตุผลแล้วไปสถานะ rejected', async () => {
    const caseId = await seedCase('SF-2026-2304', { withDocuments: true })
    await service.changeCaseStatus(actor, caseId, change({ action: 'review' }), { actor, meta })

    await expect(
      service.changeCaseStatus(actor, caseId, change({ action: 'reject' }), { actor, meta }),
    ).rejects.toMatchObject({ code: 'CASE_STATUS_REASON_REQUIRED' })

    const rejected = await service.changeCaseStatus(
      actor,
      caseId,
      change({ action: 'reject', reason: 'ข้อมูลลูกหนี้ไม่ตรงกับสัญญา' }),
      { actor, meta },
    )
    expect(rejected.case.status).toBe('rejected')
    expect(rejected.case.reviewNote).toBe('ข้อมูลลูกหนี้ไม่ตรงกับสัญญา')
  })

  it('รีไซเกิลได้เฉพาะ closed_fail — closed_success ถูกปฏิเสธ (`38` §20)', async () => {
    const caseId = await seedCase('SF-2026-2305', { withDocuments: false, status: 'closed_success' })
    await expect(
      service.changeCaseStatus(actor, caseId, change({ action: 'create_recycle_request', reason: 'ไฟแนนซ์ขอ' }), {
        actor,
        meta,
      }),
    ).rejects.toBeInstanceOf(CaseError)
    expect((await caseRow(caseId))?.status).toBe('closed_success')
  })

  it('รีไซเกิลซ้ำ 3 รอบติดกัน → tracking_round = 4 และ recycle_history 3 รายการ (`38` §20)', async () => {
    const caseId = await seedCase('SF-2026-2306', { withDocuments: false, status: 'closed_fail' })
    await db().$executeRawUnsafe(`UPDATE cases SET outcome = 'closed_fail', closed_at = NOW() WHERE id = '${caseId}'`)

    for (let round = 1; round <= 3; round += 1) {
      await service.changeCaseStatus(
        actor,
        caseId,
        { action: 'create_recycle_request', reason: `ไฟแนนซ์โทรมาขอรอบที่ ${round}` },
        { actor, meta },
      )
      expect((await caseRow(caseId))?.status).toBe('pending_recycle_review')

      const approved = await service.changeCaseStatus(actor, caseId, change({ action: 'approve_recycle' }), {
        actor,
        meta,
      })
      expect(approved.case.status).toBe('approved')
      expect(approved.case.trackingRound).toBe(round + 1)

      if (round < 3) {
        await db().$executeRawUnsafe(
          `UPDATE cases SET status = 'closed_fail', outcome = 'closed_fail', closed_at = NOW() WHERE id = '${caseId}'`,
        )
      }
    }

    const row = await caseRow(caseId)
    expect(row?.tracking_round).toBe(4)
    // เคสกลับเข้า pipeline แล้ว — ผลปิดงานรอบก่อนถูกล้าง (ประวัติอยู่ที่ recycle_requests + audit)
    expect(row?.outcome).toBeNull()

    const history = await db().$queryRawUnsafe<
      Array<{ status: string; previous_round: number; new_round: number }>
    >(`SELECT status, previous_round, new_round FROM recycle_requests WHERE case_id = '${caseId}' ORDER BY previous_round`)
    expect(history).toHaveLength(3)
    expect(history.map((entry) => [entry.previous_round, entry.new_round])).toEqual([
      [1, 2],
      [2, 3],
      [3, 4],
    ])
    expect(history.every((entry) => entry.status === 'approved')).toBe(true)
  })

  it('ไม่อนุมัติรีไซเกิล → กลับ closed_fail เดิม รอบไม่ขยับ + ต้องมีเหตุผล', async () => {
    const caseId = await seedCase('SF-2026-2307', { withDocuments: false, status: 'closed_fail' })
    await service.changeCaseStatus(
      actor,
      caseId,
      change({ action: 'create_recycle_request', reason: 'ไฟแนนซ์ขอให้ลองใหม่' }),
      { actor, meta },
    )

    await expect(
      service.changeCaseStatus(actor, caseId, change({ action: 'reject_recycle' }), { actor, meta }),
    ).rejects.toMatchObject({ code: 'CASE_RECYCLE_REJECT_REASON_REQUIRED' })

    const rejected = await service.changeCaseStatus(
      actor,
      caseId,
      change({ action: 'reject_recycle', reason: 'ปิดเคสไปแล้วเกิน 1 ปี' }),
      { actor, meta },
    )
    expect(rejected.case.status).toBe('closed_fail')
    expect(rejected.case.trackingRound).toBe(1)

    const history = await db().$queryRawUnsafe<Array<{ status: string; previous_round: number | null }>>(
      `SELECT status, previous_round FROM recycle_requests WHERE case_id = '${caseId}'`,
    )
    expect(history).toEqual([{ status: 'rejected', previous_round: null }])
  })

  it('เคสนอก scope ของผู้ใช้ตอบ CASE_NOT_FOUND (ไม่ leak ข้ามบริษัท)', async () => {
    const caseId = await seedCase('SF-2026-2308', { withDocuments: true })
    const otherCompanyUser: SessionUser = {
      ...actor,
      isSuperadmin: false,
      capabilities: { approve_case: 'manage', record_admin_data: 'manage' },
      scope: { kind: 'company', teamIds: [], companyId: TEAM_ID, userId: USER_ID },
    }
    await expect(
      service.changeCaseStatus(otherCompanyUser, caseId, change({ action: 'review' }), { actor, meta }),
    ).rejects.toMatchObject({ code: 'CASE_NOT_FOUND' })
  })

  /**
   * Final Test ด่าน 4 (Phase 8.3) + มติ PO 03/10/2569 (UAT Q10 · BUG-033) — scope ระดับแถวคุมแค่ว่า "เห็นเคสไหน"
   * ฝั่งบริษัทเห็นค่าบริการของเคสตัวเอง **ครบ** (โมเดล อัตรา ฐาน ยอด) แต่ข้อมูลภายในต้องถูกตัดเสมอ:
   * รหัส template/ที่มาดิบ, ผู้พิจารณา/เวลาพิจารณา/note, ประวัติแก้ไข, ทีม, ชื่อพนักงานหลังบ้าน
   */
  it('Company User เห็นค่าบริการเคสตัวเองครบ แต่ไม่เห็นข้อมูลภายใน · เคสบริษัทอื่นไม่ leak (UAT Q10 · BUG-033)', async () => {
    const caseId = await seedCase('SF-2026-2321', { withDocuments: true })
    try {
      const { getCase, listCases } = await import('@/lib/cases/queries')
      const { caseListQuerySchema } = await import('@/lib/cases/schemas')

      // ยืนยันก่อนว่าค่าพวกนี้มีอยู่จริงในแถว (ไม่ใช่ null เพราะ fixture ว่าง)
      await service.changeCaseStatus(actor, caseId, change({ action: 'review' }), { actor, meta })
      await service.changeCaseStatus(actor, caseId, change({ action: 'accept' }), { actor, meta })
      const asGlobal = await getCase(actor, caseId)
      expect(asGlobal.serviceFeeRatePct).not.toBeNull()
      expect(asGlobal.serviceFeeModelSnapshot).not.toBeNull()
      expect(asGlobal.serviceFeeTemplateId).not.toBeNull()
      expect(asGlobal.reviewedAt).not.toBeNull()
      expect(asGlobal.createdByName).not.toBe('')

      const companyUser: SessionUser = {
        ...actor,
        isSuperadmin: false,
        scope: { kind: 'company', teamIds: [], companyId: COMPANY_ID, userId: USER_ID },
      }
      const detail = await getCase(companyUser, caseId)
      // ค่าบริการของเคสตัวเองเห็นครบ (UAT Q10)
      expect(detail.serviceFeeModelSnapshot).toBe(asGlobal.serviceFeeModelSnapshot)
      expect(detail.serviceFeeRatePct).toBe(asGlobal.serviceFeeRatePct)
      expect(detail.serviceFeeBaseSatang).toBe(asGlobal.serviceFeeBaseSatang)
      expect(detail.serviceFeeBasisSnapshot).toBe(asGlobal.serviceFeeBasisSnapshot)
      expect(detail.serviceFeeChargeOnFail).toBe(asGlobal.serviceFeeChargeOnFail)
      expect(detail.projectedRevenueSatang).toBe(asGlobal.projectedRevenueSatang)
      // ข้อมูลภายในถูกตัด
      expect(detail.serviceFeeTemplateId).toBeNull()
      expect(detail.projectedRevenueSource).toBeNull()
      expect(detail.projectedRevenueSourceLabel).toBeNull()
      expect(detail.reviewedAt).toBeNull()
      expect(detail.reviewNote).toBeNull()
      expect(detail.editHistory).toEqual([])
      expect(detail.assignedTeamId).toBeNull()
      expect(detail.assignedTeamName).toBeNull()
      expect(detail.createdByName).toBe('')

      // บริษัทอื่นเปิดเคสนี้ไม่ได้ = ไม่พบ (ไม่ leak ว่ามีอยู่)
      const otherCompanyViewer: SessionUser = {
        ...companyUser,
        scope: { kind: 'company', teamIds: [], companyId: '00000000-0000-4000-8000-0000000233ff', userId: USER_ID },
      }
      await expect(getCase(otherCompanyViewer, caseId)).rejects.toMatchObject({ code: 'CASE_NOT_FOUND' })

      const [listItem] = (await listCases(companyUser, caseListQuerySchema.parse({}))).items
      expect(listItem?.createdByName).toBe('')
      expect(listItem?.assignedTeamName).toBeNull()
      expect(listItem?.reviewedAt).toBeNull()
    } finally {
      await db().$executeRawUnsafe(`DELETE FROM cases WHERE id = '${caseId}'`)
    }
  })

  it('filter ของ `listCases` ทับ scope ไม่ได้ — `finance_company_id`/`search` ห้ามเปิดแถวนอกขอบเขต', async () => {
    const caseRef = 'SF-2026-2320'
    const caseId = await seedCase(caseRef, { withDocuments: false })
    try {
      const { listCases } = await import('@/lib/cases/queries')
      const { caseListQuerySchema } = await import('@/lib/cases/schemas')

      // ① Company User ของบริษัทอื่น ส่ง `finance_company_id` ของบริษัทที่มีเคสมาเอง ⇒ ต้องได้ 0
      const otherCompanyUser: SessionUser = {
        ...actor,
        isSuperadmin: false,
        scope: { kind: 'company', teamIds: [], companyId: TEAM_ID, userId: USER_ID },
      }
      const crossCompany = await listCases(
        otherCompanyUser,
        caseListQuerySchema.parse({ finance_company_id: COMPANY_ID }),
      )
      expect(crossCompany.items).toEqual([])
      expect(crossCompany.total).toBe(0)
      // ตัวเลือกบริษัทที่มากับรายการ (UAT BUG-032) ก็ต้องไม่ leak ชื่อบริษัทอื่น
      expect(crossCompany.companies).toEqual([])
      const ownCompanyUser: SessionUser = {
        ...otherCompanyUser,
        scope: { kind: 'company', teamIds: [], companyId: COMPANY_ID, userId: USER_ID },
      }
      expect((await listCases(ownCompanyUser, caseListQuerySchema.parse({}))).companies).toEqual([
        { id: COMPANY_ID, name: 'ไฟแนนซ์ทดสอบ 2.3' },
      ])

      // ② search ตั้งคีย์ `OR` — ห้ามไปทับ `OR` ของ scope ทีม (เคสนี้ยังไม่มีทีมที่รับผิดชอบ)
      const teamUser: SessionUser = {
        ...actor,
        isSuperadmin: false,
        scope: { kind: 'team', teamIds: [TEAM_ID], companyId: null, userId: USER_ID },
      }
      const searched = await listCases(teamUser, caseListQuerySchema.parse({ search: caseRef }))
      expect(searched.items).toEqual([])
      expect(searched.total).toBe(0)

      // ยาม: เคสนี้มีอยู่จริงและผู้ที่เห็นทุกแถวค้นเจอ (ไม่ใช่ 0 เพราะ search พัง)
      const asGlobal = await listCases(actor, caseListQuerySchema.parse({ search: caseRef }))
      expect(asGlobal.items.map((item) => item.id)).toEqual([caseId])
      expect(asGlobal.companies).toContainEqual({ id: COMPANY_ID, name: 'ไฟแนนซ์ทดสอบ 2.3' })
    } finally {
      await db().$executeRawUnsafe(`DELETE FROM cases WHERE id = '${caseId}'`)
    }
  })

  it('มุมมองทีมเห็นเคสเฉพาะหลังอนุมัติและกำหนดทีมแล้ว — ทีมที่ระบบเสนอยังไม่เห็น (UAT Q11 · BUG-023)', async () => {
    const caseId = await seedCase('SF-2026-2398', { withDocuments: true })
    const { listCases } = await import('@/lib/cases/queries')
    const { caseListQuerySchema } = await import('@/lib/cases/schemas')
    const teamUser: SessionUser = {
      ...actor,
      isSuperadmin: false,
      scope: { kind: 'team', teamIds: [TEAM_ID], companyId: null, userId: USER_ID },
    }
    const visibleIds = async () =>
      (await listCases(teamUser, caseListQuerySchema.parse({}))).items.map((item) => item.id)
    try {
      await service.changeCaseStatus(actor, caseId, change({ action: 'review' }), { actor, meta })
      // pending_review + suggested_team_id = ทีมนี้ ⇒ ยังไม่อยู่ในมุมมองทีม
      expect(await visibleIds()).not.toContain(caseId)

      await service.changeCaseStatus(actor, caseId, change({ action: 'accept', teamId: TEAM_ID }), { actor, meta })
      expect(await visibleIds()).toContain(caseId)
    } finally {
      await db().$executeRawUnsafe(`DELETE FROM cases WHERE id = '${caseId}'`)
    }
  })

  it('ผู้ที่ไม่มีสิทธิ์อนุมัติเคสกด accept ไม่ได้ (`38` §13)', async () => {
    const caseId = await seedCase('SF-2026-2309', { withDocuments: true })
    await service.changeCaseStatus(actor, caseId, change({ action: 'review' }), { actor, meta })

    const clerk: SessionUser = {
      ...actor,
      isSuperadmin: false,
      capabilities: { record_admin_data: 'manage' },
    }
    await expect(
      service.changeCaseStatus(clerk, caseId, change({ action: 'accept', teamId: TEAM_ID }), { actor: clerk, meta }),
    ).rejects.toMatchObject({ code: 'PERMISSION_DENIED' })
  })

  it('Import: แถวถูกสร้าง draft · แถวผิด/ซ้ำตกเฉพาะแถวนั้น (`38` §8 · §12)', async () => {
    const { importCases } = await import('@/lib/cases/import-queries')
    const result = await importCases(
      {
        financeCompanyId: COMPANY_ID,
        dryRun: false,
        rows: [
          { 'เลขที่สัญญา': 'SF-2026-2320', 'ชื่อลูกหนี้': 'สมชาย', 'มูลหนี้คงเหลือ': '10,000' },
          { 'เลขที่สัญญา': '', 'ชื่อลูกหนี้': 'ไม่มีเลขสัญญา' },
          { 'เลขที่สัญญา': 'sf-2026-2320', 'ชื่อลูกหนี้': 'ซ้ำกับแถวแรก' },
          { 'เลขที่สัญญา': 'SF-2026-2321', 'สัญชาติ': 'ไทย', 'ประเภทสินค้า': 'มือถือ' },
        ],
      },
      { actor, meta },
    )

    expect(result.createdCount).toBe(2)
    expect(result.failedCount).toBe(2)
    expect(result.rows.map((row) => [row.rowNumber, row.status])).toEqual([
      [2, 'created'],
      [3, 'failed'],
      [4, 'failed'],
      [5, 'created'],
    ])
    expect(result.rows[2]?.errorCode).toBe('CASE_REF_DUPLICATE')

    const created = await db().$queryRawUnsafe<Array<{ status: string; source: string; debt_amount_satang: number }>>(
      `SELECT status, source, debt_amount_satang FROM cases
        WHERE organization_id = '${ORG_ID}' AND case_ref_normalized = 'SF-2026-2320'`,
    )
    // นำเข้าแล้วเป็น draft เสมอ + เงินในไฟล์เป็น **บาท** ต้องถูกแปลงเป็นสตางค์ (Rule 01)
    expect(created[0]).toEqual({ status: 'draft', source: 'import', debt_amount_satang: 1_000_000 })
  })

  it('แจ้งเตือน case.approved ไม่พ่วงเหตุผลเชิงระบบ แต่ audit ยังเก็บเหตุผล snapshot เต็ม (BUG-029)', async () => {
    const caseId = await seedCase('SF-2026-2329', { withDocuments: true })
    await service.changeCaseStatus(actor, caseId, change({ action: 'review' }), { actor, meta })
    const startedAt = new Date()
    await service.changeCaseStatus(actor, caseId, change({ action: 'accept', teamId: TEAM_ID }), { actor, meta })

    const audits = await db().$queryRawUnsafe<Array<{ reason: string | null }>>(
      `SELECT reason FROM audit_logs WHERE target_id = '${caseId}' AND action = 'approve' AND created_at >= $1`,
      startedAt,
    )
    expect(audits[0]?.reason).toContain('snapshot ค่าบริการอัตโนมัติ')

    const notificationBodies = async (): Promise<Array<string | null>> => {
      const rows = await db().$queryRawUnsafe<Array<{ body: string | null }>>(
        `SELECT body FROM notifications
          WHERE user_id = '${USER_ID}' AND event_code = 'case.approved'
            AND body LIKE '%SF-2026-2329%' AND created_at >= $1`,
        startedAt,
      )
      return rows.map((row) => row.body)
    }
    for (let attempt = 0; attempt < 20 && (await notificationBodies()).length === 0; attempt += 1) {
      await new Promise((resolve) => setTimeout(resolve, 100))
    }
    const bodies = await notificationBodies()
    expect(bodies).toHaveLength(1)
    expect(bodies[0]).not.toContain('snapshot')
  })

  it('รายการเคสมีวันเวลาส่งตรวจ (จาก audit) และวันเวลารับเคส (reviewed_at) (BUG-030)', async () => {
    const caseRef = 'SF-2026-2330'
    const caseId = await seedCase(caseRef, { withDocuments: true })
    const { listCases, getCase } = await import('@/lib/cases/queries')
    const { caseListQuerySchema } = await import('@/lib/cases/schemas')
    const query = caseListQuerySchema.parse({ search: caseRef })

    const [draft] = (await listCases(actor, query)).items
    expect(draft?.submittedAt).toBeNull()
    expect(draft?.reviewedAt).toBeNull()

    await service.changeCaseStatus(actor, caseId, change({ action: 'review' }), { actor, meta })
    const [pending] = (await listCases(actor, query)).items
    expect(pending?.submittedAt).not.toBeNull()
    expect(pending?.reviewedAt).toBeNull()

    await service.changeCaseStatus(actor, caseId, change({ action: 'accept', teamId: TEAM_ID }), { actor, meta })
    const [approved] = (await listCases(actor, query)).items
    expect(approved?.submittedAt).toBe(pending?.submittedAt)
    expect(approved?.reviewedAt).not.toBeNull()
    expect(Date.parse(approved?.reviewedAt ?? '')).toBeGreaterThanOrEqual(Date.parse(approved?.submittedAt ?? ''))
    expect((await getCase(actor, caseId)).submittedAt).toBe(pending?.submittedAt)
  })

  /**
   * UAT BUG-035 — สองคำสั่งเปลี่ยนสถานะยิงพร้อมกันจากสถานะเดียวกัน ("รับเคส" ชน "ไม่รับเคส")
   * ต้องสำเร็จแค่ตัวเดียว อีกตัวได้ `CASE_INVALID_STATUS_TRANSITION` · audit + แจ้งเตือนเกิดชุดเดียว
   */
  it('เปลี่ยนสถานะพร้อมกัน 2 คำสั่ง → สำเร็จ 1 + ถูกปัด 1 · audit/แจ้งเตือน 1 ชุด (BUG-035)', async () => {
    const caseId = await seedCase('SF-2026-2335', { withDocuments: true })
    await service.changeCaseStatus(actor, caseId, change({ action: 'review' }), { actor, meta })
    const startedAt = new Date()

    const results = await Promise.allSettled([
      service.changeCaseStatus(actor, caseId, change({ action: 'accept', teamId: TEAM_ID }), { actor, meta }),
      service.changeCaseStatus(actor, caseId, change({ action: 'reject', reason: 'ข้อมูลไม่ตรง' }), {
        actor,
        meta,
      }),
    ])
    const fulfilled = results.filter((result) => result.status === 'fulfilled')
    const rejected = results.filter((result): result is PromiseRejectedResult => result.status === 'rejected')
    expect(fulfilled).toHaveLength(1)
    expect(rejected).toHaveLength(1)
    expect(rejected[0]?.reason).toBeInstanceOf(CaseError)
    expect(rejected[0]?.reason).toMatchObject({ code: 'CASE_INVALID_STATUS_TRANSITION' })

    const status = (await caseRow(caseId))?.status
    expect(['approved', 'rejected']).toContain(status)

    const audits = await db().$queryRawUnsafe<Array<{ count: bigint }>>(
      `SELECT COUNT(*) AS count FROM audit_logs
        WHERE target_id = '${caseId}' AND action IN ('approve', 'reject') AND created_at >= $1`,
      startedAt,
    )
    expect(Number(audits[0]?.count)).toBe(1)

    // แจ้งเตือนส่งแบบ detached หลัง commit ⇒ รอให้ลงก่อนแล้วจึงนับ
    const countNotifications = async (): Promise<number> => {
      const rows = await db().$queryRawUnsafe<Array<{ count: bigint }>>(
        `SELECT COUNT(*) AS count FROM notifications
          WHERE user_id = '${USER_ID}' AND event_code IN ('case.approved', 'case.rejected')
            AND body LIKE '%SF-2026-2335%' AND created_at >= $1`,
        startedAt,
      )
      return Number(rows[0]?.count)
    }
    for (let attempt = 0; attempt < 20 && (await countNotifications()) === 0; attempt += 1) {
      await new Promise((resolve) => setTimeout(resolve, 100))
    }
    await new Promise((resolve) => setTimeout(resolve, 200))
    expect(await countNotifications()).toBe(1)
  })

  it('Import dryRun ไม่เขียนอะไรลง DB (preview ก่อนยืนยัน)', async () => {
    const { importCases } = await import('@/lib/cases/import-queries')
    const result = await importCases(
      { financeCompanyId: COMPANY_ID, dryRun: true, rows: [{ 'เลขที่สัญญา': 'SF-2026-2399' }] },
      { actor, meta },
    )
    expect(result.createdCount).toBe(1)
    expect(result.rows[0]?.caseId).toBeNull()

    const rows = await db().$queryRawUnsafe<Array<{ count: bigint }>>(
      `SELECT COUNT(*) AS count FROM cases WHERE organization_id = '${ORG_ID}' AND case_ref_normalized = 'SF-2026-2399'`,
    )
    expect(Number(rows[0]?.count)).toBe(0)
  })
})
