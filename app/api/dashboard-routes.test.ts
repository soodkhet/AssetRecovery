import { beforeEach, describe, expect, it, vi } from 'vitest'
import { AuthError } from '@/lib/auth/errors'
import { ROLE_USERS, roleUser, TEAM_A } from '@/lib/dashboard/role-fixtures.test-helper'
import { COMPANY_ADMIN_ROLE_NAME } from '@/lib/auth/constants'

/**
 * เทสต์ระดับ route ของ `GET /api/dashboard` (Phase 6.6)
 *
 * สิ่งที่ชั้น pure ตรวจแทนไม่ได้:
 *  · ไม่ล็อกอิน = 401 · ผู้ใช้บริษัทไฟแนนซ์ = 403 (ใช้พอร์ทัลทางเดียว) — ทั้งสองกรณีไม่แตะ DB เลย
 *  · คิวที่ไม่มีสิทธิ์ **ไม่ถูก query** (ไม่ใช่ query แล้วค่อยซ่อน) และไม่มีใน response
 *  · ผู้จัดการทีมถูกกรองด้วยทีมของตัวเองในทุก query ที่ยิงจริง (scope helper เดิม)
 */

const requireSessionMock = vi.hoisted(() => vi.fn())
vi.mock('@/lib/auth/session', () => ({ requireSession: requireSessionMock }))

const prismaMock = vi.hoisted(() => {
  const model = () => ({ count: vi.fn(async () => 0), groupBy: vi.fn(async () => []) })
  return {
    case: model(),
    pendingReassignment: model(),
    advance: model(),
    payoutBatch: model(),
    adjustment: model(),
    exception: model(),
    bankTransaction: model(),
    accountingPeriod: model(),
    asset: model(),
    handoverLot: model(),
    job: model(),
  }
})
vi.mock('@/lib/prisma', () => ({ prisma: prismaMock }))

const compensationMock = vi.hoisted(() => ({ listCompensationApprovals: vi.fn() }))
vi.mock('@/lib/compensation/approval-queries', () => compensationMock)

const { GET } = await import('@/app/api/dashboard/route')

interface Envelope {
  success: boolean
  data?: {
    kpiSource: string
    arOver60: boolean
    queues: { id: string; count: number; capped: boolean }[]
    caseBoard: { rows: { status: string; count: number }[]; total: number; href: string | null } | null
    fieldTracker: boolean
  }
  error: { code: string } | null
}

async function call(): Promise<{ status: number; body: Envelope }> {
  const response = await GET(new Request('http://localhost/api/dashboard') as never, undefined as never)
  return { status: response.status, body: (await response.json()) as Envelope }
}

function allCountCalls(): number {
  return Object.values(prismaMock).reduce((sum, model) => sum + model.count.mock.calls.length, 0)
}

beforeEach(() => {
  requireSessionMock.mockReset()
  compensationMock.listCompensationApprovals.mockReset()
  compensationMock.listCompensationApprovals.mockResolvedValue([])
  for (const model of Object.values(prismaMock)) {
    model.count.mockReset()
    model.count.mockResolvedValue(0)
    model.groupBy.mockReset()
    model.groupBy.mockResolvedValue([])
  }
})

describe('GET /api/dashboard — สิทธิ์', () => {
  it('ไม่ได้ล็อกอิน = 401 และไม่แตะ DB', async () => {
    requireSessionMock.mockRejectedValue(new AuthError('UNAUTHENTICATED'))
    const { status } = await call()
    expect(status).toBe(401)
    expect(allCountCalls()).toBe(0)
  })

  it('ผู้ใช้บริษัทไฟแนนซ์ = 403 PERMISSION_DENIED และไม่แตะ DB', async () => {
    requireSessionMock.mockResolvedValue(
      roleUser(COMPANY_ADMIN_ROLE_NAME, 'finance_company', 'company', { companyId: 'company-1' }),
    )
    const { status, body } = await call()
    expect(status).toBe(403)
    expect(body.error?.code).toBe('PERMISSION_DENIED')
    expect(allCountCalls()).toBe(0)
  })

  it('พนักงานภาคสนาม — 200 แต่ไม่มีคิว/กระดานเคส และไม่ยิง query เลย', async () => {
    requireSessionMock.mockResolvedValue(ROLE_USERS.fieldAgent())
    const { status, body } = await call()
    expect(status).toBe(200)
    expect(body.data?.queues).toEqual([])
    expect(body.data?.caseBoard).toBeNull()
    expect(body.data?.fieldTracker).toBe(true)
    expect(allCountCalls()).toBe(0)
    expect(prismaMock.case.groupBy).not.toHaveBeenCalled()
  })

  it('บัญชี — ยิงเฉพาะคิวของตัวเอง (ปัญหาวิกฤต/กระทบยอด) ไม่แตะเงินทดรอง/รอบจ่าย/คลัง', async () => {
    requireSessionMock.mockResolvedValue(ROLE_USERS.accounting())
    prismaMock.exception.count.mockResolvedValue(2)
    prismaMock.bankTransaction.count.mockResolvedValue(1)

    const { status, body } = await call()

    expect(status).toBe(200)
    expect(body.data?.kpiSource).toBe('finance')
    // U115 — การเงินไม่เห็นการ์ดผู้บริหาร ⇒ ไม่มีบรรทัด "เกิน 60 วัน"
    expect(body.data?.arOver60).toBe(false)
    expect(body.data?.queues.map((queue) => [queue.id, queue.count])).toEqual([
      ['exception_critical_open', 2],
      ['bank_unmatched', 1],
    ])
    expect(prismaMock.exception.count).toHaveBeenCalledWith({
      where: { organizationId: 'org-1', level: 'critical', status: 'open' },
    })
    expect(prismaMock.advance.count).not.toHaveBeenCalled()
    expect(prismaMock.payoutBatch.count).not.toHaveBeenCalled()
    expect(prismaMock.asset.count).not.toHaveBeenCalled()
    expect(compensationMock.listCompensationApprovals).not.toHaveBeenCalled()
  })
})

