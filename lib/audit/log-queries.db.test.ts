import { PrismaPg } from '@prisma/adapter-pg'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { SessionUser } from '@/lib/auth/types'
import { PrismaClient } from '@/lib/generated/prisma/client'

/**
 * เทสต์ระดับ DB ของหน้าบันทึกการใช้งาน (Phase 5.2 — `90` §8/§12/§14):
 *  · กรอง `organization_id` ของผู้เรียกเสมอ (แถวขององค์กรอื่นต้องไม่โผล่ และเปิดรายละเอียดไม่ได้)
 *  · ตัวกรอง target_type / actor / action / ช่วงวันที่ (ช่วงวัน = **วันไทย** ไม่ใช่ UTC)
 *  · Company User โดน `PERMISSION_DENIED` แม้จะถือ capability (แถว audit ไม่มีคอลัมน์บริษัทให้กรอง)
 *  · ไม่มีฟังก์ชันเขียน/ลบในโมดูลนี้ (audit immutable — `02` §13)
 *
 * ⚠️ ห้ามลบแถว `audit_logs` ในเทสต์เด็ดขาด (trigger ปฏิเสธทุกกรณี) ⇒ ไฟล์นี้ใช้ org/actor เฉพาะตัว
 *    แล้ว assert เฉพาะแถวของตัวเอง · ต้องตั้ง `DATABASE_URL = TEST_DATABASE_URL` ก่อน import service
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
  console.warn('[log-queries.db.test] ข้ามเทสต์ระดับ DB — ไม่มี TEST_DATABASE_URL (ดู .env.example)')
}

const ORG_ID = '00000000-0000-4000-8000-0000000052a0'
const OTHER_ORG_ID = '00000000-0000-4000-8000-0000000052a1'
const ROLE_ID = '00000000-0000-4000-8000-0000000052a2'
const OTHER_ROLE_ID = '00000000-0000-4000-8000-0000000052a3'
const EXEC_ID = '00000000-0000-4000-8000-0000000052a4'
const FINANCE_ID = '00000000-0000-4000-8000-0000000052a5'
const OTHER_USER_ID = '00000000-0000-4000-8000-0000000052a6'

const LOG_CASE_APPROVE = '00000000-0000-4000-8000-0000000052b1'
const LOG_EXPENSE_UPDATE = '00000000-0000-4000-8000-0000000052b2'
const LOG_LOGIN = '00000000-0000-4000-8000-0000000052b3'
const LOG_OTHER_ORG = '00000000-0000-4000-8000-0000000052b4'
const TARGET_CASE = '00000000-0000-4000-8000-0000000052c1'

let client: PrismaClient | null = null
type LogQueries = typeof import('@/lib/audit/log-queries')
let logs: LogQueries

function db(): PrismaClient {
  if (!url) throw new Error('ไม่มี TEST_DATABASE_URL')
  if (!client) {
    assertLocalTestDatabase(url)
    client = new PrismaClient({ adapter: new PrismaPg({ connectionString: url }) })
  }
  return client
}

function sessionUser(overrides: Partial<SessionUser> & Pick<SessionUser, 'id'>): SessionUser {
  return {
    organizationId: ORG_ID,
    supabaseUid: `uid-${overrides.id}`,
    email: `${overrides.id}@test.local`,
    fullName: 'ผู้ทดสอบ 5.2',
    status: 'active',
    roleId: ROLE_ID,
    roleName: 'บริหาร',
    roleGroup: 'system',
    isSuperadmin: false,
    teamId: null,
    companyId: null,
    capabilities: { view_audit_log: 'view' },
    scope: { kind: 'global', teamIds: [], companyId: null, userId: overrides.id },
    loginAt: new Date().toISOString(),
    ...overrides,
  }
}

const executive = sessionUser({ id: EXEC_ID })
const companyUser = sessionUser({
  id: FINANCE_ID,
  roleName: 'ผู้ใช้บริษัทไฟแนนซ์',
  roleGroup: 'finance_company',
  scope: { kind: 'company', teamIds: [], companyId: '00000000-0000-4000-8000-0000000052d1', userId: FINANCE_ID },
})

/** query เริ่มต้นของหน้าจอ (ค่าที่ Zod ใส่ให้เมื่อไม่ส่งอะไรมา) */
const baseQuery = { limit: 50, offset: 0 } as const

