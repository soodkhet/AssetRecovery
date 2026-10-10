import { PrismaPg } from '@prisma/adapter-pg'
import { NextRequest } from 'next/server'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import type { SessionUser } from '@/lib/auth/types'
import { AssignmentStatus, CaseStatus, HandoverLotStatus } from '@/lib/generated/prisma/enums'
import { PrismaClient } from '@/lib/generated/prisma/client'

/**
 * เทสต์ระดับ DB ของ Portal-P4 — `GET /api/portal/{dashboard,cases,cases/:id,company-profile,assets/:id/photos/:index}`
 * (`97` §5/§6.1/§6.6/§12/§14/§17/§20 · มติ PO 05/10/2569 U6/O43/O44)
 *
 * route handler จริง + Prisma จริง + `emitAudit` จริง (ตรวจแถว `access_denied`) · mock เฉพาะ session และ Storage
 * ⚠️ ตั้ง `DATABASE_URL = TEST_DATABASE_URL` ก่อน import route (กับดัก 2026-08-14)
 * ⚠️ `audit_logs` ลบไม่ได้ ⇒ ใช้องค์กร fixed + **บริษัทใหม่ทุกครั้งที่รัน** (ข้อมูลรันก่อนไม่ชน)
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
if (!url) console.warn('[portal-api-cases.db.test] ข้ามเทสต์ระดับ DB — ไม่มี TEST_DATABASE_URL')

const getRawSessionUserMock = vi.hoisted(() => vi.fn())
vi.mock('@/lib/auth/session', () => ({ getRawSessionUser: getRawSessionUserMock }))
const downloadUploadedFileMock = vi.hoisted(() => vi.fn())
vi.mock('@/lib/uploads/storage', () => ({ downloadUploadedFile: downloadUploadedFileMock }))

const ORG_ID = '00000000-0000-4000-8000-0000000097a0'
const ROLE_PORTAL = '00000000-0000-4000-8000-0000000097a1'
const ROLE_INTERNAL = '00000000-0000-4000-8000-0000000097a2'
const PORTAL_USER = '00000000-0000-4000-8000-0000000097a3'
const INTERNAL_USER = '00000000-0000-4000-8000-0000000097a4'
const AGENT_USER = '00000000-0000-4000-8000-0000000097a5'
const TEAM_ID = '00000000-0000-4000-8000-0000000097a6'
const RANDOM_ID = '00000000-0000-4000-8000-0000000097ff'

const RUN = `${process.pid}${Date.now() % 100_000}`
const taxIdOf = (n: number): string => `${n}${RUN}`.padEnd(13, '0').slice(0, 13)
const imeiOf = (n: number): string => `9${n}${RUN}`.padEnd(15, '7').slice(0, 15)

/** ค่าภายในที่ seed ลง DB แล้ว **ต้องไม่ปรากฏ** ใน response ใด ๆ */
const SECRET = {
  imei: imeiOf(1),
  nationalId: '1103700012345',
  phone: '0891234567',
  teamName: `ทีมลับ ${RUN}`,
  agentName: `พนักงานลับ ${RUN}`,
  photoPath: `assets/secret-${RUN}/intake/front/k-front.jpg`,
  templateRate: 12.75,
  suspendedReason: `เหตุระงับภายใน ${RUN}`,
}
const FORBIDDEN_KEYS = new Set([
  'imei',
  'imeiContract',
  'imeiActual',
  'serialNo',
  'companyId',
  'organizationId',
  'assignedTeamId',
  'assignedTeam',
  'agentId',
  'reviewedBy',
  'reviewNote',
  'serviceFeeTemplateId',
  'projectedRevenueSource',
  'photos',
  'photoHashes',
  'debtorNationalId',
  'debtorPhoneMobile',
  'createdBy',
  'suspendedReason',
  'status',
])
const RAW_ENUMS = new Set<string>([
  ...Object.values(CaseStatus),
  ...Object.values(AssignmentStatus),
  ...Object.values(HandoverLotStatus),
])

