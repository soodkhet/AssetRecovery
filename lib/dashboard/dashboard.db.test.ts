import { PrismaPg } from '@prisma/adapter-pg'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { PrismaClient } from '@/lib/generated/prisma/client'
import { ROLE_USERS } from '@/lib/dashboard/role-fixtures.test-helper'
import type { SessionUser } from '@/lib/auth/types'

/**
 * เทสต์ระดับ DB ของแดชบอร์ดหลัก (Phase 6.6)
 *  - query ทุกคิว (17 ตัว) + กระดานเคสรันได้จริงบน Postgres (ไม่ใช่แค่ผ่าน typecheck)
 *  - scope ทีม: ผู้จัดการเห็นเฉพาะเคสทีมตัวเอง และเฉพาะสถานะที่ทีมมองเห็นได้
 *  - แถวปิดงานนับเฉพาะเดือนปัจจุบันตามปฏิทินไทย
 *
 * ⚠️ ต้องตั้ง `DATABASE_URL = TEST_DATABASE_URL` **ก่อน** import service (กับดัก 2026-08-14)
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
if (!url) console.warn('[dashboard.db.test] ข้ามเทสต์ระดับ DB — ไม่มี TEST_DATABASE_URL (ดู .env.example)')

const ORG_ID = '00000000-0000-4000-8000-0000000066a0'
const ROLE_ID = '00000000-0000-4000-8000-0000000066a1'
const USER_ID = '00000000-0000-4000-8000-0000000066a2'
const TEAM_A = '00000000-0000-4000-8000-0000000066a3'
const TEAM_B = '00000000-0000-4000-8000-0000000066a4'
const COMPANY_ID = '00000000-0000-4000-8000-0000000066a5'

/** ตุลาคม 2569 ตามเวลาไทย */
const NOW = new Date('2026-10-06T05:00:00Z')

let client: PrismaClient | null = null
let overviewOf: typeof import('@/lib/dashboard/queries').getDashboardOverview

function db(): PrismaClient {
  if (!url) throw new Error('ไม่มี TEST_DATABASE_URL')
  if (!client) {
    assertLocalTestDatabase(url)
    client = new PrismaClient({ adapter: new PrismaPg({ connectionString: url }) })
  }
  return client
}

let seq = 0
/**
 * `assignmentStatus` = การมอบหมายของเคส (ค่าเริ่มต้น: เคส `active` ถือโดยพนักงานแล้ว = `scheduled` · อื่น ๆ ไม่มี)
 * — คิว "รอมอบหมาย" นับเฉพาะเคสที่ยังไม่มีการมอบหมายที่ active (มติ PO O72(4))
 */
async function seedCase(
  status: string,
  teamId: string,
  closedAt: string | null = null,
  assignmentStatus: string | null = status === 'active' ? 'scheduled' : null,
): Promise<void> {
  seq += 1
  const caseRef = `DSH66-${seq}-${Date.now()}`
  const closed = status === 'closed_success' || status === 'closed_fail'
  await db().$executeRawUnsafe(`
    INSERT INTO cases (
      organization_id, case_ref, case_ref_normalized, company_id, source, status, created_by,
      debtor_name, addr_province, addr_district, asset_kind, asset_description,
      debt_amount_satang, assigned_team_id, outcome, closed_at
    ) VALUES (
      '${ORG_ID}', $$${caseRef}$$, $$${caseRef}$$, '${COMPANY_ID}', 'manual', '${status}', '${USER_ID}',
      'ลูกหนี้ ${seq}', 'เชียงใหม่', 'เมือง', 'smartphone', 'iPhone 15',
      1000000, '${teamId}', ${closed ? `'${status}'` : 'NULL'}, ${closedAt === null ? 'NULL' : `'${closedAt}'`}
    )
  `)
  if (assignmentStatus === null) return
  await db().$executeRawUnsafe(`
    INSERT INTO case_assignments (organization_id, case_id, agent_id, team_id, status, created_by)
    SELECT '${ORG_ID}', id, '${USER_ID}', '${teamId}', '${assignmentStatus}', '${USER_ID}'
      FROM cases WHERE organization_id = '${ORG_ID}' AND case_ref = $$${caseRef}$$
  `)
}

function inOrg(user: SessionUser): SessionUser {
  return { ...user, organizationId: ORG_ID, id: USER_ID }
}

async function cleanup(): Promise<void> {
  await db().$executeRawUnsafe(`DELETE FROM case_assignments WHERE organization_id = '${ORG_ID}'`)
  await db().$executeRawUnsafe(`DELETE FROM cases WHERE organization_id = '${ORG_ID}'`)
}

