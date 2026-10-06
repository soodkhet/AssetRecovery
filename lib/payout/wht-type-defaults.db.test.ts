import { PrismaPg } from '@prisma/adapter-pg'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import type { SessionUser } from '@/lib/auth/types'
import { PrismaClient } from '@/lib/generated/prisma/client'

/**
 * เทสต์ระดับ DB — Tax Profile ค่าเริ่มต้นตามประเภทผู้รับ + ไม่มีอัตราไม่ 500 (มติ PO 06/10/2569 U121)
 *
 *  - บั๊ก: รายการนอกฐาน WHT ของผู้รับที่ไม่มี Tax Profile และไม่มีแผน ⇒ สร้างรอบได้ (เดิม RangeError → 500)
 *  - ไม่มีอัตราเลย (ในฐาน) ⇒ บล็อกด้วย `WHT_RATE_MISSING` พร้อมรายชื่อ
 *  - ค่าเริ่มต้นตามประเภท (outsource × บุคคลธรรมดา) ⇒ คิดภาษีได้ · snapshot Tax Profile ที่ใช้จริงลงรายการ
 *    + ชุดค่าเริ่มต้นลงรอบ · แก้ค่าตั้งภายหลังรอบเดิมไม่ขยับ · audit before/after + reason
 *  - อ้าง Tax Profile ข้ามองค์กร/ไม่มีจริง ⇒ `TAX_PROFILE_NOT_FOUND` · ปิดใช้งาน profile ที่เป็นค่าเริ่มต้น ⇒ `TAX_PROFILE_IN_USE`
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
if (!url) {
  console.warn('[wht-type-defaults.db.test] ข้ามเทสต์ระดับ DB — ไม่มี TEST_DATABASE_URL (ดู .env.example)')
}

const ORG_ID = '00000000-0000-4000-8000-000000121a00'
const ROLE_ID = '00000000-0000-4000-8000-000000121a01'
const ADMIN_ID = '00000000-0000-4000-8000-000000121a02'
const AGENT_ID = '00000000-0000-4000-8000-000000121a03'
const TEAM_ID = '00000000-0000-4000-8000-000000121a04'
const PROFILE_3_ID = '00000000-0000-4000-8000-000000121a05'
const PROFILE_5_ID = '00000000-0000-4000-8000-000000121a06'
const PAYEE_ID = '00000000-0000-4000-8000-000000121a07'
const OTHER_ORG_PROFILE_ID = '00000000-0000-4000-8000-000000121a08'
const OTHER_ORG_ID = '00000000-0000-4000-8000-000000121a09'

const NOW = new Date('2026-10-07T03:00:00Z')
const CUTOFF = new Date(Date.UTC(2026, 9, 6))

let client: PrismaClient | null = null
let payout: typeof import('@/lib/payout/queries')
let defaults: typeof import('@/lib/settings/queries/tax-profile-defaults')
let taxProfiles: typeof import('@/lib/settings/queries/tax-profiles')

function db(): PrismaClient {
  if (!url) throw new Error('ไม่มี TEST_DATABASE_URL')
  if (!client) {
    assertLocalTestDatabase(url)
    client = new PrismaClient({ adapter: new PrismaPg({ connectionString: url }) })
  }
  return client
}

const meta = { ipAddress: null, userAgent: null }

const admin: SessionUser = {
  id: ADMIN_ID,
  organizationId: ORG_ID,
  supabaseUid: 'uid-admin-121',
  email: 'admin121@test.local',
  fullName: 'ผู้ดูแล U121',
  status: 'active',
  roleId: ROLE_ID,
  roleName: 'Superadmin',
  roleGroup: 'system',
  isSuperadmin: true,
  teamId: null,
  companyId: null,
  capabilities: {},
  scope: { kind: 'global', teamIds: [], companyId: null, userId: ADMIN_ID },
  loginAt: new Date().toISOString(),
}

const ctx = { actor: admin, meta, now: NOW }
const settingsCtx = (reason: string) => ({ actor: admin, meta, reason })

function codeOf(error: unknown): string {
  return (error as { code?: string }).code ?? String(error)
}

/** รายการเบิกที่อนุมัติแล้ว **ไม่มีแผน** (แบบ Manual Claim / ค่าที่พัก) */
async function seedPlanlessExpense(type: string, grossSatang: number): Promise<void> {
  await db().$executeRawUnsafe(`
    INSERT INTO expenses (organization_id, payee_id, expense_type, gross_satang, expense_date, status,
                          receipt_file_url, receipt_file_hash, created_by)
    VALUES ('${ORG_ID}', '${PAYEE_ID}', '${type}', ${grossSatang}, '2026-10-05', 'approved',
            'field/receipts/ok.jpg', 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', '${ADMIN_ID}')
  `)
}

async function reset(): Promise<void> {
  for (const statement of [
    `DELETE FROM payout_batch_items WHERE organization_id = '${ORG_ID}'`,
    `DELETE FROM payout_batches WHERE organization_id = '${ORG_ID}'`,
    `DELETE FROM expenses WHERE organization_id = '${ORG_ID}'`,
    `DELETE FROM tax_profile_default_history WHERE organization_id = '${ORG_ID}'`,
    `UPDATE tax_profiles SET deleted_at = NULL WHERE organization_id = '${ORG_ID}'`,
  ]) {
    await db().$executeRawUnsafe(statement)
  }
}