function deepScan(value: unknown, path: string[] = []): void {
  if (Array.isArray(value)) {
    value.forEach((item, index) => deepScan(item, [...path, String(index)]))
    return
  }
  if (value !== null && typeof value === 'object') {
    for (const [key, child] of Object.entries(value)) {
      expect(FORBIDDEN_KEYS.has(key), `คีย์ต้องห้าม ${[...path, key].join('.')}`).toBe(false)
      deepScan(child, [...path, key])
    }
    return
  }
  const where = path.join('.')
  if (typeof value === 'string') {
    for (const secret of [SECRET.imei, SECRET.nationalId, SECRET.phone, SECRET.teamName, SECRET.agentName, SECRET.suspendedReason]) {
      expect(value.includes(secret), `ค่าภายในหลุดที่ ${where}`).toBe(false)
    }
    expect(value.includes('assets/'), `path Storage หลุดที่ ${where}`).toBe(false)
    expect(RAW_ENUMS.has(value), `raw enum "${value}" ที่ ${where}`).toBe(false)
  }
}

// ── ผู้ใช้ (session mock) ──────────────────────────────────────────────────────

const FULL_CAPS = {
  portal_cases: 'view',
  portal_finance: 'view',
  portal_handover: 'view',
  portal_profile: 'view',
  portal_download: 'view',
} as const
/** ค่าเริ่มต้น D1: หัวหน้า = ภาพรวม/เคส + ส่งมอบ + ข้อมูลบริษัท (+ดาวน์โหลด) · แอดมิน = เคส + ข้อมูลบริษัท (+ดาวน์โหลด) */
const HEAD_CAPS = { portal_cases: 'view', portal_handover: 'view', portal_profile: 'view', portal_download: 'view' } as const
const ADMIN_CAPS = { portal_cases: 'view', portal_profile: 'view', portal_download: 'view' } as const

function portalUser(companyId: string, capabilities: SessionUser['capabilities'], roleName = 'ผู้จัดการ'): SessionUser {
  return {
    id: PORTAL_USER,
    organizationId: ORG_ID,
    supabaseUid: 'uid-portal-p4',
    email: 'portal-p4@test.local',
    fullName: 'ผู้ใช้บริษัท P4',
    status: 'active',
    roleId: ROLE_PORTAL,
    roleName,
    roleGroup: 'finance_company',
    isSuperadmin: false,
    teamId: null,
    companyId,
    capabilities,
    scope: { kind: 'company', teamIds: [], companyId, userId: PORTAL_USER },
    loginAt: new Date().toISOString(),
  }
}

const internalUser: SessionUser = {
  ...portalUser('', {}),
  id: INTERNAL_USER,
  roleId: ROLE_INTERNAL,
  roleName: 'การเงิน',
  roleGroup: 'system',
  companyId: null,
  capabilities: { manage_billing: 'manage', portal_cases: 'view' },
  scope: { kind: 'global', teamIds: [], companyId: null, userId: INTERNAL_USER },
}

// ── DB ───────────────────────────────────────────────────────────────────────

let client: PrismaClient | null = null
function db(): PrismaClient {
  if (!url) throw new Error('ไม่มี TEST_DATABASE_URL')
  if (!client) {
    assertLocalTestDatabase(url)
    client = new PrismaClient({ adapter: new PrismaPg({ connectionString: url }) })
  }
  return client
}

type Handler<P> = (request: NextRequest, context: { params: Promise<P> }) => Promise<Response>
let dashboardGET: (request: NextRequest, context: unknown) => Promise<Response>
let casesGET: (request: NextRequest, context: unknown) => Promise<Response>
let caseDetailGET: Handler<{ id: string }>
let profileGET: (request: NextRequest, context: unknown) => Promise<Response>
let photoGET: Handler<{ id: string; index: string }>

let co1 = ''
let co2 = ''
let co3 = ''
const caseIds = { review: '', needInfo: '', tracking: '', recovered: '', bounced: '', other: '' }
const assetIds = { recovered: '', bounced: '', other: '' }

async function insertCompany(n: number, options: { status?: string; templateId?: string } = {}): Promise<string> {
  const rows = await db().$queryRawUnsafe<{ id: string }[]>(`
    INSERT INTO finance_companies (organization_id, name, short_name, tax_id, address, contact_name, contact_phone,
                                   signer_name, service_fee_template_id, status, suspended_reason, created_by)
    VALUES ('${ORG_ID}', 'ไฟแนนซ์ P4-${n} (${RUN})', 'P4${n}', '${taxIdOf(n)}', '1 ถนนพระราม 9 กรุงเทพฯ', 'คุณติดต่อ',
            '021234567', 'คุณผู้ลงนาม', ${options.templateId ? `'${options.templateId}'` : 'NULL'},
            '${options.status ?? 'active'}', ${options.status === 'suspended' ? `$$${SECRET.suspendedReason}$$` : 'NULL'},
            '${INTERNAL_USER}')
    RETURNING id
  `)
  return rows[0]?.id ?? ''
}

