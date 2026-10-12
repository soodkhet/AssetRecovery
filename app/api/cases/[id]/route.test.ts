import { NextRequest } from 'next/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { SessionUser } from '@/lib/auth/types'

/**
 * `DELETE /api/cases/:id` (มติผู้ใช้ 12/10/2569 B3-02) — สิทธิ์ตรวจที่ API ก่อนแตะข้อมูล (DEC-002)
 * · ผู้ไม่ถือ `record_admin_data` (เช่น เจ้าหน้าที่อนุมัติเคส) ⇒ 403 · body ไม่มีเหตุผล ⇒ 400 ก่อนถึงชั้นข้อมูล
 */

const requireSessionMock = vi.hoisted(() => vi.fn())
vi.mock('@/lib/auth/session', () => ({ requireSession: requireSessionMock }))

const deleteDraftCaseMock = vi.hoisted(() => vi.fn())
vi.mock('@/lib/cases/queries', () => ({
  deleteDraftCase: deleteDraftCaseMock,
  getCase: vi.fn(),
  updateCase: vi.fn(),
}))

const ID = '00000000-0000-4000-8000-0000000000d1'
const USER_ID = '00000000-0000-4000-8000-0000000000e1'

function staff(capabilities: SessionUser['capabilities']): SessionUser {
  return {
    id: USER_ID,
    organizationId: '00000000-0000-4000-8000-0000000000aa',
    supabaseUid: 'uid-staff',
    email: 'staff@test.local',
    fullName: 'พนักงานทดสอบ',
    status: 'active',
    roleId: 'role-staff',
    roleName: 'ทดสอบ',
    roleGroup: 'system',
    isSuperadmin: false,
    teamId: null,
    companyId: null,
    capabilities,
    scope: { kind: 'global', teamIds: [], companyId: null, userId: USER_ID },
    loginAt: new Date().toISOString(),
  }
}

function del(body: unknown): NextRequest {
  return new NextRequest(`http://localhost/api/cases/${ID}`, {
    method: 'DELETE',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
}

async function call(body: unknown): Promise<Response> {
  const { DELETE } = await import('@/app/api/cases/[id]/route')
  return DELETE(del(body), { params: Promise.resolve({ id: ID }) })
}

beforeEach(() => {
  requireSessionMock.mockReset()
  deleteDraftCaseMock.mockReset()
})

describe('DELETE /api/cases/:id — ลบเคสร่าง (B3-02)', () => {
  it('เจ้าหน้าที่อนุมัติเคส (ไม่มีสิทธิ์สร้างเคส) → 403 ไม่แตะข้อมูล', async () => {
    requireSessionMock.mockResolvedValue(staff({ approve_case: 'manage' }))
    const response = await call({ reason: 'สร้างซ้ำกับเคสเดิม' })
    expect(response.status).toBe(403)
    expect(deleteDraftCaseMock).not.toHaveBeenCalled()
  })

  it('ธุรการไม่กรอกเหตุผล → 400 ไม่แตะข้อมูล', async () => {
    requireSessionMock.mockResolvedValue(staff({ record_admin_data: 'manage' }))
    const response = await call({})
    expect(response.status).toBe(400)
    expect(deleteDraftCaseMock).not.toHaveBeenCalled()
  })

  it('ธุรการ + เหตุผล → ส่งต่อชั้นข้อมูลพร้อมเหตุผล', async () => {
    requireSessionMock.mockResolvedValue(staff({ record_admin_data: 'manage' }))
    deleteDraftCaseMock.mockResolvedValue({ id: ID, caseRef: 'SF-1', deletedAt: '2026-10-12T07:00:00.000Z' })
    const response = await call({ reason: '  สร้างซ้ำกับเคสเดิม  ' })
    expect(response.status).toBe(200)
    expect(deleteDraftCaseMock).toHaveBeenCalledWith(
      expect.objectContaining({ id: USER_ID }),
      ID,
      expect.objectContaining({ reason: 'สร้างซ้ำกับเคสเดิม' }),
    )
  })
})
