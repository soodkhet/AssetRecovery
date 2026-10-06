import { PrismaPg } from '@prisma/adapter-pg'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { PrismaClient } from '@/lib/generated/prisma/client'

/**
 * แจ้งผู้อนุมัติ "ขั้นที่รออยู่" เมื่อรายการเข้าคิว — มติ PO 05/10/2569 U29 (BUG-106)
 *  · รายการเบิกขั้น 1 → ผู้จัดการของทีมผู้เบิกเท่านั้น (มติ R6-B) · ผู้ขอไม่ได้รับของตัวเอง
 *  · ขั้น 2 → การเงินระดับองค์กร · event ส่งซ้ำไม่แจ้งซ้ำ (idempotent) · รอบใหม่หลังตีกลับแจ้งใหม่
 *  · เงินทดรอง → ผู้ถือ `approve_advance` · Adjustment → เฉพาะบทบาทที่ยังขาด
 *
 * ⚠️ ตั้ง `DATABASE_URL = TEST_DATABASE_URL` ก่อน import service · ตาราง `capabilities` ไม่มี organization_id
 * ⇒ ใส่ code จริงแบบ ON CONFLICT แล้วผูกเฉพาะ role ของเทสต์นี้ (ล้างเฉพาะของตัวเองตอนจบ)
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

const ORG_ID = '00000000-0000-4000-8000-0000000a2900'
const ROLE_MANAGER = '00000000-0000-4000-8000-0000000a2901'
const ROLE_FINANCE = '00000000-0000-4000-8000-0000000a2902'
const ROLE_EXEC = '00000000-0000-4000-8000-0000000a2903'
const ROLE_AGENT = '00000000-0000-4000-8000-0000000a2904'
const MANAGER_A = '00000000-0000-4000-8000-0000000a2910'
const MANAGER_B = '00000000-0000-4000-8000-0000000a2911'
const FINANCE_1 = '00000000-0000-4000-8000-0000000a2912'
const FINANCE_2 = '00000000-0000-4000-8000-0000000a2913'
const EXEC_1 = '00000000-0000-4000-8000-0000000a2914'
const AGENT_A = '00000000-0000-4000-8000-0000000a2915'
const TEAM_A = '00000000-0000-4000-8000-0000000a2920'
const TEAM_B = '00000000-0000-4000-8000-0000000a2921'
const PAYEE_A = '00000000-0000-4000-8000-0000000a2922'
const MATRIX_ID = '00000000-0000-4000-8000-0000000a2923'

const CAPABILITY_CODES = [
  'approve_expense_manager',
  'approve_expense_finance',
  'approve_advance',
  'approve_adjustment',
] as const
const GRANTS: ReadonlyArray<readonly [string, (typeof CAPABILITY_CODES)[number]]> = [
  [ROLE_MANAGER, 'approve_expense_manager'],
  [ROLE_FINANCE, 'approve_expense_finance'],
  [ROLE_FINANCE, 'approve_advance'],
  [ROLE_FINANCE, 'approve_adjustment'],
  [ROLE_EXEC, 'approve_adjustment'],
]

let client: PrismaClient | null = null
let queue: typeof import('@/lib/notifications/approval-queue')

function db(): PrismaClient {
  if (!url) throw new Error('ไม่มี TEST_DATABASE_URL')
  if (!client) {
    assertLocalTestDatabase(url)
    client = new PrismaClient({ adapter: new PrismaPg({ connectionString: url }) })
  }
  return client
}

async function inbox(eventCode: string): Promise<{ userId: string; body: string | null; title: string }[]> {
  return db().notification.findMany({
    where: { organizationId: ORG_ID, eventCode },
    select: { userId: true, body: true, title: true },
    orderBy: { userId: 'asc' },
  })
}

async function recipientsOf(eventCode: string): Promise<string[]> {
  return (await inbox(eventCode)).map((row) => row.userId).sort()
}

let expenseSeq = 0
async function seedExpense(input: { grossSatang: number; type?: string; step?: number; history?: unknown[] }): Promise<string> {
  expenseSeq += 1
  const step = input.step ?? 1
  const rows = await db().$queryRawUnsafe<{ id: string }[]>(`
    INSERT INTO expenses (
      organization_id, payee_id, expense_type, gross_satang, expense_date, status, calculation_source,
      approval_step_current, approval_step_total, approval_matrix_id, approval_history, created_by
    ) VALUES (
      '${ORG_ID}', '${PAYEE_A}', '${input.type ?? 'hotel'}', ${input.grossSatang}, DATE '2026-10-01',
      '${step === 1 ? 'pending_approval' : 'pending_finance_approval'}', 'manual',
      ${step}, 2, ${step === 1 && input.history === undefined ? 'NULL' : `'${MATRIX_ID}'`},
      '${JSON.stringify(input.history ?? [])}'::jsonb, '${AGENT_A}'
    ) RETURNING id
  `)
  return rows[0]?.id ?? `missing-${expenseSeq}`
}

beforeAll(async () => {
  if (!url) return
  process.env.DATABASE_URL = url
  queue = await import('@/lib/notifications/approval-queue')
  const tx = db()
  await tx.$executeRawUnsafe(`
    INSERT INTO organizations (id, name, tax_id, address)
    VALUES ('${ORG_ID}', 'ApprovalQueueU29', '9999999992900', 'ที่อยู่ทดสอบ U29') ON CONFLICT (id) DO NOTHING
  `)
  await tx.$executeRawUnsafe(`
    INSERT INTO roles (id, organization_id, name, role_group, is_seed) VALUES
      ('${ROLE_MANAGER}', '${ORG_ID}', 'ผู้จัดการทีมติดตามทรัพย์', 'inhouse', false),
      ('${ROLE_FINANCE}', '${ORG_ID}', 'การเงิน', 'system', false),
      ('${ROLE_EXEC}', '${ORG_ID}', 'บริหาร', 'system', false),
      ('${ROLE_AGENT}', '${ORG_ID}', 'พนักงานติดตามทรัพย์', 'inhouse', false)
    ON CONFLICT (id) DO NOTHING
  `)
  await tx.$executeRawUnsafe(`
    INSERT INTO users (id, organization_id, role_id, email, full_name, status) VALUES
      ('${MANAGER_A}', '${ORG_ID}', '${ROLE_MANAGER}', 'mgr-a-u29@test.local', 'ผู้จัดการ A', 'active'),
      ('${MANAGER_B}', '${ORG_ID}', '${ROLE_MANAGER}', 'mgr-b-u29@test.local', 'ผู้จัดการ B', 'active'),
      ('${FINANCE_1}', '${ORG_ID}', '${ROLE_FINANCE}', 'fin1-u29@test.local', 'การเงิน 1', 'active'),
      ('${FINANCE_2}', '${ORG_ID}', '${ROLE_FINANCE}', 'fin2-u29@test.local', 'การเงิน 2', 'active'),
      ('${EXEC_1}', '${ORG_ID}', '${ROLE_EXEC}', 'exec-u29@test.local', 'ผู้บริหาร 1', 'active'),
      ('${AGENT_A}', '${ORG_ID}', '${ROLE_AGENT}', 'agent-u29@test.local', 'พนักงาน A', 'active')
    ON CONFLICT (id) DO NOTHING
  `)
  await tx.$executeRawUnsafe(`
    INSERT INTO teams (id, organization_id, name, side, provinces, status, created_by) VALUES
      ('${TEAM_A}', '${ORG_ID}', 'ทีม A U29', 'inhouse', ARRAY['ลำปาง'], 'active', '${FINANCE_1}'),
      ('${TEAM_B}', '${ORG_ID}', 'ทีม B U29', 'inhouse', ARRAY['พะเยา'], 'active', '${FINANCE_1}')
    ON CONFLICT (id) DO NOTHING
  `)
  await tx.$executeRawUnsafe(`
    INSERT INTO team_managers (team_id, user_id) VALUES ('${TEAM_A}', '${MANAGER_A}'), ('${TEAM_B}', '${MANAGER_B}')
    ON CONFLICT DO NOTHING
  `)
  await tx.$executeRawUnsafe(`UPDATE users SET team_id = '${TEAM_A}' WHERE id = '${AGENT_A}'`)
  await tx.$executeRawUnsafe(`
    INSERT INTO payee_profiles (id, organization_id, user_id, payee_type, is_verified, created_by)
    VALUES ('${PAYEE_A}', '${ORG_ID}', '${AGENT_A}', 'individual', true, '${FINANCE_1}')
    ON CONFLICT (id) DO NOTHING
  `)
  await tx.$executeRawUnsafe(`
    INSERT INTO approval_matrices
      (id, organization_id, condition, condition_threshold_satang, approval_flow_role_ids, enforce_segregation_of_duties, created_by)
    VALUES ('${MATRIX_ID}', '${ORG_ID}', 'สาย 2 ขั้น U29', NULL,
            ARRAY['${ROLE_MANAGER}', '${ROLE_FINANCE}']::uuid[], true, '${FINANCE_1}')
    ON CONFLICT (id) DO NOTHING
  `)
  for (const code of CAPABILITY_CODES) {
    await tx.$executeRawUnsafe(
      `INSERT INTO capabilities (code, label, module) VALUES ('${code}', '${code}', 'test') ON CONFLICT (code) DO NOTHING`,
    )
  }
  for (const [roleId, code] of GRANTS) {
    await tx.$executeRawUnsafe(`
      INSERT INTO role_capabilities (role_id, capability_id, access_level)
      SELECT '${roleId}', id, 'manage' FROM capabilities WHERE code = '${code}'
      ON CONFLICT DO NOTHING
    `)
  }
})

async function cleanup(): Promise<void> {
  const tx = db()
  await tx.$executeRawUnsafe(`DELETE FROM notifications WHERE organization_id = '${ORG_ID}'`)
  await tx.$executeRawUnsafe(`DELETE FROM notification_outbox WHERE organization_id = '${ORG_ID}'`)
  await tx.$executeRawUnsafe(`DELETE FROM expenses WHERE organization_id = '${ORG_ID}'`)
  await tx.$executeRawUnsafe(`DELETE FROM advances WHERE organization_id = '${ORG_ID}'`)
}

afterAll(async () => {
  if (url) {
    await cleanup()
    await db().$executeRawUnsafe(
      `DELETE FROM role_capabilities WHERE role_id IN ('${ROLE_MANAGER}', '${ROLE_FINANCE}', '${ROLE_EXEC}', '${ROLE_AGENT}')`,
    )
  }
  await client?.$disconnect()
})

suite('แจ้งผู้อนุมัติขั้นที่รออยู่ (มติ PO U29 · BUG-106)', () => {
  beforeEach(cleanup)

  it('รายการเบิกไม่ผูกงานขั้น 1 → ผู้จัดการทีมของผู้เบิกเท่านั้น (ทีมอื่น/การเงิน/ผู้ขอไม่ได้) · ข้อความบอกชนิด ผู้ขอ ยอด', async () => {
    const e1 = await seedExpense({ grossSatang: 120_000, type: 'hotel' })
    const e2 = await seedExpense({ grossSatang: 30_050, type: 'manual' })

    const created = await queue.notifyExpensesAwaitingApprovalAwaited(ORG_ID, [e1, e2])
    expect(created).toBe(1)
    const rows = await inbox('expense.approval_requested')
    expect(rows.map((row) => row.userId)).toEqual([MANAGER_A])
    expect(rows[0]?.title).toBe('รายการเบิกรออนุมัติ ขั้น 1/2')
    expect(rows[0]?.body).toBe('ค่าที่พัก, รายการกรอกเอง · ผู้ขอ พนักงาน A · 2 รายการ รวม ฿1,500.50')
  })

  it('event ส่งซ้ำ (เรียกซ้ำด้วยชุดเดิม) ไม่แจ้งซ้ำ · รายการที่ไม่อยู่ในคิว (รอคลัง) ถูกข้าม', async () => {
    const e1 = await seedExpense({ grossSatang: 50_000 })
    expect(await queue.notifyExpensesAwaitingApprovalAwaited(ORG_ID, [e1])).toBe(1)
    expect(await queue.notifyExpensesAwaitingApprovalAwaited(ORG_ID, [e1])).toBe(0)
    expect(await recipientsOf('expense.approval_requested')).toEqual([MANAGER_A])

    await db().$executeRawUnsafe(`UPDATE expenses SET status = 'pending_warehouse_confirm' WHERE id = '${e1}'`)
    expect(await queue.collectExpenseApprovalNotices(ORG_ID, [e1])).toEqual([])
  })

  it('ผ่านขั้น 1 แล้ว → การเงินทั้งองค์กรได้แจ้งขั้น 2 · ผู้อนุมัติขั้น 1 ถูกตัดออกเมื่อบังคับแบ่งแยกหน้าที่', async () => {
    const history = [
      { step: 1, approverId: FINANCE_2, approverRole: 'ผู้จัดการทีมติดตามทรัพย์', action: 'approve', timestamp: '2026-10-01T03:00:00.000Z', reason: null },
    ]
    const e1 = await seedExpense({ grossSatang: 80_000, step: 2, history })
    expect(await queue.notifyExpensesAwaitingApprovalAwaited(ORG_ID, [e1])).toBe(1)
    const rows = await inbox('expense.approval_requested')
    // FINANCE_2 อนุมัติขั้นก่อน (สาย SoD) ⇒ ไม่ถูกขอให้อนุมัติซ้ำ · ผู้จัดการไม่ได้แจ้งขั้น 2
    expect(rows.map((row) => row.userId)).toEqual([FINANCE_1])
    expect(rows[0]?.title).toBe('รายการเบิกรออนุมัติ ขั้น 2/2')
  })

  it('ส่งใหม่หลังตีกลับ (กลับขั้น 1 · history ยาวขึ้น) = รอบใหม่ แจ้งได้อีกครั้ง', async () => {
    const e1 = await seedExpense({ grossSatang: 50_000 })
    expect(await queue.notifyExpensesAwaitingApprovalAwaited(ORG_ID, [e1])).toBe(1)
    const history = [
      { step: 1, approverId: MANAGER_A, approverRole: 'ผู้จัดการทีมติดตามทรัพย์', action: 'reject', timestamp: '2026-10-01T03:00:00.000Z', reason: 'ใบเสร็จไม่ชัด' },
    ]
    await db().$executeRawUnsafe(
      `UPDATE expenses SET approval_history = '${JSON.stringify(history)}'::jsonb WHERE id = '${e1}'`,
    )
    expect(await queue.notifyExpensesAwaitingApprovalAwaited(ORG_ID, [e1])).toBe(1)
    expect(await db().notification.count({ where: { organizationId: ORG_ID, userId: MANAGER_A } })).toBe(2)
  })

  it('เงินทดรองใหม่ → ผู้ถือสิทธิ์อนุมัติเงินทดรอง (ไม่รวมผู้บันทึกแทน) · ยอด ฿ จาก satang', async () => {
    const rows = await db().$queryRawUnsafe<{ id: string }[]>(`
      INSERT INTO advances (organization_id, payee_id, requested_satang, purpose, due_clear_date, status, created_by)
      VALUES ('${ORG_ID}', '${PAYEE_A}', 350000, 'ค่าเดินทางต่างจังหวัด', '2026-10-20', 'pending_approval', '${FINANCE_2}')
      RETURNING id
    `)
    const advanceId = rows[0]?.id ?? ''
    queue.notifyAdvanceAwaitingApproval(ORG_ID, advanceId)
    await vi.waitFor(async () => expect(await recipientsOf('advance.approval_requested')).toEqual([FINANCE_1]))
    const [row] = await inbox('advance.approval_requested')
    expect(row?.body).toBe('ผู้ขอ พนักงาน A · ยอด ฿3,500.00 · เคลียร์ภายใน 20/10/2569 — ค่าเดินทางต่างจังหวัด')

    // เรียกซ้ำ = ไม่ซ้ำ
    queue.notifyAdvanceAwaitingApproval(ORG_ID, advanceId)
    await new Promise((resolve) => setTimeout(resolve, 200))
    expect(await recipientsOf('advance.approval_requested')).toEqual([FINANCE_1])
  })

  it('Adjustment: แจ้งเฉพาะบทบาทที่ยังขาด (การเงินอนุมัติแล้ว → บริหารเท่านั้น) · ผู้กดไม่ได้รับ', async () => {
    const base = {
      status: 'pending_approval',
      adjustmentTypeLabel: 'ลดยอด',
      amountSatang: 12_345,
      targetLabel: 'CASE-1 · ไฟแนนซ์ A · รายได้',
      requesterName: 'การเงิน 1',
      capability: 'approve_adjustment',
    }
    queue.notifyAdjustmentAwaitingApproval(ORG_ID, {
      ...base,
      id: 'adj-u29-1',
      missingRoles: ['การเงิน', 'บริหาร'],
      excludeUserIds: [FINANCE_1],
    })
    await vi.waitFor(async () =>
      expect(await recipientsOf('adjustment.approval_requested')).toEqual([FINANCE_2, EXEC_1].sort()),
    )

    await db().$executeRawUnsafe(`DELETE FROM notifications WHERE organization_id = '${ORG_ID}'`)
    queue.notifyAdjustmentAwaitingApproval(ORG_ID, {
      ...base,
      id: 'adj-u29-1',
      missingRoles: ['บริหาร'],
      excludeUserIds: [FINANCE_2],
    })
    await vi.waitFor(async () => expect(await recipientsOf('adjustment.approval_requested')).toEqual([EXEC_1]))

    // ครบแล้ว/ไม่ได้รออยู่ = ไม่แจ้ง
    queue.notifyAdjustmentAwaitingApproval(ORG_ID, { ...base, id: 'adj-u29-2', status: 'approved', missingRoles: [], excludeUserIds: [] })
    await new Promise((resolve) => setTimeout(resolve, 200))
    expect(await recipientsOf('adjustment.approval_requested')).toEqual([EXEC_1])
  })
})
