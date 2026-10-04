import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { NextRequest } from 'next/server'
import type { SessionUser } from '@/lib/auth/types'
import { AssignmentError } from '@/lib/assignments/errors'
import { CaseError } from '@/lib/cases/errors'
import { WarehouseError } from '@/lib/warehouse/errors'

/**
 * BUG-143 (S3) — route ออกโทเคนอัปโหลด / signed URL ของ bucket `case-documents` (DEC-014)
 *
 * bucket ไม่มี policy ให้ `authenticated` แล้ว ⇒ สองตัวนี้คือประตูเดียว ต้องปฏิเสธ:
 * ผู้ไม่มี capability · นอก scope (เคสของพนักงานคนอื่น · ผู้ใช้บริษัทอื่น · ล็อต/เครื่องนอก scope) · path นอกโครงที่ระบบสร้าง
 * และ path ที่ออกให้ต้องประกอบโดย server เสมอ (client เลือก path เองไม่ได้)
 */

const requireSessionMock = vi.hoisted(() => vi.fn())
vi.mock('@/lib/auth/session', () => ({ requireSession: requireSessionMock }))

const caseQueries = vi.hoisted(() => ({ getCase: vi.fn() }))
vi.mock('@/lib/cases/queries', () => caseQueries)

const fieldQueries = vi.hoisted(() => ({ getFieldCase: vi.fn(), assertOwnFieldCase: vi.fn() }))
vi.mock('@/lib/field/queries', () => fieldQueries)

const warehouseQueries = vi.hoisted(() => ({ getAsset: vi.fn(), getLot: vi.fn() }))
vi.mock('@/lib/warehouse/queries', () => warehouseQueries)

const storageMock = vi.hoisted(() => ({
  SIGNED_DOWNLOAD_TTL_SECONDS: 300,
  downloadUploadedFile: vi.fn(),
  createSignedUpload: vi.fn(async (path: string) => ({ path, token: `token:${path}` })),
  createSignedDownloadUrl: vi.fn(async (path: string) => `https://storage.test/signed/${path}`),
}))
vi.mock('@/lib/uploads/storage', () => storageMock)

const { POST: postUploadUrl } = await import('@/app/api/storage/upload-url/route')
const { POST: postDownloadUrl } = await import('@/app/api/storage/download-url/route')

const CASE_ID = '00000000-0000-4000-8000-000000000011'
const ASSET_ID = '00000000-0000-4000-8000-000000000101'
const LOT_ID = '00000000-0000-4000-8000-000000000201'
const AGENT_ID = '00000000-0000-4000-8000-0000000000a1'
const OTHER_AGENT_ID = '00000000-0000-4000-8000-0000000000a2'

function sessionUser(id: string, capabilities: Record<string, 'view' | 'manage'>, companyId: string | null = null): SessionUser {
  return {
    id,
    organizationId: 'org-1',
    supabaseUid: `uid-${id}`,
    email: `${id}@example.com`,
    fullName: 'ผู้ใช้ ทดสอบ',
    status: 'active',
    roleId: 'role-1',
    roleName: 'ทดสอบ',
    roleGroup: companyId === null ? 'system' : 'company',
    isSuperadmin: false,
    teamId: null,
    companyId,
    capabilities,
    scope: companyId === null
      ? { kind: 'global', teamIds: [], companyId: null, userId: id }
      : { kind: 'company', teamIds: [], companyId, userId: id },
    loginAt: new Date().toISOString(),
  } as SessionUser
}

const ADMIN = sessionUser('00000000-0000-4000-8000-0000000000b1', { record_admin_data: 'manage' })
const AGENT = sessionUser(AGENT_ID, { perform_field_work: 'manage' })
const WAREHOUSE = sessionUser('00000000-0000-4000-8000-0000000000c1', {
  intake_asset: 'manage',
  confirm_handover_lot: 'manage',
})
const COMPANY_USER = sessionUser('00000000-0000-4000-8000-0000000000d1', { view_own_company_data: 'view' }, 'company-2')
const FINANCE = sessionUser('00000000-0000-4000-8000-0000000000e1', { approve_expense_finance: 'manage' })
const NO_CAPS = sessionUser('00000000-0000-4000-8000-0000000000f1', {})

function post(url: string, body: unknown): NextRequest {
  const base = new Request(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  }) as unknown as NextRequest
  return Object.assign(base, { nextUrl: new URL(url) }) as NextRequest
}

const uploadReq = (body: unknown) => post('http://localhost/api/storage/upload-url', body)
const downloadReq = (path: string) => post('http://localhost/api/storage/download-url', { path })

