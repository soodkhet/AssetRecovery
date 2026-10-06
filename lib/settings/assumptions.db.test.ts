import { PrismaPg } from '@prisma/adapter-pg'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { SessionUser } from '@/lib/auth/types'
import { PrismaClient } from '@/lib/generated/prisma/client'

/**
 * มติ PO 07/10/2569 U140 — ยืนยันค่าตั้งที่เป็นสมมติฐาน: insert-only + audit (เหตุผล) · ยืนยันซ้ำ idempotent · DB ห้ามแก้/ลบ
 * ⚠️ ต้องตั้ง `DATABASE_URL = TEST_DATABASE_URL` **ก่อน** import service
 */

const url = process.env.TEST_DATABASE_URL
const suite = url ? describe : describe.skip

const ORG_ID = '00000000-0000-4000-8000-0000000140a0'
const ROLE_ID = '00000000-0000-4000-8000-0000000140a1'
const USER_ID = '00000000-0000-4000-8000-0000000140a2'

let client: PrismaClient | null = null
let queries: typeof import('@/lib/settings/queries/assumptions')

function db(): PrismaClient {
  if (!url) throw new Error('ไม่มี TEST_DATABASE_URL')
  const parsed = new URL(url)
  if (!['localhost', '127.0.0.1', '::1', 'postgres'].includes(parsed.hostname) || !parsed.pathname.includes('test')) {
    throw new Error('TEST_DATABASE_URL ต้องเป็น DB ทดสอบบนเครื่อง/CI เท่านั้น — Rule 07')
  }
  client ??= new PrismaClient({ adapter: new PrismaPg({ connectionString: url }) })
  return client
}

const accountant: SessionUser = {
  id: USER_ID,
  organizationId: ORG_ID,
  supabaseUid: 'uid-acc-140',
  email: 'accounting140@test.local',
  fullName: 'บัญชี U140',
  status: 'active',
  roleId: ROLE_ID,
  roleName: 'บัญชี',
  roleGroup: 'system',
  isSuperadmin: false,
  teamId: null,
  companyId: null,
  capabilities: { manage_accountant_questions: 'manage', view_master_data: 'view' },
  scope: { kind: 'global', teamIds: [], companyId: null, userId: USER_ID },
  loginAt: new Date().toISOString(),
}

const context = (reason: string) => ({ actor: accountant, meta: { ipAddress: null, userAgent: null }, reason })

beforeAll(async () => {
  if (!url) return
  process.env.DATABASE_URL = url
  queries = await import('@/lib/settings/queries/assumptions')
  const tx = db()
  await tx.$executeRawUnsafe(`
    INSERT INTO organizations (id, name, tax_id, address, vat_registered)
    VALUES ('${ORG_ID}', 'U140Test', '9999999914000', 'ที่อยู่ทดสอบ', true) ON CONFLICT (id) DO NOTHING
  `)
  await tx.$executeRawUnsafe(`
    INSERT INTO roles (id, organization_id, name, role_group, is_seed)
    VALUES ('${ROLE_ID}', '${ORG_ID}', 'บัญชี U140', 'system', false) ON CONFLICT (id) DO NOTHING
  `)
  await tx.$executeRawUnsafe(`
    INSERT INTO users (id, organization_id, role_id, email, full_name, status)
    VALUES ('${USER_ID}', '${ORG_ID}', '${ROLE_ID}', 'accounting140@test.local', 'บัญชี U140', 'active')
    ON CONFLICT (id) DO NOTHING
  `)
  // ตารางนี้ insert-only — ปิดยามเฉพาะตอนล้างข้อมูลเทสต์
  await tx.$executeRawUnsafe(
    `ALTER TABLE setting_assumption_confirmations DISABLE TRIGGER trg_setting_assumption_confirmations_insert_only`,
  )
  try {
    await tx.$executeRawUnsafe(`DELETE FROM setting_assumption_confirmations WHERE organization_id = '${ORG_ID}'`)
  } finally {
    await tx.$executeRawUnsafe(
      `ALTER TABLE setting_assumption_confirmations ENABLE TRIGGER trg_setting_assumption_confirmations_insert_only`,
    )
  }
})

afterAll(async () => {
  await client?.$disconnect()
})

suite('U140 — ป้าย "รอนักบัญชียืนยัน"', () => {
  it('เริ่มต้นทุกรายการยังไม่ยืนยัน · ยืนยันแล้วป้ายหาย + audit มีเหตุผล · ยืนยันซ้ำไม่เพิ่มแถว', async () => {
    const before = await queries.listSettingAssumptions(ORG_ID)
    expect(before.every((row) => !row.confirmed)).toBe(true)

    const confirmed = await queries.confirmSettingAssumption(context('สำนักงานบัญชียืนยันทางอีเมล 07/10/2569'), 'wht_base')
    expect(confirmed).toMatchObject({ key: 'wht_base', confirmed: true, confirmedByName: 'บัญชี U140' })

    const audit = await db().auditLog.findFirst({
      where: { organizationId: ORG_ID, targetType: 'setting_assumption_confirmations' },
      orderBy: { createdAt: 'desc' },
    })
    expect(audit?.reason).toContain('อีเมล')

    const again = await queries.confirmSettingAssumption(context('กดซ้ำ'), 'wht_base')
    expect(again.reason).toBe('สำนักงานบัญชียืนยันทางอีเมล 07/10/2569')
    expect(await db().settingAssumptionConfirmation.count({ where: { organizationId: ORG_ID } })).toBe(1)

    const after = await queries.listSettingAssumptions(ORG_ID)
    expect(after.filter((row) => row.confirmed).map((row) => row.key)).toEqual(['wht_base'])
  })

  it('DB ห้ามแก้/ลบบันทึกการยืนยัน · เหตุผลว่างผิด CHECK', async () => {
    await expect(
      db().settingAssumptionConfirmation.updateMany({ where: { organizationId: ORG_ID }, data: { reason: 'แก้ทับ' } }),
    ).rejects.toThrow()
    await expect(db().settingAssumptionConfirmation.deleteMany({ where: { organizationId: ORG_ID } })).rejects.toThrow()
    await expect(
      db().settingAssumptionConfirmation.create({
        data: { organizationId: ORG_ID, assumptionKey: 'holidays', reason: '  ', confirmedBy: USER_ID },
      }),
    ).rejects.toThrow()
  })

  it('มติ PO U170 (BUG-180) — หน้ารวมได้ทุกรายการ + ค่าที่ใช้อยู่จาก query เดิม + สถานะยืนยันตรงกับป้าย', async () => {
    const overview = await queries.listSettingAssumptionOverview(ORG_ID)
    const statuses = await queries.listSettingAssumptions(ORG_ID)
    expect(overview.map((row) => row.key)).toEqual(statuses.map((row) => row.key))
    expect(overview.every((row) => row.currentValue.length > 0)).toBe(true)
    expect(overview.map((row) => row.confirmed)).toEqual(statuses.map((row) => row.confirmed))
    // องค์กรทดสอบไม่มีแถวค่าตั้ง ⇒ ค่าเริ่มต้นตามมติ (เพดานค่าธรรมเนียม ฿50 · ยื่นออนไลน์)
    expect(overview.find((row) => row.key === 'bank_fee_write_off')?.currentValue).toBe('เพดาน ฿50.00')
    expect(overview.find((row) => row.key === 'wht_filing_method')?.currentValue).toContain('ออนไลน์')
  })
})