beforeAll(async () => {
  if (!url) return
  process.env.DATABASE_URL = url
  logs = await import('@/lib/audit/log-queries')

  const tx = db()
  await tx.$executeRawUnsafe(`
    INSERT INTO organizations (id, name, tax_id, address) VALUES
      ('${ORG_ID}', 'Phase52Test', '9999999995200', 'ที่อยู่ทดสอบ 5.2'),
      ('${OTHER_ORG_ID}', 'Phase52Other', '9999999995201', 'ที่อยู่ทดสอบ 5.2 องค์กรอื่น')
    ON CONFLICT (id) DO NOTHING
  `)
  await tx.$executeRawUnsafe(`
    INSERT INTO roles (id, organization_id, name, role_group, is_seed) VALUES
      ('${ROLE_ID}', '${ORG_ID}', 'บริหาร 5.2', 'system', false),
      ('${OTHER_ROLE_ID}', '${OTHER_ORG_ID}', 'บริหาร 5.2 อื่น', 'system', false)
    ON CONFLICT (id) DO NOTHING
  `)
  await tx.$executeRawUnsafe(`
    INSERT INTO users (id, organization_id, role_id, email, full_name, status) VALUES
      ('${EXEC_ID}', '${ORG_ID}', '${ROLE_ID}', 'exec52@test.local', 'ผู้บริหาร 5.2', 'active'),
      ('${FINANCE_ID}', '${ORG_ID}', '${ROLE_ID}', 'finance52@test.local', 'การเงิน 5.2', 'active'),
      ('${OTHER_USER_ID}', '${OTHER_ORG_ID}', '${OTHER_ROLE_ID}', 'other52@test.local', 'คนองค์กรอื่น 5.2', 'active')
    ON CONFLICT (id) DO NOTHING
  `)

  // แถว audit ของเทสต์ (append-only — ลบไม่ได้ จึงใช้ id ตายตัวแล้ว `ON CONFLICT DO NOTHING`)
  // 15/08/2569 07:30 น. เวลาไทย = 00:30Z · 16/08/2569 06:00 น. เวลาไทย = 15/08 23:00Z (กับดักวันไทย)
  await tx.$executeRawUnsafe(`
    INSERT INTO audit_logs (id, organization_id, actor_id, actor_role, action, target_type, target_id, before_data, after_data, reason, ip_address, user_agent, created_at) VALUES
      ('${LOG_CASE_APPROVE}', '${ORG_ID}', '${EXEC_ID}', 'บริหาร 5.2', 'approve', 'cases', '${TARGET_CASE}',
       '{"status":"pending_review"}', '{"status":"approved"}', 'เอกสารครบถ้วน', '203.0.113.9', 'vitest', '2026-08-15T00:30:00Z'),
      ('${LOG_EXPENSE_UPDATE}', '${ORG_ID}', '${FINANCE_ID}', 'การเงิน 5.2', 'update', 'expenses', '${TARGET_CASE}',
       '{"gross_satang":10000}', '{"gross_satang":12000}', 'แก้ยอดตามใบเสร็จ', NULL, NULL, '2026-08-15T23:00:00Z'),
      ('${LOG_LOGIN}', '${ORG_ID}', '${EXEC_ID}', 'บริหาร 5.2', 'login', 'sessions', NULL,
       NULL, NULL, NULL, NULL, NULL, '2026-08-10T03:00:00Z'),
      ('${LOG_OTHER_ORG}', '${OTHER_ORG_ID}', '${OTHER_USER_ID}', 'บริหาร 5.2 อื่น', 'approve', 'cases', '${TARGET_CASE}',
       NULL, '{"status":"approved"}', 'ขององค์กรอื่น', NULL, NULL, '2026-08-15T02:00:00Z')
    ON CONFLICT (id) DO NOTHING
  `)
})

afterAll(async () => {
  await client?.$disconnect()
})

