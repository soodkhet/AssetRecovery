import { randomUUID } from 'node:crypto'
import { PrismaPg } from '@prisma/adapter-pg'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import type { SessionUser } from '@/lib/auth/types'
import { PrismaClient } from '@/lib/generated/prisma/client'
import type { PayeeFieldsInput } from '@/lib/payees/schemas'
import { putFakeUpload, resetFakeUploads, sampleBytes, sha256Of, uploadTestState } from '@/tests/helpers/fake-uploads'

// ห้ามยิง Supabase จริง (Rule 07) — สลับ `realVerify` เพื่อใช้ตัวตรวจไฟล์จริงกับไฟล์ใน Storage ตัวแทน
vi.mock('@/lib/uploads/storage', async () => (await import('@/tests/helpers/fake-uploads')).fakeStorageModule())
vi.mock('@/lib/uploads/verify', async () => (await import('@/tests/helpers/fake-uploads')).fakeVerifyModule())

/**
 * เทสต์ระดับ DB — มติ PO 07/10/2569 (Final ด่าน 5 ND-8/9/10/11)
 *
 *  · U143 ใบเสร็จเบิกด้วยมือ/เคลียร์เงินทดรอง = ไฟล์ที่อัปโหลดผ่าน server เท่านั้น (ตรวจไฟล์ + SHA-256) · path พิมพ์เอง
 *    = ปฏิเสธ · ไม่มีไฟล์ = ใบรับรองแทนใบเสร็จ · ข้อมูลเก่าที่ไม่ผ่านการตรวจ = Export/คิวอนุมัติถือว่าไม่มีไฟล์ · CHECK ระดับ DB
 *  · U150 เอกสารยืนยันตัวตนผู้รับเงิน = อัปโหลดจริง (hash) · URL เก่า = ไม่ผ่านเกตยืนยัน · สิทธิ์เปิดไฟล์ (เจ้าของ/การเงิน)
 *  · U152 คิวอนุมัติเห็นหมายเหตุ · คำชี้แจงตอนส่งใหม่ · ใบเสร็จ (ตรวจแล้ว) · ผู้พักร่วม · ผู้บันทึกแทน + สิทธิ์เปิดใบเสร็จตาม scope
 *  · U153 บันทึกเบิก/ขอเงินทดรองแทนผู้อื่น — เฉพาะผู้มีสิทธิ์ · audit ระบุผู้บันทึก (actor) และผู้รับ (on_behalf_of_user_id)
 *
 * ⚠️ ต้องตั้ง `DATABASE_URL = TEST_DATABASE_URL` **ก่อน** import service (กับดัก 2026-08-14)
 */

/** audit ลบไม่ได้ (immutable) ⇒ ใบเสร็จที่ใช้เคลียร์เงินทดรองค้างข้ามรอบเทสต์ — เนื้อไฟล์ต้องไม่ซ้ำต่อรอบ (R5-001) */
const RUN = randomUUID().slice(0, 8)
const url = process.env.TEST_DATABASE_URL

function assertLocalTestDatabase(connectionString: string): void {
  const parsed = new URL(connectionString)
  const isLocal = ['localhost', '127.0.0.1', '::1', 'postgres'].includes(parsed.hostname)
  if (!isLocal || !parsed.pathname.includes('test')) {
    throw new Error(`TEST_DATABASE_URL ต้องเป็น DB ทดสอบบนเครื่อง/CI เท่านั้น (host=${parsed.hostname}) — Rule 07`)
  }
}

const suite = url ? describe : describe.skip

const ORG_ID = '00000000-0000-4000-8000-0000001430a0'
const ROLE_MANAGER = '00000000-0000-4000-8000-0000001430a1'
const ROLE_FINANCE = '00000000-0000-4000-8000-0000001430a2'
const ROLE_AGENT = '00000000-0000-4000-8000-0000001430a3'
const MANAGER_ID = '00000000-0000-4000-8000-0000001430a4'
const FINANCE_ID = '00000000-0000-4000-8000-0000001430a5'
const AGENT_ID = '00000000-0000-4000-8000-0000001430a6'
const AGENT_2_ID = '00000000-0000-4000-8000-0000001430a7'
const MANAGER_2_ID = '00000000-0000-4000-8000-0000001430a8'
const TEAM_ID = '00000000-0000-4000-8000-0000001430a9'
const OTHER_TEAM_ID = '00000000-0000-4000-8000-0000001430aa'
const MATRIX_ID = '00000000-0000-4000-8000-0000001430ab'
const TAX_PROFILE_ID = '00000000-0000-4000-8000-0000001430ac'

const MANAGER_ROLE = 'ผู้จัดการทีมติดตามทรัพย์'
const FINANCE_ROLE = 'การเงิน'

let client: PrismaClient | null = null
let claims: typeof import('@/lib/claims/queries')
let advances: typeof import('@/lib/advances/queries')
let approvals: typeof import('@/lib/compensation/approval-queries')
let payees: typeof import('@/lib/payees/queries')
let access: typeof import('@/lib/uploads/access')
let fieldExpenses: typeof import('@/lib/field/expense-queries')

function db(): PrismaClient {
  if (!url) throw new Error('ไม่มี TEST_DATABASE_URL')
  if (!client) {
    assertLocalTestDatabase(url)
    client = new PrismaClient({ adapter: new PrismaPg({ connectionString: url }) })
  }
  return client
}

const meta = { ipAddress: null, userAgent: null }

function sessionUser(overrides: Partial<SessionUser> & Pick<SessionUser, 'id'>): SessionUser {
  return {
    organizationId: ORG_ID,
    supabaseUid: `uid-${overrides.id}`,
    email: `${overrides.id}@test.local`,
    fullName: 'ผู้ทดสอบ U143',
    status: 'active',
    roleId: ROLE_AGENT,
    roleName: 'พนักงานติดตามทรัพย์ U143',
    roleGroup: 'inhouse',
    isSuperadmin: false,
    teamId: TEAM_ID,
    companyId: null,
    capabilities: {},
    scope: { kind: 'self', teamIds: [], companyId: null, userId: overrides.id },
    loginAt: new Date().toISOString(),
    ...overrides,
  }
}

