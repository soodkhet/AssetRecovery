import { toModuleErrorResponse } from '@/lib/api/http'
import { requireInternalSession } from '@/lib/auth/internal-session'
import { emitDocumentExportAudit } from '@/lib/audit/audit'
import { attachmentHeader } from '@/lib/format/attachment'
import { getReportExportDownload } from '@/lib/reports/export-download'

type RouteContext = { params: Promise<{ jobId: string }> }

export const runtime = 'nodejs'

/**
 * `GET /api/reports/exports/:jobId/download` — ไฟล์ที่งาน `report_export` สร้างไว้ (E13)
 *
 * เสิร์ฟผ่าน endpoint ของเราเองเท่านั้น (ไม่แจก signed URL) — ยามทั้งหมดอยู่ที่
 * `getReportExportDownload()` (องค์กร + ผู้สั่งงาน + สิทธิ์ดูรายงาน ณ ตอนกด)
 */
export const GET = async (request: Request, context: RouteContext): Promise<Response> => {
  try {
    const user = await requireInternalSession()
    const { jobId } = await context.params
    const file = await getReportExportDownload(user, jobId)

    // ทุกการนำเอกสารออกต้อง trace ผู้สั่งได้ (Rule 03)
    await emitDocumentExportAudit({
      actor: user,
      request,
      targetType: 'jobs',
      targetId: jobId,
      document: 'report_export_file',
      fileName: file.fileName,
      details: { job_id: jobId, content_type: file.contentType },
    })

    return new Response(new Uint8Array(file.bytes), {
      headers: {
        'content-type': file.contentType,
        'content-disposition': attachmentHeader(file.fileName),
        'cache-control': 'no-store',
      },
    })
  } catch (error) {
    return toModuleErrorResponse(error)
  }
}
