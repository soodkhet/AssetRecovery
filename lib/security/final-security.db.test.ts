import { randomUUID } from 'node:crypto'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { PrismaPg } from '@prisma/adapter-pg'
import { NextRequest } from 'next/server'
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import {
  COMPANY_MANAGER_ROLE_NAME,
  EXECUTIVE_ROLE_NAME,
  FIELD_AGENT_ROLE_NAME,
  FINANCE_ROLE_NAME,
  SUPERADMIN_ROLE_NAME,
  TEAM_MANAGER_ROLE_NAME,
} from '@/lib/auth/constants'
import { PrismaClient } from '@/lib/generated/prisma/client'
import type { RoleGroup } from '@/lib/generated/prisma/enums'
import { CAPABILITIES } from '@/lib/roles/capability-catalog'
import { CAPABILITY_LOCKS } from '@/lib/roles/capability-locks'
import { DEFAULT_ROLE_CAPABILITIES } from '@/lib/roles/default-matrix'

/**
 * Final Test ด่าน 4 — สิทธิ์ + scope + multi-tenant + portal + ✅ only + audit immutable (มติ U119)
 *
 * ยิง **route handler จริง** + Prisma จริง + `loadSessionUser()` จริง (role/capability/scope โหลดจาก DB)
 * mock เฉพาะ Supabase Auth (คืน uid ของ persona ที่กำลังเล่น) — ไม่แตะ Supabase จริง
 * ⚠️ `audit_logs` ลบไม่ได้ ⇒ สร้างองค์กรใหม่ทุกครั้งที่รัน (ไม่ชนกับรอบก่อน)
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
if (!url) console.warn('[final-security.db.test] ข้ามเทสต์ระดับ DB — ไม่มี TEST_DATABASE_URL')

const currentUid = vi.hoisted(() => ({ value: null as string | null }))
vi.mock('@/lib/supabase/server', () => ({
  createSupabaseServerClient: async () => ({
    auth: {
      getUser: async () =>
        currentUid.value === null
          ? { data: { user: null }, error: null }
          : { data: { user: { id: currentUid.value } }, error: null },
    },
  }),
  createSupabaseAdminClient: () => {
    throw new Error('ห้ามแตะ Supabase จริงในเทสต์')
  },
  createSupabaseStatelessClient: () => {
    throw new Error('ห้ามแตะ Supabase จริงในเทสต์')
  },
}))

// ── ข้อมูลรอบนี้ ──────────────────────────────────────────────────────────────

const RUN = `${process.pid}${Date.now() % 1_000_000}`
const taxIdOf = (n: number): string => `${n}${RUN}`.padEnd(13, '0').slice(0, 13)
const ORG_A = randomUUID()
const ORG_B = randomUUID()
const RANDOM_ID = randomUUID()

type Persona = 'superadmin' | 'finance' | 'executive' | 'manager' | 'agent1' | 'agent2' | 'company1' | 'superadminB'
const uid: Record<Persona, string> = {
  superadmin: randomUUID(),
  finance: randomUUID(),
  executive: randomUUID(),
  manager: randomUUID(),
  agent1: randomUUID(),
  agent2: randomUUID(),
  company1: randomUUID(),
  superadminB: randomUUID(),
}
const userId: Record<Persona, string> = {
  superadmin: randomUUID(),
  finance: randomUUID(),
  executive: randomUUID(),
  manager: randomUUID(),
  agent1: randomUUID(),
  agent2: randomUUID(),
  company1: randomUUID(),
  superadminB: randomUUID(),
}
const roleIds = new Map<string, string>()
const TEAM_1 = randomUUID()
const TEAM_2 = randomUUID()
const COMPANY_1 = randomUUID()
const COMPANY_2 = randomUUID()
const COMPANY_B = randomUUID()
const CASE_T1_C1 = randomUUID()
const CASE_T2_C2 = randomUUID()
const CASE_ORG_B = randomUUID()

let client: PrismaClient | null = null
function db(): PrismaClient {
  if (!url) throw new Error('ไม่มี TEST_DATABASE_URL')
  if (!client) {
    assertLocalTestDatabase(url)
    client = new PrismaClient({ adapter: new PrismaPg({ connectionString: url }) })
  }
  return client
}

type Ctx = { params: Promise<Record<string, string>> }
type Route = (request: NextRequest, context: Ctx) => Promise<Response>
type RouteModule = Partial<Record<'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE', Route>>

async function call(
  persona: Persona | null,
  mod: RouteModule,
  method: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE',
  path: string,
  params: Record<string, string> = {},
  body?: unknown,
): Promise<{ status: number; json: Record<string, unknown> }> {
  const handler = mod[method]
  if (handler === undefined) throw new Error(`route ไม่มี ${method} (${path})`)
  currentUid.value = persona === null ? null : uid[persona]
  const init: { method: string; body?: string; headers?: Record<string, string> } = { method }
  if (body !== undefined) {
    init.body = JSON.stringify(body)
    init.headers = { 'content-type': 'application/json' }
  }
  const response = await handler(new NextRequest(new URL(path, 'http://localhost:3000'), init), {
    params: Promise.resolve(params),
  })
  const text = await response.text()
  let json: Record<string, unknown> = {}
  try {
    json = text === '' ? {} : (JSON.parse(text) as Record<string, unknown>)
  } catch {
    json = { raw: text }
  }
  return { status: response.status, json }
}

function errorCode(json: Record<string, unknown>): unknown {
  const error = json['error']
  return error !== null && typeof error === 'object' ? (error as Record<string, unknown>)['code'] : undefined
}

/** ตัด id/เวลา/รายละเอียดที่ต่างกันโดยธรรมชาติออก เหลือ status + error code — ใช้เทียบ "ไม่ leak ว่ามี record" */
async function denialShape(
  persona: Persona,
  mod: RouteModule,
  path: (id: string) => string,
  id: string,
): Promise<{ status: number; code: unknown }> {
  const result = await call(persona, mod, 'GET', path(id), { id })
  return { status: result.status, code: errorCode(result.json) }
}