/** การเงิน — บันทึกเบิกแทนได้ (`approve_expense_finance`) · ผู้รับเงิน `manage` · ขอเงินทดรองได้แค่ `view` (`25` §7.2) */
const finance = sessionUser({
  id: FINANCE_ID,
  roleId: ROLE_FINANCE,
  roleName: FINANCE_ROLE,
  roleGroup: 'system',
  teamId: null,
  capabilities: {
    approve_expense_finance: 'manage',
    manage_payee_profile: 'manage',
    approve_advance: 'manage',
    request_advance: 'view',
  },
  scope: { kind: 'global', teamIds: [], companyId: null, userId: FINANCE_ID },
})
/** role ที่ตั้งให้ขอเงินทดรองได้ด้วย (`manage:request_advance` + `manage:approve_advance`) — ขอแทนผู้อื่นได้ */
const financeRequester = sessionUser({
  ...finance,
  capabilities: { ...finance.capabilities, request_advance: 'manage' },
})
const manager = sessionUser({
  id: MANAGER_ID,
  roleId: ROLE_MANAGER,
  roleName: MANAGER_ROLE,
  teamId: null,
  capabilities: { approve_expense_manager: 'manage' },
  scope: { kind: 'team', teamIds: [TEAM_ID], companyId: null, userId: MANAGER_ID },
})
const otherManager = sessionUser({
  ...manager,
  id: MANAGER_2_ID,
  scope: { kind: 'team', teamIds: [OTHER_TEAM_ID], companyId: null, userId: MANAGER_2_ID },
})
const agentCapabilities = {
  perform_field_work: 'manage',
  request_advance: 'manage',
  manage_payee_profile: 'view',
} as const
const agent = sessionUser({ id: AGENT_ID, fullName: 'พนักงาน U143', capabilities: { ...agentCapabilities } })
const agent2 = sessionUser({ id: AGENT_2_ID, fullName: 'พนักงานสอง U143', capabilities: { ...agentCapabilities } })

function codeOf(error: unknown): string {
  return (error as { code?: string }).code ?? String(error)
}

async function expectCode(run: () => Promise<unknown>, code: string): Promise<void> {
  await expect(run()).rejects.toSatisfy((error: unknown) => codeOf(error) === code, `ต้องได้ error code ${code}`)
}

const receiptPathOf = (userId: string, name: string) => `expenses/${userId}/receipts/${name}`

function uploadPdf(path: string, payload: string): string {
  const bytes = sampleBytes('pdf', payload)
  putFakeUpload(path, bytes)
  return sha256Of(bytes)
}

async function payeeIdOf(userId: string): Promise<string> {
  const row = await db().payeeProfile.findFirstOrThrow({ where: { organizationId: ORG_ID, userId }, select: { id: true } })
  return row.id
}

async function reset(): Promise<void> {
  const tx = db()
  // `audit_logs` ลบไม่ได้ (immutable) ⇒ ตรวจโดยกรอง `target_id`
  await tx.$executeRawUnsafe(`DELETE FROM substitute_receipt_lines WHERE organization_id = '${ORG_ID}'`)
  await tx.$executeRawUnsafe(`DELETE FROM substitute_receipts WHERE organization_id = '${ORG_ID}'`)
  await tx.$executeRawUnsafe(`UPDATE advances SET payout_batch_item_id = NULL WHERE organization_id = '${ORG_ID}'`)
  await tx.$executeRawUnsafe(`DELETE FROM payout_batch_items WHERE organization_id = '${ORG_ID}'`)
  await tx.$executeRawUnsafe(`DELETE FROM payout_batches WHERE organization_id = '${ORG_ID}'`)
  await tx.$executeRawUnsafe(`DELETE FROM expenses WHERE organization_id = '${ORG_ID}'`)
  await tx.$executeRawUnsafe(`DELETE FROM advances WHERE organization_id = '${ORG_ID}'`)
  await tx.$executeRawUnsafe(
    `UPDATE payee_profiles SET id_document_url = NULL, id_document_hash = NULL, id_document_unverified = false,
       is_verified = false, verified_by = NULL, verified_at = NULL WHERE organization_id = '${ORG_ID}'`,
  )
  await tx.$executeRawUnsafe(
    `UPDATE finance_policy_settings SET require_payee_id_document = false WHERE organization_id = '${ORG_ID}'`,
  )
  resetFakeUploads()
}

beforeAll(async () => {
  if (!url) return
  process.env.DATABASE_URL = url
  claims = await import('@/lib/claims/queries')
  advances = await import('@/lib/advances/queries')
  approvals = await import('@/lib/compensation/approval-queries')
  payees = await import('@/lib/payees/queries')
  access = await import('@/lib/uploads/access')
  fieldExpenses = await import('@/lib/field/expense-queries')

  const tx = db()
  await tx.$executeRawUnsafe(`
    INSERT INTO organizations (id, name, tax_id, address)
    VALUES ('${ORG_ID}', 'U143Test', '9999999914300', 'ที่อยู่ทดสอบ U143') ON CONFLICT (id) DO NOTHING
  `)
  await tx.$executeRawUnsafe(`
    INSERT INTO roles (id, organization_id, name, role_group, is_seed) VALUES
      ('${ROLE_MANAGER}', '${ORG_ID}', '${MANAGER_ROLE}', 'inhouse', false),
      ('${ROLE_FINANCE}', '${ORG_ID}', '${FINANCE_ROLE}', 'system', false),
      ('${ROLE_AGENT}', '${ORG_ID}', 'พนักงานติดตามทรัพย์ U143', 'inhouse', false)
    ON CONFLICT (id) DO NOTHING
  `)

  await tx.$executeRawUnsafe(`
    INSERT INTO users (id, organization_id, role_id, email, full_name, status) VALUES
      ('${MANAGER_ID}', '${ORG_ID}', '${ROLE_MANAGER}', 'manager143@test.local', 'ผู้จัดการ U143', 'active'),
      ('${MANAGER_2_ID}', '${ORG_ID}', '${ROLE_MANAGER}', 'manager143b@test.local', 'ผู้จัดการทีมอื่น U143', 'active'),
      ('${FINANCE_ID}', '${ORG_ID}', '${ROLE_FINANCE}', 'finance143@test.local', 'การเงิน U143', 'active'),
      ('${AGENT_ID}', '${ORG_ID}', '${ROLE_AGENT}', 'agent143@test.local', 'พนักงาน U143', 'active'),
      ('${AGENT_2_ID}', '${ORG_ID}', '${ROLE_AGENT}', 'agent143b@test.local', 'พนักงานสอง U143', 'active')
    ON CONFLICT (id) DO NOTHING
  `)
  await tx.$executeRawUnsafe(`
    INSERT INTO teams (id, organization_id, name, side, provinces, status, created_by) VALUES
      ('${TEAM_ID}', '${ORG_ID}', 'ทีม U143', 'inhouse', ARRAY['ลำพูน'], 'active', '${MANAGER_ID}'),
      ('${OTHER_TEAM_ID}', '${ORG_ID}', 'ทีมอื่น U143', 'inhouse', ARRAY['ลำพูน'], 'active', '${MANAGER_ID}')
    ON CONFLICT (id) DO NOTHING
  `)
  await tx.$executeRawUnsafe(`UPDATE users SET team_id = '${TEAM_ID}' WHERE id = '${AGENT_ID}'`)
  await tx.$executeRawUnsafe(`UPDATE users SET team_id = '${OTHER_TEAM_ID}' WHERE id = '${AGENT_2_ID}'`)
  await tx.$executeRawUnsafe(`
    INSERT INTO tax_profiles (id, organization_id, name, wht_pct, wht_basis, wht_min_threshold_satang, created_by)
    VALUES ('${TAX_PROFILE_ID}', '${ORG_ID}', 'บุคคลธรรมดา 1% (U143)', 1.00, 'before_vat', 100000, '${FINANCE_ID}')
    ON CONFLICT (id) DO NOTHING
  `)
  await tx.$executeRawUnsafe(`
    INSERT INTO approval_matrices
      (id, organization_id, condition, condition_threshold_satang, approval_flow_role_ids, enforce_segregation_of_duties, created_by)
    VALUES ('${MATRIX_ID}', '${ORG_ID}', 'ปกติ U143', NULL, ARRAY['${ROLE_MANAGER}', '${ROLE_FINANCE}']::uuid[], false, '${FINANCE_ID}')
    ON CONFLICT (id) DO NOTHING
  `)
  await tx.$executeRawUnsafe(`
    INSERT INTO finance_policy_settings (organization_id, require_payee_id_document)
    VALUES ('${ORG_ID}', false) ON CONFLICT (organization_id) DO NOTHING
  `)
  // ผู้รับเงินของพนักงานสองคน (ตัวเลือก "บันทึกแทน")
  for (const userId of [AGENT_ID, AGENT_2_ID]) {
    await tx.$executeRawUnsafe(`
      INSERT INTO payee_profiles (organization_id, user_id, payee_type, created_by)
      VALUES ('${ORG_ID}', '${userId}', 'individual', '${FINANCE_ID}')
      ON CONFLICT (organization_id, user_id) DO NOTHING
    `)
  }
})