interface CaseSeed {
  company: string
  ref: string
  status: string
  reviewNote?: string
  assignment?: string
  approved?: boolean
}

async function insertCase(seed: CaseSeed): Promise<string> {
  const closed = seed.status === 'closed_success' || seed.status === 'closed_fail'
  const fee = seed.approved
    ? `'HYBRID', 50000, 10.50, 'debt_amount', 50000, 150000`
    : 'NULL, NULL, NULL, NULL, NULL, NULL'
  const rows = await db().$queryRawUnsafe<{ id: string }[]>(`
    INSERT INTO cases (organization_id, case_ref, case_ref_normalized, company_id, source, status, created_by,
                       debtor_name, debtor_national_id, debtor_phone_mobile, addr_province, imei, assigned_team_id,
                       review_note, outcome, closed_at,
                       service_fee_model_snapshot, service_fee_base_satang, service_fee_rate_pct,
                       service_fee_basis_snapshot, service_fee_fail_fee_satang, projected_revenue_satang)
    VALUES ('${ORG_ID}', $$${seed.ref}$$, $$${seed.ref.toUpperCase()}$$, '${seed.company}', 'manual', '${seed.status}',
            '${INTERNAL_USER}', $$ลูกหนี้ ${seed.ref}$$, '${SECRET.nationalId}', '${SECRET.phone}', 'เชียงใหม่',
            '${SECRET.imei}', '${TEAM_ID}', ${seed.reviewNote ? `$$${seed.reviewNote}$$` : 'NULL'},
            ${closed ? `'${seed.status}', '2026-09-20T03:00:00Z'` : 'NULL, NULL'}, ${fee})
    RETURNING id
  `)
  const id = rows[0]?.id ?? ''
  if (seed.assignment) {
    await db().$executeRawUnsafe(`
      INSERT INTO case_assignments (organization_id, case_id, agent_id, team_id, status, created_by)
      VALUES ('${ORG_ID}', '${id}', '${AGENT_USER}', '${TEAM_ID}', '${seed.assignment}', '${INTERNAL_USER}')
    `)
  }
  return id
}

async function insertAsset(caseId: string, company: string, n: number, options: { lotId?: string } = {}): Promise<string> {
  const photos = [SECRET.photoPath, `assets/secret-${RUN}/intake/back/k-back-${n}.png`]
  const hashes = JSON.stringify({ [SECRET.photoPath]: { sha256: 'a'.repeat(64), mimeType: 'image/jpeg', sizeBytes: 3 } })
  const rows = await db().$queryRawUnsafe<{ id: string }[]>(`
    INSERT INTO assets (organization_id, case_id, company_id, lot_id, case_ref, debtor_name, device_desc, imei_contract,
                        asset_status, condition, condition_note, photos, photo_hashes, closed_at, received_at, created_by)
    VALUES ('${ORG_ID}', '${caseId}', '${company}', ${options.lotId ? `'${options.lotId}'` : 'NULL'}, 'REF', 'ลูกหนี้',
            'iPhone 15', '${imeiOf(10 + n)}', 'in_custody', 'normal', 'สภาพดี',
            ARRAY[$$${photos[0]}$$, $$${photos[1]}$$]::text[], '${hashes}'::jsonb,
            '2026-09-20T03:00:00Z', '2026-09-21T03:00:00Z', '${INTERNAL_USER}')
    RETURNING id
  `)
  return rows[0]?.id ?? ''
}

function req(path: string): NextRequest {
  return new NextRequest(`http://localhost${path}`)
}

async function json(response: Response): Promise<{ status: number; body: Record<string, unknown> }> {
  return { status: response.status, body: (await response.json()) as Record<string, unknown> }
}

function dataOf<T>(body: Record<string, unknown>): T {
  return body.data as T
}

function codeOf(body: Record<string, unknown>): string | undefined {
  const error = body.error as { code?: string } | undefined
  return error?.code
}