async function errorCode(response: Response): Promise<string | undefined> {
  const body = (await response.json()) as { error?: { code?: string } }
  return body.error?.code
}

beforeEach(() => {
  vi.clearAllMocks()
  caseQueries.getCase.mockResolvedValue({ id: CASE_ID })
  fieldQueries.getFieldCase.mockResolvedValue({ id: CASE_ID })
  fieldQueries.assertOwnFieldCase.mockResolvedValue(undefined)
  warehouseQueries.getAsset.mockResolvedValue({ id: ASSET_ID })
  warehouseQueries.getLot.mockResolvedValue({ id: LOT_ID })
})

describe('POST /api/storage/upload-url', () => {
  it('ธุรการได้โทเคนของเอกสารเคส — path ประกอบโดย server ใต้ prefix ของ slot', async () => {
    requireSessionMock.mockResolvedValue(ADMIN)
    const response = await postUploadUrl(
      uploadReq({ target: { kind: 'case_document', caseId: CASE_ID, slot: 'contract_doc' }, fileName: 'สัญญา.pdf', sizeBytes: 1000 }),
    )
    expect(response.status).toBe(200)
    const body = (await response.json()) as { data: { path: string; token: string } }
    expect(body.data.path.startsWith(`cases/${CASE_ID}/contract_doc/`)).toBe(true)
    expect(body.data.token).toBe(`token:${body.data.path}`)
    expect(caseQueries.getCase).toHaveBeenCalledWith(ADMIN, CASE_ID)
  })

  it('ไม่รับ path จาก client — field `path` ที่แนบมาถูกเมิน', async () => {
    requireSessionMock.mockResolvedValue(ADMIN)
    const response = await postUploadUrl(
      uploadReq({
        target: { kind: 'case_document', caseId: CASE_ID, slot: 'other_doc' },
        fileName: 'a.pdf',
        sizeBytes: 10,
        path: 'cases/other/x.pdf',
      }),
    )
    const body = (await response.json()) as { data: { path: string } }
    expect(body.data.path.startsWith(`cases/${CASE_ID}/other_doc/`)).toBe(true)
  })

  it('เคสนอก scope = CASE_NOT_FOUND และไม่ออกโทเคน', async () => {
    requireSessionMock.mockResolvedValue(ADMIN)
    caseQueries.getCase.mockRejectedValue(new CaseError('CASE_NOT_FOUND'))
    const response = await postUploadUrl(
      uploadReq({ target: { kind: 'case_document', caseId: CASE_ID, slot: 'contract_doc' }, fileName: 'a.pdf', sizeBytes: 10 }),
    )
    expect(response.status).toBe(404)
    expect(await errorCode(response)).toBe('CASE_NOT_FOUND')
    expect(storageMock.createSignedUpload).not.toHaveBeenCalled()
  })

  it('พนักงานภาคสนามขอโทเคนเอกสารเคส (ไม่มี record_admin_data) = 403', async () => {
    requireSessionMock.mockResolvedValue(AGENT)
    const response = await postUploadUrl(
      uploadReq({ target: { kind: 'case_document', caseId: CASE_ID, slot: 'contract_doc' }, fileName: 'a.pdf', sizeBytes: 10 }),
    )
    expect(response.status).toBe(403)
    expect(storageMock.createSignedUpload).not.toHaveBeenCalled()
  })

  it('หลักฐานปิดงาน: เคสที่ไม่ใช่ของพนักงานคนนี้ = ASSIGNMENT_NOT_FOUND', async () => {
    requireSessionMock.mockResolvedValue(AGENT)
    fieldQueries.assertOwnFieldCase.mockRejectedValue(new AssignmentError('ASSIGNMENT_NOT_FOUND'))
    const response = await postUploadUrl(
      uploadReq({ target: { kind: 'field_evidence', caseId: CASE_ID, mediaKind: 'photo' }, fileName: 'p.jpg', sizeBytes: 10 }),
    )
    expect(response.status).toBe(404)
    expect(storageMock.createSignedUpload).not.toHaveBeenCalled()
  })

  it('หลักฐานปิดงานของเคสตัวเอง → path ใต้ field_evidence/<ชนิด>/', async () => {
    requireSessionMock.mockResolvedValue(AGENT)
    const response = await postUploadUrl(
      uploadReq({ target: { kind: 'field_evidence', caseId: CASE_ID, mediaKind: 'video' }, fileName: 'v.mp4', sizeBytes: 10 }),
    )
    const body = (await response.json()) as { data: { path: string } }
    expect(body.data.path.startsWith(`cases/${CASE_ID}/field_evidence/video/`)).toBe(true)
    expect(fieldQueries.assertOwnFieldCase).toHaveBeenCalledWith(AGENT, CASE_ID)
  })

  it('ใบเสร็จ: path อยู่ใต้ผู้เรียกเสมอ (ส่ง userId คนอื่นมาก็ไม่มีผล)', async () => {
    requireSessionMock.mockResolvedValue(AGENT)
    const response = await postUploadUrl(
      uploadReq({ target: { kind: 'expense_receipt', userId: OTHER_AGENT_ID }, fileName: 'r.pdf', sizeBytes: 10 }),
    )
    const body = (await response.json()) as { data: { path: string } }
    expect(body.data.path.startsWith(`expenses/${AGENT_ID}/receipts/`)).toBe(true)
  })

  it('รูปรับเข้าคลัง/เอกสารล็อต ตรวจ scope ของเครื่อง/ล็อต', async () => {
    requireSessionMock.mockResolvedValue(WAREHOUSE)
    warehouseQueries.getLot.mockRejectedValue(new WarehouseError('LOT_NOT_FOUND'))
    const lot = await postUploadUrl(
      uploadReq({ target: { kind: 'lot_document', lotId: LOT_ID, document: 'signed_doc' }, fileName: 'a.pdf', sizeBytes: 10 }),
    )
    expect(lot.status).toBe(404)

    const intake = await postUploadUrl(
      uploadReq({ target: { kind: 'intake_photo', assetId: ASSET_ID, angle: 'front' }, fileName: 'a.jpg', sizeBytes: 10 }),
    )
    const body = (await intake.json()) as { data: { path: string } }
    expect(body.data.path.startsWith(`assets/${ASSET_ID}/intake/front/`)).toBe(true)
  })

  it('ผู้ใช้บริษัท (ดูอย่างเดียว) ขอโทเคนไม่ได้เลย = 403', async () => {
    requireSessionMock.mockResolvedValue(COMPANY_USER)
    const response = await postUploadUrl(
      uploadReq({ target: { kind: 'case_document', caseId: CASE_ID, slot: 'contract_doc' }, fileName: 'a.pdf', sizeBytes: 10 }),
    )
    expect(response.status).toBe(403)
  })

  it('ไฟล์ใหญ่เกินเพดานของช่อง = UPLOAD_FILE_TOO_LARGE ก่อนออกโทเคน', async () => {
    requireSessionMock.mockResolvedValue(ADMIN)
    const response = await postUploadUrl(
      uploadReq({
        target: { kind: 'case_document', caseId: CASE_ID, slot: 'contract_doc' },
        fileName: 'a.pdf',
        sizeBytes: 500 * 1024 * 1024,
      }),
    )
    expect(response.status).toBe(400)
    expect(await errorCode(response)).toBe('UPLOAD_FILE_TOO_LARGE')
    expect(storageMock.createSignedUpload).not.toHaveBeenCalled()
  })

  it('target ผิดรูป (id ไม่ใช่ UUID / ชนิดไม่รู้จัก) = 400', async () => {
    requireSessionMock.mockResolvedValue(ADMIN)
    const badId = await postUploadUrl(
      uploadReq({ target: { kind: 'case_document', caseId: '../x', slot: 'contract_doc' }, fileName: 'a.pdf', sizeBytes: 1 }),
    )
    expect(badId.status).toBe(400)
    const badKind = await postUploadUrl(uploadReq({ target: { kind: 'anything' }, fileName: 'a.pdf', sizeBytes: 1 }))
    expect(badKind.status).toBe(400)
  })
})

