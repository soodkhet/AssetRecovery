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

suite('known H-06 — เป้าหมาย/รอบบัญชีเป็นชื่อที่อ่านได้ (batch ไม่ N+1 · ไม่ข้ามองค์กร)', () => {
  // องค์กรแยกของตัวเอง — แถว audit ลบไม่ได้ จึงไม่ปนกับจำนวนแถวที่เทสต์ข้างบนนับ
  const H06_ORG = '00000000-0000-4000-8000-0000000052f0'
  const H06_ROLE = '00000000-0000-4000-8000-0000000052f1'
  const H06_USER = '00000000-0000-4000-8000-0000000052f2'
  const H06_PERIOD = '00000000-0000-4000-8000-0000000052f3'
  const H06_LOG_PERIOD = '00000000-0000-4000-8000-0000000052f4'
  const H06_LOG_FIELD = '00000000-0000-4000-8000-0000000052f5'
  const H06_LOG_CROSS = '00000000-0000-4000-8000-0000000052f6'
  const h06User = sessionUser({ id: H06_USER, organizationId: H06_ORG, roleId: H06_ROLE })

  beforeAll(async () => {
    if (!url) return
    const tx = db()
    await tx.$executeRawUnsafe(`
      INSERT INTO organizations (id, name, tax_id, address) VALUES ('${H06_ORG}', 'H06Test', '9999999995202', 'ที่อยู่ H06')
      ON CONFLICT (id) DO NOTHING`)
    await tx.$executeRawUnsafe(`
      INSERT INTO roles (id, organization_id, name, role_group, is_seed)
      VALUES ('${H06_ROLE}', '${H06_ORG}', 'บริหาร H06', 'system', false)
      ON CONFLICT (id) DO NOTHING`)
    await tx.$executeRawUnsafe(`
      INSERT INTO users (id, organization_id, role_id, email, full_name, status)
      VALUES ('${H06_USER}', '${H06_ORG}', '${H06_ROLE}', 'h06@test.local', 'ผู้บริหาร H06', 'active')
      ON CONFLICT (id) DO NOTHING`)
    await tx.$executeRawUnsafe(`
      INSERT INTO accounting_periods (id, organization_id, period_label, year_be, month, created_by)
      VALUES ('${H06_PERIOD}', '${H06_ORG}', 'ตุลาคม 2569', 2569, 10, '${H06_USER}')
      ON CONFLICT (id) DO NOTHING`)
    await tx.$executeRawUnsafe(`
      INSERT INTO audit_logs (id, organization_id, actor_id, actor_role, action, target_type, target_id, before_data, after_data, reason, created_at) VALUES
        ('${H06_LOG_PERIOD}', '${H06_ORG}', '${H06_USER}', 'บริหาร H06', 'update', 'accounting_periods', '${H06_PERIOD}',
         '{"status":"collecting"}', '{"status":"sent"}', 'ส่งบัญชี', '2026-10-13T03:00:00Z'),
        ('${H06_LOG_FIELD}', '${H06_ORG}', '${H06_USER}', 'บริหาร H06', 'update', 'users', '${H06_USER}',
         '{"period_id":"${H06_PERIOD}","status":"open"}', '{"period_id":"${H06_PERIOD}","status":"authorized"}', 'อนุมัติ', '2026-10-13T04:00:00Z'),
        ('${H06_LOG_CROSS}', '${H06_ORG}', '${H06_USER}', 'บริหาร H06', 'update', 'users', '${OTHER_USER_ID}',
         NULL, '{"period_id":"${OTHER_USER_ID}"}', 'ข้ามองค์กร', '2026-10-13T05:00:00Z')
      ON CONFLICT (id) DO NOTHING`)
  })

  it('รายการ: เป้าหมายเป็นชื่องวด/ชื่อผู้ใช้ · id ขององค์กรอื่นไม่ถูกแปลง (null) · targetId เดิมยังอยู่', async () => {
    const list = await logs.listAuditLogs(h06User, baseQuery)
    const byId = new Map(list.items.map((item) => [item.id, item]))
    expect(byId.get(H06_LOG_PERIOD)?.targetRef).toBe('ตุลาคม 2569')
    expect(byId.get(H06_LOG_PERIOD)?.targetId).toBe(H06_PERIOD)
    expect(byId.get(H06_LOG_FIELD)?.targetRef).toBe('ผู้บริหาร H06')
    expect(byId.get(H06_LOG_CROSS)?.targetRef).toBeNull()
  })

  it('รายละเอียด: period_id ในค่าก่อน/หลังมีป้าย "ตุลาคม 2569" · UUID ยังอยู่ใน before/after · ข้ามองค์กรไม่มีป้าย', async () => {
    const detail = await logs.getAuditLog(h06User, H06_LOG_FIELD)
    expect(detail?.refLabels[H06_PERIOD]).toBe('ตุลาคม 2569')
    expect(detail?.after).toMatchObject({ period_id: H06_PERIOD })
    const cross = await logs.getAuditLog(h06User, H06_LOG_CROSS)
    expect(cross?.refLabels).toEqual({})
  })
})