async function deniedAudits(targetId: string): Promise<{ target_type: string; after: Record<string, unknown> }[]> {
  return db().$queryRawUnsafe(
    `SELECT target_type, after_data AS after FROM audit_logs
      WHERE organization_id = '${ORG_ID}' AND action = 'access_denied' AND target_id = '${targetId}'
      ORDER BY created_at`,
  )
}

beforeAll(async () => {
  if (!url) return
  process.env.DATABASE_URL = url
  dashboardGET = (await import('@/app/api/portal/dashboard/route')).GET as typeof dashboardGET
  casesGET = (await import('@/app/api/portal/cases/route')).GET as typeof casesGET
  caseDetailGET = (await import('@/app/api/portal/cases/[id]/route')).GET as Handler<{ id: string }>
  profileGET = (await import('@/app/api/portal/company-profile/route')).GET as typeof profileGET
  photoGET = (await import('@/app/api/portal/assets/[id]/photos/[index]/route')).GET

  const tx = db()
  await tx.$executeRawUnsafe(`
    INSERT INTO organizations (id, name, tax_id, address) VALUES ('${ORG_ID}', 'PortalP4Test', '9999999997400', 'กรุงเทพฯ')
    ON CONFLICT (id) DO NOTHING
  `)
  await tx.$executeRawUnsafe(`
    INSERT INTO roles (id, organization_id, name, role_group, is_seed) VALUES
      ('${ROLE_PORTAL}', '${ORG_ID}', 'ผู้จัดการ P4', 'finance_company', false),
      ('${ROLE_INTERNAL}', '${ORG_ID}', 'การเงิน P4', 'system', false)
    ON CONFLICT (id) DO NOTHING
  `)
  await tx.$executeRawUnsafe(`
    INSERT INTO users (id, organization_id, role_id, email, full_name, status) VALUES
      ('${PORTAL_USER}', '${ORG_ID}', '${ROLE_PORTAL}', 'portal-p4@test.local', 'ผู้ใช้บริษัท P4', 'active'),
      ('${INTERNAL_USER}', '${ORG_ID}', '${ROLE_INTERNAL}', 'internal-p4@test.local', 'การเงิน P4', 'active'),
      ('${AGENT_USER}', '${ORG_ID}', '${ROLE_INTERNAL}', 'agent-p4@test.local', 'พนักงาน P4', 'active')
    ON CONFLICT (id) DO NOTHING
  `)
  await tx.$executeRawUnsafe(`UPDATE users SET full_name = $$${SECRET.agentName}$$ WHERE id = '${AGENT_USER}'`)
  await tx.$executeRawUnsafe(`
    INSERT INTO teams (id, organization_id, name, side, provinces, status, created_by)
    VALUES ('${TEAM_ID}', '${ORG_ID}', 'ทีม P4', 'inhouse', ARRAY['เชียงใหม่'], 'active', '${INTERNAL_USER}')
    ON CONFLICT (id) DO NOTHING
  `)
  await tx.$executeRawUnsafe(`UPDATE teams SET name = $$${SECRET.teamName}$$ WHERE id = '${TEAM_ID}'`)

  const template = await tx.$queryRawUnsafe<{ id: string }[]>(`
    INSERT INTO service_fee_templates (organization_id, name, model, base_satang, rate_pct, basis, version, created_by)
    VALUES ('${ORG_ID}', $$เทมเพลต P4 ${RUN}$$, 'HYBRID', 50000, ${SECRET.templateRate}, 'debt_amount', 3, '${INTERNAL_USER}')
    RETURNING id
  `)
  co1 = await insertCompany(1, { templateId: template[0]?.id })
  co2 = await insertCompany(2)
  co3 = await insertCompany(3, { status: 'suspended' })

  caseIds.review = await insertCase({ company: co1, ref: `P4A-${RUN}-1`, status: 'pending_review' })
  caseIds.needInfo = await insertCase({ company: co1, ref: `P4A-${RUN}-2`, status: 'need_info', reviewNote: 'กรุณาแนบสำเนาบัตร' })
  caseIds.tracking = await insertCase({ company: co1, ref: `P4A-${RUN}-3`, status: 'active', assignment: 'scheduled', approved: true })
  caseIds.recovered = await insertCase({
    company: co1,
    ref: `P4A-${RUN}-4`,
    status: 'closed_success',
    assignment: 'closed_success',
    approved: true,
  })
  caseIds.bounced = await insertCase({
    company: co1,
    ref: `P4A-${RUN}-5`,
    status: 'closed_success',
    assignment: 'needs_revision',
    approved: true,
  })
  caseIds.other = await insertCase({ company: co2, ref: `P4B-${RUN}-1`, status: 'closed_success', assignment: 'closed_success', approved: true })

  assetIds.recovered = await insertAsset(caseIds.recovered, co1, 1)
  assetIds.bounced = await insertAsset(caseIds.bounced, co1, 2)
  assetIds.other = await insertAsset(caseIds.other, co2, 3)

  // การเงิน: draft (ไม่นับ — D9) + sent ค้าง 70,000 สต.
  await tx.$executeRawUnsafe(`
    INSERT INTO billing_batches (organization_id, company_id, period, status, total_satang, received_satang, due_date, created_by)
    VALUES ('${ORG_ID}', '${co1}', 'กันยายน 2569', 'draft', 999900, 0, '2026-10-31', '${INTERNAL_USER}'),
           ('${ORG_ID}', '${co1}', 'สิงหาคม 2569', 'sent', 100000, 30000, '2026-09-30', '${INTERNAL_USER}')
  `)
  // ล็อตรอส่งมอบ 1 ล็อต
  await tx.$executeRawUnsafe(`
    INSERT INTO handover_lots (organization_id, company_id, lot_number, doc_ref, type, status, created_by)
    VALUES ('${ORG_ID}', '${co1}', 'LOT-P4-${RUN}', 'DLV-P4-${RUN}', 'finance_pickup', 'pending_attach', '${INTERNAL_USER}')
  `)
})