afterAll(async () => {
  if (url) {
    await reset()
    await db().$executeRawUnsafe(`DELETE FROM approval_matrices WHERE organization_id = '${ORG_ID}'`)
  }
  await client?.$disconnect()
})

beforeEach(async () => {
  if (url) await reset()
})

suite('มติ PO U143 — ใบเสร็จเบิกด้วยมือ = ไฟล์ที่ server ตรวจแล้ว', () => {
  it('ไฟล์ที่อัปโหลดจริงใต้ prefix ของผู้บันทึก ⇒ เก็บ path + SHA-256 ของ server · audit มี hash', async () => {
    uploadTestState.realVerify = true
    const path = receiptPathOf(AGENT_ID, 'k-own.pdf')
    const hash = uploadPdf(path, 'own-receipt')

    const created = await claims.createManualClaim({ actor: agent, meta }, {
      claimType: 'receipt',
      grossSatang: 45_000,
      expenseDate: new Date('2026-10-05T00:00:00Z'),
      payeeId: null,
      receiptFileUrl: path,
      note: 'ค่าจอดรถโรงพยาบาล',
    })
    const row = await db().expense.findUniqueOrThrow({
      where: { id: created.id },
      select: { receiptFileUrl: true, receiptFileHash: true, receiptFileUnverified: true },
    })
    expect(row).toEqual({ receiptFileUrl: path, receiptFileHash: hash, receiptFileUnverified: false })
    const audit = await db().auditLog.findFirstOrThrow({
      where: { organizationId: ORG_ID, targetType: 'expenses', targetId: created.id, action: 'create' },
      select: { actorId: true, afterData: true },
    })
    expect(audit.actorId).toBe(AGENT_ID)
    expect(audit.afterData).toMatchObject({ receipt_file_url: path, receipt_file_hash: hash, on_behalf_of_user_id: null })
  })

  it('path ที่พิมพ์เอง / ไม่ได้อัปโหลด / ไฟล์ของคนอื่น ⇒ ปฏิเสธ ไม่มีรายการเกิด', async () => {
    uploadTestState.realVerify = true
    const base = {
      claimType: 'receipt' as const,
      grossSatang: 45_000,
      expenseDate: new Date('2026-10-05T00:00:00Z'),
      payeeId: null,
      note: null,
    }
    await expectCode(
      () => claims.createManualClaim({ actor: agent, meta }, { ...base, receiptFileUrl: 'https://example.test/receipt.pdf' }),
      'UPLOAD_PATH_OUT_OF_SCOPE',
    )
    await expectCode(
      () => claims.createManualClaim({ actor: agent, meta }, { ...base, receiptFileUrl: receiptPathOf(AGENT_ID, 'never.pdf') }),
      'UPLOAD_FILE_NOT_FOUND',
    )
    const othersPath = receiptPathOf(AGENT_2_ID, 'theirs.pdf')
    uploadPdf(othersPath, 'theirs')
    await expectCode(
      () => claims.createManualClaim({ actor: agent, meta }, { ...base, receiptFileUrl: othersPath }),
      'UPLOAD_PATH_OUT_OF_SCOPE',
    )
    // ไฟล์ปลอม (ไม่ใช่รูป/PDF จริง)
    const fakePath = receiptPathOf(AGENT_ID, 'fake.pdf')
    putFakeUpload(fakePath, sampleBytes('text'))
    await expect(
      claims.createManualClaim({ actor: agent, meta }, { ...base, receiptFileUrl: fakePath }),
    ).rejects.toBeTruthy()
    expect(await db().expense.count({ where: { organizationId: ORG_ID } })).toBe(0)
  })

  it('ไม่มีทั้งใบเสร็จและใบรับรอง ⇒ REQUIRED_MISSING · ใช้ใบรับรองแทนใบเสร็จ ⇒ ออก CRT ผูกใบเบิกในทรานแซกชันเดียวกัน', async () => {
    const base = {
      claimType: 'manual' as const,
      grossSatang: 30_000,
      expenseDate: new Date('2026-10-05T00:00:00Z'),
      payeeId: null,
      receiptFileUrl: null,
      note: 'ค่าทางด่วน',
    }
    await expectCode(() => claims.createManualClaim({ actor: agent, meta }, base), 'REQUIRED_MISSING')

    const created = await claims.createManualClaim({ actor: agent, meta }, {
      ...base,
      substituteReceipt: {
        lines: [{ lineDate: new Date('2026-10-05T00:00:00Z'), description: 'ค่าทางด่วนขาไป', amountSatang: 30_000, note: null }],
      },
    })
    expect(created.substituteReceiptNumber).not.toBeNull()
    const crt = await db().substituteReceipt.findFirstOrThrow({
      where: { expenseId: created.id },
      select: { status: true, totalSatang: true },
    })
    expect(crt).toEqual({ status: 'pending_signature', totalSatang: 30_000 })
  })

  it('ข้อมูลเก่าที่เป็น path พิมพ์เอง: DB ยอมเฉพาะเมื่อทำเครื่องหมาย "ไม่ผ่านการตรวจ" · คิวอนุมัติถือว่าไม่มีไฟล์', async () => {
    const payeeId = await payeeIdOf(AGENT_ID)
    // ไม่มี hash + ไม่ทำเครื่องหมาย ⇒ CHECK ปฏิเสธ (กันเส้นใหม่เขียน path ที่ไม่ผ่านการตรวจ)
    await expect(
      db().$executeRawUnsafe(`
        INSERT INTO expenses (organization_id, payee_id, expense_type, gross_satang, expense_date, status,
                              calculation_source, receipt_file_url, created_by)
        VALUES ('${ORG_ID}', '${payeeId}', 'receipt', 10000, DATE '2026-10-05', 'pending_approval',
                'manual', 'expenses/typed/by-hand.pdf', '${AGENT_ID}')
      `),
    ).rejects.toThrow(/chk_expenses_receipt_verified/)

    const rows = await db().$queryRawUnsafe<{ id: string }[]>(`
      INSERT INTO expenses (organization_id, payee_id, expense_type, gross_satang, expense_date, status,
                            calculation_source, receipt_file_url, receipt_file_unverified, revision_note, created_by)
      VALUES ('${ORG_ID}', '${payeeId}', 'receipt', 10000, DATE '2026-10-05', 'pending_approval',
              'manual', 'expenses/typed/by-hand.pdf', true, 'รายการเก่า', '${AGENT_ID}')
      RETURNING id
    `)
    const list = await approvals.listCompensationApprovals(manager, { status: 'all' })
    const legacy = list.find((item) => item.id === rows[0]?.id)
    expect(legacy?.receiptFilePath).toBeNull()
    expect(legacy?.receiptUnverified).toBe(true)
  })
})

