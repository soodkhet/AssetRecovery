import { PrismaPg } from '@prisma/adapter-pg'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import type { SessionUser } from '@/lib/auth/types'
import { PrismaClient } from '@/lib/generated/prisma/client'

/**
 * เทสต์ระดับ DB ของ Phase 3.3 — DoD ตาม `15` §16:
 *  · ขอ Advance ซ้อนขณะมียอด `approved` ค้าง ⇒ `ADVANCE_PENDING_SETTLEMENT`
 *  · ขอซ้อนขณะมียอด `overdue` ค้าง ⇒ `ADVANCE_PENDING_SETTLEMENT` (บล็อกเหมือนกัน)
 *  · ยิงพร้อมกัน 2 คำขอ ⇒ partial unique `uniq_active_advance_per_payee` ปล่อยผ่านได้ใบเดียว
 *  · เพดานต่อครั้ง (`ADVANCE_EXCEEDS_MAX`) · `null` = ไม่จำกัด
 *  · เคลียร์ยอด: requested 5,000 used 4,200 ⇒ return 800 (generated column ของ DB)
 *  · เคลียร์ยอดใช้เกิน ⇒ `USED_EXCEEDS_REQUEST_NO_TOPUP`
 *  · ปฏิเสธไม่กรอกเหตุผล ⇒ `REJECTION_REASON_REQUIRED`
 *  · scope: พนักงานเห็นเฉพาะของตัวเอง · job auto-overdue **idempotent** (รันซ้ำไม่เปลี่ยนซ้ำ)
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
  console.warn('[advance-queries.db.test] ข้ามเทสต์ระดับ DB — ไม่มี TEST_DATABASE_URL (ดู .env.example)')
}

const ORG_ID = '00000000-0000-4000-8000-0000000033a0'
const ROLE_FINANCE = '00000000-0000-4000-8000-0000000033a1'
const ROLE_AGENT = '00000000-0000-4000-8000-0000000033a2'
const FINANCE_ID = '00000000-0000-4000-8000-0000000033a3'
const AGENT_ID = '00000000-0000-4000-8000-0000000033a4'
const AGENT_2_ID = '00000000-0000-4000-8000-0000000033a5'
const TEAM_ID = '00000000-0000-4000-8000-0000000033a6'

let client: PrismaClient | null = null
type AdvanceQueries = typeof import('@/lib/advances/queries')
type OverdueJob = typeof import('@/lib/advances/overdue-job')
let advances: AdvanceQueries
let job: OverdueJob

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
    fullName: 'ผู้ทดสอบ 3.3',
    status: 'active',
    roleId: ROLE_AGENT,
    roleName: 'พนักงานติดตามทรัพย์',
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

/** การเงิน — อนุมัติ/ปฏิเสธได้ เห็นทั้งองค์กร แต่ขอเบิกเองไม่ได้ (`25` §7.2 = 👁️) */
const finance = sessionUser({
  id: FINANCE_ID,
  roleId: ROLE_FINANCE,
  roleName: 'การเงิน',
  roleGroup: 'system',
  teamId: null,
  capabilities: { approve_advance: 'manage', request_advance: 'view' },
  scope: { kind: 'global', teamIds: [], companyId: null, userId: FINANCE_ID },
})
const agent = sessionUser({ id: AGENT_ID, capabilities: { request_advance: 'manage' } })
const agent2 = sessionUser({ id: AGENT_2_ID, capabilities: { request_advance: 'manage' } })

const ctx = (actor: SessionUser) => ({ actor, meta })

function codeOf(error: unknown): string {
  return (error as { code?: string }).code ?? String(error)
}

async function expectCode(run: () => Promise<unknown>, code: string): Promise<void> {
  await expect(run()).rejects.toSatisfy((error: unknown) => codeOf(error) === code, `ต้องได้ error code ${code}`)
}

/** วันที่ในอนาคต/อดีตแบบ `YYYY-MM-DD` เทียบจากวันนี้ */
function isoDate(offsetDays: number): string {
  const date = new Date(Date.now() + offsetDays * 86_400_000)
  return date.toISOString().slice(0, 10)
}