function listIds(json: Record<string, unknown>): string[] {
  const data = json['data']
  const items = Array.isArray(data)
    ? data
    : data !== null && typeof data === 'object'
      ? ((data as Record<string, unknown>)['items'] ?? (data as Record<string, unknown>)['rows'] ?? [])
      : []
  return (items as Array<Record<string, unknown>>).map((item) => String(item['id']))
}

// ── fixtures ─────────────────────────────────────────────────────────────────

async function ensureCapabilities(): Promise<Map<string, string>> {
  for (const capability of CAPABILITIES) {
    await db().capability.upsert({
      where: { code: capability.code },
      update: {},
      create: {
        code: capability.code,
        label: capability.label,
        module: capability.module,
        functionalGroup: capability.functionalGroup,
        description: capability.description ?? null,
      },
    })
  }
  const rows = await db().capability.findMany({ select: { id: true, code: true } })
  return new Map(rows.map((row) => [row.code, row.id]))
}

async function createRole(orgId: string, name: string, roleGroup: RoleGroup, capIds: Map<string, string>): Promise<string> {
  const role = await db().role.create({ data: { organizationId: orgId, name, roleGroup, isSeed: true } })
  const assignments = DEFAULT_ROLE_CAPABILITIES.filter(
    (assignment) => assignment.role.name === name && assignment.role.roleGroup === roleGroup,
  )
  if (assignments.length > 0) {
    await db().roleCapability.createMany({
      data: assignments.map((assignment) => ({
        roleId: role.id,
        capabilityId: capIds.get(assignment.capabilityCode) ?? '',
        accessLevel: assignment.level,
      })),
    })
  }
  roleIds.set(`${orgId}:${roleGroup}:${name}`, role.id)
  return role.id
}

async function createUser(
  persona: Persona,
  orgId: string,
  roleId: string,
  extra: { teamId?: string; companyId?: string } = {},
): Promise<void> {
  await db().user.create({
    data: {
      id: userId[persona],
      organizationId: orgId,
      roleId,
      supabaseUid: uid[persona],
      username: `f4-${persona}-${RUN}`,
      fullName: `ผู้ทดสอบ ${persona}`,
      status: 'active',
      lastLoginAt: new Date(),
      teamId: extra.teamId ?? null,
      companyId: extra.companyId ?? null,
    },
  })
}