suite('มติ PO U143 — เคลียร์เงินทดรอง: ใบเสร็จตรวจแล้ว → audit + คำขอเบิกส่วนเกิน', () => {
  it('ใช้เกินยอด + แนบใบเสร็จ ⇒ hash อยู่ใน audit และใบเสร็จของคำขอเบิกส่วนเกิน · path พิมพ์เอง ⇒ ปฏิเสธ', async () => {
    const created = await advances.createAdvance({ actor: agent, meta }, {
      requestedSatang: 100_000,
      purpose: 'เดินทางไปติดตามทรัพย์ต่างจังหวัด',
      dueClearDate: new Date('2026-12-31T00:00:00Z'),
      payeeId: null,
    })
    await db().$executeRawUnsafe(
      `UPDATE advances SET status = 'approved', approved_satang = 100000, approved_at = now() WHERE id = '${created.id}'`,
    )
    const { markAdvancePaidOut } = await import('@/tests/helpers/advance-paid-out')
    await markAdvancePaidOut(db(), { organizationId: ORG_ID, advanceId: created.id, actorId: FINANCE_ID })

    uploadTestState.realVerify = true
    await expectCode(
      () => advances.settleAdvance({ actor: agent, meta }, created.id, {
        usedSatang: 120_000,
        receiptFileUrl: 'ใบเสร็จอยู่ในลิ้นชัก',
        note: null,
      }),
      'UPLOAD_PATH_OUT_OF_SCOPE',
    )

    const path = receiptPathOf(AGENT_ID, 'advance.pdf')
    const hash = uploadPdf(path, `advance-receipt-${RUN}`)
    const settled = await advances.settleAdvance({ actor: agent, meta }, created.id, {
      usedSatang: 120_000,
      receiptFileUrl: path,
      note: null,
    })
    expect(settled.excessClaimId).not.toBeNull()
    const excess = await db().expense.findUniqueOrThrow({
      where: { id: settled.excessClaimId ?? '' },
      select: { receiptFileUrl: true, receiptFileHash: true },
    })
    expect(excess).toEqual({ receiptFileUrl: path, receiptFileHash: hash })
    const audit = await db().auditLog.findFirstOrThrow({
      where: { organizationId: ORG_ID, targetType: 'advances', targetId: created.id, action: 'status_change' },
      orderBy: { createdAt: 'desc' },
      select: { afterData: true },
    })
    expect(audit.afterData).toMatchObject({ receipt_file_url: path, receipt_file_hash: hash })

    // ใบเสร็จเดิม (hash เดียวกัน) ใช้เคลียร์เงินทดรองอีกก้อนไม่ได้ — ใบเบิกส่วนเกินถือใบเสร็จนี้อยู่ (preship R4 ต่อจาก R3-004)
    const second = await advances.createAdvance({ actor: agent, meta }, {
      requestedSatang: 100_000,
      purpose: 'เดินทางไปติดตามทรัพย์ต่างจังหวัด รอบสอง',
      dueClearDate: new Date('2026-12-31T00:00:00Z'),
      payeeId: null,
    })
    await db().$executeRawUnsafe(
      `UPDATE advances SET status = 'approved', approved_satang = 100000, approved_at = now() WHERE id = '${second.id}'`,
    )
    await markAdvancePaidOut(db(), { organizationId: ORG_ID, advanceId: second.id, actorId: FINANCE_ID })
    const copyPath = receiptPathOf(AGENT_ID, 'advance-copy.pdf')
    expect(uploadPdf(copyPath, `advance-receipt-${RUN}`)).toBe(hash)
    await expectCode(
      () => advances.settleAdvance({ actor: agent, meta }, second.id, { usedSatang: 120_000, receiptFileUrl: copyPath, note: null }),
      'CLAIM_DUPLICATE_SUBMISSION',
    )
    const unchanged = await db().advance.findUniqueOrThrow({ where: { id: second.id }, select: { status: true } })
    expect(unchanged.status).not.toBe('cleared')
  })
})

