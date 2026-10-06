import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { NextRequest } from 'next/server'
import type { SessionUser } from '@/lib/auth/types'
import type { OrganizationProfileDto } from '@/lib/organization/types'

/**
 * เทสต์ระดับ route ของหน้า "ข้อมูลองค์กร" (มติ PO U99) — ใช้ `requirePermission()` ตัวจริง (mock แค่ session)
 *  · แก้ได้เฉพาะ `manage_invoice_numbering` (ล็อก Superadmin) · บริหาร/บัญชีดูได้แต่แก้ไม่ได้ (403)
 *  · `reason` บังคับ · validation ไม่ผ่าน = 400 และไม่แตะชั้นข้อมูล
 *  · ออกโทเคนอัปโหลดโลโก้: Superadmin เท่านั้น · องค์กรของตัวเองเท่านั้น · เกิน 1 MB ปฏิเสธก่อนอัปโหลด
 * การเขียน DB + audit + ตรวจไฟล์จริง อยู่ใน `lib/organization/organization.db.test.ts`
 */

const requireSessionMock = vi.hoisted(() => vi.fn())
vi.mock('@/lib/auth/session', () => ({ requireSession: requireSessionMock }))

const queriesMock = vi.hoisted(() => ({
  getOrganizationProfile: vi.fn(),
  getOrganizationProfileIssues: vi.fn(),
  updateOrganizationProfile: vi.fn(),
  setOrganizationLogo: vi.fn(),
  removeOrganizationLogo: vi.fn(),
  setOrganizationSignature: vi.fn(),
  removeOrganizationSignature: vi.fn(),
}))
vi.mock('@/lib/organization/queries', () => queriesMock)

const storageMock = vi.hoisted(() => ({
  SIGNED_DOWNLOAD_TTL_SECONDS: 300,
  downloadUploadedFile: vi.fn(),
  createSignedUpload: vi.fn(async (path: string) => ({ path, token: `token:${path}` })),
  createSignedDownloadUrl: vi.fn(async (path: string) => `https://storage.test/signed/${path}`),
  removeStoredFiles: vi.fn(),
}))
vi.mock('@/lib/uploads/storage', () => storageMock)

const profileRoute = await import('@/app/api/settings/organization/route')
const logoRoute = await import('@/app/api/settings/organization/logo/route')
const signatureRoute = await import('@/app/api/settings/organization/signature/route')
const { POST: postUploadUrl } = await import('@/app/api/storage/upload-url/route')
const { POST: postDownloadUrl } = await import('@/app/api/storage/download-url/route')

const ORG_ID = '00000000-0000-4000-8000-000000009901'
const OTHER_ORG_ID = '00000000-0000-4000-8000-000000009902'

function sessionUser(overrides: Partial<SessionUser>): SessionUser {
  return {
    id: 'user-1',
    organizationId: ORG_ID,
    supabaseUid: 'uid-1',
    email: 'user@example.com',
    fullName: 'ผู้ทดสอบ',
    status: 'active',
    roleId: 'role-1',
    roleName: 'บัญชี',
    roleGroup: 'system',
    isSuperadmin: false,
    teamId: null,
    companyId: null,
    capabilities: {},
    scope: { kind: 'global', teamIds: [], companyId: null, userId: 'user-1' },
    loginAt: new Date().toISOString(),
    ...overrides,
  }
}

const SUPERADMIN = sessionUser({ id: 'sa-1', roleName: 'Superadmin', isSuperadmin: true })
/** บัญชี — ดูข้อมูลหลัก + แก้ค่าตั้งทั่วไปได้ แต่ไม่มี `manage_invoice_numbering` */
const ACCOUNTING = sessionUser({ id: 'acc-1', capabilities: { view_master_data: 'view', manage_settings: 'manage' } })
const EXECUTIVE = sessionUser({ id: 'exe-1', roleName: 'บริหาร', capabilities: { view_master_data: 'view' } })
const FIELD_AGENT = sessionUser({ id: 'fa-1', roleName: 'พนักงานติดตามทรัพย์', capabilities: { perform_field_work: 'manage' } })