suite('บันทึกการใช้งาน — scope และตัวกรอง (`90` §12/§14)', () => {
  it('เห็นเฉพาะแถวขององค์กรตัวเอง', async () => {
    const result = await logs.listAuditLogs(executive, baseQuery)
    const ids = result.items.map((item) => item.id)

    expect(ids).toContain(LOG_CASE_APPROVE)
    expect(ids).not.toContain(LOG_OTHER_ORG)
    expect(result.total).toBe(result.items.length)
  })

  it('เรียงใหม่→เก่า และแสดงชื่อผู้ดำเนินการ', async () => {
    const result = await logs.listAuditLogs(executive, baseQuery)
    const times = result.items.map((item) => item.createdAt)

    expect([...times].sort().reverse()).toEqual(times)
    expect(result.items.find((item) => item.id === LOG_CASE_APPROVE)?.actorName).toBe('ผู้บริหาร 5.2')
  })

  it('กรองตามเป้าหมาย + การกระทำ + ผู้ดำเนินการ', async () => {
    const byTarget = await logs.listAuditLogs(executive, { ...baseQuery, targetType: 'expenses' })
    expect(byTarget.items.map((item) => item.id)).toEqual([LOG_EXPENSE_UPDATE])

    const byAction = await logs.listAuditLogs(executive, { ...baseQuery, action: 'login' })
    expect(byAction.items.map((item) => item.id)).toEqual([LOG_LOGIN])

    const byActor = await logs.listAuditLogs(executive, { ...baseQuery, actorId: FINANCE_ID })
    expect(byActor.items.map((item) => item.id)).toEqual([LOG_EXPENSE_UPDATE])
  })

  it('ช่วงวันที่ตีความเป็น **วันไทย** — รายการ 06:00 น. ของวันไทยถัดไปต้องไม่หลุดเข้ามา', async () => {
    const oneDay = await logs.listAuditLogs(executive, {
      ...baseQuery,
      dateFrom: '2026-08-15',
      dateTo: '2026-08-15',
    })
    const ids = oneDay.items.map((item) => item.id)

    // 00:30Z = 07:30 น. วันที่ 15 (ไทย) ⇒ อยู่ในช่วง
    expect(ids).toContain(LOG_CASE_APPROVE)
    // 23:00Z ของวันที่ 15 = 06:00 น. วันที่ 16 (ไทย) ⇒ **ต้องไม่อยู่ในช่วง**
    expect(ids).not.toContain(LOG_EXPENSE_UPDATE)
    expect(ids).not.toContain(LOG_LOGIN)
  })

  it('ตัวเลือกช่อง "เป้าหมาย" มาจากข้อมูลจริงขององค์กรนั้น', async () => {
    const result = await logs.listAuditLogs(executive, baseQuery)
    expect(result.targetTypes).toEqual(expect.arrayContaining(['cases', 'expenses', 'sessions']))
  })

  it('แบ่งหน้าแบบ offset — หน้าถัดไปไม่ซ้ำหน้าก่อน', async () => {
    const first = await logs.listAuditLogs(executive, { limit: 1, offset: 0 })
    const second = await logs.listAuditLogs(executive, { limit: 1, offset: 1 })

    expect(first.hasMore).toBe(true)
    expect(first.items[0]?.id).not.toBe(second.items[0]?.id)
  })
})

suite('รายละเอียดรายการเดียว (`90` §14)', () => {
  it('คืน before/after เต็ม + ที่มาการเรียก', async () => {
    const detail = await logs.getAuditLog(executive, LOG_CASE_APPROVE)

    expect(detail?.before).toEqual({ status: 'pending_review' })
    expect(detail?.after).toEqual({ status: 'approved' })
    expect(detail?.reason).toBe('เอกสารครบถ้วน')
    expect(detail?.ipAddress).toBe('203.0.113.9')
  })

  it('รายการขององค์กรอื่นตอบเหมือนไม่มีอยู่ (ไม่ leak)', async () => {
    expect(await logs.getAuditLog(executive, LOG_OTHER_ORG)).toBeNull()
  })
})

suite('Company User เข้าไม่ได้แม้ถือ capability', () => {
  it('list โยน PERMISSION_DENIED', async () => {
    await expect(logs.listAuditLogs(companyUser, baseQuery)).rejects.toSatisfy(
      (error: unknown) => (error as { code?: string }).code === 'PERMISSION_DENIED',
    )
  })

  it('detail โยน PERMISSION_DENIED เช่นกัน', async () => {
    await expect(logs.getAuditLog(companyUser, LOG_CASE_APPROVE)).rejects.toSatisfy(
      (error: unknown) => (error as { code?: string }).code === 'PERMISSION_DENIED',
    )
  })

  /**
   * `view_audit_log` เป็น capability นอก matrix ที่ admin มอบให้ role ไหนก็ได้ — scope ที่ไม่ใช่
   * `global` ทุกชนิดต้องถูกปฏิเสธเหมือนกัน (แถว audit ไม่มีคอลัมน์ทีม/ผู้ใช้ให้กรองรายแถว)
   */
  it('scope ทีม/ตัวเอง ก็เข้าไม่ได้เหมือนกัน — ไม่ใช่แค่ company', async () => {
    for (const kind of ['team', 'self'] as const) {
      const scoped = sessionUser({
        id: FINANCE_ID,
        scope: { kind, teamIds: ['00000000-0000-4000-8000-0000000052e1'], companyId: null, userId: FINANCE_ID },
      })
      await expect(logs.listAuditLogs(scoped, baseQuery)).rejects.toSatisfy(
        (error: unknown) => (error as { code?: string }).code === 'PERMISSION_DENIED',
      )
      await expect(logs.getAuditLog(scoped, LOG_CASE_APPROVE)).rejects.toSatisfy(
        (error: unknown) => (error as { code?: string }).code === 'PERMISSION_DENIED',
      )
    }
  })
})