function createInput(overrides: Partial<{ requestedSatang: number; purpose: string; dueClearDate: string; payeeId: string | null }> = {}) {
  const { dueClearDate = isoDate(7), ...rest } = overrides
  return {
    requestedSatang: 500_000,
    purpose: 'เดินทางไปติดตามทรัพย์ต่างจังหวัด 3 วัน',
    payeeId: null,
    ...rest,
    dueClearDate: new Date(`${dueClearDate}T00:00:00Z`),
  }
}

async function reset(): Promise<void> {
  const tx = db()
  await tx.$executeRawUnsafe(`DELETE FROM notifications WHERE organization_id = '${ORG_ID}'`)
  await tx.$executeRawUnsafe(`DELETE FROM advances WHERE organization_id = '${ORG_ID}'`)
  await tx.$executeRawUnsafe(`DELETE FROM payee_profiles WHERE organization_id = '${ORG_ID}'`)
  await tx.$executeRawUnsafe(
    `UPDATE finance_policy_settings SET advance_max_amount_per_request_satang = NULL WHERE organization_id = '${ORG_ID}'`,
  )
}

beforeAll(async () => {
  if (!url) return
  process.env.DATABASE_URL = url
  advances = await import('@/lib/advances/queries')
  job = await import('@/lib/advances/overdue-job')

  const tx = db()
  await tx.$executeRawUnsafe(`
    INSERT INTO organizations (id, name, tax_id, address)
    VALUES ('${ORG_ID}', 'Phase33Test', '9999999993300', 'ที่อยู่ทดสอบ 3.3') ON CONFLICT (id) DO NOTHING
  `)
  await tx.$executeRawUnsafe(`
    INSERT INTO roles (id, organization_id, name, role_group, is_seed) VALUES
      ('${ROLE_FINANCE}', '${ORG_ID}', 'การเงิน 3.3', 'system', false),
      ('${ROLE_AGENT}', '${ORG_ID}', 'พนักงานติดตามทรัพย์ 3.3', 'inhouse', false)
    ON CONFLICT (id) DO NOTHING
  `)
  await tx.$executeRawUnsafe(`
    INSERT INTO users (id, organization_id, role_id, email, full_name, status) VALUES
      ('${FINANCE_ID}', '${ORG_ID}', '${ROLE_FINANCE}', 'finance33@test.local', 'การเงิน 3.3', 'active'),
      ('${AGENT_ID}', '${ORG_ID}', '${ROLE_AGENT}', 'agent33@test.local', 'พนักงาน 3.3', 'active'),
      ('${AGENT_2_ID}', '${ORG_ID}', '${ROLE_AGENT}', 'agent33b@test.local', 'พนักงานสอง 3.3', 'active')
    ON CONFLICT (id) DO NOTHING
  `)
  await tx.$executeRawUnsafe(`
    INSERT INTO teams (id, organization_id, name, side, provinces, status, created_by)
    VALUES ('${TEAM_ID}', '${ORG_ID}', 'ทีมทดสอบ 3.3', 'inhouse', ARRAY['ลำพูน'], 'active', '${FINANCE_ID}')
    ON CONFLICT (id) DO NOTHING
  `)
  await tx.$executeRawUnsafe(`UPDATE users SET team_id = '${TEAM_ID}' WHERE id IN ('${AGENT_ID}', '${AGENT_2_ID}')`)
  await tx.$executeRawUnsafe(`
    INSERT INTO finance_policy_settings (organization_id) VALUES ('${ORG_ID}')
    ON CONFLICT (organization_id) DO NOTHING
  `)
})

afterAll(async () => {
  if (url) await reset()
  await client?.$disconnect()
})

beforeEach(async () => {
  if (url) await reset()
})