const DTO = { organizationId: ORG_ID, name: 'บริษัท ใจดี โมบาย จำกัด', issues: [] } as unknown as OrganizationProfileDto

const VALID_BODY = {
  name: 'บริษัท ใจดี โมบาย จำกัด',
  nameEn: 'Jaidee Mobile Co., Ltd.',
  taxId: '0105560123456',
  branchCode: '00000',
  addressDetail: '123/45 ถ.พระราม 1',
  addressSubdistrict: 'ปทุมวัน',
  addressDistrict: 'ปทุมวัน',
  addressProvince: 'กรุงเทพมหานคร',
  addressPostalCode: '10330',
  phone: '02-000-1234',
  email: 'accounting@jaidee.co.th',
  website: 'www.jaidee.co.th',
  vatRegistered: true,
  reason: 'กรอกข้อมูลจริงตามหนังสือรับรอง',
}

function request(url: string, method: string, body?: unknown): NextRequest {
  const base = new Request(url, {
    method,
    headers: { 'content-type': 'application/json' },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  }) as unknown as NextRequest
  return Object.assign(base, { nextUrl: new URL(url) }) as NextRequest
}

const profileReq = (method: string, body?: unknown) => request('http://localhost/api/settings/organization', method, body)
const logoReq = (method: string, body?: unknown) => request('http://localhost/api/settings/organization/logo', method, body)

interface Envelope {
  data?: unknown
  error?: { code: string; fields?: Record<string, string> } | null
}

beforeEach(() => {
  vi.clearAllMocks()
  requireSessionMock.mockReset()
})

describe('GET/PATCH /api/settings/organization', () => {
  it('Superadmin แก้ได้ — ส่งค่าที่ normalize แล้ว + เหตุผล + ผู้กระทำลงชั้นข้อมูล', async () => {
    requireSessionMock.mockResolvedValue(SUPERADMIN)
    queriesMock.updateOrganizationProfile.mockResolvedValue(DTO)

    const response = await profileRoute.PATCH(profileReq('PATCH', { ...VALID_BODY, taxId: '0-1055-60123-45-6' }), undefined)

    expect(response.status).toBe(200)
    const [context, input] = queriesMock.updateOrganizationProfile.mock.calls[0] as [
      { actor: SessionUser; reason: string },
      Record<string, unknown>,
    ]
    expect(context.actor.id).toBe(SUPERADMIN.id)
    expect(context.reason).toBe(VALID_BODY.reason)
    expect(input.taxId).toBe('0105560123456')
    expect(input).not.toHaveProperty('reason')
  })

  it.each([
    ['บัญชี (มี manage_settings)', ACCOUNTING],
    ['บริหาร', EXECUTIVE],
  ])('%s แก้ไม่ได้ ⇒ 403 · ไม่แตะชั้นข้อมูล', async (_label, user) => {
    requireSessionMock.mockResolvedValue(user)
    const response = await profileRoute.PATCH(profileReq('PATCH', VALID_BODY), undefined)
    expect(response.status).toBe(403)
    expect(queriesMock.updateOrganizationProfile).not.toHaveBeenCalled()
  })

  it('บริหาร/บัญชีดูได้ · พนักงานภาคสนามดูไม่ได้', async () => {
    queriesMock.getOrganizationProfile.mockResolvedValue(DTO)
    for (const user of [EXECUTIVE, ACCOUNTING]) {
      requireSessionMock.mockResolvedValue(user)
      const response = await profileRoute.GET(profileReq('GET'), undefined)
      expect(response.status).toBe(200)
      expect(((await response.json()) as Envelope).data).toEqual(DTO)
    }
    requireSessionMock.mockResolvedValue(FIELD_AGENT)
    expect((await profileRoute.GET(profileReq('GET'), undefined)).status).toBe(403)
  })

  it.each([
    [{ reason: undefined }, 'reason'],
    [{ taxId: '0000000000000' }, 'taxId'],
    [{ addressPostalCode: 'abc' }, 'addressPostalCode'],
    [{ branchCode: '12' }, 'branchCode'],
    [{ email: 'x@' }, 'email'],
  ])('body %j ⇒ 400 (%s)', async (patch, field) => {
    requireSessionMock.mockResolvedValue(SUPERADMIN)
    const response = await profileRoute.PATCH(profileReq('PATCH', { ...VALID_BODY, ...patch }), undefined)
    expect(response.status).toBe(400)
    expect(Object.keys(((await response.json()) as Envelope).error?.fields ?? {})).toContain(field)
    expect(queriesMock.updateOrganizationProfile).not.toHaveBeenCalled()
  })
})