beforeAll(async () => {
  if (!url) return
  process.env.DATABASE_URL = url
  overviewOf = (await import('@/lib/dashboard/queries')).getDashboardOverview

  const tx = db()
  await tx.$executeRawUnsafe(`
    INSERT INTO organizations (id, name, tax_id, address)
    VALUES ('${ORG_ID}', 'Phase66Test', '9999999996600', 'ที่อยู่ทดสอบ 6.6') ON CONFLICT (id) DO NOTHING
  `)
  await tx.$executeRawUnsafe(`
    INSERT INTO roles (id, organization_id, name, role_group, is_seed)
    VALUES ('${ROLE_ID}', '${ORG_ID}', 'ผู้ทดสอบ 6.6', 'system', false) ON CONFLICT (id) DO NOTHING
  `)
  await tx.$executeRawUnsafe(`
    INSERT INTO users (id, organization_id, role_id, email, full_name, status)
    VALUES ('${USER_ID}', '${ORG_ID}', '${ROLE_ID}', 'dash66@test.local', 'ผู้ทดสอบ 6.6', 'active')
    ON CONFLICT (id) DO NOTHING
  `)
  await tx.$executeRawUnsafe(`
    INSERT INTO teams (id, organization_id, name, side, provinces, status, created_by) VALUES
      ('${TEAM_A}', '${ORG_ID}', 'ทีม A 6.6', 'inhouse', ARRAY['เชียงใหม่'], 'active', '${USER_ID}'),
      ('${TEAM_B}', '${ORG_ID}', 'ทีม B 6.6', 'outsource', ARRAY['ลำพูน'], 'active', '${USER_ID}')
    ON CONFLICT (id) DO NOTHING
  `)
  await tx.$executeRawUnsafe(`
    INSERT INTO finance_companies (id, organization_id, name, short_name, tax_id, vat_mode, created_by)
    VALUES ('${COMPANY_ID}', '${ORG_ID}', 'ไฟแนนซ์ 6.6', 'F66', '0105512660001', 'exclude_vat', '${USER_ID}')
    ON CONFLICT (id) DO NOTHING
  `)
  await cleanup()
})

afterAll(async () => {
  if (url) await cleanup()
  await client?.$disconnect()
})

beforeEach(async () => {
  if (url) await cleanup()
})

suite('getDashboardOverview — DB จริง', () => {
  it('Superadmin: ทุกคิวรันได้ · กระดานเคสนับทั้งองค์กร · ปิดงานนับเฉพาะเดือนนี้', async () => {
    await seedCase('active', TEAM_A)
    await seedCase('active', TEAM_B)
    await seedCase('pending_review', TEAM_A)
    await seedCase('approved', TEAM_B)
    await seedCase('closed_success', TEAM_A, '2026-10-01T02:00:00Z')
    // 30/09/2569 23:30 น. เวลาไทย = เดือนก่อน — ต้องไม่ถูกนับ
    await seedCase('closed_success', TEAM_A, '2026-09-30T16:30:00Z')

    const overview = await overviewOf(inOrg(ROLE_USERS.superadmin()), NOW)

    expect(overview.queues).toHaveLength(17)
    expect(overview.queues.find((queue) => queue.id === 'case_pending_review')?.count).toBe(1)
    expect(overview.queues.find((queue) => queue.id === 'case_awaiting_assignment')?.count).toBe(1)
    const counts = Object.fromEntries((overview.caseBoard?.rows ?? []).map((row) => [row.status, row.count]))
    expect(counts).toMatchObject({ active: 2, pending_review: 1, approved: 1, closed_success: 1, closed_fail: 0 })
    expect(overview.caseBoard?.monthLabel).toBe('ตุลาคม 2569')
  })

  it('ผู้จัดการทีม A: เห็นเฉพาะเคสทีม A และเฉพาะสถานะที่ทีมมองเห็น', async () => {
    await seedCase('active', TEAM_A)
    await seedCase('active', TEAM_B)
    await seedCase('approved', TEAM_A)
    await seedCase('approved', TEAM_B)
    await seedCase('pending_review', TEAM_A)

    const manager = inOrg(ROLE_USERS.manager())
    const overview = await overviewOf(
      { ...manager, teamId: TEAM_A, scope: { ...manager.scope, teamIds: [TEAM_A] } },
      NOW,
    )

    const counts = Object.fromEntries((overview.caseBoard?.rows ?? []).map((row) => [row.status, row.count]))
    expect(counts).toMatchObject({ active: 1, approved: 1, pending_review: 0 })
    expect(overview.queues.find((queue) => queue.id === 'case_awaiting_assignment')?.count).toBe(1)
    expect(overview.queues.map((queue) => queue.id)).not.toContain('advance_overdue')
  })

  it('มติ PO O72(4) — เคสรอมอบหมาย นับเฉพาะเคสที่ยังไม่มีการมอบหมายที่ active (ไม่รวมรอกดรับ/รับแล้วยังไม่นัด)', async () => {
    await seedCase('approved', TEAM_A)
    await seedCase('approved', TEAM_A, null, 'pending_accept')
    await seedCase('approved', TEAM_A, null, 'accepted_unscheduled')
    // การมอบหมายที่ปิด/ถูกถอนไปแล้ว ไม่นับว่าถือเคส ⇒ ยังรอมอบหมาย
    await seedCase('approved', TEAM_A, null, 'reassigned_away')

    const overview = await overviewOf(inOrg(ROLE_USERS.superadmin()), NOW)
    expect(overview.queues.find((queue) => queue.id === 'case_awaiting_assignment')?.count).toBe(2)
  })
})