suite('ห้ามเบิกซ้อน (`15` §9.2/§16)', () => {
  it('มียอด approved ค้าง → ขอใหม่ไม่ได้', async () => {
    const first = await advances.createAdvance(ctx(agent), createInput())
    await advances.approveAdvance(ctx(finance), first.id, { approvedSatang: null, note: null })

    await expectCode(() => advances.createAdvance(ctx(agent), createInput()), 'ADVANCE_PENDING_SETTLEMENT')
  })

  it('มียอด overdue ค้าง → ขอใหม่ไม่ได้เหมือนกัน', async () => {
    const first = await advances.createAdvance(ctx(agent), createInput())
    await advances.approveAdvance(ctx(finance), first.id, { approvedSatang: null, note: null })
    await db().$executeRawUnsafe(`UPDATE advances SET status = 'overdue' WHERE id = '${first.id}'`)

    await expectCode(() => advances.createAdvance(ctx(agent), createInput()), 'ADVANCE_PENDING_SETTLEMENT')
  })

  it('ยอดที่ยังรออนุมัติไม่บล็อก (ยังไม่มีเงินออก)', async () => {
    await advances.createAdvance(ctx(agent), createInput())
    const second = await advances.createAdvance(ctx(agent), createInput())
    expect(second.status).toBe('pending_approval')
  })

  it('เคลียร์ยอดแล้วขอใหม่ได้', async () => {
    const first = await advances.createAdvance(ctx(agent), createInput())
    await advances.approveAdvance(ctx(finance), first.id, { approvedSatang: null, note: null })
    await advances.settleAdvance(ctx(agent), first.id, { usedSatang: 400_000, receiptFileUrl: null, note: null })

    const second = await advances.createAdvance(ctx(agent), createInput())
    expect(second.status).toBe('pending_approval')
  })

  it('คนละคนถือยอดค้างพร้อมกันได้ (unique เป็นราย payee)', async () => {
    const mine = await advances.createAdvance(ctx(agent), createInput())
    await advances.approveAdvance(ctx(finance), mine.id, { approvedSatang: null, note: null })

    const theirs = await advances.createAdvance(ctx(agent2), createInput())
    const theirsApproved = await advances.approveAdvance(ctx(finance), theirs.id, {
      approvedSatang: null,
      note: null,
    })
    // partial unique เป็นราย payee ⇒ คนละคนถือยอดค้างพร้อมกันได้ ไม่ชนกัน
    expect(theirsApproved.status).toBe('approved')
  })

  it('อนุมัติพร้อมกัน 2 ใบของคนเดียวกัน → DB ปล่อยผ่านใบเดียว (partial unique เป็นด่านสุดท้าย)', async () => {
    const a = await advances.createAdvance(ctx(agent), createInput())
    const b = await advances.createAdvance(ctx(agent), createInput())

    const results = await Promise.allSettled([
      advances.approveAdvance(ctx(finance), a.id, { approvedSatang: null, note: null }),
      advances.approveAdvance(ctx(finance), b.id, { approvedSatang: null, note: null }),
    ])
    const approved = results.filter((result) => result.status === 'fulfilled')
    expect(approved).toHaveLength(1)

    // Final Test ด่าน 2 — ฝั่งที่แพ้ต้องได้ code ของ `24` เหมือนตอนสร้าง ไม่ใช่ Prisma error ดิบ 500
    // (ยามตอนสร้างดูเฉพาะ `approved|overdue` ⇒ มี `pending_approval` หลายใบต่อคนได้โดยตั้งใจ
    //  ⇒ จังหวะ "อนุมัติใบที่สอง" คือจุดที่ชน partial unique จริง — เกิดได้แม้ไม่ได้กดพร้อมกัน)
    const loser = results.find((result) => result.status === 'rejected')
    expect(codeOf((loser as PromiseRejectedResult).reason)).toBe('ADVANCE_PENDING_SETTLEMENT')

    const rows = await db().advance.findMany({
      where: { organizationId: ORG_ID, status: { in: ['approved', 'overdue'] } },
      select: { id: true },
    })
    expect(rows).toHaveLength(1)
  })

  it('Final Test ด่าน 2 — อนุมัติใบที่สอง **ตามลำดับ** (ไม่ได้พร้อมกัน) ⇒ `ADVANCE_PENDING_SETTLEMENT` ไม่ใช่ 500', async () => {
    const first = await advances.createAdvance(ctx(agent), createInput())
    const second = await advances.createAdvance(ctx(agent), createInput())

    await advances.approveAdvance(ctx(finance), first.id, { approvedSatang: null, note: null })
    await expectCode(
      () => advances.approveAdvance(ctx(finance), second.id, { approvedSatang: null, note: null }),
      'ADVANCE_PENDING_SETTLEMENT',
    )

    const stillPending = await db().advance.findUniqueOrThrow({ where: { id: second.id } })
    expect(stillPending.status).toBe('pending_approval')
    expect(stillPending.approvedAt).toBeNull()
  })
})