describe('POST/DELETE /api/settings/organization/logo', () => {
  const PATH = `organization/${ORG_ID}/logo/11111111-1111-4111-8111-111111111111.png`

  it('Superadmin ผูกโลโก้ได้ (path + เหตุผล)', async () => {
    requireSessionMock.mockResolvedValue(SUPERADMIN)
    queriesMock.setOrganizationLogo.mockResolvedValue(DTO)
    const response = await logoRoute.POST(logoReq('POST', { path: PATH, reason: 'โลโก้ใหม่ของบริษัท' }), undefined)
    expect(response.status).toBe(200)
    const [context, path] = queriesMock.setOrganizationLogo.mock.calls[0] as [{ reason: string }, string]
    expect(context.reason).toBe('โลโก้ใหม่ของบริษัท')
    expect(path).toBe(PATH)
  })

  it('ไม่มีเหตุผล ⇒ 400 · บัญชี ⇒ 403', async () => {
    requireSessionMock.mockResolvedValue(SUPERADMIN)
    expect((await logoRoute.POST(logoReq('POST', { path: PATH }), undefined)).status).toBe(400)
    expect((await logoRoute.DELETE(logoReq('DELETE', {}), undefined)).status).toBe(400)
    requireSessionMock.mockResolvedValue(ACCOUNTING)
    expect((await logoRoute.POST(logoReq('POST', { path: PATH, reason: 'โลโก้ใหม่ของบริษัท' }), undefined)).status).toBe(403)
    expect((await logoRoute.DELETE(logoReq('DELETE', { reason: 'ไม่ใช้โลโก้แล้ว' }), undefined)).status).toBe(403)
    expect(queriesMock.setOrganizationLogo).not.toHaveBeenCalled()
    expect(queriesMock.removeOrganizationLogo).not.toHaveBeenCalled()
  })

  it('Superadmin ลบโลโก้ได้ (เหตุผลบังคับ)', async () => {
    requireSessionMock.mockResolvedValue(SUPERADMIN)
    queriesMock.removeOrganizationLogo.mockResolvedValue(DTO)
    const response = await logoRoute.DELETE(logoReq('DELETE', { reason: 'ไม่ใช้โลโก้แล้ว' }), undefined)
    expect(response.status).toBe(200)
    expect((queriesMock.removeOrganizationLogo.mock.calls[0] as [{ reason: string }])[0].reason).toBe('ไม่ใช้โลโก้แล้ว')
  })
})

