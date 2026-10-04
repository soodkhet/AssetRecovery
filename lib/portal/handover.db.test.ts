import { PrismaPg } from '@prisma/adapter-pg'
import { NextRequest } from 'next/server'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { COMPANY_ADMIN_ROLE_NAME, COMPANY_MANAGER_ROLE_NAME, COMPANY_SUPERVISOR_ROLE_NAME } from '@/lib/auth/constants'
import type { SessionUser } from '@/lib/auth/types'
import { PrismaClient } from '@/lib/generated/prisma/client'
import type { CapabilityAccessLevel } from '@/lib/generated/prisma/enums'
import { DEFAULT_ROLE_CAPABILITIES } from '@/lib/roles/default-matrix'
import { putFakeUpload, resetFakeUploads } from '@/tests/helpers/fake-uploads'

/**
 * Portal-P6 — API ส่งมอบของพอร์ทัล (`97` §6.4 · §10.2 · §17 · §18 · §20 · มติ PO 05/10/2569 U6/O43 D3/D4/D6/D8 · O44)
 * ยิง route handler จริง + Postgres ทดสอบ · session ถูก mock (ไม่ยิง Supabase) · Storage ถูก mock (Rule 07)
 */

const getRawSessionUserMock = vi.hoisted(() => vi.fn())
vi.mock('@/lib/auth/session', () => ({ getRawSessionUser: getRawSessionUserMock }))
vi.mock('@/lib/uploads/storage', async () => (await import('@/tests/helpers/fake-uploads')).fakeStorageModule())

const url = process.env.TEST_DATABASE_URL

function assertLocalTestDatabase(connectionString: string): void {
  const parsed = new URL(connectionString)
  const isLocal = ['localhost', '127.0.0.1', '::1', 'postgres'].includes(parsed.hostname)
  if (!isLocal || !parsed.pathname.includes('test')) {
    throw new Error(`TEST_DATABASE_URL ต้องเป็น DB ทดสอบบนเครื่อง/CI เท่านั้น (host=${parsed.hostname}) — Rule 07`)
  }
}

const suite = url ? describe : describe.skip
if (!url) console.warn('[portal handover.db.test] ข้ามเทสต์ระดับ DB — ไม่มี TEST_DATABASE_URL')

const ORG_ID = '00000000-0000-4000-8000-0000000976a0'
const ROLE_INTERNAL = '00000000-0000-4000-8000-0000000976a1'
const ROLE_CO_MANAGER = '00000000-0000-4000-8000-0000000976a2'
const ROLE_CO_ADMIN = '00000000-0000-4000-8000-0000000976a3'
const INTERNAL_ID = '00000000-0000-4000-8000-0000000976b0'
const CO1_MANAGER_ID = '00000000-0000-4000-8000-0000000976b1'
const CO1_ADMIN_ID = '00000000-0000-4000-8000-0000000976b2'
const CO1_SUPERVISOR_ID = '00000000-0000-4000-8000-0000000976b3'
const CO1 = '00000000-0000-4000-8000-0000000976c1'
const CO2 = '00000000-0000-4000-8000-0000000976c2'
const RANDOM_ID = '00000000-0000-4000-8000-0000000976ff'

const IMEI_CO1 = '356938035643809'
const SERIAL_CO1 = 'SN-P6-SECRET-001'
const SIGNED_PATH = 'handover-lots/p6-confirmed/signed-doc/v1.pdf'
const SIGNED_BYTES = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x37])

let client: PrismaClient | null = null

function db(): PrismaClient {
  if (!url) throw new Error('ไม่มี TEST_DATABASE_URL')
  if (!client) {
    assertLocalTestDatabase(url)
    client = new PrismaClient({ adapter: new PrismaPg({ connectionString: url }) })
  }
  return client
}

/** capability ค่าเริ่มต้นของ role บริษัทตาม P1 (มติ O43 D1) — ไม่ hardcode เอง */
function defaultCapabilities(roleName: string): Record<string, CapabilityAccessLevel> {
  return Object.fromEntries(
    DEFAULT_ROLE_CAPABILITIES.filter(
      (grant) => grant.role.roleGroup === 'finance_company' && grant.role.name === roleName,
    ).map((grant) => [grant.capabilityCode, grant.level]),
  )
}

