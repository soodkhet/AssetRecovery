import { PrismaPg } from '@prisma/adapter-pg'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { PrismaClient } from '@/lib/generated/prisma/client'

/**
 * ผู้รับแจ้งเตือนตาม capability ต้องกรองตาม scope (มติ PO 03/10/2569 UAT Q17 · BUG-064)
 * — "ปิดงานไม่สำเร็จ"/"มีรายการเบิกใหม่" ของเคสทีม A ห้ามถึงผู้จัดการทีม B · เรื่องของบริษัท X ห้ามถึงผู้ใช้บริษัท Y
 *
 * ⚠️ เรียก service จริงซึ่ง import `@/lib/prisma` ⇒ ตั้ง `DATABASE_URL = TEST_DATABASE_URL` ก่อน import แบบ dynamic
 * capability ใช้ code เฉพาะของเทสต์นี้ (ตาราง `capabilities` ไม่มี organization_id — ห้ามชนแถวจริงของ seed)
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

const ORG_ID = '00000000-0000-4000-8000-00000000d640'
const CAPABILITY_ID = '00000000-0000-4000-8000-00000000d641'
const CAPABILITY_CODE = 'test_recipient_scope_q17'
const ROLE_SYSTEM = '00000000-0000-4000-8000-00000000d642'
const ROLE_MANAGER = '00000000-0000-4000-8000-00000000d643'
const ROLE_AGENT = '00000000-0000-4000-8000-00000000d644'
const ROLE_COMPANY = '00000000-0000-4000-8000-00000000d645'
const SYSTEM_USER = '00000000-0000-4000-8000-00000000d650'
const MANAGER_A = '00000000-0000-4000-8000-00000000d651'
const SUPERVISOR_B = '00000000-0000-4000-8000-00000000d652'
const MANAGER_MEMBER_A = '00000000-0000-4000-8000-00000000d653'
const AGENT_A = '00000000-0000-4000-8000-00000000d654'
const COMPANY_X_USER = '00000000-0000-4000-8000-00000000d655'
const COMPANY_Y_USER = '00000000-0000-4000-8000-00000000d656'
const TEAM_A = '00000000-0000-4000-8000-00000000d660'
const TEAM_B = '00000000-0000-4000-8000-00000000d661'
const TEMPLATE_ID = '00000000-0000-4000-8000-00000000d662'
const COMPANY_X = '00000000-0000-4000-8000-00000000d663'
const COMPANY_Y = '00000000-0000-4000-8000-00000000d664'

let client: PrismaClient | null = null
let recipients: typeof import('@/lib/notifications/recipients')

function db(): PrismaClient {
  if (!url) throw new Error('ไม่มี TEST_DATABASE_URL')
  if (!client) {
    assertLocalTestDatabase(url)
    client = new PrismaClient({ adapter: new PrismaPg({ connectionString: url }) })
  }
  return client
}

beforeAll(async () => {
  if (!url) return
  process.env.DATABASE_URL = url
  recipients = await import('@/lib/notifications/recipients')
  const tx = db()
  await tx.$executeRawUnsafe(`
    INSERT INTO organizations (id, name, tax_id, address)
    VALUES ('${ORG_ID}', 'RecipientScopeTest', '9999999999640', 'ที่อยู่ทดสอบ') ON CONFLICT (id) DO NOTHING
  `)
  await tx.$executeRawUnsafe(`
    INSERT INTO roles (id, organization_id, name, role_group, is_seed) VALUES
      ('${ROLE_SYSTEM}', '${ORG_ID}', 'ธุรการ', 'system', false),
      ('${ROLE_MANAGER}', '${ORG_ID}', 'ผู้จัดการทีมติดตามทรัพย์', 'inhouse', false),
      ('${ROLE_AGENT}', '${ORG_ID}', 'พนักงานติดตามทรัพย์', 'inhouse', false),
      ('${ROLE_COMPANY}', '${ORG_ID}', 'ผู้จัดการ', 'finance_company', false)
    ON CONFLICT (id) DO NOTHING
  `)
  await tx.$executeRawUnsafe(`
    INSERT INTO users (id, organization_id, role_id, email, full_name, status) VALUES
      ('${SYSTEM_USER}', '${ORG_ID}', '${ROLE_SYSTEM}', 'sys-d64@test.local', 'ธุรการ', 'active'),
      ('${MANAGER_A}', '${ORG_ID}', '${ROLE_MANAGER}', 'mgr-a-d64@test.local', 'ผู้จัดการทีม A', 'active'),
      ('${SUPERVISOR_B}', '${ORG_ID}', '${ROLE_MANAGER}', 'sup-b-d64@test.local', 'หัวหน้าทีม B', 'active'),
      ('${MANAGER_MEMBER_A}', '${ORG_ID}', '${ROLE_MANAGER}', 'mem-a-d64@test.local', 'สมาชิกทีม A', 'active'),
      ('${AGENT_A}', '${ORG_ID}', '${ROLE_AGENT}', 'agent-a-d64@test.local', 'พนักงาน A', 'active'),
      ('${COMPANY_X_USER}', '${ORG_ID}', '${ROLE_COMPANY}', 'cx-d64@test.local', 'บริษัท X', 'active'),
      ('${COMPANY_Y_USER}', '${ORG_ID}', '${ROLE_COMPANY}', 'cy-d64@test.local', 'บริษัท Y', 'active')
    ON CONFLICT (id) DO NOTHING
  `)
  await tx.$executeRawUnsafe(`
    INSERT INTO teams (id, organization_id, name, side, provinces, status, supervisor_id, created_by) VALUES
      ('${TEAM_A}', '${ORG_ID}', 'ทีม A', 'inhouse', ARRAY['ลำปาง'], 'active', NULL, '${SYSTEM_USER}'),
      ('${TEAM_B}', '${ORG_ID}', 'ทีม B', 'inhouse', ARRAY['พะเยา'], 'active', '${SUPERVISOR_B}', '${SYSTEM_USER}')
    ON CONFLICT (id) DO NOTHING
  `)
  await tx.$executeRawUnsafe(
    `INSERT INTO team_managers (team_id, user_id) VALUES ('${TEAM_A}', '${MANAGER_A}') ON CONFLICT DO NOTHING`,
  )
  await tx.$executeRawUnsafe(
    `UPDATE users SET team_id = '${TEAM_A}'::uuid WHERE id IN ('${MANAGER_MEMBER_A}', '${AGENT_A}')`,
  )
  await tx.$executeRawUnsafe(`
    INSERT INTO service_fee_templates
      (id, organization_id, name, model, base_satang, rate_pct, basis, charge_on_fail, version, is_current, created_by)
    VALUES ('${TEMPLATE_ID}', '${ORG_ID}', 'เทมเพลต', 'FLAT', 50000, 0, NULL, false, 1, true, '${SYSTEM_USER}')
    ON CONFLICT (id) DO NOTHING
  `)
  await tx.$executeRawUnsafe(`
    INSERT INTO finance_companies (id, organization_id, name, short_name, tax_id, service_fee_template_id, created_by) VALUES
      ('${COMPANY_X}', '${ORG_ID}', 'ไฟแนนซ์ X', 'FX', '0105512600641', '${TEMPLATE_ID}', '${SYSTEM_USER}'),
      ('${COMPANY_Y}', '${ORG_ID}', 'ไฟแนนซ์ Y', 'FY', '0105512600642', '${TEMPLATE_ID}', '${SYSTEM_USER}')
    ON CONFLICT (id) DO NOTHING
  `)
  await tx.$executeRawUnsafe(`UPDATE users SET company_id = '${COMPANY_X}'::uuid WHERE id = '${COMPANY_X_USER}'`)
  await tx.$executeRawUnsafe(`UPDATE users SET company_id = '${COMPANY_Y}'::uuid WHERE id = '${COMPANY_Y_USER}'`)
  await tx.$executeRawUnsafe(`
    INSERT INTO capabilities (id, code, label, module) VALUES
      ('${CAPABILITY_ID}', '${CAPABILITY_CODE}', 'ทดสอบ scope ผู้รับ', 'test')
    ON CONFLICT (code) DO NOTHING
  `)
  await tx.$executeRawUnsafe(`
    INSERT INTO role_capabilities (role_id, capability_id, access_level) VALUES
      ('${ROLE_SYSTEM}', '${CAPABILITY_ID}', 'manage'),
      ('${ROLE_MANAGER}', '${CAPABILITY_ID}', 'manage'),
      ('${ROLE_AGENT}', '${CAPABILITY_ID}', 'manage'),
      ('${ROLE_COMPANY}', '${CAPABILITY_ID}', 'manage')
    ON CONFLICT DO NOTHING
  `)
})

afterAll(async () => {
  if (url) {
    await db().$executeRawUnsafe(`DELETE FROM role_capabilities WHERE capability_id = '${CAPABILITY_ID}'`)
    await db().$executeRawUnsafe(`DELETE FROM capabilities WHERE id = '${CAPABILITY_ID}'`)
  }
  await client?.$disconnect()
})

suite('usersWithCapability กรองตาม scope (UAT Q17 · BUG-064)', () => {
  it('เรื่องของทีม A: system + ผู้จัดการ/สมาชิกทีม A เท่านั้น — หัวหน้าทีม B / พนักงาน / บริษัท ไม่ได้รับ', async () => {
    const ids = await recipients.usersWithCapability(ORG_ID, CAPABILITY_CODE, { teamId: TEAM_A })
    expect([...ids].sort()).toEqual([SYSTEM_USER, MANAGER_A, MANAGER_MEMBER_A].sort())
  })

  it('เรื่องของทีม B: หัวหน้าทีม B (teams.supervisor_id) ได้รับ · ผู้จัดการทีม A ไม่ได้รับ', async () => {
    const ids = await recipients.usersWithCapability(ORG_ID, CAPABILITY_CODE, { teamId: TEAM_B })
    expect([...ids].sort()).toEqual([SYSTEM_USER, SUPERVISOR_B].sort())
  })

  it('เรื่องของบริษัท X: ผู้ใช้บริษัท X ได้รับ · บริษัท Y และผู้จัดการทีมไม่ได้รับ', async () => {
    const ids = await recipients.usersWithCapability(ORG_ID, CAPABILITY_CODE, { companyId: COMPANY_X })
    expect([...ids].sort()).toEqual([SYSTEM_USER, COMPANY_X_USER].sort())
  })

  it('เรื่องระดับองค์กร (ไม่ระบุ scope): เฉพาะกลุ่ม system', async () => {
    expect(await recipients.usersWithCapability(ORG_ID, CAPABILITY_CODE)).toEqual([SYSTEM_USER])
  })

  it('teamLeadIds: ผู้จัดการ (team_managers) + หัวหน้า (supervisor_id) ของทีมนั้นเท่านั้น', async () => {
    expect(await recipients.teamLeadIds(ORG_ID, TEAM_A)).toEqual([MANAGER_A])
    expect(await recipients.teamLeadIds(ORG_ID, TEAM_B)).toEqual([SUPERVISOR_B])
    expect(await recipients.teamLeadIds(ORG_ID, null)).toEqual([])
  })
})