describe('โทเคนอัปโหลด/เปิดดูโลโก้ (POST /api/storage/upload-url · download-url)', () => {
  const uploadReq = (body: unknown) => request('http://localhost/api/storage/upload-url', 'POST', body)
  const target = { kind: 'organization_logo', organizationId: ORG_ID }

  it('Superadmin ได้ path ใต้ organization/<orgId>/logo/ (server ประกอบเอง)', async () => {
    requireSessionMock.mockResolvedValue(SUPERADMIN)
    const response = await postUploadUrl(uploadReq({ target, fileName: 'logo.PNG', sizeBytes: 50_000 }))
    expect(response.status).toBe(200)
    const body = (await response.json()) as { data: { path: string } }
    expect(body.data.path).toMatch(new RegExp(`^organization/${ORG_ID}/logo/[0-9a-f-]+\\.png$`))
  })

  it('ไฟล์เกิน 1 MB ⇒ UPLOAD_FILE_TOO_LARGE ก่อนออกโทเคน', async () => {
    requireSessionMock.mockResolvedValue(SUPERADMIN)
    const response = await postUploadUrl(uploadReq({ target, fileName: 'logo.png', sizeBytes: 1024 * 1024 + 1 }))
    expect(response.status).toBe(400)
    expect(((await response.json()) as Envelope).error?.code).toBe('UPLOAD_FILE_TOO_LARGE')
    expect(storageMock.createSignedUpload).not.toHaveBeenCalled()
  })

  it('ไม่ใช่ Superadmin ⇒ 403 · องค์กรอื่น ⇒ 403', async () => {
    requireSessionMock.mockResolvedValue(ACCOUNTING)
    expect((await postUploadUrl(uploadReq({ target, fileName: 'logo.png', sizeBytes: 10 }))).status).toBe(403)
    requireSessionMock.mockResolvedValue(SUPERADMIN)
    const other = await postUploadUrl(
      uploadReq({ target: { kind: 'organization_logo', organizationId: OTHER_ORG_ID }, fileName: 'logo.png', sizeBytes: 10 }),
    )
    expect(other.status).toBe(403)
    expect(storageMock.createSignedUpload).not.toHaveBeenCalled()
  })

  it('เปิดดูโลโก้: ผู้ดูข้อมูลองค์กรได้ · องค์กรอื่น/ไม่มีสิทธิ์ ⇒ 403', async () => {
    const downloadReq = (path: string) => request('http://localhost/api/storage/download-url', 'POST', { path })
    requireSessionMock.mockResolvedValue(EXECUTIVE)
    expect((await postDownloadUrl(downloadReq(`organization/${ORG_ID}/logo/a.png`))).status).toBe(200)
    expect((await postDownloadUrl(downloadReq(`organization/${OTHER_ORG_ID}/logo/a.png`))).status).toBe(403)
    requireSessionMock.mockResolvedValue(FIELD_AGENT)
    expect((await postDownloadUrl(downloadReq(`organization/${ORG_ID}/logo/a.png`))).status).toBe(403)
  })
})