function companyUser(id: string, roleName: string, roleId: string, companyId = CO1): SessionUser {
  return {
    id,
    organizationId: ORG_ID,
    supabaseUid: `uid-${id}`,
    email: `${id}@test.local`,
    fullName: `ผู้ใช้ ${roleName}`,
    status: 'active',
    roleId,
    roleName,
    roleGroup: 'finance_company',
    isSuperadmin: false,
    teamId: null,
    companyId,
    capabilities: defaultCapabilities(roleName),
    scope: { kind: 'company', teamIds: [], companyId, userId: id },
    loginAt: new Date().toISOString(),
  }
}

const co1Manager = companyUser(CO1_MANAGER_ID, COMPANY_MANAGER_ROLE_NAME, ROLE_CO_MANAGER)
const co1Supervisor = companyUser(CO1_SUPERVISOR_ID, COMPANY_SUPERVISOR_ROLE_NAME, ROLE_CO_MANAGER)
const co1Admin = companyUser(CO1_ADMIN_ID, COMPANY_ADMIN_ROLE_NAME, ROLE_CO_ADMIN)
const internal: SessionUser = {
  ...companyUser(INTERNAL_ID, 'ธุรการ', ROLE_INTERNAL),
  roleGroup: 'system',
  companyId: null,
  capabilities: { view_warehouse: 'manage', portal_handover: 'view', portal_download: 'view' },
  scope: { kind: 'global', teamIds: [], companyId: null, userId: INTERNAL_ID },
}

type ListRoute = typeof import('@/app/api/portal/handover-lots/route')
type DetailRoute = typeof import('@/app/api/portal/handover-lots/[id]/route')
type DownloadRoute = typeof import('@/app/api/portal/handover-lots/[id]/download/route')
let listRoute: ListRoute
let detailRoute: DetailRoute
let downloadRoute: DownloadRoute

const lots: Record<'co1Pending' | 'co1Dispatched' | 'co1Confirmed' | 'co2Confirmed', string> = {
  co1Pending: '',
  co1Dispatched: '',
  co1Confirmed: '',
  co2Confirmed: '',
}

function req(path: string): NextRequest {
  return new NextRequest(`http://localhost${path}`)
}

const params = (id: string) => ({ params: Promise.resolve({ id }) })

async function json(response: Response): Promise<{ data?: unknown; error?: { code?: string } } & Record<string, unknown>> {
  return (await response.json()) as { data?: unknown; error?: { code?: string } }
}

async function errorCode(response: Response): Promise<string | undefined> {
  const body = await json(response)
  return body.error?.code ?? (body as { code?: string }).code
}

let testStartedAt = new Date()

async function deniedAudits(actorId: string): Promise<Array<{ targetType: string; targetId: string | null; afterData: unknown }>> {
  return db().auditLog.findMany({
    where: { organizationId: ORG_ID, actorId, action: 'access_denied', createdAt: { gte: testStartedAt } },
    select: { targetType: true, targetId: true, afterData: true },
    orderBy: { createdAt: 'asc' },
  })
}

async function cleanup(): Promise<void> {
  const tx = db()
  await tx.$executeRawUnsafe(`ALTER TABLE handover_lots DISABLE TRIGGER trg_handover_lots_confirmed_no_delete`)
  try {
    await tx.$executeRawUnsafe(`DELETE FROM assets WHERE organization_id = '${ORG_ID}'`)
    await tx.$executeRawUnsafe(`DELETE FROM handover_lots WHERE organization_id = '${ORG_ID}'`)
    await tx.$executeRawUnsafe(`DELETE FROM cases WHERE organization_id = '${ORG_ID}'`)
  } finally {
    await tx.$executeRawUnsafe(`ALTER TABLE handover_lots ENABLE TRIGGER trg_handover_lots_confirmed_no_delete`)
  }
}

async function insertCase(caseRef: string, companyId: string): Promise<string> {
  const rows = await db().$queryRawUnsafe<{ id: string }[]>(`
    INSERT INTO cases (organization_id, case_ref, case_ref_normalized, company_id, source, status, created_by,
                       debtor_name, addr_province, addr_district, asset_kind, asset_description, debt_amount_satang,
                       outcome, closed_at)
    VALUES ('${ORG_ID}', '${caseRef}', '${caseRef}', '${companyId}', 'manual', 'closed_success', '${INTERNAL_ID}',
            'ลูกหนี้ ${caseRef}', 'เชียงใหม่', 'เมือง', 'smartphone', 'iPhone 15', 1000000,
            'closed_success', '2026-09-01T03:00:00Z')
    RETURNING id`)
  return rows[0]?.id ?? ''
}

