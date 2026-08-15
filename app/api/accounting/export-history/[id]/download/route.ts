import type { NextRequest } from 'next/server'
import { toModuleErrorResponse, withApiPermission } from '@/lib/api/http'
import { attachmentHeader } from '@/lib/format/attachment'
import { getExportPackDownload } from '@/lib/exports/queries'
import { EXPORT_READ_CAPABILITIES } from '@/lib/exports/pack'

type RouteContext = { params: Promise<{ id: string }> }

export const runtime = 'nodejs'

/**
 * `GET /api/accounting/export-history/:id/download` — ดาวน์โหลดชุด `.zip` ของเวอร์ชันนั้น
 *
 * ส่ง**ไฟล์เดิมที่สร้างไว้** ไม่ประกอบใหม่ (ชุดที่ส่งสำนักงานบัญชีไปแล้วต้องเปิดดูได้ตรงกับที่ส่งจริง)
 * · ไม่แจก signed URL ให้ browser — ผ่าน `requirePermission()` ทุกครั้ง (`37` §10 · `28`)
 * · ส่ง SHA-256 ของไฟล์มาด้วยใน header เพื่อให้ผู้รับตรวจความครบถ้วนได้เอง
 */
export const GET = withApiPermission<RouteContext>(
  'view',
  EXPORT_READ_CAPABILITIES,
  toModuleErrorResponse,
  async (_request: NextRequest, context, user) => {
    const { id } = await context.params
    const pack = await getExportPackDownload(user, id)

    return new Response(new Uint8Array(pack.bytes), {
      headers: {
        'content-type': 'application/zip',
        'content-disposition': attachmentHeader(pack.fileName),
        'x-pack-sha256': pack.fileHash,
        'cache-control': 'no-store',
      },
    })
  },
)