beforeEach(() => {
  getRawSessionUserMock.mockReset()
  downloadUploadedFileMock.mockReset()
})

afterAll(async () => {
  await client?.$disconnect()
})

interface CaseItem {
  id: string
  caseRef: string
  statusDisplay: { code: string; label: string }
  statusReason: string | null
}

suite('Portal-P4 — GET /api/portal/cases (`97` §6.1)', () => {
  it('ผู้ใช้ CO1 เห็นเฉพาะเคสของ CO1 + สถานะเป็นรหัสฝั่งบริษัท (ไม่มี raw enum/ฟิลด์ภายใน)', async () => {
    getRawSessionUserMock.mockResolvedValue(portalUser(co1, FULL_CAPS))
    const { status, body } = await json(await casesGET(req('/api/portal/cases?limit=100'), {}))
    expect(status).toBe(200)
    const data = dataOf<{ items: CaseItem[]; total: number }>(body)
    expect(data.total).toBe(5)
    expect(data.items.map((item) => item.id).sort()).toEqual(
      [caseIds.review, caseIds.needInfo, caseIds.tracking, caseIds.recovered, caseIds.bounced].sort(),
    )
    expect(data.items.some((item) => item.id === caseIds.other)).toBe(false)
    deepScan(body)
  })

  it('กรองด้วย status_display — เคสถูกตีกลับ (needs_revision) นับเป็น "กำลังดำเนินการติดตาม"', async () => {
    getRawSessionUserMock.mockResolvedValue(portalUser(co1, FULL_CAPS))
    const tracking = dataOf<{ items: CaseItem[] }>((await json(await casesGET(req('/api/portal/cases?status=tracking'), {}))).body)
    expect(tracking.items.map((item) => item.id).sort()).toEqual([caseIds.tracking, caseIds.bounced].sort())
    const recovered = dataOf<{ items: CaseItem[] }>((await json(await casesGET(req('/api/portal/cases?status=recovered'), {}))).body)
    expect(recovered.items.map((item) => item.id)).toEqual([caseIds.recovered])
  })

  it('need_info แสดง "ขอข้อมูลเพิ่มเติม" พร้อมเหตุผล (`97` §20) · ค้นหาด้วยเลขสัญญา · แบ่งหน้า', async () => {
    getRawSessionUserMock.mockResolvedValue(portalUser(co1, FULL_CAPS))
    const found = dataOf<{ items: CaseItem[]; total: number }>(
      (await json(await casesGET(req(`/api/portal/cases?search=p4a-${RUN}-2`), {}))).body,
    )
    expect(found.total).toBe(1)
    expect(found.items[0]?.statusDisplay).toMatchObject({ code: 'info_requested', label: 'ขอข้อมูลเพิ่มเติม' })
    expect(found.items[0]?.statusReason).toBe('กรุณาแนบสำเนาบัตร')

    const page2 = dataOf<{ items: CaseItem[]; total: number; page: number }>(
      (await json(await casesGET(req('/api/portal/cases?limit=2&page=2'), {}))).body,
    )
    expect(page2).toMatchObject({ total: 5, page: 2 })
    expect(page2.items).toHaveLength(2)
  })

  it('ตัวกรองรับเฉพาะรหัสฝั่งบริษัท — raw enum → 400', async () => {
    getRawSessionUserMock.mockResolvedValue(portalUser(co1, FULL_CAPS))
    const response = await casesGET(req('/api/portal/cases?status=closed_success'), {})
    expect(response.status).toBe(400)
  })
})