async function insertLot(
  suffix: string,
  companyId: string,
  status: 'pending_attach' | 'pending_delivery_proof' | 'confirmed',
  createdAt: string,
  signedDocUrl: string | null,
): Promise<string> {
  const confirmed = status === 'confirmed'
  const rows = await db().$queryRawUnsafe<{ id: string }[]>(`
    INSERT INTO handover_lots (organization_id, company_id, lot_number, doc_ref, type, status, signed_doc_url,
                               confirmed_at, confirmed_by, created_by, created_at)
    VALUES ('${ORG_ID}', '${companyId}', 'LOT-2569-97${suffix}', 'DLV-2569-97${suffix}', 'we_deliver', '${status}',
            ${signedDocUrl === null ? 'NULL' : `'${signedDocUrl}'`},
            ${confirmed ? `'${createdAt}'` : 'NULL'}, ${confirmed ? `'${INTERNAL_ID}'` : 'NULL'},
            '${INTERNAL_ID}', '${createdAt}')
    RETURNING id`)
  return rows[0]?.id ?? ''
}

async function insertAsset(lotId: string, companyId: string, seq: number, imei: string, serial: string): Promise<void> {
  const caseRef = `P6-ASSET-${seq}`
  const caseId = await insertCase(caseRef, companyId)
  await db().$executeRawUnsafe(`
    INSERT INTO assets (organization_id, case_id, company_id, lot_id, case_ref, debtor_name, device_desc,
                        imei_contract, imei_actual, serial_contract, serial_actual, asset_status, condition,
                        photos, closed_at, created_by)
    VALUES ('${ORG_ID}', '${caseId}', '${companyId}', '${lotId}', '${caseRef}', 'ลูกหนี้ ${seq}', 'iPhone 15 Pro',
            '${imei}', '${imei}', '${serial}', '${serial}', 'handed_over', 'normal',
            ARRAY['handover/p6/${seq}-1.jpg','handover/p6/${seq}-2.jpg'], '2026-09-01T03:00:00Z', '${INTERNAL_ID}')`)
}

beforeAll(async () => {
  if (!url) return
  process.env.DATABASE_URL = url
  listRoute = await import('@/app/api/portal/handover-lots/route')
  detailRoute = await import('@/app/api/portal/handover-lots/[id]/route')
  downloadRoute = await import('@/app/api/portal/handover-lots/[id]/download/route')

  const tx = db()
  await tx.$executeRawUnsafe(`
    INSERT INTO organizations (id, name, tax_id, address)
    VALUES ('${ORG_ID}', 'PortalP6Test', '9999999997600', 'ที่อยู่ทดสอบ P6') ON CONFLICT (id) DO NOTHING`)
  await tx.$executeRawUnsafe(`
    INSERT INTO roles (id, organization_id, name, role_group, is_seed) VALUES
      ('${ROLE_INTERNAL}', '${ORG_ID}', 'ธุรการ P6', 'system', false),
      ('${ROLE_CO_MANAGER}', '${ORG_ID}', 'ผู้จัดการ P6', 'finance_company', false),
      ('${ROLE_CO_ADMIN}', '${ORG_ID}', 'แอดมิน P6', 'finance_company', false)
    ON CONFLICT (id) DO NOTHING`)
  await tx.$executeRawUnsafe(`
    INSERT INTO users (id, organization_id, role_id, email, full_name, status) VALUES
      ('${INTERNAL_ID}', '${ORG_ID}', '${ROLE_INTERNAL}', 'internal-p6@test.local', 'ธุรการ P6', 'active')
    ON CONFLICT (id) DO NOTHING`)
  await tx.$executeRawUnsafe(`
    INSERT INTO finance_companies (id, organization_id, name, short_name, tax_id, vat_mode, payment_due_days, created_by)
    VALUES
      ('${CO1}', '${ORG_ID}', 'ไฟแนนซ์ 1 P6', 'CO1P6', '0105512976001', 'exclude_vat', 30, '${INTERNAL_ID}'),
      ('${CO2}', '${ORG_ID}', 'ไฟแนนซ์ 2 P6', 'CO2P6', '0105512976002', 'exclude_vat', 30, '${INTERNAL_ID}')
    ON CONFLICT (id) DO NOTHING`)
  await tx.$executeRawUnsafe(`UPDATE finance_companies SET status = 'active' WHERE id IN ('${CO1}', '${CO2}')`)
  await tx.$executeRawUnsafe(`
    INSERT INTO users (id, organization_id, role_id, email, full_name, status, company_id) VALUES
      ('${CO1_MANAGER_ID}', '${ORG_ID}', '${ROLE_CO_MANAGER}', 'co1-manager-p6@test.local', 'ผู้จัดการ CO1', 'active', '${CO1}'),
      ('${CO1_SUPERVISOR_ID}', '${ORG_ID}', '${ROLE_CO_MANAGER}', 'co1-sup-p6@test.local', 'หัวหน้า CO1', 'active', '${CO1}'),
      ('${CO1_ADMIN_ID}', '${ORG_ID}', '${ROLE_CO_ADMIN}', 'co1-admin-p6@test.local', 'แอดมิน CO1', 'active', '${CO1}')
    ON CONFLICT (id) DO NOTHING`)

  await cleanup()
  lots.co1Pending = await insertLot('001', CO1, 'pending_attach', '2026-09-02T03:00:00Z', null)
  lots.co1Dispatched = await insertLot('002', CO1, 'pending_delivery_proof', '2026-09-10T03:00:00Z', SIGNED_PATH)
  lots.co1Confirmed = await insertLot('003', CO1, 'confirmed', '2026-09-20T03:00:00Z', SIGNED_PATH)
  lots.co2Confirmed = await insertLot('004', CO2, 'confirmed', '2026-09-21T03:00:00Z', SIGNED_PATH)
  await insertAsset(lots.co1Confirmed, CO1, 1, IMEI_CO1, SERIAL_CO1)
  await insertAsset(lots.co1Confirmed, CO1, 2, '356938035643817', 'SN-P6-SECRET-002')
  await insertAsset(lots.co2Confirmed, CO2, 3, '356938035643825', 'SN-P6-SECRET-003')
})