suite('preship R5-001 — ใบเสร็จที่ใช้เคลียร์เงินทดรอง (ไม่มีส่วนเกิน) ใช้ซ้ำไม่ได้', () => {
  it('เคลียร์เงินทดรองด้วยใบเสร็จแล้ว ⇒ เบิกมือ/เคลียร์ก้อนอื่นด้วยใบเดิม (hash เดียวกัน) ได้ CLAIM_DUPLICATE_SUBMISSION', async () => {
    const { markAdvancePaidOut } = await import('@/tests/helpers/advance-paid-out')
    const paidAdvance = async (purpose: string) => {
      const created = await advances.createAdvance({ actor: agent, meta }, {
        requestedSatang: 100_000,
        purpose,
        dueClearDate: new Date('2026-12-31T00:00:00Z'),
        payeeId: null,
      })
      await db().$executeRawUnsafe(
        `UPDATE advances SET status = 'approved', approved_satang = 100000, approved_at = now() WHERE id = '${created.id}'`,
      )
      await markAdvancePaidOut(db(), { organizationId: ORG_ID, advanceId: created.id, actorId: FINANCE_ID })
      return created.id
    }

    uploadTestState.realVerify = true
    const firstId = await paidAdvance('ค่าเดินทางติดตามทรัพย์ R5-001')
    const path = receiptPathOf(AGENT_ID, 'r5-001.pdf')
    const hash = uploadPdf(path, `r5-001-receipt-${RUN}`)
    const settled = await advances.settleAdvance({ actor: agent, meta }, firstId, { usedSatang: 80_000, receiptFileUrl: path, note: null })
    expect(settled.excessClaimId).toBeNull()

    const copyPath = receiptPathOf(AGENT_ID, 'r5-001-copy.pdf')
    expect(uploadPdf(copyPath, `r5-001-receipt-${RUN}`)).toBe(hash)
    // เบิกใหม่ (ไม่มี actorId ในทางนี้) ⇒ ข้อความต้องบอกว่าใช้เคลียร์เงินทดรองของตัวเองแล้ว ไม่ใช่ "ใบเบิกอื่น" (preship R7-008)
    await expect(
      claims.createManualClaim({ actor: agent, meta }, {
        claimType: 'receipt',
        grossSatang: 80_000,
        expenseDate: new Date('2026-10-05T00:00:00Z'),
        payeeId: null,
        receiptFileUrl: copyPath,
        note: 'เบิกซ้ำด้วยใบเสร็จที่เคลียร์เงินทดรองแล้ว',
      }),
    ).rejects.toMatchObject({
      code: 'CLAIM_DUPLICATE_SUBMISSION',
      context: { reason: 'receipt_reused', existingAdvanceId: firstId },
      userMessage: expect.stringContaining('เคลียร์เงินทดรองของคุณ'),
    })

    // การเงินบันทึกแทนพนักงานด้วยใบเดิม ⇒ ยังถูกปฏิเสธ แต่ข้อความเป็น "ของผู้รับเงินรายนี้" ไม่ใช่ "ของคุณ" (preship R8-012)
    const financePath = receiptPathOf(FINANCE_ID, 'r5-001-on-behalf.pdf')
    expect(uploadPdf(financePath, `r5-001-receipt-${RUN}`)).toBe(hash)
    await expect(
      claims.createManualClaim({ actor: finance, meta }, {
        claimType: 'receipt',
        grossSatang: 80_000,
        expenseDate: new Date('2026-10-05T00:00:00Z'),
        payeeId: await payeeIdOf(AGENT_ID),
        receiptFileUrl: financePath,
        note: 'การเงินบันทึกแทนด้วยใบเสร็จที่เคลียร์เงินทดรองแล้ว',
      }),
    ).rejects.toMatchObject({
      code: 'CLAIM_DUPLICATE_SUBMISSION',
      userMessage: expect.stringContaining('เคลียร์เงินทดรองของผู้รับเงินรายนี้'),
    })

    const secondId = await paidAdvance('ค่าเดินทางติดตามทรัพย์ R5-001 ก้อนสอง')
    await expectCode(
      () => advances.settleAdvance({ actor: agent, meta }, secondId, { usedSatang: 80_000, receiptFileUrl: copyPath, note: null }),
      'CLAIM_DUPLICATE_SUBMISSION',
    )
  })
})

suite('preship L6-001 — ใบเบิกส่วนเกินจากการเคลียร์เงินทดรอง ตีกลับแล้วส่งใหม่ด้วยใบเสร็จเดิมได้', () => {
  it('ใบเบิกส่วนเกิน needs_revision ⇒ ส่งใหม่ผ่าน (audit การเคลียร์ของตัวเองไม่นับ) · ใบเบิกอื่นใช้ใบเดิมยังถูกปฏิเสธ', async () => {
    const { markAdvancePaidOut } = await import('@/tests/helpers/advance-paid-out')
    const created = await advances.createAdvance({ actor: agent, meta }, {
      requestedSatang: 100_000,
      purpose: 'ค่าเดินทางติดตามทรัพย์ L6-001',
      dueClearDate: new Date('2026-12-31T00:00:00Z'),
      payeeId: null,
    })
    await db().$executeRawUnsafe(
      `UPDATE advances SET status = 'approved', approved_satang = 100000, approved_at = now() WHERE id = '${created.id}'`,
    )
    await markAdvancePaidOut(db(), { organizationId: ORG_ID, advanceId: created.id, actorId: FINANCE_ID })

    uploadTestState.realVerify = true
    const path = receiptPathOf(AGENT_ID, 'l6-001.pdf')
    uploadPdf(path, `l6-001-receipt-${RUN}`)
    const settled = await advances.settleAdvance({ actor: agent, meta }, created.id, { usedSatang: 130_000, receiptFileUrl: path, note: null })
    const excessId = settled.excessClaimId ?? ''
    expect(excessId).not.toBe('')

    await db().expense.update({ where: { id: excessId }, data: { status: 'needs_revision', rejectionReason: 'แนบรายละเอียดเพิ่ม' } })
    await fieldExpenses.resubmitFieldExpense(agent, excessId, { note: 'แนบรายละเอียดแล้ว' }, { actor: agent, meta })
    const after = await db().expense.findUniqueOrThrow({ where: { id: excessId }, select: { status: true } })
    expect(after.status).not.toBe('needs_revision')

    const copyPath = receiptPathOf(AGENT_ID, 'l6-001-copy.pdf')
    uploadPdf(copyPath, `l6-001-receipt-${RUN}`)
    await expectCode(
      () =>
        claims.createManualClaim({ actor: agent, meta }, {
          claimType: 'receipt',
          grossSatang: 30_000,
          expenseDate: new Date('2026-10-05T00:00:00Z'),
          payeeId: null,
          receiptFileUrl: copyPath,
          note: 'ใช้ใบเสร็จที่เคลียร์เงินทดรองแล้วซ้ำ',
        }),
      'CLAIM_DUPLICATE_SUBMISSION',
    )
  })
})