suite('Portal-P4 — GET /api/portal/cases/:id (`97` §6.1/§6.6 v4.1 · §12 · §20)', () => {
  const call = (id: string): Promise<Response> =>
    caseDetailGET(req(`/api/portal/cases/${id}`), { params: Promise.resolve({ id }) })

  it('เคสติดตามสำเร็จของตัวเอง → ค่าบริการ snapshot ครบ + จำนวนรูปทรัพย์ (ไม่มี path)', async () => {
    getRawSessionUserMock.mockResolvedValue(portalUser(co1, FULL_CAPS))
    const { status, body } = await json(await call(caseIds.recovered))
    expect(status).toBe(200)
    const dto = dataOf<Record<string, unknown>>(body)
    expect(dto.statusDisplay).toMatchObject({ code: 'recovered' })
    expect(dto.serviceFee).toMatchObject({
      model: 'HYBRID',
      ratePct: 10.5,
      baseSatang: 50000,
      basis: 'debt_amount',
      failFeeSatang: 50000,
      projectedRevenueSatang: 150000,
    })
    // staging E-073 — ป้าย VAT ภาษาไทยตามโหมดปัจจุบันของบริษัท (ไม่ส่ง enum)
    expect(['ก่อน VAT', 'รวม VAT แล้ว', 'ไม่มี VAT']).toContain((dto.serviceFee as { vatLabel: string }).vatLabel)
    expect(dto.assetPhotos).toMatchObject({ assetId: assetIds.recovered, photoCount: 2, condition: 'normal' })
    deepScan(body)
  })

  it('เคสถูกตีกลับ → ไม่ส่งรูปทรัพย์ (เฉพาะ "ติดตามสำเร็จ") · เคสยังไม่อนุมัติ → serviceFee = null', async () => {
    getRawSessionUserMock.mockResolvedValue(portalUser(co1, FULL_CAPS))
    const bounced = dataOf<Record<string, unknown>>((await json(await call(caseIds.bounced))).body)
    expect(bounced.assetPhotos).toBeNull()
    const review = dataOf<Record<string, unknown>>((await json(await call(caseIds.review))).body)
    expect(review.serviceFee).toBeNull()
  })

  it('id ของ CO2 → 403 PERMISSION_DENIED + audit access_denied (cause cross_company)', async () => {
    getRawSessionUserMock.mockResolvedValue(portalUser(co1, FULL_CAPS))
    const { status, body } = await json(await call(caseIds.other))
    expect(status).toBe(403)
    expect(codeOf(body)).toBe('PERMISSION_DENIED')
    expect(JSON.stringify(body)).not.toContain(`P4B-${RUN}`)
    const audits = await deniedAudits(caseIds.other)
    expect(audits.at(-1)).toMatchObject({ target_type: 'cases', after: { cause: 'cross_company', section: 'cases' } })
  })

  it('uuid สุ่ม → 403 เหมือนกัน (ไม่ใช่ 404) + audit cause row_not_found · id ไม่ใช่ uuid → 403', async () => {
    getRawSessionUserMock.mockResolvedValue(portalUser(co1, FULL_CAPS))
    const random = await json(await call(RANDOM_ID))
    const cross = await json(await call(caseIds.other))
    expect(random.status).toBe(403)
    expect(random.body).toEqual(cross.body)
    expect((await deniedAudits(RANDOM_ID)).at(-1)?.after).toMatchObject({ cause: 'row_not_found' })
    expect((await call('not-a-uuid')).status).toBe(403)
  })
})

