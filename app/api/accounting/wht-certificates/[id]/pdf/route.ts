import type { NextRequest } from 'next/server'
import { renderWhtCertificate } from '@/components/pdf/wht-certificate'
import { toModuleErrorResponse, withApiPermission } from '@/lib/api/http'
import { attachmentHeader } from '@/lib/format/attachment'
import { getWhtCertificateDocSource } from '@/lib/wht/queries'
import { buildWhtCertificateDoc, WHT_READ_CAPABILITIES } from '@/lib/wht/wht'

type RouteContext = { params: Promise<{ id: string }> }

/** `@react-pdf/renderer` ต้องใช้ Node API (fs/stream) — บังคับ runtime ไม่ให้ตกไป Edge */
export const runtime = 'nodejs'

/**
 * `GET /api/accounting/wht-certificates/:id/pdf` — ใบ 50 ทวิ (`28` §6.3)
 *
 * สิทธิ์ = **ดู** ทะเบียน WHT (การเงินพิมพ์สำเนาได้ตาม `33` §12) — การ*ออก/ยกเลิก* ยังเป็นของบัญชี
 * · ใบที่ยกเลิกแล้วพิมพ์ได้ แต่มีแถบ "ยกเลิก" บนหน้ากระดาษ (`33` §10)
 */
export const GET = withApiPermission<RouteContext>(
  'view',
  WHT_READ_CAPABILITIES,
  toModuleErrorResponse,
  async (_request: NextRequest, context, user) => {
    const { id } = await context.params
    const source = await getWhtCertificateDocSource(user, id)
    const doc = buildWhtCertificateDoc(source)
    const pdf = await renderWhtCertificate(doc)

    return new Response(new Uint8Array(pdf), {
      headers: {
        'content-type': 'application/pdf',
        'content-disposition': attachmentHeader(doc.fileName),
        // เอกสารทางภาษี — ห้าม cache ระหว่างทาง (สถานะยกเลิกต้องเห็นทันที)
        'cache-control': 'no-store',
      },
    })
  },
)