suite('มติ PO U153 — บันทึกแทนผู้อื่น', () => {
  it('การเงินบันทึกเบิกแทนพนักงาน ⇒ รายการเป็นของพนักงาน · audit ระบุผู้บันทึก + ผู้รับ · คิวแสดงชื่อผู้บันทึกแทน', async () => {
    uploadTestState.realVerify = true
    const path = receiptPathOf(FINANCE_ID, 'on-behalf.pdf')
    uploadPdf(path, 'on-behalf')
    const agentPayeeId = await payeeIdOf(AGENT_ID)

    const created = await claims.createManualClaim({ actor: finance, meta }, {
      claimType: 'receipt',
      grossSatang: 80_000,
      expenseDate: new Date('2026-10-04T00:00:00Z'),
      payeeId: agentPayeeId,
      receiptFileUrl: path,
      note: 'ค่าซ่อมรถ — ใบเสร็จส่งมาทางไลน์',
    })
    expect(created.payeeId).toBe(agentPayeeId)
    const audit = await db().auditLog.findFirstOrThrow({
      where: { organizationId: ORG_ID, targetType: 'expenses', targetId: created.id, action: 'create' },
      select: { actorId: true, afterData: true },
    })
    expect(audit.actorId).toBe(FINANCE_ID)
    expect(audit.afterData).toMatchObject({
      payee_id: agentPayeeId,
      recorded_by: FINANCE_ID,
      on_behalf_of_user_id: AGENT_ID,
    })

    // U152 — ผู้จัดการทีมของพนักงานเห็นรายละเอียดก่อนอนุมัติ
    const item = (await approvals.listCompensationApprovals(manager, { status: 'all' })).find((row) => row.id === created.id)
    expect(item).toMatchObject({
      note: 'ค่าซ่อมรถ — ใบเสร็จส่งมาทางไลน์',
      receiptFilePath: path,
      receiptUnverified: false,
      recordedByName: 'การเงิน U143',
    })
  })

  it('พนักงานส่ง payeeId ของคนอื่น ⇒ PERMISSION_DENIED (เบิกด้วยมือและเงินทดรอง) · ไม่มีรายการเกิด', async () => {
    const otherPayeeId = await payeeIdOf(AGENT_2_ID)
    await expectCode(
      () => claims.createManualClaim({ actor: agent, meta }, {
        claimType: 'manual',
        grossSatang: 10_000,
        expenseDate: new Date('2026-10-04T00:00:00Z'),
        payeeId: otherPayeeId,
        receiptFileUrl: receiptPathOf(AGENT_ID, 'x.pdf'),
        note: null,
      }),
      'PERMISSION_DENIED',
    )
    await expectCode(
      () => advances.createAdvance({ actor: agent, meta }, {
        requestedSatang: 50_000,
        purpose: 'ขอแทนเพื่อนร่วมทีม',
        dueClearDate: new Date('2026-12-31T00:00:00Z'),
        payeeId: otherPayeeId,
      }),
      'PERMISSION_DENIED',
    )
    expect(await db().expense.count({ where: { organizationId: ORG_ID } })).toBe(0)
    expect(await db().advance.count({ where: { organizationId: ORG_ID } })).toBe(0)
  })

  it('ผู้ถือสิทธิ์อนุมัติเงินทดรองขอแทนพนักงาน ⇒ เงินทดรองเป็นของพนักงาน · audit ระบุผู้บันทึก + ผู้รับ', async () => {
    const agentPayeeId = await payeeIdOf(AGENT_ID)
    const created = await advances.createAdvance({ actor: financeRequester, meta }, {
      requestedSatang: 50_000,
      purpose: 'ขอแทนพนักงานที่อยู่ต่างจังหวัด',
      dueClearDate: new Date('2026-12-31T00:00:00Z'),
      payeeId: agentPayeeId,
    })
    expect(created.payeeId).toBe(agentPayeeId)
    const audit = await db().auditLog.findFirstOrThrow({
      where: { organizationId: ORG_ID, targetType: 'advances', targetId: created.id, action: 'create' },
      select: { actorId: true, afterData: true },
    })
    expect(audit.actorId).toBe(FINANCE_ID)
    expect(audit.afterData).toMatchObject({ payee_id: agentPayeeId, on_behalf_of_user_id: AGENT_ID })
  })

  it('ตัวเลือกผู้รับ = ผู้รับเงินที่ใช้งานอยู่ขององค์กร (ไม่มีข้อมูลบัญชี)', async () => {
    const options = await payees.listPayeeOptions(finance)
    expect(options.map((option) => option.userId).sort()).toEqual([AGENT_ID, AGENT_2_ID].sort())
    expect(Object.keys(options[0] ?? {}).sort()).toEqual(['id', 'name', 'teamName', 'userId'])
  })
})

suite('มติ PO U152 — คิวอนุมัติเห็นรายละเอียด + สิทธิ์เปิดใบเสร็จตาม scope', () => {
  it('หมายเหตุ · คำชี้แจงตอนส่งใหม่ · ผู้พักร่วม แสดงในคิว', async () => {
    const payeeId = await payeeIdOf(AGENT_ID)
    const rows = await db().$queryRawUnsafe<{ id: string }[]>(`
      INSERT INTO expenses (organization_id, payee_id, expense_type, gross_satang, expense_date, status, calculation_source,
                            shared_with_user_id, revision_note, resubmit_note, created_by)
      VALUES ('${ORG_ID}', '${payeeId}', 'hotel', 60000, DATE '2026-10-03', 'pending_approval', 'receipt',
              '${AGENT_2_ID}', 'พักโรงแรมใกล้บ้านลูกหนี้', 'แนบใบเสร็จใหม่ที่ชัดขึ้นแล้ว', '${AGENT_ID}')
      RETURNING id
    `)
    const item = (await approvals.listCompensationApprovals(manager, { status: 'all' })).find((row) => row.id === rows[0]?.id)
    expect(item).toMatchObject({
      note: 'พักโรงแรมใกล้บ้านลูกหนี้',
      resubmitNote: 'แนบใบเสร็จใหม่ที่ชัดขึ้นแล้ว',
      sharedWithName: 'พนักงานสอง U143',
      recordedByName: null,
      receiptFilePath: null,
    })
  })

  it('ใบเสร็จที่การเงินแนบให้รายการของพนักงาน: ผู้จัดการทีม/ผู้รับเงินเปิดได้ · ทีมอื่น/คนอื่น = 404 · ไม่มี capability = 403', async () => {
    uploadTestState.realVerify = true
    const path = receiptPathOf(FINANCE_ID, 'scope.pdf')
    uploadPdf(path, 'scope')
    await claims.createManualClaim({ actor: finance, meta }, {
      claimType: 'receipt',
      grossSatang: 20_000,
      expenseDate: new Date('2026-10-04T00:00:00Z'),
      payeeId: await payeeIdOf(AGENT_ID),
      receiptFileUrl: path,
      note: null,
    })

    await expect(access.authorizeDownload(finance, path)).resolves.toBeUndefined()
    await expect(access.authorizeDownload(manager, path)).resolves.toBeUndefined()
    await expect(access.authorizeDownload(agent, path)).resolves.toBeUndefined()
    await expectCode(() => access.authorizeDownload(otherManager, path), 'EXPENSE_NOT_FOUND')
    await expectCode(() => access.authorizeDownload(agent2, path), 'EXPENSE_NOT_FOUND')
    const outsider = sessionUser({ id: AGENT_2_ID, capabilities: { manage_payee_profile: 'view' } })
    await expectCode(() => access.authorizeDownload(outsider, path), 'PERMISSION_DENIED')
  })
})

