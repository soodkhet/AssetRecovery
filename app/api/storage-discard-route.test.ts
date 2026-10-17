import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { NextRequest } from 'next/server'
import type { SessionUser } from '@/lib/auth/types'
import { uploadDiscardToken } from '@/lib/uploads/discard-token'

/**
 * mytester6 T-015/T-019 — `POST /api/storage/discard`: ทิ้งไฟล์ที่อัปโหลดแล้วไม่ได้ใช้
 * ลบได้เฉพาะไฟล์ที่ผู้เรียกเป็นคนขอ path (โทเคนผูกผู้ใช้) และยังไม่ผูก record (ตรวจใน `discardStagedUpload`)
 */

const requireSessionMock = vi.hoisted(() => vi.fn())
vi.mock('@/lib/auth/session', () => ({ requireSession: requireSessionMock }))

const SECRET = 'test-upload-discard-secret'
vi.mock('@/lib/uploads/storage', () => ({ uploadDiscardSecret: () => SECRET }))

const verifyMock = vi.hoisted(() => ({ discardStagedUpload: vi.fn(async () => true) }))
vi.mock('@/lib/uploads/verify', () => verifyMock)

const { POST } = await import('@/app/api/storage/discard/route')

const AGENT_ID = '00000000-0000-4000-8000-0000000000a1'
const OTHER_ID = '00000000-0000-4000-8000-0000000000a2'
const PATH = 'cases/00000000-0000-4000-8000-000000000011/field_evidence/photo/abc-photo.jpg'

function sessionUser(id: string, capabilities: Record<string, 'view' | 'manage'>): SessionUser {
  return {
    id,
    organizationId: 'org-1',
    supabaseUid: `uid-${id}`,
    email: `${id}@example.com`,
    fullName: 'ผู้ใช้ ทดสอบ',
    status: 'active',
    roleId: 'role-1',
    roleName: 'ทดสอบ',
    roleGroup: 'system',
    isSuperadmin: false,
    teamId: null,
    companyId: null,
    capabilities,
    scope: { kind: 'global', teamIds: [], companyId: null, userId: id },
    loginAt: new Date().toISOString(),
  } as SessionUser
}

const AGENT = sessionUser(AGENT_ID, { perform_field_work: 'manage' })

function req(body: unknown): NextRequest {
  const url = 'http://localhost/api/storage/discard'
  const base = new Request(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })
  return Object.assign(base, { nextUrl: new URL(url) }) as unknown as NextRequest
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('POST /api/storage/discard', () => {
  it('โทเคนของผู้เรียกเอง ⇒ ลบ (ผ่านการตรวจ "ยังไม่ผูก record")', async () => {
    requireSessionMock.mockResolvedValue(AGENT)
    const response = await POST(req({ items: [{ path: PATH, discardToken: uploadDiscardToken(SECRET, AGENT_ID, PATH) }] }))
    expect(response.status).toBe(200)
    expect(((await response.json()) as { data: { removed: number } }).data.removed).toBe(1)
    expect(verifyMock.discardStagedUpload).toHaveBeenCalledWith(PATH)
  })

  it('โทเคนของผู้ใช้อื่น / path นอกโครงระบบ ⇒ ข้าม ไม่ลบ', async () => {
    requireSessionMock.mockResolvedValue(AGENT)
    const response = await POST(
      req({
        items: [
          { path: PATH, discardToken: uploadDiscardToken(SECRET, OTHER_ID, PATH) },
          { path: 'other-bucket/x.jpg', discardToken: uploadDiscardToken(SECRET, AGENT_ID, 'other-bucket/x.jpg') },
        ],
      }),
    )
    expect(response.status).toBe(200)
    expect(((await response.json()) as { data: { removed: number } }).data.removed).toBe(0)
    expect(verifyMock.discardStagedUpload).not.toHaveBeenCalled()
  })

  it('หมวดที่ไม่มีฟอร์มทิ้งไฟล์ (โลโก้/ลายเซ็นองค์กร · เอกสารเคส) ⇒ ข้าม แม้โทเคนถูก (รีวิว security D-1)', async () => {
    const ORG = '00000000-0000-4000-8000-000000000001'
    const paths = [
      `organization/${ORG}/logo/abc-logo.png`,
      `organization/${ORG}/signature/abc-sign.png`,
      'cases/00000000-0000-4000-8000-000000000011/contract/abc-doc.pdf',
    ]
    requireSessionMock.mockResolvedValue(sessionUser(AGENT_ID, { manage_organization_profile: 'manage', perform_field_work: 'manage' }))
    const response = await POST(
      req({ items: paths.map((path) => ({ path, discardToken: uploadDiscardToken(SECRET, AGENT_ID, path) })) }),
    )
    expect(response.status).toBe(200)
    expect(((await response.json()) as { data: { removed: number } }).data.removed).toBe(0)
    expect(verifyMock.discardStagedUpload).not.toHaveBeenCalled()
  })

  it('รูปรับเข้าคลัง ⇒ ลบได้', async () => {
    const intake = 'assets/00000000-0000-4000-8000-000000000021/intake/front/abc-front.jpg'
    requireSessionMock.mockResolvedValue(AGENT)
    const response = await POST(req({ items: [{ path: intake, discardToken: uploadDiscardToken(SECRET, AGENT_ID, intake) }] }))
    expect(((await response.json()) as { data: { removed: number } }).data.removed).toBe(1)
    expect(verifyMock.discardStagedUpload).toHaveBeenCalledWith(intake)
  })

  it('ไม่มี capability อัปโหลดเลย ⇒ 403', async () => {
    requireSessionMock.mockResolvedValue(sessionUser(OTHER_ID, {}))
    const response = await POST(req({ items: [{ path: PATH, discardToken: uploadDiscardToken(SECRET, OTHER_ID, PATH) }] }))
    expect(response.status).toBe(403)
    expect(verifyMock.discardStagedUpload).not.toHaveBeenCalled()
  })

  it('body ผิดรูป (ไม่มีรายการ) ⇒ 400', async () => {
    requireSessionMock.mockResolvedValue(AGENT)
    expect((await POST(req({ items: [] }))).status).toBe(400)
  })
})