suite('เพดานยอดต่อครั้ง (`15` §11 · `13` §6.2.1)', () => {
  it('เกินเพดานที่ตั้งไว้ → ADVANCE_EXCEEDS_MAX', async () => {
    await db().$executeRawUnsafe(
      `UPDATE finance_policy_settings SET advance_max_amount_per_request_satang = 300000 WHERE organization_id = '${ORG_ID}'`,
    )
    await expectCode(
      () => advances.createAdvance(ctx(agent), createInput({ requestedSatang: 300_001 })),
      'ADVANCE_EXCEEDS_MAX',
    )
  })

  it('null = ไม่จำกัด ขอเท่าไรก็ได้', async () => {
    const created = await advances.createAdvance(ctx(agent), createInput({ requestedSatang: 9_999_900 }))
    expect(created.requestedSatang).toBe(9_999_900)
  })
})

suite('เคลียร์ยอด (`15` §16 · `22` §6.13)', () => {
  it('requested 5,000 ใช้จริง 4,200 → ยอดคืน 800 (generated column)', async () => {
    const created = await advances.createAdvance(ctx(agent), createInput({ requestedSatang: 500_000 }))
    await advances.approveAdvance(ctx(finance), created.id, { approvedSatang: null, note: null })

    const settled = await advances.settleAdvance(ctx(agent), created.id, {
      usedSatang: 420_000,
      receiptFileUrl: 'expenses/receipt-33.pdf',
      note: null,
    })
    expect(settled.status).toBe('cleared')
    expect(settled.returnSatang).toBe(80_000)
    expect(settled.excessSatang).toBe(0)
  })

  it('อนุมัติน้อยกว่าที่ขอ → ยอดคืนคิดจากยอดอนุมัติ (`02` §5 ชนะ `22` §6.13)', async () => {
    const created = await advances.createAdvance(ctx(agent), createInput({ requestedSatang: 500_000 }))
    await advances.approveAdvance(ctx(finance), created.id, { approvedSatang: 400_000, note: null })

    const settled = await advances.settleAdvance(ctx(agent), created.id, {
      usedSatang: 350_000,
      receiptFileUrl: null,
      note: null,
    })
    expect(settled.returnSatang).toBe(50_000)
  })

  it('ใช้เกินยอดที่ขอ → USED_EXCEEDS_REQUEST_NO_TOPUP (ยอดคืนห้ามติดลบ)', async () => {
    const created = await advances.createAdvance(ctx(agent), createInput({ requestedSatang: 500_000 }))
    await advances.approveAdvance(ctx(finance), created.id, { approvedSatang: null, note: null })

    await expectCode(
      () => advances.settleAdvance(ctx(agent), created.id, { usedSatang: 550_000, receiptFileUrl: null, note: null }),
      'USED_EXCEEDS_REQUEST_NO_TOPUP',
    )
  })

  it('เคลียร์ยอดจากสถานะ overdue ได้ (`15` §9.1)', async () => {
    const created = await advances.createAdvance(ctx(agent), createInput())
    await advances.approveAdvance(ctx(finance), created.id, { approvedSatang: null, note: null })
    await db().$executeRawUnsafe(`UPDATE advances SET status = 'overdue' WHERE id = '${created.id}'`)

    const settled = await advances.settleAdvance(ctx(agent), created.id, {
      usedSatang: 500_000,
      receiptFileUrl: null,
      note: null,
    })
    expect(settled.status).toBe('cleared')
  })

  it('เคลียร์ยอดซ้ำไม่ได้ (terminal)', async () => {
    const created = await advances.createAdvance(ctx(agent), createInput())
    await advances.approveAdvance(ctx(finance), created.id, { approvedSatang: null, note: null })
    await advances.settleAdvance(ctx(agent), created.id, { usedSatang: 100_000, receiptFileUrl: null, note: null })

    await expectCode(
      () => advances.settleAdvance(ctx(agent), created.id, { usedSatang: 100_000, receiptFileUrl: null, note: null }),
      'ADVANCE_INVALID_STATUS',
    )
  })
})