suite('ทดสอบซ้ำ local LR5-01 — ชุดส่งบัญชี / แบรนด์ / รายการเดินบัญชี / รายการรับเงิน เป็นชื่อที่อ่านได้', () => {
  const ORG = '00000000-0000-4000-8000-000000e515a0'
  const ROLE = '00000000-0000-4000-8000-000000e515a1'
  const USER = '00000000-0000-4000-8000-000000e515a2'
  const PERIOD = '00000000-0000-4000-8000-000000e515a3'
  const COMPANY = '00000000-0000-4000-8000-000000e515a4'
  const BATCH = '00000000-0000-4000-8000-000000e515a5'
  const ACCOUNT = '00000000-0000-4000-8000-000000e515a6'
  const BANK_TX = '00000000-0000-4000-8000-000000e515a7'
  const RECEIPT = '00000000-0000-4000-8000-000000e515a8'
  const EXPORT = '00000000-0000-4000-8000-000000e515a9'
  const BRAND = '00000000-0000-4000-8000-000000e515aa'
  const LOG_EXPORT = '00000000-0000-4000-8000-000000e515b1'
  const LOG_BRAND = '00000000-0000-4000-8000-000000e515b2'
  const LOG_RECEIPT = '00000000-0000-4000-8000-000000e515b3'
  const LOG_BANK_TX = '00000000-0000-4000-8000-000000e515b4'
  const lr5User = sessionUser({ id: USER, organizationId: ORG, roleId: ROLE })

  beforeAll(async () => {
    if (!url) return
    const tx = db()
    await tx.$executeRawUnsafe(`
      INSERT INTO organizations (id, name, tax_id, address) VALUES ('${ORG}', 'LR5Test', '9999999995150', 'ที่อยู่ LR5')
      ON CONFLICT (id) DO NOTHING`)
    await tx.$executeRawUnsafe(`
      INSERT INTO roles (id, organization_id, name, role_group, is_seed)
      VALUES ('${ROLE}', '${ORG}', 'บริหาร LR5', 'system', false) ON CONFLICT (id) DO NOTHING`)
    await tx.$executeRawUnsafe(`
      INSERT INTO users (id, organization_id, role_id, email, full_name, status)
      VALUES ('${USER}', '${ORG}', '${ROLE}', 'lr5@test.local', 'ผู้บริหาร LR5', 'active') ON CONFLICT (id) DO NOTHING`)
    await tx.$executeRawUnsafe(`
      INSERT INTO accounting_periods (id, organization_id, period_label, year_be, month, created_by)
      VALUES ('${PERIOD}', '${ORG}', 'ตุลาคม 2569', 2569, 10, '${USER}') ON CONFLICT (id) DO NOTHING`)
    await tx.$executeRawUnsafe(`
      INSERT INTO finance_companies (id, organization_id, name, short_name, tax_id, created_by)
      VALUES ('${COMPANY}', '${ORG}', 'ไฟแนนซ์ LR5', 'LR5', '9999999995151', '${USER}') ON CONFLICT (id) DO NOTHING`)
    await tx.$executeRawUnsafe(`
      INSERT INTO billing_batches (id, organization_id, company_id, period, due_date, created_by, batch_number)
      VALUES ('${BATCH}', '${ORG}', '${COMPANY}', '2569-10', '2026-10-31', '${USER}', 'BL-2569-010') ON CONFLICT (id) DO NOTHING`)
    await tx.$executeRawUnsafe(`
      INSERT INTO bank_accounts (id, organization_id, bank_name, account_name, account_number, created_by)
      VALUES ('${ACCOUNT}', '${ORG}', 'กสิกรไทย', 'บัญชี LR5', '1234567890', '${USER}') ON CONFLICT (id) DO NOTHING`)
    await tx.$executeRawUnsafe(`
      INSERT INTO bank_transactions (id, organization_id, period_id, bank_account_id, transaction_date, description, amount_satang, created_by)
      VALUES ('${BANK_TX}', '${ORG}', '${PERIOD}', '${ACCOUNT}', '2026-10-08', 'โอนเข้า LR5', 107000, '${USER}') ON CONFLICT (id) DO NOTHING`)
    await tx.$executeRawUnsafe(`
      INSERT INTO cash_receipts (id, organization_id, period_id, billing_batch_id, bank_transaction_id, amount_satang, received_date, created_by)
      VALUES ('${RECEIPT}', '${ORG}', '${PERIOD}', '${BATCH}', '${BANK_TX}', 107000, '2026-10-08', '${USER}') ON CONFLICT (id) DO NOTHING`)
    await tx.$executeRawUnsafe(`
      INSERT INTO export_records (id, organization_id, period_id, version, file_hash, generated_by)
      VALUES ('${EXPORT}', '${ORG}', '${PERIOD}', 3, 'hash-lr5', '${USER}') ON CONFLICT (id) DO NOTHING`)
    await tx.$executeRawUnsafe(`
      INSERT INTO device_brands (id, organization_id, name, name_key, source)
      VALUES ('${BRAND}', '${ORG}', 'aLR5', 'alr5', 'manual') ON CONFLICT (id) DO NOTHING`)
    await tx.$executeRawUnsafe(`
      INSERT INTO audit_logs (id, organization_id, actor_id, actor_role, action, target_type, target_id, before_data, after_data, reason, created_at) VALUES
        ('${LOG_EXPORT}', '${ORG}', '${USER}', 'บริหาร LR5', 'export', 'export_records', '${EXPORT}', NULL, '{"version":3}', NULL, '2026-10-13T03:00:00Z'),
        ('${LOG_BRAND}', '${ORG}', '${USER}', 'บริหาร LR5', 'update', 'device_brands', '${BRAND}', '{"manual_status":null}', '{"manual_status":"hidden"}', NULL, '2026-10-13T04:00:00Z'),
        ('${LOG_RECEIPT}', '${ORG}', '${USER}', 'บริหาร LR5', 'create', 'cash_receipts', '${RECEIPT}', NULL,
         '{"bank_transaction_id":"${BANK_TX}","amount_satang":107000}', 'จับคู่อัตโนมัติ', '2026-10-13T05:00:00Z'),
        ('${LOG_BANK_TX}', '${ORG}', '${USER}', 'บริหาร LR5', 'update', 'bank_transactions', '${BANK_TX}', '{"match_status":"unmatched"}', '{"match_status":"matched"}', 'จับคู่', '2026-10-13T06:00:00Z')
      ON CONFLICT (id) DO NOTHING`)
  })

  it('รายการ: เป้าหมายเป็นชื่อชุดส่งบัญชี/แบรนด์/รายการรับเงิน/รายการเดินบัญชี', async () => {
    const list = await logs.listAuditLogs(lr5User, baseQuery)
    const byId = new Map(list.items.map((item) => [item.id, item]))
    expect(byId.get(LOG_EXPORT)?.targetRef).toBe('ชุดส่งบัญชี ตุลาคม 2569 v1.2')
    expect(byId.get(LOG_BRAND)?.targetRef).toBe('aLR5')
    expect(byId.get(LOG_RECEIPT)?.targetRef).toBe('รับเงิน BL-2569-010 · ฿1,070.00')
    expect(byId.get(LOG_BANK_TX)?.targetRef).toBe('08/10/2569 · ฿1,070.00 · กสิกรไทย')
  })

  it('รายละเอียด: bank_transaction_id ในค่าหลังมีป้าย · องค์กรอื่นไม่เห็นชื่อ', async () => {
    const detail = await logs.getAuditLog(lr5User, LOG_RECEIPT)
    expect(detail?.refLabels[BANK_TX]).toBe('08/10/2569 · ฿1,070.00 · กสิกรไทย')
    const foreign = await logs.getAuditLog(sessionUser({ id: EXEC_ID }), LOG_RECEIPT)
    expect(foreign).toBeNull()
  })
})