describe('POST /api/storage/download-url', () => {
  it('ธุรการเปิดเอกสารเคสในscope ได้ signed URL อายุสั้น', async () => {
    requireSessionMock.mockResolvedValue(ADMIN)
    const response = await postDownloadUrl(downloadReq(`cases/${CASE_ID}/contract_doc/u-a.pdf`))
    expect(response.status).toBe(200)
    const body = (await response.json()) as { data: { url: string; expiresInSeconds: number } }
    expect(body.data.expiresInSeconds).toBe(300)
    expect(caseQueries.getCase).toHaveBeenCalledWith(ADMIN, CASE_ID)
  })

  it('ผู้ใช้บริษัทอื่นเปิดเอกสารเคส = CASE_NOT_FOUND (ไม่ leak)', async () => {
    requireSessionMock.mockResolvedValue(COMPANY_USER)
    caseQueries.getCase.mockRejectedValue(new CaseError('CASE_NOT_FOUND'))
    const response = await postDownloadUrl(downloadReq(`cases/${CASE_ID}/national_id_doc/u-id.jpg`))
    expect(response.status).toBe(404)
    expect(storageMock.createSignedDownloadUrl).not.toHaveBeenCalled()
  })

  it('พนักงานภาคสนามเปิดหลักฐานของเคสที่ไม่ใช่ของตัวเอง/ทีม = ASSIGNMENT_NOT_FOUND', async () => {
    requireSessionMock.mockResolvedValue(AGENT)
    fieldQueries.getFieldCase.mockRejectedValue(new AssignmentError('ASSIGNMENT_NOT_FOUND'))
    const response = await postDownloadUrl(downloadReq(`cases/${CASE_ID}/field_evidence/photo/u-p.jpg`))
    expect(response.status).toBe(404)
    expect(caseQueries.getCase).not.toHaveBeenCalled()
    expect(storageMock.createSignedDownloadUrl).not.toHaveBeenCalled()
  })

  it('พนักงานภาคสนามเปิดหลักฐานของเคสตัวเองได้', async () => {
    requireSessionMock.mockResolvedValue(AGENT)
    const response = await postDownloadUrl(downloadReq(`cases/${CASE_ID}/field_evidence/photo/u-p.jpg`))
    expect(response.status).toBe(200)
  })

  it('ใบเสร็จ: เจ้าของเปิดได้ · พนักงานคนอื่นเปิดไม่ได้ · การเงินเปิดได้', async () => {
    const path = `expenses/${AGENT_ID}/receipts/u-r.pdf`
    requireSessionMock.mockResolvedValue(AGENT)
    expect((await postDownloadUrl(downloadReq(path))).status).toBe(200)

    requireSessionMock.mockResolvedValue(sessionUser(OTHER_AGENT_ID, { perform_field_work: 'manage' }))
    expect((await postDownloadUrl(downloadReq(path))).status).toBe(403)

    requireSessionMock.mockResolvedValue(FINANCE)
    expect((await postDownloadUrl(downloadReq(path))).status).toBe(200)
  })

  it('ไฟล์คลัง (รูปรับเข้า/เอกสารล็อต) ต้องมีสิทธิ์ดูคลัง — พนักงานภาคสนาม = 403', async () => {
    requireSessionMock.mockResolvedValue(AGENT)
    expect((await postDownloadUrl(downloadReq(`assets/${ASSET_ID}/intake/front/u.jpg`))).status).toBe(403)
    expect((await postDownloadUrl(downloadReq(`handover-lots/${LOT_ID}/signed_doc/u.pdf`))).status).toBe(403)

    requireSessionMock.mockResolvedValue(WAREHOUSE)
    expect((await postDownloadUrl(downloadReq(`assets/${ASSET_ID}/intake/front/u.jpg`))).status).toBe(200)
    expect(warehouseQueries.getAsset).toHaveBeenCalledWith(WAREHOUSE, ASSET_ID)
  })

  it.each([
    '../cases/x',
    `cases/${CASE_ID}/../../expenses/${AGENT_ID}/receipts/r.pdf`,
    `/cases/${CASE_ID}/contract_doc/a.pdf`,
    `cases/not-a-uuid/contract_doc/a.pdf`,
    `payment-files/x.csv`,
    `other/${CASE_ID}/a.pdf`,
  ])('path นอกโครงที่ระบบสร้าง (%s) = UPLOAD_PATH_OUT_OF_SCOPE', async (path) => {
    requireSessionMock.mockResolvedValue(ADMIN)
    const response = await postDownloadUrl(downloadReq(path))
    expect(response.status).toBe(400)
    expect(await errorCode(response)).toBe('UPLOAD_PATH_OUT_OF_SCOPE')
    expect(storageMock.createSignedDownloadUrl).not.toHaveBeenCalled()
  })

  it('ไม่มี capability ดูไฟล์ใดเลย = 403', async () => {
    requireSessionMock.mockResolvedValue(NO_CAPS)
    const response = await postDownloadUrl(downloadReq(`cases/${CASE_ID}/contract_doc/u-a.pdf`))
    expect(response.status).toBe(403)
  })

  it('ไม่พบไฟล์ใน Storage = UPLOAD_FILE_NOT_FOUND', async () => {
    requireSessionMock.mockResolvedValue(ADMIN)
    storageMock.createSignedDownloadUrl.mockResolvedValueOnce(null as unknown as string)
    const response = await postDownloadUrl(downloadReq(`cases/${CASE_ID}/contract_doc/u-a.pdf`))
    expect(await errorCode(response)).toBe('UPLOAD_FILE_NOT_FOUND')
  })
})