beforeAll(async () => {
  if (!url) return
  process.env.DATABASE_URL = url
  payout = await import('@/lib/payout/queries')
  defaults = await import('@/lib/settings/queries/tax-profile-defaults')
  taxProfiles = await import('@/lib/settings/queries/tax-profiles')

  const tx = db()
  await tx.$executeRawUnsafe(`
    INSERT INTO organizations (id, name, tax_id, address) VALUES
      ('${ORG_ID}', 'U121Test', '9999999912100', 'ที่อยู่ทดสอบ U121'),
      ('${OTHER_ORG_ID}', 'U121Other', '9999999912101', 'ที่อยู่องค์กรอื่น')
    ON CONFLICT (id) DO NOTHING
  `)
  await tx.$executeRawUnsafe(`
    INSERT INTO roles (id, organization_id, name, role_group, is_seed)
    VALUES ('${ROLE_ID}', '${ORG_ID}', 'ทดสอบ U121', 'system', false) ON CONFLICT (id) DO NOTHING
  `)
  await tx.$executeRawUnsafe(`
    INSERT INTO users (id, organization_id, role_id, email, full_name, status) VALUES
      ('${ADMIN_ID}', '${ORG_ID}', '${ROLE_ID}', 'admin121@test.local', 'ผู้ดูแล U121', 'active'),
      ('${AGENT_ID}', '${ORG_ID}', '${ROLE_ID}', 'agent121@test.local', 'ผู้รับไม่มีอัตรา', 'active')
    ON CONFLICT (id) DO NOTHING
  `)
  await tx.$executeRawUnsafe(`
    INSERT INTO teams (id, organization_id, name, side, provinces, status, created_by)
    VALUES ('${TEAM_ID}', '${ORG_ID}', 'ทีมนอก U121', 'outsource', ARRAY['ลำพูน'], 'active', '${ADMIN_ID}')
    ON CONFLICT (id) DO NOTHING
  `)
  await tx.$executeRawUnsafe(`UPDATE users SET team_id = '${TEAM_ID}' WHERE id = '${AGENT_ID}'`)
  await tx.$executeRawUnsafe(`
    INSERT INTO tax_profiles (id, organization_id, name, wht_pct, wht_basis, wht_min_threshold_satang, created_by) VALUES
      ('${PROFILE_3_ID}', '${ORG_ID}', 'Outsource บุคคลธรรมดา 3% (U121)', 3.00, 'before_vat', 100000, '${ADMIN_ID}'),
      ('${PROFILE_5_ID}', '${ORG_ID}', 'ทดลอง 5% (U121)', 5.00, 'before_vat', 100000, '${ADMIN_ID}')
    ON CONFLICT (id) DO NOTHING
  `)
  await tx.$executeRawUnsafe(`
    INSERT INTO users (id, organization_id, role_id, email, full_name, status)
    VALUES ('00000000-0000-4000-8000-000000121a10', '${OTHER_ORG_ID}', '${ROLE_ID}', 'other121@test.local', 'อื่น', 'active')
    ON CONFLICT (id) DO NOTHING
  `)
  await tx.$executeRawUnsafe(`
    INSERT INTO tax_profiles (id, organization_id, name, wht_pct, wht_basis, wht_min_threshold_satang, created_by)
    VALUES ('${OTHER_ORG_PROFILE_ID}', '${OTHER_ORG_ID}', 'องค์กรอื่น 3%', 3.00, 'before_vat', 100000,
            '00000000-0000-4000-8000-000000121a10')
    ON CONFLICT (id) DO NOTHING
  `)
  // ผู้รับ 40(8) บุคคลธรรมดา ฝั่ง outsource **ไม่ผูก Tax Profile**
  await tx.$executeRawUnsafe(`
    INSERT INTO payee_profiles (id, organization_id, user_id, payee_type, tax_profile_id, bank_name,
                                account_name, account_number, national_id, is_verified, created_by)
    VALUES ('${PAYEE_ID}', '${ORG_ID}', '${AGENT_ID}', 'individual', NULL, 'ธนาคารกสิกรไทย',
            'ผู้รับไม่มีอัตรา', '1234567890', '1100000012101', true, '${ADMIN_ID}')
    ON CONFLICT (id) DO NOTHING
  `)
})

afterAll(async () => {
  if (url) await reset()
  await client?.$disconnect()
})

beforeEach(async () => {
  if (url) await reset()
})

