import { PrismaPg } from '@prisma/adapter-pg'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import type { SessionUser } from '@/lib/auth/types'
import { PrismaClient } from '@/lib/generated/prisma/client'

/**
 * มติ D7-01 (mytester7 S7-AG2-02/03/04) — กติกาแก้ช่วงอัตรา VAT ที่ service (ตัวบังคับจริง ไม่ใช่แค่หน้าจอ)
 *  · ช่วงที่มีรายได้อ้าง: เปลี่ยนอัตรา/ย่นช่วงจนรายได้หลุด ⇒ `VAT_RATE_IN_USE`
 *  · แก้วันสิ้นสุดเป็นก่อนวันนี้ (เวลาไทย) ⇒ `VAT_RATE_END_DATE_PAST`
 *  · บันทึกแล้วเกิดช่องว่าง ⇒ `VAT_RATE_GAP`
 *  · ข้อความ `VAT_RATE_OVERLAP` แสดงช่วงเดิมตามวันสิ้นสุดจริง
 *
 * ⚠️ ตั้ง `DATABASE_URL = TEST_DATABASE_URL` ก่อน import service
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

const ORG_ID = '00000000-0000-4000-8000-0000000d7010'
const ROLE_ID = '00000000-0000-4000-8000-0000000d7011'
const USER_ID = '00000000-0000-4000-8000-0000000d7012'
const TEAM_ID = '00000000-0000-4000-8000-0000000d7013'
const COMPANY_ID = '00000000-0000-4000-8000-0000000d7014'

/** 19/10/2569 10:00 เวลาไทย */
const NOW = new Date('2026-10-19T03:00:00Z')

let client: PrismaClient | null = null
let vat: typeof import('@/lib/settings/queries/vat-rates')

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
  id: USER_ID,
  organizationId: ORG_ID,
  supabaseUid: 'uid-vat-d701',
  email: 'vat-d701@test.local',
  fullName: 'ผู้ดูแล VAT',
  status: 'active',
  roleId: ROLE_ID,
  roleName: 'Superadmin',
  roleGroup: 'system',
  isSuperadmin: true,
  teamId: null,
  companyId: null,
  capabilities: {},
  scope: { kind: 'global', teamIds: [], companyId: null, userId: USER_ID },
  loginAt: new Date().toISOString(),
}

const ctx = { actor: admin, meta, reason: 'ทดสอบกติกาช่วงอัตรา VAT' }

function codeOf(error: unknown): string {
  return (error as { code?: string }).code ?? String(error)
}

const day = (iso: string): Date => new Date(`${iso}T00:00:00Z`)

async function cleanup(): Promise<void> {
  await db().$executeRawUnsafe(`DELETE FROM revenues WHERE organization_id = '${ORG_ID}'`)
  await db().$executeRawUnsafe(`DELETE FROM cases WHERE organization_id = '${ORG_ID}'`)
  await db().$executeRawUnsafe(`DELETE FROM vat_rate_history WHERE organization_id = '${ORG_ID}'`)
}

let seq = 0

async function seedRevenue(revenueDate: string): Promise<void> {
  seq += 1
  const caseRef = `VATD701-${seq}-${Date.now()}`
  await db().$executeRawUnsafe(`
    WITH new_case AS (
      INSERT INTO cases (
        organization_id, case_ref, case_ref_normalized, company_id, source, status, created_by,
        debtor_name, addr_province, addr_district, asset_kind, asset_description,
        debt_amount_satang, assigned_team_id, outcome, closed_at,
        service_fee_model_snapshot, service_fee_base_satang, service_fee_rate_pct, service_fee_basis_snapshot
      ) VALUES (
        '${ORG_ID}', $$${caseRef}$$, $$${caseRef}$$, '${COMPANY_ID}', 'manual', 'closed_success', '${USER_ID}',
        'ลูกหนี้ ${seq}', 'เชียงใหม่', 'เมือง', 'smartphone', 'iPhone 15',
        1000000, '${TEAM_ID}', 'closed_success', '${revenueDate}T03:00:00Z',
        'SUCCESS_FEE', 0, 10, 'debt_amount'
      ) RETURNING id
    )
    INSERT INTO revenues (organization_id, case_id, company_id, gross_satang, vat_satang, vat_rate_pct_used,
                          total_satang, fee_model_snapshot, vat_mode_snapshot, status, revenue_date, created_by)
    SELECT '${ORG_ID}', id, '${COMPANY_ID}', 100000, 7000, 7.00, 107000, 'SUCCESS_FEE', 'exclude_vat', 'ready_for_billing',
           '${revenueDate}', '${USER_ID}'
    FROM new_case
  `)
}