suite('มติ PO U150 — เอกสารยืนยันตัวตนผู้รับเงิน = อัปโหลดจริง', () => {
  const BANK: PayeeFieldsInput = {
    payeeType: 'individual',
    taxProfileId: TAX_PROFILE_ID,
    nationalId: '1234567890123',
    bankName: 'กสิกรไทย',
    accountName: 'พนักงาน U143',
    accountNumber: '1234567890',
    idDocumentUrl: null,
    address: { detail: '12 ม.3', postalCode: '51000', province: 'ลำพูน', district: 'เมืองลำพูน', subdistrict: 'ในเมือง' },
  }
  const ctx = (reason: string) => ({ actor: finance, meta, reason })
  const docPath = (key: string) => `payees/${ORG_ID}/id-documents/${key}.pdf`

  it('แนบไฟล์จริง ⇒ เก็บ SHA-256 · ยืนยันผ่านเมื่อองค์กรบังคับเอกสาร · audit มี hash', async () => {
    uploadTestState.realVerify = true
    const payeeId = await payeeIdOf(AGENT_ID)
    const path = docPath('00000000-0000-4000-8000-00000000d001')
    const hash = uploadPdf(path, 'id-card')
    await db().$executeRawUnsafe(
      `UPDATE finance_policy_settings SET require_payee_id_document = true WHERE organization_id = '${ORG_ID}'`,
    )

    const updated = await payees.updatePayee(ctx('แนบสำเนาบัตรประชาชน'), payeeId, { ...BANK, idDocumentUrl: path })
    expect(updated.payee.idDocumentVerified).toBe(true)
    const row = await db().payeeProfile.findUniqueOrThrow({ where: { id: payeeId }, select: { idDocumentHash: true } })
    expect(row.idDocumentHash).toBe(hash)
    const verified = await payees.verifyPayee(ctx('ตรวจเอกสารครบ'), payeeId)
    expect(verified.payee.isVerified).toBe(true)
    const audit = await db().auditLog.findFirstOrThrow({
      where: { organizationId: ORG_ID, targetType: 'payee_profiles', targetId: payeeId, reason: 'แนบสำเนาบัตรประชาชน' },
      select: { afterData: true },
    })
    expect(audit.afterData).toMatchObject({ id_document_url: path, id_document_hash: hash })
  })

  it('URL พิมพ์เอง / path ขององค์กรอื่น / ไฟล์ที่ไม่ได้อัปโหลด ⇒ ปฏิเสธ', async () => {
    uploadTestState.realVerify = true
    const payeeId = await payeeIdOf(AGENT_ID)
    await expectCode(
      () => payees.updatePayee(ctx('ลองใส่ลิงก์'), payeeId, { ...BANK, idDocumentUrl: 'https://drive.example/id.pdf' }),
      'UPLOAD_PATH_OUT_OF_SCOPE',
    )
    const foreign = `payees/00000000-0000-4000-8000-0000000000ff/id-documents/k.pdf`
    uploadPdf(foreign, 'foreign')
    await expectCode(
      () => payees.updatePayee(ctx('ไฟล์ขององค์กรอื่น'), payeeId, { ...BANK, idDocumentUrl: foreign }),
      'UPLOAD_PATH_OUT_OF_SCOPE',
    )
    await expectCode(
      () => payees.updatePayee(ctx('ไฟล์ที่ไม่มีจริง'), payeeId, { ...BANK, idDocumentUrl: docPath('missing') }),
      'UPLOAD_FILE_NOT_FOUND',
    )
  })

  it('URL เก่า (ไม่ผ่านการตรวจ) ⇒ เกตยืนยันถือว่าไม่มีเอกสาร · แก้ฟิลด์อื่นได้โดยไม่แตะเอกสารเดิม · CHECK ระดับ DB', async () => {
    uploadTestState.realVerify = true
    const payeeId = await payeeIdOf(AGENT_ID)
    await expect(
      db().$executeRawUnsafe(`UPDATE payee_profiles SET id_document_url = 'https://legacy.test/id.pdf' WHERE id = '${payeeId}'`),
    ).rejects.toThrow(/chk_payee_profiles_id_document_verified/)
    await db().$executeRawUnsafe(
      `UPDATE payee_profiles SET id_document_url = 'https://legacy.test/id.pdf', id_document_unverified = true WHERE id = '${payeeId}'`,
    )
    await db().$executeRawUnsafe(
      `UPDATE finance_policy_settings SET require_payee_id_document = true WHERE organization_id = '${ORG_ID}'`,
    )
    const kept = await payees.updatePayee(ctx('เติมข้อมูลธนาคาร'), payeeId, {
      ...BANK,
      idDocumentUrl: 'https://legacy.test/id.pdf',
    })
    expect(kept.payee.idDocumentUrl).toBe('https://legacy.test/id.pdf')
    expect(kept.payee.idDocumentVerified).toBe(false)
    await expectCode(() => payees.verifyPayee(ctx('ยืนยันด้วยเอกสารเก่า'), payeeId), 'PAYEE_ID_DOCUMENT_REQUIRED')
  })

  it('เปิดไฟล์: การเงินทั้งองค์กร · ผู้รับเห็นของตัวเอง · ผู้รับคนอื่น = 404 · ไม่มีสิทธิ์ผู้รับเงิน = 403', async () => {
    uploadTestState.realVerify = true
    const payeeId = await payeeIdOf(AGENT_ID)
    const path = docPath('00000000-0000-4000-8000-00000000d002')
    uploadPdf(path, 'own-id')
    await payees.updatePayee(ctx('แนบเอกสาร'), payeeId, { ...BANK, idDocumentUrl: path })

    await expect(access.authorizeDownload(finance, path)).resolves.toBeUndefined()
    await expect(access.authorizeDownload(agent, path)).resolves.toBeUndefined()
    await expectCode(() => access.authorizeDownload(agent2, path), 'PAYEE_NOT_FOUND')
    await expectCode(() => access.authorizeDownload(manager, path), 'PERMISSION_DENIED')
    expect(await access.payeeIdOfIdDocument(ORG_ID, path)).toBe(payeeId)
  })
})

suite('preship PS-003 — กันส่งใบเบิกเดิมซ้ำ (retry/กดซ้ำ)', () => {
  const line = (amountSatang: number) => ({
    lineDate: new Date('2026-10-05T00:00:00Z'),
    description: 'ค่าเรือข้ามฟาก',
    amountSatang,
    note: null,
  })
  const noReceipt = {
    claimType: 'receipt' as const,
    grossSatang: 30_000,
    expenseDate: new Date('2026-10-05T00:00:00Z'),
    payeeId: null,
    receiptFileUrl: null,
    note: 'ค่าเรือข้ามฟาก',
    substituteReceipt: { lines: [line(30_000)] },
  }

  async function countClaims(): Promise<number> {
    return db().expense.count({ where: { organizationId: ORG_ID, caseId: null, revisionNote: noReceipt.note } })
  }

  it('ส่งรายการเดิมซ้ำทันที ⇒ CLAIM_DUPLICATE_SUBMISSION · มีใบเบิกใบเดียว', async () => {
    await claims.createManualClaim({ actor: agent, meta }, noReceipt)
    await expectCode(() => claims.createManualClaim({ actor: agent, meta }, noReceipt), 'CLAIM_DUPLICATE_SUBMISSION')
    expect(await countClaims()).toBe(1)
  })

  it('ส่งพร้อมกัน 2 request ⇒ สำเร็จ 1 ซ้ำ 1 (advisory lock)', async () => {
    const results = await Promise.allSettled([
      claims.createManualClaim({ actor: agent, meta }, noReceipt),
      claims.createManualClaim({ actor: agent, meta }, noReceipt),
    ])
    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1)
    const rejected = results.filter((result): result is PromiseRejectedResult => result.status === 'rejected')
    expect(rejected.map((result) => codeOf(result.reason))).toEqual(['CLAIM_DUPLICATE_SUBMISSION'])
    expect(await countClaims()).toBe(1)
  })

  it('ยอดต่าง / ผู้รับเงินต่าง ⇒ ไม่ถือว่าซ้ำ', async () => {
    await claims.createManualClaim({ actor: agent, meta }, noReceipt)
    const otherAmount = { ...noReceipt, grossSatang: 30_100, substituteReceipt: { lines: [line(30_100)] } }
    await claims.createManualClaim({ actor: agent, meta }, otherAmount)
    await claims.createManualClaim({ actor: agent2, meta }, noReceipt)
    expect(await countClaims()).toBe(3)
  })

  it('ใบเดิมถูกตีกลับ หรือสร้างเกิน 10 นาทีแล้ว ⇒ ส่งใหม่ได้', async () => {
    const first = await claims.createManualClaim({ actor: agent, meta }, noReceipt)
    await db().expense.update({ where: { id: first.id }, data: { status: 'rejected' } })
    const second = await claims.createManualClaim({ actor: agent, meta }, noReceipt)
    await db().expense.update({ where: { id: second.id }, data: { createdAt: new Date(Date.now() - 11 * 60 * 1000) } })
    await claims.createManualClaim({ actor: agent, meta }, noReceipt)
    expect(await countClaims()).toBe(3)
  })
})

