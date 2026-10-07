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

// ดาวน์โหลดฝั่งภาคสนามตรวจด้วย assertCurrentFieldAssignee (ผู้ถืองานปัจจุบันเท่านั้น — preship R4-007)
const fieldQueries = vi.hoisted(() => ({ assertCurrentFieldAssignee: vi.fn(), assertOwnFieldCase: vi.fn() }))
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

// มติ PO U90 — audit การเปิดไฟล์ข้อมูลส่วนบุคคล
const auditMock = vi.hoisted(() => ({ emitAudit: vi.fn(async () => undefined) }))
vi.mock('@/lib/audit/audit', () => auditMock)

const customerWhtQueries = vi.hoisted(() => ({ assertCustomerWhtInScope: vi.fn(async () => undefined) }))
vi.mock('@/lib/customer-wht/queries', () => customerWhtQueries)

// มติ PO U152/U153 — ใบเสร็จที่ผู้อื่นแนบให้รายการของผู้เรียก/ทีมที่ดูแล (ตรวจจริงในเทสต์ DB `receipt-upload.db.test.ts`)
const approvalQueries = vi.hoisted(() => ({ isReceiptVisibleViaExpense: vi.fn(async () => false) }))
vi.mock('@/lib/compensation/approval-queries', () => approvalQueries)

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
    roleGroup: companyId === null ? 'system' : 'finance_company',
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
  fieldQueries.assertCurrentFieldAssignee.mockResolvedValue(undefined)
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

  // มติ PO 05/10/2569 (U6/O43 D2) — ผู้ใช้บริษัทใช้พอร์ทัลทางเดียว: route ภายในตอบ 403 ก่อนแตะข้อมูล
  it('ผู้ใช้บริษัทไฟแนนซ์เปิดเอกสารเคสผ่าน route ภายใน = 403 (ใช้พอร์ทัลทางเดียว)', async () => {
    requireSessionMock.mockResolvedValue(COMPANY_USER)
    caseQueries.getCase.mockRejectedValue(new CaseError('CASE_NOT_FOUND'))
    const response = await postDownloadUrl(downloadReq(`cases/${CASE_ID}/national_id_doc/u-id.jpg`))
    expect(response.status).toBe(403)
    expect(caseQueries.getCase).not.toHaveBeenCalled()
    expect(storageMock.createSignedDownloadUrl).not.toHaveBeenCalled()
  })

  it('พนักงานภาคสนามเปิดหลักฐานของเคสที่ไม่ใช่ของตัวเอง/ทีม = ASSIGNMENT_NOT_FOUND', async () => {
    requireSessionMock.mockResolvedValue(AGENT)
    fieldQueries.assertCurrentFieldAssignee.mockRejectedValue(new AssignmentError('ASSIGNMENT_NOT_FOUND'))
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

    // ใบเสร็จของพนักงานคนอื่น = นอก scope ⇒ 404 แบบเดียวกับรายการที่ไม่มี (BUG-145 — เดิมตอบ 403)
    requireSessionMock.mockResolvedValue(sessionUser(OTHER_AGENT_ID, { perform_field_work: 'manage' }))
    const foreign = await postDownloadUrl(downloadReq(path))
    expect(foreign.status).toBe(404)
    expect(await errorCode(foreign)).toBe('EXPENSE_NOT_FOUND')

    requireSessionMock.mockResolvedValue(FINANCE)
    expect((await postDownloadUrl(downloadReq(path))).status).toBe(200)
  })

  it('BUG-145 — มี capability แล้ว: รายการ "ไม่มีจริง" กับ "นอก scope" ตอบเหมือนกันเป๊ะ (status + code + ข้อความ)', async () => {
    const ghost = '00000000-0000-4000-8000-0000000000ff'
    const otherAgent = sessionUser(OTHER_AGENT_ID, { perform_field_work: 'manage' })
    requireSessionMock.mockResolvedValue(otherAgent)
    const foreignReceipt = await postDownloadUrl(downloadReq(`expenses/${AGENT_ID}/receipts/u-r.pdf`))
    const ghostReceipt = await postDownloadUrl(downloadReq(`expenses/${ghost}/receipts/u-r.pdf`))
    expect(foreignReceipt.status).toBe(ghostReceipt.status)
    expect(await foreignReceipt.json()).toEqual(await ghostReceipt.json())

    // เคส: ตัวโหลดตาม scope โยน NOT_FOUND ทั้งสองกรณี ⇒ route ส่งต่อแบบเดียวกัน
    requireSessionMock.mockResolvedValue(ADMIN)
    caseQueries.getCase.mockRejectedValue(new CaseError('CASE_NOT_FOUND'))
    const caseDownload = await postDownloadUrl(downloadReq(`cases/${CASE_ID}/contract_doc/u-a.pdf`))
    const caseUpload = await postUploadUrl(
      uploadReq({ target: { kind: 'case_document', caseId: CASE_ID, slot: 'contract_doc' }, fileName: 'a.pdf', sizeBytes: 10 }),
    )
    expect([caseDownload.status, caseUpload.status]).toEqual([404, 404])
    expect(await errorCode(caseDownload)).toBe('CASE_NOT_FOUND')
    expect(await errorCode(caseUpload)).toBe('CASE_NOT_FOUND')
  })

  it('ไฟล์คลัง (รูปรับเข้า/เอกสารล็อต) ต้องมีสิทธิ์ดูคลัง — พนักงานภาคสนาม = 403', async () => {
    requireSessionMock.mockResolvedValue(AGENT)
    expect((await postDownloadUrl(downloadReq(`assets/${ASSET_ID}/intake/front/u.jpg`))).status).toBe(403)
    expect((await postDownloadUrl(downloadReq(`handover-lots/${LOT_ID}/signed_doc/u.pdf`))).status).toBe(403)

    requireSessionMock.mockResolvedValue(WAREHOUSE)
    expect((await postDownloadUrl(downloadReq(`assets/${ASSET_ID}/intake/front/u.jpg`))).status).toBe(200)
    expect(warehouseQueries.getAsset).toHaveBeenCalledWith(WAREHOUSE, ASSET_ID)
  })

  it('มติ PO U22 — ผู้จัดการทีม (intake_asset=view · scope ทีม) เปิดรูปเครื่องของทีมได้ แต่เอกสารทั้งล็อตไม่ได้', async () => {
    const teamLead: SessionUser = {
      ...sessionUser('00000000-0000-4000-8000-0000000000a9', { intake_asset: 'view' }),
      scope: { kind: 'team', teamIds: ['team-1'], companyId: null, userId: '00000000-0000-4000-8000-0000000000a9' },
    }
    requireSessionMock.mockResolvedValue(teamLead)
    expect((await postDownloadUrl(downloadReq(`assets/${ASSET_ID}/intake/front/u.jpg`))).status).toBe(200)
    expect(warehouseQueries.getAsset).toHaveBeenCalledWith(teamLead, ASSET_ID)
    expect((await postDownloadUrl(downloadReq(`handover-lots/${LOT_ID}/signed_doc/u.pdf`))).status).toBe(403)
    expect(warehouseQueries.getLot).not.toHaveBeenCalled()
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

  describe('มติ PO U90 — audit การเปิดไฟล์ข้อมูลส่วนบุคคล', () => {
    const WHT_ID = '00000000-0000-4000-8000-000000000301'
    const ACCOUNTANT = sessionUser('00000000-0000-4000-8000-0000000000e2', { manage_customer_wht: 'manage' })

    it.each(['contract_doc', 'national_id_doc', 'bundle_doc', 'other_doc'])(
      'เอกสารเคส %s → audit view หลังออก URL (เก็บ path ไม่เก็บ signed URL)',
      async (slot) => {
        requireSessionMock.mockResolvedValue(ADMIN)
        const path = `cases/${CASE_ID}/${slot}/u-a.pdf`
        const response = await postDownloadUrl(downloadReq(path))
        expect(response.status).toBe(200)
        expect(auditMock.emitAudit).toHaveBeenCalledTimes(1)
        const [entry] = auditMock.emitAudit.mock.calls[0] as unknown as [Record<string, unknown>]
        expect(entry).toMatchObject({
          actorId: ADMIN.id,
          action: 'view',
          targetType: 'cases',
          targetId: CASE_ID,
          after: { kind: 'case_document', slot, path, fileName: 'u-a.pdf' },
          reason: 'เปิดดูเอกสารข้อมูลส่วนบุคคล',
        })
        expect(JSON.stringify(entry)).not.toContain('https://storage.test')
      },
    )

    it('50 ทวิ ลูกค้า → audit view ที่ใบ 50 ทวิ', async () => {
      requireSessionMock.mockResolvedValue(ACCOUNTANT)
      const path = `customer-wht/${WHT_ID}/u-w.pdf`
      expect((await postDownloadUrl(downloadReq(path))).status).toBe(200)
      expect(auditMock.emitAudit).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'view',
          targetType: 'customer_wht_certificates',
          targetId: WHT_ID,
          after: { kind: 'customer_wht', path, fileName: 'u-w.pdf' },
        }),
      )
    })

    it('รูปสินค้า / หลักฐานปิดงาน / ใบเสร็จ / รูปรับเข้าคลัง ไม่บันทึก', async () => {
      requireSessionMock.mockResolvedValue(ADMIN)
      expect((await postDownloadUrl(downloadReq(`cases/${CASE_ID}/product_photo/u.jpg`))).status).toBe(200)
      requireSessionMock.mockResolvedValue(AGENT)
      expect((await postDownloadUrl(downloadReq(`cases/${CASE_ID}/field_evidence/photo/u.jpg`))).status).toBe(200)
      expect((await postDownloadUrl(downloadReq(`expenses/${AGENT_ID}/receipts/u.pdf`))).status).toBe(200)
      requireSessionMock.mockResolvedValue(WAREHOUSE)
      expect((await postDownloadUrl(downloadReq(`assets/${ASSET_ID}/intake/front/u.jpg`))).status).toBe(200)
      expect(auditMock.emitAudit).not.toHaveBeenCalled()
    })

    it('ออก URL ไม่สำเร็จ / ถูกปฏิเสธ → ไม่บันทึก', async () => {
      requireSessionMock.mockResolvedValue(ADMIN)
      storageMock.createSignedDownloadUrl.mockResolvedValueOnce(null as unknown as string)
      expect(await errorCode(await postDownloadUrl(downloadReq(`cases/${CASE_ID}/national_id_doc/u.jpg`)))).toBe(
        'UPLOAD_FILE_NOT_FOUND',
      )
      caseQueries.getCase.mockRejectedValueOnce(new CaseError('CASE_NOT_FOUND'))
      expect((await postDownloadUrl(downloadReq(`cases/${CASE_ID}/national_id_doc/u.jpg`))).status).toBe(404)
      expect(auditMock.emitAudit).not.toHaveBeenCalled()
    })

    it('เขียน audit ไม่สำเร็จ → ไม่คืน URL', async () => {
      requireSessionMock.mockResolvedValue(ADMIN)
      auditMock.emitAudit.mockRejectedValueOnce(new Error('db down'))
      // error ที่ไม่ใช่ของโมดูล ⇒ 500 INTERNAL_ERROR (preship PS-006) — ไม่มี URL หลุดออกไป
      vi.spyOn(console, 'error').mockImplementation(() => undefined)
      const response = await postDownloadUrl(downloadReq(`cases/${CASE_ID}/national_id_doc/u.jpg`))
      expect(response.status).toBe(500)
      const body = await response.text()
      expect(body).toContain('INTERNAL_ERROR')
      expect(body).not.toContain('storage.test/signed')
    })
  })

  it('ไม่พบไฟล์ใน Storage = UPLOAD_FILE_NOT_FOUND', async () => {
    requireSessionMock.mockResolvedValue(ADMIN)
    storageMock.createSignedDownloadUrl.mockResolvedValueOnce(null as unknown as string)
    const response = await postDownloadUrl(downloadReq(`cases/${CASE_ID}/contract_doc/u-a.pdf`))
    expect(await errorCode(response)).toBe('UPLOAD_FILE_NOT_FOUND')
  })
})