suite('Portal-P4 — GET /api/portal/dashboard (`97` §5 · D1/D9/D12)', () => {
  it('ผู้จัดการ → การ์ดครบ 4 ใบ · ยอดค้างนับเฉพาะ batch sent ขึ้นไป (draft ไม่รั่ว)', async () => {
    getRawSessionUserMock.mockResolvedValue(portalUser(co1, FULL_CAPS))
    const { status, body } = await json(await dashboardGET(req('/api/portal/dashboard'), {}))
    expect(status).toBe(200)
    expect(dataOf(body)).toEqual({
      inProgressCases: { count: 2 },
      arOutstanding: { outstandingSatang: 70000 },
      latestTaxInvoice: null,
      pendingLots: { count: 1 },
    })
  })

  it('หัวหน้า (ค่าเริ่มต้น) → ไม่มีคีย์ KPI การเงินเลย', async () => {
    getRawSessionUserMock.mockResolvedValue(portalUser(co1, HEAD_CAPS, 'หัวหน้า'))
    const data = dataOf<Record<string, unknown>>((await json(await dashboardGET(req('/api/portal/dashboard'), {}))).body)
    expect(Object.keys(data).sort()).toEqual(['inProgressCases', 'pendingLots'])
  })

  it('แอดมิน (ค่าเริ่มต้น P1) → เรียกได้ เห็นเฉพาะการ์ดเคส', async () => {
    getRawSessionUserMock.mockResolvedValue(portalUser(co1, ADMIN_CAPS, 'แอดมิน'))
    const { status, body } = await json(await dashboardGET(req('/api/portal/dashboard'), {}))
    expect(status).toBe(200)
    expect(dataOf(body)).toEqual({ inProgressCases: { count: 2 } })
  })

  it('ผู้ใช้ภายใน (แม้ถือ portal_cases) → 403 · บริษัท suspended → 403 COMPANY_SUSPENDED', async () => {
    getRawSessionUserMock.mockResolvedValue(internalUser)
    const internal = await json(await dashboardGET(req('/api/portal/dashboard'), {}))
    expect(internal.status).toBe(403)
    expect(codeOf(internal.body)).toBe('PERMISSION_DENIED')

    getRawSessionUserMock.mockResolvedValue(portalUser(co3, FULL_CAPS))
    const suspended = await json(await dashboardGET(req('/api/portal/dashboard'), {}))
    expect(suspended.status).toBe(403)
    expect(codeOf(suspended.body)).toBe('COMPANY_SUSPENDED')
    expect(JSON.stringify(suspended.body)).not.toContain(SECRET.suspendedReason)
  })

  it('ไม่มี session → 401', async () => {
    getRawSessionUserMock.mockResolvedValue(null)
    expect((await dashboardGET(req('/api/portal/dashboard'), {})).status).toBe(401)
  })
})

suite('Portal-P4 — GET /api/portal/company-profile (`97` §6.6 · O44)', () => {
  it('ข้อมูลบริษัทตัวเอง + template ชื่อ/model เท่านั้น (ไม่มีอัตรา)', async () => {
    getRawSessionUserMock.mockResolvedValue(portalUser(co1, ADMIN_CAPS, 'แอดมิน'))
    const { status, body } = await json(await profileGET(req('/api/portal/company-profile'), {}))
    expect(status).toBe(200)
    const dto = dataOf<Record<string, unknown>>(body)
    expect(dto).toMatchObject({
      name: `ไฟแนนซ์ P4-1 (${RUN})`,
      taxId: taxIdOf(1),
      // มติ PO U77 — บริษัทเดิม (ไม่ได้ตั้งสาขา) = สำนักงานใหญ่
      branchLabel: 'สำนักงานใหญ่',
      signerName: 'คุณผู้ลงนาม',
      serviceFeeTemplate: { name: `เทมเพลต P4 ${RUN}`, model: 'HYBRID' },
    })
    expect(JSON.stringify(body)).not.toContain(String(SECRET.templateRate))
    deepScan(body)
  })

  it('ไม่มี portal_profile → 403', async () => {
    getRawSessionUserMock.mockResolvedValue(portalUser(co1, { portal_cases: 'view' }))
    expect((await profileGET(req('/api/portal/company-profile'), {})).status).toBe(403)
  })
})