afterAll(async () => {
  if (!url) return
  await cleanup()
  await client?.$disconnect()
})

beforeEach(() => {
  testStartedAt = new Date(Date.now() - 1000)
  getRawSessionUserMock.mockReset()
  resetFakeUploads()
  putFakeUpload(SIGNED_PATH, SIGNED_BYTES)
})

suite('GET /api/portal/handover-lots — list', () => {
  it('CO1 เห็นเฉพาะล็อตของ CO1 พร้อมสถานะที่ map แล้ว (ไม่ส่ง enum ภายใน)', async () => {
    getRawSessionUserMock.mockResolvedValue(co1Manager)
    const response = await listRoute.GET(req('/api/portal/handover-lots'), undefined)
    expect(response.status).toBe(200)
    const data = (await json(response)).data as { items: Array<Record<string, unknown>>; total: number }
    expect(data.total).toBe(3)
    expect(data.items.map((item) => item.id).sort()).toEqual([lots.co1Pending, lots.co1Dispatched, lots.co1Confirmed].sort())
    const confirmed = data.items.find((item) => item.id === lots.co1Confirmed)
    expect(confirmed).toMatchObject({ assetCount: 2, downloadable: true, statusDisplay: { code: 'delivered' } })
    expect(data.items.find((item) => item.id === lots.co1Pending)).toMatchObject({ downloadable: false })
    expect(JSON.stringify(data)).not.toContain('pending_attach')
    expect(JSON.stringify(data)).not.toContain(CO2)
  })

  it('กรองสถานะด้วยรหัสของพอร์ทัล + ช่วงวันที่ + แบ่งหน้า', async () => {
    getRawSessionUserMock.mockResolvedValue(co1Manager)
    const byStatus = (await json(await listRoute.GET(req('/api/portal/handover-lots?status=awaiting_dispatch,delivered'), undefined)))
      .data as { items: Array<{ id: string }> }
    expect(byStatus.items.map((item) => item.id).sort()).toEqual([lots.co1Pending, lots.co1Confirmed].sort())

    const byDate = (await json(await listRoute.GET(req('/api/portal/handover-lots?dateFrom=2026-09-05&dateTo=2026-09-15'), undefined)))
      .data as { items: Array<{ id: string }> }
    expect(byDate.items.map((item) => item.id)).toEqual([lots.co1Dispatched])

    const paged = (await json(await listRoute.GET(req('/api/portal/handover-lots?page=2&limit=2'), undefined))).data as {
      items: Array<{ id: string }>
      total: number
    }
    expect(paged.total).toBe(3)
    expect(paged.items.map((item) => item.id)).toEqual([lots.co1Pending]) // ใหม่สุดก่อน ⇒ หน้า 2 = เก่าสุด
  })

  it('สถานะภายใน (raw enum) ใน query → 400', async () => {
    getRawSessionUserMock.mockResolvedValue(co1Manager)
    const response = await listRoute.GET(req('/api/portal/handover-lots?status=confirmed'), undefined)
    expect(response.status).toBe(400)
  })

  it('§20 สิทธิ์ตามหมวด — แอดมินบริษัท (ไม่มี portal_handover ตามค่าเริ่มต้น) → 403 + audit', async () => {
    expect(co1Admin.capabilities.portal_handover).toBeUndefined()
    getRawSessionUserMock.mockResolvedValue(co1Admin)
    const response = await listRoute.GET(req('/api/portal/handover-lots'), undefined)
    expect(response.status).toBe(403)
    expect(await errorCode(response)).toBe('PERMISSION_DENIED')
    const audits = await deniedAudits(CO1_ADMIN_ID)
    expect(audits.at(-1)).toMatchObject({ targetType: 'portal', afterData: expect.objectContaining({ section: 'handover' }) })
  })

  it('ผู้ใช้ภายใน (ถึงถือ portal_handover) → 403 (D2)', async () => {
    getRawSessionUserMock.mockResolvedValue(internal)
    const response = await listRoute.GET(req('/api/portal/handover-lots'), undefined)
    expect(response.status).toBe(403)
    expect(await errorCode(response)).toBe('PERMISSION_DENIED')
  })
})