describe('GET /api/dashboard — scope ทีม', () => {
  it('ผู้จัดการทีม: ทุก query เคส/ย้ายงานกรองด้วยทีมของตัวเอง · คิวค่าตอบแทนนับเฉพาะที่ลงมือได้', async () => {
    const manager = ROLE_USERS.manager()
    requireSessionMock.mockResolvedValue(manager)
    prismaMock.case.count.mockResolvedValue(3)
    prismaMock.pendingReassignment.count.mockResolvedValue(1)
    compensationMock.listCompensationApprovals.mockImplementation(async (_user: unknown, query: { status: string }) =>
      query.status === 'pending_approval'
        ? [{ viewerCanAct: true }, { viewerCanAct: false }]
        : [{ viewerCanAct: false }],
    )

    const { status, body } = await call()
    expect(status).toBe(200)
    expect(body.data?.queues.map((queue) => [queue.id, queue.count])).toEqual([
      ['case_awaiting_assignment', 3],
      ['reassign_waiting', 1],
      ['compensation_my_step', 1],
    ])
    expect(compensationMock.listCompensationApprovals).toHaveBeenCalledWith(manager, { status: 'pending_approval' })

    const teamFilter = { assignedTeamId: { in: [TEAM_A] } }
    for (const [args] of prismaMock.case.count.mock.calls as unknown as [{ where: { AND: unknown[] } }][]) {
      expect(args.where.AND).toContainEqual(expect.objectContaining(teamFilter))
    }
    expect(prismaMock.pendingReassignment.count).toHaveBeenCalledWith({
      where: { organizationId: 'org-1', status: 'waiting_consent', case: teamFilter },
    })
    // groupBy ของกระดานเคสก็ต้องกรองทีม
    const [groupArgs] = prismaMock.case.groupBy.mock.calls[0] as unknown as [{ where: { AND: unknown[] } }]
    expect(groupArgs.where.AND).toContainEqual(expect.objectContaining(teamFilter))
    // คิวระดับองค์กรไม่ถูกยิง
    expect(prismaMock.advance.count).not.toHaveBeenCalled()
    expect(prismaMock.exception.count).not.toHaveBeenCalled()
    expect(body.data?.caseBoard?.href).toBe('/cases/assign')
  })

  it('ผู้จัดการที่ไม่มีทีมในความดูแล — นับได้ 0 (ไม่เห็นเคสทั้งองค์กร)', async () => {
    requireSessionMock.mockResolvedValue({
      ...ROLE_USERS.manager(),
      scope: { kind: 'team', teamIds: [], companyId: null, userId: 'user-1' },
    })
    await call()
    expect(prismaMock.case.count).toHaveBeenCalled()
    for (const [args] of prismaMock.case.count.mock.calls as unknown as [{ where: { AND: unknown[] } }][]) {
      expect(args.where.AND).toContainEqual({ id: { in: [] } })
    }
  })
})

describe('GET /api/dashboard — Superadmin', () => {
  it('เห็นทุกคิว · กระดานเคสครบ 7 สถานะ · งานระบบที่ไม่ผูกองค์กรนับรวม', async () => {
    requireSessionMock.mockResolvedValue(ROLE_USERS.superadmin())
    prismaMock.case.groupBy.mockResolvedValue([
      { status: 'active', _count: { _all: 4 } },
      { status: 'pending_review', _count: { _all: 2 } },
    ] as never)
    prismaMock.case.count.mockResolvedValue(1)

    const { body } = await call()

    expect(body.data?.kpiSource).toBe('executive')
    expect(body.data?.arOver60).toBe(true)
    expect(body.data?.queues).toHaveLength(17)
    expect(body.data?.caseBoard?.rows).toHaveLength(7)
    // active 4 + pending_review 2 + ปิดสำเร็จเดือนนี้ 1 + ปิดไม่สำเร็จเดือนนี้ 1
    expect(body.data?.caseBoard?.total).toBe(8)
    expect(prismaMock.job.count).toHaveBeenCalledWith({
      where: { status: 'failed', OR: [{ organizationId: 'org-1' }, { organizationId: null }] },
    })
  })
})