suite('U121 — รอบจ่ายเมื่อผู้รับไม่มี Tax Profile', () => {
  it('รายการนอกฐาน (ค่าที่พัก ไม่มีแผน) ⇒ สร้างรอบได้ จ่ายเต็ม ไม่หัก (เดิม 500)', async () => {
    await seedPlanlessExpense('hotel', 160_000)
    const { batch } = await payout.createPayoutBatch(ctx, { side: 'outsource', cutoffDate: CUTOFF, name: null })
    expect(batch.whtSatang).toBe(0)
    expect(batch.netSatang).toBe(160_000)
    expect(batch.items[0]?.whtBaseIncluded).toBe(false)
  })

  it('รายการในฐานที่ไม่มีอัตราเลย ⇒ WHT_RATE_MISSING พร้อมรายชื่อ (ไม่ 500 · ไม่เดาอัตรา)', async () => {
    await seedPlanlessExpense('commission', 200_000)
    await expect(payout.createPayoutBatch(ctx, { side: 'outsource', cutoffDate: CUTOFF, name: null })).rejects.toSatisfy(
      (error: unknown) =>
        codeOf(error) === 'WHT_RATE_MISSING' &&
        JSON.stringify((error as { context?: unknown }).context).includes('ผู้รับไม่มีอัตรา'),
    )
    expect(await db().payoutBatch.count({ where: { organizationId: ORG_ID } })).toBe(0)
  })

  it('ค่าเริ่มต้นตามประเภท ⇒ คิดภาษีได้ · snapshot Tax Profile ที่ใช้จริง + ชุดค่าเริ่มต้น · แก้ภายหลังรอบเดิมไม่ขยับ', async () => {
    const first = await defaults.createTaxProfileDefaults(settingsCtx('ตั้งค่าเริ่มต้น outsource บุคคลธรรมดา 3%'), {
      inhouseIndividual: null,
      inhouseCorporate: null,
      outsourceIndividual: PROFILE_3_ID,
      outsourceCorporate: null,
    })
    await seedPlanlessExpense('commission', 200_000)
    const { batch, warning } = await payout.createPayoutBatch(ctx, { side: 'outsource', cutoffDate: CUTOFF, name: null })
    expect(warning).toBeUndefined() // ค่าเริ่มต้นนับเป็นฝั่ง payee — ไม่ใช่ fallback แผน
    expect(batch.whtSatang).toBe(6_000)
    expect(batch.items[0]?.taxProfileId).toBe(PROFILE_3_ID)
    expect(batch.items[0]?.whtPctSnapshot).toBe(3)
    const row = await db().payoutBatch.findUniqueOrThrow({ where: { id: batch.id } })
    expect(row.taxProfileDefaultId).toBe(first.id)

    // เปลี่ยนค่าเริ่มต้นเป็น 5% ⇒ รอบเดิมคงเดิม (snapshot) · audit มี before/after + reason
    const second = await defaults.createTaxProfileDefaults(settingsCtx('ทดลองเปลี่ยนเป็น 5%'), {
      inhouseIndividual: null,
      inhouseCorporate: null,
      outsourceIndividual: PROFILE_5_ID,
      outsourceCorporate: null,
    })
    const again = await payout.getPayoutBatch(admin, batch.id)
    expect(again.whtSatang).toBe(6_000)
    expect(again.items[0]?.taxProfileId).toBe(PROFILE_3_ID)
    expect(again.items[0]?.whtPctSnapshot).toBe(3)

    const audit = await db().auditLog.findFirstOrThrow({
      where: { organizationId: ORG_ID, targetType: 'tax_profile_default_history', targetId: second.id },
    })
    expect(audit.reason).toBe('ทดลองเปลี่ยนเป็น 5%')
    expect(audit.beforeData).toMatchObject({ outsource_individual_tax_profile_id: PROFILE_3_ID })
    expect(audit.afterData).toMatchObject({ outsource_individual_tax_profile_id: PROFILE_5_ID })

    const overview = await defaults.getTaxProfileDefaultsOverview(ORG_ID)
    expect(overview.current?.id).toBe(second.id)
    expect(overview.current?.slots.outsourceIndividual?.whtPct).toBe(5)
    expect(overview.history).toHaveLength(2)
  })

  it('อ้าง Tax Profile ขององค์กรอื่น ⇒ TAX_PROFILE_NOT_FOUND · ปิดใช้งาน profile ที่เป็นค่าเริ่มต้น ⇒ TAX_PROFILE_IN_USE', async () => {
    await expect(
      defaults.createTaxProfileDefaults(settingsCtx('ข้ามองค์กร'), {
        inhouseIndividual: OTHER_ORG_PROFILE_ID,
        inhouseCorporate: null,
        outsourceIndividual: null,
        outsourceCorporate: null,
      }),
    ).rejects.toSatisfy((error: unknown) => codeOf(error) === 'TAX_PROFILE_NOT_FOUND')

    await defaults.createTaxProfileDefaults(settingsCtx('ตั้งค่าเริ่มต้น'), {
      inhouseIndividual: null,
      inhouseCorporate: null,
      outsourceIndividual: PROFILE_5_ID,
      outsourceCorporate: null,
    })
    const current = await taxProfiles.getTaxProfile(ORG_ID, PROFILE_5_ID)
    await expect(taxProfiles.deleteTaxProfile(settingsCtx('เลิกใช้'), current)).rejects.toSatisfy(
      (error: unknown) => codeOf(error) === 'TAX_PROFILE_IN_USE',
    )
  })
})
