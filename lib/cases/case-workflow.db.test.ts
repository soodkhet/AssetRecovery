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
async function seedCase(caseRef: string, options: { withDocuments: boolean; status?: string }): Promise<string> {
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

  if (options.withDocuments) {
    for (const [index, slot] of ['contract_doc', 'national_id_doc', 'product_photo'].entries()) {
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
   * Final Test ด่าน 4 (Phase 8.3) — scope ระดับแถวคุมแค่ว่า "เห็นเคสไหน"
   * เคสที่เห็นยังพกอัตราค่าบริการที่เราคิดกับบริษัทนั้น + note ภายใน + ชื่อพนักงานหลังบ้านออกไปด้วย
   * (`97` §6.6 "ชื่อ+model เท่านั้น **ไม่แสดงอัตราละเอียด**" · §6.1 ไม่แสดงทีมที่มอบหมาย)
   */
  it('Company User ต้องไม่เห็นอัตราค่าบริการ/ประมาณการ/note ภายใน/ประวัติแก้ไข (`97` §6.6)', async () => {
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
      expect(asGlobal.createdByName).not.toBe('')

      const companyUser: SessionUser = {
        ...actor,
        isSuperadmin: false,
        scope: { kind: 'company', teamIds: [], companyId: COMPANY_ID, userId: USER_ID },
      }
      const detail = await getCase(companyUser, caseId)
      expect(detail.serviceFeeRatePct).toBeNull()
      expect(detail.serviceFeeBaseSatang).toBeNull()
      expect(detail.projectedRevenueSatang).toBeNull()
      expect(detail.projectedRevenueSource).toBeNull()
      expect(detail.reviewNote).toBeNull()
      expect(detail.editHistory).toEqual([])
      expect(detail.assignedTeamId).toBeNull()
      expect(detail.assignedTeamName).toBeNull()
      expect(detail.createdByName).toBe('')
      // model ยังเห็นได้ตาม §6.6 ("ชื่อ+model เท่านั้น")
      expect(detail.serviceFeeModelSnapshot).toBe(asGlobal.serviceFeeModelSnapshot)

      const [listItem] = (await listCases(companyUser, caseListQuerySchema.parse({}))).items
      expect(listItem?.createdByName).toBe('')
      expect(listItem?.assignedTeamName).toBeNull()
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
