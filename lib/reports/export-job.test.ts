import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { SessionUser } from '@/lib/auth/types'
import type { ReportPayload } from '@/lib/reports/payload'

/**
 * งานเบื้องหลัง `report_export` — กติกา idempotency ของ `91` §17 (Rule 09)
 *
 * จุดที่เคยพลาด: ชื่อไฟล์มี `HH-mm` ซึ่งเดิมมาจาก `now` ของ **attempt** ขณะที่ backoff ของงาน
 * เป็นหน่วยนาที ⇒ retry ทุกครั้งได้ path ใหม่ ⇒ ไฟล์กำพร้าสะสม (ระบบไม่มีตัวลบไฟล์ในถัง)
 * และไม่มีอะไรกันไฟล์ซ้ำเลย ทั้งที่คอมเมนต์ในไฟล์อ้างว่า "path ผูกกับ job id"
 */

const uploadMock = vi.hoisted(() => vi.fn())
vi.mock('@/lib/reports/export-file', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/reports/export-file')>()),
  uploadReportExport: uploadMock,
}))

const runReportMock = vi.hoisted(() => vi.fn())
vi.mock('@/lib/reports/run', () => ({ runReport: runReportMock }))

const { runReportExportJob } = await import('@/lib/reports/export-job')

const ORG_ID = '00000000-0000-4000-8000-0000000082a0'

const actor: SessionUser = {
  id: '00000000-0000-4000-8000-0000000082a1',
  organizationId: ORG_ID,
  supabaseUid: 'uid-82',
  email: 'finance82@test.local',
  fullName: 'การเงิน 8.2',
  status: 'active',
  roleId: '00000000-0000-4000-8000-0000000082a2',
  roleName: 'การเงิน',
  roleGroup: 'system',
  isSuperadmin: false,
  teamId: null,
  companyId: null,
  capabilities: { view_finance_dashboard: 'view' },
  scope: { kind: 'global', teamIds: [], companyId: null, userId: '00000000-0000-4000-8000-0000000082a1' },
  loginAt: '2026-08-16T00:00:00.000Z',
}

const payload: ReportPayload = {
  report: { code: 'F1', id: 'gross-profit', title: 'กำไรขั้นต้น', category: 'F' },
  range: { preset: 'this_month', label: 'สิงหาคม 2569', from: '2026-08-01', to: '2026-08-31' },
  columns: [{ key: 'name', header: 'ชื่อ', type: 'text' }],
  rows: [{ name: 'ทีม ก' }],
  kpis: [],
  totalRow: null,
  note: null,
  cache: {
    mode: 'realtime',
    computedAt: '2026-08-16T00:00:00.000Z',
    fromCache: false,
    stale: false,
    expiresAt: null,
    refreshAvailableAt: null,
    refreshThrottled: false,
  },
}

const JOB_ID = '00000000-0000-4000-8000-0000000082b0'
/** เวลาที่ผู้ใช้กดปุ่ม — คงที่ตลอดชีพของงาน */
const REQUESTED_AT = new Date('2026-08-16T03:00:00Z')

function run(now: Date): ReturnType<typeof runReportExportJob> {
  return runReportExportJob({
    actor,
    jobId: JOB_ID,
    payload: { reportId: 'gross-profit', format: 'xlsx', preset: 'this_month', from: '2026-08-01', to: '2026-08-31' },
    now,
    requestedAt: REQUESTED_AT,
  })
}

beforeEach(() => {
  uploadMock.mockReset()
  uploadMock.mockResolvedValue(true)
  runReportMock.mockReset()
  runReportMock.mockResolvedValue(payload)
})

describe('report_export — path ต้องคงที่ตลอดทุก attempt (`91` §17 · Rule 09)', () => {
  it('retry คนละนาทีได้ path เดิมเป๊ะ (เดิมชื่อไฟล์เดินตามนาทีของ attempt)', async () => {
    const first = await run(new Date('2026-08-16T03:00:30Z'))
    // backoff ของงานเป็นหน่วยนาที ⇒ attempt ถัดไปข้ามนาทีเสมอ
    const second = await run(new Date('2026-08-16T03:07:45Z'))

    expect(first.storagePath).toBe(second.storagePath)
    expect(first.fileName).toBe(second.fileName)
    // ชื่อไฟล์ยึดเวลา "ที่สั่งงาน" (10:00 ตามเวลาไทยของ 03:00Z) + ปี พ.ศ.
    expect(first.fileName).toBe('F1_กำไรขั้นต้น_16-08-2569_10-00.xlsx')
    expect(first.storagePath).toBe(`${ORG_ID}/${JOB_ID}/${first.fileName}`)
  })

  it('ไฟล์ของ attempt ก่อนอยู่ครบแล้ว (409) ⇒ งานสำเร็จ ไม่ใช่ล้มจนตกเป็น dead letter', async () => {
    uploadMock.mockResolvedValue(false)

    const result = await run(new Date('2026-08-16T03:07:45Z'))
    expect(result.storagePath).toBe(`${ORG_ID}/${JOB_ID}/${result.fileName}`)
    expect(result.rowCount).toBe(1)
  })

  it('อัปโหลดพังด้วยเหตุอื่น ⇒ โยนต่อ (ต้องไม่กลืนเป็นสำเร็จ)', async () => {
    uploadMock.mockRejectedValue(new Error('bucket หาย'))
    await expect(run(new Date('2026-08-16T03:07:45Z'))).rejects.toThrow('bucket หาย')
  })
})
