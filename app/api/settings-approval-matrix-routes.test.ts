import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { NextRequest } from 'next/server'
import type { SessionUser } from '@/lib/auth/types'

/**
 * UAT BUG-008 — ชื่อ role ในสายอนุมัติเดิมเป็นข้อความอิสระ พิมพ์ผิดก็บันทึกได้ แล้วไปพังตอนอนุมัติ
 * (`APPROVAL_MATRIX_NOT_FOUND`) ⇒ POST/PATCH ต้องตอบ 400 + field error ที่ `approvalFlow`
 * เมื่ออ้าง role ที่ไม่มีจริงในองค์กร (หรือมีแต่เป็นผู้อนุมัติไม่ได้) และต้องไม่แตะชั้นเขียน
 *
 * ใช้ `findInvalidApprovalSteps()` ตัวจริง (mock แค่ `prisma.role.findMany`) · ชั้นเขียนถูก mock
 */

const requireSessionMock = vi.hoisted(() => vi.fn())
vi.mock('@/lib/auth/session', () => ({ requireSession: requireSessionMock }))

const prismaMock = vi.hoisted(() => ({ role: { findMany: vi.fn() } }))
vi.mock('@/lib/prisma', () => ({ prisma: prismaMock }))

const writeMock = vi.hoisted(() => ({
  createApprovalMatrix: vi.fn(),
  updateApprovalMatrix: vi.fn(),
  getApprovalMatrix: vi.fn(),
}))
vi.mock('@/lib/settings/queries/approval-matrix', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/settings/queries/approval-matrix')>()),
  ...writeMock,
}))

const collection = await import('@/app/api/settings/approval-matrix/route')
const item = await import('@/app/api/settings/approval-matrix/[id]/route')

const SUPERADMIN: SessionUser = {
  id: 'sa-1',
  organizationId: 'org-1',
  supabaseUid: 'uid-1',
  email: 'sa@example.com',
  fullName: 'ผู้ดูแลระบบ',
  status: 'active',
  roleId: 'role-sa',
  roleName: 'Superadmin',
  roleGroup: 'system',
  isSuperadmin: true,
  teamId: null,
  companyId: null,
  capabilities: {},
  scope: { kind: 'global', teamIds: [], companyId: null, userId: 'sa-1' },
  loginAt: new Date().toISOString(),
}

/** role ที่มีจริงในองค์กร — ชื่อผู้จัดการซ้ำ 2 กลุ่ม (inhouse/outsource) ตาม seed */
const ORG_ROLES = [
  { name: 'ผู้จัดการทีมติดตามทรัพย์' },
  { name: 'ผู้จัดการทีมติดตามทรัพย์' },
  { name: 'การเงิน' },
  { name: 'บริหาร' },
  { name: 'ธุรการ' },
]

function body(approvalFlow: string[]) {
  return {
    condition: 'Claim ปกติ',
    conditionThresholdSatang: null,
    approvalFlow,
    enforceSegregationOfDuties: false,
    reason: 'ตั้งสายอนุมัติตามมติที่ประชุม',
  }
}

function request(method: string, url: string, payload: unknown): NextRequest {
  const base = new Request(url, {
    method,
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(payload),
  }) as unknown as NextRequest
  return Object.assign(base, { nextUrl: new URL(url) }) as NextRequest
}

interface Envelope {
  error?: { code: string; fields?: Record<string, string> } | null
}

const MATRIX_ID = '00000000-0000-4000-8000-0000000c0001'
const itemContext = { params: Promise.resolve({ id: MATRIX_ID }) }

beforeEach(() => {
  vi.clearAllMocks()
  requireSessionMock.mockResolvedValue(SUPERADMIN)
  prismaMock.role.findMany.mockResolvedValue(ORG_ROLES)
  writeMock.createApprovalMatrix.mockResolvedValue({ id: MATRIX_ID })
  writeMock.updateApprovalMatrix.mockResolvedValue({ id: MATRIX_ID })
  writeMock.getApprovalMatrix.mockResolvedValue({ id: MATRIX_ID })
})

describe('สายอนุมัติต้องอ้าง role ที่มีจริง (UAT BUG-008)', () => {
  it('POST ชื่อ role ถูกต้องทุกขั้น → 201', async () => {
    const response = await collection.POST(
      request('POST', 'http://localhost/api/settings/approval-matrix', body(['ผู้จัดการทีมติดตามทรัพย์', 'การเงิน'])),
      undefined,
    )
    expect(response.status).toBe(201)
    expect(writeMock.createApprovalMatrix).toHaveBeenCalledOnce()
    expect(prismaMock.role.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { organizationId: 'org-1', deletedAt: null } }),
    )
  })

  it('POST พิมพ์ชื่อ role ผิด → 400 REQUIRED_MISSING + field error ที่ approvalFlow · ไม่เขียน', async () => {
    const response = await collection.POST(
      request('POST', 'http://localhost/api/settings/approval-matrix', body(['ผู้จัดการทีม', 'การเงิน'])),
      undefined,
    )
    expect(response.status).toBe(400)
    const envelope = (await response.json()) as Envelope
    expect(envelope.error?.code).toBe('REQUIRED_MISSING')
    expect(envelope.error?.fields?.approvalFlow).toContain('ผู้จัดการทีม')
    expect(writeMock.createApprovalMatrix).not.toHaveBeenCalled()
  })

  it('POST role มีจริงแต่อนุมัติไม่ได้ (ธุรการ) → 400', async () => {
    const response = await collection.POST(
      request('POST', 'http://localhost/api/settings/approval-matrix', body(['ธุรการ'])),
      undefined,
    )
    expect(response.status).toBe(400)
    expect(writeMock.createApprovalMatrix).not.toHaveBeenCalled()
  })

  it('PATCH อ้าง role ที่ถูกลบ/ไม่มีในองค์กร → 400 · ไม่เขียน', async () => {
    prismaMock.role.findMany.mockResolvedValue([{ name: 'การเงิน' }])
    const response = await item.PATCH(
      request('PATCH', `http://localhost/api/settings/approval-matrix/${MATRIX_ID}`, body(['การเงิน', 'บริหาร'])),
      itemContext,
    )
    expect(response.status).toBe(400)
    expect(((await response.json()) as Envelope).error?.fields?.approvalFlow).toContain('บริหาร')
    expect(writeMock.updateApprovalMatrix).not.toHaveBeenCalled()
  })
})
