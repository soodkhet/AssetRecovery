import type { SessionUser } from '@/lib/auth/types'
import { JobError } from '@/lib/jobs/errors'
import { prisma } from '@/lib/prisma'
import { assertReportAccess } from '@/lib/reports/access'
import { REPORT_DEFINITIONS } from '@/lib/reports/catalog'
import { downloadReportExport } from '@/lib/reports/export-file'

/**
 * ดาวน์โหลดไฟล์ของงาน `report_export` (E13)
 *
 * ### ยาม 3 ชั้น (ทุกชั้นจำเป็น)
 * 1. **องค์กรเดียวกัน** — ไม่มีจริงกับอยู่คนละองค์กรตอบเหมือนกัน (ไม่ leak)
 * 2. **ผู้สั่งงานคนเดิมเท่านั้น** (หรือ Superadmin) — ไฟล์ถูกสร้างตาม *scope ของผู้สั่ง*
 *    (ผู้จัดการเห็นเฉพาะทีมตัวเอง) ⇒ ให้คนอื่นโหลดต่อ = ข้าม scope ทางอ้อม
 * 3. **ยังต้องมีสิทธิ์ดูรายงานนั้นอยู่** — สิทธิ์อาจถูกถอนหลังสั่งงาน (`05` §10 revoke ทันที)
 */
export interface ReportExportDownload {
  readonly fileName: string
  readonly contentType: string
  readonly bytes: Uint8Array
}

function resultString(result: unknown, key: string): string | null {
  if (result === null || typeof result !== 'object' || Array.isArray(result)) return null
  const value = (result as Record<string, unknown>)[key]
  return typeof value === 'string' && value !== '' ? value : null
}

export async function getReportExportDownload(user: SessionUser, jobId: string): Promise<ReportExportDownload> {
  const job = await prisma.job.findFirst({
    where: { id: jobId, jobType: 'report_export', organizationId: user.organizationId },
    select: { id: true, status: true, result: true, createdBy: true },
  })
  if (job === null) throw new JobError('JOB_NOT_FOUND', { detail: `job=${jobId} user=${user.id}` })

  if (!user.isSuperadmin && job.createdBy !== user.id) {
    throw new JobError('JOB_NOT_FOUND', { detail: `job=${jobId} ไม่ใช่ผู้สั่งงาน (user=${user.id})` })
  }
  if (job.status !== 'completed') {
    throw new JobError('JOB_INVALID_STATUS', { detail: `job=${jobId} status=${job.status}` })
  }

  const storagePath = resultString(job.result, 'storagePath')
  const fileName = resultString(job.result, 'fileName')
  const contentType = resultString(job.result, 'contentType')
  const reportCode = resultString(job.result, 'reportCode')
  if (storagePath === null || fileName === null || contentType === null || reportCode === null) {
    throw new JobError('JOB_INVALID_STATUS', { detail: `job=${jobId} ไม่มีข้อมูลไฟล์ในผลลัพธ์` })
  }

  const report = REPORT_DEFINITIONS.find((item) => item.code === reportCode)
  if (report === undefined) {
    throw new JobError('JOB_INVALID_STATUS', { detail: `job=${jobId} รายงาน ${reportCode} ไม่อยู่ในทะเบียนแล้ว` })
  }
  assertReportAccess(user, report)

  return { fileName, contentType, bytes: await downloadReportExport(storagePath) }
}