suite('GET /api/portal/handover-lots/:id — detail (D6)', () => {
  it('ล็อตของตัวเอง → รายการทรัพย์ ไม่มี IMEI/serial ทุกระดับ (O44 deep-scan)', async () => {
    getRawSessionUserMock.mockResolvedValue(co1Supervisor)
    const response = await detailRoute.GET(req(`/api/portal/handover-lots/${lots.co1Confirmed}`), params(lots.co1Confirmed))
    expect(response.status).toBe(200)
    const body = await json(response)
    const data = body.data as { assets: Array<Record<string, unknown>>; statusDisplay: { code: string } }
    expect(data.statusDisplay.code).toBe('delivered')
    expect(data.assets).toHaveLength(2)
    expect(data.assets[0]).toMatchObject({ caseRef: 'P6-ASSET-1', photoCount: 2, conditionLabel: expect.any(String) })

    const raw = JSON.stringify(body)
    expect(raw).not.toContain(IMEI_CO1)
    expect(raw).not.toContain(SERIAL_CO1)
    expect(raw).not.toContain('handover/p6/') // ไม่ส่ง path รูปใน bucket
    const keys: string[] = []
    const walk = (value: unknown): void => {
      if (Array.isArray(value)) value.forEach(walk)
      else if (value !== null && typeof value === 'object') {
        for (const [key, child] of Object.entries(value)) {
          keys.push(key)
          walk(child)
        }
      }
    }
    walk(body)
    expect(keys.filter((key) => /imei|serial/i.test(key))).toEqual([])
  })

  it('§20 cross-company — id ล็อต CO2 → 403 PERMISSION_DENIED + audit access_denied (cross_company)', async () => {
    getRawSessionUserMock.mockResolvedValue(co1Manager)
    const response = await detailRoute.GET(req(`/api/portal/handover-lots/${lots.co2Confirmed}`), params(lots.co2Confirmed))
    expect(response.status).toBe(403)
    expect(await errorCode(response)).toBe('PERMISSION_DENIED')
    const audit = (await deniedAudits(CO1_MANAGER_ID)).at(-1)
    expect(audit).toMatchObject({
      targetType: 'handover_lots',
      targetId: lots.co2Confirmed,
      afterData: expect.objectContaining({ cause: 'cross_company' }),
    })
  })

  it('§20 id ที่ไม่มีจริง/ไม่ใช่ uuid → 403 แบบเดียวกัน (ไม่ใช่ 404) + audit row_not_found', async () => {
    getRawSessionUserMock.mockResolvedValue(co1Manager)
    for (const id of [RANDOM_ID, 'not-a-uuid']) {
      const response = await detailRoute.GET(req(`/api/portal/handover-lots/${id}`), params(id))
      expect(response.status).toBe(403)
      expect(await errorCode(response)).toBe('PERMISSION_DENIED')
    }
    const audits = await deniedAudits(CO1_MANAGER_ID)
    expect(audits.slice(-2).map((audit) => (audit.afterData as { cause: string }).cause)).toEqual(['row_not_found', 'row_not_found'])
  })
})