describe('มติ PO U122 — รูปลายเซ็นผู้มีอำนาจ (POST/DELETE /api/settings/organization/signature)', () => {
  const PATH = `organization/${ORG_ID}/signature/22222222-2222-4222-8222-222222222222.png`
  const sigReq = (method: string, body?: unknown) =>
    request('http://localhost/api/settings/organization/signature', method, body)
  const uploadReq = (body: unknown) => request('http://localhost/api/storage/upload-url', 'POST', body)
  const downloadReq = (path: string) => request('http://localhost/api/storage/download-url', 'POST', { path })
  const target = { kind: 'organization_signature', organizationId: ORG_ID }

  it('Superadmin ผูก/ลบรูปลายเซ็นได้ (path + เหตุผล)', async () => {
    requireSessionMock.mockResolvedValue(SUPERADMIN)
    queriesMock.setOrganizationSignature.mockResolvedValue(DTO)
    queriesMock.removeOrganizationSignature.mockResolvedValue(DTO)
    expect((await signatureRoute.POST(sigReq('POST', { path: PATH, reason: 'ลายเซ็นกรรมการ' }), undefined)).status).toBe(200)
    const [context, path] = queriesMock.setOrganizationSignature.mock.calls[0] as [{ reason: string }, string]
    expect(context.reason).toBe('ลายเซ็นกรรมการ')
    expect(path).toBe(PATH)
    expect((await signatureRoute.DELETE(sigReq('DELETE', { reason: 'เปลี่ยนผู้มีอำนาจ' }), undefined)).status).toBe(200)
  })

  it('ไม่มีเหตุผล ⇒ 400 · บัญชี/บริหาร ⇒ 403 · ไม่แตะชั้นข้อมูล', async () => {
    requireSessionMock.mockResolvedValue(SUPERADMIN)
    expect((await signatureRoute.POST(sigReq('POST', { path: PATH }), undefined)).status).toBe(400)
    expect((await signatureRoute.DELETE(sigReq('DELETE', {}), undefined)).status).toBe(400)
    for (const user of [ACCOUNTING, EXECUTIVE]) {
      requireSessionMock.mockResolvedValue(user)
      expect((await signatureRoute.POST(sigReq('POST', { path: PATH, reason: 'ลายเซ็นกรรมการ' }), undefined)).status).toBe(403)
      expect((await signatureRoute.DELETE(sigReq('DELETE', { reason: 'ลบรูป' }), undefined)).status).toBe(403)
    }
    expect(queriesMock.setOrganizationSignature).not.toHaveBeenCalled()
    expect(queriesMock.removeOrganizationSignature).not.toHaveBeenCalled()
  })

  it('โทเคนอัปโหลด: Superadmin ได้ path ใต้ organization/<orgId>/signature/ · บัญชี/องค์กรอื่น ⇒ 403 · เกิน 1 MB ⇒ 400', async () => {
    requireSessionMock.mockResolvedValue(SUPERADMIN)
    const ok = await postUploadUrl(uploadReq({ target, fileName: 'sign.png', sizeBytes: 20_000 }))
    expect(ok.status).toBe(200)
    expect(((await ok.json()) as { data: { path: string } }).data.path).toMatch(
      new RegExp(`^organization/${ORG_ID}/signature/[0-9a-f-]+\\.png$`),
    )
    expect((await postUploadUrl(uploadReq({ target, fileName: 'sign.png', sizeBytes: 1024 * 1024 + 1 }))).status).toBe(400)
    const other = { kind: 'organization_signature', organizationId: OTHER_ORG_ID }
    expect((await postUploadUrl(uploadReq({ target: other, fileName: 'sign.png', sizeBytes: 10 }))).status).toBe(403)
    requireSessionMock.mockResolvedValue(ACCOUNTING)
    expect((await postUploadUrl(uploadReq({ target, fileName: 'sign.png', sizeBytes: 10 }))).status).toBe(403)
  })

  it('เปิดดูรูปลายเซ็น: เฉพาะผู้มีสิทธิ์แก้ข้อมูลองค์กร — บริหาร (ดูข้อมูลองค์กรได้) ⇒ 403', async () => {
    const path = `organization/${ORG_ID}/signature/a.png`
    requireSessionMock.mockResolvedValue(SUPERADMIN)
    expect((await postDownloadUrl(downloadReq(path))).status).toBe(200)
    expect((await postDownloadUrl(downloadReq(`organization/${OTHER_ORG_ID}/signature/a.png`))).status).toBe(403)
    requireSessionMock.mockResolvedValue(EXECUTIVE)
    expect((await postDownloadUrl(downloadReq(path))).status).toBe(403)
  })

  it('GET ข้อมูลองค์กร: signed URL ของรูปลายเซ็นขอเฉพาะผู้มีสิทธิ์แก้', async () => {
    queriesMock.getOrganizationProfile.mockResolvedValue(DTO)
    requireSessionMock.mockResolvedValue(EXECUTIVE)
    await profileRoute.GET(profileReq('GET'), undefined)
    expect(queriesMock.getOrganizationProfile).toHaveBeenLastCalledWith(ORG_ID, { canManage: false })
    requireSessionMock.mockResolvedValue(SUPERADMIN)
    await profileRoute.GET(profileReq('GET'), undefined)
    expect(queriesMock.getOrganizationProfile).toHaveBeenLastCalledWith(ORG_ID, { canManage: true })
  })
})