suite('อนุมัติ/ปฏิเสธ + scope (`15` §12/§16)', () => {
  it('ปฏิเสธไม่กรอกเหตุผล → REJECTION_REASON_REQUIRED', async () => {
    const created = await advances.createAdvance(ctx(agent), createInput())
    await expectCode(
      () => advances.rejectAdvance(ctx(finance), created.id, { rejectionReason: '   ' }),
      'REJECTION_REASON_REQUIRED',
    )
  })

  it('ปฏิเสธแล้วเป็น terminal — อนุมัติต่อไม่ได้', async () => {
    const created = await advances.createAdvance(ctx(agent), createInput())
    const rejected = await advances.rejectAdvance(ctx(finance), created.id, {
      rejectionReason: 'วัตถุประสงค์ไม่ชัดเจน กรุณาระบุใหม่',
    })
    expect(rejected.status).toBe('rejected')
    expect(rejected.rejectionReason).toBe('วัตถุประสงค์ไม่ชัดเจน กรุณาระบุใหม่')

    await expectCode(
      () => advances.approveAdvance(ctx(finance), created.id, { approvedSatang: null, note: null }),
      'ADVANCE_INVALID_STATUS',
    )
  })

  it('พนักงานเห็นเฉพาะคำขอของตัวเอง — ของคนอื่น = ADVANCE_NOT_FOUND (ไม่ leak)', async () => {
    const mine = await advances.createAdvance(ctx(agent), createInput())
    const theirs = await advances.createAdvance(ctx(agent2), createInput())

    const list = await advances.listAdvances(agent, { status: 'all' })
    expect(list.map((row) => row.id)).toEqual([mine.id])

    await expectCode(
      () => advances.settleAdvance(ctx(agent), theirs.id, { usedSatang: 1, receiptFileUrl: null, note: null }),
      'ADVANCE_NOT_FOUND',
    )
  })

  it('การเงินเห็นทั้งองค์กร', async () => {
    await advances.createAdvance(ctx(agent), createInput())
    await advances.createAdvance(ctx(agent2), createInput())

    const list = await advances.listAdvances(finance, { status: 'all' })
    expect(list).toHaveLength(2)
  })

  it('อนุมัติเกินยอดที่ขอไม่ได้', async () => {
    const created = await advances.createAdvance(ctx(agent), createInput({ requestedSatang: 500_000 }))
    await expectCode(
      () => advances.approveAdvance(ctx(finance), created.id, { approvedSatang: 600_000, note: null }),
      'ADVANCE_INVALID_STATUS',
    )
  })
})