suite('mytester5 A5-01 — รายการตั้งค่า + ค่าตั้งระดับองค์กรเป็นชื่อที่อ่านได้', () => {
  const ORG = '00000000-0000-4000-8000-000000a501a0'
  const ROLE = '00000000-0000-4000-8000-000000a501a1'
  const USER = '00000000-0000-4000-8000-000000a501a2'
  const TAX_PROFILE = '00000000-0000-4000-8000-000000a501a3'
  const COST_CENTER = '00000000-0000-4000-8000-000000a501a4'
  const HOLIDAY = '00000000-0000-4000-8000-000000a501a5'
  const LOG_TAX = '00000000-0000-4000-8000-000000a501b1'
  const LOG_CC = '00000000-0000-4000-8000-000000a501b2'
  const LOG_HOLIDAY = '00000000-0000-4000-8000-000000a501b3'
  const LOG_ORG = '00000000-0000-4000-8000-000000a501b4'
  const LOG_SLA = '00000000-0000-4000-8000-000000a501b5'
  const LOG_FOREIGN_ORG = '00000000-0000-4000-8000-000000a501b6'
  const a501User = sessionUser({ id: USER, organizationId: ORG, roleId: ROLE })

  beforeAll(async () => {
    if (!url) return
    const tx = db()
    await tx.$executeRawUnsafe(`
      INSERT INTO organizations (id, name, tax_id, address) VALUES ('${ORG}', 'A501Test', '9999999995010', 'ที่อยู่ A501')
      ON CONFLICT (id) DO NOTHING`)
    await tx.$executeRawUnsafe(`
      INSERT INTO roles (id, organization_id, name, role_group, is_seed)
      VALUES ('${ROLE}', '${ORG}', 'บริหาร A501', 'system', false) ON CONFLICT (id) DO NOTHING`)
    await tx.$executeRawUnsafe(`
      INSERT INTO users (id, organization_id, role_id, email, full_name, status)
      VALUES ('${USER}', '${ORG}', '${ROLE}', 'a501@test.local', 'ผู้บริหาร A501', 'active') ON CONFLICT (id) DO NOTHING`)
    await tx.$executeRawUnsafe(`
      INSERT INTO tax_profiles (id, organization_id, name, created_by, updated_at)
      VALUES ('${TAX_PROFILE}', '${ORG}', 'บุคคลธรรมดา ค่าจ้างทำของ 2%', '${USER}', now()) ON CONFLICT (id) DO NOTHING`)
    await tx.$executeRawUnsafe(`
      INSERT INTO cost_centers (id, organization_id, code, name, created_by, updated_at)
      VALUES ('${COST_CENTER}', '${ORG}', 'CC-001', 'ทีมติดตาม Inhouse', '${USER}', now()) ON CONFLICT (id) DO NOTHING`)
    await tx.$executeRawUnsafe(`
      INSERT INTO public_holidays (id, organization_id, holiday_date, name, created_by, updated_at)
      VALUES ('${HOLIDAY}', '${ORG}', '2026-10-13', 'วันคล้ายวันสวรรคต ร.9', '${USER}', now()) ON CONFLICT (id) DO NOTHING`)
    await tx.$executeRawUnsafe(`
      INSERT INTO audit_logs (id, organization_id, actor_id, actor_role, action, target_type, target_id, before_data, after_data, reason, created_at) VALUES
        ('${LOG_TAX}', '${ORG}', '${USER}', 'บริหาร A501', 'create', 'tax_profiles', '${TAX_PROFILE}', NULL, '{"wht_pct":2}', 'ตั้งค่า', '2026-10-13T03:00:00Z'),
        ('${LOG_CC}', '${ORG}', '${USER}', 'บริหาร A501', 'create', 'cost_centers', '${COST_CENTER}', NULL, '{"code":"CC-001"}', NULL, '2026-10-13T03:01:00Z'),
        ('${LOG_HOLIDAY}', '${ORG}', '${USER}', 'บริหาร A501', 'create', 'public_holidays', '${HOLIDAY}', NULL, '{"name":"x"}', NULL, '2026-10-13T03:02:00Z'),
        ('${LOG_ORG}', '${ORG}', '${USER}', 'บริหาร A501', 'update', 'finance_policy_settings', '${ORG}', NULL, '{"a":1}', 'แก้นโยบาย', '2026-10-13T03:03:00Z'),
        ('${LOG_SLA}', '${ORG}', '${USER}', 'บริหาร A501', 'update', 'assignment_policy_settings', '${ORG}', NULL, '{"sla_alert_hours":24}', 'ปรับเกณฑ์ SLA', '2026-10-13T03:04:00Z'),
        ('${LOG_FOREIGN_ORG}', '${ORG}', '${USER}', 'บริหาร A501', 'update', 'organizations', '${OTHER_ORG_ID}', NULL, '{"a":1}', NULL, '2026-10-13T03:05:00Z')
      ON CONFLICT (id) DO NOTHING`)
  })

  it('รายการ: โปรไฟล์ภาษี/ศูนย์ต้นทุน/วันหยุดเป็นชื่อ · ค่าตั้งระดับองค์กรเป็นชื่อหมวด · id องค์กรอื่นไม่ถูกแปลง', async () => {
    const list = await logs.listAuditLogs(a501User, baseQuery)
    const byId = new Map(list.items.map((item) => [item.id, item]))
    expect(byId.get(LOG_TAX)?.targetRef).toBe('บุคคลธรรมดา ค่าจ้างทำของ 2%')
    expect(byId.get(LOG_CC)?.targetRef).toBe('CC-001 ทีมติดตาม Inhouse')
    expect(byId.get(LOG_HOLIDAY)?.targetRef).toBe('13/10/2569 วันคล้ายวันสวรรคต ร.9')
    expect(byId.get(LOG_ORG)?.targetRef).toBe('นโยบายการเงิน')
    expect(byId.get(LOG_SLA)?.targetRef).toBe('นโยบายการมอบหมายงาน / SLA')
    expect(byId.get(LOG_FOREIGN_ORG)?.targetRef).toBeNull()
  })
})

