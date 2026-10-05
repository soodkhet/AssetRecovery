import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { NextRequest } from 'next/server'
import type { SessionUser } from '@/lib/auth/types'

/**
 * เทสต์ระดับ route ของ `POST /api/payout-batches/:id/cancel` (มติ PO U67)
 * ตรวจสิ่งที่ pure/DB test แทนไม่ได้: capability ที่ผูกกับ endpoint (DEC-002 · `25` §7.2) และ
 * การปฏิเสธที่หน้าประตูเมื่อไม่มีเหตุผล (`CANCEL_REQUIRES_REASON` 400) ก่อนแตะ service
 */

const requireSessionMock = vi.hoisted(() => vi.fn())
vi.mock('@/lib/auth/session', () => ({ requireSession: requireSessionMock }))

const queriesMock = vi.hoisted(() => ({
  cancelPayoutBatch: vi.fn(),
  MANAGE_PAYOUT_BATCH: 'manage_payout_batch',
}))
vi.mock('@/lib/payout/queries', () => queriesMock)

const { POST } = await import('@/app/api/payout-batches/[id]/cancel/route')

const BATCH_ID = '00000000-0000-4000-8000-000000000a01'

function sessionUser(capabilities: Record<string, 'view' | 'manage'>): SessionUser {
  return {
    id: 'user-1',
    organizationId: 'org-1',
    supabaseUid: 'uid-1',
    email: 'finance@example.com',
    fullName: 'การเงิน ทดสอบ',
    status: 'active',
    roleId: 'role-1',
    roleName: 'การเงิน',
    roleGroup: 'system',
    isSuperadmin: false,
    teamId: null,
    companyId: null,
    capabilities,
    scope: { kind: 'global', teamIds: [], companyId: null, userId: 'user-1' },
    loginAt: new Date().toISOString(),
  }
}

const FINANCE = sessionUser({ manage_payout_batch: 'manage', generate_payment_file: 'manage' })
/** บัญชี/ผู้บริหาร = ดูรอบจ่ายได้อย่างเดียว */
const VIEWER = sessionUser({ manage_payout_batch: 'view' })
const FIELD_AGENT = sessionUser({ perform_field_work: 'manage' })

function request(body: unknown): NextRequest {
  const url = `http://localhost/api/payout-batches/${BATCH_ID}/cancel`
  const base = new Request(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  }) as unknown as NextRequest
  return Object.assign(base, { nextUrl: new URL(url) }) as NextRequest
}

const params = { params: Promise.resolve({ id: BATCH_ID }) }

async function codeOf(response: Response): Promise<string | undefined> {
  return ((await response.json()) as { error: { code: string } | null }).error?.code
}

beforeEach(() => {
  requireSessionMock.mockReset()
  queriesMock.cancelPayoutBatch.mockReset()
})

describe('สิทธิ์ยกเลิกรอบจ่าย (DEC-002)', () => {
  it('ผู้ที่ดูได้อย่างเดียว / ไม่มี capability = 403 และไม่แตะ service', async () => {
    for (const user of [VIEWER, FIELD_AGENT]) {
      requireSessionMock.mockResolvedValue(user)
      const response = await POST(request({ reason: 'ยกเลิกเพราะดึงรายการผิด' }), params)
      expect(response.status).toBe(403)
    }
    expect(queriesMock.cancelPayoutBatch).not.toHaveBeenCalled()
  })

  it('การเงิน (manage) ส่งต่อให้ service พร้อมเหตุผลและการยืนยันไฟล์', async () => {
    requireSessionMock.mockResolvedValue(FINANCE)
    queriesMock.cancelPayoutBatch.mockResolvedValue({ releasedExpenseCount: 1 })
    const response = await POST(request({ reason: 'ยกเลิกเพราะดึงรายการผิด', confirmFileNotSent: true }), params)
    expect(response.status).toBe(200)
    expect(queriesMock.cancelPayoutBatch).toHaveBeenCalledWith(expect.anything(), BATCH_ID, {
      reason: 'ยกเลิกเพราะดึงรายการผิด',
      confirmFileNotSent: true,
    })
  })
})

describe('เหตุผลบังคับ (CANCEL_REQUIRES_REASON)', () => {
  beforeEach(() => requireSessionMock.mockResolvedValue(FINANCE))

  it.each([{}, { reason: '' }, { reason: '   ' }, { reason: 'สั้น' }])('ไม่มีเหตุผลพอ %j = 400', async (body) => {
    const response = await POST(request(body), params)
    expect(response.status).toBe(400)
    expect(await codeOf(response)).toBe('CANCEL_REQUIRES_REASON')
    expect(queriesMock.cancelPayoutBatch).not.toHaveBeenCalled()
  })

  it('ชนิดข้อมูลผิด = 400 field error (Zod ชุดเดียวกับหน้าจอ)', async () => {
    const response = await POST(request({ reason: 'ยกเลิกเพราะดึงรายการผิด', confirmFileNotSent: 'yes' }), params)
    expect(response.status).toBe(400)
    expect(queriesMock.cancelPayoutBatch).not.toHaveBeenCalled()
  })
})