async function seedOpenSevenPercent(): Promise<Awaited<ReturnType<typeof vat.createVatRate>>> {
  return vat.createVatRate(ctx, { ratePct: 7, effectiveFrom: day('2025-10-01'), effectiveTo: null, note: null }, NOW)
}

suite('ช่วงอัตรา VAT ที่ถูกใช้แล้ว — ห้ามแก้ย้อนหลัง + ห้ามช่องว่าง (มติ D7-01)', () => {
  beforeAll(async () => {
    process.env.DATABASE_URL = url
    vat = await import('@/lib/settings/queries/vat-rates')
    await db().$executeRawUnsafe(`
      INSERT INTO organizations (id, name, tax_id, address)
      VALUES ('${ORG_ID}', 'VatD701', '9999999970100', 'ที่อยู่ทดสอบ D7-01') ON CONFLICT (id) DO NOTHING
    `)
    await db().$executeRawUnsafe(`
      INSERT INTO roles (id, organization_id, name, role_group, is_seed)
      VALUES ('${ROLE_ID}', '${ORG_ID}', 'ผู้ดูแล D7-01', 'system', false) ON CONFLICT (id) DO NOTHING
    `)
    await db().$executeRawUnsafe(`
      INSERT INTO users (id, organization_id, role_id, email, full_name, status)
      VALUES ('${USER_ID}', '${ORG_ID}', '${ROLE_ID}', 'vat-d701@test.local', 'ผู้ดูแล VAT', 'active')
      ON CONFLICT (id) DO NOTHING
    `)
    await db().$executeRawUnsafe(`
      INSERT INTO teams (id, organization_id, name, side, provinces, status, created_by)
      VALUES ('${TEAM_ID}', '${ORG_ID}', 'ทีม D7-01', 'outsource', ARRAY['เชียงใหม่'], 'active', '${USER_ID}')
      ON CONFLICT (id) DO NOTHING
    `)
    await db().$executeRawUnsafe(`
      INSERT INTO finance_companies (id, organization_id, name, short_name, tax_id, vat_mode, created_by)
      VALUES ('${COMPANY_ID}', '${ORG_ID}', 'ไฟแนนซ์ D7-01', 'D701', '0105512770001', 'exclude_vat', '${USER_ID}')
      ON CONFLICT (id) DO NOTHING
    `)
  })

  beforeEach(cleanup)

  afterAll(async () => {
    if (url) await cleanup()
    await client?.$disconnect()
  })

  it('S7-AG2-02: เปลี่ยนอัตราของช่วงที่มีรายได้ (17/10/2569) ⇒ VAT_RATE_IN_USE · อัตราในฐานไม่เปลี่ยน', async () => {
    const current = await seedOpenSevenPercent()
    await seedRevenue('2026-10-17')
    await expect(
      vat.updateVatRate(ctx, current, { ratePct: 7.5, effectiveFrom: day('2025-10-01'), effectiveTo: null, note: null }, NOW),
    ).rejects.toSatisfy((error: unknown) => codeOf(error) === 'VAT_RATE_IN_USE')
    const row = await db().vatRateHistory.findUniqueOrThrow({ where: { id: current.id } })
    expect(row.ratePct.toNumber()).toBe(7)
  })

  it('S7-AG2-02: ปิดช่วงที่ 16/10/2569 (ก่อนวันนี้) ⇒ VAT_RATE_END_DATE_PAST', async () => {
    const current = await seedOpenSevenPercent()
    await seedRevenue('2026-10-17')
    await expect(
      vat.updateVatRate(
        ctx,
        current,
        { ratePct: 7, effectiveFrom: day('2025-10-01'), effectiveTo: day('2026-10-16'), note: null },
        NOW,
      ),
    ).rejects.toSatisfy((error: unknown) => codeOf(error) === 'VAT_RATE_END_DATE_PAST')
  })

  it('เลื่อนวันเริ่มเกินวันที่ของรายได้ ⇒ VAT_RATE_IN_USE · รายได้ที่ลบแล้วไม่นับ', async () => {
    const current = await seedOpenSevenPercent()
    await seedRevenue('2026-10-17')
    await expect(
      vat.updateVatRate(ctx, current, { ratePct: 7, effectiveFrom: day('2026-10-18'), effectiveTo: null, note: null }, NOW),
    ).rejects.toSatisfy((error: unknown) => codeOf(error) === 'VAT_RATE_IN_USE')

    await db().$executeRawUnsafe(`UPDATE revenues SET deleted_at = NOW() WHERE organization_id = '${ORG_ID}'`)
    const updated = await vat.updateVatRate(
      ctx,
      current,
      { ratePct: 7.5, effectiveFrom: day('2025-10-01'), effectiveTo: null, note: null },
      NOW,
    )
    expect(updated.ratePct).toBe(7.5)
  })

  it('S2: ปิดช่วงเดิม 31/10/2569 แล้วเพิ่ม 10% เริ่ม 01/11/2569 ⇒ ผ่าน', async () => {
    const current = await seedOpenSevenPercent()
    await seedRevenue('2026-10-17')
    await vat.updateVatRate(
      ctx,
      current,
      { ratePct: 7, effectiveFrom: day('2025-10-01'), effectiveTo: day('2026-10-31'), note: null },
      NOW,
    )
    const next = await vat.createVatRate(
      ctx,
      { ratePct: 10, effectiveFrom: day('2026-11-01'), effectiveTo: null, note: null },
      NOW,
    )
    expect(next.ratePct).toBe(10)
  })

  it('S7-AG2-03: ปิด 30/10 แล้วเพิ่ม 10% เริ่ม 01/11 ⇒ VAT_RATE_GAP ระบุวันที่ 31/10/2569', async () => {
    const current = await seedOpenSevenPercent()
    await vat.updateVatRate(
      ctx,
      current,
      { ratePct: 7, effectiveFrom: day('2025-10-01'), effectiveTo: day('2026-10-30'), note: null },
      NOW,
    )
    const error = await vat
      .createVatRate(ctx, { ratePct: 10, effectiveFrom: day('2026-11-01'), effectiveTo: null, note: null }, NOW)
      .catch((caught: unknown) => caught)
    expect(codeOf(error)).toBe('VAT_RATE_GAP')
    expect((error as { userMessage?: string }).userMessage).toContain('31/10/2569')
  })

  it('S7-AG2-04: ข้อความ VAT_RATE_OVERLAP แสดงวันสิ้นสุดจริงของช่วงเดิม', async () => {
    const current = await seedOpenSevenPercent()
    await vat.updateVatRate(
      ctx,
      current,
      { ratePct: 7, effectiveFrom: day('2025-10-01'), effectiveTo: day('2026-10-31'), note: null },
      NOW,
    )
    const error = await vat
      .createVatRate(ctx, { ratePct: 10, effectiveFrom: day('2026-10-01'), effectiveTo: null, note: null }, NOW)
      .catch((caught: unknown) => caught)
    expect(codeOf(error)).toBe('VAT_RATE_OVERLAP')
    expect((error as { userMessage?: string }).userMessage).toContain('7% (01/10/2568–31/10/2569)')
  })
})
