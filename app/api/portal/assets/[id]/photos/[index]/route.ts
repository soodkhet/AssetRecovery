import type { NextRequest } from 'next/server'
import { toModuleErrorResponse } from '@/lib/api/http'
import { getRawSessionUser } from '@/lib/auth/session'
import { denyPortalRow, requirePortalAccess, requirePortalRow } from '@/lib/portal/guard'
import {
  findPortalAssetPhotoRow,
  portalAssetPhotoSection,
  portalAssetPhotoViewable,
  portalPhotoContentType,
} from '@/lib/portal/queries/assets'
import { portalAssetPhotoMeta } from '@/lib/portal/serializers'
import { PORTAL_VIEW_AS_CAPABILITIES, readPortalViewAsParam } from '@/lib/portal/view-as'
import { UploadError } from '@/lib/uploads/errors'
import { downloadUploadedFile } from '@/lib/uploads/storage'
import { WarehouseError } from '@/lib/warehouse/errors'

type RouteContext = { params: Promise<{ id: string; index: string }> }

/**
 * `GET /api/portal/assets/:id/photos/:index` (`97` §6.1 v3/§6.4/§17 · มติ O43 D6) — รูปทรัพย์ลำดับที่ `index` (เริ่ม 0)
 *
 * - ต้องมี `portal_download` + หมวดส่งมอบ (ตาราง §17) **หรือ** หมวดเคส (รูปของเคส "ติดตามสำเร็จ" ที่หน้ารายละเอียดเคสแสดง)
 * - ทรัพย์ไม่พบ/ข้ามบริษัท → 403 `PERMISSION_DENIED` + audit (D3/D4) · ของบริษัทตัวเองแต่ยังเปิดไม่ได้ (เคสยังไม่
 *   "ติดตามสำเร็จ" และไม่อยู่ในล็อต) → 403 เดียวกัน + audit cause `asset_not_viewable`
 * - index นอกช่วง/ไม่มีรูป (ทรัพย์เป็นของบริษัทตัวเองแล้ว — ไม่ leak) → 404 `ASSET_NOT_FOUND`
 * - อ่านไฟล์ด้วย service role แล้ว **stream** กลับ (ไม่ส่ง path/signed URL ของ Storage ออกไปเลย) · ไฟล์หายใน Storage →
 *   `UPLOAD_FILE_NOT_FOUND`
 */
export async function GET(request: NextRequest, context: RouteContext): Promise<Response> {
  try {
    // เลือกหมวดจากสิทธิ์ของผู้เรียก (session ถูกแคช — ยามด้านล่างโหลดซ้ำไม่แพง) · ไม่มี session ⇒ ยามตอบ 401 เอง
    // โหมดดูแทนของผู้ใช้ภายใน (มติ U59) ใช้สิทธิ์เท่าผู้จัดการบริษัท — ยามตรวจสิทธิ์ผู้ดูจริงเองข้างล่าง
    const sessionUser = await getRawSessionUser()
    const capabilities = readPortalViewAsParam(request) === null ? sessionUser?.capabilities : PORTAL_VIEW_AS_CAPABILITIES
    const section = capabilities === undefined ? 'handover' : portalAssetPhotoSection(capabilities)
    const portal = await requirePortalAccess(section, { download: true, request })

    const { id, index } = await context.params
    const target = { type: 'assets', id }
    const asset = await requirePortalRow(portal, await findPortalAssetPhotoRow(portal, id), target, {
      request,
      download: true,
    })
    if (!portalAssetPhotoViewable(asset, portal.section)) {
      return await denyPortalRow(portal, target, 'asset_not_viewable', { request, download: true })
    }

    const position = /^\d{1,3}$/.test(index) ? Number.parseInt(index, 10) : -1
    const meta = portalAssetPhotoMeta(asset, position)
    const path = meta === null ? undefined : asset.photos[meta.index]
    if (meta === null || path === undefined) throw new WarehouseError('ASSET_NOT_FOUND', { detail: `photo ${index}` })

    const bytes = await downloadUploadedFile(path)
    if (bytes === null) throw new UploadError('UPLOAD_FILE_NOT_FOUND', { detail: `asset ${asset.id} photo ${meta.index}` })

    return new Response(new Blob([new Uint8Array(bytes)]), {
      status: 200,
      headers: {
        'Content-Type': portalPhotoContentType(path, asset.mimeTypes),
        'Content-Length': String(bytes.byteLength),
        'Content-Disposition': 'inline',
        'Cache-Control': 'private, max-age=300',
        'X-Content-Type-Options': 'nosniff',
      },
    })
  } catch (error) {
    return toModuleErrorResponse(error)
  }
}