async function insertCase(id: string, orgId: string, companyId: string, teamId: string | null, creator: string): Promise<void> {
  await db().$executeRawUnsafe(`
    INSERT INTO cases (id, organization_id, case_ref, case_ref_normalized, company_id, source, status, created_by,
                       debtor_name, addr_province, assigned_team_id)
    VALUES ('${id}', '${orgId}', 'F4-${id.slice(0, 8)}', 'F4-${id.slice(0, 8).toUpperCase()}', '${companyId}',
            'manual', 'active', '${creator}', 'ลูกหนี้ ${id.slice(0, 4)}', 'เชียงใหม่',
            ${teamId === null ? 'NULL' : `'${teamId}'`})
  `)
}

// ── route modules ────────────────────────────────────────────────────────────

const routes = {} as Record<string, RouteModule>

suite('Final ด่าน 4 — security (route จริง + session จริงจาก DB)', () => {
  beforeAll(async () => {
    if (!url) return
    process.env.DATABASE_URL = url
    const load = async (key: string, loader: () => Promise<unknown>): Promise<void> => {
      routes[key] = (await loader()) as RouteModule
    }
    await Promise.all([
      load('dashboard', () => import('@/app/api/dashboard/route')),
      load('report', () => import('@/app/api/reports/[reportId]/route')),
      load('reportExec', () => import('@/app/api/reports/executive/[reportId]/route')),
      load('cases', () => import('@/app/api/cases/route')),
      load('caseDetail', () => import('@/app/api/cases/[id]/route')),
      load('fieldCase', () => import('@/app/api/field/cases/[id]/route')),
      load('fieldAccept', () => import('@/app/api/field/cases/[id]/accept/route')),
      load('portalCases', () => import('@/app/api/portal/cases/route')),
      load('portalCase', () => import('@/app/api/portal/cases/[id]/route')),
      load('payoutBatches', () => import('@/app/api/payout-batches/route')),
      load('periods', () => import('@/app/api/accounting/periods/route')),
      load('taxProfiles', () => import('@/app/api/settings/tax-profiles/route')),
      load('roles', () => import('@/app/api/roles/route')),
      load('rolePermissions', () => import('@/app/api/roles/[id]/permissions/route')),
      load('auditLogs', () => import('@/app/api/audit-logs/route')),
      load('users', () => import('@/app/api/users/route')),
      load('financeCompanies', () => import('@/app/api/finance-companies/route')),
      load('devTrigger', () => import('@/app/api/dev/trigger-job/route')),
      load('devLock', () => import('@/app/api/dev/accounting-periods/[id]/lock/route')),
    ])

    const capIds = await ensureCapabilities()
    for (const [orgId, n] of [
      [ORG_A, 1],
      [ORG_B, 2],
    ] as const) {
      await db().organization.create({ data: { id: orgId, name: `F4 Org ${n} ${RUN}`, taxId: taxIdOf(n), address: 'กรุงเทพฯ' } })
    }

    const superA = await createRole(ORG_A, SUPERADMIN_ROLE_NAME, 'system', capIds)
    const finA = await createRole(ORG_A, FINANCE_ROLE_NAME, 'system', capIds)
    const execA = await createRole(ORG_A, EXECUTIVE_ROLE_NAME, 'system', capIds)
    const mgrA = await createRole(ORG_A, TEAM_MANAGER_ROLE_NAME, 'inhouse', capIds)
    const agentA = await createRole(ORG_A, FIELD_AGENT_ROLE_NAME, 'inhouse', capIds)
    const coA = await createRole(ORG_A, COMPANY_MANAGER_ROLE_NAME, 'finance_company', capIds)
    const superB = await createRole(ORG_B, SUPERADMIN_ROLE_NAME, 'system', capIds)

    await createUser('superadmin', ORG_A, superA)
    await createUser('superadminB', ORG_B, superB)
    await createUser('finance', ORG_A, finA)
    await createUser('executive', ORG_A, execA)

    for (const [teamId, name] of [
      [TEAM_1, 'ทีม 1'],
      [TEAM_2, 'ทีม 2'],
    ] as const) {
      await db().team.create({
        data: { id: teamId, organizationId: ORG_A, name: `${name} ${RUN}`, side: 'inhouse', createdBy: userId.superadmin },
      })
    }
    await createUser('manager', ORG_A, mgrA)
    await db().teamManager.create({ data: { teamId: TEAM_1, userId: userId.manager } })
    await createUser('agent1', ORG_A, agentA, { teamId: TEAM_1 })
    await createUser('agent2', ORG_A, agentA, { teamId: TEAM_2 })

    for (const [id, orgId, n, creator] of [
      [COMPANY_1, ORG_A, 3, userId.superadmin],
      [COMPANY_2, ORG_A, 4, userId.superadmin],
      [COMPANY_B, ORG_B, 5, userId.superadminB],
    ] as const) {
      await db().$executeRawUnsafe(`
        INSERT INTO finance_companies (id, organization_id, name, short_name, tax_id, address, status, created_by)
        VALUES ('${id}', '${orgId}', 'ไฟแนนซ์ F4-${n} ${RUN}', 'F4${n}', '${taxIdOf(n)}', 'กรุงเทพฯ', 'active', '${creator}')
      `)
    }
    await createUser('company1', ORG_A, coA, { companyId: COMPANY_1 })

    await insertCase(CASE_T1_C1, ORG_A, COMPANY_1, TEAM_1, userId.superadmin)
    await insertCase(CASE_T2_C2, ORG_A, COMPANY_2, TEAM_2, userId.superadmin)
    await insertCase(CASE_ORG_B, ORG_B, COMPANY_B, null, userId.superadminB)
    for (const [caseId, agent, team] of [
      [CASE_T1_C1, userId.agent1, TEAM_1],
      [CASE_T2_C2, userId.agent2, TEAM_2],
    ] as const) {
      await db().$executeRawUnsafe(`
        INSERT INTO case_assignments (organization_id, case_id, agent_id, team_id, status, created_by)
        VALUES ('${ORG_A}', '${caseId}', '${agent}', '${team}', 'pending_accept', '${userId.superadmin}')
      `)
    }
  }, 120_000)

  afterEach(() => {
    vi.unstubAllEnvs()
  })

  afterAll(async () => {
    await client?.$disconnect()
  })

  // ── ข้อ 2: matrix `25` ───────────────────────────────────────────────────────
  describe('matrix (25)', () => {
    it('ไม่มี session = 401 (ไม่ใช่ 200/500)', async () => {
      const result = await call(null, routes['cases'] ?? {}, 'GET', '/api/cases')
      expect(result.status).toBe(401)
    })

    it('การเงินเรียกรายงาน E1 = 403 ทั้งทาง /api/reports/:id และ /api/reports/executive/:id', async () => {
      const byId = await call('finance', routes['report'] ?? {}, 'GET', '/api/reports/kpi-summary', {
        reportId: 'kpi-summary',
      })
      expect(byId.status).toBe(403)
      const byPath = await call('finance', routes['reportExec'] ?? {}, 'GET', '/api/reports/executive/kpi-summary', {
        reportId: 'kpi-summary',
      })
      expect(byPath.status).toBe(403)
    })

    it('ผู้ใช้บริษัทไฟแนนซ์เรียก GET /api/dashboard = 403', async () => {
      const result = await call('company1', routes['dashboard'] ?? {}, 'GET', '/api/dashboard')
      expect(result.status).toBe(403)
    })

    it('ผู้ใช้บริษัทไฟแนนซ์เรียก endpoint ภายใน (เคส/ผู้ใช้/บริษัท) = 403', async () => {
      for (const [key, path] of [
        ['cases', '/api/cases'],
        ['users', '/api/users'],
        ['financeCompanies', '/api/finance-companies'],
      ] as const) {
        const result = await call('company1', routes[key] ?? {}, 'GET', path)
        expect(result.status, path).toBe(403)
      }
    })

    it('พนักงานภาคสนามเรียกหมวด การเงิน/บัญชี/ตั้งค่า/สิทธิ์/audit = 403 ทุกหมวด', async () => {
      for (const [key, path] of [
        ['payoutBatches', '/api/payout-batches'],
        ['periods', '/api/accounting/periods'],
        ['taxProfiles', '/api/settings/tax-profiles'],
        ['auditLogs', '/api/audit-logs'],
        ['users', '/api/users'],
      ] as const) {
        const result = await call('agent1', routes[key] ?? {}, 'GET', path)
        expect(result.status, path).toBe(403)
      }
    })

    it('การเงินสร้าง role / แก้ matrix สิทธิ์ไม่ได้ (manage_roles = Superadmin เท่านั้น)', async () => {
      const finRole = roleIds.get(`${ORG_A}:system:${FINANCE_ROLE_NAME}`) ?? ''
      const result = await call(
        'finance',
        routes['rolePermissions'] ?? {},
        'PATCH',
        `/api/roles/${finRole}/permissions`,
        { id: finRole },
        { entries: [{ capabilityCode: 'manage_billing', level: 'manage' }], reason: 'ทดสอบสิทธิ์ด่าน 4' },
      )
      expect(result.status).toBe(403)
    })
  })

  // ── ข้อ 3: scope ย่อย + ไม่ leak ─────────────────────────────────────────────
  describe('scope ย่อย — id ของคนอื่นตอบเหมือน id ที่ไม่มีจริง', () => {
    it('ผู้จัดการทีม: เคสทีมตัวเอง 200 · เคสทีมอื่น = ตอบเหมือนไม่มี record · list เห็นเฉพาะทีมใน team_managers', async () => {
      const mod = routes['caseDetail'] ?? {}
      const own = await call('manager', mod, 'GET', `/api/cases/${CASE_T1_C1}`, { id: CASE_T1_C1 })
      expect(own.status).toBe(200)
      const other = await denialShape('manager', mod, (id) => `/api/cases/${id}`, CASE_T2_C2)
      const missing = await denialShape('manager', mod, (id) => `/api/cases/${id}`, RANDOM_ID)
      expect([403, 404]).toContain(other.status)
      expect(other).toEqual(missing)

      const list = await call('manager', routes['cases'] ?? {}, 'GET', '/api/cases?pageSize=100')
      expect(list.status).toBe(200)
      const ids = listIds(list.json)
      expect(ids).toContain(CASE_T1_C1)
      expect(ids).not.toContain(CASE_T2_C2)
      expect(ids).not.toContain(CASE_ORG_B)
    })

    it('พนักงาน: เคสตัวเอง 200 · เคสทีมอื่น = ตอบเหมือนไม่มี record · รับงานแทนคนอื่นไม่ได้', async () => {
      const mod = routes['fieldCase'] ?? {}
      const own = await call('agent1', mod, 'GET', `/api/field/cases/${CASE_T1_C1}`, { id: CASE_T1_C1 })
      expect(own.status).toBe(200)
      const other = await denialShape('agent2', mod, (id) => `/api/field/cases/${id}`, CASE_T1_C1)
      const missing = await denialShape('agent2', mod, (id) => `/api/field/cases/${id}`, RANDOM_ID)
      expect([403, 404]).toContain(other.status)
      expect(other).toEqual(missing)

      const accept = await call('agent2', routes['fieldAccept'] ?? {}, 'POST', `/api/field/cases/${CASE_T1_C1}/accept`, {
        id: CASE_T1_C1,
      })
      expect([403, 404]).toContain(accept.status)
      const assignment = await db().caseAssignment.findFirst({ where: { caseId: CASE_T1_C1 }, select: { status: true } })
      expect(assignment?.status).toBe('pending_accept')
    })

    it('ผู้ใช้บริษัท: เคสบริษัทอื่น = ตอบเหมือนไม่มี record · companyId ใน query ถูกเมิน', async () => {
      const mod = routes['portalCase'] ?? {}
      const own = await call('company1', mod, 'GET', `/api/portal/cases/${CASE_T1_C1}`, { id: CASE_T1_C1 })
      expect(own.status).toBe(200)
      const other = await denialShape('company1', mod, (id) => `/api/portal/cases/${id}`, CASE_T2_C2)
      const missing = await denialShape('company1', mod, (id) => `/api/portal/cases/${id}`, RANDOM_ID)
      expect([403, 404]).toContain(other.status)
      expect(other).toEqual(missing)

      for (const key of ['companyId', 'company_id', 'company']) {
        const list = await call('company1', routes['portalCases'] ?? {}, 'GET', `/api/portal/cases?${key}=${COMPANY_2}`)
        expect(list.status).toBe(200)
        const ids = listIds(list.json)
        expect(ids, key).not.toContain(CASE_T2_C2)
      }
    })

    it('multi-tenant: Superadmin องค์กร B เปิดเคส/list ขององค์กร A ไม่ได้ (ตอบเหมือนไม่มี)', async () => {
      const mod = routes['caseDetail'] ?? {}
      const cross = await denialShape('superadminB', mod, (id) => `/api/cases/${id}`, CASE_T1_C1)
      const missing = await denialShape('superadminB', mod, (id) => `/api/cases/${id}`, RANDOM_ID)
      expect(cross.status).toBe(404)
      expect(cross).toEqual(missing)

      const list = await call('superadminB', routes['cases'] ?? {}, 'GET', '/api/cases?pageSize=100')
      expect(list.status).toBe(200)
      const ids = listIds(list.json)
      expect(ids).toContain(CASE_ORG_B)
      expect(ids).not.toContain(CASE_T1_C1)
      expect(ids).not.toContain(CASE_T2_C2)

      const companies = await call('superadminB', routes['financeCompanies'] ?? {}, 'GET', '/api/finance-companies')
      expect(companies.status).toBe(200)
      expect(JSON.stringify(companies.json)).not.toContain(COMPANY_1)
    })
  })

  // ── ข้อ 4: "✅ only" 9 รายการ ─────────────────────────────────────────────────
  describe('"✅ only" 9 รายการ — ล็อกจริงที่ API', () => {
    it.each(Object.entries(CAPABILITY_LOCKS))('มอบ %s ให้ role การเงินไม่ได้', async (code) => {
      const finRole = roleIds.get(`${ORG_A}:system:${FINANCE_ROLE_NAME}`) ?? ''
      const result = await call(
        'superadmin',
        routes['rolePermissions'] ?? {},
        'PATCH',
        `/api/roles/${finRole}/permissions`,
        { id: finRole },
        { entries: [{ capabilityCode: code, level: 'manage' }], reason: 'ทดสอบล็อกสิทธิ์ด่าน 4' },
      )
      expect(result.status).toBeGreaterThanOrEqual(400)
      expect(result.status).toBeLessThan(500)
      const granted = await db().roleCapability.count({ where: { roleId: finRole, capability: { code } } })
      expect(granted).toBe(0)
    })

    it.each(['approve_adjustment_locked', 'unlock_period', 'authorize_exception'])(
      'ลดระดับ/ถอด %s ของ role บริหารไม่ได้',
      async (code) => {
        const execRole = roleIds.get(`${ORG_A}:system:${EXECUTIVE_ROLE_NAME}`) ?? ''
        for (const level of ['view', 'none'] as const) {
          const result = await call(
            'superadmin',
            routes['rolePermissions'] ?? {},
            'PATCH',
            `/api/roles/${execRole}/permissions`,
            { id: execRole },
            { entries: [{ capabilityCode: code, level }], reason: 'ทดสอบล็อกสิทธิ์ด่าน 4' },
          )
          expect(result.status, level).toBeGreaterThanOrEqual(400)
          expect(result.status, level).toBeLessThan(500)
        }
        const row = await db().roleCapability.findFirst({
          where: { roleId: execRole, capability: { code } },
          select: { accessLevel: true },
        })
        expect(row?.accessLevel).toBe('manage')
      },
    )

    it('แก้ matrix โดยไม่มีเหตุผล = 400 (reason บังคับเมื่อกระทบสิทธิ์)', async () => {
      const finRole = roleIds.get(`${ORG_A}:system:${FINANCE_ROLE_NAME}`) ?? ''
      const result = await call(
        'superadmin',
        routes['rolePermissions'] ?? {},
        'PATCH',
        `/api/roles/${finRole}/permissions`,
        { id: finRole },
        { entries: [{ capabilityCode: 'view_reports', level: 'view' }] },
      )
      expect(result.status).toBe(400)
    })
  })

  // ── ข้อ 5: audit immutable ที่ DB (ยิงจริง) ──────────────────────────────────
  describe('audit_logs immutable ที่ DB', () => {
    it('UPDATE / DELETE audit_logs ถูก DB ปฏิเสธ', async () => {
      const row = await db().auditLog.findFirst({
        where: { organizationId: ORG_A },
        select: { id: true },
        orderBy: { createdAt: 'desc' },
      })
      const target = row?.id
      expect(target, 'ต้องมี audit ที่ระบบเขียนจากการทดสอบข้างบน').toBeDefined()
      await expect(
        db().$executeRawUnsafe(`UPDATE audit_logs SET reason = 'แก้ย้อนหลัง' WHERE id = '${target ?? ''}'`),
      ).rejects.toThrow()
      await expect(db().$executeRawUnsafe(`DELETE FROM audit_logs WHERE id = '${target ?? ''}'`)).rejects.toThrow()
    })

    it('การถูกปฏิเสธที่ portal ลง audit access_denied ขององค์กรตัวเอง', async () => {
      const denied = await db().auditLog.count({
        where: { organizationId: ORG_A, actorId: userId.company1, action: 'access_denied' },
      })
      expect(denied).toBeGreaterThan(0)
    })
  })

  // ── ข้อ 9: dev route ปิดใน production ────────────────────────────────────────
  describe('dev-only route ปิดใน production', () => {
    it('POST /api/dev/trigger-job และ /api/dev/accounting-periods/:id/lock = 404 แม้เป็น Superadmin', async () => {
      vi.stubEnv('NODE_ENV', 'production')
      const trigger = await call('superadmin', routes['devTrigger'] ?? {}, 'POST', '/api/dev/trigger-job', {}, {
        jobType: 'advance_overdue',
        payload: {},
      })
      expect(trigger.status).toBe(404)
      const lock = await call('superadmin', routes['devLock'] ?? {}, 'POST', `/api/dev/accounting-periods/${RANDOM_ID}/lock`, {
        id: RANDOM_ID,
      }, { reason: 'ทดสอบ' })
      expect(lock.status).toBe(404)
    })
  })
})