suite('GET /api/portal/handover-lots/:id/download — ใบเซ็นรับ (D8)', () => {
  it('ล็อต confirmed ของตัวเอง → ไฟล์ stream ผ่าน server + audit export', async () => {
    getRawSessionUserMock.mockResolvedValue(co1Manager)
    const response = await downloadRoute.GET(req(`/api/portal/handover-lots/${lots.co1Confirmed}/download`), params(lots.co1Confirmed))
    expect(response.status).toBe(200)
    expect(response.headers.get('content-type')).toBe('application/pdf')
    expect(response.headers.get('content-disposition')).toContain('DLV-2569-97003-signed.pdf')
    expect(response.headers.get('cache-control')).toBe('no-store')
    expect(new Uint8Array(await response.arrayBuffer())).toEqual(SIGNED_BYTES)
    const exported = await db().auditLog.findFirst({
      where: { organizationId: ORG_ID, actorId: CO1_MANAGER_ID, action: 'export', targetId: lots.co1Confirmed, createdAt: { gte: testStartedAt } },
    })
    expect(exported?.targetType).toBe('handover_lots')
  })

  it('§20 ล็อตยังไม่ confirmed (pending_attach / pending_delivery_proof) → 403 + audit lot_not_confirmed', async () => {
    getRawSessionUserMock.mockResolvedValue(co1Manager)
    for (const id of [lots.co1Pending, lots.co1Dispatched]) {
      const response = await downloadRoute.GET(req(`/api/portal/handover-lots/${id}/download`), params(id))
      expect(response.status).toBe(403)
      expect(await errorCode(response)).toBe('PERMISSION_DENIED')
    }
    const causes = (await deniedAudits(CO1_MANAGER_ID)).slice(-2).map((audit) => (audit.afterData as { cause: string }).cause)
    expect(causes).toEqual(['lot_not_confirmed:pending_attach', 'lot_not_confirmed:pending_delivery_proof'])
  })

  it('ล็อต confirmed ของ CO2 → 403 (ไม่ได้ไฟล์)', async () => {
    getRawSessionUserMock.mockResolvedValue(co1Manager)
    const response = await downloadRoute.GET(req(`/api/portal/handover-lots/${lots.co2Confirmed}/download`), params(lots.co2Confirmed))
    expect(response.status).toBe(403)
  })

  it('ไม่มี portal_download → 403 ก่อนแตะแถว', async () => {
    getRawSessionUserMock.mockResolvedValue({ ...co1Manager, capabilities: { portal_handover: 'view' } })
    const response = await downloadRoute.GET(req(`/api/portal/handover-lots/${lots.co1Confirmed}/download`), params(lots.co1Confirmed))
    expect(response.status).toBe(403)
    const audits = await deniedAudits(CO1_MANAGER_ID)
    expect(audits).toContainEqual(
      expect.objectContaining({ targetType: 'portal', afterData: expect.objectContaining({ download: true, section: 'handover' }) }),
    )
  })

  it('แอดมินบริษัท (ไม่มี portal_handover) → 403 แม้มี portal_download', async () => {
    getRawSessionUserMock.mockResolvedValue(co1Admin)
    const response = await downloadRoute.GET(req(`/api/portal/handover-lots/${lots.co1Confirmed}/download`), params(lots.co1Confirmed))
    expect(response.status).toBe(403)
  })

  it('ไฟล์หายจาก bucket → LOT_MISSING_SIGNED_DOC (ไม่ใช่ 500)', async () => {
    resetFakeUploads()
    getRawSessionUserMock.mockResolvedValue(co1Manager)
    const response = await downloadRoute.GET(req(`/api/portal/handover-lots/${lots.co1Confirmed}/download`), params(lots.co1Confirmed))
    expect(response.status).toBe(400)
    expect(await errorCode(response)).toBe('LOT_MISSING_SIGNED_DOC')
  })

  it('§20 company suspended → 403 COMPANY_SUSPENDED ทุก request', async () => {
    await db().$executeRawUnsafe(`UPDATE finance_companies SET status = 'suspended' WHERE id = '${CO1}'`)
    try {
      getRawSessionUserMock.mockResolvedValue(co1Manager)
      const response = await listRoute.GET(req('/api/portal/handover-lots'), undefined)
      expect(response.status).toBe(403)
      expect(await errorCode(response)).toBe('COMPANY_SUSPENDED')
    } finally {
      await db().$executeRawUnsafe(`UPDATE finance_companies SET status = 'active' WHERE id = '${CO1}'`)
    }
  })
})