suite('preship R3-004 — ใบเสร็จไฟล์เดียวใช้เบิกได้ใบเดียว', () => {
  const claimWith = (receiptFileUrl: string, note: string) => ({
    claimType: 'receipt' as const,
    grossSatang: 52_000,
    expenseDate: new Date('2026-10-05T00:00:00Z'),
    payeeId: null,
    receiptFileUrl,
    note,
  })

  it('ใบเสร็จเดิม เปลี่ยนแค่หมายเหตุ ⇒ CLAIM_DUPLICATE_SUBMISSION (ไม่จำกัด 10 นาที) · มีใบเบิกใบเดียว', async () => {
    uploadTestState.realVerify = true
    const path = receiptPathOf(AGENT_ID, 'r3-004.pdf')
    const hash = uploadPdf(path, 'r3-004-receipt')
    const first = await claims.createManualClaim({ actor: agent, meta }, claimWith(path, 'ค่าที่จอดรถ'))
    await db().expense.update({ where: { id: first.id }, data: { createdAt: new Date(Date.now() - 24 * 3600 * 1000) } })

    await expect(claims.createManualClaim({ actor: agent, meta }, claimWith(path, 'ค่าที่จอดรถ (อีกครั้ง)'))).rejects.toMatchObject({
      code: 'CLAIM_DUPLICATE_SUBMISSION',
      context: { reason: 'receipt_reused', existingExpenseId: first.id },
    })
    expect(await db().expense.count({ where: { organizationId: ORG_ID, receiptFileHash: hash } })).toBe(1)
  })

  it('ผู้รับเงินคนอื่นใช้ใบเสร็จไฟล์เดียวกัน ⇒ ปฏิเสธ ไม่ส่ง id ใบของคนอื่นออกไป', async () => {
    uploadTestState.realVerify = true
    uploadPdf(receiptPathOf(AGENT_ID, 'shared.pdf'), 'same-bytes')
    uploadPdf(receiptPathOf(AGENT_2_ID, 'shared.pdf'), 'same-bytes')
    await claims.createManualClaim({ actor: agent, meta }, claimWith(receiptPathOf(AGENT_ID, 'shared.pdf'), 'ของคนแรก'))
    await expect(
      claims.createManualClaim({ actor: agent2, meta }, claimWith(receiptPathOf(AGENT_2_ID, 'shared.pdf'), 'ของคนที่สอง')),
    ).rejects.toMatchObject({ code: 'CLAIM_DUPLICATE_SUBMISSION', context: { reason: 'receipt_reused' } })
  })

  it('ใบที่ถูกตีกลับให้แก้ยังถือใบเสร็จไว้ · ส่งใหม่ด้วยใบเสร็จของใบอื่นไม่ได้ · ปฏิเสธถาวรแล้วจึงใช้ใบเสร็จได้อีก', async () => {
    uploadTestState.realVerify = true
    const pathA = receiptPathOf(AGENT_ID, 'resubmit-a.pdf')
    const pathB = receiptPathOf(AGENT_ID, 'resubmit-b.pdf')
    uploadPdf(pathA, 'receipt-a')
    uploadPdf(pathB, 'receipt-b')
    const first = await claims.createManualClaim({ actor: agent, meta }, claimWith(pathA, 'ใบแรก'))
    await db().expense.update({ where: { id: first.id }, data: { status: 'needs_revision', rejectionReason: 'ยอดไม่ตรง' } })

    // ตีกลับให้แก้ ≠ ปล่อยใบเสร็จ — ต้องส่งใบเดิมใหม่ ไม่ใช่เปิดใบเบิกใหม่ด้วยใบเสร็จเดิม
    await expectCode(() => claims.createManualClaim({ actor: agent, meta }, claimWith(pathA, 'ใบใหม่')), 'CLAIM_DUPLICATE_SUBMISSION')
    const second = await claims.createManualClaim({ actor: agent, meta }, claimWith(pathB, 'อีกรายการ'))

    // ส่งใหม่โดยแนบใบเสร็จที่ใบอื่นใช้อยู่ ⇒ ปฏิเสธ สถานะไม่เปลี่ยน
    await expectCode(
      () =>
        fieldExpenses.resubmitFieldExpense(agent, first.id, { note: 'แนบใบใหม่', receiptFileUrl: pathB }, { actor: agent, meta }),
      'CLAIM_DUPLICATE_SUBMISSION',
    )
    const unchanged = await db().expense.findUniqueOrThrow({
      where: { id: first.id },
      select: { status: true, receiptFileUrl: true },
    })
    expect(unchanged).toEqual({ status: 'needs_revision', receiptFileUrl: pathA })

    // ส่งใหม่ด้วยใบเสร็จเดิมของตัวเอง ⇒ ผ่าน (ไม่นับตัวเอง)
    await expect(
      fieldExpenses.resubmitFieldExpense(agent, first.id, { note: 'แก้ยอดแล้ว' }, { actor: agent, meta }),
    ).resolves.toMatchObject({ status: 'pending_approval' })

    // ใบที่ปฏิเสธถาวรปล่อยใบเสร็จ ⇒ เบิกใบใหม่ด้วยใบเสร็จนั้นได้
    await db().expense.update({ where: { id: second.id }, data: { status: 'rejected', rejectionReason: 'ทดสอบ' } })
    await expect(
      claims.createManualClaim({ actor: agent, meta }, claimWith(pathB, 'เบิกใหม่หลังปฏิเสธถาวร')),
    ).resolves.toBeDefined()
  })
})