// ── ข้อ 1 + ข้อ 7: ตรวจทุก route.ts (static) ─────────────────────────────────────

const API_ROOT = join(process.cwd(), 'app', 'api')

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = join(dir, name)
    if (statSync(full).isDirectory()) return walk(full)
    return name === 'route.ts' ? [full] : []
  })
}

/** ชั้นยามที่เรียก `requirePermission`/`requireAnyPermission` (หรือยาม session ภายใน/พอร์ทัล) ก่อน handler เสมอ */
const GUARDS = [
  'withEndpoint(',
  'withApiPermission(',
  'withRolePermission(',
  'withPortal(',
  'categoryAliasGet(',
  'devPeriodCloseRoute(',
  'requirePermission(',
  'requireAnyPermission(',
  'requireInternalSession(',
  'requirePortalAccess(',
]
/** ข้อยกเว้นที่บันทึกไว้: auth (ก่อน login) + cron (secret) — ตรวจแยกในเทสต์ของโมดูลนั้น */
const PUBLIC_ROUTES = new Set(['auth/login', 'auth/logout', 'auth/session', 'auth/change-password', 'cron/jobs'])

describe('ทุก route ใน app/api ผ่านชั้นสิทธิ์ (static)', () => {
  const files = walk(API_ROOT)

  it('พบ route จำนวนสมเหตุผล', () => {
    expect(files.length).toBeGreaterThan(200)
  })

  it('ทุก route ที่ไม่ใช่ข้อยกเว้นมียามสิทธิ์', () => {
    const missing = files
      .map((file) => ({ file, rel: file.slice(API_ROOT.length + 1).replace(/\/route\.ts$/, '') }))
      .filter(({ rel }) => !PUBLIC_ROUTES.has(rel))
      .filter(({ file }) => {
        const source = readFileSync(file, 'utf8')
        return !GUARDS.some((guard) => new RegExp(String.raw`\b${guard.slice(0, -1)}\s*(<[^()]*>)?\s*\(`).test(source))
      })
      .map(({ rel }) => rel)
    expect(missing).toEqual([])
  })

  it('/api/portal/* export เฉพาะ GET', () => {
    const offenders = files
      .filter((file) => file.includes(`${join('app', 'api', 'portal')}`))
      .filter((file) => /export\s+(const|async function|function)\s+(POST|PUT|PATCH|DELETE)\b/.test(readFileSync(file, 'utf8')))
    expect(offenders).toEqual([])
  })
})