suite('job auto-overdue (`15` §9.1/§10 · `91` idempotent)', () => {
  async function seedOverdueCandidate(): Promise<string> {
    const created = await advances.createAdvance(ctx(agent), createInput())
    await advances.approveAdvance(ctx(finance), created.id, { approvedSatang: null, note: null })
    await db().$executeRawUnsafe(
      `UPDATE advances SET due_clear_date = CURRENT_DATE - INTERVAL '1 day' WHERE id = '${created.id}'`,
    )
    return created.id
  }

  it('เลยกำหนดแล้วยังไม่เคลียร์ → มาร์คเป็น overdue อัตโนมัติ', async () => {
    const id = await seedOverdueCandidate()

    const result = await job.runAdvanceOverdueJob({ organizationId: ORG_ID })
    expect(result.marked).toBe(1)

    const row = await db().advance.findUniqueOrThrow({ where: { id }, select: { status: true } })
    expect(row.status).toBe('overdue')
  })

  it('รันซ้ำไม่เปลี่ยนอะไรเพิ่ม (idempotent)', async () => {
    await seedOverdueCandidate()
    await job.runAdvanceOverdueJob({ organizationId: ORG_ID })

    const second = await job.runAdvanceOverdueJob({ organizationId: ORG_ID })
    expect(second.marked).toBe(0)
    expect(second.skipped).toBe(0)
  })

  it('ยังไม่ถึงกำหนด / เคลียร์แล้ว / รออนุมัติ ไม่ถูกแตะ', async () => {
    const pending = await advances.createAdvance(ctx(agent), createInput({ dueClearDate: isoDate(-5) }))
    const other = await advances.createAdvance(ctx(agent2), createInput({ dueClearDate: isoDate(5) }))
    await advances.approveAdvance(ctx(finance), other.id, { approvedSatang: null, note: null })

    const result = await job.runAdvanceOverdueJob({ organizationId: ORG_ID })
    expect(result.marked).toBe(0)

    const rows = await db().advance.findMany({
      where: { organizationId: ORG_ID },
      select: { id: true, status: true },
      orderBy: { createdAt: 'asc' },
    })
    expect(rows.find((row) => row.id === pending.id)?.status).toBe('pending_approval')
    expect(rows.find((row) => row.id === other.id)?.status).toBe('approved')
  })

  it('มาร์คแล้วยังบล็อกการขอใหม่ (สถานะ overdue ยังไม่เคลียร์)', async () => {
    await seedOverdueCandidate()
    await job.runAdvanceOverdueJob({ organizationId: ORG_ID })

    await expectCode(() => advances.createAdvance(ctx(agent), createInput()), 'ADVANCE_PENDING_SETTLEMENT')
  })

  it('แจ้งเตือนผู้ยืม 1 ใบ และรันซ้ำไม่แจ้งซ้ำ (Phase 5.2 · `90` §6.3 — dedupeKey)', async () => {
    await seedOverdueCandidate()
    await job.runAdvanceOverdueJob({ organizationId: ORG_ID })

    const first = await db().notification.findMany({
      where: { organizationId: ORG_ID, eventCode: 'advance.overdue' },
      select: { id: true, userId: true, linkPath: true },
    })
    // การเงินในเทสต์ชุดนี้ไม่มีแถว `role_capabilities` จริง ⇒ ผู้รับที่แน่นอนคือผู้ยืมเท่านั้น
    expect(first.filter((row) => row.userId === AGENT_ID)).toHaveLength(1)
    expect(first.find((row) => row.userId === AGENT_ID)?.linkPath).toBe('/field/income')

    await job.runAdvanceOverdueJob({ organizationId: ORG_ID })
    const second = await db().notification.findMany({
      where: { organizationId: ORG_ID, eventCode: 'advance.overdue' },
      select: { id: true },
    })
    expect(second.map((row) => row.id).sort()).toEqual(first.map((row) => row.id).sort())
  })

  it('audit ของ job ระบุ actor = ระบบ พร้อม job id ใน reason (`90` §13)', async () => {
    const id = await seedOverdueCandidate()
    await job.runAdvanceOverdueJob({ organizationId: ORG_ID, jobId: 'advance_overdue_test' })

    const logs = await db().auditLog.findMany({
      where: { targetType: 'advances', targetId: id, action: 'status_change' },
      select: { actorId: true, reason: true },
    })
    const systemLog = logs.find((log) => log.actorId === null)
    expect(systemLog).toBeDefined()
    expect(systemLog?.reason).toContain('[job:advance_overdue_test]')
  })
})