suite('mytester5 H5-01 — ธุรกรรม/ภาคสนามเป็นชื่อที่อ่านได้ + ฟิลด์ *_id ในค่าก่อน/หลัง', () => {
  const ORG = '00000000-0000-4000-8000-000000e501a0'
  const ROLE = '00000000-0000-4000-8000-000000e501a1'
  const USER = '00000000-0000-4000-8000-000000e501a2'
  const AGENT = '00000000-0000-4000-8000-000000e501a3'
  const COMPANY = '00000000-0000-4000-8000-000000e501a4'
  const CASE = '00000000-0000-4000-8000-000000e501a5'
  const TEAM = '00000000-0000-4000-8000-000000e501a6'
  const PAYEE = '00000000-0000-4000-8000-000000e501a7'
  const EXPENSE = '00000000-0000-4000-8000-000000e501a8'
  const ASSIGNMENT = '00000000-0000-4000-8000-000000e501a9'
  const BATCH = '00000000-0000-4000-8000-000000e501aa'
  const ADJUSTMENT = '00000000-0000-4000-8000-000000e501ab'
  const DELETED_DRAFT = '00000000-0000-4000-8000-000000e501ac'
  const LOG_EXPENSE = '00000000-0000-4000-8000-000000e501b1'
  const LOG_ASSIGNMENT = '00000000-0000-4000-8000-000000e501b2'
  const LOG_ADJUSTMENT = '00000000-0000-4000-8000-000000e501b3'
  const LOG_DRAFT = '00000000-0000-4000-8000-000000e501b4'
  const LOG_PUSH = '00000000-0000-4000-8000-000000e501b5'
  const LOG_USER = '00000000-0000-4000-8000-000000e501b6'
  const h501User = sessionUser({ id: USER, organizationId: ORG, roleId: ROLE })

  beforeAll(async () => {
    if (!url) return
    const tx = db()
    await tx.$executeRawUnsafe(`
      INSERT INTO organizations (id, name, tax_id, address) VALUES ('${ORG}', 'H501Test', '9999999995011', 'ที่อยู่ H501')
      ON CONFLICT (id) DO NOTHING`)
    await tx.$executeRawUnsafe(`
      INSERT INTO roles (id, organization_id, name, role_group, is_seed)
      VALUES ('${ROLE}', '${ORG}', 'บริหาร H501', 'system', false) ON CONFLICT (id) DO NOTHING`)
    await tx.$executeRawUnsafe(`
      INSERT INTO users (id, organization_id, role_id, email, full_name, status) VALUES
        ('${USER}', '${ORG}', '${ROLE}', 'h501@test.local', 'ผู้บริหาร H501', 'active'),
        ('${AGENT}', '${ORG}', '${ROLE}', 'h501-agent@test.local', 'อนันต์ H501', 'active')
      ON CONFLICT (id) DO NOTHING`)
    await tx.$executeRawUnsafe(`
      INSERT INTO finance_companies (id, organization_id, name, short_name, tax_id, created_by)
      VALUES ('${COMPANY}', '${ORG}', 'ไฟแนนซ์ H501', 'H501', '9999999995012', '${USER}') ON CONFLICT (id) DO NOTHING`)
    await tx.$executeRawUnsafe(`
      INSERT INTO cases (id, organization_id, case_ref, case_ref_normalized, company_id, source, status, created_by)
      VALUES ('${CASE}', '${ORG}', 'MTJ-H501-01', 'MTJ-H501-01', '${COMPANY}', 'manual', 'active', '${USER}')
      ON CONFLICT (id) DO NOTHING`)
    await tx.$executeRawUnsafe(`
      INSERT INTO teams (id, organization_id, name, side, provinces, status, created_by)
      VALUES ('${TEAM}', '${ORG}', 'ทีม H501', 'inhouse', ARRAY['เชียงใหม่'], 'active', '${USER}') ON CONFLICT (id) DO NOTHING`)
    await tx.$executeRawUnsafe(`
      INSERT INTO payee_profiles (id, organization_id, user_id, payee_type, is_verified, created_by)
      VALUES ('${PAYEE}', '${ORG}', '${AGENT}', 'individual', true, '${USER}') ON CONFLICT (id) DO NOTHING`)
    await tx.$executeRawUnsafe(`
      INSERT INTO expenses (id, organization_id, case_id, payee_id, expense_type, gross_satang, expense_date, status, created_by)
      VALUES ('${EXPENSE}', '${ORG}', '${CASE}', '${PAYEE}', 'fuel', 7236, '2026-10-13', 'pending_approval', '${USER}')
      ON CONFLICT (id) DO NOTHING`)
    await tx.$executeRawUnsafe(`
      INSERT INTO case_assignments (id, organization_id, case_id, agent_id, team_id, status, created_by)
      VALUES ('${ASSIGNMENT}', '${ORG}', '${CASE}', '${AGENT}', '${TEAM}', 'scheduled', '${USER}') ON CONFLICT (id) DO NOTHING`)
    await tx.$executeRawUnsafe(`
      INSERT INTO billing_batches (id, organization_id, company_id, period, due_date, created_by, batch_number)
      VALUES ('${BATCH}', '${ORG}', '${COMPANY}', '2569-10', '2026-10-31', '${USER}', 'BL-H501-001') ON CONFLICT (id) DO NOTHING`)
    await tx.$executeRawUnsafe(`
      INSERT INTO adjustments (id, organization_id, adjustment_type, amount_satang, reason, status, billing_batch_id, created_by)
      VALUES ('${ADJUSTMENT}', '${ORG}', 'decrease', 10000, 'ปรับลดทดสอบ H501', 'pending_approval', '${BATCH}', '${USER}')
      ON CONFLICT (id) DO NOTHING`)
    await tx.$executeRawUnsafe(`
      INSERT INTO audit_logs (id, organization_id, actor_id, actor_role, action, target_type, target_id, before_data, after_data, reason, created_at) VALUES
        ('${LOG_EXPENSE}', '${ORG}', '${USER}', 'บริหาร H501', 'approve', 'expenses', '${EXPENSE}', NULL,
         '{"payee_id":"${PAYEE}","case_id":"${CASE}","assignmentId":"${ASSIGNMENT}","team_id":"${TEAM}"}', NULL, '2026-10-13T03:00:00Z'),
        ('${LOG_ASSIGNMENT}', '${ORG}', '${USER}', 'บริหาร H501', 'create', 'case_assignments', '${ASSIGNMENT}', NULL, '{"agentId":"${AGENT}"}', NULL, '2026-10-13T03:01:00Z'),
        ('${LOG_ADJUSTMENT}', '${ORG}', '${USER}', 'บริหาร H501', 'create', 'adjustments', '${ADJUSTMENT}', NULL, '{"amount_satang":10000}', 'ปรับลด', '2026-10-13T03:02:00Z'),
        ('${LOG_DRAFT}', '${ORG}', '${AGENT}', 'บริหาร H501', 'update', 'close_case_drafts', '${DELETED_DRAFT}', NULL, '{"caseId":"${CASE}"}', NULL, '2026-10-13T03:03:00Z'),
        ('${LOG_PUSH}', '${ORG}', '${AGENT}', 'บริหาร H501', 'delete', 'push_subscriptions', '${AGENT}', '{"userId":"${AGENT}"}', '{"removed":1}', 'ยกเลิกแจ้งเตือน', '2026-10-13T03:04:00Z'),
        ('${LOG_USER}', '${ORG}', '${USER}', 'บริหาร H501', 'update', 'users', '${AGENT}', NULL, '{"status":"active"}', NULL, '2026-10-13T03:05:00Z')
      ON CONFLICT (id) DO NOTHING`)
  })

  it('รายการ: รายการเบิก/การมอบหมาย/รายการปรับปรุงเป็นชื่อ · ร่างปิดงานที่ถูกลบใช้เลขเคส · id ผู้ใช้คนละชนิดไม่ชนกัน', async () => {
    const list = await logs.listAuditLogs(h501User, baseQuery)
    const byId = new Map(list.items.map((item) => [item.id, item]))
    expect(byId.get(LOG_EXPENSE)?.targetRef).toBe('ค่าน้ำมัน MTJ-H501-01 ฿72.36')
    expect(byId.get(LOG_ASSIGNMENT)?.targetRef).toBe('MTJ-H501-01 → อนันต์ H501')
    expect(byId.get(LOG_ADJUSTMENT)?.targetRef).toBe('ลดยอด BL-H501-001 −฿100.00')
    expect(byId.get(LOG_DRAFT)?.targetRef).toBe('MTJ-H501-01')
    expect(byId.get(LOG_PUSH)?.targetRef).toBe('อนันต์ H501')
    expect(byId.get(LOG_USER)?.targetRef).toBe('อนันต์ H501')
  })

  it('รายละเอียด: payee_id / case_id / assignmentId / team_id ในค่าหลังมีป้าย · องค์กรอื่นเปิดไม่ได้', async () => {
    const detail = await logs.getAuditLog(h501User, LOG_EXPENSE)
    expect(detail?.refLabels).toEqual({
      [PAYEE]: 'อนันต์ H501',
      [CASE]: 'MTJ-H501-01',
      [ASSIGNMENT]: 'MTJ-H501-01 → อนันต์ H501',
      [TEAM]: 'ทีม H501',
    })
    expect(await logs.getAuditLog(sessionUser({ id: EXEC_ID }), LOG_EXPENSE)).toBeNull()
  })
})