suite('Portal-P4 — GET /api/portal/assets/:id/photos/:index (D6)', () => {
  const call = (id: string, index: string): Promise<Response> =>
    photoGET(req(`/api/portal/assets/${id}/photos/${index}`), { params: Promise.resolve({ id, index }) })

  it('เคสติดตามสำเร็จของตัวเอง → stream รูป (ชนิดไฟล์จากที่ server ตรวจไว้) ไม่เผย path', async () => {
    getRawSessionUserMock.mockResolvedValue(portalUser(co1, FULL_CAPS))
    downloadUploadedFileMock.mockResolvedValue(new Uint8Array([1, 2, 3]))
    const response = await call(assetIds.recovered, '0')
    expect(response.status).toBe(200)
    expect(response.headers.get('content-type')).toBe('image/jpeg')
    expect(new Uint8Array(await response.arrayBuffer())).toEqual(new Uint8Array([1, 2, 3]))
    expect(downloadUploadedFileMock).toHaveBeenCalledWith(SECRET.photoPath)
    for (const value of response.headers.values()) expect(value).not.toContain('assets/')
  })

  it('แอดมิน (หมวดเคส + ดาวน์โหลด ไม่มีหมวดส่งมอบ) เปิดรูปเคสติดตามสำเร็จได้ · รูปที่ 2 เดาชนิดจากนามสกุล', async () => {
    getRawSessionUserMock.mockResolvedValue(portalUser(co1, ADMIN_CAPS, 'แอดมิน'))
    downloadUploadedFileMock.mockResolvedValue(new Uint8Array([9]))
    const response = await call(assetIds.recovered, '1')
    expect(response.status).toBe(200)
    expect(response.headers.get('content-type')).toBe('image/png')
  })

  it('เคสที่ยังไม่ติดตามสำเร็จ (ถูกตีกลับ) → 403 + audit cause asset_not_viewable · ไม่อ่าน Storage', async () => {
    getRawSessionUserMock.mockResolvedValue(portalUser(co1, FULL_CAPS))
    const { status, body } = await json(await call(assetIds.bounced, '0'))
    expect(status).toBe(403)
    expect(codeOf(body)).toBe('PERMISSION_DENIED')
    expect((await deniedAudits(assetIds.bounced)).at(-1)?.after).toMatchObject({ cause: 'asset_not_viewable', download: true })
    expect(downloadUploadedFileMock).not.toHaveBeenCalled()
  })

  it('ทรัพย์ของ CO2 / id สุ่ม → 403 เดียวกัน + audit', async () => {
    getRawSessionUserMock.mockResolvedValue(portalUser(co1, FULL_CAPS))
    const cross = await json(await call(assetIds.other, '0'))
    const random = await json(await call(RANDOM_ID, '0'))
    expect(cross.status).toBe(403)
    expect(random.body).toEqual(cross.body)
    expect((await deniedAudits(assetIds.other)).at(-1)?.after).toMatchObject({ cause: 'cross_company' })
    expect(downloadUploadedFileMock).not.toHaveBeenCalled()
  })

  it('index นอกช่วง/ไม่ใช่ตัวเลข → 404 ASSET_NOT_FOUND (ทรัพย์เป็นของตัวเองแล้ว) · ไฟล์หายใน Storage → UPLOAD_FILE_NOT_FOUND', async () => {
    getRawSessionUserMock.mockResolvedValue(portalUser(co1, FULL_CAPS))
    for (const index of ['2', '-1', 'x', '1.5']) {
      const { status, body } = await json(await call(assetIds.recovered, index))
      expect(status).toBe(404)
      expect(codeOf(body)).toBe('ASSET_NOT_FOUND')
    }
    downloadUploadedFileMock.mockResolvedValue(null)
    expect(codeOf((await json(await call(assetIds.recovered, '0'))).body)).toBe('UPLOAD_FILE_NOT_FOUND')
  })

  it('ไม่มี portal_download → 403 (ไม่แตะแถว)', async () => {
    getRawSessionUserMock.mockResolvedValue(portalUser(co1, { portal_cases: 'view', portal_handover: 'view' }))
    const { status, body } = await json(await call(assetIds.recovered, '0'))
    expect(status).toBe(403)
    expect(codeOf(body)).toBe('PERMISSION_DENIED')
  })
})
